// Les trois instances de l'IA : rédacteur, relecteur, test de risque.
// Chacune est un appel séparé avec son propre prompt système.
import { appelStructure } from "./claude";
import { photosParDefaut } from "./images";
import {
  PROMPT_REDACTEUR,
  PROMPT_RELECTEUR,
  PROMPT_RISQUE,
  formaterCarrousel,
  formaterSources,
} from "./prompts";
import { CarrouselIA, RelectureIA, RisqueIA, SlideSeuleIA } from "./schemas";
import type { Carrousel, Relecture, Slide, Source, TestRisque } from "./types";

export const ROLES_SLIDES = [
  "Accroche",
  "Le déclencheur",
  "L'escalade",
  "Les conséquences",
  "La situation actuelle",
  "La clé de lecture",
];

const maintenant = () => new Date().toISOString();

export async function genererCarrousel(id: string, sujet: string, sources: Source[]): Promise<Carrousel> {
  if (!sources.length) throw new Error("Aucune source : impossible de rédiger sans sources.");
  const res = await appelStructure({
    systeme: PROMPT_REDACTEUR,
    message: `Sujet : ${sujet}\n\nSources (seule base autorisée) :\n\n${formaterSources(sources)}\n\nRédige le carrousel de 6 slides et les trois légendes.`,
    schema: CarrouselIA,
    effort: "high",
  });
  const idsValides = new Set(sources.map((s) => s.id));
  const brutes: Slide[] = ROLES_SLIDES.map((role, i) => {
    const s = res.slides.find((x) => x.numero === i + 1) ?? res.slides[i];
    return {
      numero: i + 1,
      role,
      titre: s?.titre ?? role,
      texte: s?.texte ?? "[À VÉRIFIER]",
      date: s?.date ?? "[À VÉRIFIER]",
      sourceIds: (s?.sourceIds ?? []).filter((x) => idsValides.has(x)),
      statut: "brouillon",
      modifieeDepuisRelecture: false,
      rechercheImage: s?.rechercheImage?.trim() ?? "",
      ambianceImage: s?.ambianceImage?.trim() ?? "",
      image: null,
    };
  });
  const slides = await photosParDefaut(brutes);
  return {
    id,
    creeLe: maintenant(),
    sujet,
    titre: res.titre,
    sources,
    slides,
    legendes: res.legendes,
    relecture: null,
    risque: null,
    historique: [
      { date: maintenant(), action: "Carrousel généré par l'IA rédactrice" },
      {
        date: maintenant(),
        action: `Photos proposées d'office (Wikimedia Commons) : ${slides.filter((s) => s.image).length}/${slides.length} slides`,
      },
    ],
  };
}

export async function relireCarrousel(c: Carrousel): Promise<Relecture> {
  const res = await appelStructure({
    systeme: PROMPT_RELECTEUR,
    message: `<sources>\n${formaterSources(c.sources)}\n</sources>\n\n<carrousel>\n${formaterCarrousel(c)}\n</carrousel>\n\nVérifie chaque phrase des 6 slides (pas les légendes).`,
    schema: RelectureIA,
    effort: "high",
  });
  const confirmees = res.phrases.filter((p) => p.statut === "vert").length;
  return {
    date: maintenant(),
    phrases: res.phrases,
    confirmees,
    total: res.phrases.length,
    commentaireGeneral: res.commentaireGeneral,
  };
}

export async function testerRisque(c: Carrousel): Promise<TestRisque> {
  const res = await appelStructure({
    systeme: PROMPT_RISQUE,
    message: `Contexte : sujet « ${c.sujet} ». Sources utilisées : ${c.sources
      .map((s) => `${s.id} = ${s.media} (${s.titre})`)
      .join(" ; ")}.\n\n<carrousel>\n${formaterCarrousel(c)}\n</carrousel>`,
    schema: RisqueIA,
    effort: "medium",
  });
  return { date: maintenant(), ...res, points: res.points.slice(0, 3) };
}

export async function regenererSlide(c: Carrousel, numero: number, consigne: string): Promise<Slide> {
  const actuelle = c.slides.find((s) => s.numero === numero);
  if (!actuelle) throw new Error("Slide introuvable.");
  const problemes = (c.relecture?.phrases ?? [])
    .filter((p) => p.slide === numero && p.statut !== "vert")
    .map((p) => `- (${p.statut}) « ${p.phrase} » : ${p.explication}`)
    .join("\n");
  const res = await appelStructure({
    systeme: PROMPT_REDACTEUR,
    message: `Sources (seule base autorisée) :\n\n${formaterSources(c.sources)}\n\n<carrousel_actuel>\n${formaterCarrousel(c)}\n</carrousel_actuel>\n\nRéécris uniquement la slide ${numero} (« ${ROLES_SLIDES[numero - 1]} »), en gardant la cohérence avec les autres slides.${
      problemes ? `\nProblèmes relevés par le relecteur sur cette slide :\n${problemes}` : ""
    }${consigne ? `\nConsigne de l'éditeur·rice : ${consigne}` : ""}\nRenvoie seulement cette slide.`,
    schema: SlideSeuleIA,
    effort: "high",
  });
  const idsValides = new Set(c.sources.map((s) => s.id));
  return {
    ...actuelle,
    titre: res.slide.titre,
    texte: res.slide.texte,
    date: res.slide.date,
    sourceIds: res.slide.sourceIds.filter((x) => idsValides.has(x)),
    statut: "brouillon",
    modifieeDepuisRelecture: true,
    rechercheImage: res.slide.rechercheImage.trim() || actuelle.rechercheImage,
    ambianceImage: res.slide.ambianceImage.trim() || actuelle.ambianceImage,
  };
}
