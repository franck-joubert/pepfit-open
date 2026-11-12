// Largeur du contenu (D5 de la revue finale, 30/10) : sur le Fold déplié (~690 dp), hors séance, les onglets et les pages
// poussées gardent une colonne de 640 dp au plus (560 jusqu'au retour du 30/10 : « l'agrandir un peu et la faire
// partout »), centrée ; le fond (aura, couleur de la page) reste pleine largeur (FondPlein, ui/CadreContenu.tsx). Sur le
// téléphone (412 dp), rien ne change. Deux colonnes seraient une planche à part.
// Un dessin calé sur la largeur de l'écran (graphe, tracé) lit celle de la colonne : `useLargeurContenu()`
// (ui/CadreContenu.tsx) ou `largeurContenu()` au moment d'un geste.

export const LARGEUR_CONTENU = 640;

/** Largeur de la colonne de contenu pour un écran de `ecran` dp. */
export function largeurContenu(ecran: number): number {
  return Math.min(ecran, LARGEUR_CONTENU);
}

/** Marge de chaque côté de la colonne centrée (0 sur le téléphone). */
export function margeColonne(ecran: number): number {
  return (ecran - largeurContenu(ecran)) / 2;
}

/**
 * Routes de la pile laissées pleine largeur :
 * - les onglets (bornés dans leur propre navigateur, l'aura passe dessous) ;
 * - la séance (deux volets au-delà de 600 dp) et la course en direct (carte) ;
 * - la caméra du scanner et la vue 3D ;
 * - la carte en plein écran d'un circuit ou d'une séance terminée (la carte va bord à bord, comme celle du suivi en direct) ;
 * - la carte de Découvrir : le fond de carte va bord à bord, la barre, l'entête, la liste et les commandes posent leur colonne de 640 dp
 *   eux-mêmes (PageSociale enColonne, CarteDecouvrir).
 */
const PILE_PLEINE = new Set(["(tabs)", "session", "suivi/direct", "nutrition/scan", "3d/[key]", "circuit/carte/[id]", "suivi/carte"]);
/** Onglets laissés pleine largeur : aucun (Santé place son corps et ses cases sur la colonne depuis le 30/10). */
const ONGLETS_PLEINS = new Set<string>();

/** La route (nom de la pile, ou de l'onglet avec `onglet`) garde-t-elle toute la largeur ? */
export function pleineLargeur(route: string, onglet = false): boolean {
  return (onglet ? ONGLETS_PLEINS : PILE_PLEINE).has(route);
}
