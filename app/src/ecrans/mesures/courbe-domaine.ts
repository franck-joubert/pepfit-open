// Domaine d'une courbe « état » (CourbeEtat.tsx) et passage d'une période à l'autre (bug du 30/10 sur le Fold : courbes
// figées, écrasées, la fin de la moyenne lissée à 75 pour une pesée à 78). Le domaine, c'est la durée affichée (jours, ancrée
// à droite sur le dernier jour) et les bornes des valeurs ; il passe de l'ancien au nouveau sur le fil UI. Ici, le pur :
//   - le domaine d'une période (durée, bornes et repères de l'axe) ;
//   - la série dessinée pendant le passage : les jours de l'ancienne période restent là le temps de sortir à gauche (même
//     après des changements rapides : on garde la plus longue des deux tant que le passage n'est pas fini) ;
//   - les couches d'étiquettes : celles qui restent, celles qui sortent (fondu), celles qui entrent ;
//   - une génération par passage : seul le dernier passage, une fois fini, rend la série à la seule période affichée.
// Sans React Native : tests/courbe-domaine.test.ts.
import { axeEtat, type PointEtat } from "./corps-calc";

/** Bande de ta normale un jour (VFC, FC au repos), null sans normale. */
export type BandeJour = { bas: number; haut: number } | null;

export interface DomaineEtat {
  /** Durée affichée, en jours : celle de la période. */
  duree: number;
  lo: number;
  hi: number;
  pas: number;
  reperes: number[];
  /** Décimales des repères de l'axe (une sous un pas de 1). */
  dec: number;
}

/** Domaine d'une période : toute sa durée, les bornes de ses relevés, de sa moyenne lissée et de sa bande. */
export function domaineEtat(pts: readonly PointEtat[], bande: readonly BandeJour[] | null = null): DomaineEtat {
  const vals: number[] = [];
  for (const p of pts) {
    if (p.v != null) vals.push(p.v);
    if (p.l != null) vals.push(p.l);
  }
  for (const b of bande ?? []) if (b) vals.push(b.bas, b.haut);
  const a = axeEtat(vals.length ? vals : [0]);
  return { duree: Math.max(1, pts.length), lo: a.lo, hi: a.hi, pas: a.pas, reperes: a.reperes, dec: a.pas < 1 ? 1 : 0 };
}

/** Rayon des pastilles selon la durée de la période (plus fines quand les jours se serrent). */
export function rayonPastille(n: number): number {
  return n > 120 ? 1.6 : n > 40 ? 2.2 : 3;
}

/** Ce qui se dessine : des jours consécutifs (le dernier à droite) et leur bande, alignée. */
export interface TraceEtat {
  pts: readonly PointEtat[];
  bande: readonly BandeJour[] | null;
}

const dernierJour = (t: TraceEtat): number | null => t.pts[t.pts.length - 1]?.jour ?? null;

/**
 * Série dessinée pendant le passage de `avant` (ce qui est dessiné) à `apres` (la nouvelle période) : si les deux finissent
 * le même jour et que `avant` est plus longue, ses jours en plus (les plus anciens) restent devant ceux de `apres`, le temps de
 * sortir à gauche ; sinon `apres` seule (les jours en plus de `apres` entrent par la gauche). Les jours communs viennent
 * toujours de `apres` (la donnée la plus récente).
 */
export function joindre(avant: TraceEtat | null, apres: TraceEtat): TraceEtat {
  if (!avant || !apres.pts.length) return apres;
  const S = avant.pts.length - apres.pts.length;
  if (S <= 0 || dernierJour(avant) !== dernierJour(apres)) return apres;
  const bandeAvant = avant.bande ?? avant.pts.map(() => null);
  return {
    pts: [...avant.pts.slice(0, S), ...apres.pts],
    bande: apres.bande ? [...bandeAvant.slice(0, S), ...apres.bande] : null,
  };
}

/** Même dernier jour : le passage peut s'animer (échelle ancrée à droite) ; sinon il se pose d'emblée (la piste fait glisser). */
export function memeFin(avant: TraceEtat | null, apres: TraceEtat): boolean {
  return !!avant && avant.pts.length > 0 && dernierJour(avant) === dernierJour(apres);
}

/** Empreinte du contenu (jours, relevés, moyenne, saisies, bande) : un changement de données relance le passage. */
export function empreinte(t: TraceEtat): string {
  let h = 0;
  const mel = (x: number) => {
    h = (Math.imul(h, 31) + (Number.isFinite(x) ? Math.round(x * 1000) : -7)) | 0;
  };
  t.pts.forEach((p, i) => {
    mel(p.v ?? NaN);
    mel(p.l ?? NaN);
    mel(p.releve?.manuel ? 1 : 0);
    const b = t.bande?.[i];
    if (b) {
      mel(b.bas);
      mel(b.haut);
    }
  });
  return `${t.pts.length}:${t.pts[0]?.jour ?? 0}:${dernierJour(t) ?? 0}:${t.bande ? 1 : 0}:${h}`;
}

/** Une étiquette d'axe ou de date : sa position dans le domaine (valeur, ou jours avant le dernier), son texte. */
export interface EtiquetteCourbe {
  /** Valeur (axe) ou jours avant le dernier jour (dates). */
  pos: number;
  texte: string;
  ancre: "start" | "middle" | "end";
  fort: boolean;
}

export type Role = "garde" | "sort" | "entre";

/**
 * Couches d'étiquettes du passage : celles des deux côtés restent, les autres sortent (anciennes, si `sortent`) ou entrent
 * (nouvelles : invisibles tant que le fil UI n'a pas commencé leur passage, aucune image d'avance au mauvais endroit).
 */
export function couches(avant: readonly EtiquetteCourbe[] | null, apres: readonly EtiquetteCourbe[], sortent = true): { e: EtiquetteCourbe; role: Role }[] {
  const cle = (e: EtiquetteCourbe) => `${e.pos}|${e.texte}`;
  if (!avant) return apres.map((e) => ({ e, role: "garde" as const }));
  const deja = new Set(avant.map(cle));
  const reste = new Set(apres.map(cle));
  return [
    ...(sortent ? avant.filter((e) => !reste.has(cle(e))).map((e) => ({ e, role: "sort" as const })) : []),
    ...apres.map((e) => ({ e, role: deja.has(cle(e)) ? ("garde" as const) : ("entre" as const) })),
  ];
}

/** Repères de l'axe des valeurs : la valeur, son texte. */
export function etiquettesAxe(d: DomaineEtat, fixe: (v: number, dec: number) => string): EtiquetteCourbe[] {
  return d.reperes.map((v) => ({ pos: v, texte: fixe(v, d.dec), ancre: "start" as const, fort: false }));
}

/** Dates sous la courbe : `[indice, texte]` d'une période de `n` jours → jours avant le dernier, ancre, « auj. » en fort. */
export function etiquettesDates(etiquettes: readonly (readonly [number, string])[], n: number): EtiquetteCourbe[] {
  return etiquettes.map(([i, texte]) => ({
    pos: n - 1 - i,
    texte,
    ancre: i === 0 ? ("start" as const) : i === n - 1 ? ("end" as const) : ("middle" as const),
    fort: i === n - 1,
  }));
}

/** Opacité d'une étiquette selon son rôle, à l'avancée `t` (0 → 1) du passage. */
export function opaciteRole(role: Role, t: number): number {
  "worklet";
  return role === "garde" ? 1 : role === "sort" ? 1 - t : t;
}

/** Fondu au bord : 1 dans [min, max], puis 0 à `fondu` px au-delà (une étiquette ou un repère qui sort du cadre s'efface). */
export function dansCadre(p: number, min: number, max: number, fondu: number): number {
  "worklet";
  const hors = p < min ? min - p : p > max ? p - max : 0;
  return Math.max(0, Math.min(1, 1 - hors / Math.max(1e-6, fondu)));
}

/** Ordonnée d'une valeur entre `lo` (en `base`) et `hi` (en `haut`). */
export function yValeur(v: number, lo: number, hi: number, base: number, haut: number): number {
  "worklet";
  return base - ((v - lo) / Math.max(1e-6, hi - lo)) * (base - haut);
}

// ---- Passage d'une période à l'autre -------------------------------------------------------------------------------------

/** Ce que la courbe montre : la période (cible), la série dessinée, les étiquettes qui sortent, le numéro du passage. */
export interface EtatCourbe {
  gen: number;
  cle: string;
  /** Période, données et textes des étiquettes : ce qui, changé, relance un passage. */
  signature: string;
  periode: TraceEtat;
  domaine: DomaineEtat;
  /** Série dessinée : la période, plus les jours de la précédente qui sortent à gauche tant que le passage dure. */
  trace: TraceEtat;
  axe: EtiquetteCourbe[];
  dates: EtiquetteCourbe[];
  /** Étiquettes d'avant, jusqu'à la fin du passage (null : aucun passage en cours) ; elles ne sortent en fondu que s'il s'anime. */
  avant: { axe: EtiquetteCourbe[]; dates: EtiquetteCourbe[] } | null;
  /** Le passage s'anime (même dernier jour, mouvement non réduit) ; sinon tout se pose d'emblée. */
  anime: boolean;
  /** Autre période (pas seulement d'autres données) : en mouvement réduit, la courbe arrive en fondu. */
  autrePeriode: boolean;
}

export interface Cible {
  cle: string;
  periode: TraceEtat;
  axe: EtiquetteCourbe[];
  dates: EtiquetteCourbe[];
}

export function signature(c: Cible): string {
  const textes = (l: readonly EtiquetteCourbe[]) => l.map((e) => `${e.pos}=${e.texte}`).join(",");
  return `${c.cle}#${empreinte(c.periode)}#${textes(c.axe)}#${textes(c.dates)}`;
}

export function etatInitial(c: Cible): EtatCourbe {
  return {
    gen: 0,
    cle: c.cle,
    signature: signature(c),
    periode: c.periode,
    domaine: domaineEtat(c.periode.pts, c.periode.bande),
    trace: c.periode,
    axe: c.axe,
    dates: c.dates,
    avant: null,
    anime: false,
    autrePeriode: false,
  };
}

/** La cible a-t-elle changé (période, données ou textes des étiquettes) ? */
export function aChange(e: EtatCourbe, c: Cible): boolean {
  return e.signature !== signature(c);
}

/**
 * Nouveau passage vers `c` : génération suivante, domaine cible, série jointe à ce qui est dessiné (`e.trace`, qui garde
 * encore les jours d'un passage interrompu), étiquettes d'avant en sortie. Mouvement réduit ou autre dernier jour : tout se
 * pose (série de la seule cible, aucune étiquette ne sort).
 */
export function changer(e: EtatCourbe, c: Cible, reduit: boolean): EtatCourbe {
  const anime = !reduit && memeFin(e.trace, c.periode);
  return {
    gen: e.gen + 1,
    cle: c.cle,
    signature: signature(c),
    periode: c.periode,
    domaine: domaineEtat(c.periode.pts, c.periode.bande),
    trace: anime ? joindre(e.trace, c.periode) : c.periode,
    axe: c.axe,
    dates: c.dates,
    avant: { axe: e.axe, dates: e.dates },
    anime,
    autrePeriode: e.cle !== c.cle,
  };
}

/** Fin du passage `gen` : s'il est toujours le dernier, la série se réduit à la période et les étiquettes d'avant partent. */
export function terminer(e: EtatCourbe, gen: number): EtatCourbe {
  if (gen !== e.gen || (e.trace === e.periode && !e.avant)) return e;
  return { ...e, trace: e.periode, avant: null };
}

/** Série prête pour le fil UI : relevés, moyenne, saisies (1/0), bande basse et haute ; NaN pour « rien ». */
export interface TraceUI {
  V: number[];
  L: number[];
  M: number[];
  B: number[];
  Hb: number[];
}

export function versUI(t: TraceEtat): TraceUI {
  const V: number[] = [], L: number[] = [], M: number[] = [], B: number[] = [], Hb: number[] = [];
  t.pts.forEach((p, i) => {
    V.push(p.v ?? NaN);
    L.push(p.l ?? NaN);
    M.push(p.releve?.manuel ? 1 : 0);
    if (t.bande) {
      B.push(t.bande[i]?.bas ?? NaN);
      Hb.push(t.bande[i]?.haut ?? NaN);
    }
  });
  return { V, L, M, B, Hb };
}
