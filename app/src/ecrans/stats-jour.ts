// Chiffres des jauges de Sport pour un jour (RangeeSport.tsx, docs/JAUGES-PASSE.md) : Récupération (planche recuperation :
// elle remplace la dépense, le 31/10), pas, effort, cible. Chaque lecture a 10 s au plus : une lecture en panne laisse
// « — » à sa case, jamais un squelette sans fin. Gardés dans la mémoire de l'onglet (memoire-jours.ts) : un jour déjà lu
// revient tout de suite. Lectures en base et Santé Connect ; testé par tests/stats-jour.test.ts.
import type { Executeur } from "../db/executeur";
import { lireSexe } from "../db/depots/profil";
import { lireJournee, type Journee } from "./journee-donnees";
import { lireObjectifPas } from "./mesures/pas-donnees";
import { lirePasJour, type SourcePas } from "./pas-source";
import { lireRecupJour } from "./recup-donnees";
import type { NiveauRecup } from "./recup-pepfit";
import { lireCible } from "./sport-stats-donnees";
import type { Cible } from "./effort-pepfit";
import { avecDelai, creerMemoire, joursAPrecharger } from "./memoire-jours";

export interface StatsJour {
  jour: number;
  maintenant: number;
  /** La Récupération du matin ; score null sous 25 % de précision (rien de la nuit). */
  recup: { score: number | null; niveau: NiveauRecup | null; precision: number } | null;
  /** Profil au féminin : les mots s'accordent (« Prête »). */
  feminin: boolean;
  pas: { pas: number; source: SourcePas } | null;
  objectifPas: number;
  effort: Journee["effort"];
  /** La cible du jour (Effort pepfit), null sans cible. */
  cible: Cible | null;
}

/** Une lecture de plus de 10 s : sa case passe à « — ». */
export const DELAI_STATS_MS = 10_000;
/** Un jour lu il y a moins d'une minute n'est pas relu en arrivant sur sa page (aujourd'hui l'est toujours à l'arrivée). */
export const VIE_STATS_MS = 60_000;

export const minuitDe = (date: string) => {
  const [a, m, j] = date.split("-").map(Number);
  return new Date(a!, m! - 1, j!).getTime();
};

/** Les chiffres d'un jour (AAAA-MM-JJ), lus ensemble. */
export async function lireStatsJour(db: Executeur, date: string, maintenant = Date.now(), delaiMs = DELAI_STATS_MS): Promise<StatsJour> {
  const jour = minuitDe(date);
  const borne = <T,>(p: Promise<T>) => avecDelai(p, delaiMs, null);
  // la Récupération d'abord : sa forme règle la cible (lue une seule fois)
  const recupP = borne(lireRecupJour(db, jour));
  const [j, recup, pas, objectifPas, cible, sexe] = await Promise.all([
    borne(lireJournee(db, jour)),
    recupP,
    borne(lirePasJour(db, jour, maintenant)),
    avecDelai(lireObjectifPas(db), delaiMs, 8000),
    borne(recupP.then((r) => lireCible(db, jour, maintenant, undefined, r?.forme ?? 1))),
    lireSexe(db).catch(() => null),
  ]);
  return {
    jour,
    maintenant,
    recup: recup ? { score: recup.score, niveau: recup.niveau, precision: recup.precision } : null,
    feminin: sexe === "f",
    pas: pas?.etat === "valeur" ? { pas: pas.pas, source: pas.source } : null,
    objectifPas,
    effort: j?.effort ?? null,
    cible,
  };
}

/** Mémoire des chiffres de chaque jour, partagée par la rangée, la ligne fixe et le préchargement. */
export const memoireStats = creerMemoire<StatsJour>({ vieMs: VIE_STATS_MS });

/** Lit un jour (ou rejoint sa lecture en cours) ; `surChiffres` les reçoit dès qu'ils sont là. */
export async function chargerStatsJour(db: Executeur, date: string, surChiffres?: (s: StatsJour) => void, delaiMs = DELAI_STATS_MS): Promise<StatsJour> {
  const debut = Date.now();
  const s = await memoireStats.charger(date, () => lireStatsJour(db, date, Date.now(), delaiMs));
  // Mesure (docs/JAUGES-PASSE.md) : dans le journal de l'appareil, « [jauges] 2026-10-29 : 812 ms ».
  console.info(`[jauges] ${date} : ${Date.now() - debut} ms`);
  surChiffres?.(s);
  return s;
}

/**
 * Lit d'avance les jours passés de la semaine affichée qui ne sont pas en mémoire, l'un après l'autre (Santé Connect
 * n'aime pas les rafales) : toucher un autre jour du semainier montre ses jauges tout de suite.
 */
export async function prechargerSemaine(db: Executeur, lundi: string, affiche: string, aujourdhui: string): Promise<void> {
  for (const d of joursAPrecharger(lundi, affiche, aujourdhui)) {
    if (memoireStats.frais(d)) continue;
    await chargerStatsJour(db, d).catch(() => null);
  }
}
