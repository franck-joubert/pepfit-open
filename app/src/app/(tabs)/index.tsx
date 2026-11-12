import { Redirect } from "expo-router";
import { useApp } from "../../ecrans/contexte";
import { premierOnglet } from "../../ui/menu-flottant";

// « / » n'est pas un onglet : c'est la porte d'entrée de l'appli (lancement, router.replace("/") après un
// retour ou un parcours). Elle mène au premier onglet allumé dans la barre : Moi, sinon Sport, Nutrition. L'ancien Accueil modulable est gardé dans ecrans/AccueilAncien.tsx, désactivé.
export default function Entree() {
  const { reglages } = useApp();
  return <Redirect href={premierOnglet(reglages.parties)} />;
}
