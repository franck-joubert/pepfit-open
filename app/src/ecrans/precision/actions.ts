// Où mène une étape de la précision (« chaque étape mène où l'on agit », comme l'ancien conseil de l'Énergie) : autoriser les pas sur
// place, journal, Mensurations, Préférences, Connexions, test VMA,
// zones de FC, séances du jour.
import { router, type Href } from "expo-router";
import { autoriserSante } from "../sante-donnees";
import { ouvrirTestVma } from "../mesures/Vo2";
import { invaliderPrecision } from "../../precision/service";
import type { IdAction, IdCalcul } from "../../precision/modele";

const ROUTE: Record<Exclude<IdAction, "pas" | "vma">, Href> = {
  profil: "/settings/corps",
  naissance: "/settings/corps",
  sexe: "/settings/corps",
  taille: "/settings/corps",
  pesee: "/sante/poids",
  pesees: "/sante/poids",
  tour: { pathname: "/sante/poids", params: { section: "tours" } },
  gras: "/sante/gras",
  capteur: "/settings/connexions",
  nuits: "/sante/sommeil",
  fcseance: "/settings/connexions",
  semaines: "/(tabs)/train",
  repas: "/(tabs)/food",
  fcmax: "/settings/zones",
  // les activités détectées attendent leur sport dans les séances du jour
  reco: "/(tabs)/train",
  muscu: "/(tabs)/train",
};

/** Va où l'on fait l'étape ; `avant` ferme la feuille ou le volet ; les pas s'autorisent sur place, puis `apres`. */
export function suivreEtape(id: IdAction, avant: () => void = () => {}, apres: () => void = () => {}): void {
  if (id === "pas") {
    autoriserSante()
      .then(() => {
        invaliderPrecision();
        apres();
      })
      .catch(console.error);
    return;
  }
  avant();
  if (id === "vma") ouvrirTestVma();
  else router.push(ROUTE[id]);
}

/** La page de statistiques d'un calcul (lien du bas de sa feuille ouverte depuis le Profil). */
export const PAGE_CALCUL: Partial<Record<IdCalcul, Href>> = {
  depense: "/sante/energie",
  sommeil: "/sante/sommeil",
  recup: "/sante/recuperation",
  vo2: "/sante/vo2max",
  age: "/sante/age",
  zones: "/settings/zones",
  composition: "/sante/composition",
  bilan: "/sante/poids",
};
