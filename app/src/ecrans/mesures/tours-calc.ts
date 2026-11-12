// Mensurations (planche mensurations, validée le 30/10) : l'ordre des tours (M1, de haut en bas, le cou en tête :
// M10), où chaque tour passe sur le personnage (l'homme des pictos ou la femme, planche mensurations-femme : D4, D8), la
// valeur proposée à la molette (M3 : la dernière, sinon un repère selon le sexe et la taille), les bornes de la molette, et
// la marche du parcours (M2 : rien n'est écrit avant « Enregistrer » ; M5 : récapitulatif). Pur (sans React Native) :
// tests/mensurations.test.ts.
import type { Sexe, TypeMensuration } from "../../db/depots/profil";

/** Un tour au mètre ruban (la taille, elle, est une hauteur : Profil). */
export type Tour = Exclude<TypeMensuration, "taille">;

/** Ordre du parcours et des listes : de haut en bas (M1), le cou en tête (M10). */
export const ORDRE_TOURS: readonly Tour[] = ["cou", "epaules", "poitrine", "bras", "tour_taille", "hanches", "cuisse", "mollet"];

/** Tours d'un seul côté : le droit (M11). */
export const COTE_DROIT: ReadonlySet<Tour> = new Set<Tour>(["bras", "cuisse", "mollet"]);

export const estTour = (s: string | undefined): s is Tour => (ORDRE_TOURS as readonly string[]).includes(s ?? "");

// ---- Le personnage (assets/images/mensurations) ----------------------------------------------------------------------
// Deux personnages (planche mensurations-femme, route Image, décision du 04/11) : l'homme des pictos (piste I,
// tiré de pictos/sources/personnage-ref.png) et la femme peinte dans la silhouette du modèle femme de Santé (b-face, b-dos).

export type Vue = "face" | "dos";
/** Le personnage dessiné : l'homme ou la femme (D4 : choisi par le sexe du profil, sinon par la personne). */
export type Perso = Sexe;

/** Taille des images en pixels (la femme : fichiers à 2×, coordonnées à 1×) : toutes les coordonnées ci-dessous s'y rapportent. */
export const FIGURES: Record<Perso, Record<Vue, { l: number; h: number }>> = {
  h: { face: { l: 349, h: 927 }, dos: { l: 362, h: 930 } },
  f: { face: { l: 420, h: 930 }, dos: { l: 420, h: 930 } },
};

/** Où le mètre passe : hauteur `y`, de `x0` à `x1`. */
export interface Anneau {
  y: number;
  x0: number;
  x1: number;
}

/** Cadrage d'une étape : la vue, l'anneau, le centre `cx`, la hauteur `vh` et la largeur `vw` à montrer (pixels de l'image). */
export interface Zone extends Anneau {
  vue: Vue;
  cx: number;
  vh: number;
  vw: number;
}

/**
 * Zones de chaque personnage. L'homme : celles de la planche (proto.js), le cou en plus ; hanches et mollet de dos (au plus
 * large des fesses, au plus gros). La femme : hauteurs posées sur des repères du dessin et largeurs lues sur l'image
 * (planches/mensurations-femme/images/zones-image.json, D8), hanches au plus saillant des fesses ; mêmes vues et mêmes
 * cadrages que l'homme, le centre glissant de l'anneau vers l'axe du corps comme chez lui (bras 0,47, cuisse 0,27, mollet 0,2).
 */
export const ZONES: Record<Perso, Record<Tour, Zone>> = {
  h: {
    cou: { vue: "face", y: 140, x0: 143, x1: 212, cx: 177, vh: 300, vw: 230 },
    epaules: { vue: "face", y: 205, x0: 47, x1: 306, cx: 175, vh: 430, vw: 340 },
    poitrine: { vue: "face", y: 268, x0: 80, x1: 270, cx: 175, vh: 400, vw: 300 },
    bras: { vue: "face", y: 300, x0: 28, x1: 86, cx: 112, vh: 330, vw: 220 },
    tour_taille: { vue: "face", y: 367, x0: 102, x1: 252, cx: 175, vh: 380, vw: 280 },
    hanches: { vue: "dos", y: 474, x0: 88, x1: 276, cx: 181, vh: 400, vw: 300 },
    cuisse: { vue: "face", y: 530, x0: 76, x1: 178, cx: 140, vh: 380, vw: 250 },
    mollet: { vue: "dos", y: 718, x0: 200, x1: 280, cx: 228, vh: 380, vw: 250 },
  },
  f: {
    cou: { vue: "face", y: 153, x0: 184, x1: 236, cx: 210, vh: 300, vw: 230 },
    epaules: { vue: "face", y: 236, x0: 92, x1: 328, cx: 210, vh: 430, vw: 340 },
    poitrine: { vue: "face", y: 266, x0: 133, x1: 286, cx: 210, vh: 400, vw: 300 },
    bras: { vue: "face", y: 280, x0: 88, x1: 132, cx: 157, vh: 330, vw: 220 },
    tour_taille: { vue: "face", y: 370, x0: 145, x1: 274, cx: 210, vh: 380, vw: 280 },
    hanches: { vue: "dos", y: 450, x0: 118, x1: 302, cx: 210, vh: 400, vw: 300 },
    cuisse: { vue: "face", y: 505, x0: 110, x1: 203, cx: 171, vh: 380, vw: 250 },
    mollet: { vue: "dos", y: 712, x0: 260, x1: 320, cx: 274, vh: 380, vw: 250 },
  },
};

/** Le tour de dos (feuille « Tour de dos et bonnet », D6) : sous la poitrine de la femme, sur la bande de la brassière, cadré comme la poitrine. */
export const SOUS_POITRINE: Zone = { vue: "face", y: 300, x0: 142, x1: 277, cx: 210, vh: 400, vw: 300 };

/** Ce que la carte peut cadrer : un tour, ou le tour de dos (toujours sur la femme). */
export type Repere = Tour | "sous_poitrine";
export const zoneDe = (p: Perso, r: Repere): Zone => (r === "sous_poitrine" ? SOUS_POITRINE : ZONES[p][r]);
/** Le personnage d'un repère : le tour de dos ne se montre que sur la femme. */
export const persoDe = (p: Perso, r: Repere): Perso => (r === "sous_poitrine" ? "f" : p);

/** Hanches et mollet de face (récapitulatif), le mollet droit à gauche. */
const DE_FACE: Record<Perso, Partial<Record<Tour, Anneau>>> = {
  h: { hanches: { y: 446, x0: 89, x1: 263 }, mollet: { y: 722, x0: 76, x1: 156 } },
  f: { hanches: { y: 450, x0: 119, x1: 300 }, mollet: { y: 712, x0: 100, x1: 160 } },
};

/** Où chaque tour passe sur la vue de face (récapitulatif) : hanches et mollet y sont aussi. */
export function anneauDeFace(p: Perso, t: Tour): Anneau {
  return DE_FACE[p][t] ?? ZONES[p][t];
}

/**
 * Le personnage montré (D4) : celui du sexe du profil ; « Non précisé » : celui que la personne a choisi dans la carte,
 * l'homme tant qu'elle n'a rien choisi. Le choix est une préférence de ce téléphone, il ne touche pas au profil.
 */
export const personnage = (sexe: Sexe | null, choix: Perso | null): Perso => sexe ?? choix ?? "h";

/**
 * Consigne et libellé « Où poser le mètre » (D7) : cou et poitrine réécrits pour une femme et pour « Non précisé » (la
 * poitrine en version neutre, le cou comme la femme) ; les six autres sont les mêmes pour tous. Selon le profil, pas selon
 * le personnage choisi.
 */
export function variante(t: Tour, sexe: Sexe | null): Tour | "cou.f" | "poitrine.f" | "poitrine.x" {
  if (sexe === "h") return t;
  if (t === "cou") return "cou.f";
  if (t === "poitrine") return sexe === "f" ? "poitrine.f" : "poitrine.x";
  return t;
}
export const cleConsigne = (t: Tour, sexe: Sexe | null) => `mensurations.consigne.${variante(t, sexe)}` as const;
export const cleOu = (t: Tour, sexe: Sexe | null) => `mensurations.ou.${variante(t, sexe)}` as const;

/** Étiquettes du récapitulatif : membres et cou à gauche (le côté droit du corps, vu de face), le tronc à droite. */
export const A_GAUCHE: ReadonlySet<Tour> = new Set<Tour>(["cou", "bras", "cuisse", "mollet"]);

/** Cadrage d'une zone de `p` dans une carte `l` × `h` : échelle et translation (le haut de l'image reste dans la carte). */
export function cadrage(z: Zone, l: number, h: number, p: Perso): { s: number; tx: number; ty: number } {
  const s = Math.min(h / z.vh, l / z.vw);
  const fig = FIGURES[p][z.vue];
  const ty = Math.min(8, Math.max(h - fig.h * s - 4, h / 2 - z.y * s));
  return { s, tx: l / 2 - z.cx * s, ty };
}

/** Le personnage entier dans une carte `l` × `h` (récapitulatif), 18 de marge en haut et en bas. */
export function cadrageEntier(l: number, h: number, p: Perso): { s: number; tx: number; ty: number } {
  const s = (h - 36) / FIGURES[p].face.h;
  return { s, tx: (l - FIGURES[p].face.l * s) / 2, ty: 18 };
}

// ---- Valeur proposée (M3) ---------------------------------------------------------------------------------------------

/**
 * Repères de départ de la molette (cm), homme / femme à la taille de référence : ordres de grandeur d'adultes actifs,
 * affichés comme « repère », jamais enregistrés sans geste (M4). À affiner sur une table publiée (ANSUR II, NHANES).
 */
export const REPERES: Record<Tour, { h: number; f: number }> = {
  cou: { h: 39, f: 33 },
  epaules: { h: 120, f: 104 },
  poitrine: { h: 102, f: 92 },
  bras: { h: 32, f: 28 },
  tour_taille: { h: 88, f: 78 },
  hanches: { h: 100, f: 100 },
  cuisse: { h: 58, f: 58 },
  mollet: { h: 38, f: 36.5 },
};
export const TAILLE_REF: Record<Sexe, number> = { h: 176, f: 163 };

/** Bornes de la molette (cm). */
export const BORNES: Record<Tour, readonly [number, number]> = {
  cou: [20, 70],
  epaules: [60, 200],
  poitrine: [50, 200],
  bras: [15, 70],
  tour_taille: [40, 200],
  hanches: [50, 200],
  cuisse: [30, 110],
  mollet: [20, 70],
};

const demi = (v: number) => Math.round(v * 2) / 2;

/** Ramène une valeur dans les bornes du tour, au demi-centimètre. */
export function borner(t: Tour, v: number): number {
  const [a, b] = BORNES[t];
  return Math.min(b, Math.max(a, demi(v)));
}

/** Les valeurs de la molette, au pas de 0,5. */
export function valeursRoue(t: Tour): number[] {
  const [a, b] = BORNES[t];
  return Array.from({ length: Math.round((b - a) * 2) + 1 }, (_, i) => a + i / 2);
}

/**
 * Repère d'un tour : valeur de référence × √(taille ÷ taille de référence), au demi-centimètre. Sans sexe : la moyenne des
 * repères homme et femme (et des tailles de référence) ; sans taille : celle de référence.
 */
export function repere(t: Tour, sexe: Sexe | null, tailleCm: number | null): number {
  const base = sexe ? REPERES[t][sexe] : (REPERES[t].h + REPERES[t].f) / 2;
  const ref = sexe ? TAILLE_REF[sexe] : (TAILLE_REF.h + TAILLE_REF.f) / 2;
  const taille = tailleCm != null && tailleCm >= 100 && tailleCm <= 250 ? tailleCm : ref;
  return borner(t, base * Math.sqrt(taille / ref));
}

export type ValeurProposee = { v: number; source: "derniere" } | { v: number; source: "repere"; taille: number };

/** Valeur de départ de la molette : la dernière de la personne, sinon le repère (et la taille qu'il suppose). */
export function valeurProposee(t: Tour, derniere: number | null, sexe: Sexe | null, tailleCm: number | null): ValeurProposee {
  if (derniere != null) return { v: borner(t, derniere), source: "derniere" };
  const ref = sexe ? TAILLE_REF[sexe] : Math.round((TAILLE_REF.h + TAILLE_REF.f) / 2);
  const taille = tailleCm != null && tailleCm >= 100 && tailleCm <= 250 ? Math.round(tailleCm) : ref;
  return { v: repere(t, sexe, tailleCm), source: "repere", taille };
}

// ---- Le parcours (M2, M5) ---------------------------------------------------------------------------------------------

export interface EtatParcours {
  /** Les tours du parcours : tous (ORDRE_TOURS), ou les seuls tours demandés par un bilan de coach (D24), dans cet ordre. */
  ordre: readonly Tour[];
  /** Étape affichée (rang dans `ordre`). */
  i: number;
  /** Tours pris (rien n'est en base avant « Enregistrer »). */
  valeurs: Partial<Record<Tour, number>>;
  /** Bilan : les tours déjà pris pour lui, montrés dans la frise ; ils ne repartent en base que corrigés. */
  deja: Partial<Record<Tour, number>>;
  passes: readonly Tour[];
  /** Correction depuis la frise : l'étape où l'on reprend après « Valider » ou « Annuler ». */
  reprise: number | null;
  recap: boolean;
  /** Correction depuis le récapitulatif : on y revient. */
  depuisRecap: boolean;
}

export const DEPART: EtatParcours = { ordre: ORDRE_TOURS, i: 0, valeurs: {}, deja: {}, passes: [], reprise: null, recap: false, depuisRecap: false };

/**
 * Départ sur quelques tours (bilan de forme, A3) : remis dans l'ordre du parcours, ceux déjà pris pour le bilan (`deja`)
 * dans la frise, le premier qui reste à l'écran ; aucun tour connu : tout le parcours.
 */
export function departSur(tours: readonly string[] | null | undefined, deja: Partial<Record<string, number>> = {}): EtatParcours {
  const ordre = ORDRE_TOURS.filter((t) => tours?.includes(t));
  if (!ordre.length) return DEPART;
  const d: Partial<Record<Tour, number>> = {};
  for (const t of ordre) if (deja[t] != null && deja[t]! > 0) d[t] = deja[t];
  return { ...DEPART, ordre, valeurs: { ...d }, deja: d, i: Math.max(0, ordre.findIndex((t) => d[t] == null)) };
}

export type ActionParcours =
  | { type: "suivant"; v: number }
  | { type: "passer" }
  | { type: "valider"; v: number }
  | { type: "annuler" }
  | { type: "aller"; k: number }
  | { type: "corriger"; k: number }
  | { type: "quitterRecap" };

const fait = (e: EtatParcours, t: Tour) => e.valeurs[t] != null || e.passes.includes(t);

/** Prochaine étape à faire après `k` (ni prise ni passée), vers le bas ; null : le récapitulatif. */
export function prochaine(e: EtatParcours, k: number): number | null {
  for (let j = k + 1; j < e.ordre.length; j++) if (!fait(e, e.ordre[j]!)) return j;
  return null;
}

/** En correction (depuis la frise ou le récapitulatif) : Annuler / Valider au lieu de Passer / Suivant. */
export const enCorrection = (e: EtatParcours) => e.reprise != null || e.depuisRecap;

function avancer(e: EtatParcours): EtatParcours {
  if (e.depuisRecap) return { ...e, recap: true, depuisRecap: false, reprise: null };
  const n = prochaine(e, e.i);
  return n == null ? { ...e, recap: true } : { ...e, i: n };
}

export function parcours(e: EtatParcours, a: ActionParcours): EtatParcours {
  const t = e.ordre[e.i]!;
  switch (a.type) {
    case "suivant":
    case "valider": {
      const p: EtatParcours = { ...e, valeurs: { ...e.valeurs, [t]: a.v }, passes: e.passes.filter((x) => x !== t) };
      if (a.type === "valider" && !p.depuisRecap && p.reprise != null) return { ...p, i: p.reprise, reprise: null };
      return avancer(p);
    }
    case "passer":
      return avancer({ ...e, passes: e.passes.includes(t) ? e.passes : [...e.passes, t] });
    case "annuler":
      if (e.depuisRecap) return { ...e, recap: true, depuisRecap: false };
      return e.reprise != null ? { ...e, i: e.reprise, reprise: null } : e;
    case "aller": {
      if (a.k === e.i || a.k < 0 || a.k >= e.ordre.length) return e;
      // une étape déjà prise se corrige et l'on revient où l'on en était ; une autre (à faire, passée) se prend à la suite
      const corrige = e.valeurs[e.ordre[a.k]!] != null;
      return { ...e, i: a.k, reprise: corrige ? (e.reprise ?? e.i) : null };
    }
    case "corriger":
      return { ...e, recap: false, depuisRecap: true, reprise: null, i: a.k };
    case "quitterRecap":
      return { ...e, recap: false, depuisRecap: false, reprise: null, i: e.ordre.length - 1 };
  }
}

/** Les tours pris, dans l'ordre du parcours (ce qu'« Enregistrer » écrit). */
export function toursPris(e: EtatParcours): { type: Tour; valeur: number }[] {
  return e.ordre.filter((t) => e.valeurs[t] != null && e.valeurs[t] !== e.deja[t]).map((t) => ({ type: t, valeur: e.valeurs[t]! }));
}

/** Les tours ni pris ni passés au bout du parcours comptent comme passés. */
export function toursPasses(e: EtatParcours): Tour[] {
  return e.ordre.filter((t) => e.valeurs[t] == null);
}
