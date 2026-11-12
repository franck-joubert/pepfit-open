// Conversion des données Polar AccessLink v3 vers pepfit. Pur, sans base ni réseau (tests/polar.test.ts).
// Heures : une séance a son heure locale et son décalage sur UTC ; une nuit a ses bornes avec fuseau (« +03:00 ») et ses
// échantillons en « HH:MM » locaux ; la FC continue n'a que l'heure de l'appareil, lue dans le fuseau du téléphone.
import type {
  ActivitePolar, FcContinuePolar, JourConverti, NuitConvertie, NuitPolar, RechargeConvertie, RechargePolar, SeanceConvertie, SeancePolar,
} from "./types";

const MIN = 60_000;

/** Durée ISO 8601 (« PT2H44M45S », « PT210.026S », « P1DT2H ») en ms ; 0 si illisible. */
export function dureeIso(s: string | null | undefined): number {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(s ?? "").trim());
  if (!m) return 0;
  const [, j, h, mi, se] = m.map((x) => Number(x) || 0) as number[];
  return Math.round((((j! * 24 + h!) * 60 + mi!) * 60 + se!) * 1000);
}

/** « AAAA-MM-JJTHH:MM[:SS] » lu comme heure murale : en UTC décalée de `decalageMin`, sinon dans le fuseau du téléphone. */
export function instantLocal(s: string, decalageMin?: number | null): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/.exec(s);
  if (!m) return NaN;
  const [a, mo, j, h, mi, se] = m.slice(1).map((x) => Number(x) || 0) as number[];
  if (decalageMin != null && Number.isFinite(decalageMin)) return Date.UTC(a!, mo! - 1, j!, h!, mi!, se!) - decalageMin * MIN;
  return new Date(a!, mo! - 1, j!, h!, mi!, se!).getTime();
}

/** Décalage (min) d'une date ISO avec fuseau (« +03:00 », « Z ») ; null sans fuseau. */
export function decalageIso(s: string): number | null {
  const m = /(Z|([+-])(\d{2}):?(\d{2}))$/.exec(s.trim());
  if (!m) return null;
  if (m[1] === "Z") return 0;
  return (m[2] === "-" ? -1 : 1) * (Number(m[3]) * 60 + Number(m[4]));
}

/**
 * Instant d'un « HH:MM » d'une nuit : le même jour local que `debut` (avec son décalage), ou le lendemain si l'heure tombe
 * avant le coucher (nuit qui passe minuit). Une demi-heure de marge : le premier stade peut précéder l'heure de coucher arrondie.
 */
export function instantDeNuit(hhmm: string, debutIso: string): number {
  const debut = Date.parse(debutIso);
  const dec = decalageIso(debutIso) ?? 0;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hhmm);
  if (!m || !Number.isFinite(debut)) return NaN;
  const local = new Date(debut + dec * MIN); // champs UTC = heure murale du coucher
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(m[1]), Number(m[2]), Number(m[3] ?? 0)) - dec * MIN;
  if (t < debut - 30 * MIN) t += 24 * 60 * MIN;
  return t;
}

const fini = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
/** FC possible : un capteur envoie 0 ou des valeurs folles quand il perd le contact. */
const fcPossible = (bpm: number) => bpm >= 25 && bpm <= 250;
/** Type de mesure des échantillons d'une séance : 0 = FC (bpm) (annexe « Exercise sample types » de la documentation). */
export const ECHANTILLON_FC = "0";

/** Une séance Polar pour pepfit : bornes, FC (échantillons), zones, tracé GPS. null si ses heures sont illisibles. */
export function convertirSeance(s: SeancePolar): SeanceConvertie | null {
  const debut = instantLocal(s.start_time, s.start_time_utc_offset);
  const duree = dureeIso(s.duration);
  if (!Number.isFinite(debut) || !(duree > 0)) return null;
  const fin = debut + duree;
  const fc: SeanceConvertie["fc"] = [];
  const hr = (s.samples ?? []).find((x) => String(x["sample-type"]) === ECHANTILLON_FC && Number(x["recording-rate"]) > 0);
  if (hr) {
    const pas = Number(hr["recording-rate"]) * 1000;
    String(hr.data ?? "")
      .split(",")
      .forEach((v, i) => {
        const bpm = Number(v);
        if (v.trim() !== "" && Number.isFinite(bpm) && fcPossible(bpm) && debut + i * pas <= fin) fc.push({ t: debut + i * pas, bpm: Math.round(bpm) });
      });
  }
  const trace: SeanceConvertie["trace"] = [];
  for (const p of s.route ?? []) {
    const t = debut + dureeIso(p.time);
    if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 && t <= fin + MIN)
      trace.push({ t, lat: p.latitude, lon: p.longitude, alt: fini(p.altitude) });
  }
  trace.sort((a, b) => a.t - b.t);
  const zones = s.heart_rate_zones?.length
    ? [...s.heart_rate_zones].sort((a, b) => a.index - b.index).map((z) => Math.round((dureeIso(z["in-zone"]) / MIN) * 100) / 100)
    : null;
  return {
    id: String(s.id),
    debut,
    fin,
    sport: s.detailed_sport_info || s.sport || null,
    kcal: fini(s.calories),
    distanceM: fini(s.distance),
    fcMoy: fini(s.heart_rate?.average),
    fcMax: fini(s.heart_rate?.maximum),
    zones,
    fc,
    trace,
  };
}

/** Stade de Polar -> type de stade de Santé Connect (SleepSessionRecord.STAGE_TYPE_*). */
const STADES: Readonly<Record<number, number>> = { 0: 1, 1: 6, 2: 4, 3: 4, 4: 5, 5: 0 };

/** Une nuit Polar : bornes, temps endormi, phases (min), chronologie des stades, FC de la nuit. */
export function convertirNuit(n: NuitPolar): NuitConvertie | null {
  const debut = Date.parse(n.sleep_start_time);
  const fin = Date.parse(n.sleep_end_time);
  if (!Number.isFinite(debut) || !(fin > debut)) return null;
  const min = (s: number | null | undefined) => Math.round(((fini(s) ?? 0) / 60) * 10) / 10;
  const phases = { leger: min(n.light_sleep), profond: min(n.deep_sleep), paradoxal: min(n.rem_sleep), eveil: min(n.total_interruption_duration) };
  const endormi = phases.leger + phases.profond + phases.paradoxal + min(n.unrecognized_sleep_stage);
  const points = Object.entries(n.hypnogram ?? {})
    .map(([h, v]) => ({ t: instantDeNuit(h, n.sleep_start_time), type: STADES[Number(v)] ?? 0 }))
    .filter((p) => Number.isFinite(p.t) && p.t < fin)
    .sort((a, b) => a.t - b.t);
  const etapes = points.map((p, i) => ({ debut: Math.max(p.t, debut), fin: points[i + 1]?.t ?? fin, type: p.type })).filter((e) => e.fin > e.debut);
  const fc = Object.entries(n.heart_rate_samples ?? {})
    .map(([h, v]) => ({ t: instantDeNuit(h, n.sleep_start_time), bpm: Number(v) }))
    .filter((p) => Number.isFinite(p.t) && fcPossible(p.bpm))
    .sort((a, b) => a.t - b.t);
  return {
    jour: n.date,
    debut,
    fin,
    // sans phases (vieille montre) : la nuit moins ses éveils
    minutes: Math.round(endormi > 0 ? endormi : Math.max(0, (fin - debut) / MIN - phases.eveil)),
    phases,
    etapes,
    fc,
  };
}

export function convertirRecharge(r: RechargePolar): RechargeConvertie {
  const pos = (x: unknown) => (fini(x) != null && (x as number) > 0 ? (x as number) : null);
  return { jour: r.date, fcMoy: pos(r.heart_rate_avg), rmssd: pos(r.heart_rate_variability_avg), respiration: pos(r.breathing_rate_avg) };
}

/** FC continue d'un jour : instants dans le fuseau du téléphone (Polar ne donne que l'heure de l'appareil). */
export function convertirFcContinue(f: FcContinuePolar): { t: number; bpm: number }[] {
  return (f.heart_rate_samples ?? [])
    .map((x) => ({ t: instantLocal(`${f.date}T${x.sample_time}`), bpm: Number(x.heart_rate) }))
    .filter((x) => Number.isFinite(x.t) && fcPossible(x.bpm))
    .map((x) => ({ t: x.t, bpm: Math.round(x.bpm) }));
}

export function convertirActivite(a: ActivitePolar): JourConverti | null {
  const jour = /^(\d{4}-\d{2}-\d{2})/.exec(a.start_time ?? "")?.[1];
  if (!jour) return null;
  const actif = dureeIso(a.active_duration);
  return {
    jour,
    pas: fini(a.steps) != null ? Math.round(a.steps!) : null,
    kcal: fini(a.calories),
    kcalActives: fini(a.active_calories),
    distanceM: fini(a.distance_from_steps),
    actifMin: actif > 0 ? Math.round(actif / MIN) : null,
  };
}

/** Sport de Polar (detailed_sport_info, sinon sport) -> sport Whoop (whoop/sports.ts), pour l'activité du catalogue et la
 *  famille de rattachement. Mots-clés, du plus précis au plus large ; null : activité inconnue (séance à son nom). */
const SPORTS: readonly [RegExp, number][] = [
  [/TRAIL_RUN|RUNNING|JOGGING/, 0],
  [/MOUNTAIN_BIK/, 57],
  [/CYCLING|BIK/, 1],
  [/HIKING|NORDIC_WALK/, 52],
  [/WALK/, 63],
  [/SWIM/, 33],
  [/CROSSFIT|FUNCTIONAL|CIRCUIT/, 48],
  [/HIIT/, 96],
  [/STRENGTH|WEIGHT|CORE/, 45],
  [/YOGA/, 44],
  [/PILATES/, 43],
  [/ROWING/, 18],
  [/CROSS-?COUNTRY|XC_SKI|BACKCOUNTRY/, 47],
  [/SNOWBOARD/, 91],
  [/SKIING/, 29],
  [/PADEL/, 249],
  [/TABLE_TENNIS/, 230],
  [/TENNIS/, 34],
  [/SQUASH/, 32],
  [/BADMINTON/, 231],
  [/SOCCER|FOOTBALL|FUTSAL/, 30],
  [/BASKETBALL/, 17],
  [/VOLLEYBALL/, 36],
  [/GOLF/, 22],
  [/DANC/, 42],
  [/KICKBOX/, 127],
  [/BOX/, 39],
  [/MARTIAL|JUDO|KARATE|TAEKWONDO/, 56],
  [/STRETCH|MOBILITY/, 128],
  [/ELLIPTICAL|CROSS_TRAIN/, 65],
  [/TRIATHLON/, 62],
  [/CLIMB/, 60],
  [/INLINE/, 102],
  [/SKATING/, 239],
];

export function sportWhoop(sport: string | null | undefined): number | null {
  const s = String(sport ?? "").toUpperCase();
  if (!s) return null;
  for (const [re, id] of SPORTS) if (re.test(s)) return id;
  return null;
}

/** Nom lisible d'un sport Polar sans activité du catalogue : « STRENGTH_TRAINING » -> « Strength training ». */
export function libelleSport(sport: string | null | undefined): string {
  const s = String(sport ?? "").replace(/[_-]+/g, " ").trim().toLowerCase();
  return s ? s[0]!.toUpperCase() + s.slice(1) : "Polar";
}
