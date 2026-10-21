/**
 * O caminho de um anexo no Storage.
 *
 * Parece um detalhe de arrumação e não é. Este `string` decide três coisas que
 * não se conseguem corrigir depois:
 *
 * 1. **Se apagar uma conta apaga mesmo os ficheiros.** Os recibos das despesas
 *    ficam no Storage para sempre quando um ambiente é apagado, porque o
 *    caminho não começa pelo ambiente. Com escrituras — que têm morada e número
 *    fiscal — isso tornaria falsa a frase "apagamos os teus dados".
 * 2. **Se o cliente consegue escolher a pasta.** Nada do que o browser manda
 *    entra aqui em cru: o nome do ficheiro não é usado, e a extensão sai do
 *    tipo já validado.
 * 3. **Se o nome de uma escritura aparece na listagem de um bucket.** "Escritura
 *    Rua X 3Dto NIF 123.pdf" é ele próprio um dado pessoal.
 *
 * O ficheiro tinha zero testes. Um caminho errado só se descobre no dia em que
 * alguém apaga a conta e os ficheiros ficam lá — que é tarde de mais.
 */

import { describe, expect, it } from "vitest";
import { caminhoDoAnexo, extensaoDoTipo } from "@/lib/services/attachments-service";

describe("extensaoDoTipo", () => {
  it("dá a extensão dos tipos que a app aceita", () => {
    expect(extensaoDoTipo("application/pdf")).toBe("pdf");
    expect(extensaoDoTipo("image/jpeg")).toBe("jpg");
    expect(extensaoDoTipo("image/png")).toBe("png");
    expect(extensaoDoTipo("image/webp")).toBe("webp");
    expect(extensaoDoTipo("image/heic")).toBe("heic");
  });

  /**
   * Um tipo desconhecido não chega aqui — `checkAnexo` recusa-o antes. Se
   * chegasse, o que não pode acontecer é a extensão vir do que foi enviado:
   * `.php`, `.html` ou `.svg` num bucket são problemas de natureza diferente
   * de um PDF.
   */
  it("um tipo que não conhece não escolhe a extensão", () => {
    expect(extensaoDoTipo("text/html")).toBe("bin");
    expect(extensaoDoTipo("image/svg+xml")).toBe("bin");
    expect(extensaoDoTipo("")).toBe("bin");
  });
});

describe("caminhoDoAnexo", () => {
  it("põe o ambiente à cabeça, para apagar uma conta ser remover um prefixo", () => {
    const p = caminhoDoAnexo("sp_1", "as_9", "anx_abc", "application/pdf");
    expect(p).toBe("sp_1/as_9/anx_abc.pdf");
    expect(p.startsWith("sp_1/")).toBe(true);
  });

  it("o bem vem a seguir, para apagar um bem ser remover um prefixo", () => {
    expect(caminhoDoAnexo("sp_1", "as_9", "anx_abc", "image/png").startsWith("sp_1/as_9/")).toBe(
      true,
    );
  });

  /**
   * Dois ambientes com o mesmo bem e o mesmo anexo — impossível na prática,
   * porque os ids são UUID — nunca podem cair no mesmo sítio. Se caíssem, o
   * `upsert: false` do envio transformava uma colisão em erro; mas o que não
   * pode é o caminho ignorar o ambiente.
   */
  it("ambientes diferentes nunca partilham caminho", () => {
    const a = caminhoDoAnexo("sp_1", "as_9", "anx_abc", "application/pdf");
    const b = caminhoDoAnexo("sp_2", "as_9", "anx_abc", "application/pdf");
    expect(a).not.toBe(b);
  });

  it("a extensão vem do tipo validado e não do que o cliente disser", () => {
    // O nome original nunca entra no caminho — nem sequer é um argumento.
    expect(caminhoDoAnexo("sp_1", "as_9", "anx_abc", "image/jpeg")).toBe("sp_1/as_9/anx_abc.jpg");
    expect(caminhoDoAnexo("sp_1", "as_9", "anx_abc", "aplicacao/inventada")).toBe(
      "sp_1/as_9/anx_abc.bin",
    );
  });
});
