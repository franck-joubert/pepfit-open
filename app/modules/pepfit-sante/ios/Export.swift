import HealthKit

// Écriture d'une séance de musculation dans Santé (HKWorkoutBuilder). Même `id` = même séance : HealthKit remplace un objet
// de même HKMetadataKeySyncIdentifier quand HKMetadataKeySyncVersion est plus grande (ici l'heure de l'export, en ms).
struct Export {
  /** Titre de la séance (HKWorkout n'a pas de titre) : métadonnée propre à pepfit, relue par Lectures.seances. */
  static let cleTitre = "PepfitTitre"

  let store: HKHealthStore

  func exporter(_ debut: Double, _ fin: Double, _ titre: String, _ id: String) async throws {
    let config = HKWorkoutConfiguration()
    config.activityType = .traditionalStrengthTraining
    config.locationType = .indoor
    let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: HKDevice.local())
    let metadonnees: [String: Any] = [
      HKMetadataKeySyncIdentifier: id,
      HKMetadataKeySyncVersion: NSNumber(value: Int64(Date().timeIntervalSince1970 * 1000)),
      HKMetadataKeyIndoorWorkout: true,
      Export.cleTitre: titre,
    ]
    try await attendre { builder.beginCollection(withStart: date(debut), completion: $0) }
    try await attendre { builder.addMetadata(metadonnees, completion: $0) }
    try await attendre { builder.endCollection(withEnd: date(fin), completion: $0) }
    try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
      builder.finishWorkout { seance, erreur in
        if let erreur {
          c.resume(throwing: traduire(erreur))
        } else if seance == nil {
          c.resume(throwing: EchecHealthKitException("séance non enregistrée"))
        } else {
          c.resume()
        }
      }
    }
  }

  /** Une étape du builder (rappel (succès, erreur)) en async. */
  private func attendre(_ etape: (@escaping (Bool, Error?) -> Void) -> Void) async throws {
    try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
      etape { ok, erreur in
        if let erreur {
          c.resume(throwing: traduire(erreur))
        } else if !ok {
          c.resume(throwing: EchecHealthKitException("étape de la séance refusée"))
        } else {
          c.resume()
        }
      }
    }
  }
}
