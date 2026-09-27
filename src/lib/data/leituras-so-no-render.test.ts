/**
 * As leituras memoizadas são SÓ para render.
 *
 * O `lib/data/leituras` devolve a mesma resposta durante o pedido inteiro.
 * Numa action que escreve e depois relê, isso significaria ler o que havia
 * ANTES da escrita — um bug silencioso do pior tipo. Este teste percorre os
 * ficheiros `"use server"` e garante que nenhum importa de lá.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function ficheirosDeActions(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      out.push(...ficheirosDeActions(caminho));
      continue;
    }
    if (!nome.endsWith(".ts") && !nome.endsWith(".tsx")) continue;
    const texto = readFileSync(caminho, "utf8");
    if (/^\s*["']use server["']/.test(texto)) out.push(caminho);
  }
  return out;
}

describe("lib/data/leituras", () => {
  const ficheiros = ficheirosDeActions(join(process.cwd(), "src", "app"));

  it("encontra os ficheiros de actions (senão isto não testa nada)", () => {
    expect(ficheiros.length).toBeGreaterThan(2);
  });

  it("nenhuma server action lê pelas leituras memoizadas", () => {
    for (const f of ficheiros) {
      expect(readFileSync(f, "utf8"), f).not.toContain("data/leituras");
    }
  });
});
