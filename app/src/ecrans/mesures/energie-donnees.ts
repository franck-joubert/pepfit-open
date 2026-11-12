// Données de la page Énergie : les journées (jourEnergie de sante-donnees.ts, tel quel) gardées en cache pour les périodes
// longues (30 jours, 12 mois : un bilan par jour), le détail du jour (apports par repas), l'objectif de solde, la moyenne
// lissée du poids et le résumé des cartes (Accueil, page Santé). Rien d'inventé : un jour sans journal reste sans solde.
import type { Executeur } from "../../db/executeur";
import { lireReglage } from "../../db/depots/reglages";
import { consommationsDuJour, listerRepas, totalDe } from "../../db/depots/nutrition";
import { listerPesees } from "../../db/depots/pesees";
import { cleJour } from "../../nutrition/calculs";
import { t } from "../../i18n/index";
import { nomRepas } from "../nutrition/nom-repas";
import { etatEnergie, joursEnergie, lireReglagesEnergie, type EtatEnergie, type JourEnergie, type ReglagesEnergie } from "../sante-donnees";
import { segmentsDepense } from "../energie-calc";
import { decaler, minuit } from "./periodes";
import { cumulSoldes, KCAL_KG, objectifSolde, poidsLisse, statsEnergie, variationBalance, type JourE } from "./energie-stats";

/** JourEnergie → ce que la page dessine. */
export function versJourE(e: JourEnergie): JourE {
  const b = e.bilan;
  // seul un jour de journal compte (jours tenus, moyennes, cumul) : des apports estimés par les habitudes n'en font pas un
  const journal = b.recharge?.source === "journal";
  return {
    jour: e.jour,
    apports: journal ? b.apports : null,
    depense: b.depense.kcal,
    comp: { bmr: b.bmr.kcal, sport: b.sport.kcal, neat: b.neat?.kcal ?? 0, digestion: b.digestion.kcal },
    solde: journal ? b.solde : null,
    seances: b.sport.seances.map((s) => t("energie.seanceCourte", { nom: s.nom, min: s.minutes })),
  };
}

// Cache des journées finies (une journée passée ne bouge plus guère) ; le jour en cours est toujours relu. 5 min de vie.
const VIE_MS = 5 * 60_000;
const cache = new Map<number, { e: JourE | null; lu: number }>();
/** Journées lues par lot (un mois) : une lecture de la base et de Santé Connect par lot. */
const LOT_JOURS = 31;

/** Oublie le cache (réglages changés, journal modifié). */
export function oublierEnergie(): void {
  cache.clear();
}

/** Journées demandées (minuits) ; null : pas de bilan ce jour-là (pas de métabolisme). */
export async function lireJoursEnergie(db: Executeur, jours: readonly number[], maintenant = Date.now(), r?: ReglagesEnergie): Promise<Map<number, JourE | null>> {
  const reglages = r ?? (await lireReglagesEnergie(db));
  const auj = minuit(maintenant);
  const lus = new Map<number, JourE | null>();
  const aLire = jours.filter((j) => {
    const c = cache.get(j);
    if (c && j < auj && maintenant - c.lu < VIE_MS) lus.set(j, c.e);
    return !lus.has(j);
  });
  // par lots (energie-lot.ts : la base et Santé Connect lus une fois pour tout le lot) plutôt qu'un jour après l'autre ; une
  // année, c'est 365 bilans : des lots d'un mois
  for (let i = 0; i < aLire.length; i += LOT_JOURS) {
    const lot = aLire.slice(i, i + LOT_JOURS);
    const m = await joursEnergie(db, lot, maintenant, reglages).catch((e: unknown) => (console.warn("[energie]", e), null));
    for (const j of lot) {
      const e = m?.get(j);
      const v = e ? versJourE(e) : null;
      if (j < auj && m) cache.set(j, { e: v, lu: maintenant });
      lus.set(j, v);
    }
  }
  return new Map(jours.map((j) => [j, lus.get(j) ?? null]));
}

/** Ta journée d'habitude (jauges de Sport, planche sport-stats v2, S3) : la dépense moyenne des 30 jours d'avant `jour`. */
export async function lireDepenseHabitude(db: Executeur, jour: number, maintenant = Date.now()): Promise<number | null> {
  const jours = Array.from({ length: 30 }, (_, i) => decaler(jour, i - 30));
  const l = await lireJoursEnergie(db, jours, maintenant);
  const v = jours.map((j) => l.get(j)?.depense).filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** Objectif de poids (cible et rythme voulu, réglages de Nutrition) et solde visé. */
export async function lireObjectifEnergie(db: Executeur): Promise<{ cible: number | null; rythme: number | null; solde: number | null }> {
  const c = Number(await lireReglage(db, "nutri_poids_cible"));
  const r = Number(await lireReglage(db, "nutri_rythme"));
  const cible = c > 0 ? c : null;
  const rythme = Number.isFinite(r) && r !== 0 ? r : null;
  return { cible, rythme, solde: objectifSolde(rythme, cible) };
}

export interface RepasApports {
  id: string;
  nom: string;
  kcal: number;
}

export interface DetailJour {
  etat: EtatEnergie;
  /** Apports par repas (journal Nutrition), dans l'ordre des repas. */
  repas: RepasApports[];
}

/** Le jour affiché en tête : son bilan (ou ce qui manque au métabolisme) et ses apports par repas. */
export async function lireDetailJour(db: Executeur, jour: number, maintenant = Date.now()): Promise<DetailJour> {
  const [etat, conso, repas] = await Promise.all([etatEnergie(db, jour, maintenant), consommationsDuJour(db, cleJour(new Date(jour))), listerRepas(db, true)]);
  const ordre = new Map(repas.map((r, i) => [r.id, i]));
  const par = new Map<string, typeof conso>();
  for (const c of conso) par.set(c.repas_id, [...(par.get(c.repas_id) ?? []), c]);
  const l: RepasApports[] = [...par.entries()]
    .map(([id, cs]) => {
      const r = repas.find((x) => x.id === id);
      return { id, nom: r ? nomRepas(r) : t("energie.repas"), kcal: totalDe(cs).kcal };
    })
    .sort((a, b) => (ordre.get(a.id) ?? 99) - (ordre.get(b.id) ?? 99));
  return { etat, repas: l };
}

/** Moyenne lissée du poids à la fin de chaque jour demandé, et celle de la veille du premier (pour la variation). */
export async function lirePoidsLisse(db: Executeur, jours: readonly number[]): Promise<{ avant: number | null; fin: number | null }> {
  if (!jours.length) return { avant: null, fin: null };
  const pesees = await listerPesees(db);
  if (!pesees.length) return { avant: null, fin: null };
  const l = poidsLisse(pesees, [decaler(jours[0]!, -1), jours[jours.length - 1]!], (j) => decaler(j, 1));
  return { avant: l[0] ?? null, fin: l[1] ?? null };
}

export interface ResumeEnergie {
  /** Le bilan du jour, ou ce qui manque pour l'avoir. */
  etat: EtatEnergie;
  /** Soldes des 7 derniers jours (aujourd'hui en dernier), null sans journal. */
  soldes: { jour: number; solde: number | null }[];
  /** Solde moyen sur les jours de la semaine qui ont un journal, et son équivalent estimé (≈ kg sur la semaine). */
  semaine: { moyenne: number; kg: number; n: number } | null;
  /** Segments de la dépense du jour (métabolisme, sport, pas, digestion), vides retirés. */
  segments: { cle: "bmr" | "sport" | "neat" | "digestion"; kcal: number }[];
  objectif: number | null;
}

/** Pour les cartes (Accueil demie et pleine, bloc Énergie de la page Santé). */
export async function lireResumeEnergie(db: Executeur, maintenant = Date.now()): Promise<ResumeEnergie> {
  const auj = minuit(maintenant);
  const jours = Array.from({ length: 7 }, (_, i) => decaler(auj, i - 6));
  const [etat, m, obj] = await Promise.all([etatEnergie(db, auj, maintenant), lireJoursEnergie(db, jours, maintenant), lireObjectifEnergie(db)]);
  const l = jours.map((j) => m.get(j) ?? null);
  const s = statsEnergie(l, obj.solde);
  return {
    etat,
    soldes: jours.map((j, i) => ({ jour: j, solde: l[i]?.solde ?? null })),
    semaine: s ? { moyenne: s.moy, kg: s.cumul / KCAL_KG, n: s.n } : null,
    segments: etat.etat === "bilan" ? segmentsDepense(etat.e.bilan) : [],
    objectif: obj.solde,
  };
}

export { cumulSoldes, variationBalance };
