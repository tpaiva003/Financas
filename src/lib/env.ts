/**
 * Acesso centralizado a variáveis de ambiente, com validação leve.
 *
 * Nunca commitar segredos. Ver `.env.example`.
 */

/** Emails autorizados (allow-list). Default: os dois demo, para dev funcionar. */
export function allowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? "tiago@example.com,clara@example.com";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.toLowerCase());
}

/** Login de desenvolvimento (sem SSO real). NUNCA ligar em produção. */
export function isDevLoginEnabled(): boolean {
  return process.env.AUTH_DEV_LOGIN === "true";
}

/**
 * Modo de dados. "mock" usa um repositório em memória (app navegável sem
 * Supabase). "supabase" usa o Supabase real. Default: mock se faltar config.
 */
export function dataMode(): "mock" | "supabase" {
  const explicit = process.env.APP_DATA_MODE;
  if (explicit === "supabase" || explicit === "mock") return explicit;
  const hasSupabase =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return hasSupabase ? "supabase" : "mock";
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};
