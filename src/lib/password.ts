/**
 * Hashing de palavra-chave com Web Crypto (PBKDF2-SHA256).
 *
 * Usa apenas APIs disponíveis em Node e no edge (globalThis.crypto.subtle),
 * por isso não quebra o bundling do middleware nem precisa de dependências.
 * Formato guardado: pbkdf2$<iterações>$<saltB64>$<hashB64>.
 */

/**
 * 600 mil, a recomendação da OWASP para PBKDF2-HMAC-SHA256 (2023+).
 *
 * Era 100 mil. Subir não parte nada: o formato guarda as iterações de cada
 * hash, o `verifyPassword` respeita as guardadas, e quem entra com um hash
 * antigo é promovido nesse momento (ver o `authorize` em `auth.ts`) — porque é
 * o único momento em que a palavra-chave existe em claro para se re-hashear.
 * Um derive a 600 mil custa ~100ms neste hardware; num login não se sente.
 */
const ITERATIONS = 600_000;
const KEY_LEN = 32;

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = fromB64(parts[2]!);
  const expected = fromB64(parts[3]!);
  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  // comparação em tempo constante
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

/**
 * Este hash ficou para trás das iterações atuais?
 *
 * Só se pode responder no login: é o único sítio onde a palavra-chave em claro
 * existe para gerar o hash novo. Um formato irreconhecível também conta como
 * "sim" — se um dia o formato mudar, os antigos vão sendo promovidos à medida
 * que as pessoas entram.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return true;
  return Number(parts[1]) < ITERATIONS;
}

/** Regras mínimas para a palavra-chave. */
export function passwordIssue(password: string): string | null {
  if (password.length < 6) return "A palavra-chave tem de ter pelo menos 6 caracteres.";
  if (password.length > 200) return "Palavra-chave demasiado longa.";
  return null;
}
