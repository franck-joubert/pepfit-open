// Données de la page Sommeil (planche pas, NOTES § 1 ter, D15) : une nuit par jour de réveil. Whoop prime pour la nuit
// (durées des phases, performance, besoin, régularité, respiration) ; la chronologie des phases (hypnogramme) vient de Santé
// Connect quand une appli l'y écrit, même si Whoop fournit la nuit. Sans Whoop : ni performance, ni besoin, ni régularité
// Whoop (rien d'inventé) ; l'efficacité est calculée (« ~ »).
import { lireReglage, type Executeur } from "../../db/api";
import { sante } from "../../natif/sante/index";
import type { SommeilNuit } from "../../natif/sante/types";
import { REGLAGE } from "../../whoop/constantes";
import { joursWhoop, type JourWhoopLu } from "../../whoop/lecture";
import { fusionnerNuitsWithings, nuitsWithings } from "../../withings/lecture";
import { isoJour, lireDonneesRecup } from "../recup-donnees";
import { arrondiDette, nuitsDette, RECUP, sommeilDuMatin } from "../recup-pepfit";
import { decaler, minuit } from "./periodes";
import { appliquerHorairesNuits, ecrireHorairesNuit, lireHorairesNuits } from "./sommeil-horaires";
import { partBesoin, sommeilDuJour, type SommeilDuJour } from "./sommeil-dette";
import { OBJECTIF_SOMMEIL_MIN, REGLAGE_OBJECTIF_SOMMEIL, versStat, type NuitStat, type Phase } from "./sommeil-stats";

/** Types de stades Santé Connect (SleepSessionRecord.STAGE_TYPE_*) vers nos phases ; 2 (« endormi », sans détail) n'en est pas une. */
const TYPE_PHASE: Record<number, Phase | undefined> = { 1: "eveil", 3: "eveil", 7: "eveil", 4: "leger", 5: "profond", 6: "paradoxal" };

export interface Etape {
  debut: number;
  fin: number;
  phase: Phase;
}

/** Chronologie de Santé Connect, null si l'appli n'écrit pas les phases (il en faut au moins une de sommeil détaillée). */
export function chronologie(etapes: readonly { debut: number; fin: number; type: number }[] | undefined): Etape[] | null {
  const l = (etapes ?? [])
    .filter((e) => e.fin > e.debut && TYPE_PHASE[e.type])
    .sort((a, b) => a.debut - b.debut)
    .map((e) => ({ debut: e.debut, fin: e.fin, phase: TYPE_PHASE[e.type]! }));
  return l.some((e) => e.phase !== "eveil") ? l : null;
}

export interface Besoin {
  base: number;
  dette: number;
  effort: number;
  sieste: number;
}

export interface Nuit {
  /** Minuit du jour de réveil. */
  jour: number;
  debut: number;
  fin: number;
  sommeilMin: number;
  auLitMin: number;
  phases: Record<Phase, number> | null;
  /** D'où vient la nuit (durées) : Whoop ou Santé Connect. */
  source: "whoop" | "sante";
  /** Paquet de l'appli de Santé Connect (nomSource). */
  origine: string | null;
  /** Ordre des phases dans la nuit (Santé Connect), null sans chronologie. */
  etapes: Etape[] | null;
  perf: number | null;
  besoin: Besoin | null;
  /** Efficacité (%) : Whoop, sinon calculée (sommeil ÷ temps au lit). */
  efficacite: number;
  efficaciteCalculee: boolean;
  regularite: number | null;
  reveils: number | null;
  respiration: number | null;
  /** Heure de la donnée : mise à jour Whoop, sinon le lever. */
  heure: number;
  /**
   * Horaires modifiés par la personne (planche Effort v2, D7) : `cle` est le jour de réveil d'origine (AAAA-MM-JJ), `original` les
   * horaires lus chez la source. Absents tant que la nuit n'est pas modifiée.
   */
  cle?: string;
  original?: { debut: number; fin: number } | null;
}

/** Nuit Santé Connect → phases et réveils (passages à l'éveil entre deux sommeils). */
function deSante(n: SommeilNuit): Nuit {
  const etapes = chronologie(n.etapes);
  const auLit = Math.max(1, Math.round((n.fin - n.debut) / 60_000));
  let reveils: number | null = null;
  if (etapes) {
    const dort = etapes.map((e) => e.phase !== "eveil");
    const a = dort.indexOf(true), b = dort.lastIndexOf(true);
    reveils = 0;
    for (let i = a + 1; i < b; i++) if (!dort[i] && dort[i - 1]) reveils++;
  }
  return {
    jour: minuit(n.fin),
    debut: n.debut,
    fin: n.fin,
    sommeilMin: n.minutes,
    auLitMin: auLit,
    phases: n.phases ? { ...n.phases } : null,
    source: "sante",
    origine: n.origine,
    etapes,
    perf: null,
    besoin: null,
    efficacite: Math.round((n.minutes / auLit) * 100),
    efficaciteCalculee: true,
    regularite: null,
    reveils,
    respiration: null,
    heure: n.fin,
  };
}

/** Jour Whoop (nuit notée) → nuit ; la chronologie et la respiration manquantes viennent de Santé Connect (même réveil). */
function deWhoop(j: JourWhoopLu, sc: Nuit | undefined): Nuit | null {
  if (j.sommeil_fin == null || !j.sommeil_min) return null;
  const debut = j.sommeil_debut ?? j.sommeil_fin - (j.au_lit_min ?? j.sommeil_min) * 60_000;
  const auLit = j.au_lit_min ?? Math.max(1, Math.round((j.sommeil_fin - debut) / 60_000));
  const phases = j.leger_min != null ? { eveil: j.eveil_min ?? 0, leger: j.leger_min, profond: j.profond_min ?? 0, paradoxal: j.paradoxal_min ?? 0 } : null;
  // la chronologie de Santé Connect ne vaut que si c'est bien la même nuit (les deux se recouvrent)
  const meme = sc && sc.debut < j.sommeil_fin && debut < sc.fin;
  return {
    jour: j.jour,
    debut,
    fin: j.sommeil_fin,
    sommeilMin: j.sommeil_min,
    auLitMin: auLit,
    phases,
    source: "whoop",
    origine: null,
    etapes: meme ? sc!.etapes : null,
    perf: j.sommeil_perf,
    besoin:
      j.besoin_base_min != null
        ? { base: j.besoin_base_min, dette: j.sommeil_dette_min ?? 0, effort: j.besoin_effort_min ?? 0, sieste: j.besoin_sieste_min ?? 0 }
        : null,
    efficacite: j.sommeil_efficacite ?? Math.round((j.sommeil_min / auLit) * 100),
    efficaciteCalculee: j.sommeil_efficacite == null,
    regularite: j.sommeil_regularite,
    reveils: j.sommeil_reveils ?? (meme ? sc!.reveils : null),
    respiration: j.respiration,
    heure: j.maj_le,
  };
}

/** Fusion par jour de réveil : la nuit Whoop remplace celle de Santé Connect (dont elle garde la chronologie, D15). */
export function fusionner(sc: readonly SommeilNuit[], whoop: ReadonlyMap<number, JourWhoopLu>): Map<number, Nuit> {
  const parJour = new Map<number, Nuit>();
  for (const n of sc) {
    const x = deSante(n);
    const deja = parJour.get(x.jour);
    if (!deja || x.sommeilMin > deja.sommeilMin) parJour.set(x.jour, x);
  }
  for (const j of whoop.values()) {
    const w = deWhoop(j, parJour.get(j.jour));
    if (w) parJour.set(w.jour, w);
  }
  return parJour;
}

export interface DonneesSommeil {
  nuits: Map<number, Nuit>;
  /** Pour les statistiques. */
  stats: Map<number, NuitStat>;
  objectif: number;
  whoopConnecte: boolean;
  /** Santé Connect : lecture du sommeil autorisée. */
  santeAutorise: boolean;
  santeDispo: boolean;
  /** Premier jour lu (borne des périodes et de l'agenda). */
  premier: number | null;
  /** Début de la fenêtre lue. */
  depuis: number;
}

/** Lit les nuits depuis `depuis` (minuit) jusqu'à maintenant. */
export async function lireSommeil(db: Executeur, depuis: number, maintenant = Date.now()): Promise<DonneesSommeil> {
  const [sc0, nuitsWi, w, obj, connecte, dispo, autorisees] = await Promise.all([
    sante.nuits(depuis - 12 * 3_600_000, maintenant).catch(() => null),
    nuitsWithings(db, depuis - 12 * 3_600_000, maintenant),
    joursWhoop(db, depuis, minuit(maintenant)).catch(() => new Map<number, JourWhoopLu>()),
    lireReglage(db, REGLAGE_OBJECTIF_SOMMEIL).catch(() => null),
    lireReglage(db, REGLAGE.connecte).catch(() => null),
    sante.disponible().catch(() => false),
    sante.autorisees().catch((): string[] => []),
  ]);
  // Withings (lu chez eux) remplace Santé Connect le même jour de réveil, Whoop remplace les deux
  const sc = nuitsWi.length ? fusionnerNuitsWithings(sc0 ?? [], nuitsWi) : sc0;
  const lues = fusionner(sc ?? [], w);
  // Horaires modifiés par la personne : appliqués ici, donc partout (page Sommeil, cartes, Effort, moyennes) sans rien d'autre à faire
  const modifiees = await lireHorairesNuits(db);
  const { nuits, originauxADeplacer } = modifiees.length ? appliquerHorairesNuits(lues, modifiees) : { nuits: lues, originauxADeplacer: [] };
  // La source a corrigé la nuit depuis : l'original suit, la modification reste
  for (const h of originauxADeplacer) await ecrireHorairesNuit(db, h).catch(() => {});
  const stats = new Map<number, NuitStat>();
  for (const n of nuits.values()) stats.set(n.jour, versStat(n));
  const jours = [...nuits.keys()].sort((a, b) => a - b);
  const o = Number(obj);
  return {
    nuits,
    stats,
    objectif: o >= 240 && o <= 720 ? o : OBJECTIF_SOMMEIL_MIN,
    whoopConnecte: connecte === "1",
    santeAutorise: (autorisees as string[]).includes("sommeil"),
    santeDispo: dispo,
    premier: jours[0] ?? null,
    depuis,
  };
}

/** Premier jour d'une nuit Whoop en base : borne de l'agenda des nuits au-delà de la fenêtre lue ; null sans. */
export async function premiereNuitWhoop(db: Executeur): Promise<number | null> {
  const l = await db.getFirstAsync<{ j: number | null }>("SELECT MIN(jour) AS j FROM whoop_jour WHERE sommeil_min IS NOT NULL", []).catch(() => null);
  return l?.j ?? null;
}

/** La dernière nuit (la plus récente), null sans aucune. */
export function derniereNuit(nuits: ReadonlyMap<number, Nuit>): Nuit | null {
  let d: Nuit | null = null;
  for (const n of nuits.values()) if (!d || n.jour > d.jour) d = n;
  return d;
}

export interface ResumeSommeil {
  nuit: Nuit;
  /**
   * Besoin de la nuit et dette de sommeil (à rattraper, siestes du jour retirées), calculés par pepfit comme la page
   * Sommeil et la Récupération (lireSommeilDuJour) ; jamais ceux de Whoop. null sous le seuil de précision.
   */
  besoinMin: number | null;
  detteMin: number | null;
  /** Part du besoin dormie (« 76 % de ton besoin »), null sous le seuil : remplace la performance de Whoop. */
  part: number | null;
  /** Les 7 dernières nuits (minutes), aujourd'hui en dernier ; null sans nuit. */
  sept: (number | null)[];
  moyenneSept: number | null;
  objectif: number;
}

/** Résumé pour les cartes (Accueil demie et pleine, case Sommeil de la page Santé) ; null sans nuit dans les 36 h. */
export async function lireResumeSommeil(db: Executeur, maintenant = Date.now()): Promise<ResumeSommeil | null> {
  const auj = minuit(maintenant);
  const d = await lireSommeil(db, decaler(auj, -7), maintenant);
  const nuit = derniereNuit(d.nuits);
  if (!nuit || maintenant - nuit.fin > 36 * 3_600_000) return null;
  const sept = Array.from({ length: 7 }, (_, i) => d.nuits.get(decaler(auj, i - 6))?.sommeilMin ?? null);
  const v = sept.filter((x): x is number => x != null && x > 0);
  const s = await lireSommeilDuJour(db, nuit.jour, d.nuits, maintenant);
  return {
    nuit,
    besoinMin: s.matin.besoin.chiffre ? s.matin.besoin.total : null,
    detteMin: s.dette.chiffre ? arrondiDette(s.dette.aRattraper) : null,
    part: partBesoin(nuit.sommeilMin, s.matin),
    sept,
    moyenneSept: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
    objectif: d.objectif,
  };
}

/**
 * La dette et le besoin de la nuit d'un jour (minuit), calculés par pepfit comme la Récupération (planche sommeil, D1, D18),
 * avec les siestes du jour et le coucher conseillé. `nuits` : celles déjà lues par la page (sinon les 7 nuits sont relues,
 * pour les couchers).
 */
export async function lireSommeilDuJour(db: Executeur, jour: number, nuits?: ReadonlyMap<number, Nuit>, maintenant = Date.now()): Promise<SommeilDuJour> {
  const [d, lues] = await Promise.all([
    lireDonneesRecup(db, jour, jour),
    nuits ? Promise.resolve(nuits) : lireSommeil(db, decaler(jour, -(RECUP.dette.fenetre - 1)), maintenant).then((x) => x.nuits),
  ]);
  const iso = isoJour(jour);
  const sept = Array.from({ length: RECUP.dette.fenetre }, (_, i) => lues.get(decaler(jour, -i)));
  return sommeilDuJour(sommeilDuMatin(iso, d), nuitsDette(iso, d, RECUP.dette.fenetre + 1), {
    objectif: d.objectifSommeil,
    siestesJour: Math.max(0, d.siestes?.get(iso) ?? 0),
    couchers: sept.map((n) => (n ? versStat(n).coucher : null)),
    bracelet: sept.some((n) => n?.source === "whoop"),
  });
}
