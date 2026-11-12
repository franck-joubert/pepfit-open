// Données des pages VFC et Fréquence cardiaque au repos (planche pas, NOTES § 1) : une valeur par nuit, Whoop d'abord
// (whoop_jour : vfc, fc_repos, à l'heure de fin du sommeil), sinon Santé Connect (mesure_corps : la VFC, moyenne des mesures
// de la nuit, 18:00 la veille à midi, vfc-nuit.ts, C15 ; la FC au repos, la plus récente du jour). Rien d'inventé : sans nuit
// mesurée, une liste vide.
import { historiqueMesure, type Executeur } from "../../db/api";
import { ORIGINE_WHOOP } from "../../whoop/depot";
import { joursWhoop } from "../../whoop/lecture";
import type { CleCoeur } from "./coeur-calc";
import type { Releve } from "./corps-calc";
import { minuit } from "./periodes";
import { whoopConnecte } from "./scores-donnees";
import { vfcDesNuits } from "../vfc-nuit";

/** Nuits mesurées, de la plus ancienne à la plus récente ; une nuit Whoop sans fin de sommeil est datée de son jour (minuit). */
export async function lireNuitsCoeur(db: Executeur, cle: CleCoeur, maintenant: number = Date.now(), jours = joursWhoop(db, 0, minuit(maintenant))): Promise<Releve[]> {
  const [whoop, mesures] = await Promise.all([jours, historiqueMesure(db, cle)]);
  const nuits = new Map<number, Releve>();
  const releve = (m: (typeof mesures)[number], valeur = m.valeur): Releve => ({ id: m.id, date: m.date, valeur, manuel: m.source === "manuel", origine: m.origine ?? (m.source === "whoop" ? ORIGINE_WHOOP : null) });
  if (cle === "vfc") for (const [j, v] of vfcDesNuits(mesures)) nuits.set(j, releve(v.derniere, Math.round(v.valeur * 10) / 10));
  // FC au repos : la plus récente d'abord, elle garde son jour
  else
    for (const m of mesures) {
      const j = minuit(m.date);
      if (!nuits.has(j)) nuits.set(j, releve(m));
    }
  for (const [j, w] of whoop) {
    const v = cle === "vfc" ? w.vfc : w.fc_repos;
    if (v == null || !(v > 0)) continue;
    const fin = w.sommeil_fin != null && minuit(w.sommeil_fin) === j ? w.sommeil_fin : j;
    nuits.set(j, { id: `whoop:${j}`, date: fin, valeur: v, manuel: false, origine: ORIGINE_WHOOP });
  }
  return [...nuits.values()].sort((a, b) => a.date - b.date);
}

/** Pages VFC et FC au repos : les deux mesures (la page montre l'autre à côté) et Whoop relié, lus dans la base seulement
 * (Santé Connect en fond : M8, docs/PERF-A.md) ; les jours Whoop ne sont lus qu'une fois. */
export async function lireDonneesCoeur(db: Executeur, maintenant: number = Date.now()) {
  const jours = joursWhoop(db, 0, minuit(maintenant));
  const [vfc, fc, whoop] = await Promise.all([lireNuitsCoeur(db, "vfc", maintenant, jours), lireNuitsCoeur(db, "fc", maintenant, jours), whoopConnecte(db)]);
  return { vfc, fc, whoop };
}
