"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getSpaceContext, SPACE_COOKIE } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { isAdmin } from "@/lib/users";
import { toCents, validateSplit, type Split } from "@/lib/domain";

export interface ActionState {
  error?: string;
}

const expenseSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória").max(200),
  amount: z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, "Valor inválido"),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  categoryId: z.string().optional().nullable(),
  payerId: z.string().min(1),
  kind: z.enum(["shared", "personal"]),
  splitType: z.enum(["EQUAL", "PERCENT"]).default("EQUAL"),
  percentA: z.coerce.number().min(0).max(100).optional(),
  visibleToPartner: z.coerce.boolean().optional(),
});

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
    visibleToPartner: formData.get("visibleToPartner") === "on",
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;
  if (!memberIds.includes(data.payerId)) return { error: "Pagador inválido." };

  const amountCents = toCents(data.amount);

  let split: Split = { type: "EQUAL" };
  if (data.kind === "shared" && data.splitType === "PERCENT" && ctx.members.length === 2) {
    const pa = data.percentA ?? 50;
    split = {
      type: "PERCENT",
      weights: { [memberIds[0]!]: pa, [memberIds[1]!]: 100 - pa },
    };
    const v = validateSplit(split, memberIds, amountCents);
    if (!v.ok) return { error: v.error };
  }

  await getRepository().createExpense({
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
    visibleToPartner: formData.get("visibleToPartner") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;
  if (!memberIds.includes(data.payerId)) return { error: "Pagador inválido." };

  const amountCents = toCents(data.amount);
  let split: Split = { type: "EQUAL" };
  if (data.kind === "shared" && data.splitType === "PERCENT" && ctx.members.length === 2) {
    const pa = data.percentA ?? 50;
    split = { type: "PERCENT", weights: { [memberIds[0]!]: pa, [memberIds[1]!]: 100 - pa } };
    const v = validateSplit(split, memberIds, amountCents);
    if (!v.ok) return { error: v.error };
  }

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
