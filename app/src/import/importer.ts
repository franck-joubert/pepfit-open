import { recalculerExercice, recalculerToutesSeances } from "../db/depots/recalcul";
import { transaction } from "../db/exclusif";
import type { Executeur } from "../db/executeur";
import { nouvelId } from "../db/id";
import { ajouterNote } from "../db/depots/notes";
import { sectionParNom } from "../db/depots/sections";
import { normaliser } from "../db/normaliser";
import { langueProbable } from "../db/noms";
import { allureParDefaut, INFO_NATURE, type Nature } from "../db/natures";
import { CORRESPONDANCES_HEVY, SYNONYMES_HEVY } from "./correspondances";
import { ErreurImport, lireExportHevy, type ExerciceHevy, type SeanceHevy } from "./hevy-csv";
import { lireRoutinesHevy, type RoutineHevy } from "./hevy-routines";
import { retraiterDansTransaction } from "../whoop/depot";
import { t } from "../i18n/index";

export interface RapportImport {
  /** Séances lues dans le fichier. */
  seancesLues: number;
  seancesImportees: number;
  /** Séances déjà présentes (réimport) : ignorées. */
  seancesDejaPresentes: number;
  seriesImportees: number;
  /** Noms Hevy rattachés au catalogue (ou à un exercice déjà connu). */
  exercicesReconnus: number;
  /** Exercices non reconnus : créés comme exercices perso (nom Hevy). */
  exercicesNonReconnus: string[];
  /** Parmi eux, ceux dont la nature est ambiguë (poids et réps, lesté ou assisté ?) : signalés « à vérifier » dans la fiche. */
  exercicesAVerifier: string[];
  /** Lignes ou séances ignorées, avec la raison. */
  erreurs: string[];
  dureeMs: number;
}

interface Connu {
  id: string;
  nature: Nature;
}

/**
 * Nature déduite des colonnes remplies (le CSV Hevy ne dit pas le type). `reps` + `weight_kg` est ambigu (poids et réps,
 * lesté ou assisté) : on prend poids et réps et l'exercice est à vérifier.
 */
export function natureDeduite(nom: string, seances: SeanceHevy[]): { nature: Nature; aVerifier: boolean } {
  let kg = false;
  let reps = false;
  let duree = false;
  let distance = false;
  for (const s of seances) {
    for (const e of s.exercices) {
      if (e.nom !== nom) continue;
      for (const x of e.series) {
        if ((x.kg ?? 0) > 0) kg = true;
        if ((x.reps ?? 0) > 0) reps = true;
        if ((x.dureeS ?? 0) > 0) duree = true;
        if ((x.distanceM ?? 0) > 0) distance = true;
      }
    }
  }
  if (distance) return { nature: kg && !duree ? "poids_distance" : "distance_duree", aVerifier: false };
  if (duree && !reps) return { nature: kg ? "duree_poids" : "duree", aVerifier: false };
  if (reps && !kg) return { nature: "reps", aVerifier: false };
  return { nature: "poids_reps", aVerifier: kg && reps };
}

/**
 * Rattache chaque nom Hevy à un exercice : alias mémorisé (le nom, puis ses synonymes), table de correspondances, catalogue,
 * sinon exercice perso créé (nature déduite de `seances`). Mémorise l'alias ; à appeler dans une transaction.
 */
async function rattacher(
  db: Executeur,
  noms: string[],
  seances: SeanceHevy[],
  rapport: Pick<RapportImport, "exercicesReconnus" | "exercicesNonReconnus" | "exercicesAVerifier">,
  connus: Map<string, Connu>,
): Promise<void> {
  const t = Date.now();
  for (const nom of noms) {
    const norm = normaliser(nom);
    let ligne: Connu | null = null;
    for (const n of [norm, ...(SYNONYMES_HEVY.get(norm) ?? []).map(normaliser)]) {
      ligne = await db.getFirstAsync<Connu>(
        "SELECT e.id, e.nature FROM exercice_alias a JOIN exercices e ON e.id = a.exercice_id WHERE a.nom_norm = ?",
        [n],
      );
      if (ligne) break;
    }
    const slug = CORRESPONDANCES_HEVY.get(norm);
    if (!ligne && slug) ligne = await db.getFirstAsync<Connu>("SELECT id, nature FROM exercices WHERE slug = ?", [slug]);
    if (!ligne) {
      ligne = await db.getFirstAsync<Connu>(
        "SELECT id, nature FROM exercices WHERE nom_norm = ? OR nom_en_norm = ? ORDER BY perso LIMIT 1",
        [norm, norm],
      );
    }
    if (ligne) rapport.exercicesReconnus++;
    else {
      const { nature, aVerifier } = natureDeduite(nom, seances);
      const id = nouvelId();
      const anglais = langueProbable(nom) === "en";
      await db.runAsync(
        "INSERT INTO exercices (id, nom, nom_norm, nom_en, nom_en_norm, poids_corps, perso, nature, allure, a_verifier, cree_le, maj_le) VALUES (?,?,?,?,?,?,1,?,?,?,?,?)",
        [id, nom, norm, anglais ? nom : null, anglais ? norm : null, INFO_NATURE[nature].poidsCorps ? 1 : 0, nature, nature === "distance_duree" ? allureParDefaut(null) : null, aVerifier ? 1 : 0, t, t],
      );
      ligne = { id, nature };
      rapport.exercicesNonReconnus.push(nom);
      if (aVerifier) rapport.exercicesAVerifier.push(nom);
    }
    await db.runAsync("INSERT OR IGNORE INTO exercice_alias (nom_norm, exercice_id, source) VALUES (?,?,'hevy')", [norm, ligne.id]);
    connus.set(nom, ligne);
  }
}

type Etape = "exercices" | "seances" | "records" | "whoop";

interface Violation {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
}

const violations = (db: Executeur) => db.getAllAsync<Violation>("PRAGMA foreign_key_check", []);
const cleViolation = (v: Violation) => `${v.table}|${v.rowid}|${v.parent}|${v.fkid}`;

/** defer_foreign_keys retombe à 0 à la fin d'une transaction : à 0 pendant l'import, sa transaction a été perdue. */
const enTransaction = async (db: Executeur) =>
  (await db.getFirstAsync<{ defer_foreign_keys: number }>("PRAGMA defer_foreign_keys", []))?.defer_foreign_keys === 1;

/**
 * Transaction d'un import en étapes. Les clés étrangères sont différées et vérifiées à la fin de chaque étape (seules celles
 * cassées par l'import comptent). Un échec annule tout et lève une ErreurImport qui dit l'étape et, pour une clé étrangère,
 * la table et sa table parente ; jamais une donnée de l'utilisateur. Une transaction perdue en route (ROLLBACK d'une autre
 * tâche, exclusif.ts) est dite telle quelle : ce qui a suivi a pu s'écrire.
 */
async function enEtapes(db: Executeur, corps: (etape: (nom: Etape, f: () => Promise<unknown>) => Promise<void>) => Promise<void>): Promise<void> {
  const echec = (nom: Etape, detail: string) => new ErreurImport(t("profil.importEtape", { etape: t(`profil.importEtape.${nom}`), detail }));
  const perdue = (nom: Etape) => new ErreurImport(t("profil.importInterrompu", { etape: t(`profil.importEtape.${nom}`) }));
  await transaction(db, async (db) => {
    await db.execAsync("PRAGMA defer_foreign_keys = ON");
    const avant = new Set((await violations(db)).map(cleViolation));
    await corps(async (nom, f) => {
      try {
        await f();
      } catch (e) {
        if (!(await enTransaction(db))) throw perdue(nom);
        throw echec(nom, e instanceof Error ? e.message : String(e));
      }
      if (!(await enTransaction(db))) throw perdue(nom);
      const cassees = (await violations(db)).filter((v) => !avant.has(cleViolation(v)));
      if (cassees.length) {
        const liens = [...new Set(cassees.map((v) => `${v.table} → ${v.parent}`))].join(", ");
        throw echec(nom, t("profil.importReference", { liens }));
      }
    });
  });
}

/**
 * Importe un export CSV Hevy (texte) : correspondance des exercices (alias mémorisés, table, catalogue, sinon exercice perso),
 * séances et séries, recalcul des records, puis séances Whoop fondues dans les séances Hevy qui les chevauchent. Idempotent :
 * une séance déjà importée (titre + début) est ignorée. Une seule transaction (exclusif.ts), tout ou rien : une erreur annule
 * l'import et dit à quelle étape.
 */
export function importerHevyTexte(db: Executeur, texte: string): Promise<RapportImport> {
  return transaction(db, (db) => importerSeances(db, texte));
}

async function importerSeances(db: Executeur, texte: string): Promise<RapportImport> {
  const t0 = Date.now();
  const { seances, erreurs } = lireExportHevy(texte);
  const deja = new Set(
    (await db.getAllAsync<{ source_ref: string }>("SELECT source_ref FROM seances WHERE source_ref LIKE 'hevy:%'", [])).map((r) => r.source_ref),
  );
  const nouvelles = seances.filter((s) => !deja.has(s.ref));
  const rapport: RapportImport = {
    seancesLues: seances.length,
    seancesImportees: 0,
    seancesDejaPresentes: seances.length - nouvelles.length,
    seriesImportees: 0,
    exercicesReconnus: 0,
    exercicesNonReconnus: [],
    exercicesAVerifier: [],
    erreurs,
    dureeMs: 0,
  };
  if (nouvelles.length === 0) {
    rapport.dureeMs = Date.now() - t0;
    return rapport;
  }

  const noms = [...new Set(nouvelles.flatMap((s) => s.exercices.map((e) => e.nom)))];
  const connus = new Map<string, Connu>();
  const touches = new Set<string>();

  await enEtapes(db, async (etape) => {
    await etape("exercices", () => rattacher(db, noms, nouvelles, rapport, connus));
    await etape("seances", async () => {
      const t = Date.now();
      for (const s of nouvelles) {
        const seanceId = nouvelId();
        await db.runAsync(
          "INSERT INTO seances (id, titre, debut, fin, note, source_ref, maj_le) VALUES (?,?,?,?,?,?,?)",
          [seanceId, s.titre, s.debut, s.fin, s.description, s.ref, t],
        );
        let position = 0;
        const vus = new Map<string, ExerciceHevy>();
        for (const [ordre, e] of s.exercices.entries()) {
          const ex = connus.get(e.nom)!;
          touches.add(ex.id);
          if (!vus.has(ex.id)) {
            vus.set(ex.id, e);
            await db.runAsync(
              "INSERT INTO seance_exercices (seance_id, exercice_id, position, groupe_superset) VALUES (?,?,?,?)",
              [seanceId, ex.id, ordre, e.groupeSuperset],
            );
            await ajouterNote(db, { exerciceId: ex.id, seanceId }, "seance", e.note);
          }
          for (const x of e.series) {
            await db.runAsync(
              `INSERT INTO series (id, seance_id, exercice_id, position, groupe_superset, type, kg, reps, faite, fait_le, rpe, duree_s, distance_m)
               VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?)`,
              [nouvelId(), seanceId, ex.id, position++, e.groupeSuperset, x.type, x.kg, x.reps, s.fin ?? s.debut, x.rpe, x.dureeS, x.distanceM],
            );
            rapport.seriesImportees++;
          }
        }
        rapport.seancesImportees++;
      }
    });
    await etape("records", async () => {
      for (const id of touches) await recalculerExercice(db, id);
      await recalculerToutesSeances(db);
    });
    // une séance Whoop déjà rangée seule sur les mêmes heures se fond dans la séance Hevy (pas de doublon)
    await etape("whoop", () => retraiterDansTransaction(db));
  });
  rapport.dureeMs = Date.now() - t0;
  return rapport;
}

export interface RapportRoutines {
  routinesLues: number;
  routinesImportees: number;
  /** Routines déjà importées (même id Hevy, toujours présentes) : ignorées. */
  routinesDejaPresentes: number;
  seriesImportees: number;
  exercicesReconnus: number;
  exercicesNonReconnus: string[];
  exercicesAVerifier: string[];
  erreurs: string[];
  dureeMs: number;
}

/** Réglage : id Hevy de routine -> id de la routine pepfit importée. */
const CLE_ROUTINES = "import.hevy.routines";

/** Les routines vues comme des séances, pour déduire la nature des exercices inconnus. */
function commeSeances(routines: RoutineHevy[]): SeanceHevy[] {
  return routines.map((r) => ({
    ref: r.ref,
    titre: r.titre,
    debut: 0,
    fin: null,
    description: null,
    exercices: r.exercices.map((e) => ({
      nom: e.nom,
      groupeSuperset: e.groupeSuperset,
      note: e.note,
      series: e.series.map((x, index) => ({ index, type: x.type, kg: x.kg, reps: x.reps, distanceM: x.distanceM, dureeS: x.dureeS, rpe: null })),
    })),
  }));
}

/**
 * Importe des routines Hevy (JSON de l'API v1) : ordre, supersets, repos, notes, séries avec type et cibles (charge,
 * réps ou plage, durée, distance). Mêmes correspondances d'exercices que l'historique. Les routines arrivent à la suite
 * des existantes : chaque dossier Hevy devient une section (reprise si une section porte déjà ce nom), celles sans dossier vont
 * dans « Routines ». Idempotent (clé : id Hevy). Une seule transaction, tout ou rien.
 */
export function importerRoutinesHevyTexte(db: Executeur, texte: string): Promise<RapportRoutines> {
  return transaction(db, (db) => importerRoutines(db, texte));
}

async function importerRoutines(db: Executeur, texte: string): Promise<RapportRoutines> {
  const t0 = Date.now();
  const { routines, erreurs } = lireRoutinesHevy(texte);
  const brut = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [CLE_ROUTINES]);
  const importees = JSON.parse(brut?.valeur ?? "{}") as Record<string, string>;
  const presentes = new Set((await db.getAllAsync<{ id: string }>("SELECT id FROM routines", [])).map((r) => r.id));
  const nouvelles = routines.filter((r) => !(importees[r.ref] && presentes.has(importees[r.ref]!)));
  const rapport: RapportRoutines = {
    routinesLues: routines.length,
    routinesImportees: 0,
    routinesDejaPresentes: routines.length - nouvelles.length,
    seriesImportees: 0,
    exercicesReconnus: 0,
    exercicesNonReconnus: [],
    exercicesAVerifier: [],
    erreurs,
    dureeMs: 0,
  };
  if (nouvelles.length === 0) {
    rapport.dureeMs = Date.now() - t0;
    return rapport;
  }

  const noms = [...new Set(nouvelles.flatMap((r) => r.exercices.map((e) => e.nom)))];
  const connus = new Map<string, Connu>();
  await transaction(db, async (db) => {
    await rattacher(db, noms, commeSeances(nouvelles), rapport, connus);
    const t = Date.now();
    const m = await db.getFirstAsync<{ m: number | null }>("SELECT MAX(ordre) AS m FROM routines", []);
    let ordre = (m?.m ?? -1) + 1;
    const sections = new Map<string, string>();
    for (const r of nouvelles) {
      const routineId = nouvelId();
      const dossier = r.dossier ?? "Routines";
      if (!sections.has(dossier)) sections.set(dossier, await sectionParNom(db, dossier));
      await db.runAsync("INSERT INTO routines (id, nom, note, ordre, section_id, cree_le, maj_le) VALUES (?,?,?,?,?,?,?)", [
        routineId, r.titre, r.note, ordre++, sections.get(dossier)!, t, t,
      ]);
      for (const [position, e] of r.exercices.entries()) {
        const ligneId = nouvelId();
        const plage = e.series.some((x) => x.repsMax !== null);
        await db.runAsync(
          "INSERT INTO routine_exercices (id, routine_id, exercice_id, position, groupe_superset, nb_series, repos_s, plage_reps) VALUES (?,?,?,?,?,?,?,?)",
          [ligneId, routineId, connus.get(e.nom)!.id, position, e.groupeSuperset, Math.max(1, e.series.length), e.reposS, plage ? 1 : 0],
        );
        await ajouterNote(db, { exerciceId: connus.get(e.nom)!.id, ligneId }, "routine", e.note);
        for (const [rang, x] of e.series.entries()) {
          await db.runAsync(
            "INSERT INTO routine_series (ligne_id, rang, kg, reps, duree_s, distance_m, type, reps_max) VALUES (?,?,?,?,?,?,?,?)",
            [ligneId, rang, x.kg, x.reps, x.dureeS, x.distanceM, x.type, x.repsMax],
          );
          rapport.seriesImportees++;
        }
      }
      importees[r.ref] = routineId;
      rapport.routinesImportees++;
    }
    await db.runAsync(
      "INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
      [CLE_ROUTINES, JSON.stringify(importees)],
    );
  });
  rapport.dureeMs = Date.now() - t0;
  return rapport;
}
