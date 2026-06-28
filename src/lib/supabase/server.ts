/**
 * Cliente Supabase para uso EXCLUSIVO no servidor (Server Components / Server
 * Actions / Route Handlers). Usa a service-role key — NUNCA expor ao browser.
 *
 * Nota de arquitetura (ver DECISOES.md): no MVP, todo o acesso a dados é
 * server-side com a service-role key e as regras de privacidade são aplicadas
 * na camada de aplicação (ver MockRepository/SupabaseRepository). As políticas
 * RLS na base de dados são defesa em profundidade para o dia em que houver
 * acesso direto a partir do cliente.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new Error(
      "Supabase não configurado: define NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
