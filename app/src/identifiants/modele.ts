// Identifiants développeur de chaque API (version libre) : chacun crée sa propre application chez Whoop, Withings et Polar et
// en donne les identifiants à l'appli (Réglages › Connexions › Mes identifiants API). Rien n'est livré dans le code. Pur, sans
// React Native (tests/identifiants.test.ts). Voir SELF-HOSTING.md à la racine du dépôt.

export type Fournisseur = "whoop" | "withings" | "polar";
export const FOURNISSEURS: readonly Fournisseur[] = ["whoop", "withings", "polar"];

/** Clé du coffre des identifiants d'un fournisseur. */
export const cleIdentifiants = (f: Fournisseur) => `pepfit.identifiants.${f}`;
/** Toutes ces clés, pour l'effacement des données (effacer/logique.ts). */
export const COFFRE_IDENTIFIANTS: readonly string[] = FOURNISSEURS.map(cleIdentifiants);

export interface Identifiants {
  clientId: string;
  clientSecret: string;
  /** URL de retour déclarée chez le fournisseur, à l'identique. */
  redirection: string;
}

/** Retour direct dans l'appli (schéma de app.json) ; Withings exige une page HTTPS (relais/retour.html). */
export const REDIRECTION_APPLI: Record<Fournisseur, string> = { whoop: "pepfitopen://whoop", withings: "", polar: "pepfitopen://polar" };

const propre = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Identifiants complets et lisibles ; null s'il en manque un. */
export function lireIdentifiants(x: unknown): Identifiants | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const i = { clientId: propre(o.clientId), clientSecret: propre(o.clientSecret), redirection: propre(o.redirection) };
  return i.clientId && i.clientSecret && redirectionValide(i.redirection) ? i : null;
}

/** Une URL de retour : https://… ou le schéma de l'appli. */
export const redirectionValide = (u: string): boolean => /^https:\/\/[^\s/?#]+[^\s]*$/.test(u) || /^pepfitopen:\/\/[a-z]+\/?$/.test(u);

/** Préremplissage à la construction (variables EXPO_PUBLIC_*, écrites en clair dans l'APK : pour son propre APK seulement). */
export interface Prerempli {
  clientId?: string;
  clientSecret?: string;
  redirection?: string;
}

/** Ce que l'écran propose : ce qui est gardé, sinon le préremplissage, sinon le retour direct dans l'appli. */
export function aProposer(f: Fournisseur, gardes: Identifiants | null, pre: Prerempli): Identifiants {
  if (gardes) return gardes;
  return { clientId: propre(pre.clientId), clientSecret: propre(pre.clientSecret), redirection: propre(pre.redirection) || REDIRECTION_APPLI[f] };
}
