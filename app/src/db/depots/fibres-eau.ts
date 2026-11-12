import { decalerJour } from "../../nutrition/calculs";
import { ajoutEauValide, EAU, FIBRES, fibresDuJour, moyenneFibres, PALIER, type FibresDuJour } from "../../nutrition/fibres-eau";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { consommationsEntre, type Consommation } from "./nutrition";

// ------------------------------------------------------------------ Réglages (migration 185, tous synchronisés sauf le report du palier)

export const CLES_FIBRES_EAU = {
  fibresSuivi: "nutri_fibres_suivi",
  fibresObjectif: "nutri_fibres_objectif_g",
  astuce: "nutri_fibres_astuce",
  eauSuivi: "nutri_eau_suivi",
  eauObjectif: "nutri_eau_objectif_ml",
  /** Jour jusqu'auquel « Plus tard » repousse le palier : reste sur ce téléphone (ni synchronisé, ni lu par l'IA). */
  palierReporte: "nutri_fibres_palier_report",
} as const;

export interface ReglagesFibresEau {
  fibresSuivi: boolean;
  fibresObjectifG: number;
  /** Faux : la carte d'astuce est masquée pour de bon (« Ne plus afficher cette astuce »). */
  astuce: boolean;
  eauSuivi: boolean;
  eauObjectifMl: number;
  palierReporte: string | null;
}

const entier = (v: string | null, min: number, max: number, defaut: number) => {
  const n = v == null ? NaN : Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : defaut;
};

export async function lireReglagesFibresEau(db: Executeur): Promise<ReglagesFibresEau> {
  // Une seule lecture : le Journal la refait pour chaque jour rendu (le jour et ses deux voisins), budget de requêtes de tests/budgets.ts.
  const cles = Object.values(CLES_FIBRES_EAU);
  const l = await db.getAllAsync<{ cle: string; valeur: string }>(`SELECT cle, valeur FROM reglages WHERE cle IN (${cles.map(() => "?").join(",")})`, cles);
  const v = new Map(l.map((x) => [x.cle, x.valeur]));
  const [fs, fo, a, es, eo, pr] = cles.map((c) => v.get(c) ?? null);
  return {
    fibresSuivi: fs === "1",
    fibresObjectifG: entier(fo ?? null, FIBRES.minG, FIBRES.maxG, FIBRES.defautG),
    astuce: a !== "0",
    eauSuivi: es === "1",
    eauObjectifMl: entier(eo ?? null, EAU.minMl, EAU.maxMl, EAU.defautMl),
    palierReporte: pr ?? null,
  };
}

// ------------------------------------------------------------------ Fibres des jours passés

/**
 * Fibres de chaque jour de `debut` à `fin` (« AAAA-MM-JJ », inclus), en une lecture ; un jour sans aliment vaut null (il n'entre pas
 * dans une moyenne). Lit aussi les lignes, pour la carte d'astuce qui en tire un échange.
 */
export async function fibresParJour(db: Executeur, debut: string, fin: string): Promise<{ jours: Map<string, FibresDuJour | null>; lignes: Map<string, Consommation[]> }> {
  const lignes = await consommationsEntre(db, debut, fin);
  const jours = new Map<string, FibresDuJour | null>();
  for (let j = debut; j <= fin; j = decalerJour(j, 1)) jours.set(j, lignes.has(j) ? fibresDuJour(lignes.get(j)!) : null);
  return { jours, lignes };
}

/** Fibres moyennes par jour sur les 14 jours qui précèdent `aujourdhui` (les jours sans aliment ne comptent pas), null sans historique : la présélection de la feuille d'activation. */
export async function moyenneFibres14(db: Executeur, aujourdhui: string): Promise<number | null> {
  const passe = await fibresParJour(db, decalerJour(aujourdhui, -PALIER.jours), decalerJour(aujourdhui, -1));
  return moyenneFibres([...passe.jours.values()]);
}

// ------------------------------------------------------------------ Eau (table eau_ajout)

export interface AjoutEau {
  id: string;
  /** AAAA-MM-JJ, jour local de l'ajout (D8). */
  date: string;
  /** Minutes depuis minuit. */
  heure_min: number;
  ml: number;
  /** Préréglage choisi (verre, tasse, bouteille, gourde), null pour la roue libre. */
  libelle: string | null;
  cree_le: number;
}

const COLONNES = "id, date, heure_min, ml, libelle, cree_le";

/** Les ajouts d'un jour, du plus récent au plus ancien. */
export function listerEau(db: Executeur, date: string): Promise<AjoutEau[]> {
  return db.getAllAsync<AjoutEau>(`SELECT ${COLONNES} FROM eau_ajout WHERE date = ? ORDER BY heure_min DESC, cree_le DESC`, [date]);
}

/** Eau de chaque jour de `debut` à `fin` (« AAAA-MM-JJ », inclus), en ml ; les jours sans ajout sont absents. */
export async function eauParJour(db: Executeur, debut: string, fin: string): Promise<Map<string, number>> {
  const l = await db.getAllAsync<{ date: string; ml: number }>("SELECT date, SUM(ml) AS ml FROM eau_ajout WHERE date >= ? AND date <= ? GROUP BY date", [debut, fin]);
  return new Map(l.map((x) => [x.date, x.ml]));
}

export interface NouvelAjoutEau {
  date: string;
  heureMin: number;
  ml: number;
  libelle?: string | null;
}

function verifier(ml: number, heureMin: number): void {
  if (!ajoutEauValide(ml)) throw new Error("Quantité d'eau illisible");
  if (!Number.isInteger(heureMin) || heureMin < 0 || heureMin >= 1440) throw new Error("Heure illisible");
}

export async function ajouterEau(db: Executeur, a: NouvelAjoutEau, maintenant: number = Date.now()): Promise<AjoutEau> {
  verifier(a.ml, a.heureMin);
  const ajout: AjoutEau = { id: nouvelId(), date: a.date, heure_min: a.heureMin, ml: a.ml, libelle: a.libelle ?? null, cree_le: maintenant };
  await db.runAsync("INSERT INTO eau_ajout (id, date, heure_min, ml, libelle, cree_le) VALUES (?,?,?,?,?,?)", [ajout.id, ajout.date, ajout.heure_min, ajout.ml, ajout.libelle, ajout.cree_le]);
  return ajout;
}

/** Modifie la quantité et l'heure d'un ajout ; le libellé ne change que s'il est donné (null : la roue libre). */
export async function modifierEau(db: Executeur, id: string, m: { ml: number; heureMin: number; libelle?: string | null }): Promise<void> {
  verifier(m.ml, m.heureMin);
  if (m.libelle === undefined) await db.runAsync("UPDATE eau_ajout SET ml = ?, heure_min = ? WHERE id = ?", [m.ml, m.heureMin, id]);
  else await db.runAsync("UPDATE eau_ajout SET ml = ?, heure_min = ?, libelle = ? WHERE id = ?", [m.ml, m.heureMin, m.libelle, id]);
}

export async function supprimerEau(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM eau_ajout WHERE id = ?", [id]);
}

/** Remet un ajout supprimé tel qu'il était (« Annuler »). */
export async function restaurerEau(db: Executeur, a: AjoutEau): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO eau_ajout (id, date, heure_min, ml, libelle, cree_le) VALUES (?,?,?,?,?,?)", [a.id, a.date, a.heure_min, a.ml, a.libelle, a.cree_le]);
}
