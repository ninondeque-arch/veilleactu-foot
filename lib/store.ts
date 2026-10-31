// Sauvegarde locale en fichiers JSON (dossier data/).
// Les exemples (data/exemples) ne sont jamais modifiés : une copie de travail est créée au premier changement.
// En mode démo, seuls les exemples embarqués sont lus et rien n'est écrit sur le disque.
import { promises as fs } from "node:fs";
import path from "node:path";
import { CARROUSEL_DEMO, modeDemo, VEILLE_DEMO } from "./demo";
import type { Carrousel, Veille } from "./types";

const RACINE = path.join(process.cwd(), "data");
const DOSSIER_VEILLES = path.join(RACINE, "veilles");
const DOSSIER_CARROUSELS = path.join(RACINE, "carrousels");
const DOSSIER_EXEMPLES = path.join(RACINE, "exemples");

async function lireJson<T>(fichier: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(fichier, "utf8")) as T;
  } catch {
    return null;
  }
}

async function ecrireJson(fichier: string, donnees: unknown) {
  await fs.mkdir(path.dirname(fichier), { recursive: true });
  await fs.writeFile(fichier, JSON.stringify(donnees, null, 2), "utf8");
}

async function listerJson<T>(dossier: string): Promise<T[]> {
  try {
    const fichiers = (await fs.readdir(dossier)).filter((f) => f.endsWith(".json"));
    const contenus = await Promise.all(fichiers.map((f) => lireJson<T>(path.join(dossier, f))));
    return contenus.filter((c): c is Awaited<T> => c !== null) as T[];
  } catch {
    return [];
  }
}

const nomFichier = (id: string) => `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;

// --- Veilles ---

export async function listerVeilles(): Promise<Veille[]> {
  if (modeDemo()) return [VEILLE_DEMO];
  const exemples = (await listerJson<Veille>(DOSSIER_EXEMPLES)).filter((v) => "sujets" in v);
  const veilles = await listerJson<Veille>(DOSSIER_VEILLES);
  return [...veilles, ...exemples].sort((a, b) => b.date.localeCompare(a.date));
}

export async function lireVeille(id: string): Promise<Veille | null> {
  if (modeDemo()) return id === VEILLE_DEMO.id ? VEILLE_DEMO : null;
  return (
    (await lireJson<Veille>(path.join(DOSSIER_VEILLES, nomFichier(id)))) ??
    (await lireJson<Veille>(path.join(DOSSIER_EXEMPLES, nomFichier(id))))
  );
}

export async function enregistrerVeille(v: Veille) {
  if (modeDemo()) return;
  await ecrireJson(path.join(DOSSIER_VEILLES, nomFichier(v.id)), v);
}

// --- Carrousels ---

export async function listerCarrousels(): Promise<Carrousel[]> {
  if (modeDemo()) return [CARROUSEL_DEMO];
  const travail = await listerJson<Carrousel>(DOSSIER_CARROUSELS);
  const ids = new Set(travail.map((c) => c.id));
  const exemples = (await listerJson<Carrousel>(DOSSIER_EXEMPLES)).filter(
    (c) => "slides" in c && !ids.has(c.id),
  );
  return [...travail, ...exemples].sort((a, b) => b.creeLe.localeCompare(a.creeLe));
}

export async function lireCarrousel(id: string): Promise<Carrousel | null> {
  if (modeDemo()) return id === CARROUSEL_DEMO.id ? CARROUSEL_DEMO : null;
  return (
    (await lireJson<Carrousel>(path.join(DOSSIER_CARROUSELS, nomFichier(id)))) ??
    (await lireJson<Carrousel>(path.join(DOSSIER_EXEMPLES, nomFichier(id))))
  );
}

export async function enregistrerCarrousel(c: Carrousel) {
  if (modeDemo()) return;
  await ecrireJson(path.join(DOSSIER_CARROUSELS, nomFichier(c.id)), c);
}

/** Supprime la copie de travail : un exemple revient à son état d'origine. */
export async function reinitialiserCarrousel(id: string) {
  if (modeDemo()) return;
  await fs.rm(path.join(DOSSIER_CARROUSELS, nomFichier(id)), { force: true });
}

export function nouvelId(prefixe: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefixe}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
