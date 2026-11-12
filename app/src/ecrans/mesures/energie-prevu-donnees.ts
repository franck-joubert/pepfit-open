// Données du prévu de la page Énergie (energie-prevu.ts) : les séances prévues du planning (planif-donnees.ts), les pas
// habituels (Santé Connect heure par heure, sinon la moyenne des 7 derniers jours) et les apports habituels du jour en cours
// (sante-donnees.ts, habitudesJour). Le jour en cours et les jours à venir de la semaine ; un jour passé n'a pas de prévu.
import type { Executeur } from "../../db/executeur";
import { cleJour } from "../../nutrition/calculs";
import { pasRestants, prevuAffiche, prevuJour, seancesPrevuesRestantes, type PasHabituels, type Prevu } from "../energie-prevu";
import { lirePlanning } from "../planif-donnees";
import { lireReglagesEnergie, type JourEnergie } from "../sante-donnees";
import { lireCartePas, rythmePasHabituel } from "./cartes-donnees";
import { minuit } from "./periodes";

const JOUR = 86_400_000;

/** Pas d'habitude : le rythme heure par heure si les pas du jour viennent de Santé Connect, sinon la moyenne des jours d'avant. */
async function lirePasHabituels(db: Executeur, maintenant: number): Promise<PasHabituels | null> {
  const c = await lireCartePas(db, maintenant, false).catch(() => null);
  if (!c) return null;
  const avant = c.semaine.slice(0, -1).filter((v): v is number => v != null && v > 0);
  const jour = avant.length ? avant.reduce((a, b) => a + b, 0) / avant.length : null;
  const horaire = c.jour.etat === "valeur" && c.jour.source === "sante" ? await rythmePasHabituel(maintenant) : null;
  return { horaire, jour };
}

/**
 * Prévu jusqu'à minuit de chaque jour demandé (minuits, le jour en cours et ceux d'après) ; `auj` : le bilan du jour en cours
 * (son métabolisme, son corps, ses habitudes servent aussi aux jours à venir). Un jour à venir sans séance prévue n'en a pas.
 */
export async function lirePrevus(db: Executeur, jours: readonly number[], maintenant: number, auj: JourEnergie): Promise<Map<number, Prevu>> {
  const out = new Map<number, Prevu>();
  const l = [...jours].filter((j) => j + JOUR > maintenant).sort((a, b) => a - b);
  if (!l.length) return out;
  const [planning, pas, reglages] = await Promise.all([
    lirePlanning(db, cleJour(new Date(l[0]!)), cleJour(new Date(l[l.length - 1]!)), maintenant),
    lirePasHabituels(db, maintenant),
    lireReglagesEnergie(db),
  ]);
  const noms = new Map([...planning.routines].map(([id, r]) => [id, r.nom]));
  const corps = auj.corps ?? { sexe: null, kg: null, age: null };
  const defaut = auj.bilan.neat?.defaut ?? true;
  const aujourdhui = minuit(maintenant);
  for (const j of l) {
    const enCours = j === aujourdhui;
    const avancement = enCours ? (maintenant - j) / JOUR : 0;
    const seances = seancesPrevuesRestantes(planning.occ, planning.jours, cleJour(new Date(j)), noms, enCours ? auj.bilan.sport.seances : []);
    const p = prevuJour({
      reel: enCours ? auj.bilan : null,
      bmrJour: auj.bmr.kcal,
      avancement,
      seances,
      corps,
      pas: pasRestants(avancement, defaut, pas),
      kcalParPas: auj.kcalPas.kcal,
      partDigestion: reglages.partDigestion,
      habitudes: auj.habitudesJour?.kcal ?? null,
    });
    const v = prevuAffiche(p, !enCours);
    if (v) out.set(j, v);
  }
  return out;
}
