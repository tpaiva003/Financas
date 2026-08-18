import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, verifyPassword } from "./password";

/**
 * Um hash real do formato antigo, gerado a 100 mil iterações quando esse era o
 * valor da app, para a palavra-chave "demo1234". Fixado aqui de propósito: os
 * hashes que estão na base de dados são destes, e a subida para 600 mil só é
 * segura se estes continuarem a abrir.
 */
const HASH_ANTIGO_100K =
  "pbkdf2$100000$LZ17uwLk+ifPwaNfLKxnQw==$2r+wvQsTY/A1ZdMLmIIg4lk9a4F/ye/D2ZVu8cBbm4U=";

describe("a subida das iterações do PBKDF2", () => {
  it("um hash novo nasce com 600 mil iterações", async () => {
    const h = await hashPassword("qualquer-coisa");
    expect(h.split("$")[1]).toBe("600000");
    expect(await verifyPassword("qualquer-coisa", h)).toBe(true);
    expect(await verifyPassword("outra-coisa", h)).toBe(false);
  });

  it("um hash antigo a 100 mil continua a abrir — ninguém fica trancado", async () => {
    expect(await verifyPassword("demo1234", HASH_ANTIGO_100K)).toBe(true);
    expect(await verifyPassword("errada", HASH_ANTIGO_100K)).toBe(false);
  });

  it("o hash antigo é apontado para promoção, o novo não", async () => {
    expect(needsRehash(HASH_ANTIGO_100K)).toBe(true);
    expect(needsRehash(await hashPassword("x".repeat(8)))).toBe(false);
    // Um formato irreconhecível também se promove, em vez de ficar para sempre.
    expect(needsRehash("scrypt$whatever")).toBe(true);
  });
});
