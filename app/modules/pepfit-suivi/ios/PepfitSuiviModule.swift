import CoreMotion
import ExpoModulesCore
import Foundation

struct OptionsSuivi: Record {
  @Field var mode: String = "course"
  @Field var fc: Bool = true
  @Field var appareil: String? = nil
  @Field var titre: String = "Suivi"
  /// Muscu : début et pauses de la séance (ms), pour que le chrono soit celui de la séance.
  @Field var debut: Double? = nil
  @Field var pauseCumulMs: Double = 0
}

private let PREFS = "pepfit-suivi"

// Suivi GPS et FC en direct, version iPhone de PepfitSuiviModule.kt : mêmes fonctions, mêmes valeurs rendues, même
// événement « etat ». En plus : les autorisations d'iOS (demanderPosition, etatBluetooth, demanderBluetooth). En moins :
// batterie, ouvrirReglagesBatterie et ouvrirAppli, propres à Android (la couche JS, fabrique-ios.ts, y répond).
// Les fonctions tournent sur le fil du JS ; GPS, baromètre et Bluetooth sur le fil principal (DispatchQueue.main).
public class PepfitSuiviModule: Module {
  private var prefs: UserDefaults {
    return UserDefaults(suiteName: PREFS) ?? .standard
  }

  public func definition() -> ModuleDefinition {
    Name("PepfitSuivi")
    Events("etat")

    OnStartObserving {
      Suivi.avec { Suivi.ecouteur = { [weak self] e in self?.sendEvent("etat", e) } }
    }
    OnStopObserving {
      Suivi.avec { Suivi.ecouteur = nil }
    }

    // Tout iPhone a un GPS et le Bluetooth basse consommation ; « android » vaut 0, « promu » (Android 16) est faux.
    Function("capteurs") { () -> [String: Any] in
      return [
        "barometre": CMAltimeter.isRelativeAltitudeAvailable(),
        "gps": true,
        "bluetooth": true,
        "android": 0,
        "promu": false,
      ]
    }

    AsyncFunction("demanderPosition") { (promise: Promise) in
      Autorisations.partage.demanderPosition { ok in promise.resolve(ok) }
    }

    Function("etatBluetooth") { () -> String in
      return Autorisations.etatBluetooth()
    }

    AsyncFunction("demanderBluetooth") { (promise: Promise) in
      Autorisations.partage.demanderBluetooth { r in promise.resolve(r) }
    }

    /// Démarre le suivi ; les autorisations ont été demandées par le JS (demanderPosition, demanderBluetooth).
    Function("demarrer") { (o: OptionsSuivi) throws -> [String: Any] in
      if Suivi.avec({ Suivi.statut }) != "arrete" { return Suivi.instantane() }
      if o.mode != "course" && o.mode != "fc" && o.mode != "muscu" {
        throw Exception(name: "ERR_MODE", description: "mode inconnu : \(o.mode)", code: "ERR_MODE")
      }
      let adresse = o.appareil ?? self.prefs.string(forKey: "appareil")
      Suivi.ouvrir(mode: o.mode, titre: o.titre, depuis: o.debut.map { ms($0) }, pauses: ms(o.pauseCumulMs))
      Suivi.avec { Suivi.adresse = adresse }
      let fc = o.fc
      DispatchQueue.main.async { SuiviService.partage.demarrer(fc: fc, appareil: adresse) }
      return Suivi.instantane()
    }

    Function("pause") { () -> [String: Any] in
      _ = Suivi.pause()
      return Suivi.instantane()
    }

    Function("reprendre") { () -> [String: Any] in
      _ = Suivi.reprendre()
      return Suivi.instantane()
    }

    Function("tour") { () -> [String: Any]? in
      guard let t = Suivi.tour() else { return nil }
      return ["n": t.n, "s": Double(t.s), "d": t.d]
    }

    Function("terminer") { () -> [String: Any] in
      // le capteur trouvé devient celui par défaut des prochains suivis
      if let a = Suivi.avec({ Suivi.adresse }) { self.prefs.set(a, forKey: "appareil") }
      Suivi.terminer()
      DispatchQueue.main.async {
        Suivi.journal("fin")
        SuiviService.partage.arreter()
      }
      return Suivi.instantane()
    }

    /// État du suivi ; après la mort du processus, reprend le dernier suivi non terminé et relance GPS et capteur.
    Function("etat") { () -> [String: Any]? in
      if Suivi.avec({ Suivi.id }) == nil && !Suivi.restaurer() { return nil }
      if Suivi.avec({ Suivi.statut }) != "arrete" {
        DispatchQueue.main.async { SuiviService.partage.relancer() }
      }
      return Suivi.instantane()
    }

    /// Points du tampon à partir de l'index `depuis` : [t, s, lat, lon, altBaro, altGps, precision, vitesse].
    AsyncFunction("points") { (id: String, depuis: Int) -> [Any] in
      return Suivi.lire(Suivi.racine().appendingPathComponent(id).appendingPathComponent("points.csv"), depuis: depuis)
    }

    /// Échantillons de FC à partir de `depuis` : [t, s, bpm].
    AsyncFunction("frequences") { (id: String, depuis: Int) -> [Any] in
      return Suivi.lire(Suivi.racine().appendingPathComponent(id).appendingPathComponent("fc.csv"), depuis: depuis)
    }

    AsyncFunction("tampons") { () -> [String] in
      let r = Suivi.racine()
      let fm = FileManager.default
      let noms = (try? fm.contentsOfDirectory(atPath: r.path)) ?? []
      return noms.filter { n in
        var dossier: ObjCBool = false
        return fm.fileExists(atPath: r.appendingPathComponent(n).path, isDirectory: &dossier) && dossier.boolValue
      }.sorted()
    }

    AsyncFunction("effacer") { (id: String) throws in
      let (courant, statut) = Suivi.avec { (Suivi.id, Suivi.statut) }
      if id == courant && statut != "arrete" {
        throw Exception(name: "ERR_EN_COURS", description: "suivi en cours", code: "ERR_EN_COURS")
      }
      // jamais la racine ni un chemin : un identifiant de suivi seulement
      if id.isEmpty || id.contains("/") || id.hasPrefix(".") { return }
      try? FileManager.default.removeItem(at: Suivi.racine().appendingPathComponent(id, isDirectory: true))
    }

    /// « Effacer les données de ce téléphone » : suivi arrêté, tampons et préférences (capteur FC) effacés. Rejouable.
    AsyncFunction("oublier") { () in
      Suivi.terminer()
      Suivi.avec {
        Suivi.id = nil
        Suivi.adresse = nil
      }
      DispatchQueue.main.async { SuiviService.partage.arreter() }
      try? FileManager.default.removeItem(at: Suivi.racine())
      self.prefs.removeObject(forKey: "appareil")
      UserDefaults.standard.removePersistentDomain(forName: PREFS)
    }

    AsyncFunction("chercherFc") { (dureeMs: Double, promise: Promise) in
      let d = Int(min(max(dureeMs.isFinite ? dureeMs : 1000, 1000), 30_000))
      // as Any : résolu par la conversion dynamique (liste de dictionnaires)
      Recherche.lister(dureeMs: d) { liste in promise.resolve(liste as Any) }
    }

    /// Journal des coupures : [heure (ms), événement, détail], du plus ancien au plus récent (rien de personnel).
    AsyncFunction("journal") { () -> [Any] in
      guard let texte = try? String(contentsOf: Suivi.journalFichier(), encoding: .utf8) else { return [] }
      return texte.split(separator: "\n")
        .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        .map { l -> Any in
          let p = l.split(separator: ",", maxSplits: 2, omittingEmptySubsequences: false)
          let t = Double(p[0]) ?? 0
          let evenement = p.count > 1 ? String(p[1]) : ""
          let detail = p.count > 2 ? String(p[2]) : ""
          return [t, evenement, detail] as [Any]
        }
    }
  }
}
