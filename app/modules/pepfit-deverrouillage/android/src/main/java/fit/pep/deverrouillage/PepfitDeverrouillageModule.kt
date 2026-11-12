package fit.pep.deverrouillage

import android.app.KeyguardManager
import android.content.Context
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Déverrouillage du téléphone avant de réafficher un lien de Connexion IA (C27) : la fenêtre du système (BiometricPrompt),
// empreinte ou code. Réponses : « ok », « annule », « sansVerrou » (aucun verrou d'écran réglé : rien à déverrouiller),
// « indisponible » (Android 9 et moins, ou pas d'activité au premier plan). Aussi le verrou d'ouverture de l'appli (planche
// compte-connexion, H3) : `estProtege` (un verrou d'écran est-il réglé ?) et `masquerApercu` (aperçu des applis récentes).
class PepfitDeverrouillageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PepfitDeverrouillage")

    AsyncFunction("deverrouiller") { titre: String, sousTitre: String, promise: Promise ->
      val activite = appContext.currentActivity
      if (activite == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        promise.resolve("indisponible")
        return@AsyncFunction
      }
      val verrou = activite.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      if (!verrou.isDeviceSecure) {
        promise.resolve("sansVerrou")
        return@AsyncFunction
      }
      val b = BiometricPrompt.Builder(activite).setTitle(titre).setSubtitle(sousTitre)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
        b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
      else @Suppress("DEPRECATION") b.setDeviceCredentialAllowed(true)
      var fini = false
      val repondre = { r: String -> if (!fini) { fini = true; promise.resolve(r) } }
      b.build().authenticate(CancellationSignal(), activite.mainExecutor, object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult?) = repondre("ok")
        override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) = repondre("annule")
      })
    }.runOnQueue(Queues.MAIN)

    // Un verrou d'écran (code, schéma, empreinte) est-il réglé ? Sans lui, verrouiller pepfit ne protégerait rien (3c).
    Function("estProtege") {
      val verrou = appContext.reactContext?.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager?
      verrou?.isDeviceSecure ?: false
    }

    // Aperçu de pepfit dans les applis récentes masqué (D6) : setRecentsScreenshotEnabled, Android 13 et plus ; pas FLAG_SECURE,
    // pour que les captures d'écran marchent toujours. Propre à l'activité : rappelé à chaque retour au premier plan.
    AsyncFunction("masquerApercu") { oui: Boolean ->
      val activite = appContext.currentActivity
      if (activite == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@AsyncFunction false
      activite.setRecentsScreenshotEnabled(!oui)
      true
    }.runOnQueue(Queues.MAIN)
  }
}
