package fit.pep.suivi

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import java.util.Locale

/**
 * Service de premier plan du suivi : « location|connectedDevice » en course ; « health » en mode FC (tapis, intérieur : sans
 * GPS, avec ou sans capteur, D2 du 29/10), plus « connectedDevice » avec la FC ; « connectedDevice » seul en muscu (FC pendant
 * une séance, lot 5 : pas d'action Pause dans la notification).
 * GPS par LocationManager (fournisseur GPS, 1 Hz : pas de Play Services, aucune dépendance), baromètre, FC en BLE,
 * une seule notification mise à jour au plus toutes les 10 s (chrono d'Android, distance, FC ; pas de numéro de tour, D17).
 * Wake lock partiel pendant la séance (padel du 30/10, FC coupée écran éteint) : sans lui, le battement d'une seconde et la
 * reconnexion du capteur (Frequence.verifier) s'arrêtent quand le processeur dort. Journal local des coupures (Suivi.journal) :
 * écran, veille, économie d'énergie, relance du service par le système.
 */
class SuiviService : Service(), LocationListener, SensorEventListener {
  private val main = Handler(Looper.getMainLooper())
  private var frequence: Frequence? = null
  private var gpsActif = false
  private var baroActif = false
  private var derniereNotif = 0L
  private var verrou: PowerManager.WakeLock? = null
  private var dernierVerrou = 0L

  /** Écran, veille (Doze) et économie d'énergie : au journal, pour relier une coupure à ce que faisait le téléphone. */
  private val etats = object : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      when (i.action) {
        Intent.ACTION_SCREEN_OFF -> Suivi.journal("ecran", "eteint")
        Intent.ACTION_SCREEN_ON -> Suivi.journal("ecran", "allume")
        PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED -> Suivi.journal("veille", if (pm.isDeviceIdleMode) 1 else 0)
        PowerManager.ACTION_POWER_SAVE_MODE_CHANGED -> Suivi.journal("economie", if (pm.isPowerSaveMode) 1 else 0)
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_BASCULER -> {
        if (Suivi.statut == "pause") Suivi.reprendre() else Suivi.pause()
        notifier(true)
        Suivi.emettre()
        return START_STICKY
      }
      ACTION_ARRETER -> {
        Suivi.journal("fin")
        arreterTout()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        return START_NOT_STICKY
      }
    }
    // démarrage, ou relance par le système après la mort du processus (intent null) : on reprend le tampon
    if (intent == null && (Suivi.statut == "arrete" && !Suivi.restaurer(this))) {
      stopSelf()
      return START_NOT_STICKY
    }
    // relance par le système : le processus avait été tué (batterie, mémoire) ; tout ce temps-là manque
    if (intent == null) Suivi.journal("relance_systeme")
    val course = Suivi.mode == "course"
    // relance par le système : la FC si un capteur était connu ; en muscu, toujours (le suivi n'a que la FC)
    val fc = intent?.getBooleanExtra(EXTRA_FC, true) ?: (Suivi.adresse != null || Suivi.mode == "muscu")
    val gps = course && autorise(Manifest.permission.ACCESS_FINE_LOCATION)
    val ble = fc && (Build.VERSION.SDK_INT < 31 || autorise(Manifest.permission.BLUETOOTH_CONNECT))
    var types = 0
    if (gps) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
    if (ble) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    // Tapis : « health » (Android 14+) tient le service sans GPS ni Bluetooth ; avant Android 14, aucun type n'est exigé
    if (Suivi.mode == "fc" && Build.VERSION.SDK_INT >= 34) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
    try {
      if (Build.VERSION.SDK_INT >= 29 && types != 0) startForeground(NOTIF, notification(), types) else startForeground(NOTIF, notification())
    } catch (e: Exception) {
      // relance en arrière-plan refusée (position « au premier plan » seulement) : le tampon attend l'appli
      Suivi.fermer()
      stopSelf()
      return START_NOT_STICKY
    }
    if (frequence == null) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      Suivi.journal(
        "debut",
        "mode=${Suivi.mode};fc=${if (ble) 1 else 0};android=${Build.VERSION.SDK_INT};optimisee=${if (pm.isIgnoringBatteryOptimizations(packageName)) 0 else 1};economie=${if (pm.isPowerSaveMode) 1 else 0}",
      )
    }
    tenirVerrou()
    if (gps) demarrerGps()
    if (course) demarrerBaro()
    if (ble && frequence == null) {
      frequence = Frequence(this) { Suivi.emettre() }.also { it.demarrer(intent?.getStringExtra(EXTRA_APPAREIL) ?: Suivi.adresse) }
    }
    main.removeCallbacks(battement)
    main.post(battement)
    return START_STICKY
  }

  private val battement = object : Runnable {
    override fun run() {
      if (Suivi.statut == "arrete") return
      Suivi.verifierGps()
      frequence?.verifier()
      tenirVerrou()
      Suivi.emettre()
      notifier(false)
      main.postDelayed(this, 1000)
    }
  }

  /** Wake lock partiel de la séance, renouvelé toutes les 10 min (borné à VERROU_MS : jamais tenu au-delà si tout se bloque). */
  private fun tenirVerrou() {
    val t = SystemClock.elapsedRealtime()
    val v = verrou ?: (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pepfit:suivi").also {
      it.setReferenceCounted(false)
      verrou = it
      dernierVerrou = 0L
    }
    if (dernierVerrou != 0L && t - dernierVerrou < 600_000) return
    dernierVerrou = t
    try { v.acquire(VERROU_MS) } catch (_: Exception) {}
  }

  private fun autorise(p: String) = checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

  @SuppressLint("MissingPermission")
  private fun demarrerGps() {
    if (gpsActif) return
    val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    try {
      lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this, Looper.getMainLooper())
      gpsActif = true
    } catch (_: Exception) {
      Suivi.gpsEtat = "coupe"
    }
  }

  private fun demarrerBaro() {
    if (baroActif) return
    val sm = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val capteur = sm.getDefaultSensor(Sensor.TYPE_PRESSURE)
    Suivi.baroPresent = capteur != null
    if (capteur != null) baroActif = sm.registerListener(this, capteur, SensorManager.SENSOR_DELAY_NORMAL)
  }

  override fun onLocationChanged(l: Location) {
    Suivi.position(
      l.latitude, l.longitude, l.accuracy.toDouble(),
      if (l.hasAltitude()) l.altitude else null,
      if (l.hasSpeed()) l.speed.toDouble() else null,
    )
  }

  override fun onProviderDisabled(provider: String) {
    Suivi.gpsEtat = "perdu"
  }

  override fun onProviderEnabled(provider: String) {}

  override fun onSensorChanged(e: SensorEvent) {
    Suivi.barometre(e.values[0].toDouble())
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  private fun arreterTout() {
    main.removeCallbacksAndMessages(null)
    if (gpsActif) (getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(this)
    if (baroActif) (getSystemService(Context.SENSOR_SERVICE) as SensorManager).unregisterListener(this)
    gpsActif = false
    baroActif = false
    frequence?.arreter()
    frequence = null
    verrou?.let { if (it.isHeld) try { it.release() } catch (_: Exception) {} }
    verrou = null
  }

  override fun onDestroy() {
    try { unregisterReceiver(etats) } catch (_: Exception) {}
    arreterTout()
    instance = null
    super.onDestroy()
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    canal(this)
    Suivi.ouvrirJournal(this)
    val f = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
      addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
    }
    try {
      if (Build.VERSION.SDK_INT >= 33) registerReceiver(etats, f, Context.RECEIVER_NOT_EXPORTED) else registerReceiver(etats, f)
    } catch (_: Exception) {}
  }

  /** Met la notification à jour : tout de suite si `force` (pause, reprise), sinon au plus toutes les 10 s. */
  fun notifier(force: Boolean) {
    val t = SystemClock.elapsedRealtime()
    if (!force && t - derniereNotif < 10_000) return
    derniereNotif = t
    if (!force) Suivi.sauver()
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF, notification())
  }

  private fun notification(): Notification {
    val enPause = Suivi.statut == "pause"
    val km = String.format(Locale.FRANCE, "%.2f km", Suivi.distanceM / 1000)
    val fc = Suivi.bpm?.takeIf { Suivi.fcEtat == "connecte" }?.let { "$it bpm" }
    val titre = if (enPause) "${Suivi.titre} · en pause" else Suivi.titre
    val texte = listOfNotNull(if (Suivi.mode == "course") km else null, fc).joinToString(" · ").ifEmpty { "Suivi en cours" }
    val ouvrir = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val basculer = PendingIntent.getService(
      this, 1, Intent(this, SuiviService::class.java).setAction(ACTION_BASCULER),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val b = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CANAL) else @Suppress("DEPRECATION") Notification.Builder(this))
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(titre)
      .setContentText(if (enPause) "${duree(Suivi.tempsMs())} · $texte" else texte)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_WORKOUT)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(ouvrir)
    // Muscu : la pause est celle de la séance (bande du bas de l'appli), la notification ne fait que montrer le chrono et la FC
    if (Suivi.mode != "muscu") b.addAction(Notification.Action.Builder(null, if (enPause) "Reprendre" else "Pause", basculer).build())
    if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    // Chrono d'Android : il avance seul, sans réveiller l'appli ; figé en pause (le temps est dans le texte)
    if (!enPause) {
      b.setWhen(System.currentTimeMillis() - Suivi.tempsMs()).setShowWhen(true).setUsesChronometer(true)
    } else {
      b.setShowWhen(false)
    }
    // Android 16 : demande de promotion (puce « Live Update » dans la barre d'état, D6)
    if (Build.VERSION.SDK_INT >= 36) {
      try {
        b.setRequestPromotedOngoing(true)
        if (Suivi.mode == "course") b.setShortCriticalText(km)
      } catch (_: Throwable) {}
    }
    return b.build()
  }

  private fun duree(ms: Long): String {
    val s = ms / 1000
    return if (s >= 3600) String.format(Locale.FRANCE, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
    else String.format(Locale.FRANCE, "%d:%02d", s / 60, s % 60)
  }

  companion object {
    const val CANAL = "suivi"
    const val NOTIF = 4280
    const val ACTION_BASCULER = "fit.pep.suivi.BASCULER"
    const val ACTION_ARRETER = "fit.pep.suivi.ARRETER"
    const val EXTRA_FC = "fc"
    const val EXTRA_APPAREIL = "appareil"
    /** Durée maximale du wake lock d'un coup (renouvelé tant que la séance tourne). */
    const val VERROU_MS = 30 * 60_000L
    var instance: SuiviService? = null

    fun canal(ctx: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CANAL) != null) return
      // importance par défaut, sans son ni vibration : une promotion (Live Update) exige plus que « faible »
      nm.createNotificationChannel(NotificationChannel(CANAL, "Suivi en cours", NotificationManager.IMPORTANCE_DEFAULT).apply {
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      })
    }
  }
}
