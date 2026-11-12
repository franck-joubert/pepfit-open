package fit.pep.alarme

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings

/**
 * Le service qui sonne, comme une appli Horloge : son sur le flux ALARME (USAGE_ALARM), vibration en USAGE_ALARM lancée par
 * l'appli (une notification de canal ne vibre pas en mode silencieux), notification d'alarme.
 * - Sieste : son en boucle, vibration répétée, plein écran sur l'écran verrouillé et bouton « Je suis réveillé ». S'arrête au
 *   bouton, à « Je suis réveillé » dans l'appli (Alarme.annuler) ou au bout de DUREE_MS ; la notification reste, sans son.
 * - Minuteur de séance (repos, cible) : le son une fois, la vibration une fois, pas de plein écran ; la notification reste
 *   jusqu'à la série suivante (Alarme.annuler) ou qu'on la touche.
 * Une alarme à la fois : si une autre sonne déjà, elle se tait (sa notification reste) et laisse la place.
 */
class AlarmeService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private var lecteur: MediaPlayer? = null
  private var verrou: PowerManager.WakeLock? = null
  /** Le réglage de l'alarme qui sonne. */
  private var actuel: Reglage? = null
  // fin du délai : la notification reste (sans son), sauf celle d'un minuteur appli à l'écran (la séance montre déjà le repos)
  private val delai = Runnable { arreter(garder = actuel?.creneau == Alarme.SIESTE || !Alarme.visible) }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == Alarme.ACTION_ARRET) {
      arreter(garder = false)
      return START_NOT_STICKY
    }
    val creneau = intent?.getStringExtra(Alarme.CRENEAU) ?: Alarme.SIESTE
    val r = Alarme.lire(this, creneau)
    if (r == null) {
      if (actuel == null) stopSelf()
      return START_NOT_STICKY
    }
    val avant = actuel?.takeIf { it.creneau != creneau }
    taire()
    try {
      val n = notification(this, r, true)
      if (Build.VERSION.SDK_INT >= 29) startForeground(notif(creneau), n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) else startForeground(notif(creneau), n)
    } catch (e: Exception) {
      secours(this, creneau)
      if (avant == null) stopSelf()
      return START_NOT_STICKY
    }
    // l'alarme d'avant s'est tue : sa notification reste, sans son (startForeground sous un autre numéro l'a retirée)
    if (avant != null) {
      Alarme.consommee(this, avant.creneau)
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(notif(avant.creneau), notificationFinie(this, avant))
    }
    actuel = r
    Alarme.creneauQuiSonne = creneau
    Alarme.sonne = true
    val sieste = creneau == Alarme.SIESTE
    if (sieste) Alarme.surVerrou(true)
    val duree = if (sieste) DUREE_MS else DUREE_MINUTEUR_MS
    tenirVerrou(duree)
    if (r.son) sonner(r, boucle = sieste)
    if (r.vibration.isNotEmpty()) vibrer(r.vibration, repeter = sieste)
    main.postDelayed(delai, duree)
    return START_NOT_STICKY
  }

  private fun tenirVerrou(duree: Long) {
    if (verrou?.isHeld == true) return
    verrou = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pepfit:alarme").also {
      it.setReferenceCounted(false)
      it.acquire(duree + 5_000)
    }
  }

  /**
   * Le son choisi, sinon la sonnerie d'alarme du téléphone (sieste, en boucle) ou son son de notification (minuteur, une
   * fois), sur le flux alarme ; l'autre sinon.
   */
  private fun sonner(r: Reglage, boucle: Boolean) {
    val attributs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    val alarme = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    val notification = Settings.System.DEFAULT_NOTIFICATION_URI
    val candidats = listOfNotNull(r.uri?.let(Uri::parse)) + if (boucle) listOfNotNull(alarme, notification) else listOfNotNull(notification, alarme)
    for (uri in candidats) {
      try {
        val p = MediaPlayer()
        p.setAudioAttributes(attributs)
        p.setDataSource(this, uri)
        p.isLooping = boucle
        p.prepare()
        p.start()
        lecteur = p
        return
      } catch (e: Exception) {
        // son illisible : le suivant
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun vibrer(motif: List<Long>, repeter: Boolean) {
    val v: Vibrator = if (Build.VERSION.SDK_INT >= 31) (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    else getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    // sieste : le motif de l'appli, une pause de 1,5 s, puis il recommence (repeat = 0) ; minuteur : le motif une fois (-1)
    val m = (if (repeter) motif + 1500L else motif).toLongArray()
    val attributs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    try {
      v.vibrate(VibrationEffect.createWaveform(m, if (repeter) 0 else -1), attributs)
    } catch (e: Exception) {
    }
  }

  private fun taire() {
    main.removeCallbacks(delai)
    try { lecteur?.stop() } catch (e: Exception) {}
    lecteur?.release()
    lecteur = null
    val v: Vibrator = if (Build.VERSION.SDK_INT >= 31) (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    else getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    v.cancel()
    if (verrou?.isHeld == true) verrou?.release()
    if (Alarme.siesteSonne) Alarme.surVerrou(false)
    Alarme.sonne = false
    Alarme.creneauQuiSonne = null
  }

  /** `garder` : fin du délai, la notification reste (sans son) ; sinon elle part avec le service. */
  private fun arreter(garder: Boolean) {
    taire()
    val r = actuel
    actuel = null
    if (r != null) Alarme.consommee(this, r.creneau)
    if (garder && r != null) {
      stopForeground(STOP_FOREGROUND_DETACH)
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(notif(r.creneau), notificationFinie(this, r))
    } else stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    taire()
    super.onDestroy()
  }

  companion object {
    /** Numéro de la notification d'un créneau : 7002 la sieste (celui d'avant), 7012 le repos, 7022 la cible. */
    fun notif(creneau: String) = Alarme.code(creneau, 1)
    /** Comme une appli Horloge, l'alarme se tait seule (la sieste n'est pas un réveil d'urgence). */
    const val DUREE_MS = 90_000L
    /** Un minuteur de séance : le temps du son de notification ; le service s'arrête ensuite, la notification reste. */
    const val DUREE_MINUTEUR_MS = 8_000L

    /** Canaux : ceux de la sieste (d'avant) ; un trio commun aux minuteurs, nommé dans la langue de l'appli. */
    private fun canalDe(r: Reglage, sorte: String): String {
      val base = if (r.creneau == Alarme.SIESTE) "alarme-sieste" else "alarme-minuteur"
      return if (sorte.isEmpty()) base else "$base-$sorte"
    }

    private fun nomDe(r: Reglage) = if (r.creneau == Alarme.SIESTE) "Fin de sieste" else r.canal.ifEmpty { "Minuteur" }

    private fun canal(c: Context, id: String, nom: String, importance: Int, secours: Boolean = false) {
      val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(id) != null) return
      nm.createNotificationChannel(NotificationChannel(id, nom, importance).apply {
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        if (secours) {
          setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
          )
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 600, 400, 600, 400, 600)
        } else {
          // le son et la vibration sont ceux du service : jamais une seconde fois par le canal
          setSound(null, null)
          enableVibration(false)
        }
      })
    }

    private fun base(c: Context, r: Reglage, id: String): Notification.Builder {
      val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, id) else Notification.Builder(c)
      return b.setSmallIcon(c.applicationInfo.icon).setContentTitle(r.titre).setContentText(r.corps).setCategory(Notification.CATEGORY_ALARM)
        .setVisibility(Notification.VISIBILITY_PUBLIC).setContentIntent(Alarme.toucher(c, r)).setWhen(r.fin).setShowWhen(true)
    }

    /**
     * La notification de l'alarme qui sonne : plein écran sur l'écran verrouillé (sieste seulement) et bouton d'arrêt ;
     * discrète si l'appli est à l'écran.
     */
    fun notification(c: Context, r: Reglage, sonne: Boolean): Notification {
      val discret = Alarme.visible
      val id = canalDe(r, if (discret) "discret" else "")
      canal(c, id, nomDe(r), if (discret) NotificationManager.IMPORTANCE_LOW else NotificationManager.IMPORTANCE_HIGH)
      val b = base(c, r, id).setOngoing(sonne)
      if (!discret && r.creneau == Alarme.SIESTE) b.setFullScreenIntent(Alarme.plein(c), true)
      if (r.bouton.isNotEmpty()) {
        val arret = PendingIntent.getService(c, 3, Intent(c, AlarmeService::class.java).setAction(Alarme.ACTION_ARRET), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        @Suppress("DEPRECATION")
        b.addAction(Notification.Action.Builder(0, r.bouton, arret).build())
      }
      if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_MAX)
      return b.build()
    }

    /** Après le délai : la notification reste, sans son ni plein écran, jusqu'à ce qu'on l'ouvre ou la balaye. */
    fun notificationFinie(c: Context, r: Reglage): Notification {
      val id = canalDe(r, "discret")
      canal(c, id, nomDe(r), NotificationManager.IMPORTANCE_LOW)
      return base(c, r, id).setAutoCancel(true).setOngoing(false).build()
    }

    /** Le service ne peut pas démarrer : la notification seule, sur un canal d'alarme avec son et vibration (dernier recours). */
    fun secours(c: Context, creneau: String = Alarme.SIESTE) {
      val r = Alarme.lire(c, creneau) ?: return
      val id = canalDe(r, "secours")
      canal(c, id, "${nomDe(r)} (secours)", NotificationManager.IMPORTANCE_HIGH, secours = true)
      val b = base(c, r, id).setAutoCancel(true)
      if (creneau == Alarme.SIESTE) b.setFullScreenIntent(Alarme.plein(c), true)
      (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(notif(creneau), b.build())
      Alarme.consommee(c, creneau)
    }
  }
}
