// FC d'une séance de muscu (planches/suivi-gps § 6, lot 5) : fenêtre d'effort estimée de chaque série, FC moyenne (« ~ »), FC
// max et récupération par série et par exercice, courbe de la séance ; et ce que montre la bande du bas pendant la séance. Sans
// React Native (tests/fc-muscu.test.ts). Toutes les heures sont murales (ms) : la coche d'une série est son `fait_le`.
import { t } from "../i18n/index";
import type { EtatFc as EtatFcNatif } from "../natif/suivi/types";
import { zoneDe } from "./suivi-direct-vue";
import { bornesDe, maxDe, type RefZones, type Zones } from "./zones-fc";

/** Fenêtre d'effort : au plus 120 s avant la coche ; 60 s pour la première série, sans repos avant (D8). */
export const PLAFOND_FENETRE_S = 120;
export const PREMIERE_FENETRE_S = 60;
/** La FC culmine après l'effort : la FC max se cherche jusqu'à 15 s après la coche. */
export const APRES_COCHE_S = 15;
/** Récupération : pic − FC 60 s après le pic. */
export const RECUP_S = 60;
/** Un échantillon ne couvre pas plus de 5 s (trous de diffusion non interpolés au-delà). */
export const TROU_S = 5;
/** Sous 50 % de la fenêtre couverte, la série est « — ». */
export const COUVERTURE_MIN = 0.5;
/** Deux coches à moins de 15 s : la seconde a été cochée après coup, sa fenêtre ne dit rien (« — »). */
export const COCHES_SERREES_S = 15;
/** Points de la courbe au plus (deux par tranche : le plus bas et le plus haut, les pics restent). */
export const POINTS_COURBE = 600;

export interface Echantillon {
  t: number;
  bpm: number;
}

export interface Repos {
  debut: number;
  fin: number;
}

export interface SerieCochee {
  id: string;
  exerciceId: string;
  /** Heure de la coche (fait_le). */
  coche: number;
  /** Rang de la série dans son exercice (0, 1…) : l'ordre d'affichage, quel que soit l'ordre des coches. */
  rang?: number;
}

export interface FcSerie {
  id: string;
  exerciceId: string;
  /** Rang dans l'exercice (SerieCochee.rang). */
  rang?: number;
  /** Début estimé de l'effort et coche (ms). */
  debut: number;
  coche: number;
  /** Coche à moins de 15 s de la précédente : fenêtre sans valeur. */
  douteuse: boolean;
  moy: number | null;
  max: number | null;
  recup: number | null;
  /** Zone de la FC max (1 à 5), 0 sans valeur. */
  zone: number;
}

export interface FcExercice {
  exerciceId: string;
  moy: number | null;
  max: number | null;
  recup: number | null;
  series: FcSerie[];
}

/**
 * Début estimé de l'effort de chaque série (triées par coche) : la fin du dernier repos fini entre la coche précédente et la
 * sienne ; sans repos, la coche précédente (superset, minuteur non lancé) ; sans rien avant, 60 s avant la coche ; jamais plus
 * de 120 s avant la coche.
 */
export function fenetres(series: readonly Pick<SerieCochee, "coche">[], repos: readonly Repos[], debutSeance = -Infinity): { debut: number; douteuse: boolean }[] {
  return series.map((s, k) => {
    const prec = k > 0 ? series[k - 1]!.coche : null;
    let finRepos: number | null = null;
    for (const r of repos) if (r.fin <= s.coche && (prec == null || r.fin > prec) && (finRepos == null || r.fin > finRepos)) finRepos = r.fin;
    const debut = finRepos ?? prec ?? s.coche - PREMIERE_FENETRE_S * 1000;
    // jamais avant le début de la séance : la première série cochée tôt gardait 60 s d'avant le début, sans FC, donc « — »
    return { debut: Math.max(debut, s.coche - PLAFOND_FENETRE_S * 1000, Math.min(debutSeance, s.coche)), douteuse: prec != null && s.coche - prec < COCHES_SERREES_S * 1000 };
  });
}

/** FC pondérée par le temps sur [a, b] et part de [a, b] couverte : chaque échantillon couvre jusqu'au suivant, 5 s au plus. */
export function fcSurIntervalle(fc: readonly Echantillon[], a: number, b: number): { moy: number | null; couverture: number } {
  let somme = 0;
  let temps = 0;
  for (let i = premierUtile(fc, a); i < fc.length; i++) {
    const f = fc[i]!;
    if (f.t > b) break;
    const suivant = fc[i + 1]?.t ?? f.t + 1000;
    const debut = Math.max(f.t, a);
    const fin = Math.min(suivant, f.t + TROU_S * 1000, b);
    if (fin <= debut) continue;
    somme += f.bpm * (fin - debut);
    temps += fin - debut;
  }
  return { moy: temps > 0 ? somme / temps : null, couverture: b > a ? temps / (b - a) : 0 };
}

/** Premier échantillon qui peut couvrir l'instant `a` (5 s avant au plus) : recherche dichotomique. */
function premierUtile(fc: readonly Echantillon[], a: number): number {
  let lo = 0;
  let hi = fc.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (fc[m]!.t < a - TROU_S * 1000) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Pic (premier maximum) sur [a, b] ; null sans échantillon. */
function pic(fc: readonly Echantillon[], a: number, b: number): Echantillon | null {
  let m: Echantillon | null = null;
  for (let i = premierUtile(fc, a); i < fc.length && fc[i]!.t <= b; i++) if (fc[i]!.t >= a && (!m || fc[i]!.bpm > m.bpm)) m = fc[i]!;
  return m;
}

/** FC à l'instant `t` : le dernier échantillon d'au plus 5 s ; null dans un trou. */
export function fcA(fc: readonly Echantillon[], t: number): number | null {
  let r: number | null = null;
  for (let i = premierUtile(fc, t); i < fc.length && fc[i]!.t <= t; i++) r = fc[i]!.bpm;
  return r;
}

const moyenne = (l: readonly number[]) => (l.length ? l.reduce((a, x) => a + x, 0) / l.length : null);
const arrondi = (x: number | null) => (x == null ? null : Math.round(x));

/** FC de chaque série (triées par coche) : moyenne de la fenêtre, max jusqu'à 15 s après la coche, récupération. `debutSeance` :
 * aucune fenêtre ne commence avant. */
export function fcDesSeries(fc: readonly Echantillon[], series: readonly SerieCochee[], repos: readonly Repos[], fcMax: RefZones, debutSeance?: number): FcSerie[] {
  const tri = [...series].sort((a, b) => a.coche - b.coche);
  const f = fenetres(tri, repos, debutSeance);
  return tri.map((s, k) => {
    const { debut, douteuse } = f[k]!;
    const vide = { id: s.id, exerciceId: s.exerciceId, rang: s.rang, debut, coche: s.coche, douteuse, moy: null, max: null, recup: null, zone: 0 };
    if (douteuse) return vide;
    const { moy, couverture } = fcSurIntervalle(fc, debut, s.coche);
    const p = pic(fc, debut, s.coche + APRES_COCHE_S * 1000);
    if (moy == null || couverture < COUVERTURE_MIN || !p) return vide;
    // Récupération : seulement si aucune série n'a commencé avant la mesure (repos de moins de 60 s : « — »).
    const mesure = p.t + RECUP_S * 1000;
    const suivante = f[k + 1];
    const apres = suivante && suivante.debut < mesure ? null : fcA(fc, mesure);
    return { ...vide, moy: Math.round(moy), max: p.bpm, recup: apres == null ? null : p.bpm - apres, zone: Math.max(1, zoneDe(p.bpm, fcMax)) };
  });
}

/** Par exercice, dans l'ordre donné : moyenne des FC moyennes, maximum des FC max, moyenne des récupérations ; ses séries dans
 * leur ordre (1, 2, 3), pas dans celui des coches. */
export function fcDesExercices(series: readonly FcSerie[], ordre: readonly string[]): FcExercice[] {
  return ordre.flatMap((id) => {
    const l = series.filter((s) => s.exerciceId === id).sort((a, b) => (a.rang ?? Infinity) - (b.rang ?? Infinity) || a.coche - b.coche);
    if (!l.length) return [];
    const moys = l.flatMap((s) => (s.moy == null ? [] : [s.moy]));
    const maxs = l.flatMap((s) => (s.max == null ? [] : [s.max]));
    const recups = l.flatMap((s) => (s.recup == null ? [] : [s.recup]));
    return [{ exerciceId: id, moy: arrondi(moyenne(moys)), max: maxs.length ? Math.max(...maxs) : null, recup: arrondi(moyenne(recups)), series: l }];
  });
}

/** Deux points par tranche (le plus bas, le plus haut, dans l'ordre du temps) : la courbe garde ses pics. */
export function decimerExtremes<T extends { bpm: number }>(l: readonly T[], max = POINTS_COURBE): T[] {
  if (l.length <= max) return [...l];
  const tranches = Math.floor(max / 2);
  const pas = l.length / tranches;
  const out: T[] = [];
  for (let k = 0; k < tranches; k++) {
    const a = Math.floor(k * pas);
    const b = Math.min(l.length, Math.floor((k + 1) * pas));
    let lo = a;
    let hi = a;
    for (let i = a; i < b; i++) {
      if (l[i]!.bpm < l[lo]!.bpm) lo = i;
      if (l[i]!.bpm > l[hi]!.bpm) hi = i;
    }
    if (lo === hi) out.push(l[lo]!);
    else out.push(l[Math.min(lo, hi)]!, l[Math.max(lo, hi)]!);
  }
  return out;
}

export interface VueFcMuscu {
  /** Durée montrée par la courbe (s), du début de la séance au dernier échantillon ou à la dernière coche. */
  dureeS: number;
  fcMoy: number | null;
  fcMax: number | null;
  /** Secondes par zone, Z0 (sous Z1) à Z5. */
  zonesS: [number, number, number, number, number, number];
  bornes: [number, number, number, number, number];
  fcMaxProfil: number;
  /** Zones personnelles retenues (source sous la barre) ; null avec une FC max seule. */
  zonesFc: Zones | null;
  /** Courbe : temps depuis le début (s), bpm. */
  serieFc: { s: number; bpm: number }[];
  /** Fenêtres d'effort (s depuis le début), bandes grises. */
  bandes: { a: number; b: number }[];
  /** Coches (s depuis le début), un repère chacune. */
  coches: number[];
  /** Numéro de chaque exercice (1, 2…) au début de la fenêtre de sa première série. */
  numeros: { s: number; n: number }[];
  series: FcSerie[];
  exercices: FcExercice[];
}

/** Tout le bloc « FC de la séance » d'une séance de muscu. `ordre` : les exercices dans l'ordre de la séance. `fcMaxProfil` :
 * les zones personnelles (lireZonesFc), ou une FC max seule (ses tranches de 10 %). */
export function vueFcMuscu(
  d: { fc: readonly Echantillon[]; repos: readonly Repos[]; debut: number },
  series: readonly SerieCochee[],
  ordre: readonly string[],
  fcMaxProfil: RefZones,
): VueFcMuscu {
  const fc = [...d.fc].sort((a, b) => a.t - b.t);
  const t0 = Math.min(d.debut, fc[0]?.t ?? d.debut);
  const lesSeries = fcDesSeries(fc, series, d.repos, fcMaxProfil, d.debut);
  const finT = Math.max(fc.at(-1)?.t ?? t0, ...lesSeries.map((s) => s.coche));
  const zonesS: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  let max: number | null = null;
  for (let i = 0; i < fc.length; i++) {
    const f = fc[i]!;
    const suivant = fc[i + 1]?.t ?? f.t + 1000;
    zonesS[zoneDe(f.bpm, fcMaxProfil)] += Math.max(0, Math.min(suivant, f.t + TROU_S * 1000) - f.t) / 1000;
    max = Math.max(max ?? 0, f.bpm);
  }
  const s = (t: number) => (t - t0) / 1000;
  const exercices = fcDesExercices(lesSeries, ordre);
  return {
    dureeS: Math.max(1, s(finT)),
    fcMoy: arrondi(fc.length ? fcSurIntervalle(fc, fc[0]!.t, fc.at(-1)!.t + 1000).moy : null),
    fcMax: max,
    zonesS,
    bornes: bornesDe(fcMaxProfil),
    fcMaxProfil: maxDe(fcMaxProfil),
    zonesFc: typeof fcMaxProfil === "number" ? null : fcMaxProfil,
    serieFc: decimerExtremes(fc).map((f) => ({ s: s(f.t), bpm: f.bpm })),
    bandes: lesSeries.filter((x) => !x.douteuse).map((x) => ({ a: Math.max(0, s(x.debut)), b: s(x.coche) })),
    coches: lesSeries.map((x) => s(x.coche)),
    numeros: exercices.map((e, i) => ({ s: Math.max(0, s(Math.min(...e.series.map((x) => x.debut)))), n: i + 1 })),
    series: lesSeries,
    exercices,
  };
}

/** Nom court du capteur : « Whoop » pour une Whoop (« WHOOP 4A0… »), sinon le nom qu'il diffuse, sinon « Capteur ». */
export function nomCapteur(capteur: string | null): string {
  if (capteur && /whoop/i.test(capteur)) return t("gps.whoop");
  return capteur?.trim() || t("seance.fc.capteur");
}

/** Récupération affichée : « −52 » (la FC a baissé de 52), « +3 » si elle a monté, « — » sans valeur. */
export const recupTexte = (r: number | null) => (r == null ? "—" : r >= 0 ? `−${r}` : `+${-r}`);

// ——— Bande du bas pendant la séance ———

/** Recherche du capteur au démarrage du service (le natif cherche 20 s, puis réessaie) : au-delà, « FC coupée ». */
export const RECHERCHE_BANDE_MS = 25_000;

export type BandeFc =
  /** Pas de FC (FC Whoop éteinte, ou pas de module) : Pause seule, à droite. */
  | { genre: "rien" }
  | { genre: "fc"; bpm: number; zone: number; baisse: number | null }
  /** La FC a déjà été reçue, puis perdue : « — » (le natif se reconnecte seul). */
  | { genre: "perdue" }
  | { genre: "recherche" }
  /** Diffusion coupée (« Activer » ouvre le tuto) ou « Appareils à proximité » refusés (« Autoriser »). */
  | { genre: "coupee"; action: "activer" | "autoriser" };

/**
 * Ce que montre la bande (NOTES § 6) : FC, zone et, pendant un repos, la baisse depuis le pic de la dernière série ; sans
 * FC Whoop, Pause seule ; diffusion coupée, le tuto « Activer la FC en direct » de la course.
 */
export function bandeFc(o: {
  active: boolean;
  appareils: boolean | null;
  etat: EtatFcNatif | null;
  bpm: number | null;
  vue: boolean;
  depuisMs: number;
  fcMax: RefZones;
  pic: number | null;
}): BandeFc {
  if (!o.active) return { genre: "rien" };
  if (o.appareils === false) return { genre: "coupee", action: "autoriser" };
  // un 0 (contact perdu) n'est pas une FC (docs/FC-BASSE.md) : « — » comme une mesure perdue
  if (o.etat === "connecte" && o.bpm != null && o.bpm >= 25) {
    const baisse = o.pic != null && o.pic > o.bpm ? o.pic - o.bpm : null;
    return { genre: "fc", bpm: o.bpm, zone: zoneDe(o.bpm, o.fcMax), baisse };
  }
  if (o.vue) return { genre: "perdue" };
  if ((o.etat == null || o.etat === "recherche" || o.etat === "connexion") && o.depuisMs < RECHERCHE_BANDE_MS) return { genre: "recherche" };
  return { genre: "coupee", action: "activer" };
}

/**
 * Pic de la dernière série pendant le repos qui la suit : le plus haut de la minute avant la coche jusqu'à 15 s après (la
 * FC culmine après l'effort) ; null hors repos ou sans échantillon.
 */
export function picDuRepos(fc: readonly Echantillon[], coche: number | null, maintenant: number): number | null {
  if (coche == null) return null;
  return pic(fc, coche - PREMIERE_FENETRE_S * 1000, Math.min(maintenant, coche + APRES_COCHE_S * 1000))?.bpm ?? null;
}
