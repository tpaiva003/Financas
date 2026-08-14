import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { BrandMark } from "@/components/BrandMark";
import { Reveal } from "@/components/landing/Reveal";
import { ScrollState } from "@/components/ScrollState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HeroScreen } from "@/components/landing/HeroScreen";
import { PhoneFrame, BrowserFrame, Shot } from "@/components/landing/Frames";

export const metadata = {
  title: "Rachar · Contas à Moda do Porto",
  description:
    "Rachar divide as contas da casa e não pára aí: importa os extratos, mostra para onde vai o dinheiro, soma o que tens menos o que deves e diz-te em que ano trabalhar passa a ser opcional. Privado, sem anúncios, nascido no Porto.",
};

export default function LandingPage() {
  return (
    <div data-landing className="relative">
      {/*
        Rede de segurança: o estado de partida da revelação é invisível. Sem
        JavaScript, sem isto, a página ficava em branco.

        Vai por `dangerouslySetInnerHTML` e sem `>` no seletor de propósito: o
        React escapa o texto dos filhos, dentro de <style> o browser não
        desfaz o escape, e um seletor inválido faz cair a REGRA TODA, incluindo
        a parte que estava boa. Foi exatamente o que aconteceu à primeira.
      */}
      <noscript>
        <style
          dangerouslySetInnerHTML={{
            __html:
              "[data-reveal],[data-reveal-group] *,.track{opacity:1 !important;transform:none !important}",
          }}
        />
      </noscript>

      <ScrollState />
      <SiteHeader />
      <Hero />
      <Problema />
      <OQueSeOuve />
      <OQueFaz />
      <ProvaImportar />
      <Investimentos />
      <PorqueEsta />
      <ProvaAnalise />
      <ComoFunciona />
      <EAinda />
      <ACaminho />
      <Contacto />
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header data-sticky className="sticky top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
          {/*
            O mesmo botão da app, e a mesma preferência guardada: quem escolher
            o tema de dia aqui entra na app já com ele.
          */}
          <ThemeToggle />
          <Link href="/login" className="btn-secondary">Entrar</Link>
        </div>
      </div>
    </header>
  );
}

/** Uma palavra por área da app. Serve de índice do que vem a seguir. */
const AREAS = [
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
    <section className="mx-auto max-w-6xl px-6 pb-28 pt-20 sm:pt-28 lg:pb-36">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div>
          <p className="eyebrow animate-fade-in">Contas à moda do Porto</p>
          <h1 className="mt-5 max-w-2xl animate-fade-up font-display text-5xl font-semibold leading-[0.98] tracking-tightest text-balance sm:text-6xl">
            As contas da casa,
            <br />
            <span className="text-fg-muted">e o que vem a seguir.</span>
          </h1>
          <p
            className="mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-fg-muted text-pretty"
            style={{ animationDelay: "60ms" }}
          >
            Começa por dividir uma despesa em segundos. Depois carrega o extrato
            e deixa de escrever à mão, vê para onde vai o dinheiro ao fim do
            mês, soma o que tens menos o que deves e descobre em que ano
            trabalhar passa a ser opcional. Tudo na mesma app.
          </p>
          <div
            className="mt-9 flex animate-fade-up flex-wrap gap-3"
            style={{ animationDelay: "120ms" }}
          >
            <a href="#contacto" className="btn-primary px-6 py-3 text-base">Quero saber mais</a>
            <Link href="/login" className="btn-secondary px-6 py-3 text-base">Já tenho acesso</Link>
          </div>

          <ul
            className="mt-10 flex animate-fade-up flex-wrap gap-2"
            style={{ animationDelay: "160ms" }}
            aria-label="Áreas da app"
          >
            {AREAS.map((a) => (
              <li key={a} className="chip">{a}</li>
            ))}
          </ul>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-faint">
            Nascido no Porto · Privado · Sem anúncios
          </p>
        </div>

        {/* O produto a funcionar, ao lado da promessa. */}
        <div
          className="mx-auto w-full max-w-[19rem] animate-fade-up lg:max-w-[20rem]"
          style={{ animationDelay: "220ms" }}
        >
          <PhoneFrame>
            <HeroScreen />
          </PhoneFrame>
          <p className="mt-4 text-center text-xs leading-relaxed text-fg-faint">
            Carrega em <span className="text-fg-muted">Meias</span> ou{" "}
            <span className="text-fg-muted">60/40</span>. Quem pagou não muda,
            só muda quanto cada um deve.
          </p>
        </div>
      </div>
    </section>
  );
}

function Problema() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-24 sm:py-36">
      <Reveal>
        <p className="eyebrow eyebrow-tick">O problema</p>
        <p className="mt-6 font-display text-[1.75rem] font-medium leading-[1.12] tracking-tight text-balance sm:text-[2.5rem]">
          &ldquo;Uma hora ao domingo à noite: abrir o extrato, copiar para a
          folha de cálculo, somar as colunas. No mês seguinte, tudo outra vez do
          zero.&rdquo;
        </p>
        <p className="mt-8 text-[15px] leading-relaxed text-fg-muted text-pretty">
          Não é a matemática que custa, é o trabalho à mão. Copiar movimentos,
          corrigir enganos, lembrar quem pagou o quê, atualizar a folha do
          património noutro sítio qualquer. Acaba-se a passar mais tempo a
          manter as contas do que a olhar para elas.
        </p>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-muted text-pretty">
          E como são ferramentas separadas, nunca batem certo uma com a outra. O
          dinheiro do dia a dia e o dinheiro a longo prazo são o mesmo dinheiro.
          Aqui vivem no mesmo sítio, e mantêm-se quase sozinhos.
        </p>
      </Reveal>
    </section>
  );
}

/**
 * As frases que se ouvem quando a conversa chega ao dinheiro.
 *
 * Não são testemunhos, e a página diz isso por escrito. Um testemunho inventado
 * é mentira, e numa app que trata do dinheiro das pessoas a mentira sai cara.
 * Estas frases não precisam de dono: quem as reconhece, reconhece-as por já as
 * ter dito. Cada uma leva a resposta ao lado, porque identificar-se com um
 * problema sem ver a saída deixa a pessoa pior do que estava.
 *
 * A última é a mais importante. O concorrente desta app não é o Tricount, é
 * adiar.
 */
const OUVE_SE = [
  {
    frase: "Não sei bem para onde é que o meu dinheiro está a ir.",
    resposta:
      "Ao fim do mês, por categoria e por sítio onde se gastou. As dezenas de formas de escrever “Continente” contam como uma só.",
  },
  {
    frase: "Ganho bem, mas ao fim do mês não sobra nada.",
    resposta:
      "Com o que entra e o que sai lado a lado, a taxa de poupança deixa de ser uma sensação e passa a ser um número.",
  },
  {
    frase: "Um de nós paga sempre mais. Nunca sabemos ao certo quanto.",
    resposta:
      "O saldo diz quem deve a quem, e abre-se até à despesa que o explica. Sem ninguém ter de andar a apontar.",
  },
  {
    frase: "Tenho dinheiro em dois bancos, um depósito e uma corretora. Não faço ideia de quanto tenho.",
    resposta: "Tudo somado num sítio só, menos o que se deve. No fim dá um número.",
  },
  {
    frase: "Ando a investir há dois anos e não sei se estou a ganhar ou a perder.",
    resposta:
      "A rentabilidade do teu dinheiro, contando as datas em que ele entrou, e a comparação justa com o índice.",
  },
  {
    frase: "Um dia trato disto.",
    resposta:
      "É esse dia que isto encurta. Carregas o extrato e ficas com meses em ordem numa tarde, não num fim de semana.",
  },
];

function OQueSeOuve() {
  return (
    <section className="wash relative isolate py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-6">
        <Reveal>
          <p className="eyebrow eyebrow-tick">O que se ouve</p>
          <h2 className="mt-5 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Se já disseste alguma destas, isto é para ti.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted text-pretty">
            Não são testemunhos e não têm dono: são as frases que aparecem sempre
            que a conversa chega ao dinheiro, e que também já dissemos.
          </p>
        </Reveal>

        <Reveal group as="ul" className="mt-12 space-y-9">
          {OUVE_SE.map((q) => (
            <li key={q.frase} className="max-w-2xl">
              <p className="font-display text-xl font-medium leading-snug tracking-tight text-fg text-balance sm:text-2xl">
                &ldquo;{q.frase}&rdquo;
              </p>
              <p className="mt-2.5 flex gap-3 text-[15px] leading-relaxed text-fg-muted text-pretty">
                <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-credit/60" />
                <span>{q.resposta}</span>
              </p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

const AREAS_DETALHE = [
  {
    k: "Dividir",
    t: "Dividir sem fazer contas",
    d: "Meias, percentagem, valor fixo ou quotas, e por despesa. Quem pagou é independente de como se divide. Tocas no saldo e vês exatamente as despesas que o compõem, até ao cêntimo. Acertas e fica a zero, com histórico.",
    span: "sm:col-span-7",
  },
  {
    k: "Importar",
    t: "Carregas o extrato, ela escreve por ti",
    d: "Excel e CSV do banco, PDF do cartão de crédito e ficheiros de corretora. As colunas são reconhecidas sozinhas, com ajuda de um modelo quando o formato é novo, e cada transação entra uma só vez, mesmo que carregues o mesmo ficheiro duas vezes.",
    span: "sm:col-span-5",
  },
  {
    k: "Rendimentos",
    t: "Metade da história que faltava",
    d: "Não é só para onde o dinheiro vai: é também de onde vem. Salário e trabalhos paralelos de um lado, juros, dividendos e rendas do outro. Daí sai a taxa de poupança e a percentagem das despesas já paga por rendimento passivo.",
    span: "sm:col-span-5",
  },
  {
    k: "Análise",
    t: "O mês comparado com o que é normal",
    d: "Por categoria, por comerciante e por mês. As dezenas de formas de escrever “Continente” contam como uma só. E a meio de agosto compara-se com os primeiros dias de agosto do ano passado, não com o mês inteiro. Senão parece sempre que se gastou pouco.",
    span: "sm:col-span-7",
  },
  {
    k: "Património",
    t: "O que tens menos o que deves",
    d: "Contas, depósitos, imóveis, investimentos e dívidas na mesma conta. Ao crédito à habitação juntas a prestação e a taxa e ficas a saber a data do último pagamento e quanto pagas de juros até lá.",
    span: "sm:col-span-6",
  },
  {
    k: "FIRE",
    t: "O ano em que trabalhar é opcional",
    d: "O gasto anual a dividir pela taxa de levantamento segura dá o número. Com o que poupas por mês e o retorno esperado, sai quantos anos faltam. Em termos reais, já descontada a inflação, e com as regras ajustáveis: a dos 4% é um ponto de partida, não uma lei da física.",
    span: "sm:col-span-6",
  },
];

function OQueFaz() {
  return (
    <section id="o-que-faz" className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      <Reveal>
        <p className="eyebrow eyebrow-tick">O que faz</p>
        <h2 className="mt-5 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Começa por dividir a conta. Acaba por gerir o património.
        </h2>
        <p className="mt-4 max-w-xl text-[15px] text-fg-muted text-pretty">
          Seis áreas, uma app. Cada uma resolve-se sozinha, e todas usam os
          mesmos dados: o que registas no dia a dia é o que alimenta o resto.
        </p>
      </Reveal>

      <Reveal group className="mt-14 grid gap-4 sm:grid-cols-12 sm:gap-5">
        {AREAS_DETALHE.map((c) => (
          <article key={c.k} className={`surface surface-lift p-6 sm:p-8 ${c.span}`}>
            <p className="eyebrow">{c.k}</p>
            <p className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight">
              {c.t}
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-fg-muted text-pretty">{c.d}</p>
          </article>
        ))}
      </Reveal>
    </section>
  );
}

const ALT_IMPORTAR =
  "Pré-visualização de um extrato importado: sete movimentos do banco, cada um com a categoria já sugerida e marcado como partilhado, por confirmar antes de entrar nas contas.";

function ProvaImportar() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <Reveal className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <div>
          <p className="eyebrow eyebrow-tick">A prova</p>
          <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Sete linhas de extrato, zero escritas à mão.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-fg-muted text-pretty">
            O ficheiro chega como o banco o escreve, em maiúsculas e com códigos
            de terminal pelo meio. A app reconhece as colunas, percebe o que é
            cada compra, sugere a categoria e a divisão, e avisa quando uma
            transação já lá está. Confirmas e acabou.
          </p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">
            Nada é gravado antes de confirmares
          </p>
        </div>

        <div className="lg:-mr-6">
          <div className="md:hidden">
            <PhoneFrame className="mx-auto max-w-[17rem]">
              <Shot
                base="/landing/importar-mobile"
                alt={ALT_IMPORTAR}
                width={780}
                height={1688}
              />
            </PhoneFrame>
          </div>
          <BrowserFrame url="rachar.pt/importar" className="hidden md:block">
            <Shot
              base="/landing/importar-desktop"
              alt={ALT_IMPORTAR}
              width={1480}
              height={924}
            />
          </BrowserFrame>
        </div>
      </Reveal>
    </section>
  );
}

const PERGUNTAS = [
  {
    n: "Pergunta 1",
    t: "Quanto rendeu o meu dinheiro?",
    d: "Depende de quando o meteste. Responde-se com a taxa interna de rentabilidade, que conta as datas de cada reforço.",
  },
  {
    n: "Pergunta 2",
    t: "O investimento foi bom?",
    d: "Aqui os reforços são ruído. Responde-se com a rentabilidade ponderada no tempo, que anula o efeito de quando entrou dinheiro.",
  },
  {
    n: "Comparação",
    t: "E se tivesse comprado o índice?",
    d: "As mesmas entradas, nas mesmas datas, aplicadas a um ETF em euros. Comparar com o índice em dólares mede o mercado e o câmbio ao mesmo tempo, e dá a conclusão trocada.",
  },
];

// Sem decimais na taxa de propósito: a TIR depende do dia em que a captura é
// tirada, e um texto alternativo que envelhece a cada `npm run shots` é um
// texto alternativo que ninguém vai manter certo.
const ALT_CARTEIRA =
  "Rentabilidade da carteira: 14 598,96 € investidos valem hoje 15 505,10 €, com uma taxa anual a rondar os 11%, e a comparação a dizer que no S&P 500 teria 270,53 € a mais e no MSCI World 481,59 € a menos.";

function Investimentos() {
  return (
    <section className="wash relative isolate py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-6">
        <Reveal>
          <p className="eyebrow eyebrow-tick">Investimentos</p>
          <h2 className="mt-5 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            A parte que a folha de cálculo nunca fez bem.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-muted text-pretty">
            Carregas o ficheiro da corretora e a posição deixa de ser escrita à
            mão: passa a ser calculada a partir das compras e vendas, com as
            datas e o custo médio ponderado. As cotações vêm sozinhas, e o que
            está em dólares é convertido ao câmbio do dia da operação. Nunca se
            grava um preço sem taxa de câmbio.
          </p>
        </Reveal>

        <Reveal group className="mt-12 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {PERGUNTAS.map((p) => (
            <article key={p.n} className="surface surface-lift p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">
                {p.n}
              </p>
              <p className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight">
                {p.t}
              </p>
              <p className="mt-2.5 text-[15px] leading-relaxed text-fg-muted text-pretty">{p.d}</p>
            </article>
          ))}
        </Reveal>

        <Reveal className="mt-12 lg:-mr-16">
          <div className="md:hidden">
            <PhoneFrame className="mx-auto max-w-[17rem]">
              <Shot
                base="/landing/carteira-mobile"
                alt={ALT_CARTEIRA}
                width={780}
                height={1688}
              />
            </PhoneFrame>
          </div>
          <BrowserFrame url="rachar.pt/patrimonio/ativos" className="hidden md:block">
            <Shot
              base="/landing/carteira-desktop"
              alt={ALT_CARTEIRA}
              width={1480}
              height={924}
            />
          </BrowserFrame>
        </Reveal>

        <Reveal>
          <p className="mt-10 max-w-2xl text-[15px] leading-relaxed text-fg-muted text-pretty">
            E, para quem escolhe as ações uma a uma, há a avaliação por fluxos de
            caixa descontados: três cenários, valor terminal, margem de segurança
            e ponderação por probabilidade. O que estava numa folha de Excel, com
            os números fixados por testes.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

const VANTAGENS = [
  {
    eles: "Só dividem a meias (50/50).",
    nos: "Divides como quiseres: meias, por percentagem, valor fixo ou por quotas. Por despesa.",
  },
  {
    eles: "Obrigam a reescrever tudo à mão.",
    nos: "Carregas o extrato do banco, o PDF do cartão ou o ficheiro da corretora e a app extrai tudo.",
  },
  {
    eles: "Deixam entrar a mesma despesa duas vezes.",
    nos: "Cada transação entra uma só vez. Zero duplicados, contas de confiança.",
  },
  {
    eles: "Tropeçam nas contas que variam (luz, água, gás).",
    nos: "Recorrentes com valor variável: confirmas o valor real antes de entrar no saldo.",
  },
  {
    eles: "Mostram um saldo que ninguém percebe.",
    nos: "Tocas no saldo e vês exatamente as despesas que o compõem. Sempre explicável.",
  },
  {
    eles: "Acabam no “quem deve a quem”.",
    nos: "Continuam o património, os investimentos, a taxa de poupança e a data da independência financeira.",
  },
  {
    eles: "Servem uma casa só.",
    nos: "Ambientes separados (a casa, a família, os investimentos), cada um com as suas pessoas e permissões.",
  },
  {
    eles: "Vivem de anúncios e dos teus dados.",
    nos: "Privado e encriptado. Sem anúncios, sem vender nada. Exportas tudo quando quiseres.",
  },
];

function PorqueEsta() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-[20rem_1fr] lg:gap-16">
        <Reveal>
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow eyebrow-tick">Porquê esta</p>
            <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              As apps de dividir contas falham sempre nos mesmos sítios.
            </h2>
            <p className="mt-4 text-[15px] text-fg-muted text-pretty">
              Esta resolve-os, um a um.
            </p>
          </div>
        </Reveal>

        <Reveal group as="ul" className="space-y-8">
          {VANTAGENS.map((v) => (
            <li key={v.nos} className="group flex gap-4">
              <span
                aria-hidden
                className="mt-2.5 h-px w-3 shrink-0 bg-fg-faint/40 transition-all duration-200 group-hover:w-4 group-hover:bg-debt/60"
              />
              <div>
                <p className="text-[13px] leading-relaxed text-fg-faint">{v.eles}</p>
                <p className="mt-1 text-[15px] font-medium leading-relaxed text-fg text-pretty">
                  {v.nos}
                </p>
              </div>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

const ALT_ANALISE =
  "Relatório mensal: barras dos últimos doze meses de despesa, com agosto ainda a decorrer em 128,40 € contra os 510,15 € de julho e uma média móvel de três meses de 343,32 €.";

function ProvaAnalise() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-32">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow eyebrow-tick">Ao fim do mês</p>
          <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Onde é que o dinheiro foi parar.
          </h2>
        </div>

        <div className="mx-auto mt-12 max-w-4xl">
          <div className="md:hidden">
            <PhoneFrame className="mx-auto max-w-[17rem]">
              <Shot
                base="/landing/analise-mobile"
                alt={ALT_ANALISE}
                width={780}
                height={1688}
              />
            </PhoneFrame>
          </div>
          <BrowserFrame url="rachar.pt/relatorios" className="hidden md:block">
            <Shot
              base="/landing/analise-desktop"
              alt={ALT_ANALISE}
              width={1480}
              height={924}
            />
          </BrowserFrame>
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center font-mono text-[11px] uppercase leading-relaxed tracking-[0.12em] text-fg-faint">
          Dados de exemplo, do ambiente de demonstração
        </p>
      </Reveal>
    </section>
  );
}

const PASSOS = [
  { n: "01", t: "Regista", d: "Carrega o extrato ou escreve a despesa num toque. A categoria e a divisão vêm sugeridas." },
  { n: "02", t: "Divide", d: "Meias, percentagem ou valor fixo. Quem pagou é independente de como se divide." },
  { n: "03", t: "Acerta", d: "Vês quem deve a quem, registas o pagamento e o saldo fica a zero." },
  { n: "04", t: "Cresce", d: "Com as despesas e os rendimentos registados, o resto sai de graça: onde vai o dinheiro, quanto tens e quanto falta." },
];

function ComoFunciona() {
  return (
    <section className="wash relative isolate py-20 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="eyebrow eyebrow-tick">Como funciona</p>
        </Reveal>

        <Reveal className="relative mt-12">
          {/* O trilho desenha-se de um passo ao outro: mede sequência. */}
          <span
            aria-hidden
            className="track absolute left-[7px] top-2 h-full w-px bg-hair lg:left-0 lg:top-[7px] lg:h-px lg:w-full"
          />
          <ol className="grid gap-10 lg:grid-cols-4 lg:gap-8">
            {PASSOS.map((s) => (
              <li key={s.n} className="relative pl-8 lg:pl-0 lg:pt-8">
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border border-hair bg-bg lg:top-0"
                />
                <p className="font-mono text-sm text-fg-faint">{s.n}</p>
                <p className="mt-3 font-display text-xl font-semibold">{s.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted text-pretty">{s.d}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

const DETALHES: [string, string][] = [
  ["App no telemóvel", "Instala-se no ecrã principal, em Android e iOS, e comporta-se como uma app. Tema claro e escuro."],
  ["Recibos", "Anexas a fotografia do talão à despesa. Ficam em armazenamento privado, acessíveis só a quem partilha o ambiente."],
  ["Ambientes e papéis", "Vários ambientes por pessoa, com convites. Quem só submete despesas não vê o resto, e o que precisa de aprovação espera por ela."],
  ["Lembretes de importação", "Dizes de quanto em quanto tempo importas cada banco e a app avisa quando está na hora, e até que data já foi."],
  ["Categorias e comerciantes", "Motor de classificação por regras, categorias próprias e metas mensais por categoria."],
  ["Nada se apaga", "Um limite impede de criar mais; nunca faz desaparecer o que já lá está. Os teus dados são teus e saem em qualquer momento."],
];

function EAinda() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <Reveal>
        <p className="eyebrow eyebrow-tick">E ainda</p>
        <h2 className="mt-5 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Os pormenores que se notam ao terceiro mês.
        </h2>
      </Reveal>

      <Reveal group as="ul" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DETALHES.map(([t, d]) => (
          <li key={t} className="surface surface-lift p-6">
            <p className="font-display text-[15px] font-semibold tracking-tight">{t}</p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted text-pretty">{d}</p>
          </li>
        ))}
      </Reveal>
    </section>
  );
}

const A_CAMINHO = [
  "Mais bancos, cartões e corretoras reconhecidos de origem",
  "Adicionar despesas offline, sincroniza depois",
  "Encontrar o símbolo de bolsa a partir do nome da empresa",
  "Entrar com a conta Google ou Microsoft",
  "Lembretes para acertar contas e confirmar recorrentes",
  "Aprender a divisão habitual a partir do histórico",
];

function ACaminho() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
      <Reveal>
        <p className="eyebrow eyebrow-tick">A caminho</p>
        <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Desenvolvimentos futuros
        </h2>
        <p className="mt-4 max-w-xl text-[15px] text-fg-muted text-pretty">
          Tudo o que está em cima nesta página já funciona hoje. Estas são as
          próximas peças, pela ordem em que fazem mais diferença no dia a dia.
        </p>
      </Reveal>

      <Reveal group as="ol" className="mt-10 space-y-4">
        {A_CAMINHO.map((r, i) => (
          <li key={r} className="flex items-baseline gap-4">
            <span className="font-mono text-xs text-fg-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[15px] text-fg">{r}</span>
          </li>
        ))}
      </Reveal>
    </section>
  );
}

function Contacto() {
  return (
    <section id="contacto" className="mx-auto max-w-2xl px-6 pb-24 pt-24 sm:pt-36">
      <Reveal>
        <p className="eyebrow eyebrow-tick">Falar connosco</p>
        <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Queres usar com quem partilhas casa?
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-muted text-pretty">
          Deixa o teu contacto e uma palavra sobre o que precisas: dividir as
          contas da casa, pôr o património num sítio só, ou as duas coisas.
          Respondemos pessoalmente, sem compromisso.
        </p>
        <div className="mt-8">
          <ContactForm />
        </div>
      </Reveal>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-6 pb-12 pt-6 sm:flex-row sm:items-center sm:justify-between">
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
    </footer>
  );
}
