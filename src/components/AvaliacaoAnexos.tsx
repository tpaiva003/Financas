"use client";

/**
 * Os documentos de uma empresa em estudo, e o resumo que a IA faz deles.
 *
 * Mesmo desenho dos anexos dos bens — o ficheiro vai direto para o Storage,
 * porque as Server Actions do Next têm tecto de 1 MB e um relatório anual passa
 * isso à vontade — e as mesmas três mensagens de erro distintas: "o servidor
 * recusou", "o envio falhou", "enviou mas não confirmei". Um "não deu" genérico
 * deixava a pessoa sem saber se o ficheiro está lá.
 *
 * **A IA lê e escreve prosa. Não devolve número nenhum para a app usar.** Seria
 * fácil pedir-lhe o fluxo de caixa livre e enfiá-lo no DCF, e nesse dia o valor
 * por ação passava a depender de um modelo a ler um PDF.
 */

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  apagarAnexoAvaliacaoAction,
  confirmarAnexoAvaliacaoAction,
  prepararAnexoAvaliacaoAction,
  resumirAnexosAction,
  type ActionState,
} from "@/app/(app)/actions";
import { ANEXO_MAX_BYTES, ANEXO_TIPOS } from "@/lib/domain";

export interface AnexoAvaliacaoView {
  id: string;
  fileName: string;
  sizeBytes: number;
}

const vazio: ActionState = {};

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toString().replace(".", ",")} MB`;
}

function BotaoResumir({ jaHa }: { jaHa: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending}>
      {pending ? "A ler…" : jaHa ? "Voltar a resumir" : "Resumir com IA"}
    </button>
  );
}

export function AvaliacaoAnexos({
  avaliacaoId,
  anexos,
  resumo,
  resumoEm,
  podeResumir,
}: {
  avaliacaoId: string;
  anexos: AnexoAvaliacaoView[];
  resumo: string | null;
  resumoEm: string | null;
  podeResumir: boolean;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [estadoResumo, resumir] = useFormState(resumirAnexosAction, vazio);

  async function enviar(file: File) {
    setErro(null);
    setAEnviar(true);
    try {
      const fd = new FormData();
      fd.set("valuationId", avaliacaoId);
      fd.set("fileName", file.name);
      fd.set("contentType", file.type);
      fd.set("sizeBytes", String(file.size));
      const preparado = await prepararAnexoAvaliacaoAction({}, fd);
      if (preparado.error || !preparado.uploadUrl || !preparado.anexoId) {
        setErro(preparado.error ?? "Não consegui preparar o envio.");
        return;
      }

      const res = await fetch(preparado.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!res.ok) {
        setErro("O envio falhou. O ficheiro não ficou guardado.");
        return;
      }

      const confirmado = await confirmarAnexoAvaliacaoAction(preparado.anexoId);
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

  return (
    <div className="space-y-3 border-t border-hair2 pt-3">
      <p className="text-xs font-medium text-fg-muted">Documentos</p>

      {anexos.length > 0 ? (
        <ul className="divide-y divide-hair2 rounded-lg border border-hair">
          {anexos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-fg" title={a.fileName}>
                {a.fileName}
              </span>
              <span className="font-mono text-[11px] text-fg-faint">{tamanho(a.sizeBytes)}</span>
              <form action={apagarAnexoAvaliacaoAction}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="btn-ghost px-1.5 text-[11px] text-debt">
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <label className="sr-only" htmlFor={`anx-${avaliacaoId}`}>
          Juntar documento
        </label>
        <input
          ref={campo}
          id={`anx-${avaliacaoId}`}
          type="file"
          accept={ANEXO_TIPOS.join(",")}
          disabled={aEnviar}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void enviar(f);
          }}
          className="input text-xs file:mr-2 file:rounded-full file:border-0 file:bg-panel2 file:px-2.5 file:py-1 file:text-[11px] file:text-fg-muted"
        />
        <p className="mt-1 text-[11px] text-fg-faint">
          Relatórios, apresentações, notas. Até {tamanho(ANEXO_MAX_BYTES)} por ficheiro.
        </p>
        {aEnviar ? <p className="mt-1 text-xs text-fg-muted">A enviar…</p> : null}
        {erro ? (
          <p role="alert" className="mt-1 text-xs text-debt">
            {erro}
          </p>
        ) : null}
      </div>

      {anexos.length > 0 && podeResumir ? (
        <form action={resumir} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={avaliacaoId} />
          <BotaoResumir jaHa={Boolean(resumo)} />
          {estadoResumo.error ? (
            <span role="alert" className="text-[11px] leading-snug text-debt">
              {estadoResumo.error}
            </span>
          ) : (
            <span className="text-[11px] leading-snug text-fg-faint">
              Lê os documentos e escreve o que percebeu. Não tira números para o
              cálculo: esses continuas a ser tu a pô-los.
            </span>
          )}
        </form>
      ) : null}

      {resumo ? (
        <div className="rounded-lg border border-hair bg-panel2/40 p-3">
          <p className="mb-1.5 text-[11px] text-fg-faint">
            Resumo dos documentos
            {resumoEm ? (
              <> · {new Date(resumoEm).toLocaleDateString("pt-PT")}</>
            ) : null}
            . Escrito por IA a partir do que está nos anexos: confere antes de decidir.
          </p>
          <div className="whitespace-pre-line text-xs leading-relaxed text-fg-muted">{resumo}</div>
        </div>
      ) : null}
    </div>
  );
}
