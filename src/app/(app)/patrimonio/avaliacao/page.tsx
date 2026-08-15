import { ValuationCalculator } from "@/components/ValuationCalculator";

export const metadata = { title: "Avaliação · Rachar" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="label">Património</p>
        <h1 className="text-2xl">Avaliação</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Quanto vale uma empresa pelos fluxos de caixa que gera. Os números não
          ficam guardados — é uma folha de rascunho.
        </p>
      </header>

      <p className="max-w-2xl rounded-lg border border-line bg-bg-subtle p-4 text-sm text-fg-muted">
        Isto não é aconselhamento financeiro e não substitui ler o relatório da
        empresa. O resultado depende inteiramente do que escreveres: mudar a taxa
        de desconto em um ponto percentual muda o valor por ação em dezenas de por
        cento. É por isso que aparecem três cenários e não um número.
      </p>

      <ValuationCalculator />
    </div>
  );
}
