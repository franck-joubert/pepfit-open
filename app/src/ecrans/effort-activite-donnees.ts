// L'activité de chaque journée hors séances, en base (docs/EFFORT-ACTIVITE.md) : sa charge brute dans jour_activite
// (migration 52), jamais le score. Calculs purs : effort-activite.ts.
//
// Les mesures, sans jamais compter deux fois une séance notée (ses minutes et ses pas sont dans sa charge) :
// - FC de la journée : Santé Connect ; les échantillons pris pendant une séance sont retirés ;
// - pas : la règle commune (pas-source.ts) : Whoop si le journal gardé a le jour (son total, moins les pas connus de chaque séance : sans les
//   pas d'une séance, le hors séances est inconnu, jamais un prorata, 08/11) ; sinon Santé Connect, heure par heure, les bornes
//   des séances ajoutées aux bornes des heures (une tranche est dedans ou dehors, et celles du dedans sont retirées).
//
// Recalcul : une journée finie depuis plus de 36 h n'est relue que si ce qui a servi change (empreinte : version, zones de FC,
// séances du jour, total Whoop, sources branchées) ; la veille et le jour le sont à chaque passe (les pas arrivent tard).
// Une journée mesurée plus finement (FC, puis pas heure par heure, puis total) n'est jamais remplacée par plus grossier.
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { lireZonesFc } from "../db/depots/zones-fc";
import {
  bornesTranches, CHARGE_ACTIVITE, chargeActivite, minutesHors, pasHorsSeancesTotal, tranchesHorsSeances, zonesHorsSeances,
  type ChargeActivite, type MethodeActivite,
} from "./effort-activite";
import { FC_TARDIVE_MS, plagesSeances, type PlageSeance } from "./effort-charges";
import { COURBE_EFFORT, scoreEffort, type CourbeEffort } from "./effort-pepfit";
import { bornesDe } from "./zones-fc";

type Fc = readonly { t: number; bpm: number }[];

export interface DepsActivite {
  /** Pas Santé Connect de chaque tranche [bornes[i], bornes[i+1][ (sante.pasIntervalles) ; absent : pas de Santé Connect. */
  pasSante?: ((bornes: number[]) => Promise<(number | null)[] | null>) | null;
  /** FC Santé Connect d'une plage. */
  fcSante?: ((debut: number, fin: number) => Promise<Fc | null>) | null;
  maintenant?: number;
}

export type SourcePasActivite = "whoop" | "sante";
export type SourceFcActivite = "whoop" | "sante";

/** L'activité d'un jour, comme on la lit. */
export interface ActiviteJour {
  jour: number;
  charge: number;
  methode: MethodeActivite;
  pas: number | null;
  heures: boolean;
  zones?: number[];
  sourcePas: SourcePasActivite | null;
  sourceFc: SourceFcActivite | null;
  /** Le score de l'activité seule (non arrondi). */
  score: number;
}

interface Ligne {
  jour: string;
  charge: number;
  methode: MethodeActivite;
  pas: number | null;
  heures: number;
  zones: string | null;
  source_pas: SourcePasActivite | null;
  source_fc: SourceFcActivite | null;
  rang: number;
  version: number;
  empreinte: string;
}

/** Journées vides (aucune mesure) déjà lues, par empreinte : réglage local, pour ne pas les relire à chaque passe. */
const REGLAGE_VIDES = "effort_activite_vides";
/** Jours relus par le recalcul de fond (la cible regarde 120 jours en arrière). */
export const JOURS_ACTIVITE = 120;

const deux = (n: number) => String(n).padStart(2, "0");
/** AAAA-MM-JJ local d'un instant. */
export const isoJour = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
};
const minuitIso = (iso: string) => {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, j!).getTime();
};
const lendemain = (jour: number) => {
  const d = new Date(jour);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};
/** Bornes des heures de [jour, fin] (justes aux changements d'heure), la dernière à `fin`. */
const heuresJusqua = (jour: number, fin: number) => {
  const d = new Date(jour);
  const l: number[] = [];
  for (let h = 0; ; h++) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
    if (t >= fin) break;
    l.push(t);
  }
  l.push(fin);
  return l;
};

const deLigne = (l: Ligne, courbe: CourbeEffort): ActiviteJour => {
  let zones: number[] | undefined;
  try {
    zones = l.zones ? (JSON.parse(l.zones) as number[]) : undefined;
  } catch {
    zones = undefined;
  }
  return {
    jour: minuitIso(l.jour),
    charge: l.charge,
    methode: l.methode,
    pas: l.pas,
    heures: l.heures === 1,
    ...(zones ? { zones } : {}),
    sourcePas: l.source_pas,
    sourceFc: l.source_fc,
    score: scoreEffort(l.charge, courbe),
  };
};

/** L'activité de chaque jour de [debut, fin[ (minuits) déjà calculée : lecture en base seule. */
export async function activitesEntre(db: Executeur, debut: number, fin: number, courbe: CourbeEffort = COURBE_EFFORT): Promise<Map<number, ActiviteJour>> {
  const l = await db.getAllAsync<Ligne>("SELECT * FROM jour_activite WHERE jour >= ? AND jour < ? ORDER BY jour", [isoJour(debut), isoJour(fin)]).catch((): Ligne[] => []);
  return new Map(l.map((x) => [minuitIso(x.jour), deLigne(x, courbe)]));
}

/** L'activité d'un jour (minuit), null sans mesure. */
export async function activiteJour(db: Executeur, jour: number, courbe: CourbeEffort = COURBE_EFFORT): Promise<ActiviteJour | null> {
  return (await activitesEntre(db, jour, lendemain(jour), courbe)).get(jour) ?? null;
}

interface Contexte {
  maintenant: number;
  ref: Awaited<ReturnType<typeof lireZonesFc>>;
  cleZones: string;
}

/** Ce qui sert à mesurer un jour sans rien lire de Santé Connect ni de Whoop : l'empreinte de base. */
async function base(db: Executeur, jour: number, deps: DepsActivite, cx: Contexte) {
  const fin = Math.min(lendemain(jour), cx.maintenant);
  const plages = (await plagesSeances(db, jour, lendemain(jour))).filter((p) => p.compte);
  // les pas Whoop gardés dans le journal (sauvegarde relue) restent ceux du jour
  const w = await db.getFirstAsync<{ pas: number | null }>("SELECT w.pas FROM whoop_jour w WHERE w.jour = ?", [jour]).catch(() => null);
  const pasWhoop = w?.pas ?? null;
  const recente = lendemain(jour) > cx.maintenant - FC_TARDIVE_MS;
  const sources = [deps.pasSante ? "p" : "", deps.fcSante ? "f" : ""].join("");
  // les pas des séances (détail Whoop gardé dans le journal) font partie de l'empreinte
  const connus = pasWhoop != null ? await pasSeancesWhoop(db, plages) : new Map<string, number>();
  const pasSeances = plages.map((p) => connus.get(p.id) ?? "-").join(",");
  const empreinte = [CHARGE_ACTIVITE.version, cx.cleZones, plages.map((p) => `${p.debut}-${p.fin}`).join(","), pasWhoop ?? "-", pasSeances, sources].join("|");
  return { fin, plages, pasWhoop, recente, empreinte, connus };
}

/**
 * Le jour a un total de pas (Whoop) mais pas ceux d'une séance : le hors séances est inconnu et l'activité du jour n'est pas
 * calculée (lecture en base seule ; la ligne « Pas des séances indisponibles » de l'Effort du jour).
 */
export async function pasSeancesIndisponibles(db: Executeur, jour: number): Promise<boolean> {
  const plages = (await plagesSeances(db, jour, lendemain(jour))).filter((p) => p.compte);
  if (!plages.length) return false;
  const w = await db.getFirstAsync<{ pas: number | null }>("SELECT w.pas FROM whoop_jour w WHERE w.jour = ?", [jour]).catch(() => null);
  if (w?.pas == null) return false;
  const connus = await pasSeancesWhoop(db, plages);
  return plages.some((p) => !connus.has(p.id));
}

async function pasSeancesWhoop(db: Executeur, plages: readonly PlageSeance[]): Promise<Map<string, number>> {
  if (!plages.length) return new Map();
  const l = await db
    .getAllAsync<{ seance_id: string; pas: number }>(
      `SELECT w.seance_id, MAX(d.pas) AS pas FROM whoop_seance w JOIN whoop_seance_detail d ON d.whoop_id = w.id
       WHERE d.pas IS NOT NULL AND w.seance_id IN (${plages.map(() => "?").join(",")}) GROUP BY w.seance_id`,
      plages.map((p) => p.id),
    )
    .catch(() => []);
  return new Map(l.map((x) => [x.seance_id, x.pas]));
}

/** Mesure un jour : la FC (Santé Connect), les pas (Whoop au total gardé, sinon Santé Connect heure par heure). */
async function mesurer(db: Executeur, jour: number, deps: DepsActivite, cx: Contexte, b: Awaited<ReturnType<typeof base>>) {
  const periode = { debut: jour, fin: b.fin };
  const hors = minutesHors(jour, b.fin, b.plages);
  let fc: { zones: number[]; couvertes: number } | null = null;
  let sourceFc: SourceFcActivite | null = null;
  const lecteurs: [SourceFcActivite, DepsActivite["fcSante"]][] = [["sante", deps.fcSante]];
  for (const [src, lire] of lecteurs) {
    if (!lire) continue;
    const l = await lire(jour, b.fin).catch(() => null);
    if (!l || l.length < 2) continue;
    const z = zonesHorsSeances(l, periode, b.plages, cx.ref);
    if (!fc || z.couvertes > fc.couvertes) {
      fc = z;
      sourceFc = src;
    }
    if (z.couvertes >= CHARGE_ACTIVITE.couvertureFc * hors) break;
  }
  let tranches: { minutes: number; pas: number }[] | null = null;
  let pasTotal: number | null = null;
  let sourcePas: SourcePasActivite | null = null;
  if (b.pasWhoop != null) {
    // une séance sans pas mesurés : pasTotal reste null (hors séances inconnu), la FC de la journée peut encore mesurer
    pasTotal = pasHorsSeancesTotal(b.pasWhoop, b.plages.map((p) => ({ pas: b.connus.get(p.id) ?? null })));
    if (pasTotal != null) sourcePas = "whoop";
  } else if (deps.pasSante) {
    const bornes = bornesTranches(heuresJusqua(jour, b.fin), b.plages);
    const pas = bornes.length >= 2 ? await deps.pasSante(bornes).catch(() => null) : null;
    if (pas) {
      tranches = tranchesHorsSeances({ bornes, pas }, b.plages);
      if (tranches) sourcePas = "sante";
    }
  }
  const c = chargeActivite({ fc, minutesHors: hors, tranches, pasTotal });
  return { c, sourcePas: c ? sourcePas : null, sourceFc: c?.methode === "fc" ? sourceFc : null };
}

async function contexte(db: Executeur, maintenant: number): Promise<Contexte> {
  const ref = await lireZonesFc(db, maintenant);
  return { maintenant, ref, cleZones: bornesDe(ref).join(",") };
}

async function lireVides(db: Executeur): Promise<Record<string, string>> {
  try {
    const v = JSON.parse((await lireReglage(db, REGLAGE_VIDES)) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Calcule et écrit l'activité d'un jour, si c'est utile. `vides` : les journées sans mesure déjà lues (modifié en place).
 * Vrai si la ligne a été écrite.
 */
async function assurerJour(db: Executeur, jour: number, deps: DepsActivite, cx: Contexte, vides: Record<string, string>): Promise<boolean> {
  if (jour >= cx.maintenant) return false;
  const iso = isoJour(jour);
  const b = await base(db, jour, deps, cx);
  const avant = await db.getFirstAsync<Ligne>("SELECT * FROM jour_activite WHERE jour = ?", [iso]);
  // Ligne écrite par des paramètres plus récents (un autre appareil à jour) : elle reste.
  if (avant && avant.version > CHARGE_ACTIVITE.version) return false;
  if (!b.recente && (avant ? avant.empreinte.startsWith(b.empreinte) : vides[iso] === b.empreinte)) return false;
  const m = await mesurer(db, jour, deps, cx, b);
  if (!m.c) {
    vides[iso] = b.empreinte;
    // Une ligne calculée avec des paramètres plus anciens (prorata) ne reste pas : sans mesure, pas d'activité
    if (avant && avant.version < CHARGE_ACTIVITE.version) await db.runAsync("DELETE FROM jour_activite WHERE jour = ?", [iso]);
    return false;
  }
  delete vides[iso];
  const c: ChargeActivite = m.c;
  // Une journée mesurée plus finement (sur cet appareil ou un autre) n'est pas remplacée par plus grossier.
  if (avant && avant.version === CHARGE_ACTIVITE.version && avant.rang > c.rang) return false;
  const zones = c.zones ? JSON.stringify(c.zones.map((z) => Math.round(z * 10) / 10)) : null;
  const empreinte = `${b.empreinte}|${c.rang}`;
  if (avant && avant.empreinte === empreinte && Math.abs(avant.charge - c.charge) < 1e-9 && avant.pas === c.pas && avant.zones === zones) return false;
  await db.runAsync(
    `INSERT INTO jour_activite (jour, charge, methode, pas, heures, zones, source_pas, source_fc, rang, version, empreinte, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(jour) DO UPDATE SET charge = excluded.charge, methode = excluded.methode, pas = excluded.pas, heures = excluded.heures,
       zones = excluded.zones, source_pas = excluded.source_pas, source_fc = excluded.source_fc, rang = excluded.rang,
       version = excluded.version, empreinte = excluded.empreinte, maj_le = excluded.maj_le`,
    [iso, c.charge, c.methode, c.pas, c.heures ? 1 : 0, zones, m.sourcePas, m.sourceFc, c.rang, CHARGE_ACTIVITE.version, empreinte, cx.maintenant],
  );
  return true;
}

/** Calcule l'activité d'un jour (la page Effort, en arrivant sur aujourd'hui ou hier), puis la renvoie. */
export async function assurerActiviteJour(db: Executeur, jour: number, deps: DepsActivite = {}, courbe: CourbeEffort = COURBE_EFFORT): Promise<ActiviteJour | null> {
  const cx = await contexte(db, deps.maintenant ?? Date.now());
  const vides = await lireVides(db);
  await assurerJour(db, jour, deps, cx, vides);
  return activiteJour(db, jour, courbe);
}

let enCours: Promise<{ calculees: number }> | null = null;

/**
 * Recalcule l'activité des JOURS_ACTIVITE derniers jours (au lancement, en fond) : les plus récents d'abord, une pause tous
 * les 10 jours. Une seule passe à la fois : un second appel rejoint la première.
 */
export function recalculerActivite(db: Executeur, deps: DepsActivite = {}, jours = JOURS_ACTIVITE): Promise<{ calculees: number }> {
  enCours ??= (async () => {
    try {
      const maintenant = deps.maintenant ?? Date.now();
      const cx = await contexte(db, maintenant);
      const vides = await lireVides(db);
      const avant = JSON.stringify(vides);
      const d = new Date(maintenant);
      let calculees = 0;
      for (let i = 0; i < jours; i++) {
        if (i > 0 && i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
        const jour = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime();
        if (await assurerJour(db, jour, deps, cx, vides)) calculees++;
      }
      // les journées vides de plus de JOURS_ACTIVITE jours ne servent plus
      const limite = isoJour(new Date(d.getFullYear(), d.getMonth(), d.getDate() - jours).getTime());
      for (const k of Object.keys(vides)) if (k < limite) delete vides[k];
      if (JSON.stringify(vides) !== avant) await ecrireReglage(db, REGLAGE_VIDES, JSON.stringify(vides));
      return { calculees };
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}
