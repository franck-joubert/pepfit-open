// Création et modification d'une séance prévue depuis le parcours (planche ajout-seance-v2) : les écritures de la feuille de
// réglages, sans écran. Une séance prévue est une programmation « unique » (db/depots/agenda), avec ses réglages (migration 90)
// et son lieu du jour.
import { personnaliserOccurrence, creerSeancePrevue } from "../../db/depots/agenda";
import {
  ajouterProgrammation, poserException, poserLieuPrevu, poserReglagesPrevus, reecrireProgrammation, retirerException, type ReglagesPrevus,
} from "../../db/depots/programmations";
import type { Executeur } from "../../db/executeur";
import { transaction } from "../../db/exclusif";
import { typeDeSport, type TypeProgramme } from "../../db/programmes";
import { texteRegle, type Langue } from "../../i18n/planif-saisie";
import type { Regle } from "../planification";
import { dureeBornee } from "../parcours-seance";

export interface PlanSeance {
  /** Sport (identifiant du catalogue) ; null : celui des exercices de la routine. */
  sport: string | null;
  /** Routine choisie ; null : séance d'un sport seul (routine cachée, sans exercices). */
  routineId: string | null;
  /** Nom de la séance d'un sport seul (le sport). */
  nom: string;
  jour: string;
  /** « HH:MM » ; ignorée si `sansHeure`. */
  heure: string;
  sansHeure: boolean;
  dureeMin: number | null;
  lieuId: string | null;
}

/** « Ajouter » : la séance prévue. Renvoie la clé « programmation|jour » que le récap lit. */
export async function creerSeanceDuParcours(db: Executeur, p: PlanSeance, langue: Langue): Promise<{ programmationId: string; routineId: string }> {
  const reglages: ReglagesPrevus = { sport: p.sport, dureeMin: dureeBornee(p.dureeMin), sansHeure: p.sansHeure };
  const heure = p.sansHeure ? null : p.heure;
  if (!p.routineId) {
    const type: TypeProgramme = typeDeSport(p.sport) ?? "muscu";
    return creerSeancePrevue(db, { date: p.jour, heure, nom: p.nom, lignes: [], type, reglages, lieuId: p.lieuId }, langue);
  }
  const routineId = p.routineId;
  return transaction(db, async (db) => {
    const regle: Regle = { freq: "unique", intervalle: 1, jours: [], date: p.jour, heure, debut: p.jour };
    const programmationId = await ajouterProgrammation(db, routineId, texteRegle(regle, langue), regle);
    await poserReglagesPrevus(db, programmationId, reglages);
    await poserLieuPrevu(db, programmationId, p.jour, p.lieuId);
    return { programmationId, routineId };
  });
}

export type Repetition = "jour" | "semaine" | "deuxSemaines";

export interface ModificationSeance {
  jour: string;
  heure: string;
  sansHeure: boolean;
  dureeMin: number | null;
  lieuId: string | null;
  /** Répétition choisie (« Répéter » n'existe qu'ici) ; absente : la séance ne se répète pas. */
  repeter?: Repetition | null;
}

/** Jour de la semaine, 0 = lundi (comme `Regle.jours`). */
const jourSemaine = (jour: string): number => (new Date(`${jour}T12:00:00`).getDay() + 6) % 7;

/**
 * « Modifier » une séance prévue : cette séance seulement. Une séance d'une série devient d'abord sa propre séance (copie
 * cachée, `personnaliserOccurrence`) ; le jour et l'heure passent par une exception « décalée » (la clé du lieu ne bouge pas),
 * la durée et « sans heure » par ses réglages, le lieu par le lieu du jour. Renvoie la clé de la séance modifiée.
 */
export async function modifierSeanceDuParcours(
  db: Executeur,
  cle: { programmationId: string; dateOrigine: string },
  m: ModificationSeance,
  langue: Langue,
): Promise<{ programmationId: string; dateOrigine: string }> {
  return transaction(db, async (db) => {
    let { programmationId, dateOrigine } = cle;
    const ligne = await db.getFirstAsync<{ regle: string }>("SELECT regle FROM programmations WHERE id = ?", [programmationId]);
    if (!ligne) throw new Error("seance-introuvable");
    let regle = JSON.parse(ligne.regle) as Regle;
    if (regle.freq !== "unique") {
      const copie = await personnaliserOccurrence(db, programmationId, dateOrigine, langue);
      if (!copie) throw new Error("seance-introuvable");
      const l = await db.getFirstAsync<{ regle: string }>("SELECT regle FROM programmations WHERE id = ?", [copie.programmationId]);
      programmationId = copie.programmationId;
      regle = JSON.parse(l!.regle) as Regle;
      dateOrigine = regle.date ?? dateOrigine;
    }
    const heure = m.sansHeure ? (regle.heure ?? m.heure) : m.heure;
    const avant = await db.getFirstAsync<{ sport: string | null }>("SELECT sport FROM programmation_reglages WHERE programmation_id = ?", [programmationId]);
    await poserReglagesPrevus(db, programmationId, { sport: avant?.sport ?? null, dureeMin: dureeBornee(m.dureeMin), sansHeure: m.sansHeure });
    if (m.repeter) {
      // La séance devient une série qui commence au jour choisi : plus d'exception, la règle est réécrite.
      await retirerException(db, programmationId, dateOrigine);
      const r: Regle = {
        freq: m.repeter === "jour" ? "jour" : "semaine",
        intervalle: m.repeter === "deuxSemaines" ? 2 : 1,
        jours: m.repeter === "jour" ? [] : [jourSemaine(m.jour)],
        heure,
        debut: m.jour,
      };
      await reecrireProgrammation(db, programmationId, r, texteRegle(r, langue));
      await poserLieuPrevu(db, programmationId, m.jour, m.lieuId);
      return { programmationId, dateOrigine: m.jour };
    }
    // Jour et heure : une exception « décalée » (la clé du lieu ne bouge pas) ; le lieu du jour reste sous la date d'origine.
    await poserException(db, programmationId, dateOrigine, { type: "decalee", nouvelleDate: m.jour, nouvelleHeure: heure });
    await poserLieuPrevu(db, programmationId, dateOrigine, m.lieuId);
    return { programmationId, dateOrigine };
  });
}
