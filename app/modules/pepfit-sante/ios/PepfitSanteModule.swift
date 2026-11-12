import ExpoModulesCore
import HealthKit
import UIKit

// Santé (HealthKit) : accès bruts par identifiant HealthKit, sans logique. La correspondance avec Santé Connect (autorisations,
// sommeil, règles, types de séance) et toute la logique sont côté JS (src/natif/sante/healthkit.ts et logique.ts), testées
// avec ce module simulé. docs/CODE-IOS-SANTE.md.
public final class PepfitSanteModule: Module {
  private let store = HKHealthStore()
  /** Autorisations sans type HealthKit déjà demandées (masse osseuse, eau, historique : rien à demander à HealthKit). */
  private static let cleMarquees = "PepfitSante.marquees"

  public func definition() -> ModuleDefinition {
    Name("PepfitSante")

    Function("disponible") { () -> Bool in
      HKHealthStore.isHealthDataAvailable()
    }

    /** Lecture, type par type : 0 inconnu, 1 jamais demandée, 2 déjà demandée. HealthKit ne dit jamais si une lecture est refusée. */
    AsyncFunction("statutsLecture") { (ids: [String]) async throws -> [Int] in
      var r: [Int] = []
      for id in ids {
        guard let type = TypesSante.type(id) else {
          r.append(0)
          continue
        }
        r.append(try await self.statutDemande(lecture: [type]))
      }
      return r
    }

    /** Écriture : 0 jamais demandée, 1 refusée, 2 autorisée. */
    AsyncFunction("statutsEcriture") { (ids: [String]) -> [Int] in
      ids.map { id -> Int in
        guard let type = TypesSante.type(id) else {
          return 0
        }
        switch self.store.authorizationStatus(for: type) {
        case .sharingAuthorized:
          return 2
        case .sharingDenied:
          return 1
        default:
          return 0
        }
      }
    }

    AsyncFunction("marquees") { () -> [String] in
      UserDefaults.standard.stringArray(forKey: Self.cleMarquees) ?? []
    }

    /** Fenêtre d'autorisation de Santé (seulement s'il y a des types) ; les `marques` sont retenues une fois la demande faite. */
    AsyncFunction("demander") { (lecture: [String], ecriture: [String], marques: [String]) async throws -> Void in
      let lus = try lecture.map { id -> HKObjectType in
        guard let t = TypesSante.type(id) else { throw TypeInconnuException(id) }
        return t
      }
      let ecrits = try ecriture.map { id -> HKSampleType in
        guard let t = TypesSante.type(id) else { throw TypeInconnuException(id) }
        return t
      }
      if !lus.isEmpty || !ecrits.isEmpty {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
          self.store.requestAuthorization(toShare: Set(ecrits), read: Set(lus)) { _, erreur in
            if let erreur {
              c.resume(throwing: traduire(erreur))
            } else {
              c.resume()
            }
          }
        }
      }
      if !marques.isEmpty {
        let deja = UserDefaults.standard.stringArray(forKey: Self.cleMarquees) ?? []
        UserDefaults.standard.set(Array(Set(deja).union(marques)).sorted(), forKey: Self.cleMarquees)
      }
    }

    AsyncFunction("quantites") { (id: String, debut: Double, fin: Double) async throws -> [[String: Any]] in
      try await Lectures(store: self.store).quantites(id, debut, fin)
    }

    AsyncFunction("categories") { (id: String, debut: Double, fin: Double) async throws -> [[String: Any]] in
      try await Lectures(store: self.store).categories(id, debut, fin)
    }

    AsyncFunction("sommes") { (id: String, bornes: [Double]) async throws -> [Double] in
      try await Lectures(store: self.store).sommes(id, bornes)
    }

    AsyncFunction("sommesGroupees") { (id: String, debut: Double, fin: Double, pas: String) async throws -> [[Double]] in
      try await Lectures(store: self.store).sommesGroupees(id, debut, fin, parJour: pas == "jour")
    }

    AsyncFunction("sources") { (id: String, debut: Double, fin: Double) async throws -> [String] in
      try await Lectures(store: self.store).sources(id, debut, fin)
    }

    AsyncFunction("seances") { (debut: Double, fin: Double) async throws -> [[String: Any]] in
      try await Lectures(store: self.store).seances(debut, fin)
    }

    AsyncFunction("exporter") { (debut: Double, fin: Double, titre: String, id: String) async throws -> Void in
      try await Export(store: self.store).exporter(debut, fin, titre, id)
    }

    /** L'appli Santé (pas d'adresse officielle : x-apple-health://), sinon les réglages de pepfit. */
    AsyncFunction("ouvrirSante") { (promise: Promise) in
      let reglages = { () in
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
          promise.resolve(nil)
          return
        }
        UIApplication.shared.open(url, options: [:]) { _ in promise.resolve(nil) }
      }
      guard let sante = URL(string: "x-apple-health://") else {
        reglages()
        return
      }
      UIApplication.shared.open(sante, options: [:]) { ok in
        if ok {
          promise.resolve(nil)
        } else {
          reglages()
        }
      }
    }.runOnQueue(.main)
  }

  private func statutDemande(lecture: Set<HKObjectType>) async throws -> Int {
    try await withCheckedThrowingContinuation { (c: CheckedContinuation<Int, Error>) in
      store.getRequestStatusForAuthorization(toShare: [], read: lecture) { statut, erreur in
        if let erreur {
          c.resume(throwing: traduire(erreur))
          return
        }
        switch statut {
        case .unnecessary:
          c.resume(returning: 2)
        case .shouldRequest:
          c.resume(returning: 1)
        default:
          c.resume(returning: 0)
        }
      }
    }
  }
}
