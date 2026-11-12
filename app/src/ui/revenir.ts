// Bouton ← des en-têtes : retour à l'écran d'avant ; ouvert par un lien (notification, pepfitopen://) sans écran d'avant, le
// retour ne faisait rien : on va alors à l'Accueil.
import { router } from "expo-router";

export function revenir(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
