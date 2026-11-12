// Mise en forme selon la langue active (DESIGN.md §3) : français = virgule décimale et espace fine insécable dans les milliers ; anglais = point et virgule.
import { lireActif, locale, minuscule, t, tp, type ClePluriel, type UniteDistance } from "../i18n/index";
import { deMurale, formater, murale, parties } from "../i18n/temps";
import { M_PAR_MI } from "./unites";

export { M_PAR_MI };

const formatsNombre = new Map<string, Intl.NumberFormat>();

/** Valeur approchée (kcal estimées, durée prévue, dénivelé sans baromètre) : `approx("2 350")` → « 2 350 ». */
// 31/10, Alex : plus de « ~ » nulle part (« on peut difficilement faire plus précis ») ; la justesse se lit dans la
// Précision pepfit. La fonction reste pour les appels existants : elle rend le texte tel quel.
export function approx(texte: string, _approchee = true): string {
  return texte;
}

export function nombre(n: number, decimales = 1): string {
  const f = Math.round(n * 10 ** decimales) / 10 ** decimales;
  const cle = `${locale()}|${decimales}`;
  let nf = formatsNombre.get(cle);
  if (!nf) {
    nf = new Intl.NumberFormat(locale(), { maximumFractionDigits: decimales, useGrouping: true });
    formatsNombre.set(cle, nf);
  }
  return `${f < 0 ? "−" : ""}${nf.format(Math.abs(f))}`;
}

export type Unite = "kg" | "lbs";
export const LBS_PAR_KG = 2.20462;

export function versUnite(kg: number, u: Unite): number {
  return u === "lbs" ? kg * LBS_PAR_KG : kg;
}

export function depuisUnite(v: number, u: Unite): number {
  return u === "lbs" ? v / LBS_PAR_KG : v;
}

/**
 * Bascule kg / lbs : le nombre affiché (arrondi au dixième comme à l'écran) ne change pas, il est relu dans la nouvelle unité.
 * Rend la charge à enregistrer, en kg (50 kg affichés → lbs : 50 lbs, soit 22,68 kg).
 */
export function relireCharge(kg: number | null, de: Unite, vers: Unite): number | null {
  if (kg == null) return null;
  const affiche = Math.round(versUnite(kg, de) * 10) / 10;
  return Math.round(depuisUnite(affiche, vers) * 1000) / 1000;
}

/** Champ décimal : la virgule devient un point, un seul séparateur, rien d'autre que des chiffres (« 79..,5 » → « 79.5 »). Vaut dans les deux langues. */
export function saisieDecimale(s: string): string {
  const t = s.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const i = t.indexOf(".");
  return i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, "");
}

/** Valeur saisie (« 72,5 ») → nombre, ou null si vide ou illisible. */
export function lireNombre(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function charge(kg: number | null, u: Unite): string {
  return kg == null ? "" : nombre(versUnite(kg, u), 1);
}

export function serieTexte(kg: number | null, reps: number | null, u: Unite, avecUnite = true): string {
  if (kg == null || kg === 0) return reps != null ? t("communs.reps", { n: reps }) : "";
  const c = `${charge(kg, u)}${avecUnite ? ` ${u}` : ""}`;
  return reps != null ? `${c} × ${reps}` : c;
}

/** 1RM estimé, formule d'Epley (comme la base : 79 × (1 + 10/30) = 105,3). */
export function unRm(kg: number, reps: number): number {
  return reps <= 1 ? kg : kg * (1 + reps / 30);
}

/** « 1RM 105 » pour une série saisie (réglage « 1RM estimé en séance ») ; vide sans charge ou sans répétitions. */
export function unRmTexte(kg: number | null, reps: number | null, u: Unite): string {
  if (!kg || kg <= 0 || !reps || reps <= 0) return "";
  return `1RM ${nombre(versUnite(unRm(kg, reps), u), 0)}`;
}

export function dureeRepos(s: number): string {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) return t("communs.s", { n: sec });
  return sec === 0 ? t("communs.min", { n: min }) : `${t("communs.min", { n: min })} ${t("communs.s", { n: sec })}`;
}

/** Durée courte d'une roue en demi-largeur : « 10 s », « 2 min », « 1 min 30 » (planche idee-plein-ecran, superset). */
export function dureeRoueCourte(s: number): string {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) return t("communs.s", { n: sec });
  return sec === 0 ? t("communs.min", { n: min }) : `${t("communs.min", { n: min })} ${String(sec).padStart(2, "0")}`;
}

/** Valeurs de la roue de repos : 0 à 5 min par 5 s, puis par 30 s jusqu'à 10 min. */
export function valeursRepos(): number[] {
  const v: number[] = [];
  for (let s = 0; s <= 300; s += 5) v.push(s);
  for (let s = 330; s <= 600; s += 30) v.push(s);
  return v;
}

/** Indice de la valeur de la roue la plus proche de `s` (à égalité, la plus petite). */
export function indiceRepos(s: number, valeurs: number[] = valeursRepos()): number {
  let meilleur = 0;
  for (let i = 1; i < valeurs.length; i++) if (Math.abs(valeurs[i]! - s) < Math.abs(valeurs[meilleur]! - s)) meilleur = i;
  return meilleur;
}

export function dureeCourte(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return t("communs.min", { n: min });
  return `${t("communs.h", { n: Math.floor(min / 60) })} ${String(min % 60).padStart(2, "0")}`;
}

export function chrono(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const jourCourt = (d: Date | number) => formater(d, { weekday: "short" });
export const moisCourt = (d: Date | number) => formater(d, { month: "short" });
export const moisLong = (d: Date | number) => formater(d, { month: "long" });
/** 5 janv. / Jan 5 */
export const jourMois = (d: Date | number) => formater(d, { day: "numeric", month: "short" });
/** 5 janv. 2024 / Jan 5, 2024 */
export const jourMoisAnnee = (d: Date | number) => formater(d, { day: "numeric", month: "short", year: "numeric" });
/** 12 octobre / October 12 (espace coach : « depuis le 12 octobre »). */
export const jourMoisLong = (d: Date | number) => formater(d, { day: "numeric", month: "long" });
/** 30 octobre 2026 / October 30, 2026 (date d'un accord). */
export const jourMoisAnneeLong = (d: Date | number) => formater(d, { day: "numeric", month: "long", year: "numeric" });
/** lundi 2 novembre / Monday, November 2 */
export const jourDateLong = (d: Date | number) => formater(d, { weekday: "long", day: "numeric", month: "long" });
/** janvier 2024 / January 2024 */
export const moisAnnee = (d: Date | number) => formater(d, { month: "long", year: "numeric" });
/** lun. 5 janv. / Mon, Jan 5 */
export const jourSemaineMois = (d: Date | number) => formater(d, { weekday: "short", day: "numeric", month: "short" });
/** lundi / Monday */
export const jourLong = (d: Date | number) => formater(d, { weekday: "long" });
/** L, M… / M, T… */
export const jourEtroit = (d: Date | number) => formater(d, { weekday: "narrow" });
/** sam. 31 / Sat 31 */
export const jourSemaineNum = (d: Date | number) => formater(d, { weekday: "short", day: "numeric" });
export const jourDuMois = (d: Date | number) => parties(d).jour;
export const anneeDe = (d: Date | number) => parties(d).an;

/** 14:30 en français (24 h, sans zéro devant l'heure : « 9:05 ») ; 2:30 PM en anglais. */
export function heure(d: Date | number): string {
  if (lireActif().langue === "en") return formater(d, { hour: "numeric", minute: "2-digit", hour12: true });
  const p = parties(d);
  return `${p.h}:${String(p.min).padStart(2, "0")}`;
}

/** Heure murale « HH:MM » d'une programmation, dans le format de `heure()` : « 18:00 », « 6:00 PM ». */
export function heureTexte(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const mm = String(m).padStart(2, "0");
  if (lireActif().langue === "en") return `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
  return `${h}:${mm}`;
}

/** Minuit (dans le fuseau choisi) du jour de d : un vrai instant. */
export function debutJour(d: Date | number): Date {
  const m = murale(d);
  return new Date(deMurale(new Date(m.getFullYear(), m.getMonth(), m.getDate())));
}

/** Lundi 0 h (fuseau choisi) de la semaine de d : un vrai instant. */
export function debutSemaine(d: Date | number): Date {
  const m = murale(d);
  return new Date(deMurale(new Date(m.getFullYear(), m.getMonth(), m.getDate() - ((m.getDay() + 6) % 7))));
}

/** Jour d'après (ou d'avant avec n < 0), à minuit dans le fuseau choisi. */
export function ajouterJours(d: Date | number, n: number): Date {
  const m = murale(d);
  return new Date(deMurale(new Date(m.getFullYear(), m.getMonth(), m.getDate() + n)));
}

/** Le 1er du mois de d (décalé de `decalage` mois, négatif pour avant), à minuit dans le fuseau choisi : un vrai instant. */
export function debutMois(d: Date | number, decalage = 0): Date {
  const p = parties(d);
  return new Date(deMurale(new Date(p.an, p.mois + decalage, 1)));
}

/** Nom court du mois `m` (0 à 11) dans la langue active : « janv. » / « Jan ». */
export const nomMoisCourt = (m: number): string => moisCourt(Date.UTC(2000, m, 15, 12));

/** jeu. 22 oct. 2024 / Thu, Oct 22, 2024 */
export const jourSemaineMoisAnnee = (d: Date | number) => formater(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function plage(debut: Date, fin: Date): string {
  const a = parties(debut);
  const b = parties(fin);
  if (a.mois === b.mois && a.an === b.an && lireActif().langue === "fr") return `${a.jour} – ${b.jour} ${moisCourt(fin)}`;
  return `${jourMois(debut)} – ${jourMois(fin)}`;
}

/** Date longue d'une séance passée (planche Lieux) : « Lundi 26 octobre · 18:30 ». */
export function dateLongueSeance(ms: number): string {
  const j = formater(ms, { weekday: "long", day: "numeric", month: "long" });
  return `${j.charAt(0).toLocaleUpperCase() + j.slice(1)}, ${heure(ms)}`;
}

export function dateSeance(ms: number): string {
  const auj = debutJour(Date.now()).getTime();
  const j = debutJour(ms).getTime();
  if (j === auj) return t("communs.dateHeure", { jour: t("communs.aujourdhui"), heure: heure(ms) });
  if (j === debutJour(auj - 43_200_000).getTime()) return t("communs.dateHeure", { jour: t("communs.hier"), heure: heure(ms) });
  return t("communs.dateHeure", { jour: jourSemaineMois(ms), heure: heure(ms) });
}

export function ilYa(ms: number): string {
  const a = parties(debutJour(Date.now()).getTime() + 43_200_000);
  const b = parties(debutJour(ms).getTime() + 43_200_000);
  const jours = Math.round((Date.UTC(a.an, a.mois, a.jour) - Date.UTC(b.an, b.mois, b.jour)) / 86_400_000);
  if (jours <= 0) return t("communs.aujourdhuiMin");
  if (jours === 1) return t("communs.hierMin");
  return t("communs.ilYaJours", { n: jours });
}

/**
 * Heure d'une lecture (Whoop…) : « 16:47 » le jour même, « hier 16:47 », sinon « 28 oct. 16:47 ». Une heure seule laissait
 * croire à une lecture du jour (vu le 30/10 : « aujourd'hui, selon Whoop 16:47 » à 9 h 58, lu la veille).
 */
export function heureLue(ms: number, maintenant: number = Date.now()): string {
  const a = parties(debutJour(maintenant).getTime() + 43_200_000);
  const b = parties(debutJour(ms).getTime() + 43_200_000);
  const jours = Math.round((Date.UTC(a.an, a.mois, a.jour) - Date.UTC(b.an, b.mois, b.jour)) / 86_400_000);
  if (jours <= 0) return heure(ms);
  return `${jours === 1 ? t("communs.hierMin") : jourMois(ms)} ${heure(ms)}`;
}

/** Pluriel d'une clé {one, other} du dictionnaire : « 1 séance », « 3 séances ». */
export function pluriel(n: number, cle: ClePluriel): string {
  return tp(cle, n);
}

/** 90 → « 1:30 » ; vide sans valeur. */
export function tempsTexte(s: number | null): string {
  if (s == null) return "";
  const t = Math.round(s);
  const ss = String(t % 60).padStart(2, "0");
  if (t < 3600) return `${Math.floor(t / 60)}:${ss}`;
  return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${ss}`;
}

/** Chiffres lus de droite à gauche : 2 derniers = secondes, 2 d'avant = minutes, le reste = heures
 *  (« 45 » → 45 s, « 656 » → 6:56, « 45555 » → 4:55:55). Avec deux-points : « 1:30 », « 1:05:00 ». Null si vide ou illisible. */
export function lireTemps(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const c = /^(?:(\d+):)?(\d+):([0-5]?\d)$/.exec(t);
  if (c) return Number(c[1] ?? 0) * 3600 + Number(c[2]) * 60 + Number(c[3]);
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Math.floor(n / 10000) * 3600 + (Math.floor(n / 100) % 100) * 60 + (n % 100);
  }
  const n = lireNombre(t);
  return n != null && n >= 0 ? Math.round(n) : null;
}

/** Espace de la largeur d'un chiffre (U+2007) : les cases vides du masque ne bougent pas les chiffres. */
const CASE_VIDE = "\u2007";

/** Chiffres d'une saisie de temps (6 au plus, les premiers tapés gardés) : « 1:27 » → « 127 ». */
export function chiffresTemps(s: string): string {
  return s.replace(/\D/g, "").slice(0, 6);
}

/** Masque de saisie du temps, rempli de droite à gauche : « 1 » → « ␣␣:␣␣:␣1 », « 127 » → « ␣␣:␣1:27 » ; vide si aucun chiffre. */
export function masqueTemps(chiffres: string): string {
  if (!chiffres) return "";
  const c = chiffres.padStart(6, CASE_VIDE);
  return `${c.slice(0, 2)}:${c.slice(2, 4)}:${c.slice(4)}`;
}

/** Distance d'une séance (tête de la séance passée, planche Lieux) : « 8,2 km » dès le kilomètre, « 800 m » en dessous. */
export function distanceSeance(m: number, u: UniteDistance = lireActif().distance): string {
  if (u === "mi") return m >= M_PAR_MI ? `${nombre(m / M_PAR_MI, 1)} mi` : `${nombre(m * 3.28084, 0)} ft`;
  return m >= 1000 ? `${nombre(m / 1000, 1)} km` : `${nombre(m, 0)} m`;
}

/** Distance : « 2 000 m » sous le kilomètre, « 2,5 km » au-delà. */
export function distanceTexte(m: number | null, u: UniteDistance = lireActif().distance): string {
  if (m == null) return "";
  if (u === "mi") return m >= 10000 ? `${nombre(m / M_PAR_MI, 1)} mi` : `${nombre(m * 3.28084, 0)} ft`;
  return m >= 10000 ? `${nombre(m / 1000, 1)} km` : `${nombre(m, 0)} m`;
}


interface ValeursSerie {
  kg: number | null;
  reps: number | null;
  duree_s: number | null;
  distance_m: number | null;
}

/** Texte compact d'une série selon les colonnes de sa nature (précédent, records, historique). */
export function serieNatureTexte(champs: readonly string[], v: ValeursSerie, u: Unite, avecUnite = true): string {
  const parts: string[] = [];
  const kg = champs.includes("kg") && v.kg != null ? `${charge(v.kg, u)}${avecUnite ? ` ${u}` : ""}` : "";
  if (champs.includes("kg") && champs.includes("reps")) {
    if (kg && v.reps != null) return `${kg} × ${v.reps}`;
    if (v.reps != null) return t("communs.reps", { n: v.reps });
    return kg;
  }
  if (kg) parts.push(kg);
  if (champs.includes("reps") && v.reps != null) parts.push(t("communs.reps", { n: v.reps }));
  // Au-delà d'un kilomètre, en km (« 8,4 km · 45:30 » au lieu de « 8 400 m », coupé dans la colonne Précédent : audit A10).
  if (champs.includes("distance_m") && v.distance_m != null) parts.push(distanceSeance(v.distance_m));
  if (champs.includes("duree_s") && v.duree_s != null) parts.push(tempsTexte(v.duree_s));
  return parts.join(", ");
}

/** Libellé d'un bloc « superset » selon son nombre d'exercices (lexique du 29/10) : Superset (2), Circuit (3 et plus). */
export function libelleSuperset(nbExercices: number): string {
  return t(nbExercices <= 2 ? "communs.biset" : "communs.circuit");
}

/** « Leg Curl Assis (Machine) » → « Leg Curl Assis » : le mouvement sans son équipement, là où la place manque. */
export const nomCourt = (nom: string): string => nom.replace(/\s*\([^)]*\)\s*$/, "");

/** « Leg curl assis (Machine) » → « Leg curl » : les deux premiers mots, dans la barre de repos (« Machine suivante · Leg curl »). */
export const nomMachine = (nom: string): string => nomCourt(nom).split(/\s+/).slice(0, 2).join(" ");

/** Sous-titre de la feuille du repos d'un superset : « Leg extension, puis leg curl ». */
export function enchainementNoms(noms: string[]): string {
  const phrase = (n: string, i: number) => {
    const c = minuscule(nomCourt(n));
    return i === 0 ? c.charAt(0).toLocaleUpperCase() + c.slice(1) : c;
  };
  return noms.map(phrase).reduce((avant, apres) => (avant ? t("ui.reposSuperset.puis", { avant, apres }) : apres), "");
}

/** Titre du choix du repos : « Repos après chaque série », ou « … chaque superset » (« … chaque circuit ») pour `nbExercices`. */
export function titreRepos(nbExercices: number | null): string {
  const quoi = nbExercices == null || nbExercices <= 1 ? "communs.quoiSerie" : nbExercices === 2 ? "communs.quoiBiset" : "communs.quoiCircuit";
  return t("communs.reposApres", { quoi: t(quoi) });
}

/** Plage de répétitions visée : « 8-12 », ou la seule borne renseignée ; null si aucune. */
export function plageTexte(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min != null && max != null) return `${min}-${max}`;
  const v = min ?? max;
  return v != null ? String(v) : null;
}
