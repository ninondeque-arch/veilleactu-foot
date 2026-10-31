// Publication via l'API Upload-Post (https://docs.upload-post.com), côté serveur uniquement.
// La clé UPLOAD_POST_API_KEY est lue dans .env et n'est jamais envoyée au navigateur.

const BASE = "https://api.upload-post.com";

export const PLATEFORMES = ["tiktok", "instagram", "linkedin"] as const;
export type Plateforme = (typeof PLATEFORMES)[number];

export class ErreurPublication extends Error {}

export function cleUploadPost(): string | null {
  const cle = process.env.UPLOAD_POST_API_KEY?.trim();
  return cle && cle !== "votre-cle" ? cle : null;
}

async function appel(chemin: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const cle = cleUploadPost();
  if (!cle) throw new ErreurPublication("Clé Upload-Post absente : ajoutez UPLOAD_POST_API_KEY dans le fichier .env puis relancez le serveur.");
  let rep: Response;
  try {
    rep = await fetch(`${BASE}${chemin}`, {
      ...init,
      headers: { Authorization: `Apikey ${cle}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    throw new ErreurPublication(`Upload-Post injoignable : ${(e as Error).message}`);
  }
  const corps = (await rep.json().catch(() => ({}))) as Record<string, unknown>;
  if (!rep.ok || corps.success === false) {
    const message = (corps.message ?? corps.error ?? `HTTP ${rep.status}`) as string;
    if (rep.status === 401) throw new ErreurPublication("Clé Upload-Post refusée (invalide ou expirée).");
    if (rep.status === 429) throw new ErreurPublication(`Limite Upload-Post atteinte : ${message}`);
    throw new ErreurPublication(`Upload-Post (${rep.status}) : ${message}`);
  }
  return corps;
}

export type Profil = {
  username: string;
  nom: string;
  comptes: Partial<Record<Plateforme, { nom: string; reconnexion: boolean }>>;
};

/** Profils Upload-Post et comptes sociaux connectés. */
export async function listerProfils(): Promise<Profil[]> {
  const res = await appel("/api/uploadposts/users");
  const profils = (res.profiles ?? []) as {
    username: string;
    display_name?: string;
    social_accounts?: Record<string, { display_name?: string; username?: string; handle?: string; reauth_required?: boolean } | string | null>;
  }[];
  return profils.map((p) => {
    const comptes: Profil["comptes"] = {};
    for (const pl of PLATEFORMES) {
      const compte = p.social_accounts?.[pl];
      if (compte && typeof compte === "object") {
        comptes[pl] = {
          nom: compte.display_name || compte.username || compte.handle || pl,
          reconnexion: Boolean(compte.reauth_required),
        };
      }
    }
    return { username: p.username, nom: p.display_name || p.username, comptes };
  });
}

export type EnvoiPhotos = {
  profil: string;
  plateformes: Plateforme[];
  images: Blob[];
  nomsFichiers: string[];
  champs: Record<string, string>;
  idExterne: string;
};

/** Envoi asynchrone : Upload-Post répond tout de suite avec un request_id à suivre. */
export async function envoyerPhotos(e: EnvoiPhotos): Promise<{ requestId: string; brut: Record<string, unknown> }> {
  const form = new FormData();
  form.append("user", e.profil);
  for (const p of e.plateformes) form.append("platform[]", p);
  e.images.forEach((img, i) => form.append("photos[]", img, e.nomsFichiers[i]));
  for (const [k, v] of Object.entries(e.champs)) form.append(k, v);
  form.append("async_upload", "true");
  form.append("external_id", e.idExterne.slice(0, 255));
  const res = await appel("/api/upload_photos", { method: "POST", body: form });
  const requestId = (res.request_id ?? res.job_id ?? "") as string;
  return { requestId, brut: res };
}

export type StatutEnvoi = {
  statut: string;
  resultats: { plateforme: string; succes: boolean; statut?: string; message?: string; url?: string }[];
};

export async function statutEnvoi(requestId: string): Promise<StatutEnvoi> {
  const res = await appel(`/api/uploadposts/status?request_id=${encodeURIComponent(requestId)}`);
  const resultats = ((res.results ?? []) as Record<string, unknown>[]).map((r) => ({
    plateforme: String(r.platform ?? "?"),
    succes: Boolean(r.success),
    statut: r.status as string | undefined,
    message: (r.message ?? r.error) as string | undefined,
    url: (r.url ?? r.post_url) as string | undefined,
  }));
  return { statut: String(res.status ?? "inconnu"), resultats };
}
