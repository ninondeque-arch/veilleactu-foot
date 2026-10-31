"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Article, SujetVeille, Veille } from "@/lib/types";

type ResumeCarrousel = {
  id: string;
  titre: string;
  sujet: string;
  creeLe: string;
  exemple: boolean;
  validees: number;
  score: string | null;
};

const MESSAGE_DEMO = "Démo : résultat préenregistré";
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Accueil({
  ia,
  demo,
  veilles,
  carrousels,
}: {
  ia: boolean;
  demo: { idCarrousel: string } | null; // mode démo en ligne : résultats préenregistrés, aucun appel à l'IA
  veilles: Veille[];
  carrousels: ResumeCarrousel[];
}) {
  const router = useRouter();
  const [liste, setListe] = useState(veilles);
  const [veilleId, setVeilleId] = useState(veilles[0]?.id ?? "");
  const [veilleEnCours, setVeilleEnCours] = useState(false);
  const [generation, setGeneration] = useState<{ sujet: string; etape: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<"sujet" | "lien">("sujet");
  const [saisie, setSaisie] = useState("");
  const [noteDemo, setNoteDemo] = useState<string | null>(null);

  const veille = liste.find((v) => v.id === veilleId) ?? null;

  useEffect(() => {
    if (!generation) return;
    const t = setTimeout(
      () => setGeneration((g) => (g ? { ...g, etape: "L'IA rédactrice écrit les 6 slides à partir des sources (une à trois minutes)…" } : g)),
      6000,
    );
    return () => clearTimeout(t);
  }, [generation?.sujet]); // eslint-disable-line react-hooks/exhaustive-deps

  const lancerVeille = async () => {
    setVeilleEnCours(true);
    setErreur(null);
    if (demo) {
      await pause(1200);
      setVeilleId(veilles[0]?.id ?? "");
      setNoteDemo(`${MESSAGE_DEMO} : la veille d'exemple est affichée ci-dessous.`);
      setVeilleEnCours(false);
      return;
    }
    try {
      const r = await fetch("/api/veille", { method: "POST" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.erreur);
      setListe((l) => [v as Veille, ...l.filter((x) => x.id !== v.id)]);
      setVeilleId(v.id);
    } catch (e) {
      setErreur(`Veille impossible : ${(e as Error).message}`);
    } finally {
      setVeilleEnCours(false);
    }
  };

  const creer = async (corps: { sujet?: string; articles?: Article[]; lien?: string }) => {
    if (demo) {
      setErreur(null);
      setNoteDemo(`${MESSAGE_DEMO} : quel que soit le sujet choisi, c'est le carrousel d'exemple qui s'ouvre.`);
      setGeneration({ sujet: corps.sujet ?? corps.lien ?? "", etape: `${MESSAGE_DEMO} — ouverture du carrousel d'exemple…` });
      await pause(1500);
      router.push(`/carrousel/${demo.idCarrousel}`);
      return;
    }
    if (!ia) {
      setErreur("La génération nécessite Claude Code (voir README). L'exemple pré-chargé reste disponible ci-dessous.");
      return;
    }
    setErreur(null);
    setGeneration({ sujet: corps.sujet ?? corps.lien ?? "", etape: "Récupération du texte des articles sources…" });
    try {
      const r = await fetch("/api/carrousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erreur);
      router.push(`/carrousel/${d.id}`);
    } catch (e) {
      setErreur(`Génération impossible : ${(e as Error).message}`);
      setGeneration(null);
    }
  };

  return (
    <>
      {noteDemo && <p className="alerte alerte-info section">{noteDemo}</p>}
      {!ia && !demo && (
        <p className="alerte alerte-attention section">
          <strong>Claude Code introuvable : mode hors ligne.</strong> La veille fonctionne (regroupement simple), et l'exemple
          Mbappé/Chine montre tout le workflow. Pour la génération par l'IA, installez Claude Code et connectez-vous (voir README).
        </p>
      )}
      {erreur && <p className="alerte alerte-erreur section">{erreur}</p>}
      {generation && (
        <p className="alerte alerte-info section ligne-flex">
          <span className="chargement" />
          <span>
            <strong>{generation.sujet}</strong> — {generation.etape}
          </span>
        </p>
      )}

      <section className="section">
        <div className="section-tete">
          <h2>Carrousels</h2>
        </div>
        <div className="liste-carrousels">
          {carrousels.map((c) => (
            <Link key={c.id} href={`/carrousel/${c.id}`}>
              <div className="carte" style={{ height: "100%" }}>
                <div className="ligne-flex" style={{ marginBottom: 8 }}>
                  {c.exemple && <span className="badge badge-nuit">Exemple</span>}
                  <span className={`badge ${c.validees === 6 ? "badge-vert" : ""}`}>{c.validees}/6 validées</span>
                  {c.score && <span className="badge">{c.score} confirmées</span>}
                </div>
                <div style={{ fontWeight: 600 }}>{c.titre}</div>
                <div className="petit muet" style={{ marginTop: 4 }}>{dateHeure(c.creeLe)}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section carte">
        <div className="onglets" role="tablist">
          <button className={`onglet ${onglet === "sujet" ? "actif" : ""}`} onClick={() => setOnglet("sujet")} role="tab" aria-selected={onglet === "sujet"}>
            Saisir un sujet
          </button>
          <button className={`onglet ${onglet === "lien" ? "actif" : ""}`} onClick={() => setOnglet("lien")} role="tab" aria-selected={onglet === "lien"}>
            Coller un lien
          </button>
        </div>
        <form
          className="ligne-flex"
          style={{ flexWrap: "nowrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!saisie.trim()) return;
            creer(onglet === "lien" ? { lien: saisie.trim() } : { sujet: saisie.trim() });
          }}
        >
          <input
            className="champ"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder={onglet === "lien" ? "https://… (lien vers un article)" : "Ex. : sanction de la LFP contre un club de Ligue 1"}
            type={onglet === "lien" ? "url" : "text"}
          />
          <button className="btn btn-principal" type="submit" disabled={!!generation}>
            Générer le carrousel
          </button>
        </form>
        <p className="petit muet" style={{ marginBottom: 0 }}>
          {onglet === "lien"
            ? "Le texte de l'article sert de source unique."
            : "Les articles Google News des 7 derniers jours sur ce sujet servent de sources (6 au maximum)."}
        </p>
      </section>

      <section className="section">
        <div className="section-tete">
          <h2>Veille foot</h2>
          <div className="ligne-flex">
            {liste.length > 0 && (
              <select className="champ" style={{ width: "auto" }} value={veilleId} onChange={(e) => setVeilleId(e.target.value)} aria-label="Veilles précédentes">
                {liste.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.exemple ? "Exemple · " : ""}
                    {dateHeure(v.date)} · {v.sujets.length} sujets
                  </option>
                ))}
              </select>
            )}
            <button className="btn btn-principal" onClick={lancerVeille} disabled={veilleEnCours}>
              {veilleEnCours ? <span className="chargement" /> : null}
              {veilleEnCours ? "Veille en cours…" : "Lancer la veille du jour"}
            </button>
          </div>
        </div>

        {veille ? (
          <>
            <p className="petit muet" style={{ marginTop: 0 }}>
              {veille.exemple ? "Veille d'exemple (fonctionne hors ligne). " : ""}
              {veille.nbArticlesBruts} articles collectés, {veille.sujets.reduce((n, s) => n + s.articles.length, 0)} retenus après dédoublonnage
              dans {veille.sujets.length} sujets · regroupement {veille.regroupement === "ia" ? "par l'IA" : "simple (sans IA)"}.
            </p>
            {veille.erreurs.length > 0 && (
              <details className="petit" style={{ marginBottom: 10 }}>
                <summary>{veille.erreurs.length} avertissement(s)</summary>
                <ul>{veille.erreurs.map((e) => <li key={e}>{e}</li>)}</ul>
              </details>
            )}
            <div className="sujets">
              {veille.sujets.map((s) => (
                <SujetCarte key={s.id} sujet={s} occupe={!!generation} onCreer={() => creer({ sujet: s.titre, articles: s.articles })} />
              ))}
            </div>
          </>
        ) : (
          <p className="carte muet">Aucune veille enregistrée. Cliquez sur « Lancer la veille du jour ».</p>
        )}
      </section>
    </>
  );
}

function SujetCarte({ sujet, onCreer, occupe }: { sujet: SujetVeille; onCreer: () => void; occupe: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const medias = [...new Set(sujet.articles.map((a) => a.media))];
  const derniere = sujet.articles.reduce((m, a) => (a.date > m ? a.date : m), sujet.articles[0].date);
  return (
    <div className="carte sujet">
      <div>
        <h3>{sujet.titre}</h3>
        <p className="petit muet" style={{ margin: "4px 0 0" }}>{sujet.resume}</p>
        <div className="sujet-meta">
          <span className="badge">{sujet.articles.length} article{sujet.articles.length > 1 ? "s" : ""}</span>
          <span className="petit muet">{dateHeure(derniere)}</span>
          {medias.slice(0, 6).map((m) => (
            <span key={m} className="media">{m}</span>
          ))}
          {medias.length > 6 && <span className="petit muet">+{medias.length - 6}</span>}
          <button className="btn btn-discret btn-petit" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}>
            {ouvert ? "Masquer les articles" : "Voir les articles"}
          </button>
        </div>
        {ouvert && (
          <ul className="articles">
            {sujet.articles.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer">{a.titre}</a>{" "}
                <span className="muet petit">— {a.media}, {dateHeure(a.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="btn" onClick={onCreer} disabled={occupe}>
        Faire un carrousel →
      </button>
    </div>
  );
}
