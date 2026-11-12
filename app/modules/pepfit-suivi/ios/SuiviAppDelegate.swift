import ExpoModulesCore
import UIKit

/**
 * Restauration d'état du Bluetooth : si iOS a tué l'appli pendant une séance avec capteur, il la relance en arrière-plan
 * (clé bluetoothCentrals) quand le capteur se manifeste. Le gestionnaire doit alors être recréé avec le même identifiant
 * dès le lancement ; le suivi en cours reprend son tampon (comme la relance du service par Android, START_STICKY).
 * Branché par expo-module.config.json (appDelegateSubscribers).
 */
public class SuiviAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if launchOptions?[.bluetoothCentrals] != nil {
      Frequence.partage.gestionnaire()
      if Suivi.avec({ Suivi.id }) == nil && Suivi.restaurer() {
        SuiviService.partage.relancer()
      }
    }
    return true
  }
}
