// Notifications et appli ouverte (demande d'Alex du 31/10, docs/NOTIFICATIONS.md) : pas de notification système quand on
// est dans l'appli, et celle d'un endroit où l'on arrive est retirée, comme un message lu. Logique pure (testée) ;
// branchement : natif/notifications-appli.ts.

/** Écran ouvert au toucher d'une notification (son « endroit »). « recuperer » : la sieste ou l'activité en cours (planche
 *  recuperer) ; « recuperation » : la page Récupération, où l'on démarre une sieste (le rappel) ; « sommeil » : le rappel de
 *  coucher (planche sommeil, D15) ; « cycle » : le rappel « Tes règles sont-elles arrivées ? » (natif/rappel-regles), qui ouvre
 *  le suivi du cycle. */
export type Cible = "seance" | "entrainements" | "nutrition" | "traitements" | "recuperer" | "recuperation" | "sommeil" | "cycle";

/** Les notifications de fin de « Récupérer » : une alarme qui sonne toujours, appli ouverte comprise (planche recuperer). Sur
 *  iPhone, ses relances (fin-sieste-r1, r2…) la prolongent : le son d'une notification y dure au plus 30 s. */
const estFinRecup = (identifiant: string) => identifiant === "fin-sieste" || /^fin-sieste-r\d+$/.test(identifiant);

/** Cible d'une notification d'après son identifiant (minuteur, rappels de séance, de repas, de compléments). */
export function cibleNotif(identifiant: string): Cible | null {
  if (identifiant === "fin-repos" || identifiant === "fin-cible") return "seance";
  if (identifiant.startsWith("planif-")) return "entrainements";
  if (identifiant.startsWith("repas-")) return "nutrition";
  if (identifiant.startsWith("traitement-")) return "traitements";
  if (estFinRecup(identifiant) || identifiant === "fin-sieste-libre") return "recuperer";
  if (identifiant === "rappel-sieste") return "recuperation";
  if (identifiant.startsWith("coucher-")) return "sommeil";
  if (identifiant.startsWith("cycle-regles-")) return "cycle";
  return null;
}

/** Cible correspondant à l'écran affiché (chemin d'expo-router). */
export function cibleEcran(chemin: string): Cible | null {
  if (chemin === "/session") return "seance";
  if (chemin === "/train") return "entrainements";
  if (chemin === "/food") return "nutrition";
  if (chemin === "/traitements" || chemin.startsWith("/traitements/")) return "traitements";
  if (chemin === "/recuperer/en-cours" || chemin === "/recuperer/respiration") return "recuperer";
  if (chemin === "/sante/recuperation") return "recuperation";
  if (chemin === "/sante/sommeil") return "sommeil";
  if (chemin === "/sante/cycle") return "cycle";
  return null;
}

/** Route du bouton « Voir » du bandeau. */
export const ROUTE_CIBLE: Record<Cible, string> = {
  seance: "/session",
  entrainements: "/train",
  nutrition: "/food",
  traitements: "/traitements",
  recuperer: "/recuperer/en-cours",
  recuperation: "/sante/recuperation",
  sommeil: "/sante/sommeil",
  cycle: "/sante/cycle",
};

/**
 * Écran à ouvrir au toucher d'une notification, quand l'appli doit y aller elle-même : le rappel du cycle.
 * Les autres rouvrent l'appli là où elle était (minuteur, rappels) ou ont leur propre réponse (sieste : RepriseRecup).
 */
export function routeAuToucher(identifiant: string): string | null {
  const c = cibleNotif(identifiant);
  return c === "cycle" ? ROUTE_CIBLE[c] : null;
}

export interface Retour {
  /** Notification système (barre et heads-up). */
  systeme: boolean;
  /** Son joué par l'appli (celui du canal), sans notification. */
  son: boolean;
  /** Vibration de l'appli à la place de celle du canal (sur la séance, la fin d'une série en durée vibre déjà : useChronoSerie). */
  vibration: boolean;
  /** Vibration longue de réveil (fin de sieste), plutôt que l'impulsion de fin du repos. */
  reveil?: boolean;
  /** Bandeau dans l'appli, avec « Voir ». */
  bandeau: boolean;
}

/**
 * Appli au premier plan : jamais de notification système ; le son si la notification en avait un ; un bandeau seulement
 * hors de l'écran concerné. La séance n'a pas de bandeau : sa bulle flottante (BandeauSeance) montre déjà le repos.
 * En arrière-plan : la notification, telle quelle. `vibre` : le réglage de fin du repos vibre.
 * Fin de sieste (docs/NOTIFICATIONS.md, planche recuperer) : jamais de notification système appli ouverte, mais l'alarme sonne
 * et vibre toujours (`vibreSieste` : le réglage alerte_sieste vibre), où que l'on soit ; un bandeau hors de l'écran de la sieste.
 */
export function retourNotif(o: { premierPlan: boolean; identifiant: string; ecran: Cible | null; sonne: boolean; vibre?: boolean; vibreSieste?: boolean }): Retour {
  if (!o.premierPlan) return { systeme: true, son: o.sonne, vibration: false, bandeau: false };
  const cible = cibleNotif(o.identifiant);
  if (estFinRecup(o.identifiant)) return { systeme: false, son: o.sonne, vibration: !!o.vibreSieste, reveil: true, bandeau: o.ecran !== "recuperer" };
  return {
    systeme: false,
    son: o.sonne,
    vibration: !!o.vibre && (o.identifiant === "fin-repos" || (o.identifiant === "fin-cible" && o.ecran !== "seance")),
    bandeau: cible != null && cible !== "seance" && cible !== o.ecran,
  };
}

/** Notifications affichées à retirer en arrivant sur `ecran` (par la notification ou autrement). */
export function aRetirer(identifiants: string[], ecran: Cible | null): string[] {
  if (!ecran) return [];
  return identifiants.filter((id) => cibleNotif(id) === ecran);
}
