// Écritures Whoop dans la base locale : résumés par jour, séances (enrichies ou créées), mesures du corps, pesée, taille.
import { transaction } from "../db/exclusif";
import type { Executeur } from "../db/executeur";
import { nouvelId } from "../db/id";
import { ajouterPesee } from "../db/depots/pesees";
import { ajouterMesures } from "../db/depots/mesures";
import { effacerSeance, supprimerSeance } from "../db/depots/seances";
import { recalculerApresModification } from "../db/depots/recalcul";
import { nomAffiche } from "../db/noms";
import { chargeWhoop, familleExercices, famillesCompatibles, idSport, indexActivites, sortSeance, SPORTS_JOKERS, zonesWhoop, type ActiviteWhoop, type Famille } from "./sports";
import type { JourWhoop, SeanceConvertie } from "./types";
import { kcalCapteurGardee } from "../ecrans/kcal-comparaison";
import { REGLAGE } from "./constantes";

/** Source des mesures du corps venues de Whoop (prioritaires sur Santé Connect, db/depots/mesures.ts). */
export const SOURCE_WHOOP = "whoop";
/** Paquet de l'appli Whoop : nomSource() en fait « Whoop » dans les listes de sources. */
export const ORIGINE_WHOOP = "com.whoop.android";
/** Une séance Whoop qui chevauche une séance pepfit à moins de 10 min près l'enrichit au lieu de s'ajouter. */
export const TOLERANCE_MS = 10 * 60_000;

const CHAMPS: [keyof JourWhoop, string][] = [
  ["recup", "recup"], ["vfc", "vfc"], ["fcRepos", "fc_repos"], ["spo2", "spo2"], ["tempPeau", "temp_peau"],
  ["sommeilDebut", "sommeil_debut"], ["sommeilFin", "sommeil_fin"], ["sommeilMin", "sommeil_min"], ["sommeilPerf", "sommeil_perf"], ["sommeilDetteMin", "sommeil_dette_min"],
  ["legerMin", "leger_min"], ["profondMin", "profond_min"], ["paradoxalMin", "paradoxal_min"], ["eveilMin", "eveil_min"],
  ["respiration", "respiration"], ["sommeilEfficacite", "sommeil_efficacite"], ["sommeilRegularite", "sommeil_regularite"],
  ["sommeilReveils", "sommeil_reveils"], ["sommeilCycles", "sommeil_cycles"], ["auLitMin", "au_lit_min"],
  ["besoinBaseMin", "besoin_base_min"], ["besoinEffortMin", "besoin_effort_min"], ["besoinSiesteMin", "besoin_sieste_min"],
  ["strain", "strain"], ["kj", "kj"], ["fcMoy", "fc_moy"], ["fcMax", "fc_max"], ["pas", "pas"],
];

/** Un jour : chaque champ connu remplace l'ancien, un champ inconnu (null) laisse l'ancien. */
export async function enregistrerJours(db: Executeur, jours: readonly JourWhoop[], maintenant: number = Date.now()): Promise<void> {
  for (const j of jours) {
    const cols = CHAMPS.map(([, c]) => c);
    const vals = CHAMPS.map(([k]) => (j[k] as number | null | undefined) ?? null);
    await db.runAsync(
      `INSERT INTO whoop_jour (jour, ${cols.join(", ")}, maj_le) VALUES (?, ${cols.map(() => "?").join(", ")}, ?)
       ON CONFLICT(jour) DO UPDATE SET ${cols.map((c) => `${c} = COALESCE(excluded.${c}, ${c})`).join(", ")}, maj_le = excluded.maj_le`,
      [j.jour, ...vals, maintenant],
    );
  }
}

/** VFC et FC au repos de Whoop dans les mesures du corps (source « whoop », datées du réveil). Renvoie le nombre ajouté. */
export async function mesuresDesJours(db: Executeur, jours: readonly JourWhoop[], maintenant: number = Date.now()): Promise<number> {
  let n = 0;
  for (const j of jours) {
    const ligne = await db.getFirstAsync<{ vfc: number | null; fc_repos: number | null; sommeil_fin: number | null }>("SELECT vfc, fc_repos, sommeil_fin FROM whoop_jour WHERE jour = ?", [j.jour]);
    if (!ligne) continue;
    const date = ligne.sommeil_fin ?? j.jour + 7 * 3_600_000;
    if (ligne.vfc) n += await ajouterMesures(db, "vfc", [{ valeur: ligne.vfc, date, origine: ORIGINE_WHOOP }], SOURCE_WHOOP, maintenant);
    if (ligne.fc_repos) n += await ajouterMesures(db, "fc", [{ valeur: ligne.fc_repos, date, origine: ORIGINE_WHOOP }], SOURCE_WHOOP, maintenant);
  }
  return n;
}

/** Activités du catalogue qui portent un sport Whoop, par sport_id. */
export async function lireActivites(db: Executeur): Promise<Map<number, ActiviteWhoop>> {
  return indexActivites(await db.getAllAsync<ActiviteWhoop>("SELECT id, slug, nom, nom_en, categorie, whoop_ids FROM exercices WHERE whoop_ids IS NOT NULL", []));
}

/** Famille de sport d'une séance pepfit, d'après le sport qu'elle porte (D6), sinon ses exercices (« autre » sans exercice). */
export async function familleSeance(db: Executeur, seanceId: string): Promise<Famille> {
  const marque = await db.getFirstAsync<{ slug: string | null; categorie: string | null }>(
    "SELECT e.slug, e.categorie FROM seances s JOIN exercices e ON e.id = s.activite_id WHERE s.id = ?",
    [seanceId],
  );
  if (marque) return familleExercices([{ ...marque, perso: 0 }]);
  const l = await db.getAllAsync<{ slug: string | null; categorie: string | null; perso: number }>(
    `SELECT e.slug, e.categorie, e.perso FROM exercices e
     JOIN (SELECT exercice_id FROM seance_exercices WHERE seance_id = ? UNION SELECT exercice_id FROM series WHERE seance_id = ?) x ON x.exercice_id = e.id`,
    [seanceId, seanceId],
  );
  return familleExercices(l);
}

export const familleActivite = (a: ActiviteWhoop | undefined): Famille => (a ? familleExercices([{ slug: a.slug, categorie: a.categorie, perso: 0 }]) : "autre");

/**
 * Séance pepfit ou Hevy (pas créée pour Whoop) dont l'intervalle chevauche celui de Whoop à ±10 min, de la même famille de
 * sport (`famille` absente : toutes) ; la plus proche par le début. Deux autres séances comptent aussi, jamais une seconde pour le
 * même padel (retour du 08/11, padel détecté 07:52 puis saisi 08:00 dans Whoop) :
 * - la séance née d'une activité Whoop détectée dont l'activité a été remplacée chez Whoop (plus aucune activité rattachée :
 *   activiteRemplacee) : l'activité saisie à la main pour elle l'enrichit ;
 * - la séance Whoop d'un même sport (famille connue, identique) dont l'activité rattachée est plus longue que celle-ci : un fragment
 *   d'activité voisin (≤ 10 min) y est absorbé. `sauf` : l'activité Whoop elle-même (sa propre séance ne compte pas).
 */
export async function seancePepfitCorrespondante(db: Executeur, debut: number, fin: number, famille?: Famille, sauf?: string): Promise<string | null> {
  const l = await db.getAllAsync<{ id: string; debut: number; whoop: number; plus_longue: number }>(
    `SELECT id, debut, (source_ref LIKE 'whoop:%') AS whoop,
       EXISTS (SELECT 1 FROM whoop_seance w WHERE w.seance_id = seances.id AND w.fin - w.debut > ?) AS plus_longue
     FROM seances WHERE fin IS NOT NULL AND debut < ? AND fin > ?
       AND (source_ref IS NULL OR source_ref NOT LIKE 'whoop:%'
         OR NOT EXISTS (SELECT 1 FROM whoop_seance w WHERE w.seance_id = seances.id)
         OR (EXISTS (SELECT 1 FROM whoop_seance w WHERE w.seance_id = seances.id AND w.fin - w.debut > ?)
             AND NOT EXISTS (SELECT 1 FROM whoop_seance w WHERE w.seance_id = seances.id AND w.id = ?)))`,
    [fin - debut, fin + TOLERANCE_MS, debut - TOLERANCE_MS, fin - debut, sauf ?? ""],
  );
  l.sort((a, b) => Math.abs(a.debut - debut) - Math.abs(b.debut - debut));
  for (const s of l) {
    const f = await familleSeance(db, s.id);
    // une séance Whoop déjà rattachée n'absorbe qu'un fragment du même sport connu : jamais une activité sans sport
    const fragment = s.whoop && s.plus_longue;
    if (fragment ? !!famille && famille !== "autre" && f === famille : !famille || famillesCompatibles(famille, f)) return s.id;
  }
  return null;
}

/** Titre d'une séance Whoop seule : le nom de l'activité (« Musculation »), sinon le nom Whoop. */
const titreActivite = (a: ActiviteWhoop | undefined, brut: string) => (a ? nomAffiche(a) : brut);

/** L'activité seule, une série de durée (et de distance) faite : nom, picto et détail comme une séance du lanceur. */
export async function poserActivite(db: Executeur, seanceId: string, a: ActiviteWhoop, w: { debut: number; fin: number; distanceM: number | null }): Promise<void> {
  await db.runAsync("INSERT OR IGNORE INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,0)", [seanceId, a.id]);
  await db.runAsync(
    "INSERT INTO series (id, seance_id, exercice_id, position, type, duree_s, distance_m, faite, fait_le) VALUES (?,?,?,0,'normale',?,?,1,?)",
    [nouvelId(), seanceId, a.id, Math.round((w.fin - w.debut) / 1000), w.distanceM && w.distanceM > 0 ? w.distanceM : null, w.fin],
  );
  await recalculerApresModification(db, seanceId, [a.id]);
}

async function creerSeance(db: Executeur, w: SeanceConvertie, a: ActiviteWhoop | undefined, maintenant: number): Promise<string> {
  const id = nouvelId();
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, source_ref, maj_le) VALUES (?,?,?,?,?,?)", [id, titreActivite(a, w.sport), w.debut, w.fin, `whoop:${w.id}`, maintenant]);
  if (a) await poserActivite(db, id, a, w);
  return id;
}

export interface BilanSeances {
  enrichies: number;
  creees: number;
  /** Marches de tous les jours et activités de la vie courante : gardées pour Whoop, jamais une séance. */
  ignorees: number;
}

/**
 * Range les séances Whoop. Une déjà connue est mise à jour (heures de la séance créée pour elle). Une nouvelle enrichit la
 * séance pepfit ou Hevy de même famille qui la chevauche (FC, zones, effort, kcal : whoop_seance.seance_id) ; sinon elle
 * devient une séance à son nom (activité du catalogue, picto), sauf une marche de faible effort ou une activité de la vie
 * courante (sortSeance), gardée sans séance.
 */
export async function enregistrerSeances(db: Executeur, l: readonly SeanceConvertie[], maintenant: number = Date.now()): Promise<BilanSeances> {
  const bilan: BilanSeances = { enrichies: 0, creees: 0, ignorees: 0 };
  const activites = l.length ? await lireActivites(db) : new Map<number, ActiviteWhoop>();
  for (const w of l) {
    if (!(w.fin > w.debut)) continue;
    const connue = await db.getFirstAsync<{ seance_id: string | null }>("SELECT seance_id FROM whoop_seance WHERE id = ?", [w.id]);
    let seanceId = connue?.seance_id ?? null;
    const a = w.sportId != null ? activites.get(w.sportId) : undefined;
    if (!connue) {
      const sort = sortSeance(w.sportId, chargeWhoop(w));
      const peutEnrichir = sort !== "ignoree" || (w.sportId != null && SPORTS_JOKERS.has(w.sportId));
      seanceId = peutEnrichir ? await seancePepfitCorrespondante(db, w.debut, w.fin, familleActivite(a), w.id) : null;
      if (seanceId) bilan.enrichies++;
      else if (sort === "seance") {
        seanceId = await creerSeance(db, w, a, maintenant);
        bilan.creees++;
      } else bilan.ignorees++;
    } else if (seanceId) {
      const remplacee = await activiteRemplacee(db, w, seanceId);
      if (remplacee) {
        // Whoop a remplacé l'activité détectée par une autre (saisie à la main, ou réduite) : la séance garde l'heure et la durée
        // détectées, l'activité Whoop s'en détache (elle ne dit plus rien de la séance) ; une activité saisie pour elle la reprendra
        await db.runAsync("UPDATE seances SET debut = ?, fin = ?, maj_le = ? WHERE id = ? AND source_ref = ? AND debut_orig IS NULL AND (debut <> ? OR fin <> ?)", [
          remplacee.debut, remplacee.fin, maintenant, seanceId, `whoop:${w.id}`, remplacee.debut, remplacee.fin,
        ]);
        await db.runAsync("UPDATE whoop_seance SET seance_id = NULL WHERE id = ?", [w.id]);
        seanceId = null;
      } else {
        // séance créée pour Whoop : ses heures suivent Whoop ; une séance pepfit garde les siennes. Une séance dont la personne a
        // modifié les horaires (debut_orig, migration 182) les garde : seul l'original suit Whoop, « Rétablir » le remet ensuite
        await db.runAsync("UPDATE seances SET debut = ?, fin = ?, maj_le = ? WHERE id = ? AND source_ref = ? AND debut_orig IS NULL", [w.debut, w.fin, maintenant, seanceId, `whoop:${w.id}`]);
        await db.runAsync("UPDATE seances SET debut_orig = ?, fin_orig = ?, maj_le = ? WHERE id = ? AND source_ref = ? AND debut_orig IS NOT NULL AND (debut_orig <> ? OR fin_orig <> ?)", [
          w.debut, w.fin, maintenant, seanceId, `whoop:${w.id}`, w.debut, w.fin,
        ]);
      }
    }
    // heures changées chez Whoop : les pas et la FC gardés ne sont plus ceux de la séance, ils seront relus
    await db.runAsync("DELETE FROM whoop_seance_detail WHERE whoop_id IN (SELECT id FROM whoop_seance WHERE id = ? AND (debut != ? OR fin != ?))", [w.id, w.debut, w.fin]);
    await db.runAsync(
      `INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, strain, kj, fc_moy, fc_max, distance_m, zones, seance_id, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET debut = excluded.debut, fin = excluded.fin, sport_id = excluded.sport_id, sport = excluded.sport, strain = excluded.strain, kj = excluded.kj,
         fc_moy = excluded.fc_moy, fc_max = excluded.fc_max, distance_m = excluded.distance_m, zones = excluded.zones, maj_le = excluded.maj_le`,
      // ses kcal ne se gardent que 4 semaines, pour le labo (kcal-comparaison.ts) : jamais dans notre calcul
      [w.id, w.debut, w.fin, w.sportId, w.sport, w.strain, kcalCapteurGardee(w.fin, maintenant) ? w.kj : null, w.fcMoy, w.fcMax, w.distanceM, w.zones ? JSON.stringify(w.zones) : null, seanceId, maintenant],
    );
  }
  return bilan;
}

/**
 * La séance née de l'activité Whoop détectée `w` (activite_detectee « associee », heures de la détection) : Whoop a-t-il remplacé
 * cette activité par une autre ? Oui si ses heures actuelles ne couvrent plus la moitié des heures détectées (07:52 à 09:29
 * devenue une marche de 07:50 à 07:54 quand Alex a saisi son padel de 08:00 à 09:30 dans Whoop). Renvoie les heures
 * détectées, sinon null. Se juge sur l'état (pas sur le changement) : la séance déjà raccourcie est remise à ses heures.
 */
async function activiteRemplacee(db: Executeur, w: { id: string; debut: number; fin: number }, seanceId: string): Promise<{ debut: number; fin: number } | null> {
  const ref = await db.getFirstAsync<{ debut: number; fin: number }>("SELECT debut, fin FROM activite_detectee WHERE cle = ? AND seance_id = ? AND etat = 'associee'", [`whoop:${w.id}`, seanceId]);
  if (!ref || !(ref.fin > ref.debut)) return null;
  const commun = Math.min(w.fin, ref.fin) - Math.max(w.debut, ref.debut);
  return commun < (ref.fin - ref.debut) / 2 ? ref : null;
}

export interface BilanRetraitement {
  /** Séances créées pour Whoop fondues dans la séance pepfit ou Hevy qui les chevauche (ou séance Whoop sans séance rattachée). */
  rattachees: number;
  /** Marches de tous les jours importées comme séances : retirées. */
  retirees: number;
  /** Séances Whoop seules mises à leur nom et à leur activité (picto, détail). */
  completees: number;
}

/**
 * Remet en ordre les séances Whoop déjà rangées (import d'avant, Hevy importé après Whoop, séance pepfit saisie après coup) :
 * une séance créée pour Whoop qui chevauche une séance pepfit ou Hevy de même famille s'y fond (note, notes et photo
 * déplacées : rien de perdu) ; une marche de tous les jours devenue séance est retirée si l'utilisateur n'y a rien mis ;
 * une séance Whoop seule prend le nom et l'activité de son sport. Le titre n'est remplacé que s'il est encore le nom brut de
 * Whoop. Idempotent. Une séance Whoop par transaction (audit M14 : tout l'historique passait dans une seule à chaque synchro
 * Whoop) ; une séance déjà rattachée à une séance pepfit ou Hevy ne coûte rien.
 */
export async function retraiterSeancesWhoop(db: Executeur, maintenant: number = Date.now()): Promise<BilanRetraitement> {
  const bilan: BilanRetraitement = { rattachees: 0, retirees: 0, completees: 0 };
  const lignes = await lireLignesWhoop(db);
  if (!lignes.length) return bilan;
  const activites = await lireActivites(db);
  for (const { id } of lignes.filter(aRetraiter)) {
    await transaction(db, async (db) => {
      // Relue dans sa transaction : elle a pu changer depuis la liste.
      const w = (await lireLignesWhoop(db, id))[0];
      if (w && aRetraiter(w)) await retraiterUne(db, w, activites, maintenant, bilan);
    });
  }
  return bilan;
}

/** Idem, dans la transaction de l'appelant (import Hevy : l'import et le retraitement passent ensemble ou pas du tout). */
export async function retraiterDansTransaction(db: Executeur, maintenant: number = Date.now()): Promise<BilanRetraitement> {
  const bilan: BilanRetraitement = { rattachees: 0, retirees: 0, completees: 0 };
  const lignes = await lireLignesWhoop(db);
  if (!lignes.length) return bilan;
  const activites = await lireActivites(db);
  for (const w of lignes) if (aRetraiter(w)) await retraiterUne(db, w, activites, maintenant, bilan);
  return bilan;
}

type LigneWhoop = {
  id: string; debut: number; fin: number; sport_id: number | null; sport: string | null; zones: string | null; distance_m: number | null;
  seance_id: string | null; titre: string | null; note: string | null; source_ref: string | null;
};

function lireLignesWhoop(db: Executeur, id?: string): Promise<LigneWhoop[]> {
  return db.getAllAsync<LigneWhoop>(
    `SELECT w.id, w.debut, w.fin, w.sport_id, w.sport, w.zones, w.distance_m, w.seance_id, s.titre, s.note, s.source_ref
     FROM whoop_seance w LEFT JOIN seances s ON s.id = w.seance_id ${id ? "WHERE w.id = ?" : ""} ORDER BY w.debut`,
    id ? [id] : [],
  );
}

/** Une séance Whoop rattachée à une séance pepfit ou Hevy (pas créée pour elle) est déjà rangée. */
const aRetraiter = (w: LigneWhoop) => w.seance_id == null || w.source_ref === `whoop:${w.id}`;

async function retraiterUne(db: Executeur, w: LigneWhoop, activites: Awaited<ReturnType<typeof lireActivites>>, maintenant: number, bilan: BilanRetraitement): Promise<void> {
  const creee = w.seance_id != null && w.source_ref === `whoop:${w.id}`;
  const id = idSport(w.sport_id, w.sport);
  const a = id != null ? activites.get(id) : undefined;
  const sort = sortSeance(id, chargeWhoop({ debut: w.debut, fin: w.fin, zones: zonesWhoop(w.zones) }));
  const peutEnrichir = sort !== "ignoree" || (id != null && SPORTS_JOKERS.has(id));
  const cible = peutEnrichir ? await seancePepfitCorrespondante(db, w.debut, w.fin, familleActivite(a), w.id) : null;
  if (cible) {
    if (creee && !(await fondre(db, w.seance_id!, cible, maintenant))) return;
    await db.runAsync("UPDATE whoop_seance SET seance_id = ?, sport_id = ? WHERE id = ?", [cible, id, w.id]);
    bilan.rattachees++;
    return;
  }
  if (!creee) return;
  if (sort !== "seance") {
    // une activité non nommée à laquelle l'utilisateur a donné un sport (activité détectée) est une vraie séance
    if (await rienDePerso(db, w.seance_id!, w.note) && !(await db.getFirstAsync("SELECT 1 AS x FROM seance_exercices WHERE seance_id = ?", [w.seance_id!]))) {
      await effacerSeance(db, w.seance_id!);
      await db.runAsync("UPDATE whoop_seance SET seance_id = NULL, sport_id = ? WHERE id = ?", [id, w.id]);
      bilan.retirees++;
    }
    return;
  }
  let change = false;
  if (a && !(await db.getFirstAsync("SELECT 1 AS x FROM seance_exercices WHERE seance_id = ?", [w.seance_id!]))) {
    await poserActivite(db, w.seance_id!, a, { debut: w.debut, fin: w.fin, distanceM: w.distance_m });
    change = true;
  }
  if (a && w.titre != null && w.sport != null && w.titre === w.sport) {
    await db.runAsync("UPDATE seances SET titre = ?, maj_le = ? WHERE id = ?", [titreActivite(a, w.sport), maintenant, w.seance_id!]);
    change = true;
  }
  if (id !== w.sport_id) await db.runAsync("UPDATE whoop_seance SET sport_id = ? WHERE id = ?", [id, w.id]);
  if (change) bilan.completees++;
}

/** Rien que l'utilisateur ait ajouté à une séance créée pour Whoop : ni note, ni note d'exercice, ni photo. */
async function rienDePerso(db: Executeur, seanceId: string, note: string | null): Promise<boolean> {
  if (note?.trim()) return false;
  const n = await db.getFirstAsync<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM notes WHERE seance_id = ?) + (SELECT COUNT(*) FROM seance_photo WHERE seance_id = ?) AS n",
    [seanceId, seanceId],
  );
  return (n?.n ?? 0) === 0;
}

/**
 * Fond la séance créée pour Whoop dans la séance pepfit ou Hevy : sa note s'ajoute à celle de la cible, ses notes et sa photo
 * la suivent (la photo seulement si la cible n'en a pas : sinon on ne fond pas, false), puis elle est supprimée.
 */
async function fondre(db: Executeur, source: string, cible: string, maintenant: number): Promise<boolean> {
  const photos = await db.getFirstAsync<{ s: number; c: number }>(
    "SELECT (SELECT COUNT(*) FROM seance_photo WHERE seance_id = ?) AS s, (SELECT COUNT(*) FROM seance_photo WHERE seance_id = ?) AS c",
    [source, cible],
  );
  if (photos && photos.s > 0 && photos.c > 0) return false;
  const notes = await db.getAllAsync<{ id: string; note: string | null }>("SELECT id, note FROM seances WHERE id IN (?, ?)", [source, cible]);
  const texte = notes.find((x) => x.id === source)?.note?.trim();
  if (texte) {
    const avant = notes.find((x) => x.id === cible)?.note?.trim();
    await db.runAsync("UPDATE seances SET note = ?, maj_le = ? WHERE id = ?", [avant ? `${avant}\n${texte}` : texte, maintenant, cible]);
  }
  await db.runAsync("UPDATE notes SET seance_id = ?, maj_le = ? WHERE seance_id = ?", [cible, maintenant, source]);
  await db.runAsync("UPDATE seance_photo SET seance_id = ? WHERE seance_id = ?", [cible, source]);
  await effacerSeance(db, source);
  return true;
}

/**
 * Rattache l'activité Whoop `whoopId` à la séance pepfit `cible` (séance lancée depuis une routine : même sport, même créneau).
 * Si l'activité avait sa propre séance créée pour Whoop, celle-ci s'y fond (notes et photo déplacées, `fondre`) ; false si la
 * photo des deux empêche de fondre, ou si l'activité est déjà rattachée à une séance pepfit ou Hevy (on ne la vole pas).
 */
export async function rattacherASeance(db: Executeur, whoopId: string, cible: string, maintenant: number = Date.now()): Promise<boolean> {
  const w = (await lireLignesWhoop(db, whoopId))[0];
  if (!w || !aRetraiter(w)) return false;
  if (w.seance_id != null && w.seance_id !== cible && !(await fondre(db, w.seance_id, cible, maintenant))) return false;
  await db.runAsync("UPDATE whoop_seance SET seance_id = ? WHERE id = ?", [cible, whoopId]);
  return true;
}

/** Poids et taille de Whoop : une pesée seulement si elle change (±0,05 kg) ; la taille seulement si on n'en a pas. */
/**
 * Corps du profil Whoop (body_measurement) : poids, taille, FC max. Rien n'est écrit si la valeur n'a pas changé depuis la
 * dernière lecture Whoop ; le poids, en plus, ne double pas la pesée la plus récente (même poids, quelle que soit sa source).
 * La taille et la FC max vont dans « mesure_corps » (source whoop) : la saisie de l'utilisateur prime à la lecture (profil.ts).
 */
export async function enregistrerCorps(db: Executeur, c: { tailleCm: number | null; kg: number | null; fcMax?: number | null }, maintenant: number = Date.now()): Promise<void> {
  if (c.kg != null) {
    const whoop = await db.getFirstAsync<{ kg: number }>("SELECT kg FROM pesee WHERE source = 'sante_connect' AND origine = ? ORDER BY date DESC LIMIT 1", [ORIGINE_WHOOP]);
    const recente = await db.getFirstAsync<{ kg: number }>("SELECT kg FROM pesee ORDER BY date DESC LIMIT 1", []);
    const pareil = (x: { kg: number } | null) => x != null && Math.abs(x.kg - c.kg!) <= 0.05;
    if (!pareil(whoop) && !pareil(recente)) await ajouterPesee(db, c.kg, maintenant, "sante_connect", ORIGINE_WHOOP);
  }
  for (const [type, v] of [["taille", c.tailleCm], ["fc_max", c.fcMax ?? null]] as const) {
    if (v == null) continue;
    const avant = await db.getFirstAsync<{ valeur: number }>("SELECT valeur FROM mesure_corps WHERE type = ? AND source = ? ORDER BY date DESC LIMIT 1", [type, SOURCE_WHOOP]);
    if (!avant || Math.abs(avant.valeur - v) > 0.05) await ajouterMesures(db, type, [{ valeur: v, date: maintenant, origine: ORIGINE_WHOOP }], SOURCE_WHOOP, maintenant);
  }
}

/** Préfixe de `source_ref` d'une séance créée pour Whoop et gardée à sa déconnexion : elle ne dépend plus de lui. */
export const REF_WHOOP_GARDEE = "ancien-whoop:";

/** Une séance pepfit `s` porte une identification : un sport (exercice du catalogue) ou une validation (activité détectée associée). */
const SQL_IDENTIFIEE = `(EXISTS (SELECT 1 FROM seance_exercices x WHERE x.seance_id = s.id) OR EXISTS (SELECT 1 FROM series r WHERE r.seance_id = s.id)
        OR EXISTS (SELECT 1 FROM activite_detectee a WHERE a.seance_id = s.id AND a.etat = 'associee'))`;

/**
 * Séances créées pour Whoop (`source_ref` « whoop:… ») qui portent une identification : un sport (activité du catalogue) ou
 * une validation (activité détectée associée). Elles sont à la personne, pas à Whoop : à la déconnexion elles restent, détachées
 * de la source (préfixe `ancien-whoop:`), avec leur titre, leur sport et leurs séries. Sans sport ni validation (un titre brut de
 * Whoop), la séance n'était que Whoop : elle part avec lui. Renvoie le nombre de séances gardées.
 */
export async function detacherSeancesWhoop(db: Executeur, maintenant: number = Date.now()): Promise<number> {
  const creees = await db.getAllAsync<{ id: string; source_ref: string; identifiee: number }>(
    `SELECT s.id, s.source_ref, ${SQL_IDENTIFIEE} AS identifiee FROM seances s WHERE s.source_ref LIKE 'whoop:%'`,
    [],
  );
  let gardees = 0;
  for (const s of creees) {
    if (!s.identifiee) {
      await supprimerSeance(db, s.id);
      continue;
    }
    await db.runAsync("UPDATE seances SET source_ref = ?, maj_le = ? WHERE id = ?", [REF_WHOOP_GARDEE + s.source_ref.slice("whoop:".length), maintenant, s.id]);
    gardees++;
  }
  return gardees;
}

/**
 * Déconnexion qui garde le journal (choix par défaut) : l'accès et l'état de la connexion partent (réglages « whoop_… » de
 * connexion, jamais une donnée de santé), les mesures et résumés restent tels quels, source « whoop » comprise : résumés par jour
 * (whoop_jour), VFC et FC au repos, taille et FC max (mesure_corps), pesées, activités rattachées à une séance. Les curseurs de
 * lecture restent aussi : une reconnexion relit seulement ce qui manque (synchro.ts). Seules les séances créées pour Whoop sans
 * identification (un titre brut) partent avec leur activité, comme dans la purge complète (detacherSeancesWhoop). Rien de ce qui
 * est partagé avec l'IA (whoop_brut_*) ni synchronisé n'est supprimé : rien ne se propage aux autres appareils.
 */
export async function retirerConnexionWhoop(db: Executeur): Promise<void> {
  const brutes = await db.getAllAsync<{ id: string }>(
    `SELECT w.id FROM whoop_seance w JOIN seances s ON s.source_ref = 'whoop:' || w.id WHERE NOT ${SQL_IDENTIFIEE}`,
    [],
  );
  await detacherSeancesWhoop(db);
  await transaction(db, async (db) => {
    // la séance supprimée a remis seance_id à NULL (ON DELETE SET NULL) : l'activité et son détail partent avec elle
    for (const { id } of brutes) {
      await db.runAsync("DELETE FROM whoop_seance_detail WHERE whoop_id = ?", [id]);
      await db.runAsync("DELETE FROM whoop_seance WHERE id = ?", [id]);
    }
    const cles = [REGLAGE.connecte, REGLAGE.derniereSynchro, REGLAGE.derniereErreur, REGLAGE.corpsLu];
    await db.runAsync(`DELETE FROM reglages WHERE cle IN (${cles.map(() => "?").join(", ")})`, cles);
  });
}

/**
 * Purge complète (choix « Supprimer aussi mes données Whoop ») : tout ce qui vient de Whoop (résumés, mesures, pesées). Les
 * séances pepfit restent, et celles créées pour Whoop qui ont un sport ou une validation aussi (detacherSeancesWhoop) :
 * l'identification d'une activité ne se perd pas. Les suppressions se propagent aux autres appareils par la synchro.
 */
export async function purgerWhoop(db: Executeur): Promise<void> {
  await detacherSeancesWhoop(db);
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM whoop_seance_detail", []);
    await db.runAsync("DELETE FROM whoop_seance", []);
    await db.runAsync("DELETE FROM whoop_jour", []);
    // ce qui avait été posé pour l'IA (partage-ia.ts) : la suppression part au serveur avec la prochaine synchro
    await db.runAsync("DELETE FROM whoop_brut_seance", []);
    await db.runAsync("DELETE FROM whoop_brut_jour", []);
    await db.runAsync("DELETE FROM mesure_corps WHERE source = ?", [SOURCE_WHOOP]);
    await db.runAsync("DELETE FROM pesee WHERE source = 'sante_connect' AND origine = ?", [ORIGINE_WHOOP]);
    await db.runAsync("DELETE FROM reglages WHERE cle LIKE 'whoop_%'", []);
  });
}
