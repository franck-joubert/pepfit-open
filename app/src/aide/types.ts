// Aide et support (planche aide-retours validée le 03/11 ; docs/CODE-SUPPORT.md) : les types partagés par le contenu
// intégré, la recherche, le client du serveur et les écrans. Sans React Native.

/** Thèmes des questions fréquentes (e5), dans l'ordre de la planche ; mêmes clés que le serveur (support.js, THEMES). */
export const THEMES_AIDE = ["compte", "appareils", "sport", "sante", "nutrition", "confidentialite"] as const;
export type ThemeAide = (typeof THEMES_AIDE)[number];

/**
 * Écrans qu'une réponse de l'aide ou du support peut ouvrir (« Ouvrir Appareils et connexions », « Reconnecter Whoop ») :
 * une clé, jamais une adresse libre ; mêmes clés que le serveur (support.js, ECRANS). Route et libellé : ecrans.ts.
 */
export const ECRANS_AIDE = ["connexions", "whoop", "withings", "sante_connect", "sauvegarde", "verrou", "region", "objectifs", "rappel", "reconnaissance"] as const;
export type EcranAide = (typeof ECRANS_AIDE)[number];

/** Une réponse de l'aide (e7) : intro, étapes numérotées, bouton vers un écran ; `mots` : d'autres mots qui la trouvent. */
export type ArticleAide = {
  cle: string;
  theme: ThemeAide;
  titre: string;
  intro: string;
  etapes: string[];
  ecran?: EcranAide;
  mots?: string;
  ordre: number;
};
