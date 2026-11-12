import { Redirect } from "expo-router";

/** Lien pepfitopen:// vers une route inconnue : l'Accueil, pas l'écran « Unmatched Route » d'expo-router (anglais, hors thème). */
export default function Introuvable() {
  return <Redirect href="/" />;
}
