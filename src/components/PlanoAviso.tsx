import { getRepository } from "@/lib/data";
import { checkLimit, type LimitKind, type SpacePlan } from "@/lib/domain";

/**
 * Diz quanto falta até ao tecto — **antes** de acabar, não depois.
 *
 * Um tecto que só se anuncia quando já bateu faz a pessoa sentir-se enganada:
 * escreveu a despesa, carregou em gravar, e levou com um "não dá". Vendo-o
 * chegar, decide — apaga o que não interessa, ou percebe que precisa de mais.
 *
 * Fica calado enquanto houver espaço de sobra. Um aviso permanente é ruído, e
 * ruído ensina-se a ignorar; quando aparecer, é porque vale a pena ler.
 */
export async function PlanoAviso({
  spaceId,
  plan,
  kind,
}: {
  spaceId: string;
  plan: SpacePlan | undefined;
  kind: Extract<LimitKind, "expenses" | "assets" | "members">;
}) {
  if ((plan ?? "free") === "full") return null;

  const atuais = await getRepository()
    .countInSpace(spaceId, kind)
    .catch(() => null);
  // Se não se conseguiu contar, não se inventa um aviso. Um alarme falso sobre
  // limites é pior do que nenhum: mina a confiança nos que são verdadeiros.
  if (atuais === null) return null;

  const check = checkLimit(kind, atuais, "free");
  if (!check.nearLimit || !check.message) return null;

  return (
    <p
      role="status"
      className={`rounded-xl border px-4 py-2.5 text-xs ${
        check.allowed
          ? "border-hair bg-panel2 text-fg-muted"
          : "border-debt/30 bg-debt/10 text-debt"
      }`}
    >
      {check.message}
      {check.limit !== null ? (
        <span className="text-fg-faint">
          {" "}
          ({atuais} de {check.limit})
        </span>
      ) : null}
    </p>
  );
}
