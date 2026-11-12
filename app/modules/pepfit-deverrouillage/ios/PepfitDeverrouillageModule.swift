import ExpoModulesCore
import LocalAuthentication
import UIKit

// Déverrouillage, version iPhone du module Kotlin (mêmes noms, mêmes réponses) : Face ID, Touch ID ou code de l'iPhone
// (LocalAuthentication, politique deviceOwnerAuthentication : la biométrie, puis le code). Réponses : « ok », « annule »,
// « sansVerrou » (aucun code réglé : rien à déverrouiller), « indisponible ». Aussi le verrou d'ouverture (H3) : `estProtege`
// et `masquerApercu` : iOS n'a pas de réglage « pas d'aperçu », on pose une vue opaque sur la fenêtre quand pepfit devient
// inactif (l'image du sélecteur d'applications est prise juste après) et on la retire au retour.
public class PepfitDeverrouillageModule: Module {
  private var masquer = false
  private var cache: UIView?
  private var ecoutes: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("PepfitDeverrouillage")

    OnCreate {
      let centre = NotificationCenter.default
      // l'application et la scène : selon le modèle de l'appli, l'une ou l'autre (ou les deux) est envoyée
      for nom in [UIApplication.willResignActiveNotification, UIScene.willDeactivateNotification] {
        self.ecoutes.append(centre.addObserver(forName: nom, object: nil, queue: .main) { [weak self] _ in self?.poser() })
      }
      for nom in [UIApplication.didBecomeActiveNotification, UIScene.didActivateNotification] {
        self.ecoutes.append(centre.addObserver(forName: nom, object: nil, queue: .main) { [weak self] _ in self?.retirer() })
      }
    }

    OnDestroy {
      self.ecoutes.forEach { NotificationCenter.default.removeObserver($0) }
      self.ecoutes = []
    }

    AsyncFunction("deverrouiller") { (titre: String, _: String, promise: Promise) in
      let contexte = LAContext()
      var erreur: NSError?
      guard contexte.canEvaluatePolicy(.deviceOwnerAuthentication, error: &erreur) else {
        promise.resolve(PepfitDeverrouillageModule.code(erreur) == .passcodeNotSet ? "sansVerrou" : "indisponible")
        return
      }
      // La raison (le titre) s'affiche sous Touch ID et sur le code ; la première fois, Face ID demande son autorisation avec
      // le texte NSFaceIDUsageDescription (plugins/ios-deverrouillage.js).
      contexte.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: titre) { ok, e in
        if ok {
          promise.resolve("ok")
        } else {
          promise.resolve(PepfitDeverrouillageModule.code(e) == .passcodeNotSet ? "sansVerrou" : "annule")
        }
      }
    }.runOnQueue(.main)

    // Un code est-il réglé ? Sans lui, verrouiller pepfit ne protégerait rien (3c).
    Function("estProtege") { () -> Bool in
      var erreur: NSError?
      let ok = LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: &erreur)
      return ok || PepfitDeverrouillageModule.code(erreur) != .passcodeNotSet
    }

    AsyncFunction("masquerApercu") { (oui: Bool) -> Bool in
      self.masquer = oui
      if !oui {
        self.retirer()
      }
      return true
    }.runOnQueue(.main)
  }

  private static func code(_ e: Error?) -> LAError.Code? {
    (e as? LAError)?.code
  }

  private func fenetre() -> UIWindow? {
    let fenetres = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
    return fenetres.first { $0.isKeyWindow } ?? fenetres.first
  }

  private func poser() {
    guard masquer, cache == nil, let f = fenetre() else {
      return
    }
    let v = UIView(frame: f.bounds)
    v.backgroundColor = .systemBackground
    v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    f.addSubview(v)
    cache = v
  }

  private func retirer() {
    cache?.removeFromSuperview()
    cache = nil
  }
}
