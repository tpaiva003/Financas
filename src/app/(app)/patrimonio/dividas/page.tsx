import { PatrimonioContent } from "@/components/PatrimonioContent";

export const metadata = { title: "Dívidas · Rachar" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PatrimonioContent view="dividas" />;
}
