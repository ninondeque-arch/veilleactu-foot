import { NextResponse } from "next/server";
import { regenererSlide, relireCarrousel, testerRisque } from "@/lib/carrousel";
import { CARROUSEL_DEMO, modeDemo } from "@/lib/demo";
import { lireCarrousel, enregistrerCarrousel, reinitialiserCarrousel } from "@/lib/store";
import type { Carrousel } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const c = await lireCarrousel((await params).id);
  return c ? NextResponse.json(c) : NextResponse.json({ erreur: "Carrousel introuvable" }, { status: 404 });
}

/** Sauvegarde des actions humaines (édition, validation). */
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  if (modeDemo()) return NextResponse.json({ ok: true, demo: true }); // rien n'est écrit en ligne
  const c = (await req.json()) as Carrousel;
  if (c.id !== id) return NextResponse.json({ erreur: "Identifiant incohérent" }, { status: 400 });
  await enregistrerCarrousel(c);
  return NextResponse.json({ ok: true });
}

/** Étapes IA : relecture, test de risque, régénération d'une slide ; et réinitialisation d'un exemple. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  if (modeDemo()) return NextResponse.json(CARROUSEL_DEMO); // résultat préenregistré, sans appel à l'IA
  const corps = (await req.json()) as { action: string; numero?: number; consigne?: string };
  const c = await lireCarrousel(id);
  if (!c) return NextResponse.json({ erreur: "Carrousel introuvable" }, { status: 404 });
  const date = new Date().toISOString();
  try {
    switch (corps.action) {
      case "relire": {
        c.relecture = await relireCarrousel(c);
        c.slides = c.slides.map((s) => ({ ...s, modifieeDepuisRelecture: false }));
        c.historique.push({ date, action: `Relecture IA : ${c.relecture.confirmees}/${c.relecture.total} phrases confirmées` });
        break;
      }
      case "risque": {
        c.risque = await testerRisque(c);
        c.historique.push({ date, action: `Test de risque : niveau ${c.risque.niveau}` });
        break;
      }
      case "regenerer": {
        const n = Number(corps.numero);
        const nouvelle = await regenererSlide(c, n, corps.consigne ?? "");
        c.slides = c.slides.map((s) => (s.numero === n ? nouvelle : s));
        c.historique.push({ date, action: `Slide ${n} régénérée par l'IA${corps.consigne ? ` (consigne : ${corps.consigne})` : ""}` });
        break;
      }
      case "reinitialiser": {
        await reinitialiserCarrousel(id);
        return NextResponse.json(await lireCarrousel(id));
      }
      default:
        return NextResponse.json({ erreur: "Action inconnue" }, { status: 400 });
    }
    await enregistrerCarrousel(c);
    return NextResponse.json(c);
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 502 });
  }
}
