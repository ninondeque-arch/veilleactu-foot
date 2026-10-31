import { Accueil } from "@/components/Accueil";
import { SchemaWorkflow } from "@/components/SchemaWorkflow";
import { moteurDisponible } from "@/lib/claude";
import { CARROUSEL_DEMO, modeDemo } from "@/lib/demo";
import { listerCarrousels, listerVeilles } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PageAccueil() {
  const [veilles, carrousels] = await Promise.all([listerVeilles(), listerCarrousels()]);
  return (
    <div className="page">
      <h1 style={{ fontSize: 26 }}>Du fil d'actualité au carrousel vérifié</h1>
      <p className="muet" style={{ margin: "6px 0 20px", maxWidth: 760 }}>
        L'IA repère, rédige, relit et teste le risque. Un humain valide chaque slide. Rien n'est exporté tant qu'une phrase reste
        introuvable dans les sources.
      </p>
      <SchemaWorkflow />
      <Accueil
        ia={moteurDisponible()}
        demo={modeDemo() ? { idCarrousel: CARROUSEL_DEMO.id } : null}
        veilles={veilles}
        carrousels={carrousels.map((c) => ({
          id: c.id,
          titre: c.titre,
          sujet: c.sujet,
          creeLe: c.creeLe,
          exemple: c.exemple ?? false,
          validees: c.slides.filter((s) => s.statut === "validee").length,
          score: c.relecture ? `${c.relecture.confirmees}/${c.relecture.total}` : null,
        }))}
      />
    </div>
  );
}
