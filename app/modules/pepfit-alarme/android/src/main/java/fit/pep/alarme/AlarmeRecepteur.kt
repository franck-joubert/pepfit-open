package fit.pep.alarme

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** L'heure d'une alarme (AlarmManager.setAlarmClock) : le service qui sonne démarre (un réveil exact a le droit de le faire). */
class AlarmeRecepteur : BroadcastReceiver() {
  override fun onReceive(c: Context, i: Intent) {
    if (i.action != Alarme.ACTION_SONNE) return
    val creneau = i.getStringExtra(Alarme.CRENEAU) ?: Alarme.SIESTE
    if (Alarme.lire(c, creneau) == null) return
    try {
      val service = Intent(c, AlarmeService::class.java).setAction(Alarme.ACTION_SONNE).putExtra(Alarme.CRENEAU, creneau)
      if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(service) else c.startService(service)
    } catch (e: Exception) {
      // le système refuse le service : au moins la notification, avec son canal d'alarme
      AlarmeService.secours(c, creneau)
    }
  }
}

/**
 * Redémarrage du téléphone ou mise à jour de l'appli : AlarmManager a tout oublié, l'alarme enregistrée est reposée. Même
 * chose quand l'utilisateur accorde « Alarmes et rappels » : l'alarme inexacte devient exacte.
 */
class AlarmeDemarrage : BroadcastReceiver() {
  override fun onReceive(c: Context, i: Intent) {
    when (i.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> Alarme.reposer(c)
    }
  }
}
