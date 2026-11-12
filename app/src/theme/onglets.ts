import { duree } from "./mouvement";

// Jetons composant des onglets (planche onglets, direction A « classeur ouvert », validée le 06/11 ; DESIGN.md § 6,
// composant 12). Les couleurs ne sont pas ici : elles viennent des jetons sémantiques (segment-piste, line, t1, t2, partie-*,
// second-fil, rate) lus par ui/Onglets.tsx. Ici, les mesures et les temps.

export const onglets = {
  /** Hauteur d'un onglet, simple ou riche : ce ne sont pas des boutons (la règle « jamais 48 » vaut pour les boutons seulement). */
  hauteur: 48,
  /** Largeur minimale d'un onglet riche : zone de clic de 48 × 48 au moins. */
  largeurMin: 48,
  /** Icône de l'onglet riche, trait 1,75. */
  icone: 22,
  /** Marge de chaque côté de l'icône dans un onglet riche (13 + 22 + 13 = 48). */
  margeIcone: 13,
  /** Écart entre deux onglets riches. */
  ecart: 2,
  /** Riche : marge haute du rail, au-dessus des onglets. */
  margeHaute: 6,
  /**
   * Riche : le voile qui monte derrière les onglets, UNI (une seule teinte, pas de dégradé), la nuit comme le jour. La teinte et la
   * saturation sont celles de la partie, ramenées à cette luminosité (HSL) : un prune-violet sombre et saturé, jamais un gris ni un
   * noir neutre. Opacité faible : il assombrit à peine le fond (environ 8 %) et laisse l'aura vivante.
   */
  voile: {
    // Alex, 06/11 : « fonce un peu côté nuit, sature un peu côté jour ».
    nuit: { luminosite: 0.085, opacite: 0.2, saturation: 1 },
    jour: { luminosite: 0.118, opacite: 0.16, saturation: 1.3 },
  },
  /** Riche : rayon des coins hauts de l'encoche de l'actif. */
  encocheRayon: 10,
  /** Riche : espace entre l'icône et le libellé déplié. */
  ecartLibelle: 8,
  /** Filet de base, en `line`. */
  filet: 1,
  /** Simple : trait de 2 dp de la couleur de la partie sous l'actif. */
  trait: 2,
  /** Simple : marge de chaque côté d'un libellé. */
  margeLibelle: 16,
  /** Simple : espace entre le libellé et son compteur. */
  ecartCompte: 6,
  /** Libellé 14 (500 au repos, 600 pour l'actif), compteur 12/400. */
  texte: 14,
  compte: 12,
  /** Pastille de 18 (11/600) sur le coin de l'icône, « 99+ » au-delà de 99 ; point de 8 sans chiffre. */
  pastille: 18,
  pastilleTexte: 11,
  point: 8,
  /** Onglet désactivé. */
  desactive: 0.38,
  /** Calque d'appui de l'onglet : rayon 8. */
  appuiRayon: 8,
  /** Le jour, la partie assombrie de 25 % (mélange avec du noir) pour le trait et l'icône actifs : 3:1 sur toute l'aura. */
  assombrirJour: 0.25,
  /** Glissement latéral : on ne prend pas un geste parti des 40 premiers dp (le volet du profil). */
  glisseBordGauche: 40,
} as const;

/**
 * Temps des onglets (ms) : tous tirés de theme/mouvement.ts, sauf l'icône (160), le libellé qui se ferme (100), le suivi du doigt et le
 * calque d'appui. Une seule horloge de `deplace` ms conduit toute la transition (ui/onglets-mouvement.ts) : chaque élément y prend sa
 * part (retard + durée) et finit au plus tard à `deplace`.
 */
export const tempsOnglets = {
  /** Trait ou encoche qui glisse, largeur des onglets, libellé qui se déplie, pose de l'icône (0,82 à 1) : `duree.onglet`. */
  deplace: duree.onglet,
  /** Changement de panneau : fondu de `duree.ongletFondu`. */
  fondu: duree.ongletFondu,
  /** Courbe des opacités et des couleurs (le libellé qui paraît ou s'efface, l'icône, le libellé simple) : `ease` de CSS, pour un fondu doux ; le mouvement garde `courbe.sortie`. */
  courbeFondu: [0.25, 0.1, 0.25, 1],
  /** Icône qui prend la couleur de la partie ; libellé simple qui passe de t2 à t1. */
  icone: 160,
  /** Opacité du libellé qui se déplie, avec son retard (retard + durée = `deplace`). */
  libelle: 160,
  libelleRetard: 60,
  /** Opacité du libellé qui se ferme : il s'efface vite, avant que son onglet soit à moitié refermé. */
  libelleSort: 100,
  /** Pose de l'icône : échelle de départ. */
  poseDepart: 0.82,
  /** Appui et relâche du calque. */
  appui: duree.appui,
  relache: duree.relache,
  /** Sous « réduire les animations » : pas de dépli ni de glissé, un fondu. */
  reduit: 120,
  /** Glissement latéral entre panneaux : le panneau arrive de `decalage` dp. */
  glisse: duree.onglet,
  decalage: 28,
  /** Panneau qui suit le doigt : part de la course du doigt, bornée à `suiviMax` dp ; au bord (pas de voisin), `suiviBord` seulement. */
  suivi: 0.5,
  suiviMax: 96,
  suiviBord: 0.18,
  /** Opacité du panneau tenu au bout du suivi (`suiviMax`) : il s'estompe en suivant le doigt, sans disparaître. */
  suiviOpacite: 0.6,
  /** Retour en place d'un glissé qui ne change pas d'onglet : `duree.ongletFondu`. */
  retour: duree.ongletFondu,
} as const;
