import { NextResponse } from "next/server";
import { lireVeille } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await lireVeille((await params).id);
  return v ? NextResponse.json(v) : NextResponse.json({ erreur: "Veille introuvable" }, { status: 404 });
}
