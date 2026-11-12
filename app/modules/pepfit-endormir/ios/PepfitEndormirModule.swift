import AVFoundation
import ExpoModulesCore
import UIKit

private let ECHANTILLONS = 22050.0

// « Aider à s'endormir » (planche sommeil, D7 et D8), version iPhone du module Kotlin (mêmes noms) : l'écran au plus bas
// pendant la séance, et un son doux généré (une sinusoïde à attaque et chute lentes) pour la respiration, sans fichier audio.
// iOS n'a qu'une luminosité, celle de l'écran (pas de réglage propre à la fenêtre comme Android) : on garde celle d'avant et
// on la rend en quittant l'écran, et aussi dès que pepfit passe en arrière-plan (reprise au retour).
public class PepfitEndormirModule: Module {
  private var moteur: AVAudioEngine?
  private var lecteur: AVAudioPlayerNode?
  private var avant: CGFloat?
  private var voulue: CGFloat?
  private var ecoutes: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("PepfitEndormir")

    OnCreate {
      let centre = NotificationCenter.default
      self.ecoutes.append(centre.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.rendreLuminosite()
      })
      self.ecoutes.append(centre.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.appliquerLuminosite()
      })
    }

    OnDestroy {
      self.ecoutes.forEach { NotificationCenter.default.removeObserver($0) }
      self.ecoutes = []
      self.arreter()
      if let a = self.avant {
        DispatchQueue.main.async { UIScreen.main.brightness = a }
      }
    }

    /** 0 à 1 : luminosité de l'écran (0 : le plus bas) ; négatif : rendue à celle d'avant. */
    AsyncFunction("luminosite") { (valeur: Double) in
      if valeur < 0 {
        self.voulue = nil
        self.rendreLuminosite()
      } else {
        self.voulue = CGFloat(min(max(valeur, 0), 1))
        self.appliquerLuminosite()
      }
    }.runOnQueue(.main)

    /** Une note douce : `hz`, `ms`, volume 0 à 1 ; remplace la précédente si elle sonne encore. */
    AsyncFunction("tonalite") { (hz: Double, ms: Double, volume: Double) in
      let n = max(Int(ECHANTILLONS * ms / 1000), 1)
      guard let format = AVAudioFormat(standardFormatWithSampleRate: ECHANTILLONS, channels: 1),
        let tampon = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(n)),
        let donnees = tampon.floatChannelData?[0] else {
        return
      }
      tampon.frameLength = AVAudioFrameCount(n)
      let v = Float(min(max(volume, 0), 1))
      for i in 0..<n {
        // Enveloppe en demi-sinus : ni clic à l'attaque ni à la fin.
        let enveloppe = sin(Double.pi * Double(i) / Double(n))
        donnees[i] = v * Float(enveloppe * sin(2 * Double.pi * hz * Double(i) / ECHANTILLONS))
      }
      let lecteur = try self.preparer(format)
      lecteur.stop()
      lecteur.scheduleBuffer(tampon, at: nil, options: [], completionHandler: nil)
      lecteur.play()
    }.runOnQueue(.main)

    AsyncFunction("silence") { () -> Void in
      self.lecteur?.stop()
    }.runOnQueue(.main)
  }

  private func ecran() -> UIScreen {
    UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.screen }.first ?? UIScreen.main
  }

  private func appliquerLuminosite() {
    guard let v = voulue else {
      return
    }
    let e = ecran()
    if avant == nil {
      avant = e.brightness
    }
    e.brightness = v
  }

  private func rendreLuminosite() {
    guard let a = avant else {
      return
    }
    ecran().brightness = a
    avant = nil
  }

  /** Le moteur audio, démarré au premier son. Comme le média d'Android : sonne en mode silencieux, par-dessus la musique. */
  private func preparer(_ format: AVAudioFormat) throws -> AVAudioPlayerNode {
    if let l = lecteur, let m = moteur, m.isRunning {
      return l
    }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, options: [.mixWithOthers])
    try session.setActive(true)
    let m = moteur ?? AVAudioEngine()
    let l = lecteur ?? AVAudioPlayerNode()
    if lecteur == nil {
      m.attach(l)
      m.connect(l, to: m.mainMixerNode, format: format)
    }
    try m.start()
    moteur = m
    lecteur = l
    return l
  }

  private func arreter() {
    lecteur?.stop()
    moteur?.stop()
  }
}
