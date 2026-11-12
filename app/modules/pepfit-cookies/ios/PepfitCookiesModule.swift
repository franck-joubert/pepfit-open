import ExpoModulesCore
import WebKit

// Cookies de la WebView lus côté natif, version iPhone du module Kotlin (mêmes noms). react-native-webview range ses cookies
// dans le magasin par défaut de WebKit (WKWebsiteDataStore.default, hors navigation privée) ; on y lit aussi ceux marqués
// HttpOnly, que document.cookie ne voit pas (jetons de session id.whoop.com).
public class PepfitCookiesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PepfitCookies")

    /** Chaîne « a=1; b=2 » des cookies que la WebView enverrait à `url` ; vide s'il n'y en a pas. */
    AsyncFunction("lire") { (url: String, promise: Promise) in
      guard let adresse = URL(string: url), let hote = adresse.host?.lowercased() else {
        promise.resolve("")
        return
      }
      let chemin = adresse.path.isEmpty ? "/" : adresse.path
      let sure = adresse.scheme == "https"
      WKWebsiteDataStore.default().httpCookieStore.getAllCookies { liste in
        let maintenant = Date()
        let gardes = liste.filter { c in
          PepfitCookiesModule.domaineVa(c.domain, hote)
            && chemin.hasPrefix(c.path)
            && (!c.isSecure || sure)
            && (c.expiresDate.map { $0 > maintenant } ?? true)
        }
        promise.resolve(gardes.map { "\($0.name)=\($0.value)" }.joined(separator: "; "))
      }
    }.runOnQueue(.main)

    /** « Effacer les données de ce téléphone » : cookies (session Whoop) et stockage web de la WebView. Rejouable. */
    AsyncFunction("effacer") { (promise: Promise) in
      let tout = WKWebsiteDataStore.allWebsiteDataTypes()
      WKWebsiteDataStore.default().removeData(ofTypes: tout, modifiedSince: Date.distantPast) {
        // sharedCookiesEnabled recopie aussi les cookies du magasin de l'appli dans la WebView : vidé de même
        HTTPCookieStorage.shared.removeCookies(since: Date.distantPast)
        promise.resolve(nil)
      }
    }.runOnQueue(.main)
  }

  /** « .whoop.com » vaut pour id.whoop.com ; « id.whoop.com » pour lui seul (et ses sous-domaines, comme WebKit l'admet). */
  private static func domaineVa(_ domaine: String, _ hote: String) -> Bool {
    let d = (domaine.hasPrefix(".") ? String(domaine.dropFirst()) : domaine).lowercased()
    return hote == d || hote.hasSuffix("." + d)
  }
}
