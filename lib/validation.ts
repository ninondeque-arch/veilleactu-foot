// Règles de validation éditoriale, partagées par l'écran de validation et l'export.
import type { Carrousel, PhraseVerifiee, Slide } from "./types";

const normaliser = (t: string) => t.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Une phrase signalée n'est plus « active » si elle a disparu du texte (supprimée ou réécrite). */
export function phraseToujoursPresente(p: PhraseVerifiee, slide: Slide): boolean {
  const cible = normaliser(p.phrase.replace(/^Date\s*:\s*/i, ""));
  if (/^date\s*:/i.test(p.phrase)) return normaliser(slide.date) === cible;
  return normaliser(slide.texte).includes(cible) || normaliser(slide.titre) === cible;
}

export function phrasesActives(c: Carrousel, slide: Slide): PhraseVerifiee[] {
  return (c.relecture?.phrases ?? []).filter((p) => p.slide === slide.numero && phraseToujoursPresente(p, slide));
}

export function phrasesRougesRestantes(c: Carrousel): PhraseVerifiee[] {
  return c.slides.flatMap((s) => phrasesActives(c, s).filter((p) => p.statut === "rouge"));
}

export function aVerifierRestants(c: Carrousel): number {
  return c.slides.filter((s) => /\[À VÉRIFIER\]/i.test(s.texte + s.date + s.titre)).length;
}

/** Raisons qui bloquent l'export. Liste vide = export autorisé. */
export function blocagesExport(c: Carrousel): string[] {
  const raisons: string[] = [];
  if (!c.relecture) raisons.push("La relecture IA n'a pas encore été effectuée.");
  const rouges = phrasesRougesRestantes(c);
  if (rouges.length) {
    raisons.push(
      `${rouges.length} phrase${rouges.length > 1 ? "s" : ""} rouge${rouges.length > 1 ? "s" : ""} (introuvable${rouges.length > 1 ? "s" : ""} dans les sources) à corriger ou supprimer.`,
    );
  }
  const nonValidees = c.slides.filter((s) => s.statut !== "validee");
  if (nonValidees.length) {
    raisons.push(
      `${nonValidees.length} slide${nonValidees.length > 1 ? "s" : ""} non validée${nonValidees.length > 1 ? "s" : ""} (${nonValidees.map((s) => s.numero).join(", ")}).`,
    );
  }
  const aVerifier = aVerifierRestants(c);
  if (aVerifier) raisons.push(`${aVerifier} slide${aVerifier > 1 ? "s contiennent" : " contient"} encore « [À VÉRIFIER] ».`);
  return raisons;
}

/** Une slide ne peut pas être validée tant qu'elle contient une phrase rouge ou [À VÉRIFIER]. */
export function blocagesSlide(c: Carrousel, slide: Slide): string[] {
  const r: string[] = [];
  if (!c.relecture) r.push("Relecture IA requise");
  if (phrasesActives(c, slide).some((p) => p.statut === "rouge")) r.push("Phrase rouge à corriger");
  if (/\[À VÉRIFIER\]/i.test(slide.texte + slide.date + slide.titre)) r.push("« [À VÉRIFIER] » à compléter");
  return r;
}
