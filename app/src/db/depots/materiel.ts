// Matériel d'un lieu (planche materiel ; docs/CODE-MATERIEL.md) : poids libres, barres et disques (salle_materiel), postes et
// cardio (salle.postes), barre choisie par exercice (exercice_materiel) et charges réalisables d'un exercice dans un lieu.
import { transaction } from "../exclusif";
import { depuisUnite, type Unite } from "../../ecrans/format";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import {
  barreChargee, barreDe, halteresReglables, pile, trier, type Disque, type FormeBarre, type GenreMateriel, type Trou, GENRES, BARRES,
} from "../materiel";
import { equipementDuPoste, estPosteLieu, EQUIPEMENTS, estEquipement, TOUS_POSTES_LIEU, type Equipement, type PosteLieu } from "../natures";
import { normaliserPaliers } from "../paliers";
import { PREFIXE_CACHE, ecrireReglage, lireReglage } from "./reglages";

export interface Materiel {
  id: string;
  salleId: string;
  genre: GenreMateriel;
  /** Barre : droite, ez… ; lesté : medecine_ball, wall_ball, gilet, sac. */
  forme: string | null;
  nom: string | null;
  /** Haltères, kettlebells, lestés, barres pré-chargées : les poids possédés (triés). */
  poids: number[];
  /** Barre : son poids ; réglables : le poids d'une poignée. */
  poidsPropre: number | null;
  /** Barres de ce type ; réglables : nombre de poignées. */
  nombre: number | null;
  /** Barre : charge maximale (null : sans). */
  chargeMax: number | null;
  maxParCote: number | null;
  trou: Trou | null;
  prechargee: boolean;
  /** Disques (un jeu par trou) ou disques des réglables : [{kg, paires}]. */
  disques: Disque[];
  unite: Unite;
  /** Repris de l'ancien inventaire sans savoir ce qu'il y a : à vérifier par l'utilisateur. */
  aVerifier: boolean;
}

export type NouveauMateriel = Omit<Materiel, "id" | "salleId" | "aVerifier"> & { id?: string; aVerifier?: boolean };

interface Ligne {
  id: string;
  salle_id: string;
  genre: GenreMateriel;
  forme: string | null;
  nom: string | null;
  poids: string;
  poids_propre: number | null;
  nombre: number | null;
  charge_max: number | null;
  max_par_cote: number | null;
  trou: Trou | null;
  prechargee: number;
  disques: string;
  unite: Unite;
  a_verifier: number;
  cree_le: number;
}

const json = <T>(s: string | null, defaut: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : defaut;
  } catch {
    return defaut;
  }
};

const nettoyerDisques = (l: readonly Disque[]): Disque[] => {
  const m = new Map<number, number>();
  for (const d of l) if (d.kg > 0 && d.paires > 0) m.set(Math.round(d.kg * 100) / 100, (m.get(Math.round(d.kg * 100) / 100) ?? 0) + Math.round(d.paires));
  return [...m].map(([kg, paires]) => ({ kg, paires })).sort((a, b) => b.kg - a.kg);
};

const lire = (l: Ligne): Materiel => ({
  id: l.id, salleId: l.salle_id, genre: l.genre, forme: l.forme, nom: l.nom, poids: trier(json<number[]>(l.poids, [])), poidsPropre: l.poids_propre,
  nombre: l.nombre, chargeMax: l.charge_max, maxParCote: l.max_par_cote, trou: l.trou, prechargee: l.prechargee === 1,
  disques: nettoyerDisques(json<Disque[]>(l.disques, [])), unite: l.unite, aVerifier: l.a_verifier === 1,
});

const rang = (m: Materiel) => GENRES.indexOf(m.genre);

/** Matériel du lieu : par genre (ordre de la planche), puis barres les plus lourdes d'abord. */
export async function lireMateriel(db: Executeur, salleId: string): Promise<Materiel[]> {
  const l = await db.getAllAsync<Ligne>("SELECT * FROM salle_materiel WHERE salle_id = ? ORDER BY cree_le, id", [salleId]);
  return l.map(lire).sort((a, b) => rang(a) - rang(b) || (b.poidsPropre ?? 0) - (a.poidsPropre ?? 0));
}

/** Famille de `salle.equipements` qu'un genre coche (le filtre des exercices la lit). */
export const familleDuGenre = (g: GenreMateriel): Equipement => (g === "reglables" ? "halteres" : g === "disques" ? "disque" : g === "leste" ? "autre" : g);

async function equipementsDe(db: Executeur, salleId: string): Promise<Equipement[]> {
  const s = await db.getFirstAsync<{ equipements: string }>("SELECT equipements FROM salle WHERE id = ?", [salleId]);
  return (s?.equipements ?? "").split("|").filter(estEquipement);
}

async function ecrireEquipements(db: Executeur, salleId: string, eq: readonly Equipement[]): Promise<void> {
  await db.runAsync("UPDATE salle SET equipements = ?, maj_le = ? WHERE id = ?", [EQUIPEMENTS.filter((e) => eq.includes(e)).join("|"), Date.now(), salleId]);
}

/** La famille suit le matériel : cochée à l'ajout, décochée quand le dernier élément qui la donnait part. */
async function suivreFamille(db: Executeur, salleId: string, genre: GenreMateriel, present: boolean): Promise<void> {
  const f = familleDuGenre(genre);
  const eq = await equipementsDe(db, salleId);
  if (present) {
    if (!eq.includes(f)) await ecrireEquipements(db, salleId, [...eq, f]);
    return;
  }
  const genres = GENRES.filter((g) => familleDuGenre(g) === f);
  const reste = await db.getFirstAsync(`SELECT 1 FROM salle_materiel WHERE salle_id = ? AND genre IN (${genres.map(() => "?").join(",")}) LIMIT 1`, [salleId, ...genres]);
  if (!reste && eq.includes(f) && f !== "autre") await ecrireEquipements(db, salleId, eq.filter((e) => e !== f));
}

/** Crée ou met à jour un élément (son id le désigne) ; renvoie son id. */
export async function ecrireMateriel(db: Executeur, salleId: string, m: NouveauMateriel): Promise<string> {
  const id = m.id ?? nouvelId();
  const t = Date.now();
  await transaction(db, async (db) => {
    const valeurs = [
      m.genre, m.forme, m.nom?.trim() || null, JSON.stringify(trier(m.poids)), m.poidsPropre, m.nombre, m.chargeMax, m.maxParCote, m.trou,
      m.prechargee ? 1 : 0, JSON.stringify(nettoyerDisques(m.disques)), m.unite, m.aVerifier ? 1 : 0, t,
    ];
    const deja = await db.getFirstAsync("SELECT 1 FROM salle_materiel WHERE id = ?", [id]);
    if (deja)
      await db.runAsync(
        `UPDATE salle_materiel SET genre = ?, forme = ?, nom = ?, poids = ?, poids_propre = ?, nombre = ?, charge_max = ?, max_par_cote = ?, trou = ?,
           prechargee = ?, disques = ?, unite = ?, a_verifier = ?, maj_le = ? WHERE id = ?`,
        [...valeurs, id],
      );
    else
      await db.runAsync(
        `INSERT INTO salle_materiel (genre, forme, nom, poids, poids_propre, nombre, charge_max, max_par_cote, trou, prechargee, disques, unite,
           a_verifier, maj_le, cree_le, id, salle_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...valeurs, t, id, salleId],
      );
    await suivreFamille(db, salleId, m.genre, true);
  });
  return id;
}

export async function retirerMateriel(db: Executeur, id: string): Promise<void> {
  await transaction(db, async (db) => {
    const l = await db.getFirstAsync<Ligne>("SELECT * FROM salle_materiel WHERE id = ?", [id]);
    if (!l) return;
    await db.runAsync("DELETE FROM salle_materiel WHERE id = ?", [id]);
    await db.runAsync("DELETE FROM exercice_materiel WHERE materiel_id = ?", [id]);
    await suivreFamille(db, l.salle_id, l.genre, false);
  });
}

// ---------------------------------------------------------------- ce que chaque élément permet (en kg)

const enKg = (v: number, u: Unite): number => Math.round(depuisUnite(v, u) * 100) / 100;
const disquesKg = (l: readonly Disque[], u: Unite): Disque[] => l.map((d) => ({ kg: enKg(d.kg, u), paires: d.paires }));

/** Disques du lieu qui vont sur ce trou, en kg (plusieurs jeux du même trou s'additionnent). */
export function disquesDuTrou(tous: readonly Materiel[], trou: Trou): Disque[] {
  return nettoyerDisques(tous.filter((m) => m.genre === "disques" && (m.trou ?? "50") === trou).flatMap((m) => disquesKg(m.disques, m.unite)));
}

/** Charges réalisables avec un élément, en kg ; `tous` donne les disques du lieu pour une barre. */
export function chargesDe(m: Materiel, tous: readonly Materiel[]): number[] {
  switch (m.genre) {
    case "halteres": case "kettlebell": case "leste":
      return trier(m.poids.map((p) => enKg(p, m.unite)));
    case "reglables":
      return m.poidsPropre ? halteresReglables({ poignee: enKg(m.poidsPropre, m.unite), poignees: m.nombre ?? 2, disques: disquesKg(m.disques, m.unite) }).deux : [];
    case "barre": {
      if (m.prechargee) return trier(m.poids.map((p) => enKg(p, m.unite)));
      const propre = enKg(m.poidsPropre ?? (m.unite === "lbs" ? barreDe(m.forme).lbs : barreDe(m.forme).kg), m.unite);
      return barreChargee(propre, disquesDuTrou(tous, m.trou ?? barreDe(m.forme).trou), m.maxParCote ?? Infinity, m.chargeMax == null ? Infinity : enKg(m.chargeMax, m.unite));
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------- postes et cardio (salle.postes)

export async function lirePostes(db: Executeur, salleId: string): Promise<PosteLieu[]> {
  const s = await db.getFirstAsync<{ postes: string }>("SELECT postes FROM salle WHERE id = ?", [salleId]);
  return (s?.postes ?? "").split("|").filter(estPosteLieu);
}

/** Coche ou décoche un poste (ou un appareil de cardio) ; sa famille dans `salle.equipements` suit (cochée avec lui, décochée avec le dernier). */
export async function basculerPoste(db: Executeur, salleId: string, poste: PosteLieu): Promise<void> {
  await transaction(db, async (db) => {
    const avant = await lirePostes(db, salleId);
    const coche = !avant.includes(poste);
    const apres = coche ? [...avant, poste] : avant.filter((p) => p !== poste);
    await db.runAsync("UPDATE salle SET postes = ?, maj_le = ? WHERE id = ?", [TOUS_POSTES_LIEU.filter((p) => apres.includes(p)).join("|"), Date.now(), salleId]);
    const f = equipementDuPoste(poste);
    const eq = await equipementsDe(db, salleId);
    if (coche && !eq.includes(f)) await ecrireEquipements(db, salleId, [...eq, f]);
    if (!coche && f !== "autre" && eq.includes(f) && !apres.some((p) => equipementDuPoste(p) === f)) await ecrireEquipements(db, salleId, eq.filter((e) => e !== f));
  });
}

// ---------------------------------------------------------------- dernier onglet de la fiche (gardé sur ce téléphone)

export type OngletMateriel = "libres" | "machines" | "cardio" | "postes";
const cleOnglet = (salleId: string) => `${PREFIXE_CACHE}materiel_onglet:${salleId}`;

export async function lireOngletMateriel(db: Executeur, salleId: string): Promise<OngletMateriel | null> {
  const v = await lireReglage(db, cleOnglet(salleId));
  return v === "libres" || v === "machines" || v === "cardio" || v === "postes" ? v : null;
}

export const ecrireOngletMateriel = (db: Executeur, salleId: string, o: OngletMateriel): Promise<void> => ecrireReglage(db, cleOnglet(salleId), o);

// ---------------------------------------------------------------- barre d'un exercice (D8)

/** Barre proposée par défaut : EZ pour un exercice à la barre EZ, hexagonale pour la trap bar, sinon la droite la plus lourde. */
export function barreParDefaut(barres: readonly Materiel[], slug: string | null): Materiel | null {
  const aCharger = barres.filter((b) => b.genre === "barre" && !b.prechargee);
  const s = (slug ?? "").toLowerCase();
  const voulue: FormeBarre | null = /(^|[-_])ez([-_]|$)/.test(s) ? "ez" : /trap|hex/.test(s) ? "hexagonale" : null;
  const lourde = (l: readonly Materiel[]) => [...l].sort((a, b) => (b.poidsPropre ?? 0) - (a.poidsPropre ?? 0))[0] ?? null;
  return (voulue && lourde(aCharger.filter((b) => b.forme === voulue))) || lourde(aCharger.filter((b) => b.forme === "droite")) || lourde(aCharger) || null;
}

/** Barre choisie pour cet exercice dans ce lieu (null : revenir à celle par défaut). */
export async function choisirBarre(db: Executeur, exerciceId: string, salleId: string, materielId: string | null): Promise<void> {
  if (materielId == null) await db.runAsync("DELETE FROM exercice_materiel WHERE exercice_id = ? AND salle_id = ?", [exerciceId, salleId]);
  else
    await db.runAsync(
      `INSERT INTO exercice_materiel (exercice_id, salle_id, materiel_id, maj_le) VALUES (?,?,?,?)
       ON CONFLICT(exercice_id, salle_id) DO UPDATE SET materiel_id = excluded.materiel_id, maj_le = excluded.maj_le`,
      [exerciceId, salleId, materielId, Date.now()],
    );
}

// ---------------------------------------------------------------- charges d'un exercice dans un lieu (séance)

export interface ChargesExercice {
  /** Charges réalisables, en kg, triées. */
  charges: number[];
  /** Unité de l'équipement (affichage). */
  unite: Unite;
  /** Machine : son nom (l'avis de la séance le cite). */
  nom?: string;
  /** Exercice à la barre : la barre utilisée, les barres du lieu, ses disques (kg). */
  barre?: { choisie: Materiel; barres: Materiel[]; poidsPropreKg: number; disques: Disque[]; maxParCote: number };
}

/** Une ligne d'appareil telle qu'en base (min_val et appoint depuis la migration 66). */
export interface AppareilCharge {
  type: string;
  paliers_kg: string;
  palier: number | null;
  max_val: number | null;
  min_val: number | null;
  appoint: string | null;
  unite: Unite;
  nom?: string;
}

/** Mode de chargement d'une machine : pile (première charge, pas, max) ou disques (poids à vide, disques du lieu). */
export const modeMachine = (type: string): "pile" | "disques" => (type === "disques" || type === "smith" ? "disques" : "pile");

/** Charges d'une machine, en kg : sa pile (et ses petites masses), ou son poids à vide plus les disques du lieu ; sinon ses paliers. */
export function chargesMachine(a: AppareilCharge, tous: readonly Materiel[]): number[] {
  const u = a.unite;
  if (modeMachine(a.type) === "disques") {
    const d = disquesDuTrou(tous, "50");
    if (d.length) return barreChargee(enKg(a.min_val ?? 0, u), d, Infinity, a.max_val == null ? Infinity : enKg(a.max_val, u));
  } else if (a.palier && a.palier > 0 && a.max_val) {
    const appoint = json<number[]>(a.appoint, []).filter((x) => x > 0);
    return trier(pile({ premiere: a.min_val ?? a.palier, pas: a.palier, max: a.max_val, appoint }).map((v) => enKg(v, u)));
  }
  return normaliserPaliers(json<number[]>(a.paliers_kg, []));
}

/**
 * Charges réalisables d'un exercice dans un lieu : celles de l'appareil qui le porte, sinon celles du matériel qu'il demande
 * (haltères et réglables, kettlebells, la barre choisie). Null : rien d'inventorié pour lui ici (la séance garde son pas).
 */
export async function chargesPour(db: Executeur, exerciceId: string, salleId: string | null): Promise<ChargesExercice | null> {
  if (!salleId) return null;
  const tous = await lireMateriel(db, salleId);
  const a = await db.getFirstAsync<AppareilCharge>(
    `SELECT a.type, a.nom, a.paliers_kg, a.palier, a.max_val, a.min_val, a.appoint, a.unite FROM appareil a JOIN appareil_exercice ae ON ae.appareil_id = a.id
     WHERE a.salle_id = ? AND ae.exercice_id = ? ORDER BY a.nom LIMIT 1`,
    [salleId, exerciceId],
  );
  if (a) {
    const c = chargesMachine(a, tous);
    return c.length ? { charges: c, unite: a.unite, ...(a.nom ? { nom: a.nom } : {}) } : null;
  }
  const e = await db.getFirstAsync<{ slug: string | null; equipement: Equipement }>("SELECT slug, equipement FROM exercices WHERE id = ?", [exerciceId]);
  if (!e) return null;
  const union = (l: readonly Materiel[]) => (l.length ? { charges: trier(l.flatMap((m) => chargesDe(m, tous))), unite: l[0]!.unite } : null);
  switch (e.equipement) {
    case "halteres": {
      const r = union(tous.filter((m) => m.genre === "halteres" || m.genre === "reglables"));
      return r?.charges.length ? r : null;
    }
    case "kettlebell": {
      const r = union(tous.filter((m) => m.genre === "kettlebell"));
      return r?.charges.length ? r : null;
    }
    case "barre": case "disque": {
      const barres = tous.filter((m) => m.genre === "barre");
      if (!barres.length) return null;
      const lien = await db.getFirstAsync<{ materiel_id: string }>("SELECT materiel_id FROM exercice_materiel WHERE exercice_id = ? AND salle_id = ?", [exerciceId, salleId]);
      const choisie = barres.find((b) => b.id === lien?.materiel_id) ?? barreParDefaut(barres, e.slug) ?? barres[0]!;
      const charges = chargesDe(choisie, tous);
      if (!charges.length) return null;
      const def = barreDe(choisie.forme);
      return {
        charges,
        unite: choisie.unite,
        barre: {
          choisie, barres,
          poidsPropreKg: enKg(choisie.poidsPropre ?? (choisie.unite === "lbs" ? def.lbs : def.kg), choisie.unite),
          disques: disquesDuTrou(tous, choisie.trou ?? def.trou),
          maxParCote: choisie.maxParCote ?? Infinity,
        },
      };
    }
    default:
      return null;
  }
}

/** Valeurs par défaut d'une nouvelle barre de ce type, dans l'unité voulue (D5 : sourcées, toujours modifiables). */
export function nouvelleBarre(forme: FormeBarre, unite: Unite): NouveauMateriel {
  const b = BARRES.find((x) => x.forme === forme) ?? BARRES[0]!;
  return {
    genre: "barre", forme, nom: null, poids: [], poidsPropre: unite === "lbs" ? b.lbs : b.kg, nombre: 1, chargeMax: null,
    maxParCote: b.maxParCote ?? null, trou: b.trou, prechargee: false, disques: [], unite,
  };
}

// ---------------------------------------------------------------- lignes brutes (retrait, détection : de quoi tout remettre)

export type LigneMateriel = Ligne;

export function lignesMateriel(db: Executeur, salleId: string, genres: readonly GenreMateriel[]): Promise<LigneMateriel[]> {
  return db.getAllAsync<Ligne>(`SELECT * FROM salle_materiel WHERE salle_id = ? AND genre IN (${genres.map(() => "?").join(",")})`, [salleId, ...genres]);
}

/** Remet des lignes telles qu'elles étaient (même id) ; une ligne encore là est remplacée. */
export async function restaurerLignes(db: Executeur, lignes: readonly LigneMateriel[]): Promise<void> {
  for (const l of lignes)
    await db.runAsync(
      `INSERT OR REPLACE INTO salle_materiel (id, salle_id, genre, forme, nom, poids, poids_propre, nombre, charge_max, max_par_cote, trou, prechargee,
         disques, unite, a_verifier, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [l.id, l.salle_id, l.genre, l.forme, l.nom, l.poids, l.poids_propre, l.nombre, l.charge_max, l.max_par_cote, l.trou, l.prechargee, l.disques,
        l.unite, l.a_verifier, l.cree_le ?? Date.now(), Date.now()],
    );
}
