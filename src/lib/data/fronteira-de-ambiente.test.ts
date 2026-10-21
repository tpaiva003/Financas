/**
 * A fronteira entre ambientes, verificada no código e não por amostragem.
 *
 * **Porque é que isto é um teste de código-fonte.** Toda a app fala com o
 * Supabase pela chave de serviço, que ignora o RLS. As políticas existem mas
 * são todas `is_app_user()` — nenhuma olha ao `space_id`. Ou seja: **o
 * isolamento entre ambientes é o `space_id` que cada consulta passa, e mais
 * nada.** Um método que procure por `id` e confie que quem chama validou é uma
 * falha de segurança, não um descuido de estilo — já aconteceu com seis
 * métodos de despesas, e lia-se, reescrevia-se e apagava-se a despesa de outra
 * casa só por saber o id.
 *
 * Os testes de isolamento que já cá estavam correm contra o `MockRepository`,
 * que é o único que os testes conseguem exercitar. Este olha para o que corre
 * em produção: percorre **todos** os métodos do `SupabaseRepository` e exige
 * que quem toca numa tabela de inquilino nomeie o ambiente algures.
 *
 * **A lista de exceções é a parte útil.** Há métodos que atravessam ambientes
 * de propósito — a consola de admin, o cron das cotações, um convite que se
 * abre por token. Cada um está aqui com o motivo escrito. Acrescentar um método
 * que atravesse ambientes passa a obrigar a escrevê-lo nesta lista, que é
 * exatamente a conversa que se quer ter antes de o fazer.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FICHEIRO = join(process.cwd(), "src", "lib", "data", "supabase-repository.ts");

/**
 * As tabelas que pertencem a um ambiente.
 *
 * Confirmado contra o esquema de produção: são as que têm coluna `space_id`.
 * As que ficam de fora não são de inquilino nenhum — `app_users`, `quotes`,
 * `waitlist`, `contact_messages`, `tentativas`, `password_reset_tokens`,
 * `classification_rules`, `import_templates`, `spaces` e `ticket_messages`.
 */
const DE_INQUILINO = [
  "asset_attachments",
  "asset_splits",
  "asset_trades",
  "assets",
  "categories",
  "expenses",
  "import_batches",
  "import_reminders",
  "income",
  "member_invites",
  "members",
  "net_worth_snapshots",
  "recurring_templates",
  "settlements",
  "spending_goals",
  "tickets",
  "valuation_attachments",
  "valuations",
];

/**
 * Quem atravessa ambientes, e porquê.
 *
 * Cada entrada é uma decisão tomada, não uma exceção arrumada para o teste
 * passar. Se um método novo precisar de entrar aqui, o motivo escreve-se ao
 * lado — e se não houver motivo que se escreva, é porque falta o `space_id`.
 */
const ATRAVESSAM_AMBIENTES: Record<string, string> = {
  listSpacesForUser:
    "A pergunta é 'a que ambientes pertence esta pessoa'. A fronteira aqui é o utilizador (`linked_user_id`), e tem de ser: filtrar por ambiente seria circular.",
  unlinkUserFromMembers:
    "Apagar a conta desliga-a de TODOS os ambientes. Limitar a um deixava a pessoa meio apagada.",
  deleteAccountAndSoleSpaces:
    "Como acima: é a conta inteira a sair, não um ambiente.",
  getPlatformStats:
    "Consola de admin (`/plataforma`), atrás de `isAdmin`. Conta a plataforma toda, que é o que lhe pedem.",
  listSpacesComInvestimentos:
    "O cron das cotações corre sem sessão nenhuma e precisa de saber onde há investimentos para atualizar. Não devolve dados de ninguém — só ids de ambiente.",
  listAllAssetSymbols:
    "Mesmo cron: os símbolos a cotar são os da plataforma inteira. Cortar isto aos mil deixava os símbolos além do milésimo com preços velhos.",
  peekMemberInvite:
    "O token É a autorização, e quem o abre ainda não pertence a ambiente nenhum — é esse o ponto de um convite.",
  acceptMemberInvite: "Como acima: é o token que autoriza.",
  listTicketsDoUtilizador:
    "Os pedidos de suporte são da pessoa e não do ambiente: filtra por `created_by`.",
  getTicketDoUtilizador: "Como acima — o autor vai na consulta, não numa comparação depois de ler.",
  listTicketsTodos: "Consola de admin, atrás de `isAdmin`.",
  getTicket: "Consola de admin, atrás de `isAdmin`.",
  setTicketStatus: "Consola de admin, atrás de `isAdmin`.",
  addTicketMessage: "Consola de admin e resposta do próprio autor; a pertença é verificada antes.",
  countTicketsAbertos: "Consola de admin: é uma contagem da plataforma.",
  getAssetLogoDomain:
    "Procura o bem pelo id para descobrir DE QUEM é, e só depois confirma que quem pede é membro pleno desse ambiente. O ambiente não pode vir de fora: é o que está a ser verificado.",
  getValuationLogoDomain: "Como acima.",
};

/** Os métodos da classe, com o corpo de cada um. */
function metodos(fonte: string): { nome: string; corpo: string }[] {
  const linhas = fonte.split("\n");
  const inicios: { i: number; nome: string }[] = [];
  linhas.forEach((l, i) => {
    const m = /^\s{2}(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\(/.exec(l);
    if (m?.[1] && m[1] !== "constructor") inicios.push({ i, nome: m[1] });
  });
  return inicios.map(({ i, nome }, k) => ({
    nome,
    corpo: linhas.slice(i, inicios[k + 1]?.i ?? linhas.length).join("\n"),
  }));
}

describe("nenhuma consulta toca noutro ambiente", () => {
  const fonte = readFileSync(FICHEIRO, "utf8");
  const todos = metodos(fonte);

  const tocamNumaTabelaDeInquilino = todos.filter((m) =>
    DE_INQUILINO.some((t) => m.corpo.includes(`from("${t}")`)),
  );

  it("há métodos que tocam nestas tabelas (senão isto não testa nada)", () => {
    expect(tocamNumaTabelaDeInquilino.length).toBeGreaterThan(30);
  });

  it("todos nomeiam o ambiente, ou estão na lista de quem o atravessa", () => {
    const mudos = tocamNumaTabelaDeInquilino
      .filter((m) => !(m.nome in ATRAVESSAM_AMBIENTES))
      .filter((m) => !/space_id/.test(m.corpo))
      .map((m) => m.nome);

    expect(
      mudos,
      "tocam numa tabela de ambiente sem nunca nomear o `space_id`.\n" +
        "Ou falta o filtro, ou falta a entrada em ATRAVESSAM_AMBIENTES com o motivo:\n" +
        mudos.join("\n"),
    ).toEqual([]);
  });

  it("a lista de exceções não tem nomes a mais", () => {
    // Uma exceção que já não corresponde a método nenhum é uma autorização
    // esquecida: fica a dar cobertura a um nome que alguém pode reusar.
    const existem = new Set(todos.map((m) => m.nome));
    const orfas = Object.keys(ATRAVESSAM_AMBIENTES).filter((n) => !existem.has(n));
    expect(orfas, `exceções sem método: ${orfas.join(", ")}`).toEqual([]);
  });
});

describe("a interface do repositório pede o ambiente a quem pede um id", () => {
  /**
   * A regra da casa: um método que recebe um `id` recebe também o `spaceId`, e
   * filtra pelos dois. Assim uma action não tem como escrever no ambiente
   * errado mesmo que lhe passem um id de outro — e passam, porque um id vindo
   * de um formulário não é prova de nada.
   */
  const iface = readFileSync(join(process.cwd(), "src", "lib", "data", "repository.ts"), "utf8");
  const corpo = /export interface Repository \{([\s\S]*?)\n\}/.exec(iface)?.[1] ?? "";
  const assinaturas = [...corpo.replace(/\n\s+/g, " ").matchAll(/(\w+)\(([^)]*)\):/g)];

  /** Os que pedem um id SEM o ambiente, com o motivo de cada um. */
  const SEM_AMBIENTE: Record<string, string> = {
    listSpacesForUser: "a fronteira é o utilizador",
    getUserPasswordHash: "conta, não ambiente",
    setUserPasswordHash: "conta, não ambiente",
    createPasswordResetToken: "conta, não ambiente",
    deleteAppUser: "conta, não ambiente",
    unlinkUserFromMembers: "conta, não ambiente",
    deleteAccountAndSoleSpaces: "conta, não ambiente",
    getAssetLogoDomain: "confirma a pertença lá dentro",
    getValuationLogoDomain: "confirma a pertença lá dentro",
    listTicketsDoUtilizador: "suporte é da pessoa",
    getTicketDoUtilizador: "suporte é da pessoa",
    getTicket: "consola de admin",
    setTicketStatus: "consola de admin",
    listTicketMessagesPublicas: "suporte, a pertença é verificada antes",
    listTicketMessagesTodas: "consola de admin",
    markContactMessageRead: "caixa de contacto: não é de ambiente nenhum",
    setContactMessageArchived: "caixa de contacto",
    setContactMessageNotes: "caixa de contacto",
  };

  it("quem pede um id pede o ambiente, salvo os que têm motivo escrito", () => {
    const faltam = assinaturas
      .filter(([, nome, args]) => /\b(id|\w+Id)\s*[?:]/.test(args ?? "") && !/spaceId/.test(args ?? ""))
      .map(([, nome]) => nome as string)
      .filter((nome) => !(nome in SEM_AMBIENTE));

    expect(
      faltam,
      "pedem um id e não pedem o ambiente — quem chamar com um id de outra casa escreve lá:\n" +
        faltam.join("\n"),
    ).toEqual([]);
  });
});
