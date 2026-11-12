// Conversion des enregistrements de l'API Whoop en lignes pepfit. Fonctions pures.
import { idSport, SPORTS_JOKERS } from "./sports";
import type { CycleWhoop, JourWhoop, RecuperationWhoop, SeanceConvertie, SeanceWhoop, SommeilWhoop } from "./types";

const MIN = 60_000;

export function minuit(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const note = (s: string) => s === "SCORED";
const arrondi = (n: number | null | undefined, d = 1): number | null => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Nuit principale (les siestes ne comptent pas) : le jour est celui du réveil. */
export function convertirSommeil(s: SommeilWhoop): JourWhoop | null {
  if (s.nap || !note(s.score_state) || !s.score) return null;
  const e = s.score.stage_summary;
  const leger = e.total_light_sleep_time_milli / MIN;
  const profond = e.total_slow_wave_sleep_time_milli / MIN;
  const paradoxal = e.total_rem_sleep_time_milli / MIN;
  const fin = Date.parse(s.end);
  const b = s.score.sleep_needed;
  return {
    jour: minuit(fin),
    sommeilDebut: Date.parse(s.start),
    sommeilFin: fin,
    sommeilMin: arrondi(leger + profond + paradoxal, 0),
    sommeilPerf: arrondi(s.score.sleep_performance_percentage, 0),
    sommeilDetteMin: b ? arrondi(b.need_from_sleep_debt_milli / MIN, 0) : null,
    legerMin: arrondi(leger, 0), profondMin: arrondi(profond, 0), paradoxalMin: arrondi(paradoxal, 0), eveilMin: arrondi(e.total_awake_time_milli / MIN, 0),
    respiration: arrondi(s.score.respiratory_rate, 1),
    sommeilEfficacite: arrondi(s.score.sleep_efficiency_percentage, 0),
    sommeilRegularite: arrondi(s.score.sleep_consistency_percentage, 0),
    sommeilReveils: e.disturbance_count ?? null,
    sommeilCycles: e.sleep_cycle_count ?? null,
    auLitMin: arrondi(e.total_in_bed_time_milli / MIN, 0),
    besoinBaseMin: b ? arrondi(b.baseline_milli / MIN, 0) : null,
    besoinEffortMin: b ? arrondi(b.need_from_recent_strain_milli / MIN, 0) : null,
    besoinSiesteMin: b ? arrondi(b.need_from_recent_nap_milli / MIN, 0) : null,
  };
}

/** Récupération du matin : rangée au jour du sommeil qui l'a produite (sleep_id), sinon au jour de sa création. */
export function convertirRecuperation(r: RecuperationWhoop, jourParSommeil: ReadonlyMap<string, number>): JourWhoop | null {
  if (!note(r.score_state) || !r.score) return null;
  return {
    jour: jourParSommeil.get(r.sleep_id) ?? minuit(Date.parse(r.created_at)),
    recup: arrondi(r.score.recovery_score, 0),
    vfc: arrondi(r.score.hrv_rmssd_milli, 1),
    fcRepos: arrondi(r.score.resting_heart_rate, 0),
    spo2: arrondi(r.score.spo2_percentage, 1),
    tempPeau: arrondi(r.score.skin_temp_celsius, 1),
  };
}

export function convertirCycle(c: CycleWhoop): JourWhoop | null {
  if (!note(c.score_state) || !c.score) return null;
  return { jour: minuit(Date.parse(c.start)), strain: arrondi(c.score.strain, 1), kj: arrondi(c.score.kilojoule, 0), fcMoy: arrondi(c.score.average_heart_rate, 0), fcMax: arrondi(c.score.max_heart_rate, 0) };
}

const ZONES = ["zone_zero_milli", "zone_one_milli", "zone_two_milli", "zone_three_milli", "zone_four_milli", "zone_five_milli"];

/** Nom brut gardé dans whoop_seance.sport : « running » → « Running », « weightlifting_msk » → « Weightlifting msk ». L'écran
 * montre le nom de l'activité du catalogue (whoop/sports.ts). */
export function nomSport(n: string | undefined): string {
  const t = (n ?? "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Whoop";
}

export function convertirSeance(w: SeanceWhoop): SeanceConvertie | null {
  if (!note(w.score_state) || !w.score) return null;
  const z = w.score.zone_durations;
  return {
    id: w.id,
    debut: Date.parse(w.start),
    fin: Date.parse(w.end),
    // v2 : sport_id peut manquer, le sport_name le donne alors
    sportId: idSport(w.sport_id, w.sport_name),
    sport: nomSport(w.sport_name),
    strain: arrondi(w.score.strain, 1), kj: arrondi(w.score.kilojoule, 0), fcMoy: arrondi(w.score.average_heart_rate, 0), fcMax: arrondi(w.score.max_heart_rate, 0),
    distanceM: arrondi(w.score.distance_meter, 0),
    zones: z ? ZONES.map((k) => arrondi((z[k] ?? 0) / MIN, 1) ?? 0) : null,
  };
}

/**
 * Une activité que Whoop n'a pas (encore) notée (PENDING_SCORE, UNSCORABLE : FC trop pauvre pour un score) mais qui est bien là
 * dans son appli, sans nom (« Activité » : sport -1, « Other » : 71, ou aucun sport). Gardée avec ses heures seulement : elle
 * devient une activité détectée à associer, et ses mesures arrivent à la synchro où Whoop la note (la ligne est alors mise à jour).
 * Une activité nommée non notée reste écartée : sa séance serait créée sans rien dire de l'effort.
 */
export function convertirSeanceNonNotee(w: SeanceWhoop): SeanceConvertie | null {
  const sportId = idSport(w.sport_id, w.sport_name);
  if (sportId != null && !SPORTS_JOKERS.has(sportId)) return null;
  const debut = Date.parse(w.start);
  const fin = Date.parse(w.end);
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || !(fin > debut)) return null;
  return { id: w.id, debut, fin, sportId, sport: nomSport(w.sport_name), strain: null, kj: null, fcMoy: null, fcMax: null, distanceM: null, zones: null };
}

/** Fusionne les champs d'un même jour (le dernier non nul gagne). */
export function fusionnerJours(l: readonly JourWhoop[]): JourWhoop[] {
  const par = new Map<number, JourWhoop>();
  for (const j of l) {
    const a: Record<string, unknown> = { ...(par.get(j.jour) ?? { jour: j.jour }) };
    for (const [k, v] of Object.entries(j)) if (v != null) a[k] = v;
    par.set(j.jour, a as unknown as JourWhoop);
  }
  return [...par.values()].sort((a, b) => a.jour - b.jour);
}

/** Taille (m) → cm, poids (kg) : arrondis à l'affichage de pepfit (1 décimale). */
export function corpsVersPepfit(c: { height_meter?: number; weight_kilogram?: number; max_heart_rate?: number }): { tailleCm: number | null; kg: number | null; fcMax: number | null } {
  return {
    tailleCm: c.height_meter && c.height_meter > 0.5 && c.height_meter < 2.6 ? Math.round(c.height_meter * 1000) / 10 : null,
    kg: c.weight_kilogram && c.weight_kilogram > 20 && c.weight_kilogram < 500 ? Math.round(c.weight_kilogram * 10) / 10 : null,
    fcMax: c.max_heart_rate && c.max_heart_rate >= 100 && c.max_heart_rate <= 240 ? Math.round(c.max_heart_rate) : null,
  };
}
