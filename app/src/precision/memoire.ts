// Mémoire de la précision pepfit sur le téléphone (table reglages, effacée avec la base ; jamais synchronisée) : cap
// atteint, dernier cap montré et ce qu'on voyait alors, lectures ouvertes, dernier score calculé. Pur : tests/precision.test.ts.

/** Réglage « dernier cap vu » et lectures ouvertes : gardés sur le téléphone (table reglages, effacée avec la base). */
export const CLE_MEMOIRE = "precision_memoire";

export interface MemoirePrecision {
  /** Cap atteint (gardé avec sa marge de 5 points). */
  cap: number;
  /** Dernier cap dont le passage a été montré (une animation par cap, jamais deux). */
  vu: number;
  /** Lectures ouvertes (gardées avec leur marge de 10 points). */
  lectures: string[];
  /** Dernier score calculé (bandeau « +4 % de précision » après une saisie). */
  score: number | null;
  /** Dernier score montré (carte ou page) et lectures ouvertes alors : le passage de cap part de là. */
  affiche: number | null;
  lecturesVues: string[];
}

const chaines = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
const nombre = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function lireMemoire(brut: string | null): MemoirePrecision | null {
  if (!brut) return null;
  try {
    const m = JSON.parse(brut) as Partial<MemoirePrecision>;
    const n = (x: unknown) => (typeof x === "number" && x >= 1 && x <= 5 ? Math.round(x) : 1);
    return {
      cap: n(m.cap),
      vu: n(m.vu),
      lectures: chaines(m.lectures),
      score: nombre(m.score),
      affiche: nombre(m.affiche),
      lecturesVues: chaines(m.lecturesVues ?? m.lectures),
    };
  } catch {
    return null;
  }
}

/** Le passage à montrer : depuis le dernier cap vu, s'il est plus bas que le cap atteint (une fois par cap) ; null sinon. */
export function passageAMontrer(m: MemoirePrecision, cap: number, score: number): { capAvant: number; scoreAvant: number; lecturesAvant: string[] } | null {
  if (m.vu >= cap) return null;
  return { capAvant: m.vu, scoreAvant: Math.min(score, m.affiche ?? score), lecturesAvant: m.lecturesVues };
}
