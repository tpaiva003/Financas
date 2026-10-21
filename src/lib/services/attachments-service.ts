/**
 * Anexos dos bens: escrituras, cadernetas, contratos, notas de liquidação.
 *
 * **O ficheiro nunca passa pela app.** As Server Actions do Next têm um tecto
 * de 1 MB por omissão e uma função da Vercel aceita ~4,5 MB de corpo; uma
 * escritura digitalizada passa os dois. Por isso o servidor emite um **URL de
 * envio assinado** e o browser fala diretamente com o Storage. O que atravessa
 * a app é o nome, o tipo e o tamanho — nunca os bytes.
 *
 * **O caminho é sempre construído aqui, nunca recebido.** Se o cliente
 * escolhesse o caminho, escolhia também a pasta: travessia de diretórios de
 * graça. O que ele envia é um id opaco.
 *
 * **O nome do ficheiro no Storage é o id, não o nome original.** "Escritura Rua
 * X 3Dto NIF 123.pdf" é ele próprio um dado pessoal, e a listagem de um bucket
 * não é sítio para ele. O nome verdadeiro fica na base de dados e volta no
 * cabeçalho da descarga, para o browser gravar "Escritura.pdf".
 *
 * **Apagar apaga mesmo.** Os recibos das despesas ficam no Storage para sempre
 * quando um ambiente é apagado — o que torna falsa a frase "apagamos os teus
 * dados". Com escrituras, que têm morada e número fiscal, seria bem pior. Por
 * isso o caminho começa pelo `space_id`: apagar um ambiente é remover um
 * prefixo.
 */

import { dataMode } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BUCKET = "asset-attachments";

/** Quanto tempo vale um URL de envio. Chega para escolher e enviar. */
const ENVIO_SEGUNDOS = 300;
/** Quanto tempo vale um URL de descarga. O suficiente para o browser o seguir. */
const DESCARGA_SEGUNDOS = 120;

/** A extensão sai do tipo validado, nunca do nome que o cliente mandou. */
const EXTENSAO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export function extensaoDoTipo(contentType: string): string {
  return EXTENSAO[contentType] ?? "bin";
}

/** `<space_id>/<asset_id>/<id>.<ext>`. Ver o cabeçalho para a ordem. */
export function caminhoDoAnexo(
  spaceId: string,
  assetId: string,
  anexoId: string,
  contentType: string,
): string {
  return `${spaceId}/${assetId}/${anexoId}.${extensaoDoTipo(contentType)}`;
}

/**
 * Um URL para o browser enviar o ficheiro diretamente ao Storage.
 *
 * `upsert: false` de propósito. O recibo de uma despesa usa `upsert: true`
 * porque o caminho é o id da despesa e há um só; aqui cada anexo tem id novo,
 * por isso uma colisão significa que alguma coisa está errada — e um upsert
 * apagaria em silêncio o ficheiro de outra pessoa.
 */
export async function signedUploadUrl(
  path: string,
): Promise<{ url: string; token: string } | null> {
  if (dataMode() !== "supabase") return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return null;
  return { url: data.signedUrl, token: data.token };
}

/**
 * Um URL de descarga, com o nome verdadeiro do ficheiro.
 *
 * O `download` faz o browser gravar "Escritura.pdf" em vez de "anx_9f3….pdf".
 */
export async function signedAttachmentUrl(
  path: string,
  fileName: string,
): Promise<string | null> {
  if (dataMode() !== "supabase") return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, DESCARGA_SEGUNDOS, { download: fileName });
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Tira o ficheiro do Storage.
 *
 * Falha calada: a linha já foi apagada, e deixar um ficheiro órfão é mau, mas
 * pior era o botão de apagar dar erro e a pessoa ficar a pensar que o anexo
 * continua lá.
 */
export async function removerAnexoDoStorage(path: string): Promise<void> {
  if (dataMode() !== "supabase") return;
  try {
    await getSupabaseAdmin().storage.from(BUCKET).remove([path]);
  } catch {
    // Ver o cabeçalho.
  }
}

/** Quanto o envio ainda vale, para a UI poder avisar. */
export const ENVIO_VALIDO_SEGUNDOS = ENVIO_SEGUNDOS;

/** `<space_id>/avaliacoes/<valuation_id>/<id>.<ext>`. Ver a migração 0038. */
export function caminhoDoAnexoDaAvaliacao(
  spaceId: string,
  valuationId: string,
  anexoId: string,
  contentType: string,
): string {
  return `${spaceId}/avaliacoes/${valuationId}/${anexoId}.${extensaoDoTipo(contentType)}`;
}

/**
 * Descarrega um anexo para o servidor o poder ler.
 *
 * **Só o servidor faz isto, e só para extrair texto.** O ficheiro não volta a
 * passar pelo browser: o que sobe para o modelo é texto, não bytes, e o que o
 * ecrã mostra é o resumo.
 *
 * Devolve `null` em vez de atirar. Um anexo que desapareceu do Storage não pode
 * deitar abaixo o resumo dos outros sete.
 */
export async function descarregarAnexo(path: string): Promise<Buffer | null> {
  if (dataMode() !== "supabase") return null;
  try {
    const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}
