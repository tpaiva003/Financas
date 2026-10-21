import { redirect } from "next/navigation";

/**
 * O endereço antigo da avaliação, que agora aponta para a que ficou.
 *
 * **Havia duas páginas chamadas "Avaliação" no mesmo menu**, as duas a avaliar
 * empresas por fluxos de caixa. Esta era a primeira: uma folha de rascunho que
 * não guardava nada. A outra (`/patrimonio/dcf`) faz a mesma conta, guarda o
 * estudo com os pressupostos do dia, e liga-se ao funil — quem avalia uma
 * empresa quer quase sempre voltar ao número, e aqui o número morria ao fechar
 * o separador.
 *
 * Fica o redirecionamento e não um 404: quem tiver isto nos favoritos ou num
 * link antigo aterra no sítio certo em vez de numa parede.
 */
export default function Page() {
  redirect("/patrimonio/dcf");
}
