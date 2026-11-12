// Relecture de l'historique des jours Whoop (sommeil, récupération, cycles : VFC, FC au repos, sommeil, effort). La première
// synchro ne remonte que FENETRE_INITIALE_JOURS ; à la première connexion comme à la reconnexion d'une base qui n'a plus ces
// jours (déconnexion avec suppression, ancien appareil), le reste de l'historique est rapatrié par tranches, de la plus récente à
// la plus ancienne, sans bloquer la synchro. L'avancement est gardé après chaque tranche : une coupure (réseau, limite de débit
// de Whoop, jeton expiré) reprend à la tranche suivante, à la synchro d'après. Les appels passent par l'API (api.ts) qui attend
// la minute suivante plutôt que de provoquer un 429. Séances, siestes et corps ne sont pas relus ici : la synchro ordinaire s'en
// charge, sur sa fenêtre.
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import type { ApiWhoop } from "./api";
import { REGLAGE } from "./constantes";
import { convertirCycle, convertirRecuperation, convertirSommeil, fusionnerJours, minuit } from "./convertir";
import { enregistrerJours, mesuresDesJours } from "./depot";
import { bilanVide, FENETRE_INITIALE_JOURS, toutLire } from "./synchro";
import { ErreurWhoop, type CycleWhoop, type JourWhoop, type RecuperationWhoop, type SommeilWhoop } from "./types";

const JOUR = 86_400_000;
/** Jusqu'où remonte la relecture, à partir de la fenêtre de la première synchro (deux ans d'historique en tout). */
export const HISTORIQUE_JOURS = 730;
export const TRANCHE_JOURS = 90;
/** Une tranche déborde de 2 jours sur la suivante : un sommeil et sa récupération, de part et d'autre de la limite, se retrouvent. */
const DEBORD_MS = 2 * JOUR;
/** Une base dont le plus ancien jour mesuré est plus récent que cela (en jours) n'a pas l'historique : à relire. */
const SEUIL_BASE_JOURS = FENETRE_INITIALE_JOURS + 7;

export interface EtatHistoriqueWhoop {
  /** Minuit (ms) d'où part la relecture vers le passé : le début de la fenêtre de la première synchro. */
  ancre: number;
  faites: number;
  fini?: boolean;
}

export interface Tranche {
  depuis: number;
  jusqua: number;
}

/** Les tranches qui couvrent `jours` jours avant `ancre`, de la plus récente à la plus ancienne. */
export function tranchesHistorique(ancre: number, jours = HISTORIQUE_JOURS, taille = TRANCHE_JOURS): Tranche[] {
  const l: Tranche[] = [];
  for (let fait = 0; fait < jours; fait += taille) {
    const fin = ancre - fait * JOUR;
    l.push({ depuis: ancre - Math.min(fait + taille, jours) * JOUR, jusqua: fin + DEBORD_MS });
  }
  return l;
}

export function lireEtatHistorique(brut: string | null): EtatHistoriqueWhoop | null {
  if (!brut) return null;
  try {
    const e = JSON.parse(brut) as EtatHistoriqueWhoop;
    return Number.isFinite(e.ancre) && Number.isInteger(e.faites) ? e : null;
  } catch {
    return null;
  }
}

/** Le plus ancien jour que la base tient de Whoop (nuit, récupération ou effort ; pas les pas seuls), null s'il n'y en a aucun. */
async function plusAncienJour(db: Executeur): Promise<number | null> {
  const l = await db.getFirstAsync<{ j: number | null }>("SELECT MIN(jour) AS j FROM whoop_jour WHERE recup IS NOT NULL OR kj IS NOT NULL OR sommeil_min IS NOT NULL", []);
  return l?.j ?? null;
}

export type IssueHistoriqueWhoop = "fini" | "interrompu" | "inutile";

/**
 * À appeler après la synchro ordinaire (la fenêtre récente est alors en base). Sans avancement gardé : si la base a déjà plus
 * d'historique que la fenêtre de la première synchro, il n'y a rien à rapatrier (`inutile`, gardé pour ne pas y revenir) ;
 * sinon la relecture commence. Avec un avancement : elle reprend. Une erreur de l'API arrête la relecture sans rien perdre.
 */
export async function relireHistoriqueWhoop(
  db: Executeur,
  api: ApiWhoop,
  maintenant: number = Date.now(),
  /** Faux si la connexion a été coupée entre-temps : on s'arrête sans rien écrire de plus (déconnexion en cours de relecture). */
  actif: () => Promise<boolean> = async () => true,
): Promise<IssueHistoriqueWhoop> {
  let e = lireEtatHistorique(await lireReglage(db, REGLAGE.historique));
  if (e?.fini) return "inutile";
  if (!e) {
    const premier = await plusAncienJour(db);
    const ancre = minuit(maintenant) - FENETRE_INITIALE_JOURS * JOUR;
    if (premier != null && premier < maintenant - SEUIL_BASE_JOURS * JOUR) {
      await ecrireReglage(db, REGLAGE.historique, JSON.stringify({ ancre, faites: 0, fini: true } satisfies EtatHistoriqueWhoop));
      return "inutile";
    }
    e = { ancre, faites: 0 };
    await ecrireReglage(db, REGLAGE.historique, JSON.stringify(e));
  }
  const l = tranchesHistorique(e.ancre);
  for (let i = e.faites; i < l.length; i++) {
    try {
      const t = await lireTranche(api, l[i]!);
      if (!(await actif())) return "interrompu";
      await rangerTranche(db, t, maintenant);
    } catch (x) {
      if (x instanceof ErreurWhoop) return "interrompu";
      throw x;
    }
    await ecrireReglage(db, REGLAGE.historique, JSON.stringify({ ancre: e.ancre, faites: i + 1 } satisfies EtatHistoriqueWhoop));
  }
  await ecrireReglage(db, REGLAGE.historique, JSON.stringify({ ancre: e.ancre, faites: l.length, fini: true } satisfies EtatHistoriqueWhoop));
  return "fini";
}

interface Lu {
  sommeils: SommeilWhoop[];
  recups: RecuperationWhoop[];
  cycles: CycleWhoop[];
}

/** Une tranche lue chez Whoop : sommeil, récupération et cycles de la période. */
async function lireTranche(api: ApiWhoop, t: Tranche): Promise<Lu> {
  const bilan = bilanVide();
  const sommeils = await toutLire<SommeilWhoop>(api, "sleep", t.depuis, bilan, t.jusqua);
  const recups = await toutLire<RecuperationWhoop>(api, "recovery", t.depuis, bilan, t.jusqua);
  const cycles = await toutLire<CycleWhoop>(api, "cycle", t.depuis, bilan, t.jusqua);
  return { sommeils, recups, cycles };
}

/** Rangée comme la synchro ordinaire : jours, puis VFC et FC au repos dans les mesures du corps. */
async function rangerTranche(db: Executeur, l: Lu, maintenant: number): Promise<void> {
  const jours: JourWhoop[] = [];
  const jourParSommeil = new Map<string, number>();
  for (const s of l.sommeils) {
    const j = convertirSommeil(s);
    if (j) {
      jours.push(j);
      jourParSommeil.set(s.id, j.jour);
    }
  }
  for (const r of l.recups) {
    const j = convertirRecuperation(r, jourParSommeil);
    if (j) jours.push(j);
  }
  for (const c of l.cycles) {
    const j = convertirCycle(c);
    if (j) jours.push(j);
  }
  const fusion = fusionnerJours(jours);
  await enregistrerJours(db, fusion, maintenant);
  await mesuresDesJours(db, fusion, maintenant);
}
