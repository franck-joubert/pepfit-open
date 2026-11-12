import AVFoundation
import ExpoModulesCore
import UIKit
import UserNotifications

// iPhone (docs/CODE-IOS-RAPPELS.md) : pas d'alarme pour une appli tierce ; les fins de repos et de sieste sont des
// notifications locales programmées (expo-notifications, src/natif/minuteur/index.ios.ts, src/natif/alarme-recup/index.ios.ts).
// Ce module fait le reste :
//  - jouer : appli ouverte, le son d'alarme (fichier du bundle copié par plugins/ios-rappels.js) dans une session audio
//    « playback », que le bouton du mode silencieux ne coupe pas (le son d'une notification, lui, est coupé) ;
//  - diagnostic : les réglages de notifications de l'appli (autorisation, sons, écran verrouillé, « Notifications urgentes ») ;
//  - ouvrirReglages : la page des notifications de l'appli dans Réglages.
// Même nom que le module Android (Kotlin) : le code JS choisit ses fonctions selon la plateforme.
public class PepfitAlarmeModule: Module {
  private var lecteur: AVAudioPlayer?
  private var fin: FinDuSon?

  public func definition() -> ModuleDefinition {
    Name("PepfitAlarme")

    AsyncFunction("jouer") { (nom: String, boucle: Bool) -> Bool in
      return self.jouer(nom: nom, boucle: boucle)
    }.runOnQueue(.main)

    AsyncFunction("arreterSon") {
      self.arreterSon()
    }.runOnQueue(.main)

    AsyncFunction("diagnostic") { (promise: Promise) in
      UNUserNotificationCenter.current().getNotificationSettings { r in
        let urgentes: String
        switch r.timeSensitiveSetting {
        case .enabled: urgentes = "oui"
        case .disabled: urgentes = "non"
        // .notSupported : l'appli n'a pas le droit com.apple.developer.usernotifications.time-sensitive
        default: urgentes = "absent"
        }
        let autorisees = r.authorizationStatus == .authorized || r.authorizationStatus == .provisional || r.authorizationStatus == .ephemeral
        promise.resolve([
          "autorisees": autorisees,
          "sons": r.soundSetting == .enabled,
          "urgentes": urgentes,
          "verrou": r.lockScreenSetting == .enabled,
        ])
      }
    }

    AsyncFunction("ouvrirReglages") {
      if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
        UIApplication.shared.open(url)
      }
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async { self.arreterSon() }
    }
  }

  /// Joue `nom` (« pepfit-reveil.wav ») depuis le bundle de l'appli ; faux si le fichier manque ou si l'audio refuse.
  private func jouer(nom: String, boucle: Bool) -> Bool {
    let base = (nom as NSString).deletingPathExtension
    let ext = (nom as NSString).pathExtension
    guard let url = Bundle.main.url(forResource: base, withExtension: ext.isEmpty ? nil : ext) else { return false }
    do {
      let session = AVAudioSession.sharedInstance()
      // « playback » : sonne bouton silencieux enclenché ; les autres sons (musique) baissent le temps de l'alarme.
      try session.setCategory(.playback, mode: .default, options: [.duckOthers])
      try session.setActive(true)
      let l = try AVAudioPlayer(contentsOf: url)
      l.numberOfLoops = boucle ? -1 : 0
      let f = FinDuSon { [weak self] in self?.arreterSon() }
      l.delegate = f
      lecteur?.stop()
      lecteur = l
      fin = f
      return l.play()
    } catch {
      return false
    }
  }

  private func arreterSon() {
    guard let l = lecteur else { return }
    l.stop()
    lecteur = nil
    fin = nil
    // La musique d'une autre appli reprend son volume.
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

/// Fin de la lecture : la session audio est rendue.
private final class FinDuSon: NSObject, AVAudioPlayerDelegate {
  private let quandFini: () -> Void

  init(_ quandFini: @escaping () -> Void) {
    self.quandFini = quandFini
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async(execute: quandFini)
  }
}
