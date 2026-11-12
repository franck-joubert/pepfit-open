# API des données muscu : contrat avec les écrans

Tout passe par `src/db` (SQLite, expo-sqlite) et `src/import`. Les fonctions prennent `db` en premier argument (`Executeur` : `SQLiteDatabase` d'expo-sqlite le satisfait) ; `base()` ouvre la base, applique les migrations et charge le catalogue au premier lancement.

```ts
import { base, lireSeance, modifierSerie /* … */ } from "../db";      // tout src/db/api.ts + base()
import { importerHevyFichier, choisirEtImporterHevy } from "../import";
const db = await base();
```

Conventions : identifiants = textes ; dates = millisecondes (heure de l'appareil) ; poids en kg ; lignes SQL en `snake_case` (types `Serie`, `Seance`, `Exercice`…), paramètres des fonctions en `camelCase` ; les fonctions de lecture « riches » renvoient du `camelCase`. Toute transaction passe par `transaction(db, async (db) => …)` (`db/exclusif.ts`) : une file unique sur la connexion, jamais `withTransactionAsync` en direct (test garde-fou) ; la tâche n'écrit que par le `db` qu'elle reçoit, une transaction demandée dedans en fait partie.

Types de série (`TypeSerie`) : `"echauffement"` = **W**, `"normale"`, `"degressive"`, `"rate"` = **échec** (le nom vient de la migration 1, qu'on ne réécrit pas).

## Exercices et catalogue (`depots/exercices.ts`, `catalogue.ts`)

| Fonction | Rôle |
|---|---|
| `rechercherExercices(db, {texte?, muscle?, materiel?, limite?})` | recherche sans accent ni casse (tous les mots), filtre muscle (principal ou secondaire) et matériel ; perso d'abord |
| `listerMuscles(db)` / `listerMateriels(db)` | valeurs des feuilles de filtre |
| `listerExercices(db)` / `lireExercice(db, id)` | tous / un seul |
| `creerExercice(db, {nom, muscle?, materiel?, secondaires?, poidsCorps?, mesure?})` → id | exercice perso (`perso = 1`) |
| `modifierExercice(db, id, {nom?, muscle?, materiel?})` | |
| `chargerCatalogue(db, catalogue)` → nombre écrit | déjà appelé par `base()` ; upsert par `slug`, sans effet si la version est déjà chargée |

`Exercice` : `id, nom` (FR), `muscle` (principal, FR), `secondaires` (`"Triceps|Épaules"`, séparés par `|`), `materiel`, `categorie`, `slug`, `nom_en`, `poids_corps`, `perso`, `mesure` (`kg_reps` | `reps` | `duree` | `distance_duree`), `picto` (`assets/pictos/<slug>-512.webp` s'il existe à la construction du catalogue, sinon `assets/pictos/neutre-512.webp` ; le fichier neutre reste à fournir).

Catalogue : `assets/catalogue/exercices.json`, 876 exercices de **free-exercise-db** (yuhonas, licence **Unlicense**, domaine public, vérifiée via l'API GitHub), régénéré par `python3 scripts/construire-catalogue.py`. **Noms bilingues** : `exercices.nom` (français) et `nom_en` (anglais), `nom_norm` / `nom_en_norm` normalisés (migration 20) ; `Exercice.nom` renvoyé par toutes les lectures est le nom d'affichage dans la langue active (`nomSql(alias)` dans `noms.ts`, repli sur l'autre langue si vide) ; `rechercherExercices` cherche dans les deux noms quelle que soit la langue ; un perso créé ou renommé en anglais écrit `nom_en` (et `nom` tant qu'il n'a pas de nom français), sinon `nom` ; `completerNoms` (au démarrage) renseigne `nom_en_norm` et le `nom_en` des perso au nom visiblement anglais ; `npm run noms` liste les noms manquants du catalogue. Les noms FR sont composés (dictionnaire de mots) sauf ~50 surcharges soignées ; `nom_auto` (dans le JSON) vaut `true` pour les 391 noms composés automatiquement, dont certains restent approximatifs.

## Routines et supersets (`depots/routines.ts`)

| Fonction | Rôle |
|---|---|
| `listerRoutines(db)` → `RoutineResume[]` | `id, nom, ordre, nbExercices, nbSeries, derniereFois` |
| `lireRoutine(db, id)` → `RoutineDetail \| null` | `{id, nom, note, blocs}` ; un bloc = un exercice seul ou un superset : `{groupeSuperset, lignes[], reposS, nbTours}` ; chaque ligne porte `exercice {id, nom, muscle, materiel, picto, slug}` et `cibles[]` (`{kg, reps}`, une par série, `null` = pas de cible) |
| `creerRoutine(db, nom, lignes[{exerciceId, nbSeries?, reposS?, groupeSuperset?}])` → id | l'ordre du tableau est l'ordre de la routine |
| `modifierRoutine`, `supprimerRoutine`, `reordonnerRoutines(db, ids)` | |
| `dupliquerRoutine(db, id)` → id \| null | Copie fidèle « … (copie) », placée juste après |
| `ajouterExerciceARoutine(db, routineId, exerciceId, {nbSeries?, reposS?})` → ligneId | en fin de routine |
| `modifierLigneRoutine(db, ligneId, {nbSeries?, reposS?})` | baisser `nbSeries` retire les cibles des séries supprimées |
| `definirCibleSerie(db, ligneId, rang, {kg?, reps?})` | cible de la série `rang` (0 = première) ; les deux à `null` = cible effacée ; rang hors des séries ignoré |
| `supprimerSerieRoutine(db, ligneId, rang)` | retire la série `rang` (glisser à gauche) ; les suivantes remontent avec leurs cibles ; la dernière série reste |
| `retirerLigneDeRoutine(db, ligneId)` | un superset réduit à une ligne est dissous |
| `reordonnerRoutine(db, routineId, ligneIds[])` / `deplacerLigne(db, ligneId, -1 \| 1)` | glisser / monter-descendre (un superset se déplace en bloc) |
| `disposerRoutine(db, routineId, [{ id, groupe, repos }])` | glisser un exercice dans / hors d'un superset : ordre, groupe et repos écrits d'un coup |
| `creerSuperset(db, routineId, ligneIds[], reposTourS = 90)` → groupe | rend les lignes contiguës, porte le repos sur la dernière, 0 sur les autres |
| `retirerDuSuperset(db, ligneId, reposS = 120)` | la ligne reprend son repos ; groupe dissous s'il ne reste qu'une ligne |
| `definirReposSuperset(db, routineId, groupe, reposTourS)` | |
| `definirCibleSerie(…, {reps, repsMax})` / `modifierLigneRoutine(…, {plageReps})` | mode plage par ligne ; `false` efface `reps_max` |
| `definirTypeSerie(db, ligneId, rang, type)` | type de la série `rang` (migration 5) ; `cibles[].type` dans `lireRoutine` ; recopié dans la séance. notes de routine : voir Notes |

**Règle du repos** : dans un superset, seul l'exercice **le dernier du groupe** porte un repos (`repos_s`), c'est le repos pris **une fois après chaque tour** ; les autres sont enchaînés (0).

## Notes (`depots/notes.ts`)

Trois types de notes par exercice, comme Hevy, **autant qu'on veut par type** (table `notes`, migration 16 ; les colonnes `exercices.note`, `routine_exercices.note`, `seance_exercices.note` des migrations 1 à 9 sont gardées mais plus lues ni écrites) : **d'exercice** (à chaque fois qu'on fait l'exercice, toute routine), **de routine** (à chaque séance de la routine) et **de séance** (cette séance seulement). Une note : `{id, type, texte, position}` ; lieu en base : `exercice_id` + `ligne_id` (routine) ou `seance_id` (séance). Id déterministe pour les notes recopiées par la migration (`n:exercice:<id>`, `n:routine:<ligne>`, `n:seance:<séance>:<exercice>`), `nouvelId()` ensuite. `lireSeance` lit les notes de routine sur la ligne de la routine d'origine (`notesRoutine`, `ligneRoutineId`). `notePrecedente` : notes de séance de l'exercice à sa séance terminée précédente, bout à bout (placeholder gris du champ de séance).

| Fonction | |
|---|---|
| `listerNotes(db, lieu, type)` → `Note[]` | `lieu = {exerciceId, ligneId?, seanceId?}` ; `ligneId` exigé pour la routine, `seanceId` pour la séance |
| `ajouterNote(db, lieu, type, texte)` → id \| null | à la suite des autres du même type ; texte vide = rien. Sans transaction propre |
| `modifierNote(db, id, texte)` / `supprimerNote(db, id)` | texte vide = note supprimée |
| `changerTypeNote(db, lieu, noteId, vers)` | change le type de CETTE note, qui passe en fin des notes du nouveau type |

Retirer un exercice d'une séance, ou supprimer la séance, la ligne de routine ou l'exercice, emporte les notes concernées. Synchro : table `notes` (clé `id`, `texte` chiffré). Lecture riche : `ExerciceDeSeance.notes / notesExercice / notesRoutine`, `LigneRoutineDetail.notes / notesExercice` (tableaux de `Note`). `modifierLigneRoutine` n'a plus de `note`.

## Séances (`depots/seances.ts`)

| Fonction | Rôle |
|---|---|
| `demarrerSeanceDepuisRoutine(db, routineId, prefill = true)` → seanceId | crée exercices et séries vides, supersets **entrelacés tour par tour** (A1 B1 A2 B2…), kg/reps : la cible de la routine d'abord, sinon le « précédent », champ par champ |
| `demarrerSeance(db, routineId \| null, titre?)` → id | séance vide |
| `seanceEnCours(db)` | séance non terminée la plus récente |
| `lireSeance(db, id)` → `SeanceDetail \| null` | `{seance, routineNom, exercices[], blocs[]}` ; chaque exercice : `exercice`, `groupeSuperset`, `reposS`, `notes` (de séance), `notePrecedente`, `notesExercice`, `notesRoutine`, `ligneRoutineId`, `series[]` ; chaque série (`SerieDetail`) : `id, type, kg, reps, faite, volume, e1rm, precedent_kg, precedent_reps, duree_s, distance_m, rpe, records[]` (types de records battus par cette série) |
| `ajouterExerciceASeance(db, seanceId, exerciceId, {nbSeries?, reposS?, prefill?})` → ids | |
| `ajouterSerie(db, {seanceId, exerciceId, type?, kg?, reps?, groupeSuperset?, position?})` → id | à la fin par défaut |
| **`modifierSerie(db, serieId, {kg?, reps?, type?, faite?, rpe?, dureeS?, distanceM?})`** | **E1** : valable à tout moment (en cours, cochée, exercice terminé, séance passée), voir ci-dessous |
| `cocherSerie(db, serieId, faite)` | = `modifierSerie({faite})` |
| `supprimerSerie`, `retirerExerciceDeSeance`, `supprimerSeance` | recalculent |
| `reposApresSerie(db, serieId)` → secondes \| `null` | `null` : superset, tour pas fini, on enchaîne ; sinon repos de l'exercice, ou du groupe en fin de tour |
| `terminerSeance(db, id, fin?)` | |
| `modifierSeance(db, id, {titre?, note?, salle?, debut?, fin?})` | |
| `lirePrecedent(db, exerciceId, avantDebut?)` → `Serie[]` | séries de la dernière séance antérieure (échauffements exclus) |

### E1 : recalcul après toute modification

`modifierSerie` (et `cocherSerie`, `ajouterSerie`, `supprimerSerie`, `supprimerSeance`, `modifierSeance({debut})`) appelle `recalculerExercice` : parcours **chronologique de tout l'historique de l'exercice**, qui réécrit pour chaque série `volume` (kg × reps), `e1rm` (Epley : kg × (1 + reps / 30), reps = 1 → kg), `precedent_kg` / `precedent_reps`, reconstruit la table `records`, puis le total de la séance (`volume_kg`, `nb_series`, échauffements exclus). Les séances **suivantes** sont donc corrigées dans la même transaction (testé : une charge corrigée dans le passé change le précédent et les records des séances d'après).

- **Précédent** d'une série = série de même rang (échauffements d'un côté, séries de travail de l'autre) dans la dernière séance antérieure où l'exercice a au moins une série cochée.
- **Records** (`records`, par exercice) : `charge` (kg max), `e1rm`, `volume_serie`, `volume_seance` (volume de l'exercice sur la séance), `reps` (séries sans charge). Seules les séries **cochées** hors échauffement comptent ; une égalité n'est pas un record ; chaque ligne est un record battu à son époque, `actuel = 1` pour la valeur à battre.

## Statistiques (`stats.ts`)

| Fonction | Écran |
|---|---|
| `statsAccueil(db, maintenant?)` → `{semaine {debut, jours[7 {date, fait, seances[]}], nbSeances, volumeKg, dureeMin}, aSuivre {routineId, nom, nbExercices, derniereFois}, derniereSeance {…, meilleuresSeries[]}}` | Accueil (semaine du lundi, heure locale ; « à suivre » = routine la moins récemment faite) |
| `historiqueSeances(db, {limite?, avantDebut?})` → `SeanceResume[]` | Historique (pagination par `avantDebut`) |
| `seancesParSemaine(db, nbSemaines = 12, maintenant?)` | barres de rythme |
| `progressionExercice(db, exerciceId, "charge" \| "e1rm" \| "volume" \| "reps" \| "reps_total", depuis?)` → `{points[{seanceId, date, valeur}], gain}` | Progression (courbe) ; `reps` = meilleure série, `reps_total` = réps de la séance |
| `progressionRoutine(db, routineId, "volume" \| "reps" \| "duree", depuis?)` → `{points, gain}` ; `nbSeancesRoutine(db, routineId)` | Une valeur par séance terminée faite avec la routine (kg, réps totales, minutes), échauffements exclus |
| `suiviEnReps(db, exerciceId)` → booléen | mesure `reps`, ou aucune série chargée (poids du corps) : la Progression passe en répétitions |
| `recordsExercice(db, exerciceId)` → `{actuels, historique}` | Progression, fiche exercice |
| `dernieresSeancesExercice(db, exerciceId, limite = 5)` | séries des dernières séances, avec records |
| `statsProfil(db)` → `{nbSeances, volumeKg, dureeTotaleMin, premiereSeance, nbRecords}` | Profil |
| `compter(db)` | diagnostic |

`SeanceResume` : `id, titre, routineId, debut, fin, dureeMin, volumeKg, nbSeries, nbExercices, nbRecords`. Seules les séances terminées (`fin` non nul) entrent dans l'accueil, l'historique et le profil.

## Import Hevy (`src/import`)

```ts
const rapport = await importerHevyFichier(uri);      // CSV d'export ou JSON de routines (expo-document-picker)
const rapport = await choisirEtImporterHevy();       // ouvre le sélecteur ; null si annulé
```

`RapportHevy` = `{genre: "seances", …RapportImport}` ou `{genre: "routines", …RapportRoutines}` : un fichier qui commence par `{` ou `[` est lu comme des routines.

`RapportImport` : `seancesLues, seancesImportees, seancesDejaPresentes, seriesImportees, exercicesReconnus, exercicesNonReconnus[]` (créés comme exercices perso, à lister à l'écran), `erreurs[]` (séances ignorées : date illisible), `dureeMs`. `ErreurImport` est levée si le fichier n'est pas un export Hevy.

- **Format** : export Hevy (Réglages > Exporter les données) : colonnes `title, start_time, end_time, description, exercise_title, superset_id, exercise_notes, set_index, set_type, weight_kg (ou weight_lbs), reps, distance_km (ou distance_miles), duration_seconds, rpe` ; dates `25 Oct 2026, 10:58` lues en heure locale.
- **Types** : `normal` → normale, `warmup` → W, `dropset` → dégressive, `failure` → échec. `superset_id` partagé par ≥ 2 exercices d'une séance → superset.
- **Correspondance des noms** : 1) alias déjà mémorisés (`exercice_alias`), 2) table `src/import/correspondances.ts` (noms Hevy FR et EN → slug), 3) égalité normalisée avec le nom FR ou EN du catalogue, 4) sinon exercice perso (mesure déduite : `kg_reps`, `reps`, `duree`, `distance_duree`). L'alias est mémorisé.
- **Idempotent** : clé `hevy:<titre>|<début tel qu'écrit>` (index unique `seances.source_ref`) ; une séance déjà là est ignorée. Tout ou rien (une transaction).
- **Routines** (`importerRoutinesHevyTexte`, `hevy-routines.ts`) : JSON de l'API v1 (`{routines, dossiers | routine_folders}`, une page `{routines}` ou une liste). Ordre, séries avec type et cibles (`weight_kg`, `reps` ou `rep_range` → plage, `duration_seconds`, `distance_meters`), repos, supersets (repos du tour sur le dernier exercice), notes de routine et d'exercice. Même exercice deux fois de suite hors superset : une ligne, séries bout à bout. pepfit n'a pas de dossiers : les routines arrivent à la suite, groupées par dossier Hevy, sans dossier à la fin. Mêmes correspondances que l'historique, plus les synonymes FR/EN (`SYNONYMES_HEVY`). Idempotent : réglage `import.hevy.routines` (id Hevy → id pepfit) ; une routine supprimée dans pepfit revient au réimport.
- Lecture du fichier par `fetch(uri)` (file:// ou content://) : à vérifier sur l'appareil.

## Données de test réelles

`python3 scripts/hevy-vers-csv.py` lit l'API Hevy en **GET seulement** (clé `HEVY_API_KEY` de `~/.hermes/secrets/hevy.env`, jamais affichée) et écrit `donnees-perso/hevy-export.csv` (au format d'export) et `hevy-api.json` (brut, pour vérifier). `donnees-perso/` est ignoré par git. Le test « import réel » s'exécute seulement si ces fichiers existent.

## Schéma (migrations 2 et 3, par-dessus la 1)

`exercices` (+ `slug, nom_en, nom_norm, secondaires, categorie, picto, perso, mesure`), `exercice_alias`, `seances` (+ `titre, source_ref, volume_kg, nb_series`), `series` (+ `volume, e1rm, precedent_kg, precedent_reps, duree_s, distance_m, rpe`), `seance_exercices` (ordre, groupe, repos, note de chaque exercice dans la séance), `records`. Migration 5 : `routine_series.type` (défaut 'normale'), `routine_series.reps_max`, `routine_exercices.plage_reps` (0/1, mode plage de la ligne), `series.plage_min/plage_max` (indication de séance, `reps` reste vide). Migration 3 : `routine_series (ligne_id, rang, kg, reps)`, cibles par série d'une ligne de routine, supprimées avec la ligne. Migration 9 : `exercices.note` (note d'exercice) ; une note de séance identique à la note de routine de la séance d'origine (ancienne copie au démarrage) est vidée, les autres restent (notes Hevy = notes de séance). Migration 8 : `routine_exercices.tempo` (TEXT nullable, « 3-1-1-0 » ; `modifierLigneRoutine(…, { tempo })`, lu en séance via `ExerciceDeSeance.tempo`). Migration 15 : `seance_exercices.tempo` (TEXT nullable) ; `definirTempoSeance(db, seanceId, exerciceId, tempo | null)` le règle pour cette séance (null = retiré pour cette séance, même s'il vient de la routine : « 0-0-0-0 » en base) ; `ExerciceDeSeance.tempo` = celui de la séance, sinon celui de la routine ; `creerRoutineDepuisSeance` le recopie. On n'édite jamais une migration livrée : on en ajoute une.

## v2.3 : natures, pesées, salles, paliers (migration 4)

- `Exercice` : `mesure` et `materiel` disparaissent ; `nature` (`NATURES`), `equipement`, `allure`, `appareil_id`, `a_verifier`. `Seance` : `salle_id` (plus de `salle` texte) ; `SeanceDetail.salle`.
- `natures.ts` : `INFO_NATURE[nature]` (libellé, colonnes, mesures de fiche, `poidsCorps`), `evaluerChangementNature`, `formaterAllure`, `allureSecParKm`.
- Exercices : `creerExercice`, `modifierExercice`, `changerNature` (en place si compatible), `creerVariante`, `rechercherExercices(filtre)`, `compterExercices`, `compteursEquipement/Muscle/Salle`.
- Pesées : `listerPesees`, `peseeAvant`, `ajouterPesee(db, kg, date?, source?, origine?)`, `modifierPesee` (pesée manuelle seulement : une importée se supprime), `supprimerPesee`, `synchroniserPoidsSante(db, source)`. Toute pesée relance `recalculerPoidsDuCorps`. `origine` (migration 10) : paquet Android de l'appli qui a déposé la pesée dans Santé Connect.
- Charge effective : `series.charge_eff`, calculée par `recalculerExercice` (E1 inchangé : toute modification recalcule). Nulle sans pesée.
- Salles : `listerSalles`, `lireSalle`, `creerSalle`, `modifierSalle`, `definirSalleParDefaut`, `supprimerSalle`, `salleParDefaut` ; appareils : `creerAppareil`, `modifierAppareil`, `supprimerAppareil` ; `paliersPour(exerciceId, salleId)`.
- Paliers (`paliers.ts`) : `paliersReguliers`, `normaliserPaliers`, `pasRegulier`, `palierVoisin`, `estHorsPalier`, `PAS_SANS_PALIER` (2,5 kg).
- Stats : `progressionExercice` accepte `charge_eff`, `duree`, `distance`, `allure` ; `MESURES_INVERSEES`. Records : types `duree`, `distance`, `allure` en plus.
- `ajouterSerie` accepte `dureeS` et `distanceM`. `recalculerSiEnAttente(db)` est appelé à l'ouverture de la base.

## Remplacer l'exercice et Alternative (migration 18)

`remplacerExercice(db, seanceId, ancienId, nouveauId, {garderSeries?, routine?, raison?})` : le nouvel exercice prend la place de l'ancien dans la séance (`seance_exercices.remplace_id` = ancien, `raison_alternative` = `'occupe' | 'manquant' | null`). Séries non validées refaites vides sur le nouveau ; validées gardées sur l'ancien (défaut) ou passées au nouveau ; `routine` remplace aussi `routine_exercices.exercice_id`. `resumeRemplacement` (séries validées, routine d'origine) ; `alternativesPour` → `{faits, jamais}` (même muscle et catégorie, salle de la séance). `lireSeance` : `remplace` et `remplacePar` par exercice. La progression compte l'exercice réellement fait (les séries portent son `exercice_id`).
