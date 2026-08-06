"use server";

import { revalidatePath } from "next/cache";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import {
  buildTradesPreview,
  commitTradesImport,
  TradesImportError,
  type TradesPreview,
} from "@/lib/services/trades-import";
import type { TradeMapping } from "@/lib/import/trades";

export interface TradesState {
  error?: string;
  ok?: boolean;
  message?: string;
  preview?: TradesPreview;
  sample?: { fileName: string; rows: string[][] } | null;
}

/** Colunas indicadas à mão, quando a deteção falha ou acerta mal. */
function readManual(formData: FormData): TradeMapping | null {
  if (String(formData.get("manual") ?? "") !== "1") return null;
  const num = (n: string, fallback = -1) => {
    const raw = String(formData.get(n) ?? "").trim();
    if (raw === "") return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? v : fallback;
  };
  const m: TradeMapping = {
    headerRow: Math.max(0, num("headerRow", 0)),
    dateCol: num("dateCol"),
    nameCol: num("nameCol"),
    quantityCol: num("quantityCol"),
    priceCol: num("priceCol"),
    amountCol: num("amountCol"),
    currencyCol: num("currencyCol"),
    fxRateCol: num("fxRateCol"),
    kindCol: num("kindCol"),
  };
  // O mínimo útil: quando, o quê, e quanto.
  if (m.dateCol < 0 || m.nameCol < 0 || m.quantityCol < 0) return null;
  return m;
}

export async function previewTradesAction(
  _prev: TradesState,
  formData: FormData,
): Promise<TradesState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Escolhe um ficheiro." };

  try {
    const preview = await buildTradesPreview({
      spaceId: ctx.space.id,
      file,
      manualMapping: readManual(formData),
    });
    return { preview };
  } catch (e) {
    if (e instanceof TradesImportError) return { error: e.message, sample: e.sample ?? null };
    return { error: "Não consegui processar o ficheiro." };
  }
}

export async function commitTradesAction(
  _prev: TradesState,
  formData: FormData,
): Promise<TradesState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  let payload: {
    groups: Parameters<typeof commitTradesImport>[0]["groups"];
    saveTemplate?: {
      fingerprint: string;
      label: string;
      header: string[];
      mapping: Record<string, number>;
    } | null;
  };
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Dados inválidos." };
  }
  if (!payload.groups?.length) return { error: "Não escolheste nenhum movimento." };

  const repo = getRepository();

  const tpl = payload.saveTemplate;
  if (tpl?.fingerprint && tpl.label.trim()) {
    await repo
      .saveImportTemplate({
        fingerprint: tpl.fingerprint,
        label: tpl.label.trim().slice(0, 60),
        header: tpl.header,
        mapping: tpl.mapping as unknown as Record<string, number | boolean>,
        createdBy: ctx.user.id,
      })
      .catch(() => {
        // Guardar o formato é um extra: nunca impede a importação.
      });
  }

  let result;
  try {
    result = await commitTradesImport({
      spaceId: ctx.space.id,
      userId: ctx.user.id,
      groups: payload.groups,
    });
  } catch {
    return { error: "Não consegui gravar os movimentos." };
  }

  revalidatePath("/patrimonio");
  revalidatePath("/patrimonio/ativos");

  const partes = [
    `${result.tradesImported} movimento(s) importado(s)`,
    result.assetsCreated > 0 ? `${result.assetsCreated} investimento(s) criado(s)` : null,
    result.skippedNoFx > 0
      ? `${result.skippedNoFx} deixado(s) de fora por falta de câmbio`
      : null,
  ].filter(Boolean);

  return { ok: true, message: `${partes.join(", ")}.` };
}
