import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin, householdUsers } from "@/lib/users";
import { getRepository } from "@/lib/data";
import type { SpaceSummary } from "@/lib/data";
import type { Crescimento as CrescimentoData } from "@/lib/domain";
import { InviteUserForm } from "@/components/InviteUserForm";
import { AccountRow } from "@/components/AccountRow";
import { QuoteDiagnostic } from "@/components/QuoteDiagnostic";
import { PlataformaSeccao } from "@/components/PlataformaSeccao";
import { PlataformaGrafico } from "@/components/PlataformaGrafico";

export const metadata = { title: "Plataforma · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Consola do dono da plataforma.
 *
 * Mostra a saúde do serviço, quantas contas, quantos ambientes, onde há
 * movimento, e NÃO mostra o conteúdo de ninguém: nem descrições, nem valores,
 * nem saldos. É de propósito. Gerir a plataforma não é o mesmo que ler as
 * contas de quem a usa, e a app não deve tornar a segunda coisa fácil só
 * porque a primeira é legítima.
 */
export default async function PlataformaPage() {
  const user = await requireUser();
  if (!isAdmin(user.id)) redirect("/dashboard");

  // Se falhar por inteiro, dizemos porquê. É um ecrã só do admin: esconder o
  // motivo só torna o problema mais difícil de resolver.
  let stats;
  let failure: string | null = null;
  try {
    stats = await getRepository().getPlatformStats();
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  if (!stats) {
    return (
      <div className="card space-y-2 p-8 text-center">
        <p className="text-sm text-fg">Não consegui ler os números da plataforma.</p>
        {failure ? <p className="font-mono text-xs text-fg-faint">{failure}</p> : null}
        <p className="text-sm text-fg-muted">
          Se for passageiro, recarregar resolve. O resto da app não é afetado.
        </p>
      </div>
    );
  }

  const accounts = await getRepository()
    .listAppUsers()
    .catch(() => []);
  // A fila de espera do registo. Quem espera primeiro aparece primeiro: a
  // ordem de chegada é a promessa que a fila faz.
  const fila = await getRepository()
    .listWaitlist()
    .catch(() => []);
  const porConvidar = fila.filter((w) => !w.invitedAt);
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  /**
   * Tudo o que entrou na app: despesas mais o que cada funcionalidade criou.
   *
   * `null` quando não se conseguiu ler as despesas — somar zero a essa parte
   * daria um total mais pequeno do que o real com ar de facto, que é pior do
   * que um traço.
   */
  const registosTotais =
    stats.expenseCount === null
      ? null
      : stats.expenseCount + stats.features.reduce((t, f) => t + f.records, 0);

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Gestão</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Plataforma</h1>
        <p className="mt-1 text-sm text-fg-muted">
          A saúde do serviço num relance. Cada ambiente pertence a quem lá está,
          aqui só se veem contagens e datas, nunca despesas, valores ou saldos.
        </p>
      </div>

      {/*
        Os números que se procuram sempre ficam fora do acordeão. Uma consola em
        que o primeiro olhar custa um clique não serve para o primeiro olhar.
      */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* As contas base (allow-list) não vivem na tabela de contas: somam-se. */}
        <Stat
          label="Contas"
          value={stats.accountCount === null ? null : stats.accountCount + householdUsers().length}
        />
        <Stat label="Ambientes" value={stats.spaceCount} />
        <Stat label="Ativos (30 dias)" value={stats.activeSpaces} />
        <Stat label="Despesas" value={stats.expenseCount} />
        {/*
          Tudo o que entrou na app, e não só as despesas. A consola dizia
          "191 despesas" numa app que já tem património, movimentos, rendimentos
          e metas — o número mais visível era o de uma parte só, e lia-se como o
          tamanho do todo.
        */}
        <Stat label="Registos ao todo" value={registosTotais} />
        <Stat
          label="Registos por ambiente"
          value={
            stats.spaceCount === null || stats.spaceCount === 0 || registosTotais === null
              ? null
              : Math.round(registosTotais / stats.spaceCount)
          }
        />
      </div>

      {/*
        O que não foi possível ler.

        **Fica FORA do acordeão de propósito.** Um aviso dentro de uma secção
        fechada não é um aviso: quem está a olhar para os números de cima não
        tem como saber que um deles veio a menos. Foi por pouco que isto se
        perdeu na reorganização — o bloco estava entre duas secções que foram
        substituídas de uma vez.
      */}
      {stats.warnings.length > 0 ? (
        <div
          role="status"
          className="rounded-xl border border-hair bg-panel2/40 p-4 text-sm text-fg-muted"
        >
          <p className="font-medium text-fg">Alguns números não vieram desta vez.</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-fg-faint">
            {stats.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Costuma ser passageiro, recarrega a página. O que está em cima
            continua certo.
          </p>
        </div>
      ) : null}

      {/*
        Daqui para baixo é tudo acordeão, e a razão não é estética.

        A consola tinha oito blocos empilhados e crescia a cada sessão: para
        chegar aos ambientes passava-se por cima dos números, das contas, do que
        é usado e dos bancos aprendidos. Numa consola procura-se quase sempre
        UMA coisa, e percorrer as outras sete de cada vez era o preço de as ter
        na mesma página.

        A primeira fica aberta: um acordeão todo fechado esconde que há alguma
        coisa lá dentro. E cada cabeçalho traz o número que se procuraria lá
        dentro, senão o acordeão obriga a abrir todos para encontrar um — que é
        exactamente o problema que ele veio resolver.
      */}
      {stats.crescimento ? (
        <PlataformaSeccao
          titulo="Crescimento e uso"
          nota="Se isto está a aumentar ou parado. Um total sozinho não responde a isso."
          resumo={`${stats.crescimento.janelas[0]?.ambientesAtivos ?? 0} ativos em ${stats.crescimento.janelas[0]?.dias ?? 30} dias`}
          aberta
        >
          <Crescimento c={stats.crescimento} />
        </PlataformaSeccao>
      ) : null}

      <PlataformaSeccao
        titulo="Contas e acessos"
        nota="Quem entra, e dar entrada a mais alguém."
        resumo={`${accounts.length} ${accounts.length === 1 ? "convidada" : "convidadas"}`}
      >
        <div className="space-y-6">
          <div>
            <h3 className="label">Dar acesso a alguém</h3>
            <p className="mb-3 text-sm text-fg-muted">
              Cria uma conta independente com ambiente próprio. A pessoa entra
              com o email indicado e define a palavra-chave na primeira entrada.
            </p>
            <InviteUserForm />
          </div>

          <div>
            <h3 className="eyebrow mb-3">Contas com acesso</h3>
            {accounts.length === 0 ? (
              <p className="rounded-xl border border-hair2 p-6 text-center text-sm text-fg-muted">
                Ainda não convidaste ninguém.
              </p>
            ) : (
              <ul className="divide-y divide-hair2 rounded-xl border border-hair2">
                {accounts.map((a) => (
                  <AccountRow key={a.id} account={a} />
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-fg-faint">
              As contas base (as tuas e da Clara) vêm das variáveis de ambiente e
              não se removem aqui.
            </p>
          </div>

          <div>
            <h3 className="eyebrow mb-3">
              Fila de espera{porConvidar.length > 0 ? ` · ${porConvidar.length} à espera` : ""}
            </h3>
            {fila.length === 0 ? (
              <p className="rounded-xl border border-hair2 p-6 text-center text-sm text-fg-muted">
                Ninguém na fila. As entradas chegam da landing e da porta
                fechada do registo.
              </p>
            ) : (
              <ul className="divide-y divide-hair2 rounded-xl border border-hair2">
                {fila.map((w) => (
                  <li key={w.email} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg">{w.email}</p>
                      <p className="text-xs text-fg-faint">
                        {w.name ? `${w.name} · ` : ""}
                        {w.source ?? "?"} · {w.createdAt.slice(0, 10)}
                      </p>
                    </div>
                    {w.invitedAt ? (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-credit">
                        convidada {w.invitedAt.slice(0, 10)}
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-fg-faint">
                        à espera
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-fg-faint">
              Para convidar alguém da fila, usa o «Dar acesso a alguém» aqui em
              cima com o mesmo email — a fila marca sozinha que o convite saiu.
            </p>
          </div>
        </div>
      </PlataformaSeccao>

      <PlataformaSeccao
        titulo="Ambientes"
        nota="Cada um com quantos membros tem, quantas despesas, e quando foi a última vez que alguém lá mexeu."
        resumo={`${stats.spaces.length}`}
      >
        {stats.spaces.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">Ainda não há ambientes.</p>
        ) : (
          <ul className="divide-y divide-hair2 rounded-xl border border-hair2">
            {stats.spaces.map((s) => (
              <SpaceRow key={s.id} space={s} cutoff={cutoff} />
            ))}
          </ul>
        )}
      </PlataformaSeccao>

      {stats.features.length > 0 ? (
        <PlataformaSeccao
          titulo="O que é usado"
          nota="Uma funcionalidade que ninguém usa é uma funcionalidade a manter por nada."
          resumo={`${stats.features.filter((f) => f.spaces > 0).length} de ${stats.features.length}`}
        >
          <Funcionalidades features={stats.features} ambientes={stats.spaces.length} />
        </PlataformaSeccao>
      ) : null}

      {stats.templates.length > 0 ? (
        <PlataformaSeccao
          titulo="Bancos aprendidos"
          nota="Formatos que alguém ensinou à app. Cada um serve toda a gente daí em diante."
          resumo={`${stats.templates.length}`}
        >
          <ul className="divide-y divide-hair2 rounded-xl border border-hair2">
            {stats.templates.map((t) => (
              <li key={t.label} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="truncate text-sm text-fg">{t.label}</span>
                <span className="shrink-0 font-mono text-xs tnum text-fg-faint">
                  {t.uses} {t.uses === 1 ? "utilização" : "utilizações"}
                </span>
              </li>
            ))}
          </ul>
        </PlataformaSeccao>
      ) : null}

      <PlataformaSeccao
        titulo="Testes e diagnóstico"
        nota="Perguntar a uma fonte externa se está a responder, sem esperar que alguém se queixe."
      >
        <QuoteDiagnostic />
      </PlataformaSeccao>

      <Link href="/dashboard" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Voltar
      </Link>
    </div>
  );
}

/**
 * Que fatia dos ambientes usa cada parte da app.
 *
 * **A barra é sobre ambientes, não sobre registos.** Uma funcionalidade com dez
 * mil linhas num único ambiente e outra com dez linhas em cinco ambientes: a
 * segunda é a que está a pegar. Contar registos punha a primeira em primeiro
 * lugar e mandava manter o que só uma pessoa usa.
 *
 * O número de registos vai ao lado, porque também diz alguma coisa — mas não
 * manda na ordem nem no desenho.
 */
function Funcionalidades({
  features,
  ambientes,
}: {
  features: { id: string; label: string; spaces: number; records: number }[];
  ambientes: number;
}) {
  const base = Math.max(1, ambientes);
  const ordenadas = [...features].sort((a, b) => b.spaces - a.spaces || b.records - a.records);

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-faint">
        Em quantos dos {ambientes} {ambientes === 1 ? "ambiente" : "ambientes"} cada
        parte da app é usada.
      </p>
      <ul className="space-y-2.5">
        {ordenadas.map((f) => {
          const pct = Math.round((f.spaces / base) * 100);
          return (
            <li key={f.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className={f.spaces === 0 ? "text-fg-faint" : "text-fg"}>{f.label}</span>
                <span className="shrink-0 font-mono text-[11px] tnum text-fg-faint">
                  {f.spaces === 0 ? (
                    "ninguém"
                  ) : (
                    <>
                      {f.spaces}/{ambientes} · {pct}% · {f.records}{" "}
                      {f.records === 1 ? "registo" : "registos"}
                    </>
                  )}
                </span>
              </div>
              {/* A barra é o `<div>` de fora com largura em percentagem — nada
                  de alturas percentuais dentro de itens encolhidos, que foi o
                  que deixou o gráfico mensal a zero pixéis. */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
                <div
                  className={`h-full rounded-full ${f.spaces === 0 ? "bg-hair" : "bg-credit"}`}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Nomes curtos para as etiquetas de cada ambiente. */
const FEATURE_LABELS: Record<string, string> = {
  patrimonio: "património",
  investimentos: "investimentos",
  rendimentos: "rendimentos",
  recorrentes: "recorrentes",
  importacoes: "importações",
  metas: "metas",
};

/**
 * Se isto está a aumentar, ou parado.
 *
 * **O total sozinho não responde a isso.** Quarenta ambientes é o mesmo número
 * quer tenham chegado todos no mês passado quer nenhum apareça desde o Natal, e
 * são situações opostas. Aqui mostra-se o que entrou, quando, e quantos
 * voltaram.
 *
 * **Contagens à frente, percentagens só quando a base as aguenta.** "100% de
 * retenção" com um ambiente elegível é verdade e não quer dizer nada; "2 de 3"
 * ninguém confunde com uma tendência.
 */
function Crescimento({ c }: { c: CrescimentoData }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="eyebrow">Está a crescer?</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Um registo conta no dia em que <strong className="font-medium text-fg">entrou</strong> na
          app, não na data da compra que representa. Quem importa dois anos de
          extrato numa noite fez uma noite de uso, não dois anos.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {c.janelas.map((j) => (
          <div key={j.dias} className="card p-4">
            <p className="eyebrow">Últimos {j.dias} dias</p>
            <p className="mt-1.5 font-display text-3xl font-semibold tracking-tight tnum">
              {j.ambientesAtivos}
            </p>
            <p className="text-xs text-fg-muted">
              {j.ambientesAtivos === 1 ? "ambiente ativo" : "ambientes ativos"}
            </p>
            <p className="mt-2 font-mono text-[11px] tnum text-fg-faint">
              +{j.contasNovas} {j.contasNovas === 1 ? "conta" : "contas"} · +{j.ambientesNovos}{" "}
              {j.ambientesNovos === 1 ? "ambiente" : "ambientes"} · {j.registosNovos}{" "}
              {j.registosNovos === 1 ? "registo" : "registos"}
            </p>
          </div>
        ))}
      </div>

      {/* A série mês a mês, com os meses vazios incluídos: um buraco é
          informação, e saltá-lo desenha uma linha contínua por cima de dois
          meses parados. O desenho vive num componente à parte porque agora
          escolhe a métrica — e porque as barras já estiveram a zero pixéis com
          os dados certos por baixo. Ver `PlataformaGrafico`. */}
      <div className="card p-5">
        <p className="eyebrow mb-3">Mês a mês</p>
        <PlataformaGrafico meses={c.meses} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Proporcao
          label="Voltaram"
          p={c.retencao}
          nota="Dos ambientes com mais de 30 dias, quantos registaram alguma coisa nos últimos 30."
        />
        <Proporcao
          label="Arrancaram"
          p={c.ativacao}
          nota="Dos ambientes com mais de uma semana, quantos usaram a app nos primeiros sete dias."
        />
        <div className="card p-4">
          <p className="eyebrow">Nunca registaram nada</p>
          <p className="mt-1.5 font-display text-3xl font-semibold tracking-tight tnum">
            {c.semQualquerRegisto}
          </p>
          <p className="mt-1 text-xs leading-snug text-fg-faint">
            Ambientes criados que nunca chegaram a ter uma linha. Uma conta que
            não arranca é um problema de primeiro uso, não de funcionalidade.
          </p>
        </div>
      </div>
    </section>
  );
}

function Proporcao({
  label,
  p,
  nota,
}: {
  label: string;
  p: { de: number; quantos: number; pct: number | null };
  nota: string;
}) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 font-display text-3xl font-semibold tracking-tight tnum">
        {p.de === 0 ? (
          <span className="text-fg-faint">—</span>
        ) : p.pct !== null ? (
          `${p.pct}%`
        ) : (
          // Base pequena: o número em bruto, que ninguém confunde com uma
          // tendência. Ver o cabeçalho do domínio.
          `${p.quantos} de ${p.de}`
        )}
      </p>
      <p className="mt-1 text-xs leading-snug text-fg-faint">
        {p.de === 0 ? "Ainda não há ambientes com idade para esta pergunta. " : ""}
        {nota}
        {p.pct !== null ? ` (${p.quantos} de ${p.de}.)` : ""}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p
        className={`mt-1.5 font-display text-3xl font-semibold tracking-tight tnum ${
          value === null ? "text-fg-faint" : ""
        }`}
        title={value === null ? "Não foi possível ler este número" : undefined}
      >
        {value === null ? "—" : value}
      </p>
    </div>
  );
}

function SpaceRow({ space, cutoff }: { space: SpaceSummary; cutoff: string }) {
  const active = space.lastActivity !== null && space.lastActivity >= cutoff;
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-PT") : "sem movimento";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
          {space.name}
          {active ? <span className="chip border-credit/30 text-credit">ativo</span> : null}
        </p>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
          criado a {fmt(space.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-4 font-mono text-xs tnum text-fg-muted">
        <span title="Participantes">{space.memberCount} 👤</span>
        <span title="Despesas registadas">{space.expenseCount} desp.</span>
        <span title="Data da despesa mais recente" className="text-fg-faint">
          {fmt(space.lastActivity)}
        </span>
      </div>

      {/* Que partes da app este ambiente usa. Só os nomes, nunca o conteúdo. */}
      {space.features.length > 0 ? (
        <div className="flex w-full flex-wrap gap-1.5">
          {space.features.map((f) => (
            <span key={f} className="chip border-hair text-fg-faint">
              {FEATURE_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}
