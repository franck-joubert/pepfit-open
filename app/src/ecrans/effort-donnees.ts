// Bloc d'effort d'une séance enregistrée (lot 3) : tracé, FC et tours relus de la base, puis la vue (effort-vue.ts). FC d'une
// séance de muscu (lot 5) : FC, repos et coches, puis la vue (fc-muscu-vue.ts).
import { lireFcMuscu, lireMorphologie, lireSuivi, lireZonesFc, type Executeur, type SeanceDetail } from "../db/api";
import { t } from "../i18n/index";
import { avecDistanceSaisie, vueEffort, vueEffortFc, vueEffortWhoop, type VueEffort } from "./effort-vue";
import { CHARGE_EFFORT } from "./effort-pepfit";
import { nomCapteur, POINTS_COURBE, TROU_S, vueFcMuscu, type Echantillon, type VueFcMuscu } from "./fc-muscu-vue";
import { completerFc, serieCourbeFc, TROU_COURBE_S } from "./fc-trous";
import type { SourcesSeance } from "./seance-sources";
import { effortSeance } from "./effort-charges";
import { lireAge } from "../db/depots/profil";
import { lireReglage } from "../db/depots/reglages";
import { kcalSeance } from "./kcal-seance";
import { lireFcMinutes, PREFIXE_FC_MINUTES } from "./kcal-fc";
import { SPORT_MUSCU } from "./kcal-comparaison";
import { CLE_CALIBRATION_KCAL, facteursDepuisReglage } from "./calibration";
import { aUneFamille } from "./familles-sports";
import { bmrA } from "./sante-donnees";
import type { Zones } from "./zones-fc";

export interface EffortSeance {
  vue: VueEffort;
  exerciceId: string;
  calories: number | null;
  /** « Whoop » à droite du titre quand les données viennent de lui. */
  source?: string;
  /** Suivi sans GPS (tapis, intérieur) : la série dont la distance se saisit sur le résumé. */
  saisie?: { serieId: string; distanceM: number | null };
  /** Effort pepfit de la séance (effort-charges.ts : FC par zones, ressenti, sinon barème du sport) ; sports et cours. */
  effortPepfit?: number | null;
  /** L'Effort pepfit est estimé (« ~ »). */
  effortEstime?: boolean;
}

/** Séance Whoop rattachée à la séance (la plus longue s'il y en a plusieurs). */
function whoopDe(db: Executeur, seanceId: string) {
  return db.getFirstAsync<{ debut: number; fin: number; kj: number | null; fc_moy: number | null; fc_max: number | null; distance_m: number | null; zones: string | null }>(
    "SELECT debut, fin, kj, fc_moy, fc_max, distance_m, zones FROM whoop_seance WHERE seance_id = ? ORDER BY fin - debut DESC LIMIT 1",
    [seanceId],
  );
}

/**
 * Les kcal d'une séance (sa dépense, métabolisme compris), calculées chez nous comme sur la page Énergie (kcal-seance.ts) :
 * sa FC minute par minute gardée, sinon la FC moyenne de Whoop, sinon les MET de son sport ; jamais les kcal de Whoop.
 */
async function kcalDeSeance(db: Executeur, seance: SeanceDetail, minutes: number, fcMoy: number | null, zones: Zones): Promise<number | null> {
  const t0 = seance.seance.fin;
  if (t0 == null || !(minutes > 0)) return null;
  const [fc, morpho, age, bmr, cal] = await Promise.all([
    lireReglage(db, `${PREFIXE_FC_MINUTES}${seance.seance.id}`),
    lireMorphologie(db),
    lireAge(db, t0).catch(() => null),
    bmrA(db, t0),
    lireReglage(db, CLE_CALIBRATION_KCAL).catch(() => null),
  ]);
  // le sport : l'activité de la séance (son premier exercice, un sport du catalogue), sinon une routine de musculation
  const premier = seance.exercices[0]?.exercice.id ?? null;
  const k = kcalSeance(
    { minutes, fc: lireFcMinutes(fc), fcMoy, sportId: premier && aUneFamille(premier) ? premier : SPORT_MUSCU },
    { sexe: morpho.sexe, kg: morpho.poidsKg, age: age?.age ?? null, fcRepos: zones.fcRepos?.bpm ?? null, fcMax: zones.fcMax.bpm, calibration: facteursDepuisReglage(cal) },
    bmr,
  );
  return Math.round(k.brutes);
}

/** Nom de la source de la FC venue d'ailleurs (« Santé Connect »). */
export const nomSourceFc = (_s: NonNullable<SourcesSeance["fc"]>["source"]) => t("seance.sources.sante");

/** null : la séance n'a ni tracé, ni FC, ni Whoop (pas de bloc du tout). Un suivi de pepfit passe devant Whoop (tracé, tours),
 * Whoop lui apporte ses kcal (son score d'effort n'est jamais montré : l'effort est celui de pepfit). `fc` : échantillons
 * venus de Whoop ou de Santé Connect (seance-sources), la courbe
 * d'une séance Whoop ; absents (ou déjà découpés par exercice dans le bloc de la muscu) : les zones seules. Pour un suivi qui a
 * sa FC, `fc` ne fait que combler ses trous (FC coupée en direct), points marqués de leur provenance (fc-trous.ts). Ni suivi
 * ni Whoop, mais `fc` (la montre par Santé Connect) : sa courbe, ses zones et ses kcal (C7). */
export async function chargerEffort(db: Executeur, seance: SeanceDetail, fc: SourcesSeance["fc"] = null): Promise<EffortSeance | null> {
  const [s, w] = await Promise.all([lireSuivi(db, seance.seance.id), whoopDe(db, seance.seance.id)]);
  if (!s && w) {
    let zones: number[] | null = null;
    try {
      zones = w.zones ? (JSON.parse(w.zones) as number[]) : null;
    } catch {
      zones = null;
    }
    const serie = fc ? serieCourbeFc(fc.echantillons.filter((x) => x.t >= w.debut && x.t <= w.fin).map((x) => ({ s: x.t - w.debut, bpm: x.bpm })), POINTS_COURBE) : [];
    const zonesFc = await lireZonesFc(db);
    const vue = vueEffortWhoop({ dureeS: (w.fin - w.debut) / 1000, distanceM: w.distance_m, fcMoy: w.fc_moy, fcMax: w.fc_max, zones }, zonesFc, serie);
    const source = fc?.source === "sante" && serie.length >= 2 ? `Whoop, ${nomSourceFc("sante")}` : "Whoop";
    const calories = await kcalDeSeance(db, seance, (w.fin - w.debut) / 60_000, w.fc_moy, zonesFc).catch(() => null);
    return { vue, exerciceId: seance.exercices[0]?.exercice.id ?? "", calories, source };
  }
  if (!s && !w && fc && seance.seance.fin != null) {
    const plage = plageSeance(seance.seance);
    const minutes = Math.max(0, (seance.seance.fin - seance.seance.debut) / 60_000 - (seance.seance.pause_cumul_s ?? 0) / 60);
    const zonesFc = await lireZonesFc(db);
    const vue = vueEffortFc(fc.echantillons, plage, minutes * 60, zonesFc, CHARGE_EFFORT.trouFcS[fc.source], POINTS_COURBE);
    if (!vue) return null;
    const calories = await kcalDeSeance(db, seance, minutes, null, zonesFc).catch(() => null);
    return { vue, exerciceId: seance.exercices[0]?.exercice.id ?? "", calories, source: nomSourceFc(fc.source) };
  }
  if (!s) return null;
  const e = seance.exercices[0];
  const serie = e?.series.find((x) => x.faite);
  const dureeS = serie?.duree_s ?? (seance.seance.fin ? (seance.seance.fin - seance.seance.debut) / 1000 : 0);
  const zonesFc = await lireZonesFc(db);
  const suivi = fc && s.fc.length ? { ...s, fc: completerFc(s.fc, fc.echantillons, fc.source, dureeS * 1000) } : s;
  const vue = avecDistanceSaisie(vueEffort(suivi, dureeS, zonesFc), serie?.distance_m ?? null);
  const exerciceId = e?.exercice.id ?? "";
  const ep = s.mode === "fc" && serie ? await effortSeance(db, seance.seance.id).catch(() => null) : null;
  const saisie = s.mode === "fc" && serie ? { saisie: { serieId: serie.id, distanceM: serie.distance_m ?? null }, effortPepfit: ep?.score ?? null, effortEstime: ep?.estime ?? false } : {};
  const calories = await kcalDeSeance(db, seance, dureeS / 60, w?.fc_moy ?? null, zonesFc).catch(() => null);
  if (w) return { vue, exerciceId, calories, source: "Whoop", ...saisie };
  return { vue, exerciceId, calories, ...saisie };
}

export interface FcMuscuSeance {
  vue: VueFcMuscu;
  /** « Whoop · en direct » (le nom du capteur, sinon « Capteur »). */
  source: string;
  /** kcal de la séance entière (pauses déduites), les mêmes que la page Énergie ; null sans poids ni durée. */
  calories: number | null;
}

/** kcal de la séance entière, sur sa FC : pas sur la fenêtre d'une séance Whoop (plus courte), pour rester celles de la page Énergie. */
function caloriesMuscu(db: Executeur, seance: SeanceDetail, fcMoy: number | null): Promise<number | null> {
  const { debut, fin, pause_cumul_s } = seance.seance;
  if (fin == null) return Promise.resolve(null);
  const minutes = Math.max(0, (fin - debut) / 60_000 - (pause_cumul_s ?? 0) / 60);
  return lireZonesFc(db).then((zones) => kcalDeSeance(db, seance, minutes, fcMoy, zones)).catch(() => null);
}

/**
 * Échantillons espacés de plus de TROU_S (Whoop : un point toutes les 6 s) : un point recopié à mi-chemin, pour que chacun couvre
 * le temps jusqu'au suivant comme la FC en direct (1 par s). Sans cela, 6 s sur 6 n'en comptaient que 5 (zones à 5/6 du temps).
 * Un vrai trou (plus de 2 × TROU_S) reste un trou.
 */
export function densifier(fc: readonly Echantillon[]): Echantillon[] {
  const out: Echantillon[] = [];
  for (let i = 0; i < fc.length; i++) {
    const f = fc[i]!;
    out.push(f);
    const ecart = (fc[i + 1]?.t ?? f.t) - f.t;
    if (ecart > TROU_S * 1000 && ecart <= 2 * TROU_S * 1000) out.push({ t: f.t + Math.round(ecart / 2), bpm: f.bpm });
  }
  return out;
}

/** Séries cochées au moins : en dessous, ce n'est pas une séance de muscu à découper (une séance Whoop seule n'en a qu'une). */
export const COCHES_MUSCU = 2;

/**
 * Plage murale de la séance (FC anormalement basse, retour du 30/10, docs/FC-BASSE.md) : du début à la fin, plus les
 * pauses (la fin d'une séance ne les compte pas, l'heure murale de la FC si). Le service de la FC tourne de l'ouverture de la
 * séance à « Enregistrer » : la FC d'avant un début avancé, ou d'après une durée raccourcie, est celle du repos (vestiaire,
 * maison), pas celle de la séance.
 */
export function plageSeance(s: { debut: number; fin: number | null; pause_cumul_s?: number | null }): { debut: number; fin: number } {
  return { debut: s.debut, fin: s.fin == null ? Infinity : s.fin + (s.pause_cumul_s ?? 0) * 1000 };
}

/** FC possible : le capteur envoie 0 quand il perd le contact ; même borne que la FC de Whoop (seance-privee.ts). */
const fcPossible = (bpm: number) => bpm >= 25 && bpm <= 250;

/** Échantillons de la plage de la séance, sans les valeurs impossibles. */
export function dansLaSeance(fc: readonly Echantillon[], plage: { debut: number; fin: number }): Echantillon[] {
  return fc.filter((x) => x.t >= plage.debut && x.t <= plage.fin && fcPossible(x.bpm));
}

/**
 * FC du capteur coupée en direct (écran éteint, téléphone posé pendant la série) : ses silences de plus de TROU_COURBE_S,
 * bords de la séance compris, sont comblés par `autre` (Whoop toutes les 6 s, Santé Connect), en heure murale. Sans cela la
 * moyenne, le max et la courbe ne voyaient que les moments où le lien tenait (le repos, téléphone en main), jamais le pic.
 */
export function comblerTrous(direct: readonly Echantillon[], autre: readonly Echantillon[], plage: { debut: number; fin: number }): Echantillon[] {
  if (!autre.length) return [...direct];
  const bords = [plage.debut, ...direct.map((x) => x.t), Math.min(plage.fin, Math.max(direct.at(-1)?.t ?? plage.debut, autre.at(-1)!.t + 1))];
  const trous: [number, number][] = [];
  for (let i = 1; i < bords.length; i++) if (bords[i]! - bords[i - 1]! > TROU_COURBE_S * 1000) trous.push([bords[i - 1]!, bords[i]!]);
  const ajout = autre.filter((p) => trous.some(([a, b]) => p.t > a && p.t < b));
  return [...direct, ...ajout].sort((a, b) => a.t - b.t);
}

/**
 * null : la séance n'a pas de FC de muscu (pas de bloc). FC du capteur en direct d'abord, `fc` (Whoop ou Santé Connect,
 * seance-sources) n'en comblant que les trous ; sinon `fc` découpée par exercice grâce aux coches, quand la séance en a au
 * moins COCHES_MUSCU (repos de la séance s'il y en a, sinon fenêtres par défaut). Toujours sur la plage de la séance seule.
 */
export async function chargerFcMuscu(db: Executeur, seance: SeanceDetail, fc: SourcesSeance["fc"] = null): Promise<FcMuscuSeance | null> {
  const series = seance.exercices.flatMap((e) =>
    e.series.filter((x) => x.faite).flatMap((x, rang) => (x.fait_le != null ? [{ id: x.id, exerciceId: e.exercice.id, coche: x.fait_le, rang }] : [])),
  );
  const ordre = seance.exercices.map((e) => e.exercice.id);
  const plage = plageSeance(seance.seance);
  const d = await lireFcMuscu(db, seance.seance.id);
  const direct = d ? dansLaSeance(d.fc, plage) : [];
  if (d && direct.length) {
    const autre = fc ? dansLaSeance(fc.echantillons, plage) : [];
    const complete = comblerTrous(direct, autre, plage);
    const vue = vueFcMuscu({ fc: complete.length > direct.length ? densifier(complete) : direct, repos: d.repos, debut: seance.seance.debut }, series, ordre, await lireZonesFc(db));
    const source = t("seance.fc.source", { capteur: nomCapteur(d.capteur) });
    return {
      vue,
      source: fc && complete.length > direct.length ? `${source}, ${t("effort.fcCompletee", { source: nomSourceFc(fc.source) })}` : source,
      calories: await caloriesMuscu(db, seance, vue.fcMoy),
    };
  }
  if (!fc || series.length < COCHES_MUSCU) return null;
  const { debut } = seance.seance;
  const echantillons = densifier(dansLaSeance(fc.echantillons, plage));
  if (echantillons.length < 2) return null;
  const repos = await db.getAllAsync<{ debut: number; fin: number }>("SELECT debut, fin FROM seance_repos WHERE seance_id = ? ORDER BY debut", [seance.seance.id]);
  const vue = vueFcMuscu({ fc: echantillons, repos, debut }, series, ordre, await lireZonesFc(db));
  return { vue, source: nomSourceFc(fc.source), calories: await caloriesMuscu(db, seance, vue.fcMoy) };
}
