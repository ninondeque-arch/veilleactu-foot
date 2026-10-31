// Types partagés entre le serveur et l'interface.

export type Article = {
  id: string;
  titre: string;
  media: string;
  date: string; // ISO
  url: string;
  resume?: string;
  requete?: string; // recherche ou flux d'origine
};

export type SujetVeille = {
  id: string;
  titre: string;
  resume: string;
  articles: Article[];
};

export type Veille = {
  id: string; // ex. 2026-10-30T07-00
  date: string; // ISO
  exemple?: boolean;
  regroupement: "ia" | "simple";
  nbArticlesBruts: number;
  sujets: SujetVeille[];
  erreurs: string[];
};

export type Source = {
  id: string; // S1, S2…
  titre: string;
  media: string;
  date: string;
  url: string;
  texte: string;
  extraction: "complete" | "partielle"; // partielle = seulement titre/chapô
};

export type StatutSlide = "brouillon" | "validee";

/** Photo libre (Wikimedia Commons) affichée en fond de slide, avec son crédit. */
export type ImageSlide = {
  url: string; // vignette 1280 px sur upload.wikimedia.org
  page: string; // page du fichier sur Commons
  titre: string;
  auteur: string;
  licence: string; // ex. « CC BY-SA 4.0 »
  licenceUrl: string | null;
  restrictions: string | null; // ex. « personality » (droit à l'image)
  largeur: number;
  hauteur: number;
};

export type Slide = {
  numero: number;
  role: string;
  titre: string;
  texte: string;
  date: string;
  sourceIds: string[];
  statut: StatutSlide;
  modifieeDepuisRelecture: boolean;
  rechercheImage?: string; // mots-clés proposés par le rédacteur pour chercher une photo
  ambianceImage?: string; // scène de foot liée à la slide, en anglais (ex. « football boots »), si rechercheImage ne donne rien
  image?: ImageSlide | null;
};

export type StatutPhrase = "vert" | "orange" | "rouge";

export type PhraseVerifiee = {
  slide: number;
  phrase: string;
  statut: StatutPhrase;
  sourceId: string | null;
  extrait: string | null;
  explication: string;
  reformulation: string | null;
};

export type Relecture = {
  date: string;
  phrases: PhraseVerifiee[];
  confirmees: number;
  total: number;
  commentaireGeneral: string;
};

export type PointRisque = {
  slide: number | null;
  categorie: string;
  passage: string;
  probleme: string;
  suggestion: string;
};

export type TestRisque = {
  date: string;
  niveau: "faible" | "moyen" | "élevé";
  synthese: string;
  points: PointRisque[];
};

export type Publication = {
  date: string;
  profil: string;
  plateformes: string[];
  format: "instagram" | "tiktok";
  requestId: string;
  statut: string; // statut Upload-Post : pending, in_progress, completed, failed…
  resultats: { plateforme: string; succes: boolean; statut?: string; message?: string; url?: string }[];
};

export type Carrousel = {
  id: string;
  creeLe: string;
  exemple?: boolean;
  noteExemple?: string;
  sujet: string;
  titre: string;
  sources: Source[];
  slides: Slide[];
  legendes: { tiktok: string; instagram: string; linkedin: string };
  relecture: Relecture | null;
  risque: TestRisque | null;
  historique: { date: string; action: string }[];
  publications?: Publication[];
};
