import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

function cell(value: string): string {
  const v = value ?? "";
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET() {
  const ctx = await getSpaceContext();
  const repo = getRepository();
  const [expenses, categories] = await Promise.all([
    repo.listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId }),
    repo.listCategories(),
  ]);

  const catName = (id?: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const memberName = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? id;

  const header = ["Data", "Descrição", "Categoria", "Quem pagou", "Tipo", "Divisão", "Valor (EUR)"];
  const lines = [header.map(cell).join(",")];

  for (const e of expenses) {
    const split =
      e.split.type === "PERCENT"
        ? Object.values(e.split.weights ?? {}).map((v) => `${v}%`).join("/")
        : e.split.type === "EQUAL"
          ? "50/50"
          : e.split.type.toLowerCase();
    lines.push(
      [
        e.transactionDate,
        e.description,
        catName(e.categoryId),
        memberName(e.payerId),
        e.kind === "shared" ? "Partilhada" : "Pessoal",
        e.kind === "shared" ? split : "",
        (e.amountCents / 100).toFixed(2).replace(".", ","),
      ]
        .map(cell)
        .join(","),
    );
  }

  // BOM para o Excel reconhecer UTF-8.
  const csv = "﻿" + lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financas-${ctx.space.id}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
