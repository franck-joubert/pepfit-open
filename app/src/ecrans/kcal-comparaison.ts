// Les kcal de Whoop face aux nôtres (décision du 31/10) : gardées 4 semaines, UNIQUEMENT pour la comparaison du labo
// (pepfitopen://labo/effort), puis oubliées. Jamais affichées ailleurs, jamais lues par le calcul (kcal-seance.ts). Les kcal
// d'une montre (Santé Connect) ne sont plus utilisées : leur agrégat sur la plage d'une séance ne mesurait pas la séance
// (docs/KCAL-SEANCES.md).
import type { Executeur } from "../db/executeur";
import { CALCUL_KCAL, kcalSeance, type CorpsKcal, type FamilleKcal } from "./kcal-seance";
import { lireFcMinutes, PREFIXE_FC_MINUTES } from "./kcal-fc";

const JOUR = 86_400_000;
/** Sport d'une séance pepfit sans activité (une routine) : la musculation, comme l'Effort (effort-charges.ts, sportDe). */
export const SPORT_MUSCU = "cat:musculation";
/** Durée de garde des kcal d'un capteur. */
export const JOURS_KCAL_CAPTEUR = 28;

/** Les kcal de Whoop d'une séance finie le `fin` se gardent-elles encore à `maintenant` ? */
export const kcalCapteurGardee = (fin: number, maintenant: number) => maintenant - fin < JOURS_KCAL_CAPTEUR * JOUR;

/** Oublie les kcal des capteurs de plus de 4 semaines (Whoop, activités détectées). */
export async function oublierKcalCapteurs(db: Executeur, maintenant: number): Promise<void> {
  const avant = maintenant - JOURS_KCAL_CAPTEUR * JOUR;
  await db.runAsync("UPDATE whoop_seance SET kj = NULL WHERE kj IS NOT NULL AND fin < ?", [avant]);
  await db.runAsync("UPDATE activite_detectee SET kcal = NULL, kcal_brutes = NULL WHERE (kcal IS NOT NULL OR kcal_brutes IS NOT NULL) AND fin < ?", [avant]).catch(() => undefined);
}

export interface LigneKcal {
  seanceId: string;
  debut: number;
  nom: string | null;
  minutes: number;
  famille: FamilleKcal;
  /** Nos kcal brutes (métabolisme compris, comme celles de Whoop), coefficient de la famille compris, sans facteur personnel. */
  nous: number;
  /** Les mêmes avec le facteur personnel (corps.calibration) : l'écart après calibration. */
  nousCalibre: number;
  methode: "fc" | "met";
  whoop: number;
  /** Pour la calibration (calibration.ts, pointSeance) : notre net à la FC sans coefficient ni facteur, la mesure nette. */
  netSansCoef: number;
  mesureNette: number;
}

/**
 * Séances des 4 dernières semaines qui ont des kcal de Whoop, face aux nôtres (brutes), les plus récentes d'abord. Une séance
 * pepfit sans sport est une séance de musculation (comme pour l'Effort).
 */
export async function lireComparaisonKcal(db: Executeur, corps: CorpsKcal, bmrKcal: number, maintenant = Date.now()): Promise<LigneKcal[]> {
  const l = await db.getAllAsync<{ id: string; debut: number; fin: number; nom: string | null; kj: number; fc_moy: number | null; fc_min: string | null; sport: string | null }>(
    `SELECT s.id, s.debut, s.fin, COALESCE(s.titre, r.nom) AS nom, w.kj, w.fc_moy,
       COALESCE(s.activite_id, (SELECT se.exercice_id FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id
         WHERE se.seance_id = s.id AND (e.whoop_ids IS NOT NULL OR e.id = 'cat:musculation') ORDER BY se.position LIMIT 1)) AS sport,
       (SELECT g.valeur FROM reglages g WHERE g.cle = '${PREFIXE_FC_MINUTES}' || s.id) AS fc_min
     FROM seances s JOIN whoop_seance w ON w.seance_id = s.id LEFT JOIN routines r ON r.id = s.routine_id
     WHERE w.kj IS NOT NULL AND s.fin IS NOT NULL AND s.fin >= ? ORDER BY s.debut DESC`,
    [maintenant - JOURS_KCAL_CAPTEUR * JOUR],
  );
  const sans = { ...corps, calibration: null };
  return l.map((x) => {
    const minutes = (x.fin - x.debut) / 60_000;
    const e = { minutes, fc: lireFcMinutes(x.fc_min), fcMoy: x.fc_moy, sportId: x.sport ?? SPORT_MUSCU };
    const k = kcalSeance(e, sans, bmrKcal);
    const c = kcalSeance(e, corps, bmrKcal);
    const whoop = x.kj / CALCUL_KCAL.kjParKcal;
    return {
      seanceId: x.id,
      debut: x.debut,
      nom: x.nom,
      minutes,
      famille: k.famille,
      nous: Math.round(k.brutes),
      nousCalibre: Math.round(c.brutes),
      methode: k.methode,
      whoop: Math.round(whoop),
      netSansCoef: k.coef > 0 ? k.kcal / k.coef : 0,
      mesureNette: whoop - (k.brutes - k.kcal),
    };
  });
}
