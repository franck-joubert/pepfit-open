package fit.pep.navigateur

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Une adresse de pep.fit que l'appli ne montre pas (page du site, mot réservé : src/liens.ts) s'ouvre dans un navigateur
// désigné par son paquet : un ACTION_VIEW ordinaire repasserait par les App Links de l'appli, qui se rouvrirait en boucle.
// Le navigateur : celui par défaut, sinon Chrome, sinon le premier installé. (Le sélecteur CATEGORY_APP_BROWSER, essayé le
// 30/10, montrait sur l'émulateur une feuille « Ouvrir avec » listant toutes les applis.)
class PepfitNavigateurModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PepfitNavigateur")

    /** Ouvre `url` dans un navigateur ; faux si aucun navigateur n'est installé. */
    Function("ouvrir") { url: String ->
      val activite = appContext.currentActivity
      val contexte = activite ?: appContext.reactContext ?: return@Function false
      val pm = contexte.packageManager
      // Une adresse qu'aucune appli ne revendique : seuls les navigateurs y répondent.
      val neutre = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/")).addCategory(Intent.CATEGORY_BROWSABLE)
      val navigateurs = pm.queryIntentActivities(neutre, PackageManager.MATCH_ALL)
        .map { it.activityInfo.packageName }
        .filter { it != contexte.packageName }
      val parDefaut = pm.resolveActivity(neutre, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
      val choisi = parDefaut?.takeIf { it in navigateurs }
        ?: navigateurs.firstOrNull { it == "com.android.chrome" }
        ?: navigateurs.firstOrNull()
        ?: return@Function false
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        addCategory(Intent.CATEGORY_BROWSABLE)
        setPackage(choisi)
        if (activite == null) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        contexte.startActivity(intent)
        true
      } catch (e: ActivityNotFoundException) {
        false
      }
    }

    /**
     * Passe l'appli derrière, sans la fermer (lot I, D9) : Android ramène la tâche d'avant, le navigateur qui a ouvert
     * le lien « Ouvrir avec l'appli pepfit ». Faux sans activité au premier plan.
     */
    Function("passerDerriere") {
      appContext.currentActivity?.moveTaskToBack(true) ?: false
    }
  }
}
