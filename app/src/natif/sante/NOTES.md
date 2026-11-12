# Santé Connect (Android) — choix et fonctionnement

## Audit (27/10/2026)

| | `react-native-health-connect` (+ plugin Expo) | Module Expo maison (`modules/pepfit-sante`) |
|---|---|---|
| Mainteneur | une personne (matinzd), 422 ★, 58 tickets ouverts | nous |
| Licence | MIT | — (dépend de Jetpack Health Connect, Apache 2.0, Google) |
| Fraîcheur | v4.1.3, publiée en août 2026, dépôt actif | — |
| Moteur | `androidx.health.connect:connect-client:1.1.0` | le même, `1.1.0` (dernière stable ; 1.2.0 en alpha) |
| Permissions | aucune d'office : on les déclare | idem, posées par `plugin.js` |
| SDK 58 / nouvelle archi | TurboModule (codegen) : compatible | Expo Modules API, comme `pepfit-son` : compatible |
| Branchement | le plugin modifie `MainActivity` (délégué de permissions) | rien dans `MainActivity` : demande par `startActivityForResult` |
| Poids JS | 473 ko dépaqueté, ~40 types d'enregistrements | ~150 lignes Kotlin, 5 types |
| Dépendance npm | +1 (et `@expo/config-plugins` en pair) | aucune |

**Choix : module maison.** Même bibliothèque Google en dessous, donc même fiabilité côté données ; mais
pas de nouvelle dépendance npm tenue par une seule personne, pas de retouche de `MainActivity`, et le motif
existe déjà (`modules/pepfit-son`). Le Kotlin ne fait que des accès bruts ; toute la logique (états, choix de la
pesée, nuit, pas par jour, contrôle des autorisations) est en TS dans `logique.ts`, testée avec un natif simulé
(`tests/sante.test.ts`). Coût : suivre nous-mêmes les évolutions de `connect-client` (une ligne dans `build.gradle`).

Effets de bord acceptés :
- `connect-client` exige **minSdk 26** (Android 8) : `plugin.js` pose `android.minSdkVersion=26` (avant : 24).
- Poids : APK 53,4 Mo contre 51,9 Mo pour celui de main du 27/10 (≈ +1,5 Mo : client, protobuf, guava).

## Autorisations (au plus juste)

| `PermissionSante` | Health Connect | Sert à |
|---|---|---|
| `poids` | `READ_WEIGHT` | import du poids, origine des pesées (feuille Poids) |
| `pas` | `READ_STEPS` | `pasDuJour()`, `pasSurJours(7)` (Accueil) |
| `sommeil` | `READ_SLEEP` | `sommeilDeLaNuit()` |
| `frequence-cardiaque` | `READ_RESTING_HEART_RATE` (pas toute la FC) | `frequenceRepos()` |
| `seances` | `WRITE_EXERCISE` | `exporterSeance()` |
| `historique` | `READ_HEALTH_DATA_HISTORY` | lire au-delà des 30 jours d'avant la première autorisation (reprise de l'historique, pages Pas, Sommeil… sur une longue période) |

(Tableau d'origine du 27/10 ; la page Santé a depuis ajouté composition, VFC, séances, kcal, distance, taille, FC de la montre et
règles : voir `PERMISSIONS` dans `logique.ts` et `plugin.js`.)

Chaque autorisation est demandée **au moment où elle sert** (`demanderPermissions([...])`) ; la page Santé demande les siennes
d'un coup (`PERMISSIONS_PAGE_SANTE`).

## Historique au-delà de 30 jours (3/11)

Sans `READ_HEALTH_DATA_HISTORY`, Santé Connect ne rend rien d'antérieur aux 30 jours d'avant la première autorisation, sans
erreur : les lectures longues revenaient simplement tronquées.

- **Facultative** (`PERMISSIONS_FACULTATIVES`) : demandée dans la même fenêtre que la page Santé (`PERMISSIONS_DEMANDE_SANTE` :
  parcours d'arrivée, Réglages › Connexions, ligne Santé Connect des sources), seulement si Santé Connect sait la donner
  (`historiquePossible()`, natif : `features.getFeatureStatus(FEATURE_READ_HEALTH_DATA_HISTORY)`). Un refus ne fait pas
  échouer la demande et l'état « autorisée » ne dépend pas d'elle (sinon un Santé Connect trop ancien resterait « à autoriser »).
- **Déjà autorisé avant le 3/11** : Réglages › Connexions montre la ligne « Historique complet » (« Full history ») avec
  « Autoriser » (demande de la seule permission), puis l'état de la reprise.
- **Reprise** (`src/ecrans/sante-historique.ts`) : mesures du corps (`TYPES_MESURE_CORPS`) et pesées (si `sante_poids` n'est pas
  coupé), rangées comme l'import. Tranches de 90 jours en remontant depuis 30 jours avant le début, 4 par passage, lues l'une
  après l'autre (9 lectures) avec 1,5 s entre deux tranches ; un passage par import (`importerSante`, au plus toutes les 5 min).
  Fond : 10 ans avant le début de la reprise. Le point atteint (`sante_historique`, réglage local non synchronisé) est écrit
  après chaque tranche : une tranche coupée (appli fermée, lecture en échec, délai) est relue au passage suivant, sans doublon.
  Permission retirée en cours : la reprise s'arrête sans avancer.
- **Plafond natif** : `lire()` s'arrête à 5 000 enregistrements par lecture ; les mesures du corps (une ou deux par jour) en
  restent loin sur 90 jours.
- **Ce qui n'est pas rangé** (pas, sommeil, séances, FC) est lu à la demande : la permission suffit, rien à reprendre. Le cache
  Santé Connect de la dépense (`energie-lot.ts`) porte la liste des permissions : il se relit quand l'historique est accordé.
- **Google Play** : la permission est à déclarer dans le formulaire « Santé Connect » de la console (usage : historique des
  mesures et de la dépense).
Toute lecture vérifie d'abord l'autorisation (`autorisees()`) : sans elle, la fonction renvoie `null` sans appeler Santé Connect.

## États (`etatPoids().connecteur`)

- `non-branche` : APK sans le module (version plus ancienne) ou iOS/web.
- `absent` : Santé Connect absent, ou à mettre à jour (Android ≤ 13) ; la feuille propose le Play Store.
- `a-autoriser` : présent, `READ_WEIGHT` non accordée.
- `pret` : lecture du poids possible ; `applis[].partage` = l'appli a déposé une pesée ces 30 jours.

## Justification exigée par Health Connect

`Justification.kt` (déclarée dans le manifeste du module, avec l'alias `ViewPermissionUsageActivity` pour Android 14+)
affiche dans l'appli le texte de confidentialité (rien ne quitte le téléphone). C'est ce que Santé Connect affiche quand on
touche « Règles de confidentialité » de pepfit. Sans elle, Santé Connect refuse de montrer la demande d'autorisation.

## Détails

- Pas : agrégat `COUNT_TOTAL` par jour (Santé Connect dédoublonne téléphone + montre selon la priorité des sources).
  Bornes à minuit local (changement d'heure compris) ; `-1` natif = jour sans donnée → `null`.
- Sommeil : sessions terminées entre 18 h la veille et maintenant ; on garde la plus longue (deux sources qui
  enregistrent la même nuit ne s'additionnent pas). Temps endormi = durée − éveils si l'appli dépose les phases.
- Export : `ExerciseSessionRecord` « musculation », `clientRecordId` = id de la séance : réexporter remplace.
- `ouvrirReglages(paquet)` ouvre l'appli (Samsung Health, Withings…) pour y activer le partage ; sans paquet,
  les données de pepfit dans Santé Connect.

## iPhone (HealthKit, 4/11)

Même API sur iPhone : `index.ios.ts` branche le module Swift (`modules/pepfit-sante/ios`) sur `logique.ts` par
`healthkit.ts` (correspondance Santé Connect → HealthKit). Détails, écarts et points à vérifier : `docs/CODE-IOS-SANTE.md`.
