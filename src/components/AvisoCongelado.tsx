/**
 * A explicação de um ambiente congelado, e a saída.
 *
 * **Um bloqueio sem explicação é o pior desfecho possível desta funcionalidade.**
 * Chegar à app, carregar em «Gravar» e receber um erro é o que acontece quando
 * o congelamento existe na base de dados e não existe no ecrã. Por isso o aviso
 * aparece antes de se tentar seja o que for, diz porque está assim, garante o
 * que não aconteceu — não se apagou nada — e traz o botão que resolve.
 *
 * Fica no layout e não numa página: o estado vale em toda a app, e quem entra
 * pelo saldo ou pelo património tem de o ver na mesma.
 */

import { reativarAmbienteAction } from "@/app/(app)/actions";

export function AvisoCongelado({ podeReativar }: { podeReativar: boolean }) {
  return (
    <div
      role="status"
      className="mb-6 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm"
    >
      <p className="font-medium text-fg">Este ambiente está congelado.</p>
      <p className="mt-1 leading-snug text-fg-muted">
        Esteve muito tempo sem ser aberto, e por isso passou a só de leitura.{" "}
        {/* A primeira pergunta de quem lê isto é sempre a mesma, e é melhor
            respondê-la antes de ser feita. */}
        <span className="text-fg">Não se apagou nada</span> — está tudo aqui, como
        estava.
      </p>
      {podeReativar ? (
        <form action={reativarAmbienteAction} className="mt-3">
          <button
            type="submit"
            className="rounded-full bg-fg px-4 py-2 text-xs font-medium text-bg"
          >
            Reativar
          </button>
        </form>
      ) : (
        <p className="mt-2 text-xs text-fg-faint">
          Quem administra este ambiente pode reativá-lo.
        </p>
      )}
    </div>
  );
}
