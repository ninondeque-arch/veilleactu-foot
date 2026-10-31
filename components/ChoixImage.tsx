"use client";

// Choix d'une photo libre (Wikimedia Commons) pour une slide.
// Choisir ou retirer une photo repasse la slide en brouillon : l'image fait partie de la validation humaine.
import { useState } from "react";
import type { ImageSlide, Slide } from "@/lib/types";
import { creditImage } from "./SlideVisuel";

export function ChoixImage({
  slide,
  desactive,
  onChoisir,
}: {
  slide: Slide;
  desactive: boolean;
  onChoisir: (image: ImageSlide | null) => void;
}) {
  const [requete, setRequete] = useState(slide.rechercheImage ?? "");
  const [resultats, setResultats] = useState<ImageSlide[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const image = slide.image ?? null;

  const chercher = async () => {
    if (!requete.trim()) return;
    setChargement(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/images?q=${encodeURIComponent(requete)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.erreur ?? "Recherche impossible");
      setResultats(d.images);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  };

  return (
    <div className="choix-image">
      <div className="choix-image-tete">
        <strong style={{ fontSize: 13.5 }}>Photo</strong>
        <input
          className="champ"
          style={{ flex: 1, minWidth: 160, padding: "6px 10px", fontSize: 13 }}
          placeholder="Personne, club ou lieu : ex. Stade Vélodrome"
          value={requete}
          onChange={(e) => setRequete(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && chercher()}
          aria-label={`Recherche de photo pour la slide ${slide.numero}`}
        />
        <button className="btn btn-petit" onClick={chercher} disabled={desactive || chargement || !requete.trim()}>
          {chargement ? <span className="chargement" /> : null} Chercher sur Wikimedia Commons
        </button>
        {image && (
          <button className="btn btn-petit" onClick={() => onChoisir(null)} disabled={desactive}>
            Retirer la photo
          </button>
        )}
      </div>

      {image && (
        <p className="petit muet" style={{ margin: "6px 0 0" }}>
          {creditImage(image)} ·{" "}
          <a href={image.page} target="_blank" rel="noreferrer">
            voir le fichier ↗
          </a>
          {image.restrictions && (
            <span style={{ color: "var(--rouge)" }}> · Restriction signalée : {image.restrictions} (droit à l'image, à vérifier)</span>
          )}
        </p>
      )}
      {erreur && <p className="petit" style={{ color: "var(--rouge)", margin: "6px 0 0" }}>{erreur}</p>}
      {resultats && resultats.length === 0 && (
        <p className="petit muet" style={{ margin: "6px 0 0" }}>
          Aucune photo libre trouvée. Essayez un nom plus simple (club, stade, ville), ou gardez la slide sans photo.
        </p>
      )}
      {resultats && resultats.length > 0 && (
        <div className="grille-images">
          {resultats.map((img) => (
            <button
              key={img.url}
              className="vignette-image"
              onClick={() => onChoisir(img)}
              disabled={desactive}
              aria-pressed={image?.url === img.url}
              title={`${img.titre}\n${creditImage(img)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.titre} loading="lazy" />
              <span>
                {img.licence} · {img.auteur}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
