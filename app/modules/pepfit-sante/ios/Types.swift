import HealthKit

// Types HealthKit lus ou écrits par pepfit, par identifiant en clair (celui que donne le JS, src/natif/sante/healthkit.ts),
// et l'unité de chaque quantité. Tout identifiant hors de cette liste est refusé : pas de HKUnit(from:) sur une chaîne
// venue du JS (une unité inconnue y lève une exception Objective-C, qui ferait planter l'appli).
enum TypesSante {
  /** Quantités lues et leur unité (celle des valeurs de Santé Connect, sauf le gras : fraction, mise en % côté JS). */
  static let unites: [HKQuantityTypeIdentifier: HKUnit] = [
    .bodyMass: .gramUnit(with: .kilo),
    .stepCount: .count(),
    .restingHeartRate: HKUnit.count().unitDivided(by: .minute()),
    .heartRate: HKUnit.count().unitDivided(by: .minute()),
    .bodyFatPercentage: .percent(),
    .leanBodyMass: .gramUnit(with: .kilo),
    .basalEnergyBurned: .kilocalorie(),
    .heartRateVariabilitySDNN: .secondUnit(with: .milli),
    .respiratoryRate: HKUnit.count().unitDivided(by: .minute()),
    .activeEnergyBurned: .kilocalorie(),
    .distanceWalkingRunning: .meter(),
    .height: .meterUnit(with: .centi),
  ]

  static let categories: Set<HKCategoryTypeIdentifier> = [.sleepAnalysis, .menstrualFlow]

  /** Type d'échantillon d'un identifiant connu (quantité, catégorie ou séance) ; nil sinon. */
  static func type(_ id: String) -> HKSampleType? {
    if id == HKWorkoutTypeIdentifier {
      return HKObjectType.workoutType()
    }
    let q = HKQuantityTypeIdentifier(rawValue: id)
    if unites[q] != nil {
      return HKObjectType.quantityType(forIdentifier: q)
    }
    let c = HKCategoryTypeIdentifier(rawValue: id)
    if categories.contains(c) {
      return HKObjectType.categoryType(forIdentifier: c)
    }
    return nil
  }

  static func quantite(_ id: String) throws -> (HKQuantityType, HKUnit) {
    let q = HKQuantityTypeIdentifier(rawValue: id)
    guard let unite = unites[q], let type = HKObjectType.quantityType(forIdentifier: q) else {
      throw TypeInconnuException(id)
    }
    return (type, unite)
  }

  static func categorie(_ id: String) throws -> HKCategoryType {
    let c = HKCategoryTypeIdentifier(rawValue: id)
    guard categories.contains(c), let type = HKObjectType.categoryType(forIdentifier: c) else {
      throw TypeInconnuException(id)
    }
    return type
  }
}

/** Dates du JS (ms depuis 1970) ↔ Date. */
func date(_ ms: Double) -> Date {
  Date(timeIntervalSince1970: ms / 1000)
}

func ms(_ d: Date) -> Double {
  (d.timeIntervalSince1970 * 1000).rounded()
}
