// Veille foot : flux RSS des dernières 24 h → dédoublonnage → regroupement par sujet.
import Parser from "rss-parser";
import { appelStructure, moteurDisponible } from "./claude";
import { PROMPT_REGROUPEMENT } from "./prompts";
import { RegroupementIA } from "./schemas";
import { texteBrut } from "./sources";
import type { Article, SujetVeille, Veille } from "./types";

const googleNews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=fr&gl=FR&ceid=FR:fr`;

export const RECHERCHES = [
  "Ligue 1",
  "PSG",
  "OM",
  "équipe de France football",
  "mercato",
  "Ligue des champions",
];

// Flux de médias vérifiés le 30/10/2026 (réponse 200 et articles présents).
// L'Équipe (403), So Foot et Maxifoot (pas de flux RSS) ont été écartés.
export const FLUX_MEDIAS = [
  { nom: "RMC Sport", url: "https://rmcsport.bfmtv.com/rss/football/" },
  { nom: "Foot Mercato", url: "https://www.footmercato.net/flux-rss" },
  { nom: "20 Minutes", url: "https://www.20minutes.fr/feeds/rss-football.xml" },
  { nom: "France Info", url: "https://www.francetvinfo.fr/sports/foot.rss" },
];

type ItemRss = { title?: string; link?: string; isoDate?: string; pubDate?: string; contentSnippet?: string; source?: unknown };

const parser: Parser<object, ItemRss> = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 (Macintosh) VeilleFootDemo/1.0" },
  customFields: { item: ["source"] },
});

function mediaGoogleNews(item: ItemRss): string {
  const s = item.source as { _?: string } | string | undefined;
  if (typeof s === "string") return s;
  if (s?._) return s._;
  return item.title?.split(" - ").pop() ?? "Google News";
}

function normaliser(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function lireFlux(url: string, requete: string, mediaFixe?: string): Promise<Article[]> {
  const flux = await parser.parseURL(url);
  return flux.items
    .filter((i) => i.title && i.link)
    .map((i) => {
      const media = mediaFixe ?? mediaGoogleNews(i);
      let titre = i.title!.trim();
      if (!mediaFixe && titre.endsWith(` - ${media}`)) titre = titre.slice(0, -(media.length + 3));
      const resume = mediaFixe && i.contentSnippet ? texteBrut(i.contentSnippet).slice(0, 300) : undefined;
      return {
        id: "",
        titre,
        media,
        date: new Date(i.isoDate ?? i.pubDate ?? Date.now()).toISOString(),
        url: i.link!,
        resume,
        requete,
      };
    });
}

/** Articles des dernières 24 h, dédoublonnés (même titre ou même lien). */
export async function collecterArticles(): Promise<{ articles: Article[]; bruts: number; erreurs: string[] }> {
  const erreurs: string[] = [];
  const taches = [
    ...RECHERCHES.map((q) => lireFlux(googleNews(q), `Google News : ${q}`).catch((e) => {
      erreurs.push(`Google News « ${q} » : ${(e as Error).message}`);
      return [];
    })),
    ...FLUX_MEDIAS.map((f) => lireFlux(f.url, f.nom, f.nom).catch((e) => {
      erreurs.push(`${f.nom} : ${(e as Error).message}`);
      return [];
    })),
  ];
  const tous = (await Promise.all(taches)).flat();
  const limite = Date.now() - 24 * 3600 * 1000;
  const vus = new Set<string>();
  const articles: Article[] = [];
  for (const a of tous.sort((x, y) => y.date.localeCompare(x.date))) {
    if (new Date(a.date).getTime() < limite) continue;
    const cle = normaliser(a.titre);
    if (vus.has(cle) || vus.has(a.url)) continue;
    vus.add(cle);
    vus.add(a.url);
    articles.push({ ...a, id: `A${articles.length + 1}` });
  }
  return { articles, bruts: tous.length, erreurs };
}

// --- Regroupement ---

const MOTS_VIDES = new Set(
  "le la les un une des de du d l a au aux et ou en dans sur pour par avec sans ce cette ces son sa ses leur qui que quoi est sont ete apres avant contre face plus moins tres pas ne se s il elle ils on nous vous lui y c qu n m t j fait faire va vont veut deja encore toujours ligue foot football match club equipe france 1 2 3 0 video direct live officiel".split(" "),
);

function motsCles(titre: string): Set<string> {
  return new Set(normaliser(titre).split(" ").filter((m) => m.length > 2 && !MOTS_VIDES.has(m)));
}

/** Regroupement sans IA (repli si pas de clé) : mots communs entre titres. */
function regroupementSimple(articles: Article[]): SujetVeille[] {
  const groupes: { mots: Set<string>; articles: Article[] }[] = [];
  for (const a of articles) {
    const mots = motsCles(a.titre);
    let meilleur: (typeof groupes)[number] | null = null;
    let score = 0;
    for (const g of groupes) {
      const communs = [...mots].filter((m) => g.mots.has(m)).length;
      const s = communs / Math.min(mots.size || 1, 4);
      if (communs >= 2 && s > score) {
        score = s;
        meilleur = g;
      }
    }
    if (meilleur && score >= 0.5) {
      meilleur.articles.push(a);
    } else {
      groupes.push({ mots, articles: [a] });
    }
  }
  return groupes.map((g, i) => ({
    id: `T${i + 1}`,
    titre: g.articles[0].titre,
    resume: `${g.articles.length} article(s) — regroupement automatique simple (sans IA).`,
    articles: g.articles,
  }));
}

async function regroupementIA(articles: Article[]): Promise<SujetVeille[]> {
  const liste = articles
    .map((a) => `${a.id} | ${a.titre} | ${a.media} | ${a.date.slice(0, 16)}`)
    .join("\n");
  const res = await appelStructure({
    systeme: PROMPT_REGROUPEMENT,
    message: `Articles :\n${liste}`,
    schema: RegroupementIA,
    effort: "low",
  });
  const parId = new Map(articles.map((a) => [a.id, a]));
  const places = new Set<string>();
  const sujets: SujetVeille[] = [];
  for (const s of res.sujets) {
    const arts = s.articleIds
      .map((id) => parId.get(id))
      .filter((a): a is Article => !!a && !places.has(a.id));
    arts.forEach((a) => places.add(a.id));
    if (arts.length) sujets.push({ id: `T${sujets.length + 1}`, titre: s.titre, resume: s.resume, articles: arts });
  }
  return sujets;
}

const trierSujets = (s: SujetVeille[]) =>
  [...s].sort((a, b) => b.articles.length - a.articles.length || b.articles[0].date.localeCompare(a.articles[0].date));

export async function lancerVeille(): Promise<Veille> {
  const { articles, bruts, erreurs } = await collecterArticles();
  let sujets: SujetVeille[];
  let regroupement: Veille["regroupement"] = "simple";
  if (moteurDisponible() && articles.length) {
    try {
      // On limite à 200 articles pour garder un appel rapide.
      sujets = await regroupementIA(articles.slice(0, 200));
      regroupement = "ia";
    } catch (e) {
      erreurs.push(`Regroupement IA indisponible (${(e as Error).message}) : regroupement simple utilisé.`);
      sujets = regroupementSimple(articles);
    }
  } else {
    if (!moteurDisponible()) erreurs.push("Claude Code introuvable : regroupement simple par mots-clés (sans IA).");
    sujets = regroupementSimple(articles);
  }
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    id: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}`,
    date: d.toISOString(),
    regroupement,
    nbArticlesBruts: bruts,
    sujets: trierSujets(sujets).slice(0, 40).map((s, i) => ({ ...s, id: `T${i + 1}` })),
    erreurs,
  };
}

/** Pour un sujet saisi à la main : on cherche les articles correspondants (7 derniers jours). */
export async function rechercherArticles(sujet: string, max = 6): Promise<Article[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${sujet} when:7d`)}&hl=fr&gl=FR&ceid=FR:fr`;
  const articles = await lireFlux(url, `Recherche : ${sujet}`);
  return articles.slice(0, max).map((a, i) => ({ ...a, id: `A${i + 1}` }));
}
