import CoreBluetooth
import CoreLocation
import CoreMotion
import Foundation
import UIKit

/**
 * Équivalent iOS de SuiviService.kt, sur le fil principal. iOS n'a pas de service au premier plan :
 * 1. course : GPS par CoreLocation (précision maximale, activité « fitness », jamais de pause automatique), qui continue en
 *    arrière-plan grâce au mode location (indicateur bleu de localisation dans la barre d'état, à la place de la
 *    notification d'Android) et garde l'appli en vie : battement d'une seconde, baromètre et capteur compris ;
 * 2. fc et muscu (sans GPS) : l'appli est suspendue en arrière-plan, mais iOS la réveille à chaque mesure du capteur (mode
 *    bluetooth-central) ; le battement reprend au retour ;
 * 3. pas de wake lock : rien à tenir, iOS réveille l'appli pour le GPS et le Bluetooth ;
 * 4. pas de notification avec chrono ni d'action Pause (à faire, si besoin, en Live Activity).
 * Journal local des coupures (Suivi.journal) : arrière-plan, verrouillage, économie d'énergie, relance.
 */
final class SuiviService: NSObject, CLLocationManagerDelegate {
  static let partage = SuiviService()

  private var lm: CLLocationManager?
  private let altimetre = CMAltimeter()
  private var gpsActif = false
  private var baroActif = false
  private var fcActive = false
  /// Choix de la FC du démarrage en cours (nil après la mort du processus : règle du Kotlin, capteur connu ou muscu).
  private var fcVoulue: Bool?
  private var battement: Timer?
  private var derniereSauvegarde: Int64 = 0
  /// Position exacte demandée une fois par suivi (pas à chaque retour au premier plan).
  private var precisionDemandee = false
  private var observateurs: [NSObjectProtocol] = []

  private override init() {
    super.init()
    // retour au premier plan : relance ce qu'iOS n'a pas laissé démarrer en arrière-plan (GPS après une relance Bluetooth)
    NotificationCenter.default.addObserver(
      self, selector: #selector(premierPlan), name: UIApplication.didBecomeActiveNotification, object: nil)
  }

  @objc private func premierPlan() {
    relancer()
  }

  /// Le mode d'arrière-plan est-il déclaré (plugins/ios-suivi.js) ? Sans lui, allowsBackgroundLocationUpdates plante.
  static func arrierePlanDeclare(_ mode: String) -> Bool {
    return (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains(mode) ?? false
  }

  /// Démarre (ou complète) le suivi ouvert par Suivi.ouvrir ou Suivi.restaurer. Rejouable.
  func demarrer(fc: Bool, appareil: String?) {
    let (statut, mode, adresse) = Suivi.avec { (Suivi.statut, Suivi.mode, Suivi.adresse) }
    if statut == "arrete" { return }
    fcVoulue = fc
    let premier = battement == nil
    if premier {
      Suivi.ouvrirJournal()
      ecouterEtats()
    }
    let course = mode == "course"
    let gps = course && positionAccordee()
    let ble = fc && CBManager.authorization == .allowedAlways
    if premier {
      let economie = ProcessInfo.processInfo.isLowPowerModeEnabled ? 1 : 0
      Suivi.journal("debut", "mode=\(mode ?? "");fc=\(ble ? 1 : 0);ios=\(UIDevice.current.systemVersion);economie=\(economie)")
    }
    if gps { demarrerGps() }
    if course { demarrerBaro() }
    if ble && !fcActive {
      fcActive = true
      Frequence.partage.surChangement = { Suivi.emettre() }
      Frequence.partage.demarrer(appareil ?? adresse)
    }
    if battement == nil {
      let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.battre() }
      RunLoop.main.add(t, forMode: .common)
      battement = t
    }
  }

  /// Suivi restauré du disque (mort du processus), ou retour au premier plan : relance ce qui manque.
  func relancer() {
    let (statut, mode, adresse) = Suivi.avec { (Suivi.statut, Suivi.mode, Suivi.adresse) }
    if statut == "arrete" { return }
    if battement == nil {
      // le processus avait été tué (mémoire) : tout ce temps-là manque
      Suivi.ouvrirJournal()
      Suivi.journal("relance_systeme")
    }
    demarrer(fc: fcVoulue ?? (adresse != nil || mode == "muscu"), appareil: adresse)
  }

  func arreter() {
    battement?.invalidate()
    battement = nil
    if gpsActif { lm?.stopUpdatingLocation() }
    gpsActif = false
    if baroActif { altimetre.stopRelativeAltitudeUpdates() }
    baroActif = false
    if fcActive { Frequence.partage.arreter() }
    fcActive = false
    fcVoulue = nil
    precisionDemandee = false
    observateurs.forEach { NotificationCenter.default.removeObserver($0) }
    observateurs = []
  }

  private func battre() {
    if Suivi.avec({ Suivi.statut }) == "arrete" { return }
    Suivi.verifierGps()
    Frequence.partage.verifier()
    Suivi.emettre()
    // l'état sur disque au plus toutes les 10 s (le Kotlin le fait avec la notification)
    let t = horlogeMonotone()
    if t - derniereSauvegarde >= 10_000 {
      derniereSauvegarde = t
      Suivi.sauver()
    }
  }

  private func gestionnairePosition() -> CLLocationManager {
    if let m = lm { return m }
    let m = CLLocationManager()
    m.delegate = self
    m.desiredAccuracy = kCLLocationAccuracyBest
    m.distanceFilter = kCLDistanceFilterNone
    m.activityType = .fitness
    m.pausesLocationUpdatesAutomatically = false
    if SuiviService.arrierePlanDeclare("location") {
      m.allowsBackgroundLocationUpdates = true
      m.showsBackgroundLocationIndicator = true
    }
    lm = m
    return m
  }

  private func positionAccordee() -> Bool {
    return Autorisations.positionAccordee(gestionnairePosition().authorizationStatus)
  }

  /// Rejouable : startUpdatingLocation deux fois ne fait rien de plus (et relance un GPS refusé en arrière-plan).
  private func demarrerGps() {
    let m = gestionnairePosition()
    // « Position exacte » coupée dans Réglages : positions à plusieurs centaines de mètres, toutes écartées par le filtre
    if m.accuracyAuthorization == .reducedAccuracy && !precisionDemandee {
      precisionDemandee = true
      m.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "suivi")
    }
    m.startUpdatingLocation()
    gpsActif = true
  }

  private func demarrerBaro() {
    if baroActif { return }
    let present = CMAltimeter.isRelativeAltitudeAvailable()
    Suivi.avec { Suivi.baroPresent = present }
    let a = CMAltimeter.authorizationStatus()
    guard present, a == .authorized || a == .notDetermined else { return }
    altimetre.startRelativeAltitudeUpdates(to: .main) { donnees, _ in
      // pression en kPa, le Kotlin la lit en hPa
      guard let d = donnees else { return }
      Suivi.barometre(d.pressure.doubleValue * 10)
    }
    baroActif = true
  }

  // MARK: - CLLocationManagerDelegate

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    for l in locations {
      // invalide, ou gardée en cache par iOS (plus de 10 s) : ignorée
      if l.horizontalAccuracy < 0 || -l.timestamp.timeIntervalSinceNow > 10 { continue }
      Suivi.position(
        l.coordinate.latitude, l.coordinate.longitude, l.horizontalAccuracy,
        alt: l.verticalAccuracy > 0 ? l.altitude : nil,
        vit: l.speed >= 0 ? l.speed : nil)
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // locationUnknown : passager, iOS continue de chercher ; denied : autorisation retirée pendant le suivi
    if (error as? CLError)?.code == .denied {
      Suivi.avec { Suivi.gpsEtat = "perdu" }
      Suivi.journal("gps_refuse")
    }
  }

  // MARK: - Journal

  /// Arrière-plan, verrouillage et économie d'énergie : au journal, pour relier une coupure à ce que faisait le téléphone.
  private func ecouterEtats() {
    if !observateurs.isEmpty { return }
    let nc = NotificationCenter.default
    let suivis: [(Notification.Name, String, String)] = [
      (UIApplication.didEnterBackgroundNotification, "appli", "arriere_plan"),
      (UIApplication.willEnterForegroundNotification, "appli", "premier_plan"),
      (UIApplication.protectedDataWillBecomeUnavailableNotification, "ecran", "verrouille"),
      (UIApplication.protectedDataDidBecomeAvailableNotification, "ecran", "deverrouille"),
    ]
    for (nom, evenement, detail) in suivis {
      observateurs.append(nc.addObserver(forName: nom, object: nil, queue: .main) { _ in Suivi.journal(evenement, detail) })
    }
    observateurs.append(nc.addObserver(forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: .main) { _ in
      Suivi.journal("economie", ProcessInfo.processInfo.isLowPowerModeEnabled ? 1 : 0)
    })
  }
}
