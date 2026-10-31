"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Carrousel } from "@/lib/types";
import type { FormatSlide } from "./SlideVisuel";

type Plateforme = "tiktok" | "instagram" | "linkedin";
type Profil = { username: string; nom: string; comptes: Partial<Record<Plateforme, { nom: string; reconnexion: boolean }>> };

const NOMS: Record<Plateforme, string> = { tiktok: "TikTok", instagram: "Instagram", linkedin: "LinkedIn" };
const CONFIDENTIALITE_TIKTOK = [
  { valeur: "SELF_ONLY", libelle: "Privé (moi uniquement)" },
  { valeur: "MUTUAL_FOLLOW_FRIENDS", libelle: "Amis" },
  { valeur: "FOLLOWER_OF_CREATOR", libelle: "Abonnés" },
  { valeur: "PUBLIC_TO_EVERYONE", libelle: "Public" },
];
const VISIBILITE_LINKEDIN = [
  { valeur: "CONNECTIONS", libelle: "Relations uniquement" },
  { valeur: "PUBLIC", libelle: "Public" },
];
const FINIS = ["completed", "failed", "not_found"];
const LIBELLE_STATUT: Record<string, string> = {
  pending: "En attente", queued: "En file", processing: "En cours", in_progress: "En cours",
  completed: "Terminée", failed: "Échec", not_found: "Introuvable",
};

export function PanneauPublication({
  c,
  bloque,
  genererImages,
  onMaj,
}: {
  c: Carrousel;
  bloque: boolean;
  genererImages: (format: FormatSlide) => Promise<Blob[]>;
  onMaj: (c: Carrousel) => void;
}) {
  const [config, setConfig] = useState<{ configure: boolean; profils: Profil[]; erreur?: string } | null>(null);
  const [profil, setProfil] = useState("");
  const [choix, setChoix] = useState<Plateforme[]>([]);
  const [tiktok, setTiktok] = useState("SELF_ONLY");
  const [linkedin, setLinkedin] = useState("CONNECTIONS");
  const [confirmation, setConfirmation] = useState(false);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const suivi = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/publication")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d);
        if (d.profils?.length) setProfil(d.profils[0].username);
      })
      .catch(() => setConfig({ configure: true, profils: [], erreur: "Impossible de joindre le serveur." }));
  }, []);

  const profilChoisi = config?.profils.find((p) => p.username === profil);
  const disponibles = (Object.keys(NOMS) as Plateforme[]).filter((p) => profilChoisi?.comptes[p] && !profilChoisi.comptes[p]!.reconnexion);

  // Suivi du statut des publications en cours (toutes les 7 s, 3 min au plus).
  const suivre = useCallback(() => {
    if (suivi.current) clearInterval(suivi.current);
    const debut = Date.now();
    suivi.current = setInterval(async () => {
      const r = await fetch(`/api/carrousel/${c.id}/publier`).then((x) => x.json()).catch(() => null);
      if (r?.carrousel) onMaj(r.carrousel);
      const enCours = (r?.carrousel?.publications ?? []).some((p: { statut: string }) => !FINIS.includes(p.statut));
      if (!enCours || Date.now() - debut > 180000) {
        clearInterval(suivi.current!);
        suivi.current = null;
      }
    }, 7000);
  }, [c.id, onMaj]);

  useEffect(() => {
    if ((c.publications ?? []).some((p) => !FINIS.includes(p.statut))) suivre();
    return () => {
      if (suivi.current) clearInterval(suivi.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const publier = async () => {
    setErreur(null);
    try {
      const form = new FormData();
      form.append("profil", profil);
      form.append("plateformes", JSON.stringify(choix));
      form.append("confidentialiteTiktok", tiktok);
      form.append("visibiliteLinkedin", linkedin);
      if (choix.includes("tiktok")) {
        setEnvoi("Préparation des images TikTok (9:16)…");
        for (const img of await genererImages("tiktok")) form.append("imagesTiktok[]", img, "slide.jpg");
      }
      if (choix.some((p) => p !== "tiktok")) {
        setEnvoi("Préparation des images Instagram / LinkedIn (4:5)…");
        for (const img of await genererImages("instagram")) form.append("imagesCarre[]", img, "slide.jpg");
      }
      setEnvoi("Envoi à Upload-Post…");
      const r = await fetch(`/api/carrousel/${c.id}/publier`, { method: "POST", body: form });
      const d = await r.json();
      if (d.carrousel) onMaj(d.carrousel);
      if (d.erreurs?.length || d.erreur) setErreur([d.erreur, ...(d.erreurs ?? [])].filter(Boolean).join(" · "));
      if (r.ok) suivre();
      setConfirmation(false);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(null);
    }
  };

  const basculer = (p: Plateforme) => setChoix((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));

  return (
    <div className="carte">
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Publication</h2>

      {!config && <p className="petit muet ligne-flex"><span className="chargement" /> Connexion à Upload-Post…</p>}

      {config && !config.configure && (
        <p className="petit muet" style={{ margin: 0 }}>
          Publication non configurée : ajoutez <code>UPLOAD_POST_API_KEY</code> dans le fichier <code>.env</code> du projet, puis relancez le
          serveur (voir README).
        </p>
      )}

      {config?.erreur && <p className="alerte alerte-erreur petit">{config.erreur}</p>}

      {config?.configure && config.profils.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <label className="petit" style={{ display: "grid", gap: 4 }}>
            Profil Upload-Post
            <select className="champ" value={profil} onChange={(e) => { setProfil(e.target.value); setChoix([]); }} disabled={confirmation}>
              {config.profils.map((p) => <option key={p.username} value={p.username}>{p.nom}</option>)}
            </select>
          </label>

          <div className="petit" style={{ display: "grid", gap: 4 }}>
            {(Object.keys(NOMS) as Plateforme[]).map((p) => {
              const compte = profilChoisi?.comptes[p];
              return (
                <label key={p} className="ligne-flex" style={{ gap: 6, opacity: disponibles.includes(p) ? 1 : 0.5 }}>
                  <input type="checkbox" checked={choix.includes(p)} onChange={() => basculer(p)} disabled={!disponibles.includes(p) || confirmation} />
                  {NOMS[p]}
                  <span className="muet">
                    {compte ? (compte.reconnexion ? "· à reconnecter dans Upload-Post" : `· ${compte.nom}`) : "· non connecté"}
                  </span>
                </label>
              );
            })}
          </div>

          {choix.includes("tiktok") && (
            <label className="petit" style={{ display: "grid", gap: 4 }}>
              Visibilité TikTok
              <select className="champ" value={tiktok} onChange={(e) => setTiktok(e.target.value)} disabled={confirmation}>
                {CONFIDENTIALITE_TIKTOK.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
              </select>
            </label>
          )}
          {choix.includes("linkedin") && (
            <label className="petit" style={{ display: "grid", gap: 4 }}>
              Visibilité LinkedIn
              <select className="champ" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} disabled={confirmation}>
                {VISIBILITE_LINKEDIN.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
              </select>
            </label>
          )}

          {!confirmation ? (
            <button className="btn btn-principal" style={{ justifyContent: "center" }} disabled={bloque || !choix.length || !!envoi} onClick={() => setConfirmation(true)}>
              Préparer la publication
            </button>
          ) : (
            <div className="garde-fou petit" style={{ display: "grid", gap: 8 }}>
              <strong>Vérifiez avant d'envoyer</strong>
              <div>
                Profil <strong>{profilChoisi?.nom}</strong> · {c.slides.length} images par réseau
              </div>
              {choix.map((p) => (
                <div key={p}>
                  <strong>{NOMS[p]}</strong> ({profilChoisi?.comptes[p]?.nom}
                  {p === "tiktok" ? `, ${CONFIDENTIALITE_TIKTOK.find((o) => o.valeur === tiktok)?.libelle}, 9:16` : ""}
                  {p === "linkedin" ? `, ${VISIBILITE_LINKEDIN.find((o) => o.valeur === linkedin)?.libelle}, 4:5` : ""}
                  {p === "instagram" ? ", 4:5" : ""}) :
                  <div className="muet" style={{ marginTop: 2 }}>« {c.legendes[p].slice(0, 140)}{c.legendes[p].length > 140 ? "…" : ""} »</div>
                </div>
              ))}
              <div className="ligne-flex">
                <button className="btn btn-valider" onClick={publier} disabled={!!envoi || bloque}>
                  {envoi ? <span className="chargement" /> : null} Confirmer et publier
                </button>
                <button className="btn" onClick={() => setConfirmation(false)} disabled={!!envoi}>Annuler</button>
              </div>
              {envoi && <span className="muet">{envoi}</span>}
            </div>
          )}

          <p className="petit muet" style={{ margin: 0 }}>
            {bloque
              ? "Bloqué : la publication suit les mêmes règles que l'export."
              : "Le serveur revérifie la validation avant tout envoi."}
          </p>
        </div>
      )}

      {config?.configure && !config.erreur && config.profils.length === 0 && (
        <p className="petit muet" style={{ margin: 0 }}>Aucun profil Upload-Post : créez-en un et connectez vos comptes sur upload-post.com.</p>
      )}

      {erreur && <p className="alerte alerte-erreur petit" style={{ marginBottom: 0 }}>{erreur}</p>}

      {(c.publications ?? []).length > 0 && (
        <ul className="petit" style={{ paddingLeft: 18, marginBottom: 0 }}>
          {[...(c.publications ?? [])].reverse().map((p) => (
            <li key={p.requestId || p.date + p.format}>
              {p.plateformes.map((x) => NOMS[x as Plateforme] ?? x).join(", ")} ·{" "}
              <strong>{LIBELLE_STATUT[p.statut] ?? p.statut}</strong>
              {!FINIS.includes(p.statut) && <> <span className="chargement" style={{ width: 10, height: 10 }} /></>}
              {p.resultats.map((r, i) => (
                <div key={i} className="muet">
                  {NOMS[r.plateforme as Plateforme] ?? r.plateforme} : {r.succes ? "publié" : r.statut ?? "échec"}
                  {r.url && <> · <a href={r.url} target="_blank" rel="noreferrer">voir ↗</a></>}
                  {!r.succes && r.message ? ` (${r.message})` : ""}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
