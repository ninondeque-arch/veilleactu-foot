// Veille du jour en ligne de commande, pour la programmer chaque matin (cron, launchd).
// Usage : npm run veille
import { enregistrerVeille } from "../lib/store.ts";
import { lancerVeille } from "../lib/veille.ts";

const debut = Date.now();
const veille = await lancerVeille();
await enregistrerVeille(veille);

console.log(`Veille ${veille.id} : ${veille.sujets.length} sujets (${veille.nbArticlesBruts} articles collectés, regroupement ${veille.regroupement}) en ${Math.round((Date.now() - debut) / 1000)} s.`);
for (const s of veille.sujets.slice(0, 10)) console.log(`  · ${s.titre} (${s.articles.length})`);
for (const e of veille.erreurs) console.warn(`  ! ${e}`);
process.exit(0);
