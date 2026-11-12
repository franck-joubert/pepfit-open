package fit.pep.alarme

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Ce que le JS passe à `programmerMinuteur` (app/src/natif/minuteur/index.android.ts). */
class Minuteur : Record {
  @Field val creneau: String = ""
  @Field val fin: Double = 0.0
  @Field val titre: String = ""
  @Field val corps: String = ""
  /** Nom du canal de notification, dans la langue de l'appli. */
  @Field val canal: String = ""
  @Field val son: Boolean = true
  @Field val uri: String? = null
  @Field val vibration: List<Long> = emptyList()
  /** Ouvert en touchant la notification (pepfitopen://session). */
  @Field val lien: String = ""
}

/**
 * Alarme de fin de sieste (planche recuperer) : une vraie alarme, comme une appli Horloge (voir Alarme.kt). Le JS programme
 * l'heure, annule, fait taire, lit le diagnostic (ce qui pourrait couper l'alarme) et ouvre les réglages utiles.
 */
class PepfitAlarmeModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PepfitAlarme")

    OnCreate {
      (appContext.reactContext?.applicationContext as? android.app.Application)?.let { Alarme.suivre(it) }
      // l'appli vient d'être lancée par le plein écran de l'alarme : elle se montre par-dessus l'écran verrouillé
      if (Alarme.siesteSonne) Alarme.surVerrou(true)
    }

    // l'appli est à l'écran : l'alarme sonne quand même, mais sa notification reste discrète (docs/NOTIFICATIONS.md)
    OnActivityEntersForeground {
      Alarme.visible = true
      appContext.reactContext?.let { Alarme.retirerFinies(it) }
    }
    OnActivityEntersBackground { Alarme.visible = false }

    /** Programme l'alarme à `fin` (ms) : faux si le système refuse l'heure exacte (elle est alors posée inexacte). */
    AsyncFunction("programmer") { fin: Double, titre: String, corps: String, bouton: String, son: Boolean, uri: String?, vibration: List<Long> ->
      Alarme.programmer(context, Reglage(fin.toLong(), titre, corps, bouton, son, uri, vibration))
    }

    /** Annule l'alarme à venir et fait taire celle qui sonne. */
    AsyncFunction("annuler") { Alarme.annuler(context) }

    /** Fait taire l'alarme qui sonne, sans toucher à la suivante. */
    AsyncFunction("arreter") { Alarme.arreter(context) }

    /**
     * Minuteur de séance (fin du repos, fin d'une série en durée) : même alarme exacte que la sieste, qui passe Doze, l'appli
     * fermée et le mode silencieux, mais un son et une vibration courts, sans plein écran. `creneau` : « repos » ou « cible » ;
     * reprogrammer un créneau remplace sa minuterie (jamais deux), et ne touche ni l'autre créneau ni la sieste.
     */
    AsyncFunction("programmerMinuteur") { m: Minuteur ->
      if (m.creneau !in Alarme.MINUTEURS) false
      else Alarme.programmer(context, Reglage(m.fin.toLong(), m.titre, m.corps, "", m.son, m.uri, m.vibration, m.creneau, m.lien, m.canal))
    }

    /** Annule le minuteur de ce créneau, le fait taire s'il sonne et retire sa notification. */
    AsyncFunction("annulerMinuteur") { creneau: String -> if (creneau in Alarme.MINUTEURS) Alarme.annuler(context, creneau) }

    /** Ce qui pourrait couper l'alarme (Ne pas déranger, volume, plein écran, heure exacte, économie d'énergie). */
    AsyncFunction("diagnostic") { Alarme.diagnostic(context) }

    /** L'heure exacte est permise (« Alarmes et rappels », Android 12+). */
    AsyncFunction("heureExacte") { Alarme.exactePermise(context) }

    /** Ouvre le réglage « Alarmes et rappels » de l'appli (Android 12+). */
    AsyncFunction("ouvrirHeureExacte") {
      if (Build.VERSION.SDK_INT >= 31) {
        val i = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
      }
    }

    /** Ouvre le réglage « notifications plein écran » de l'appli (Android 14+). */
    AsyncFunction("ouvrirPleinEcran") {
      if (Build.VERSION.SDK_INT >= 34) {
        val i = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
      }
    }
  }
}
