import CoreBluetooth
import CoreLocation
import CoreMotion
import Foundation

/**
 * Autorisations d'iOS, demandées par le JS au moment où elles servent (mêmes moments que PermissionsAndroid) :
 * position « pendant l'utilisation » (le suivi démarre appli visible, puis continue en arrière-plan grâce au mode
 * d'arrière-plan location, comme le service au premier plan d'Android sans ACCESS_BACKGROUND_LOCATION), Bluetooth,
 * puis « Mouvements et forme » pour le baromètre. Tout se passe sur le fil principal.
 */
final class Autorisations: NSObject, CLLocationManagerDelegate {
  static let partage = Autorisations()

  private var lm: CLLocationManager?
  private var attentePosition: [(Bool) -> Void] = []
  private var attenteBluetooth: [(String) -> Void] = []
  private let altimetre = CMAltimeter()

  static func positionAccordee(_ s: CLAuthorizationStatus) -> Bool {
    return s == .authorizedWhenInUse || s == .authorizedAlways
  }

  /// « accorde » ; « refuse » : jamais demandée (iOS peut la poser) ; « bloque » : refusée ou restreinte, à changer dans
  /// Réglages (iOS ne repose jamais la question).
  static func etatBluetooth() -> String {
    switch CBManager.authorization {
    case .allowedAlways: return "accorde"
    case .notDetermined: return "refuse"
    default: return "bloque"
    }
  }

  func demanderPosition(_ fini: @escaping (Bool) -> Void) {
    DispatchQueue.main.async {
      let m: CLLocationManager
      if let l = self.lm {
        m = l
      } else {
        m = CLLocationManager()
        m.delegate = self
        self.lm = m
      }
      let s = m.authorizationStatus
      if s != .notDetermined {
        if Autorisations.positionAccordee(s) { self.demanderMouvement() }
        fini(Autorisations.positionAccordee(s))
        return
      }
      self.attentePosition.append(fini)
      m.requestWhenInUseAuthorization()
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let s = manager.authorizationStatus
    if s == .notDetermined { return }
    let l = attentePosition
    attentePosition = []
    if l.isEmpty { return }
    if Autorisations.positionAccordee(s) { demanderMouvement() }
    l.forEach { $0(Autorisations.positionAccordee(s)) }
  }

  /// Baromètre (CMAltimeter) : iOS demande « Mouvements et forme » à la première lecture ; on la fait juste après la position,
  /// pour que la question ne tombe pas au départ de la course. Sans réponse attendue : le suivi s'en passe.
  private func demanderMouvement() {
    guard CMAltimeter.isRelativeAltitudeAvailable(), CMAltimeter.authorizationStatus() == .notDetermined else { return }
    altimetre.startRelativeAltitudeUpdates(to: .main) { [weak self] _, _ in
      self?.altimetre.stopRelativeAltitudeUpdates()
    }
  }

  func demanderBluetooth(_ fini: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      if CBManager.authorization != .notDetermined {
        fini(Autorisations.etatBluetooth())
        return
      }
      self.attenteBluetooth.append(fini)
      // créer le gestionnaire du suivi fait poser la question ; la réponse arrive par centralManagerDidUpdateState
      Frequence.partage.gestionnaire()
      // filet : réponse jamais signalée
      DispatchQueue.main.asyncAfter(deadline: .now() + 120) { self.bluetoothChange(force: true) }
    }
  }

  /// Appelé par Frequence à chaque changement d'état du Bluetooth : rend la réponse aux demandes en attente.
  func bluetoothChange(force: Bool = false) {
    if !force && CBManager.authorization == .notDetermined { return }
    let l = attenteBluetooth
    attenteBluetooth = []
    let r = Autorisations.etatBluetooth()
    l.forEach { $0(r) }
  }
}
