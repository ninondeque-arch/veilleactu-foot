// Récupération du texte des articles qui servent de sources au carrousel.
// Best effort : si la page est inaccessible (paywall, blocage), on garde le titre et le chapô
// et la source est marquée « partielle » pour que l'IA et l'humain le sachent.
import type { Article, Source } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const LONGUEUR_MAX = 8000;

async function telecharger(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(12000),
  });
}

/** Les liens des flux Google News pointent vers news.google.com : on retrouve l'URL du média. */
export async function resoudreLienGoogleNews(url: string): Promise<string> {
  const m = url.match(/news\.google\.com\/(?:rss\/)?articles\/([^?]+)/);
  if (!m) return url;
  const id = m[1];
  try {
    const page = await (
      await telecharger(`https://news.google.com/articles/${id}?hl=fr&gl=FR&ceid=FR:fr`, {
        headers: { Cookie: "SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg" },
      })
    ).text();
    const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return url;
    const requete = [
      [
        "Fbv4je",
        `["garturlreq",[["X","X",["X","X"],null,null,1,1,"FR:fr",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`,
      ],
    ];
    const rep = await (
      await telecharger("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "f.req=" + encodeURIComponent(JSON.stringify([requete])),
      })
    ).text();
    const trouve = rep.match(/garturlres\\",\\"(https?:[^\\"]+)/)?.[1];
    return trouve ?? url;
  } catch {
    return url;
  }
}

const ENTITES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", eacute: "é", egrave: "è",
  agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", icirc: "î", ucirc: "û", euro: "€",
};

export function decoderEntites(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITES[n.toLowerCase()] ?? m);
}

export function texteBrut(html: string): string {
  return decoderEntites(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extraireArticle(html: string): { texte: string; date?: string; titre?: string } {
  let texte = "";
  let date: string | undefined;
  let titre: string | undefined;

  // 1. Données structurées JSON-LD (la plupart des médias les publient).
  for (const bloc of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const donnees = JSON.parse(bloc[1]);
      const liste = (Array.isArray(donnees) ? donnees : donnees["@graph"] ?? [donnees]) as Record<string, unknown>[];
      for (const d of liste) {
        if (typeof d.articleBody === "string" && d.articleBody.length > texte.length) texte = d.articleBody;
        if (typeof d.datePublished === "string") date ??= d.datePublished;
        if (typeof d.headline === "string") titre ??= d.headline;
      }
    } catch {
      /* JSON-LD invalide : on ignore */
    }
  }

  // 2. Sinon, les paragraphes du corps de l'article.
  if (texte.length < 400) {
    const zone = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
    const paragraphes = [...zone.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((p) => texteBrut(p[1]))
      .filter((p) => p.length > 60);
    const candidat = paragraphes.join("\n");
    if (candidat.length > texte.length) texte = candidat;
  }

  date ??= html.match(/property="article:published_time"\s+content="([^"]+)"/)?.[1];
  titre ??= html.match(/property="og:title"\s+content="([^"]+)"/)?.[1];
  return { texte: decoderEntites(texte).trim(), date, titre: titre && decoderEntites(titre) };
}

export async function articleVersSource(a: Article, id: string): Promise<Source> {
  const url = await resoudreLienGoogleNews(a.url);
  const repli: Source = {
    id,
    titre: a.titre,
    media: a.media,
    date: a.date,
    url,
    texte: [a.titre, a.resume].filter(Boolean).join("\n"),
    extraction: "partielle",
  };
  if (url.includes("news.google.com")) return repli;
  try {
    const rep = await telecharger(url);
    if (!rep.ok) return repli;
    const { texte, date } = extraireArticle(await rep.text());
    if (texte.length < 300) return repli;
    return {
      ...repli,
      date: date ?? a.date,
      texte: texte.slice(0, LONGUEUR_MAX),
      extraction: "complete",
    };
  } catch {
    return repli;
  }
}

/** Source à partir d'un lien collé par l'utilisateur. */
export async function lienVersSource(url: string, id: string): Promise<Source> {
  let media = "Lien fourni";
  try {
    media = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    throw new Error("Lien invalide.");
  }
  const rep = await telecharger(url).catch(() => null);
  if (!rep || !rep.ok) throw new Error(`Impossible de lire la page (${rep?.status ?? "réseau"}).`);
  const html = await rep.text();
  const { texte, date, titre } = extraireArticle(html);
  if (texte.length < 200) throw new Error("Aucun texte d'article exploitable sur cette page.");
  return {
    id,
    titre: titre ?? url,
    media,
    date: date ?? new Date().toISOString(),
    url,
    texte: texte.slice(0, LONGUEUR_MAX),
    extraction: "complete",
  };
}
