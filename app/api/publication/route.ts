import { NextResponse } from "next/server";
import { modeDemo } from "@/lib/demo";
import { cleUploadPost, ErreurPublication, listerProfils } from "@/lib/uploadpost";

export const runtime = "nodejs";

/** Profils Upload-Post et comptes connectés (pour le panneau de publication). */
export async function GET() {
  if (modeDemo()) return NextResponse.json({ configure: false, demo: true, profils: [] });
  if (!cleUploadPost()) return NextResponse.json({ configure: false, profils: [] });
  try {
    return NextResponse.json({ configure: true, profils: await listerProfils() });
  } catch (e) {
    const message = e instanceof ErreurPublication ? e.message : "Erreur inconnue";
    return NextResponse.json({ configure: true, profils: [], erreur: message }, { status: 502 });
  }
}
