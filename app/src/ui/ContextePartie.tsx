import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SurfacePartie, useTheme } from "../theme";
import { degrades, ombreCarte, type Degrade, type Partie } from "../theme/effets";
import { COULEUR_PARTIE, FOND_PARTIE, partieDe } from "./partie";
import { ouvrirVisite, pagePartageeDe, partieDeVisite, visiteEnCours } from "./pages-partagees";
import { partieAura } from "./aura-etat";

// Chaque écran de la pile annonce sa partie (posé par `screenLayout` dans _layout) ; ses boutons et ses feuilles
// prennent le dégradé de cette partie, ses surfaces et ses filets sa teinte (v2.2.17). Hors d'un écran : l'Accueil.

const ContextePartie = createContext<Partie>("accueil");

/**
 * `herite` (écrans de la pile racine) : un écran ouvert pendant la visite d'une page partagée en reprend la couleur (pages
 * filles, pages-partagees.ts).
 */
export function FournisseurPartie({ route, herite = false, children }: { route: string; herite?: boolean; children: ReactNode }) {
  // Page partagée (Énergie, Pas, Effort) : la couleur de l'onglet d'où l'on vient, lue à l'ouverture et figée pour la visite ;
  // page fille : celle de la visite en cours.
  const [visite] = useState(() => {
    const page = pagePartageeDe(route);
    if (page) return partieDeVisite(page, partieAura());
    return herite ? visiteEnCours() : null;
  });
  useEffect(() => (visite ? ouvrirVisite(visite) : undefined), [visite]);
  const partie = visite ?? partieDe(route);
  return (
    <ContextePartie.Provider value={partie}>
      <SurfacePartie partie={partie}>{children}</SurfacePartie>
    </ContextePartie.Provider>
  );
}

/** Partie posée par l'écran lui-même (parcours de première utilisation : le thème change d'une étape à l'autre). */
export function PartieImposee({ partie, children }: { partie: Partie; children: ReactNode }) {
  return (
    <ContextePartie.Provider value={partie}>
      <SurfacePartie partie={partie}>{children}</SurfacePartie>
    </ContextePartie.Provider>
  );
}

export function usePartie() {
  return useContext(ContextePartie);
}

/** Dégradé du geste principal de l'écran courant. */
export function useDegrade(): Degrade {
  return degrades[usePartie()];
}

export { FOND_PARTIE } from "./partie";

/** Couleur à plat de la partie de l'écran courant : curseur, cadre du champ actif, repères (jamais l'orange hors du Sport). */
export function useCouleurPartie(): string {
  const { couleurs } = useTheme();
  return couleurs[COULEUR_PARTIE[usePartie()]];
}

/** Ombre très douce d'une carte blanche, le jour, teintée de la partie (v2.2.17) ; la nuit, aucune. */
export function useOmbreCarte(): string | undefined {
  const { mode } = useTheme();
  return ombreCarte(usePartie(), mode) ?? undefined;
}

/** Fond de page de la partie de l'écran courant, là où l'aura s'efface (fondus, en-têtes collés). */
export function useFondPartie(): string {
  const { couleurs } = useTheme();
  return couleurs[FOND_PARTIE[usePartie()]];
}
