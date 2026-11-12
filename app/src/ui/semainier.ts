// Semainier défilant (29/10 au soir, retours qui remplacent le lot L4 du matin). Glisser la bande fait défiler les
// semaines sans changer le jour affiché : au lâcher, elle s'aimante sur une semaine entière (son lundi à gauche), jamais entre
// deux. Toucher une date l'affiche et recadre la bande sur sa semaine. Défilée sans date touchée, la bande revient seule sur la
// semaine du jour affiché après 5 s sans geste. Un séparateur de mois, dans la couleur de la partie, est toujours là entre le
// dernier jour d'un mois et le 1er du suivant ; entre deux semaines, un séparateur de 4 px de haut n'apparaît que pendant que
// le doigt glisse. Pages sans futur (Santé, mesures : `sansFutur`) : le glissé bute en douceur sur la semaine en cours ; Sport
// et Nutrition gardent les semaines à venir (planification).
// Position de la bande : `debut`, rang (indexJour) du premier jour visible, continu pendant le geste.
// Pur (sans React Native) : testé par tests/semainier.test.ts.

import { geste } from "../theme/mouvement";
import { indexJour } from "./glisser-jour";

export const SEMAINIER = {
  /** Retour sur la semaine du jour affiché, après ce délai sans geste (ms). */
  retourMs: 5_000,
  /** Élan au lâcher : la bande continue sur la vitesse du doigt pendant ce temps (ms), puis s'aimante à la semaine la plus proche. */
  elanMs: 320,
  /** Lâcher vif (px/ms) : la bande passe au moins à la semaine suivante dans le sens du doigt (jeton `geste.vitesse`). */
  vif: geste.vitesse,
  /** Un lâcher ne mène jamais plus loin que ce nombre de semaines (cases rendues de part et d'autre : voir `casesRendues`). */
  elanMaxSemaines: 3,
  /** Cases rendues de part et d'autre du centre (jours). */
  rendues: 28,
  /** Recadrage (ms) : 7 jours en `recadrageMs`, jamais sous 160 ms. */
  recadrageMs: 320,
  /** Séparateur de mois : hauteur en part de la hauteur des cases, épaisseur (px). */
  moisHauteur: 0.4,
  moisLargeur: 1.5,
  /** Séparateur de semaine (pendant le glissé seulement) : hauteur et épaisseur (px), fondu à l'apparition et au lâcher (ms). */
  semaineHauteur: 4,
  semaineLargeur: 2,
  semaineFonduMs: 120,
  /** Butée douce (pages sans futur) : la bande dépasse la semaine en cours d'au plus ce nombre de jours, en résistant. */
  butee: 0.5,
  /** Résistance au départ de la butée : la bande suit le doigt à ce rythme (1 : sans résistance). */
  buteeRaideur: 0.35,
} as const;

/** Début du cadre d'un jour : rang de son lundi. */
export const debutCadre = (lundi: string): number => indexJour(lundi);

/** Pendant le geste : le doigt (dx en px) déplace la bande d'autant de cases ; vers la gauche, les jours suivants arrivent. */
export function suivreBande(depart: number, dx: number, largeurCase: number): number {
  "worklet";
  return depart - dx / Math.max(1, largeurCase);
}

/** Rang du lundi le plus proche d'une position (le rang 4, 1970-01-05, était un lundi). */
export function lundiProche(x: number): number {
  "worklet";
  return 4 + 7 * Math.round((x - 4) / 7);
}

/**
 * Au lâcher : la semaine (rang de son lundi) où la bande s'arrête. Position courante + élan (vitesse du doigt en px/ms convertie
 * en cases), aimantée au lundi le plus proche ; un lâcher vif passe au moins au lundi suivant dans le sens du doigt (une petite
 * pichenette change de semaine). Jamais plus de `elanMaxSemaines` de la semaine du départ du geste (`depart`).
 */
export function cranSemaine(debut: number, vxDoigt: number, largeurCase: number, depart: number, max: number | null = null): number {
  const vise = debut - (vxDoigt / Math.max(1, largeurCase)) * SEMAINIER.elanMs;
  let lundi = lundiProche(vise);
  if (vxDoigt <= -SEMAINIER.vif) lundi = 4 + 7 * Math.ceil((Math.max(vise, debut) - 4 - 1e-6) / 7);
  else if (vxDoigt >= SEMAINIER.vif) lundi = 4 + 7 * Math.floor((Math.min(vise, debut) - 4 + 1e-6) / 7);
  const base = lundiProche(depart);
  const loin = 7 * SEMAINIER.elanMaxSemaines;
  const cran = Math.max(base - loin, Math.min(base + loin, lundi));
  return max == null ? cran : Math.min(max, cran);
}

/**
 * Pages sans futur : position de la bande sous le doigt, retenue au-delà de `max` (rang du lundi de la semaine en cours ; null :
 * pas de butée). Le dépassement résiste dès le départ et ne passe jamais `butee` jour : une butée douce, pas un rebond.
 */
export function buteeDouce(v: number, max: number | null): number {
  if (max == null || v <= max) return v;
  const p = SEMAINIER.butee;
  return max + p * (1 - Math.exp((-(v - max) * SEMAINIER.buteeRaideur) / p));
}

/** Durée d'un déplacement de la bande de `de` à `vers` (cran ou recadrage) : proportionnelle aux jours, bornée. */
export function dureeBande(de: number, vers: number): number {
  return Math.round(Math.max(160, Math.min(480, (SEMAINIER.recadrageMs * Math.abs(vers - de)) / 7)));
}

/**
 * Jour touché sur la bande : d'après la position du doigt (`x`, depuis le bord de la bande) et la position de la bande. Le
 * décalage animé des cases n'est pas vu par la détection du toucher d'Android (29/10 : après un défilement, toucher « mar. 3 nov. »
 * choisissait le jour qui était là avant) : la bande calcule elle-même le jour sous le doigt.
 */
export function rangTouche(debut: number, x: number, largeurCase: number, bord: number): number {
  return Math.floor(debut + (x - bord) / Math.max(1, largeurCase) + 1e-6);
}

/** Rangs des cases rendues autour du centre. */
export function casesRendues(centre: number): number[] {
  return Array.from({ length: 2 * SEMAINIER.rendues + 7 }, (_, k) => centre - SEMAINIER.rendues + k);
}

/** Recadrage trop loin des cases rendues : on saute (pas d'animation sur des cases absentes). */
export const sautRecadrage = (centre: number, vers: number): boolean => Math.abs(vers - centre) > SEMAINIER.rendues - 7;

/** Après un arrêt, faut-il rendre d'autres cases (le centre suit la bande) ? */
export const recentrer = (centre: number, debut: number): boolean => Math.abs(debut - centre) > 14;

/** Le rang d'un lundi (1970-01-05, rang 4, était un lundi). */
export const estLundi = (rang: number): boolean => ((rang % 7) + 7) % 7 === 4;

/**
 * Séparateurs de mois des cases rendues : rang du 1er jour de chaque mois, le séparateur se pose à sa gauche (entre le dernier
 * jour du mois et lui). Toujours visibles, dans la couleur de la partie.
 */
export function separateursMois(rangs: readonly number[], jourDe: (rang: number) => string): number[] {
  return rangs.filter((r) => jourDe(r).endsWith("-01"));
}

/**
 * Séparateurs de semaine des cases rendues : rang de chaque lundi, sauf un 1er du mois (le séparateur de mois est déjà là). Ils
 * n'apparaissent que pendant le glissé.
 */
export function separateursSemaine(rangs: readonly number[], jourDe: (rang: number) => string): number[] {
  return rangs.filter((r) => estLundi(r) && !jourDe(r).endsWith("-01"));
}

/**
 * Séparateurs de semaine : visibles quand le doigt glisse sur la bande (1), effacés au lâcher (0) ; fondu court, d'un coup en
 * mouvement réduit.
 */
export function fonduSemaine(doigt: boolean, reduit: boolean): { vers: 0 | 1; ms: number } {
  return { vers: doigt ? 1 : 0, ms: reduit ? 0 : SEMAINIER.semaineFonduMs };
}

type Horloge = { setTimeout: (f: () => void, ms: number) => unknown; clearTimeout: (id: never) => void };

/**
 * Retour automatique : `lacher()` après un défilement arme le retour (5 s) ; tout geste, toucher de date ou recadrage l'annule.
 * `revenir` ramène la bande sur la semaine du jour affiché.
 */
export function minuterieRetour(revenir: () => void, horloge: Horloge = globalThis as unknown as Horloge, ms: number = SEMAINIER.retourMs) {
  let id: unknown = null;
  const annuler = () => {
    if (id != null) horloge.clearTimeout(id as never);
    id = null;
  };
  return {
    /** Doigt posé sur la bande, ou date touchée, ou recadrage par le jour affiché. */
    annuler,
    /** Défilement fini, sans date touchée : retour dans `ms` si rien d'autre ne se passe. */
    lacher: () => {
      annuler();
      id = horloge.setTimeout(() => {
        id = null;
        revenir();
      }, ms);
    },
    arme: () => id != null,
  };
}

// Étiquette du mois (29/10) : pendant le défilement, « octobre 2026 » en petit au-dessus de la bande, collée à gauche
// sur la marge de la page. L'étiquette du mois suivant arrive avec son 1er jour, au-dessus de lui, et pousse l'ancienne hors du
// cadre (en-têtes de section collants), puis se colle à son tour. Elle n'existe que pendant le défilement libre : toucher une
// date ou le retour à 5 s l'efface en fondu. Posée en superposition dans la marge au-dessus de la bande : aucune place prise.

/**
 * Écart entre deux étiquettes de mois (px) : égal à la marge, pour que l'étiquette poussée sorte en entier quand la suivante se
 * colle (à 12, il en restait un bout au bord gauche, vu à l'émulateur le 29/10).
 */
export const ECART_MOIS = 16;

/** Mois des cases rendues : clé AAAA-MM et rang de leur 1er jour (même s'il n'est pas rendu). */
export function moisRendus(rangs: readonly number[], jourDe: (rang: number) => string): { cle: string; rang: number }[] {
  const vus = new Map<string, number>();
  for (const r of rangs) {
    const cle = jourDe(r).slice(0, 7);
    if (!vus.has(cle)) vus.set(cle, indexJour(`${cle}-01`));
  }
  return [...vus].map(([cle, rang]) => ({ cle, rang }));
}

/**
 * Position (px, dans la bande) de l'étiquette d'un mois : au-dessus de son 1er jour (`bord` + son décalage en cases), jamais
 * plus à gauche que `bord` (collée), et poussée à gauche par l'étiquette du mois suivant (`rangSuivant`, null s'il n'y en a pas).
 */
export function xEtiquette(rang: number, rangSuivant: number | null, debut: number, l: number, largeur: number, bord: number): number {
  "worklet";
  let x = Math.max(bord, bord + (rang - debut) * l);
  if (rangSuivant != null) x = Math.min(x, bord + (rangSuivant - debut) * l - largeur - ECART_MOIS);
  return x;
}

/** Fondu de l'étiquette (ms) : elle n'existe que pendant le défilement libre ; un toucher de date ou le retour l'efface. */
export const FONDU_MOIS_MS = 200;

// Semainier collé au défilement (ui/ZoneSemainier.tsx) : la bande se resserre sur une ligne au rythme du défilement.

/** Hauteur de la bande : pleine (lettre, chiffre, point) et resserrée (chiffre et point). */
export const HAUT_BANDE = 72;
export const HAUT_COMPACTE = 44;

/** Resserrement (0 : pleine, 1 : une ligne) pour un défilement `y` ; en mouvement réduit, d'un coup à mi-chemin. */
export function compactDe(y: number, reduit: boolean): number {
  "worklet";
  const p = Math.min(1, Math.max(0, y / (HAUT_BANDE - HAUT_COMPACTE)));
  return reduit ? (p >= 0.5 ? 1 : 0) : p;
}

/** Hauteur de la bande pour un resserrement donné. */
export function hauteurBande(c: number): number {
  "worklet";
  return HAUT_BANDE - (HAUT_BANDE - HAUT_COMPACTE) * c;
}

/** Lettre du jour (elle se replie quand la bande se resserre) et pastille, en haut et en bas d'une case (écart de 4 entre). */
export const HAUT_LETTRE = 15;
export const PASTILLE = 6;

/**
 * Décalage vertical (px) du milieu des chiffres par rapport au milieu de la bande, pour un resserrement donné : les
 * séparateurs s'y alignent (centrés sur la bande, celui de la semaine faisait une apostrophe au-dessus des chiffres, vu à
 * l'émulateur le 29/10). La case centre lettre, chiffre et pastille : le chiffre est décalé de (lettre − pastille) / 2.
 */
export function milieuChiffre(c: number): number {
  "worklet";
  return (HAUT_LETTRE * (1 - c) - PASTILLE) / 2;
}
