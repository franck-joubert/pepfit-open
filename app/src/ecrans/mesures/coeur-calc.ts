// VFC et fréquence cardiaque au repos, mesures « état » d'une nuit (planche pas, NOTES § 1, tableau « Pour la suite »), et
// le point de couleur de la nuit (retour du 29/10). Whoop ne colore ni la VFC ni la FC au repos (il donne les
// valeurs et le % de récupération) : pepfit calcule ta normale et la couleur, quelle que soit la source. Pur (sans React
// Native) : tests/mesures-coeur.test.ts.
//
// TA NORMALE (référence personnelle glissante) : tes nuits des 30 jours d'avant (7 au moins, sinon point neutre), leur
// médiane et leur dispersion robuste (1,4826 × écart absolu médian : l'écart-type d'une loi normale). Médiane plutôt que
// moyenne ± écart-type : une nuit d'alcool ou de grosse fatigue (VFC effondrée, FC en hausse) gonflerait l'écart-type et élargirait
// ta zone normale pendant un mois ; la médiane ne bouge pas. La VFC est lue en logarithme (lnRMSSD, comme dans les études :
// sa distribution s'étire vers le haut), la FC au repos telle quelle. Dispersion d'au moins 2 % (VFC) ou 2 bpm (FC), choix de
// pepfit : les mesures sont arrondies au ms ou au bpm, et sous ce plancher un arrondi déplacerait déjà le point (une FC très
// stable passerait au rouge pour 2 bpm).
//
// LE POINT DE LA NUIT : son écart z à ta normale, en dispersions, compté du côté favorable (VFC plus haute, FC plus basse) :
//   vert   z > 0,5          meilleur que d'habitude ;
//   bleu   −0,5 ≤ z ≤ 0,5   dans ta zone normale : un écart ne se lit qu'au-delà de la plus petite variation qui compte
//                           (« smallest worthwhile change ») [Buchheit 2014] ; Vesterinen et al. la fixent à ±0,5 écart-type
//                           de lnRMSSD autour de la référence pour placer les séances intenses [Vesterinen 2016] ;
//   orange −1 ≤ z < −0,5    un peu en dessous ;
//   rouge  z < −1           nettement en dessous : sous la référence moins un écart-type, Kiviniemi et al. prescrivent une
//                           séance légère ou du repos [Kiviniemi 2007].
// La phrase et la bande de la page suivent la même zone ; une hausse de la FC au repos de 5 bpm ou plus annonce souvent
// de la fatigue (phrase « hausse »).
//
// [Buchheit 2014]    Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol
//                    2014;5:73. doi:10.3389/fphys.2014.00073
// [Vesterinen 2016]  Vesterinen V, Nummela A, Heikura I et al. Individual endurance training prescription with heart rate
//                    variability. Med Sci Sports Exerc 2016;48(7):1347-1354. doi:10.1249/MSS.0000000000000910
// [Kiviniemi 2007]   Kiviniemi AM, Hautala AJ, Kinnunen H, Tulppo MP. Endurance training guided individually by daily heart
//                    rate variability measurements. Eur J Appl Physiol 2007;101(6):743-751. doi:10.1007/s00421-007-0552-2
import type { PointEtat } from "./corps-calc";
import type { NiveauPoint } from "./niveau-point";
import { decaler, minuit } from "./periodes";

export type CleCoeur = "vfc" | "fc";

export const JOURS_NORMALE = 30;
export const MIN_NUITS = 7;
/** Hausse de la FC au repos (bpm) au-dessus de ta normale qui annonce de la fatigue. */
export const HAUSSE_FC = 5;
/** Demi-largeur de ta zone normale et seuil du « nettement en dessous », en dispersions. */
export const SEUILS_POINT = { zone: 0.5, nettement: 1 } as const;
/** Écart absolu médian → écart-type (loi normale). */
const MAD_EN_ET = 1.4826;

export interface Normale {
  /** Médiane des nuits des 30 jours d'avant (ms ou bpm). */
  centre: number;
  /** Bornes de ta zone normale (± 0,5 dispersion), dans l'unité de la mesure. */
  bas: number;
  haut: number;
  /** Dispersion robuste (en logarithme pour la VFC). */
  dispersion: number;
  /** Nuits mesurées dans les 30 jours d'avant. */
  n: number;
}

const enLog = (cle: CleCoeur) => cle === "vfc";

function mediane(l: readonly number[]): number {
  const s = [...l].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Médiane et dispersion robuste (1,4826 × écart absolu médian, au moins `plancher`) d'une liste non vide. */
export function referenceRobuste(l: readonly number[], plancher: number): { centre: number; dispersion: number } {
  const centre = mediane(l);
  return { centre, dispersion: Math.max(plancher, MAD_EN_ET * mediane(l.map((x) => Math.abs(x - centre)))) };
}

/** Une valeur par nuit (minuit du jour du réveil → valeur) ; deux relevés le même jour : le plus récent. */
export function parNuit(releves: readonly { date: number; valeur: number }[]): Map<number, number> {
  const m = new Map<number, { date: number; v: number }>();
  for (const r of releves) {
    const j = minuit(r.date);
    const x = m.get(j);
    if (!x || r.date >= x.date) m.set(j, { date: r.date, v: r.valeur });
  }
  return new Map([...m].map(([j, x]) => [j, x.v]));
}

/** Nuits mesurées dans les 30 jours d'avant `jour` (le jour lui-même exclu). */
function avant(nuits: ReadonlyMap<number, number>, jour: number): number[] {
  const j = minuit(jour);
  const l: number[] = [];
  for (let i = 1; i <= JOURS_NORMALE; i++) {
    const v = nuits.get(decaler(j, -i));
    if (v != null) l.push(v);
  }
  return l;
}

/** Ta normale à un jour : médiane et dispersion robuste des nuits des 30 jours d'avant, zone ± 0,5 dispersion ; null sous
 * 7 nuits. */
export function normaleAu(cle: CleCoeur, nuits: ReadonlyMap<number, number>, jour: number): Normale | null {
  const l = avant(nuits, jour).filter((v) => v > 0);
  if (l.length < MIN_NUITS) return null;
  const log = enLog(cle);
  const r = referenceRobuste(log ? l.map(Math.log) : l, log ? Math.log(1.02) : 2);
  const vers = (x: number) => (log ? Math.exp(x) : x);
  return { centre: vers(r.centre), bas: vers(r.centre - SEUILS_POINT.zone * r.dispersion), haut: vers(r.centre + SEUILS_POINT.zone * r.dispersion), dispersion: r.dispersion, n: l.length };
}

/** Écart de la nuit à ta normale, en dispersions, compté du côté favorable (VFC plus haute, FC au repos plus basse). */
export function ecartFavorable(cle: CleCoeur, v: number, n: Normale): number {
  const z = enLog(cle) ? (Math.log(v) - Math.log(n.centre)) / n.dispersion : (v - n.centre) / n.dispersion;
  return cle === "vfc" ? z : -z;
}

/** Le point de la nuit : vert, bleu, orange, rouge selon l'écart à ta normale ; neutre sans valeur ou sous 7 nuits. */
export function niveauNuit(cle: CleCoeur, v: number | null, n: Normale | null): NiveauPoint {
  if (v == null || !(v > 0) || !n) return "neutre";
  const z = ecartFavorable(cle, v, n);
  if (z > SEUILS_POINT.zone) return "mieux";
  if (z >= -SEUILS_POINT.zone) return "normal";
  return z >= -SEUILS_POINT.nettement ? "bas" : "tresBas";
}

/** Nuits encore à mesurer avant d'avoir une normale à ce jour (0 si elle existe). */
export function nuitsManquantes(nuits: ReadonlyMap<number, number>, jour: number): number {
  return Math.max(0, MIN_NUITS - avant(nuits, jour).length);
}

/** Zone normale, jour par jour, sous la courbe d'une période. */
export function bandeSerie(cle: CleCoeur, pts: readonly PointEtat[], nuits: ReadonlyMap<number, number>): ({ bas: number; haut: number } | null)[] {
  return pts.map((p) => {
    const n = normaleAu(cle, nuits, p.jour);
    return n ? { bas: n.bas, haut: n.haut } : null;
  });
}

/** Écart relatif de la nuit à ta normale (−0,06 = 6 % dessous). */
export function ecartNormale(v: number, n: Normale): number {
  return n.centre ? v / n.centre - 1 : 0;
}

export type PhraseCoeur = "hausse" | "haut" | "normale" | "bas";

/** La phrase de la nuit : FC au repos 5 bpm au-dessus de ta normale = « hausse » ; sinon hors de la zone, dessus ou dessous. */
export function phraseCoeur(cle: CleCoeur, v: number, n: Normale): PhraseCoeur {
  if (cle === "fc" && v - n.centre >= HAUSSE_FC) return "hausse";
  if (v > n.haut) return "haut";
  if (v < n.bas) return "bas";
  return "normale";
}

/** Nuit « bonne » (point plein de l'agenda) : point vert ou bleu, dans ta zone normale ou mieux. */
export function nuitBonne(cle: CleCoeur, v: number, n: Normale | null): boolean {
  const x = niveauNuit(cle, v, n);
  return x === "mieux" || x === "normal";
}
