/**
 * Leitura de ficheiros de extrato para uma grelha de células (server-side).
 *
 * Suporta Excel (.xlsx/.xls) e texto (.csv/.txt) com deteção do separador.
 * Devolve sempre `string[][]` cru: a interpretação (que coluna é o quê) fica
 * em `columns.ts`, que é puro e testado.
 *
 * NOTA DE SEGURANÇA: lemos as folhas em modo de arrays (`header: 1`), sem
 * construir objetos a partir dos cabeçalhos do ficheiro. Isso evita a via de
 * prototype pollution conhecida em xlsx@0.18.5 (a última publicada no npm).
 * Só os dois utilizadores autenticados podem carregar ficheiros.
 */

import * as XLSX from "xlsx";
import type { Grid } from "./columns";
import { universoLinesToGrid } from "./pdf-universo";

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024; // 8 MB

/** Divide uma linha de CSV respeitando aspas ("a,b" fica numa só célula). */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** O separador mais frequente nas primeiras linhas (fora de aspas). */
function detectSeparator(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of sample) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]! += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
}

function readCsv(buf: Buffer): Grid {
  // Remove BOM, que faria o primeiro cabeçalho não casar.
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const sep = detectSeparator(text);
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => splitCsvLine(l, sep));
}

function readXlsx(buf: Buffer): Grid {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  // header: 1 => matriz de arrays (nunca objetos com chaves do ficheiro).
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  return rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => {
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return cell == null ? "" : String(cell).trim();
    }),
  );
}

/**
 * Extrai o texto de um PDF e converte-o em grelha. Para já só o extrato do
 * cartão Universo; outros PDFs devolvem vazio (a UI explica que não reconheceu).
 */
async function readPdf(buf: Buffer): Promise<Grid> {
  // Import dinâmico: a biblioteca só é carregada quando há mesmo um PDF.
  // Usamos o módulo interno porque o index de `pdf-parse` tem um bloco de debug
  // que tenta ler um ficheiro de teste do próprio pacote quando empacotado.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buf);
  const lines = data.text.split("\n").map((l) => l.trim());
  return universoLinesToGrid(lines);
}

/** Lê o ficheiro carregado para uma grelha de células. */
export async function readUploadToGrid(file: File): Promise<Grid> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = (file.name ?? "").toLowerCase();
  const isText = name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv");
  const isPdf = name.endsWith(".pdf");
  const grid = isPdf ? await readPdf(buf) : isText ? readCsv(buf) : readXlsx(buf);
  // Remove linhas totalmente vazias, que baralham a deteção do cabeçalho.
  return grid.filter((r) => r.some((c) => (c ?? "").trim() !== ""));
}
