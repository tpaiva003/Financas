import { ReportsContent } from "@/components/ReportsContent";

export const metadata = { title: "Evolução · Rachar" };
export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams: { periodo?: string; comparar?: string; media?: string };
}) {
  return <ReportsContent view="evolucao" searchParams={searchParams} />;
}
