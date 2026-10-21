/**
 * As duas fronteiras dos pedidos de ajuda.
 *
 * **A primeira: uma nota interna nunca sai.** É o que se escreve para quem
 * trata do assunto e nunca para quem perguntou. Se escorregar para o lado
 * errado não há como desfazer — já foi lida — e por isso a separação não vive
 * num `if` de um ecrã: vive em duas funções de leitura com nomes diferentes, e
 * a que serve o utilizador não sabe filtrar. Estes testes são o que garante que
 * ela continua a não saber.
 *
 * **A segunda: um pedido é de quem o abriu.** Nem os outros participantes do
 * mesmo ambiente o veem. Um pedido leva lá dentro o que a pessoa quiser
 * escrever, incluindo coisas que ela não diria à frente de quem divide as
 * despesas com ela.
 *
 * Correm contra o `MockRepository` porque é o backend que os testes conseguem
 * exercitar, e por isso mesmo ele aplica a mesma regra que o Supabase: um mock
 * mais permissivo do que a produção deixa passar exactamente o engano que estes
 * testes tentam apanhar.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "./mock-repository";

const repo = new MockRepository();

const EU = "tiago";
const OUTRA_PESSOA = "clara";
const AMBIENTE = "casa";

const NOTA_INTERNA = "Este é o terceiro pedido dele sobre o mesmo assunto.";

let ticketId: string;

beforeEach(async () => {
  ticketId = await repo.createTicket({
    spaceId: AMBIENTE,
    createdBy: EU,
    subject: "A importação leu um valor errado",
    body: "Importei o extrato e uma compra ficou mil vezes acima.",
  });
  await repo.addTicketMessage({
    ticketId,
    authorId: OUTRA_PESSOA,
    body: NOTA_INTERNA,
    internal: true,
  });
  await repo.addTicketMessage({
    ticketId,
    authorId: OUTRA_PESSOA,
    body: "Já percebemos o que foi e está corrigido.",
    internal: false,
  });
});

describe("uma nota interna não chega ao utilizador", () => {
  it("a leitura pública não a devolve", async () => {
    const publicas = await repo.listTicketMessagesPublicas(ticketId);
    expect(publicas.some((m) => m.internal)).toBe(false);
    // E o teste não passa por não haver nada: o corpo e a resposta estão lá.
    expect(publicas).toHaveLength(2);
  });

  it("o texto da nota não aparece em lado nenhum do que o utilizador lê", async () => {
    // Verificar a bandeira não chega: o que não pode acontecer é o TEXTO
    // chegar ao outro lado, seja por que campo for.
    const publicas = await repo.listTicketMessagesPublicas(ticketId);
    expect(JSON.stringify(publicas)).not.toContain(NOTA_INTERNA);
  });

  it("quem trata do assunto vê tudo, senão não servia de nada", async () => {
    const todas = await repo.listTicketMessagesTodas(ticketId);
    expect(todas).toHaveLength(3);
    expect(todas.filter((m) => m.internal)).toHaveLength(1);
  });

  /**
   * Uma nota interna que mexesse no `updatedAt` denunciava-se: o utilizador via
   * a lista dele saltar para o topo, com a hora exacta em que alguém escreveu
   * uma coisa que ele não pode ler.
   */
  it("não mexe na hora que o utilizador vê", async () => {
    const antes = (await repo.getTicketDoUtilizador(ticketId, EU))!.updatedAt;
    await repo.addTicketMessage({
      ticketId,
      authorId: OUTRA_PESSOA,
      body: "Outra nota só para nós.",
      internal: true,
    });
    const depois = (await repo.getTicketDoUtilizador(ticketId, EU))!.updatedAt;
    expect(depois).toBe(antes);
  });

  it("uma resposta pública mexe, que é o que faz o fio parecer vivo", async () => {
    const antes = (await repo.getTicketDoUtilizador(ticketId, EU))!.updatedAt;
    // O relógio tem granularidade de milissegundo: sem isto, duas escritas
    // seguidas dariam a mesma hora e o teste passava por acaso.
    await new Promise((r) => setTimeout(r, 5));
    await repo.addTicketMessage({
      ticketId,
      authorId: OUTRA_PESSOA,
      body: "Mais uma coisa.",
      internal: false,
    });
    const depois = (await repo.getTicketDoUtilizador(ticketId, EU))!.updatedAt;
    expect(depois > antes).toBe(true);
  });
});

describe("um pedido é de quem o abriu", () => {
  it("o autor lê o seu", async () => {
    expect((await repo.getTicketDoUtilizador(ticketId, EU))?.id).toBe(ticketId);
  });

  it("outra pessoa do mesmo ambiente não lê", async () => {
    expect(await repo.getTicketDoUtilizador(ticketId, OUTRA_PESSOA)).toBeNull();
  });

  it("a lista de cada um só traz os dele", async () => {
    const meus = await repo.listTicketsDoUtilizador(EU);
    expect(meus.every((t) => t.createdBy === EU)).toBe(true);
    expect(await repo.listTicketsDoUtilizador(OUTRA_PESSOA)).toHaveLength(0);
  });
});
