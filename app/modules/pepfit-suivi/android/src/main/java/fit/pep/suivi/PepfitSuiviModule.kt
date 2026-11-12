package fit.pep.suivi

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.app.NotificationManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

class OptionsSuivi : Record {
  @Field val mode: String = "course"
  @Field val fc: Boolean = true
  @Field val appareil: String? = null
  @Field val titre: String = "Suivi"
  /** Muscu : début et pauses de la séance (ms), pour que le chrono de la notification soit celui de la séance. */
  @Field val debut: Double? = null
  @Field val pauseCumulMs: Double = 0.0
}

private const val PREFS = "pepfit-suivi"

// Suivi GPS et FC en direct (planches/suivi-gps) : le service tourne seul ; le JS lit l'état et le tampon quand il est là.
class PepfitSuiviModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PepfitSuivi")
    Events("etat")

    OnStartObserving { Suivi.ecouteur = { sendEvent("etat", it) } }
    OnStopObserving { Suivi.ecouteur = null }

    Function("capteurs") {
      val pm = context.packageManager
      val promu = if (Build.VERSION.SDK_INT >= 36) {
        try { (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canPostPromotedNotifications() } catch (_: Throwable) { false }
      } else false
      mapOf(
        "barometre" to ((context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).getDefaultSensor(Sensor.TYPE_PRESSURE) != null),
        "gps" to pm.hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS),
        "bluetooth" to pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE),
        "android" to Build.VERSION.SDK_INT,
        "promu" to promu,
      )
    }

    /** Démarre le service ; les autorisations ont été demandées par le JS (PermissionsAndroid). */
    Function("demarrer") { o: OptionsSuivi ->
      if (Suivi.statut != "arrete") return@Function Suivi.instantane()
      if (o.mode != "course" && o.mode != "fc" && o.mode != "muscu") throw CodedException("ERR_MODE", "mode inconnu : ${o.mode}", null)
      val adresse = o.appareil ?: prefs().getString("appareil", null)
      Suivi.ouvrir(context, o.mode, o.titre, o.debut?.toLong(), o.pauseCumulMs.toLong())
      Suivi.adresse = adresse
      val intent = Intent(context, SuiviService::class.java)
        .putExtra(SuiviService.EXTRA_FC, o.fc)
        .putExtra(SuiviService.EXTRA_APPAREIL, adresse)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      Suivi.instantane()
    }

    Function("pause") {
      if (Suivi.pause()) SuiviService.instance?.notifier(true)
      Suivi.instantane()
    }

    Function("reprendre") {
      if (Suivi.reprendre()) SuiviService.instance?.notifier(true)
      Suivi.instantane()
    }

    Function("tour") {
      Suivi.tour()?.let { mapOf("n" to it.n, "s" to it.s.toDouble(), "d" to it.d) }
    }

    Function("terminer") {
      // le capteur trouvé devient celui par défaut des prochains suivis
      Suivi.adresse?.let { prefs().edit().putString("appareil", it).apply() }
      Suivi.terminer()
      context.startService(Intent(context, SuiviService::class.java).setAction(SuiviService.ACTION_ARRETER))
      Suivi.instantane()
    }

    /** État du suivi ; après la mort du processus, reprend le dernier suivi non terminé et relance le service. */
    Function("etat") {
      if (Suivi.id == null) {
        if (!Suivi.restaurer(context)) return@Function null
        val intent = Intent(context, SuiviService::class.java).putExtra(SuiviService.EXTRA_FC, Suivi.adresse != null || Suivi.mode == "muscu")
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      }
      Suivi.instantane()
    }

    /** Points du tampon à partir de l'index `depuis` : [t, s, lat, lon, altBaro, altGps, precision, vitesse]. */
    AsyncFunction("points") { id: String, depuis: Int ->
      lire(File(Suivi.racine(context), "$id/points.csv"), depuis)
    }

    /** Échantillons de FC à partir de `depuis` : [t, s, bpm]. */
    AsyncFunction("frequences") { id: String, depuis: Int ->
      lire(File(Suivi.racine(context), "$id/fc.csv"), depuis)
    }

    AsyncFunction("tampons") {
      Suivi.racine(context).listFiles()?.filter { f: File -> f.isDirectory }?.map { f: File -> f.name }?.sorted() ?: emptyList<String>()
    }

    AsyncFunction("effacer") { id: String ->
      if (id == Suivi.id && Suivi.statut != "arrete") throw CodedException("ERR_EN_COURS", "suivi en cours", null)
      File(Suivi.racine(context), id).deleteRecursively()
      Unit
    }

    /** « Effacer les données de ce téléphone » : service arrêté, tampons et préférences (capteur FC, batterie) effacés. Rejouable. */
    AsyncFunction("oublier") {
      Suivi.terminer()
      Suivi.id = null
      if (SuiviService.instance != null) context.startService(Intent(context, SuiviService::class.java).setAction(SuiviService.ACTION_ARRETER))
      Suivi.adresse = null
      Suivi.racine(context).deleteRecursively()
      if (!prefs().edit().clear().commit()) throw CodedException("ERR_PREFS", "préférences du suivi non effacées", null)
      Unit
    }

    AsyncFunction("chercherFc") { dureeMs: Long, promise: Promise ->
      Frequence.lister(context, dureeMs.coerceIn(1000, 30_000)) { promise.resolve(it) }
    }

    Function("batterie") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      mapOf(
        "optimisee" to !pm.isIgnoringBatteryOptimizations(context.packageName),
        "dejaProposee" to prefs().getBoolean("batterieProposee", false),
        "samsung" to Build.MANUFACTURER.equals("samsung", ignoreCase = true),
      )
    }

    /** Journal des coupures : [heure (ms), événement, détail], du plus ancien au plus récent (rien de personnel). */
    AsyncFunction("journal") {
      val f = Suivi.journalFichier(context)
      if (!f.exists()) return@AsyncFunction emptyList<List<Any>>()
      f.readLines().filter { it.isNotBlank() }.map { l ->
        val p = l.split(',', limit = 3)
        listOf(p[0].toDoubleOrNull() ?: 0.0, p.getOrElse(1) { "" }, p.getOrElse(2) { "" })
      }
    }

    /** Ouvre l'appli `paquet` (Whoop, pour y activer la diffusion de la FC) ; faux si elle n'est pas installée. */
    Function("ouvrirAppli") { paquet: String ->
      val intent = context.packageManager.getLaunchIntentForPackage(paquet) ?: return@Function false
      (appContext.currentActivity ?: context).startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }

    /** Ouvre le réglage de batterie de pepfit et dit lequel : « fiche » (Samsung : Batterie › Non restreinte y est) ou
     *  « liste » (Optimisation de la batterie), avec repli vers la fiche si la liste manque. Pas de
     *  REQUEST_IGNORE_BATTERY_OPTIMIZATIONS : la politique de Google Play le refuse à un suivi sportif (capteur Bluetooth
     *  standard, pas un cas « acceptable » de la doc Doze). Le moment proposé se note côté JS (ecrans/batterie.ts). */
    Function("ouvrirReglagesBatterie") {
      val depuis = appContext.currentActivity ?: context
      val fiche = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (Build.MANUFACTURER.equals("samsung", ignoreCase = true)) {
        depuis.startActivity(fiche)
        return@Function "fiche"
      }
      try {
        depuis.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        "liste"
      } catch (_: ActivityNotFoundException) {
        depuis.startActivity(fiche)
        "fiche"
      }
    }
  }

  private fun prefs() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun lire(f: File, depuis: Int): List<List<Double?>> {
    if (!f.exists()) return emptyList()
    return f.useLines { lignes ->
      lignes.drop(depuis.coerceAtLeast(0)).filter { it.isNotBlank() }.map { l -> l.split(',').map { it.toDoubleOrNull() } }.toList()
    }
  }
}
