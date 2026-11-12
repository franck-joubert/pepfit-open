import type { TextStyle } from "react-native";

export const police = {
  light: "Inter-Light",
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  /** Seulement pour « pep » dans un titre ou une mention de marque (ui/Pep.tsx). */
  semiboldItalique: "Inter-SemiBoldItalic",
} as const;

/**
 * Chiffres tabulaires sur TOUTES les variantes : en chiffres proportionnels, Inter rend à largeur nulle l'espace fine
 * insécable des milliers (U+202F) que met `nombre()` (« 9063 » au lieu de « 9 063 », vu à l'émulateur, revue finale n° 18,
 * docs/ESPACE-FINE.md). Une variante ajoutée sans `tab` est refusée par tests/espace-fine.test.ts.
 */
const tab: TextStyle["fontVariant"] = ["tabular-nums"];

// DESIGN.md §3 (v2.2)
export const typo = {
  titre: { fontFamily: police.semibold, fontSize: 20, fontVariant: tab },
  /** Titre de barre et de bloc (page du mois, en-tête de repas, exercice mis en avant) : entre `titre` et `exercice`. */
  titreBarre: { fontFamily: police.semibold, fontSize: 17, fontVariant: tab },
  titreFort: { fontFamily: police.semibold, fontSize: 24, fontVariant: tab },
  chiffreFort: { fontFamily: police.light, fontSize: 44, fontVariant: tab },
  minuteur: { fontFamily: police.regular, fontSize: 28, fontVariant: tab },
  saisie: { fontFamily: police.medium, fontSize: 16, fontVariant: tab },
  exercice: { fontFamily: police.semibold, fontSize: 15, fontVariant: tab },
  /** Libellé de champ, texte d'une feuille ou d'une carte qu'on lit (un cran au-dessus du corps). */
  libelle: { fontFamily: police.regular, fontSize: 14, fontVariant: tab },
  corps: { fontFamily: police.regular, fontSize: 13, fontVariant: tab },
  note: { fontFamily: police.regular, fontSize: 15, lineHeight: 22, fontVariant: tab },
  meta: { fontFamily: police.regular, fontSize: 12, fontVariant: tab },
  entete: { fontFamily: police.semibold, fontSize: 11, letterSpacing: 0.66, textTransform: "uppercase", fontVariant: tab },
} as const satisfies Record<string, TextStyle>;

export type VarianteTexte = keyof typeof typo;

/** Plus petite taille de texte (méta, pastilles, noms sous les jours) : rien en dessous (constat 42 de l'audit). */
export const TAILLE_MIN = 11;

/**
 * « Taille de police » d'Android : le texte suit jusqu'à 130 %, au-delà il plafonne (lignes de hauteur fixe, cases de 44,
 * rangées de 52 : rien ne se chevauche). Posé par `Texte` et par les champs.
 */
export const POLICE_MAX = 1.3;

export const espace = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24 } as const;
export const rayon = { s: 8, m: 10, l: 12, xl: 16, feuille: 28 } as const;
export const cible = { min: 44, ligneSerie: 52, caseW: 48, caseH: 44 } as const;

/**
 * Menu flottant des onglets : pilule de 64 (onglets de 52 + 6 de marge), posée à 16 du bas (zone système en plus).
 * Le dégradé du fond derrière commence `fondu` px au-dessus d'elle et n'est plein que derrière la barre système.
 */
export const menuOnglets = { hauteur: 64, onglet: 52, ecartBas: 16, fondu: 24, marge: 104 } as const;
