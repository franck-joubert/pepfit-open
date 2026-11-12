import AuthenticationServices
import ExpoModulesCore
import SafariServices
import UIKit

// Navigateur, version iPhone du module Kotlin (mêmes noms, plus `authentifier`).
// - `ouvrir` : une adresse de pep.fit que l'appli ne montre pas (page du site, mot réservé : src/liens.ts) s'ouvre dans
//   SFSafariViewController, par-dessus l'appli : il n'ouvre jamais les liens universels, donc pas de boucle vers pepfit
//   (l'équivalent du navigateur désigné par son paquet sur Android).
// - `passerDerriere` : iOS ne laisse pas une appli en ramener une autre ; faux, l'écran le dit (Ordinateur, « impossible »).
// - `authentifier` : connexion OAuth (Whoop, Withings) dans ASWebAuthenticationSession, la feuille de connexion d'Apple ;
//   rend l'adresse de retour (pepfitopen://whoop?…), nil si la personne ferme la feuille.
public class PepfitNavigateurModule: Module {
  private var session: ASWebAuthenticationSession?
  private let fournisseur = Fournisseur()

  public func definition() -> ModuleDefinition {
    Name("PepfitNavigateur")

    /** Ouvre `url` par-dessus l'appli ; faux si l'adresse n'est pas une page web. */
    Function("ouvrir") { (url: String) -> Bool in
      guard let adresse = URL(string: url), ["http", "https"].contains(adresse.scheme?.lowercased() ?? "") else {
        return false
      }
      // Au démarrage par un lien, la fenêtre n'est pas encore là : un second essai une demi-seconde plus tard.
      DispatchQueue.main.async {
        if !PepfitNavigateurModule.presenter(adresse) {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { _ = PepfitNavigateurModule.presenter(adresse) }
        }
      }
      return true
    }

    Function("passerDerriere") { () -> Bool in
      false
    }

    AsyncFunction("authentifier") { (url: String, schema: String, promise: Promise) in
      guard let adresse = URL(string: url) else {
        promise.resolve(nil)
        return
      }
      self.session?.cancel()
      let s = ASWebAuthenticationSession(url: adresse, callbackURLScheme: schema) { [weak self] retour, _ in
        self?.session = nil
        // fermée par la personne (canceledLogin) ou en échec : rien, comme un retour du navigateur sans réponse sur Android
        promise.resolve(retour?.absoluteString)
      }
      s.presentationContextProvider = self.fournisseur
      // Session partagée avec Safari : une connexion Whoop déjà ouverte y est reprise.
      s.prefersEphemeralWebBrowserSession = false
      self.session = s
      if !s.start() {
        self.session = nil
        promise.resolve(nil)
      }
    }.runOnQueue(.main)
  }

  private static func fenetre() -> UIWindow? {
    let fenetres = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
    return fenetres.first { $0.isKeyWindow } ?? fenetres.first
  }

  @discardableResult
  private static func presenter(_ adresse: URL) -> Bool {
    guard var haut = fenetre()?.rootViewController else {
      return false
    }
    while let suivant = haut.presentedViewController {
      haut = suivant
    }
    haut.present(SFSafariViewController(url: adresse), animated: true)
    return true
  }

  private class Fournisseur: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
      PepfitNavigateurModule.fenetre() ?? ASPresentationAnchor()
    }
  }
}
