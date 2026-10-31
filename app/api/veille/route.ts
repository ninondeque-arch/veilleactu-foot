import { NextResponse } from "next/server";
import { modeDemo, VEILLE_DEMO } from "@/lib/demo";
import { enregistrerVeille, listerVeilles } from "@/lib/store";
import { lancerVeille } from "@/lib/veille";

export const runtime = "nodejs";

export async function GET() {
  const veilles = await listerVeilles();
  return NextResponse.json(
    veilles.map((v) => ({ id: v.id, date: v.date, exemple: v.exemple ?? false, nbSujets: v.sujets.length })),
  );
}

export async function POST() {
  if (modeDemo()) return NextResponse.json(VEILLE_DEMO); // résultat préenregistré
  try {
    const veille = await lancerVeille();
    await enregistrerVeille(veille);
    return NextResponse.json(veille);
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 500 });
  }
}
