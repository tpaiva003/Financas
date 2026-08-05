import { LegalLayout } from "@/components/LegalLayout";
import { NewPasswordForm } from "@/components/NewPasswordForm";

export const metadata = { title: "Nova palavra-chave · Rachar" };

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
