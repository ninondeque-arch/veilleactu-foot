// Rendu d'une slide à sa taille réelle (1080 px de large). L'aperçu est réduit avec un transform CSS ;
// l'export PNG capture le même composant, sans réduction.
import type { CSSProperties, ReactNode } from "react";
import type { ImageSlide, Slide, Source } from "@/lib/types";

export type FormatSlide = "instagram" | "tiktok";

export const FORMATS: Record<FormatSlide, { largeur: number; hauteur: number; libelle: string }> = {
  instagram: { largeur: 1080, hauteur: 1350, libelle: "Instagram 4:5 (1080×1350)" },
  tiktok: { largeur: 1080, hauteur: 1920, libelle: "TikTok 9:16 (1080×1920)" },
};

/** **chiffre** → couleur d'accent ; [À VÉRIFIER] → encadré pointillé. */
export function mettreEnForme(texte: string): ReactNode[] {
  return texte.split(/(\*\*[^*]+\*\*|\[À VÉRIFIER\])/g).map((morceau, i) => {
    if (morceau.startsWith("**") && morceau.endsWith("**")) {
      return <span key={i} className="sv-accent">{morceau.slice(2, -2)}</span>;
    }
    if (morceau === "[À VÉRIFIER]") return <span key={i} className="sv-averifier">[À VÉRIFIER]</span>;
    return morceau;
  });
}

export function libelleSources(slide: Slide, sources: Source[]): string {
  const medias = slide.sourceIds
    .map((id) => sources.find((s) => s.id === id)?.media)
    .filter((m): m is string => Boolean(m))
    .map((m) => m.replace(/\s*\(.*\)$/, ""));
  return medias.length ? `Sources : ${[...new Set(medias)].join(" · ")}` : "Source : [À VÉRIFIER]";
}

/** La photo passe par notre proxy : même origine, donc capturable en PNG sans souci de CORS. */
export const urlImage = (img: ImageSlide) => `/api/image?url=${encodeURIComponent(img.url)}`;

export const creditImage = (img: ImageSlide) => `Photo : ${img.auteur} · ${img.licence} · Wikimedia Commons`;

export function SlideVisuel({
  slide,
  sources,
  total,
  format,
  echelle = 1,
  titreCarrousel,
}: {
  slide: Slide;
  sources: Source[];
  total: number;
  format: FormatSlide;
  echelle?: number;
  titreCarrousel?: string;
}) {
  const { largeur, hauteur } = FORMATS[format];
  const vertical = format === "tiktok";
  const style: CSSProperties = {
    width: largeur,
    height: hauteur,
    transform: echelle !== 1 ? `scale(${echelle})` : undefined,
    transformOrigin: "top left",
  };
  const accroche = slide.numero === 1;
  const cle = slide.numero === total;
  const image = slide.image ?? null;

  return (
    <div
      className={`sv ${vertical ? "sv-tiktok" : ""} ${accroche ? "sv-accroche" : ""} ${cle ? "sv-cle" : ""} ${image ? "sv-photo" : ""}`}
      style={style}
    >
      {image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sv-fond-photo" src={urlImage(image)} alt="" crossOrigin="anonymous" />
          <div className="sv-voile" aria-hidden />
        </>
      )}
      <main className="sv-corps">
        {accroche ? (
          <>
            {titreCarrousel && <p className="sv-surtitre">{titreCarrousel}</p>}
            <p className="sv-texte-accroche">{mettreEnForme(slide.texte)}</p>
          </>
        ) : cle ? (
          <div className="sv-encadre">
            <p className="sv-etiquette">Clé de lecture</p>
            <h2 className="sv-titre">{mettreEnForme(slide.titre)}</h2>
            <p className="sv-texte">{mettreEnForme(slide.texte)}</p>
          </div>
        ) : (
          <>
            <p className="sv-etiquette">{slide.role}</p>
            <h2 className="sv-titre">{mettreEnForme(slide.titre)}</h2>
            <p className="sv-texte">{mettreEnForme(slide.texte)}</p>
          </>
        )}
      </main>

      <footer className="sv-bas">
        <p className="sv-source">
          {libelleSources(slide, sources)}
          {image && <span className="sv-credit">{creditImage(image)}</span>}
        </p>
        <div className="sv-progression" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < slide.numero - 1 ? "on" : i === slide.numero - 1 ? "courant" : ""} />
          ))}
        </div>
      </footer>
    </div>
  );
}

/** Conteneur qui réserve la place de l'aperçu réduit. */
export function ApercuSlide(props: Parameters<typeof SlideVisuel>[0] & { largeurAffichee: number }) {
  const { largeurAffichee, ...reste } = props;
  const f = FORMATS[props.format];
  const echelle = largeurAffichee / f.largeur;
  return (
    <div className="apercu" style={{ width: largeurAffichee, height: f.hauteur * echelle }}>
      <SlideVisuel {...reste} echelle={echelle} />
    </div>
  );
}
