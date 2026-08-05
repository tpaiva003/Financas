import { ReportsContent } from "@/components/ReportsContent";

export const metadata = { title: "Categorias · Rachar" };
export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams: { periodo?: string; comparar?: string; media?: string };
}) {
  return <ReportsContent view="categorias" searchParams={searchParams} />;
}
