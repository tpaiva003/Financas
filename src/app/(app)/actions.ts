"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/session";
import { getSpaceContext, getTargetSpace, SPACE_COOKIE } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { isAdmin, userByEmail, householdUsers } from "@/lib/users";
import { isEmailAllowed } from "@/lib/env";
import { uploadReceipt } from "@/lib/services/receipts-service";
import { buildImportPreview, commitImport, ImportError } from "@/lib/services/import-service";
import { refreshAssetPrice, refreshStalePrices } from "@/lib/services/quotes-service";
import type {
  ImportCommitPayload,
  ImportPreview,
  ImportUnknownSample,
  ManualMapping,
} from "@/lib/import/types";
import { getSpaceBalance } from "@/lib/services/balance-service";
import { sendInvite, emailConfigured } from "@/lib/email/send";
import {
  toCents,
  validateSplit,
  nextOccurrence,
  accountsVisibleTo,
  isForeign,
  normalizeSymbol,
  toEurCents,
  type Split,
  checkLimit,
  type SpacePlan,
} from "@/lib/domain";

export interface ActionState {
  error?: string;
  ok?: boolean;
  /** Mensagem de sucesso opcional (ex.: "12 despesas importadas"). */
  message?: string;
}

async function handleReceipt(expenseId: string, spaceId: string, formData: FormData) {
  try {
    const path = await uploadReceipt(expenseId, spaceId, formData.get("receipt"));
    if (path) await getRepository().setReceiptPath(expenseId, spaceId, path);
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

/**
 * O ambiente ainda tem espaço para mais um?
 *
 * Existe porque o registo é aberto: sem tectos, a app passava a ser alojamento
 * gratuito de dados financeiros de desconhecidos, com o custo e as obrigações de
 * RGPD que isso traz. Os ambientes de quem foi convidado à mão são `full` e nunca
 * passam por aqui.
 *
 * Devolve a mensagem a mostrar quando não cabe, e `null` quando cabe. **Nunca
 * apaga nada**: um tecto impede de criar mais, não faz desaparecer o que já lá
 * está.
 */
async function semEspaco(
  spaceId: string,
  plan: SpacePlan | undefined,
  kind: "expenses" | "assets" | "members",
): Promise<string | null> {
  if ((plan ?? "free") === "full") return null;
  const atuais = await getRepository()
    .countInSpace(spaceId, kind)
    .catch(() => 0);
  const check = checkLimit(kind, atuais, "free");
  return check.allowed ? null : check.message;
}

export async function createExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  const cheio = await semEspaco(ctx.space.id, ctx.space.plan, "expenses");
  if (cheio) return { error: cheio };
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
  await getRepository().setExpenseApproval(id, ctx.space.id, "approved");
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
  await getRepository().setExpenseApproval(id, ctx.space.id, "rejected");
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

  await getRepository().updateExpense(id, ctx.space.id, {
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
  await getRepository().softDeleteExpense(id, ctx.space.id, ctx.user.id);
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
  // O tecto dos ambientes conta-se na pessoa, não dentro de um deles: é ela que
  // os cria. Basta um ser `full` para não haver tecto — quem foi convidado para
  // um ambiente sem limites não fica preso ao seu.
  const semTecto = ctx.spaces.some((s) => (s.plan ?? "free") === "full");
  const limiteAmbientes = checkLimit("spaces", ctx.spaces.length, semTecto ? "full" : "free");
  if (!limiteAmbientes.allowed) return { error: limiteAmbientes.message ?? "Limite atingido." };
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

// ---- Metas de despesa ------------------------------------------------------

/**
 * Define ou apaga a meta mensal de uma categoria (ou do ambiente inteiro,
 * quando não vem categoria). Valor vazio apaga a meta.
 */
export async function saveSpendingGoalAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;

  const raw = String(formData.get("amount") ?? "").trim();
  // "__total__" é a meta do ambiente: na base de dados fica com categoria nula.
  const categoryValue = String(formData.get("categoryId") ?? "").trim();
  const categoryId = categoryValue && categoryValue !== "__total__" ? categoryValue : null;

  const repo = getRepository();
  if (!raw) {
    await repo.deleteSpendingGoal(ctx.space.id, categoryId).catch(() => {});
    revalidatePath("/relatorios");
    return;
  }

  const cents = parseAmountCents(raw);
  if (cents === null || Number.isNaN(cents)) return;
  await repo
    .upsertSpendingGoal({
      spaceId: ctx.space.id,
      categoryId,
      amountCents: cents,
      createdBy: ctx.user.id,
    })
    .catch(() => {
      // Tabela por criar: os relatórios continuam a funcionar sem metas.
    });
  revalidatePath("/relatorios");
}

// ---- Importação de extratos (REQ-IMP) -------------------------------------

export interface ImportPreviewState {
  error?: string;
  preview?: ImportPreview;
  /**
   * Primeiras linhas de um ficheiro que não foi reconhecido, para o utilizador
   * indicar as colunas à mão (e a app aprender o banco).
   */
  sample?: ImportUnknownSample | null;
}

/**
 * Colunas indicadas à mão na UI. Só são usadas se vier a linha de cabeçalho e,
 * pelo menos, data + descrição + (valor OU débito/crédito).
 */
function readManualMapping(formData: FormData): ManualMapping | null {
  if (String(formData.get("manual") ?? "") !== "1") return null;
  const num = (name: string, fallback = -1) => {
    const raw = String(formData.get(name) ?? "").trim();
    if (raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const mapping: ManualMapping = {
    headerRow: Math.max(0, num("headerRow", 0)),
    dateCol: num("dateCol"),
    descriptionCol: num("descriptionCol"),
    amountCol: num("amountCol"),
    debitCol: num("debitCol"),
    creditCol: num("creditCol"),
    invertSign: String(formData.get("invertSign") ?? "") === "on",
  };
  if (mapping.dateCol < 0 || mapping.descriptionCol < 0) return null;
  if (mapping.amountCol < 0 && mapping.debitCol < 0 && mapping.creditCol < 0) return null;
  return mapping;
}

/** Ambientes do utilizador onde ele pode criar despesas (exclui submitters). */
async function resolveWritableSpaces(ctx: Awaited<ReturnType<typeof getSpaceContext>>) {
  const resolved = await Promise.all(ctx.spaces.map((s) => getTargetSpace(ctx, s.id)));
  return resolved.flatMap((t) => (t && t.viewerRole !== "submitter" ? [t] : []));
}

export async function previewImportAction(
  _prev: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { error: "Escolhe pelo menos um ficheiro." };
  const source = String(formData.get("source") || "outro");
  const account = String(formData.get("account") || "").trim() || null;

  // Cada linha pode ir para um ambiente diferente: resolvemos todos aqueles
  // onde o utilizador pode mesmo escrever.
  const targets = await resolveWritableSpaces(ctx);
  if (targets.length === 0) return { error: "Não tens ambientes onde importar." };
  const requested = String(formData.get("spaceId") || ctx.space.id);
  const defaultSpaceId = targets.some((t) => t.space.id === requested)
    ? requested
    : targets[0]!.space.id;

  try {
    const preview = await buildImportPreview({
      files,
      source,
      account,
      targets,
      defaultSpaceId,
      manualMapping: readManualMapping(formData),
    });
    return { preview };
  } catch (e) {
    // Ficheiro por reconhecer: devolvemos a amostra para o utilizador mapear.
    if (e instanceof ImportError) return { error: e.message, sample: e.sample ?? null };
    return { error: "Não consegui processar o ficheiro." };
  }
}

/**
 * Reportar um banco que ainda não sabemos ler. Cai na caixa de mensagens, com o
 * que o utilizador escolheu partilhar sobre a estrutura do ficheiro.
 */
export async function reportMissingBankAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  const bank = String(formData.get("bank") ?? "").trim();
  if (!bank) return { error: "Diz-nos qual é o banco." };

  const note = String(formData.get("note") ?? "").trim();
  // Só as colunas, e só as que o utilizador viu no ecrã antes de enviar.
  const structure = String(formData.get("structure") ?? "").trim().slice(0, 2000);
  const fileType = String(formData.get("fileType") ?? "").trim().slice(0, 40);

  const message = [
    `Banco em falta: ${bank}`,
    fileType ? `Tipo de ficheiro: ${fileType}` : null,
    note ? `Nota: ${note}` : null,
    structure ? `Colunas do ficheiro:\n${structure}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    await getRepository().createContactMessage({
      name: ctx.user.name ?? null,
      email: ctx.user.email,
      message,
    });
  } catch {
    return { error: "Não consegui enviar o pedido. Tenta outra vez." };
  }
  return { ok: true, message: "Pedido enviado. Vamos ver esse banco." };
}

// ---- Lembretes de importação ----------------------------------------------

/** Define (ou atualiza) a periodicidade de importação de um banco. */
export async function saveImportReminderAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  const target = await getTargetSpace(ctx, String(formData.get("spaceId") || ctx.space.id));
  if (!target || target.viewerRole === "submitter") return;

  const source = String(formData.get("source") ?? "").trim();
  if (!source) return;
  const raw = String(formData.get("frequency") ?? "monthly");
  const frequency = (["weekly", "monthly", "quarterly"] as const).includes(
    raw as "weekly" | "monthly" | "quarterly",
  )
    ? (raw as "weekly" | "monthly" | "quarterly")
    : "monthly";

  await getRepository()
    .upsertImportReminder({
      spaceId: target.space.id,
      source,
      label: String(formData.get("label") ?? "").trim() || null,
      frequency,
      active: true,
      createdBy: ctx.user.id,
    })
    .catch(() => {
      // Tabela por criar: o resto da app continua a funcionar.
    });
  revalidatePath("/importar");
  revalidatePath("/dashboard");
}

export async function deleteImportReminderAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  const target = await getTargetSpace(ctx, String(formData.get("spaceId") || ctx.space.id));
  if (!target || target.viewerRole === "submitter") return;
  const source = String(formData.get("source") ?? "").trim();
  if (!source) return;
  await getRepository().deleteImportReminder(target.space.id, source).catch(() => {});
  revalidatePath("/importar");
  revalidatePath("/dashboard");
}

export async function commitImportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  let payload: ImportCommitPayload;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "")) as ImportCommitPayload;
  } catch {
    return { error: "Dados de importação inválidos." };
  }

  // As linhas podem ir para vários ambientes; só passam os que o utilizador tem.
  const targets = await resolveWritableSpaces(ctx);
  if (targets.length === 0) return { error: "Não tens ambientes onde importar." };
  const requested = payload.defaultSpaceId || ctx.space.id;
  const defaultSpaceId = targets.some((t) => t.space.id === requested)
    ? requested
    : targets[0]!.space.id;

  try {
    const { imported, perSpace } = await commitImport({
      payload,
      targets,
      defaultSpaceId,
      userId: ctx.user.id,
    });
    revalidatePath("/importar");
    revalidatePath("/despesas");
    revalidatePath("/dashboard");
    revalidatePath("/saldo");
    const detalhe = perSpace.map((s) => `${s.count} em ${s.spaceName}`).join(" · ");
    return { ok: true, message: `${imported} despesa(s) importada(s): ${detalhe}.` };
  } catch (e) {
    if (e instanceof ImportError) return { error: e.message };
    return { error: "Não consegui importar as despesas." };
  }
}

/** Anula um lote de importação: as despesas que criou são eliminadas. */
export async function undoImportBatchAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // O lote pode pertencer a outro ambiente do utilizador.
  const target = await getTargetSpace(ctx, String(formData.get("spaceId") || ctx.space.id));
  if (!target || target.viewerRole === "submitter") return;

  await getRepository().undoImportBatch(id, target.space.id, ctx.user.id);
  revalidatePath("/importar");
  revalidatePath("/despesas");
  revalidatePath("/dashboard");
  revalidatePath("/saldo");
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
  await getRepository().confirmExpense(id, ctx.space.id, amountCents);
  revalidatePath("/recorrentes");
  revalidatePath("/dashboard");
  revalidatePath("/despesas");
  revalidatePath("/saldo");
  return { ok: true };
}

/**
 * O `spaceId` NÃO vem daqui.
 *
 * Vinha do formulário, e as verificações de papel e de tecto eram feitas contra
 * o ambiente atual enquanto a escrita ia para o ambiente que viesse no pedido —
 * ou seja, dava para enfiar um participante (e um login) no ambiente de outra
 * pessoa. Passa a ser sempre o `ctx.space.id`, que já foi validado contra os
 * ambientes de quem está a pedir.
 */
const memberSchema = z.object({
  name: z.string().trim().min(1, "Indica um nome.").max(80),
  email: z.string().trim().email("Email inválido.").max(200).optional().or(z.literal("")),
});

export async function addMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const cheio = await semEspaco(ctx.space.id, ctx.space.plan, "members");
  if (cheio) return { error: cheio };

  const grantSubmit = formData.get("grantSubmit") === "on";
  const accessEmail = String(formData.get("accessEmail") ?? "").trim().toLowerCase();

  const parsed = memberSchema.safeParse({
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

  /**
   * O que fazer ao histórico, decidido por quem acrescenta.
   *
   * `null` = divide tudo, incluindo o que já lá está. Uma data = só dessa data
   * em diante. Por omissão fica a data de hoje, que é a resposta que não mexe
   * em saldo nenhum já apresentado — a escolha segura quando alguém carrega no
   * botão sem ler.
   */
  const hoje = new Date().toISOString().slice(0, 10);
  const participa = String(formData.get("participa") ?? "agora");
  let participatesFrom: string | null = hoje;
  if (participa === "tudo") {
    participatesFrom = null;
  } else if (participa === "desde") {
    const escolhida = String(formData.get("participaDesde") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(escolhida)) {
      return { error: "Indica a data a partir da qual esta pessoa divide despesas." };
    }
    participatesFrom = escolhida;
  }

  const member = await repo.addMember({
    spaceId: ctx.space.id,
    name: parsed.data.name,
    email: grantSubmit ? accessEmail : parsed.data.email || null,
    participatesFrom,
  });

  // Dá logo acesso de submissão (role submitter + utilizador com login).
  if (grantSubmit) {
    const userId = `usr_${randomUUID()}`;
    await repo.createAppUser({ id: userId, email: accessEmail, name: parsed.data.name });
    await repo.updateMember(member.id, ctx.space.id, {
      role: "submitter",
      linkedUserId: userId,
      email: accessEmail,
    });
  }

  revalidatePath("/ambiente");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Muda o nome do ambiente atual. */
export async function renameSpaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Indica um nome." };
  if (name.length > 80) return { error: "Nome demasiado longo." };

  await getRepository().renameSpace(ctx.space.id, name);
  revalidatePath("/", "layout");
  revalidatePath("/ambiente");
  return { ok: true };
}

/**
 * Convida alguém para experimentar a app com conta INDEPENDENTE: não fica
 * ligado a nenhum ambiente do anfitrião, por isso os dados dele não aparecem
 * aqui (e os daqui não aparecem lá). Ao entrar pela primeira vez, recebe um
 * ambiente "Pessoal" só dele e define a palavra-chave.
 */
export async function inviteUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!isAdmin(user.id)) return { error: "Sem permissão." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!name) return { error: "Indica o nome." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Email inválido." };
  if (isEmailAllowed(email) || userByEmail(email)) {
    return { error: "Esse email já pertence a um utilizador base." };
  }

  const repo = getRepository();
  if (await repo.getAppUserByEmail(email)) return { error: "Esse email já tem acesso." };

  const userId = `usr_${randomUUID()}`;
  await repo.createAppUser({ id: userId, email, name });

  // O ambiente é criado já com a pessoa lá dentro, e SÓ com ela. O dono da
  // plataforma nunca entra como participante no ambiente de um cliente: gere a
  // plataforma, não participa nas contas de quem a usa (ver domain/tenancy.ts).
  const spaceName = String(formData.get("spaceName") ?? "").trim() || "Pessoal";
  try {
    await repo.createSpace({
      name: spaceName.slice(0, 80),
      createdBy: userId,
      members: [{ name, linkedUserId: userId, email }],
    });
  } catch {
    // Se falhar, a pessoa entra na mesma: o primeiro acesso cria-lhe um.
  }

  // Sem email, a pessoa não sabe que foi convidada, e o convite não serve de
  // nada. Por isso o resultado diz sempre se a mensagem chegou a sair.
  const mail = await sendInvite(email, name);

  revalidatePath("/mensagens");
  revalidatePath("/plataforma");
  return {
    ok: true,
    message: mail.sent
      ? `${name} recebeu um email com as instruções. Ambiente "${spaceName}" criado, só com ela.`
      : `Conta criada e ambiente "${spaceName}" pronto, mas o email NÃO foi enviado${
          emailConfigured() ? ` (${mail.reason})` : " (envio de email por configurar)"
        }. Diz-lhe tu para entrar em rachar.pt com ${email}.`,
  };
}

/** Sobe ou desce um ambiente na lista, guardando a nova ordem. */
export async function moveSpaceAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  const spaceId = String(formData.get("spaceId") ?? "");
  const dir = String(formData.get("dir") ?? "");
  const ids = ctx.spaces.map((s) => s.id);
  const from = ids.indexOf(spaceId);
  if (from < 0) return;

  const to = dir === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to]!, ids[from]!];

  try {
    await getRepository().reorderSpaces(ids);
  } catch {
    // A coluna de ordem pode não existir (migração 0010 por aplicar).
  }
  revalidatePath("/", "layout");
  revalidatePath("/ambiente");
}

/**
 * Associa um participante a uma conta existente, sem lhe mudar o papel.
 * É isto que permite reconhecer a MESMA pessoa em ambientes diferentes (e, por
 * isso, transferir saldos entre ambientes).
 */
export async function linkMemberAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const memberId = String(formData.get("memberId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const member = ctx.members.find((m) => m.id === memberId);
  if (!member) return { error: "Participante inválido." };

  if (!userId) {
    // Desassociar só faz sentido em participantes sem acesso próprio.
    if (member.role === "submitter") {
      return { error: "Este participante tem acesso próprio: usa Revogar." };
    }
    await getRepository().updateMember(memberId, ctx.space.id, { linkedUserId: null });
  } else {
    const known = await listKnownAccounts();
    const account = known.find((a) => a.id === userId);
    if (!account) return { error: "Conta desconhecida." };
    // Duas pessoas diferentes não podem partilhar a mesma conta no ambiente.
    const taken = ctx.members.find((m) => m.id !== memberId && m.linkedUserId === userId);
    if (taken) return { error: `Essa conta já está associada a ${taken.name}.` };

    await getRepository().updateMember(memberId, ctx.space.id, {
      linkedUserId: userId,
      email: account.email,
    });
  }

  revalidatePath("/ambiente");
  revalidatePath("/acertos");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Contas que o utilizador atual pode ver: só as que partilham com ele pelo
 * menos um ambiente (ver `domain/tenancy.ts`).
 *
 * Isto era, antes, a lista de TODAS as contas da plataforma, o que mostrava o
 * nome e o email de gente de outro inquilino a quem abrisse o ecrã de
 * participantes. Numa app multi-inquilino ninguém pode sequer descobrir que as
 * outras contas existem.
 */
export async function listKnownAccounts(): Promise<{ id: string; name: string; email: string }[]> {
  const ctx = await getSpaceContext();
  const repo = getRepository();

  const memberships = await repo
    .listMembershipsInSpaces(ctx.spaces.map((s) => s.id))
    .catch(() => []);
  const allowed = new Set(accountsVisibleTo(ctx.user.id, memberships));

  const base = householdUsers().map((u) => ({ id: u.id, name: u.name, email: u.email }));
  const extra = await repo.listAppUsers().catch(() => []);
  const seen = new Set(base.map((b) => b.id));

  return [...base, ...extra.filter((a) => !seen.has(a.id))].filter((a) => allowed.has(a.id));
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

// ---- Património: bens, investimentos e dívidas ----------------------------

const ASSET_KINDS = ["conta", "investimento", "imovel", "outro", "divida"] as const;

/** Número europeu ("1.234,56") para número simples. Null se vazio. */
function parseNumber(raw: unknown): number | null {
  const s = String(normalizeAmount(String(raw ?? "")) ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function saveAssetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Dá-lhe um nome." };
  const rawKind = String(formData.get("kind") ?? "outro");
  const kind = (ASSET_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as (typeof ASSET_KINDS)[number])
    : "outro";

  const quantity = parseNumber(formData.get("quantity"));
  const unitCost = parseNumber(formData.get("unitCost"));
  const unitPrice = parseNumber(formData.get("unitPrice"));
  const value = parseNumber(formData.get("value"));

  if (kind === "investimento") {
    if (quantity === null || quantity <= 0) return { error: "Indica quantas unidades tens." };
    if (unitCost === null || unitCost < 0) return { error: "Indica o preço de compra por unidade." };
  } else if (value === null) {
    return { error: "Indica o valor." };
  }

  // Taxa e plano de amortização. A taxa serve os dois lados: num depósito diz
  // o que rende, numa dívida diz o que custa. A prestação e o prazo só fazem
  // sentido em dívidas, e guardam-se apenas aí para não ficarem valores
  // órfãos numa conta à ordem.
  const rate = parseNumber(formData.get("interestRatePct"));
  const monthlyPayment = parseNumber(formData.get("monthlyPayment"));
  const term = parseNumber(formData.get("termMonths"));
  const rawRateKind = String(formData.get("rateKind") ?? "").trim();
  const isDebt = kind === "divida";

  const patch = {
    spaceId: ctx.space.id,
    name: name.slice(0, 120),
    kind,
    quantity: kind === "investimento" ? quantity : null,
    unitCostCents: kind === "investimento" && unitCost !== null ? toCents(unitCost) : null,
    // Preço atual é opcional: sem ele não inventamos valorização.
    unitPriceCents: kind === "investimento" && unitPrice !== null ? toCents(unitPrice) : null,
    valueCents: kind === "investimento" ? null : value !== null ? toCents(Math.abs(value)) : null,
    purchasedAt: String(formData.get("purchasedAt") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 300) || null,
    interestRatePct: rate !== null && rate >= 0 ? rate : null,
    monthlyPaymentCents:
      isDebt && monthlyPayment !== null && monthlyPayment > 0
        ? toCents(Math.abs(monthlyPayment))
        : null,
    termMonths: isDebt && term !== null && term > 0 ? Math.round(term) : null,
    rateKind: rawRateKind === "fixa" || rawRateKind === "variavel" ? rawRateKind : null,
    symbol:
      kind === "investimento"
        ? normalizeSymbol(String(formData.get("symbol") ?? ""))
        : null,
  };

  const id = String(formData.get("id") ?? "").trim();
  // Só a criação conta para o tecto: editar um bem que já existe nunca pode ser
  // travado por um limite, senão ficava lá preso sem se poder corrigir.
  if (!id) {
    const cheio = await semEspaco(ctx.space.id, ctx.space.plan, "assets");
    if (cheio) return { error: cheio };
  }
  try {
    if (id) await getRepository().updateAsset(id, ctx.space.id, patch);
    else await getRepository().createAsset({ ...patch, createdBy: ctx.user.id });
  } catch {
    return { error: "Não consegui gravar. A tabela do património pode faltar." };
  }

  revalidatePath("/patrimonio");
  return { ok: true, message: id ? "Atualizado." : `${name} adicionado.` };
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().deleteAsset(id, ctx.space.id).catch(() => {});
  revalidatePath("/patrimonio");
}

/** Só o preço atual, para atualizar cotações depressa sem abrir o formulário. */
export async function updateAssetPriceAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  const price = parseNumber(formData.get("unitPrice"));
  if (!id) return;
  await getRepository()
    .updateAsset(id, ctx.space.id, {
      unitPriceCents: price === null ? null : toCents(price),
    })
    .catch(() => {});
  revalidatePath("/patrimonio");
}

/**
 * Vai buscar a cotação do símbolo e grava-a como preço atual.
 *
 * Se a fonte não souber o símbolo, ou estiver em baixo, o preço fica como
 * estava. Um preço velho identificado como velho é informação; um preço
 * inventado não é.
 */
export async function fetchAssetQuoteAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  const symbol = String(formData.get("symbol") ?? "").trim();
  if (!id || !symbol) return;
  await refreshAssetPrice(id, ctx.space.id, symbol).catch(() => null);
  revalidatePath("/patrimonio");
  revalidatePath(`/patrimonio/ativos/${id}`);
}

/**
 * Vai buscar a cotação de **todos** os investimentos com símbolo.
 *
 * Com uma posição, o botão de cada linha chega. Com dezenas, não: ninguém carrega
 * cinquenta vezes. E como as cotações são uma cache partilhada, buscar tudo de
 * uma vez é mais barato do que uma a uma — os símbolos repetidos pagam-se uma só.
 *
 * Diz sempre o que aconteceu a cada uma, incluindo as que não deram. Um botão que
 * responde "feito" quando metade falhou é pior do que não ter botão nenhum.
 */
export async function refreshAllQuotesAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") {
    return { error: "Não tens permissão para isto." };
  }

  const freshness = await refreshStalePrices(ctx.space.id, { force: true }).catch(() => null);
  if (!freshness) return { error: "Não consegui atualizar os preços." };
  if (freshness.length === 0) {
    return { ok: true, message: "Não há investimentos com símbolo para atualizar." };
  }

  revalidatePath("/patrimonio");

  const novos = freshness.filter((f) => f.refreshed);
  const falhados = freshness.filter((f) => f.problem);
  const partes: string[] = [];

  if (novos.length > 0) {
    partes.push(`${novos.length} preço(s) atualizado(s)`);
  }
  // "Já estava em dia" não é falha: é o caso normal fora de horas de bolsa.
  const iguais = freshness.length - novos.length - falhados.length;
  if (iguais > 0) partes.push(`${iguais} já estava(m) em dia`);

  if (falhados.length > 0) {
    // Nomear os que falharam, e porquê: é a diferença entre poder corrigir o
    // símbolo e ficar a olhar para um número que não muda.
    const detalhe = falhados
      .slice(0, 3)
      .map((f) => `${f.symbol}: ${f.problem}`)
      .join("; ");
    const resto = falhados.length > 3 ? ` (e mais ${falhados.length - 3})` : "";
    return {
      ok: novos.length > 0,
      message: partes.length > 0 ? `${partes.join(", ")}.` : undefined,
      error: `${detalhe}${resto}`,
    };
  }

  return { ok: true, message: `${partes.join(", ")}.` };
}

// ---- Movimentos dos investimentos -----------------------------------------

const TRADE_KINDS = ["compra", "venda", "dividendo", "custo"] as const;

/**
 * Regista uma compra, venda, dividendo ou custo com data.
 *
 * O valor guardado é sempre em euros. Se a operação foi noutra moeda, converte-se
 * aqui com a taxa indicada e guarda-se também o valor original, para o registo
 * se poder conferir depois sem refazer contas.
 */
export async function addAssetTradeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!assetId) return { error: "Falta o investimento." };

  const rawKind = String(formData.get("kind") ?? "compra");
  const kind = (TRADE_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as (typeof TRADE_KINDS)[number])
    : "compra";

  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Indica a data." };

  const quantity = parseNumber(formData.get("quantity"));
  const unitPrice = parseNumber(formData.get("unitPrice"));
  const amount = parseNumber(formData.get("amount"));

  if ((kind === "compra" || kind === "venda") && (quantity === null || quantity <= 0)) {
    return { error: "Indica quantas unidades." };
  }

  // O valor pode vir escrito, ou sair de unidades x preço.
  const rawAmount =
    amount !== null && amount !== 0
      ? Math.abs(toCents(amount))
      : quantity !== null && unitPrice !== null
        ? Math.abs(Math.round(quantity * toCents(unitPrice)))
        : null;
  if (rawAmount === null || rawAmount <= 0) {
    return { error: "Indica o valor, ou o preço por unidade." };
  }

  const currency = String(formData.get("currency") ?? "EUR").trim().toUpperCase();
  const foreign = isForeign(currency);
  const fxRate = parseNumber(formData.get("fxRate"));

  let amountCents = rawAmount;
  if (foreign) {
    if (fxRate === null || fxRate <= 0) {
      return { error: `Indica a taxa de câmbio de ${currency} para euro.` };
    }
    const eur = toEurCents(rawAmount, fxRate);
    if (eur === null || eur <= 0) return { error: "Taxa de câmbio inválida." };
    amountCents = eur;
  }

  try {
    await getRepository().createAssetTrade({
      spaceId: ctx.space.id,
      assetId,
      date,
      kind,
      quantity: kind === "compra" || kind === "venda" ? quantity : null,
      // O preço por unidade fica em euros, como o resto.
      unitPriceCents:
        quantity && quantity > 0 && (kind === "compra" || kind === "venda")
          ? Math.round(amountCents / quantity)
          : null,
      amountCents,
      currency: foreign ? currency : null,
      originalAmountCents: foreign ? rawAmount : null,
      fxRate: foreign ? fxRate : null,
      notes: String(formData.get("notes") ?? "").trim().slice(0, 300) || null,
      createdBy: ctx.user.id,
    });
  } catch {
    return { error: "Não consegui gravar o movimento." };
  }

  revalidatePath("/patrimonio");
  return { ok: true, message: "Movimento registado." };
}

export async function deleteAssetTradeAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().deleteAssetTrade(id, ctx.space.id).catch(() => {});
  revalidatePath("/patrimonio");
}

// ---- Rendimento -----------------------------------------------------------

const INCOME_KINDS = ["salario", "extra", "juros", "dividendos", "renda", "outro"] as const;

export async function saveIncomeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Descreve o rendimento." };

  const cents = parseAmountCents(formData.get("amount"));
  if (cents === null || Number.isNaN(cents)) return { error: "Indica o valor recebido." };

  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Data inválida." };

  const rawKind = String(formData.get("kind") ?? "salario");
  const kind = (INCOME_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as (typeof INCOME_KINDS)[number])
    : "outro";

  try {
    await getRepository().createIncome({
      spaceId: ctx.space.id,
      kind,
      description: description.slice(0, 120),
      amountCents: cents,
      date,
      recurring: String(formData.get("recurring") ?? "") === "on",
      notes: String(formData.get("notes") ?? "").trim().slice(0, 300) || null,
      createdBy: ctx.user.id,
    });
  } catch {
    return { error: "Não consegui gravar. A tabela de rendimentos pode faltar." };
  }

  revalidatePath("/rendimentos");
  revalidatePath("/relatorios");
  return { ok: true, message: `${description} registado.` };
}

export async function deleteIncomeAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().deleteIncome(id, ctx.space.id).catch(() => {});
  revalidatePath("/rendimentos");
  revalidatePath("/relatorios");
}

// ---- Remover contas da plataforma -----------------------------------------

/**
 * Retira o acesso de alguém à plataforma.
 *
 * NÃO apaga o histórico. Os participantes que estavam ligados a esta conta
 * ficam sem ligação, o que significa que as despesas continuam a contar para o
 * saldo de quem partilha o ambiente. Apagar as despesas de uma pessoa
 * desequilibrava contas alheias que já podem ter sido acertadas, e isso não é
 * reversível.
 *
 * Para apagar mesmo os dados (pedido de RGPD), há `deleteAccountDataAction`.
 */
export async function removeAccountAccessAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!isAdmin(user.id)) return { error: "Sem permissão." };

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Falta a conta." };
  // O dono da plataforma não se pode remover a si próprio por engano.
  if (userId === user.id) return { error: "Não te podes remover a ti próprio." };

  const repo = getRepository();
  try {
    await repo.unlinkUserFromMembers(userId);
    await repo.deleteAppUser(userId);
  } catch (e) {
    // Antes isto era engolido, e a página recarregava igual sem dizer nada.
    // Uma remoção que falha em silêncio é pior do que uma que recusa: quem
    // carrega fica a achar que correu bem.
    return { error: e instanceof Error ? e.message : "Não consegui remover a conta." };
  }

  revalidatePath("/plataforma");
  revalidatePath("/", "layout");
  return { ok: true, message: "Acesso retirado. O histórico ficou." };
}

/**
 * Apaga a conta E os ambientes onde a pessoa estava sozinha.
 *
 * Ambientes partilhados ficam de pé: as contas das outras pessoas não podem
 * desaparecer porque uma delas saiu.
 */
export async function deleteAccountDataAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!isAdmin(user.id)) return { error: "Sem permissão." };
  if (String(formData.get("confirmar") ?? "").trim().toLowerCase() !== "apagar") {
    return { error: 'Escreve "apagar" para confirmar.' };
  }

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Falta a conta." };
  if (userId === user.id) return { error: "Não te podes apagar a ti próprio." };

  try {
    await getRepository().deleteAccountAndSoleSpaces(userId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não consegui apagar a conta." };
  }

  revalidatePath("/plataforma");
  revalidatePath("/", "layout");
  return { ok: true, message: "Conta apagada." };
}

/** Dispensa os primeiros passos. Fica num cookie: é preferência de ecrã. */
export async function dismissOnboardingAction(): Promise<void> {
  cookies().set("rachar_onboarding", "off", {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/dashboard");
}
