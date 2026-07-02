import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Rachar · Contas à Moda do Porto",
  description:
    "Rachar é dividir a conta sem dramas: regista, divide e vê num instante quem deve a quem. Privado, rápido e nascido no Porto.",
};

export default function LandingPage() {
  return (
    <div className="relative">
      <SiteHeader />
      <Hero />
      <Problem />
      <Advantages />
      <HowItWorks />
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
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[15px] font-semibold tracking-tight">Rachar</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint sm:inline">
            Contas à moda do Porto
          </span>
        </span>
        <div className="flex items-center gap-2">
          <a href="#contacto" className="btn-ghost hidden sm:inline-flex">Falar connosco</a>
          <Link href="/login" className="btn-secondary">Entrar</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 sm:pt-28">
      <p className="eyebrow animate-fade-in">Contas à moda do Porto</p>
      <h1 className="mt-5 max-w-3xl animate-fade-up font-display text-5xl font-semibold leading-[0.98] tracking-tightest text-balance sm:text-7xl">
        As contas da casa,
        <br />
        <span className="text-fg-muted">finalmente claras.</span>
      </h1>
      <p
        className="mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-fg-muted"
        style={{ animationDelay: "60ms" }}
      >
        Rachar é dividir a conta sem dramas: registas uma despesa em segundos,
        divides como fizer sentido e vês num instante quem deve a quem. Direto e
        honesto, à moda do Porto. Sem folhas de cálculo, sem discussões ao fim
        do mês.
      </p>
      <div className="mt-9 flex animate-fade-up flex-wrap gap-3" style={{ animationDelay: "120ms" }}>
        <a href="#contacto" className="btn-primary px-6 py-3 text-base">Quero saber mais</a>
        <Link href="/login" className="btn-secondary px-6 py-3 text-base">Já tenho acesso</Link>
      </div>
      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-faint">
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
          &ldquo;Quem pagou o supermercado? Já me pagaste a tua parte da luz?
          Afinal, quanto é que tu me deves?&rdquo;
        </p>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          Partilhar contas devia ser simples. Na prática perde-se tempo a apontar,
          a calcular e a lembrar quem deve o quê. E quando os números não batem
          certo, vem a parte chata: a conversa desconfortável.
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
    us: "Carregas o extrato do banco e a app extrai as despesas por ti.",
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
];

function HowItWorks() {
  return (
    <section className="border-y border-hair bg-panel/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <p className="eyebrow">Como funciona</p>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
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

const ROADMAP = [
  "Importação de mais bancos e cartões",
  "Adicionar despesas offline, sincroniza depois",
  "Relatórios e gráficos por categoria e por mês",
  "Lembretes para acertar contas e confirmar recorrentes",
  "Sugestão automática de divisão a partir do histórico",
  "Anexar recibos a cada despesa",
];

function Roadmap() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <p className="eyebrow">A caminho</p>
      <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Desenvolvimentos futuros
      </h2>
      <p className="mt-4 max-w-xl text-[15px] text-fg-muted">
        O essencial já funciona. Estas são as próximas peças, pela ordem em que
        fazem mais diferença no dia a dia.
      </p>
      <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-hair bg-hair sm:grid-cols-2">
        {ROADMAP.map((r, i) => (
          <li key={r} className="flex items-center gap-4 bg-bg p-5">
            <span className="font-mono text-xs text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[15px] text-fg">{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Contact() {
  return (
    <section id="contacto" className="border-t border-hair bg-panel/40">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <p className="eyebrow">Falar connosco</p>
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Queres usar com quem partilhas casa?
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          Deixa o teu contacto e uma palavra sobre o que precisas. Respondemos
          pessoalmente, sem compromisso.
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
        <span className="flex items-baseline gap-2">
          <span className="font-display text-sm font-semibold tracking-tight">Rachar</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
            Feito no Porto
          </span>
        </span>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">
          Acesso por convite · Os teus dados são teus
        </p>
      </div>
    </footer>
  );
}
