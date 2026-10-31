// Schémas des sorties structurées demandées à Claude.
// Ils restent simples : les sorties structurées n'acceptent pas toutes les contraintes Zod.
import { z } from "zod";

export const SlideIA = z.object({
  numero: z.number().int(),
  titre: z.string(),
  texte: z.string(),
  date: z.string(),
  sourceIds: z.array(z.string()),
  rechercheImage: z.string(),
  ambianceImage: z.string(),
});

export const CarrouselIA = z.object({
  titre: z.string(),
  slides: z.array(SlideIA),
  legendes: z.object({
    tiktok: z.string(),
    instagram: z.string(),
    linkedin: z.string(),
  }),
});

export const SlideSeuleIA = z.object({ slide: SlideIA });

export const RelectureIA = z.object({
  phrases: z.array(
    z.object({
      slide: z.number().int(),
      phrase: z.string(),
      statut: z.enum(["vert", "orange", "rouge"]),
      sourceId: z.string().nullable(),
      extrait: z.string().nullable(),
      explication: z.string(),
      reformulation: z.string().nullable(),
    }),
  ),
  commentaireGeneral: z.string(),
});

export const RisqueIA = z.object({
  niveau: z.enum(["faible", "moyen", "élevé"]),
  synthese: z.string(),
  points: z.array(
    z.object({
      slide: z.number().int().nullable(),
      categorie: z.enum([
        "formulation ambiguë",
        "citation hors contexte",
        "sujet sensible",
        "chiffre sans nuance",
        "prise de parti",
      ]),
      passage: z.string(),
      probleme: z.string(),
      suggestion: z.string(),
    }),
  ),
});

export const RegroupementIA = z.object({
  sujets: z.array(
    z.object({
      titre: z.string(),
      resume: z.string(),
      articleIds: z.array(z.string()),
    }),
  ),
});
