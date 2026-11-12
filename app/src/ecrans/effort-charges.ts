// La charge brute de chaque séance (Effort pepfit, planche effort-pepfit, NOTES § 4) : calculée depuis la FC enregistrée de
// la séance, toutes sources (capteur en direct, Whoop en FC, Santé Connect), sinon le ressenti, sinon le barème
// (effort-pepfit.ts), et gardée dans seance_charge (migration 50). Jamais le score : il se calcule à la lecture, par la courbe.
//
// Recalcul : une séance est recalculée quand ce qui a servi change (son empreinte : version des paramètres, zones de FC,
// sport, durée, ressenti des séries, FC en base). L'affichage d'un jour s'en assure pour ses séances (base seule, rapide) ;
// les plages (cible, semaine, historique) ne calculent que les séances encore sans charge. recalculerCharges, au lancement et
// en fond, passe sur tout l'historique, avec Santé Connect pour les séances sans FC en base.
// Whoop : sa FC (échantillons de l'API privée, sinon ses minutes par zone) compte comme toute FC ; son score, jamais.
import type { Executeur } from "../db/executeur";
import { lireZonesFc } from "../db/depots/zones-fc";
import { CHARGE_EFFORT, chargeSeance, COURBE_EFFORT, partsSeance, ressentiDeSeance, scoreEffort, type ChargeSeance, type CourbeEffort } from "./effort-pepfit";
import { CHARGE_MUSCU, comptesParSeance, effortSeries, hacher, type CompteSeance, type EffortSeries, type ExoMuscu, type SerieMuscu } from "./effort-muscu";
import { minutesParZone } from "./effort-jour";
import { compteDansEffort, familleDe } from "./familles-sports";
import { bornesDe, type RefZones } from "./zones-fc";
import type { MotEffort } from "../boutique/poids";
import { garderFcMinutes, seancesSansFcGardee } from "./kcal-fc";
import { oublierKcalCapteurs } from "./kcal-comparaison";

const JOUR_MS = 86_400_000;
/** Une séance finie depuis moins de 36 h peut encore recevoir sa FC (Santé Connect, Whoop rangent après coup). */
export const FC_TARDIVE_MS = 36 * 3_600_000;

/** D'où vient la FC d'une séance mesurée à la FC. */
export type SourceFc = "capteur" | "whoop" | "sante";

export interface EffortDeSeance extends ChargeSeance {
  seanceId: string;
  debut: number;
  sourceFc: SourceFc | null;
  /** Le score de la séance seule, par la courbe (non arrondi). */
  score: number;
}

/** Sport d'une séance : sa marque, sinon son premier exercice qui porte un sport ; des exercices sans sport : la muscu. */
const SQL_SEANCES = `SELECT s.id, s.debut, s.fin, s.pause_cumul_s AS pause,
    COALESCE(s.activite_id, (SELECT se.exercice_id FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id
      WHERE se.seance_id = s.id AND (e.whoop_ids IS NOT NULL OR e.id = 'cat:musculation') ORDER BY se.position LIMIT 1)) AS sport
  FROM seances s WHERE s.fin IS NOT NULL`;

interface SeanceBrute {
  id: string;
  debut: number;
  fin: number;
  pause: number | null;
  sport: string | null;
}

interface Ligne {
  seance_id: string;
  charge: number;
  methode: ChargeSeance["methode"];
  estime: number;
  minutes: number;
  zones: string | null;
  ressenti: string | null;
  source_fc: SourceFc | null;
  version: number;
  empreinte: string;
  /** L'appareil qui l'a calculée avait la FC de la séance (migration 51). */
  avec_fc: number;
  /** Points des séries et leur nombre (migration 66) ; null : mesurée sans ses séries. */
  muscu: number | null;
  series: number | null;
}

export interface DepsCharges {
  /** FC de Santé Connect sur une plage (heure murale) ; absent : pas de Santé Connect (affichage, tests). */
  fcSante?: ((debut: number, fin: number) => Promise<readonly { t: number; bpm: number }[] | null>) | null;
  maintenant?: number;
}

/** FC possible : le capteur envoie 0 quand il perd le contact. */
const fcPossible = (bpm: number) => bpm >= 25 && bpm <= 250;
const sportDe = (s: SeanceBrute) => s.sport ?? "cat:musculation";
const minutesDe = (s: SeanceBrute) => Math.max(0, (s.fin - s.debut) / 60_000 - (s.pause ?? 0) / 60);
/** Fin murale : la fin d'une séance ne compte pas ses pauses, l'heure de la FC si (docs/FC-BASSE.md). */
const finMurale = (s: SeanceBrute) => s.fin + (s.pause ?? 0) * 1000;

const zonesDe = (fc: readonly { t: number; bpm: number }[], debut: number, fin: number, ref: RefZones, source: SourceFc) =>
  minutesParZone(
    fc.filter((x) => x.t >= debut && x.t <= fin && fcPossible(x.bpm)).map((x) => ({ s: x.t - debut, bpm: x.bpm })),
    ref,
    CHARGE_EFFORT.trouFcS[source],
  );
const total = (z: readonly number[]) => z.reduce((a, b) => a + b, 0);

/** FC d'une séance : ses minutes par zone et sa source ; `sig` : sa trace ; `points` : ses échantillons sur [debut, fin]
 * (absents : les minutes par zone de Whoop seules), gardés minute par minute pour les kcal (kcal-fc.ts). */
interface FcSeance {
  zones: number[];
  source: SourceFc;
  sig: string;
  points?: { t: number; bpm: number }[];
  debut?: number;
  fin?: number;
}

const pointsDe = (fc: FcSeance | null) => (fc?.points && fc.debut != null && fc.fin != null ? { points: fc.points, debut: fc.debut, fin: fc.fin } : null);

/** La FC en base d'une séance (capteur en direct, sinon Whoop) : ses minutes par zone et sa source ; `sig` : sa trace. */
async function fcEnBase(db: Executeur, s: SeanceBrute, ref: RefZones): Promise<FcSeance | null> {
  const fin = finMurale(s);
  const [propre, w] = await Promise.all([
    db.getAllAsync<{ t: number; bpm: number }>("SELECT t, bpm FROM seance_fc WHERE seance_id = ? ORDER BY t", [s.id]),
    db
      .getFirstAsync<{ debut: number; fin: number; zones: string | null; fc: string | null }>(
        `SELECT w.debut, w.fin, w.zones, d.fc FROM whoop_seance w LEFT JOIN whoop_seance_detail d ON d.whoop_id = w.id
         WHERE w.seance_id = ? ORDER BY w.fin - w.debut DESC LIMIT 1`,
        [s.id],
      )
      .catch(() => null),
  ]);
  const candidats: FcSeance[] = [];
  if (propre.length) candidats.push({ zones: zonesDe(propre, s.debut, fin, ref, "capteur"), source: "capteur", sig: `c${propre.length}:${propre.at(-1)!.t}`, points: propre, debut: s.debut, fin });
  if (w?.fc) {
    try {
      const l = (JSON.parse(w.fc) as [number, number][]).map(([t, bpm]) => ({ t, bpm }));
      if (l.length >= 2) candidats.push({ zones: zonesDe(l, w.debut, w.fin, ref, "whoop"), source: "whoop", sig: `w${l.length}`, points: l, debut: w.debut, fin: w.fin });
    } catch {
      // détail illisible : ses zones, s'il en a
    }
  }
  if (w?.zones && !candidats.some((c) => c.source === "whoop")) {
    try {
      const z = JSON.parse(w.zones) as number[];
      // minutes de Whoop en zones 0 à 5 : la zone 0 (sous 50 %) ne compte pas
      if (Array.isArray(z) && z.length >= 6) candidats.push({ zones: z.slice(1, 6).map((x) => Number(x) || 0), source: "whoop", sig: `wz${z.join(",")}` });
    } catch {
      // zones illisibles : pas de FC Whoop
    }
  }
  if (!candidats.length) return null;
  const minutes = minutesDe(s);
  const sure = candidats.find((c) => total(c.zones) >= CHARGE_EFFORT.fcMinMinutes && total(c.zones) >= CHARGE_EFFORT.couvertureFc * minutes);
  return sure ?? candidats.reduce((a, b) => (total(b.zones) > total(a.zones) ? b : a));
}

async function ressentiEnBase(db: Executeur, seanceId: string): Promise<{ mot: MotEffort | null; sig: string }> {
  const l = await db.getAllAsync<{ rpe: number | null }>(
    "SELECT rpe FROM series WHERE seance_id = ? AND faite = 1 AND type != 'echauffement' AND rpe IS NOT NULL ORDER BY position",
    [seanceId],
  );
  return { mot: ressentiDeSeance(l.map((x) => x.rpe)), sig: l.map((x) => x.rpe).join(",") };
}

// ---------------------------------------------------------------- les séries de la muscu (effort-muscu.ts)

/** Séries de travail faites, avec ce qu'il faut de leur exercice. */
const SQL_SERIES_MUSCU = `SELECT se.seance_id AS seance, s.debut AS date, se.exercice_id AS exo, se.type, se.kg, se.reps, se.rpe,
    se.charge_eff AS chargeEff, se.duree_s AS dureeS, e.nature, e.equipement, e.nom, e.slug, e.muscle
  FROM series se JOIN seances s ON s.id = se.seance_id JOIN exercices e ON e.id = se.exercice_id
  WHERE se.faite = 1 AND se.type != 'echauffement'`;

/** Exercices de musculation des séances (pas leurs sports : ni Whoop ni la marque « Musculation ») : ceux sans série notée. */
const SQL_EXOS_MUSCU = `SELECT se.seance_id AS seance, se.exercice_id AS exo, e.nature, e.equipement, e.nom, e.slug, e.muscle
  FROM seance_exercices se JOIN seances s ON s.id = se.seance_id JOIN exercices e ON e.id = se.exercice_id
  WHERE e.whoop_ids IS NULL AND e.id != 'cat:musculation'`;

/** Ce qu'il faut lire avant une séance : la fenêtre de la référence, et les 7 périodes de l'habitude. */
const PASSE_MS = Math.max(CHARGE_MUSCU.reference.jours, CHARGE_MUSCU.habitude.periode * (CHARGE_MUSCU.habitude.periodes + 1)) * JOUR_MS;

interface ContexteMuscu {
  parSeance: Map<string, SerieMuscu[]>;
  parExo: Map<string, SerieMuscu[]>;
  /** Exercices des séances à calculer (pas de leur passé). */
  exos: Map<string, (ExoMuscu & { seance: string })[]>;
  comptes: CompteSeance[];
}

/**
 * Les séries des séances terminées commencées dans [debut − le passé utile, fin[, lues une fois pour toute une passe (le
 * recalcul de fond n'en fait qu'une lecture) ; `enCours` : une séance pas encore terminée (la fin de séance).
 */
async function contexteMuscu(db: Executeur, debut: number, fin: number, enCours?: string): Promise<ContexteMuscu> {
  type Exo = ExoMuscu & { seance: string };
  const [l, propre, exos] = await Promise.all([
    db.getAllAsync<SerieMuscu>(`${SQL_SERIES_MUSCU} AND s.fin IS NOT NULL AND s.debut >= ? AND s.debut < ? ORDER BY s.debut, se.position`, [debut - PASSE_MS, fin]),
    enCours ? db.getAllAsync<SerieMuscu>(`${SQL_SERIES_MUSCU} AND se.seance_id = ? ORDER BY se.position`, [enCours]) : Promise.resolve([] as SerieMuscu[]),
    enCours
      ? db.getAllAsync<Exo>(`${SQL_EXOS_MUSCU} AND se.seance_id = ? ORDER BY se.position`, [enCours])
      : db.getAllAsync<Exo>(`${SQL_EXOS_MUSCU} AND s.fin IS NOT NULL AND s.debut >= ? AND s.debut < ? ORDER BY se.position`, [debut, fin]),
  ]);
  const parSeance = new Map<string, SerieMuscu[]>();
  const parExo = new Map<string, SerieMuscu[]>();
  for (const s of [...l, ...propre]) {
    (parSeance.get(s.seance) ?? parSeance.set(s.seance, []).get(s.seance)!).push(s);
    (parExo.get(s.exo) ?? parExo.set(s.exo, []).get(s.exo)!).push(s);
  }
  const parSeanceExos = new Map<string, Exo[]>();
  for (const e of exos) (parSeanceExos.get(e.seance) ?? parSeanceExos.set(e.seance, []).get(e.seance)!).push(e);
  return { parSeance, parExo, exos: parSeanceExos, comptes: comptesParSeance(l) };
}

/** L'effort des séries d'une séance face à son passé (ses exercices sans série notée, prudemment) ; null sans séries de force. */
function seriesDe(ctx: ContexteMuscu, seanceId: string, debut: number): EffortSeries | null {
  const propres = ctx.parSeance.get(seanceId);
  if (!propres?.length) return null;
  const passe = [...new Set(propres.map((s) => s.exo))].flatMap((exo) => ctx.parExo.get(exo) ?? []).filter((s) => s.seance !== seanceId);
  return effortSeries(propres, passe, debut, ctx.comptes, ctx.exos.get(seanceId) ?? []);
}

const lireLignes = async (db: Executeur, ids: readonly string[]): Promise<Map<string, Ligne>> => {
  const out = new Map<string, Ligne>();
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const l = await db.getAllAsync<Ligne>(`SELECT * FROM seance_charge WHERE seance_id IN (${part.map(() => "?").join(",")})`, part);
    for (const x of l) out.set(x.seance_id, x);
  }
  return out;
};

const deLigne = (l: Ligne, debut: number, courbe: CourbeEffort): EffortDeSeance => {
  let zones: number[] | undefined;
  try {
    zones = l.zones ? (JSON.parse(l.zones) as number[]) : undefined;
  } catch {
    zones = undefined;
  }
  return {
    seanceId: l.seance_id,
    debut,
    charge: l.charge,
    methode: l.methode,
    estime: l.estime === 1,
    minutes: l.minutes,
    ...(zones ? { zones } : {}),
    ...(l.ressenti ? { ressenti: l.ressenti as MotEffort } : {}),
    ...(l.muscu != null ? { muscu: l.muscu, series: l.series ?? 0 } : {}),
    sourceFc: l.source_fc,
    score: scoreEffort(l.charge, courbe),
  };
};

/**
 * Calcule et écrit la charge des séances données. `toutes` : vérifie aussi l'empreinte des séances qui ont déjà une charge
 * (sinon, seules les séances sans charge sont calculées). Santé Connect (deps.fcSante) : seulement pour une séance sans FC en
 * base, jamais lue ou récente. Une séance de récupération n'a pas de charge (sa ligne est retirée).
 */
async function assurer(
  db: Executeur,
  seances: readonly SeanceBrute[],
  toutes: boolean,
  deps: DepsCharges = {},
  /** Séances sans FC gardée pour leurs kcal (kcal-fc.ts) : on la garde, quitte à lire Santé Connect (recalcul de fond). */
  sansFcGardee: ReadonlySet<string> = new Set(),
): Promise<{ calculees: number }> {
  if (!seances.length) return { calculees: 0 };
  const maintenant = deps.maintenant ?? Date.now();
  const lignes = await lireLignes(db, seances.map((s) => s.id));
  const aFaire = toutes ? seances : seances.filter((s) => !lignes.has(s.id) && compteDansEffort(familleDe(sportDe(s))));
  if (!aFaire.length) return { calculees: 0 };
  const ref = await lireZonesFc(db, maintenant);
  const cleZones = bornesDe(ref).join(",");
  // les séries de la muscu et leur passé : une lecture pour toute la passe
  const force = aFaire.filter((s) => familleDe(sportDe(s)) === "force").map((s) => s.debut);
  const muscu = force.length ? await contexteMuscu(db, Math.min(...force), Math.max(...force) + 1) : null;
  let calculees = 0;
  for (let i = 0; i < aFaire.length; i++) {
    const s = aFaire[i]!;
    // de quoi laisser respirer l'appli pendant un long recalcul
    if (i > 0 && i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    const sport = sportDe(s);
    if (!compteDansEffort(familleDe(sport))) {
      if (lignes.has(s.id)) await db.runAsync("DELETE FROM seance_charge WHERE seance_id = ?", [s.id]);
      continue;
    }
    const minutes = minutesDe(s);
    const [fc, ressenti] = await Promise.all([fcEnBase(db, s, ref), ressentiEnBase(db, s.id)]);
    const series = muscu && familleDe(sport) === "force" ? seriesDe(muscu, s.id, s.debut) : null;
    const empreinte = [CHARGE_EFFORT.version, cleZones, sport, minutes.toFixed(2), ressenti.sig, series ? hacher(series.sig) : "-", fc?.sig ?? "-"].join("|");
    const avant = lignes.get(s.id);
    const lueSante = avant?.empreinte.startsWith(`${empreinte}|sc`) ?? false;
    const recente = maintenant - s.fin < FC_TARDIVE_MS;
    const manque = sansFcGardee.has(s.id);
    const demanderSante = !!deps.fcSante && !fc && (!lueSante || recente || manque);
    // la FC des kcal suit celle de l'Effort ; une séance sans FC gardée la reçoit ici, même si sa charge ne bouge pas
    if (manque && !demanderSante) await garderFcMinutes(db, s.id, pointsDe(fc));
    // Charge reçue d'un appareil plus à jour (paramètres plus récents), ou calculée avec une FC que ce téléphone n'a pas : elle
    // reste (règle de synchro du 31/10 : un téléphone sans FC n'écrase jamais un calcul fait avec la FC). Calculée avec la
    // FC de Santé Connect (« |sc » : celle de ce compte, que ce téléphone peut relire), elle est relue, et ne reste que si la
    // relecture n'apporte pas de FC (C2 : avant, la FC d'avant le début de la séance était perdue).
    if (avant && avant.version > CHARGE_EFFORT.version) continue;
    const garder = !!avant && avant.avec_fc === 1 && !fc && !lueSante && avant.empreinte !== empreinte;
    if (garder && !(demanderSante && avant.empreinte.includes("|sc"))) continue;
    if (avant && (avant.empreinte === empreinte || lueSante) && !demanderSante) continue;
    let mesure = fc;
    let suffixe = "";
    if (demanderSante) {
      const l = await deps.fcSante!(s.debut, finMurale(s)).catch(() => null);
      suffixe = `|sc${l?.length ?? 0}`;
      if (l && l.length >= 2) mesure = { zones: zonesDe(l, s.debut, finMurale(s), ref, "sante"), source: "sante", sig: "", points: [...l], debut: s.debut, fin: finMurale(s) };
    }
    if (garder && !(mesure && total(mesure.zones) >= CHARGE_EFFORT.fcMinMinutes)) continue;
    // sans Santé Connect (affichage), une FC gardée de Santé Connect n'est pas effacée par « rien en base »
    if (mesure?.points || demanderSante || manque) await garderFcMinutes(db, s.id, pointsDe(mesure));
    const c = chargeSeance({ sportId: sport, minutes, zones: mesure?.zones ?? null, ressenti: ressenti.mot, series });
    if (!c) continue;
    const avecFc = !!mesure && total(mesure.zones) >= CHARGE_EFFORT.fcMinMinutes;
    // Le déclencheur de synchro ne note la ligne que si la mesure change (pas pour l'empreinte ni l'heure seules).
    await db.runAsync(
      `INSERT INTO seance_charge (seance_id, charge, methode, estime, minutes, zones, ressenti, source_fc, version, empreinte, maj_le, avec_fc, muscu, series)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(seance_id) DO UPDATE SET charge = excluded.charge, methode = excluded.methode, estime = excluded.estime,
         minutes = excluded.minutes, zones = excluded.zones, ressenti = excluded.ressenti, source_fc = excluded.source_fc,
         version = excluded.version, empreinte = excluded.empreinte, maj_le = excluded.maj_le, avec_fc = excluded.avec_fc,
         muscu = excluded.muscu, series = excluded.series`,
      [
        s.id, c.charge, c.methode, c.estime ? 1 : 0, c.minutes, c.zones ? JSON.stringify(c.zones.map((z) => Math.round(z * 10) / 10)) : null,
        c.ressenti ?? null, c.methode === "fc" ? (mesure?.source ?? null) : null, CHARGE_EFFORT.version, empreinte + suffixe, maintenant, avecFc ? 1 : 0,
        c.muscu ?? null, c.series ?? null,
      ],
    );
    calculees++;
  }
  return { calculees };
}

const seancesEntre = (db: Executeur, debut: number, fin: number) =>
  db.getAllAsync<SeanceBrute>(`${SQL_SEANCES} AND s.debut >= ? AND s.debut < ? ORDER BY s.debut`, [debut, fin]);

/** Une séance terminée dans le temps (fin murale, pauses comprises) ; `compte` : elle a une charge (pas une récupération). */
export interface PlageSeance {
  id: string;
  debut: number;
  fin: number;
  minutes: number;
  compte: boolean;
}

/** Les séances terminées qui touchent [debut, fin[ : ce que l'activité de la journée ne doit pas compter deux fois. */
export async function plagesSeances(db: Executeur, debut: number, fin: number): Promise<PlageSeance[]> {
  const l = await db.getAllAsync<SeanceBrute>(`${SQL_SEANCES} AND s.debut < ? AND s.fin + COALESCE(s.pause_cumul_s, 0) * 1000 > ? ORDER BY s.debut`, [fin, debut]);
  return l.map((s) => ({ id: s.id, debut: s.debut, fin: finMurale(s), minutes: minutesDe(s), compte: compteDansEffort(familleDe(sportDe(s))) }));
}

/** L'effort de chaque séance faite d'un jour (minuit `jour`), par id ; null : récupération ou rien pour la noter. */
export async function effortsSeancesJour(db: Executeur, jour: number, courbe: CourbeEffort = COURBE_EFFORT, deps: DepsCharges = {}): Promise<Map<string, EffortDeSeance | null>> {
  const l = await seancesEntre(db, jour, jour + JOUR_MS);
  const out = new Map<string, EffortDeSeance | null>();
  if (!l.length) return out;
  await assurer(db, l, true, deps);
  const lignes = await lireLignes(db, l.map((s) => s.id));
  for (const s of l) {
    const x = lignes.get(s.id);
    out.set(s.id, x ? deLigne(x, s.debut, courbe) : null);
  }
  return out;
}

/** L'effort d'une séance (sa page) ; null : récupération, en cours ou introuvable. */
export async function effortSeance(db: Executeur, seanceId: string, courbe: CourbeEffort = COURBE_EFFORT, deps: DepsCharges = {}): Promise<EffortDeSeance | null> {
  const s = await db.getFirstAsync<SeanceBrute>(`${SQL_SEANCES} AND s.id = ?`, [seanceId]);
  if (!s) return null;
  await assurer(db, [s], true, deps);
  const x = (await lireLignes(db, [s.id])).get(s.id);
  return x ? deLigne(x, s.debut, courbe) : null;
}

/**
 * La part musculaire et la part cardio d'une séance de force pas encore enregistrée (la fin de séance), d'après ses séries et
 * la FC de son capteur jusqu'ici (`fc`, heure murale) ; null sans FC sûre, sans séries ou hors force. Rien n'est écrit : la
 * charge s'écrira à l'enregistrement.
 */
export async function partsSeanceEnCours(
  db: Executeur,
  seanceId: string,
  fin: number,
  fc: readonly { t: number; bpm: number }[],
  maintenant: number = Date.now(),
): Promise<{ musculaire: number; cardio: number } | null> {
  if (fc.length < 2) return null;
  const s = await db.getFirstAsync<SeanceBrute>(
    `SELECT s.id, s.debut, ? AS fin, s.pause_cumul_s AS pause,
       COALESCE(s.activite_id, (SELECT se.exercice_id FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id
         WHERE se.seance_id = s.id AND (e.whoop_ids IS NOT NULL OR e.id = 'cat:musculation') ORDER BY se.position LIMIT 1)) AS sport
     FROM seances s WHERE s.id = ?`,
    [fin, seanceId],
  );
  if (!s || familleDe(sportDe(s)) !== "force") return null;
  const [ref, ressenti, ctx] = await Promise.all([lireZonesFc(db, maintenant), ressentiEnBase(db, s.id), contexteMuscu(db, s.debut, s.debut, s.id)]);
  const c = chargeSeance({
    sportId: sportDe(s),
    minutes: minutesDe(s),
    zones: zonesDe(fc, s.debut, finMurale(s), ref, "capteur"),
    ressenti: ressenti.mot,
    series: seriesDe(ctx, s.id, s.debut),
  });
  return c ? partsSeance(c) : null;
}

/** Efforts déjà calculés d'une liste de séances (historique) : sans calcul, ce qui manque viendra du recalcul de fond. */
export async function effortsConnus(db: Executeur, ids: readonly string[], courbe: CourbeEffort = COURBE_EFFORT): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const [id, l] of await lireLignes(db, ids)) out.set(id, scoreEffort(l.charge, courbe));
  return out;
}

const minuitDe = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Charge de chaque jour de [debut, fin[ qui a des séances notées (minuits) ; les séances sans charge sont calculées. */
export async function chargesParJour(db: Executeur, debut: number, fin: number): Promise<Map<number, number>> {
  const l = await seancesEntre(db, debut, fin);
  await assurer(db, l, false);
  const lignes = await lireLignes(db, l.map((s) => s.id));
  const out = new Map<number, number>();
  for (const s of l) {
    const x = lignes.get(s.id);
    if (!x) continue;
    const j = minuitDe(s.debut);
    out.set(j, (out.get(j) ?? 0) + x.charge);
  }
  return out;
}

/** Les séances notées de [debut, fin[ (la plus chargée de l'historique), avec leur nom. */
export async function seancesChargees(db: Executeur, debut: number, fin: number): Promise<{ id: string; debut: number; charge: number; nom: string | null }[]> {
  await chargesParJour(db, debut, fin);
  return db.getAllAsync<{ id: string; debut: number; charge: number; nom: string | null }>(
    `SELECT s.id, s.debut, c.charge, COALESCE(s.titre, r.nom) AS nom FROM seances s JOIN seance_charge c ON c.seance_id = s.id
     LEFT JOIN routines r ON r.id = s.routine_id WHERE s.debut >= ? AND s.debut < ? ORDER BY s.debut`,
    [debut, fin],
  );
}

/** Minuit du premier jour de séance terminée, null sans aucune. */
export async function premierJourSeance(db: Executeur): Promise<number | null> {
  const r = await db.getFirstAsync<{ d: number | null }>("SELECT MIN(debut) AS d FROM seances WHERE fin IS NOT NULL", []);
  return r?.d == null ? null : minuitDe(r.d);
}

let enCours: Promise<{ calculees: number }> | null = null;

/**
 * Recalcule tout l'historique (au lancement, en fond) : les séances les plus récentes d'abord, sans bloquer (une pause toutes
 * les 20). Une seule passe à la fois : un second appel rejoint la première.
 */
export function recalculerCharges(db: Executeur, deps: DepsCharges = {}): Promise<{ calculees: number }> {
  enCours ??= (async () => {
    try {
      const [l, sansFc] = await Promise.all([db.getAllAsync<SeanceBrute>(`${SQL_SEANCES} ORDER BY s.debut DESC`, []), seancesSansFcGardee(db)]);
      // les kcal de Whoop ne se gardent que 4 semaines, pour le labo (kcal-comparaison.ts)
      await oublierKcalCapteurs(db, deps.maintenant ?? Date.now()).catch((e: unknown) => console.warn("[kcal] oubli", e));
      return await assurer(db, l, true, deps, sansFc);
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

/** Comparaison interne du labo (décision du 31/10) : par séance, notre charge et notre score, et la valeur de Whoop. */
export interface LigneComparaison {
  seanceId: string;
  debut: number;
  nom: string | null;
  charge: number;
  methode: ChargeSeance["methode"];
  score: number;
  whoop: number;
}

/**
 * Fenêtre de la comparaison du labo : 4 semaines glissantes (page de confidentialité, « le temps de les régler, prévue pour
 * 4 semaines » ; docs/CODE-CONFORMITE-WHOOP.md, point 3). Plus ancien, le score de Whoop n'est plus lu.
 */
export const JOURS_COMPARAISON = 28;
const debutComparaison = (maintenant: number) => maintenant - JOURS_COMPARAISON * JOUR_MS;

/** Séances des 4 dernières semaines qui ont à la fois notre charge et une valeur Whoop, les plus récentes d'abord. Seul le labo la lit. */
export async function lireComparaison(db: Executeur, courbe: CourbeEffort = COURBE_EFFORT, maintenant: number = Date.now()): Promise<LigneComparaison[]> {
  const l = await db.getAllAsync<{ id: string; debut: number; nom: string | null; charge: number; methode: ChargeSeance["methode"]; w: number }>(
    `SELECT s.id, s.debut, COALESCE(s.titre, r.nom) AS nom, c.charge, c.methode,
            (SELECT w.strain FROM whoop_seance w WHERE w.seance_id = s.id AND w.strain IS NOT NULL ORDER BY w.fin - w.debut DESC LIMIT 1) AS w
     FROM seances s JOIN seance_charge c ON c.seance_id = s.id LEFT JOIN routines r ON r.id = s.routine_id
     WHERE s.debut >= ? ORDER BY s.debut DESC`,
    [debutComparaison(maintenant)],
  );
  return l.filter((x) => x.w != null).map((x) => ({ seanceId: x.id, debut: x.debut, nom: x.nom, charge: x.charge, methode: x.methode, score: scoreEffort(x.charge, courbe), whoop: x.w }));
}

/**
 * Comparaison des journées entières (labo, docs/EFFORT-ACTIVITE.md) : Whoop compte les pas dans sa valeur du jour, c'est
 * l'étalon de la journée. Par jour : nos points (séances + activité hors séances), notre score, la valeur de Whoop et ses pas.
 */
export interface JourComparaison {
  jour: number;
  seances: number;
  activite: number;
  charge: number;
  score: number;
  /** Ce qui a mesuré l'activité, null sans activité. */
  methode: "fc" | "pas" | null;
  /** Nos pas hors séances. */
  pas: number | null;
  /** Les pas de Whoop pour le jour entier. */
  pasWhoop: number | null;
  whoop: number;
}

/** Jours des 4 dernières semaines qui ont à la fois nos points et une valeur Whoop, les plus récents d'abord. Seul le labo la lit. */
export async function lireComparaisonJours(db: Executeur, courbe: CourbeEffort = COURBE_EFFORT, maintenant: number = Date.now()): Promise<JourComparaison[]> {
  const [w, seances, activites] = await Promise.all([
    db.getAllAsync<{ jour: number; v: number; pas: number | null }>(
      "SELECT w.jour, w.strain AS v, w.pas FROM whoop_jour w WHERE w.strain IS NOT NULL AND w.jour >= ? ORDER BY w.jour DESC",
      [minuitDe(debutComparaison(maintenant))],
    ),
    db.getAllAsync<{ debut: number; charge: number }>("SELECT s.debut, c.charge FROM seances s JOIN seance_charge c ON c.seance_id = s.id", []),
    db.getAllAsync<{ jour: string; charge: number; methode: "fc" | "pas"; pas: number | null }>("SELECT a.jour, a.charge, a.methode, a.pas FROM jour_activite a", []).catch(() => []),
  ]);
  const parJour = new Map<number, number>();
  for (const s of seances) parJour.set(minuitDe(s.debut), (parJour.get(minuitDe(s.debut)) ?? 0) + s.charge);
  const act = new Map(
    activites.map((a) => {
      const [y, m, d] = a.jour.split("-").map(Number);
      return [new Date(y!, m! - 1, d!).getTime(), a] as const;
    }),
  );
  return w.flatMap((x) => {
    const s = parJour.get(x.jour) ?? 0;
    const a = act.get(x.jour);
    const charge = s + (a?.charge ?? 0);
    if (!(charge > 0)) return [];
    return [{ jour: x.jour, seances: s, activite: a?.charge ?? 0, charge, score: scoreEffort(charge, courbe), methode: a?.methode ?? null, pas: a?.pas ?? null, pasWhoop: x.pas, whoop: x.v }];
  });
}

/** Corrélation de Pearson ; null sous 3 couples ou sans variation. */
export function correlation(couples: readonly [number, number][]): number | null {
  const n = couples.length;
  if (n < 3) return null;
  const mx = couples.reduce((a, [x]) => a + x, 0) / n;
  const my = couples.reduce((a, [, y]) => a + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of couples) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
