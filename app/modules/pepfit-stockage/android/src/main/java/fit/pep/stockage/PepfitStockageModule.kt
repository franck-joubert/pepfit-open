package fit.pep.stockage

import android.content.Intent
import java.io.File
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Accès gardés par Android aux dossiers choisis par le sélecteur (SAF) : expo-file-system les prend (pickDirectoryAsync)
// mais ne sait pas les rendre. Et le diagnostic des activités (diagnostic-*.json) dans le dossier externe de l'appli
// (getExternalFilesDir, /sdcard/Android/data/fit.pep/files/) : adb pull le lit sans debug ; rendreAcces l'efface avec le reste.
class PepfitStockageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PepfitStockage")

    /** « Effacer les données de ce téléphone » : rend tous les accès gardés (dossier de sauvegarde). Rejouable. */
    AsyncFunction("rendreAcces") {
      val resolveur = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).contentResolver
      for (p in resolveur.persistedUriPermissions) {
        val drapeaux = (if (p.isReadPermission) Intent.FLAG_GRANT_READ_URI_PERMISSION else 0) or
          (if (p.isWritePermission) Intent.FLAG_GRANT_WRITE_URI_PERMISSION else 0)
        resolveur.releasePersistableUriPermission(p.uri, drapeaux)
      }
      // « Effacer les données de ce téléphone » : le diagnostic des activités (heures et identifiants) part aussi
      val dossier = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).getExternalFilesDir(null)
      dossier?.listFiles { f -> NOM_DIAGNOSTIC.matches(f.name) }?.forEach { it.delete() }
    }

    /** Écrit diagnostic-<quoi>.json dans le dossier externe de l'appli (fichier temporaire puis renommé : jamais à moitié écrit). */
    AsyncFunction("ecrireDiagnostic") { nom: String, contenu: String ->
      val dossier = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).getExternalFilesDir(null)
      if (dossier == null || !NOM_DIAGNOSTIC.matches(nom)) return@AsyncFunction false
      val tmp = File(dossier, "$nom.tmp")
      tmp.writeText(contenu)
      tmp.renameTo(File(dossier, nom))
    }
  }

  private companion object {
    val NOM_DIAGNOSTIC = Regex("diagnostic-[a-z0-9-]+\\.json(\\.tmp)?")
  }
}
