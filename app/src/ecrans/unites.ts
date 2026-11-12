// Unités du suivi GPS : un seul module pour la distance, l'allure, la vitesse et l'altitude, selon le réglage
// « unité de distance » (km : mètres, /km, km/h ; mi : pieds, /mi, mph). Le stockage reste en mètres et en secondes :
// tout est converti à l'affichage seulement. Pur (sans React) ; l'unité par défaut est celle du réglage actif.
import { lireActif, locale, type UniteDistance } from "../i18n/index";

export const M_PAR_MI = 1609.344;
export const PIEDS_PAR_M = 3.28084;

const formats = new Map<string, Intl.NumberFormat>();
function fixe(n: number, d: number): string {
  const cle = `${locale()}|${d}`;
  let f = formats.get(cle);
  if (!f) formats.set(cle, (f = new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false })));
  return f.format(n);
}

export const uniteActive = (): UniteDistance => lireActif().distance;

/** Longueur d'une unité de distance (m) : 1 000 en km, 1 609,344 en miles. */
export const metresParUnite = (u: UniteDistance = uniteActive()) => (u === "mi" ? M_PAR_MI : 1000);

/** Distance en km ou en miles (nombre), pour les graduations et les découpages. */
export const distanceEnUnite = (m: number, u: UniteDistance = uniteActive()) => m / metresParUnite(u);

/** Libellés courts : « km » / « mi ». */
export const libelleDistance = (u: UniteDistance = uniteActive()) => (u === "mi" ? "mi" : "km");
/** Allure : « /km » / « /mi ». */
export const libelleAllure = (u: UniteDistance = uniteActive()) => (u === "mi" ? "/mi" : "/km");
/** Vitesse : « km/h » / « mph ». */
export const libelleVitesse = (u: UniteDistance = uniteActive()) => (u === "mi" ? "mph" : "km/h");
/** Altitude et dénivelé : « m » / « ft ». */
export const libelleAltitude = (u: UniteDistance = uniteActive()) => (u === "mi" ? "ft" : "m");

/** Compteur à deux décimales (« 6,26 » / « 3.89 »), tronqué comme un compteur (pas arrondi). */
export function distanceCompteur(m: number, u: UniteDistance = uniteActive()): string {
  const v = Math.max(0, m) / metresParUnite(u);
  return fixe(Math.floor(v * 100 + 1e-9) / 100, 2);
}

/** Allure (secondes par km, la valeur stockée) ramenée à l'unité : secondes par mile en miles ; null reste null. */
export const allureEnUnite = (sParKm: number | null, u: UniteDistance = uniteActive()) =>
  sParKm == null ? null : u === "mi" ? (sParKm * M_PAR_MI) / 1000 : sParKm;

/** Allure « 5'08" » (par km ou par mile) ; « — » sans allure. */
export function allureAffichee(sParKm: number | null, u: UniteDistance = uniteActive()): string {
  const a = allureEnUnite(sParKm, u);
  if (a == null || !Number.isFinite(a) || a > 5999) return "—";
  const s = Math.round(a);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}"`;
}

/** Distance saisie (« 8,5 » km ou mi) → mètres arrondis ; null si vide, illisible ou nulle. */
export function metresSaisis(texte: string, u: UniteDistance = uniteActive()): number | null {
  const n = Number(texte.replace(/\s/g, "").replace(",", "."));
  return texte.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * metresParUnite(u)) : null;
}

/** Vitesse (km/h, la valeur stockée) ramenée à l'unité : mph en miles. */
export const vitesseEnUnite = (kmh: number, u: UniteDistance = uniteActive()) => (u === "mi" ? (kmh * 1000) / M_PAR_MI : kmh);

/** Vitesse « 24,6 » (km/h ou mph) ; « — » sans vitesse. */
export const vitesseAffichee = (kmh: number | null, u: UniteDistance = uniteActive()) =>
  kmh == null || !Number.isFinite(kmh) ? "—" : fixe(vitesseEnUnite(kmh, u), 1);

/** Altitude ou dénivelé (m) dans l'unité d'altitude : pieds en miles. Nombre arrondi à l'entier. */
export const altitudeEnUnite = (m: number, u: UniteDistance = uniteActive()) => Math.round(u === "mi" ? m * PIEDS_PAR_M : m);

/** Graduations de la distance (en km ou en miles) : quatre ou cinq repères ronds. */
export function graduationsDistance(distanceM: number, u: UniteDistance = uniteActive()): number[] {
  const d = distanceEnUnite(distanceM, u);
  const pas = d > 20 ? 5 : d > 6 ? 2 : d > 2.5 ? 1 : 0.5;
  return Array.from({ length: Math.floor(d / pas + 1e-9) + 1 }, (_, k) => Math.round(k * pas * 10) / 10);
}
