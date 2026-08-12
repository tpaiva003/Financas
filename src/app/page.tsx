import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { BrandMark } from "@/components/BrandMark";

export const metadata = {
  title: "Rachar · Contas à Moda do Porto",
  description:
    "Rachar divide as contas da casa e não pára aí: importa os extratos, mostra para onde vai o dinheiro, soma o que tens menos o que deves e diz-te em que ano trabalhar passa a ser opcional. Privado, sem anúncios, nascido no Porto.",
};

export default function LandingPage() {
  return (
    <div className="relative">
      <SiteHeader />
      <Hero />
      <Problem />
      <Capabilities />
      <Investments />
      <Advantages />
      <HowItWorks />
      <Details />
      <Roadmap />
      <Contact />
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-hair bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2">
          <BrandMark />
          <span className="font-display text-[15px] font-semibold tracking-tight">Rachar</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint sm:inline">
            Contas à moda do Porto
          </span>
        </span>
        <div className="flex items-center gap-2">
          <a href="#o-que-faz" className="btn-ghost hidden sm:inline-flex">O que faz</a>
          <a href="#contacto" className="btn-ghost hidden sm:inline-flex">Falar connosco</a>
          <Link href="/login" className="btn-secondary">Entrar</Link>
        </div>
      </div>
    </header>
  );
}

/** Uma palavra por área da app. Serve de índice do que vem a seguir. */
const PILLAR_CHIPS = [
  "Dividir",
  "Importar",
  "Rendimentos",
  "Análise",
  "Património",
  "Investimentos",
  "FIRE",
];

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 sm:pt-28">
      <p className="eyebrow animate-fade-in">Contas à moda do Porto</p>
      <h1 className="mt-5 max-w-3xl animate-fade-up font-display text-5xl font-semibold leading-[0.98] tracking-tightest text-balance sm:text-7xl">
        As contas da casa,
        <br />
        <span className="text-fg-muted">e o que vem a seguir.</span>
      </h1>
      <p
        className="mt-6 max-w-2xl animate-fade-up text-lg leading-relaxed text-fg-muted"
        style={{ animationDelay: "60ms" }}
      >
        Começa por dividir uma despesa em segundos. Depois carrega o extrato e
        deixa de escrever à mão, vê para onde vai o dinheiro ao fim do mês, soma
        o que tens menos o que deves e descobre em que ano trabalhar passa a ser
        opcional. Tudo na mesma app. Direta e honesta, à moda do Porto.
      </p>
      <div className="mt-9 flex animate-fade-up flex-wrap gap-3" style={{ animationDelay: "120ms" }}>
        <a href="#contacto" className="btn-primary px-6 py-3 text-base">Quero saber mais</a>
        <Link href="/login" className="btn-secondary px-6 py-3 text-base">Já tenho acesso</Link>
      </div>

      <ul
        className="mt-10 flex animate-fade-up flex-wrap gap-2"
        style={{ animationDelay: "160ms" }}
        aria-label="Áreas da app"
      >
        {PILLAR_CHIPS.map((c) => (
          <li key={c} className="chip">{c}</li>
        ))}
      </ul>

      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-faint">
        Nascido no Porto · Privado · Sem anúncios
      </p>
    </section>
  );
}

function Problem() {
  return (
    <section className="border-y border-hair bg-panel/40">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="eyebrow">O problema</p>
        <p className="mt-5 max-w-3xl font-display text-2xl font-medium leading-snug tracking-tight text-balance sm:text-3xl">
          &ldquo;Quem pagou o supermercado? Quanto é que gastámos este mês?
          E, no fim de tudo, estamos melhor ou pior do que no ano passado?&rdquo;
        </p>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          A app de dividir contas responde à primeira pergunta e não sabe nada
          das outras duas. A folha de cálculo do património sabe o total e não
          sabe quem pagou o jantar. Ficam duas ferramentas, escritas à mão, que
          nunca batem certo uma com a outra.
        </p>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          O dinheiro do dia a dia e o dinheiro a longo prazo são o mesmo
          dinheiro. Aqui vivem no mesmo sítio.
        </p>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    k: "Dividir",
    t: "Contas partilhadas sem discussões",
    d: "Meias, percentagem, valor fixo ou quotas — por despesa. Quem pagou é independente de como se divide. Tocas no saldo e vês exatamente as despesas que o compõem, até ao cêntimo. Acertas e fica a zero, com histórico.",
  },
  {
    k: "Importar",
    t: "Carregas o extrato, ela escreve por ti",
    d: "Excel e CSV do banco, PDF do cartão de crédito e ficheiros de corretora. As colunas são reconhecidas sozinhas — com ajuda de um modelo quando o formato é novo — e cada transação entra uma só vez, mesmo que carregues o mesmo ficheiro duas vezes.",
  },
  {
    k: "Rendimentos",
    t: "Metade da história que faltava",
    d: "Não é só para onde o dinheiro vai: é também de onde vem. Salário e trabalhos paralelos de um lado, juros, dividendos e rendas do outro. Daí sai a taxa de poupança e a percentagem das despesas já paga por rendimento passivo.",
  },
  {
    k: "Análise",
    t: "O mês comparado com o que é normal",
    d: "Por categoria, por comerciante e por mês. As dezenas de formas de escrever “Continente” contam como uma só. E a meio de agosto compara-se com os primeiros dias de agosto do ano passado, não com o mês inteiro — senão parece sempre que se gastou pouco.",
  },
  {
    k: "Património",
    t: "O que tens menos o que deves",
    d: "Contas, depósitos, imóveis, investimentos e dívidas na mesma conta. Ao crédito à habitação juntas a prestação e a taxa e ficas a saber a data do último pagamento e quanto pagas de juros até lá.",
  },
  {
    k: "FIRE",
    t: "O ano em que trabalhar é opcional",
    d: "O gasto anual a dividir pela taxa de levantamento segura dá o número. Com o que poupas por mês e o retorno esperado, sai quantos anos faltam. Em termos reais, já descontada a inflação, e com as regras todas ajustáveis — a dos 4% é um ponto de partida, não uma lei da física.",
  },
];

function Capabilities() {
  return (
    <section id="o-que-faz" className="mx-auto max-w-5xl px-6 py-20">
      <p className="eyebrow">O que faz</p>
      <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Começa por dividir a conta. Acaba por gerir o património.
      </h2>
      <p className="mt-4 max-w-xl text-[15px] text-fg-muted">
        Seis áreas, uma app. Cada uma resolve-se sozinha, e todas usam os mesmos
        dados — o que registas no dia a dia é o que alimenta o resto.
      </p>

      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hair bg-hair sm:grid-cols-2">
        {CAPABILITIES.map((c) => (
          <div key={c.k} className="bg-bg p-6 sm:p-7">
            <p className="eyebrow">{c.k}</p>
            <p className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight">
              {c.t}
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-fg-muted">{c.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Investments() {
  return (
    <section className="border-y border-hair bg-panel/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <p className="eyebrow">Investimentos</p>
        <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          A parte que a folha de cálculo nunca fez bem.
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          Carregas o ficheiro da corretora e a posição deixa de ser escrita à
          mão: passa a ser calculada a partir das compras e vendas, com as datas
          e o custo médio ponderado. As cotações vêm sozinhas, e o que está em
          dólares é convertido ao câmbio do dia da operação — nunca se grava um
          preço sem taxa de câmbio.
        </p>

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hair bg-hair sm:grid-cols-3">
          <div className="bg-bg p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">
              Pergunta 1
            </p>
            <p className="mt-3 font-display text-lg font-semibold tracking-tight">
              Quanto rendeu o meu dinheiro?
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-fg-muted">
              Depende de quando o meteste. Responde-se com a taxa interna de
              rentabilidade, que conta as datas de cada reforço.
            </p>
          </div>
          <div className="bg-bg p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">
              Pergunta 2
            </p>
            <p className="mt-3 font-display text-lg font-semibold tracking-tight">
              O investimento foi bom?
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-fg-muted">
              Aqui os reforços são ruído. Responde-se com a rentabilidade
              ponderada no tempo, que anula o efeito de quando entrou dinheiro.
            </p>
          </div>
          <div className="bg-bg p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">
              Comparação
            </p>
            <p className="mt-3 font-display text-lg font-semibold tracking-tight">
              E se tivesse comprado o índice?
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-fg-muted">
              As mesmas entradas, nas mesmas datas, aplicadas a um ETF em euros.
              Comparar com o índice em dólares mede o mercado e o câmbio ao
              mesmo tempo, e dá a conclusão trocada.
            </p>
          </div>
        </div>

        <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          E, para quem escolhe as ações uma a uma, há a avaliação por fluxos de
          caixa descontados: três cenários, valor terminal, margem de segurança e
          ponderação por probabilidade. O que estava numa folha de Excel, com os
          números fixados por testes.
        </p>
      </div>
    </section>
  );
}

const ADVANTAGES = [
  {
    them: "Só dividem a meias (50/50).",
    us: "Divides como quiseres: meias, por percentagem, valor fixo ou por quotas. Por despesa.",
  },
  {
    them: "Obrigam a reescrever tudo à mão.",
    us: "Carregas o extrato do banco, o PDF do cartão ou o ficheiro da corretora e a app extrai tudo.",
  },
  {
    them: "Deixam entrar a mesma despesa duas vezes.",
    us: "Cada transação entra uma só vez. Zero duplicados, contas de confiança.",
  },
  {
    them: "Tropeçam nas contas que variam (luz, água, gás).",
    us: "Recorrentes com valor variável: confirmas o valor real antes de entrar no saldo.",
  },
  {
    them: "Mostram um saldo que ninguém percebe.",
    us: "Tocas no saldo e vês exatamente as despesas que o compõem. Sempre explicável.",
  },
  {
    them: "Acabam no “quem deve a quem”.",
    us: "Continuam o património, os investimentos, a taxa de poupança e a data da independência financeira.",
  },
  {
    them: "Servem uma casa só.",
    us: "Ambientes separados — a casa, a família, os investimentos — cada um com as suas pessoas e permissões.",
  },
  {
    them: "Vivem de anúncios e dos teus dados.",
    us: "Privado e encriptado. Sem anúncios, sem vender nada. Exportas tudo quando quiseres.",
  },
];

function Advantages() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <p className="eyebrow">Porquê esta e não outra</p>
      <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        As apps de dividir contas falham sempre nos mesmos sítios. Esta resolve-os.
      </h2>

      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hair bg-hair sm:grid-cols-2">
        {ADVANTAGES.map((a) => (
          <div key={a.us} className="bg-bg p-6">
            <p className="flex items-start gap-2 text-sm text-fg-faint line-through decoration-fg-faint/40">
              <span aria-hidden className="not-italic no-underline">✕</span>
              <span className="no-underline">{a.them}</span>
            </p>
            <p className="mt-3 flex items-start gap-2 text-[15px] font-medium text-fg">
              <span aria-hidden className="text-credit">✓</span>
              <span>{a.us}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", t: "Regista", d: "Carrega o extrato ou escreve a despesa num toque. A categoria e a divisão vêm sugeridas." },
  { n: "02", t: "Divide", d: "Meias, percentagem ou valor fixo. Quem pagou é independente de como se divide." },
  { n: "03", t: "Acerta", d: "Vês quem deve a quem, registas o pagamento e o saldo fica a zero." },
  { n: "04", t: "Cresce", d: "Com as despesas e os rendimentos registados, o resto sai de graça: onde vai o dinheiro, quanto tens e quanto falta." },
];

function HowItWorks() {
  return (
    <section className="border-y border-hair bg-panel/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <p className="eyebrow">Como funciona</p>
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n}>
              <p className="font-mono text-sm text-fg-faint">{s.n}</p>
              <p className="mt-3 font-display text-xl font-semibold">{s.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const DETAILS = [
  ["App no telemóvel", "Instala-se no ecrã principal, em Android e iOS, e comporta-se como uma app. Tema claro e escuro."],
  ["Recibos", "Anexas a fotografia do talão à despesa. Ficam em armazenamento privado, acessíveis só a quem partilha o ambiente."],
  ["Ambientes e papéis", "Vários ambientes por pessoa, com convites. Quem só submete despesas não vê o resto, e o que precisa de aprovação espera por ela."],
  ["Lembretes de importação", "Dizes de quanto em quanto tempo importas cada banco e a app avisa quando está na hora — e até que data já foi."],
  ["Categorias e comerciantes", "Motor de classificação por regras, categorias próprias e metas mensais por categoria."],
  ["Nada se apaga", "Um limite impede de criar mais; nunca faz desaparecer o que já lá está. Os teus dados são teus e saem em qualquer momento."],
];

function Details() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <p className="eyebrow">E ainda</p>
      <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Os pormenores que se notam ao terceiro mês.
      </h2>
      <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-hair bg-hair sm:grid-cols-2 lg:grid-cols-3">
        {DETAILS.map(([t, d]) => (
          <li key={t} className="bg-bg p-6">
            <p className="font-display text-[15px] font-semibold tracking-tight">{t}</p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{d}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ROADMAP = [
  "Mais bancos, cartões e corretoras reconhecidos de origem",
  "Adicionar despesas offline, sincroniza depois",
  "Encontrar o símbolo de bolsa a partir do nome da empresa",
  "Entrar com a conta Google ou Microsoft",
  "Lembretes para acertar contas e confirmar recorrentes",
  "Aprender a divisão habitual a partir do histórico",
];

function Roadmap() {
  return (
    <section className="border-t border-hair bg-panel/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <p className="eyebrow">A caminho</p>
        <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Desenvolvimentos futuros
        </h2>
        <p className="mt-4 max-w-xl text-[15px] text-fg-muted">
          Tudo o que está em cima nesta página já funciona hoje. Estas são as
          próximas peças, pela ordem em que fazem mais diferença no dia a dia.
        </p>
        <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-hair bg-hair sm:grid-cols-2">
          {ROADMAP.map((r, i) => (
            <li key={r} className="flex items-center gap-4 bg-bg p-5">
              <span className="font-mono text-xs text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[15px] text-fg">{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contacto" className="border-t border-hair">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <p className="eyebrow">Falar connosco</p>
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Queres usar com quem partilhas casa?
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          Deixa o teu contacto e uma palavra sobre o que precisas — dividir as
          contas da casa, pôr o património num sítio só, ou as duas coisas.
          Respondemos pessoalmente, sem compromisso.
        </p>
        <div className="mt-8">
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-hair">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <BrandMark className="h-4 w-4" />
          <span className="font-display text-sm font-semibold tracking-tight">Rachar</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
            Feito no Porto
          </span>
        </span>
        {/* A Google exige estas duas páginas acessíveis sem sessão para
            aprovar o ecrã de consentimento do SSO. */}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">
          <Link href="/privacidade" className="hover:text-fg-muted">Privacidade</Link>
          <Link href="/termos" className="hover:text-fg-muted">Termos</Link>
          <span>Os teus dados são teus</span>
        </p>
      </div>
    </footer>
  );
}
