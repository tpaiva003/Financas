import { PatrimonioContent } from "@/components/PatrimonioContent";

export const metadata = { title: "Património · Rachar" };
export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams?: { foco?: string | string[] };
}) {
  const foco = searchParams?.foco;
  return <PatrimonioContent view="resumo" foco={Array.isArray(foco) ? foco[0] : foco} />;
}
