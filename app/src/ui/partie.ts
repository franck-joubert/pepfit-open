// Partie de l'appli d'un écran, lue sur sa route, sans React Native (testée dans tests/partie.test.ts).

import type { Partie } from "../theme/effets";
import type { Jetons } from "../theme/jetons";
import { PAGES_PARTAGEES, ROUTE_PAGES_PARTAGEES } from "./pages-partagees";

/** Jeton du fond d'une partie (jour : quasi-blanc teinté, retour du 27/10 ; nuit : bg). */
export const FOND_PARTIE: Record<Partie, keyof Jetons> = {
  accueil: "fondAccueil",
  entrainement: "fondEntrainement",
  nutrition: "fondNutrition",
  sante: "fondSante",
  fil: "fondFil",
};

/** Couleur d'accent d'une partie (sur-titre, pastilles, cases cochées, curseur et cadre du champ actif). */
export const COULEUR_PARTIE: Record<Partie, keyof Jetons> = {
  accueil: "partieAccueil",
  entrainement: "partieEntrainement",
  nutrition: "partieNutrition",
  sante: "partieSante",
  fil: "partieFil",
};

/** Premier segment de route → partie ; tout le reste (profil, réglages…) est l'Accueil. */
const SEGMENTS: Record<string, Partie> = {
  train: "entrainement",
  routine: "entrainement",
  routines: "entrainement",
  programmes: "entrainement",
  session: "entrainement",
  done: "entrainement",
  history: "entrainement",
  pick: "entrainement",
  swap: "entrainement",
  progress: "entrainement",
  "3d": "entrainement",
  gyms: "entrainement",
  gym: "entrainement",
  calendrier: "entrainement",
  suivi: "entrainement",
  boutique: "entrainement",
  plan: "entrainement",
  "seance-recap": "entrainement", // récap commun avant séance (planche ajout-seance-v2)
  food: "nutrition",
  nutrition: "nutrition",
  health: "sante",
  blessures: "sante",
  traitements: "sante",
  sante: "sante",
  recuperer: "sante", // la sieste et les activités de récupération (planche recuperer) : sous Santé, comme la page Récupération
  circuit: "fil", // la page d'un circuit et sa carte plein écran (planche Circuits) : sous la teinte du Fil
};

/** Écrans rangés ailleurs que leur premier segment ne le dit. */
const CHEMINS: Record<string, Partie> = {
  // Pages partagées (Énergie, Pas, Effort) : rangées sous Santé, mais dans la teinte de leur section (pages-partagees.ts).
  ...Object.fromEntries(Object.entries(PAGES_PARTAGEES).map(([page, { section }]) => [`${ROUTE_PAGES_PARTAGEES}/${page}`, section])),
};

/**
 * Partie d'une route, qu'elle soit un chemin (« /routine/view/3 ») ou un nom d'écran (« routine/view/[id] »). Une route
 * garde sa partie d'où qu'on vienne : une séance lancée depuis l'Accueil reste dans Entraînements.
 */
export function partieDe(route: string): Partie {
  // Les groupes d'expo-router « (tabs)/ » ne sont pas dans l'URL : on les saute.
  const premier = route.replace(/^\/+/, "").replace(/^(\([^/)]*\)\/)+/, "").split(/[/?#]/)[0] ?? "";
  const deux = route.replace(/^\/+/, "").replace(/^(\([^/)]*\)\/)+/, "").split(/[?#]/)[0]!.split("/").slice(0, 2).join("/");
  return CHEMINS[deux] ?? SEGMENTS[premier] ?? "accueil";
}
