/**
 * Cada server action que escreve tem de olhar para o congelamento.
 *
 * **Porque é que isto é um teste que lê código-fonte, e não uma revisão.** A app
 * tem quase noventa server actions. Um `if` copiado para cada uma resolve o dia
 * em que se copia e falha na primeira que se escrever a seguir — foi assim que
 * seis métodos de despesas ficaram sem o filtro do `space_id`, por se ter
 * confiado na disciplina de quem escreve. Uma verificação que depende de alguém
 * se lembrar não é uma verificação.
 *
 * Este teste percorre os ficheiros `"use server"`, tira o corpo de cada action e
 * exige uma de duas coisas: ou fala em `congelado`, ou está na lista de baixo
 * com o motivo escrito. Uma action nova que escreva sem guarda parte o
 * `npm run test` no dia em que nasce, e não seis meses depois.
 *
 * O que este teste **não** garante: que a guarda está no sítio certo dentro da
 * função, ou que trata o caso certo. Isso continua a ser trabalho de quem
 * escreve e de quem revê. O que ele garante é que ninguém se esquece dela.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(process.cwd(), "src", "app");

/**
 * Actions que não precisam de guarda, cada uma com o motivo.
 *
 * A lista é curta de propósito e cada entrada tem de se justificar: uma lista
 * de excepções que cresce sem explicação é a mesma coisa que não ter teste.
 */
const SEM_GUARDA: Record<string, string> = {
  // Não escrevem nada: leem, pré-visualizam ou sugerem.
  previewImportAction: "só lê o ficheiro e mostra a pré-visualização",
  previewBrokerAction: "só lê o ficheiro e mostra a pré-visualização",
  previewReceiptAction: "lê o recibo e devolve uma proposta, não grava",
  listKnownAccounts: "leitura",
  lookupPropertyPriceAction: "consulta o INE, não grava",
  extractCreditContractAction: "lê o PDF e devolve uma proposta, não grava",
  suggestAssetSymbolAction: "sugere, não aplica",
  suggestMissingSymbolsAction: "sugere, não aplica",
  buscarFundamentaisAction: "consulta uma fonte externa, não grava",
  probeQuotesAction: "diagnóstico do dono da plataforma, leitura",

  // Só mexem em preferências de quem está a ver, não em dados do ambiente.
  setCurrentSpaceAction: "muda o cookie do ambiente aberto",
  dismissOnboardingAction: "escreve um cookie",
  moveSpaceAction: "ordena a lista de ambientes de quem vê",

  // A saída do congelamento. Uma guarda aqui trancava a porta pelo lado de
  // dentro: ficava congelado sem forma de deixar de estar.
  reativarAmbienteAction: "é a saída do congelamento",

  // Fora de qualquer ambiente: consola do dono, caixa de contacto, contas.
  markMessageReadAction: "caixa de contacto do dono, não pertence a ambiente nenhum",
  archiveMessageAction: "caixa de contacto do dono, não pertence a ambiente nenhum",
  setMessageNotesAction: "caixa de contacto do dono, não pertence a ambiente nenhum",
  reportMissingBankAction: "é dar notícia de um banco em falta, não um dado do ambiente",
  inviteUserAction: "cria uma conta, não escreve no ambiente",
  submitContactAction: "landing pública",
  waitlistAction: "porta fechada do registo, ainda não há ambiente nenhum",
  requestPasswordResetAction: "recuperação de palavra-chave, sem ambiente",
  completePasswordResetAction: "recuperação de palavra-chave, sem ambiente",
  acceptMemberInviteAction:
    "aceitar um convite é criar a própria conta, sem sessão; o congelamento guarda-se em quem CONVIDA (grantSubmitterAction)",
  createSpaceAction: "cria um ambiente novo, que nunca nasce congelado",

  // Direitos que um congelamento não pode prender. Ficar sem forma de apagar os
  // próprios dados, de tirar o acesso a alguém ou de pedir ajuda por se ter
  // estado três meses sem entrar seria o congelamento a fazer mal a sério.
  deleteAccountDataAction: "apagar os próprios dados nunca fica bloqueado",
  removeAccountAccessAction: "tirar o acesso a alguém nunca fica bloqueado",
  abrirPedidoAction: "pedir ajuda é como se sai daqui",
  responderPedidoAction: "pedir ajuda é como se sai daqui",
};

/** Os ficheiros com `"use server"` no topo. */
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

/**
 * O corpo de cada `export async function ...` do ficheiro.
 *
 * Corta na declaração seguinte em vez de contar chavetas: é mais simples de ler
 * e chega para o que se quer perguntar.
 */
function actionsDe(texto: string): { nome: string; corpo: string }[] {
  const linhas = texto.split("\n");
  const out: { nome: string; corpo: string }[] = [];
  let atual: { nome: string; corpo: string[] } | null = null;

  for (const linha of linhas) {
    const m = /^export async function (\w+)/.exec(linha);
    if (m) {
      if (atual) out.push({ nome: atual.nome, corpo: atual.corpo.join("\n") });
      atual = { nome: m[1]!, corpo: [] };
      continue;
    }
    if (atual) atual.corpo.push(linha);
  }
  if (atual) out.push({ nome: atual.nome, corpo: atual.corpo.join("\n") });
  return out;
}

describe("guarda de congelamento nas server actions", () => {
  const ficheiros = ficheirosDeActions(RAIZ);

  it("encontra os ficheiros de actions", () => {
    // Se um dia a deteção partir, este teste passa a não testar nada e ninguém
    // dá por isso: o resto do ficheiro ficaria a percorrer uma lista vazia.
    expect(ficheiros.length).toBeGreaterThanOrEqual(4);
  });

  it("todas as actions que escrevem olham para o congelamento", () => {
    const desprotegidas: string[] = [];

    for (const caminho of ficheiros) {
      const texto = readFileSync(caminho, "utf8");
      for (const { nome, corpo } of actionsDe(texto)) {
        if (nome in SEM_GUARDA) continue;
        if (corpo.includes("congelado")) continue;
        desprotegidas.push(`${caminho.replace(process.cwd() + "/", "")} → ${nome}`);
      }
    }

    expect(desprotegidas).toEqual([]);
  });

  it("a lista de excepções não tem nomes que já não existem", () => {
    // Uma excepção que sobrevive à action que a justificava passa a ser um
    // buraco à espera de que alguém reutilize o nome.
    const nomes = new Set(
      ficheiros.flatMap((c) => actionsDe(readFileSync(c, "utf8")).map((a) => a.nome)),
    );
    const orfas = Object.keys(SEM_GUARDA).filter((n) => !nomes.has(n));
    expect(orfas).toEqual([]);
  });
});
