// Aura commune aux quatre parties, sans React Native (testée dans tests/aura.test.ts). Fonctions « worklet » : elles
// tournent sur le thread UI, à chaque image. Valeurs de la planche validée (planches/fond-anime/NOTES.md).

import { degrades, type Partie } from "../theme/effets";
import type { ModeCouleur } from "../theme/jetons";
import { rvbDe } from "./vague-menu";
import { PAGES_PARTAGEES, type PagePartagee } from "./pages-partagees";

/** Les trois nappes : centre (fractions de la largeur et de HAUTEUR_AURA) et rayon (fraction de la largeur × 1,55). */
export const NAPPES: Record<Partie, readonly (readonly [number, number, number])[]> = {
  accueil: [[0.2, 0.1, 0.62], [0.88, 0.26, 0.58], [0.56, -0.02, 0.5]],
  entrainement: [[0.82, 0.1, 0.62], [0.16, 0.3, 0.56], [0.5, 0.16, 0.5]],
  nutrition: [[0.28, 0.2, 0.62], [0.92, 0.08, 0.56], [0.62, 0.34, 0.52]],
  sante: [[0.5, 0.2, 0.64], [0.12, 0.1, 0.56], [0.9, 0.32, 0.58]],
  // Fil (planche fil, NAPPES_FIL) : claire en haut à droite, médiane à gauche, foncée (la cerise) plus bas au centre.
  fil: [[0.8, 0.06, 0.6], [0.22, 0.16, 0.58], [0.62, 0.34, 0.5]],
};
/** Opacité du cœur de chaque nappe [claire, médiane, foncée], réglée sur la mesure de contraste. */
export const ALPHA_AURA: Record<ModeCouleur, readonly [number, number, number]> = {
  nuit: [0.3, 0.42, 0.32],
  jour: [0.22, 0.3, 0.2],
};
/** Hauteur de la zone peinte (dp) : le haut de l'écran, fondu vers le bas (860 : l'aura éclaire plus bas, 06/11). */
export const HAUTEUR_AURA = 860;
/** Les nappes partent 80 dp plus bas : au repos, en haut de page, le halo était encore trop haut (06/11, Accueil). */
export const DEPART_AURA = 80;
/** Part du canevas pleinement visible avant le fondu vers le bas. */
export const FONDU_AURA = 0.4;
export const DUREE_GLISSE_MS = 1100;
export const DUREE_REDUIT_MS = 200;
/** L'aura suit le contenu à 35 % de sa vitesse (profondeur), puis se fixe après 220 dp de montée et reste toujours visible. */
export const SUIVI_DEFILEMENT = 0.35;
export const DECALAGE_MAX = 220;
/** Sans geste : image à 15 i/s après 6 s, plus rien après 14 s. */
export const REPOS_APRES_MS = 6000;
export const ARRET_APRES_MS = 14000;
export const INTERVALLE_REPOS_MS = 1000 / 15;
export const AMPLITUDE_REPOS = 0.5;
/** Désaturation de l'aura sur un jour passé (Sport, 31/10) : un repère discret, pas un gris terne ; 0 = teinte pleine. */
export const DESATURATION_PASSE = 0.45;
/** Passage d'aujourd'hui au passé (et retour) : un fondu de teinte posé, plus court que le glissement entre parties. */
export const DUREE_DESATURATION_MS = 600;
/** Plafond d'un pas de temps, pour qu'un réveil ne fasse pas sauter les nappes. */
export const PAS_MAX_MS = 100;

/** Ordre des nappes dans l'état : [couleur (0 claire, 1 médiane, 2 foncée), nappe de la partie]. */
const ORDRE = [[0, 0], [2, 2], [1, 1]] as const;
const NB = 21; // 9 positions, 9 couleurs, 3 opacités

/**
 * État cible d'une partie : 9 valeurs de position (x, y, rayon × 3), 9 de couleur (rvb 0-255 × 3), 3 d'opacité.
 * Dans l'ordre de dessin : claire, foncée, médiane (la médiane au-dessus).
 */
export function cibleAura(partie: Partie, mode: ModeCouleur): number[] {
  const pos = ORDRE.flatMap(([, n]) => [...NAPPES[partie][n]!]);
  const cols = degrades[partie].arrets.map((a) => rvbDe(a.couleur).map((v) => v * 255));
  const couleurs = ORDRE.flatMap(([c]) => cols[c]!);
  const alpha = ORDRE.map(([c]) => ALPHA_AURA[mode][c]);
  return [...pos, ...couleurs, ...alpha];
}

/** Arrivée douce (quart de sortie), la même courbe que la planche. */
export function sortieQuart(p: number): number {
  "worklet";
  const x = Math.min(1, Math.max(0, p));
  return 1 - Math.pow(1 - x, 4);
}

/** Mélange de deux états à l'avancement `e` (0 → 1). */
export function melangerAura(de: readonly number[], vers: readonly number[], e: number): number[] {
  "worklet";
  const sortie = new Array<number>(de.length);
  for (let i = 0; i < de.length; i++) sortie[i] = de[i]! + (vers[i]! - de[i]!) * e;
  return sortie;
}

export interface Nappe {
  x: number;
  y: number;
  r: number;
  /** rgba du cœur, du tiers de la nappe, et nul au bord. */
  coeur: string;
  mi: string;
  bord: string;
}

const rgba = (r: number, v: number, b: number, a: number) => {
  "worklet";
  return `rgba(${Math.round(r)},${Math.round(v)},${Math.round(b)},${a.toFixed(3)})`;
};

/** Couleur rvb (0-255) rapprochée de son gris de même luminance (Rec. 709) : `d` 0 = intacte, 1 = gris. */
export function desaturerRvb(r: number, v: number, b: number, d: number): [number, number, number] {
  "worklet";
  const k = Math.min(1, Math.max(0, d));
  const l = 0.2126 * r + 0.7152 * v + 0.0722 * b;
  return [r + (l - r) * k, v + (l - v) * k, b + (l - b) * k];
}

/** Les trois nappes à l'instant `t` (s) : dérive, respiration ; `amplitude` 0 = immobiles, 1 = pleine, 0,5 = au repos ;
 *  `desaturation` (0 → 1) rapproche les teintes du gris (jour passé). */
export function nappesAura(etat: readonly number[], t: number, amplitude: number, largeur: number, desaturation = 0): Nappe[] {
  "worklet";
  const sortie: Nappe[] = [];
  for (let i = 0; i < 3; i++) {
    const per = i === 0 ? 9 : i === 1 ? 11.5 : 7.5;
    const ph = i * 2.1;
    const dx = Math.sin((t / per) * 6.283 + ph) * 0.09 * amplitude;
    const dy = Math.cos((t / (per * 1.3)) * 6.283 + ph) * 0.05 * amplitude;
    const resp = 1 + Math.sin((t / (per * 0.8)) * 6.283 + ph) * 0.06 * amplitude;
    const al = Math.min(0.9, Math.max(0, etat[18 + i]!));
    const [r, v, b] = desaturerRvb(etat[9 + 3 * i]!, etat[10 + 3 * i]!, etat[11 + 3 * i]!, desaturation);
    sortie.push({
      x: (etat[3 * i]! + dx) * largeur,
      y: (etat[3 * i + 1]! + dy) * HAUTEUR_AURA + DEPART_AURA,
      r: etat[3 * i + 2]! * largeur * 1.55 * resp,
      coeur: rgba(r, v, b, al),
      mi: rgba(r, v, b, al * 0.55),
      bord: rgba(r, v, b, 0),
    });
  }
  return sortie;
}

/** Cadence de dessin selon le temps écoulé depuis le dernier geste. */
export type Cadence = "pleine" | "repos" | "arret";
export function cadenceAura(inactifMs: number): Cadence {
  if (inactifMs >= ARRET_APRES_MS) return "arret";
  return inactifMs >= REPOS_APRES_MS ? "repos" : "pleine";
}

/** Décalage vertical (px) de l'aura pour un défilement de `y` px. */
export function decalageAura(y: number): number {
  "worklet";
  return -Math.min(DECALAGE_MAX, Math.max(0, y) * SUIVI_DEFILEMENT);
}
/** Opacité de l'aura pour un défilement de `y` px : toujours pleine (elle ne s'efface plus). */
export function opaciteAura(_y: number): number {
  "worklet";
  return 1;
}

/** Durée du glissement de teinte : 1,1 s, ou un fondu de 0,2 s en mouvement réduit. */
export function dureeGlisse(reduit: boolean): number {
  return reduit ? DUREE_REDUIT_MS : DUREE_GLISSE_MS;
}

export const TAILLE_ETAT = NB;

/**
 * Halo marié des pages partagées (31/10 : « ce n'est pas l'un puis l'autre, c'est l'un et l'autre mariés ») : une
 * nappe de chaque teinte, qui tournent lentement l'une autour de l'autre et se mêlent au milieu, plus une lueur plus vive de
 * la section ; les poids respirent (0,6 à 1) sans jamais laisser une seule couleur. Un cycle de 14 s, en sinus.
 */
export const CYCLE_HALO_MS = 14000;

/** Les pages au halo partagé et leur couple de teintes [A, B], tirés de la table unique (pages-partagees.ts). */
export const HALOS_PAGES = Object.fromEntries(Object.entries(PAGES_PARTAGEES).map(([page, { halo }]) => [page, halo])) as {
  [P in PagePartagee]: (typeof PAGES_PARTAGEES)[P]["halo"];
};
export type PageHalo = PagePartagee;

/**
 * Page au halo partagé d'un chemin (« /sante/energie »), sinon null. Tant qu'une de ces pages est ouverte, l'aura des onglets
 * garde la teinte de l'onglet d'où l'on vient (sans quoi elle glisserait vers la teinte de la page, partie de la route).
 */
export function pageHaloDe(chemin: string): PageHalo | null {
  const m = /^\/sante\/([a-z]+)\/?$/.exec(chemin);
  return m && Object.hasOwn(PAGES_PARTAGEES, m[1]!) ? (m[1] as PageHalo) : null;
}

/** Amplitude de la respiration : la part de chaque teinte va de 1 − 2 × RESPIRATION_HALO à 1. */
export const RESPIRATION_HALO = 0.2;

/**
 * État marié à la phase `phase` (en cycles, sans borne) : `a` et `b`, états des deux teintes (cibleAura). Nappe 0 : claire
 * de A ; nappe 1 : claire de B (les claires, pour que la seconde teinte se lise aussi la nuit) ; nappe 2 (au-dessus, plus
 * petite) : médiane de A. Opacités : celles de l'aura (foncée pour
 * les deux nappes mariées, claire pour la lueur), pour garder le contraste mesuré.
 */
export function etatMarie(a: readonly number[], b: readonly number[], phase: number): number[] {
  "worklet";
  const s = Math.sin(2 * Math.PI * phase);
  const c = Math.cos(2 * Math.PI * phase);
  const s2 = Math.sin(2 * Math.PI * phase * 2 + 1.3);
  const wA = 1 - RESPIRATION_HALO * (1 + s);
  const wB = 1 - RESPIRATION_HALO * (1 - s);
  return [
    // positions : A à gauche, B à droite, qui se rapprochent et se croisent au milieu ; la lueur dérive en haut
    0.2 + 0.14 * s, 0.14 + 0.07 * c, 0.42,
    0.8 - 0.14 * s, 0.22 - 0.07 * c, 0.42,
    0.4 + 0.1 * s2, -0.02, 0.28,
    // couleurs
    a[9]!, a[10]!, a[11]!,
    b[9]!, b[10]!, b[11]!,
    a[15]!, a[16]!, a[17]!,
    // opacités
    a[19]! * wA, b[19]! * wB, a[18]!,
  ];
}

/**
 * État du halo : la teinte d'origine (`origine`, état complet) glisse vers le mélange comme d'un onglet à l'autre
 * (`entree` de 0 à 1, quart de sortie).
 */
export function etatHalo(origine: readonly number[], a: readonly number[], b: readonly number[], phase: number, entree: number): number[] {
  "worklet";
  return melangerAura(origine, etatMarie(a, b, phase), sortieQuart(entree));
}
