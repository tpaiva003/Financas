import Link from "next/link";
import { LegalLayout } from "@/components/LegalLayout";
import { RequestResetForm } from "@/components/RequestResetForm";

export const metadata = { title: "Recuperar acesso · Rachar" };

export default function RecuperarPage() {
  return (
    <LegalLayout
      title="Recuperar acesso"
      updated="5 de agosto de 2026"
      intro="Escreve o email com que entras e enviamos-te uma ligação para definires uma palavra-chave nova."
    >
      <RequestResetForm />
      <p className="text-sm text-fg-faint">
        <Link href="/login" className="underline underline-offset-2 hover:text-fg-muted">
          Voltar ao início de sessão
        </Link>
      </p>
    </LegalLayout>
  );
}
