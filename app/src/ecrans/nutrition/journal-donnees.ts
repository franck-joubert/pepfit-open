import type { SQLiteDatabase } from "expo-sqlite";
import { appliquerRepetitions, consommationsDuJour, fibresParJour, joursRemplis, lireObjectif, lireReglage, lireReglagesFibresEau, listerEau, listerRepas, type AjoutEau, type Consommation, type Repas, type ReglagesFibresEau } from "../../db";
import { decalerJour, type Objectif } from "../../nutrition/calculs";
import { conseilsDuJour, fibresDuJour, PALIER, palierFibres, totalEauMl, type Echange, type FibresDuJour } from "../../nutrition/fibres-eau";
import { lirePlanning, marque } from "../planif-donnees";

export interface DonneesJournal {
  repas: Repas[];
  lignes: Consommation[];
  objectif: Objectif;
  entrainement: boolean;
  /** Séances terminées ce jour-là (passer en repos demande alors confirmation). */
  seancesFaites: number;
  /** Jours de la semaine affichée avec une séance faite ou programmée (point orange). */
  joursSeance: Set<string>;
  /** Jours de la semaine affichée dont le journal a des aliments (point vert). */
  joursRemplis: Set<string>;
  /** Repas vides ce jour-là que la veille avait : leurs kcal (« Comme hier »). */
  hier: Map<string, number>;
  fibresEau: FibresEauDuJour;
}

/** Fibres et eau du jour affiché (planche Fibres et eau) : réglages, valeurs, et ce qui nourrit la carte du bas. */
export interface FibresEauDuJour {
  reglages: ReglagesFibresEau;
  /** Fibres du jour (null : aucun aliment) ; lues même suivi coupé, c'est peu cher et la feuille d'activation s'en passe. */
  fibres: FibresDuJour | null;
  eauMl: number;
  /** Ajouts d'eau du jour, du plus récent au plus ancien. */
  ajouts: AjoutEau[];
  /** Premier conseil de la carte (le même composant que la page de suivi : aujourd'hui, suivi allumé, conseils non masqués), sinon null. */
  echange: Echange | null;
  /** Objectif suivant proposé par la carte de palier (aujourd'hui seulement), sinon null. */
  palier: number | null;
}

/**
 * Le journal d'un jour : repas allumés (et ceux, éteints, qui ont des aliments ce jour-là), consommations, objectifs du bon
 * jeu, jours de séance et jours remplis de sa semaine. Jour d'entraînement : choisi pour cette date, sinon une séance faite
 * ou programmée ce jour-là. Les répétitions dues ce jour-là sont posées avant la lecture.
 */
export async function lireJournal(db: SQLiteDatabase, date: string, lundi: string, aujourdhui: string, apercu = false): Promise<DonneesJournal> {
  const dimanche = decalerJour(lundi, 6);
  const planning = await lirePlanning(db, lundi, dimanche, Date.now(), { durees: false });
  const joursSeance = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const j = decalerJour(lundi, i);
    if (marque(planning, j) != null) joursSeance.add(j);
  }
  const choix = await lireReglage(db, `nutri_entrainement:${date}`);
  const entrainement = choix != null ? choix === "1" : joursSeance.has(date);
  // Aperçu d'un jour voisin (glissé entre les jours) : lu sans rien écrire ; les répétitions se posent quand on y arrive.
  if (!apercu) await appliquerRepetitions(db, date, entrainement, aujourdhui);
  const [tous, lignes, remplis] = await Promise.all([listerRepas(db, true), consommationsDuJour(db, date), joursRemplis(db, lundi, dimanche)]);
  const avecLignes = new Set(lignes.map((l) => l.repas_id));
  const repas = tous.filter((r) => r.actif || avecLignes.has(r.id));
  const objectif = await lireObjectif(db, entrainement ? "entrainement" : "repos");
  const hier = new Map<string, number>();
  const veille = await consommationsDuJour(db, decalerJour(date, -1));
  for (const r of repas) {
    if (avecLignes.has(r.id)) continue;
    const l = veille.filter((c) => c.repas_id === r.id);
    if (l.length) hier.set(r.id, l.reduce((a, c) => a + c.macros.kcal, 0));
  }
  const seancesFaites = planning.jours.filter((s) => s.faite && s.date === date).length;
  const fibresEau = await lireFibresEau(db, date, aujourdhui, lignes);
  return { repas, lignes, objectif, entrainement, seancesFaites, joursSeance, joursRemplis: remplis, hier, fibresEau };
}

async function lireFibresEau(db: SQLiteDatabase, date: string, aujourdhui: string, lignes: Consommation[]): Promise<FibresEauDuJour> {
  const reglages = await lireReglagesFibresEau(db);
  const ajouts = await listerEau(db, date);
  const fibres = lignes.length ? fibresDuJour(lignes) : null;
  const base = { reglages, fibres, eauMl: totalEauMl(ajouts), ajouts, echange: null, palier: null };
  if (date !== aujourdhui || !reglages.fibresSuivi || !reglages.astuce) return base;
  // Les 14 jours qui précèdent : la série du palier et la semaine de l'échange.
  const passe = await fibresParJour(db, decalerJour(date, -PALIER.jours), decalerJour(date, -1));
  const jours = [...passe.jours.values()];
  const palier = palierFibres({ objectifG: reglages.fibresObjectifG, jours, aujourdhui, reporteJusqua: reglages.palierReporte });
  const semaine = [...lignes, ...[...passe.lignes.entries()].filter(([j]) => j >= decalerJour(date, -6)).flatMap(([, l]) => l)];
  return { ...base, palier, echange: conseilsDuJour({ date, jour: lignes, semaine, n: 1 })[0] ?? null };
}

/**
 * Jours voisins à lire pour l'aperçu du glissé : les jours rendus autour de `date` qui ne sont pas déjà en mémoire. Changer de
 * jour ne relit plus la veille et le lendemain à chaque fois (audit de performance, M4) ; le jour affiché, lui, est toujours relu.
 */
export function voisinsALire(date: string, rendus: Iterable<string>, lus: Readonly<Record<string, unknown>>): string[] {
  return [...rendus].filter((j) => j !== date && !(j in lus));
}
