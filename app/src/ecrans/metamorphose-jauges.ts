// Métamorphose des jauges de la page Activité (planche activite-jauges, validée le 09/11) : les trois grandes jauges
// du haut de page (Récupération, Pas, Effort) se changent en la petite ligne fixée sous le semainier, au fil du défilement.
// Calcul pur, sans React : chaque fonction « worklet » tourne sur le fil UI (Reanimated), les tests la lisent en Node.
//
// Mécanique (la même que la planche) :
//  - la rangée est posée par-dessus la page, qui lui garde une réserve de `HAUT_GRANDE` dans le flux (la liste garde la vitesse
//    du doigt) ; son haut suit la page jusqu'au semainier resserré, puis s'y fixe ;
//  - elle commence à se métamorphoser quand son haut touche le semainier (défilement `yDock`) et finit `COURSE` dp plus loin :
//    avancement p = (défilement − yDock) / COURSE, borné de 0 à 1 ; aucune durée, tout suit le doigt, dans les deux sens ;
//  - sa hauteur passe de `HAUT_GRANDE` à `HAUT_LIGNE` sur ces `COURSE` dp (elle rétrécit plus vite que le doigt : un court vide
//    se forme sous elle, la liste le comble en continuant de monter) ;
//  - l'anneau suit q = p^EXPOSANT (il rétrécit un peu moins vite que la rangée, pour remplir la place) ; chaque élément a sa
//    fenêtre sur q (voir `fenetres`).
// Au lâcher, une rangée à mi-course finit sa course dans le sens du geste (`cibleDeFin`).

import { HAUT_COMPACTE } from "../ui/semainier";

/** Hauteur de la ligne fixée : celle du semainier resserré (HAUT_COMPACTE), donc une zone de clic de 44. */
export const HAUT_LIGNE = HAUT_COMPACTE;
/** Distance de défilement de la métamorphose (dp) : courte, on ne reste jamais sur l'affichage intermédiaire (retours). */
export const COURSE = 64;
/** Exposant de q : l'anneau garde un peu d'avance sur la rangée. */
export const EXPOSANT = 1.3;
/** Fin de course au lâcher : durée (ms) et courbe (la sortie du design : cubic-bezier(0.23, 1, 0.32, 1)). */
export const DUREE_FIN_COURSE = 200;
/** Sous cette vitesse de lâcher (dp/ms), la rangée finit sa course d'elle-même ; au-dessus, l'élan joue d'abord. */
export const VITESSE_LACHER = 0.15;

/** Mesures de la grande jauge : 96 dp sur le téléphone, 112 sur le Fold déplié (colonne large). */
export const AIR = { haut: 16, libelle: 10, hautLibelle: 16, bas: 22 } as const;
export const ANNEAU_PETIT = 20;
export const ANNEAU_PAD_PETIT = 12;

export type Mesures = {
  /** Diamètre de la grande jauge. */
  anneau: number;
  /** Rapport à la grande jauge de 96 (1 ou 112/96) : police de la valeur, trait. */
  k: number;
  /** Hauteur de la rangée au repos (la réserve laissée dans la page). */
  hauteur: number;
  /** Hauteur dont la rangée rétrécit pendant la course. */
  perte: number;
};

export function mesures(large: boolean): Mesures {
  "worklet";
  const anneau = large ? 112 : 96;
  const hauteur = AIR.haut + anneau + AIR.libelle + AIR.hautLibelle + AIR.bas;
  return { anneau, k: anneau / 96, hauteur, perte: hauteur - HAUT_LIGNE };
}

export function borne(x: number, a = 0, b = 1): number {
  "worklet";
  return Math.min(b, Math.max(a, x));
}

export function lerp(a: number, b: number, t: number): number {
  "worklet";
  return a + (b - a) * t;
}

/** Fenêtre : 0 avant `a`, 1 après `b`, linéaire entre. */
export function fenetre(x: number, a: number, b: number): number {
  "worklet";
  return borne((x - a) / (b - a));
}

/** Défilement où le haut de la rangée touche le semainier resserré (`hautRangee` : son haut dans la page, depuis le haut du contenu). */
export function defilementDeDock(hautRangee: number): number {
  "worklet";
  return Math.max(0, hautRangee - HAUT_LIGNE);
}

/** Avancement p de la métamorphose pour un défilement `y`. */
export function avancement(y: number, yDock: number): number {
  "worklet";
  return borne((y - yDock) / COURSE);
}

/**
 * « Réduire les animations » : pas de métamorphose. La grande rangée défile avec la page ; la ligne fixée la remplace quand elle
 * est sortie (1) ; avant, rien (0).
 */
export function remplaceeReduit(y: number, yDock: number, perte: number): number {
  "worklet";
  return y >= yDock + perte ? 1 : 0;
}

/** q : l'avancement de l'anneau. */
export function avanceeAnneau(p: number): number {
  "worklet";
  return Math.pow(borne(p), EXPOSANT);
}

/** Hauteur de la rangée pour l'avancement p. */
export function hauteurRangee(p: number, m: Mesures): number {
  "worklet";
  return m.hauteur - m.perte * p;
}

/** Haut de la rangée dans la zone (sous le titre) : elle suit la page, puis se fixe sous le semainier (`hautBande` : sa hauteur). */
export function hautRangee(y: number, hautDansPage: number, hautBande: number): number {
  "worklet";
  return Math.max(hautDansPage - y, hautBande);
}

/**
 * Où finit la course au lâcher : 1 (fixée) si le geste montait la page, 0 (grande) s'il la redescendait ; null si la rangée est
 * déjà au bout (rien à finir). `sens` : > 0 quand le défilement augmente (la page monte sous le doigt).
 */
export function cibleDeFin(p: number, sens: number): 0 | 1 | null {
  "worklet";
  if (p <= 0 || p >= 1) return null;
  return sens >= 0 ? 1 : 0;
}

/** Défilement (dp) où la rangée est au bout de sa course, pour une cible 0 ou 1. */
export function defilementDeCible(cible: 0 | 1, yDock: number): number {
  "worklet";
  return yDock + COURSE * cible;
}

/** Au lâcher, sous cette vitesse (valeur absolue, dp/ms) la course se finit tout de suite ; au-dessus, l'élan joue d'abord. */
export function lacherImmediat(vitesse: number): boolean {
  "worklet";
  return Math.abs(vitesse) < VITESSE_LACHER;
}

/** Sens du geste : celui du dernier déplacement net (+1 : le défilement augmente, la page monte) ; un arrêt le garde. */
export function sensDe(sens: number, dy: number): number {
  "worklet";
  return Math.abs(dy) >= 0.5 ? (dy > 0 ? 1 : -1) : sens;
}

/**
 * Hauteur minimale du contenu : la course reste possible même un jour sans séance (page courte). `distance` : la course (COURSE) ;
 * en mouvement réduit, la perte de hauteur de la rangée, qui doit être sortie en entier avant que la ligne fixée la remplace.
 */
export function hauteurMinimale(hautVisible: number, yDock: number, distance: number = COURSE): number {
  return hautVisible + yDock + distance;
}

/** Les fenêtres de q de chaque élément (planche, tableau de la métamorphose). */
export const fenetres = {
  icone: [0, 0.3],
  valeurDedans: [0.08, 0.36],
  valeurReduite: [0, 0.4],
  valeurDehors: [0.4, 0.62],
  unite: [0.78, 1],
  libelle: [0, 0.42],
} as const;

/** Géométrie de l'anneau pour l'avancement p, en unités de la boîte de 96 (1 unité = k dp avant la mise à l'échelle). */
export function geometrieAnneau(p: number, m: Mesures): { rayon: number; epaisseur: number; epaisseurZone: number } {
  "worklet";
  const q = avanceeAnneau(p);
  const echelle = lerp(m.anneau, ANNEAU_PETIT, q) / m.anneau;
  return {
    // du « grand » (r 40, trait 7) au « mini » de l'appli (r 34, trait 2,5 dp) ; le trait est compté en unités de la boîte :
    // la mise à l'échelle ne l'épaissit donc pas à tort
    rayon: lerp(40, 34, q),
    epaisseur: lerp(7 * m.k, 2.5, q) / echelle / m.k,
    epaisseurZone: lerp(3.2 * m.k, 1.25, q) / echelle / m.k,
  };
}

export type EtatCellule = {
  /** Diamètre de la boîte de l'anneau (dp) et son échelle par rapport à la grande. */
  taille: number;
  echelle: number;
  /** Haut de la boîte de l'anneau dans la rangée. */
  haut: number;
  /** Gauche de la boîte de l'anneau, depuis le début de sa case. */
  gauche: number;
  /** Centre de l'anneau, depuis le début de sa case et le haut de la rangée. */
  cx: number;
  cy: number;
  iconeOpacite: number;
  iconeEchelle: number;
  iconeY: number;
  dedansOpacite: number;
  dedansEchelle: number;
  dedansY: number;
  dehorsOpacite: number;
  dehorsX: number;
  uniteOpacite: number;
  libelleOpacite: number;
  libelleY: number;
};

/**
 * Tout ce qui bouge dans une case, pour l'avancement p. `largeurCase` : largeur d'une case (un tiers de la rangée).
 * Les positions sont relatives à la case (x) et à la rangée (y) ; la rangée elle-même est posée par `hautRangee`.
 */
export function etatCellule(p: number, largeurCase: number, m: Mesures): EtatCellule {
  "worklet";
  const q = avanceeAnneau(p);
  const S = lerp(m.anneau, ANNEAU_PETIT, q);
  const echelle = S / m.anneau;
  const haut = lerp(AIR.haut, ANNEAU_PAD_PETIT, q);
  const gauche = lerp(largeurCase / 2 - m.anneau / 2, 0, q);
  const cx = gauche + S / 2;
  const cy = haut + S / 2;
  const f = (a: readonly [number, number]) => fenetre(q, a[0], a[1]);
  const fIc = f(fenetres.icone);
  return {
    taille: S,
    echelle,
    haut,
    gauche,
    cx,
    cy,
    iconeOpacite: 1 - fIc,
    iconeEchelle: lerp(1, 0.7, fIc),
    iconeY: cy - 11 * m.k * echelle,
    dedansOpacite: 1 - f(fenetres.valeurDedans),
    dedansEchelle: lerp(1, 0.72, f(fenetres.valeurReduite)),
    dedansY: cy + 10 * m.k * echelle,
    dehorsOpacite: f(fenetres.valeurDehors),
    dehorsX: gauche + S + lerp(4, 7, q),
    uniteOpacite: f(fenetres.unite),
    libelleOpacite: 1 - f(fenetres.libelle),
    libelleY: haut + S + AIR.libelle,
  };
}
