import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata = {
  title: "Termos · Rachar",
  description: "As regras de utilização da Rachar, em português corrente.",
};

export default function TermosPage() {
  return (
    <LegalLayout
      title="Termos de utilização"
      updated="5 de agosto de 2026"
      intro="As regras do que podes esperar da Rachar e do que esperamos de ti. Sem letra pequena: se algo aqui te parecer injusto, diz."
    >
      <LegalSection title="O que a Rachar é">
        <p>
          Uma aplicação para registar despesas partilhadas, dividi-las e saber
          quem deve a quem. Serve também para acompanhares o teu património e
          fazeres contas sobre o futuro.
        </p>
        <p>
          <strong>Não é aconselhamento financeiro.</strong> As calculadoras
          (independência financeira, médias, projeções) são exercícios com os
          números que tu escreves e os pressupostos que tu escolhes. Não sabem
          nada sobre a tua vida, os teus impostos ou o teu risco, e não devem ser
          a única base de uma decisão importante.
        </p>
      </LegalSection>

      <LegalSection title="A tua conta">
        <p>
          O acesso é por convite ou por conta Google. És responsável por manter a
          tua palavra-chave em segredo e por aquilo que for feito com a tua
          conta. Se suspeitares que alguém lhe acedeu, escreve-nos.
        </p>
        <p>
          Se partilhas um ambiente com outras pessoas, elas veem as despesas
          partilhadas desse ambiente. É esse o objetivo. Pensa nisso antes de
          registares algo que preferes guardar para ti, ou marca-o como pessoal.
        </p>
      </LegalSection>

      <LegalSection title="Os dados são teus">
        <p>
          O que escreves na Rachar pertence-te. Podes exportar tudo em CSV a
          qualquer momento, sem pedir autorização, e podes pedir que apaguemos a
          tua conta.
        </p>
        <p>
          Também significa que és tu o responsável pelo que registas: se
          carregares um extrato, estás a dizer que tens o direito de o fazer.
        </p>
      </LegalSection>

      <LegalSection title="Exatidão">
        <p>
          Fazemos os cálculos com cuidado e temos testes automáticos para os
          proteger, mas a app trabalha com o que lhe deres. Uma despesa mal
          registada dá um saldo errado, e nós não temos maneira de saber. Confere
          os valores antes de acertarem contas.
        </p>
        <p>
          A importação de extratos tenta evitar duplicados e avisa quando está a
          mexer num período que já tem informação. Continua a ser boa ideia
          revê-la antes de confirmar.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilidade">
        <p>
          A Rachar está em desenvolvimento e é oferecida como está. Pode ter
          falhas, pode estar indisponível e pode mudar. Avisaremos com
          antecedência se algum dia deixar de funcionar, com tempo para levares
          os teus dados.
        </p>
      </LegalSection>

      <LegalSection title="Uso indevido">
        <p>
          Pedimos o óbvio: não tentes aceder a ambientes que não são teus, não
          uses a app para nada ilegal e não a sobrecarregues de propósito. Contas
          que o façam podem ser suspensas.
        </p>
      </LegalSection>

      <LegalSection title="Alterações e contacto">
        <p>
          Se estes termos mudarem de forma relevante, avisamos. Para qualquer
          questão,{" "}
          <a href="mailto:ola@rachar.pt" className="underline underline-offset-2">
            ola@rachar.pt
          </a>
          . Aplica-se a lei portuguesa.
        </p>
      </LegalSection>

      <p className="mt-10 text-sm text-fg-faint">
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-fg-muted">
          Política de privacidade
        </Link>
      </p>
    </LegalLayout>
  );
}
