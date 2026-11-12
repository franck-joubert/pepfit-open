// Le rappel « Tes règles sont-elles arrivées ? » (backlog lignes 14 et 31, décision du 05/11). Pur (sans React Native ni
// base) : testé par tests/cycle-rappel.test.ts ; posé par natif/rappel-regles. Une notification locale, rien ne part au serveur.
//
// Sans état stocké : à partir des jours de règles, on recalcule la prévision et l'on programme trois notifications à 9 h, le
// jour de la date estimée puis les deux jours suivants. « Oui » note le début et reprogramme (la prévision change, les trois
// anciennes tombent) ; « Non » ne fait rien de plus : le rappel suivant est déjà programmé, et après le troisième il n'y en a
// plus avant la prévision suivante.
import { etatCycle, plus, type JourCycle } from "./modele";
import { isoLocal, type ReglagesCycle } from "./donnees";

export const PREFIXE_REGLES = "cycle-regles-";
export const CATEGORIE_REGLES = "pepfit-regles";
export const ACTION_REGLES_OUI = "regles-oui";
export const ACTION_REGLES_NON = "regles-non";
/** Le jour de la date estimée, puis un jour d'écart deux fois : « Non » fait revenir le rappel 2 fois en tout. */
export const RAPPELS_REGLES = 3;
export const HEURE_RAPPEL_REGLES = 9;

export const idRappelRegles = (i: number) => `${PREFIXE_REGLES}${i}`;
export const estRappelRegles = (id: string) => id.startsWith(PREFIXE_REGLES);

export interface RappelPrevu {
  id: string;
  quand: number;
}

/** Neuf heures, heure locale, d'un « AAAA-MM-JJ ». */
const neufHeures = (jour: string) => new Date(+jour.slice(0, 4), +jour.slice(5, 7) - 1, +jour.slice(8, 10), HEURE_RAPPEL_REGLES).getTime();

/**
 * Les rappels à programmer : rien si le suivi du cycle ou le rappel est éteint, ou sans prévision (l'estimation coupée, pas
 * assez de cycles, cycles trop variables) ; sinon ceux dont l'heure n'est pas passée.
 */
export function rappelsRegles(jours: readonly Pick<JourCycle, "jour" | "flux" | "fin" | "source">[], r: Pick<ReglagesCycle, "suivi" | "rappel" | "prevision">, maintenant: number): RappelPrevu[] {
  if (!r.suivi || !r.rappel || !r.prevision) return [];
  const pv = etatCycle(jours, isoLocal(maintenant)).prevision;
  if (!pv.possible) return [];
  return Array.from({ length: RAPPELS_REGLES }, (_, i) => ({ id: idRappelRegles(i), quand: neufHeures(plus(pv.centre, i)) })).filter((x) => x.quand > maintenant);
}

/** Ce que veut dire le toucher d'une notification : « oui », « non », ou null (le corps : on ouvre le suivi du cycle). */
export function reponseRegles(action: string): "oui" | "non" | null {
  return action === ACTION_REGLES_OUI ? "oui" : action === ACTION_REGLES_NON ? "non" : null;
}
