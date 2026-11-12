import CoreBluetooth
import Foundation

let SERVICE_FC = CBUUID(string: "180D")
let MESURE_FC = CBUUID(string: "2A37")

/// Lecture de 0x2A37 : drapeaux, FC sur 8 ou 16 bits, contact (bits 1-2), énergie (bit 3, sautée), RR (bit 4, en 1/1024 s,
/// rendus en ms). Même règle que lireFrequence de logique.ts (testée là-bas avec les mêmes octets).
func lireFrequence(_ v: [UInt8]) -> (bpm: Int, contact: Bool?, rr: [Double])? {
  if v.count < 2 { return nil }
  let f = Int(v[0])
  var i: Int
  let bpm: Int
  if f & 0x01 != 0 {
    if v.count < 3 { return nil }
    bpm = Int(v[1]) | (Int(v[2]) << 8)
    i = 3
  } else {
    bpm = Int(v[1])
    i = 2
  }
  let contact: Bool? = f & 0x04 != 0 ? (f & 0x02 != 0) : nil
  if f & 0x08 != 0 { i += 2 }
  var rr: [Double] = []
  if f & 0x10 != 0 {
    while i + 1 < v.count {
      rr.append(Double(Int(v[i]) | (Int(v[i + 1]) << 8)) / 1024 * 1000)
      i += 2
    }
  }
  return (bpm, contact, rr)
}

/**
 * Capteur de FC Bluetooth standard (Whoop en « Broadcast Heart Rate ») : même logique que Frequence.kt. Recherche du service
 * 0x180D si aucun capteur connu, connexion, abonnement à 0x2A37, reconnexion à la perte. Tout se passe sur le fil principal
 * (gestionnaire créé avec queue nil).
 *
 * Différences d'iOS :
 * 1. l'« adresse » est l'identifiant que l'iPhone donne au capteur (CBPeripheral.identifier), propre à ce téléphone ;
 * 2. une connexion demandée n'expire jamais : iOS la tient, même appli suspendue, et réveille l'appli quand le capteur revient
 *    (mode d'arrière-plan bluetooth-central). `verifier` garde quand même les délais du Kotlin quand l'appli tourne ;
 * 3. restauration d'état : si iOS tue l'appli pendant une séance, il la relance en arrière-plan pour le capteur
 *    (SuiviAppDelegate recrée le gestionnaire avec RESTAURATION) ;
 * 4. en arrière-plan, la recherche n'aboutit qu'avec le service précis (0x180D), ce que fait déjà `chercher`.
 * La batterie du capteur (0x180F) n'est pas lue : l'Android ne la lit pas non plus.
 */
final class Frequence: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  static let partage = Frequence()
  static let RESTAURATION = "fit.pep.suivi.fc"

  /// Lien ouvert sans mesure au-delà de ce délai : refait (la Whoop diffuse environ une mesure par seconde).
  static let SILENCE_MS: Int64 = 15_000
  /// Connexion (ou abonnement) qui n'aboutit pas : place à une recherche.
  static let TENTATIVE_MS: Int64 = 30_000
  static let RECHERCHE_MS: Int64 = 15_000
  static let PAUSE_MS: Int64 = 10_000

  private(set) var central: CBCentralManager?
  var surChangement: () -> Void = {}
  private var peripherique: CBPeripheral?
  private var actif = false
  private var adresse: String?
  private var recherche = false

  // Horloges monotones (elles avancent aussi quand le téléphone dort).
  /** Connexion lancée (ou lien établi, en attente de la première mesure) depuis ; 0 : aucune. */
  private var tentativeDepuis: Int64 = 0
  /** Fin de la recherche en cours. */
  private var rechercheJusqua: Int64 = 0
  /** Pas de nouvel essai avant (Bluetooth coupé, capteur sans service FC, recherche impossible). */
  private var prochainEssai: Int64 = 0
  /** Mesures reçues sur le lien en cours. */
  private var abonne = false
  private var derniereMesure: Int64 = 0
  /** FC perdue depuis ; 0 : jamais perdue, ou reprise. */
  private var perteDepuis: Int64 = 0
  private var sansBluetooth = false
  /// Capteurs rendus par la restauration d'état (appli relancée par iOS pour le Bluetooth).
  private var restaures: [CBPeripheral] = []
  /// Liens coupés par nous : iOS en rend encore le rappel de déconnexion, qui ne compte pas comme une perte.
  private var annules = Set<UUID>()

  /// Crée le gestionnaire au premier besoin. La première fois, iOS pose la question du Bluetooth si elle ne l'a jamais été.
  @discardableResult
  func gestionnaire() -> CBCentralManager {
    if let c = central { return c }
    var options: [String: Any] = [CBCentralManagerOptionShowPowerAlertKey: false]
    // sans le mode bluetooth-central (plugins/ios-suivi.js), iOS refuse la restauration d'état et fait planter l'appli
    if SuiviService.arrierePlanDeclare("bluetooth-central") {
      options[CBCentralManagerOptionRestoreIdentifierKey] = Frequence.RESTAURATION
    }
    let c = CBCentralManager(delegate: self, queue: nil, options: options)
    central = c
    return c
  }

  func demarrer(_ adr: String?) {
    actif = true
    adresse = adr
    gestionnaire()
    lancer()
  }

  func arreter() {
    actif = false
    arreterRecherche()
    fermerLien()
  }

  private func maintenant() -> Int64 {
    return horlogeMonotone()
  }

  /// Connexion au capteur connu (directe : rapide s'il est là), sinon recherche.
  private func lancer() {
    guard actif, let c = central else { return }
    switch c.state {
    case .poweredOn:
      break
    case .unknown, .resetting:
      // état pas encore connu : centralManagerDidUpdateState relancera
      return
    default:
      if !sansBluetooth { Suivi.journal("bluetooth_coupe") }
      sansBluetooth = true
      Suivi.avec { Suivi.fcEtat = "sans_bluetooth" }
      prochainEssai = maintenant() + Frequence.PAUSE_MS
      surChangement()
      return
    }
    if sansBluetooth { Suivi.journal("bluetooth_revenu") }
    sansBluetooth = false
    if let p = connu(c) { connecter(p, auto: false) } else { chercher() }
  }

  /// Le capteur connu : rendu par la restauration, retrouvé par son identifiant, ou déjà relié à l'iPhone (service 0x180D).
  private func connu(_ c: CBCentralManager) -> CBPeripheral? {
    if let a = adresse, let uuid = UUID(uuidString: a) {
      if let p = restaures.first(where: { $0.identifier == uuid }) { return p }
      if let p = c.retrievePeripherals(withIdentifiers: [uuid]).first { return p }
    }
    return c.retrieveConnectedPeripherals(withServices: [SERVICE_FC]).first { estLeCapteur($0, nom: $0.name) }
  }

  /// Appelé chaque seconde par le service (appli active) : silence, tentative trop longue, fin de recherche, nouvel essai.
  func verifier() {
    guard actif else { return }
    let t = maintenant()
    if abonne && t - derniereMesure > Frequence.SILENCE_MS {
      Suivi.journal("silence", (t - derniereMesure) / 1000)
      fermerLien()
      perdre()
      lancer()
      return
    }
    if recherche {
      if t < rechercheJusqua { return }
      // rien trouvé : on attend le capteur connu (connexion sans délai d'iOS, sans recherche active)
      arreterRecherche()
      Suivi.journal("recherche_vaine")
      if let c = central, c.state == .poweredOn, adresse != nil, let p = connu(c) {
        connecter(p, auto: true)
      } else {
        prochainEssai = t + Frequence.PAUSE_MS
      }
      return
    }
    // connexion qui n'aboutit pas (hors de portée, ou identifiant changé) : on le cherche
    if peripherique != nil && !abonne && tentativeDepuis > 0 && t - tentativeDepuis > Frequence.TENTATIVE_MS {
      Suivi.journal("tentative_longue", (t - tentativeDepuis) / 1000)
      fermerLien()
      chercher()
      return
    }
    if peripherique == nil && t >= prochainEssai { lancer() }
  }

  private func perdre() {
    if perteDepuis == 0 { perteDepuis = maintenant() }
    abonne = false
    Suivi.avec { Suivi.fcEtat = "perdu" }
    surChangement()
  }

  private func fermerLien() {
    guard let p = peripherique else { return }
    peripherique = nil
    abonne = false
    tentativeDepuis = 0
    guard let c = central else { return }
    if p.state == .connected { annules.insert(p.identifier) }
    if p.state != .disconnected { c.cancelPeripheralConnection(p) }
  }

  /// Le capteur cherché : n'importe lequel au premier suivi ; ensuite le même (identifiant, ou nom s'il a changé).
  private func estLeCapteur(_ p: CBPeripheral, nom: String?) -> Bool {
    guard let a = adresse else { return true }
    if p.identifier.uuidString == a { return true }
    guard let connuNom = Suivi.avec({ Suivi.appareil }) else { return false }
    return nom != nil && nom == connuNom
  }

  private func chercher() {
    guard let c = central, c.state == .poweredOn else {
      prochainEssai = maintenant() + Frequence.PAUSE_MS
      return
    }
    let perdu = perteDepuis > 0
    Suivi.avec { Suivi.fcEtat = perdu ? "perdu" : "recherche" }
    surChangement()
    Suivi.journal("recherche")
    recherche = true
    rechercheJusqua = maintenant() + Frequence.RECHERCHE_MS
    // filtrée sur 0x180D : seule recherche qu'iOS laisse tourner en arrière-plan
    c.scanForPeripherals(withServices: [SERVICE_FC], options: nil)
  }

  private func arreterRecherche() {
    guard recherche else { return }
    recherche = false
    if let c = central, c.state == .poweredOn { c.stopScan() }
  }

  private func connecter(_ p: CBPeripheral, auto: Bool) {
    guard let c = central else { return }
    fermerLien()
    let id = p.identifier.uuidString
    let perdu = perteDepuis > 0
    adresse = id
    Suivi.avec {
      Suivi.fcEtat = perdu ? "perdu" : "connexion"
      Suivi.adresse = id
      if let n = p.name { Suivi.appareil = n }
    }
    surChangement()
    Suivi.journal(auto ? "attente" : "connexion")
    tentativeDepuis = maintenant()
    peripherique = p
    p.delegate = self
    if annules.contains(p.identifier) {
      // même capteur, coupé à l'instant (silence) : la demande repart au rappel de cette coupure (didDisconnectPeripheral)
      return
    }
    if p.state == .connected {
      // déjà relié (restauration d'état, ou lien tenu par iOS) : on reprend à la découverte des services
      Suivi.journal("lien", 0)
      p.discoverServices([SERVICE_FC])
    } else {
      c.connect(p, options: nil)
    }
  }

  // MARK: - CBCentralManagerDelegate

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    Autorisations.partage.bluetoothChange()
    guard actif else { return }
    switch central.state {
    case .poweredOn:
      if peripherique == nil && !recherche { lancer() }
    case .unknown, .resetting:
      break
    default:
      // Bluetooth coupé ou refusé : iOS a fermé les liens et arrêté la recherche
      recherche = false
      annules.removeAll()
      if peripherique != nil {
        peripherique = nil
        tentativeDepuis = 0
        perdre()
      }
      lancer()
    }
  }

  func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    let liste = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] ?? []
    restaures = liste
    for p in liste { p.delegate = self }
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    let nom = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name
    guard actif, recherche, estLeCapteur(peripheral, nom: nom) else { return }
    arreterRecherche()
    Suivi.journal("trouve", peripheral.identifier.uuidString == adresse ? "meme_adresse" : "autre_adresse")
    connecter(peripheral, auto: false)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    guard actif, peripheral === peripherique else {
      // lien d'un capteur qui n'est plus le nôtre : on le rend
      if peripheral !== peripherique { central.cancelPeripheralConnection(peripheral) }
      return
    }
    Suivi.journal("lien", 0)
    tentativeDepuis = maintenant()
    peripheral.discoverServices([SERVICE_FC])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    guard actif, peripheral === peripherique else { return }
    Suivi.journal("deconnexion", error.map { ($0 as NSError).code } ?? 0)
    fermerLien()
    perdre()
    chercher()
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    if annules.remove(peripheral.identifier) != nil {
      // rappel de notre propre coupure ; si le même capteur a été redemandé entre-temps, on renouvelle la demande
      if actif, peripheral === peripherique, peripheral.state != .connected { central.connect(peripheral, options: nil) }
      return
    }
    guard actif, peripheral === peripherique else { return }
    // code CBError : 6 = délai dépassé (hors de portée), 7 = coupé par le capteur
    Suivi.journal("deconnexion", error.map { ($0 as NSError).code } ?? 0)
    let mesurait = abonne
    fermerLien()
    perdre()
    // tout de suite : le même capteur s'il mesurait (iOS tient la demande jusqu'à son retour, appli suspendue comprise),
    // sinon (tentative ratée) une recherche, qui le retrouve même sous un autre identifiant
    if mesurait { lancer() } else { chercher() }
  }

  // MARK: - CBPeripheralDelegate

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard actif, peripheral === peripherique else { return }
    guard let s = peripheral.services?.first(where: { $0.uuid == SERVICE_FC }) else {
      sansService()
      return
    }
    peripheral.discoverCharacteristics([MESURE_FC], for: s)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard actif, peripheral === peripherique else { return }
    guard let c = service.characteristics?.first(where: { $0.uuid == MESURE_FC }) else {
      sansService()
      return
    }
    peripheral.setNotifyValue(true, for: c)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    guard actif, peripheral === peripherique, let e = error else { return }
    Suivi.journal("abonnement_echec", (e as NSError).code)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard actif, peripheral === peripherique, error == nil, characteristic.uuid == MESURE_FC,
          let v = characteristic.value, let m = lireFrequence([UInt8](v)) else { return }
    let t = maintenant()
    derniereMesure = t
    if !abonne {
      abonne = true
      tentativeDepuis = 0
      if perteDepuis > 0 { Suivi.journal("reprise", (t - perteDepuis) / 1000) } else { Suivi.journal("mesures") }
      perteDepuis = 0
    }
    Suivi.frequence(m.bpm, contact: m.contact)
  }

  /// Pas de service FC : diffusion coupée côté Whoop ; nouvel essai dans PAUSE_MS.
  private func sansService() {
    Suivi.journal("sans_service")
    fermerLien()
    perdre()
    prochainEssai = maintenant() + Frequence.PAUSE_MS
  }
}

/**
 * Recherche ponctuelle (écran de départ, labo) : appareils qui annoncent 0x180D ou dont le nom contient « whoop ». Un
 * gestionnaire à part, sans restauration, pour ne pas gêner celui de la séance ; liste vide sans autorisation ni Bluetooth.
 */
final class Recherche: NSObject, CBCentralManagerDelegate {
  private var central: CBCentralManager?
  private var vus: [String: [String: Any]] = [:]
  private var ordre: [String] = []
  private var fini: (([Any]) -> Void)?
  private let dureeMs: Int
  /// Se retient jusqu'à la fin (personne d'autre ne garde l'objet).
  private var garde: Recherche?

  private init(dureeMs: Int, fini: @escaping ([Any]) -> Void) {
    self.dureeMs = dureeMs
    self.fini = fini
    super.init()
  }

  static func lister(dureeMs: Int, fini: @escaping ([Any]) -> Void) {
    DispatchQueue.main.async {
      // jamais de question ici : sans autorisation, liste vide (comme l'Android sans « Appareils à proximité »)
      guard CBManager.authorization == .allowedAlways else {
        fini([])
        return
      }
      let r = Recherche(dureeMs: dureeMs, fini: fini)
      r.garde = r
      r.central = CBCentralManager(delegate: r, queue: nil, options: [CBCentralManagerOptionShowPowerAlertKey: false])
      // filet : Bluetooth qui ne s'allume jamais
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(dureeMs + 5000)) { r.terminer() }
    }
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    switch central.state {
    case .poweredOn:
      guard fini != nil else { return }
      central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(dureeMs)) { [weak self] in self?.terminer() }
    case .unknown, .resetting:
      break
    default:
      terminer()
    }
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
    let fc = services.contains(SERVICE_FC)
    let nom = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name
    if !fc && !(nom?.localizedCaseInsensitiveContains("whoop") ?? false) { return }
    let id = peripheral.identifier.uuidString
    if vus[id] == nil { ordre.append(id) }
    vus[id] = ["adresse": id, "nom": nul(nom), "rssi": RSSI.intValue, "fc": fc]
  }

  private func terminer() {
    guard let f = fini else { return }
    fini = nil
    if let c = central, c.state == .poweredOn { c.stopScan() }
    central?.delegate = nil
    central = nil
    f(ordre.compactMap { vus[$0] })
    garde = nil
  }
}
