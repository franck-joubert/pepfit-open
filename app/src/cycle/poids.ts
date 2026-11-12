// La moyenne lissée du poids ajustée au cycle (planche cycle, § 3.5 et écran 7) : de 7 jours avant à 3 jours après chaque début
// de règles, la pesée est corrigée de l'écart appris chez la personne (3 derniers cycles assez pesés), sinon elle compte 3 fois
// moins. Les pesées ne changent pas ; la tendance sur 28 jours et les dates de l'objectif lisent la moyenne ajustée. Pur :
// tests/cycle-poids.test.ts.
import type { AjustementLisse } from "../ecrans/mesures/corps-calc";
import { isoLocal } from "./donnees";
import { CYCLE, cycles, ecartAppris, episodes, poidsAjuste, prevision, type JourCycle, type ParamsCycle, type PeseeAjustee } from "./modele";

export interface AjustementPoids {
  /** Pour serieJours, jourEtat, lisseAu (corps-calc.ts). */
  ajustement: AjustementLisse;
  /** Les deux moyennes lissées, jour par jour de pesée (la page Cycle : « 61,8 kg, sinon 61,9 kg »). */
  pesees: PeseeAjustee[];
  /** L'écart appris autour du 1er jour des règles (la phrase de la page Poids), null avant l'apprentissage. */
  ecart: number | null;
}

/**
 * L'ajustement d'une série de relevés (date en ms, valeur dans l'unité affichée) : une pesée par jour (la dernière), les
 * débuts de règles connus et la date centrale de la prévision. null sans jour de règles.
 */
export function ajustementPoids(
  releves: readonly { date: number; valeur: number }[],
  jours: readonly JourCycle[] | null,
  aujourdhui: string,
  p: ParamsCycle = CYCLE,
): AjustementPoids | null {
  if (!jours?.length) return null;
  const eps = episodes(jours, aujourdhui, p);
  if (!eps.length) return null;
  const pv = prevision(cycles(eps, p), p);
  const debuts = [...eps.map((e) => e.debut), ...(pv.possible ? [pv.centre] : [])];
  const parJour = new Map<string, { date: number; valeur: number }>();
  for (const r of releves) {
    const j = isoLocal(r.date);
    const x = parJour.get(j);
    if (!x || r.date >= x.date) parJour.set(j, r);
  }
  const serie = [...parJour].sort(([a], [b]) => (a < b ? -1 : 1)).map(([jour, r]) => ({ jour, kg: r.valeur }));
  const pesees = poidsAjuste(serie, debuts, p);
  const parIso = new Map(pesees.map((x) => [x.jour, x]));
  return {
    ajustement: (jour) => {
      const x = parIso.get(isoLocal(jour));
      return x && x.k != null ? { ecart: x.ecart, reduit: p.poids.poidsReduit } : null;
    },
    pesees,
    ecart: ecartAppris(pesees),
  };
}
