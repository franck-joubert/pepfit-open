// Couche iPhone des cookies de la WebView, sans import d'Expo (tests/ios-divers.test.ts) : le module Swift
// modules/pepfit-cookies/ios (WKHTTPCookieStore, qui voit les cookies HttpOnly) porte les mêmes noms que le Kotlin. Absent :
// repli sur document.cookie (chaîne vide ici).
export interface NatifCookies {
  lire(url: string): Promise<string>;
  effacer?(): Promise<void>;
}

export const fabriquerCookies = (natif: NatifCookies | null) => ({
  lire: async (url: string): Promise<string> => (natif ? natif.lire(url) : ""),
  /** Cookies et stockage web de la WebView (session des pas Whoop, Fitatu). */
  effacer: async (): Promise<void> => natif?.effacer?.(),
});
