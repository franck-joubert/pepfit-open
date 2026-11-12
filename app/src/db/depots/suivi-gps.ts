import type { CircuitSuivi } from "../../circuits/types";
import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { nomAffiche } from "../noms";
import type { Sport } from "./lanceur";
import { recalculerApresModification } from "./recalcul";
import { lireZonesFc } from "./zones-fc";
import { ecrireReglage, lireReglage } from "./reglages";

// Suivi GPS (planches/suivi-gps, lot 2, migration 32) : ce qui survit à l'appli entre Démarrer et la fin (le sport et le lieu
// du suivi natif en cours), puis l'enregistrement de la séance à la fin. Local, hors synchro (blob par séance au lot 3).

/** Sport, titre et lieu du suivi natif en cours : le module ne connaît que son identifiant. */
export interface SuiviLance {
  suiviId: string;
  exerciceId: string;
  titre: string;
  salleId: string | null;
  /** Séance enregistrée par un Terminer dont le résumé peut encore « Reprendre » (le service est en pause) : une nouvelle fin la met à jour. */
  seanceId?: string | null;
  /** Course guidée (planche seance-duree, D8) : la routine du programme dont le suivi enchaîne les étapes. */
  routineId?: string | null;
  /** Test VMA arrêté par une pause (planche vma-vo2max, D3) : les étapes de test interrompues (etapes-course.ts, avecRelances). */
  relancesTest?: number[];
  /** Course guidée sur tapis (D3 du 29/10) : la VMA du départ, qui fixe la durée des étapes à la distance (etapesAuTemps). */
  tapis?: { vma: number | null } | null;
  /** Récupération (familles-sports, D11 du 30/10) : durée visée (s) ; le direct montre un compte à rebours. Null : chrono. */
  dureeViseeS?: number | null;
  /** Le circuit à suivre (planche Circuits, lot F) : le tracé reste sur le téléphone, avec le suivi lancé ; absent, la sortie est libre. */
  circuit?: CircuitSuivi | null;
}

const CLE_EN_COURS = "suivi_en_cours";
const CLE_ECRAN = "suivi_ecran_allume";
const CLE_FC_WHOOP = "suivi_fc_whoop";
const CLE_FC_APPAREIL = "suivi_fc_appareil";
const CLE_ANNONCES = "suivi_annonces";
/** Réglage de la connexion Whoop (whoop/constantes.ts, REGLAGE.connecte), lu ici sans tirer le module Whoop. */
const CLE_WHOOP_CONNECTE = "whoop_connecte";

export async function lireSuiviLance(db: Executeur): Promise<SuiviLance | null> {
  const v = await lireReglage(db, CLE_EN_COURS);
  if (!v) return null;
  try {
    return JSON.parse(v) as SuiviLance;
  } catch {
    return null;
  }
}

export const ecrireSuiviLance = (db: Executeur, s: SuiviLance | null) => ecrireReglage(db, CLE_EN_COURS, s ? JSON.stringify(s) : "");

/** Sport du départ (lien pepfitopen://suivi/depart?sport=cat:course). */
export async function lireSport(db: Executeur, id: string): Promise<Sport | null> {
  const e = await db.getFirstAsync<{ id: string; nom: string; nom_en: string | null; slug: string | null }>(
    "SELECT id, nom, nom_en, slug FROM exercices WHERE id = ?",
    [id],
  );
  return e ? { id: e.id, nom: nomAffiche(e), slug: e.slug } : null;
}

/** « Écran toujours allumé » (D10) : non par défaut (retours du 28/10, b), retenu d'une course à l'autre. */
export async function lireEcranAllume(db: Executeur): Promise<boolean> {
  return (await lireReglage(db, CLE_ECRAN)) === "1";
}
export const ecrireEcranAllume = (db: Executeur, v: boolean) => ecrireReglage(db, CLE_ECRAN, v ? "1" : "0");

/** « Annonces vocales » de la course guidée (D4) : oui par défaut, retenu d'une course à l'autre. */
export async function lireAnnonces(db: Executeur): Promise<boolean> {
  return (await lireReglage(db, CLE_ANNONCES)) !== "0";
}
export const ecrireAnnonces = (db: Executeur, v: boolean) => ecrireReglage(db, CLE_ANNONCES, v ? "1" : "0");

/**
 * « FC en direct » (retours du 28/10, b, puis 06/11) : lire en Bluetooth la FC du capteur qui la diffuse (Whoop, ceinture,
 * montre), pendant le suivi d'une course comme pendant une séance de muscu. Le choix fait sur l'écran de départ (ou dans
 * Appareils et connexions), sinon allumée seulement si Whoop est connecté. Éteinte : aucune recherche Bluetooth, aucun
 * message de connexion. La clé garde son nom d'origine (`suivi_fc_whoop`) : pas de migration.
 */
export async function lireFcDirecte(db: Executeur): Promise<boolean> {
  const v = await lireReglage(db, CLE_FC_WHOOP);
  if (v === "1" || v === "0") return v === "1";
  // Sans choix fait : allumée seulement si un capteur cardiaque est connu (un capteur déjà utilisé, ou Whoop connecté) ; sinon éteinte.
  return !!(await lireReglage(db, CLE_FC_APPAREIL)) || (await lireReglage(db, CLE_WHOOP_CONNECTE)) === "1";
}
export const ecrireFcDirecte = (db: Executeur, v: boolean) => ecrireReglage(db, CLE_FC_WHOOP, v ? "1" : "0");

/**
 * Dernier capteur de FC choisi sur l'écran de départ (adresse Bluetooth) : celui qu'on garde quand plusieurs diffusent, et
 * celui que la séance de muscu lit (un seul capteur par séance). Vide : le service prend le dernier utilisé, sinon le premier.
 */
export async function lireFcAppareil(db: Executeur): Promise<string | null> {
  return (await lireReglage(db, CLE_FC_APPAREIL)) || null;
}
export const ecrireFcAppareil = (db: Executeur, adresse: string | null) => ecrireReglage(db, CLE_FC_APPAREIL, adresse ?? "");

/**
 * FC max du suivi : celle des zones (lireZonesFc, une seule résolution dans l'appli, lot 6 de la précision : saisie si on l'a
 * choisie, sinon mesurée, sinon d'après l'âge, sinon 190 dit « par défaut »).
 */
export async function lireFcMax(db: Executeur, maintenant = Date.now()): Promise<number> {
  return (await lireZonesFc(db, maintenant)).fcMax.bpm;
}

export interface SuiviAEnregistrer {
  exerciceId: string;
  titre: string;
  /** Course guidée : la routine du programme (la séance compte comme faite pour elle). */
  routineId?: string | null;
  salleId: string | null;
  mode: "course" | "fc";
  debut: number;
  fin: number;
  /** Temps de séance hors pauses. */
  dureeS: number;
  distanceM: number;
  denivelePlusM: number | null;
  deniveleMoinsM: number | null;
  barometre: boolean;
  points: readonly { t: number; s: number; lat: number; lon: number; altBaro: number | null; altGps: number | null; precision: number; vitesse: number | null }[];
  fc: readonly { t: number; s: number; bpm: number }[];
  /** Bornes des tours touchés (pas la fin). */
  tours: readonly { s: number; d: number }[];
}

/**
 * Enregistre un suivi terminé : une séance à un seul exercice dont la série porte durée et distance (comme une course saisie),
 * puis le tracé, la FC, les bornes des tours et le dénivelé. Renvoie l'identifiant de la séance.
 */
export async function enregistrerSuivi(db: Executeur, e: SuiviAEnregistrer): Promise<string> {
  const id = nouvelId();
  const dureeS = Math.max(0, Math.round(e.dureeS));
  const distance = e.distanceM > 0 ? Math.round(e.distanceM) : null;
  await transaction(db, async (db) => {
    await db.runAsync("INSERT INTO seances (id, routine_id, titre, debut, fin, salle_id, maj_le) VALUES (?,?,?,?,?,?,?)", [
      id, e.routineId ?? null, e.titre, e.debut, e.fin, e.salleId, e.fin,
    ]);
    await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,0)", [id, e.exerciceId]);
    await db.runAsync(
      "INSERT INTO series (id, seance_id, exercice_id, position, type, duree_s, distance_m, faite, fait_le) VALUES (?,?,?,0,'normale',?,?,1,?)",
      [nouvelId(), id, e.exerciceId, dureeS, distance, e.fin],
    );
    await ecrireTrace(db, id, e);
    await db.runAsync("INSERT INTO suivi_seance (seance_id, mode, denivele_plus_m, denivele_moins_m, barometre) VALUES (?,?,?,?,?)", [
      id, e.mode, e.denivelePlusM, e.deniveleMoinsM, e.barometre ? 1 : 0,
    ]);
    await recalculerApresModification(db, id, [e.exerciceId]);
  });
  return id;
}

/**
 * Nouvelle fin d'un suivi repris depuis son résumé (« Reprendre ») : la même séance est mise à jour (fin, durée, distance,
 * tracé, FC, tours, dénivelé) au lieu d'en créer une seconde. Le titre, le lieu, la photo et la note restent.
 */
export async function remplacerSuivi(db: Executeur, seanceId: string, e: SuiviAEnregistrer): Promise<void> {
  const dureeS = Math.max(0, Math.round(e.dureeS));
  const distance = e.distanceM > 0 ? Math.round(e.distanceM) : null;
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE seances SET debut = ?, fin = ?, maj_le = ? WHERE id = ?", [e.debut, e.fin, e.fin, seanceId]);
    // Tapis : la distance saisie sur le résumé (sans GPS, le suivi n'en mesure pas) reste après une reprise.
    const champ = e.mode === "fc" ? "COALESCE(?, distance_m)" : "?";
    await db.runAsync(`UPDATE series SET duree_s = ?, distance_m = ${champ}, faite = 1, fait_le = ? WHERE seance_id = ?`, [dureeS, distance, e.fin, seanceId]);
    for (const t of ["suivi_point", "seance_fc", "suivi_tour"]) await db.runAsync(`DELETE FROM ${t} WHERE seance_id = ?`, [seanceId]);
    await ecrireTrace(db, seanceId, e);
    await db.runAsync("UPDATE suivi_seance SET denivele_plus_m = ?, denivele_moins_m = ?, barometre = ? WHERE seance_id = ?", [
      e.denivelePlusM, e.deniveleMoinsM, e.barometre ? 1 : 0, seanceId,
    ]);
    await recalculerApresModification(db, seanceId, [e.exerciceId]);
  });
}

/** Tracé, FC et bornes des tours d'un suivi (même écriture à la première fin et après une reprise). */
async function ecrireTrace(db: Executeur, id: string, e: SuiviAEnregistrer): Promise<void> {
  for (const p of e.points)
    await db.runAsync(
      "INSERT OR IGNORE INTO suivi_point (seance_id, t, s, lat, lon, alt_baro, alt_gps, precision, vitesse) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, p.t, p.s, p.lat, p.lon, p.altBaro, p.altGps, p.precision, p.vitesse],
    );
  for (const f of e.fc) await db.runAsync("INSERT OR IGNORE INTO seance_fc (seance_id, t, s, bpm) VALUES (?,?,?,?)", [id, f.t, f.s, f.bpm]);
  const bornes = [...e.tours].sort((a, b) => a.s - b.s);
  for (const [i, b] of bornes.entries()) await db.runAsync("INSERT INTO suivi_tour (seance_id, n, t, d) VALUES (?,?,?,?)", [id, i + 1, b.s, b.d]);
}

/** Suivi d'une séance (lot 3) : tracé, FC, bornes des tours et dénivelé retenu ; null si la séance n'a ni tracé ni FC (sauf tapis). */
export interface SuiviEnregistre {
  points: { t: number; s: number; lat: number; lon: number; altBaro: number | null; altGps: number | null; precision: number; vitesse: number | null }[];
  fc: { t: number; s: number; bpm: number }[];
  bornes: { s: number; d: number }[];
  denivelePlusM: number | null;
  barometre: boolean;
  /** « fc » : tapis, intérieur (sans GPS, D2 du 29/10) : la distance se saisit sur le résumé. */
  mode: "course" | "fc";
}

export async function lireSuivi(db: Executeur, seanceId: string): Promise<SuiviEnregistre | null> {
  // La FC d'une séance de muscu a son propre bloc (lireFcMuscu, lot 5) : pas de bloc de course.
  const muscu = await db.getFirstAsync<{ n: number }>("SELECT 1 AS n FROM suivi_seance WHERE seance_id = ? AND mode = 'muscu'", [seanceId]);
  if (muscu) return null;
  const points = await db.getAllAsync<{ t: number; s: number; lat: number; lon: number; alt_baro: number | null; alt_gps: number | null; precision: number | null; vitesse: number | null }>(
    "SELECT t, s, lat, lon, alt_baro, alt_gps, precision, vitesse FROM suivi_point WHERE seance_id = ? ORDER BY t",
    [seanceId],
  );
  const fc = await db.getAllAsync<{ t: number; s: number; bpm: number }>("SELECT t, s, bpm FROM seance_fc WHERE seance_id = ? ORDER BY t", [seanceId]);
  const info = await db.getFirstAsync<{ denivele_plus_m: number | null; barometre: number; mode: string }>(
    "SELECT denivele_plus_m, barometre, mode FROM suivi_seance WHERE seance_id = ?",
    [seanceId],
  );
  // Tapis sans FC (D2 du 29/10) : ni tracé ni FC, mais le bloc reste (durée, tours, distance saisie).
  if (!points.length && !fc.length && info?.mode !== "fc") return null;
  const bornes = await db.getAllAsync<{ t: number; d: number }>("SELECT t, d FROM suivi_tour WHERE seance_id = ? ORDER BY n", [seanceId]);
  return {
    points: points.map((p) => ({ t: p.t, s: p.s, lat: p.lat, lon: p.lon, altBaro: p.alt_baro, altGps: p.alt_gps, precision: p.precision ?? 0, vitesse: p.vitesse })),
    fc,
    bornes: bornes.map((b) => ({ s: b.t, d: b.d })),
    denivelePlusM: info?.denivele_plus_m ?? null,
    barometre: info?.barometre === 1,
    mode: info?.mode === "fc" ? "fc" : "course",
  };
}

/**
 * « Fusionner avec le précédent » (D16) : retire la borne qui ouvre le tour `n` (n ≥ 2), puis renumérote les suivantes.
 * Temps, allure, FC, zone et dénivelé des tours se recalculent depuis les points.
 */
export async function fusionnerTourSeance(db: Executeur, seanceId: string, n: number): Promise<void> {
  if (n < 2) return;
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM suivi_tour WHERE seance_id = ? AND n = ?", [seanceId, n - 1]);
    const reste = await db.getAllAsync<{ n: number }>("SELECT n FROM suivi_tour WHERE seance_id = ? ORDER BY t", [seanceId]);
    // décalage par le négatif : la clé (seance_id, n) ne se heurte jamais à une ligne pas encore renumérotée
    for (const [i, r] of reste.entries()) await db.runAsync("UPDATE suivi_tour SET n = ? WHERE seance_id = ? AND n = ?", [-(i + 1), seanceId, r.n]);
    await db.runAsync("UPDATE suivi_tour SET n = -n WHERE seance_id = ? AND n < 0", [seanceId]);
  });
}
