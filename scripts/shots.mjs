/**
 * Capturas de ecrã da landing.
 *
 * As imagens da página pública são a app a sério, com os dados de exemplo do
 * modo mock. Isso é uma promessa que envelhece: muda-se um ecrã, e a landing
 * passa a mostrar um produto que já não existe. Este script volta a tirá-las
 * todas, sempre iguais, para essa promessa se poder manter com um comando.
 *
 * Correr com a app já a servir em http://localhost:3000, em modo mock:
 *
 *     APP_DATA_MODE=mock AUTH_URL=http://localhost:3000 npm run build
 *     APP_DATA_MODE=mock AUTH_URL=http://localhost:3000 npm start &
 *     npm run shots
 *
 * Precisa do Playwright e do Chromium, que NÃO estão nas dependências do
 * projeto de propósito (só servem para isto, e são pesados):
 *
 *     npm i -D playwright && npx playwright install chromium
 *
 * O `sharp` já é dependência, porque o Next também o usa para otimizar imagens.
 *
 * AVISO: só funciona contra o modo mock. As capturas vão para uma página
 * pública e os dados de duas pessoas reais não têm nada que lá estar.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3000";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = path.join(RAIZ, "public", "landing");
const TEMP = path.join(RAIZ, ".shots-tmp");
const EMAIL = process.env.SHOTS_EMAIL ?? "tiago@example.com";
const PALAVRA = process.env.SHOTS_PASSWORD ?? "demo1234";

/** Extrato de exemplo, escrito à maneira de um banco português. */
const EXTRATO = `Extrato de conta - Agosto 2026
Conta: **** 4471

Data movimento;Data valor;Descricao;Valor;Saldo
06-08-2026;06-08-2026;COMPRA 4471 CONTINENTE MATOSINHOS;-64,32;1284,55
07-08-2026;07-08-2026;GALP AREIAS PORTO;-58,10;1226,45
08-08-2026;08-08-2026;PAG SERV EDP COMERCIAL;-71,84;1154,61
09-08-2026;09-08-2026;COMPRA PINGO DOCE BOAVISTA;-41,27;1113,34
10-08-2026;10-08-2026;NETFLIX.COM;-13,99;1099,35
11-08-2026;11-08-2026;COMPRA 4471 RESTAURANTE CAIS;-52,40;1046,95
12-08-2026;12-08-2026;CP COMBOIOS DE PORTUGAL;-31,20;1015,75
`;

fs.mkdirSync(DESTINO, { recursive: true });
fs.mkdirSync(TEMP, { recursive: true });
const ficheiroExtrato = path.join(TEMP, "extrato-exemplo.csv");
fs.writeFileSync(ficheiroExtrato, EXTRATO);

const browser = await chromium.launch();

async function entrar(viewport) {
  // O ecrã da app é sempre escuro nas capturas: as molduras da landing é que
  // mudam de tema. Ver a classe `.screen` no globals.css.
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.waitForSelector("#email", { state: "visible" });
  await p.waitForTimeout(700); // o formulário é um componente de cliente
  await p.fill("#email", EMAIL);
  await p.fill("#password", PALAVRA);
  await p.click('button[type="submit"]');
  await p.waitForURL("**/dashboard", { timeout: 45_000 });
  await p.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  return { ctx, p };
}

/** Põe o elemento no topo do ecrã e devolve-o. */
async function ancorar(p, texto, folga) {
  const el = p.getByText(texto, { exact: false }).first();
  await el.waitFor({ state: "attached", timeout: 20_000 });
  await el.evaluate((node, f) => {
    window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - f, behavior: "instant" });
  }, folga);
  await p.waitForTimeout(700);
  return el;
}

/**
 * Recorta a coluna de conteúdo a partir de onde a âncora ficou MESMO.
 * No fim de uma página o scroll não chega para pôr o elemento no topo, e um
 * recorte de coordenadas fixas apanhava o que estava por cima.
 */
async function recortar(p, el, destino, { left = 350, width = 740, height = 462, folga = 22 } = {}) {
  const caixa = await el.boundingBox();
  const topo = Math.max(0, Math.round((caixa?.y ?? 0) - folga));
  const altura = p.viewportSize().height;
  await p.screenshot({
    path: destino,
    clip: { x: left, y: Math.min(topo, Math.max(0, altura - height)), width, height },
  });
}

async function preVisualizarImport(p) {
  await p.goto(`${BASE}/importar`, { waitUntil: "networkidle" });
  await p.setInputFiles('input[type="file"]', ficheiroExtrato);
  await p.getByRole("button", { name: /Pré-visualizar/i }).click();
  await p.waitForSelector("text=Rever e confirmar", { timeout: 45_000 });
  await p.waitForTimeout(1200);
}

// ---------------------------------------------------------------- desktop
{
  const { ctx, p } = await entrar({ width: 1440, height: 900 });

  await preVisualizarImport(p);
  // A prova está nas linhas já classificadas, não no cabeçalho do passo 2.
  await ancorar(p, "COMPRA 4471 CONTINENTE", 210);
  await recortar(p, p.getByText("Selecionar todas").first(), path.join(TEMP, "importar-d.png"), { folga: 26 });

  await p.goto(`${BASE}/patrimonio/ativos`, { waitUntil: "networkidle" });
  const carteira = await ancorar(p, "Rentabilidade da carteira", 44);
  await recortar(p, carteira, path.join(TEMP, "carteira-d.png"), { folga: 30 });

  await p.goto(`${BASE}/relatorios`, { waitUntil: "networkidle" });
  const grafico = await ancorar(p, "Evolução mensal", 44);
  await recortar(p, grafico, path.join(TEMP, "analise-d.png"), { folga: 30 });

  await ctx.close();
}

// --------------------------------------------------------------- telemóvel
{
  const { ctx, p } = await entrar({ width: 390, height: 844 });

  await preVisualizarImport(p);
  await ancorar(p, "COMPRA 4471 CONTINENTE", 150);
  await p.screenshot({ path: path.join(TEMP, "importar-m.png") });

  await p.goto(`${BASE}/patrimonio/ativos`, { waitUntil: "networkidle" });
  await ancorar(p, "Rentabilidade da carteira", 120);
  await p.screenshot({ path: path.join(TEMP, "carteira-m.png") });

  await p.goto(`${BASE}/relatorios`, { waitUntil: "networkidle" });
  await ancorar(p, "Evolução mensal", 120);
  await p.screenshot({ path: path.join(TEMP, "analise-m.png") });

  await ctx.close();
}

await browser.close();

// ------------------------------------------------------------- otimização
async function gravar(origem, nome, largura) {
  const destino = path.join(DESTINO, `${nome}.webp`);
  await sharp(path.join(TEMP, origem))
    .resize({ width: largura, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(destino);
  const kb = Math.round(fs.statSync(destino).size / 1024);
  // Orçamento: nenhuma captura passa dos 90 KB. Se passar, corta-se o
  // recorte; não se aumenta o orçamento.
  console.log(`${nome}.webp  ${kb} KB${kb > 90 ? "  <-- ACIMA DO ORÇAMENTO" : ""}`);
}

await gravar("importar-d.png", "importar-desktop", 1480);
await gravar("carteira-d.png", "carteira-desktop", 1480);
await gravar("analise-d.png", "analise-desktop", 1480);
await gravar("importar-m.png", "importar-mobile", 780);
await gravar("carteira-m.png", "carteira-mobile", 780);
await gravar("analise-m.png", "analise-mobile", 780);

fs.rmSync(TEMP, { recursive: true, force: true });
console.log("Capturas prontas em public/landing.");
