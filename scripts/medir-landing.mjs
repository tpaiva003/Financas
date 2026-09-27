/**
 * Mede as proporções das peças da landing que têm forma própria.
 *
 * Há um defeito que não dá erro nenhum e que ninguém apanha a olho: uma peça
 * cuja largura segue a largura da janela e cuja altura segue a altura da
 * janela. Cada eixo, sozinho, parece sensato. Juntos fazem a peça mudar de
 * FEITIO de ecrã para ecrã — mais gorda num portátil largo, mais alta num
 * ecrã alto. Ninguém escreveu "estica isto"; a esticadela nasce da soma, e é
 * por isso que passa nas revisões. E esconde-se ainda melhor quando o ecrã de
 * quem programou por acaso tem quase a proporção do desenho: o "no meu
 * computador está bem" é literalmente verdade.
 *
 * Não se discute isto com capturas de ecrã. Mede-se. O rácio largura/altura é
 * o defeito num número só: se ele se mexe entre viewports, há dois eixos a
 * decidir cada um o seu.
 *
 * A verificação mais afiada é a das ALTURAS: o mesmo viewport de largura, com
 * alturas diferentes. Uma peça honesta não muda de forma quando só a altura da
 * janela muda. Foi exatamente aqui que o baralho de frases foi apanhado, com a
 * altura em `58svh` e a largura vinda do texto.
 *
 * Correr com a app já a servir (o modo mock chega, a landing é pública):
 *
 *     npm run build && npm start &
 *     npm run medir
 *
 * Precisa do Playwright e de um Chromium. Se a máquina já tiver um noutro
 * sítio, aponta-lhe com `MEDIR_CHROMIUM=/caminho/para/chromium npm run medir`.
 *
 * Sai com código 1 se alguma peça mudar de forma, para poder ser usado como
 * portão antes de publicar.
 */

import { chromium } from "playwright";

const BASE = process.env.MEDIR_BASE ?? "http://localhost:3000";

/**
 * Viewports em grupos da MESMA largura e alturas diferentes.
 *
 * O agrupamento é o método: dentro de um grupo só muda a altura da janela, por
 * isso qualquer peça que mude de forma dentro do grupo está a ler a altura do
 * ecrã para uma coisa que não devia depender dela.
 */
const GRUPOS = [
  { largura: 360, alturas: [560, 640, 740, 900] },
  { largura: 390, alturas: [660, 844] },
  { largura: 768, alturas: [700, 1024] },
  { largura: 1280, alturas: [600, 800, 1024] },
  { largura: 1440, alturas: [700, 900, 1080] },
  { largura: 1920, alturas: [900, 1080] },
];

/** Duas casas decimais: abaixo disto é arredondamento do browser, não feitio. */
const TOLERANCIA = 0.01;

const browser = await chromium.launch({ executablePath: process.env.MEDIR_CHROMIUM });
const medicoes = [];

for (const { largura, alturas } of GRUPOS) {
  for (const altura of alturas) {
    const page = await browser.newPage({ viewport: { width: largura, height: altura } });
    await page.goto(BASE, { waitUntil: "networkidle" });

    // Põe a secção das frases no primeiro patamar, com uma frase de frente.
    await page.evaluate(() => {
      const cena = document.querySelector(".anel-cena");
      const caixa = cena.getBoundingClientRect();
      window.scrollTo(0, caixa.top + window.scrollY + (caixa.height - window.innerHeight) * 0.1);
    });
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => {
      const racio = (el) => {
        const b = el.getBoundingClientRect();
        return { l: +b.width.toFixed(1), a: +b.height.toFixed(1), r: +(b.width / b.height).toFixed(4) };
      };

      const anel = document.querySelector(".anel");
      const primeira = document.querySelector(".anel-frase");
      const modo =
        getComputedStyle(anel).transformStyle === "preserve-3d"
          ? "anel"
          : getComputedStyle(primeira).position === "absolute" ||
              getComputedStyle(primeira).gridArea.startsWith("1 / 1")
            ? "baralho"
            : "lista";

      // A frase à vista é a de maior opacidade.
      let frente = primeira;
      let maior = -1;
      for (const c of document.querySelectorAll(".anel-frase")) {
        const o = parseFloat(getComputedStyle(c).opacity);
        if (o > maior) { maior = o; frente = c; }
      }
      const caixaFrente = frente.getBoundingClientRect();

      // O texto tem de caber dentro do cartão. Com `overflow: visible` o
      // `scrollHeight` não denuncia nada, por isso mede-se parágrafo a
      // parágrafo contra a borda.
      let textoTopo = Infinity;
      let textoFundo = -Infinity;
      for (const p of frente.querySelectorAll("p")) {
        const b = p.getBoundingClientRect();
        textoTopo = Math.min(textoTopo, b.top);
        textoFundo = Math.max(textoFundo, b.bottom);
      }

      return {
        modo,
        telemovel: racio(document.querySelector(".peca-telemovel > div")),
        cartao: racio(frente),
        // Positivo = o texto sai pela borda do cartão.
        textoFora: +Math.max(caixaFrente.top - textoTopo, textoFundo - caixaFrente.bottom).toFixed(1),
        // Positivo = o cartão sai pela borda do ecrã.
        cartaoFora: +Math.max(-caixaFrente.top, caixaFrente.bottom - window.innerHeight).toFixed(1),
      };
    });

    medicoes.push({ largura, altura, vp: `${largura}x${altura}`, ...m });
    await page.close();
  }
}

await browser.close();

const falhas = [];

console.log("viewport     modo     telemovel  racio  | cartao        racio  | texto fora | cartao fora");
for (const m of medicoes) {
  console.log(
    m.vp.padEnd(12),
    m.modo.padEnd(8),
    `${m.telemovel.l}x${m.telemovel.a}`.padEnd(10),
    String(m.telemovel.r).padEnd(6),
    "|",
    `${m.cartao.l}x${m.cartao.a}`.padEnd(13),
    String(m.cartao.r).padEnd(6),
    "|",
    String(m.textoFora).padStart(10),
    "|",
    String(m.cartaoFora).padStart(11),
  );
}

// 1. A moldura do telemóvel tem uma proporção só, em todo o lado.
const racioTelemovel = medicoes.map((m) => m.telemovel.r);
const deltaTelemovel = Math.max(...racioTelemovel) - Math.min(...racioTelemovel);
if (deltaTelemovel > TOLERANCIA) {
  falhas.push(
    `A moldura do telemóvel muda de feitio: rácio entre ${Math.min(...racioTelemovel)} e ` +
      `${Math.max(...racioTelemovel)} (delta ${deltaTelemovel.toFixed(4)}). Os dois eixos estão a ser ` +
      `escalados em separado — tem de haver um tamanho de referência e UM fator de escala.`,
  );
}

// 2. Com a mesma largura, a altura da janela não pode mudar o cartão.
for (const { largura, alturas } of GRUPOS) {
  if (alturas.length < 2) continue;
  const doGrupo = medicoes.filter((m) => m.largura === largura && m.modo !== "lista");
  if (doGrupo.length < 2) continue;
  const rs = doGrupo.map((m) => m.cartao.r);
  const delta = Math.max(...rs) - Math.min(...rs);
  if (delta > TOLERANCIA) {
    falhas.push(
      `A ${largura}px de largura, o cartão das frases muda de feitio só por a janela ter outra ` +
        `altura: ${doGrupo.map((m) => `${m.altura}→${m.cartao.r}`).join(", ")} (delta ${delta.toFixed(4)}). ` +
        `A caixa do cartão está a ler a altura do ecrã.`,
    );
  }
}

// 3. Nada cortado: nem o texto pela borda do cartão, nem o cartão pela do ecrã.
for (const m of medicoes) {
  if (m.textoFora > 0.5) {
    falhas.push(`${m.vp} (${m.modo}): o texto sai ${m.textoFora}px para fora do cartão.`);
  }
  if (m.cartaoFora > 0.5) {
    falhas.push(`${m.vp} (${m.modo}): o cartão sai ${m.cartaoFora}px para fora do ecrã.`);
  }
}

if (falhas.length) {
  console.error(`\n✗ ${falhas.length} problema(s) de proporção:\n`);
  for (const f of falhas) console.error(`  · ${f}`);
  process.exit(1);
}

console.log(`\n✓ ${medicoes.length} viewports medidos, todas as peças com o mesmo feitio em todos.`);
