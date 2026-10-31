// Appels à Claude via Claude Code en mode sans interface (`claude -p`), côté serveur uniquement.
// L'outil utilise la connexion Claude Code de l'ordinateur : aucune clé API n'est nécessaire.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { modeDemo } from "./demo";

export const MODELE = "claude-opus-5-5";
const DELAI_MAX_MS = 6 * 60 * 1000;

export class ErreurIA extends Error {}

/** Cherche l'exécutable `claude` (le PATH est réduit quand le script tourne via launchd). */
function trouverClaude(): string | null {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const maison = os.homedir();
  const dossiers = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(maison, ".npm-global/bin"),
    path.join(maison, ".claude/local"),
    path.join(maison, ".local/bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ];
  for (const d of dossiers) {
    const candidat = path.join(d, "claude");
    if (d && existsSync(candidat)) return candidat;
  }
  return null;
}

export function moteurDisponible(): boolean {
  return !modeDemo() && trouverClaude() !== null;
}

type Effort = "low" | "medium" | "high";

type ResultatClaudeCode = {
  is_error: boolean;
  subtype: string;
  result?: string;
  structured_output?: unknown;
};

function executer(bin: string, args: string[], entree: string): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    // Sans ANTHROPIC_API_KEY, Claude Code utilise toujours la connexion de l'utilisateur.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const proc = spawn(bin, args, { cwd: os.tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] });
    let sortie = "";
    let erreurs = "";
    const minuterie = setTimeout(() => {
      proc.kill();
      rejeter(new ErreurIA("Claude Code n'a pas répondu à temps (6 min). Réessayez."));
    }, DELAI_MAX_MS);
    proc.stdout.on("data", (d) => (sortie += d));
    proc.stderr.on("data", (d) => (erreurs += d));
    proc.on("error", (e) => {
      clearTimeout(minuterie);
      rejeter(new ErreurIA(`Impossible de lancer Claude Code : ${e.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(minuterie);
      if (sortie.trim()) resoudre(sortie);
      else rejeter(new ErreurIA(`Claude Code s'est arrêté (code ${code}). ${erreurs.trim().slice(0, 300)}`));
    });
    proc.stdin.end(entree);
  });
}

/** Un appel Claude dont la réponse est validée contre un schéma Zod. */
export async function appelStructure<S extends z.ZodType>(options: {
  systeme: string;
  message: string;
  schema: S;
  effort: Effort;
}): Promise<z.infer<S>> {
  if (modeDemo()) throw new ErreurIA("Mode démo : l'IA est désactivée en ligne.");
  const bin = trouverClaude();
  if (!bin) {
    throw new ErreurIA("Claude Code est introuvable sur cet ordinateur. Installez-le puis connectez-vous en lançant `claude` dans un terminal.");
  }
  // Claude Code refuse la déclaration "$schema" ajoutée par Zod : on la retire.
  const { $schema: _, ...schemaJson } = z.toJSONSchema(options.schema);
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(schemaJson),
    "--system-prompt", options.systeme,
    "--model", MODELE,
    "--effort", options.effort,
    "--tools", "", // aucun outil : Claude ne fait que lire et répondre
    "--setting-sources", "", // n'applique pas les réglages, mémoires ou CLAUDE.md de l'utilisateur
    "--no-session-persistence",
  ];
  const brut = await executer(bin, args, options.message);

  let res: ResultatClaudeCode;
  try {
    res = JSON.parse(brut);
  } catch {
    throw new ErreurIA(`Réponse illisible de Claude Code : ${brut.slice(0, 200)}`);
  }
  if (res.is_error) {
    throw new ErreurIA(`Claude Code : ${res.result ?? res.subtype}. Vérifiez que vous êtes connecté (lancez \`claude\` dans un terminal).`);
  }
  const valide = options.schema.safeParse(res.structured_output);
  if (!valide.success) {
    throw new ErreurIA("La réponse de l'IA n'a pas le format attendu. Réessayez.");
  }
  return valide.data;
}
