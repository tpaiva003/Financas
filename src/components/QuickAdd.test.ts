import { describe, expect, it } from "vitest";
import { showsQuickAdd } from "./quick-add-rules";

describe("showsQuickAdd", () => {
  it("aparece onde despesas são o assunto", () => {
    expect(showsQuickAdd("/dashboard")).toBe(true);
    expect(showsQuickAdd("/despesas")).toBe(true);
    expect(showsQuickAdd("/saldo")).toBe(true);
    expect(showsQuickAdd("/relatorios")).toBe(true);
  });

  it("não aparece onde adicionaria outra coisa", () => {
    expect(showsQuickAdd("/patrimonio")).toBe(false);
    expect(showsQuickAdd("/patrimonio/ativos")).toBe(false);
    expect(showsQuickAdd("/rendimentos")).toBe(false);
  });

  it("não aparece por cima de um formulário", () => {
    // Um botão de criar por cima do ecrã de criar não leva a lado nenhum, e no
    // telemóvel tapava o campo que a pessoa está a preencher.
    expect(showsQuickAdd("/despesas/nova")).toBe(false);
    expect(showsQuickAdd("/despesas/exp_123/editar")).toBe(false);
    expect(showsQuickAdd("/importar")).toBe(false);
    expect(showsQuickAdd("/ambientes/novo")).toBe(false);
  });

  it("uma despesa vista ao pormenor não é um formulário", () => {
    expect(showsQuickAdd("/despesas/exp_123")).toBe(true);
  });
});
