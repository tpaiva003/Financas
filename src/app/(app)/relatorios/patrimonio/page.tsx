import { AnalisePatrimonioContent } from "@/components/AnalisePatrimonioContent";

export const metadata = { title: "Análise do património · Rachar" };
export const dynamic = "force-dynamic";
/**
 * Esta página hospeda o botão que vai buscar os setores, e esse vai à rede uma
 * vez por investimento. Com o tecto normal de uma função (dez segundos) o lote
 * mal arrancava; aqui pede-se o tempo que ele precisa para tratar a carteira
 * toda de uma vez. A Vercel corta pelo máximo do plano se for menos.
 */
export const maxDuration = 60;

export default function Page() {
  return <AnalisePatrimonioContent />;
}
