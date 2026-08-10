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
import { suggestTicker, tickerSuggestAvailable } from "@/lib/services/ticker-suggest";
import {
  creditContractExtractAvailable,
  extractCreditContract,
} from "@/lib/services/credit-contract-service";
import { readPdfText } from "@/lib/import/read-file";
import { getInePriceTable } from "@/lib/services/ine-service";
import {
  caminhoDoAnexo,
  removerAnexoDoStorage,
  signedUploadUrl,
} from "@/lib/services/attachments-service";
import {
  conversar,
  conversaAvailable,
  limparHistorico,
  type MensagemConversa,
} from "@/lib/services/conversa-service";
import {
  captureNetWorthSnapshot,
  getNetWorthHistory,
} from "@/lib/services/networth-history-service";
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
  checkAnexo,
  checkLimit,
  type SpacePlan,
  INDEXANTES,
  type CreditTerms,
  type Indexante,
  type IndexanteRates,
  type PeriodoTipo,
  type RatePeriod,
  type ContratoRevisto,
  procurarLocal,
  precoNaData,
  buildNetWorth,
  buildNetWorthSeries,
  buildSituacao,
  buildCreditoPlano,
  parseCreditTerms,
  derivePosition,
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

/**
 * Os períodos de taxa de um crédito, lidos do formulário.
 *
 * Vêm em campos repetidos (`periodStart`, `periodKind`, …), que o `getAll`
 * devolve como listas paralelas — é o que permite acrescentar e tirar linhas no
 * cliente sem inventar um formato próprio.
 *
 * Uma linha sem data é descartada em silêncio, porque é o que a linha vazia que
 * ficou por preencher significa. O que **não** se faz é preencher os buracos: um
 * período variável sem indexante fica sem indexante, e mais à frente o
 * `buildCreditoPlano` recusa-se a calcular e diz porquê. Escolher aqui uma taxa
 * por alguém seria pôr um número com ar de resposta no meio de um plano.
 */
function creditTermsFromForm(formData: FormData): CreditTerms | null {
  const datas = formData.getAll("periodStart").map((v) => String(v).trim());
  const tipos = formData.getAll("periodKind").map((v) => String(v).trim());
  const taxas = formData.getAll("periodRate");
  const indexantes = formData.getAll("periodIndexante").map((v) => String(v).trim());
  const spreads = formData.getAll("periodSpread");

  const periods: RatePeriod[] = [];
  for (let i = 0; i < datas.length; i++) {
    const startsOn = datas[i] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) continue;
    const kind: PeriodoTipo = tipos[i] === "variavel" ? "variavel" : "fixa";
    const indexante = indexantes[i];
    periods.push({
      startsOn,
      kind,
      ratePct: kind === "fixa" ? parseNumber(taxas[i]) : null,
      indexante:
        kind === "variavel" && indexante && indexante in INDEXANTES
          ? (indexante as Indexante)
          : null,
      spreadPct: kind === "variavel" ? parseNumber(spreads[i]) : null,
    });
  }
  if (periods.length === 0) return null;

  const indexanteRates: IndexanteRates = {};
  for (const chave of Object.keys(INDEXANTES) as Indexante[]) {
    const v = parseNumber(formData.get(`indexanteRate-${chave}`));
    if (v !== null) indexanteRates[chave] = v;
  }

  return { periods, indexanteRates };
}

/**
 * Porque é que a escrita falhou, em português e com o que fazer a seguir.
 *
 * **O caso que isto resolve.** O código escreve colunas que uma migração ainda
 * não criou, e o Postgres recusa a linha inteira. A mensagem antiga — "Não
 * consegui gravar. A tabela do património pode faltar." — mandava procurar uma
 * tabela que existe, e não dizia a única coisa acionável: falta correr uma
 * migração, e é esta coluna que não está lá.
 *
 * Nunca se deita fora a coluna e se grava o resto: quem escreveu o valor de
 * compra ficava a pensar que ele tinha sido guardado.
 */
function porqueNaoGravou(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const coluna = msg.match(/'([a-z_]+)' column|column "([a-z_]+)"/i);
  const nome = coluna?.[1] ?? coluna?.[2] ?? null;
  if (nome) {
    return `A base de dados ainda não tem a coluna "${nome}". Falta correr a migração que a cria — até lá, não gravo para não perder o que escreveste.`;
  }
  if (/relation .* does not exist/i.test(msg)) {
    return "A base de dados ainda não tem a tabela do património. Falta correr as migrações.";
  }
  return "Não consegui gravar.";
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
  } else if (value === null && kind !== "imovel") {
    return { error: "Indica o valor." };
  } else if (kind === "imovel" && value === null && parseNumber(formData.get("purchasePrice")) === null) {
    // Num imóvel, o valor de hoje é estimado a partir do que custou. Um dos
    // dois tem de existir, senão não há por onde começar.
    return { error: "Indica quanto custou, ou o valor de hoje." };
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
  const maturity = String(formData.get("maturityDate") ?? "").trim();
  const creditTerms = isDebt ? creditTermsFromForm(formData) : null;

  /**
   * A quota deste ambiente no bem.
   *
   * Fora do intervalo, ou em branco, vale "tudo" — nunca zero. Um bem que
   * passasse a valer zero por um campo mal preenchido desaparecia do património
   * sem dizer nada, e um património a menos não levanta suspeitas como um erro
   * levanta.
   */
  const rawQuota = parseNumber(formData.get("ownershipPct"));
  const ownershipPct =
    rawQuota !== null && rawQuota > 0 && rawQuota < 100 ? rawQuota : null;
  const rawCoOwner = String(formData.get("coOwnerMemberId") ?? "").trim();

  /**
   * Imóvel: área, concelho e preço de referência por m².
   *
   * O preço de referência **não substitui** o valor: fica ao lado dele, e a
   * estimativa é mostrada como estimativa. A mediana do concelho não sabe se a
   * casa é num último andar com vista ou num rés do chão para as traseiras.
   */
  const isImovel = kind === "imovel";
  const rawArea = parseNumber(formData.get("areaM2"));
  const rawPrecoM2 = parseNumber(formData.get("priceRefEurM2"));
  const rawCompra = parseNumber(formData.get("purchasePrice"));
  const rawObras = parseNumber(formData.get("works"));

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
    maturityDate: isDebt && /^\d{4}-\d{2}-\d{2}$/.test(maturity) ? maturity : null,
    creditTerms,
    ownershipPct,
    // Só vale se for mesmo alguém deste ambiente: um id vindo do formulário não
    // é prova de nada, e apontar para fora do ambiente seria uma fuga.
    coOwnerMemberId:
      rawCoOwner && ctx.members.some((m) => m.id === rawCoOwner) ? rawCoOwner : null,
    areaM2: isImovel && rawArea !== null && rawArea > 0 ? rawArea : null,
    location: isImovel ? String(formData.get("location") ?? "").trim().slice(0, 120) || null : null,
    priceRefCents:
      isImovel && rawPrecoM2 !== null && rawPrecoM2 > 0 ? toCents(rawPrecoM2) : null,
    priceRefSource: isImovel
      ? String(formData.get("priceRefSource") ?? "").trim().slice(0, 120) || null
      : null,
    priceRefGeocod: isImovel
      ? String(formData.get("priceRefGeocod") ?? "").trim().slice(0, 40) || null
      : null,
    purchasePriceCents:
      isImovel && rawCompra !== null && rawCompra > 0 ? toCents(rawCompra) : null,
    worksCents: isImovel && rawObras !== null && rawObras > 0 ? toCents(rawObras) : null,
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
  } catch (e) {
    return { error: porqueNaoGravou(e) };
  }

  await fotografarDepoisDoMovimento(ctx.space.id);
  revalidatePath("/patrimonio");
  return { ok: true, message: id ? "Atualizado." : `${name} adicionado.` };
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().deleteAsset(id, ctx.space.id).catch(() => {});
  await fotografarDepoisDoMovimento(ctx.space.id);
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
 * Sugere um símbolo de bolsa para um investimento, a partir do nome.
 *
 * Um produto importado vem com o nome que a corretora lhe dá e sem símbolo, e
 * sem símbolo não há cotação, nem preço atual, nem ganho, nem TWR. Escrever
 * dezenas de tickers à mão depois de uma importação não é trabalho que se peça.
 *
 * **A sugestão nunca se aplica sozinha.** Vem para confirmação, e o símbolo já
 * foi verificado contra a fonte de cotações antes de chegar aqui — mas um ticker
 * que existe e é da empresa errada passa nessa verificação e daria um preço
 * plausível todos os dias, sem ninguém desconfiar. A última palavra é de quem
 * conhece a carteira.
 */
export interface SuggestSymbolState extends ActionState {
  /** A proposta, para o ecrã poder oferecer um botão que a grava. */
  proposal?: SymbolProposal;
}

export async function suggestAssetSymbolAction(
  _prev: SuggestSymbolState,
  formData: FormData,
): Promise<SuggestSymbolState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Não tens permissão para isto." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Investimento inválido." };

  const assets = await getRepository().listAssets(ctx.space.id).catch(() => []);
  const asset = assets.find((a) => a.id === id);
  if (!asset) return { error: "Investimento inválido." };

  const r = await suggestTicker(asset.name, asset.exchange).catch(() => null);
  if (!r || !r.suggestion) {
    return { error: r?.problem ?? "Não consegui sugerir um símbolo." };
  }

  const s = r.suggestion;
  const moeda = s.currencyConfirmada && s.currencyConfirmada !== "EUR" ? ` em ${s.currencyConfirmada}` : "";
  return {
    ok: true,
    message: `${s.symbol}${moeda} (${s.bolsa}). ${s.porque}`,
    // A proposta desce inteira para o ecrã. Continua a ser preciso confirmar —
    // ver o cabeçalho — mas confirmar passa a ser carregar num botão que diz o
    // símbolo, em vez de o copiar à mão para outro ecrã.
    proposal: {
      assetId: asset.id,
      assetName: asset.name,
      symbol: s.symbol,
      bolsa: s.bolsa,
      moeda: s.currencyConfirmada || s.moeda,
      porque: s.porque,
      lastDate: s.lastDate,
    },
  };
}

/** Uma proposta de símbolo, já verificada contra a fonte, à espera de confirmação. */
export interface SymbolProposal {
  assetId: string;
  assetName: string;
  symbol: string;
  bolsa: string;
  moeda: string;
  porque: string;
  lastDate: string | null;
}

export interface SuggestMissingState extends ActionState {
  proposals?: SymbolProposal[];
  /** Ativos sem símbolo para os quais não houve proposta, e porquê. */
  semProposta?: { assetName: string; problem: string }[];
}

/** Quantos ativos se processam de uma vez. Acima disto é uma espera absurda. */
const MAX_SUGESTOES = 25;
/** Quantas chamadas em paralelo. Serve para não afogar a API nem a fonte. */
const LOTE = 4;

/**
 * Sugere símbolos para **todos** os investimentos que não têm nenhum.
 *
 * **Porquê existir, ao lado do botão de cada ficha.** Uma importação de
 * corretora cria dezenas de ativos de uma vez, todos sem símbolo — e sem símbolo
 * não há cotação, nem preço atual, nem ganho, nem TWR. Abrir quarenta fichas
 * para carregar quarenta vezes no mesmo botão não é trabalho que se peça a
 * ninguém, e o resultado previsível é a carteira ficar por atualizar.
 *
 * **Não corre durante a importação, de propósito.** Uma chamada ao modelo por
 * produto tornaria a pré-visualização lenta ao ponto de parecer avariada, e
 * amarrava um caminho que tem de funcionar sempre (importar) a um que é
 * opcional (sugerir). Corre quando alguém pede, sobre o que já está gravado.
 *
 * **Nada é aplicado aqui.** Devolve propostas para se escolherem uma a uma. Um
 * ticker que existe mas é de outra empresa passa na verificação contra a fonte e
 * daria um preço plausível todos os dias, para sempre, sem ninguém desconfiar.
 */
export async function suggestMissingSymbolsAction(
  _prev: SuggestMissingState,
  _formData: FormData,
): Promise<SuggestMissingState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Não tens permissão para isto." };
  if (!tickerSuggestAvailable()) {
    return { error: "A sugestão assistida não está configurada." };
  }

  const assets = await getRepository().listAssets(ctx.space.id).catch(() => []);
  const semSimbolo = assets.filter(
    (a) => a.kind === "investimento" && !normalizeSymbol(String(a.symbol ?? "")),
  );
  if (semSimbolo.length === 0) {
    return { ok: true, message: "Todos os investimentos já têm símbolo." };
  }

  const alvo = semSimbolo.slice(0, MAX_SUGESTOES);
  const proposals: SymbolProposal[] = [];
  const semProposta: { assetName: string; problem: string }[] = [];

  for (let i = 0; i < alvo.length; i += LOTE) {
    const lote = alvo.slice(i, i + LOTE);
    const rs = await Promise.all(
      lote.map((a) =>
        // A praça vem do ficheiro importado: é um facto, e poupa ao modelo o
        // palpite onde ele mais erra.
        suggestTicker(a.name, a.exchange)
          .then((r) => ({ a, r }))
          .catch(() => ({ a, r: null })),
      ),
    );
    for (const { a, r } of rs) {
      const s = r?.suggestion;
      if (s) {
        proposals.push({
          assetId: a.id,
          assetName: a.name,
          symbol: s.symbol,
          bolsa: s.bolsa,
          moeda: s.currencyConfirmada || s.moeda,
          porque: s.porque,
          lastDate: s.lastDate,
        });
      } else {
        semProposta.push({ assetName: a.name, problem: r?.problem ?? "Não consegui sugerir." });
      }
    }
  }

  return {
    ok: true,
    proposals,
    semProposta,
    // Diz sempre o que ficou de fora. Um resultado que só mostra os acertos
    // lê-se como "está tudo tratado", e não está.
    message:
      semSimbolo.length > alvo.length
        ? `${proposals.length} de ${alvo.length} propostos. Ficaram ${semSimbolo.length - alvo.length} para uma próxima vez.`
        : `${proposals.length} de ${alvo.length} propostos.`,
  };
}

/**
 * Aplica os símbolos que alguém confirmou, e vai buscar as cotações.
 *
 * Só entra o que vem marcado, e cada id é confrontado com os ativos do ambiente
 * antes de tocar em nada: um id vindo do formulário não é prova de nada.
 */
export async function applySymbolsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Não tens permissão para isto." };

  const escolhidos = formData.getAll("apply").map((v) => String(v));
  if (escolhidos.length === 0) return { error: "Não escolheste nenhum." };

  const assets = await getRepository().listAssets(ctx.space.id).catch(() => []);
  const validos = new Set(assets.map((a) => a.id));

  let aplicados = 0;
  for (const par of escolhidos) {
    // "assetId:simbolo", que é como a caixa o traz.
    const sep = par.indexOf(":");
    if (sep <= 0) continue;
    const id = par.slice(0, sep);
    const symbol = normalizeSymbol(par.slice(sep + 1));
    if (!symbol || !validos.has(id)) continue;
    await getRepository().updateAsset(id, ctx.space.id, { symbol });
    await refreshAssetPrice(id, ctx.space.id, symbol).catch(() => null);
    // A ficha do investimento é outra rota. Sem isto, quem grava o símbolo a
    // partir de lá fica a olhar para o mesmo "sem cotação" que o levou a pedir
    // a sugestão — e conclui, com razão, que o botão não fez nada.
    revalidatePath(`/patrimonio/ativos/${id}`);
    aplicados += 1;
  }

  revalidatePath("/patrimonio");
  if (aplicados === 0) return { error: "Nenhum símbolo era válido." };
  return { ok: true, message: `${aplicados} símbolo(s) aplicado(s), com a cotação buscada.` };
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

  /**
   * A corrigir um movimento já registado, em vez de acrescentar um.
   *
   * É o mesmo caminho de propósito: as regras que impedem gravar dólares como
   * euros, ou um movimento sem valor, têm de valer tanto a criar como a
   * corrigir. Duas validações separadas divergem ao segundo mês.
   */
  const tradeId = String(formData.get("tradeId") ?? "").trim();

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

  const dados = {
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
  };

  try {
    if (tradeId) {
      // O `space_id` filtra a escrita: um id vindo do formulário não é prova
      // de nada, e tudo aqui corre com a chave de serviço, que ignora o RLS.
      await getRepository().updateAssetTrade(tradeId, ctx.space.id, dados);
    } else {
      await getRepository().createAssetTrade(dados);
    }
  } catch {
    return { error: "Não consegui gravar o movimento." };
  }

  await fotografarDepoisDoMovimento(ctx.space.id);
  revalidatePath("/patrimonio");
  return { ok: true, message: tradeId ? "Movimento corrigido." : "Movimento registado." };
}

export async function deleteAssetTradeAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getRepository().deleteAssetTrade(id, ctx.space.id).catch(() => {});
  await fotografarDepoisDoMovimento(ctx.space.id);
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

export interface ContractExtractState extends ActionState {
  /** A proposta já verificada. Nunca gravada: vai preencher o formulário. */
  revisto?: ContratoRevisto | null;
  /** O que o modelo percebeu do documento, para se ver que leu o ficheiro certo. */
  notas?: string;
}

/** Uma escritura em PDF anda pelos 2 MB. Acima disto é outra coisa qualquer. */
const MAX_CONTRATO_BYTES = 15 * 1024 * 1024;

/**
 * Lê o contrato do crédito e devolve os campos propostos.
 *
 * **O ficheiro não é guardado em lado nenhum.** Entra, dá o texto, é lido e
 * desaparece com o pedido. Um contrato de crédito tem morada, número fiscal e
 * a assinatura de quem o assinou; guardá-lo para nada seria uma responsabilidade
 * que esta app não precisa de ter.
 *
 * O que sai daqui **não é gravado**: preenche o formulário do crédito, que ainda
 * tem de ser conferido e submetido por quem o carregou.
 */
export async function extractCreditContractAction(
  _prev: ContractExtractState,
  formData: FormData,
): Promise<ContractExtractState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Não tens permissão para isto." };
  if (!creditContractExtractAvailable()) {
    return { error: "A leitura assistida não está configurada." };
  }

  const file = formData.get("contract");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Escolhe o ficheiro do contrato." };
  }
  if (file.size > MAX_CONTRATO_BYTES) {
    return { error: "O ficheiro é demasiado grande: o máximo são 15 MB." };
  }

  const nome = (file.name ?? "").toLowerCase();
  let texto = "";
  if (nome.endsWith(".pdf")) {
    const buf = Buffer.from(await file.arrayBuffer());
    texto = await readPdfText(buf).catch(() => "");
  } else if (nome.endsWith(".txt")) {
    texto = await file.text().catch(() => "");
  } else {
    return { error: "Só consigo ler o contrato em PDF ou em texto." };
  }

  const r = await extractCreditContract(texto);
  if (r.problem) return { error: r.problem };
  return { ok: true, revisto: r.revisto ?? null, notas: r.notas };
}

/** Os dois índices que dão a valorização da zona desde a compra. */
export interface InePriceIndice {
  naCompra: { cents: number; period: string } | null;
  hoje: { cents: number; period: string } | null;
}

export interface InePriceOption {
  geodsg: string;
  pricePerM2Cents: number;
  /**
   * O código do sítio no INE. Guarda-se no bem: é o que permite voltar a
   * buscar o índice de uma data passada. O nome não chega — há nomes repetidos
   * entre níveis.
   */
  geocod: string;
  /** O índice na data da compra e o de agora, quando se sabe a data. */
  indice?: InePriceIndice;
  /**
   * Onde é que este sítio está, na hierarquia do INE.
   *
   * Sem isto, "Odivelas" — que é concelho E freguesia dentro dele — dava dois
   * botões com a mesma etiqueta e preços diferentes, e não havia forma de
   * escolher. O nome sozinho não chega.
   */
  dentroDe: string | null;
  /** A categoria de alojamento, quando o indicador a separa. */
  categoria: string | null;
}

export interface InePriceLookup {
  error?: string;
  /** O que se escolheu sozinho, quando o nome bateu certo. */
  escolhido?: InePriceOption | null;
  /** O nome batia certo por inteiro, ou foi uma aproximação? */
  exato?: boolean;
  /** Nomes parecidos, para se escolher à mão. */
  candidatos?: InePriceOption[];
  /** O período do INE, para a proveniência. */
  period?: string;
}

/**
 * O preço mediano por m² que o INE publica para um concelho.
 *
 * Chamada direta em vez de `useFormState`: isto vive **dentro** do formulário do
 * bem, e um `<form>` dentro de outro `<form>` não é HTML válido.
 *
 * Não grava nada. Devolve o preço para se pôr no campo, e quando o nome não é
 * inequívoco devolve os candidatos em vez de escolher — há duas Lagoas em
 * Portugal, uma nos Açores e outra no Algarve, com o dobro do preço uma da
 * outra.
 */
export async function lookupPropertyPriceAction(
  local: string,
  /** A data da escritura, para se ir buscar o índice da altura. */
  purchasedAt?: string | null,
): Promise<InePriceLookup> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Não tens permissão para isto." };

  const query = String(local ?? "").trim();
  if (!query) return { error: "Escreve o concelho." };

  const { table, problem } = await getInePriceTable();
  if (!table) return { error: problem ?? "Não consegui obter os preços do INE." };

  const compra = /^\d{4}-\d{2}-\d{2}$/.test(String(purchasedAt ?? "")) ? String(purchasedAt) : null;

  const r = procurarLocal(table.rows, query);
  const opcao = (c: {
    row: { geocod: string; geodsg: string; pricePerM2Cents: number; categoria?: string | null };
    dentroDe: string | null;
  }): InePriceOption => ({
    geodsg: c.row.geodsg,
    pricePerM2Cents: c.row.pricePerM2Cents,
    geocod: c.row.geocod,
    dentroDe: c.dentroDe,
    categoria: c.row.categoria ?? null,
    // Os dois índices do MESMO sítio: o da data da compra e o de agora. É a
    // razão entre eles que faz o valor do imóvel acompanhar a zona.
    indice: compra
      ? {
          naCompra: precoNaData(table.periodos, c.row.geocod, compra),
          hoje: precoNaData(table.periodos, c.row.geocod, new Date().toISOString().slice(0, 10)),
        }
      : undefined,
  });

  if (r.escolhido) {
    return {
      escolhido: opcao(r.escolhido),
      exato: r.exato,
      candidatos: [],
      period: table.period,
    };
  }
  if (r.candidatos.length > 0) {
    return { escolhido: null, candidatos: r.candidatos.map(opcao), period: table.period };
  }
  return { error: `O INE não tem "${query}" na lista de ${table.rows.length} sítios.` };
}

export interface ConversaState extends ActionState {
  /** A conversa toda, para a página a voltar a mostrar. */
  mensagens?: MensagemConversa[];
}

/**
 * Uma pergunta sobre a própria situação financeira.
 *
 * **Os números vão calculados.** O resumo é montado aqui a partir do que a app
 * já sabe somar — património, dívidas com taxa e prestação, média de despesa,
 * rendimento, evolução — e é isso que o modelo recebe. Ele discute; não calcula.
 *
 * **A conversa não fica guardada.** Vive no ecrã e vai e volta em cada pedido.
 * Uma tabela de conversas sobre dinheiro é uma responsabilidade que esta app não
 * precisa de ter, e o valor de a guardar é pequeno.
 */
export async function conversarAction(
  _prev: ConversaState,
  formData: FormData,
): Promise<ConversaState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Não tens permissão para isto." };
  if (!conversaAvailable()) return { error: "A conversa assistida não está configurada." };

  const pergunta = String(formData.get("pergunta") ?? "").trim();
  if (!pergunta) return { error: "Escreve uma pergunta." };

  let anteriores: unknown[] = [];
  try {
    const bruto = JSON.parse(String(formData.get("historico") ?? "[]"));
    if (Array.isArray(bruto)) anteriores = bruto;
  } catch {
    // Histórico ilegível: começa-se de novo em vez de rebentar.
  }
  const historico = [...limparHistorico(anteriores), { role: "user" as const, content: pergunta }];

  // A página é só para o modelo poder falar do que a pessoa tem à frente.
  // Vem do cliente, por isso é cortada e nunca usada para decidir nada.
  const pagina = String(formData.get("pagina") ?? "").trim().slice(0, 80) || null;

  const situacao = await buildSituacaoDoAmbiente(ctx, pagina);
  const r = await conversar(situacao, historico);
  if (r.problem || !r.reply) {
    return { error: r.problem ?? "Não consegui responder.", mensagens: historico };
  }

  return { ok: true, mensagens: [...historico, { role: "assistant", content: r.reply }] };
}

/** Quantas categorias entram no resumo. As maiores; o resto é ruído. */
const CATEGORIAS_NO_RESUMO = 8;

/**
 * O resumo da situação, montado do que a app já sabe.
 *
 * Tudo aqui sai de funções com testes. O que **não** entra: as notas dos bens
 * (texto livre, onde cabe o que alguém escreveu sem pensar que sairia daqui),
 * os nomes das pessoas e as despesas uma a uma. O extrato não sai deste
 * servidor.
 */
async function buildSituacaoDoAmbiente(
  ctx: Awaited<ReturnType<typeof getSpaceContext>>,
  pagina: string | null,
) {
  const spaceId = ctx.space.id;
  const viewerId = ctx.viewerMemberId;
  const repo = getRepository();
  const [stored, trades, expenses, incomes, categories, historico, saldo] = await Promise.all([
    repo.listAssets(spaceId).catch(() => []),
    repo.listAssetTrades(spaceId).catch(() => []),
    repo.listExpenses({ spaceId, viewerId }).catch(() => []),
    repo.listIncome(spaceId).catch(() => []),
    repo.listCategories(spaceId).catch(() => []),
    getNetWorthHistory(spaceId),
    // Metade desta app é despesa partilhada. Um chat sobre "a minha situação"
    // que não saiba responder a "quem me deve o quê?" não serve para nada.
    getSpaceBalance(spaceId, ctx.members, viewerId).catch(() => null),
  ]);

  const tradesByAsset = new Map<string, typeof trades>();
  for (const t of trades) {
    tradesByAsset.set(t.assetId, [...(tradesByAsset.get(t.assetId) ?? []), t]);
  }
  const assets = stored.map((a) => {
    const d = derivePosition(a, tradesByAsset.get(a.id) ?? []);
    return d.derived ? { ...a, quantity: d.quantity, unitCostCents: d.unitCostCents } : a;
  });
  const net = buildNetWorth(assets);
  const today = new Date().toISOString().slice(0, 10);

  // Despesa por mês e por categoria. Médias sobre os meses COM movimento: um
  // mês sem despesas registadas quase nunca é um mês sem despesas.
  const porMesTotal = new Map<string, number>();
  const porCategoria = new Map<string, number>();
  for (const e of expenses) {
    if (e.status !== "confirmed" || e.deletedAt) continue;
    const ym = e.transactionDate.slice(0, 7);
    porMesTotal.set(ym, (porMesTotal.get(ym) ?? 0) + e.amountCents);
    const cat = e.categoryId ?? "";
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + e.amountCents);
  }
  const meses = porMesTotal.size;
  const monthlyExpenseCents =
    meses > 0
      ? Math.round([...porMesTotal.values()].reduce((a, b) => a + b, 0) / meses)
      : null;

  const nomeCategoria = new Map(categories.map((c) => [c.id, c.name]));
  const categorias =
    meses > 0
      ? [...porCategoria.entries()]
          .map(([id, cents]) => ({
            label: nomeCategoria.get(id) ?? "Sem categoria",
            monthlyCents: Math.round(cents / meses),
          }))
          .sort((a, b) => b.monthlyCents - a.monthlyCents)
          .slice(0, CATEGORIAS_NO_RESUMO)
      : [];

  // Rendimento: o que se recebe por mês, dos registos recorrentes. Os pontuais
  // ficam de fora — um prémio de um ano não é rendimento mensal.
  const recorrentes = incomes.filter((i) => i.recurring);
  const monthlyIncomeCents =
    recorrentes.length > 0 ? recorrentes.reduce((s, i) => s + i.amountCents, 0) : null;

  const dividas = net.assets
    .filter((a) => a.kind === "divida")
    .map((a) => {
      const stored0 = stored.find((s) => s.id === a.id) ?? null;
      const terms = parseCreditTerms(stored0?.creditTerms);
      const plano = terms
        ? buildCreditoPlano({
            balanceCents: a.currentValueCents,
            startDate: today,
            maturityDate: stored0?.maturityDate,
            periods: terms.periods,
            indexanteRates: terms.indexanteRates,
          })
        : null;
      return {
        label: a.name,
        balanceCents: a.currentValueCents,
        monthlyPaymentCents: plano?.currentPaymentCents ?? a.monthlyPaymentCents ?? null,
        annualRatePct: plano?.tramos[0]?.annualRatePct ?? a.interestRatePct ?? null,
        nextChangeOn: plano?.nextChangeOn ?? null,
        nextPaymentCents: plano?.nextPaymentCents ?? null,
      };
    });

  const nomeMembro = new Map(ctx.members.map((m) => [m.id, m.name]));
  const saldos = saldo
    ? Object.entries(saldo.balance.netByUser).map(([id, cents]) => ({
        nome: nomeMembro.get(id) ?? "alguém",
        netCents: Number(cents) || 0,
      }))
    : [];
  const acertos = saldo
    ? saldo.transfers.map((t) => ({
        de: nomeMembro.get(t.fromUserId) ?? "alguém",
        para: nomeMembro.get(t.toUserId) ?? "alguém",
        cents: t.amountCents,
      }))
    : [];

  const serie = buildNetWorthSeries(historico);
  const primeiro = serie.points[0];
  const ultimo = serie.points.at(-1);

  return buildSituacao({
    assetsCents: net.totalAssetsCents,
    debtsCents: net.totalLiabilitiesCents,
    byKind: net.byKind.map((k) => ({ label: k.label, totalCents: k.totalCents })),
    dividas,
    monthlyExpenseCents,
    monthlyIncomeCents,
    categorias,
    investmentCostCents: net.investmentCostCents,
    investmentGainCents: net.investmentCostCents > 0 ? net.investmentGainCents : null,
    saldos,
    acertos,
    pagina,
    historico:
      serie.changeCents !== null && primeiro && ultimo
        ? {
            dePeriodo: primeiro.label,
            aPeriodo: ultimo.label,
            changeCents: serie.changeCents,
            changePct: serie.changePct,
          }
        : null,
  });
}

/**
 * Gravar a fotografia do património depois de um movimento.
 *
 * **Porquê aqui e não só na visita.** A fotografia é uma por dia. Se só se
 * gravasse ao abrir o `/patrimonio`, o gráfico tinha a resolução das visitas e
 * não a dos movimentos: registar uma compra e não abrir a página deixava o dia
 * de fora, e o salto aparecia depois todo junto no dia em que se abrisse.
 *
 * É idempotente — o mesmo dia é sempre a mesma linha — e falha calada: ninguém
 * fica sem registar um movimento porque a fotografia não deu.
 */
async function fotografarDepoisDoMovimento(spaceId: string): Promise<void> {
  try {
    const repo = getRepository();
    const [stored, trades] = await Promise.all([
      repo.listAssets(spaceId),
      repo.listAssetTrades(spaceId),
    ]);
    const porAtivo = new Map<string, typeof trades>();
    for (const t of trades) porAtivo.set(t.assetId, [...(porAtivo.get(t.assetId) ?? []), t]);
    const assets = stored.map((a) => {
      const d = derivePosition(a, porAtivo.get(a.id) ?? []);
      return d.derived ? { ...a, quantity: d.quantity, unitCostCents: d.unitCostCents } : a;
    });
    await captureNetWorthSnapshot(
      spaceId,
      buildNetWorth(assets),
      new Date().toISOString().slice(0, 10),
    );
  } catch {
    // Ver o cabeçalho.
  }
}

/**
 * Mudar um bem de posição na lista, dentro do seu tipo.
 *
 * **Porquê à mão e não por valor.** A lista vinha por ordem de criação, que numa
 * carteira importada é a ordem do ficheiro da corretora — não quer dizer nada.
 * Ordenar por valor também não serve: a ordem por que se olha para as coisas é a
 * de quem olha, e muda de pessoa para pessoa.
 *
 * **A ordem é por tipo.** Trocar um imóvel com uma conta bancária não é uma
 * ordenação, é uma mistura: a página agrupa por tipo, e mover atravessando
 * grupos não teria efeito nenhum visível.
 *
 * **A primeira mexida numera o grupo todo.** Enquanto ninguém mexer, tudo fica
 * a `null` e manda a data de criação — que é como sempre esteve, e por isso
 * nenhuma lista já vista muda por causa desta funcionalidade.
 */
export async function moverAtivoAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;

  const id = String(formData.get("id") ?? "").trim();
  const dir = String(formData.get("dir") ?? "");
  if (!id || (dir !== "cima" && dir !== "baixo")) return;

  const repo = getRepository();
  const todos = await repo.listAssets(ctx.space.id).catch(() => []);
  const alvo = todos.find((a) => a.id === id);
  if (!alvo) return;

  // Só o grupo do mesmo tipo, na ordem em que está a ser mostrado.
  const grupo = todos.filter((a) => a.kind === alvo.kind);
  const i = grupo.findIndex((a) => a.id === id);
  const j = dir === "cima" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= grupo.length) return;

  const nova = [...grupo];
  nova[i] = grupo[j]!;
  nova[j] = grupo[i]!;

  // Numera o grupo todo: é uma escrita por bem, mas só de cada vez que alguém
  // arruma a lista, e deixa a ordem explícita em vez de dependente de empates.
  await Promise.all(
    nova.map((a, k) =>
      a.sortOrder === k
        ? Promise.resolve()
        : repo.updateAsset(a.id, ctx.space.id, { sortOrder: k }).catch(() => {}),
    ),
  );

  revalidatePath("/patrimonio");
}

export interface AnexoPreparado extends ActionState {
  /** Para onde o browser envia o ficheiro, sem passar por aqui. */
  uploadUrl?: string;
  token?: string;
  anexoId?: string;
}

/**
 * Preparar um anexo: valida, reserva a linha e devolve para onde enviar.
 *
 * **Os bytes nunca passam por aqui.** As Server Actions do Next têm tecto de
 * 1 MB e uma função da Vercel ~4,5 MB; uma escritura digitalizada passa os
 * dois. O que sobe é o nome, o tipo e o tamanho — e é sobre eles que se decide.
 *
 * A linha nasce em `a-enviar` e só passa a `pronto` quando o envio é
 * confirmado. Um anexo que fique pelo caminho não aparece em lado nenhum.
 */
export async function prepararAnexoAction(
  _prev: AnexoPreparado,
  formData: FormData,
): Promise<AnexoPreparado> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Não tens permissão para isto." };

  const assetId = String(formData.get("assetId") ?? "").trim();
  const fileName = String(formData.get("fileName") ?? "").trim().slice(0, 200);
  const contentType = String(formData.get("contentType") ?? "").trim();
  const sizeBytes = Number(formData.get("sizeBytes") ?? 0);
  if (!assetId || !fileName) return { error: "Falta o ficheiro." };

  const repo = getRepository();
  // O bem tem de ser mesmo deste ambiente: um id vindo do formulário não é
  // prova de nada, e tudo aqui corre com a chave de serviço, que ignora o RLS.
  const bem = (await repo.listAssets(ctx.space.id).catch(() => [])).find((a) => a.id === assetId);
  if (!bem) return { error: "Bem inválido." };

  const doAmbiente = await repo.listAssetAttachments(ctx.space.id).catch(() => []);
  const veredicto = checkAnexo({
    // Sem plano gravado conta como gratuito: um tecto a mais nunca apaga nada,
    // e um tecto a menos deixava passar espaço sem limite.
    plan: ctx.space.plan ?? "free",
    porBem: doAmbiente.filter((a) => a.assetId === assetId).length,
    bytesNoAmbiente: doAmbiente.reduce((s, a) => s + a.sizeBytes, 0),
    bytesDoFicheiro: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    contentType,
  });
  if (!veredicto.allowed) return { error: veredicto.message ?? "Não dá para anexar isto." };

  const anexoId = `anx_${randomUUID()}`;
  // O caminho é construído aqui e nunca recebido: se viesse do cliente, ele
  // escolhia a pasta.
  const storagePath = caminhoDoAnexo(ctx.space.id, assetId, anexoId, contentType);

  const destino = await signedUploadUrl(storagePath);
  if (!destino) return { error: "Não consegui preparar o envio." };

  try {
    await repo.createAssetAttachment({
      id: anexoId,
      spaceId: ctx.space.id,
      assetId,
      fileName,
      contentType,
      sizeBytes: Math.max(0, Math.round(sizeBytes)),
      storagePath,
      status: "a-enviar",
      createdBy: ctx.user.id,
    });
  } catch {
    return { error: "Não consegui gravar o anexo." };
  }

  return { ok: true, uploadUrl: destino.url, token: destino.token, anexoId };
}

/** O envio correu bem: o anexo passa a contar. */
export async function confirmarAnexoAction(anexoId: string): Promise<ActionState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Não tens permissão para isto." };
  const id = String(anexoId ?? "").trim();
  if (!id) return { error: "Anexo inválido." };

  const repo = getRepository();
  try {
    await repo.markAssetAttachmentReady(id, ctx.space.id);
  } catch {
    return { error: "Não consegui confirmar o anexo." };
  }
  revalidatePath("/patrimonio");
  // A página do investimento é outra rota: sem isto, o ficheiro ficava
  // guardado e o ecrã onde a pessoa acabou de o largar continuava vazio. O id
  // do bem sai da linha do anexo, não do cliente.
  const anexo = await repo.getAssetAttachment(id, ctx.space.id).catch(() => null);
  if (anexo) revalidatePath(`/patrimonio/ativos/${anexo.assetId}`);
  return { ok: true, message: "Anexo guardado." };
}

/**
 * Apagar um anexo — a linha **e** o ficheiro.
 *
 * Os recibos das despesas ficam no Storage para sempre quando um ambiente é
 * apagado, o que torna falsa a frase "apagamos os teus dados". Com escrituras,
 * que têm morada e número fiscal, seria bem pior.
 */
export async function apagarAnexoAction(formData: FormData): Promise<void> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const repo = getRepository();
  const anexo = await repo.getAssetAttachment(id, ctx.space.id).catch(() => null);
  if (!anexo) return;

  await repo.deleteAssetAttachment(id, ctx.space.id).catch(() => {});
  await removerAnexoDoStorage(anexo.storagePath);
  revalidatePath("/patrimonio");
  revalidatePath(`/patrimonio/ativos/${anexo.assetId}`);
}
