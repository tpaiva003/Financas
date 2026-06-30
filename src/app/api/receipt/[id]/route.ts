import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { signedReceiptUrl } from "@/lib/services/receipts-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getSpaceContext();
  const expense = await getRepository().getExpense(params.id, ctx.viewerMemberId);
  if (!expense?.receiptPath) {
    return new Response("Sem recibo.", { status: 404 });
  }
  const url = await signedReceiptUrl(expense.receiptPath);
  if (!url) {
    return new Response("Recibo indisponível.", { status: 404 });
  }
  return Response.redirect(url, 307);
}
