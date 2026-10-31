// Recherche de photos libres sur Wikimedia Commons (serveur uniquement).
// On ne garde que les licences réutilisables sur les réseaux sociaux avec un simple crédit :
// domaine public, CC0, CC BY et CC BY-SA. Les GFDL seules sont écartées (texte de licence complet exigé).
//
// La recherche plein texte de Commons est floue (« Paris Saint-Germain » renvoie des églises). On passe donc
// d'abord par Wikidata : l'entité trouvée donne son image principale (P18) et sa catégorie Commons (P373),
// où les photos portent vraiment sur la personne, le club ou le lieu. Seuls ces résultats « fiables »
// sont posés d'office à la génération ; la recherche plein texte ne sert qu'en complément, au choix manuel.
// Pour une personne, son portrait Wikidata passe en premier, puis sa catégorie Commons (matchs, club, crampons…).
// À défaut, une photo d'ambiance liée à la slide (stade, supporters, crampons), puis une photo de foot générique :
// chaque slide reçoit une photo, aussi proche du sujet que possible.
import type { ImageSlide, Slide } from "./types";

const UA = "veilleactu-foot/1.0 (demo locale de veille editoriale)";
const API = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA = "https://www.wikidata.org/w/api.php";

/** Hôtes autorisés pour le proxy d'images : uniquement les serveurs de fichiers de Wikimedia. */
export const HOTES_IMAGES = ["upload.wikimedia.org", "thumb.wikimedia.org"];

type Meta = Record<string, { value?: string } | undefined>;
type PageCommons = {
  title: string;
  index?: number;
  imageinfo?: {
    width: number;
    height: number;
    mime: string;
    thumburl?: string;
    url: string;
    descriptionurl: string;
    extmetadata?: Meta;
  }[];
};
type Claims = Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[] | undefined>;

const sansHtml = (t: string) =>
  t
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function licenceReutilisable(code: string, court: string): boolean {
  const l = `${code} ${court}`.toLowerCase();
  if (/\bnc\b|\bnd\b|non-?commercial|no-?deriv|fair use/.test(l)) return false;
  return /cc0|cc-by|cc by|public domain|\bpd\b|^pd-/.test(l);
}

/** Appel aux API Wikimedia. En cas de 429 (trop de requêtes), on attend le délai demandé (30 s max) et on réessaie une fois. */
async function api<T>(base: string, params: Record<string, string>, essai = 1): Promise<T> {
  const r = await fetch(`${base}?${new URLSearchParams({ format: "json", ...params })}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 429 && essai === 1) {
    const attente = Math.min(Number(r.headers.get("retry-after")) || 5, 30);
    await new Promise((ok) => setTimeout(ok, attente * 1000));
    return api<T>(base, params, 2);
  }
  if (!r.ok) throw new Error(`Wikimedia a répondu ${r.status}.`);
  return (await r.json()) as T;
}

const INFOS_IMAGE = {
  prop: "imageinfo",
  iiprop: "url|extmetadata|mime|size",
  iiurlwidth: "1280",
  iiextmetadatafilter: "Artist|Attribution|LicenseShortName|License|LicenseUrl|Restrictions",
};

/** Convertit les pages de fichiers Commons en images utilisables (licence libre, taille suffisante). */
function versImages(pages: PageCommons[]): ImageSlide[] {
  const images: ImageSlide[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    const m = info?.extmetadata ?? {};
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime)) continue;
    if (info.width < 700 || info.height < 500) continue; // trop petite pour une slide de 1080 px
    const code = m.License?.value ?? "";
    const court = sansHtml(m.LicenseShortName?.value ?? "");
    if (!licenceReutilisable(code, court)) continue;
    const auteur = sansHtml(m.Attribution?.value || m.Artist?.value || "") || "Auteur inconnu";
    images.push({
      url: info.thumburl ?? info.url,
      page: info.descriptionurl,
      titre: p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
      auteur: auteur.length > 80 ? `${auteur.slice(0, 77)}…` : auteur,
      licence: court || code,
      licenceUrl: m.LicenseUrl?.value ?? null,
      restrictions: sansHtml(m.Restrictions?.value ?? "") || null,
      largeur: info.width,
      hauteur: info.height,
    });
  }
  return images;
}

// Cache en mémoire : un même nom revient souvent sur plusieurs slides et d'un carrousel à l'autre,
// et Wikimedia limite vite le nombre de requêtes. Un échec n'est pas mis en cache.
const cache = new Map<string, Promise<ImageSlide[]>>();
function enCache(cle: string, calcul: () => Promise<ImageSlide[]>): Promise<ImageSlide[]> {
  if (!cache.has(cle)) {
    const p = calcul();
    p.catch(() => cache.delete(cle));
    cache.set(cle, p);
  }
  return cache.get(cle)!;
}

function rechercheCommons(gsrsearch: string): Promise<ImageSlide[]> {
  return enCache(`commons:${gsrsearch.trim().toLowerCase()}`, () => rechercheCommonsSansCache(gsrsearch));
}

async function rechercheCommonsSansCache(gsrsearch: string): Promise<ImageSlide[]> {
  const d = await api<{ query?: { pages?: Record<string, PageCommons> } }>(API, {
    action: "query",
    generator: "search",
    gsrsearch: `${gsrsearch} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "24",
    ...INFOS_IMAGE,
  });
  return versImages(Object.values(d.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)));
}

async function fichiersCommons(noms: string[]): Promise<ImageSlide[]> {
  if (!noms.length) return [];
  const d = await api<{ query?: { pages?: Record<string, PageCommons> } }>(API, {
    action: "query",
    titles: noms.map((n) => `File:${n}`).join("|"),
    ...INFOS_IMAGE,
  });
  return versImages(Object.values(d.query?.pages ?? {}));
}

/** Photos rattachées à l'entité Wikidata qui correspond le mieux à la requête (personne, club, stade…). */
function imagesEntite(q: string): Promise<ImageSlide[]> {
  return enCache(`entite:${q.trim().toLowerCase()}`, () => chercherEntite(q));
}

async function chercherEntite(q: string): Promise<ImageSlide[]> {
  const recherche = await api<{ search?: { id: string }[] }>(WIKIDATA, {
    action: "wbsearchentities",
    search: q,
    language: "fr",
    uselang: "fr",
    type: "item",
    limit: "1",
  });
  const id = recherche.search?.[0]?.id;
  if (!id) return [];
  const entite = await api<{ entities?: Record<string, { claims?: Claims }> }>(WIKIDATA, {
    action: "wbgetentities",
    ids: id,
    props: "claims",
  });
  const claims = entite.entities?.[id]?.claims ?? {};
  const valeurs = (p: string) => (claims[p] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter((v): v is string => typeof v === "string");
  const categorieCommons = valeurs("P373")[0];
  const [principales, categorie] = await Promise.all([
    fichiersCommons(valeurs("P18").slice(0, 3)),
    categorieCommons ? rechercheCommons(`incategory:"${categorieCommons}"`) : Promise.resolve([]),
  ]);
  return [...principales, ...categorie];
}

const sansDoublons = (images: ImageSlide[]) => images.filter((img, i) => images.findIndex((x) => x.url === img.url) === i);

/** Recherche pour le choix manuel : d'abord les photos de l'entité, puis la recherche plein texte. */
export async function chercherImages(requete: string, max = 8): Promise<ImageSlide[]> {
  const q = requete.trim();
  if (!q) return [];
  const [entite, texte] = await Promise.all([imagesEntite(q).catch(() => []), rechercheCommons(q)]);
  return sansDoublons([...entite, ...texte]).slice(0, max);
}

/** Dernier recours : des scènes de foot génériques, essayées dans l'ordre. */
const AMBIANCES_GENERIQUES = ["football pitch stadium", "football boots", "football fans", "football match"];

/**
 * Photo proposée d'office à la génération, pas déjà utilisée sur une autre slide, par ordre de pertinence :
 * 1. le portrait ou la catégorie Commons de l'entité nommée (personne, club, stade) ;
 * 2. l'ambiance propre à la slide (entité si c'en est une, sinon recherche plein texte) ;
 * 3. une scène de foot générique.
 * La mention « personality » (droit à l'image), présente sur presque tous les portraits de joueurs,
 * n'exclut pas la photo : elle reste signalée à l'écran de validation.
 */
export async function photosParDefaut(slides: Slide[]): Promise<Slide[]> {
  const utilisees = new Set<string>();
  const resultat: Slide[] = [];
  for (const s of slides) {
    if (s.image) {
      utilisees.add(s.image.url);
      resultat.push(s);
      continue;
    }
    const etapes: (() => Promise<ImageSlide[]>)[] = [];
    if (s.rechercheImage?.trim()) etapes.push(() => imagesEntite(s.rechercheImage!));
    if (s.ambianceImage?.trim()) etapes.push(() => imagesEntite(s.ambianceImage!), () => rechercheCommons(s.ambianceImage!));
    for (const g of AMBIANCES_GENERIQUES) etapes.push(() => rechercheCommons(g));
    let image: ImageSlide | null = null;
    for (const etape of etapes) {
      const trouvees = await etape().catch(() => []);
      image = trouvees.find((i) => !utilisees.has(i.url)) ?? null;
      if (image) break;
    }
    if (image) utilisees.add(image.url);
    resultat.push({ ...s, image });
  }
  return resultat;
}
