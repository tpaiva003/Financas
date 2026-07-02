"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/session";
import { getSpaceContext, SPACE_COOKIE } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { isAdmin, userByEmail } from "@/lib/users";
import { isEmailAllowed } from "@/lib/env";
import { uploadReceipt } from "@/lib/services/receipts-service";
import { getSpaceBalance } from "@/lib/services/balance-service";
import { toCents, validateSplit, nextOccurrence, type Split } from "@/lib/domain";

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

/** Normaliza valores monetários europeus ("1.234,56" / "12,34") para número. */
function normalizeAmount(v: unknown): unknown {
  if (typeof v !== "string") return v;
  let s = v.trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", "."); // ponto = milhares, vírgula = decimal
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  return s;
}

const amountField = z.preprocess(
  normalizeAmount,
  z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, "Valor inválido"),
);

const expenseSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória").max(200),
  amount: amountField,
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  categoryId: z.string().optional().nullable(),
  payerId: z.string().min(1),
  kind: z.enum(["shared", "personal"]),
  splitType: z.enum(["EQUAL", "PERCENT", "SOLE"]).default("EQUAL"),
  percentA: z.coerce.number().min(0).max(100).optional(),
  soleMemberId: z.string().optional(),
  visibleToPartner: z.coerce.boolean().optional(),
});

interface SplitChoice {
  kind: "shared" | "personal";
  splitType: "EQUAL" | "PERCENT" | "SOLE";
  percentA?: number;
  soleMemberId?: string;
}

/** Constrói a divisão a partir dos dados do formulário. */
function buildSplit(
  data: SplitChoice,
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
  // O saldo/divisão é sempre entre os participantes plenos.
  const memberIds = ctx.fullMembers.map((m) => m.id);
  const isSubmitter = ctx.viewerRole === "submitter";

  const parsed = expenseSchema.safeParse({
    description: formData.get("description"),
    amount: formData.get("amount"),
    transactionDate: formData.get("transactionDate"),
    categoryId: formData.get("categoryId") || null,
    payerId: formData.get("payerId"),
    // Um submitter só cria despesas partilhadas (não tem despesas pessoais).
    kind: isSubmitter ? "shared" : formData.get("kind"),
    splitType: formData.get("splitType") || "EQUAL",
    percentA: formData.get("percentA") ?? undefined,
    soleMemberId: formData.get("soleMemberId") ?? undefined,
    visibleToPartner: formData.get("visibleToPartner") === "on",
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;
  if (!memberIds.includes(data.payerId)) return { error: "Pagador inválido." };

  // Submitter: precisa de um aprovador (membro pleno) e a despesa fica pendente.
  let approverId: string | null = null;
  if (isSubmitter) {
    approverId = String(formData.get("approverId") ?? "");
    if (!memberIds.includes(approverId)) return { error: "Escolhe quem aprova a despesa." };
  }

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
    approvalStatus: isSubmitter ? "pending" : null,
    approverId,
    submittedBy: isSubmitter ? ctx.viewerMemberId : null,
  });
  await handleReceipt(created.id, ctx.space.id, formData);

  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  redirect("/despesas");
}

const settlementSchema = z.object({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  amount: z.preprocess(normalizeAmount, z.coerce.number().positive("Valor tem de ser positivo")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function createSettlementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

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
  if (ctx.viewerRole === "submitter") return;
  const { transfers } = await getSpaceBalance(ctx.space.id, ctx.fullMembers, ctx.viewerMemberId);
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
  if (ctx.viewerRole === "submitter") return;
  await getRepository().settleOpenExpenses(ctx.space.id);
  revalidatePeriod();
  redirect("/acertos");
}

/** Reabre o último fecho: volta a mostrar as despesas liquidadas. */
export async function reopenPeriodAction(): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  await getRepository().reopenExpenses(ctx.space.id);
  revalidatePeriod();
  redirect("/acertos");
}

// ---- Aprovação de despesas submetidas -------------------------------------

export async function approveExpenseAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return; // só membros plenos aprovam
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().setExpenseApproval(id, "approved");
  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  revalidatePath("/saldo");
  revalidatePath("/aprovacoes");
}

export async function rejectExpenseAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().setExpenseApproval(id, "rejected");
  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  revalidatePath("/saldo");
  revalidatePath("/aprovacoes");
}

// ---- Acesso de submissão (role submitter) ---------------------------------

export async function grantSubmitterAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const memberId = String(formData.get("memberId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const member = ctx.members.find((m) => m.id === memberId);
  if (!member) return { error: "Participante inválido." };
  if (member.linkedUserId) return { error: "Este participante já tem acesso." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Email inválido." };
  if (isEmailAllowed(email) || userByEmail(email)) {
    return { error: "Esse email já pertence a um utilizador base." };
  }

  const repo = getRepository();
  if (await repo.getAppUserByEmail(email)) return { error: "Esse email já tem acesso." };

  const userId = `usr_${randomUUID()}`;
  await repo.createAppUser({ id: userId, email, name: member.name });
  await repo.updateMember(memberId, ctx.space.id, {
    role: "submitter",
    linkedUserId: userId,
    email,
  });
  revalidatePath("/ambiente");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function revokeSubmitterAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const memberId = String(formData.get("memberId") ?? "");
  const member = ctx.members.find((m) => m.id === memberId);
  // Só revoga submitters (nunca utilizadores base).
  if (!member || member.role !== "submitter" || !member.linkedUserId) return;

  await getRepository().deleteAppUser(member.linkedUserId);
  await getRepository().updateMember(memberId, ctx.space.id, {
    role: "full",
    linkedUserId: null,
  });
  revalidatePath("/ambiente");
  revalidatePath("/", "layout");
}

/**
 * Acerta o ambiente atual transferindo o saldo para outro ambiente: zera o
 * saldo aqui (com um acerto interno) e recria a dívida no ambiente destino,
 * entre os mesmos participantes (identificados pelo utilizador associado).
 * Só para ambientes de 2 pessoas com participantes com conta em ambos.
 */
export async function transferBalanceToSpaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const targetId = String(formData.get("targetSpaceId") ?? "");
  if (!targetId || targetId === ctx.space.id) return { error: "Escolhe o ambiente destino." };
  if (!ctx.spaces.some((s) => s.id === targetId)) return { error: "Ambiente destino inválido." };
  if (ctx.fullMembers.length !== 2) {
    return { error: "A transferência entre ambientes só está disponível para ambientes de 2 pessoas." };
  }

  const repo = getRepository();
  const { transfers } = await getSpaceBalance(ctx.space.id, ctx.fullMembers, ctx.viewerMemberId);
  const t = transfers[0];
  if (!t || t.amountCents <= 0) return { error: "Não há saldo para transferir." };

  const debtorX = ctx.fullMembers.find((m) => m.id === t.fromUserId);
  const creditorX = ctx.fullMembers.find((m) => m.id === t.toUserId);
  if (!debtorX?.linkedUserId || !creditorX?.linkedUserId) {
    return { error: "Os participantes têm de ter conta associada para transferir entre ambientes." };
  }

  const targetSpace = ctx.spaces.find((s) => s.id === targetId)!;
  const targetMembers = await repo.listMembers(targetId);
  const debtorY = targetMembers.find((m) => m.linkedUserId === debtorX.linkedUserId);
  const creditorY = targetMembers.find((m) => m.linkedUserId === creditorX.linkedUserId);
  if (!debtorY || !creditorY) {
    return { error: `O ambiente "${targetSpace.name}" não tem os mesmos participantes.` };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Recria a dívida no destino: despesa paga por quem é credor, 100% do devedor.
  const split: Split = { type: "PERCENT", weights: { [debtorY.id]: 100, [creditorY.id]: 0 } };
  await repo.createExpense({
    spaceId: targetId,
    description: `Saldo transferido de ${ctx.space.name}`,
    amountCents: t.amountCents,
    currency: "EUR",
    transactionDate: today,
    categoryId: null,
    payerId: creditorY.id,
    kind: "shared",
    split,
    origin: "manual",
    status: "confirmed",
    ownerId: creditorY.id,
    visibleToPartner: false,
    createdBy: ctx.user.id,
  });

  // Zera o ambiente atual com um acerto interno e colapsa as despesas.
  await repo.createSettlement({
    spaceId: ctx.space.id,
    fromUserId: debtorX.id,
    toUserId: creditorX.id,
    amountCents: t.amountCents,
    currency: "EUR",
    date: today,
    note: `Saldo transferido para ${targetSpace.name}`,
    createdBy: ctx.user.id,
  });
  await repo.settleOpenExpenses(ctx.space.id);

  revalidatePeriod();
  revalidatePath("/", "layout");
  redirect("/acertos");
}

export async function updateExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const memberIds = ctx.fullMembers.map((m) => m.id);
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
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().softDeleteExpense(id, ctx.user.id);
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
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const user = ctx.user;
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
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
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
  if (ctx.viewerRole === "submitter") return;
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
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().deleteCategory(id, ctx.space.id);
  revalidatePath("/ambiente");
  revalidatePath("/despesas");
}

// ---- Despesas recorrentes (REQ-REC) ---------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const recurringSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória.").max(200),
  valueType: z.enum(["fixed", "variable"]).default("fixed"),
  frequency: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
  nextDate: z.string().regex(DATE_RE, "Data inválida."),
  endDate: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  payerId: z.string().min(1),
  splitType: z.enum(["EQUAL", "PERCENT", "SOLE"]).default("EQUAL"),
  percentA: z.coerce.number().min(0).max(100).optional(),
  soleMemberId: z.string().optional(),
});

function parseAmountCents(raw: unknown): number | null {
  const s = String(normalizeAmount(String(raw ?? "")) ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return NaN as unknown as number; // sinaliza inválido
  return toCents(n);
}

export async function createRecurringAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const memberIds = ctx.fullMembers.map((m) => m.id);

  const parsed = recurringSchema.safeParse({
    description: formData.get("description"),
    valueType: formData.get("valueType") || "fixed",
    frequency: formData.get("frequency") || "monthly",
    nextDate: formData.get("nextDate"),
    endDate: formData.get("endDate") || undefined,
    categoryId: formData.get("categoryId") || null,
    payerId: formData.get("payerId"),
    splitType: formData.get("splitType") || "EQUAL",
    percentA: formData.get("percentA") ?? undefined,
    soleMemberId: formData.get("soleMemberId") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  if (!memberIds.includes(d.payerId)) return { error: "Pagador inválido." };

  const amountCents = parseAmountCents(formData.get("amount"));
  if (Number.isNaN(amountCents)) return { error: "Valor inválido." };
  if (d.valueType === "fixed" && amountCents === null) {
    return { error: "Indica o valor (recorrente de valor fixo)." };
  }

  const endDate = d.endDate && DATE_RE.test(d.endDate) ? d.endDate : null;
  if (endDate && endDate < d.nextDate) return { error: "A data de fim é anterior à próxima data." };

  const built = buildSplit(
    { kind: "shared", splitType: d.splitType, percentA: d.percentA, soleMemberId: d.soleMemberId },
    memberIds,
    amountCents ?? 0,
  );
  if ("error" in built) return { error: built.error };

  await getRepository().createRecurring({
    spaceId: ctx.space.id,
    description: d.description,
    categoryId: d.categoryId ?? null,
    payerId: d.payerId,
    kind: "shared",
    split: built.split,
    amountCents,
    valueType: d.valueType,
    frequency: d.frequency,
    nextDate: d.nextDate,
    endDate,
    createdBy: ctx.user.id,
  });
  revalidatePath("/recorrentes");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Edita um template recorrente. O campo `applyScope` decide o alcance:
 *  - "future": só afeta despesas futuras (o template).
 *  - "all": aplica também às despesas já geradas por este template. O valor
 *    nunca reescreve valores reais confirmados de recorrentes variáveis (só
 *    atualiza estimativas pendentes); num template fixo aplica-se a todas.
 */
export async function updateRecurringAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const memberIds = ctx.fullMembers.map((m) => m.id);

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Recorrente inválida." };
  const repo = getRepository();
  const existing = await repo.getRecurring(id, ctx.space.id);
  if (!existing) return { error: "Recorrente não encontrada." };

  const parsed = recurringSchema.safeParse({
    description: formData.get("description"),
    valueType: formData.get("valueType") || "fixed",
    frequency: formData.get("frequency") || "monthly",
    nextDate: formData.get("nextDate"),
    endDate: formData.get("endDate") || undefined,
    categoryId: formData.get("categoryId") || null,
    payerId: formData.get("payerId"),
    splitType: formData.get("splitType") || "EQUAL",
    percentA: formData.get("percentA") ?? undefined,
    soleMemberId: formData.get("soleMemberId") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  if (!memberIds.includes(d.payerId)) return { error: "Pagador inválido." };

  const amountCents = parseAmountCents(formData.get("amount"));
  if (Number.isNaN(amountCents)) return { error: "Valor inválido." };
  if (d.valueType === "fixed" && amountCents === null) {
    return { error: "Indica o valor (recorrente de valor fixo)." };
  }

  const endDate = d.endDate && DATE_RE.test(d.endDate) ? d.endDate : null;
  if (endDate && endDate < d.nextDate) return { error: "A data de fim é anterior à próxima data." };

  const built = buildSplit(
    { kind: "shared", splitType: d.splitType, percentA: d.percentA, soleMemberId: d.soleMemberId },
    memberIds,
    amountCents ?? 0,
  );
  if ("error" in built) return { error: built.error };

  await repo.updateRecurring(id, ctx.space.id, {
    description: d.description,
    categoryId: d.categoryId ?? null,
    payerId: d.payerId,
    split: built.split,
    amountCents,
    valueType: d.valueType,
    frequency: d.frequency,
    nextDate: d.nextDate,
    endDate,
  });

  // Aplicar também às despesas já registadas por este template?
  const applyScope = String(formData.get("applyScope") ?? "future");
  if (applyScope === "all") {
    await repo.updateExpensesForRecurring(
      id,
      {
        description: d.description,
        categoryId: d.categoryId ?? null,
        payerId: d.payerId,
        split: built.split,
      },
      amountCents !== null
        ? { cents: amountCents, onlyPending: d.valueType === "variable" }
        : undefined,
    );
  }

  revalidatePath("/recorrentes");
  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  revalidatePath("/saldo");
  return { ok: true };
}

/** Pausar, retomar, saltar uma ocorrência, terminar ou eliminar (REQ-REC-4). */
export async function recurringOpAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  const op = String(formData.get("op") ?? "");
  if (!id) return;
  const repo = getRepository();

  if (op === "delete") {
    await repo.deleteRecurring(id, ctx.space.id);
  } else if (op === "pause") {
    await repo.updateRecurring(id, ctx.space.id, { status: "paused" });
  } else if (op === "resume") {
    await repo.updateRecurring(id, ctx.space.id, { status: "active" });
  } else if (op === "skip") {
    const tpl = await repo.getRecurring(id, ctx.space.id);
    if (tpl) {
      await repo.updateRecurring(id, ctx.space.id, {
        nextDate: nextOccurrence(tpl.nextDate, tpl.frequency),
      });
    }
  } else if (op === "end") {
    const today = new Date().toISOString().slice(0, 10);
    await repo.updateRecurring(id, ctx.space.id, { endDate: today, status: "paused" });
  }
  revalidatePath("/recorrentes");
  revalidatePath("/dashboard");
}

/** Confirma o valor real de uma despesa recorrente variável pendente (REQ-REC-2). */
export async function confirmRecurringExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Despesa inválida." };
  const amountCents = parseAmountCents(formData.get("amount"));
  if (amountCents === null || Number.isNaN(amountCents)) {
    return { error: "Indica o valor real." };
  }
  await getRepository().confirmExpense(id, amountCents);
  revalidatePath("/recorrentes");
  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  revalidatePath("/saldo");
  return { ok: true };
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
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const grantSubmit = formData.get("grantSubmit") === "on";
  const accessEmail = String(formData.get("accessEmail") ?? "").trim().toLowerCase();

  const parsed = memberSchema.safeParse({
    spaceId: formData.get("spaceId"),
    name: formData.get("name"),
    email: formData.get("email") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const repo = getRepository();

  // Validação do acesso de submissão (quando pedido na mesma ação).
  if (grantSubmit) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(accessEmail)) {
      return { error: "Indica um email válido para o acesso." };
    }
    if (isEmailAllowed(accessEmail) || userByEmail(accessEmail)) {
      return { error: "Esse email já pertence a um utilizador base." };
    }
    if (await repo.getAppUserByEmail(accessEmail)) {
      return { error: "Esse email já tem acesso." };
    }
  }

  const member = await repo.addMember({
    spaceId: parsed.data.spaceId,
    name: parsed.data.name,
    email: grantSubmit ? accessEmail : parsed.data.email || null,
  });

  // Dá logo acesso de submissão (role submitter + utilizador com login).
  if (grantSubmit) {
    const userId = `usr_${randomUUID()}`;
    await repo.createAppUser({ id: userId, email: accessEmail, name: parsed.data.name });
    await repo.updateMember(member.id, parsed.data.spaceId, {
      role: "submitter",
      linkedUserId: userId,
      email: accessEmail,
    });
  }

  revalidatePath("/ambiente");
  revalidatePath("/", "layout");
  return { ok: true };
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
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
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
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
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
