/**
 * O que faz o site existir para os motores de busca — e o que o escondia.
 *
 * O layout de raiz teve `robots: { index: false }` durante toda a fase privada,
 * o que dizia a TODOS os motores para esquecer o site inteiro, landing
 * incluída. O teste que o proíbe é o diferencial deste commit: contra o código
 * antigo, falha. O resto guarda o par robots/sitemap coerente com a fronteira
 * pública real (`lib/public-routes.ts`), para as duas listas não divergirem em
 * silêncio.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import robots from "./robots";
import sitemap from "./sitemap";
import { isPublicPath } from "@/lib/public-routes";

const APP = join(process.cwd(), "src", "app");

describe("robots e sitemap", () => {
  it("o sitemap só aponta para páginas realmente públicas", () => {
    const entradas = sitemap();
    expect(entradas.length).toBeGreaterThan(0);
    for (const e of entradas) {
      const caminho = new URL(e.url).pathname.replace(/\/$/, "") || "/";
      expect(isPublicPath(caminho), e.url).toBe(true);
    }
  });

  it("a landing e as páginas legais estão no sitemap", () => {
    const caminhos = sitemap().map((e) => new URL(e.url).pathname.replace(/\/$/, "") || "/");
    for (const p of ["/", "/privacidade", "/termos"]) {
      expect(caminhos, p).toContain(p);
    }
  });

  it("o robots.txt aponta para o sitemap e fecha as portas privadas", () => {
    const r = robots();
    expect(String(r.sitemap)).toMatch(/\/sitemap\.xml$/);
    const regras = Array.isArray(r.rules) ? r.rules : [r.rules];
    const disallow = regras.flatMap((x) => x?.disallow ?? []);
    for (const porta of ["/api/", "/dashboard", "/plataforma", "/recuperar/", "/convite/"]) {
      expect(disallow, porta).toContain(porta);
    }
    // E nenhuma porta fechada no robots é, afinal, pública — senão o robots
    // estaria a esconder o que o site quer mostrar. As que acabam em "/" são
    // prefixos de páginas de token: públicas de propósito (quem lá chega não
    // tem sessão) mas nunca para rastejar, por isso ficam de fora da regra.
    for (const porta of disallow.filter((p) => !String(p).endsWith("/"))) {
      expect(isPublicPath(String(porta)), String(porta)).toBe(false);
    }
  });
});

describe("quem pode e quem não pode ser indexado", () => {
  it("o layout de raiz já não esconde o site inteiro", () => {
    const fonte = readFileSync(join(APP, "layout.tsx"), "utf8");
    expect(fonte).not.toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("a app privada esconde-se no layout do grupo (app)", () => {
    const fonte = readFileSync(join(APP, "(app)", "layout.tsx"), "utf8");
    expect(fonte).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("as páginas de token levam noindex: o URL carrega um segredo", () => {
    for (const pagina of [
      join(APP, "recuperar", "[token]", "page.tsx"),
      join(APP, "convite", "[token]", "page.tsx"),
    ]) {
      expect(readFileSync(pagina, "utf8"), pagina).toMatch(/robots:\s*\{\s*index:\s*false/);
    }
  });
});
