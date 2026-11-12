// Données des pages Poids et Masse grasse (planche pas) : pesées (table pesee), % de gras (mesure_corps, balance par Santé
// Connect, Whoop, saisie), objectif de poids de Nutrition (nutri_poids_cible, nutri_rythme). Rien d'inventé : sans relevé,
// null. Les données du corps elles-mêmes (préremplissage, profil) sont le chantier de la page Corps (branche corps).
import { ajouterMesures, historiqueMensuration, historiqueMesure, listerPesees, lireReglage, type Executeur, type Mensuration, type Pesee, type TypeMensuration } from "../../db/api";
import { ecart } from "../composition-vue";
import { ORDRE_TOURS } from "./tours-calc";
import { lisseAu, serieJours, dateDans, pente, type Releve } from "./corps-calc";
import { decaler, minuit } from "./periodes";

export type CleCorps = "poids" | "gras";

/** Pesées, de la plus ancienne à la plus récente. */
export async function lirePesees(db: Executeur): Promise<Releve[]> {
  const l = await listerPesees(db);
  return l.map((p) => ({ id: p.id, date: p.date, valeur: p.kg, manuel: p.source === "manuel", origine: p.origine })).reverse();
}

/** Mesures de % de gras, de la plus ancienne à la plus récente (Whoop prime sur un doublon de la même nuit). */
export async function lireGras(db: Executeur): Promise<Releve[]> {
  const l = await historiqueMesure(db, "gras");
  return l.map((m) => ({ id: m.id, date: m.date, valeur: m.valeur, manuel: m.source === "manuel", origine: m.origine })).reverse();
}

/** Pages Poids et Masse grasse : tout ce qu'elles lisent dans la base (ni Santé Connect ni réseau : M8, docs/PERF-A.md). */
export async function lireDonneesCorps(db: Executeur, poids: boolean) {
  const [kg, gras, objectif, tours] = await Promise.all([lirePesees(db), lireGras(db), lireObjectifPoids(db), poids ? lireTours(db) : ({} as Tours)]);
  const pesees = [...kg].reverse().map((r): Pesee => ({ id: r.id, date: r.date, kg: r.valeur, source: r.manuel ? "manuel" : "sante_connect", origine: r.origine }));
  return { kg, gras, objectif, tours, pesees };
}

/** Les tours au mètre ruban de la page Poids (D2), de haut en bas (planche mensurations, M1), le cou en tête (M10). */
export const TOURS = ORDRE_TOURS;

export type Tours = Partial<Record<TypeMensuration, Mensuration[]>>;

/** Les tours mesurés, chacun de sa mesure la plus récente à la plus ancienne ; un tour jamais mesuré est absent. */
export async function lireTours(db: Executeur): Promise<Tours> {
  const m: Tours = {};
  for (const type of TOURS) {
    const l = await historiqueMensuration(db, type);
    if (l.length) m[type] = l;
  }
  return m;
}

/**
 * Un tour au jour choisi (minuit) : sa mesure la plus récente de ce jour (`duJour`), sinon la dernière d'avant ; celle qui
 * la précède (l'écart affiché, M12) ; l'écart sur les `periode` jours qui finissent ce jour-là. Null si le tour n'avait pas
 * encore été mesuré. `l` : de la plus récente à la plus ancienne (lireTours).
 */
export function tourAuJour(
  l: readonly Mensuration[],
  jour: number,
  periode = 90,
): { m: Mensuration; duJour: boolean; precedente: Mensuration | null; ecart: number | null } | null {
  const fin = decaler(jour, 1);
  const avant = l.filter((x) => x.date < fin);
  const m = avant[0];
  if (!m) return null;
  const debut = decaler(jour, 1 - periode);
  return { m, duJour: m.date >= jour, precedente: avant[1] ?? null, ecart: ecart(avant.filter((x) => x.date >= debut), 1) };
}

export function lireReleves(db: Executeur, cle: CleCorps): Promise<Releve[]> {
  return cle === "poids" ? lirePesees(db) : lireGras(db);
}

/** Saisie d'un % de gras (source « manuel ») ; refusée hors de 2 à 70 %. */
export async function ajouterGras(db: Executeur, valeur: number, date: number = Date.now()): Promise<boolean> {
  if (!(valeur >= 2 && valeur <= 70)) return false;
  return (await ajouterMesures(db, "gras", [{ valeur, date, origine: null }], "manuel")) > 0;
}

/** Suppression d'un % de gras saisi (une mesure importée vient de la balance : elle se corrige dans son appli). */
export async function supprimerGras(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM mesure_corps WHERE id = ? AND type = 'gras' AND source = 'manuel'", [id]);
}

export interface ObjectifPoids {
  cible: number;
  /** kg par semaine (négatif pour perdre) ; null s'il n'est pas réglé. */
  rythme: number | null;
}

/** Objectif de poids de Nutrition, null s'il n'est pas réglé. */
export async function lireObjectifPoids(db: Executeur): Promise<ObjectifPoids | null> {
  const cible = Number(await lireReglage(db, "nutri_poids_cible"));
  if (!(cible > 0)) return null;
  const r = Number(await lireReglage(db, "nutri_rythme"));
  return { cible, rythme: Number.isFinite(r) && r !== 0 ? r : null };
}

/** Relevé le plus proche de `date` à moins de 12 h (la « même pesée » d'un poids et d'un % de gras). */
export function memePesee(l: readonly Releve[], date: number): Releve | null {
  let m: Releve | null = null;
  for (const r of l) if (Math.abs(r.date - date) < 12 * 3_600_000 && (!m || Math.abs(r.date - date) < Math.abs(m.date - date))) m = r;
  return m;
}

export interface ResumeCorps {
  poids: Releve | null;
  gras: Releve | null;
  /** Moyenne lissée d'aujourd'hui. */
  lisseKg: number | null;
  lisseGras: number | null;
  /** Écart de la moyenne lissée sur 30 jours (kg ; points de gras). */
  ecart30Kg: number | null;
  ecart30Gras: number | null;
  /** Moyenne lissée des 30 derniers jours, de la plus ancienne à aujourd'hui (jours d'avant le premier relevé exclus). */
  serieKg: number[];
  serieGras: number[];
  /** Tendance (kg/semaine) sur 28 jours. */
  tendanceKg: number | null;
  objectif: (ObjectifPoids & { dateRythme: number | null }) | null;
}

/** Ce que montrent les cartes (Accueil, case double de Santé). */
export async function lireResumeCorps(db: Executeur, maintenant = Date.now()): Promise<ResumeCorps> {
  const [kg, gras, objectif] = await Promise.all([lirePesees(db), lireGras(db), lireObjectifPoids(db)]);
  const auj = minuit(maintenant);
  const serie = (l: Releve[]) => serieJours(l, decaler(auj, -29), auj);
  const sKg = serie(kg), sGras = serie(gras);
  const valeurs = (s: typeof sKg) => s.map((p) => p.l).filter((v): v is number => v != null);
  const ecart = (l: Releve[], s: typeof sKg) => {
    const a = lisseAu(l, decaler(auj, -30)), b = s[s.length - 1]?.l ?? null;
    return a != null && b != null ? b - a : null;
  };
  const lisseKg = sKg[sKg.length - 1]?.l ?? null;
  return {
    poids: kg[kg.length - 1] ?? null,
    gras: gras[gras.length - 1] ?? null,
    lisseKg,
    lisseGras: sGras[sGras.length - 1]?.l ?? null,
    ecart30Kg: ecart(kg, sKg),
    ecart30Gras: ecart(gras, sGras),
    serieKg: valeurs(sKg),
    serieGras: valeurs(sGras),
    tendanceKg: pente(serieJours(kg, decaler(auj, -27), auj)),
    objectif: objectif ? { ...objectif, dateRythme: lisseKg != null ? dateDans(lisseKg, objectif.cible, objectif.rythme, maintenant) : null } : null,
  };
}
