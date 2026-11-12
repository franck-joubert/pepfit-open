// Lignes d'Énergie qui ont changé (planche activite-detectee, ECARTS n° 7 ; revue finale n° 50) : après une activité
// associée, ignorée ou rétablie, les lignes Sport et Pas du jour se surlignent la première fois qu'on revoit ce jour (page
// Énergie, feuille Énergie), si elles ont bougé depuis la dernière fois qu'on l'a vu. Le bilan de Santé note aussi ce qu'il
// montre. Rien d'inventé : un jour jamais vu n'a pas d'« avant », rien ne s'y surligne. Sans React Native.
import { surActivitesChangees } from "../activites-evenement";
import type { JourEnergie } from "../sante-donnees";

/** Les termes de la dépense (energie-calc) : `neat`, la ligne Pas. */
export type LigneEnergie = "sport" | "neat";
type Vu = Record<LigneEnergie, string> & { t: number };

const vus = new Map<number, Vu>();
let changeA = -Infinity;
surActivitesChangees(() => {
  changeA = Date.now();
});

/** Ce qui se voit des deux lignes qu'une activité peut faire bouger : kcal et séances du Sport, kcal et activités ignorées des
 *  Pas. */
export function empreinte(e: JourEnergie): Record<LigneEnergie, string> {
  const b = e.bilan;
  return { sport: `${Math.round(b.sport.kcal)}|${b.sport.seances.length}`, neat: `${Math.round(b.neat?.kcal ?? 0)}|${b.neat?.ignorees ?? 0}` };
}

/** Note ce qui est montré du jour (bilan de Santé) ; une vue d'avant un changement d'activité est gardée pour la comparaison. */
export function noterVu(jour: number, e: JourEnergie, maintenant = Date.now()): void {
  const avant = vus.get(jour);
  if (avant && changeA > avant.t) return;
  vus.set(jour, { ...empreinte(e), t: maintenant });
}

/** Note ce qui est montré du jour et rend les lignes à surligner : changées depuis la dernière vue, une activité ayant changé
 *  entre-temps. */
export function lignesChangees(jour: number, e: JourEnergie, maintenant = Date.now()): LigneEnergie[] {
  const avant = vus.get(jour);
  const l = empreinte(e);
  vus.set(jour, { ...l, t: maintenant });
  if (!avant || changeA <= avant.t) return [];
  return (["sport", "neat"] as const).filter((k) => avant[k] !== l[k]);
}
