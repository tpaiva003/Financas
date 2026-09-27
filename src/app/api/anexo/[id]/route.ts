/**
 * Descarregar um anexo de um bem.
 *
 * **Esta rota é a porta de uma escritura**, que tem morada e número fiscal. A
 * verificação é feita aqui por inteiro e não se apoia no middleware: o
 * middleware é a primeira porta, não a única.
 *
 * **O `submitter` não entra.** Ele é redirecionado em `/patrimonio` e não vê
 * bens nenhuns; sem esta linha, esta rota seria a única porta do património que
 * ele conseguiria abrir — e logo a que tem a escritura atrás.
 *
 * **Um id de outro ambiente e um id inventado respondem igual.** Se um deles
 * dissesse "não tens acesso" e o outro "não existe", a rota passava a confirmar
 * a existência de coisas a quem tentasse.
 */

import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { signedAttachmentUrl } from "@/lib/services/attachments-service";

export const dynamic = "force-dynamic";

/** A mesma resposta para tudo o que não se pode descarregar. Ver o cabeçalho. */
function naoExiste(): Response {
  return new Response("Não encontrado.", { status: 404 });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") return naoExiste();

  // Numa consulta só, com o ambiente lá dentro. Ler pelo id e comparar depois
  // em JS é a comparação que as pessoas se esquecem de escrever — e aqui tudo
  // corre com a chave de serviço, que ignora o RLS.
  const anexo = await getRepository()
    .getAssetAttachment(params.id, ctx.space.id)
    .catch(() => null);
  // Um anexo que ficou pelo caminho não se descarrega: o ficheiro pode nem
  // existir, e um erro do Storage aqui traria o caminho completo lá dentro.
  if (!anexo || anexo.status !== "pronto") return naoExiste();

  const url = await signedAttachmentUrl(anexo.storagePath, anexo.fileName);
  if (!url) return naoExiste();

  /*
   * Construída à mão em vez de `Response.redirect`, que não deixa pôr
   * cabeçalhos. Um URL assinado numa cache partilhada, ou passado adiante num
   * `Referer`, sobrevive à verificação que acabou de ser feita.
   */
  return new Response(null, {
    status: 307,
    headers: {
      Location: url,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
