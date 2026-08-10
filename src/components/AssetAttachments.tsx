"use client";

/**
 * Os anexos de um bem: escritura, caderneta, contrato, notas de liquidação.
 *
 * **O ficheiro vai direto para o Storage.** O servidor valida o nome, o tipo e
 * o tamanho, devolve um endereço de envio assinado, e o browser fala com o
 * Storage sem passar pela app — as Server Actions do Next têm tecto de 1 MB e
 * uma função da Vercel ~4,5 MB, e uma escritura digitalizada passa os dois.
 *
 * São três passos e por isso há três coisas que podem correr mal. Cada uma diz
 * o que foi: "o servidor recusou", "o envio falhou", "enviou mas não confirmei".
 * Um "não deu" genérico deixava a pessoa sem saber se o ficheiro está lá ou não
 * — e num sítio onde ela acabou de pôr a escritura da casa, isso não serve.
 */

import { useRef, useState } from "react";
import {
  apagarAnexoAction,
  confirmarAnexoAction,
  prepararAnexoAction,
} from "@/app/(app)/actions";
import { ANEXO_MAX_BYTES, ANEXO_TIPOS } from "@/lib/domain";

export interface AnexoView {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt?: string | null;
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toString().replace(".", ",")} MB`;
}

export function AssetAttachments({
  assetId,
  anexos,
}: {
  assetId: string;
  /**
   * `null` quer dizer "não consegui ler", e não "não há nenhum".
   *
   * A diferença não é fineza. Se a migração dos anexos ainda não correu, a
   * leitura rebenta; mostrar uma lista vazia com o botão de juntar ao lado
   * dizia a quem tem lá a escritura que ela desapareceu — e depois o envio
   * falhava na mesma. É o mesmo modo de falha que apagou o património inteiro
   * do ecrã há dois dias: um erro de esquema com ar de conta vazia.
   */
  anexos: AnexoView[] | null;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  async function enviar(file: File) {
    setErro(null);
    setAEnviar(true);
    try {
      // 1. O servidor decide, reserva a linha e diz para onde enviar. Sobem o
      //    nome, o tipo e o tamanho — nunca os bytes.
      const fd = new FormData();
      fd.set("assetId", assetId);
      fd.set("fileName", file.name);
      fd.set("contentType", file.type);
      fd.set("sizeBytes", String(file.size));
      const preparado = await prepararAnexoAction({}, fd);
      if (preparado.error || !preparado.uploadUrl || !preparado.anexoId) {
        setErro(preparado.error ?? "Não consegui preparar o envio.");
        return;
      }

      // 2. Os bytes vão direto para o Storage.
      const res = await fetch(preparado.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!res.ok) {
        setErro("O envio falhou. O ficheiro não ficou guardado.");
        return;
      }

      // 3. Só agora conta. Sem esta confirmação, um envio interrompido deixava
      //    uma linha a prometer um ficheiro que não está lá.
      const confirmado = await confirmarAnexoAction(preparado.anexoId);
      if (confirmado.error) {
        setErro("O ficheiro foi enviado mas não consegui confirmá-lo. Tenta outra vez.");
        return;
      }
      if (campo.current) campo.current.value = "";
    } catch {
      setErro("O envio falhou. O ficheiro não ficou guardado.");
    } finally {
      setAEnviar(false);
    }
  }

  if (anexos === null) {
    return (
      <section className="card p-5">
        <p className="eyebrow mb-1">Documentos</p>
        <p role="alert" className="text-xs leading-snug text-fg-muted">
          Não consegui ler os documentos deste registo. Falta correr a migração
          que cria a tabela dos anexos. Não é que não haja nenhum — é que ainda
          não sei; por isso também não te deixo juntar mais, para não perderes
          um ficheiro num sítio que não existe.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <p className="eyebrow mb-1">Documentos</p>
      <p className="mb-3 text-xs leading-snug text-fg-faint">
        A escritura, a caderneta, o contrato, as notas de liquidação. Ficam
        guardados em privado e só se abrem a partir daqui — nunca por um endereço
        que se possa passar a alguém. Até {tamanho(ANEXO_MAX_BYTES)} por ficheiro,
        em PDF ou imagem.
      </p>

      {anexos.length > 0 ? (
        <ul className="mb-3 divide-y divide-hair2 rounded-xl border border-hair">
          {anexos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <a
                href={`/api/anexo/${a.id}`}
                className="min-w-0 flex-1 truncate text-sm text-fg underline-offset-4 hover:underline"
                title={a.fileName}
              >
                {a.fileName}
              </a>
              <span className="font-mono text-[11px] text-fg-faint">{tamanho(a.sizeBytes)}</span>
              <form action={apagarAnexoAction}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="btn-ghost px-2 text-xs text-debt hover:text-debt">
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="label" htmlFor={`anexo-${assetId}`}>
        Juntar documento
      </label>
      <input
        ref={campo}
        id={`anexo-${assetId}`}
        type="file"
        accept={ANEXO_TIPOS.join(",")}
        disabled={aEnviar}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void enviar(f);
        }}
        className="input text-xs file:mr-2 file:rounded-full file:border-0 file:bg-panel2 file:px-3 file:py-1 file:text-xs file:text-fg-muted"
      />
      {aEnviar ? <p className="mt-2 text-xs text-fg-muted">A enviar…</p> : null}
      {erro ? (
        <p role="alert" className="mt-2 text-xs text-debt">{erro}</p>
      ) : null}
    </section>
  );
}
