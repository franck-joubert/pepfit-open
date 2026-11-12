// Connexions OAuth (Whoop, Withings), sans import d'Expo ni de React Native (tests/ios-divers.test.ts).

/**
 * Ouvre la page d'autorisation d'un service (Whoop, Withings). Android : le navigateur, et le retour `pepfitopen://…` arrive par
 * le lien de l'appli. iPhone : la feuille de connexion d'Apple (règle de l'App Store pour une connexion web) rend l'adresse de
 * retour au lieu de la livrer comme lien : on la rouvre, et elle suit le même chemin que sur Android (route « whoop »,
 * « withings »). Fermée sans réponse : rien, comme un retour du navigateur sans autorisation.
 */
export async function ouvrirAutorisation(
  url: string,
  d: { ios: boolean; authentifier(url: string, schema: string): Promise<string | null>; ouvrirLien(url: string): Promise<unknown> },
): Promise<void> {
  if (!d.ios) {
    await d.ouvrirLien(url);
    return;
  }
  const retour = await d.authentifier(url, SCHEMA);
  if (retour?.startsWith(`${SCHEMA}://`)) await d.ouvrirLien(retour);
}

/** Le schéma de l'appli (app.json, « scheme »). */
export const SCHEMA = "pepfitopen";
