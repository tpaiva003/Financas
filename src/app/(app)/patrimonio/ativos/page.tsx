import { PatrimonioContent } from "@/components/PatrimonioContent";

export const metadata = { title: "Ativos · Rachar" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PatrimonioContent view="ativos" />;
}
