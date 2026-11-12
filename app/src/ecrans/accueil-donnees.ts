import type { SQLiteDatabase } from "expo-sqlite";
import {
  joursDeRepos, JOUR_MS, lireAccueil, lireRoutine, listerPesees, peseeAvant, recordsRecents, seancesParSemaine, seancesTerminees, serieHebdo,
  statsAccueil, type StatsAccueil,
} from "../db/api";
import { rafraichirRappels } from "../natif/rappels";
import { rafraichirRappelsTraitements } from "../natif/rappels-traitements";
import { BRANCHE, lireBlocs, visibles, type Bloc } from "./accueil-blocs";
import { chargerCartes, type DonneesCartes, type IdCarte } from "./mesures/cartes-donnees";
import { lireBandeau } from "./bandeau-donnees";
import type { DonneesBandeau } from "./bandeau-seance";
import { dureeEstimee, recordsDeSeance, type RecordSeance } from "./donnees";
import { derniersRecords, type RecordRecent } from "./profil-vue";
import { prochainesSeances, type ProchaineSeance } from "./planif-donnees";

/** Objectif de pas du bloc Pas (fixe tant qu'il n'y a pas de réglage). */
export const OBJECTIF_PAS = 8000;
/** Semaines montrées par le bloc Régularité. */
export const SEMAINES_REGULARITE = 12;

/** Ce que l'Accueil lit dans la base (M9, docs/PERF-A.md) : posé tout de suite, sans attendre Santé Connect. */
export interface DonneesAccueilBase {
  /** Blocs stockés, branchés ou non, dans l'ordre stocké. */
  stockes: Bloc[];
  stats: StatsAccueil;
  /** Durée estimée de la routine à suivre (s). */
  aSuivreDureeS: number | null;
  /** Records de la dernière séance. */
  recordsDerniere: RecordSeance[];
  enCours: DonneesBandeau | null;
  serie: { enCours: number; meilleure: number };
  /** Jours depuis la dernière séance (0 : aujourd'hui), null sans séance. */
  repos: number | null;
  /** Les trois derniers records, un par exercice et par séance. */
  recents: RecordRecent[];
  /** Dernière pesée, écart sur 30 jours, pesées des 30 derniers jours (de la plus ancienne à la plus récente). */
  poids: { kg: number; ecartKg: number | null; points: number[] } | null;
  /** Séances par semaine, de la plus ancienne à la semaine en cours. */
  semaines: number[];
  /** Bloc Prochaines séances : les quatre prochaines séances programmées, aujourd'hui compris. */
  prochaines: ProchaineSeance[];
  /** Cartes de mesure affichées (pas, poids, énergie, sommeil, récupération, effort, âge pepfit, VO2max) : lues ensuite. */
  cartesVoulues: IdCarte[];
}

export interface DonneesAccueil extends DonneesAccueilBase {
  /** Cartes de mesure arrivées (ou gardées d'une visite d'avant) : seulement celles de l'accueil. */
  cartes: DonneesCartes;
  /** Cartes pas encore lues une seule fois : leur en-tête seul, en attendant (pas de « aucune source » trompeur). */
  enAttente: ReadonlySet<IdCarte>;
}

const CARTES: readonly IdCarte[] = ["pas", "poids", "energie", "sommeil", "recup", "effort", "age", "vo2max"];

/** La base seule : ni Santé Connect ni réseau (les cartes de mesure suivent, chacune à son arrivée : chargerCartes). */
export async function lireAccueilBase(db: SQLiteDatabase, maintenant: number = Date.now()): Promise<DonneesAccueilBase> {
  const [lignes, stats, enCours, faites, recents, pesees, semaines] = await Promise.all([
    lireAccueil(db),
    statsAccueil(db, maintenant),
    lireBandeau(db),
    seancesTerminees(db),
    recordsRecents(db),
    listerPesees(db),
    seancesParSemaine(db, SEMAINES_REGULARITE, maintenant),
  ]);
  const derniere = pesees[0];
  const [prochaines, r, recordsDerniere, avant] = await Promise.all([
    BRANCHE.seances ? prochainesSeances(db, 4, maintenant) : [],
    stats.aSuivre ? lireRoutine(db, stats.aSuivre.routineId) : null,
    stats.derniereSeance ? recordsDeSeance(db, stats.derniereSeance.id) : [],
    derniere ? peseeAvant(db, maintenant - 30 * JOUR_MS) : null,
  ]);
  const stockes = lireBlocs(lignes);
  const cartesVoulues = visibles(stockes).map((b) => b.id).filter((id): id is IdCarte => (CARTES as readonly string[]).includes(id));
  rafraichirRappels(db).catch(() => {});
  // Reposés au lancement aussi : un rappel d'une ligne effacée (migration 48, médicaments) s'éteint sans attendre une fiche.
  rafraichirRappelsTraitements(db).catch(() => {});
  let poids: DonneesAccueil["poids"] = null;
  if (derniere) {
    const points = pesees.filter((p) => p.date >= maintenant - 30 * JOUR_MS).map((p) => p.kg).reverse();
    poids = { kg: derniere.kg, ecartKg: avant && avant.id !== derniere.id ? derniere.kg - avant.kg : null, points };
  }
  return {
    stockes,
    stats,
    aSuivreDureeS: r ? dureeEstimee(r) : null,
    recordsDerniere,
    enCours,
    serie: serieHebdo(faites, maintenant),
    repos: joursDeRepos(faites, maintenant),
    recents: derniersRecords(recents, 3),
    poids,
    semaines: semaines.map((s) => s.nbSeances),
    prochaines,
    cartesVoulues,
  };
}

/**
 * L'Accueil en deux temps (M9) : `poserBase` dès que la base est lue, puis chaque carte de mesure à son arrivée (Santé
 * Connect, énergie). Avant, rien ne s'affichait avant la plus lente des cartes : 5 à 8,5 s au lancement sur le Fold.
 */
export async function chargerAccueil(
  db: SQLiteDatabase,
  poserBase: (b: DonneesAccueilBase) => void,
  poserCarte: Parameters<typeof chargerCartes>[2],
  maintenant: number = Date.now(),
): Promise<void> {
  const b = await lireAccueilBase(db, maintenant);
  poserBase(b);
  if (b.cartesVoulues.length) await chargerCartes(db, b.cartesVoulues, poserCarte, maintenant);
}
