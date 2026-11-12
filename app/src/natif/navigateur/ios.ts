// Couche iPhone du navigateur, sans import d'Expo (tests/ios-divers.test.ts) : le module Swift modules/pepfit-navigateur/ios
// porte les noms du Kotlin, plus `authentifier` (connexions OAuth de Whoop et Withings, ASWebAuthenticationSession).
export interface NatifNavigateur {
  ouvrir(url: string): boolean;
  passerDerriere?(): boolean;
  authentifier?(url: string, schema: string): Promise<string | null>;
}

export const fabriquerNavigateur = (natif: NatifNavigateur | null) => ({
  /** Une page de pep.fit que l'appli ne montre pas, par-dessus l'appli (SFSafariViewController). */
  ouvrir: (url: string): boolean => natif?.ouvrir(url) ?? false,
  /** iOS ne ramène pas l'appli d'avant : toujours faux. */
  passerDerriere: (): boolean => natif?.passerDerriere?.() ?? false,
  /** La feuille de connexion d'Apple sur `url` ; rend l'adresse de retour `schema://…`, null si elle est fermée. */
  authentifier: async (url: string, schema: string): Promise<string | null> =>
    natif?.authentifier ? natif.authentifier(url, schema).catch(() => null) : null,
});
