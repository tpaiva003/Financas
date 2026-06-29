/**
 * Recibos: upload e URLs assinados (armazenamento privado no Supabase Storage).
 *
 * Só funciona em modo "supabase" (em mock não há storage; o upload é ignorado).
 * Tudo passa pela service-role no servidor; o bucket é privado e os ficheiros
 * só são acessíveis por URL assinado de curta duração.
 */

import { dataMode } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BUCKET = "receipts";

function isUploadable(file: unknown): file is File {
  return (
    typeof file === "object" &&
    file !== null &&
    "arrayBuffer" in file &&
    "size" in file &&
    (file as File).size > 0
  );
}

export async function uploadReceipt(
  expenseId: string,
  spaceId: string,
  file: unknown,
): Promise<string | null> {
  if (dataMode() !== "supabase" || !isUploadable(file)) return null;
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${spaceId}/${expenseId}.${ext}`;
  const db = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedReceiptUrl(path: string, expiresIn = 120): Promise<string | null> {
  if (dataMode() !== "supabase") return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}
