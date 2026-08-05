"use server";

import { revalidatePath } from "next/cache";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import {
  buildHoldingsPreview,
  HoldingsImportError,
  type HoldingsPreview,
} from "@/lib/services/holdings-import";
import type { HoldingMapping } from "@/lib/import/holdings";

export interface HoldingsState {
  error?: string;
  ok?: boolean;
  message?: string;
  preview?: HoldingsPreview;
  sample?: { fileName: string; rows: string[][] } | null;
}

/** Colunas indicadas à mão, quando a deteção falha. */
function readManual(formData: FormData): HoldingMapping | null {
  if (String(formData.get("manual") ?? "") !== "1") return null;
  const num = (n: string, fallback = -1) => {
    const raw = String(formData.get(n) ?? "").trim();
    if (raw === "") return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? v : fallback;
  };
  const m: HoldingMapping = {
    headerRow: Math.max(0, num("headerRow", 0)),
    nameCol: num("nameCol"),
    quantityCol: num("quantityCol"),
    unitCostCol: num("unitCostCol"),
    unitPriceCol: num("unitPriceCol"),
    marketValueCol: num("marketValueCol"),
  };
  // O mínimo útil é saber o quê e quanto.
  if (m.nameCol < 0 || m.quantityCol < 0) return null;
  return m;
}

export async function previewHoldingsAction(
  _prev: HoldingsState,
  formData: FormData,
): Promise<HoldingsState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Escolhe um ficheiro." };

  try {
    const preview = await buildHoldingsPreview({ file, manualMapping: readManual(formData) });
    return { preview };
  } catch (e) {
    if (e instanceof HoldingsImportError) return { error: e.message, sample: e.sample ?? null };
    return { error: "Não consegui processar o ficheiro." };
  }
}

export async function commitHoldingsAction(
  _prev: HoldingsState,
  formData: FormData,
): Promise<HoldingsState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  let payload: {
    rows: {
      name: string;
      quantity: number;
      unitCostCents: number | null;
      unitPriceCents: number | null;
    }[];
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
  if (!payload.rows?.length) return { error: "Não escolheste nenhuma posição." };

  const repo = getRepository();

  // Formato confirmado por uma pessoa: fica na biblioteca para a próxima, de
  // qualquer corretora e para qualquer utilizador.
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

  let imported = 0;
  for (const r of payload.rows) {
    if (!r.name || !r.quantity) continue;
    await repo.createAsset({
      spaceId: ctx.space.id,
      name: r.name.slice(0, 120),
      kind: "investimento",
      quantity: r.quantity,
      unitCostCents: r.unitCostCents,
      unitPriceCents: r.unitPriceCents,
      valueCents: null,
      purchasedAt: null,
      notes: null,
      createdBy: ctx.user.id,
    });
    imported += 1;
  }

  revalidatePath("/patrimonio");
  revalidatePath("/patrimonio/ativos");
  return { ok: true, message: `${imported} posição(ões) importada(s).` };
}
