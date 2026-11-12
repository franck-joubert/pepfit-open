// Suivi GPS, écrans départ et direct (planches/suivi-gps, lot 2) : ce que montrent les écrans, sans React Native (testé
// dans tests/suivi-direct.test.ts). Les calculs de fond (distance, dénivelé, tours) sont dans natif/suivi/logique.ts.
import { locale } from "../i18n/index";
import { familleDeSeance, mesureSport, segmentDepart } from "./familles-sports";
import { allureSParKm, tours, vitesseKmH, type BorneTour, type Tour } from "../natif/suivi/logique";
import { allureAffichee, distanceCompteur, vitesseAffichee } from "./unites";
import type { EchantillonFc, EtatSuivi, Point } from "../natif/suivi/types";
import { bornesDe, maxDe, type RefZones } from "./zones-fc";

/** Recherche du capteur de FC sur l'écran de départ. */
export type EtatFc = { etat: "recherche" } | { etat: "refus" } | { etat: "absente" } | { etat: "trouvee"; appareil: { adresse: string } };

/**
 * Ligne « Capteur cardiaque » du départ (retours du 28/10, b ; multimarque le 06/11) : FC en direct éteinte, ni « recherche » ni
 * « diffusion coupée » ; ces messages ne viennent que si l'utilisateur l'a allumée et que la connexion échoue. Lot 6 de la
 * course guidée : sans capteur qui diffuse, « Activer » ouvre le tuto (Whoop, ceinture) ; « Appareils à proximité » refusés,
 * « Autoriser » les redemande (ou ouvre leur tuto si Android ne les montre plus). Plusieurs capteurs qui diffusent : « Changer »
 * ouvre leur choix. « info » : couleur d'information, jamais le rouge d'une erreur.
 */
export type CleFc = "gps.fcEteinte" | "gps.fcDiffusee" | "gps.fcPlusieurs" | "gps.recherche" | "gps.appareilsRefuses" | "gps.fcCoupee";
export function ligneFc(
  active: boolean,
  fc: EtatFc,
  diffusent = 1,
): { etat: "off" | "ok" | "att" | "info"; cle: CleFc; action: "activer" | "autoriser" | "changer" | null } {
  if (!active) return { etat: "off", cle: "gps.fcEteinte", action: null };
  if (fc.etat === "trouvee") return diffusent > 1 ? { etat: "ok", cle: "gps.fcPlusieurs", action: "changer" } : { etat: "ok", cle: "gps.fcDiffusee", action: null };
  if (fc.etat === "recherche") return { etat: "att", cle: "gps.recherche", action: null };
  return fc.etat === "refus" ? { etat: "info", cle: "gps.appareilsRefuses", action: "autoriser" } : { etat: "info", cle: "gps.fcCoupee", action: "activer" };
}

/** Tuto ouvert depuis la ligne FC du départ (lot 6) : activer la diffusion (Whoop, ceinture), ou « Appareils à proximité ». */
export type Tuto = "fc" | "appareils";

/**
 * Ligne d'état en bas du tuto : rien tant qu'aucun essai n'a été fait depuis son ouverture (il s'ouvre sur un échec, inutile
 * de le redire) ; puis la recherche, la coche verte, ou « toujours rien » en couleur d'information.
 */
export function etatTuto(tuto: Tuto, essaye: boolean, fc: EtatFc, appareils: boolean | null): "recherche" | "ok" | "rien" | null {
  if (!essaye) return null;
  if (tuto === "appareils") return appareils ? "ok" : "rien";
  return fc.etat === "recherche" ? "recherche" : fc.etat === "trouvee" ? "ok" : "rien";
}

/**
 * Retour dans pepfit (de l'appli Whoop, des réglages d'Android, ou ceinture mise) : la FC allumée qui manquait est cherchée
 * de nouveau, seule ; pas pendant une recherche, ni quand elle est trouvée, ni sans « Appareils à proximité ».
 */
export function reessayerAuRetour(active: boolean, fc: EtatFc, appareils: boolean): boolean {
  return active && appareils && (fc.etat === "absente" || fc.etat === "refus");
}

/**
 * Ce que montre l'écran de départ (retours du 28/10, b ; familles-sports, D2 du 30/10 ; 07/11) : le segmenté seulement
 * pour un sport où un GPS a du sens (course, marche, vélo, rando… Extérieur / Intérieur, natation Piscine / Eau libre), grisé sur
 * Extérieur quand l'intérieur est impossible (interieurPossible) ; le GPS seulement pour l'endurance dehors ; la FC en direct
 * partout sauf en récupération (sans zones ni effort). « Écran toujours allumé » reste. `tapis` : le second lieu du segmenté est
 * choisi.
 */
export function capteursDepart(sportId: string, tapis: boolean): { segment: boolean; gps: boolean; fc: boolean } {
  const f = familleDeSeance(sportId, tapis);
  return { segment: segmentDepart(sportId), gps: f === "dehors", fc: f !== "recup" };
}

/**
 * Départ sans GPS (tapis, intérieur) : le suivi en direct sans carte (mode « fc » du service, type « health » d'Android 14,
 * D2 du 29/10), avec ou sans FC ; la séance au chrono seulement sans module de suivi (iOS, APK trop ancien).
 */
export function departSansGps(suiviDisponible: boolean): "fc" | "chrono" {
  return suiviDisponible ? "fc" : "chrono";
}

/**
 * Course, rando : allure ; vélos, vélo à air, roller : vitesse en km/h (planche : « vitesse en km/h à vélo » ; correction 4 du
 * 30/10, familles-sports : mesureSport donne aussi l'unité de l'allure, au km, au 500 m ou au 100 m).
 */
export type Mesure = "allure" | "vitesse";
export const VELO = "cat:bicycling";
export const mesureDe = (exerciceId: string): Mesure => (mesureSport(exerciceId) === "vitesse" ? "vitesse" : "allure");

/** Bornes basses des zones Z1 à Z5 : tranches de 10 % de la FC max, arrondies au bpm supérieur (181 → 91, 109, 127, 145, 163). */
export function bornesZones(fcMax: number): [number, number, number, number, number] {
  return [0.5, 0.6, 0.7, 0.8, 0.9].map((r) => Math.ceil(r * fcMax - 1e-9)) as [number, number, number, number, number];
}

/** Zone 1 à 5 (0 sous Z1), mêmes bornes que la légende : les zones personnelles, ou les tranches d'une FC max. */
export function zoneDe(bpm: number, ref: RefZones): 0 | 1 | 2 | 3 | 4 | 5 {
  const b = bornesDe(ref);
  for (let i = 4; i >= 0; i--) if (bpm >= b[i]!) return (i + 1) as 1 | 2 | 3 | 4 | 5;
  return 0;
}

/** Position du repère sur la barre des zones, de Z1 (0) à la FC max (1). */
export function positionRepere(bpm: number, ref: RefZones): number {
  const z1 = bornesDe(ref)[0], max = maxDe(ref);
  return Math.min(1, Math.max(0, (bpm - z1) / (max - z1)));
}

/** « 32:41 », « 1:02:03 ». */
export function chronoTexte(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const formats = new Map<string, Intl.NumberFormat>();
function fixe(n: number, d: number): string {
  const cle = `${locale()}|${d}`;
  let f = formats.get(cle);
  if (!f) formats.set(cle, (f = new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false })));
  return f.format(n);
}

/** Distance à deux décimales (« 6,26 » km ou mi), tronquée comme un compteur (6,268 km reste 6,26 jusqu'à 6,27). */
export const distanceTexte = distanceCompteur;

/** Allure « 5'08" » ; « — » sans allure. */
export const allureTexte = allureAffichee;

/** Vitesse « 24,6 » (km/h ou mph) ; « — » sans vitesse. */
export const vitesseTexte = vitesseAffichee;

/** Échantillon du direct : temps de séance (ms) et distance (m). */
export interface Echantillon {
  s: number;
  d: number;
}

/** Fenêtre de l'allure du moment (s) : assez courte pour suivre un changement de rythme, assez longue pour lisser le GPS. */
export const FENETRE_ALLURE_S = 30;

/** Ajoute un échantillon et oublie ce qui sort de la fenêtre (en garde un juste avant, pour couvrir toute la fenêtre). */
export function garder(historique: readonly Echantillon[], e: Echantillon, fenetreS = FENETRE_ALLURE_S): Echantillon[] {
  const l = historique.length && historique[historique.length - 1]!.s >= e.s ? historique.slice(0, -1) : [...historique];
  l.push(e);
  const limite = e.s - fenetreS * 1000;
  let i = 0;
  while (i + 1 < l.length && l[i + 1]!.s <= limite) i++;
  return l.slice(i);
}

/** Allure du moment (s/km) sur la fenêtre ; null si moins de 10 m parcourus ou moins de 5 s d'historique. */
export function allureDuMoment(historique: readonly Echantillon[]): number | null {
  if (historique.length < 2) return null;
  const a = historique[0]!;
  const b = historique[historique.length - 1]!;
  const dureeS = (b.s - a.s) / 1000;
  if (dureeS < 5) return null;
  return allureSParKm(b.d - a.d, dureeS);
}

/** Vitesse du moment (km/h) sur la même fenêtre ; null sans historique. */
export function vitesseDuMoment(historique: readonly Echantillon[]): number | null {
  if (historique.length < 2) return null;
  const a = historique[0]!;
  const b = historique[historique.length - 1]!;
  const dureeS = (b.s - a.s) / 1000;
  return dureeS >= 5 ? vitesseKmH(b.d - a.d, dureeS) : null;
}

/** Tour en cours (avant le premier toucher, « Tour 1 » couvre toute la course). */
export function tourEnCours(e: Pick<EtatSuivi, "tours" | "tempsMs" | "distanceM">): Tour {
  const bornes: BorneTour[] = e.tours.map((t) => ({ s: t.s, d: t.d }));
  return tours(bornes, { s: e.tempsMs, d: e.distanceM }).at(-1)!;
}

/** Dernier tour fini (celui que le bloc montre 3 s après le toucher) ; null avant le premier toucher. */
export function dernierTourFini(e: Pick<EtatSuivi, "tours" | "tempsMs" | "distanceM">): Tour | null {
  if (e.tours.length === 0) return null;
  const bornes: BorneTour[] = e.tours.map((t) => ({ s: t.s, d: t.d }));
  const l = tours(bornes, { s: e.tempsMs, d: e.distanceM });
  return l[l.length - 2] ?? null;
}

/** Durée du retour visuel après un toucher de Tour (planche : 3 s, fond s2 et coche verte). */
export const RETOUR_TOUR_MS = 3000;
/** Durée de la ligne « GPS retrouvé » avant qu'elle disparaisse (règle des alertes avec clôture). */
export const GPS_RETROUVE_MS = 4000;

export type AlerteGps = "perdu" | "retrouve" | null;

/**
 * Ligne d'alerte du GPS : « GPS perdu » tant qu'il l'est, puis « GPS retrouvé » GPS_RETROUVE_MS, puis rien. `perduDepuis` :
 * moment de la perte en cours, `retrouveA` : moment du retour (ms murales), tenus par l'écran.
 */
export function alerteGps(etat: EtatSuivi["gps"]["etat"] | null, retrouveA: number | null, maintenant: number): AlerteGps {
  if (etat === "perdu") return "perdu";
  if (retrouveA != null && maintenant - retrouveA < GPS_RETROUVE_MS) return "retrouve";
  return null;
}

/** Précision affichée dans l'en-tête et au départ : « ±4 m ». */
export const precisionTexte = (m: number | null) => (m == null ? null : `±${Math.max(1, Math.round(m))} m`);

/** Le GPS est prêt au départ : un fix assez précis pour compter (même seuil que la distance). */
export const gpsPret = (precision: number | null) => precision != null && precision <= 30;

// ——— Mini-tracé ———

export interface Pt {
  x: number;
  y: number;
}

/** Cadre de `projeter` : longitudes rapportées à cos(lat du départ), origine, échelle (dp par degré de latitude), décalages. */
function cadreProjection(points: readonly { lat: number; lon: number }[], l: number, h: number, marge: number, haut: number) {
  const lat0 = points[0]!.lat;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.lon * kx);
  const ys = points.map((p) => -p.lat);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const bw = Math.max(...xs) - x0;
  const bh = Math.max(...ys) - y0;
  const k = Math.min(bw > 0 ? (l - 2 * marge) / bw : Infinity, bh > 0 ? (h - haut - marge) / bh : Infinity);
  const echelle = Number.isFinite(k) ? k : 0;
  return { kx, xs, ys, x0, y0, echelle, ox: (l - bw * echelle) / 2, oy: haut + (h - haut - marge - bh * echelle) / 2 };
}

/**
 * Projette les positions dans un cadre `l` × `h` (nord en haut, échelle égale sur les deux axes), avec `marge` sur les côtés et
 * en bas, et `haut` au-dessus (place du dénivelé), centré comme la planche.
 */
export function projeter(points: readonly { lat: number; lon: number }[], l: number, h: number, marge = 28, haut = 64): Pt[] {
  if (points.length === 0 || l <= 0 || h <= 0) return [];
  const { xs, ys, x0, y0, echelle, ox, oy } = cadreProjection(points, l, h, marge, haut);
  return xs.map((x, i) => ({ x: ox + (x - x0) * echelle, y: oy + (ys[i]! - y0) * echelle }));
}

/** Largeur du monde au zoom 0 chez MapLibre (tuiles de 512, en dp). */
const MONDE_DP = 512;

/**
 * Vue de MapLibre (centre, zoom) sous laquelle le fond de carte tombe juste sous le tracé de `projeter` (mêmes arguments) :
 * Mercator et projection plane se confondent à l'échelle d'une sortie. Tracé d'un seul point : zoom 16 sur lui.
 */
export function vueProjection(points: readonly { lat: number; lon: number }[], l: number, h: number, marge = 28, haut = 64): { centre: [number, number]; zoom: number } | null {
  if (points.length === 0 || l <= 0 || h <= 0) return null;
  const { kx, x0, y0, echelle, ox, oy } = cadreProjection(points, l, h, marge, haut);
  if (echelle <= 0 || kx <= 0) return { centre: [points[0]!.lon, points[0]!.lat], zoom: 16 };
  const lon = (x0 + (l / 2 - ox) / echelle) / kx;
  const lat = -(y0 + (h / 2 - oy) / echelle);
  // Mercator : 512·2^z/360 dp par degré de longitude ; ici kx·échelle.
  return { centre: [lon, lat], zoom: Math.log2((360 * kx * echelle) / MONDE_DP) };
}

/** Zone de chaque point d'après l'échantillon de FC le plus récent (au plus 10 s avant) ; 0 sans FC. */
export function zonesDesPoints(points: readonly Pick<Point, "s">[], fc: readonly Pick<EchantillonFc, "s" | "bpm">[], fcMax: RefZones): number[] {
  const out: number[] = [];
  let j = 0;
  for (const p of points) {
    while (j + 1 < fc.length && fc[j + 1]!.s <= p.s) j++;
    const f = fc[j];
    out.push(f && f.s <= p.s && p.s - f.s <= 10_000 ? zoneDe(f.bpm, fcMax) : 0);
  }
  return out;
}

/** Morceaux du tracé de même zone (indices de début et de fin inclus, qui se touchent). */
export function morceauxParZone(zones: readonly number[]): { debut: number; fin: number; zone: number }[] {
  const out: { debut: number; fin: number; zone: number }[] = [];
  let deb = 0;
  for (let i = 1; i <= zones.length; i++) {
    if (i === zones.length || zones[i] !== zones[deb]) {
      out.push({ debut: deb, fin: Math.min(i, zones.length - 1), zone: zones[deb]! });
      deb = i;
    }
  }
  return zones.length === 1 ? [{ debut: 0, fin: 0, zone: zones[0]! }] : out.filter((m) => m.fin > m.debut);
}

/** Indice du point le plus proche (en temps de séance) de chaque borne de tour. */
export function indicesTours(points: readonly Pick<Point, "s">[], bornes: readonly { s: number }[]): number[] {
  return bornes.map((b) => {
    let meilleur = -1;
    let ecart = Infinity;
    for (let i = 0; i < points.length; i++) {
      const e = Math.abs(points[i]!.s - b.s);
      if (e < ecart) {
        ecart = e;
        meilleur = i;
      }
    }
    return meilleur;
  });
}

/** Altitude retenue d'un point : baromètre (lissé par le natif), sinon GPS. Pour un tracé, préférer altitudesRecalees. */
export const altitudeDe = (p: Pick<Point, "altBaro" | "altGps">) => p.altBaro ?? p.altGps;

/** Précision GPS (m) au-delà de laquelle un point ne sert pas à ancrer le baromètre. */
const PRECISION_ANCRAGE_M = 20;

/**
 * Altitudes d'un tracé, recalées (retour du 29/10 : -109 m à -107 m à Paris). Le baromètre donne les écarts au
 * mètre près mais son zéro suit la pression du jour : il est ancré sur l'altitude GPS par la médiane des écarts (points assez
 * précis). Sans GPS d'altitude, le baromètre brut ; sans baromètre, le GPS.
 */
export function altitudesRecalees(points: readonly Pick<Point, "altBaro" | "altGps" | "precision">[]): (number | null)[] {
  const ecarts = points
    .filter((p) => p.altBaro != null && p.altGps != null && (p.precision ?? 0) <= PRECISION_ANCRAGE_M)
    .map((p) => p.altGps! - p.altBaro!)
    .sort((a, b) => a - b);
  const decalage = ecarts.length ? ecarts[Math.floor(ecarts.length / 2)]! : 0;
  return points.map((p) => (p.altBaro != null ? p.altBaro + decalage : p.altGps));
}
