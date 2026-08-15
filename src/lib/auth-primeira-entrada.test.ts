/**
 * Uma conta sem palavra-chave definida não se entra: define-se.
 *
 * **O que isto fecha.** A entrada com credenciais definia a palavra-chave na
 * primeira vez. Enquanto a app era de duas pessoas conhecidas, passava; com
 * contas convidadas deixa de passar — entre o convite ser criado e a pessoa
 * entrar, quem soubesse o email era a primeira entrada, escrevia uma
 * palavra-chave qualquer, e ficava com a conta e com o ambiente que tinha sido
 * criado para outra pessoa. Não era preciso adivinhar nada: a janela era a
 * espera de quem foi convidado.
 *
 * A primeira palavra-chave passa a ir pelo mesmo caminho da reposição — uma
 * ligação com prazo, enviada para aquele endereço.
 *
 * **Este teste lê o código.** A entrada com credenciais vive dentro do Auth.js e
 * não se instancia sem meia app à volta; o que se pode afirmar sem isso é que o
 * caminho que gravava a palavra-chave deixou de existir naquele ficheiro. É uma
 * afirmação mais fraca do que exercitar o `authorize`, e é a que se consegue
 * fazer valer — melhor do que não ter nenhuma sobre uma porta que já esteve
 * aberta.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auth = readFileSync("src/lib/auth.ts", "utf8");

describe("entrada com credenciais", () => {
  it("não grava uma palavra-chave nova a quem ainda não tem nenhuma", () => {
    // O que não pode voltar: `setUserPasswordHash` no caminho da entrada.
    expect(auth).not.toContain("setUserPasswordHash");
  });

  it("recusa a conta sem palavra-chave em vez de a adotar", () => {
    expect(auth).toContain("if (!existing) return null;");
  });
});

describe("o convite", () => {
  const acoes = readFileSync("src/app/(app)/actions.ts", "utf8");
  const email = readFileSync("src/lib/email/send.ts", "utf8");

  it("cria uma ligação com prazo em vez de mandar entrar à vontade", () => {
    expect(acoes).toContain("createPasswordResetToken");
    expect(email).not.toContain("fica a ser a tua");
  });

  /**
   * O hash do token vive num sítio só. Duas cópias divergiam, e nesse dia um
   * dos caminhos gravava um hash que o outro não reconhece — a ligação enviada
   * por email deixava de funcionar sem nada se queixar.
   */
  it("guarda o token com o mesmo hash nos dois caminhos", () => {
    const recuperar = readFileSync("src/app/recuperar/actions.ts", "utf8");
    expect(recuperar).toContain('from "@/lib/tokens"');
    expect(acoes).toContain('from "@/lib/tokens"');
    expect(recuperar).not.toContain('createHash("sha256")');
  });
});
