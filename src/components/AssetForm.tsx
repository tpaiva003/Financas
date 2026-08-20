"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveAssetAction, type ActionState } from "@/app/(app)/actions";
import {
  ASSET_KIND_LABELS,
  RATE_KIND_LABELS,
  type AssetKind,
  type ContratoRevisto,
  type CreditTerms,
  type RateKind,
} from "@/lib/domain";
import { CreditContractImport } from "./CreditContractImport";
import { CreditPeriodsField } from "./CreditPeriodsField";
import { PropertyPriceField } from "./PropertyPriceField";
import { OwnershipField, type OwnershipMember } from "./OwnershipField";

const empty: ActionState = {};

/** O que o formulário precisa de saber para editar um bem já registado. */
export interface AssetFormValues {
  id: string;
  name: string;
  kind: AssetKind;
  quantity?: number | null;
  unitCostCents?: number | null;
  unitPriceCents?: number | null;
  valueCents?: number | null;
  purchasedAt?: string | null;
  notes?: string | null;
  interestRatePct?: number | null;
  monthlyPaymentCents?: number | null;
  termMonths?: number | null;
  rateKind?: string | null;
  /** Que fatia deste bem é deste ambiente, em percentagem. */
  ownershipPct?: number | null;
  /** Quem tem o resto, quando é alguém do ambiente. */
  coOwnerMemberId?: string | null;
  financesAssetId?: string | null;
  /** Crédito: o montante contratado. Não é o que falta pagar. */
  contractedAmountCents?: number | null;
  /** Crédito: a data do último pagamento. */
  maturityDate?: string | null;
  /** Crédito com períodos de taxa. Já validado — quem monta isto usa `parseCreditTerms`. */
  creditTerms?: CreditTerms | null;
  /** Imóvel: área, concelho e preço de referência por m². */
  areaM2?: number | null;
  location?: string | null;
  priceRefCents?: number | null;
  priceRefSource?: string | null;
  priceRefGeocod?: string | null;
  purchasePriceCents?: number | null;
  worksCents?: number | null;
  symbol?: string | null;
}

/** Cêntimos para o texto que se escreve num campo: 123456 dá "1234,56". */
function decimal(cents?: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** O inverso do `decimal`: "1234,56" dá 123456. `null` quando não é número. */
function paraCentimos(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function plain(n?: number | null): string {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}

/**
 * Registar ou editar um bem, investimento ou dívida.
 *
 * Os investimentos pedem quantidade e preços por unidade; tudo o resto pede só
 * o valor. O preço atual fica opcional de propósito: sem ele, o investimento
 * conta pelo que custou, em vez de aparecer uma valorização inventada.
 *
 * A taxa de juro aparece dos dois lados, porque é a mesma pergunta vista ao
 * contrário: num depósito diz o que rende, numa dívida diz o que custa. Só as
 * dívidas pedem prestação e prazo, que é o que dá a data do último pagamento.
 */
export function AssetForm({
  asset,
  /**
   * Em que vista o formulário está.
   *
   * Sem isto, abrir "Adicionar" na página das Dívidas dava um formulário de
   * BENS: tipo pré-escolhido como conta bancária, a lista de tipos a oferecer
   * "Imóveis", e uma secção de "Rendimento" a perguntar o que aquele dinheiro
   * rende por ano. Numa dívida é ao contrário — não rende, custa — e quem
   * estava a registar um crédito à habitação tinha de perceber sozinho que
   * devia trocar o tipo primeiro.
   */
  contexto = "ativos",
  /** Membros do ambiente, para se poder dizer quem tem a outra parte. */
  members = [],
  /** Há leitura de contratos configurada? Sem chave não se anuncia. */
  podeLerContrato = false,
  /** Bens que um crédito pode financiar: imóveis, carros, o que se compra a crédito. */
  bensFinanciaveis = [],
}: {
  asset?: AssetFormValues;
  contexto?: "ativos" | "dividas";
  members?: OwnershipMember[];
  bensFinanciaveis?: { id: string; name: string }[];
  podeLerContrato?: boolean;
}) {
  const [state, action] = useFormState(saveAssetAction, empty);
  const emDividas = contexto === "dividas";
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? (emDividas ? "divida" : "conta"));
  const isInvestment = kind === "investimento";
  const isDebt = kind === "divida";
  const isImovel = kind === "imovel";
  const editing = Boolean(asset);
  const uid = asset?.id ?? "novo";

  /**
   * O que veio do contrato, quando alguém o carregou e mandou preencher.
   *
   * Os campos são não controlados (`defaultValue`), que é o que se quer num
   * formulário onde se escreve à mão. Para os preencher de fora troca-se a
   * `chave` e o React remonta-os com os valores novos — em vez de os passar a
   * controlados, que obrigaria a duplicar em estado todos os campos do
   * formulário só por causa de um caminho opcional.
   */
  /** A data de compra é usada pelo bloco do imóvel, para ir buscar o índice. */
  const [dataCompra, setDataCompra] = useState(asset?.purchasedAt ?? "");

  /**
   * O tipo de taxa escolhido no campo de cima.
   *
   * "mista" não é um valor que se grave — a ação só aceita "fixa" e "variavel",
   * e o tipo de um crédito com períodos lê-se dos períodos. Serve para abrir o
   * editor de períodos com as linhas certas quando alguém o escolhe aqui, que é
   * onde vem à procura dele.
   */
  const [tipoTaxa, setTipoTaxa] = useState(asset?.rateKind ?? "");

  const [doContrato, setDoContrato] = useState<{ r: ContratoRevisto; n: number } | null>(null);
  const chave = doContrato ? `contrato-${doContrato.n}` : "base";

  /**
   * Os dois números de uma dívida, controlados — e só estes dois.
   *
   * O resto do formulário é não controlado de propósito (ver a `chave`). Estes
   * são a excepção porque o cálculo a partir do contrato precisa de os ler e de
   * escrever num deles; fazer isso por DOM seria uma gambiarra, e passar o
   * formulário todo a controlado era duplicar em estado vinte campos por causa
   * de dois.
   */
  const [contratado, setContratado] = useState(decimal(asset?.contractedAmountCents));
  const [emDivida, setEmDivida] = useState(decimal(asset?.valueCents));

  // O contrato lido preenche estes dois como preenche os outros.
  useEffect(() => {
    if (!doContrato) return;
    const c = doContrato.r.capitalCents;
    if (c !== null) {
      setContratado(decimal(c));
      // O capital do contrato é o que se pediu, não o que falta. Vai aos dois
      // campos porque num crédito acabado de assinar são o mesmo número — e o
      // botão de calcular corrige o segundo assim que houver meses pagos.
      setEmDivida(decimal(c));
    }
  }, [doContrato]);
  const contrato = doContrato?.r ?? null;

  const form = (
    <form action={action} className={editing ? "space-y-4" : "mt-4 space-y-4"}>
      {asset ? <input type="hidden" name="id" value={asset.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`asset-name-${uid}`}>Nome</label>
          <input
            id={`asset-name-${uid}`}
            name="name"
            required
            maxLength={120}
            defaultValue={asset?.name ?? ""}
            placeholder={isInvestment ? "ex.: VWCE" : isDebt ? "ex.: Crédito à habitação" : "ex.: Depósito a prazo"}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor={`asset-kind-${uid}`}>Tipo</label>
          <select
            id={`asset-kind-${uid}`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
            className="select"
          >
            {(Object.keys(ASSET_KIND_LABELS) as AssetKind[])
              // Na vista das dívidas só há uma coisa a registar. Oferecer
              // "Imóveis" ali é convidar ao engano.
              //
              // O tipo ATUAL fica sempre na lista, mesmo que a vista não o
              // ofereça: a editar uma dívida a partir de outro sítio, tirá-lo
              // das opções deixava o select sem o valor que está selecionado —
              // e gravar sem tocar em nada trocava-lhe o tipo em silêncio.
              .filter((k) => k === kind || (emDividas ? k === "divida" : k !== "divida"))
              .map((k) => (
                <option key={k} value={k}>{ASSET_KIND_LABELS[k]}</option>
              ))}
          </select>
        </div>
      </div>

      {isInvestment ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor={`asset-qty-${uid}`}>Unidades</label>
            <input
              id={`asset-qty-${uid}`}
              name="quantity"
              inputMode="decimal"
              defaultValue={plain(asset?.quantity)}
              placeholder="100"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`asset-cost-${uid}`}>Preço de compra (por unidade)</label>
            <input
              id={`asset-cost-${uid}`}
              name="unitCost"
              inputMode="decimal"
              defaultValue={decimal(asset?.unitCostCents)}
              placeholder="100,00"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`asset-price-${uid}`}>Preço atual (opcional)</label>
            <input
              id={`asset-price-${uid}`}
              name="unitPrice"
              inputMode="decimal"
              defaultValue={decimal(asset?.unitPriceCents)}
              placeholder="125,00"
              className="input"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`asset-value-${uid}`}>
              {isDebt ? "Quanto falta pagar" : isImovel ? "Valor atual (opcional)" : "Valor atual"}
            </label>
            <input
              id={`asset-value-${uid}`}
              name="value"
              inputMode="decimal"
              value={emDivida}
              onChange={(e) => setEmDivida(e.target.value)}
              placeholder="0,00"
              className="input"
            />
            {isDebt ? (
              <p className="mt-1 text-xs text-fg-faint">
                Se não souberes de cabeça, preenche o contrato aqui ao lado e em
                baixo: a app calcula-o.
              </p>
            ) : null}
          </div>
          <div>
            <label className="label" htmlFor={`asset-date-${uid}`}>
              {isDebt ? "Data de início (opcional)" : "Data (opcional)"}
            </label>
            <input
              key={chave}
              id={`asset-date-${uid}`}
              name="purchasedAt"
              type="date"
              defaultValue={contrato?.startDate ?? asset?.purchasedAt ?? ""}
              onChange={(e) => setDataCompra(e.target.value)}
              className="input"
            />
            {isDebt ? (
              <p className="mt-1 text-xs text-fg-faint">
                O dia da escritura. É a partir dele que se contam as prestações
                já pagas.
              </p>
            ) : null}
          </div>

          {isDebt ? (
            <div>
              <label className="label" htmlFor={`asset-contracted-${uid}`}>
                Montante contratado (opcional)
              </label>
              <input
                id={`asset-contracted-${uid}`}
                name="contractedAmount"
                inputMode="decimal"
                value={contratado}
                onChange={(e) => setContratado(e.target.value)}
                placeholder="0,00"
                className="input"
              />
              <p className="mt-1 text-xs text-fg-faint">
                O que pediste emprestado, não o que falta. Com ele, a data de
                início e a taxa, a app calcula o capital em dívida de hoje.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {isInvestment ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`asset-date-inv-${uid}`}>Data de compra (opcional)</label>
            <input
              id={`asset-date-inv-${uid}`}
              name="purchasedAt"
              type="date"
              defaultValue={asset?.purchasedAt ?? ""}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`asset-symbol-${uid}`}>Símbolo na bolsa (opcional)</label>
            <input
              id={`asset-symbol-${uid}`}
              name="symbol"
              maxLength={20}
              defaultValue={asset?.symbol ?? ""}
              placeholder="vwce.de"
              className="input"
            />
            <p className="mt-1 text-xs text-fg-faint">
              Com o símbolo, o preço atual passa a poder ser buscado sozinho. O
              sufixo é a praça: <span className="text-fg-muted">.de</span> para a
              Xetra, <span className="text-fg-muted">.uk</span> para Londres,{" "}
              <span className="text-fg-muted">.us</span> para os Estados Unidos.
            </p>
          </div>
        </div>
      ) : null}

      {/* Taxa: em investimentos o retorno vem do preço, não de uma taxa. E num
          imóvel também não: uma casa não rende juros, valoriza — e isso vem do
          índice da zona, no bloco abaixo. Perguntar aqui era pedir um número
          que ninguém tem. */}
      {isInvestment || isImovel ? null : (
        <div className="rounded-xl border border-hair bg-panel2/30 p-4">
          <p className="label mb-1">{isDebt ? "Plano de pagamento" : "Rendimento"}</p>
          <p className="mb-3 text-xs text-fg-faint">
            {isDebt
              ? "Com a taxa e a prestação, a app diz-te quando acaba e quanto pagas de juros até lá."
              : "Se render juros, diz a taxa e passamos a mostrar o que este dinheiro dá por ano."}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`asset-rate-${uid}`}>
                Taxa anual (%){isDebt ? "" : ", opcional"}
              </label>
              <input
                id={`asset-rate-${uid}`}
                name="interestRatePct"
                inputMode="decimal"
                defaultValue={plain(asset?.interestRatePct)}
                placeholder={isDebt ? "3,4" : "2,5"}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor={`asset-ratekind-${uid}`}>Tipo de taxa</label>
              <select
                id={`asset-ratekind-${uid}`}
                name="rateKind"
                value={tipoTaxa}
                onChange={(e) => setTipoTaxa(e.target.value)}
                className="select"
              >
                <option value="">Não indicado</option>
                {(Object.keys(RATE_KIND_LABELS) as RateKind[]).map((k) => (
                  <option key={k} value={k}>{RATE_KIND_LABELS[k]}</option>
                ))}
                {/*
                  A mista não é um terceiro valor a gravar: é um crédito com
                  DOIS períodos, e o tipo lê-se deles. Escolhê-la aqui abre o
                  editor de períodos já com as linhas típicas — fixa no
                  princípio, variável com indexante a partir de uma data.

                  Estava escondida atrás de um botão lá em baixo, e quem vinha
                  a este campo à procura dela não a encontrava.
                */}
                {isDebt ? <option value="mista">Taxa mista (muda numa data)</option> : null}
              </select>
              {isDebt && tipoTaxa === "mista" ? (
                <p className="mt-1 text-xs text-fg-faint">
                  Diz em baixo a partir de que data passa a variável, e com que
                  indexante e spread.
                </p>
              ) : null}
            </div>
          </div>

          {isDebt ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`asset-payment-${uid}`}>Prestação mensal</label>
                <input
                  id={`asset-payment-${uid}`}
                  name="monthlyPayment"
                  inputMode="decimal"
                  defaultValue={decimal(asset?.monthlyPaymentCents)}
                  placeholder="632,00"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor={`asset-term-${uid}`}>Meses que faltam</label>
                <input
                  id={`asset-term-${uid}`}
                  name="termMonths"
                  inputMode="numeric"
                  defaultValue={plain(asset?.termMonths)}
                  placeholder="360"
                  className="input"
                />
                <p className="mt-1 text-xs text-fg-faint">
                  Basta um dos dois. Se indicares os dois, manda a prestação.
                </p>
              </div>
            </div>
          ) : null}

          {/*
            Que bem é que este crédito financia.

            Sem isto, um imóvel de 300 mil com 200 mil por pagar são duas linhas
            que a app não sabe ligar — e a pergunta "quanto é que a casa é
            minha?" não tem resposta em ecrã nenhum.
          */}
          {isDebt && bensFinanciaveis.length > 0 ? (
            <div>
              <label className="label" htmlFor={`asset-finances-${uid}`}>
                Financia que bem? (opcional)
              </label>
              <select
                id={`asset-finances-${uid}`}
                name="financesAssetId"
                defaultValue={asset?.financesAssetId ?? ""}
                className="select"
              >
                <option value="">Nenhum em particular</option>
                {bensFinanciaveis.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-fg-faint">
                Ligar o crédito ao bem faz aparecer o líquido: o que ele vale
                menos o que falta pagar dele.
              </p>
            </div>
          ) : null}

          {isDebt ? (
            <CreditPeriodsField
              key={`${chave}-${tipoTaxa === "mista" ? "mista" : "normal"}`}
              uid={uid}
              maturityDate={contrato?.maturityDate ?? asset?.maturityDate}
              terms={contrato?.terms ?? asset?.creditTerms}
              abrirComoMista={tipoTaxa === "mista"}
              contratadoCents={paraCentimos(contratado)}
              contractStart={dataCompra}
              aoCalcular={(cents) => setEmDivida(decimal(cents))}
            />
          ) : null}
        </div>
      )}

      {isImovel ? (
        <PropertyPriceField
          uid={uid}
          areaM2={asset?.areaM2}
          location={asset?.location}
          priceRefCents={asset?.priceRefCents}
          priceRefSource={asset?.priceRefSource}
          priceRefGeocod={asset?.priceRefGeocod}
          purchasePriceCents={asset?.purchasePriceCents}
          worksCents={asset?.worksCents}
          purchasedAt={dataCompra}
        />
      ) : null}

      {/* A quota não se oferece nos investimentos: ali a verdade são os
          movimentos, e uma percentagem por cima de uma posição derivada dos
          movimentos é uma segunda fonte de verdade a discordar da primeira. */}
      {isInvestment ? null : (
        <OwnershipField
          uid={uid}
          members={members}
          ownershipPct={asset?.ownershipPct}
          coOwnerMemberId={asset?.coOwnerMemberId}
          noun={isDebt ? "crédito" : kind === "imovel" ? "imóvel" : "bem"}
        />
      )}

      <div>
        <label className="label" htmlFor={`asset-notes-${uid}`}>Nota (opcional)</label>
        <input
          id={`asset-notes-${uid}`}
          name="notes"
          maxLength={300}
          defaultValue={asset?.notes ?? ""}
          className="input"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-credit">{state.message}</p> : null}

      <SaveButton editing={editing} />
    </form>
  );

  /**
   * Fora do `<form>` de propósito: são dois formulários e um não pode estar
   * dentro do outro. Só aparece nas dívidas, que é onde há contrato para ler.
   */
  const contratoBloco =
    isDebt && podeLerContrato ? (
      <CreditContractImport onUse={(r) => setDoContrato((p) => ({ r, n: (p?.n ?? 0) + 1 }))} />
    ) : null;

  if (editing) {
    return (
      <>
        {contratoBloco}
        {form}
      </>
    );
  }

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-medium text-fg">
        {emDividas ? "Adicionar dívida" : "Adicionar ao património"}
      </summary>
      {contratoBloco ? <div className="mt-4">{contratoBloco}</div> : null}
      {form}
    </details>
  );
}

function SaveButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "A gravar…" : editing ? "Guardar" : "Adicionar"}
    </button>
  );
}
