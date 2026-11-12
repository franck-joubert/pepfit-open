// Page Énergie (planche pas, NOTES § 5 « Énergie ») : chiffres d'une période, objectif de solde tiré de l'objectif de poids,
// cumul et son équivalent en poids, moyenne lissée du poids pour comparer à la balance. Pur (sans React Native) :
// tests/mesures-energie.test.ts. Un jour sans journal (apports inconnus, ou estimés par les habitudes) ne compte nulle part.

/** kcal par kg de masse grasse : l'équivalent est toujours écrit « ≈ » et « estimé ». */
export const KCAL_KG = 7700;
/** Moyenne lissée du poids : chaque pesée compte pour 10 % (même règle que les pages Poids et Masse grasse). */
export const POIDS_LISSAGE = 0.1;

/** Une journée d'énergie telle que la page la lit (tirée de JourEnergie). */
export interface JourE {
  jour: number;
  /** null : journal non tenu (le jour ne compte pas). */
  apports: number | null;
  depense: number;
  comp: Composantes;
  /** apports − dépense ; null sans journal. */
  solde: number | null;
  /** Noms et durées des séances (« Padel 62 min »). */
  seances: string[];
}

export interface Composantes {
  bmr: number;
  sport: number;
  neat: number;
  digestion: number;
}

/** Solde visé (kcal/j) : rythme voulu (kg/sem., signé) × 7 700 ÷ 7 ; null sans objectif de poids ou à rythme nul (P11). */
export function objectifSolde(rythmeKgSemaine: number | null, cible: number | null): number | null {
  if (cible == null || !rythmeKgSemaine) return null;
  return Math.round((rythmeKgSemaine * KCAL_KG) / 7);
}

/** Objectif tenu : perte → au moins aussi déficitaire que le solde visé ; prise → au moins ce surplus. */
export function tenu(solde: number, objectif: number): boolean {
  return objectif <= 0 ? solde <= objectif : solde >= objectif;
}

/** Journée « bonne » pour l'agenda : objectif tenu, ou déficit sans objectif. */
export function bonneJournee(solde: number, objectif: number | null): boolean {
  return objectif == null ? solde < 0 : tenu(solde, objectif);
}

export type MotSolde = "deficit" | "surplus" | "equilibre";
export const motSolde = (v: number): MotSolde => (Math.round(v) < 0 ? "deficit" : Math.round(v) > 0 ? "surplus" : "equilibre");

const moy = (l: readonly number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);

export interface StatsEnergie {
  /** Jours avec journal. */
  n: number;
  /** Jours de la période sans journal. */
  sans: number;
  moy: number;
  cumul: number;
  tenu: number;
  dessus: number;
  surplus: number;
  deficit: number;
  app: number;
  dep: number;
  comp: Composantes;
}

/** Chiffres d'une période ; null si aucun jour n'a de journal. `objectif` null : ni « tenu » ni « au-dessus » (0). */
export function statsEnergie(jours: readonly (JourE | null)[], objectif: number | null): StatsEnergie | null {
  const js = jours.filter((j): j is JourE & { apports: number; solde: number } => j != null && j.apports != null && j.solde != null);
  if (!js.length) return null;
  const s = js.map((j) => j.solde);
  const nbTenu = objectif == null ? 0 : s.filter((v) => tenu(v, objectif)).length;
  return {
    n: js.length,
    sans: jours.length - js.length,
    moy: moy(s),
    cumul: s.reduce((a, b) => a + b, 0),
    tenu: nbTenu,
    dessus: objectif == null ? 0 : js.length - nbTenu,
    surplus: s.filter((v) => Math.round(v) > 0).length,
    deficit: s.filter((v) => Math.round(v) < 0).length,
    app: moy(js.map((j) => j.apports)),
    dep: moy(js.map((j) => j.depense)),
    comp: {
      bmr: moy(js.map((j) => j.comp.bmr)),
      sport: moy(js.map((j) => j.comp.sport)),
      neat: moy(js.map((j) => j.comp.neat)),
      digestion: moy(js.map((j) => j.comp.digestion)),
    },
  };
}

/**
 * Dépense moyenne des jours qui ont un bilan, journal tenu ou non (retour du 30/10 : sans journal, la dépense
 * reste connue ; Mois et Année ne montraient plus rien) ; null sans aucun bilan.
 */
export function depenseMoyenne(jours: readonly (JourE | null)[]): { n: number; dep: number; comp: Composantes } | null {
  const js = jours.filter((j): j is JourE => j != null);
  if (!js.length) return null;
  return {
    n: js.length,
    dep: moy(js.map((j) => j.depense)),
    comp: {
      bmr: moy(js.map((j) => j.comp.bmr)),
      sport: moy(js.map((j) => j.comp.sport)),
      neat: moy(js.map((j) => j.comp.neat)),
      digestion: moy(js.map((j) => j.comp.digestion)),
    },
  };
}

/**
 * Barre d'un mois (12 mois) : solde et apports moyens des jours avec journal (null sans journal), dépense moyenne des jours
 * avec bilan ; null sans aucun bilan.
 */
export function moyenneMois(jours: readonly (JourE | null)[]): { solde: number | null; app: number | null; dep: number; comp: Composantes } | null {
  const d = depenseMoyenne(jours);
  if (!d) return null;
  const s = statsEnergie(jours, null);
  return { solde: s?.moy ?? null, app: s?.app ?? null, dep: d.dep, comp: d.comp };
}

/**
 * Graphe des barres apports / dépense plutôt que celui du solde : toujours pour la semaine, et pour le mois ou l'année
 * quand aucune barre n'a de solde (pas de journal) : la dépense se montre au lieu d'un graphe vide.
 */
export function grapheApportsDepense(type: "semaine" | "mois" | "annee", soldes: readonly (number | null)[]): boolean {
  return type === "semaine" || soldes.every((v) => v == null);
}

/** Cumul du solde jour après jour, qui part de zéro ; un jour sans journal garde le cumul. */
export function cumulSoldes(jours: readonly (JourE | null)[]): number[] {
  let c = 0;
  return jours.map((j) => (c += j?.solde ?? 0));
}

/**
 * Moyenne lissée du poids à la fin de chaque jour (exponentielle, 10 % par pesée ; les jours sans pesée gardent la dernière
 * valeur ; avant la première pesée : null). `pesees` dans n'importe quel ordre.
 */
export function poidsLisse(pesees: readonly { date: number; kg: number }[], jours: readonly number[], finJour: (j: number) => number): (number | null)[] {
  const l = [...pesees].sort((a, b) => a.date - b.date);
  let i = 0;
  let v: number | null = null;
  return jours.map((j) => {
    const fin = finJour(j);
    while (i < l.length && l[i]!.date < fin) {
      v = v == null ? l[i]!.kg : v + POIDS_LISSAGE * (l[i]!.kg - v);
      i++;
    }
    return v;
  });
}

/** Variation de la moyenne lissée sur la période (dernier jour − veille du premier) ; null s'il manque l'un des deux. */
export function variationBalance(avant: number | null, fin: number | null): number | null {
  return avant == null || fin == null ? null : fin - avant;
}

/** Échelle des barres de solde (kcal) : 1 200 au moins, arrondie à 400 au-dessus du plus grand écart. */
export function echelleSolde(valeurs: readonly (number | null)[]): number {
  const m = Math.max(0, ...valeurs.map((v) => Math.abs(v ?? 0)));
  return Math.max(1200, Math.ceil(m / 400) * 400);
}

/** Échelle des barres apports / dépense (7 jours) : arrondie à 400 au-dessus du plus haut, 2 400 au moins. */
export function echelleJour(valeurs: readonly number[]): number {
  const m = Math.max(0, ...valeurs);
  return Math.max(2400, Math.ceil((m * 1.04) / 400) * 400);
}
