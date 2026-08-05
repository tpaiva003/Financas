/**
 * Quem pode entrar na app.
 *
 * A regra vivia espalhada e assumia o mundo antigo, em que a app era só para
 * duas pessoas: o SSO só deixava entrar os emails da lista das variáveis de
 * ambiente. Depois de a app passar a ter contas na base de dados, isso deixou
 * de bater certo, quem fosse convidado entrava por palavra-chave mas era
 * barrado no SSO, sem explicação nenhuma.
 *
 * Lógica pura, para a decisão ser óbvia de ler e de testar.
 */

export type AuthProvider = "password" | "google" | "microsoft-entra-id" | (string & {});

export interface AccessInput {
  provider: AuthProvider;
  /** O email está na lista das variáveis de ambiente (os donos da casa). */
  isEnvAllowed: boolean;
  /** Já existe uma conta na app com este email. */
  hasAccount: boolean;
  /**
   * Qualquer pessoa se pode registar sozinha pelo SSO. Desligado por omissão:
   * abrir o registo é uma decisão de produto, não um acidente de configuração.
   */
  openRegistration: boolean;
}

export type AccessDecision =
  | { allow: true; reason: "env" | "conta" | "registo-aberto" | "palavra-chave" }
  | { allow: false; reason: "sem-convite" };

export function decideAccess(input: AccessInput): AccessDecision {
  // O login por palavra-chave já foi validado antes (a conta tem de existir e
  // a palavra-chave tem de bater certo). Aqui não se repete esse trabalho.
  if (input.provider === "password") return { allow: true, reason: "palavra-chave" };

  if (input.isEnvAllowed) return { allow: true, reason: "env" };
  if (input.hasAccount) return { allow: true, reason: "conta" };
  if (input.openRegistration) return { allow: true, reason: "registo-aberto" };

  return { allow: false, reason: "sem-convite" };
}

/** Atalho para o callback do Auth.js. */
export function canSignIn(input: AccessInput): boolean {
  return decideAccess(input).allow;
}
