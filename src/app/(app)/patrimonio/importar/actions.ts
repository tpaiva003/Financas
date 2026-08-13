"use server";

import { revalidatePath } from "next/cache";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import {
  buildBrokerPreview,
  type BrokerPreview,
  type TradeGroup,
} from "@/lib/services/broker-import";
import { commitTradesImport } from "@/lib/services/trades-import";
import type { TradeMapping } from "@/lib/import/trades";
import type { HoldingMapping, HoldingRow } from "@/lib/import/holdings";

export interface BrokerState {
  error?: string;
  ok?: boolean;
  message?: string;
  preview?: BrokerPreview;
}

function num(formData: FormData, name: string, fallback = -1): number {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Colunas indicadas à mão.
 *
 * O mesmo painel serve os dois tipos de ficheiro: se apontarem uma coluna de
 * datas, é um extrato de movimentos; se não, é uma lista de posições. É a mesma
 * regra que a deteção automática usa, e não fazia sentido serem duas.
 */
function readManual(formData: FormData): {
  trades: TradeMapping | null;
  holdings: HoldingMapping | null;
} {
  if (String(formData.get("manual") ?? "") !== "1") return { trades: null, holdings: null };

  const headerRow = Math.max(0, num(formData, "headerRow", 0));
  const nameCol = num(formData, "nameCol");
  const quantityCol = num(formData, "quantityCol");
  const dateCol = num(formData, "dateCol");
  if (nameCol < 0 || quantityCol < 0) return { trades: null, holdings: null };

  if (dateCol >= 0) {
    return {
      trades: {
        headerRow,
        dateCol,
        nameCol,
        quantityCol,
        priceCol: num(formData, "priceCol"),
        amountCol: num(formData, "amountCol"),
        currencyCol: num(formData, "currencyCol"),
        fxRateCol: num(formData, "fxRateCol"),
        kindCol: num(formData, "kindCol"),
      },
      holdings: null,
    };
  }

  return {
    trades: null,
    holdings: {
      headerRow,
      nameCol,
      quantityCol,
      unitCostCol: num(formData, "unitCostCol"),
      unitPriceCol: num(formData, "priceCol"),
      marketValueCol: num(formData, "amountCol"),
    },
  };
}

export async function previewBrokerAction(
  _prev: BrokerState,
  formData: FormData,
): Promise<BrokerState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Escolhe pelo menos um ficheiro." };
  if (files.length > 10) return { error: "Dez ficheiros de cada vez, no máximo." };

  const manual = readManual(formData);
  try {
    const preview = await buildBrokerPreview({
      spaceId: ctx.space.id,
      files,
      manualTrades: manual.trades,
      manualHoldings: manual.holdings,
    });
    return { preview };
  } catch {
    return { error: "Não consegui processar os ficheiros." };
  }
}

export async function commitBrokerAction(
  _prev: BrokerState,
  formData: FormData,
): Promise<BrokerState> {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return { error: "Sem permissão." };

  let payload: {
    groups: TradeGroup[];
    holdings: HoldingRow[];
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
  if (!payload.groups?.length && !payload.holdings?.length) {
    return { error: "Não escolheste nada para importar." };
  }

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

  const partes: string[] = [];

  try {
    if (payload.groups?.length) {
      /**
       * O `existingAssetId` vem do payload do cliente e não é de confiar.
       *
       * Ia direto para a escrita: bastava trocar o id por um de outro ambiente
       * para pendurar movimentos num ativo que não é nosso. Aqui confronta-se
       * com os ativos deste ambiente; um id que não esteja na lista passa a
       * `null`, e o movimento cria um ativo novo em vez de escrever no alheio.
       */
      const meus = new Set(
        (await repo.listAssets(ctx.space.id).catch(() => [])).map((a) => a.id),
      );
      const groups = payload.groups.map((g) => ({
        ...g,
        existingAssetId: g.existingAssetId && meus.has(g.existingAssetId) ? g.existingAssetId : null,
      }));

      const r = await commitTradesImport({
        spaceId: ctx.space.id,
        userId: ctx.user.id,
        groups,
      });
      partes.push(`${r.tradesImported} movimento(s)`);
      if (r.assetsCreated > 0) partes.push(`${r.assetsCreated} investimento(s) criado(s)`);
      /**
       * O que já lá estava, dito por palavras.
       *
       * Sem esta frase, reimportar o ficheiro da corretora respondia "0
       * movimentos" e lia-se como avaria — quando é exactamente o que devia
       * acontecer. É a mesma razão por que a importação de despesas conta os
       * duplicados em vez de os engolir.
       */
      if (r.jaRegistados > 0) {
        partes.push(
          r.jaRegistados === 1
            ? "1 já estava registado"
            : `${r.jaRegistados} já estavam registados`,
        );
      }
      if (r.skippedNoFx > 0) {
        partes.push(`${r.skippedNoFx} deixado(s) de fora por falta de câmbio`);
      }
    }

    // Uma posição com o mesmo nome atualiza o que já lá está, em vez de criar um
    // segundo ativo igual. Importar duas vezes não duplica a carteira.
    if (payload.holdings?.length) {
      const assets = await repo.listAssets(ctx.space.id).catch(() => []);
      const porNome = new Map(assets.map((a) => [a.name.trim().toLowerCase(), a]));
      let criados = 0;
      let atualizados = 0;
      for (const h of payload.holdings) {
        if (!h.name || !h.quantity) continue;
        const existente = porNome.get(h.name.trim().toLowerCase());
        if (existente) {
          await repo.updateAsset(existente.id, ctx.space.id, {
            quantity: h.quantity,
            unitCostCents: h.unitCostCents,
            unitPriceCents: h.unitPriceCents,
          });
          atualizados += 1;
        } else {
          await repo.createAsset({
            spaceId: ctx.space.id,
            name: h.name.slice(0, 120),
            kind: "investimento",
            quantity: h.quantity,
            unitCostCents: h.unitCostCents,
            unitPriceCents: h.unitPriceCents,
            valueCents: null,
            purchasedAt: null,
            notes: null,
            createdBy: ctx.user.id,
          });
          criados += 1;
        }
      }
      if (criados > 0) partes.push(`${criados} posição(ões) nova(s)`);
      if (atualizados > 0) partes.push(`${atualizados} posição(ões) atualizada(s)`);
    }
  } catch {
    return { error: "Não consegui gravar tudo. O que entrou até aqui ficou." };
  }

  revalidatePath("/patrimonio");
  revalidatePath("/patrimonio/ativos");
  return { ok: true, message: `Importado: ${partes.join(", ")}.` };
}
