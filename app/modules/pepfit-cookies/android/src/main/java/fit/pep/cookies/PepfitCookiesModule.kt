package fit.pep.cookies

import android.webkit.CookieManager
import android.webkit.WebStorage
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Cookies de la WebView lus côté natif : CookieManager renvoie aussi ceux marqués HttpOnly, que document.cookie ne voit pas
// (jetons de session id.whoop.com).
class PepfitCookiesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PepfitCookies")

    /** Chaîne « a=1; b=2 » des cookies que la WebView enverrait à `url` ; vide s'il n'y en a pas. */
    AsyncFunction("lire") { url: String ->
      val gestionnaire = CookieManager.getInstance()
      gestionnaire.flush()
      gestionnaire.getCookie(url) ?: ""
    }

    /** « Effacer les données de ce téléphone » : cookies (session Whoop) et stockage web de la WebView. Rejouable. */
    AsyncFunction("effacer") { promise: Promise ->
      WebStorage.getInstance().deleteAllData()
      CookieManager.getInstance().removeAllCookies {
        CookieManager.getInstance().flush()
        promise.resolve(null)
      }
    }.runOnQueue(Queues.MAIN)
  }
}
