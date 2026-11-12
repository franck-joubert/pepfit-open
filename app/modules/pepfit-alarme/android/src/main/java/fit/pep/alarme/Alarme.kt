package fit.pep.alarme

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.app.Activity
import android.app.Application
import android.os.Bundle
import java.lang.ref.WeakReference

/**
 * Ce qu'il faut pour sonner : gardé dans les préférences, pour que l'alarme survive au processus tué et au redémarrage.
 * `creneau` : l'alarme de fin de sieste (SIESTE), ou un minuteur de séance (fin du repos, fin du compte à rebours d'une
 * série en durée), chacun la sienne : programmer l'un ne touche jamais l'autre.
 */
data class Reglage(
  val fin: Long,
  val titre: String,
  val corps: String,
  val bouton: String,
  val son: Boolean,
  val uri: String?,
  val vibration: List<Long>,
  val creneau: String = Alarme.SIESTE,
  /** Lien ouvert en touchant la notification (minuteur ; la sieste a les siens, voir `toucher` et `plein`). */
  val lien: String = "",
  /** Nom du canal de notification, dans la langue de l'appli (minuteur). */
  val canal: String = "",
)

/**
 * L'alarme de fin de sieste (planche recuperer, § 3.2) : AlarmManager.setAlarmClock (passe Doze et les économies d'énergie,
 * comme l'alarme d'une appli Horloge), puis AlarmeRecepteur → AlarmeService qui joue le son sur le flux ALARME et fait
 * vibrer en USAGE_ALARM. Le son et la vibration ne dépendent ni du mode silencieux ni de « Ne pas déranger » en priorité ou
 * « alarmes seulement » (le silence total les coupe : `diagnostic` le dit à l'appli).
 */
object Alarme {
  private const val PREFS = "pepfit_alarme"
  const val ACTION_SONNE = "fit.pep.alarme.SONNE"
  const val ACTION_ARRET = "fit.pep.alarme.ARRET"
  /** Extra des intents : le créneau visé. */
  const val CRENEAU = "creneau"
  const val SIESTE = "sieste"
  /** Minuteurs de séance : un son et une vibration courts, sans plein écran (Minuteur, plus bas). */
  val MINUTEURS = listOf("repos", "cible")
  private const val CODE = 7001

  /** Codes des PendingIntent et des notifications, distincts par créneau : 7001-7009 la sieste, 7011-7019 « repos »… */
  fun code(creneau: String, n: Int = 0) = CODE + 10 * (MINUTEURS.indexOf(creneau) + 1) + n

  private fun prefs(creneau: String) = if (creneau == SIESTE) PREFS else "${PREFS}_$creneau"
  /** L'appli est à l'écran : l'alarme sonne et vibre, mais la notification reste discrète (pas de plein écran). */
  @Volatile var visible = false
  /** Le service sonne en ce moment. */
  @Volatile var sonne = false
  /** Le créneau qui sonne (si `sonne`). */
  @Volatile var creneauQuiSonne: String? = null
  private var activite: WeakReference<Activity>? = null

  /** Seule la sieste se montre par-dessus l'écran verrouillé ; un minuteur de séance ne fait que sonner et vibrer. */
  val siesteSonne get() = sonne && creneauQuiSonne == SIESTE

  fun lire(c: Context, creneau: String = SIESTE): Reglage? {
    val p = c.getSharedPreferences(prefs(creneau), Context.MODE_PRIVATE)
    val fin = p.getLong("fin", 0L)
    if (fin <= 0L) return null
    return Reglage(
      fin,
      p.getString("titre", "") ?: "",
      p.getString("corps", "") ?: "",
      p.getString("bouton", "") ?: "",
      p.getBoolean("son", true),
      p.getString("uri", null),
      (p.getString("vibration", "") ?: "").split(",").mapNotNull { it.toLongOrNull() },
      creneau,
      p.getString("lien", "") ?: "",
      p.getString("canal", "") ?: "",
    )
  }

  private fun ecrire(c: Context, creneau: String, r: Reglage?) {
    val e = c.getSharedPreferences(prefs(creneau), Context.MODE_PRIVATE).edit()
    if (r == null) e.clear()
    else e.putLong("fin", r.fin).putString("titre", r.titre).putString("corps", r.corps).putString("bouton", r.bouton)
      .putBoolean("son", r.son).putString("uri", r.uri).putString("vibration", r.vibration.joinToString(","))
      .putString("lien", r.lien).putString("canal", r.canal)
    e.apply()
  }

  private fun ouvrir(c: Context, lien: String, code: Int): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(lien)).setPackage(c.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  /** Tapé sur la notification : la sieste s'ouvre et coupe l'alarme (?silence=1) ; un minuteur ouvre la séance. */
  fun toucher(c: Context, r: Reglage) =
    if (r.creneau == SIESTE) ouvrir(c, "pepfitopen://recuperer/en-cours?silence=1", 1) else ouvrir(c, r.lien, code(r.creneau, 3))

  /** Plein écran sur l'écran verrouillé : l'appli s'ouvre sur « C'est l'heure », l'alarme continue jusqu'au bouton. */
  fun plein(c: Context) = ouvrir(c, "pepfitopen://recuperer/en-cours", 2)

  private fun operation(c: Context, creneau: String): PendingIntent {
    val i = Intent(c, AlarmeRecepteur::class.java).setAction(ACTION_SONNE)
    // la sieste garde son intent d'avant (sans extra) : une alarme posée par l'ancienne version s'annule toujours
    if (creneau != SIESTE) i.putExtra(CRENEAU, creneau)
    return PendingIntent.getBroadcast(c, code(creneau), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  /** Programme (ou reprogramme) l'alarme de son créneau, à la place de la précédente ; faux si le système la refuse. */
  fun programmer(c: Context, r: Reglage): Boolean {
    ecrire(c, r.creneau, r)
    return poser(c, r)
  }

  /** Repose les alarmes enregistrées (redémarrage du téléphone, mise à jour de l'appli) si leur heure n'est pas passée. */
  fun reposer(c: Context) {
    for (creneau in listOf(SIESTE) + MINUTEURS) {
      val r = lire(c, creneau) ?: continue
      if (r.fin <= System.currentTimeMillis()) ecrire(c, creneau, null) else poser(c, r)
    }
  }

  /**
   * L'heure exacte est permise : SCHEDULE_EXACT_ALARM (app.json) est accordée par l'utilisateur sur Android 12+ (« Alarmes et
   * rappels »), refusée d'office aux nouvelles installations d'Android 14+. USE_EXACT_ALARM, accordée d'office, est réservée par
   * Google Play aux applis Horloge et agenda (docs/PUBLICATION-PLAY.md).
   */
  fun exactePermise(c: Context): Boolean =
    Build.VERSION.SDK_INT < 31 || (c.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()

  /**
   * Pose l'alarme : setAlarmClock si l'heure exacte est permise (vrai) ; sinon une alarme inexacte qui passe Doze
   * (setAndAllowWhileIdle, faux) : elle sonne quand même, parfois en retard, et sans le droit de lancer le service depuis
   * l'arrière-plan (AlarmeRecepteur se rabat alors sur la notification d'alarme). Accordée plus tard, AlarmeDemarrage la repose.
   */
  private fun poser(c: Context, r: Reglage): Boolean =
    try {
      val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      if (exactePermise(c)) {
        val montrer = if (r.creneau == SIESTE) plein(c) else toucher(c, r)
        am.setAlarmClock(AlarmManager.AlarmClockInfo(r.fin, montrer), operation(c, r.creneau))
        true
      } else {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fin, operation(c, r.creneau))
        false
      }
    } catch (e: Exception) {
      false
    }

  /** Annule l'alarme à venir de ce créneau et fait taire la sienne si elle sonne ; un minuteur retire aussi sa notification. */
  fun annuler(c: Context, creneau: String = SIESTE) {
    try {
      (c.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(operation(c, creneau))
    } catch (e: Exception) {
    }
    ecrire(c, creneau, null)
    arreter(c, creneau)
    if (creneau != SIESTE) (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(AlarmeService.notif(creneau))
  }

  /** Fait taire l'alarme de ce créneau si elle sonne (le réglage de la prochaine, lui, reste). */
  fun arreter(c: Context, creneau: String = SIESTE) {
    if (sonne && creneauQuiSonne == creneau) c.startService(Intent(c, AlarmeService::class.java).setAction(ACTION_ARRET))
  }

  /** L'appli revient à l'écran : les notifications des minuteurs déjà sonnés partent (la séance montre le repos). */
  fun retirerFinies(c: Context) {
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    for (creneau in MINUTEURS) if (!(sonne && creneauQuiSonne == creneau)) nm.cancel(AlarmeService.notif(creneau))
  }

  /** Fin de l'alarme gardée : vide le réglage une fois sonnée. */
  fun consommee(c: Context, creneau: String = SIESTE) = ecrire(c, creneau, null)

  // --------------------------------------------------------------- l'écran verrouillé

  /** L'activité de l'appli, pour la montrer par-dessus l'écran verrouillé pendant que l'alarme sonne (jamais le reste du temps). */
  fun suivre(app: Application) {
    app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(a: Activity, b: Bundle?) { activite = WeakReference(a); sur(a, siesteSonne) }
      override fun onActivityResumed(a: Activity) { activite = WeakReference(a); visible = true; sur(a, siesteSonne) }
      override fun onActivityPaused(a: Activity) { visible = false }
      override fun onActivityStarted(a: Activity) {}
      override fun onActivityStopped(a: Activity) {}
      override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
      override fun onActivityDestroyed(a: Activity) { if (activite?.get() === a) activite = null }
    })
  }

  /** Montre (ou non) l'activité par-dessus l'écran verrouillé et allume l'écran. */
  fun surVerrou(actif: Boolean) {
    activite?.get()?.let { a -> a.runOnUiThread { sur(a, actif) } }
  }

  private fun sur(a: Activity, actif: Boolean) {
    if (Build.VERSION.SDK_INT >= 27) {
      a.setShowWhenLocked(actif)
      a.setTurnScreenOn(actif)
    }
  }

  // --------------------------------------------------------------- le diagnostic

  /**
   * Ce qui pourrait couper l'alarme : « Ne pas déranger » en silence total (filtre NONE) ou en priorité sans l'exception des
   * alarmes, volume du flux alarme à zéro. Le mode silencieux et « Ne pas déranger » en priorité ou alarmes seulement ne
   * coupent rien (flux ALARME, vibration USAGE_ALARM).
   */
  fun diagnostic(c: Context): Map<String, Any> {
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val am = c.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
    val filtre = nm.currentInterruptionFilter
    val alarmes = if (filtre == NotificationManager.INTERRUPTION_FILTER_PRIORITY) {
      (nm.notificationPolicy.priorityCategories and NotificationManager.Policy.PRIORITY_CATEGORY_ALARMS) != 0
    } else true
    val plein = if (Build.VERSION.SDK_INT >= 34) nm.canUseFullScreenIntent() else true
    val exact = exactePermise(c)
    val pm = c.getSystemService(Context.POWER_SERVICE) as PowerManager
    return mapOf(
      "ne_pas_deranger" to when (filtre) {
        NotificationManager.INTERRUPTION_FILTER_NONE -> "total"
        NotificationManager.INTERRUPTION_FILTER_ALARMS -> "alarmes"
        NotificationManager.INTERRUPTION_FILTER_PRIORITY -> "priorite"
        else -> "non"
      },
      "alarmes_permises" to alarmes,
      "sonnerie" to when (am.ringerMode) {
        android.media.AudioManager.RINGER_MODE_SILENT -> "silencieux"
        android.media.AudioManager.RINGER_MODE_VIBRATE -> "vibreur"
        else -> "normal"
      },
      "volume_alarme" to am.getStreamVolume(android.media.AudioManager.STREAM_ALARM),
      "plein_ecran" to plein,
      "heure_exacte" to exact,
      "economie" to pm.isPowerSaveMode,
    )
  }
}
