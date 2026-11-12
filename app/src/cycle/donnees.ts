// Le suivi du cycle en base (planche cycle, NOTES § 2) : les jours de règles dans cycle_jour (migration 58, synchronisée et
// chiffrée de bout en bout), les réglages du suivi, la saisie, la lecture de Santé Connect. Rien d'autre n'est stocké : la
// phase, les statistiques et la prévision se recalculent par cycle/modele.ts.
//
// Règles :
// - une saisie l'emporte sur Santé Connect pour le même jour (la personne corrige) : une lecture de Santé Connect ne réécrit
//   jamais un jour saisi, ici comme à la synchro (sync/schema.ts, garderSaisieCycle) ;
// - suivi allumé par défaut si le profil dit « f », éteint sinon ; un choix explicite l'emporte et ne change plus avec le sexe ;
// - jamais lu par le Fil, ni par les coachs, ni par l'IA sans le droit « cycle » (tests/cycle-garde.test.ts).
import type { Executeur } from "../db/executeur";
import { transaction } from "../db/exclusif";
import { nouvelId } from "../db/id";
import { lireReglage, ecrireReglage } from "../db/depots/reglages";
import { CYCLE, etatCycle, plus, type EtatCycle, type Flux, type JourCycle, type ParamsCycle, type SourceCycle } from "./modele";

const deux = (n: number) => String(n).padStart(2, "0");
/** AAAA-MM-JJ local d'un instant. */
export const isoLocal = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
};
/** Minuit local d'un « AAAA-MM-JJ ». */
export const minuitDeIso = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getTime();

// ---------------------------------------------------------------- réglages (NOTES § 2.2, synchronisés)

export const REGLAGES_CYCLE = {
  suivi: "cycle_suivi",
  santeConnect: "cycle_sante_connect",
  recup: "cycle_recup",
  poids: "cycle_poids",
  prevision: "cycle_prevision",
  mentionEffort: "cycle_mention_effort",
  /** Le rappel « Tes règles sont-elles arrivées ? » : propre à ce téléphone, ne voyage pas (absent de REGLAGES_SYNC). */
  rappel: "cycle_rappel_regles",
} as const;

export interface ReglagesCycle {
  /** Le suivi est allumé (choix explicite, sinon d'après le sexe). */
  suivi: boolean;
  /** Un choix explicite a été fait (« oui » ou « non ») ; sinon le suivi suit le sexe du profil. */
  explicite: boolean;
  /** Allumé parce que le profil dit « Femme » (la ligne « proposé car ton profil indique « Femme » »). */
  propose: boolean;
  santeConnect: boolean;
  recup: boolean;
  poids: boolean;
  prevision: boolean;
  mentionEffort: boolean;
  /** Le rappel des règles, notification locale de ce téléphone (allumé par défaut, seulement si le suivi l'est). */
  rappel: boolean;
}

export const REGLAGES_CYCLE_ETEINTS: ReglagesCycle = { suivi: false, explicite: false, propose: false, santeConnect: false, recup: false, poids: false, prevision: false, mentionEffort: false, rappel: false };

/** Les réglages du suivi : chaque usage vaut « oui » sauf s'il est coupé ; éteint, aucun usage ne vaut. */
export async function lireReglagesCycle(db: Executeur): Promise<ReglagesCycle> {
  const cles = [...Object.values(REGLAGES_CYCLE), "sexe"];
  const l = await db.getAllAsync<{ cle: string; valeur: string }>(`SELECT cle, valeur FROM reglages WHERE cle IN (${cles.map(() => "?").join(", ")})`, cles).catch(() => []);
  const v = new Map(l.map((x) => [x.cle, x.valeur]));
  const choix = v.get(REGLAGES_CYCLE.suivi);
  const explicite = choix === "oui" || choix === "non";
  const femme = v.get("sexe") === "f";
  const suivi = explicite ? choix === "oui" : femme;
  const oui = (c: string) => suivi && v.get(c) !== "non";
  return {
    suivi,
    explicite,
    propose: !explicite && femme,
    santeConnect: oui(REGLAGES_CYCLE.santeConnect),
    recup: oui(REGLAGES_CYCLE.recup),
    poids: oui(REGLAGES_CYCLE.poids),
    prevision: oui(REGLAGES_CYCLE.prevision),
    mentionEffort: oui(REGLAGES_CYCLE.mentionEffort),
    rappel: oui(REGLAGES_CYCLE.rappel),
  };
}

export const ecrireReglageCycle = (db: Executeur, cle: keyof typeof REGLAGES_CYCLE, oui: boolean) => ecrireReglage(db, REGLAGES_CYCLE[cle], oui ? "oui" : "non");

// ---------------------------------------------------------------- lecture

interface LigneCycle {
  id: string;
  jour: string;
  flux: number | null;
  fin: number;
  energie: number | null;
  humeur: number | null;
  gene: number | null;
  source: SourceCycle;
  hc_id: string | null;
  ordre: number;
}

const deLigne = (l: LigneCycle): JourCycle => ({
  jour: l.jour,
  flux: l.flux == null ? null : (l.flux as Flux),
  fin: !!l.fin,
  energie: (l.energie as JourCycle["energie"]) ?? null,
  humeur: (l.humeur as JourCycle["humeur"]) ?? null,
  gene: (l.gene as JourCycle["gene"]) ?? null,
  source: l.source,
});

/** Tous les jours notés, du plus ancien au plus récent (une ligne par jour : quelques centaines au plus). */
export async function lireJoursCycle(db: Executeur): Promise<JourCycle[]> {
  const l = await db.getAllAsync<LigneCycle>("SELECT * FROM cycle_jour ORDER BY jour", []).catch((): LigneCycle[] => []);
  return l.map(deLigne);
}

/** Le jour noté `jour`, null s'il n'y a rien. */
export async function lireJourCycle(db: Executeur, jour: string): Promise<JourCycle | null> {
  const l = await db.getFirstAsync<LigneCycle>("SELECT * FROM cycle_jour WHERE jour = ?", [jour]).catch(() => null);
  return l ? deLigne(l) : null;
}

export interface DonneesCycle {
  reglages: ReglagesCycle;
  jours: JourCycle[];
  etat: EtatCycle;
}

/** Ce que montrent les écrans pour un jour (« AAAA-MM-JJ ») ; suivi éteint : null. */
export async function lireCycle(db: Executeur, date: string, maintenant = Date.now(), p: ParamsCycle = CYCLE): Promise<DonneesCycle | null> {
  const reglages = await lireReglagesCycle(db);
  if (!reglages.suivi) return null;
  const jours = await lireJoursCycle(db);
  return { reglages, jours, etat: etatCycle(jours, date, isoLocal(maintenant), p) };
}

// ---------------------------------------------------------------- écriture (saisie)

/** « ordre » de la fusion des doublons (sync/schema.ts) : la saisie avant Santé Connect, puis la plus ancienne. */
const ordreDe = (source: SourceCycle, t: number) => (source === "saisie" ? 0 : 1e13) + t;

/** Écrit (ou met à jour) la ligne d'un jour, sans toucher à ce qui n'est pas donné. */
async function ecrireJour(db: Executeur, jour: string, champs: Partial<Omit<LigneCycle, "id" | "jour" | "ordre">>, maintenant: number, auteur = "moi"): Promise<void> {
  const ex = await db.getFirstAsync<LigneCycle>("SELECT * FROM cycle_jour WHERE jour = ?", [jour]);
  const source = champs.source ?? ex?.source ?? "saisie";
  const l = {
    flux: ex?.flux ?? null,
    fin: ex?.fin ?? 0,
    energie: ex?.energie ?? null,
    humeur: ex?.humeur ?? null,
    gene: ex?.gene ?? null,
    hc_id: ex?.hc_id ?? null,
    // « undefined » : ne pas toucher ; null : effacer
    ...Object.fromEntries(Object.entries(champs).filter(([, v]) => v !== undefined)),
    source,
  };
  // une ligne sans règles ni notes n'a plus de raison d'être
  if (l.flux == null && l.energie == null && l.humeur == null && l.gene == null) {
    if (ex) await db.runAsync("DELETE FROM cycle_jour WHERE id = ?", [ex.id]);
    return;
  }
  if (ex) {
    if (ex.flux === l.flux && ex.fin === l.fin && ex.energie === l.energie && ex.humeur === l.humeur && ex.gene === l.gene && ex.source === l.source && ex.hc_id === l.hc_id) return;
    await db.runAsync("UPDATE cycle_jour SET flux = ?, fin = ?, energie = ?, humeur = ?, gene = ?, source = ?, hc_id = ?, ordre = ?, auteur = ?, maj_le = ? WHERE id = ?", [
      l.flux, l.fin, l.energie, l.humeur, l.gene, l.source, l.hc_id, ex.source === l.source ? ex.ordre : ordreDe(source, maintenant), auteur, maintenant, ex.id,
    ]);
  } else {
    await db.runAsync(
      "INSERT INTO cycle_jour (id, jour, flux, fin, energie, humeur, gene, source, hc_id, ordre, auteur, maj_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [nouvelId(), jour, l.flux, l.fin, l.energie, l.humeur, l.gene, l.source, l.hc_id, ordreDe(source, maintenant), auteur, maintenant],
    );
  }
}

export interface SaisieRegles {
  debut: string;
  /** Dernier jour, null : « Pas encore » (les jours jusqu'à aujourd'hui sont notés, l'épisode reste ouvert). */
  fin: string | null;
  /** Intensité de tous les jours notés : 1 légères, 2 moyennes, 3 abondantes ; 0 sans intensité. */
  flux: Flux;
  /** Notes facultatives du jour de début (« Comment tu te sens »). */
  notes?: Partial<Pick<JourCycle, "energie" | "humeur" | "gene">>;
  /** Épisode corrigé (la liste ou le calendrier) : ses anciens jours hors de la nouvelle plage perdent leurs règles. */
  remplace?: { debut: string; fin: string } | null;
}

/** Note des règles (la feuille « Noter tes règles ») : chaque jour de début à fin, saisi, le dernier marqué comme fin. */
export async function noterRegles(db: Executeur, s: SaisieRegles, maintenant = Date.now(), auteur = "moi"): Promise<void> {
  const auj = isoLocal(maintenant);
  const fin = s.fin ?? (s.debut > auj ? s.debut : auj);
  if (fin < s.debut) throw new Error("fin avant le début");
  await transaction(db, async (db) => {
    if (s.remplace) {
      for (let d = s.remplace.debut; d <= s.remplace.fin; d = plus(d, 1)) if (d < s.debut || d > fin) await ecrireJour(db, d, { flux: null, fin: 0 }, maintenant, auteur);
    }
    for (let d = s.debut; d <= fin; d = plus(d, 1)) {
      await ecrireJour(db, d, { flux: s.flux, fin: s.fin != null && d === fin ? 1 : 0, source: "saisie", ...(d === s.debut ? s.notes ?? {} : {}) }, maintenant, auteur);
    }
    // le jour qui suit une fin notée n'est plus dans l'épisode : rien à faire, l'épisode se ferme sur la marque
  });
}

/** Les notes facultatives d'un jour (énergie, humeur, gêne), avec ou sans règles ; null efface la note. */
export async function noterJour(db: Executeur, jour: string, notes: Partial<Pick<JourCycle, "energie" | "humeur" | "gene">>, maintenant = Date.now(), auteur = "moi"): Promise<void> {
  await transaction(db, (db) => ecrireJour(db, jour, { ...notes, source: "saisie" }, maintenant, auteur));
}

/** Retire les règles d'un épisode (les notes du jour restent). */
export async function retirerRegles(db: Executeur, debut: string, fin: string, maintenant = Date.now(), auteur = "moi"): Promise<void> {
  await transaction(db, async (db) => {
    for (let d = debut; d <= fin; d = plus(d, 1)) await ecrireJour(db, d, { flux: null, fin: 0, source: "saisie" }, maintenant, auteur);
  });
}

/** « Effacer l'historique du cycle » : toutes les lignes, ici et (par la synchro) sur les autres appareils. */
export async function effacerCycle(db: Executeur): Promise<number> {
  const r = await db.runAsync("DELETE FROM cycle_jour", []);
  return Number((r as { changes?: number } | undefined)?.changes ?? 0);
}

// ---------------------------------------------------------------- Santé Connect (NOTES § 2.1, D7)

/** Une période de règles de Santé Connect (MenstruationPeriodRecord) et un jour de flux (MenstruationFlowRecord). */
export interface ReglesSante {
  periodes: { debut: number; fin: number; id: string }[];
  flux: { date: number; flux: number; id: string }[];
}

/** Flux de Santé Connect (FLOW_UNKNOWN 0 à FLOW_HEAVY 3) ; une valeur inconnue vaut 0. */
const fluxDe = (n: number): Flux => (n === 1 || n === 2 || n === 3 ? n : 0);

/**
 * Les jours lus dans Santé Connect : une période donne des jours à flux 0 (le dernier marqué comme fin), un relevé de flux
 * donne son jour et son intensité. Un jour saisi n'est jamais réécrit ; un jour déjà lu (même identifiant) n'est réécrit que
 * s'il a changé. Renvoie le nombre de jours écrits.
 */
export async function importerReglesSante(db: Executeur, r: ReglesSante, maintenant = Date.now()): Promise<number> {
  const jours = new Map<string, { flux: Flux; fin: number; hc: string }>();
  for (const p of r.periodes) {
    if (!(p.fin >= p.debut)) continue;
    const a = isoLocal(p.debut);
    const b = isoLocal(Math.max(p.debut, p.fin - 1));
    // au plus 31 jours (la limite de Santé Connect pour une période)
    for (let d = a, n = 0; d <= b && n < 31; d = plus(d, 1), n++) jours.set(d, { flux: jours.get(d)?.flux ?? 0, fin: d === b ? 1 : 0, hc: p.id });
  }
  for (const f of r.flux) {
    const d = isoLocal(f.date);
    jours.set(d, { flux: fluxDe(f.flux), fin: jours.get(d)?.fin ?? 0, hc: f.id });
  }
  if (!jours.size) return 0;
  let n = 0;
  await transaction(db, async (db) => {
    for (const [d, x] of [...jours].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const ex = await db.getFirstAsync<LigneCycle>("SELECT * FROM cycle_jour WHERE jour = ?", [d]);
      if (ex?.source === "saisie" && ex.flux != null) continue;
      if (ex && ex.flux === x.flux && ex.fin === x.fin && ex.hc_id === x.hc && ex.source === "sante_connect") continue;
      // un jour de notes seules saisi garde ses notes, prend les règles de Santé Connect et reste « saisie »
      await ecrireJour(db, d, { flux: x.flux, fin: x.fin, hc_id: x.hc, source: ex?.source === "saisie" ? "saisie" : "sante_connect" }, maintenant);
      n++;
    }
  });
  return n;
}

/** Lecture de Santé Connect sur une plage (sante.regles) : null sans autorisation. */
export type LireReglesSante = (debut: number, fin: number) => Promise<ReglesSante | null>;

/** Jours relus dans Santé Connect : un an (Santé Connect ne rend que 30 jours avant la première autorisation, D7). */
export const JOURS_SANTE_CYCLE = 400;
let derniere: { db: Executeur | null; t: number } = { db: null, t: 0 };

/**
 * Relit Santé Connect si le suivi et la source sont allumés (au plus une fois par heure) ; jamais de demande d'autorisation ici
 * (elle se fait au bon moment, depuis la page Cycle ou ses réglages). Renvoie le nombre de jours écrits.
 */
export async function assurerCycleSante(db: Executeur, lire: LireReglesSante | null | undefined, maintenant = Date.now(), force = false): Promise<number> {
  if (!lire) return 0;
  if (!force && derniere.db === db && maintenant - derniere.t < 3_600_000) return 0;
  const r = await lireReglagesCycle(db);
  if (!r.santeConnect) return 0;
  derniere = { db, t: maintenant };
  const l = await lire(maintenant - JOURS_SANTE_CYCLE * 86_400_000, maintenant).catch(() => null);
  return l ? importerReglesSante(db, l, maintenant) : 0;
}

/** Pour les tests : oublie la dernière lecture. */
export const oublierLectureCycle = () => {
  derniere = { db: null, t: 0 };
};

// ---------------------------------------------------------------- pour les autres calculs

/**
 * Les jours de règles pour la Récupération et le poids : seulement si le suivi est allumé et l'usage demandé (« cycle_recup »,
 * « cycle_poids »). null sinon : rien n'est ajusté.
 */
export async function joursPourUsage(db: Executeur, usage: "recup" | "poids" | "mentionEffort" | "prevision"): Promise<JourCycle[] | null> {
  const r = await lireReglagesCycle(db);
  if (!r[usage]) return null;
  const j = await lireJoursCycle(db);
  return j.length ? j : null;
}

/** La mention de l'Effort (planche cycle, écran 8, D9) : vrai si ce jour est en seconde moitié estimée et la mention allumée. */
export async function mentionEffort(db: Executeur, jour: string, maintenant = Date.now()): Promise<boolean> {
  const jours = await joursPourUsage(db, "mentionEffort").catch(() => null);
  if (!jours) return false;
  return etatCycle(jours, jour, isoLocal(maintenant)).phase?.nom === "seconde";
}
