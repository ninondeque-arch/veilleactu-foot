// Schéma du workflow affiché en haut de l'accueil et de l'écran de validation.
export const ETAPES = [
  { nom: "Veille", desc: "Flux RSS des dernières 24 h, regroupés par sujet" },
  { nom: "Génération", desc: "IA rédactrice : 6 slides, sources uniquement" },
  { nom: "Relecture", desc: "IA relectrice : chaque phrase vérifiée" },
  { nom: "Test de risque", desc: "Détournement, hors contexte, sujets sensibles" },
  { nom: "Validation", desc: "Humaine, slide par slide", humaine: true },
  { nom: "Export", desc: "PNG Instagram / TikTok + légendes" },
];

export type EtatEtape = "fait" | "encours" | "afaire";

export function SchemaWorkflow({ etats }: { etats?: EtatEtape[] }) {
  return (
    <ol className="workflow" aria-label="Étapes du workflow" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {ETAPES.map((e, i) => {
        const etat = etats?.[i];
        return (
          <li
            key={e.nom}
            className={`workflow-etape ${e.humaine ? "humaine" : ""} ${etat === "fait" && !e.humaine ? "fait" : ""} ${etat === "encours" ? "encours" : ""}`}
          >
            <div className="num">
              {String(i + 1).padStart(2, "0")}
              {etat === "fait" ? " · fait" : etat === "encours" ? " · en cours" : ""}
            </div>
            <div className="nom">{e.nom}</div>
            <div className="desc">{e.desc}</div>
          </li>
        );
      })}
    </ol>
  );
}
