import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { MACHINE_DE_EXERCICE } from "../machines";
import { nouvelId } from "../id";
import { nomSql } from "../noms";
import { ecrireFichiersAEffacer, fichierDistant, fichiersAEffacer } from "./photos";
import { normaliser } from "../normaliser";
import { variantesDeRecherche } from "../proximite";
import { lireActif } from "../../i18n/index";
import {
  allureParDefaut, estEquipement, INFO_NATURE, verdictChangementNature, type Allure, type Equipement, type Nature, type VerdictNature,
} from "../natures";
import type { Exercice } from "../types";
import { recalculerExercice, recalculerToutesSeances } from "./recalcul";
import { aCapacite } from "../lieux";
import { chargerLiens } from "../liens-catalogue";

/** Colonnes d'un `Exercice` ; `nom` est le nom d'affichage dans la langue active. */
export function colonnesExercice(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  const brutes = "id, muscle, equipement, poids_corps, slug, nom_en, secondaires, categorie, picto, perso, nature, allure, appareil_id, a_verifier, note, tempo, photo, photo_vignette, photo_distante, machine_id, coach, lie_a, lien_refuse"
    .split(", ")
    .map((c) => `${p}${c}`)
    .join(", ");
  return `${nomSql(alias)} AS nom, ${brutes}`;
}

export interface NouvelExercice {
  nom: string;
  muscle?: string;
  equipement?: Equipement;
  picto?: string;
  secondaires?: string[];
  nature?: Nature;
  allure?: Allure;
  appareilId?: string;
  /** null ou absent : défaut de la famille ; « off » : aucun tempo. */
  tempo?: string | null;
  /** Photo de l'exercice (migration 70, D2) : fichiers déjà écrits dans documents/photos. */
  photo?: PhotoExercice | null;
  /** Machine du catalogue (D4) ; absente : « Sans précision ». */
  machineId?: string | null;
  /** Prénom du coach dont vient l'exercice (étiquette « De <coach> »). */
  coach?: string | null;
}

/** Fichiers de la photo d'un exercice (chemins relatifs à documents). */
export interface PhotoExercice {
  photo: string;
  vignette: string;
}

/** Id de l'exercice qui porte déjà ce nom (catalogue ou perso, en français ou en anglais), hors `sauf` ; null sinon. */
export async function exerciceDuNom(db: Executeur, nom: string, sauf?: string): Promise<string | null> {
  const norm = normaliser(nom);
  if (!norm) return null;
  const e = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM exercices WHERE (nom_norm = ? OR nom_en_norm = ?) AND id IS NOT ? ORDER BY perso LIMIT 1",
    [norm, norm, sauf ?? null],
  );
  return e?.id ?? null;
}

/**
 * Crée un exercice perso (perso = 1) et renvoie son id ; si le nom existe déjà (catalogue ou perso, en français ou en anglais), renvoie celui qui existe.
 * Le nom saisi va dans `nom_en` quand l'appli est en anglais (et dans `nom`, faute de nom français), sinon dans `nom` seul.
 */
export async function creerExercice(db: Executeur, e: NouvelExercice): Promise<string> {
  const norm = normaliser(e.nom);
  const anglais = lireActif().langue === "en";
  const existant = await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE nom_norm = ? OR nom_en_norm = ? ORDER BY perso LIMIT 1", [norm, norm]);
  if (existant) return existant.id;
  const id = nouvelId();
  const t = Date.now();
  const nature = e.nature ?? "poids_reps";
  await db.runAsync(
    `INSERT INTO exercices (id, nom, nom_norm, nom_en, nom_en_norm, muscle, equipement, poids_corps, secondaires, picto, perso, nature, allure, appareil_id, tempo, photo, photo_vignette, machine_id, coach, cree_le, maj_le)
     VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, e.nom, norm, anglais ? e.nom : null, anglais ? norm : null, e.muscle ?? null, e.equipement ?? "autre", INFO_NATURE[nature].poidsCorps ? 1 : 0,
      (e.secondaires ?? []).join("|"), e.picto ?? null, nature, nature === "distance_duree" ? (e.allure ?? "km") : null, e.appareilId ?? null, e.tempo ?? null,
      e.photo?.photo ?? null, e.photo?.vignette ?? null, e.machineId ?? null, e.coach ?? null, t, t,
    ],
  );
  return id;
}

/** Tous les exercices, triés par nom. */
export function listerExercices(db: Executeur): Promise<Exercice[]> {
  return db.getAllAsync<Exercice>(`SELECT ${colonnesExercice()} FROM exercices ORDER BY nom COLLATE NOCASE`, []);
}

/** Un exercice par id, ou null. */
export function lireExercice(db: Executeur, id: string): Promise<Exercice | null> {
  return db.getFirstAsync<Exercice>(`SELECT ${colonnesExercice()} FROM exercices WHERE id = ?`, [id]);
}

export interface FiltreExercices {
  texte?: string;
  /** Plusieurs muscles : l'un d'eux suffit. */
  muscles?: string[];
  /** Avec `true`, un muscle secondaire compte aussi (interrupteur de la feuille Muscle). */
  secondaires?: boolean;
  equipements?: Equipement[];
  /** Salle : seuls les exercices dont l'équipement est coché dans la salle (D13). */
  salleId?: string;
  limite?: number;
}

/** Lieu à équipements (salle, domicile) : seul lui filtre les exercices faisables ; un autre lieu ne filtre rien. */
async function salleFiltrante(db: Executeur, salleId: string): Promise<boolean> {
  const s = await db.getFirstAsync<{ type: string }>("SELECT type FROM salle WHERE id = ?", [salleId]);
  return !s || aCapacite(s.type, "equipements");
}

async function equipementsDeSalle(db: Executeur, salleId: string): Promise<Equipement[]> {
  const s = await db.getFirstAsync<{ equipements: string }>("SELECT equipements FROM salle WHERE id = ?", [salleId]);
  const l = (s?.equipements ?? "").split("|").filter(estEquipement);
  // Poids du corps : toujours là, plus à cocher (planche materiel, D18).
  return l.includes("poids_du_corps") ? l : ["poids_du_corps", ...l];
}

/** Clause WHERE d'un filtre ; `sans` retire une dimension (pour compter les choix d'une feuille sans la filtrer elle-même). */
async function clause(db: Executeur, f: FiltreExercices, sans?: "equipement" | "muscle" | "salle"): Promise<{ sql: string; p: (string | number)[] }> {
  const where: string[] = [];
  const p: (string | number)[] = [];
  // Par début de mot, dans le nom français, le nom anglais et le slug, sans casse ni accents ; chaque morceau de la saisie accepte aussi
  // ses équivalents français/anglais (« hip » : hip thrust, hip abduction, mais aussi les exercices dits « de hanche »).
  for (const morceau of variantesDeRecherche(f.texte ?? "")) {
    const ou: string[] = [];
    for (const variante of morceau) {
      const et: string[] = [];
      for (const m of variante) {
        et.push("(nom_norm LIKE ? OR nom_norm LIKE ? OR nom_en_norm LIKE ? OR nom_en_norm LIKE ? OR slug LIKE ? OR slug LIKE ?)");
        p.push(`${m}%`, `% ${m}%`, `${m}%`, `% ${m}%`, `${m}%`, `%-${m}%`);
      }
      ou.push(`(${et.join(" AND ")})`);
    }
    where.push(`(${ou.join(" OR ")})`);
  }
  if (sans !== "muscle" && f.muscles?.length) {
    const q = f.muscles.map(() => (f.secondaires ? "(muscle = ? OR ('|' || secondaires || '|') LIKE ?)" : "muscle = ?"));
    where.push(`(${q.join(" OR ")})`);
    for (const m of f.muscles) {
      p.push(m);
      if (f.secondaires) p.push(`%|${m}|%`);
    }
  }
  if (sans !== "equipement" && f.equipements?.length) {
    where.push(`equipement IN (${f.equipements.map(() => "?").join(",")})`);
    p.push(...f.equipements);
  }
  if (sans !== "salle" && f.salleId && (await salleFiltrante(db, f.salleId))) {
    const eq = await equipementsDeSalle(db, f.salleId);
    const avecMachines = !!(await db.getFirstAsync("SELECT 1 FROM appareil WHERE salle_id = ? AND machine_id IS NOT NULL LIMIT 1", [f.salleId]));
    const parFamille = (e: Equipement) => e === "machine" || e === "poulie" || e === "smith";
    // Salle dont les machines sont inventoriées : une machine du catalogue n'est faisable que si elle y est ; les autres suivent la case cochée.
    const simples = avecMachines ? eq.filter((e) => !parFamille(e)) : eq;
    const clauses: string[] = [];
    if (simples.length) {
      clauses.push(`equipement IN (${simples.map(() => "?").join(",")})`);
      p.push(...simples);
    }
    if (avecMachines) {
      const presentes = (
        await db.getAllAsync<{ machine_id: string }>("SELECT machine_id FROM appareil WHERE salle_id = ? AND machine_id IS NOT NULL", [f.salleId])
      ).map((x) => x.machine_id);
      const ok = Object.keys(MACHINE_DE_EXERCICE).filter((slug) => presentes.includes(MACHINE_DE_EXERCICE[slug]!));
      const connus = Object.keys(MACHINE_DE_EXERCICE);
      const fams = eq.filter(parFamille);
      const alt: string[] = [];
      if (ok.length) {
        alt.push(`slug IN (${ok.map(() => "?").join(",")})`);
        p.push(...ok);
      }
      if (fams.length) {
        alt.push(`(equipement IN (${fams.map(() => "?").join(",")}) AND (slug IS NULL OR slug NOT IN (${connus.map(() => "?").join(",")})))`);
        p.push(...fams, ...connus);
      }
      if (alt.length) clauses.push(`(equipement IN ('machine','poulie','smith') AND (${alt.join(" OR ")}))`);
    }
    where.push(clauses.length ? `(${clauses.join(" OR ")})` : "0");
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", p };
}

/** Recherche sans accents ni casse, dans le nom français comme dans le nom anglais, quelle que soit la langue de l'appli ; filtres Équipement et Muscle (multi) et Salle (D12, D13). */
export async function rechercherExercices(db: Executeur, f: FiltreExercices = {}): Promise<Exercice[]> {
  const c = await clause(db, f);
  return db.getAllAsync<Exercice>(
    `SELECT ${colonnesExercice()} FROM exercices ${c.sql} ORDER BY perso DESC, nom COLLATE NOCASE LIMIT ?`,
    [...c.p, f.limite ?? 200],
  );
}

/** Nombre d'exercices qui passent le filtre (bouton « Afficher N exercices »). */
export async function compterExercices(db: Executeur, f: FiltreExercices = {}): Promise<number> {
  const c = await clause(db, f);
  return (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM exercices ${c.sql}`, c.p))?.n ?? 0;
}

/** Équipements présents avec, pour chacun, le nombre d'exercices si on le choisissait (les autres filtres appliqués). */
export async function compteursEquipement(db: Executeur, f: FiltreExercices = {}): Promise<{ equipement: Equipement; n: number }[]> {
  const c = await clause(db, f, "equipement");
  const l = await db.getAllAsync<{ equipement: string; n: number }>(`SELECT equipement, COUNT(*) AS n FROM exercices ${c.sql} GROUP BY equipement`, c.p);
  return l.filter((x) => estEquipement(x.equipement)).map((x) => ({ equipement: x.equipement as Equipement, n: x.n }));
}

/** Muscles principaux avec leur nombre d'exercices (les autres filtres appliqués), sans l'accent ni la casse du tri. */
export async function compteursMuscle(db: Executeur, f: FiltreExercices = {}): Promise<{ muscle: string; n: number }[]> {
  const c = await clause(db, f, "muscle");
  const w = c.sql ? `${c.sql} AND muscle IS NOT NULL` : "WHERE muscle IS NOT NULL";
  return db.getAllAsync<{ muscle: string; n: number }>(`SELECT muscle, COUNT(*) AS n FROM exercices ${w} GROUP BY muscle ORDER BY muscle COLLATE NOCASE`, c.p);
}

/** Pour chaque salle, le nombre d'exercices faisables (les autres filtres appliqués). */
export async function compteursSalle(db: Executeur, f: FiltreExercices = {}): Promise<{ salleId: string; n: number }[]> {
  const salles = await db.getAllAsync<{ id: string }>("SELECT id FROM salle ORDER BY ordre, nom COLLATE NOCASE", []);
  const out: { salleId: string; n: number }[] = [];
  for (const s of salles) out.push({ salleId: s.id, n: await compterExercices(db, { ...f, salleId: s.id }) });
  return out;
}

/** Muscles principaux présents (pour la feuille de filtre). */
export async function listerMuscles(db: Executeur): Promise<string[]> {
  const l = await db.getAllAsync<{ muscle: string }>(
    "SELECT DISTINCT muscle FROM exercices WHERE muscle IS NOT NULL ORDER BY muscle COLLATE NOCASE",
    [],
  );
  return l.map((x) => x.muscle);
}

export interface PatchExercice {
  nom?: string;
  muscle?: string | null;
  secondaires?: string[];
  equipement?: Equipement;
  picto?: string | null;
  allure?: Allure | null;
  appareilId?: string | null;
  /** Remis à 0 quand Alex a confirmé la nature. */
  aVerifier?: boolean;
  /** Tempo de l'exercice : null = défaut de sa famille, « off » = aucun, sinon « 3-0-1-0 ». */
  tempo?: string | null;
  /** Photo (D2) : null la retire ; absente, rien ne change. */
  photo?: PhotoExercice | null;
  /** Machine du catalogue (D4) : null = « Sans précision ». */
  machineId?: string | null;
}

/**
 * Modifie un exercice (catalogue ou perso). La nature se change par `changerNature`.
 * Un nouveau nom s'écrit dans le champ de la langue active : `nom` en français, `nom_en` en anglais (et `nom` aussi tant que `nom` n'était qu'une copie du nom anglais).
 */
export async function modifierExercice(db: Executeur, id: string, patch: PatchExercice): Promise<PhotoExercice | null> {
  const cur = await lireExercice(db, id);
  const brut = await db.getFirstAsync<{ nom: string; nom_en: string | null }>("SELECT nom, nom_en FROM exercices WHERE id = ?", [id]);
  if (!cur || !brut) return null;
  let nom = brut.nom;
  let nomEn = brut.nom_en;
  if (patch.nom !== undefined && patch.nom.trim() !== "") {
    if (lireActif().langue === "en") {
      if (nomEn === null || nomEn.trim() === "" || nom === nomEn) nom = patch.nom;
      nomEn = patch.nom;
    } else {
      nom = patch.nom;
    }
  }
  // Photo changée ou retirée : l'ancienne est rendue (l'appelant efface ses fichiers) ; partie au serveur, elle y est effacée.
  const photo = patch.photo === undefined ? (cur.photo && cur.photo_vignette ? { photo: cur.photo, vignette: cur.photo_vignette } : null) : patch.photo;
  const ancienne = cur.photo && cur.photo_vignette && cur.photo !== photo?.photo ? { photo: cur.photo, vignette: cur.photo_vignette } : null;
  if (ancienne && cur.photo_distante) {
    const l = await fichiersAEffacer(db);
    for (const c of [ancienne.photo, ancienne.vignette].map(fichierDistant)) if (!l.includes(c)) l.push(c);
    await ecrireFichiersAEffacer(db, l);
  }
  await db.runAsync(
    `UPDATE exercices SET nom = ?, nom_norm = ?, nom_en = ?, nom_en_norm = ?, muscle = ?, secondaires = ?, equipement = ?, picto = ?, allure = ?, appareil_id = ?, a_verifier = ?, tempo = ?,
       photo = ?, photo_vignette = ?, photo_distante = ?, machine_id = ?, maj_le = ? WHERE id = ?`,
    [
      nom,
      normaliser(nom),
      nomEn,
      nomEn ? normaliser(nomEn) : null,
      patch.muscle === undefined ? cur.muscle : patch.muscle,
      patch.secondaires ? patch.secondaires.join("|") : cur.secondaires,
      patch.equipement ?? cur.equipement,
      patch.picto === undefined ? cur.picto : patch.picto,
      patch.allure === undefined ? cur.allure : patch.allure,
      patch.appareilId === undefined ? cur.appareil_id : patch.appareilId,
      patch.aVerifier === undefined ? cur.a_verifier : patch.aVerifier ? 1 : 0,
      patch.tempo === undefined ? cur.tempo : patch.tempo,
      photo?.photo ?? null,
      photo?.vignette ?? null,
      cur.photo === (photo?.photo ?? null) ? cur.photo_distante : null,
      patch.machineId === undefined ? cur.machine_id : patch.machineId,
      Date.now(),
      id,
    ],
  );
  // Le lien d'un exercice perso se retrouve par son nom : un nom changé, un lien à relire.
  if (cur.lie_a) await chargerLiens(db);
  return ancienne;
}

async function aDesKg(db: Executeur, id: string): Promise<boolean> {
  return ((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM series WHERE exercice_id = ? AND kg > 0", [id]))?.n ?? 0) > 0;
}

/** Ce qui se passerait en changeant la nature : en place (historique intact) ou variante à créer à part (D10). */
export async function evaluerChangementNature(db: Executeur, id: string, vers: Nature): Promise<VerdictNature | null> {
  const e = await lireExercice(db, id);
  if (!e) return null;
  return verdictChangementNature(e.nature, vers, await aDesKg(db, id));
}

/**
 * Change la nature en place quand c'est compatible (D10) et recalcule : renvoie le verdict.
 * Sinon rien n'est modifié (`mode: "variante"`) : l'appelant propose `creerVariante`.
 */
export async function changerNature(db: Executeur, id: string, vers: Nature): Promise<VerdictNature | null> {
  const e = await lireExercice(db, id);
  if (!e) return null;
  const v = verdictChangementNature(e.nature, vers, await aDesKg(db, id));
  if (v.mode === "variante" || e.nature === vers) return v;
  await transaction(db, async (db) => {
    await db.runAsync(
      "UPDATE exercices SET nature = ?, poids_corps = ?, allure = ?, a_verifier = 0, maj_le = ? WHERE id = ?",
      [vers, INFO_NATURE[vers].poidsCorps ? 1 : 0, vers === "distance_duree" ? (e.allure ?? allureParDefaut(e.slug)) : null, Date.now(), id],
    );
    await recalculerExercice(db, id);
    await recalculerToutesSeances(db);
  });
  return v;
}

/** Copie perso de l'exercice avec une autre nature (« Créer plutôt … ») ; l'historique reste sur l'original. Renvoie l'id. */
export async function creerVariante(db: Executeur, id: string, vers: Nature, nom?: string): Promise<string | null> {
  const e = await lireExercice(db, id);
  if (!e) return null;
  return creerExercice(db, {
    nom: nom ?? `${e.nom} (${INFO_NATURE[vers].libelle.toLowerCase()})`,
    muscle: e.muscle ?? undefined,
    secondaires: e.secondaires ? e.secondaires.split("|") : [],
    equipement: e.equipement,
    picto: e.picto ?? undefined,
    nature: vers,
    allure: vers === "distance_duree" ? allureParDefaut(e.slug) : undefined,
  });
}
