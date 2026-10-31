import { HOTES_IMAGES } from "@/lib/images";

export const runtime = "nodejs";

/**
 * Proxy d'images limité aux serveurs de fichiers de Wikimedia.
 * La capture PNG (html-to-image) lit les pixels de la photo : la servir depuis notre propre origine
 * évite tout blocage CORS au moment de l'export et de la publication.
 */
export async function GET(req: Request) {
  const brute = new URL(req.url).searchParams.get("url") ?? "";
  let cible: URL;
  try {
    cible = new URL(brute);
  } catch {
    return new Response("URL invalide", { status: 400 });
  }
  if (cible.protocol !== "https:" || !HOTES_IMAGES.includes(cible.hostname)) {
    return new Response("Hôte non autorisé", { status: 403 });
  }
  const r = await fetch(cible, {
    headers: { "User-Agent": "veilleactu-foot/1.0 (demo locale de veille editoriale)" },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  const type = r?.headers.get("content-type") ?? "";
  if (!r?.ok || !type.startsWith("image/")) return new Response("Image indisponible", { status: 502 });
  return new Response(r.body, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=604800, immutable" },
  });
}
