import { LegalLayout } from "@/components/LegalLayout";
import { NewPasswordForm } from "@/components/NewPasswordForm";

// `noindex`: cada URL destas carrega um token de uso único — não é para
// aparecer em lado nenhum, nem sequer como "página encontrada".
export const metadata = {
  title: "Nova palavra-chave · Rachar",
  robots: { index: false, follow: false },
};

export default function NovaPalavraChavePage({ params }: { params: { token: string } }) {
  return (
    <LegalLayout
      title="Nova palavra-chave"
      updated="5 de agosto de 2026"
      intro="Escolhe uma palavra-chave nova. Esta ligação só serve uma vez."
    >
      <NewPasswordForm token={params.token} />
    </LegalLayout>
  );
}
