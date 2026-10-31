"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Carrousel, ImageSlide, PhraseVerifiee, PointRisque, Slide } from "@/lib/types";
import {
  blocagesExport,
  blocagesSlide,
  phrasesActives,
  phrasesRougesRestantes,
} from "@/lib/validation";
import { SchemaWorkflow, type EtatEtape } from "./SchemaWorkflow";
import { ChoixImage } from "./ChoixImage";
import { PanneauPublication } from "./PanneauPublication";
import { ApercuSlide, creditImage, FORMATS, SlideVisuel, type FormatSlide } from "./SlideVisuel";

type EtapeIA = null | "relire" | "risque" | { regenerer: number };

const maintenant = () => new Date().toISOString();
const MESSAGE_DEMO = "Démo : résultat préenregistré";
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
type ActionIA = "relire" | "risque" | "regenerer" | "reinitialiser";
const dateCourte = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Texte d'une slide avec les phrases orange/rouges surlignées et les chiffres clés en accent. */
function TexteSurligne({ texte, phrases }: { texte: string; phrases: PhraseVerifiee[] }) {
  const plages: { debut: number; fin: number; statut: string }[] = [];
  for (const p of phrases) {
    if (p.statut === "vert") continue;
    const i = texte.indexOf(p.phrase);
    if (i >= 0 && !plages.some((r) => i < r.fin && i + p.phrase.length > r.debut)) {
      plages.push({ debut: i, fin: i + p.phrase.length, statut: p.statut });
    }
  }
  plages.sort((a, b) => a.debut - b.debut);
  const accent = (t: string, cle: string): ReactNode[] =>
    t.split(/(\*\*[^*]+\*\*)/g).map((m, i) =>
      m.startsWith("**") && m.endsWith("**") ? <span key={`${cle}-${i}`} className="acc">{m.slice(2, -2)}</span> : m,
    );
  const morceaux: ReactNode[] = [];
  let pos = 0;
  plages.forEach((r, i) => {
    morceaux.push(...accent(texte.slice(pos, r.debut), `a${i}`));
    morceaux.push(
      <mark key={`m${i}`} className={`m-${r.statut}`}>
        {accent(texte.slice(r.debut, r.fin), `m${i}`)}
      </mark>,
    );
    pos = r.fin;
  });
  morceaux.push(...accent(texte.slice(pos), "fin"));
  return <>{morceaux}</>;
}

const LIBELLE_STATUT = { vert: "Confirmée", orange: "Imprécise", rouge: "Introuvable" } as const;

/**
 * En mode démo (en ligne), les étapes IA rejouent les résultats préenregistrés de l'exemple (`initial`)
 * et rien n'est sauvegardé : chaque visiteur repart de l'exemple, la relecture et le test de risque
 * se rejouent à l'ouverture comme après une vraie génération.
 */
export function EcranValidation({ initial, ia, demo = false }: { initial: Carrousel; ia: boolean; demo?: boolean }) {
  const [c, setC] = useState<Carrousel>(demo ? { ...initial, relecture: null, risque: null } : initial);
  const [noteDemo, setNoteDemo] = useState<string | null>(null);
  const courantRef = useRef(c);
  courantRef.current = c;
  const iaDispo = ia || demo;
  const [etapeIA, setEtapeIA] = useState<EtapeIA>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatSlide>("instagram");
  const [edition, setEdition] = useState<{ numero: number; titre: string; date: string; texte: string } | null>(null);
  const [consignes, setConsignes] = useState<Record<number, string>>({});
  const [exportEnCours, setExportEnCours] = useState(false);
  const refsExport = useRef<Record<FormatSlide, (HTMLDivElement | null)[]>>({ instagram: [], tiktok: [] });
  const lancementAuto = useRef(false);

  const sauver = useCallback(async (suivant: Carrousel) => {
    setC(suivant);
    if (demo) return; // démo : l'état vit dans le navigateur, rien n'est écrit sur le serveur
    const r = await fetch(`/api/carrousel/${suivant.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(suivant),
    });
    if (!r.ok) setErreur("La sauvegarde a échoué.");
  }, [demo]);

  /** Démo : résultat préenregistré de l'exemple, appliqué à l'état courant. */
  const resultatDemo = useCallback(
    (action: ActionIA, extra: Record<string, unknown>, courant: Carrousel): Carrousel => {
      const historique = (texte: string) => [...courant.historique, { date: maintenant(), action: `${texte} (${MESSAGE_DEMO.toLowerCase()})` }];
      switch (action) {
        case "relire":
          return {
            ...courant,
            relecture: initial.relecture && { ...initial.relecture, date: maintenant() },
            slides: courant.slides.map((s) => ({ ...s, modifieeDepuisRelecture: false })),
            historique: historique(`Relecture IA : ${initial.relecture?.confirmees}/${initial.relecture?.total} phrases confirmées`),
          };
        case "risque":
          return {
            ...courant,
            risque: initial.risque && { ...initial.risque, date: maintenant() },
            historique: historique(`Test de risque : niveau ${initial.risque?.niveau}`),
          };
        case "regenerer": {
          const n = Number(extra.numero);
          const reference = initial.slides.find((s) => s.numero === n);
          return {
            ...courant,
            slides: courant.slides.map((s) =>
              s.numero === n && reference ? { ...reference, image: s.image, statut: "brouillon", modifieeDepuisRelecture: false } : s,
            ),
            historique: historique(`Slide ${n} régénérée par l'IA`),
          };
        }
        case "reinitialiser":
          return initial;
      }
    },
    [initial],
  );

  const actionIA = useCallback(
    async (action: ActionIA, extra: Record<string, unknown> = {}) => {
      setErreur(null);
      setEtapeIA(action === "regenerer" ? { regenerer: extra.numero as number } : action === "reinitialiser" ? null : action);
      if (demo) {
        await pause(action === "reinitialiser" ? 0 : 1400);
        const suivant = resultatDemo(action, extra, courantRef.current);
        setC(suivant);
        setNoteDemo(
          action === "reinitialiser"
            ? "Exemple réinitialisé."
            : `${MESSAGE_DEMO} : en usage réel, cette étape est un appel à Claude (${
                { relire: "relecture phrase par phrase", risque: "test de risque", regenerer: "régénération de la slide" }[action]
              }).`,
        );
        setEtapeIA(null);
        return suivant;
      }
      try {
        const r = await fetch(`/api/carrousel/${c.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
        const donnees = await r.json();
        if (!r.ok) throw new Error(donnees.erreur ?? "Erreur");
        setC(donnees as Carrousel);
        return donnees as Carrousel;
      } catch (e) {
        setErreur((e as Error).message);
        return null;
      } finally {
        setEtapeIA(null);
      }
    },
    [c.id, demo, resultatDemo],
  );

  // Après génération : relecture puis test de risque, automatiquement.
  useEffect(() => {
    if (lancementAuto.current || !iaDispo) return;
    lancementAuto.current = true;
    (async () => {
      let courant: Carrousel | null = c;
      if (!courant.relecture) courant = await actionIA("relire");
      if (courant && !courant.risque) await actionIA("risque");
    })();
  }, [c, iaDispo, actionIA]);

  const majSlide = (numero: number, modif: (s: Slide) => Slide, action: string) =>
    sauver({
      ...c,
      slides: c.slides.map((s) => (s.numero === numero ? modif(s) : s)),
      historique: [...c.historique, { date: maintenant(), action }],
    });

  const valider = (s: Slide) =>
    majSlide(s.numero, (x) => ({ ...x, statut: "validee" }), `Slide ${s.numero} validée par l'éditeur·rice`);
  const devalider = (s: Slide) =>
    majSlide(s.numero, (x) => ({ ...x, statut: "brouillon" }), `Validation de la slide ${s.numero} annulée`);

  const choisirImage = (s: Slide, image: ImageSlide | null) =>
    majSlide(
      s.numero,
      (x) => ({ ...x, image, statut: "brouillon" }),
      image ? `Slide ${s.numero} : photo choisie (${creditImage(image)})` : `Slide ${s.numero} : photo retirée`,
    );

  const enregistrerEdition = () => {
    if (!edition) return;
    majSlide(
      edition.numero,
      (x) => ({ ...x, titre: edition.titre, date: edition.date, texte: edition.texte, statut: "brouillon", modifieeDepuisRelecture: true }),
      `Slide ${edition.numero} modifiée à la main`,
    );
    setEdition(null);
  };

  const appliquer = (s: Slide, p: PhraseVerifiee, remplacement: string) => {
    const estDate = /^date\s*:/i.test(p.phrase);
    majSlide(
      s.numero,
      (x) => {
        if (estDate) return { ...x, date: remplacement.replace(/^date\s*:\s*/i, ""), statut: "brouillon", modifieeDepuisRelecture: true };
        const texte = x.texte.replace(p.phrase, remplacement).replace(/\s{2,}/g, " ").trim();
        return { ...x, texte, statut: "brouillon", modifieeDepuisRelecture: true };
      },
      remplacement
        ? `Slide ${s.numero} : reformulation du relecteur appliquée (« ${p.phrase.slice(0, 60)}… »)`
        : `Slide ${s.numero} : phrase ${p.statut} supprimée (« ${p.phrase.slice(0, 60)}… »)`,
    );
  };

  const majLegende = (reseau: keyof Carrousel["legendes"], valeur: string) =>
    setC((prev) => ({ ...prev, legendes: { ...prev.legendes, [reseau]: valeur } }));

  /** Capture les slides à taille réelle (PNG pour l'export, JPEG pour la publication). */
  const genererImages = useCallback(
    async (fmt: FormatSlide, type: "png" | "jpeg" = "jpeg"): Promise<Blob[]> => {
      const { toBlob } = await import("html-to-image");
      await document.fonts.ready;
      const { largeur, hauteur } = FORMATS[fmt];
      const images: Blob[] = [];
      for (let i = 0; i < c.slides.length; i++) {
        const noeud = refsExport.current[fmt][i]?.firstElementChild as HTMLElement | null;
        if (!noeud) throw new Error(`Slide ${i + 1} introuvable`);
        // includeQueryParams : sans lui, html-to-image met les images en cache par URL sans la requête,
        // et toutes les photos (/api/image?url=…) prenaient celle de la première slide.
        const blob = await toBlob(noeud, {
          width: largeur, height: hauteur, pixelRatio: 1, cacheBust: true, includeQueryParams: true,
          ...(type === "jpeg" ? { type: "image/jpeg", quality: 0.92 } : {}),
        });
        if (!blob) throw new Error(`Capture de la slide ${i + 1} impossible`);
        images.push(blob);
      }
      return images;
    },
    [c.slides.length],
  );

  const exporter = async () => {
    setExportEnCours(true);
    setErreur(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      (await genererImages(format, "png")).forEach((png, i) => zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, png));
      zip.file(
        "legendes.txt",
        `TIKTOK\n${c.legendes.tiktok}\n\nINSTAGRAM\n${c.legendes.instagram}\n\nLINKEDIN\n${c.legendes.linkedin}\n`,
      );
      zip.file("rapport-verification.txt", rapport(c, format));
      const blob = await zip.generateAsync({ type: "blob" });
      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(blob);
      lien.download = `${c.id}-${format}.zip`;
      lien.click();
      URL.revokeObjectURL(lien.href);
      await sauver({ ...c, historique: [...c.historique, { date: maintenant(), action: `Export ${FORMATS[format].libelle}` }] });
    } catch (e) {
      setErreur(`Export impossible : ${(e as Error).message}`);
    } finally {
      setExportEnCours(false);
    }
  };

  const blocages = blocagesExport(c);
  const validees = c.slides.filter((s) => s.statut === "validee").length;
  const rouges = phrasesRougesRestantes(c).length;
  const etats: EtatEtape[] = [
    "fait",
    "fait",
    etapeIA === "relire" ? "encours" : c.relecture ? "fait" : "afaire",
    etapeIA === "risque" ? "encours" : c.risque ? "fait" : "afaire",
    validees === c.slides.length ? "fait" : c.relecture ? "encours" : "afaire",
    blocages.length ? "afaire" : "encours",
  ];
  const pointsRisque = (n: number | null) => (c.risque?.points ?? []).filter((p) => p.slide === n);
  const occupe = etapeIA !== null;

  return (
    <div className="page">
      <SchemaWorkflow etats={etats} />

      <div className="section valid-tete">
        <div>
          <p className="muet petit" style={{ margin: 0 }}>
            <Link href="/">← Retour à la veille</Link> · Sujet : {c.sujet}
          </p>
          <h1 style={{ fontSize: 26, marginTop: 6 }}>{c.titre}</h1>
          <div className="ligne-flex" style={{ marginTop: 10 }}>
            <span className="badge">{c.sources.length} sources</span>
            <span className={`badge ${validees === c.slides.length ? "badge-vert" : ""}`}>
              {validees}/{c.slides.length} slides validées
            </span>
            {c.exemple && <span className="badge badge-nuit">Exemple pré-chargé</span>}
            {c.exemple && (
              <button className="btn btn-petit btn-discret" onClick={() => actionIA("reinitialiser")} disabled={occupe}>
                Réinitialiser l'exemple
              </button>
            )}
          </div>
          {c.noteExemple && <p className="alerte alerte-info" style={{ marginTop: 12 }}>{c.noteExemple}</p>}
          {!ia && !demo && (
            <p className="alerte alerte-attention" style={{ marginTop: 12 }}>
              Claude Code introuvable : la relecture, le test de risque et la régénération sont désactivés. La validation humaine et l'export
              fonctionnent.
            </p>
          )}
          {erreur && <p className="alerte alerte-erreur" style={{ marginTop: 12 }}>{erreur}</p>}
          {noteDemo && !etapeIA && <p className="alerte alerte-info" style={{ marginTop: 12 }}>{noteDemo}</p>}
          {etapeIA && (
            <p className="alerte alerte-info ligne-flex" style={{ marginTop: 12 }}>
              <span className="chargement" />
              {etapeIA === "relire"
                ? "L'IA relectrice vérifie chaque phrase contre les sources…"
                : etapeIA === "risque"
                  ? "Test de risque : comment ce contenu pourrait-il être mal compris ou détourné ?"
                  : `Régénération de la slide ${etapeIA.regenerer}…`}
            </p>
          )}
        </div>

        <div className="garde-fou">
          <div className="devise">Aucun contenu n'est publié sans validation humaine.</div>
          {blocages.length ? (
            <>
              <p className="petit muet" style={{ margin: "8px 0 0" }}>Export bloqué :</p>
              <ul>{blocages.map((b) => <li key={b}>{b}</li>)}</ul>
            </>
          ) : (
            <p className="petit" style={{ color: "var(--vert)", margin: "8px 0 0", fontWeight: 600 }}>
              Toutes les slides sont validées : l'export est débloqué.
            </p>
          )}
        </div>
      </div>

      <div className="valid-grille">
        <div>
          {c.slides.map((s) => {
            const phrases = phrasesActives(c, s);
            const aCorriger = phrases.filter((p) => p.statut !== "vert");
            const vertes = phrases.filter((p) => p.statut === "vert");
            const blocs = blocagesSlide(c, s);
            const enEdition = edition?.numero === s.numero;
            const regen = typeof etapeIA === "object" && etapeIA?.regenerer === s.numero;
            return (
              <section key={s.numero} className={`carte carte-slide ${s.statut === "validee" ? "validee" : ""}`}>
                <div>
                  <ApercuSlide
                    slide={enEdition ? { ...s, titre: edition.titre, date: edition.date, texte: edition.texte } : s}
                    sources={c.sources}
                    total={c.slides.length}
                    format={format}
                    largeurAffichee={252}
                    titreCarrousel={c.titre}
                  />
                </div>

                <div>
                  <div className="carte-slide-tete">
                    <h3>
                      Slide {s.numero} · {s.role}
                    </h3>
                    <div className="ligne-flex">
                      {s.modifieeDepuisRelecture && <span className="badge badge-orange">Modifiée depuis la relecture</span>}
                      {s.statut === "validee" ? (
                        <span className="badge badge-vert">Validée</span>
                      ) : (
                        <span className="badge">À valider</span>
                      )}
                    </div>
                  </div>

                  {enEdition ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div className="ligne-flex" style={{ flexWrap: "nowrap" }}>
                        <input className="champ" value={edition.titre} onChange={(e) => setEdition({ ...edition, titre: e.target.value })} aria-label="Titre" />
                        <input className="champ" style={{ maxWidth: 190 }} value={edition.date} onChange={(e) => setEdition({ ...edition, date: e.target.value })} aria-label="Date" />
                      </div>
                      <textarea className="champ" rows={5} value={edition.texte} onChange={(e) => setEdition({ ...edition, texte: e.target.value })} aria-label="Texte" />
                      <p className="petit muet" style={{ margin: 0 }}>
                        Entourez un chiffre clé de **astérisques** pour l'afficher en couleur d'accent. {edition.texte.split(/\s+/).filter(Boolean).length} mots.
                      </p>
                    </div>
                  ) : (
                    <div className="texte-verifie">
                      <span className="titre-slide">
                        {s.titre} <span className="muet" style={{ fontWeight: 400 }}>· {s.date}</span>
                      </span>
                      <TexteSurligne texte={s.texte} phrases={phrases} />
                    </div>
                  )}

                  <div className="sources-slide">
                    {s.sourceIds.length === 0 && <span className="badge badge-rouge">Aucune source citée</span>}
                    {s.sourceIds.map((id) => {
                      const src = c.sources.find((x) => x.id === id);
                      return src ? (
                        <a key={id} className="chip-source" href={src.url} target="_blank" rel="noreferrer" title={src.titre}>
                          {id} · {src.media} ↗
                        </a>
                      ) : null;
                    })}
                  </div>

                  {c.relecture && (
                    <div className="verifs">
                      {aCorriger.map((p, i) => (
                        <div key={i} className={`verif verif-${p.statut}`}>
                          <div className="ligne-flex" style={{ justifyContent: "space-between" }}>
                            <span className="phrase">« {p.phrase.replace(/\*\*/g, "")} »</span>
                            <span className={`badge badge-${p.statut}`}>{LIBELLE_STATUT[p.statut]}</span>
                          </div>
                          <div style={{ marginTop: 4 }}>{p.explication}</div>
                          {p.extrait && (
                            <div className="extrait">
                              {p.sourceId} : « {p.extrait} »
                            </div>
                          )}
                          {p.reformulation && (
                            <div className="reformulation">
                              <strong>Proposition :</strong> {p.reformulation.replace(/\*\*/g, "")}
                            </div>
                          )}
                          <div className="actions">
                            {p.reformulation && (
                              <button className="btn btn-petit" onClick={() => appliquer(s, p, p.reformulation!)} disabled={occupe}>
                                Appliquer la proposition
                              </button>
                            )}
                            {!/^date\s*:/i.test(p.phrase) && (
                              <button className="btn btn-petit" onClick={() => appliquer(s, p, "")} disabled={occupe}>
                                Supprimer la phrase
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {pointsRisque(s.numero).map((r, i) => (
                        <PointRisqueCarte key={`r${i}`} point={r} />
                      ))}
                      {vertes.length > 0 && (
                        <details>
                          <summary>
                            {vertes.length} phrase{vertes.length > 1 ? "s" : ""} confirmée{vertes.length > 1 ? "s" : ""} par les sources
                          </summary>
                          <div className="verifs">
                            {vertes.map((p, i) => (
                              <div key={i} className="verif verif-vert">
                                <span className="phrase">« {p.phrase.replace(/\*\*/g, "")} »</span>
                                {p.extrait && <div className="extrait">{p.sourceId} : « {p.extrait} »</div>}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  <ChoixImage key={s.rechercheImage ?? ""} slide={s} desactive={occupe} onChoisir={(img) => choisirImage(s, img)} />

                  <div className="actions-slide">
                    {enEdition ? (
                      <>
                        <button className="btn btn-principal" onClick={enregistrerEdition}>Enregistrer</button>
                        <button className="btn" onClick={() => setEdition(null)}>Annuler</button>
                      </>
                    ) : (
                      <>
                        {s.statut === "validee" ? (
                          <button className="btn" onClick={() => devalider(s)} disabled={occupe}>Annuler la validation</button>
                        ) : (
                          <button
                            className="btn btn-valider"
                            onClick={() => valider(s)}
                            disabled={occupe || blocs.length > 0}
                            title={blocs.join(" · ")}
                          >
                            Valider
                          </button>
                        )}
                        <button
                          className="btn"
                          onClick={() => setEdition({ numero: s.numero, titre: s.titre, date: s.date, texte: s.texte })}
                          disabled={occupe}
                        >
                          Modifier
                        </button>
                        <button
                          className="btn"
                          onClick={() => actionIA("regenerer", { numero: s.numero, consigne: consignes[s.numero] ?? "" })}
                          disabled={occupe || !iaDispo}
                          title={demo ? MESSAGE_DEMO : ia ? "" : "Nécessite Claude Code"}
                        >
                          {regen ? <span className="chargement" /> : null} Régénérer cette slide
                        </button>
                        <input
                          className="champ"
                          style={{ flex: 1, minWidth: 160, padding: "6px 10px", fontSize: 13 }}
                          placeholder="Consigne (facultatif) : ex. plus court"
                          value={consignes[s.numero] ?? ""}
                          onChange={(e) => setConsignes({ ...consignes, [s.numero]: e.target.value })}
                          disabled={!iaDispo}
                        />
                        {blocs.length > 0 && s.statut !== "validee" && <span className="petit" style={{ color: "var(--rouge)" }}>{blocs.join(" · ")}</span>}
                      </>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          <section className="carte section">
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>Légendes par réseau</h2>
            <div style={{ display: "grid", gap: 14 }}>
              {(["tiktok", "instagram", "linkedin"] as const).map((r) => (
                <label key={r} style={{ display: "grid", gap: 6 }}>
                  <span className="ligne-flex" style={{ justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 14 }}>{{ tiktok: "TikTok", instagram: "Instagram", linkedin: "LinkedIn" }[r]}</strong>
                    <span className="petit muet">{c.legendes[r].length} caractères</span>
                  </span>
                  <textarea
                    className="champ"
                    rows={r === "tiktok" ? 2 : 4}
                    value={c.legendes[r]}
                    onChange={(e) => majLegende(r, e.target.value)}
                    onBlur={() => sauver(c)}
                  />
                </label>
              ))}
              {pointsRisque(null).map((r, i) => (
                <PointRisqueCarte key={i} point={r} />
              ))}
            </div>
          </section>
        </div>

        <aside className="colonne-laterale">
          <div className="carte">
            <div className="ligne-flex" style={{ justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 15 }}>Fiabilité (relecture IA)</h2>
              <button className="btn btn-petit" onClick={() => actionIA("relire")} disabled={occupe || !iaDispo} title={demo ? MESSAGE_DEMO : undefined}>
                {etapeIA === "relire" ? <span className="chargement" /> : null} Relancer
              </button>
            </div>
            {c.relecture ? (
              <>
                <div style={{ marginTop: 12 }}>
                  <span className="score">{c.relecture.confirmees}</span>
                  <span className="muet"> / {c.relecture.total} phrases confirmées</span>
                </div>
                <JaugeRelecture phrases={c.relecture.phrases} />
                <div className="ligne-flex petit">
                  {(["vert", "orange", "rouge"] as const).map((st) => {
                    const n = c.relecture!.phrases.filter((p) => p.statut === st).length;
                    const mot = { vert: "verte", orange: "orange", rouge: "rouge" }[st];
                    return <span key={st} className={`badge badge-${st}`}>{n} {mot}{n > 1 && st !== "orange" ? "s" : ""}</span>;
                  })}
                </div>
                <p className="petit" style={{ marginBottom: 0 }}>{c.relecture.commentaireGeneral}</p>
                <p className="petit muet" style={{ marginBottom: 0 }}>
                  Relecture du {dateCourte(c.relecture.date)}
                  {rouges === 0 && c.relecture.phrases.some((p) => p.statut === "rouge") ? " · phrases rouges corrigées depuis" : ""}
                  {c.slides.some((s) => s.modifieeDepuisRelecture) ? " · des slides ont changé depuis : relance conseillée" : ""}
                </p>
              </>
            ) : (
              <p className="muet petit">Pas encore de relecture.</p>
            )}
          </div>

          <div className="carte">
            <div className="ligne-flex" style={{ justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 15 }}>Test de risque</h2>
              <button className="btn btn-petit" onClick={() => actionIA("risque")} disabled={occupe || !iaDispo} title={demo ? MESSAGE_DEMO : undefined}>
                {etapeIA === "risque" ? <span className="chargement" /> : null} Relancer
              </button>
            </div>
            {c.risque ? (
              <>
                <div style={{ marginTop: 12 }} className={`score niveau-${c.risque.niveau}`}>
                  Risque {c.risque.niveau}
                </div>
                <p className="petit">{c.risque.synthese}</p>
                <ol className="petit" style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 6 }}>
                  {c.risque.points.map((p, i) => (
                    <li key={i}>
                      <strong>{p.slide ? `Slide ${p.slide}` : "Légendes / ensemble"}</strong> · {p.categorie} : {p.probleme}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="muet petit">Pas encore de test de risque.</p>
            )}
          </div>

          <div className="carte">
            <h2 style={{ fontSize: 15, marginBottom: 10 }}>Aperçu et export</h2>
            <div className="ligne-flex" role="radiogroup">
              {(Object.keys(FORMATS) as FormatSlide[]).map((f) => (
                <button key={f} className={`btn btn-petit ${format === f ? "btn-principal" : ""}`} onClick={() => setFormat(f)} aria-pressed={format === f}>
                  {f === "instagram" ? "Instagram 4:5" : "TikTok 9:16"}
                </button>
              ))}
            </div>
            <div className="bandeau-apercu" style={{ marginTop: 12 }}>
              {c.slides.map((s) => (
                <ApercuSlide key={s.numero} slide={s} sources={c.sources} total={c.slides.length} format={format} largeurAffichee={96} titreCarrousel={c.titre} />
              ))}
            </div>
            <button className="btn btn-principal" style={{ width: "100%", justifyContent: "center" }} disabled={blocages.length > 0 || exportEnCours} onClick={exporter}>
              {exportEnCours ? <span className="chargement" /> : null}
              Exporter les 6 PNG ({FORMATS[format].largeur}×{FORMATS[format].hauteur}) en zip
            </button>
            <p className="petit muet" style={{ marginBottom: 0 }}>
              {blocages.length ? "Bloqué tant que les conditions ci-dessus ne sont pas remplies." : "Le zip contient aussi les légendes et le rapport de vérification."}
            </p>
          </div>

          {demo ? (
            <div className="carte">
              <h2 style={{ fontSize: 15, marginBottom: 6 }}>Publication</h2>
              <p className="petit muet" style={{ margin: 0 }}>
                Désactivée dans la démo en ligne. En usage réel, le carrousel validé part sur TikTok, Instagram et LinkedIn via
                Upload-Post, après un récapitulatif à confirmer.
              </p>
            </div>
          ) : (
            <PanneauPublication c={c} bloque={blocages.length > 0} genererImages={genererImages} onMaj={setC} />
          )}

          <details className="carte">
            <summary style={{ fontSize: 14, fontWeight: 600, color: "var(--encre)" }}>Historique ({c.historique.length})</summary>
            <ul className="petit" style={{ paddingLeft: 18, marginBottom: 0 }}>
              {[...c.historique].reverse().map((h, i) => (
                <li key={i}>
                  <span className="muet">{dateCourte(h.date)}</span> · {h.action}
                </li>
              ))}
            </ul>
          </details>
        </aside>
      </div>

      {/* Slides à taille réelle, hors écran, dans les deux formats, pour l'export et la publication. */}
      <div className="zone-export" aria-hidden>
        {(Object.keys(FORMATS) as FormatSlide[]).map((fmt) =>
          c.slides.map((s, i) => (
            <div key={`${fmt}-${s.numero}`} ref={(el) => { refsExport.current[fmt][i] = el; }}>
              <SlideVisuel slide={s} sources={c.sources} total={c.slides.length} format={fmt} titreCarrousel={c.titre} />
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function PointRisqueCarte({ point }: { point: PointRisque }) {
  return (
    <div className="verif verif-risque">
      <div className="ligne-flex" style={{ justifyContent: "space-between" }}>
        <span className="phrase">Risque · {point.categorie}</span>
        <span className="badge badge-nuit">Test de risque</span>
      </div>
      <div style={{ marginTop: 4 }}>
        <em>« {point.passage.replace(/\*\*/g, "")} »</em> — {point.probleme}
      </div>
      <div className="reformulation" style={{ background: "#eef2ff" }}>
        <strong>Suggestion :</strong> {point.suggestion.replace(/\*\*/g, "")}
      </div>
    </div>
  );
}

function JaugeRelecture({ phrases }: { phrases: PhraseVerifiee[] }) {
  const total = phrases.length || 1;
  const part = (s: string) => (phrases.filter((p) => p.statut === s).length / total) * 100;
  return (
    <div className="jauge" aria-hidden>
      <span style={{ width: `${part("vert")}%`, background: "#22a35a" }} />
      <span style={{ width: `${part("orange")}%`, background: "#f59e0b" }} />
      <span style={{ width: `${part("rouge")}%`, background: "var(--rouge)" }} />
    </div>
  );
}

function rapport(c: Carrousel, format: FormatSlide): string {
  const l: string[] = [
    `RAPPORT DE VÉRIFICATION — ${c.titre}`,
    `Export : ${FORMATS[format].libelle} — ${dateCourte(maintenant())}`,
    "",
    "SOURCES",
    ...c.sources.map((s) => `${s.id} · ${s.media} · ${s.titre} · ${s.url}`),
    "",
    `RELECTURE IA : ${c.relecture?.confirmees ?? 0}/${c.relecture?.total ?? 0} phrases confirmées`,
    ...(c.relecture?.phrases ?? []).map((p) => `[${p.statut.toUpperCase()}] Slide ${p.slide} : ${p.phrase.replace(/\*\*/g, "")}`),
    "",
    `TEST DE RISQUE : ${c.risque?.niveau ?? "non effectué"}`,
    ...(c.risque?.points ?? []).map((p) => `- ${p.categorie} : ${p.probleme} → ${p.suggestion}`),
    "",
    "CRÉDITS PHOTOS (Wikimedia Commons)",
    ...(c.slides.some((s) => s.image)
      ? c.slides.filter((s) => s.image).map((s) => `Slide ${s.numero} : ${creditImage(s.image!)} · ${s.image!.page}`)
      : ["Aucune photo."]),
    "",
    "VALIDATION HUMAINE",
    ...c.slides.map((s) => `Slide ${s.numero} (${s.role}) : ${s.statut === "validee" ? "validée" : "NON validée"}`),
    "",
    "HISTORIQUE",
    ...c.historique.map((h) => `${dateCourte(h.date)} · ${h.action}`),
  ];
  return l.join("\n");
}
