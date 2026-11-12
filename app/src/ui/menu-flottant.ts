// Logique du menu flottant des onglets, sans React Native (testée dans tests/menu-flottant.test.ts).

import type { Partie } from "../theme/effets";

/**
 * Les trois onglets, dans l'ordre de la barre : Moi (ex-Santé), Sport, Nutrition. « / » n'en
 * est plus un : c'est la route d'entrée, elle redirige vers le premier onglet allumé (app/(tabs)/index.tsx). `cle` du réglage
 * « Onglets affichés » (partie_*) = le chemin sans « / ».
 */
export const ONGLETS = [
  { chemin: "/health", cle: "ui.onglet.moi", icone: "sante" },
  { chemin: "/train", cle: "ui.onglet.entrainement", icone: "dumbbell" },
  { chemin: "/food", cle: "ui.onglet.nutrition", icone: "nutrition" },
] as const;

export type CheminOnglet = (typeof ONGLETS)[number]["chemin"];

/** Onglets qu'on peut éteindre depuis le profil : aucun n'est obligatoire, mais au moins un reste allumé. */
export type PartiesActives = { train: boolean; food: boolean; health: boolean };
export const TOUTES_PARTIES: PartiesActives = { train: true, food: true, health: true };

const cleDe = (chemin: string) => chemin.slice(1) as keyof PartiesActives;

/** Onglets de la barre : les allumés, dans l'ordre. Tout éteint (réglage synchronisé abîmé) : le premier, jamais une barre vide. */
export function ongletsVisibles(p: PartiesActives): (typeof ONGLETS)[number][] {
  const allumes = ONGLETS.filter((o) => p[cleDe(o.chemin)]);
  return allumes.length ? allumes : [ONGLETS[0]];
}

/** Où mène « / » (et où l'on retombe quand l'onglet courant s'éteint) : le premier onglet allumé. */
export function premierOnglet(p: PartiesActives): CheminOnglet {
  return ongletsVisibles(p)[0]!.chemin;
}

/** Dernier onglet allumé : son interrupteur est grisé (« Au moins un onglet reste affiché »). */
export function dernierAllume(p: PartiesActives, chemin: string): boolean {
  const v = ongletsVisibles(p);
  return v.length === 1 && v[0]!.chemin === chemin;
}

/** Une barre à un seul onglet disparaît (rien à choisir). */
export function barreVisible(p: PartiesActives): boolean {
  return ongletsVisibles(p).length > 1;
}

/** Un onglet de la barre : ses réglages (retour au jour, relecture, volet) ne valent que pour ces trois chemins. */
export function estOnglet(chemin: string): chemin is CheminOnglet {
  return ONGLETS.some((o) => o.chemin === chemin);
}

/** Le menu est dessiné sur les onglets ; jamais en séance, ni sur un écran poussé (feuille plein écran). */
export function menuVisible(chemin: string): boolean {
  return estOnglet(chemin);
}

/**
 * Arrêts du dégradé du fond sous le menu, de haut en bas : transparent `fondu` px au-dessus de la pilule, plein en haut
 * de la barre système (en dessous, aplat jusqu'au bord de l'écran). Le contenu qui défile s'y efface.
 */
export const ARRETS_FONDU = [
  { offset: 0, opacite: 0 },
  { offset: 0.2, opacite: 0.15 },
  { offset: 0.45, opacite: 0.45 },
  { offset: 0.7, opacite: 0.8 },
  { offset: 1, opacite: 1 },
] as const;

/**
 * Barre resserrée sous 380 dp (planche fil, D4) : l'écran extérieur d'un Fold fait 344 dp (Fold 5) ou 368 dp (Fold 6), où la
 * pilule à cinq entrées débordait de 7 dp avec « Nutrition » actif. Pilule de 58 dp, onglets de 46 dp de large sur 48 de haut,
 * écart de 2, onglet actif à 12 · 14 de marge (318 dp au plus large) ; la zone de toucher reste au-dessus de 44 dp.
 */
export const LARGEUR_RESSERREE = 380;
export interface DimensionsMenu {
  hauteur: number;
  onglet: number;
  largeur: number;
  ecart: number;
  actif: readonly [number, number];
}
export const MENU_RESSERRE: DimensionsMenu = { hauteur: 58, onglet: 48, largeur: 46, ecart: 2, actif: [12, 14] };

/** Dimensions de la pilule pour un écran large de `largeur` dp ; au-dessus de 380 dp, celles de `menuOnglets`. */
export function dimensionsMenu(largeur: number, normal: { hauteur: number; onglet: number }): DimensionsMenu {
  return largeur < LARGEUR_RESSERREE ? MENU_RESSERRE : { hauteur: normal.hauteur, onglet: normal.onglet, largeur: normal.onglet, ecart: 4, actif: [14, 18] };
}

/**
 * Place dans la barre de la couleur d'une page : le rang du premier onglet visible de cette partie ; sans onglet de cette partie
 * (Accueil bleu, onglet éteint), `precedent` (borné à la barre) : la couleur se fond sur place, la vague ne part pas ailleurs.
 */
export function rangDePartie(partiesBarre: readonly Partie[], partie: Partie, precedent: number): number {
  const i = partiesBarre.indexOf(partie);
  return i >= 0 ? i : Math.max(0, Math.min(precedent, partiesBarre.length - 1));
}
