import { describe, expect, it } from "vitest";
import {
  TICKET_ASSUNTO_MAX,
  estadoDepoisDaResposta,
  ticketAberto,
  validarTicket,
} from "./tickets";

describe("validarTicket", () => {
  it("aceita um pedido com assunto e corpo", () => {
    const r = validarTicket({ assunto: " Erro ao importar ", corpo: " Ficou mil vezes acima. " });
    expect(r).toEqual({ ok: { assunto: "Erro ao importar", corpo: "Ficou mil vezes acima." } });
  });

  it("recusa sem assunto e sem corpo, e diz qual falta", () => {
    expect(validarTicket({ assunto: "", corpo: "há isto" })).toEqual({
      erro: "Escreve um assunto.",
    });
    expect(validarTicket({ assunto: "Isto", corpo: "   " })).toEqual({
      erro: "Descreve o que se passa.",
    });
  });

  /**
   * Cortar em vez de recusar: obrigar alguém a reescrever um assunto por causa
   * de um limite que a app sabe aplicar sozinha é fazer trabalho por nada.
   */
  it("corta um assunto comprido em vez de o recusar", () => {
    const r = validarTicket({ assunto: "a".repeat(400), corpo: "x" });
    expect("ok" in r && r.ok.assunto.length).toBe(TICKET_ASSUNTO_MAX);
  });
});

describe("ticketAberto", () => {
  it("resolvido e fechado já não estão em aberto", () => {
    expect(ticketAberto("novo")).toBe(true);
    expect(ticketAberto("a-tratar")).toBe(true);
    expect(ticketAberto("a-aguardar")).toBe(true);
    expect(ticketAberto("resolvido")).toBe(false);
    expect(ticketAberto("fechado")).toBe(false);
  });
});

describe("estadoDepoisDaResposta", () => {
  it("quem responde põe a bola do outro lado", () => {
    expect(estadoDepoisDaResposta("novo", "equipa", false)).toBe("a-aguardar");
    expect(estadoDepoisDaResposta("a-aguardar", "utilizador", false)).toBe("a-tratar");
  });

  /**
   * Insistir num assunto dado como resolvido é a forma mais comum de dizer que
   * ele não estava resolvido.
   */
  it("uma resposta do utilizador reabre um pedido resolvido", () => {
    expect(estadoDepoisDaResposta("resolvido", "utilizador", false)).toBe("a-tratar");
  });

  it("um pedido fechado fica fechado", () => {
    expect(estadoDepoisDaResposta("fechado", "utilizador", false)).toBe("fechado");
    expect(estadoDepoisDaResposta("fechado", "equipa", false)).toBe("fechado");
  });

  /**
   * Se uma nota interna mexesse no estado, o estado passava a denunciar que
   * houve uma nota interna — e a pessoa via a hora em que alguém escreveu uma
   * coisa que ela não pode ler.
   */
  it("uma nota interna não mexe no estado", () => {
    for (const s of ["novo", "a-tratar", "a-aguardar", "resolvido"] as const) {
      expect(estadoDepoisDaResposta(s, "equipa", true)).toBe(s);
    }
  });
});
