import { requireOptionalNativeModule } from "expo";

// Module local modules/pepfit-stockage (Kotlin) : accès gardés aux dossiers choisis (SAF), diagnostic dans le dossier externe de
// l'appli. Absent d'un APK plus ancien : rien.
interface Natif {
  rendreAcces(): Promise<void>;
  ecrireDiagnostic?(nom: string, contenu: string): Promise<boolean>;
}
const natif = requireOptionalNativeModule<Natif>("PepfitStockage");

export const stockage = {
  /** Rend à Android les accès gardés aux dossiers choisis (dossier de sauvegarde) ; efface aussi les fichiers de diagnostic. */
  rendreAcces: async (): Promise<void> => natif?.rendreAcces(),
  /**
   * Pose `nom` (diagnostic-*.json) dans getExternalFilesDir (/sdcard/Android/data/fit.pep.open/files/) : `adb pull` le lit sans debug.
   * Faux avec un APK plus ancien que ce module.
   */
  ecrireDiagnostic: async (nom: string, contenu: string): Promise<boolean> => (await natif?.ecrireDiagnostic?.(nom, contenu)) ?? false,
};
