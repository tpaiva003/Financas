"use client";

/**
 * O funil de avaliação: as empresas estudadas, por etapa.
 *
 * **Um estudo é um registo datado.** Cada cartão mostra o dia em que foi feito,
 * porque os pressupostos de um DCF envelhecem depressa: uma apresentação de
 * resultados chega para invalidar o fluxo de caixa que serviu de base a tudo. Um
 * valor sem data lê-se como o valor de hoje, e é a partir dele que alguém compra.
 *
 * **Nem toda a linha tem estudo.** Uma empresa apontada e ainda por ler mostra o
 * nome, a data e as notas, e um botão que abre a avaliação já preenchida com o
 * que se sabe dela. É o passo mais barato do processo, e era o único que a app
 * não suportava.
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  ETAPAS,
  ETAPA_EXPLICACAO,
  ETAPA_LABEL,
  contarPorEtapa,
  formatCents,
  monogramFor,
  quantoFaltaDescer,
  type AvaliacaoNoFunil,
} from "@/lib/domain";
import {
  apagarAvaliacaoAction,
  editarAvaliacaoAction,
  mudarEtapaAvaliacaoAction,
  type ActionState,
} from "@/app/(app)/actions";
import { AvaliacaoAnexos, type AnexoAvaliacaoView } from "./AvaliacaoAnexos";

const vazio: ActionState = {};

export function FunilAvaliacoes({
  funil,
  anexosPorAvaliacao,
  podeResumir,
}: {
  funil: AvaliacaoNoFunil[];
  anexosPorAvaliacao: Record<string, AnexoAvaliacaoView[]>;
  podeResumir: boolean;
}) {
  if (funil.length === 0) {
    return (
      <p className="card p-5 text-sm leading-relaxed text-fg-muted">
        Ainda não há nada no funil. Aponta uma empresa que te tenha chamado a
        atenção — não precisas de saber nada dela ainda — ou faz uma avaliação e
        guarda-a. É isto que transforma um número numa decisão que se pode rever
        daqui a seis meses.
      </p>
    );
  }

  const contagem = contarPorEtapa(funil);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {ETAPAS.map((e) => (
          <span
            key={e}
            className="rounded-full border border-hair bg-panel2/40 px-3 py-1 text-xs text-fg-muted"
          >
            {ETAPA_LABEL[e]} <span className="font-mono tnum text-fg">{contagem[e]}</span>
          </span>
        ))}
      </div>

      {ETAPAS.filter((e) => contagem[e] > 0).map((etapa) => (
        <section key={etapa} className="space-y-3">
          <div>
            <p className="eyebrow">{ETAPA_LABEL[etapa]}</p>
            <p className="mt-1 text-xs text-fg-faint">{ETAPA_EXPLICACAO[etapa]}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {funil
              .filter((a) => a.etapa === etapa)
              .map((a) => (
                <Cartao key={a.id} a={a} anexos={anexosPorAvaliacao[a.id] ?? []} podeResumir={podeResumir} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * O endereço da calculadora já preenchida com o que se sabe da empresa.
 *
 * O `id` vai junto para o estudo ser gravado **nesta linha** em vez de criar um
 * segundo cartão da mesma empresa — que era a app a duplicar o que a pessoa
 * acabou de ligar. E é por ele que o servidor vai buscar os pressupostos do
 * último estudo: reavaliar é comparar com o que se assumiu da última vez, não
 * reescrever onze campos de memória.
 */
function linkParaAvaliar(a: AvaliacaoNoFunil): string {
  // Só o id: o nome, o símbolo e os pressupostos são lidos no servidor a partir
  // dele. Ver o comentário em `VindoDoFunil`.
  return `/patrimonio/dcf?id=${encodeURIComponent(a.id)}`;
}

function Cartao({
  a,
  anexos,
  podeResumir,
}: {
  a: AvaliacaoNoFunil;
  anexos: AnexoAvaliacaoView[];
  podeResumir: boolean;
}) {
  const falta = quantoFaltaDescer(a);
  const dia = new Date(`${a.data}T00:00:00Z`).toLocaleDateString("pt-PT");
  const [aberto, setAberto] = useState(false);

  return (
    <article className={`card space-y-3 p-4 ${a.substituida ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Emblema id={a.id} nome={a.nome} simbolo={a.simbolo} temLogo={Boolean(a.logoDomain)} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{a.nome}</p>
            <p className="font-mono text-xs uppercase text-fg-faint">
              {a.simbolo ?? "sem símbolo"}
            </p>
          </div>
        </div>

        {a.temEstudo && a.precoPonderadoCents !== null ? (
          <p className="shrink-0 text-right">
            <span className="font-mono tnum text-lg text-fg">
              {formatCents(a.precoPonderadoCents)}
            </span>
            <span className="block text-[11px] text-fg-faint">preço a que compras</span>
          </p>
        ) : null}
      </div>

      {a.temEstudo ? (
        a.precoNaAlturaCents !== null ? (
          <p className="text-xs leading-snug text-fg-muted">
            Estava a <span className="font-mono tnum">{formatCents(a.precoNaAlturaCents)}</span>{" "}
            quando o estudaste.
            {falta !== null ? (
              <>
                {" "}
                Tem de descer{" "}
                <strong className="font-medium text-fg">{String(falta).replace(".", ",")}%</strong>{" "}
                para lá chegar.
              </>
            ) : (
              <> Já estava dentro do teu preço nesse dia.</>
            )}
          </p>
        ) : (
          <p className="text-xs text-fg-faint">Estudo sem preço de mercado registado.</p>
        )
      ) : (
        <p className="text-xs leading-snug text-fg-muted">
          Apontada a {dia}, ainda sem estudo.{" "}
          <a href={linkParaAvaliar(a)} className="text-fg underline underline-offset-2">
            Avaliar agora
          </a>{" "}
          — abre a calculadora com o nome e o símbolo já lá.
        </p>
      )}

      {a.substituida ? (
        <p className="text-xs text-fg-faint">Substituído por um estudo mais recente desta empresa.</p>
      ) : a.envelhecida ? (
        <p className="text-xs text-fg-faint">
          O estudo tem {Math.round(a.idadeDias / 30)} meses. Já passaram duas
          apresentações de resultados — vale a pena refazer antes de decidir com ele.
        </p>
      ) : null}

      {a.notas ? (
        <p className="whitespace-pre-line border-t border-hair2 pt-2 text-xs leading-relaxed text-fg-muted">
          {a.notas}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-hair2 pt-3">
        <form action={mudarEtapaAvaliacaoAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={a.id} />
          <label className="sr-only" htmlFor={`etapa-${a.id}`}>
            Mudar a etapa de {a.nome}
          </label>
          <select
            id={`etapa-${a.id}`}
            name="stage"
            defaultValue={a.etapa}
            className="input h-8 w-auto py-0 text-xs"
          >
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {ETAPA_LABEL[e]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary text-xs">
            Mudar
          </button>
        </form>

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="btn-ghost px-2 text-xs"
          aria-expanded={aberto}
        >
          {aberto ? "Fechar" : `Notas e documentos${anexos.length > 0 ? ` (${anexos.length})` : ""}`}
        </button>

        {a.temEstudo ? (
          <a href={linkParaAvaliar(a)} className="btn-ghost px-2 text-xs">
            Reavaliar
          </a>
        ) : null}

        <form action={apagarAvaliacaoAction} className="ml-auto">
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="text-xs text-fg-faint hover:text-debt">
            Apagar
          </button>
        </form>
      </div>

      {aberto ? (
        <div className="space-y-3">
          <Notas a={a} />
          <AvaliacaoAnexos
            avaliacaoId={a.id}
            anexos={anexos}
            resumo={a.resumoIa ?? null}
            resumoEm={a.resumoIaEm ?? null}
            podeResumir={podeResumir}
          />
        </div>
      ) : null}
    </article>
  );
}

function BotaoGuardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending}>
      {pending ? "A guardar…" : "Guardar"}
    </button>
  );
}

function Notas({ a }: { a: AvaliacaoNoFunil }) {
  const [state, editar] = useFormState(editarAvaliacaoAction, vazio);

  return (
    <form action={editar} className="space-y-2 border-t border-hair2 pt-3">
      <input type="hidden" name="id" value={a.id} />

      {/* O campo do domínio da marca saiu: o logo descobre-se sozinho, na
          criação e no «Pôr logos» lá de cima. */}
      <div>
        <label className="label" htmlFor={`sim-${a.id}`}>
          Símbolo
        </label>
        <input
          id={`sim-${a.id}`}
          name="symbol"
          defaultValue={a.simbolo ?? ""}
          placeholder="googl.us"
          className="input h-9 font-mono text-sm"
        />
      </div>

      <div>
        <label className="label" htmlFor={`notas-${a.id}`}>
          Notas
        </label>
        <textarea
          id={`notas-${a.id}`}
          name="notes"
          defaultValue={a.notas ?? ""}
          rows={4}
          placeholder="O que percebeste, o que falta confirmar, e o que rever na próxima apresentação de resultados."
          className="input min-h-[5rem] resize-y text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <BotaoGuardar />
        {state.error ? (
          <span role="alert" className="text-xs text-debt">
            {state.error}
          </span>
        ) : state.ok ? (
          <span className="text-xs text-credit">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}

/**
 * O logo, com as iniciais por baixo.
 *
 * O logo vem da rota desta app e nunca do browser: um serviço de ícones que
 * recebesse o pedido ficava com a lista das empresas que alguém anda a estudar.
 * Se não houver, ficam as iniciais — que é sempre melhor do que um buraco.
 */
function Emblema({
  id,
  nome,
  simbolo,
  temLogo,
}: {
  id: string;
  nome: string;
  simbolo: string | null;
  temLogo: boolean;
}) {
  const { letters, hue } = monogramFor(simbolo, nome);
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-hair text-[11px] font-medium"
      style={
        temLogo
          ? undefined
          : { backgroundColor: `hsl(${hue} 45% 22%)`, color: `hsl(${hue} 70% 82%)` }
      }
    >
      {temLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/logo/avaliacao/${id}`}
          alt=""
          width={36}
          height={36}
          className="h-full w-full object-contain p-1"
          loading="lazy"
        />
      ) : (
        letters
      )}
    </span>
  );
}
