import type { Executeur } from "./executeur";
import { debutDeSemaine } from "./stats";

// Régularité (27/10) : série de semaines et jours de repos, calculés une fois ici pour l'accueil et le profil.
// Semaines du lundi au dimanche, heure locale ; seule une séance terminée compte.

export type SeanceDatee = { debut: number; fin: number | null };

const SEMAINE_MS = 7 * 86_400_000;

/** Lundi suivant le lundi `lundi` (heure locale : un changement d'heure ne décale pas la semaine). */
function lundiSuivant(lundi: number, n = 1): number {
  const d = new Date(lundi);
  d.setDate(d.getDate() + 7 * n);
  return d.getTime();
}

/**
 * Série en cours et meilleure série : semaines d'affilée avec au moins une séance terminée. La semaine en cours compte si
 * elle a déjà une séance ; sinon la série court depuis la semaine d'avant (elle ne se casse qu'à la fin de la semaine).
 */
export function serieHebdo(seances: SeanceDatee[], maintenant: number = Date.now()): { enCours: number; meilleure: number } {
  const semaines = new Set(seances.filter((s) => s.fin != null).map((s) => debutDeSemaine(s.debut)));
  if (semaines.size === 0) return { enCours: 0, meilleure: 0 };
  const cette = debutDeSemaine(maintenant);
  let enCours = 0;
  let l = semaines.has(cette) ? cette : lundiSuivant(cette, -1);
  while (semaines.has(l)) {
    enCours++;
    l = lundiSuivant(l, -1);
  }
  const triees = [...semaines].sort((a, b) => a - b);
  let meilleure = 0;
  let courante = 0;
  triees.forEach((s, i) => {
    // Écart d'une semaine à quelques heures près (changement d'heure entre deux lundis).
    courante = i > 0 && Math.abs(s - triees[i - 1]! - SEMAINE_MS) < 3 * 3_600_000 ? courante + 1 : 1;
    meilleure = Math.max(meilleure, courante);
  });
  return { enCours, meilleure: Math.max(meilleure, enCours) };
}

/** Jours calendaires depuis la dernière séance terminée (0 : aujourd'hui), null sans aucune séance. */
export function joursDeRepos(seances: SeanceDatee[], maintenant: number = Date.now()): number | null {
  const faites = seances.filter((s) => s.fin != null);
  if (faites.length === 0) return null;
  const derniere = Math.max(...faites.map((s) => s.debut));
  const minuit = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  return Math.max(0, Math.round((minuit(maintenant) - minuit(derniere)) / 86_400_000));
}

/** Début et fin des séances terminées, de la plus récente à la plus ancienne. */
export function seancesTerminees(db: Executeur): Promise<SeanceDatee[]> {
  return db.getAllAsync<SeanceDatee>("SELECT debut, fin FROM seances WHERE fin IS NOT NULL ORDER BY debut DESC", []);
}
