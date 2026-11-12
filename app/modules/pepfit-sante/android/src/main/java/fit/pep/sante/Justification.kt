package fit.pep.sante

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import java.util.Locale

// Écran de justification que Santé Connect ouvre depuis ses réglages. Version libre : aucun site ni serveur, donc la
// politique tient en quelques lignes, montrées ici (en français si le téléphone l'est, en anglais sinon).
class Justification : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val fr = Locale.getDefault().language == "fr"
    val titre = if (fr) "Tes données de santé" else "Your health data"
    val texte = if (fr)
      "pepfit lit et écrit dans Santé Connect pour calculer tes jauges et garder tes séances. Ces données restent sur ce téléphone : l'appli n'a ni compte ni serveur, et ne les envoie à personne."
    else
      "pepfit reads and writes Health Connect data to compute your gauges and keep your workouts. This data stays on this phone: the app has no account and no server, and sends it to no one."
    AlertDialog.Builder(this)
      .setTitle(titre)
      .setMessage(texte)
      .setPositiveButton(android.R.string.ok) { _, _ -> finish() }
      .setOnCancelListener { finish() }
      .show()
  }
}
