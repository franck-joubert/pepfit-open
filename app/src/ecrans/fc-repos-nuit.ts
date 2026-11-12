// FC au repos déduite de la FC de nuit (docs/SANS-WHOOP.md, C5) : Samsung, Oura, Polar, Xiaomi, Coros n'écrivent pas de
// RestingHeartRate dans Santé Connect, mais leur FC continue y est. Dans la session de sommeil, la plus basse moyenne
// glissante sur 30 min (20 minutes mesurées au moins) ; rangée comme une mesure (mesure_corps « fc », source « pepfit »), à
// la fin de la nuit. Elle sert la Récupération (part FC au repos), les zones (réserve de FC), les kcal et l'Âge pepfit. Une
// FC au repos écrite par la montre (ou Whoop) pour la même nuit prime toujours (mesures.ts, SANS_DOUBLON_WHOOP).
import type { Executeur } from "../db/executeur";
import { ajouterMesures } from "../db/depots/mesures";
import type { Sante } from "../natif/sante/types";

const MIN = 60_000;
const JOUR = 86_400_000;
/** Fenêtre glissante (min) et minutes mesurées qu'il y faut. */
export const FC_REPOS_NUIT = { fenetre: 30, minutes: 20, plausible: [30, 110] as const };
export const SOURCE_FC_REPOS_NUIT = "pepfit";
const ORIGINE = "fit.pep.open";
/** Nuits déjà lues sans résultat (pas de FC cette nuit-là) : pas relues à chaque import. */
const essayees = new Set<number>();

/** La plus basse moyenne sur 30 min de la FC d'une nuit [debut, fin] ; null sans 20 minutes mesurées dans une fenêtre. */
export function fcReposDeNuit(fc: readonly { t: number; bpm: number }[], debut: number, fin: number): number | null {
  const n = Math.floor((fin - debut) / MIN);
  if (n < FC_REPOS_NUIT.fenetre) return null;
  const somme = new Float64Array(n);
  const nb = new Uint16Array(n);
  for (const x of fc) {
    const i = Math.floor((x.t - debut) / MIN);
    if (i < 0 || i >= n || !(x.bpm >= 25 && x.bpm <= 250)) continue;
    somme[i]! += x.bpm;
    nb[i]!++;
  }
  // moyenne par minute, puis la moyenne des minutes mesurées de chaque fenêtre de 30 min
  let s = 0, k = 0, mini = Infinity;
  const moy = (i: number) => (nb[i]! ? somme[i]! / nb[i]! : 0);
  for (let i = 0; i < n; i++) {
    if (nb[i]) (s += moy(i)), k++;
    const sortie = i - FC_REPOS_NUIT.fenetre;
    if (sortie >= 0 && nb[sortie]) (s -= moy(sortie)), k--;
    if (i >= FC_REPOS_NUIT.fenetre - 1 && k >= FC_REPOS_NUIT.minutes) mini = Math.min(mini, s / k);
  }
  if (!Number.isFinite(mini)) return null;
  const v = Math.round(mini);
  return v >= FC_REPOS_NUIT.plausible[0] && v <= FC_REPOS_NUIT.plausible[1] ? v : null;
}

/**
 * Range la FC au repos des nuits des `jours` derniers jours qui n'en ont pas (aucune mesure « fc » à 12 h de la fin de la
 * nuit, toutes sources) ; rend le nombre de nuits ajoutées. Une lecture de FC par nuit sans mesure : 30 au premier passage,
 * puis celle de la nuit. Sans autorisation du sommeil ou de la FC, rien.
 */
export async function deduireFcReposNuits(db: Executeur, sante: Pick<Sante, "nuits" | "fcEntre">, maintenant: number = Date.now(), jours = 30): Promise<number> {
  const nuits = await sante.nuits(maintenant - jours * JOUR, maintenant).catch(() => null);
  if (!nuits?.length) return 0;
  // toutes les mesures de FC au repos, même celles que la lecture écarte (une nuit déjà calculée ne se relit pas)
  const dates = (await db.getAllAsync<{ date: number }>("SELECT date FROM mesure_corps WHERE type = 'fc' AND date >= ?", [maintenant - (jours + 1) * JOUR])).map((m) => m.date);
  let n = 0;
  for (const nuit of nuits) {
    if (nuit.fin > maintenant || essayees.has(nuit.fin) || dates.some((d) => Math.abs(d - nuit.fin) < JOUR / 2)) continue;
    const fc = await sante.fcEntre(nuit.debut, nuit.fin).catch(() => null);
    if (fc == null) return n; // FC non autorisée : les autres nuits non plus
    const v = fcReposDeNuit(fc, nuit.debut, nuit.fin);
    if (v != null) n += await ajouterMesures(db, "fc", [{ valeur: v, date: nuit.fin, origine: ORIGINE }], SOURCE_FC_REPOS_NUIT, maintenant);
    // la FC d'une nuit récente peut encore arriver (envoi différé de Samsung) : seule une nuit de plus de 36 h est oubliée
    else if (maintenant - nuit.fin > 36 * 3_600_000) essayees.add(nuit.fin);
  }
  return n;
}
