// Synchro incrémentale de l'API officielle Whoop : pour chaque collection, on repart du curseur gardé (début du dernier
// enregistrement vu, moins 2 jours pour reprendre les notes arrivées après coup), on suit next_token jusqu'au bout.
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import type { ApiWhoop } from "./api";
import { REGLAGE } from "./constantes";
import { convertirCycle, convertirRecuperation, convertirSeance, convertirSeanceNonNotee, convertirSommeil, corpsVersPepfit, fusionnerJours } from "./convertir";
import { enregistrerCorps, enregistrerJours, enregistrerSeances, mesuresDesJours, retraiterSeancesWhoop } from "./depot";
import { noterNonNotee, retirerNonNotee } from "../db/depots/diagnostic-activites";
import { estRecupWhoop, importerActivitesWhoop, importerSiestesWhoop } from "../ecrans/recuperer-donnees";
import type { Collection, CycleWhoop, JourWhoop, PageWhoop, RecuperationWhoop, SeanceConvertie, SeanceWhoop, SommeilWhoop } from "./types";

const JOUR = 86_400_000;
/** Première synchro : 90 jours en arrière. */
export const FENETRE_INITIALE_JOURS = 90;
/** Reprise : les enregistrements notés après coup (SCORED) sont relus. */
export const RECOUVREMENT_MS = 2 * JOUR;
const PAGES_MAX = 200;

export interface BilanSynchro {
  jours: number;
  seances: { enrichies: number; creees: number; ignorees: number };
  mesures: number;
  pages: number;
}

/** Tous les enregistrements d'une collection à partir de `depuis` (jusqu'à `jusqua` si donné), page après page. */
export async function toutLire<T>(api: ApiWhoop, c: Collection, depuis: number, bilan: BilanSynchro, jusqua?: number): Promise<T[]> {
  const l: T[] = [];
  let suivant: string | null | undefined;
  for (let i = 0; i < PAGES_MAX; i++) {
    const p: PageWhoop<T> = await api.page<T>(c, new Date(depuis).toISOString(), suivant, jusqua != null ? new Date(jusqua).toISOString() : undefined);
    bilan.pages++;
    l.push(...p.records);
    suivant = p.next_token;
    if (!suivant) break;
  }
  return l;
}

async function depuis(db: Executeur, c: Collection, maintenant: number): Promise<number> {
  const v = Number(await lireReglage(db, REGLAGE.curseur(c)));
  return v > 0 ? v - RECOUVREMENT_MS : maintenant - FENETRE_INITIALE_JOURS * JOUR;
}

/** Le curseur avance au plus récent début vu ; il ne recule jamais. */
async function avancer(db: Executeur, c: Collection, debuts: number[]): Promise<void> {
  if (!debuts.length) return;
  const ancien = Number(await lireReglage(db, REGLAGE.curseur(c))) || 0;
  await ecrireReglage(db, REGLAGE.curseur(c), String(Math.max(ancien, ...debuts)));
}

export const bilanVide = (): BilanSynchro => ({ jours: 0, seances: { enrichies: 0, creees: 0, ignorees: 0 }, mesures: 0, pages: 0 });

export async function synchroniserWhoop(db: Executeur, api: ApiWhoop, maintenant: number = Date.now()): Promise<BilanSynchro> {
  const bilan = bilanVide();

  // sommeil d'abord : la récupération se range au jour du sommeil qui l'a produite
  const sommeils = await toutLire<SommeilWhoop>(api, "sleep", await depuis(db, "sleep", maintenant), bilan);
  const jours: JourWhoop[] = [];
  const jourParSommeil = new Map<string, number>();
  for (const s of sommeils) {
    const j = convertirSommeil(s);
    if (j) {
      jours.push(j);
      jourParSommeil.set(s.id, j.jour);
    }
  }
  const recups = await toutLire<RecuperationWhoop>(api, "recovery", await depuis(db, "recovery", maintenant), bilan);
  for (const r of recups) {
    const j = convertirRecuperation(r, jourParSommeil);
    if (j) jours.push(j);
  }
  const cycles = await toutLire<CycleWhoop>(api, "cycle", await depuis(db, "cycle", maintenant), bilan);
  for (const c of cycles) {
    const j = convertirCycle(c);
    if (j) jours.push(j);
  }
  const seancesBrutes = await toutLire<SeanceWhoop>(api, "workout", await depuis(db, "workout", maintenant), bilan);
  // Les activités notées d'abord ; une activité sans nom que Whoop n'a pas encore notée est gardée avec ses heures (une relecture la
  // complète) ; toute autre non notée est dite au journal de diagnostic (pas gardée : relue à la synchro suivante, 2 jours de recul)
  const seances: SeanceConvertie[] = [];
  for (const b of seancesBrutes) {
    const c = convertirSeance(b);
    if (c) {
      seances.push(c);
      retirerNonNotee(b.id);
      continue;
    }
    const n = convertirSeanceNonNotee(b);
    if (n) seances.push(n);
    if (n || Number.isFinite(Date.parse(b.start))) noterNonNotee({ id: b.id, debut: Date.parse(b.start), fin: Date.parse(b.end) }, `${b.score_state}${n ? "" : ":nomme"}`, maintenant);
  }
  // Récupérer (planche recuperer) : les siestes et les activités de récupération (sauna, bain froid, massage…) vont dans
  // recup_activite, pas dans les nuits ni dans les séances
  const [sport, recup] = [seances.filter((s) => !estRecupWhoop(s)), seances.filter(estRecupWhoop)];

  const fusion = fusionnerJours(jours);
  await enregistrerJours(db, fusion, maintenant);
  bilan.mesures = await mesuresDesJours(db, fusion, maintenant);
  bilan.jours = fusion.length;
  const rangees = await enregistrerSeances(db, sport, maintenant);
  await importerSiestesWhoop(db, sommeils, maintenant).catch((e: unknown) => console.error(e));
  await importerActivitesWhoop(db, recup, maintenant).catch((e: unknown) => console.error(e));
  bilan.seances = rangees;
  // séances rangées avant (nom brut, marches, Hevy importé après) : remises en ordre, sans perte
  await retraiterSeancesWhoop(db, maintenant);

  // poids et taille : un échec ici ne perd pas le reste
  await api.corps().then((c) => enregistrerCorps(db, corpsVersPepfit(c), maintenant)).catch(() => {});

  await avancer(db, "sleep", sommeils.map((s) => Date.parse(s.start)));
  await avancer(db, "recovery", recups.map((r) => Date.parse(r.created_at)));
  await avancer(db, "cycle", cycles.map((c) => Date.parse(c.start)));
  await avancer(db, "workout", seances.map((s) => s.debut));
  await ecrireReglage(db, REGLAGE.derniereSynchro, String(maintenant));
  return bilan;
}
