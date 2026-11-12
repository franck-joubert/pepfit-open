import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { estEquipement, EQUIPEMENTS, type Equipement } from "../natures";
import { normaliserPaliers } from "../paliers";
import type { Appareil, Salle, TypeAppareil } from "../types";
import type { CacheAutour, SalleOSM } from "../../salles/osm";
import { versUnite } from "../../ecrans/format";
import { t } from "../../i18n/index";
import { nomMachineAffiche } from "../inventaire";
import { paliersDeMachine } from "./inventaire";
import { chargesPour } from "./materiel";
import { ecrireReglage, lireReglage } from "./reglages";
import { aCapacite, TYPE_DEFAUT } from "../lieux";

const PLAFOND_PALIERS_KG = 500;

/** Noms par défaut enregistrés en base à la création (en français) ; affichés dans la langue active tant qu'ils n'ont pas été renommés. */
const NOM_SALLE = "Salle";
const NOM_APPAREIL = "Appareil";
const nomSalleAffiche = (nom: string): string => (nom === NOM_SALLE ? t("salles.nomDefaut") : nom);

/** Activité habituelle d'un lieu (lieu_activite), dans l'ordre de coche. */
export interface ActiviteLieu {
  id: string;
  nom: string;
  slug: string | null;
}

export interface SalleDetail {
  id: string;
  nom: string;
  defaut: boolean;
  /** Type de lieu (db/lieux.ts). */
  type: string;
  /** Lieu de la carte (« node/123 ») ; null pour un lieu perso. */
  sourceId: string | null;
  equipements: Equipement[];
  appareils: AppareilDetail[];
  activites: ActiviteLieu[];
}

export interface AppareilDetail extends Appareil {
  exerciceIds: string[];
}

export interface SalleResume {
  id: string;
  nom: string;
  defaut: boolean;
  equipements: Equipement[];
  nbAppareils: number;
  /** Type de lieu (db/lieux.ts) et ses activités habituelles ; nombre de séances faites à ce lieu. */
  type: string;
  activites: ActiviteLieu[];
  nbSeances: number;
  /** Salle perso (créée à la main) ; sinon salle d'OpenStreetMap. */
  perso: boolean;
  sourceId: string | null;
  adresse: string | null;
}

const equipementsDe = (s: string): Equipement[] => s.split("|").filter(estEquipement);

/** Activités habituelles de tous les lieux (ou d'un seul), par lieu, dans l'ordre de coche. */
async function activitesDes(db: Executeur, lieuId?: string): Promise<Map<string, ActiviteLieu[]>> {
  const l = await db.getAllAsync<ActiviteLieu & { lieu_id: string }>(
    `SELECT la.lieu_id, e.id, e.nom, e.slug FROM lieu_activite la JOIN exercices e ON e.id = la.exercice_id
     ${lieuId ? "WHERE la.lieu_id = ?" : ""} ORDER BY la.ordre, e.nom COLLATE NOCASE`,
    lieuId ? [lieuId] : [],
  );
  const m = new Map<string, ActiviteLieu[]>();
  for (const { lieu_id, ...a } of l) m.set(lieu_id, [...(m.get(lieu_id) ?? []), a]);
  return m;
}

/** Lieux, le lieu par défaut d'abord. */
export async function listerSalles(db: Executeur): Promise<SalleResume[]> {
  const l = await db.getAllAsync<Salle & { n: number; ns: number }>(
    `SELECT s.*, (SELECT COUNT(*) FROM appareil WHERE salle_id = s.id) AS n,
       (SELECT COUNT(*) FROM seances WHERE salle_id = s.id AND fin IS NOT NULL) AS ns
     FROM salle s ORDER BY s.defaut DESC, s.ordre, s.nom COLLATE NOCASE`,
    [],
  );
  const acts = await activitesDes(db);
  return l.map((s) => ({
    id: s.id,
    nom: nomSalleAffiche(s.nom),
    defaut: s.defaut === 1,
    equipements: equipementsDe(s.equipements),
    nbAppareils: s.n,
    type: s.type,
    activites: acts.get(s.id) ?? [],
    nbSeances: s.ns,
    perso: !s.source_id,
    sourceId: s.source_id,
    adresse: s.adresse,
  }));
}

function lireAppareil(a: Omit<Appareil, "paliers_kg"> & { paliers_kg: string }, exerciceIds: string[]): AppareilDetail {
  return { ...a, nom: nomMachineAffiche(a.machine_id, a.nom === NOM_APPAREIL ? t("salles.appareilDefaut") : a.nom), paliers_kg: normaliserPaliers(JSON.parse(a.paliers_kg) as number[]), exerciceIds };
}

export async function lireSalle(db: Executeur, id: string): Promise<SalleDetail | null> {
  const s = await db.getFirstAsync<Salle>("SELECT * FROM salle WHERE id = ?", [id]);
  if (!s) return null;
  const apps = await db.getAllAsync<Omit<Appareil, "paliers_kg"> & { paliers_kg: string }>(
    "SELECT * FROM appareil WHERE salle_id = ? ORDER BY nom COLLATE NOCASE",
    [id],
  );
  const liens = await db.getAllAsync<{ appareil_id: string; exercice_id: string }>(
    "SELECT ae.appareil_id, ae.exercice_id FROM appareil_exercice ae JOIN appareil a ON a.id = ae.appareil_id WHERE a.salle_id = ?",
    [id],
  );
  return {
    id: s.id,
    nom: nomSalleAffiche(s.nom),
    defaut: s.defaut === 1,
    type: s.type,
    sourceId: s.source_id,
    equipements: equipementsDe(s.equipements),
    appareils: apps.map((a) => lireAppareil(a, liens.filter((x) => x.appareil_id === a.id).map((x) => x.exercice_id))),
    activites: (await activitesDes(db, id)).get(id) ?? [],
  };
}

/** Crée une salle (la première devient la salle par défaut). Les équipements cochés sont l'unique critère de « faisable » (D13). */
export function creerSalle(db: Executeur, nom: string, equipements: Equipement[] = [], adresse: string | null = null): Promise<string> {
  return creerLieu(db, { nom, equipements, adresse });
}

export interface NouveauLieu {
  nom: string;
  /** Type du registre (db/lieux.ts) ; « salle » par défaut. */
  type?: string;
  equipements?: Equipement[];
  /** Activités habituelles (0 à n), dans l'ordre de coche ; ignorées si le type n'a pas la capacité « activites ». */
  activites?: string[];
  adresse?: string | null;
  /** Position du téléphone quand le lieu est créé sur place (fin de séance, GPS autorisé) : sert à le reproposer ici. */
  position?: { lat: number; lon: number } | null;
}

/** Crée un lieu (le premier devient le lieu par défaut). */
export async function creerLieu(db: Executeur, l: NouveauLieu): Promise<string> {
  const id = nouvelId();
  const t = Date.now();
  const type = l.type ?? TYPE_DEFAUT;
  await transaction(db, async (db) => {
    const n = (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM salle", []))?.n ?? 0;
    await db.runAsync(
      "INSERT INTO salle (id, nom, defaut, equipements, ordre, adresse, type, lat, lon, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [
        id, l.nom.trim() || NOM_SALLE, n === 0 ? 1 : 0, EQUIPEMENTS.filter((e) => (l.equipements ?? []).includes(e)).join("|"), n, l.adresse?.trim() || null, type,
        l.position?.lat ?? null, l.position?.lon ?? null, t, t,
      ],
    );
    if (aCapacite(type, "activites")) await ecrireActivites(db, id, l.activites ?? []);
  });
  return id;
}

async function ecrireActivites(db: Executeur, lieuId: string, ids: string[]): Promise<void> {
  const garder = [...new Set(ids)];
  const avant = await db.getAllAsync<{ exercice_id: string; ordre: number }>("SELECT exercice_id, ordre FROM lieu_activite WHERE lieu_id = ?", [lieuId]);
  for (const a of avant) if (!garder.includes(a.exercice_id)) await db.runAsync("DELETE FROM lieu_activite WHERE lieu_id = ? AND exercice_id = ?", [lieuId, a.exercice_id]);
  for (const [i, e] of garder.entries()) {
    const deja = avant.find((a) => a.exercice_id === e);
    if (!deja) await db.runAsync("INSERT INTO lieu_activite (lieu_id, exercice_id, ordre) VALUES (?,?,?)", [lieuId, e, i]);
    else if (deja.ordre !== i) await db.runAsync("UPDATE lieu_activite SET ordre = ? WHERE lieu_id = ? AND exercice_id = ?", [i, lieuId, e]);
  }
}

/** Remplace les activités habituelles d'un lieu (ordre = ordre de `ids`). */
export async function definirActivitesLieu(db: Executeur, lieuId: string, ids: string[]): Promise<void> {
  await transaction(db, async (db) => {
    await ecrireActivites(db, lieuId, ids);
    await db.runAsync("UPDATE salle SET maj_le = ? WHERE id = ?", [Date.now(), lieuId]);
  });
}

/** Activités du catalogue (celles qui ont un sport Whoop), pour « Activités habituelles ». */
export function listerActivites(db: Executeur): Promise<ActiviteLieu[]> {
  return db.getAllAsync<ActiviteLieu>("SELECT id, nom, slug FROM exercices WHERE whoop_ids IS NOT NULL ORDER BY nom COLLATE NOCASE", []);
}

/**
 * Ajoute à « Mes salles » une salle d'OpenStreetMap (une seule fois : on retrouve la même par son source_id) et renvoie son id.
 * Une salle de sport publique a a priori tout l'équipement, comme les salles reprises de l'historique (migration 4). Un terrain
 * ou une piscine (lieu du sport de la séance, 30/10) n'a pas d'équipements : `sport` devient son activité habituelle.
 */
export async function adopterSalleOSM(db: Executeur, s: SalleOSM, sport?: string | null): Promise<string> {
  const deja = await db.getFirstAsync<{ id: string }>("SELECT id FROM salle WHERE source_id = ?", [s.sourceId]);
  if (deja) return deja.id;
  const id = nouvelId();
  const t = Date.now();
  const type = s.type ?? TYPE_DEFAUT;
  const n = (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM salle", []))?.n ?? 0;
  await db.runAsync(
    "INSERT INTO salle (id, nom, defaut, equipements, ordre, publique, source_id, adresse, type, lat, lon, cree_le, maj_le) VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?)",
    [id, s.nom.trim() || NOM_SALLE, n === 0 ? 1 : 0, aCapacite(type, "equipements") ? EQUIPEMENTS.join("|") : "", n, s.sourceId, s.adresseComplete ?? s.adresse, type, s.lat, s.lon, t, t],
  );
  if (sport && aCapacite(type, "activites") && (await db.getFirstAsync("SELECT 1 FROM exercices WHERE id = ?", [sport]))) await ecrireActivites(db, id, [sport]);
  return id;
}

const CLE_CACHE_AUTOUR = "osm_autour";

export async function lireCacheAutour(db: Executeur): Promise<CacheAutour | null> {
  const v = await lireReglage(db, CLE_CACHE_AUTOUR);
  if (!v) return null;
  try {
    return JSON.parse(v) as CacheAutour;
  } catch {
    return null;
  }
}

export function ecrireCacheAutour(db: Executeur, c: CacheAutour): Promise<void> {
  return ecrireReglage(db, CLE_CACHE_AUTOUR, JSON.stringify(c));
}

export async function modifierSalle(db: Executeur, id: string, patch: { nom?: string; equipements?: Equipement[] }): Promise<void> {
  const s = await db.getFirstAsync<Salle>("SELECT * FROM salle WHERE id = ?", [id]);
  if (!s) return;
  await db.runAsync("UPDATE salle SET nom = ?, equipements = ?, maj_le = ? WHERE id = ?", [
    patch.nom?.trim() || s.nom,
    patch.equipements ? EQUIPEMENTS.filter((e) => patch.equipements!.includes(e)).join("|") : s.equipements,
    Date.now(),
    id,
  ]);
}

export async function definirSalleParDefaut(db: Executeur, id: string): Promise<void> {
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE salle SET defaut = 0", []);
    await db.runAsync("UPDATE salle SET defaut = 1 WHERE id = ?", [id]);
  });
}

/**
 * Lieu d'une séance (D6) : une séance encore vide qui reçoit un lieu à une seule activité habituelle reçoit cette activité (une ligne).
 * Plusieurs activités, aucune, ou une séance qui a déjà des exercices : rien n'est ajouté. Renvoie l'activité ajoutée.
 */
export async function activiteAPreremplir(db: Executeur, seanceId: string, lieuId: string | null): Promise<string | null> {
  if (!lieuId) return null;
  const n = await db.getFirstAsync<{ n: number }>(
    "SELECT (SELECT COUNT(*) FROM seance_exercices WHERE seance_id = ?) + (SELECT COUNT(*) FROM series WHERE seance_id = ?) AS n",
    [seanceId, seanceId],
  );
  if (n && n.n > 0) return null;
  const l = await db.getAllAsync<{ exercice_id: string }>("SELECT exercice_id FROM lieu_activite WHERE lieu_id = ?", [lieuId]);
  return l.length === 1 ? l[0]!.exercice_id : null;
}

/** Supprime la salle et ses appareils ; les séances gardent leurs séries, sans salle. */
export async function supprimerSalle(db: Executeur, id: string): Promise<void> {
  await transaction(db, async (db) => {
    const etait = await db.getFirstAsync<{ defaut: number }>("SELECT defaut FROM salle WHERE id = ?", [id]);
    await db.runAsync("DELETE FROM salle WHERE id = ?", [id]);
    if (etait?.defaut === 1) await db.runAsync("UPDATE salle SET defaut = 1 WHERE id = (SELECT id FROM salle ORDER BY ordre, nom LIMIT 1)", []);
  });
}

/** Salle d'une nouvelle séance (D17) : la salle par défaut, sinon celle de la dernière séance, sinon aucune. */
export async function salleParDefaut(db: Executeur): Promise<string | null> {
  const d = await db.getFirstAsync<{ id: string }>("SELECT id FROM salle WHERE defaut = 1 LIMIT 1", []);
  if (d) return d.id;
  const s = await db.getFirstAsync<{ salle_id: string }>("SELECT salle_id FROM seances WHERE salle_id IS NOT NULL ORDER BY debut DESC LIMIT 1", []);
  return s?.salle_id ?? null;
}

export interface NouvelAppareil {
  nom: string;
  type?: TypeAppareil;
  paliersKg?: number[];
  exerciceIds?: string[];
}

export async function creerAppareil(db: Executeur, salleId: string, a: NouvelAppareil): Promise<string> {
  const id = nouvelId();
  await transaction(db, async (db) => {
    await db.runAsync("INSERT INTO appareil (id, salle_id, nom, type, paliers_kg) VALUES (?,?,?,?,?)", [
      id, salleId, a.nom.trim() || NOM_APPAREIL, a.type ?? "pile", JSON.stringify(normaliserPaliers(a.paliersKg ?? [])),
    ]);
    for (const e of a.exerciceIds ?? []) await db.runAsync("INSERT OR IGNORE INTO appareil_exercice (appareil_id, exercice_id) VALUES (?,?)", [id, e]);
  });
  return id;
}

export async function modifierAppareil(db: Executeur, id: string, patch: Partial<NouvelAppareil>): Promise<void> {
  const a = await db.getFirstAsync<Omit<Appareil, "paliers_kg"> & { paliers_kg: string }>("SELECT * FROM appareil WHERE id = ?", [id]);
  if (!a) return;
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE appareil SET nom = ?, type = ?, paliers_kg = ? WHERE id = ?", [
      patch.nom?.trim() || a.nom,
      patch.type ?? a.type,
      patch.paliersKg ? JSON.stringify(normaliserPaliers(patch.paliersKg)) : a.paliers_kg,
      id,
    ]);
    if (patch.exerciceIds) {
      await db.runAsync("DELETE FROM appareil_exercice WHERE appareil_id = ?", [id]);
      for (const e of patch.exerciceIds) await db.runAsync("INSERT OR IGNORE INTO appareil_exercice (appareil_id, exercice_id) VALUES (?,?)", [id, e]);
    }
  });
}

export async function supprimerAppareil(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM appareil WHERE id = ?", [id]);
}

/**
 * Paliers de charge d'un exercice dans une salle (D13, D14) : les charges réalisables du lieu (matériel : machine, haltères,
 * kettlebells, barre choisie et ses disques ; depots/materiel.ts), sinon ceux de l'appareil de la salle qui porte l'exercice,
 * sinon ceux de l'appareil par défaut de l'exercice s'il est dans cette salle (ou sans salle). Null : pas de palier, + et − par 2,5 kg.
 */
export async function paliersPour(db: Executeur, exerciceId: string, salleId: string | null): Promise<number[] | null> {
  const c = await chargesPour(db, exerciceId, salleId);
  if (c) return c.charges;
  const lire = (l: { paliers_kg: string; palier: number | null; unite: "kg" | "lbs" } | null) => {
    let p = l ? normaliserPaliers(JSON.parse(l.paliers_kg) as number[]) : [];
    if (l && !p.length && l.palier) p = paliersDeMachine(l.palier, Math.round(versUnite(PLAFOND_PALIERS_KG, l.unite)), l.unite);
    return p.length ? p : null;
  };
  if (salleId) {
    const a = await db.getFirstAsync<{ paliers_kg: string; palier: number | null; unite: "kg" | "lbs" }>(
      `SELECT a.paliers_kg, a.palier, a.unite FROM appareil a JOIN appareil_exercice ae ON ae.appareil_id = a.id
       WHERE a.salle_id = ? AND ae.exercice_id = ? ORDER BY a.nom LIMIT 1`,
      [salleId, exerciceId],
    );
    const p = lire(a);
    if (p) return p;
  }
  const d = await db.getFirstAsync<{ paliers_kg: string; palier: number | null; unite: "kg" | "lbs"; salle_id: string }>(
    "SELECT a.paliers_kg, a.palier, a.unite, a.salle_id FROM exercices e JOIN appareil a ON a.id = e.appareil_id WHERE e.id = ?",
    [exerciceId],
  );
  return d && (!salleId || d.salle_id === salleId) ? lire(d) : null;
}
