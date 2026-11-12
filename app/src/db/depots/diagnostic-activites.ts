// Diagnostic des activités détectées : pourquoi une activité vue par un capteur (Whoop, Santé Connect) n'est pas devenue une ligne
// « Activité détectée ». Deux choses : un journal gardé en mémoire (une ligne par activité écartée, avec la raison), montré dans
// Réglages › Connexions ; et un fichier diagnostic-activites.json dans le dossier externe de l'appli, que `adb pull` lit sans
// debug (docs/EFFORT-ACTIVITE.md). Ni jeton, ni titre, ni valeur de santé : des identifiants, des heures et des raisons.
import type { Executeur } from "../executeur";
import { lireReglage } from "./reglages";
import { REGLAGE as REGLAGE_WHOOP } from "../../whoop/constantes";
import { stockage } from "../../natif/stockage/index";
import { instantDe, jourDe, lirePlanning } from "../../ecrans/planif-donnees";
import { seancesDesOccurrences } from "../../ecrans/planification";
import type { Ecartee, RaisonEcart } from "../../ecrans/activite-detectee";
import type { SanteActivites } from "./activites";

const JOUR = 86_400_000;
/** Nom du fichier, dans getExternalFilesDir : /sdcard/Android/data/fit.pep.open/files/diagnostic-activites.json */
export const FICHIER_DIAGNOSTIC = "diagnostic-activites.json";
/** Raisons du journal : celles de la détection, plus ce que la synchro Whoop n'a pas gardé. */
export type RaisonJournal = RaisonEcart | "non-notee";

export interface EntreeJournal {
  /** Quand la raison a été constatée. */
  le: number;
  cle: string;
  source: Ecartee["source"];
  debut: number;
  fin: number;
  raison: RaisonJournal;
  detail: string | null;
  /** « jour » : relu avec la journée (remplacé à chaque relecture) ; « synchro » : constaté par la synchro Whoop. */
  origine: "jour" | "synchro";
}

/** Les dernières activités écartées, en mémoire seulement (perdues à la fermeture de l'appli, refaites à la relecture du jour). */
const MAX_JOURNAL = 60;
let journal: EntreeJournal[] = [];

export const journalActivites = (): readonly EntreeJournal[] => journal;
export const viderJournalActivites = (): void => void (journal = []);

const garder = (l: EntreeJournal[]) => (journal = l.sort((a, b) => b.le - a.le).slice(0, MAX_JOURNAL));

/** Les écartées de la journée [debut, fin) remplacent celles de la lecture précédente de ce jour ; les doublons fusionnés ne comptent pas. */
export function noterEcartees(jour: { debut: number; fin: number }, l: readonly Ecartee[], le: number): void {
  const reste = journal.filter((x) => !(x.origine === "jour" && x.debut >= jour.debut && x.debut < jour.fin));
  garder([...reste, ...l.map((e): EntreeJournal => ({ le, cle: e.cle, source: e.source, debut: e.debut, fin: e.fin, raison: e.raison, detail: e.detail, origine: "jour" }))]);
}

/** Une activité Whoop que la synchro n'a pas pu garder (pas encore notée, ou non notable) : elle sera relue à la synchro suivante. */
export function noterNonNotee(w: { id: string; debut: number; fin: number }, etat: string, le: number): void {
  const cle = `whoop:${w.id}`;
  garder([...journal.filter((x) => !(x.cle === cle && x.raison === "non-notee")), { le, cle, source: "whoop", debut: w.debut, fin: w.fin, raison: "non-notee", detail: etat, origine: "synchro" }]);
}

/** L'activité Whoop est désormais gardée : sa ligne « non notée » disparaît. */
export function retirerNonNotee(id: string): void {
  journal = journal.filter((x) => !(x.cle === `whoop:${id}` && x.raison === "non-notee"));
}

/**
 * Ce que la relecture d'un jour a interrogé pour détecter une activité, et ce que chaque source a donné (docs/EFFORT-ACTIVITE.md § 8) :
 * en mémoire (le dernier relevé de chaque jour), écrit dans le fichier. Des états, des comptes, des heures et des libellés de Whoop :
 * ni jeton, ni valeur de santé.
 */
export interface SourcesDetectionDiag {
  /** Minuit local du jour relu, et quand. */
  jour: number;
  le: number;
  /** Whoop (API officielle) connecté. */
  whoop_connecte: boolean;
  /** FC de Santé Connect (ou Polar) : nombre de points ; null si non lue (journal Whoop gardé, pas de profil de FC) ou illisible. */
  fc_sante: number | null;
  /** Efforts trouvés dans la FC (avant d'écarter ceux d'une séance ou d'une activité Whoop), et ceux encore en cours (pas finis). */
  efforts_pepfit: { debut: number; fin: number; en_cours: boolean }[];
  /** Activités à associer de la journée après relecture, par source. */
  activites: { whoop: number; sante: number; pepfit: number };
}

const MAX_SOURCES = 6;
let sources: SourcesDetectionDiag[] = [];

export const sourcesDetection = (): readonly SourcesDetectionDiag[] => sources;
export const viderSourcesDetection = (): void => void (sources = []);

/** Le relevé du jour remplace le précédent du même jour. */
export function noterSources(s: SourcesDetectionDiag): void {
  sources = [...sources.filter((x) => x.jour !== s.jour), s].sort((a, b) => b.jour - a.jour).slice(0, MAX_SOURCES);
}

/** Les trois derniers jours (minuit local d'avant-hier jusqu'à maintenant) : ce que le diagnostic relit. */
export const debutDiagnostic = (maintenant: number) => instantDe(jourDe(maintenant)) - 2 * JOUR;

export interface Diagnostic {
  version: 1;
  ecrit_le: string;
  motif: string;
  /** Décalage du fuseau de l'appli, en minutes (les heures du fichier sont des instants en ms depuis 1970). */
  decalage_min: number;
  whoop: { connecte: boolean; derniere_synchro: number | null; curseur_workout: number | null; erreur: string | null };
  whoop_seance: { id: string; debut: number; fin: number; sport_id: number | null; seance_id: string | null; zones: boolean }[];
  seances_pepfit: { id: string; debut: number; fin: number | null; origine: string; routine: boolean }[];
  sante_sport: { debut: number; fin: number; type: number; origine: string | null; pas: number | null }[] | null;
  activite_detectee: { cle: string; etat: string; debut: number; fin: number; seance_id: string | null }[];
  occurrences: { programmation_id: string; date: string; heure: string; sport: string | null; duree_min: number; faite: boolean }[];
  journal: { le: number; cle: string; debut: number; fin: number; raison: RaisonJournal; detail: string | null }[];
  /** Sources interrogées pour détecter une activité, par jour relu : ce que chacune a donné. */
  sources_detection: SourcesDetectionDiag[];
}

/** Ce que l'on sait des trois derniers jours, de la base et de Santé Connect (`sante` absent : rien de ce côté). */
export async function construireDiagnostic(
  db: Executeur,
  o: { motif: string; maintenant?: number; sante?: Pick<SanteActivites, "seancesSport"> | null },
): Promise<Diagnostic> {
  const maintenant = o.maintenant ?? Date.now();
  const debut = debutDiagnostic(maintenant);
  const fin = maintenant + JOUR;
  const [connecte, derniere, curseur, erreur, whoop, seances, detectees, planning, sante] = await Promise.all([
    lireReglage(db, REGLAGE_WHOOP.connecte),
    lireReglage(db, REGLAGE_WHOOP.derniereSynchro),
    lireReglage(db, REGLAGE_WHOOP.curseur("workout")),
    lireReglage(db, REGLAGE_WHOOP.derniereErreur),
    db.getAllAsync<{ id: string; debut: number; fin: number; sport_id: number | null; seance_id: string | null; zones: string | null }>(
      "SELECT id, debut, fin, sport_id, seance_id, zones FROM whoop_seance WHERE debut >= ? AND debut < ? ORDER BY debut",
      [debut, fin],
    ),
    db.getAllAsync<{ id: string; debut: number; fin: number | null; source_ref: string | null; routine_id: string | null }>(
      "SELECT id, debut, fin, source_ref, routine_id FROM seances WHERE debut < ? AND COALESCE(fin, debut) > ? ORDER BY debut",
      [fin, debut],
    ),
    db.getAllAsync<{ cle: string; etat: string; debut: number; fin: number; seance_id: string | null }>(
      "SELECT cle, etat, debut, fin, seance_id FROM activite_detectee WHERE debut >= ? AND debut < ? ORDER BY debut",
      [debut, fin],
    ),
    lirePlanning(db, jourDe(debut), jourDe(maintenant), maintenant).catch(() => null),
    o.sante ? o.sante.seancesSport(debut, fin).catch(() => null) : Promise.resolve(null),
  ]);
  const validees = planning ? seancesDesOccurrences(planning.occ, planning.jours) : new Map();
  return {
    version: 1,
    ecrit_le: new Date(maintenant).toISOString(),
    motif: o.motif,
    decalage_min: -new Date(maintenant).getTimezoneOffset(),
    whoop: { connecte: connecte === "1", derniere_synchro: derniere ? Number(derniere) : null, curseur_workout: curseur ? Number(curseur) : null, erreur: erreur || null },
    whoop_seance: whoop.map((w) => ({ id: w.id, debut: w.debut, fin: w.fin, sport_id: w.sport_id, seance_id: w.seance_id, zones: w.zones != null })),
    seances_pepfit: seances.map((s) => ({ id: s.id, debut: s.debut, fin: s.fin, origine: (s.source_ref ?? "pepfit").split(":")[0]!, routine: s.routine_id != null })),
    sante_sport: sante ? sante.map((s) => ({ debut: s.debut, fin: s.fin, type: s.type, origine: s.origine, pas: s.pas })) : null,
    activite_detectee: detectees,
    occurrences: (planning?.occ ?? []).map((x) => ({
      programmation_id: x.programmationId, date: x.date, heure: x.heure, sport: x.sport ?? null, duree_min: x.dureeMin ?? 0, faite: validees.has(x),
    })),
    journal: journal.filter((x) => x.fin > debut).map(({ le, cle, debut: d, fin: f, raison, detail }) => ({ le, cle, debut: d, fin: f, raison, detail })),
    sources_detection: sources.filter((x) => x.jour + JOUR > debut),
  };
}

/** Où le fichier est posé : le dossier externe de l'appli (natif) ; remplaçable par les tests. */
export const sortieDiagnostic = { ecrire: (nom: string, contenu: string): Promise<boolean> => stockage.ecrireDiagnostic(nom, contenu) };

const enCours = new Set<Promise<unknown>>();
/** Garde une écriture de diagnostic faite en arrière-plan, pour que les tests (et la fermeture) puissent l'attendre. */
export function suivreDiagnostic(p: Promise<unknown>): void {
  enCours.add(p);
  void p.finally(() => enCours.delete(p));
}
export const attendreDiagnostics = async (): Promise<void> => void (await Promise.all([...enCours]));

/** Écrit diagnostic-activites.json ; ne rejette jamais (un diagnostic ne gêne ni la relecture ni la synchro). */
export async function ecrireDiagnosticActivites(
  db: Executeur,
  o: { motif: string; maintenant?: number; sante?: Pick<SanteActivites, "seancesSport"> | null },
): Promise<boolean> {
  try {
    return await sortieDiagnostic.ecrire(FICHIER_DIAGNOSTIC, JSON.stringify(await construireDiagnostic(db, o), null, 1));
  } catch (e) {
    console.warn("[diagnostic-activites]", e instanceof Error ? e.message : "");
    return false;
  }
}
