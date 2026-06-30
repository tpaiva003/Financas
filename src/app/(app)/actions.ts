"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getSpaceContext, SPACE_COOKIE } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { isAdmin } from "@/lib/users";
import { uploadReceipt } from "@/lib/services/receipts-service";
import { getSpaceBalance } from "@/lib/services/balance-service";
import { toCents, validateSplit, type Split } from "@/lib/domain";

export interface ActionState {
  error?: string;
  ok?: boolean;
}

async function handleReceipt(expenseId: string, spaceId: string, formData: FormData) {
  try {
    const path = await uploadReceipt(expenseId, spaceId, formData.get("receipt"));
    if (path) await getRepository().setReceiptPath(expenseId, path);
  } catch {
    // upload de recibo falhou: não bloqueia a gravação da despesa
  }
}

const expenseSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória").max(200),
  amount: z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, "Valor inválido"),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  categoryId: z.string().optional().nullable(),
  payerId: z.string().min(1),
  kind: z.enum(["shared", "personal"]),
  splitType: z.enum(["EQUAL", "PERCENT", "SOLE"]).default("EQUAL"),
  percentA: z.coerce.number().min(0).max(100).optional(),
  soleMemberId: z.string().optional(),
  visibleToPartner: z.coerce.boolean().optional(),
});

/** Constrói a divisão a partir dos dados do formulário. */
function buildSplit(
  data: z.infer<typeof expenseSchema>,
  memberIds: string[],
  amountCents: number,
): { split: Split } | { error: string } {
  if (data.kind !== "shared") return { split: { type: "EQUAL" } };

  if (data.splitType === "SOLE") {
    const sole = data.soleMemberId ?? "";
    if (!memberIds.includes(sole)) return { error: "Escolhe de quem é a despesa." };
    const weights: Record<string, number> = {};
    for (const id of memberIds) weights[id] = id === sole ? 100 : 0;
    return { split: { type: "PERCENT", weights } };
  }

  if (data.splitType === "PERCENT" && memberIds.length === 2) {
    const pa = data.percentA ?? 50;
    const split: Split = { type: "PERCENT", weights: { [memberIds[0]!]: pa, [memberIds[1]!]: 100 - pa } };
    const v = validateSplit(split, memberIds, amountCents);
    if (!v.ok) return { error: v.error ?? "Divisão inválida." };
    return { split };
  }

  return { split: { type: "EQUAL" } };
}

export async function createExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  const memberIds = ctx.members.map((m) => m.id);

  const parsed = expenseSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    transactionDate: formData.get("transactionDate"),
    categoryId: formData.get("categoryId") || null,
    payerId: formData.get("payerId"),
    kind: formData.get("kind"),
    splitType: formData.get("splitType") || "EQUAL",
    percentA: formData.get("percentA") ?? undefined,
    soleMemberId: formData.get("soleMemberId") ?? undefined,
    visibleToPartner: formData.get("visibleToPartner") === "on",
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;
  if (!memberIds.includes(data.payerId)) return { error: "Pagador inválido." };

  const amountCents = toCents(data.amount);

  const built = buildSplit(data, memberIds, amountCents);
  if ("error" in built) return { error: built.error };
  const split = built.split;

  const created = await getRepository().createExpense({
    spaceId: ctx.space.id,
    description: data.description,
    amountCents,
    currency: "EUR",
    transactionDate: data.transactionDate,
    categoryId: data.categoryId ?? null,
    payerId: data.payerId,
    kind: data.kind,
    split,
    origin: "manual",
    status: "confirmed",
    ownerId: data.kind === "personal" ? ctx.viewerMemberId : data.payerId,
    visibleToPartner: data.kind === "personal" ? Boolean(data.visibleToPartner) : false,
    createdBy: ctx.user.id,
  });
  await handleReceipt(created.id, ctx.space.id, formData);

  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  redirect("/despesas");
}

const settlementSchema = z.object({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  amount: z.coerce.number().positive("Valor tem de ser positivo"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function createSettlementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();

  const parsed = settlementSchema.safeParse({
    fromUserId: formData.get("fromUserId"),
    toUserId: formData.get("toUserId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    note: formData.get("note") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;
  if (data.fromUserId === data.toUserId) {
    return { error: "O pagador e o recetor têm de ser diferentes." };
  }

  await getRepository().createSettlement({
    spaceId: ctx.space.id,
    fromUserId: data.fromUserId,
    toUserId: data.toUserId,
    amountCents: toCents(data.amount),
    currency: "EUR",
    date: data.date,
    note: data.note ?? null,
    createdBy: ctx.user.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/acertos");
  redirect("/acertos");
}

// ---- Fecho de período (acerto) --------------------------------------------

function revalidatePeriod() {
  revalidatePath("/dashboard");
  revalidatePath("/acertos");
  revalidatePath("/despesas");
  revalidatePath("/saldo");
}

/** Regista o(s) pagamento(s) sugerido(s) e fecha o período (colapsa despesas). */
export async function settleAndPayAction(): Promise<void> {
  const ctx = await getSpaceContext();
  const { transfers } = await getSpaceBalance(ctx.space.id, ctx.members, ctx.viewerMemberId);
  const today = new Date().toISOString().slice(0, 10);

  for (const t of transfers) {
    if (t.amountCents <= 0) continue;
    await getRepository().createSettlement({
      spaceId: ctx.space.id,
      fromUserId: t.fromUserId,
      toUserId: t.toUserId,
      amountCents: t.amountCents,
      currency: "EUR",
      date: today,
      note: "Acerto do período",
      createdBy: ctx.user.id,
    });
  }
  await getRepository().settleOpenExpenses(ctx.space.id);
  revalidatePeriod();
  redirect("/acertos");
}

/** Transita o saldo para o período seguinte: fecha sem registar pagamento. */
export async function carryBalanceAction(): Promise<void> {
  const ctx = await getSpaceContext();
  await getRepository().settleOpenExpenses(ctx.space.id);
  revalidatePeriod();
  redirect("/acertos");
}

/** Reabre o último fecho: volta a mostrar as despesas liquidadas. */
export async function reopenPeriodAction(): Promise<void> {
  const ctx = await getSpaceContext();
  await getRepository().reopenExpenses(ctx.space.id);
  revalidatePeriod();
  redirect("/acertos");
}

export async function updateExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  const memberIds = ctx.members.map((m) => m.id);
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Despesa inválida." };

  const parsed = expenseSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    transactionDate: formData.get("transactionDate"),
    categoryId: formData.get("categoryId") || null,
    payerId: formData.get("payerId"),
    kind: formData.get("kind"),
    splitType: formData.get("splitType") || "EQUAL",
    percentA: formData.get("percentA") ?? undefined,
    soleMemberId: formData.get("soleMemberId") ?? undefined,
    visibleToPartner: formData.get("visibleToPartner") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;
  if (!memberIds.includes(data.payerId)) return { error: "Pagador inválido." };

  const amountCents = toCents(data.amount);
  const built = buildSplit(data, memberIds, amountCents);
  if ("error" in built) return { error: built.error };
  const split = built.split;

  await getRepository().updateExpense(id, {
    description: data.description,
    amountCents,
    transactionDate: data.transactionDate,
    categoryId: data.categoryId ?? null,
    payerId: data.payerId,
    kind: data.kind,
    split,
    ownerId: data.kind === "personal" ? ctx.viewerMemberId : data.payerId,
    visibleToPartner: data.kind === "personal" ? Boolean(data.visibleToPartner) : false,
  });
  await handleReceipt(id, ctx.space.id, formData);

  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  revalidatePath("/saldo");
  redirect("/despesas");
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().softDeleteExpense(id, user.id);
  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  revalidatePath("/saldo");
  redirect("/despesas");
}

export async function markMessageReadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.id)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().markContactMessageRead(id);
  revalidatePath("/mensagens");
  revalidatePath("/", "layout");
}

export async function archiveMessageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.id)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const archived = String(formData.get("archived") ?? "") === "true";
  await getRepository().setContactMessageArchived(id, archived);
  revalidatePath("/mensagens");
  revalidatePath("/", "layout");
}

export async function setMessageNotesAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdmin(user.id)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const raw = String(formData.get("notes") ?? "").trim().slice(0, 2000);
  await getRepository().setContactMessageNotes(id, raw || null);
  revalidatePath("/mensagens");
}

// ---- Ambientes (spaces) ---------------------------------------------------

export async function setCurrentSpaceAction(formData: FormData): Promise<void> {
  await requireUser();
  const spaceId = String(formData.get("spaceId") ?? "");
  if (spaceId) {
    cookies().set(SPACE_COOKIE, spaceId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

const spaceSchema = z.object({
  name: z.string().trim().min(1, "Dá um nome ao ambiente.").max(60),
  members: z.string().trim().max(400).optional(),
});

export async function createSpaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = spaceSchema.safeParse({
    name: formData.get("name"),
    members: formData.get("members") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  // Participantes extra (um por linha ou separados por vírgula), além do criador.
  const extras = (parsed.data.members ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((name) => ({ name }));

  const space = await getRepository().createSpace({
    name: parsed.data.name,
    createdBy: user.id,
    members: [{ name: user.name, linkedUserId: user.id, email: user.email }, ...extras],
  });

  cookies().set(SPACE_COOKIE, space.id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ---- Categorias por ambiente ----------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

const categorySchema = z.object({
  name: z.string().trim().min(1, "Dá um nome à categoria.").max(40),
  color: z.string().trim().regex(HEX, "Cor inválida.").optional().or(z.literal("")),
  icon: z.string().trim().max(4).optional().or(z.literal("")),
});

export async function createCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "",
    icon: formData.get("icon") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await getRepository().createCategory({
    spaceId: ctx.space.id,
    name: parsed.data.name,
    color: parsed.data.color || "#64748b",
    icon: parsed.data.icon || null,
  });
  revalidatePath("/ambiente");
  revalidatePath("/despesas");
  return {};
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "",
    icon: formData.get("icon") || "",
  });
  if (!parsed.success) return;
  await getRepository().updateCategory(id, ctx.space.id, {
    name: parsed.data.name,
    color: parsed.data.color || "#64748b",
    icon: parsed.data.icon || null,
  });
  revalidatePath("/ambiente");
  revalidatePath("/despesas");
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().deleteCategory(id, ctx.space.id);
  revalidatePath("/ambiente");
  revalidatePath("/despesas");
}

const memberSchema = z.object({
  spaceId: z.string().min(1),
  name: z.string().trim().min(1, "Indica um nome.").max(80),
  email: z.string().trim().email("Email inválido.").max(200).optional().or(z.literal("")),
});

export async function addMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const parsed = memberSchema.safeParse({
    spaceId: formData.get("spaceId"),
    name: formData.get("name"),
    email: formData.get("email") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await getRepository().addMember({
    spaceId: parsed.data.spaceId,
    name: parsed.data.name,
    email: parsed.data.email || null,
  });
  revalidatePath("/ambiente");
  revalidatePath("/", "layout");
  return {};
}

const memberEditSchema = z.object({
  name: z.string().trim().min(1, "Indica um nome.").max(80),
  email: z.string().trim().email("Email inválido.").max(200).optional().or(z.literal("")),
});

export async function updateMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Participante inválido." };
  const parsed = memberEditSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  await getRepository().updateMember(id, ctx.space.id, {
    name: parsed.data.name,
    email: parsed.data.email || null,
  });
  revalidatePath("/ambiente");
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  return { ok: true };
}

export async function deleteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Participante inválido." };

  const member = ctx.members.find((m) => m.id === id);
  if (!member) return { error: "Participante não encontrado." };
  if (ctx.members.length <= 1) return { error: "Tem de existir pelo menos um participante." };
  if (member.linkedUserId) {
    return { error: "Este participante tem acesso à app e não pode ser eliminado." };
  }

  const activity = await getRepository().countMemberActivity(id);
  if (activity > 0) {
    return {
      error: "Tem despesas ou acertos associados. Reatribui-os antes de eliminar.",
    };
  }

  await getRepository().deleteMember(id, ctx.space.id);
  revalidatePath("/ambiente");
  revalidatePath("/", "layout");
  return { ok: true };
}
