import { requireOptionalNativeModule } from "expo";

// Module local modules/pepfit-cookies (Kotlin) : CookieManager d'Android, qui voit les cookies HttpOnly. Absent d'un APK plus
// ancien : repli sur document.cookie.
interface Natif {
  lire(url: string): Promise<string>;
  /** Absente d'un APK plus ancien que l'effacement des données. */
  effacer?(): Promise<void>;
}
const natif = requireOptionalNativeModule<Natif>("PepfitCookies");

export const cookies = {
  lire: async (url: string): Promise<string> => (natif ? natif.lire(url) : ""),
  /** Cookies et stockage web de la WebView (session des pas Whoop). */
  effacer: async (): Promise<void> => natif?.effacer?.(),
};
