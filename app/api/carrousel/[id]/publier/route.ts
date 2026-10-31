import { NextResponse } from "next/server";
import { modeDemo } from "@/lib/demo";
import { enregistrerCarrousel, lireCarrousel } from "@/lib/store";
import type { Publication } from "@/lib/types";
import { blocagesExport } from "@/lib/validation";
import { envoyerPhotos, ErreurPublication, PLATEFORMES, statutEnvoi, type Plateforme } from "@/lib/uploadpost";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const NIVEAUX_TIKTOK = ["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "PUBLIC_TO_EVERYONE"];
const VISIBILITES_LINKEDIN = ["CONNECTIONS", "PUBLIC"];

/**
 * Publication d'un carrousel. Le serveur revérifie lui-même la validation humaine :
 * rien ne part si une phrase rouge, un [À VÉRIFIER] ou une slide non validée subsiste.
 * Champs attendus (multipart) : profil, plateformes (JSON), confidentialiteTiktok, visibiliteLinkedin,
 * imagesTiktok[] (JPEG 1080×1920) et imagesCarre[] (JPEG 1080×1350, pour Instagram et LinkedIn).
 */
export async function POST(req: Request, { params }: Params) {
  if (modeDemo()) return NextResponse.json({ erreur: "Publication désactivée dans la démo en ligne." }, { status: 403 });
  const { id } = await params;
  const c = await lireCarrousel(id);
  if (!c) return NextResponse.json({ erreur: "Carrousel introuvable" }, { status: 404 });

  const blocages = blocagesExport(c);
  if (blocages.length) {
    return NextResponse.json({ erreur: `Publication refusée : ${blocages.join(" ")}` }, { status: 409 });
  }

  const form = await req.formData();
  const profil = String(form.get("profil") ?? "");
  const plateformes = (JSON.parse(String(form.get("plateformes") ?? "[]")) as string[]).filter((p): p is Plateforme =>
    (PLATEFORMES as readonly string[]).includes(p),
  );
  const confidentialite = String(form.get("confidentialiteTiktok") ?? "SELF_ONLY");
  const visibilite = String(form.get("visibiliteLinkedin") ?? "CONNECTIONS");
  if (!profil || !plateformes.length) {
    return NextResponse.json({ erreur: "Choisissez un profil et au moins une plateforme." }, { status: 400 });
  }
  if (!NIVEAUX_TIKTOK.includes(confidentialite) || !VISIBILITES_LINKEDIN.includes(visibilite)) {
    return NextResponse.json({ erreur: "Paramètre de visibilité invalide." }, { status: 400 });
  }

  const imagesTiktok = form.getAll("imagesTiktok[]") as File[];
  const imagesCarre = form.getAll("imagesCarre[]") as File[];
  const noms = (n: number, prefixe: string) => Array.from({ length: n }, (_, i) => `${prefixe}-${String(i + 1).padStart(2, "0")}.jpg`);
  const date = new Date().toISOString();

  // TikTok exige du 9:16 ; Instagram et LinkedIn reçoivent le 4:5. D'où deux envois séparés.
  const lots: { plateformes: Plateforme[]; images: File[]; format: Publication["format"]; champs: Record<string, string> }[] = [];
  if (plateformes.includes("tiktok")) {
    lots.push({
      plateformes: ["tiktok"],
      images: imagesTiktok,
      format: "tiktok",
      champs: {
        tiktok_title: c.legendes.tiktok.slice(0, 90),
        tiktok_description: c.legendes.tiktok,
        privacy_level: confidentialite,
        photo_cover_index: "0",
      },
    });
  }
  const autres = plateformes.filter((p) => p !== "tiktok");
  if (autres.length) {
    lots.push({
      plateformes: autres,
      images: imagesCarre,
      format: "instagram",
      champs: {
        // Upload-Post prend `title` comme légende Instagram (constaté le 30/10/2026 : avec title = titre du carrousel,
        // c'est le titre qui est parti en légende malgré instagram_title). LinkedIn garde ses propres champs ci-dessous.
        title: c.legendes.instagram,
        instagram_title: c.legendes.instagram,
        linkedin_title: c.titre,
        linkedin_description: c.legendes.linkedin,
        visibility: visibilite,
      },
    });
  }

  const publications: Publication[] = [];
  const erreurs: string[] = [];
  for (const lot of lots) {
    if (lot.images.length !== c.slides.length) {
      erreurs.push(`${lot.plateformes.join(", ")} : ${lot.images.length} image(s) reçue(s) au lieu de ${c.slides.length}.`);
      continue;
    }
    try {
      const { requestId } = await envoyerPhotos({
        profil,
        plateformes: lot.plateformes,
        images: lot.images,
        nomsFichiers: noms(lot.images.length, `${c.id}-${lot.format}`),
        champs: lot.champs,
        idExterne: `${c.id}-${lot.format}`,
      });
      const pub: Publication = { date, profil, plateformes: lot.plateformes, format: lot.format, requestId, statut: "pending", resultats: [] };
      publications.push(pub);
      c.historique.push({ date, action: `Publication envoyée à Upload-Post : ${lot.plateformes.join(", ")} (profil ${profil})` });
    } catch (e) {
      const message = e instanceof ErreurPublication ? e.message : (e as Error).message;
      erreurs.push(`${lot.plateformes.join(", ")} : ${message}`);
      c.historique.push({ date, action: `Échec de publication (${lot.plateformes.join(", ")}) : ${message}` });
    }
  }
  c.publications = [...(c.publications ?? []), ...publications];
  await enregistrerCarrousel(c);
  return NextResponse.json({ carrousel: c, erreurs }, { status: publications.length ? 200 : 502 });
}

/** Met à jour le statut des publications en cours (interroge Upload-Post). */
export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const c = await lireCarrousel(id);
  if (!c) return NextResponse.json({ erreur: "Carrousel introuvable" }, { status: 404 });
  if (modeDemo()) return NextResponse.json({ carrousel: c });
  const finis = ["completed", "failed", "not_found"];
  let change = false;
  for (const pub of c.publications ?? []) {
    if (!pub.requestId || finis.includes(pub.statut)) continue;
    try {
      const s = await statutEnvoi(pub.requestId);
      if (s.statut !== pub.statut || s.resultats.length !== pub.resultats.length) {
        pub.statut = s.statut;
        pub.resultats = s.resultats;
        change = true;
        if (finis.includes(s.statut)) {
          c.historique.push({ date: new Date().toISOString(), action: `Publication ${pub.plateformes.join(", ")} : ${s.statut}` });
        }
      }
    } catch (e) {
      return NextResponse.json({ erreur: (e as Error).message, carrousel: c }, { status: 502 });
    }
  }
  if (change) await enregistrerCarrousel(c);
  return NextResponse.json({ carrousel: c });
}
