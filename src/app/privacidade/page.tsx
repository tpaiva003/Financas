import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata = {
  title: "Privacidade · Rachar",
  description: "Que dados a Rachar guarda, onde ficam e o que podes fazer com eles.",
};

/**
 * Política de privacidade.
 *
 * Escrita a partir do que a app FAZ, não de um modelo genérico. Se o
 * comportamento mudar (novos dados, novos subcontratantes, análise de
 * utilização), esta página tem de mudar com ele.
 */
export default function PrivacidadePage() {
  return (
    <LegalLayout
      title="Privacidade"
      updated="16 de agosto de 2026"
      intro="Isto descreve o que a Rachar guarda, porquê, onde fica e o que podes fazer para o tirar de lá. Está escrito em português corrente e de propósito: uma política que ninguém percebe não protege ninguém."
    >
      <LegalSection title="Quem é responsável">
        <p>
          A Rachar é gerida pela <strong>Desperta Dedicação Unipessoal Lda.</strong>,
          com sede na Praceta Alferes Pereira 210, 4400-099 Vila Nova de Gaia, e
          NIF <strong>514089784</strong>. Para
          qualquer questão sobre os teus dados, escreve para{" "}
          <a href="mailto:ola@rachar.pt" className="underline underline-offset-2">
            ola@rachar.pt
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Que dados guardamos">
        <ul>
          <li>
            <strong>Identificação.</strong> Nome e email. Vêm do convite que
            recebeste ou da conta Google com que entras.
          </li>
          <li>
            <strong>Despesas.</strong> Descrição, valor, data, categoria, quem
            pagou e como se divide. É o coração da app.
          </li>
          <li>
            <strong>Movimentos de extratos que carregues.</strong> Quando
            importas um extrato, guardamos os movimentos que escolheres importar,
            com a mesma informação de uma despesa. Não guardamos o ficheiro
            original nem números de conta ou de cartão.
          </li>
          <li>
            <strong>Património</strong>, se o usares: nomes dos bens, valores,
            quantidades e preços que escreveres.
          </li>
          <li>
            <strong>Recibos</strong>, se anexares fotografias ou PDF.
          </li>
          <li>
            <strong>Palavra-chave</strong>, guardada cifrada e em sentido único
            (PBKDF2). Nem nós a conseguimos ler.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="O que não fazemos">
        <ul>
          <li>Não há publicidade, nem dentro nem fora da app.</li>
          <li>Não vendemos nem partilhamos os teus dados com quem quer que seja.</li>
          <li>
            Não usamos ferramentas de análise de utilização nem seguimos o teu
            comportamento entre sites.
          </li>
          <li>Não ligamos a app às tuas contas bancárias. És tu que trazes os dados.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Onde ficam">
        <p>
          Numa base de dados alojada pela <strong>Supabase</strong> na Irlanda
          (União Europeia). A aplicação corre na <strong>Vercel</strong>. Os
          emails que a app envia (recuperação de palavra-chave) passam pela{" "}
          <strong>Resend</strong>. Se entrares com a Google, a Google confirma a
          tua identidade e diz-nos o teu nome e email.
        </p>
        <p>
          Estas quatro empresas são as únicas que tocam nos dados, e só para
          fazerem o serviço que lhes pedimos.
        </p>
      </LegalSection>

      <LegalSection title="Quem vê o quê">
        <p>
          Cada ambiente é isolado: só vê um ambiente quem for participante dele.
          Dentro de um ambiente partilhado, as despesas partilhadas são visíveis
          a todos os participantes, porque é isso que permite acertar contas. As
          despesas que marcares como pessoais só as vês tu, a não ser que
          escolhas mostrá-las.
        </p>
        <p>
          Quem administra a plataforma tem acesso técnico à base de dados, como é
          inevitável em qualquer serviço alojado. A app não tem nenhum ecrã que
          mostre as despesas de outra pessoa, e a consola de gestão mostra apenas
          contagens e datas, nunca valores nem descrições.
        </p>
      </LegalSection>

      <LegalSection title="Durante quanto tempo">
        <p>
          Enquanto tiveres conta. Se pedires para apagar, apagamos os teus dados
          e os ambientes onde fores a única pessoa. Em ambientes partilhados, as
          despesas que criaste podem ter de continuar visíveis para as contas das
          outras pessoas fecharem, e nesse caso deixam de estar ligadas ao teu
          nome.
        </p>
        <p>
          Nos <strong>ambientes gratuitos</strong> há mais uma regra: ao fim de{" "}
          <strong>90 dias sem ninguém entrar</strong>, o ambiente congela — passa
          a só de leitura. Avisamos por email duas semanas antes, e{" "}
          <strong>não se apaga nada</strong>: fica tudo onde está, e basta
          entrares (ou carregares em «Reativar») para voltar ao normal, sem
          pedir nada a ninguém. Fazemos isto para não guardar indefinidamente
          dados financeiros de contas que ninguém usa — guardar para sempre
          também é um risco para ti. Os ambientes do plano completo não são
          abrangidos.
        </p>
      </LegalSection>

      <LegalSection title="Lista de espera">
        <p>
          Se deixares o teu email na lista de espera, guardamos esse email, o
          nome se o deres, a data e o teu consentimento — e usamo-lo para uma
          coisa só: avisar-te quando houver vaga. Sem novidades, sem
          publicidade. Se quiseres sair da lista antes disso, escreve para{" "}
          <a href="mailto:ola@rachar.pt" className="underline underline-offset-2">
            ola@rachar.pt
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Os teus direitos">
        <p>
          Podes pedir acesso, correção, apagamento, ou levar os teus dados para
          outro lado. A exportação em CSV está dentro da app, em Relatórios, e
          não precisas de pedir licença a ninguém para a usar.
        </p>
        <p>
          Para o resto, escreve para{" "}
          <a href="mailto:ola@rachar.pt" className="underline underline-offset-2">
            ola@rachar.pt
          </a>
          . Se achares que não tratámos bem o assunto, podes reclamar à Comissão
          Nacional de Proteção de Dados.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Um cookie para manteres a sessão iniciada, e outro para lembrar em que
          ambiente estavas. A escolha entre tema de dia e de noite fica guardada
          no teu aparelho. Não há cookies de publicidade nem de análise, por isso
          também não há aquele aviso a tapar o ecrã.
        </p>
      </LegalSection>

      <p className="mt-10 text-sm text-fg-faint">
        <Link href="/termos" className="underline underline-offset-2 hover:text-fg-muted">
          Termos de utilização
        </Link>
      </p>
    </LegalLayout>
  );
}
