import Foundation

/// Borne de tour : temps de séance hors pauses (ms) et distance cumulée (m) au toucher.
struct Tour {
  let n: Int
  let s: Int64
  let d: Double
}

/// Valeur pour le JS : nil devient null.
func nul(_ v: Any?) -> Any {
  return v ?? NSNull()
}

/// Horloge qui avance aussi quand le téléphone dort (équivalent d'elapsedRealtime), en ms.
func horlogeMonotone() -> Int64 {
  return Int64(clock_gettime_nsec_np(CLOCK_MONOTONIC) / 1_000_000)
}

/// Heure murale en ms depuis 1970 (System.currentTimeMillis).
func horloge() -> Int64 {
  return Int64((Date().timeIntervalSince1970 * 1000).rounded())
}

/// Nombre venu du JS en ms : 0 s'il n'est pas fini.
func ms(_ d: Double) -> Int64 {
  return d.isFinite ? Int64(d) : 0
}

/**
 * État du suivi, partagé par le module (fil du JS) et le service (fil principal) : même rôle que Suivi.kt. Le tampon sur
 * disque (Application Support/suivi/<id>/ : etat.json, points.csv, fc.csv) survit à la mort du JS et du processus : il reste
 * jusqu'à `effacer(id)`, une fois la séance enregistrée par l'appli. Tout passe par `verrou` (récursif).
 */
enum Suivi {
  static let PRECISION_MAX_M = 30.0
  static let VITESSE_MAX_MS = 15.0
  static let SAUTS_REANCRAGE = 3
  private static let GPS_PERDU_MS: Int64 = 10_000

  static let verrou = NSRecursiveLock()

  static func avec<T>(_ f: () -> T) -> T {
    verrou.lock()
    defer { verrou.unlock() }
    return f()
  }

  static var statut = "arrete"
  static var id: String?
  static var mode: String?
  static var titre = "Suivi"
  static var debut: Int64 = 0
  static var pauseDebut: Int64?
  static var pauseCumulMs: Int64 = 0
  static var distanceM = 0.0
  static var tours: [Tour] = []

  static var gpsEtat = "coupe"
  static var lat: Double?
  static var lon: Double?
  static var precision: Double?
  static var altGps: Double?
  static var vitesse: Double?
  static var fixT: Int64?
  /// Dernier point sûr (lat, lon, s).
  private static var origine: (Double, Double, Int64)?
  /// Sauts d'affilée : au 3e, la position devient l'origine sans compter (premier fix périmé).
  private static var sauts = 0

  static var fcEtat = "coupe"
  static var bpm: Int?
  static var contact: Bool?
  static var fcT: Int64?
  static var appareil: String?
  /// Identifiant du capteur pour iOS (CBPeripheral.identifier) : l'adresse MAC n'est pas lisible sur iPhone.
  static var adresse: String?

  static var baroPresent = false
  static var pression: Double?
  static var altBaro: Double?

  static var nbPoints = 0
  static var nbFc = 0

  /// Abonné du module (événement « etat ») ; nil quand le JS n'écoute pas.
  static var ecouteur: (([String: Any]) -> Void)?

  private static var dossier: URL?
  private static var points: FileHandle?
  private static var fcs: FileHandle?

  static func racine() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("suivi", isDirectory: true)
  }

  // Journal des coupures (padel du 30/10) : suivi/journal.csv, une ligne « heure,événement,détail » par connexion, perte,
  // reprise, passage en arrière-plan, verrouillage ou relance. Rien de personnel : ni identifiant ni nom du capteur, ni FC, ni
  // position. Hors des dossiers de suivi (tampons() ne liste que ceux-ci) ; effacé avec les données du téléphone (oublier).
  static let JOURNAL_MAX = 2000
  private static var journalOuvert = false

  static func journalFichier() -> URL {
    return racine().appendingPathComponent("journal.csv")
  }

  /// Ouvre le journal (début du service) ; au-delà de JOURNAL_MAX lignes, seule la seconde moitié reste.
  static func ouvrirJournal() {
    verrou.lock()
    defer { verrou.unlock() }
    journalOuvert = true
    let f = journalFichier()
    try? FileManager.default.createDirectory(at: racine(), withIntermediateDirectories: true)
    guard let texte = try? String(contentsOf: f, encoding: .utf8) else { return }
    let lignes = texte.split(separator: "\n")
    if lignes.count > JOURNAL_MAX {
      try? (lignes.suffix(JOURNAL_MAX / 2).joined(separator: "\n") + "\n").write(to: f, atomically: true, encoding: .utf8)
    }
  }

  /// `detail` : un code ou un nombre, jamais une virgule ni une donnée personnelle.
  static func journal(_ evenement: String, _ detail: Any? = nil) {
    verrou.lock()
    defer { verrou.unlock() }
    guard journalOuvert else { return }
    let d = detail.map { String(describing: $0).replacingOccurrences(of: ",", with: ";") } ?? ""
    let h = ouvrirEnAjout(journalFichier())
    ecrire(h, "\(horloge()),\(evenement),\(d)\n")
    try? h?.close()
  }

  static func tempsMs(_ maintenant: Int64 = horloge()) -> Int64 {
    verrou.lock()
    defer { verrou.unlock() }
    if statut == "arrete" && debut == 0 { return 0 }
    return max(0, (pauseDebut ?? maintenant) - debut - pauseCumulMs)
  }

  /// `depuis`, `pauses` : muscu, le chrono de la séance déjà commencée (le tampon garde l'heure réelle de chaque mesure).
  static func ouvrir(mode nouveauMode: String, titre nouveauTitre: String, depuis: Int64?, pauses: Int64) {
    verrou.lock()
    defer { verrou.unlock() }
    fermer()
    let maintenant = horloge()
    let nouvelId = String(maintenant)
    id = nouvelId
    mode = nouveauMode
    titre = nouveauTitre
    statut = "en_cours"
    if let d = depuis, d >= 1, d <= maintenant { debut = d } else { debut = maintenant }
    pauseDebut = nil
    pauseCumulMs = depuis != nil ? max(0, pauses) : 0
    distanceM = 0
    tours = []
    origine = nil
    sauts = 0
    gpsEtat = nouveauMode == "course" ? "attente" : "coupe"
    lat = nil; lon = nil; precision = nil; altGps = nil; vitesse = nil; fixT = nil
    bpm = nil; contact = nil; fcT = nil
    pression = nil; altBaro = nil
    nbPoints = 0; nbFc = 0
    let dir = racine().appendingPathComponent(nouvelId, isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    dossier = dir
    ecrireFichiers()
    sauver()
  }

  /// Reprend un suivi en cours après la mort du processus (appli rouverte, ou relancée par iOS pour le Bluetooth).
  static func restaurer() -> Bool {
    verrou.lock()
    defer { verrou.unlock() }
    let fm = FileManager.default
    let r = racine()
    guard let noms = try? fm.contentsOfDirectory(atPath: r.path) else { return false }
    let avecEtat = noms.filter { fm.fileExists(atPath: r.appendingPathComponent($0).appendingPathComponent("etat.json").path) }
    guard let nom = avecEtat.max() else { return false }
    let dir = r.appendingPathComponent(nom, isDirectory: true)
    guard let data = try? Data(contentsOf: dir.appendingPathComponent("etat.json")),
          let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return false }
    let st = j["statut"] as? String ?? ""
    if st != "en_cours" && st != "pause" { return false }
    id = nom
    mode = j["mode"] as? String ?? "course"
    titre = j["titre"] as? String ?? "Suivi"
    statut = st
    debut = entier(j["debut"]) ?? 0
    pauseDebut = entier(j["pauseDebut"])
    pauseCumulMs = entier(j["pauseCumulMs"]) ?? 0
    distanceM = (j["distanceM"] as? NSNumber)?.doubleValue ?? 0
    adresse = j["adresse"] as? String
    nbPoints = Int(entier(j["nbPoints"]) ?? 0)
    nbFc = Int(entier(j["nbFc"]) ?? 0)
    tours = ((j["tours"] as? [[String: Any]]) ?? []).map {
      Tour(n: Int(entier($0["n"]) ?? 0), s: entier($0["s"]) ?? 0, d: ($0["d"] as? NSNumber)?.doubleValue ?? 0)
    }
    origine = nil
    sauts = 0
    gpsEtat = mode == "course" ? "attente" : "coupe"
    dossier = dir
    ecrireFichiers()
    return true
  }

  private static func entier(_ v: Any?) -> Int64? {
    return (v as? NSNumber)?.int64Value
  }

  private static func ecrireFichiers() {
    guard let dir = dossier else { return }
    points = ouvrirEnAjout(dir.appendingPathComponent("points.csv"))
    fcs = ouvrirEnAjout(dir.appendingPathComponent("fc.csv"))
  }

  private static func ouvrirEnAjout(_ url: URL) -> FileHandle? {
    if !FileManager.default.fileExists(atPath: url.path) {
      FileManager.default.createFile(atPath: url.path, contents: nil)
    }
    guard let h = try? FileHandle(forWritingTo: url) else { return nil }
    _ = try? h.seekToEnd()
    return h
  }

  /// FileHandle écrit sans tampon : la ligne est sur disque au retour (comme le flush() du Kotlin).
  private static func ecrire(_ h: FileHandle?, _ ligne: String) {
    guard let h = h, let d = ligne.data(using: .utf8) else { return }
    try? h.write(contentsOf: d)
  }

  static func fermer() {
    verrou.lock()
    defer { verrou.unlock() }
    try? points?.close()
    try? fcs?.close()
    points = nil
    fcs = nil
  }

  static func pause() -> Bool {
    verrou.lock()
    defer { verrou.unlock() }
    if statut != "en_cours" { return false }
    statut = "pause"
    pauseDebut = horloge()
    origine = nil
    sauver()
    return true
  }

  static func reprendre() -> Bool {
    verrou.lock()
    defer { verrou.unlock() }
    if statut != "pause" { return false }
    let maintenant = horloge()
    pauseCumulMs += maintenant - (pauseDebut ?? maintenant)
    pauseDebut = nil
    statut = "en_cours"
    sauver()
    return true
  }

  static func tour() -> Tour? {
    verrou.lock()
    defer { verrou.unlock() }
    if statut != "en_cours" { return nil }
    let t = Tour(n: tours.count + 1, s: tempsMs(), d: distanceM)
    tours.append(t)
    sauver()
    return t
  }

  static func terminer() {
    verrou.lock()
    defer { verrou.unlock() }
    if statut == "arrete" { return }
    // la fin est figée comme une pause sans reprise : en pause, le chrono s'est déjà arrêté au début de la pause
    if statut == "en_cours" { pauseDebut = horloge() }
    statut = "arrete"
    gpsEtat = "coupe"
    fcEtat = "coupe"
    sauver()
    fermer()
  }

  /// Nouveau fix GPS : point écrit (pas en pause), distance filtrée comme dans logique.ts.
  static func position(_ la: Double, _ lo: Double, _ prec: Double, alt: Double?, vit: Double?) {
    verrou.lock()
    defer { verrou.unlock() }
    let maintenant = horloge()
    lat = la; lon = lo; precision = prec; altGps = alt; vitesse = vit; fixT = maintenant
    gpsEtat = "ok"
    if statut != "en_cours" { return }
    let s = tempsMs(maintenant)
    var d = 0.0
    var dt = 0.0
    if let o = origine {
      d = haversineM(o.0, o.1, la, lo)
      dt = Double(s - o.2) / 1000
    }
    let saut = dt > 0 && d / dt > VITESSE_MAX_MS
    if prec <= PRECISION_MAX_M {
      if !saut {
        if dt > 0 { distanceM += d }
        origine = (la, lo, s)
        sauts = 0
      } else {
        sauts += 1
        if sauts >= SAUTS_REANCRAGE {
          origine = (la, lo, s)
          sauts = 0
        }
      }
    }
    let ab = altBaro.map { String($0) } ?? ""
    let ag = alt.map { String($0) } ?? ""
    let v = vit.map { String($0) } ?? ""
    ecrire(points, "\(maintenant),\(s),\(la),\(lo),\(ab),\(ag),\(prec),\(v)\n")
    nbPoints += 1
  }

  static func frequence(_ valeur: Int, contact c: Bool?) {
    verrou.lock()
    defer { verrou.unlock() }
    let maintenant = horloge()
    bpm = valeur; contact = c; fcT = maintenant
    fcEtat = "connecte"
    if statut == "arrete" { return }
    ecrire(fcs, "\(maintenant),\(tempsMs(maintenant)),\(valeur)\n")
    nbFc += 1
  }

  static func barometre(_ hPa: Double) {
    verrou.lock()
    defer { verrou.unlock() }
    let p = pression.map { $0 + 0.1 * (hPa - $0) } ?? hPa
    pression = p
    altBaro = 44330.0 * (1 - pow(p / 1013.25, 1 / 5.255))
  }

  /// Appelé chaque seconde : GPS perdu au-delà de 10 s sans fix.
  static func verifierGps() {
    verrou.lock()
    defer { verrou.unlock() }
    if gpsEtat == "ok", let t = fixT, horloge() - t > GPS_PERDU_MS { gpsEtat = "perdu" }
  }

  static func sauver() {
    verrou.lock()
    defer { verrou.unlock() }
    guard let dir = dossier else { return }
    let j: [String: Any] = [
      "statut": statut, "mode": nul(mode), "titre": titre, "debut": debut,
      "pauseDebut": nul(pauseDebut), "pauseCumulMs": pauseCumulMs,
      "distanceM": distanceM, "adresse": nul(adresse),
      "nbPoints": nbPoints, "nbFc": nbFc,
      "tours": tours.map { ["n": $0.n, "s": $0.s, "d": $0.d] as [String: Any] },
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: j) else { return }
    // .atomic : fichier temporaire puis renommage, comme etat.json.tmp du Kotlin
    try? data.write(to: dir.appendingPathComponent("etat.json"), options: .atomic)
  }

  static func instantane() -> [String: Any] {
    verrou.lock()
    defer { verrou.unlock() }
    let maintenant = horloge()
    return [
      "statut": statut, "id": nul(id), "mode": nul(mode),
      "debut": nul(debut == 0 ? nil : Double(debut)),
      "pauseDebut": nul(pauseDebut.map { Double($0) }), "pauseCumulMs": Double(pauseCumulMs),
      "tempsMs": Double(tempsMs(maintenant)), "distanceM": distanceM,
      "gps": [
        "etat": gpsEtat, "lat": nul(lat), "lon": nul(lon), "precision": nul(precision), "altitude": nul(altGps),
        "vitesse": nul(vitesse), "ageMs": nul(fixT.map { Double(maintenant - $0) }),
      ] as [String: Any],
      "fc": [
        "etat": fcEtat, "bpm": nul(bpm), "contact": nul(contact), "ageMs": nul(fcT.map { Double(maintenant - $0) }),
        "appareil": nul(appareil), "adresse": nul(adresse),
      ] as [String: Any],
      "baro": ["present": baroPresent, "pression": nul(pression), "altitude": nul(altBaro)] as [String: Any],
      "tours": tours.map { ["n": $0.n, "s": Double($0.s), "d": $0.d] as [String: Any] },
      "nbPoints": nbPoints, "nbFc": nbFc,
    ]
  }

  /// Envoie l'instantané au JS s'il écoute (hors du verrou).
  static func emettre() {
    let (e, f) = avec { (instantane(), ecouteur) }
    f?(e)
  }

  /// Lignes d'un tampon CSV à partir de `depuis` : nombres, ou null pour une case vide.
  static func lire(_ url: URL, depuis: Int) -> [Any] {
    guard let texte = try? String(contentsOf: url, encoding: .utf8) else { return [] }
    return texte.split(separator: "\n").dropFirst(max(0, depuis))
      .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
      .map { l -> Any in
        l.split(separator: ",", omittingEmptySubsequences: false).map { c -> Any in nul(Double(c)) }
      }
  }

  private static func haversineM(_ la1: Double, _ lo1: Double, _ la2: Double, _ lo2: Double) -> Double {
    let r = Double.pi / 180
    let a = sin((la2 - la1) * r / 2)
    let b = sin((lo2 - lo1) * r / 2)
    let h = a * a + cos(la1 * r) * cos(la2 * r) * b * b
    return 2 * 6_371_008.8 * asin(min(1.0, sqrt(h)))
  }
}
