// Source des pas, même règle partout (carte Pas de l'Accueil, page Santé, Ma journée, bilan d'énergie, historique) :
// Withings (montre ou bracelet lu chez Withings, sauf si Santé Connect a une valeur plus haute : la plus récente) ; sinon Santé
// Connect s'il est autorisé ; sinon le compteur de pas du téléphone s'il est activé (repli, pas-telephone.ts) ; sinon, on
// propose de connecter une source. La source est toujours dite sous le chiffre. Les pas Whoop d'un jour fini gardés dans le
// journal (sauvegarde relue d'une autre installation) passent devant, comme avant : l'API officielle de Whoop n'a pas de pas,
// rien ne les remplit plus.
import type { Executeur } from "../db/executeur";
import { sante as santeConnect } from "../natif/sante/index";
import { pasWhoopJours } from "../whoop/lecture";
import { pasWithingsJours, withingsConnecte } from "../withings/lecture";
import { PERMISSION_PAS } from "./journee-donnees";
import { echantillonnerTelephone, pasTelephoneJours, telephoneActif } from "./pas-telephone";

const JOUR_MS = 86_400_000;

export type SourcePas = "whoop" | "withings" | "sante" | "telephone";

/** « valeur » : un chiffre et sa source ; « vide » : une source branchée mais rien pour ce jour ; « a-connecter » : aucune source. */
export type ChoixPas = { etat: "valeur"; pas: number; source: SourcePas } | { etat: "vide"; source: SourcePas } | { etat: "a-connecter" };

export interface EntreePas {
  whoopActif: boolean;
  /** Pas Whoop du jour (table whoop_jour), null sans valeur. */
  whoop: number | null;
  /** Withings est connecté (lecture de l'activité autorisée). */
  withingsActif?: boolean;
  /** Pas Withings du jour (table withings_jour), null sans valeur. */
  withings?: number | null;
  santeAutorise: boolean;
  /** Pas Santé Connect du jour, null sans valeur. */
  sante: number | null;
  /** Le repli « compteur du téléphone » est activé. */
  telephoneActif?: boolean;
  /** Pas du téléphone du jour (pas-telephone.ts), null sans valeur. */
  telephone?: number | null;
}

/** La règle, pour un jour : Whoop, Santé Connect, puis (repli) le compteur du téléphone quand aucun appareil n'a de valeur. */
export function choisirPas(e: EntreePas): ChoixPas {
  const c = choisirAppareil(e);
  if (c.etat === "valeur" || !e.telephoneActif) return c;
  return e.telephone != null ? { etat: "valeur", pas: e.telephone, source: "telephone" } : c.etat === "a-connecter" ? { etat: "vide", source: "telephone" } : c;
}

function choisirAppareil(e: EntreePas): ChoixPas {
  // Un compteur de pas ne fait que monter dans la journée : quand Whoop et Santé Connect ont tous deux une valeur, la plus haute
  // est la plus récente (02/11 : Whoop restait à 0 depuis 8 h alors que la montre comptait les pas).
  if (e.whoopActif && e.whoop != null && e.santeAutorise && e.sante != null && e.sante > e.whoop) return { etat: "valeur", pas: e.sante, source: "sante" };
  if (e.whoopActif && e.whoop != null) return { etat: "valeur", pas: e.whoop, source: "whoop" };
  if (e.withingsActif && e.withings != null) {
    return e.santeAutorise && e.sante != null && e.sante > e.withings ? { etat: "valeur", pas: e.sante, source: "sante" } : { etat: "valeur", pas: e.withings, source: "withings" };
  }
  if (e.santeAutorise) return e.sante != null ? { etat: "valeur", pas: e.sante, source: "sante" } : { etat: "vide", source: "sante" };
  // Whoop actif sans valeur (pas encore synchronisé ce matin) : on ne réclame pas Santé Connect pour autant
  if (e.whoopActif) return { etat: "vide", source: "whoop" };
  if (e.withingsActif) return { etat: "vide", source: "withings" };
  return { etat: "a-connecter" };
}

/**
 * Pas Whoop d'un jour pour la règle ci-dessus : ceux gardés dans le journal pour un jour fini ; le jour en cours, que plus rien
 * ne met à jour, ne vaut rien face aux autres sources.
 */
export function pasWhoopDuJour(pas: number | null | undefined, jour: number, maintenant: number): number | null {
  return pas != null && jour + JOUR_MS <= maintenant ? pas : null;
}

/** Le nombre de pas du choix, null s'il n'y en a pas (calculs : énergie, cases). */
export const valeurPas = (c: ChoixPas): number | null => (c.etat === "valeur" ? c.pas : null);

/** Ce qu'il faut de Santé Connect (remplaçable en test). */
export interface SantePas {
  autorisees(): Promise<string[]>;
  pasEntre(debut: number, fin: number): Promise<number | null>;
  /** Lecture groupée (une seule demande pour une suite de jours) ; à défaut, un jour après l'autre. */
  pasIntervalles?(bornes: number[]): Promise<(number | null)[] | null>;
}

/** Au plus un mois de jours lus un par un quand la lecture groupée a échoué. */
const JOURS_UN_PAR_UN = 31;

/**
 * Dernier nombre de pas lu dans Santé Connect pour chaque jour (minuit local) : un compteur ne fait que monter, la dernière valeur lue
 * reste une valeur juste quand la lecture suivante échoue (Santé Connect lent ou en limite de débit, délai dépassé) ; gardé par source de lecture. Sans elle, la
 * jauge du jour passait à « — » alors que les pas étaient là. Une lecture qui répond « rien » n'est pas un échec : pas de repli.
 */
const dernierLu = new WeakMap<SantePas, Map<number, number>>();
const memoire = (s: SantePas) => dernierLu.get(s) ?? dernierLu.set(s, new Map()).get(s)!;

async function lireSante(s: SantePas, jour: number, fin: number): Promise<number | null> {
  try {
    const v = await s.pasEntre(jour, fin);
    if (v != null) memoire(s).set(jour, v);
    return v;
  } catch {
    return memoire(s).get(jour) ?? null;
  }
}

/** Choix des pas pour chaque jour (minuit local), dans l'ordre donné. `maintenant` borne le jour en cours. */
export async function lirePasJours(db: Executeur, jours: readonly number[], maintenant: number = Date.now(), s: SantePas = santeConnect): Promise<ChoixPas[]> {
  if (!jours.length) return [];
  const autorisees = await s.autorisees().catch((): string[] => []);
  const santeAutorise = autorisees.includes(PERMISSION_PAS);
  // pas Whoop gardés dans le journal (pasWhoopDuJour)
  const whoopGardes = await pasWhoopJours(db, jours);
  const whoop = new Map<number, number>();
  for (const j of jours) {
    const v = pasWhoopDuJour(whoopGardes.get(j), j, maintenant);
    if (v != null) whoop.set(j, v);
  }
  const withingsActif = await withingsConnecte(db);
  const withings = withingsActif ? await pasWithingsJours(db, jours) : new Map<number, number>();
  // Repli : le compteur du téléphone, lu (et rangé dans le jour) seulement s'il est activé et qu'aujourd'hui est demandé
  const telephoneOn = await telephoneActif(db);
  if (telephoneOn && jours.some((j) => j <= maintenant && maintenant < j + JOUR_MS)) await echantillonnerTelephone(db, maintenant).catch(() => false);
  const tel = telephoneOn ? await pasTelephoneJours(db, jours).catch(() => new Map<number, number>()) : new Map<number, number>();
  const rep = (j: number) => ({ telephoneActif: telephoneOn, telephone: tel.get(j) ?? null });
  // Jours qui se suivent (périodes des statistiques) : Santé Connect lu en une fois plutôt que jour par jour.
  const suite = jours.every((j, i) => i === 0 || j > jours[i - 1]!) && jours[0]! < maintenant;
  if (santeAutorise && s.pasIntervalles && suite && jours.length > 1) {
    const bornes = [...jours.filter((j) => j < maintenant), Math.min(jours[jours.length - 1]! + JOUR_MS, maintenant)];
    const l = await s.pasIntervalles(bornes).catch(() => null);
    if (l) {
      jours.forEach((j, i) => l[i] != null && memoire(s).set(j, l[i]!));
      return jours.map((j, i) => {
        const w = whoop.get(j) ?? null;
        return choisirPas({ whoopActif: w != null, whoop: w, withingsActif, withings: withings.get(j) ?? null, santeAutorise, sante: w == null ? (l[i] ?? null) : null, ...rep(j) });
      });
    }
    // Lecture groupée en échec (Santé Connect sans réponse, quota, appli passée en fond) : jamais 400 lectures d'un jour en
    // rafale derrière (la page Pas, le 31/10, docs/PAS-CHARGEMENT.md) ; au-delà d'un mois, Santé Connect n'a rien donné.
    if (jours.length > JOURS_UN_PAR_UN) return jours.map((j) => choisirPas({ whoopActif: whoop.has(j), whoop: whoop.get(j) ?? null, withingsActif, withings: withings.get(j) ?? null, santeAutorise, sante: null, ...rep(j) }));
  }
  return Promise.all(
    jours.map(async (j) => {
      const w = whoop.get(j) ?? null;
      // Santé Connect n'est lu que s'il peut servir (Whoop n'a rien ce jour-là)
      const sc = santeAutorise && w == null ? await lireSante(s, j, Math.min(j + JOUR_MS, maintenant)) : null;
      return choisirPas({ whoopActif: w != null, whoop: w, withingsActif, withings: withings.get(j) ?? null, santeAutorise, sante: sc, ...rep(j) });
    }),
  );
}

/** Choix des pas d'un seul jour. */
export async function lirePasJour(db: Executeur, jour: number, maintenant: number = Date.now(), s: SantePas = santeConnect): Promise<ChoixPas> {
  return (await lirePasJours(db, [jour], maintenant, s))[0]!;
}

/** Minuits locaux des `n` derniers jours, du plus ancien à aujourd'hui. */
export function derniersJours(n: number, maintenant: number = Date.now()): number[] {
  const d = new Date(maintenant);
  return Array.from({ length: n }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - (n - 1 - i)).getTime());
}

