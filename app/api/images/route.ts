import { NextResponse } from "next/server";
import { chercherImages } from "@/lib/images";

export const runtime = "nodejs";

/** Recherche de photos libres sur Wikimedia Commons : GET /api/images?q=Bruno Genesio */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ images: [] });
  try {
    return NextResponse.json({ images: await chercherImages(q.slice(0, 120)) });
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : "Recherche impossible" }, { status: 502 });
  }
}
