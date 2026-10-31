import { NextResponse } from "next/server";
import { genererCarrousel } from "@/lib/carrousel";
import { ErreurIA } from "@/lib/claude";
import { CARROUSEL_DEMO, modeDemo } from "@/lib/demo";
import { articleVersSource, lienVersSource } from "@/lib/sources";
import { enregistrerCarrousel, listerCarrousels, nouvelId } from "@/lib/store";
import type { Article } from "@/lib/types";
import { rechercherArticles } from "@/lib/veille";

export const runtime = "nodejs";

export async function GET() {
  const liste = await listerCarrousels();
  return NextResponse.json(
    liste.map((c) => ({
      id: c.id,
      titre: c.titre,
      sujet: c.sujet,
      creeLe: c.creeLe,
      exemple: c.exemple ?? false,
      validees: c.slides.filter((s) => s.statut === "validee").length,
    })),
  );
}

/** Crée un carrousel à partir d'un sujet de veille, d'un sujet saisi à la main ou d'un lien. */
export async function POST(req: Request) {
  if (modeDemo()) return NextResponse.json({ id: CARROUSEL_DEMO.id, demo: true }); // résultat préenregistré
  const corps = (await req.json()) as { sujet?: string; articles?: Article[]; lien?: string };
  try {
    let sujet = (corps.sujet ?? "").trim();
    let articles = corps.articles ?? [];
    const sources = [];

    if (corps.lien) {
      const s = await lienVersSource(corps.lien.trim(), "S1");
      sources.push(s);
      sujet ||= s.titre;
    } else if (!articles.length) {
      if (!sujet) return NextResponse.json({ erreur: "Indiquez un sujet ou un lien." }, { status: 400 });
      articles = await rechercherArticles(sujet);
      if (!articles.length) {
        return NextResponse.json({ erreur: "Aucun article trouvé pour ce sujet sur les 7 derniers jours." }, { status: 404 });
      }
    }

    // Au plus 6 sources, en privilégiant la diversité des médias.
    const choisis: Article[] = [];
    const medias = new Set<string>();
    for (const a of articles) if (!medias.has(a.media) && choisis.length < 6) { choisis.push(a); medias.add(a.media); }
    for (const a of articles) if (!choisis.includes(a) && choisis.length < 6) choisis.push(a);
    const extraites = await Promise.all(
      choisis.map((a, i) => articleVersSource(a, `S${sources.length + i + 1}`)),
    );
    sources.push(...extraites);

    const carrousel = await genererCarrousel(nouvelId("carrousel"), sujet, sources);
    await enregistrerCarrousel(carrousel);
    return NextResponse.json({ id: carrousel.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ erreur: message }, { status: e instanceof ErreurIA ? 502 : 500 });
  }
}
