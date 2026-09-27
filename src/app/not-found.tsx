import Link from "next/link";

export const metadata = { title: "Página não encontrada · Rachar" };

/**
 * Um 404 com saída.
 *
 * O 404 por omissão do Next não tem sequer um link de volta, e num telemóvel
 * instalado como PWA não há barra de endereço para escrever outro sítio.
 */
export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Esta página não existe</h1>
      <p className="mt-3 text-sm text-fg-muted">
        Ou o endereço está trocado, ou aquilo que procuras foi apagado.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/dashboard" className="btn-primary">
          Ir para o início
        </Link>
        <Link href="/despesas" className="btn-secondary">
          Ver despesas
        </Link>
      </div>
    </main>
  );
}
