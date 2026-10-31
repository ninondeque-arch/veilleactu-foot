import { notFound } from "next/navigation";
import { EcranValidation } from "@/components/EcranValidation";
import { moteurDisponible } from "@/lib/claude";
import { modeDemo } from "@/lib/demo";
import { lireCarrousel } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PageCarrousel({ params }: { params: Promise<{ id: string }> }) {
  const c = await lireCarrousel((await params).id);
  if (!c) notFound();
  return <EcranValidation key={c.id} initial={c} ia={moteurDisponible()} demo={modeDemo()} />;
}
