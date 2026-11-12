export type Apparence = "auto" | "nuit" | "jour";

/** `?apparence=jour|nuit|auto` dans un lien pepfitopen:// (captures sans geste) : apparence imposée pour la session, jamais
 * enregistrée ; « auto » rend la main au réglage. null : le lien n'en dit rien. */
export function apparenceDuLien(url: string | null | undefined): Apparence | null {
  const m = url?.match(/[?&]apparence=(jour|nuit|auto)\b/);
  return m ? (m[1] as Apparence) : null;
}

/** `?personnage=homme|femme` dans un lien pepfitopen:// (captures) : personnage montré par Santé et la vue 3D, pour cet
 * affichage seulement (le profil n'est pas touché). */
export function personnageDuLien(v: string | string[] | undefined): "homme" | "femme" | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x === "homme" || x === "femme" ? x : null;
}
