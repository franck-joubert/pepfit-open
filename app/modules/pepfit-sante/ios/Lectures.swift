import HealthKit

// Lectures HealthKit, rendues à plat pour le JS (dates en ms). Les requêtes à rappel (HKSampleQuery, HKStatisticsQuery…) sont
// mises en async par des continuations : chaque rappel reprend la continuation une seule fois.
struct Lectures {
  let store: HKHealthStore

  /** Échantillons qui touchent [debut, fin], du plus récent au plus ancien. */
  func echantillons(_ type: HKSampleType, _ debut: Double, _ fin: Double) async throws -> [HKSample] {
    let predicat = HKQuery.predicateForSamples(withStart: date(debut), end: date(fin), options: [])
    let tri = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
    return try await withCheckedThrowingContinuation { (c: CheckedContinuation<[HKSample], Error>) in
      let q = HKSampleQuery(sampleType: type, predicate: predicat, limit: HKObjectQueryNoLimit, sortDescriptors: tri) { _, echantillons, erreur in
        if let erreur {
          c.resume(throwing: traduire(erreur))
        } else {
          c.resume(returning: echantillons ?? [])
        }
      }
      store.execute(q)
    }
  }

  /** Quantités : valeur dans l'unité du type (Types.swift). Une quantité d'une autre dimension est ignorée (doubleValue lèverait). */
  func quantites(_ id: String, _ debut: Double, _ fin: Double) async throws -> [[String: Any]] {
    let (type, unite) = try TypesSante.quantite(id)
    return try await echantillons(type, debut, fin).compactMap { s -> [String: Any]? in
      guard let q = s as? HKQuantitySample, q.quantity.is(compatibleWith: unite) else { return nil }
      return [
        "valeur": q.quantity.doubleValue(for: unite),
        "debut": ms(q.startDate),
        "fin": ms(q.endDate),
        "origine": q.sourceRevision.source.bundleIdentifier,
        "id": q.uuid.uuidString,
      ]
    }
  }

  /** Catégories (sommeil, règles) : la valeur brute HKCategoryValue*, et le premier jour des règles. */
  func categories(_ id: String, _ debut: Double, _ fin: Double) async throws -> [[String: Any]] {
    let type = try TypesSante.categorie(id)
    return try await echantillons(type, debut, fin).compactMap { s -> [String: Any]? in
      guard let c = s as? HKCategorySample else { return nil }
      var r: [String: Any] = [
        "valeur": c.value,
        "debut": ms(c.startDate),
        "fin": ms(c.endDate),
        "origine": c.sourceRevision.source.bundleIdentifier,
        "id": c.uuid.uuidString,
      ]
      if let premier = c.metadata?[HKMetadataKeyMenstrualCycleStart] as? Bool {
        r["debutCycle"] = premier
      }
      return r
    }
  }

  /** Somme cumulée sur [debut, fin] (HealthKit dédoublonne les sources, comme l'agrégat de Santé Connect) ; -1 sans donnée. */
  func somme(_ type: HKQuantityType, _ unite: HKUnit, _ debut: Double, _ fin: Double) async throws -> Double {
    let predicat = HKQuery.predicateForSamples(withStart: date(debut), end: date(fin), options: [])
    return try await withCheckedThrowingContinuation { (c: CheckedContinuation<Double, Error>) in
      let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicat, options: .cumulativeSum) { _, stats, erreur in
        if let erreur {
          if sansDonnee(erreur) {
            c.resume(returning: -1)
          } else {
            c.resume(throwing: traduire(erreur))
          }
          return
        }
        if let s = stats?.sumQuantity(), s.is(compatibleWith: unite) {
          c.resume(returning: s.doubleValue(for: unite))
        } else {
          c.resume(returning: -1)
        }
      }
      store.execute(q)
    }
  }

  /** Somme de chaque intervalle [bornes[i], bornes[i+1]], l'un après l'autre (comme les agrégats du module Kotlin). */
  func sommes(_ id: String, _ bornes: [Double]) async throws -> [Double] {
    let (type, unite) = try TypesSante.quantite(id)
    var r: [Double] = []
    if bornes.count < 2 {
      return r
    }
    for i in 0..<(bornes.count - 1) {
      r.append(try await somme(type, unite, bornes[i], bornes[i + 1]))
    }
    return r
  }

  /**
   * Sommes par heure (tranches qui partent de `debut`) ou par jour (calendrier local, depuis minuit du jour de `debut`) en UNE
   * requête (HKStatisticsCollectionQuery) : [début, fin, somme] des seules tranches avec une donnée.
   */
  func sommesGroupees(_ id: String, _ debut: Double, _ fin: Double, parJour: Bool) async throws -> [[Double]] {
    let (type, unite) = try TypesSante.quantite(id)
    let ancre = parJour ? Calendar.current.startOfDay(for: date(debut)) : date(debut)
    let jusqua = date(fin)
    if jusqua <= ancre {
      return []
    }
    var pas = DateComponents()
    if parJour {
      pas.day = 1
    } else {
      pas.hour = 1
    }
    let predicat = HKQuery.predicateForSamples(withStart: ancre, end: jusqua, options: [])
    let store = self.store
    return try await withCheckedThrowingContinuation { (c: CheckedContinuation<[[Double]], Error>) in
      let q = HKStatisticsCollectionQuery(
        quantityType: type,
        quantitySamplePredicate: predicat,
        options: .cumulativeSum,
        anchorDate: ancre,
        intervalComponents: pas
      )
      q.initialResultsHandler = { requete, collection, erreur in
        // sans statisticsUpdateHandler la requête ne suit pas les mises à jour ; on l'arrête quand même par sûreté
        store.stop(requete)
        if let erreur {
          if sansDonnee(erreur) {
            c.resume(returning: [])
          } else {
            c.resume(throwing: traduire(erreur))
          }
          return
        }
        var r: [[Double]] = []
        collection?.enumerateStatistics(from: ancre, to: jusqua) { s, _ in
          if let somme = s.sumQuantity(), somme.is(compatibleWith: unite) {
            r.append([ms(s.startDate), ms(s.endDate), somme.doubleValue(for: unite)])
          }
        }
        c.resume(returning: r)
      }
      store.execute(q)
    }
  }

  /** Sources (bundleIdentifier) qui ont écrit ce type sur [debut, fin]. */
  func sources(_ id: String, _ debut: Double, _ fin: Double) async throws -> [String] {
    guard let type = TypesSante.type(id) else {
      throw TypeInconnuException(id)
    }
    let predicat = HKQuery.predicateForSamples(withStart: date(debut), end: date(fin), options: [])
    return try await withCheckedThrowingContinuation { (c: CheckedContinuation<[String], Error>) in
      let q = HKSourceQuery(sampleType: type, samplePredicate: predicat) { _, sources, erreur in
        if let erreur {
          c.resume(throwing: traduire(erreur))
        } else {
          c.resume(returning: (sources ?? []).map { $0.bundleIdentifier }.sorted())
        }
      }
      store.execute(q)
    }
  }

  /** Séances (HKWorkout, toutes applis) qui touchent [debut, fin] : type d'activité brut, intérieur, lieu de nage, titre pepfit. */
  func seances(_ debut: Double, _ fin: Double) async throws -> [[String: Any]] {
    return try await echantillons(HKObjectType.workoutType(), debut, fin).compactMap { s -> [String: Any]? in
      guard let w = s as? HKWorkout else { return nil }
      var r: [String: Any] = [
        "debut": ms(w.startDate),
        "fin": ms(w.endDate),
        "activite": Int(w.workoutActivityType.rawValue),
        "origine": w.sourceRevision.source.bundleIdentifier,
      ]
      if let interieur = w.metadata?[HKMetadataKeyIndoorWorkout] as? Bool {
        r["interieur"] = interieur
      }
      if let lieu = w.metadata?[HKMetadataKeySwimmingLocationType] as? NSNumber {
        r["lieuNage"] = lieu.intValue
      }
      if let titre = w.metadata?[Export.cleTitre] as? String {
        r["titre"] = titre
      }
      return r
    }
  }
}
