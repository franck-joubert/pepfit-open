// Couleurs des trois anneaux de Sport (planche sport-stats v2, S2) : une règle pour les trois. Orange en cours, vert atteint,
// rouge trop loin (au-dessus, ou en retard sur l'heure). Pur : testé par tests/jauges-sport.test.ts. L'effort suit son idéal
// (effort-pepfit.ts, etatEffort).
import type { EtatJauge } from "./effort-pepfit";
import { RECUP } from "./recup-pepfit";

/** Dépense : verte de 90 à 125 % de ta journée d'habitude, rouge au-delà ; rouge sous 65 % de ce que l'heure laisse attendre. */
export const DEPENSE = { ok: 0.9, trop: 1.25, retard: 0.65 } as const;
/** Pas : rouges sous 50 % de ce que l'heure laisse attendre, sur une journée active de 7:00 à 22:00. */
export const PAS = { retard: 0.5, debutH: 7, finH: 22 } as const;

/** Part de la journée passée à `heure` (0 à 24, heure décimale) ; un jour passé : 24. */
const heureDe = (maintenant: number, jour: number) => {
  const h = (maintenant - jour) / 3_600_000;
  return Math.min(24, Math.max(0, h));
};

/**
 * État de la dépense du jour face à ta journée d'habitude (la moyenne des 30 jours d'avant). `jour` : son minuit ; un jour fini
 * se juge sur toute la journée. Le métabolisme tourne toute la journée : ce que l'heure laisse attendre est heure / 24.
 */
export function etatDepense(kcal: number | null, habitude: number | null, jour: number, maintenant: number): EtatJauge {
  if (kcal == null || habitude == null || !(habitude > 0)) return "cours";
  const r = kcal / habitude;
  if (r > DEPENSE.trop) return "alerte";
  if (r >= DEPENSE.ok) return "ok";
  if (kcal < DEPENSE.retard * habitude * (heureDe(maintenant, jour) / 24)) return "alerte";
  return "cours";
}

/** État des pas face à l'objectif ; au-delà, l'anneau reste plein et vert. */
export function etatPas(pas: number | null, objectif: number, jour: number, maintenant: number): EtatJauge {
  if (pas == null || !(objectif > 0)) return "cours";
  if (pas >= objectif) return "ok";
  const h = heureDe(maintenant, jour);
  const actif = Math.min(1, Math.max(0, (h - PAS.debutH) / (PAS.finH - PAS.debutH)));
  if (pas < PAS.retard * objectif * actif) return "alerte";
  return "cours";
}

/** Récupération (planche recuperation, D8) : l'anneau sur 100, vert dès « Prêt », orange en dessous ; jamais rouge. */
export function etatRecup(score: number | null): EtatJauge {
  return score != null && score >= RECUP.seuils[1] ? "ok" : "cours";
}

/** Part de l'anneau (0 à 1). */
export const partAnneau = (v: number | null, ref: number | null) => (v == null || ref == null || !(ref > 0) ? 0 : Math.min(1, Math.max(0, v / ref)));

/**
 * Dépense du jour face à ta journée d'habitude, sur la page Énergie (rappel de la jauge de Sport) : part de l'anneau (au-delà
 * de 1, un second tour, comme les pas) et pourcentage arrondi ; null sans dépense ou sans habitude.
 */
export function objectifDepense(kcal: number | null, habitude: number | null): { part: number; p: number } | null {
  if (kcal == null || habitude == null || !(habitude > 0)) return null;
  return { part: Math.max(0, kcal / habitude), p: Math.round((kcal / habitude) * 100) };
}
