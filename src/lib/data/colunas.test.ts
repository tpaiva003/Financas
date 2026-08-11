/**
 * As colunas que o código escreve existem mesmo nas tabelas?
 *
 * **Porque é que este ficheiro existe.** O `updateAssetTrade` escrevia numa
 * coluna chamada `date`; a coluna chama-se `trade_date`. O PostgREST recusava a
 * escrita inteira, o ecrã dizia "Não consegui gravar o movimento" — a mensagem
 * certa pela razão errada — e a funcionalidade nunca podia ter funcionado.
 *
 * **Os testes de isolamento não apanham isto**, e não é por descuido: correm
 * contra o `MockRepository`, que guarda objetos em memória e não tem colunas
 * nenhumas. Um nome errado é invisível para ele. É a mesma lição de sempre —
 * um backend mais permissivo do que a produção esconde o engano que os testes
 * procuram — só que aqui a diferença é estrutural e não se resolve tornando o
 * mock mais rigoroso.
 *
 * **O que este teste faz.** Lê as migrações, aprende que colunas cada tabela
 * tem, e depois confronta com elas todos os nomes que os `update`s do
 * `SupabaseRepository` escrevem. Um nome que não exista falha aqui, em vez de
 * falhar em produção.
 *
 * É um teste sobre texto, não sobre comportamento. Prefere deixar passar a
 * acusar quem não deve — o que nunca pode fazer é dar verde a uma coluna que
 * não existe.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const MIGRACOES = join(RAIZ, "supabase", "migrations");
const REPO = join(RAIZ, "src", "lib", "data", "supabase-repository.ts");

/** As colunas de cada tabela, lidas das migrações. */
function colunasPorTabela(): Map<string, Set<string>> {
  const tabelas = new Map<string, Set<string>>();
  const ficheiros = readdirSync(MIGRACOES).filter((f) => f.endsWith(".sql")).sort();

  for (const f of ficheiros) {
    const sql = readFileSync(join(MIGRACOES, f), "utf8");

    // create table [if not exists] nome ( ... );
    const criacoes = sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\s*\(([\s\S]*?)\n\)\s*;/gi);
    for (const m of criacoes) {
      const nome = m[1]!;
      const corpo = m[2]!;
      const cols = tabelas.get(nome) ?? new Set<string>();
      for (const linha of corpo.split("\n")) {
        const limpa = linha.trim();
        if (!limpa || limpa.startsWith("--")) continue;
        // Restrições e chaves não são colunas.
        if (/^(primary|foreign|unique|constraint|check)\b/i.test(limpa)) continue;
        const c = limpa.match(/^([a-z_][a-z0-9_]*)\s+/);
        if (c) cols.add(c[1]!);
      }
      tabelas.set(nome, cols);
    }

    // alter table nome add column [if not exists] coluna tipo, add column ...
    const alteracoes = sql.matchAll(/alter\s+table\s+([a-z_]+)([\s\S]*?);/gi);
    for (const m of alteracoes) {
      const nome = m[1]!;
      const cols = tabelas.get(nome) ?? new Set<string>();
      for (const a of m[2]!.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)) {
        cols.add(a[1]!);
      }
      tabelas.set(nome, cols);
    }
  }

  return tabelas;
}

/**
 * Os nomes de coluna que cada método escreve num `update`, e por que tabela.
 *
 * **Só os `update`s, e de propósito.** Um nome errado num `insert` rebenta na
 * primeira utilização, alto e bom som — a linha nunca chega a ser criada. Um
 * nome errado num `update` só rebenta naquele caminho, que pode ser um botão
 * que ninguém carrega durante meses. Foi o que aconteceu.
 *
 * Corta-se o ficheiro por método (`  async nome(...)`), o que dá uma fronteira
 * exacta em vez de aproximada: cada método tem o seu `from("...")` e as suas
 * atribuições, e nada atravessa para o seguinte.
 */
function colunasEscritasEmUpdates(): { metodo: string; tabela: string; nomes: Set<string> }[] {
  const src = readFileSync(REPO, "utf8");
  const out: { metodo: string; tabela: string; nomes: Set<string> }[] = [];

  const inicios = [...src.matchAll(/^ {2}async ([A-Za-z0-9_]+)\(/gm)];
  for (let i = 0; i < inicios.length; i++) {
    const metodo = inicios[i]![1]!;
    const de = inicios[i]!.index!;
    const ate = i + 1 < inicios.length ? inicios[i + 1]!.index! : src.length;
    const corpo = src.slice(de, ate);

    if (!corpo.includes(".update(")) continue;
    const tabela = corpo.match(/\.from\("([a-z_]+)"\)/)?.[1];
    if (!tabela) continue;

    const nomes = new Set<string>();
    for (const m of corpo.matchAll(/\brow\.([a-z_][a-z0-9_]*)\s*=/g)) nomes.add(m[1]!);
    for (const m of corpo.matchAll(/\.eq\("([a-z_][a-z0-9_]*)"/g)) nomes.add(m[1]!);
    if (nomes.size > 0) out.push({ metodo, tabela, nomes });
  }

  return out;
}

describe("as colunas que o repositório escreve existem nas tabelas", () => {
  const tabelas = colunasPorTabela();

  it("as migrações declaram as tabelas principais", () => {
    // Se isto falhar, a leitura das migrações partiu-se e o resto do ficheiro
    // deixaria de valer alguma coisa — em silêncio, que é o pior.
    for (const t of ["assets", "asset_trades", "expenses", "spaces", "members"]) {
      expect(tabelas.get(t)?.size ?? 0).toBeGreaterThan(3);
    }
  });

  /**
   * O caso que deu origem a isto: `date` em vez de `trade_date`.
   */
  it("a tabela dos movimentos tem trade_date e não date", () => {
    const cols = tabelas.get("asset_trades")!;
    expect(cols.has("trade_date")).toBe(true);
    expect(cols.has("date")).toBe(false);
  });

  it("nenhum update escreve numa coluna que não existe", () => {
    const escritas = colunasEscritasEmUpdates();
    // Se a leitura do repositório se partir, isto deixa de valer alguma coisa
    // em silêncio — que é o pior modo de falha de um teste.
    expect(escritas.length).toBeGreaterThan(3);

    const problemas: string[] = [];
    for (const { metodo, tabela, nomes } of escritas) {
      const cols = tabelas.get(tabela);
      // Tabelas que não venham de uma migração ficam de fora.
      if (!cols) continue;
      for (const n of nomes) {
        if (!cols.has(n)) problemas.push(`${metodo} escreve ${tabela}.${n}, que não existe`);
      }
    }

    expect(problemas).toEqual([]);
  });
});

/**
 * O outro lado da mesma moeda: um campo do `patch` que ninguém lê.
 *
 * O teste acima apanha um nome de coluna **errado**. Não apanha um campo
 * **esquecido** — e o esquecimento é ainda mais silencioso: o `update` corre, o
 * PostgREST não se queixa, e o campo que se pediu para mudar fica como estava.
 *
 * Foi o que aconteceu com o `assetId` no `updateAssetTrade`. Mudar um movimento
 * de investimento era um não-fazer-nada perfeito: sem erro, sem aviso, e a
 * fusão de dois registos duplicados anunciava "movi 12 movimentos" com os doze
 * exactamente onde estavam.
 *
 * **O `MockRepository` não podia apanhar isto**, e não é descuido: ele faz
 * `{ ...trade, ...patch }`, por isso aceita qualquer campo que lhe dêem. Um
 * teste contra o mock passava nos dois lados, que é o mesmo que não existir.
 */
describe("os updates leem todos os campos que lhes podem dar", () => {
  const src = readFileSync(REPO, "utf8");

  function corpoDe(metodo: string): string {
    const i = src.indexOf(`  async ${metodo}(`);
    expect(i).toBeGreaterThan(-1);
    const resto = src.slice(i + 1);
    const fim = resto.search(/^ {2}async [A-Za-z0-9_]+\(/m);
    return fim < 0 ? resto : resto.slice(0, fim);
  }

  /** Os campos de uma interface do `repository.ts`, sem os comentários. */
  function camposDe(nome: string): string[] {
    const decl = readFileSync(join(RAIZ, "src", "lib", "data", "repository.ts"), "utf8");
    const i = decl.indexOf(`export interface ${nome} {`);
    expect(i).toBeGreaterThan(-1);
    const corpo = decl.slice(i, decl.indexOf("\n}", i));
    return [...corpo.matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9]*)\??:/gm)].map((m) => m[1]!);
  }

  it("o updateAssetTrade trata todos os campos do movimento", () => {
    const corpo = corpoDe("updateAssetTrade");
    // O id identifica a linha, o ambiente filtra a escrita e a data de criação
    // não se corrige: nenhum dos três é um campo a alterar.
    const fora = new Set(["id", "spaceId", "createdAt"]);
    const esquecidos = camposDe("AssetTrade")
      .filter((c) => !fora.has(c))
      .filter((c) => !corpo.includes(`patch.${c} !== undefined`));

    expect(esquecidos).toEqual([]);
  });
});
