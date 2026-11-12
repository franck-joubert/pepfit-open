// L'activité de la journée hors séances (31/10 : « une journée sans séance mais avec des pas doit donner de
// l'effort ; 20 000 pas ou 2 000 pas, ce n'est pas le même niveau »). Pur (sans React Native ni base) : testé par
// tests/effort-activite.test.ts. Les lectures (pas, FC, séances) sont dans effort-activite-donnees.ts ; la justification des
// constantes dans docs/EFFORT-ACTIVITE.md.
//
// Même unité que les séances (des points), donc même courbe : l'Effort du jour = score(séances + activité), les charges
// s'ajoutent (D5). Jamais de double compte : les minutes et les pas des séances notées sont retirés avant.
// 1. FC de la journée (Whoop ou Santé Connect, échantillons) qui couvre assez le temps hors séances : TRIMP d'Edwards, au même
//    barème que les séances (zone 2 = 2… zone 5 = 5), mais au-dessus de la zone 1 seulement. La zone 1 de la vie courante
//    (debout, escaliers, chaleur, café) ferait d'une journée de bureau une séance : elle ne compte pas hors séance.
// 2. Sinon les pas hors séances : 4,8 points pour 1 000 pas, multipliés par un coefficient de cadence quand on a le détail
//    heure par heure (pas par minute de la tranche) : 1 jusqu'à 60 pas/min, 2 à 100 pas/min (une heure de marche soutenue vaut
//    alors une heure en zone 1 d'Edwards), 3,5 à 160 pas/min (la course facile) et au-delà.
// 3. Sinon rien : pas de donnée, pas d'activité (jamais d'estimation sans mesure). Version 3 (08/11) : avec le seul total du jour
//    (Whoop), une séance dont les pas ne sont pas mesurés rend le hors séances inconnu, plus de prorata sur 960 min (un padel de
//    98 min comptait 962 pas pour 6 000 vrais : « 8 467 pas hors séances » sur 9 429).
import { bornesDe, type RefZones } from "./zones-fc";

export const CHARGE_ACTIVITE = {
  /** Changer un paramètre change la version : chaque journée est recalculée au passage suivant. */
  version: 3,
  /** Points pour un pas, en marche ordinaire : 10 000 pas font 48 points (2,1), 20 000 en font 96 (3,8). */
  parPas: 0.0048,
  /** Coefficient de la cadence (pas par minute → coefficient), linéaire entre les points, plat au-delà. */
  cadence: [
    [60, 1],
    [100, 2],
    [160, 3.5],
  ] as readonly (readonly [number, number])[],
  /** Poids des zones 1 à 5 hors séance : la zone 1 ne compte pas, les autres comme en séance. */
  zones: [0, 2, 3, 4, 5],
  /** Un échantillon de FC couvre au plus 10 min (une montre en relevé passif mesure toutes les 10 min environ). */
  trouFcS: 600,
  /** Part du temps hors séances que la FC doit couvrir pour passer avant les pas. */
  couvertureFc: 0.6,
} as const;

/** Une plage de temps (ms). */
export interface Plage {
  debut: number;
  fin: number;
}

/** Le coefficient d'une cadence (pas par minute). */
export function coefCadence(ppm: number): number {
  const c = CHARGE_ACTIVITE.cadence;
  if (!(ppm > c[0]![0])) return c[0]![1];
  for (let i = 1; i < c.length; i++) {
    const [x1, y1] = c[i]!;
    if (ppm <= x1) {
      const [x0, y0] = c[i - 1]!;
      return y0 + ((ppm - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return c[c.length - 1]![1];
}

/** Charge des pas, au total seulement (sans le détail par heure). */
export const chargePasTotal = (pas: number): number => Math.max(0, pas) * CHARGE_ACTIVITE.parPas;

/** Charge des pas tranche par tranche (une heure, ou un bout d'heure autour d'une séance) : chaque tranche à sa cadence. */
export function chargePasTranches(tranches: readonly { minutes: number; pas: number }[]): number {
  return tranches.reduce((t, x) => (x.pas > 0 && x.minutes > 0 ? t + x.pas * CHARGE_ACTIVITE.parPas * coefCadence(x.pas / x.minutes) : t), 0);
}

/** Charge de la FC hors séance : minutes de Z1 à Z5 × 0, 2, 3, 4, 5. */
export function chargeFcJour(zones: readonly number[]): number {
  return CHARGE_ACTIVITE.zones.reduce((t: number, poids, k) => t + Math.max(0, zones[k] ?? 0) * poids, 0);
}

const dans = (t: number, plages: readonly Plage[]) => plages.some((p) => t >= p.debut && t < p.fin);

/** Minutes de [debut, fin[ hors des plages données. */
export function minutesHors(debut: number, fin: number, plages: readonly Plage[]): number {
  let ms = Math.max(0, fin - debut);
  // plages fusionnées, coupées à [debut, fin[
  const l = plages
    .map((p) => ({ debut: Math.max(debut, p.debut), fin: Math.min(fin, p.fin) }))
    .filter((p) => p.fin > p.debut)
    .sort((a, b) => a.debut - b.debut);
  let bout = -Infinity;
  for (const p of l) {
    const d = Math.max(p.debut, bout);
    if (p.fin > d) ms -= p.fin - d;
    bout = Math.max(bout, p.fin);
  }
  return ms / 60_000;
}

/**
 * Minutes de Z1 à Z5 de la FC hors séances, et le temps qu'elle couvre (min). Un échantillon couvre le temps jusqu'au suivant,
 * au plus `trouFcS` ; les échantillons pris pendant une séance ne comptent pas (ils sont dans la charge de la séance).
 */
export function zonesHorsSeances(
  fc: readonly { t: number; bpm: number }[],
  periode: Plage,
  seances: readonly Plage[],
  ref: RefZones,
): { zones: number[]; couvertes: number } {
  const b = bornesDe(ref);
  const zones = [0, 0, 0, 0, 0];
  let couvertes = 0;
  const l = fc.filter((x) => x.t >= periode.debut && x.t < periode.fin && x.bpm >= 25 && x.bpm <= 250);
  for (let i = 0; i < l.length; i++) {
    const e = l[i]!;
    if (dans(e.t, seances)) continue;
    const suivant = l[i + 1]?.t ?? periode.fin;
    const fin = Math.min(suivant, e.t + CHARGE_ACTIVITE.trouFcS * 1000, periode.fin);
    // le temps couvert s'arrête au début d'une séance
    const coupe = seances.filter((p) => p.debut > e.t && p.debut < fin).reduce((m, p) => Math.min(m, p.debut), fin);
    const min = Math.max(0, coupe - e.t) / 60_000;
    couvertes += min;
    let z = -1;
    for (let k = 4; k >= 0; k--) if (e.bpm >= b[k]!) { z = k; break; }
    if (z >= 0) zones[z] = zones[z]! + min;
  }
  return { zones, couvertes };
}

/** Pas de chaque tranche [bornes[i], bornes[i+1][ : null sans donnée. */
export interface TranchesPas {
  bornes: readonly number[];
  pas: readonly (number | null)[];
}

/** Les tranches hors séances (une tranche entièrement dans une séance est retirée) ; null si aucune n'a de donnée. */
export function tranchesHorsSeances(t: TranchesPas, seances: readonly Plage[]): { minutes: number; pas: number }[] | null {
  const out: { minutes: number; pas: number }[] = [];
  let vu = false;
  for (let i = 0; i + 1 < t.bornes.length; i++) {
    const p = t.pas[i];
    if (p == null) continue;
    vu = true;
    const debut = t.bornes[i]!;
    const fin = t.bornes[i + 1]!;
    // les bornes des séances font partie des bornes : une tranche est dedans ou dehors, jamais à cheval
    if (dans((debut + fin) / 2, seances)) continue;
    out.push({ minutes: (fin - debut) / 60_000, pas: p });
  }
  return vu ? out : null;
}

/** Les bornes d'une lecture des pas : chaque heure de la période, plus le début et la fin de chaque séance. */
export function bornesTranches(heures: readonly number[], seances: readonly Plage[]): number[] {
  const debut = heures[0]!;
  const fin = heures[heures.length - 1]!;
  const s = new Set(heures);
  for (const p of seances) {
    if (p.debut > debut && p.debut < fin) s.add(p.debut);
    if (p.fin > debut && p.fin < fin) s.add(p.fin);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Pas hors séances quand on n'a que le total du jour : les pas mesurés de chaque séance sont retirés. Une séance sans pas mesurés
 * (Whoop n'écrit qu'un total par jour, jamais le détail) rend le hors séances inconnu : null, jamais un prorata.
 */
export function pasHorsSeancesTotal(pasJour: number, seances: readonly { pas: number | null }[]): number | null {
  let reste = pasJour;
  for (const s of seances) {
    if (s.pas == null) return null;
    reste -= s.pas;
  }
  return Math.max(0, Math.round(reste));
}

export type MethodeActivite = "fc" | "pas";

export interface ChargeActivite {
  charge: number;
  methode: MethodeActivite;
  /** Pas hors séances, quand on les connaît (affichés même si la FC a servi). */
  pas: number | null;
  /** Les pas ont été comptés heure par heure (cadence), sinon au total. */
  heures: boolean;
  /** Minutes de Z1 à Z5 hors séances (méthode « fc »). */
  zones?: number[];
  /**
   * Rang de la mesure, pour la synchro : 2 la FC, 1 les pas heure par heure, 0 le total. Une journée mesurée plus finement
   * n'est jamais remplacée par une mesure plus grossière (sync/schema.ts).
   */
  rang: number;
}

export interface MesureActivite {
  /** FC hors séances (zonesHorsSeances), null sans FC. */
  fc: { zones: number[]; couvertes: number } | null;
  /** Minutes de la période hors séances (la FC doit en couvrir CHARGE_ACTIVITE.couvertureFc). */
  minutesHors: number;
  /** Pas hors séances tranche par tranche, null sans le détail. */
  tranches: { minutes: number; pas: number }[] | null;
  /** Pas hors séances au total (déjà sans les séances), null sans pas. */
  pasTotal: number | null;
}

/** La charge d'activité d'une journée : la FC si elle couvre assez la journée, sinon les pas ; null sans rien. */
export function chargeActivite(m: MesureActivite): ChargeActivite | null {
  const pasTranches = m.tranches ? m.tranches.reduce((a, x) => a + x.pas, 0) : null;
  const pas = pasTranches ?? m.pasTotal;
  if (m.fc && m.minutesHors > 0 && m.fc.couvertes >= CHARGE_ACTIVITE.couvertureFc * m.minutesHors) {
    const charge = chargeFcJour(m.fc.zones);
    // Une journée tout en zone 1 (la FC hors séance ne compte pas la vie courante) donne 0 : les pas, eux, comptent quand même
    // (01/11 : 1 623 pas ne sont pas rien). Dès que la FC donne quelque chose, elle prime sur les pas.
    if (charge > 0) return { charge, methode: "fc", pas, heures: pasTranches != null, zones: [...m.fc.zones], rang: 2 };
  }
  if (m.tranches && pasTranches! > 0) return { charge: chargePasTranches(m.tranches), methode: "pas", pas: pasTranches, heures: true, rang: 1 };
  if (m.pasTotal != null && m.pasTotal > 0) return { charge: chargePasTotal(m.pasTotal), methode: "pas", pas: m.pasTotal, heures: false, rang: 0 };
  return null;
}
