// Comptage des données de la précision pepfit (docs/PRECISION.md § 2.2 et règle 3 du § 2.5) : des jours sur une fenêtre,
// jamais une série ; seules les valeurs plausibles comptent ; dix pesées le même jour comptent une fois. Pur :
// tests/precision.test.ts.

export const JOUR = 86_400_000;

/** Bornes plausibles, déjà celles du code (pesées, profil, FC, balance, VMA). */
export const BORNES = {
  kg: [20, 500],
  cm: [120, 230],
  fcRepos: [30, 110],
  fcMax: [100, 240],
  gras: [2, 70],
  vma: [6, 26],
} as const satisfies Record<string, readonly [number, number]>;

export const plausible = (v: number | null | undefined, [a, b]: readonly [number, number]): v is number => v != null && Number.isFinite(v) && v >= a && v <= b;

/** Minuit local du jour de `ms`. */
export function minuit(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Ancienneté en jours entiers (0 : aujourd'hui) ; null sans date. */
export const jours = (date: number | null | undefined, maintenant: number): number | null =>
  date == null ? null : Math.max(0, Math.round((minuit(maintenant) - minuit(date)) / JOUR));

const mediane = (l: readonly number[]) => {
  const s = [...l].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/** Écart au-delà duquel une pesée isolée ne compte pas (part de la médiane de sa semaine). */
export const ECART_PESEE = 0.05;

/**
 * Pesées qui comptent : plausibles (20 à 500 kg), une par jour (la dernière), et pas une pesée isolée qui s'écarte de plus
 * de 5 % de la médiane de sa semaine (les 3 jours avant et après, dès 3 pesées). Du plus ancien au plus récent.
 */
export function peseesRetenues(pesees: readonly { date: number; kg: number }[]): { date: number; kg: number }[] {
  const parJour = new Map<number, { date: number; kg: number }>();
  for (const p of pesees) {
    if (!plausible(p.kg, BORNES.kg)) continue;
    const j = minuit(p.date);
    const deja = parJour.get(j);
    if (!deja || p.date > deja.date) parJour.set(j, { date: p.date, kg: p.kg });
  }
  const l = [...parJour.values()].sort((a, b) => a.date - b.date);
  return l.filter((p) => {
    const semaine = l.filter((x) => Math.abs(minuit(x.date) - minuit(p.date)) <= 3.5 * JOUR).map((x) => x.kg);
    if (semaine.length < 3) return true;
    const m = mediane(semaine);
    return Math.abs(p.kg - m) <= ECART_PESEE * m;
  });
}

/** Semaines (blocs de 7 jours finissant aujourd'hui) qui ont au moins une date, parmi les `n` dernières. */
export function semainesAvec(dates: readonly number[], maintenant: number, n = 4): number {
  const fin = minuit(maintenant) + JOUR;
  const vues = new Set<number>();
  for (const d of dates) {
    if (d > maintenant) continue;
    const k = Math.floor((fin - d) / (7 * JOUR));
    if (k >= 0 && k < n) vues.add(k);
  }
  return vues.size;
}

/** Jours distincts parmi `dates` dont l'ancienneté est dans [de, a[ jours (0 : aujourd'hui). */
export function joursEntre(dates: readonly number[], maintenant: number, de: number, a: number): number {
  const l = new Set<number>();
  for (const d of dates) {
    const j = jours(d, maintenant);
    if (d <= maintenant && j != null && j >= de && j < a) l.add(minuit(d));
  }
  return l.size;
}

/** Fenêtre d'une montre : jours des 14 derniers jours, et des 14 d'avant. */
export const fenetre28 = (dates: readonly number[], maintenant: number) => ({
  recents: joursEntre(dates, maintenant, 0, 14),
  avant: joursEntre(dates, maintenant, 14, 28),
});

/** Un jour de repas tenu : au moins 2 repas et des kcal d'au moins la moitié du métabolisme de base. */
export const jourRepasTenu = (nbRepas: number, kcal: number, bmr: number) => nbRepas >= 2 && kcal >= bmr / 2;

/**
 * %gras par la méthode de l'US Navy (Hodgdon et Beckett 1984, en cm) : homme, tour de taille et cou ; femme, aussi les
 * hanches. null s'il manque une mesure ou si le résultat n'est pas plausible (2 à 70 %).
 */
export function grasNavy(p: { sexe: "h" | "f" | null; tailleCm: number | null; tourTaille: number | null; cou: number | null; hanches: number | null }): number | null {
  const { sexe, tailleCm, tourTaille, cou, hanches } = p;
  if (!sexe || !plausible(tailleCm, BORNES.cm) || tourTaille == null || cou == null || tourTaille <= cou) return null;
  let g: number;
  if (sexe === "h") g = 495 / (1.0324 - 0.19077 * Math.log10(tourTaille - cou) + 0.15456 * Math.log10(tailleCm)) - 450;
  else {
    if (hanches == null || tourTaille + hanches <= cou) return null;
    g = 495 / (1.29579 - 0.35004 * Math.log10(tourTaille + hanches - cou) + 0.221 * Math.log10(tailleCm)) - 450;
  }
  return plausible(g, BORNES.gras) ? Math.round(g * 10) / 10 : null;
}
