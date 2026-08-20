import Link from "next/link";
import { LegalLayout } from "@/components/LegalLayout";
import { AcceptInviteForm } from "@/components/AcceptInviteForm";
import { getRepository } from "@/lib/data";
import { hashToken } from "@/lib/tokens";

// `noindex`: cada URL destas carrega um token de uso único.
export const metadata = {
  title: "Convite · Rachar",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * A página onde um convite se aceita — pública, porque quem chega aqui ainda
 * não tem conta nenhuma (a conta nasce no aceite).
 *
 * Mostra-se ONDE se vai entrar e COM que email antes de pedir seja o que for:
 * aceitar às cegas não é consentir. E um convite morto diz-se já, em vez de
 * deixar a pessoa escolher uma palavra-chave para um formulário que ia falhar.
 */
export default async function ConvitePage({ params }: { params: { token: string } }) {
  const repo = getRepository();
  const convite = await repo.peekMemberInvite(hashToken(params.token)).catch(() => null);

  if (!convite) {
    return (
      <LegalLayout
        title="Convite"
        updated="18 de agosto de 2026"
        intro="Esta ligação já foi usada, foi cancelada ou expirou."
      >
        <p className="text-sm text-fg-muted">
          Os convites valem sete dias e servem uma vez só. Pede um novo a quem te
          convidou, ou, se já aceitaste, <Link href="/login" className="underline">entra aqui</Link>.
        </p>
      </LegalLayout>
    );
  }

  const [space, members] = await Promise.all([
    repo.getSpace(convite.spaceId).catch(() => null),
    repo.listMembers(convite.spaceId).catch(() => []),
  ]);
  const memberName = members.find((m) => m.id === convite.memberId)?.name ?? "";

  return (
    <LegalLayout
      title="Foste convidado"
      updated="18 de agosto de 2026"
      intro={`Convidaram-te para submeter despesas no ambiente «${space?.name ?? "?"}». Vais entrar com o email ${convite.email}.`}
    >
      <p className="mb-4 text-sm text-fg-muted">
        {memberName ? `Ficas ligado ao participante «${memberName}». ` : ""}
        As despesas que submeteres ficam pendentes até um membro pleno as aprovar.
        Se não estavas à espera deste convite, fecha esta página: não é criada
        conta nenhuma sem escolheres uma palavra-chave.
      </p>
      <AcceptInviteForm token={params.token} />
    </LegalLayout>
  );
}
