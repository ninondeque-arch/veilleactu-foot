// Mode démo (mise en ligne publique) : activé par DEMO_MODE=true, côté serveur uniquement.
// Tout le parcours s'affiche avec l'exemple préchargé : aucun appel à l'IA, aucune écriture sur le disque,
// aucune publication. Les exemples sont importés dans le code (et non lus sur le disque) pour être
// toujours présents dans le déploiement.
import carrouselExemple from "@/data/exemples/exemple-mbappe-chine.json";
import veilleExemple from "@/data/exemples/exemple-veille-2026-10-30.json";
import type { Carrousel, Veille } from "./types";

export const modeDemo = (): boolean => process.env.DEMO_MODE === "true";

export const CARROUSEL_DEMO = carrouselExemple as unknown as Carrousel;
export const VEILLE_DEMO = veilleExemple as unknown as Veille;

export const MESSAGE_DEMO = "Démo : résultat préenregistré";
