import { ReportsContent } from "@/components/ReportsContent";

export const metadata = { title: "Resumo · Rachar" };
export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams: { periodo?: string; comparar?: string; media?: string };
}) {
  return <ReportsContent view="resumo" searchParams={searchParams} />;
}
