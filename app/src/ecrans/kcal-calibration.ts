// La calibration personnelle des kcal dans la base (calibration.ts pour la logique ; docs/KCAL-CALIBRATION.md § 2) : à chaque
// recalcul de fond (RecalculEffort.tsx), les séances des 4 dernières semaines qui ont des kcal de Whoop donnent leur rapport
// mesure ÷ calcul, gardé dans le réglage « kcal_calibration » (synchronisé et chiffré, migration 57), avant que ces kcal ne
// soient oubliées. Rien ne sort du téléphone en dehors de la synchro chiffrée.
import type { Executeur } from "../db/executeur";
import { lireAge, lireMorphologie, lireZonesFc } from "../db/api";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { CLE_CALIBRATION_KCAL, calibrationsKcal, ecrirePoints, facteursDepuisReglage, fusionnerPoints, lirePoints, pointSeance, type Calibration } from "./calibration";
import { lireComparaisonKcal, type LigneKcal } from "./kcal-comparaison";
import type { CorpsKcal, FamilleKcal } from "./kcal-seance";
import { bmrA } from "./sante-donnees";

/** Le corps du calcul à `t` (profil, zones de FC, facteurs personnels) et le métabolisme du jour. */
export async function corpsKcalA(db: Executeur, t: number): Promise<{ corps: CorpsKcal; bmr: number }> {
  const [m, age, zones, bmr, cal] = await Promise.all([lireMorphologie(db), lireAge(db, t), lireZonesFc(db, t), bmrA(db, t), lireReglage(db, CLE_CALIBRATION_KCAL)]);
  return {
    corps: { sexe: m.sexe, kg: m.poidsKg, age: age?.age ?? null, fcRepos: zones.fcRepos?.bpm ?? null, fcMax: zones.fcMax.bpm, calibration: facteursDepuisReglage(cal) },
    bmr,
  };
}

/** Points de calibration tirés des lignes de comparaison (Whoop). */
export const pointsDe = (l: readonly LigneKcal[]) =>
  l.map((x) => pointSeance({ ...x, src: "whoop" })).filter((p): p is NonNullable<typeof p> => p != null);

/** Apprend des séances qui ont des kcal de Whoop ; rend le nombre de points ajoutés ou changés (0 : réglage pas réécrit). */
export async function apprendreCalibrationKcal(db: Executeur, maintenant = Date.now()): Promise<number> {
  const { corps, bmr } = await corpsKcalA(db, maintenant);
  const nouveaux = pointsDe(await lireComparaisonKcal(db, corps, bmr, maintenant));
  if (!nouveaux.length) return 0;
  const anciens = lirePoints(await lireReglage(db, CLE_CALIBRATION_KCAL));
  const avant = new Map(anciens.map((x) => [x.s, x.r]));
  const changes = nouveaux.filter((x) => avant.get(x.s) !== x.r).length;
  if (!changes) return 0;
  await ecrireReglage(db, CLE_CALIBRATION_KCAL, ecrirePoints(fusionnerPoints(anciens, nouveaux)));
  return changes;
}

/** Pour le labo : la calibration de chaque famille qui a des séances comparables. */
export async function lireCalibrationsKcal(db: Executeur): Promise<Map<FamilleKcal, Calibration>> {
  return calibrationsKcal(lirePoints(await lireReglage(db, CLE_CALIBRATION_KCAL)));
}
