// Pages partagées entre deux domaines (31/10), sans React Native (testée dans tests/halo-marie.test.ts). Une seule
// table : le halo marie deux teintes [A, B] dans le fond ; la couleur principale de la page (cartes, boutons, anneaux,
// accents, barre de titre) est celle de l'onglet d'origine s'il est l'une des deux, sinon la section de rattachement. Tout le
// reste en découle (partie.ts, ContextePartie.tsx, aura-calc.ts HALOS_PAGES, gabarit.tsx). Une page, ou un choix : une ligne ici.

import type { Partie } from "../theme/effets";

export const PAGES_PARTAGEES = {
  // dépense (Sport) face aux apports (Nutrition) : halo orange et turquoise ; accents orange par défaut
  energie: { section: "entrainement", halo: ["entrainement", "nutrition"] },
  // rattachée à Sport ; halo orange et rose (Santé), confirmé par le 31/10
  pas: { section: "entrainement", halo: ["entrainement", "sante"] },
  effort: { section: "entrainement", halo: ["entrainement", "sante"] },
  // rattachée à Santé (planche recuperation, D11) ; depuis Sport, accents orange ; halo rose et orange (31/10)
  recuperation: { section: "sante", halo: ["sante", "entrainement"] },
} as const satisfies Record<string, { section: Partie; halo: readonly [Partie, Partie] }>;

export type PagePartagee = keyof typeof PAGES_PARTAGEES;

/** Toutes ces pages sont rangées sous Santé dans les routes (« /sante/energie »). */
export const ROUTE_PAGES_PARTAGEES = "sante";

/** Page partagée d'une route, chemin (« /sante/pas ») ou nom d'écran (« sante/pas »), sinon null. */
export function pagePartageeDe(route: string): PagePartagee | null {
  const m = new RegExp(`^/*${ROUTE_PAGES_PARTAGEES}/([a-z]+)/?(?:[?#].*)?$`).exec(route);
  return m && Object.hasOwn(PAGES_PARTAGEES, m[1]!) ? (m[1] as PagePartagee) : null;
}

/**
 * Couleur principale d'une visite (31/10 : « selon d'où on y accède ») : celle de l'onglet d'origine s'il est l'une
 * des deux teintes du halo (Pas depuis Santé : rose ; depuis Sport : orange), sinon la section de rattachement (lien
 * direct, autre onglet). Lue une fois à l'ouverture, figée pour toute la visite (ContextePartie).
 */
export function partieDeVisite(page: PagePartagee, origine: Partie | null): Partie {
  const { section, halo } = PAGES_PARTAGEES[page];
  return origine && (halo as readonly Partie[]).includes(origine) ? origine : section;
}

/**
 * Visites en cours (31/10 : les pages filles suivent la couleur de la visite). Une page partagée ouverte inscrit sa
 * couleur ; tout écran ouvert par-dessus tant qu'elle est dans la pile (métabolisme, agenda, connexions…) la reprend, et
 * s'inscrit à son tour. La dernière inscrite gagne (Effort → Pas → agenda : la couleur de Pas).
 */
const visites: { partie: Partie }[] = [];

/** Inscrit une visite ; rend sa désinscription (à la fermeture de l'écran). */
export function ouvrirVisite(partie: Partie): () => void {
  const v = { partie };
  visites.push(v);
  return () => {
    const i = visites.indexOf(v);
    if (i >= 0) visites.splice(i, 1);
  };
}

/** Couleur de la visite en cours (la dernière ouverte), sinon null. */
export function visiteEnCours(): Partie | null {
  return visites.at(-1)?.partie ?? null;
}
