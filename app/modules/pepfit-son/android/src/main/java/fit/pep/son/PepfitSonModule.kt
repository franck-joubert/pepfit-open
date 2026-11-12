package fit.pep.son

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val CHOIX_SON = 4271

// Son de fin de repos : choix parmi les sons du téléphone (sélecteur du système, qui fait entendre chaque son
// à la sélection) et canal de notification créé avec ce son, sur le flux ALARME.
class PepfitSonModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private var enAttente: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("PepfitSon")

    /** Ouvre le sélecteur ; { uri, nom } ou null si annulé. */
    AsyncFunction("choisir") { actuel: String?, titre: String, promise: Promise ->
      enAttente?.resolve(null)
      enAttente = promise
      val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
        putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION)
        putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, titre)
        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
        putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
        putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, Settings.System.DEFAULT_NOTIFICATION_URI)
        putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, actuel?.let(Uri::parse) ?: Settings.System.DEFAULT_NOTIFICATION_URI)
      }
      appContext.throwingActivity.startActivityForResult(intent, CHOIX_SON)
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode != CHOIX_SON) return@OnActivityResult
      val promise = enAttente ?: return@OnActivityResult
      enAttente = null
      @Suppress("DEPRECATION")
      val uri: Uri? = if (resultCode == Activity.RESULT_OK) data?.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI) else null
      if (uri == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      promise.resolve(mapOf("uri" to uri.toString(), "nom" to nom(uri)))
    }

    /** Crée le canal `id` (son sur le flux ALARME, vibration d'une impulsion) et supprime les autres canaux `prefixe*`. */
    AsyncFunction("canal") { id: String, nom: String, prefixe: String, uri: String?, son: Boolean, vibration: List<Long> ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notificationChannels.filter { it.id.startsWith(prefixe) && it.id != id }.forEach { nm.deleteNotificationChannel(it.id) }
      val canal = NotificationChannel(id, nom, NotificationManager.IMPORTANCE_HIGH).apply {
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        if (son) {
          val attributs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
          setSound(uri?.let(Uri::parse) ?: Settings.System.DEFAULT_NOTIFICATION_URI, attributs)
        } else {
          setSound(null, null)
        }
        if (vibration.isNotEmpty()) {
          enableVibration(true)
          vibrationPattern = vibration.toLongArray()
        } else {
          enableVibration(false)
        }
      }
      nm.createNotificationChannel(canal)
    }
  }

  private fun nom(uri: Uri): String =
    try {
      RingtoneManager.getRingtone(context, uri)?.getTitle(context) ?: ""
    } catch (e: Exception) {
      ""
    }
}
