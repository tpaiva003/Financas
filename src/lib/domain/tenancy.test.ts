import { describe, expect, it } from "vitest";
import {
  accountsVisibleTo,
  canAccessSpace,
  ownerIsMemberOf,
  spacesOf,
  type Membership,
} from "./tenancy";

/**
 * Cenário: o dono da plataforma (tiago) partilha a "casa" com a clara. A "rita"
 * é uma cliente externa, com o ambiente dela. O "zé" é convidado da rita.
 */
const world: Membership[] = [
  { spaceId: "casa", linkedUserId: "tiago" },
  { spaceId: "casa", linkedUserId: "clara" },
  { spaceId: "casa", linkedUserId: null }, // participante sem login (ex.: mãe)
  { spaceId: "rita-pessoal", linkedUserId: "rita" },
  { spaceId: "rita-casa", linkedUserId: "rita" },
  { spaceId: "rita-casa", linkedUserId: "ze" },
];

describe("spacesOf", () => {
  it("dá só os ambientes onde a conta é participante", () => {
    expect(spacesOf("rita", world).sort()).toEqual(["rita-casa", "rita-pessoal"]);
    expect(spacesOf("tiago", world)).toEqual(["casa"]);
  });

  it("conta desconhecida não tem ambientes", () => {
    expect(spacesOf("ninguem", world)).toEqual([]);
  });
});

describe("canAccessSpace", () => {
  it("deixa entrar no próprio ambiente", () => {
    expect(canAccessSpace("rita", "rita-casa", world)).toBe(true);
  });

  it("NÃO deixa entrar no ambiente de outro inquilino", () => {
    expect(canAccessSpace("rita", "casa", world)).toBe(false);
    expect(canAccessSpace("tiago", "rita-pessoal", world)).toBe(false);
  });
});

describe("accountsVisibleTo", () => {
  it("mostra quem partilha um ambiente", () => {
    expect(accountsVisibleTo("tiago", world).sort()).toEqual(["clara", "tiago"]);
    expect(accountsVisibleTo("rita", world).sort()).toEqual(["rita", "ze"]);
  });

  it("um cliente externo NUNCA vê o dono da plataforma", () => {
    // É esta a garantia que faz a app ser mesmo multi-inquilino: a rita não
    // pode sequer descobrir que a conta do tiago existe.
    expect(accountsVisibleTo("rita", world)).not.toContain("tiago");
    expect(accountsVisibleTo("ze", world)).not.toContain("tiago");
    expect(accountsVisibleTo("ze", world)).not.toContain("clara");
  });

  it("o dono também não vê os clientes", () => {
    const visible = accountsVisibleTo("tiago", world);
    expect(visible).not.toContain("rita");
    expect(visible).not.toContain("ze");
  });

  it("inclui-se sempre a si próprio, mesmo sem ambientes", () => {
    expect(accountsVisibleTo("sozinho", world)).toEqual(["sozinho"]);
  });

  it("participantes sem login não entram na lista de contas", () => {
    expect(accountsVisibleTo("tiago", world)).not.toContain(null);
    expect(accountsVisibleTo("tiago", world)).toHaveLength(2);
  });
});

describe("ownerIsMemberOf", () => {
  it("confirma que o dono não é participante do ambiente do cliente", () => {
    expect(ownerIsMemberOf("tiago", "rita-casa", world)).toBe(false);
    expect(ownerIsMemberOf("tiago", "rita-pessoal", world)).toBe(false);
  });

  it("mas é participante do ambiente dele", () => {
    expect(ownerIsMemberOf("tiago", "casa", world)).toBe(true);
  });
});
