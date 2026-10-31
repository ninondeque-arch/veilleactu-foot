# Veille foot & carrousels — démo

Démo locale d'un workflow éditorial assisté par IA, appliqué au football :

**Veille → Génération → Relecture → Test de risque → Validation humaine → Export**

Aucun contenu n'est exporté sans validation humaine. L'export reste bloqué tant qu'une phrase est introuvable dans les sources, qu'une slide contient « [À VÉRIFIER] » ou qu'une slide n'est pas validée.

## Installation

Il faut Node.js 20 ou plus récent, et Claude Code installé et connecté (lancez `claude` une fois dans un terminal pour vous connecter).

```bash
cd veilleactu-foot
npm install
```

## Moteur IA : Claude Code

L'outil n'utilise pas de clé API. Le serveur appelle Claude Code en mode sans interface (`claude -p`, voir `lib/claude.ts`) avec la connexion de l'ordinateur. Les appels sont décomptés des limites d'usage de votre compte Claude Code.

Chaque appel tourne avec le modèle `claude-opus-5-5`, notre propre prompt système, aucun outil (Claude lit et répond, sans accès aux fichiers ni au web), sans vos réglages ni vos mémoires Claude Code, et une sortie JSON validée par un schéma.

Durées mesurées le 30/10/2026 : génération ~75 s, relecture ~55 s, test de risque ~20 s, régénération d'une slide ~15 s, regroupement de la veille ~60 s.

**Sans Claude Code**, la démo marche quand même : la veille utilise un regroupement simple par mots-clés, et l'exemple Mbappé/Chine montre tout le workflow (relecture et test de risque déjà calculés, validation et export).

Si `claude` n'est pas trouvé automatiquement, indiquez son chemin (obtenu avec `which claude`) dans la variable `CLAUDE_BIN`.

## Lancement

```bash
npm run dev
```

Puis ouvrez http://localhost:3000.

## Programmer la veille chaque matin

`npm run veille` lance la veille en ligne de commande et l'enregistre dans `data/veilles/`. Elle apparaît ensuite dans la liste déroulante de l'accueil.

Sur macOS, utilisez launchd plutôt que cron : la connexion Claude Code est rangée dans le trousseau, qu'une tâche cron ne peut généralement pas lire. Créez le fichier `~/Library/LaunchAgents/fr.demo.veille-foot.plist` :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>fr.demo.veille-foot</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/npm</string><string>run</string><string>veille</string></array>
  <key>WorkingDirectory</key><string>/Users/VOTRE_NOM/veilleactu-foot</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/Users/VOTRE_NOM/veilleactu-foot/data/veille.log</string>
  <key>StandardErrorPath</key><string>/Users/VOTRE_NOM/veilleactu-foot/data/veille.log</string>
</dict>
</plist>
```

Remplacez `VOTRE_NOM`, vérifiez les chemins avec `which npm`, puis activez la tâche :

```bash
launchctl load ~/Library/LaunchAgents/fr.demo.veille-foot.plist
```

La veille tourne à 7 h si vous êtes connecté·e à votre session macOS. Si Claude Code n'est pas joignable à ce moment-là, elle est quand même enregistrée, avec le regroupement simple et un avertissement.

## Publication (Upload-Post)

Une fois un carrousel entièrement validé, le panneau « Publication » de l'écran de validation l'envoie sur TikTok, Instagram et LinkedIn via l'API Upload-Post.

1. Copiez le modèle : `cp .env.example .env`
2. Ouvrez `.env` dans un éditeur et remplacez `votre-cle` par votre clé Upload-Post (la même que pour le serveur MCP).
3. Relancez `npm run dev`.

Fonctionnement :
- **Mêmes règles que l'export, revérifiées par le serveur** : rien ne part s'il reste une phrase rouge, un « [À VÉRIFIER] » ou une slide non validée, même si on appelle l'API directement.
- **Confirmation obligatoire** : un récapitulatif (profil, comptes, visibilité, début des légendes) s'affiche avant tout envoi.
- **Formats** : TikTok reçoit 6 JPEG en 1080×1920, avec la légende TikTok. Instagram et LinkedIn reçoivent 6 JPEG en 1080×1350, avec leurs légendes respectives.
- **Visibilité par défaut prudente** : TikTok « Privé (moi uniquement) », LinkedIn « Relations uniquement ».
- **Suivi** : l'envoi est traité en arrière-plan par Upload-Post. Le panneau affiche le statut toutes les 7 s, avec les liens vers les publications, et l'historique garde une trace de chaque envoi.

La clé reste côté serveur (`lib/uploadpost.ts`) et `.env` est exclu de git.

## Ce que fait chaque étape

| Étape | Fichier | Détail |
|---|---|---|
| Veille | `lib/veille.ts` | Google News FR (« Ligue 1 », « PSG », « OM », « équipe de France football », « mercato », « Ligue des champions ») + flux RMC Sport, Foot Mercato, 20 Minutes, France Info, vérifiés le 30/10/2026. L'Équipe (accès refusé), So Foot et Maxifoot (pas de flux RSS) sont écartés. Les articles de plus de 24 h et les doublons sont retirés, puis l'IA regroupe le reste par sujet. |
| Génération | `lib/prompts.ts` (`PROMPT_REDACTEUR`) | 6 slides au format imposé, sources uniquement, « [À VÉRIFIER] » quand une information manque, sortie JSON validée par un schéma, 3 légendes. |
| Relecture | `PROMPT_RELECTEUR` | Appel séparé : chaque phrase est classée verte, orange ou rouge, avec l'extrait de la source et une proposition de reformulation. |
| Test de risque | `PROMPT_RISQUE` | Appel séparé : lecture hors contexte, sujets sensibles, chiffres sans nuance, impression de prise de parti. Niveau de risque + 2 ou 3 corrections. |
| Validation | `components/EcranValidation.tsx`, `lib/validation.ts` | Valider / Modifier / Régénérer pour chaque slide, application des reformulations, historique des actions. |
| Export | `components/SlideVisuel.tsx` | PNG 1080×1350 (Instagram) ou 1080×1920 (TikTok) dans un zip, avec les légendes et un rapport de vérification. |
| Publication | `lib/uploadpost.ts`, `components/PanneauPublication.tsx` | Envoi via Upload-Post après validation complète, avec confirmation et suivi du statut. |
| Reporting | `app/reporting/page.tsx` | Tableau de bord, **données fictives**. |

Tout est sauvegardé en JSON dans `data/` (`veilles/`, `carrousels/`). Les exemples de `data/exemples/` ne sont jamais modifiés : le bouton « Réinitialiser l'exemple » restaure leur état d'origine.

## Exemples hors ligne

- **Veille du 30/10/2026** : 177 vrais articles regroupés en 15 sujets.
- **Mbappé / Chine (27–28 octobre 2026)** : 5 vrais articles (AFP via Noovo, Paris Match Belgique et La DH ; 24matins ; Maxifoot), avec leurs liens. Le contenu des sources est un résumé fidèle de chaque article et non le texte intégral (droits d'auteur). La slide 4 contient volontairement une phrase non sourcée pour montrer le blocage de l'export.

## Mise en ligne (démo sur Vercel)

En ligne, l'outil tourne en **mode démo** grâce à la variable `DEMO_MODE=true` (voir `lib/demo.ts`) :

- tout le parcours s'affiche avec l'exemple préchargé (veille, génération, relecture IA, test de risque, validation, export PNG), **sans aucun appel à Claude** ;
- les boutons IA restent visibles et rejouent le résultat préenregistré (« Démo : résultat préenregistré ») ;
- rien n'est écrit sur le disque : les modifications vivent dans le navigateur du visiteur et disparaissent au rechargement ;
- la publication Upload-Post est désactivée, même si on appelle l'API directement ;
- aucune clé n'est nécessaire en ligne (l'outil n'utilise pas `ANTHROPIC_API_KEY`, ni en local ni en ligne).

En local, sans `DEMO_MODE`, l'outil garde son fonctionnement normal avec l'IA.

Pour tester le mode démo en local : `npm run build && DEMO_MODE=true npm start` (arrêtez d'abord `npm run dev`, qui utilise le même dossier `.next`).
