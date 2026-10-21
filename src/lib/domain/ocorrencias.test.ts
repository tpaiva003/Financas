/**
 * Duas transações iguais no mesmo dia são duas transações.
 *
 * O invariante do projeto está escrito num sentido só — "a mesma transação
 * nunca entra duas vezes" — e o sentido inverso não estava guardado por nada.
 * Como a chave canónica é `origem|data|valor|moeda|conta|descrição`, dois cafés
 * iguais no mesmo dia no mesmo sítio produziam o mesmo UID e o segundo
 * desaparecia em silêncio. Não havia erro, não havia aviso: só um saldo a menos.
 */

import { describe, expect, it } from "vitest";
import { canonicalKey, stableUid } from "./normalize";
import type { NormalizedTransaction } from "./types";

const CAFE: NormalizedTransaction = {
  source: "activo bank",
  description: "CAFE CENTRAL LISBOA",
  amountCents: 250,
  currency: "EUR",
  transactionDate: "2026-03-14",
  account: "1234",
};

describe("stableUid", () => {
  it("a primeira ocorrência mantém o UID de sempre", () => {
    // Importa: o que já está gravado na base de dados foi calculado assim, e
    // reimportar um extrato antigo tem de continuar a reconhecê-lo.
    expect(stableUid(CAFE)).toBe(stableUid(CAFE, 0));
  });

  it("é estável entre chamadas", () => {
    expect(stableUid(CAFE)).toBe(stableUid(CAFE));
  });

  it("o segundo café do mesmo dia não é o primeiro", () => {
    expect(stableUid(CAFE, 1)).not.toBe(stableUid(CAFE, 0));
    expect(stableUid(CAFE, 2)).not.toBe(stableUid(CAFE, 1));
  });

  it("transações diferentes continuam a ter UIDs diferentes", () => {
    expect(stableUid({ ...CAFE, amountCents: 260 })).not.toBe(stableUid(CAFE));
    expect(stableUid({ ...CAFE, transactionDate: "2026-03-15" })).not.toBe(stableUid(CAFE));
    expect(stableUid({ ...CAFE, description: "CAFE NORTE" })).not.toBe(stableUid(CAFE));
  });

  it("a chave canónica ignora acentos, maiúsculas e pontuação", () => {
    expect(canonicalKey({ ...CAFE, description: "Café  Central, Lisboa!" })).toBe(
      canonicalKey({ ...CAFE, description: "CAFE CENTRAL LISBOA" }),
    );
  });
});
