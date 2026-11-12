// Inventaire d'une salle (machines, poids libres, postes), détection des équipements vus en séance et retrait d'un équipement.
import { transaction } from "../exclusif";
import { nomSql } from "../noms";
import { depuisUnite, type Unite } from "../../ecrans/format";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import {
  categorieDe, dansUnite, depasse, estPoidsLibre, libelleEquipementSalle, machineDe, nomMachineAffiche, palierParDefaut, posteDe,
  typeEquipementDe, type PoidsLibre, type TypeEquipementSalle,
} from "../inventaire";
import type { GenreMateriel } from "../materiel";
import { MACHINES, MACHINE_DE_EXERCICE } from "../machines";
import { EQUIPEMENTS, estEquipement, type Equipement } from "../natures";
import { paliersReguliers } from "../paliers";
import type { Appareil, TypeAppareil } from "../types";
import { chargesDe, ecrireMateriel, lignesMateriel, lireMateriel, nouvelleBarre, restaurerLignes, retirerMateriel, type LigneMateriel } from "./materiel";
import { lireReglage } from "./reglages";

// ---------------------------------------------------------------- unité du profil

export async function uniteProfil(db: Executeur): Promise<Unite> {
  return (await lireReglage(db, "unite")) === "lbs" ? "lbs" : "kg";
}

// ---------------------------------------------------------------- lecture

export interface MachineLigne {
  id: string;
  machineId: string | null;
  nom: string;
  type: TypeAppareil;
  palier: number | null;
  max: number | null;
  /** Pile : première charge ; machine à disques : poids à vide. */
  min: number | null;
  /** Petites masses d'appoint d'une pile. */
  appoint: number[];
  unite: Unite;
  exerciceIds: string[];
}

export interface Inventaire {
  machines: MachineLigne[];
  /** Équipements cochés de la salle (postes et familles). */
  equipements: Equipement[];
}

/** Ancienne ligne de salle_poids_libre (avant la migration 66), dans les retraits et confirmations gardés. */
interface LignePoidsLibre {
  salle_id: string;
  type: PoidsLibre;
  min_val: number | null;
  max_val: number | null;
  pas: number | null;
  liste: string;
  unite: Unite;
}

/** Matériel que donne un poids libre de l'inventaire (détection, retrait). */
const GENRES_DE: Record<PoidsLibre, GenreMateriel[]> = { halteres: ["halteres", "reglables"], kettlebell: ["kettlebell"], barre: ["barre", "disques"] };

const appointDe = (s: string | null | undefined): number[] => {
  try {
    return (JSON.parse(s ?? "[]") as number[]).filter((x) => typeof x === "number" && x > 0);
  } catch {
    return [];
  }
};

async function equipementsDe(db: Executeur, salleId: string): Promise<Equipement[]> {
  const s = await db.getFirstAsync<{ equipements: string }>("SELECT equipements FROM salle WHERE id = ?", [salleId]);
  return (s?.equipements ?? "").split("|").filter(estEquipement);
}

async function ecrireEquipements(db: Executeur, salleId: string, eq: readonly Equipement[]): Promise<void> {
  await db.runAsync("UPDATE salle SET equipements = ?, maj_le = ? WHERE id = ?", [EQUIPEMENTS.filter((e) => eq.includes(e)).join("|"), Date.now(), salleId]);
}

/** Coche (ou décoche) un équipement de la salle ; renvoie vrai si la liste a changé. */
async function cocher(db: Executeur, salleId: string, e: Equipement, coche: boolean): Promise<boolean> {
  const eq = await equipementsDe(db, salleId);
  if (eq.includes(e) === coche) return false;
  await ecrireEquipements(db, salleId, coche ? [...eq, e] : eq.filter((x) => x !== e));
  return true;
}

export async function lireInventaire(db: Executeur, salleId: string): Promise<Inventaire> {
  const apps = await db.getAllAsync<Appareil & { paliers_kg: string; min_val: number | null; appoint: string | null }>("SELECT * FROM appareil WHERE salle_id = ? ORDER BY nom COLLATE NOCASE", [salleId]);
  const liens = await db.getAllAsync<{ appareil_id: string; exercice_id: string }>(
    "SELECT ae.appareil_id, ae.exercice_id FROM appareil_exercice ae JOIN appareil a ON a.id = ae.appareil_id WHERE a.salle_id = ?",
    [salleId],
  );
  return {
    machines: apps.map((a) => ({
      id: a.id, machineId: a.machine_id, nom: nomMachineAffiche(a.machine_id, a.nom), type: a.type, palier: a.palier, max: a.max_val, min: a.min_val,
      appoint: appointDe(a.appoint), unite: a.unite,
      exerciceIds: liens.filter((x) => x.appareil_id === a.id).map((x) => x.exercice_id),
    })),
    equipements: await equipementsDe(db, salleId),
  };
}

// ---------------------------------------------------------------- réglages

/** Paliers (kg) d'une machine dont on connaît palier et max : du palier au max, par palier. Vide sans l'un des deux. */
export function paliersDeMachine(palier: number | null, max: number | null, unite: Unite): number[] {
  if (!palier || palier <= 0 || !max || max < palier) return [];
  return paliersReguliers(palier, palier, max).map((v) => Math.round(depuisUnite(v, unite) * 100) / 100);
}

export interface ReglageMachine {
  palier?: number | null;
  max?: number | null;
  /** Pile : première charge ; disques : poids à vide. */
  min?: number | null;
  appoint?: number[];
  /** Mode de chargement (pile, disques) : le type de l'appareil. */
  type?: TypeAppareil;
  unite?: Unite;
}

/** Palier, max, première charge (ou poids à vide), petites masses et unité d'une machine ; ses paliers (kg) suivent. */
export async function reglerMachine(db: Executeur, appareilId: string, patch: ReglageMachine): Promise<void> {
  const a = await db.getFirstAsync<Appareil & { min_val: number | null; appoint: string | null }>("SELECT * FROM appareil WHERE id = ?", [appareilId]);
  if (!a) return;
  const palier = patch.palier === undefined ? a.palier : patch.palier;
  const max = patch.max === undefined ? a.max_val : patch.max;
  const min = patch.min === undefined ? a.min_val : patch.min;
  const appoint = patch.appoint ? JSON.stringify(patch.appoint.filter((x) => x > 0).slice(0, 4)) : (a.appoint ?? "[]");
  const unite = patch.unite ?? a.unite;
  await db.runAsync("UPDATE appareil SET palier = ?, max_val = ?, min_val = ?, appoint = ?, type = ?, unite = ?, paliers_kg = ? WHERE id = ?", [
    palier, max, min, appoint, patch.type ?? a.type, unite, JSON.stringify(paliersDeMachine(palier, max, unite)), appareilId,
  ]);
}

export interface NouvelleMachine {
  machineId: string;
  palier?: number;
  max?: number | null;
  /** Première charge d'une pile, poids à vide d'une machine à disques. */
  min?: number | null;
  appoint?: number[];
  /** Chargée à disques (sinon : à pile, ou la famille du catalogue). */
  disques?: boolean;
  unite?: Unite;
}

/** Ajoute des machines du catalogue à la salle (déjà présentes : ignorées) ; leurs exercices du catalogue y sont rattachés. Renvoie les appareils créés. */
export async function ajouterMachines(db: Executeur, salleId: string, machines: readonly NouvelleMachine[]): Promise<string[]> {
  let ids: string[] = [];
  await transaction(db, async (db) => void (ids = await ajouterMachinesSec(db, salleId, machines)));
  return ids;
}

async function ajouterMachinesSec(db: Executeur, salleId: string, machines: readonly NouvelleMachine[]): Promise<string[]> {
  const unite = await uniteProfil(db);
  const ids: string[] = [];
  {
    for (const m of machines) {
      const cat = MACHINES.find((x) => x.id === m.machineId);
      if (!cat) continue;
      if (await db.getFirstAsync("SELECT 1 FROM appareil WHERE salle_id = ? AND machine_id = ?", [salleId, m.machineId])) continue;
      const u = m.unite ?? unite;
      const palier = m.palier ?? palierParDefaut(m.machineId, u);
      const max = m.max ?? null;
      const id = nouvelId();
      const type: TypeAppareil = m.disques ? (cat.famille === "smith" ? "smith" : "disques") : cat.famille === "machine" ? "pile" : cat.famille;
      await db.runAsync("INSERT INTO appareil (id, salle_id, nom, type, paliers_kg, machine_id, palier, max_val, min_val, appoint, unite) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
        id, salleId, cat.nom, type, JSON.stringify(paliersDeMachine(palier, max, u)), m.machineId, palier, max, m.min ?? null,
        JSON.stringify((m.appoint ?? []).filter((x) => x > 0).slice(0, 4)), u,
      ]);
      await db.runAsync(
        `INSERT OR IGNORE INTO appareil_exercice (appareil_id, exercice_id)
         SELECT ?, e.id FROM exercices e WHERE e.slug IN (SELECT value FROM json_each(?))`,
        [id, JSON.stringify(slugsDeMachine(m.machineId))],
      );
      await cocher(db, salleId, cat.famille, true);
      ids.push(id);
    }
  }
  return ids;
}

export const slugsDeMachine = (machineId: string): string[] => Object.keys(MACHINE_DE_EXERCICE).filter((s) => MACHINE_DE_EXERCICE[s] === machineId);

/** Unité d'affichage d'un exercice fait dans cette salle : celle de son équipement (machine, haltères, kettlebell, barre), sinon null. */
export async function uniteEquipementPour(db: Executeur, exerciceId: string, salleId: string | null): Promise<Unite | null> {
  if (!salleId) return null;
  const a = await db.getFirstAsync<{ unite: Unite }>(
    `SELECT a.unite FROM appareil a JOIN appareil_exercice ae ON ae.appareil_id = a.id
     WHERE a.salle_id = ? AND ae.exercice_id = ? ORDER BY a.nom LIMIT 1`,
    [salleId, exerciceId],
  );
  if (a) return a.unite;
  const e = await db.getFirstAsync<{ slug: string | null; equipement: Equipement }>("SELECT slug, equipement FROM exercices WHERE id = ?", [exerciceId]);
  const type = e ? typeEquipementDe(e) : null;
  if (!type || !estPoidsLibre(type)) return null;
  return (await lignesMateriel(db, salleId, GENRES_DE[type]))[0]?.unite ?? null;
}

/** Salle sans machine du catalogue inventoriée : tout reste proposé (planche D8). */
export async function salleAvecMachines(db: Executeur, salleId: string): Promise<boolean> {
  return !!(await db.getFirstAsync("SELECT 1 FROM appareil WHERE salle_id = ? AND machine_id IS NOT NULL LIMIT 1", [salleId]));
}

// ---------------------------------------------------------------- état d'un équipement

interface Etat {
  present: boolean;
  /** Plafond en kg (max de la machine, des haltères, de la barre ; plus lourde kettlebell). Null : pas de plafond saisi. */
  plafondKg: number | null;
}

async function etat(db: Executeur, salleId: string, type: TypeEquipementSalle, exerciceId?: string): Promise<Etat> {
  const m = machineDe(type);
  if (m) {
    const a =
      (await db.getFirstAsync<{ max_val: number | null; unite: Unite }>("SELECT max_val, unite FROM appareil WHERE salle_id = ? AND machine_id = ?", [salleId, m])) ??
      (exerciceId
        ? await db.getFirstAsync<{ max_val: number | null; unite: Unite }>(
            `SELECT a.max_val, a.unite FROM appareil a JOIN appareil_exercice ae ON ae.appareil_id = a.id WHERE a.salle_id = ? AND ae.exercice_id = ? LIMIT 1`,
            [salleId, exerciceId],
          )
        : null);
    return a ? { present: true, plafondKg: a.max_val == null ? null : depuisUnite(a.max_val, a.unite) } : { present: false, plafondKg: null };
  }
  if (estPoidsLibre(type)) {
    const tous = await lireMateriel(db, salleId);
    const l = tous.filter((m) => GENRES_DE[type].includes(m.genre) && m.genre !== "disques");
    if (l.length) {
      // Barre : plafond saisi (charge maximale) de chaque barre, sinon aucun ; haltères et kettlebells : le plus lourd possédé.
      if (type === "barre") {
        const plafonds = l.map((b) => (b.prechargee ? Math.max(0, ...chargesDe(b, tous)) : b.chargeMax == null ? null : depuisUnite(b.chargeMax, b.unite)));
        return { present: true, plafondKg: plafonds.every((x) => x != null) ? Math.max(...(plafonds as number[])) : null };
      }
      const c = l.flatMap((m) => chargesDe(m, tous));
      return { present: true, plafondKg: c.length ? Math.max(...c) : null };
    }
    const cat = categorieDe(type);
    return { present: !!cat && (await equipementsDe(db, salleId)).includes(cat), plafondKg: null };
  }
  const p = posteDe(type);
  return { present: !!p && (await equipementsDe(db, salleId)).includes(p), plafondKg: null };
}

// ---------------------------------------------------------------- détection

export type StatutDetecte = "a_confirmer" | "confirme" | "ignore";

interface LigneDetecte {
  id: string;
  salle_id: string;
  type_equipement: string;
  plafond_kg: number | null;
  exercice_id: string;
  seance_id: string;
  statut: StatutDetecte;
  detecte_le: number;
  traite_le: number | null;
  avant: string | null;
}

export interface EquipementDetecte {
  id: string;
  salleId: string;
  type: TypeEquipementSalle;
  libelle: string;
  /** Charge vue au-dessus du plafond (kg) ; pour un équipement absent, la plus lourde charge vue. */
  plafondKg: number | null;
  /** Ancien plafond de l'inventaire (kg) quand la ligne est un plafond dépassé ; null si l'équipement est nouveau. */
  ancienPlafondKg: number | null;
  nouveau: boolean;
  exerciceId: string;
  exerciceNom: string;
  exerciceSlug: string | null;
  statut: StatutDetecte;
}

/**
 * Détecte, dans la séance, les équipements absents de l'inventaire de sa salle et les charges au-dessus du plafond, et les inscrit
 * (un par salle et type). Ignorée, une ligne ne revient que pour une charge plus haute que celle ignorée ; confirmée puis retirée
 * de la salle, elle revient. Les lignes à confirmer de cette séance qui n'ont plus lieu d'être sont effacées. Renvoie celles à confirmer.
 */
export async function detecterEquipements(db: Executeur, seanceId: string): Promise<EquipementDetecte[]> {
  const s = await db.getFirstAsync<{ salle_id: string | null }>("SELECT salle_id FROM seances WHERE id = ?", [seanceId]);
  if (!s?.salle_id) return [];
  const salleId = s.salle_id;
  const vus = await db.getAllAsync<{ id: string; slug: string | null; equipement: Equipement; kg: number | null }>(
    `SELECT e.id, e.slug, e.equipement, MAX(sr.kg) AS kg FROM series sr JOIN exercices e ON e.id = sr.exercice_id
     WHERE sr.seance_id = ? AND sr.faite = 1 GROUP BY e.id ORDER BY MIN(sr.position)`,
    [seanceId],
  );
  const parType = new Map<string, { kg: number | null; exerciceId: string }>();
  for (const v of vus) {
    const type = typeEquipementDe(v);
    if (!type) continue;
    const cur = parType.get(type);
    if (!cur || (v.kg ?? 0) > (cur.kg ?? 0)) parType.set(type, { kg: v.kg && v.kg > 0 ? v.kg : null, exerciceId: v.id });
  }
  const garde = new Set<string>();
  const t = Date.now();
  await transaction(db, async (db) => {
    for (const [type, vu] of parType) {
      const e = await etat(db, salleId, type, vu.exerciceId);
      const besoin = !e.present ? "absent" : e.plafondKg != null && vu.kg != null && depasse(vu.kg, e.plafondKg) ? "plafond" : null;
      const ex = await db.getFirstAsync<LigneDetecte>("SELECT * FROM equipement_detecte WHERE salle_id = ? AND type_equipement = ?", [salleId, type]);
      if (!besoin) continue;
      if (!ex) {
        const id = nouvelId();
        await db.runAsync(
          "INSERT INTO equipement_detecte (id, salle_id, type_equipement, plafond_kg, exercice_id, seance_id, statut, detecte_le) VALUES (?,?,?,?,?,?,'a_confirmer',?)",
          [id, salleId, type, vu.kg, vu.exerciceId, seanceId, t],
        );
        garde.add(id);
        continue;
      }
      if (ex.statut === "ignore" && !(besoin === "plafond" && vu.kg != null && vu.kg > (ex.plafond_kg ?? 0) + 0.01)) continue;
      const plafond = ex.statut === "a_confirmer" ? Math.max(ex.plafond_kg ?? 0, vu.kg ?? 0) || null : vu.kg;
      const plusHaut = (vu.kg ?? 0) >= (ex.statut === "a_confirmer" ? (ex.plafond_kg ?? 0) : 0);
      await db.runAsync(
        "UPDATE equipement_detecte SET statut = 'a_confirmer', plafond_kg = ?, exercice_id = ?, seance_id = ?, detecte_le = ?, traite_le = NULL, avant = NULL WHERE id = ?",
        [plafond, plusHaut ? vu.exerciceId : ex.exercice_id, plusHaut ? seanceId : ex.seance_id, t, ex.id],
      );
      garde.add(ex.id);
    }
    const perimees = await db.getAllAsync<{ id: string }>("SELECT id FROM equipement_detecte WHERE seance_id = ? AND statut = 'a_confirmer'", [seanceId]);
    for (const p of perimees) if (!garde.has(p.id)) await db.runAsync("DELETE FROM equipement_detecte WHERE id = ?", [p.id]);
  });
  return equipementsDetectes(db, salleId);
}

/** Lignes à confirmer d'une salle (avec le nom de l'exercice qui les a révélées), dans l'ordre de détection. */
export async function equipementsDetectes(db: Executeur, salleId: string, statuts: readonly StatutDetecte[] = ["a_confirmer"]): Promise<EquipementDetecte[]> {
  const l = await db.getAllAsync<LigneDetecte & { nom: string; slug: string | null }>(
    `SELECT d.*, ${nomSql("e")} AS nom, e.slug FROM equipement_detecte d JOIN exercices e ON e.id = d.exercice_id
     WHERE d.salle_id = ? AND d.statut IN (${statuts.map(() => "?").join(",")}) ORDER BY d.detecte_le, d.type_equipement`,
    [salleId, ...statuts],
  );
  const out: EquipementDetecte[] = [];
  for (const d of l) {
    const e = await etat(db, salleId, d.type_equipement, d.exercice_id);
    out.push({
      id: d.id, salleId, type: d.type_equipement, libelle: libelleEquipementSalle(d.type_equipement), plafondKg: d.plafond_kg,
      ancienPlafondKg: e.present ? e.plafondKg : null, nouveau: !e.present, exerciceId: d.exercice_id, exerciceNom: d.nom, exerciceSlug: d.slug,
      statut: d.statut,
    });
  }
  return out;
}

// ---------------------------------------------------------------- traitement : confirmer, ignorer, annuler

type Avant =
  | { cree: "appareil"; appareilId: string }
  | { cree: "poids_libre"; type: PoidsLibre; categories: Equipement[] }
  | { materiel: LigneMateriel[]; salleId: string; genres: GenreMateriel[]; categories: Equipement[] }
  | { cree: "poste"; categorie: Equipement }
  | { regle: "appareil"; appareilId: string; max: number | null; palier: number | null; paliers: string }
  | { regle: "poids_libre"; ligne: LignePoidsLibre };

/** Confirmer : l'équipement entre dans l'inventaire de la salle (ajout), ou son plafond est relevé à la charge vue. */
export async function confirmerEquipement(db: Executeur, id: string): Promise<void> {
  const d = await db.getFirstAsync<LigneDetecte>("SELECT * FROM equipement_detecte WHERE id = ?", [id]);
  if (!d || d.statut === "confirme") return;
  const unite = await uniteProfil(db);
  await transaction(db, async (db) => {
    let avant: Avant | null = null;
    const m = machineDe(d.type_equipement);
    if (m) {
      const a = await db.getFirstAsync<Appareil>("SELECT * FROM appareil WHERE salle_id = ? AND machine_id = ?", [d.salle_id, m]);
      if (a) {
        avant = { regle: "appareil", appareilId: a.id, max: a.max_val, palier: a.palier, paliers: JSON.stringify(a.paliers_kg) };
        if (d.plafond_kg != null) await reglerMachine(db, a.id, { max: dansUnite(d.plafond_kg, a.unite) });
      } else {
        const [creee] = await ajouterMachinesSec(db, d.salle_id, [{ machineId: m, unite }]);
        if (creee) avant = { cree: "appareil", appareilId: creee };
      }
    } else if (estPoidsLibre(d.type_equipement)) {
      const type = d.type_equipement;
      const genres = GENRES_DE[type];
      const categories = (await equipementsDe(db, d.salle_id)).filter((c) => c === categorieDe(type) || (type === "barre" && c === "disque"));
      avant = { materiel: await lignesMateriel(db, d.salle_id, genres), salleId: d.salle_id, genres, categories };
      const tous = await lireMateriel(db, d.salle_id);
      if (type === "barre") {
        const barres = tous.filter((m) => m.genre === "barre");
        // Sans barre : une barre droite, à vérifier ; avec : la charge maximale saisie monte à la charge vue.
        if (!barres.length) await ecrireMateriel(db, d.salle_id, { ...nouvelleBarre("droite", unite), aVerifier: true });
        else if (d.plafond_kg != null)
          for (const b of barres)
            if (!b.prechargee && b.chargeMax != null && depasse(d.plafond_kg, depuisUnite(b.chargeMax, b.unite)))
              await ecrireMateriel(db, d.salle_id, { ...b, chargeMax: dansUnite(d.plafond_kg, b.unite) });
      } else {
        const l = tous.find((m) => m.genre === type);
        const u = l?.unite ?? unite;
        const charge = d.plafond_kg == null ? null : dansUnite(d.plafond_kg, u);
        if (l) {
          if (charge != null) await ecrireMateriel(db, d.salle_id, { ...l, poids: [...l.poids, charge] });
        } else if (charge != null || !tous.some((m) => genres.includes(m.genre))) {
          await ecrireMateriel(db, d.salle_id, {
            genre: type, forme: null, nom: null, poids: charge == null ? [] : [charge], poidsPropre: null, nombre: null, chargeMax: null,
            maxParCote: null, trou: null, prechargee: false, disques: [], unite: u,
          });
        }
      }
    } else {
      const p = posteDe(d.type_equipement);
      if (p && (await cocher(db, d.salle_id, p, true))) avant = { cree: "poste", categorie: p };
    }
    await db.runAsync("UPDATE equipement_detecte SET statut = 'confirme', traite_le = ?, avant = ? WHERE id = ?", [Date.now(), avant ? JSON.stringify(avant) : null, id]);
  });
}

/** Ignorer : rien ne change dans l'inventaire ; la ligne ne revient pas, sauf pour une charge plus haute que celle ignorée. */
export async function ignorerEquipement(db: Executeur, id: string): Promise<void> {
  await db.runAsync("UPDATE equipement_detecte SET statut = 'ignore', traite_le = ?, avant = NULL WHERE id = ? AND statut = 'a_confirmer'", [Date.now(), id]);
}

/** Annuler un « Confirmer » (l'ajout ou le plafond relevé est défait) ou un « Ignorer » : la ligne redevient à confirmer. */
export async function annulerTraitement(db: Executeur, id: string): Promise<void> {
  const d = await db.getFirstAsync<LigneDetecte>("SELECT * FROM equipement_detecte WHERE id = ?", [id]);
  if (!d || d.statut === "a_confirmer") return;
  await transaction(db, async (db) => {
    const avant = d.avant ? (JSON.parse(d.avant) as Avant) : null;
    if (avant && "materiel" in avant) {
      await db.runAsync(`DELETE FROM salle_materiel WHERE salle_id = ? AND genre IN (${avant.genres.map(() => "?").join(",")})`, [avant.salleId, ...avant.genres]);
      await restaurerLignes(db, avant.materiel);
      const eq = await equipementsDe(db, avant.salleId);
      const fams: Equipement[] = avant.genres.includes("barre") ? ["barre", "disque"] : avant.genres.includes("kettlebell") ? ["kettlebell"] : ["halteres"];
      await ecrireEquipements(db, avant.salleId, [...eq.filter((e) => !fams.includes(e)), ...avant.categories]);
    } else if (avant && "cree" in avant) {
      if (avant.cree === "appareil") await db.runAsync("DELETE FROM appareil WHERE id = ?", [avant.appareilId]);
      else if (avant.cree === "poids_libre") {
        await db.runAsync("DELETE FROM salle_poids_libre WHERE salle_id = ? AND type = ?", [d.salle_id, avant.type]);
        const cat = categorieDe(avant.type);
        if (cat && !avant.categories.includes(cat)) await cocher(db, d.salle_id, cat, false);
        if (avant.type === "barre" && !avant.categories.includes("disque")) await cocher(db, d.salle_id, "disque", false);
      } else await cocher(db, d.salle_id, avant.categorie, false);
    } else if (avant && "regle" in avant) {
      if (avant.regle === "appareil") {
        await db.runAsync("UPDATE appareil SET max_val = ?, palier = ?, paliers_kg = ? WHERE id = ?", [avant.max, avant.palier, avant.paliers, avant.appareilId]);
      } else {
        const l = avant.ligne;
        await db.runAsync("UPDATE salle_poids_libre SET min_val = ?, max_val = ?, pas = ?, liste = ?, unite = ? WHERE salle_id = ? AND type = ?", [
          l.min_val, l.max_val, l.pas, l.liste, l.unite, l.salle_id, l.type,
        ]);
      }
    }
    await db.runAsync("UPDATE equipement_detecte SET statut = 'a_confirmer', traite_le = NULL, avant = NULL WHERE id = ?", [id]);
  });
}

/** « Tout confirmer » : confirme toutes les lignes à confirmer de la salle, dans l'ordre ; renvoie leurs ids (pour les annuler). */
export async function toutConfirmer(db: Executeur, salleId: string): Promise<string[]> {
  const l = await equipementsDetectes(db, salleId);
  for (const x of l) await confirmerEquipement(db, x.id);
  return l.map((x) => x.id);
}

// ---------------------------------------------------------------- retrait d'un équipement de la salle

export interface RetraitEquipement {
  id: string;
  type: TypeEquipementSalle;
  libelle: string;
}

/**
 * Retire un équipement de la salle (« Matériel manquant ») et garde de quoi le remettre : renvoie le retrait, ou null si la salle ne
 * l'avait pas. `type` : `machine:<id>`, `halteres`, `kettlebell`, `barre` ou `poste:<équipement>` (typeEquipementDe).
 */
export async function retirerEquipementSalle(db: Executeur, salleId: string, type: TypeEquipementSalle): Promise<RetraitEquipement | null> {
  const id = nouvelId();
  let instantane: Record<string, unknown> | null = null;
  await transaction(db, async (db) => {
    const m = machineDe(type);
    if (m) {
      const a = await db.getFirstAsync<Appareil>("SELECT * FROM appareil WHERE salle_id = ? AND machine_id = ?", [salleId, m]);
      if (!a) return;
      const liens = await db.getAllAsync<{ exercice_id: string }>("SELECT exercice_id FROM appareil_exercice WHERE appareil_id = ?", [a.id]);
      instantane = { appareil: { ...a, paliers_kg: JSON.stringify(a.paliers_kg) }, exercices: liens.map((x) => x.exercice_id) };
      await db.runAsync("DELETE FROM appareil WHERE id = ?", [a.id]);
      return;
    }
    const cats = estPoidsLibre(type) ? ([categorieDe(type), type === "barre" ? "disque" : null].filter(Boolean) as Equipement[]) : [posteDe(type)].filter((x): x is Equipement => !!x);
    const eq = await equipementsDe(db, salleId);
    const genres = estPoidsLibre(type) ? GENRES_DE[type] : [];
    const lignes = genres.length ? await lignesMateriel(db, salleId, genres) : [];
    const cochees = cats.filter((c) => eq.includes(c));
    if (!lignes.length && cochees.length === 0) return;
    instantane = { materiel: lignes, categories: cochees };
    if (lignes.length) {
      await db.runAsync(`DELETE FROM salle_materiel WHERE salle_id = ? AND genre IN (${genres.map(() => "?").join(",")})`, [salleId, ...genres]);
      await db.runAsync(`DELETE FROM exercice_materiel WHERE salle_id = ? AND materiel_id IN (${lignes.map(() => "?").join(",")})`, [salleId, ...lignes.map((l) => l.id)]);
    }
    if (cochees.length) await ecrireEquipements(db, salleId, eq.filter((c) => !cochees.includes(c)));
  });
  if (!instantane) return null;
  await db.runAsync("INSERT INTO salle_retrait (id, salle_id, type_equipement, instantane, retire_le) VALUES (?,?,?,?,?)", [id, salleId, type, JSON.stringify(instantane), Date.now()]);
  return { id, type, libelle: libelleEquipementSalle(type) };
}

/**
 * Retire un élément du matériel (une barre, un jeu de disques, des haltères…) depuis sa feuille, en gardant de quoi le remettre :
 * la famille se décoche avec le dernier élément qui la donnait. `libelle` : ce que le bandeau d'annulation affiche.
 */
export async function retirerElementMateriel(db: Executeur, materielId: string, libelle: string): Promise<RetraitEquipement | null> {
  const id = nouvelId();
  let retrait: { salleId: string; type: TypeEquipementSalle; instantane: Record<string, unknown> } | null = null;
  await transaction(db, async (db) => {
    const l = await db.getFirstAsync<LigneMateriel>("SELECT * FROM salle_materiel WHERE id = ?", [materielId]);
    if (!l) return;
    const avant = await equipementsDe(db, l.salle_id);
    await db.runAsync("DELETE FROM exercice_materiel WHERE materiel_id = ?", [materielId]);
    await retirerMateriel(db, materielId);
    const apres = await equipementsDe(db, l.salle_id);
    const type = (Object.keys(GENRES_DE) as PoidsLibre[]).find((p) => GENRES_DE[p].includes(l.genre)) ?? "halteres";
    retrait = { salleId: l.salle_id, type, instantane: { materiel: [l], categories: avant.filter((e) => !apres.includes(e)) } };
  });
  if (!retrait) return null;
  const r: { salleId: string; type: TypeEquipementSalle; instantane: Record<string, unknown> } = retrait;
  await db.runAsync("INSERT INTO salle_retrait (id, salle_id, type_equipement, instantane, retire_le) VALUES (?,?,?,?,?)", [id, r.salleId, r.type, JSON.stringify(r.instantane), Date.now()]);
  return { id, type: r.type, libelle };
}

/** Annule un retrait : l'équipement, ses réglages et ses exercices rattachés reviennent dans la salle. */
export async function annulerRetraitEquipement(db: Executeur, retraitId: string): Promise<boolean> {
  const r = await db.getFirstAsync<{ salle_id: string; type_equipement: string; instantane: string; annule: number }>(
    "SELECT salle_id, type_equipement, instantane, annule FROM salle_retrait WHERE id = ?",
    [retraitId],
  );
  if (!r || r.annule === 1) return false;
  const snap = JSON.parse(r.instantane) as {
    appareil?: Appareil & { paliers_kg: string };
    exercices?: string[];
    poidsLibre?: LignePoidsLibre | null;
    materiel?: LigneMateriel[];
    categories?: Equipement[];
  };
  await transaction(db, async (db) => {
    if (snap.appareil) {
      const a = snap.appareil;
      await db.runAsync("INSERT OR IGNORE INTO appareil (id, salle_id, nom, type, paliers_kg, machine_id, palier, max_val, unite) VALUES (?,?,?,?,?,?,?,?,?)", [
        a.id, a.salle_id, a.nom, a.type, a.paliers_kg, a.machine_id, a.palier, a.max_val, a.unite,
      ]);
      for (const e of snap.exercices ?? [])
        await db.runAsync("INSERT OR IGNORE INTO appareil_exercice (appareil_id, exercice_id) SELECT ?, id FROM exercices WHERE id = ?", [a.id, e]);
    }
    if (snap.materiel) await restaurerLignes(db, snap.materiel);
    if (snap.poidsLibre) {
      // Retrait fait avant la migration 66 : la ligne revient dans salle_materiel, sous l'id de la reprise.
      const l = snap.poidsLibre;
      const liste = (JSON.parse(l.liste) as number[]).filter((x) => x > 0);
      const poids = liste.length ? liste : [l.min_val, l.max_val].filter((x): x is number => x != null && x > 0);
      const id = `pl:${l.salle_id}:${l.type}`;
      if (!(await db.getFirstAsync("SELECT 1 FROM salle_materiel WHERE id = ?", [id])))
        await db.runAsync(
          l.type === "barre"
            ? "INSERT INTO salle_materiel (id, salle_id, genre, forme, poids_propre, nombre, charge_max, trou, unite, cree_le, maj_le) VALUES (?,?,'barre','droite',?,1,?,'50',?,?,?)"
            : "INSERT INTO salle_materiel (id, salle_id, genre, poids, unite, cree_le, maj_le) VALUES (?,?,?,?,?,?,?)",
          l.type === "barre"
            ? [id, l.salle_id, l.min_val ?? (l.unite === "lbs" ? 45 : 20), l.max_val, l.unite, Date.now(), Date.now()]
            : [id, l.salle_id, l.type, JSON.stringify(poids), l.unite, Date.now(), Date.now()],
        );
    }
    for (const c of snap.categories ?? []) await cocher(db, r.salle_id, c, true);
    await db.runAsync("UPDATE salle_retrait SET annule = 1 WHERE id = ?", [retraitId]);
  });
  return true;
}

export interface RetraitPossible {
  salleId: string;
  salleNom: string;
  type: TypeEquipementSalle;
  libelle: string;
}

/** Équipement qu'un exercice demande dans la salle d'une séance, s'il y est inventorié : ce que « Matériel manquant » peut retirer. */
export async function equipementRetirable(db: Executeur, seanceId: string, exerciceId: string): Promise<RetraitPossible | null> {
  const s = await db.getFirstAsync<{ salle_id: string | null; nom: string | null }>(
    "SELECT se.salle_id, sa.nom FROM seances se LEFT JOIN salle sa ON sa.id = se.salle_id WHERE se.id = ?",
    [seanceId],
  );
  const e = await db.getFirstAsync<{ slug: string | null; equipement: Equipement }>("SELECT slug, equipement FROM exercices WHERE id = ?", [exerciceId]);
  if (!s?.salle_id || !e) return null;
  const type = typeEquipementDe(e);
  if (!type) return null;
  const present = machineDe(type) ? (await etat(db, s.salle_id, type, exerciceId)).present : (await etat(db, s.salle_id, type)).present;
  return present ? { salleId: s.salle_id, salleNom: s.nom ?? "", type, libelle: libelleEquipementSalle(type) } : null;
}
