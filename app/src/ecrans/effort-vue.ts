// Fin de course et bloc d'effort (planches suivi-gps « Fin » et Lieux « Effort », lot 3) : tout ce que montrent le résumé,
// le tracé, les courbes, les tours et « Par km », sans React Native (testé dans tests/effort-vue.test.ts).
import { altitudesRecalees, zoneDe } from "./suivi-direct-vue";
import { bornesDe, maxDe, type RefZones, type Zones } from "./zones-fc";
import { allureSParKm, denivele, distancesCumulees, lisserAltitude, parKm, tempsMouvementCumule, tours, type BorneTour } from "../natif/suivi/logique";
import { graduationsDistance, metresParUnite, uniteActive } from "./unites";
import type { UniteDistance } from "../i18n/index";
import type { EchantillonFc, Point } from "../natif/suivi/types";
import { bilanCoupure, serieCourbeFc, type CoupureFc, type FcSourcee, type PointCourbeFc } from "./fc-trous";

/** Ce que la base garde d'un suivi (tables de la migration 32). */
export interface DonneesSuivi {
  points: readonly Point[];
  /** FC du capteur, et les points d'une autre source qui comblent ses trous (`source`, fc-trous.ts). */
  fc: readonly FcSourcee[];
  bornes: readonly BorneTour[];
  /** Dénivelé retenu à la fin (baromètre, sinon GPS lissé) ; null : recalculé. */
  denivelePlusM: number | null;
  barometre: boolean;
}

/** Trou de diffusion au-delà duquel un échantillon de FC ne couvre plus le temps qui suit (s). */
export const TROU_FC_S = 10;
/** Points dessinés au plus (tracé et courbes) : au-delà, rien ne se voit de plus sur 380 px. */
export const POINTS_DESSIN = 400;

export interface LigneTour {
  n: number;
  distanceM: number;
  dureeS: number;
  allure: number | null;
  fcMoy: number | null;
  /** Zone où le tour a passé le plus de temps (sous Z1 : compté en Z1, comme la planche). */
  zone: number | null;
  /** Dénivelé positif du tour (m) ; null sans altitude. */
  dPlus: number | null;
  /** Temps de séance de la fin du tour (s) : repère sur les courbes. */
  finS: number;
}

export interface LigneKm {
  n: number;
  distanceM: number;
  allure: number | null;
  fcMoy: number | null;
  zone: number;
  /** Largeur de la barre de vitesse, 0 à 1 (la plus rapide des km entiers = 1). */
  vitesse: number;
  partiel: boolean;
}

export interface PointTrace {
  lat: number;
  lon: number;
  /** Temps de séance (s) et distance (m) au point. */
  s: number;
  d: number;
  /** 1 à 5 ; 0 sans FC. */
  zone: number;
  /** Altitude lissée (m) ; null sans altitude. */
  alt: number | null;
}

export interface VueEffort {
  dureeS: number;
  /** Temps en mouvement (s) : celui de l'allure, sans l'attente du premier point GPS ni les arrêts. */
  dureeMouvementS: number;
  distanceM: number;
  allure: number | null;
  fcMoy: number | null;
  fcMax: number | null;
  /** Secondes par zone, Z0 (sous Z1) à Z5 ; null sans FC. */
  zonesS: [number, number, number, number, number, number] | null;
  bornes: [number, number, number, number, number];
  fcMaxProfil: number;
  /** Zones personnelles qui ont servi (source à écrire sous la barre) ; null : tranches d'une FC max donnée. */
  zonesFc: Zones | null;
  altitude: { min: number; max: number; plus: number; approx: boolean } | null;
  tours: LigneTour[];
  km: LigneKm[];
  trace: PointTrace[];
  /** Courbe de FC : temps de séance (s), bpm ; coupée aux silences de plus de 20 s, provenance des points comblés. */
  serieFc: PointCourbeFc[];
  /** FC coupée pendant la séance : temps coupé et ce qu'une autre source en a comblé ; null sans trou. */
  coupureFc: CoupureFc | null;
  /** Profil d'altitude : temps (s), distance (m), altitude lissée. */
  serieAlt: { s: number; d: number; alt: number }[];
  /** Bornes des tours touchés (pas la fin) : temps (s) et distance (m), repères des courbes et du tracé. */
  reperes: { s: number; d: number }[];
}

/**
 * Tapis, intérieur (sans tracé) : la distance saisie sur le résumé, ou celle d'une machine (D3 du 29/10), devient celle de la
 * séance, avec son allure moyenne. Un tracé GPS garde la sienne.
 */
export function avecDistanceSaisie(vue: VueEffort, distanceM: number | null): VueEffort {
  if (vue.trace.length || !distanceM || distanceM <= 0) return vue;
  return { ...vue, distanceM, allure: allureSParKm(distanceM, vue.dureeMouvementS) };
}

/** Un point sur `pas`, le dernier toujours gardé. */
export function decimer<T>(l: readonly T[], max = POINTS_DESSIN): T[] {
  if (l.length <= max) return [...l];
  const pas = (l.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => l[Math.round(i * pas)]!);
}

/** Distance (m) au temps de séance `s` (ms), interpolée entre deux points. */
export function distanceA(points: readonly Pick<Point, "s">[], cumul: readonly number[], s: number): number {
  if (!points.length) return 0;
  if (s <= points[0]!.s) return cumul[0]!;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (s <= b.s) return b.s > a.s ? cumul[i - 1]! + ((s - a.s) / (b.s - a.s)) * (cumul[i]! - cumul[i - 1]!) : cumul[i]!;
  }
  return cumul[cumul.length - 1]!;
}

/** Temps passé (s) et FC pondérée par le temps sur [deS, aS[ (ms) : chaque échantillon couvre jusqu'au suivant, TROU_FC_S au plus. */
export function fcSur(fc: readonly Pick<EchantillonFc, "s" | "bpm">[], fcMax: RefZones, deS = -Infinity, aS = Infinity) {
  const zones: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  let somme = 0;
  let temps = 0;
  let max: number | null = null;
  for (let i = 0; i < fc.length; i++) {
    const f = fc[i]!;
    const suivant = fc[i + 1]?.s ?? f.s + 1000;
    const debut = Math.max(f.s, deS);
    const fin = Math.min(suivant, f.s + TROU_FC_S * 1000, aS);
    if (fin <= debut) continue;
    const dt = (fin - debut) / 1000;
    zones[zoneDe(f.bpm, fcMax)] += dt;
    somme += f.bpm * dt;
    temps += dt;
    max = Math.max(max ?? 0, f.bpm);
  }
  return { zones, moy: temps > 0 ? somme / temps : null, max, temps };
}

/** Zone dominante (Z0 comptée en Z1, comme la planche) ; null sans FC. */
export function zoneDominante(zones: readonly number[]): number | null {
  const z = [zones[0]! + zones[1]!, ...zones.slice(2)];
  const m = Math.max(...z);
  return m > 0 ? z.indexOf(m) + 1 : null;
}

/** Zone de chaque point d'après l'échantillon le plus récent (TROU_FC_S au plus) : 1 à 5 (sous Z1 : Z1), 0 sans FC. */
export function zonesTrace(points: readonly Pick<Point, "s">[], fc: readonly Pick<EchantillonFc, "s" | "bpm">[], fcMax: RefZones): number[] {
  const out: number[] = [];
  let j = 0;
  for (const p of points) {
    while (j + 1 < fc.length && fc[j + 1]!.s <= p.s) j++;
    const f = fc[j];
    out.push(f && f.s <= p.s && p.s - f.s <= TROU_FC_S * 1000 ? Math.max(1, zoneDe(f.bpm, fcMax)) : 0);
  }
  return out;
}

// les calories d'une séance : kcal-seance.ts (calculées chez nous, comme la page Énergie)

/** Tout le résumé d'un suivi enregistré. `dureeS` : durée de la séance hors pauses (celle de la série). */
/** `unite` : le découpage « Par km » devient « Par mile » en miles (calculé ici depuis les points, rien n'est stocké). */
/** `fcMaxProfil` : les zones personnelles (lireZonesFc), ou une FC max seule (ses tranches de 10 %). */
export function vueEffort(d: DonneesSuivi, dureeS: number, fcMaxProfil: RefZones, unite: UniteDistance = uniteActive()): VueEffort {
  const pts = d.points;
  const cumul = distancesCumulees([...pts]);
  const distanceM = cumul.length ? cumul[cumul.length - 1]! : 0;
  const finMs = Math.max(dureeS * 1000, pts.at(-1)?.s ?? 0, d.fc.at(-1)?.s ?? 0);
  const fc = fcSur(d.fc, fcMaxProfil);
  const avecFc = fc.temps > 0;

  const alt = lisserAltitude(altitudesRecalees(pts), d.barometre);
  const valeursAlt = alt.filter((a): a is number => a != null);
  const altitude = valeursAlt.length >= 2
    ? {
        min: Math.min(...valeursAlt),
        max: Math.max(...valeursAlt),
        plus: d.denivelePlusM ?? denivele(alt).plus,
        approx: !d.barometre,
      }
    : null;

  // Bornes des tours : temps du toucher, distance recalculée depuis les points (le TS fait foi, comme à la fin du lot 2).
  const reperes = [...d.bornes].sort((a, b) => a.s - b.s).filter((b) => b.s > 0 && b.s < finMs).map((b) => ({ s: b.s / 1000, d: distanceA(pts, cumul, b.s) }));
  const lignesTours = tours(
    reperes.map((r) => ({ s: r.s * 1000, d: r.d })),
    { s: finMs, d: distanceM },
  ).map((tr): LigneTour => {
    const f = fcSur(d.fc, fcMaxProfil, tr.debutS * 1000, tr.finS * 1000);
    const dedans = alt.filter((_, i) => pts[i]!.s >= tr.debutS * 1000 && pts[i]!.s <= tr.finS * 1000);
    return {
      n: tr.n,
      distanceM: tr.distanceM,
      dureeS: tr.dureeS,
      allure: tr.allure,
      fcMoy: f.moy == null ? null : Math.round(f.moy),
      zone: zoneDominante(f.zones),
      dPlus: dedans.some((a) => a != null) ? Math.round(denivele(dedans).plus) : null,
      finS: tr.finS,
    };
  });

  const morceaux = parKm([...pts], metresParUnite(unite));
  const entiers = morceaux.filter((m) => !m.partiel && m.allure);
  const plusRapide = Math.max(0, ...entiers.map((m) => 1 / m.allure!));
  const km = morceaux.map((m): LigneKm => {
    const f = fcSur(d.fc, fcMaxProfil, m.debutS * 1000, m.finS * 1000);
    const fcMoy = f.moy == null ? null : Math.round(f.moy);
    return {
      n: m.n,
      distanceM: m.distanceM,
      allure: m.allure,
      fcMoy,
      zone: fcMoy == null ? 0 : Math.max(1, zoneDe(fcMoy, fcMaxProfil)),
      vitesse: m.allure && plusRapide > 0 ? Math.min(1, 1 / m.allure / plusRapide) : 0,
      partiel: m.partiel,
    };
  });

  const zones = zonesTrace(pts, d.fc, fcMaxProfil);
  const trace = decimer(
    pts.map((p, i): PointTrace => ({ lat: p.lat, lon: p.lon, s: p.s / 1000, d: cumul[i]!, zone: zones[i]!, alt: alt[i] ?? null })),
  );
  // Altitude plate (moins d'1 m d'écart : capteur figé, ou vraiment plat) : pas de profil ni de mode « Altitude » à montrer.
  const plate = !altitude || altitude.max - altitude.min < 1;
  const serieAlt = plate ? [] : decimer(
    pts.flatMap((p, i) => (alt[i] == null ? [] : [{ s: p.s / 1000, d: cumul[i]!, alt: alt[i]! }])),
    300,
  );
  const serieFc = serieCourbeFc(d.fc, 300);

  // Allure en mouvement : sans l'attente du premier point GPS ni les arrêts (comme « Par km ») ; sans tracé, la durée.
  const mvt = tempsMouvementCumule(pts, cumul);
  const dureeMouvementS = mvt.length > 1 ? mvt[mvt.length - 1]! : dureeS;
  return {
    dureeS,
    dureeMouvementS,
    distanceM,
    allure: allureSParKm(distanceM, dureeMouvementS),
    fcMoy: fc.moy == null ? null : Math.round(fc.moy),
    fcMax: fc.max,
    zonesS: avecFc ? fc.zones : null,
    bornes: bornesDe(fcMaxProfil),
    fcMaxProfil: maxDe(fcMaxProfil),
    zonesFc: typeof fcMaxProfil === "number" ? null : fcMaxProfil,
    altitude,
    tours: reperes.length ? lignesTours : [],
    km,
    trace,
    serieFc,
    coupureFc: bilanCoupure(d.fc, finMs),
    serieAlt,
    reperes,
  };
}

/** Mélange de deux couleurs « #rrggbb » (altitude : bas → haut). */
export function melange(a: string, b: string, k: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const x = Math.min(1, Math.max(0, k));
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * x).toString(16).padStart(2, "0")).join("")}`;
}

/** Position 0 à 1 d'une altitude entre le min et le max (milieu si plat). */
export const niveauAlt = (a: number, min: number, max: number) => (max > min ? (a - min) / (max - min) : 0.5);

/** Sous ce temps, une zone de la barre de fin est vide : « — » sous son étiquette et mini-barre (planche suivi-gps). */
export const SEUIL_ZONE_S = 30;

/** Un segment de la barre des zones de la fin : position et largeur (px) ; vide sous le seuil. */
export interface SegmentZone {
  x: number;
  l: number;
  vide: boolean;
}

/**
 * Barre des zones de la fin (retour du 29/10) : Z1 à Z5 dans l'ordre, chacune à sa largeur proportionnelle au temps
 * mais jamais sous `minimums[i]` (son étiquette « Zn » et son temps mesurés, plus une marge) ; une zone vide garde ce
 * minimum. L'étiquette se pose ainsi à gauche sous son segment sans chevaucher la suivante. Segments séparés de `ecart`,
 * largeur totale `largeur` (minimums réduits au prorata s'ils ne tiennent pas ; sans aucun temps, mini-barres à gauche).
 */
export function repartitionZones(secondes: readonly number[], largeur: number, minimums: readonly number[], ecart = 2): SegmentZone[] {
  const n = secondes.length;
  const utile = Math.max(0, largeur - ecart * (n - 1));
  const somme = minimums.reduce((a, m) => a + Math.max(0, m), 0);
  const mins = minimums.map((m) => (somme > utile ? (Math.max(0, m) * utile) / somme : Math.max(0, m)));
  const vide = secondes.map((s) => s < SEUIL_ZONE_S);
  const l = [...mins];
  // Remplissage : les zones vides et celles dont la part tombe sous leur minimum le gardent ; le reste se partage au prorata
  // du temps des autres, jusqu'à ce que plus aucune ne repasse sous son minimum.
  const fixe = new Set(vide.flatMap((v, i) => (v ? [i] : [])));
  while (fixe.size < n) {
    const reste = utile - [...fixe].reduce((a, i) => a + mins[i]!, 0);
    const poids = secondes.reduce((a, s, i) => a + (fixe.has(i) ? 0 : s), 0);
    const sous = secondes.flatMap((s, i) => (!fixe.has(i) && (reste * s) / poids < mins[i]! ? [i] : []));
    if (!sous.length) {
      secondes.forEach((s, i) => !fixe.has(i) && (l[i] = (reste * s) / poids));
      break;
    }
    sous.forEach((i) => fixe.add(i));
  }
  // Toutes au minimum alors qu'il reste de la place : elle va à la zone la plus longue.
  const plusLongue = secondes.indexOf(Math.max(...secondes));
  if (fixe.size === n && !vide[plusLongue]) l[plusLongue]! += utile - l.reduce((a, x) => a + x, 0);
  let x = 0;
  return l.map((li, i) => {
    const g = { x, l: li, vide: vide[i]! };
    x += li + ecart;
    return g;
  });
}

/** « 2 min », « 35 s », « 0 min » (barres des zones de la planche Lieux). */
export function dureeZone(s: number): { n: number; unite: "min" | "s" } {
  if (s >= 60) return { n: Math.round(s / 60), unite: "min" };
  if (s >= 1) return { n: Math.round(s), unite: "s" };
  return { n: 0, unite: "min" };
}

/** Amplitude minimale de la courbe d'altitude (m) : 2 m de variation ne remplissent pas toute la hauteur. */
export const AMPLITUDE_ALT_MIN = 20;

/** Bornes de l'échelle d'altitude : le profil centré dans au moins 20 m, une petite marge au-delà (retours du 29/10). */
export function echelleAltitude(min: number, max: number, marge = 1): { lo: number; hi: number } {
  const milieu = (min + max) / 2;
  const demi = Math.max(AMPLITUDE_ALT_MIN / 2, (max - min) / 2 + marge);
  return { lo: milieu - demi, hi: milieu + demi };
}

/** Graduations du temps (min) : toutes les 10 min, 20 au-delà d'une heure (planche Lieux). */
export function graduationsMinutes(finS: number): number[] {
  const min = finS / 60;
  const pas = min > 60 ? 20 : min > 15 ? 10 : 5;
  return Array.from({ length: Math.floor(min / pas) + 1 }, (_, k) => k * pas);
}

/** Graduations de la distance en km : quatre ou cinq repères ronds (en miles : graduationsDistance). */
export const graduationsKm = (distanceM: number): number[] => graduationsDistance(distanceM, "km");

/** Ce que Whoop donne d'une séance (whoop_seance) : sans tracé ni courbe, les FC, les minutes par zone et la distance. */
export interface SeanceWhoopLue {
  dureeS: number;
  distanceM: number | null;
  fcMoy: number | null;
  fcMax: number | null;
  /** Minutes par zone Whoop, Z0 à Z5. */
  zones: readonly number[] | null;
}

/** Bloc d'effort d'une séance vue par Whoop : FC moyenne et max, temps par zone (pas de tracé). Les minutes par zone sont celles
 * de Whoop ; les bornes affichées sont les zones personnelles. `serieFc` : la courbe, quand ses échantillons sont connus (API
 * privée de Whoop, Santé Connect), en s depuis le début de la séance Whoop ; sans eux, les zones seules. */
export function vueEffortWhoop(w: SeanceWhoopLue, fcMaxProfil: RefZones, serieFc: PointCourbeFc[] = []): VueEffort {
  const z = w.zones && w.zones.length === 6 ? (w.zones.map((m) => Math.round(m * 60)) as [number, number, number, number, number, number]) : null;
  const distanceM = w.distanceM && w.distanceM > 0 ? w.distanceM : 0;
  return {
    dureeS: w.dureeS,
    dureeMouvementS: w.dureeS,
    distanceM,
    allure: allureSParKm(distanceM, w.dureeS),
    fcMoy: w.fcMoy == null ? null : Math.round(w.fcMoy),
    fcMax: w.fcMax == null ? null : Math.round(w.fcMax),
    zonesS: z && z.some((s) => s > 0) ? z : null,
    bornes: bornesDe(fcMaxProfil),
    fcMaxProfil: maxDe(fcMaxProfil),
    zonesFc: typeof fcMaxProfil === "number" ? null : fcMaxProfil,
    altitude: null,
    tours: [],
    km: [],
    trace: [],
    serieFc,
    coupureFc: null,
    serieAlt: [],
    reperes: [],
  };
}

/**
 * Bloc d'effort d'une séance sans suivi ni Whoop, mesurée par la FC d'une montre (Santé Connect, docs/SANS-WHOOP.md C7) : FC
 * moyenne et max, temps par zone et courbe, sur la plage murale de la séance ; pas de tracé. `trouS` : temps qu'un échantillon
 * couvre au plus, et silence qui coupe la courbe (une montre peut n'écrire qu'une FC par minute). null sous 2 échantillons.
 */
export function vueEffortFc(
  fc: readonly { t: number; bpm: number }[],
  plage: { debut: number; fin: number },
  dureeS: number,
  fcMaxProfil: RefZones,
  trouS: number,
  points = 300,
): VueEffort | null {
  // [debut, fin[ : l'échantillon pris pile à la fin est déjà celui du repos (la courbe plongeait au dernier point)
  const l = fc.filter((x) => x.t >= plage.debut && x.t < plage.fin && x.bpm >= 25 && x.bpm <= 250).sort((a, b) => a.t - b.t);
  if (l.length < 2) return null;
  const zonesS: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  let somme = 0;
  let temps = 0;
  let max = 0;
  for (let i = 0; i < l.length; i++) {
    const x = l[i]!;
    const d = l[i + 1] ? Math.min(trouS, (l[i + 1]!.t - x.t) / 1000) : 1;
    zonesS[zoneDe(x.bpm, fcMaxProfil)] += d;
    somme += x.bpm * d;
    temps += d;
    max = Math.max(max, x.bpm);
  }
  const serie = serieCourbeFc(l.map((x) => ({ s: x.t - plage.debut, bpm: x.bpm })), points, trouS);
  const vue = vueEffortWhoop({ dureeS, distanceM: null, fcMoy: temps > 0 ? somme / temps : null, fcMax: max, zones: null }, fcMaxProfil, serie);
  return { ...vue, zonesS: zonesS.map(Math.round) as typeof zonesS };
}
