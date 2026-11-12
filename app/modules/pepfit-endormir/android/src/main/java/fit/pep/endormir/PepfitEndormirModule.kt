package fit.pep.endormir

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.view.WindowManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.PI
import kotlin.math.sin

private const val ECHANTILLONS = 22050

// « Aider à s'endormir » (planche sommeil, D7 et D8) : la luminosité de la fenêtre au plus bas pendant l'écran, sans toucher
// au réglage du téléphone (WindowManager.LayoutParams.screenBrightness, rendue en quittant), et un son doux généré (une
// sinusoïde à attaque et chute lentes) pour la respiration, sans fichier audio.
class PepfitEndormirModule : Module() {
  private var piste: AudioTrack? = null

  override fun definition() = ModuleDefinition {
    Name("PepfitEndormir")

    /** 0 à 1 : luminosité de la fenêtre (0 : le plus bas que permet le téléphone) ; négatif : rendue au réglage du téléphone. */
    AsyncFunction("luminosite") { valeur: Double ->
      val fenetre = appContext.currentActivity?.window ?: return@AsyncFunction
      val p = fenetre.attributes
      p.screenBrightness = if (valeur < 0) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE else valeur.toFloat().coerceIn(0f, 1f)
      fenetre.attributes = p
    }.runOnQueue(Queues.MAIN)

    /** Une note douce : `hz`, `ms`, volume 0 à 1 ; remplace la précédente si elle sonne encore. */
    AsyncFunction("tonalite") { hz: Double, ms: Int, volume: Double ->
      val n = (ECHANTILLONS * ms / 1000).coerceAtLeast(1)
      val v = volume.coerceIn(0.0, 1.0) * Short.MAX_VALUE
      // Enveloppe en demi-sinus : ni clic à l'attaque ni à la fin.
      val donnees = ShortArray(n) { i -> (v * sin(PI * i / n) * sin(2 * PI * hz * i / ECHANTILLONS)).toInt().toShort() }
      arreter()
      val p = AudioTrack.Builder()
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(ECHANTILLONS).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
        .setTransferMode(AudioTrack.MODE_STATIC)
        .setBufferSizeInBytes(n * 2)
        .build()
      p.write(donnees, 0, n)
      p.play()
      piste = p
    }

    AsyncFunction("silence") { arreter() }

    OnDestroy { arreter() }
  }

  private fun arreter() {
    piste?.let {
      try {
        it.stop()
      } catch (_: IllegalStateException) {
      }
      it.release()
    }
    piste = null
  }
}
