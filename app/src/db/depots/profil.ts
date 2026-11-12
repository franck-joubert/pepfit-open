import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { derniereMesure } from "./mesures";
import { peseeAvant } from "./pesees";
import { ecrireReglage, lireReglage } from "./reglages";
import { estBonnet, soutienDe, tourDosValide, type Soutien } from "../../ecrans/mesures/bonnet-calc";

// Mensurations (D2) : le poids vit dans « pesee », les autres mesures dans « mensurations » avec leur historique.
// Le sexe, la date de naissance et la taille servent au calcul des objectifs et au personnage 3D de Santé.
// Profil du corps (page Corps, 29/10) : chaque valeur avec sa source et sa date ; la saisie prime, puis Whoop et Santé
// Connect (« mesure_corps » : taille, FC max). Le sexe et la date de naissance vivent dans le Profil (identité).

export const TYPES_MENSURATION = ["taille", "tour_taille", "cou", "poitrine", "hanches", "bras", "cuisse", "mollet", "epaules"] as const;
export type TypeMensuration = (typeof TYPES_MENSURATION)[number];

export interface Mensuration {
  id: string;
  type: TypeMensuration;
  date: number;
  valeur: number;
}

export type Sexe = "h" | "f";

/** Ce qu'il faut pour dessiner le corps en 3D : sexe, taille (cm) et poids (kg) les plus récents, null si inconnus. */
export async function lireMorphologie(db: Executeur): Promise<{ sexe: "h" | "f" | null; tailleCm: number | null; poidsKg: number | null }> {
  const [sexe, taille, pesee] = await Promise.all([lireSexe(db), tailleProfil(db), peseeAvant(db)]);
  return { sexe, tailleCm: taille?.valeur ?? null, poidsKg: pesee?.kg ?? null };
}

export async function lireSexe(db: Executeur): Promise<Sexe | null> {
  const s = await lireReglage(db, "sexe");
  return s === "h" || s === "f" ? s : null;
}

export const ecrireSexe = (db: Executeur, sexe: Sexe) => ecrireReglage(db, "sexe", sexe);

/** Personnage des mensurations choisi pour « Non précisé » (planche mensurations-femme, D4) : une préférence de ce téléphone
 * (ni synchronisée, ni dans le profil), relue à la prise suivante. */
const CLE_PERSONNAGE = "mensurations_personnage";
export async function lirePersonnageChoisi(db: Executeur): Promise<Sexe | null> {
  const p = await lireReglage(db, CLE_PERSONNAGE);
  return p === "h" || p === "f" ? p : null;
}
export const ecrirePersonnageChoisi = (db: Executeur, p: Sexe) => ecrireReglage(db, CLE_PERSONNAGE, p);

/** Année de naissance : celle de la date complète, sinon l'année seule (anciennes installations). */
export async function lireAnneeNaissance(db: Executeur): Promise<number | null> {
  const d = await lireDateNaissance(db);
  if (d) return d.a;
  const n = Number(await lireReglage(db, "annee_naissance"));
  return n > 1900 ? n : null;
}

/** Année seule (sans jour ni mois) : gardée pour l'âge ; le Profil demande la date complète. */
export const ecrireAnneeNaissance = (db: Executeur, annee: number) => ecrireReglage(db, "annee_naissance", String(annee));

export interface DateNaissance {
  a: number;
  m: number;
  j: number;
}

const joursDuMois = (m: number, a: number) => new Date(a, m, 0).getDate();

/** « 1987-05-14 » → date ; null si illisible. */
export function lireDateIso(s: string | null | undefined): DateNaissance | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!r) return null;
  const n = { a: Number(r[1]), m: Number(r[2]), j: Number(r[3]) };
  return n.a > 1900 && n.m >= 1 && n.m <= 12 && n.j >= 1 && n.j <= joursDuMois(n.m, n.a) ? n : null;
}

/** Date de naissance complète (réglage « naissance », celui du parcours) ; null si seule l'année est connue. */
export const lireDateNaissance = async (db: Executeur) => lireDateIso(await lireReglage(db, "naissance"));

/** Écrit la date complète et garde l'année à jour (les deux réglages restent lisibles). */
export async function ecrireDateNaissance(db: Executeur, n: DateNaissance): Promise<void> {
  await ecrireReglage(db, "naissance", `${n.a}-${String(n.m).padStart(2, "0")}-${String(n.j).padStart(2, "0")}`);
  await ecrireAnneeNaissance(db, n.a);
}

/** Âge à la date `t` : depuis la date complète (anniversaire passé ou non), sinon l'année seule ; null sans rien. */
export function ageA(date: DateNaissance | null, annee: number | null, t: number): number | null {
  const auj = new Date(t);
  if (date) {
    const m = auj.getMonth() + 1;
    const j = Math.min(date.j, joursDuMois(date.m, date.a));
    return auj.getFullYear() - date.a - (date.m > m || (date.m === m && j > auj.getDate()) ? 1 : 0);
  }
  return annee != null ? auj.getFullYear() - annee : null;
}

/** Âge à la date `t` et sa précision (« annee » : seule l'année est connue, le Profil demande la date). */
export async function lireAge(db: Executeur, t: number = Date.now()): Promise<{ age: number; precision: "date" | "annee" } | null> {
  const date = await lireDateNaissance(db);
  const age = ageA(date, date ? null : await lireAnneeNaissance(db), t);
  return age == null ? null : { age, precision: date ? "date" : "annee" };
}

// ---- Valeurs du corps avec leur source -------------------------------------------------------------------------------

/** D'où vient une valeur : la saisie (parcours, Mensurations, pesée à la main), Whoop, ou une appli via Santé Connect. */
export type SourceCorps = "saisie" | "whoop" | "sante_connect";

export interface ValeurCorps {
  valeur: number;
  /** Date de la mesure ; null pour un réglage sans date (FC max saisie). */
  date: number | null;
  source: SourceCorps;
  /** Paquet Android de l'appli d'origine (Santé Connect), sinon null. */
  origine: string | null;
}

const ORIGINE_WHOOP = "com.whoop.android";
const sourceDe = (source: string, origine: string | null): SourceCorps =>
  source === "manuel" ? "saisie" : source === "whoop" || origine === ORIGINE_WHOOP ? "whoop" : "sante_connect";

/** Taille (cm) : la saisie prime (parcours, Profil) ; sinon la plus récente de Whoop ou de Santé Connect. */
export async function tailleProfil(db: Executeur, t: number = Date.now()): Promise<ValeurCorps | null> {
  const saisie = await derniereMensuration(db, "taille");
  if (saisie) return { valeur: saisie.valeur, date: saisie.date, source: "saisie", origine: null };
  const m = await derniereMesure(db, "taille", t);
  return m ? { valeur: m.valeur, date: m.date, source: sourceDe(m.source, m.origine), origine: m.origine } : null;
}

/** Poids (kg) : la pesée la plus récente, quelle que soit sa source (une pesée est un relevé daté). */
export async function poidsProfil(db: Executeur, t: number = Date.now()): Promise<ValeurCorps | null> {
  const p = await peseeAvant(db, t);
  return p ? { valeur: p.kg, date: p.date, source: sourceDe(p.source, p.origine), origine: p.origine } : null;
}

/** % de masse grasse : la mesure la plus récente (balance via Santé Connect). */
export async function grasProfil(db: Executeur, t: number = Date.now()): Promise<ValeurCorps | null> {
  const m = await derniereMesure(db, "gras", t);
  return m ? { valeur: m.valeur, date: m.date, source: sourceDe(m.source, m.origine), origine: m.origine } : null;
}

/** FC max (bpm) : le réglage « fc_max » saisi prime ; sinon celle de Whoop. Null sans l'une ni l'autre. */
export async function fcMaxProfil(db: Executeur, t: number = Date.now()): Promise<ValeurCorps | null> {
  const r = Number(await lireReglage(db, "fc_max"));
  if (r >= 100 && r <= 240) return { valeur: Math.round(r), date: null, source: "saisie", origine: null };
  const m = await derniereMesure(db, "fc_max", t);
  return m ? { valeur: m.valeur, date: m.date, source: sourceDe(m.source, m.origine), origine: m.origine } : null;
}

/** Ce que la page Corps et les calculs lisent d'un coup : chaque valeur avec sa source, null si inconnue. */
export interface ProfilCorps {
  sexe: Sexe | null;
  naissance: DateNaissance | null;
  /** Année seule (ancienne installation sans date complète) ; null si la date est connue ou s'il n'y a rien. */
  anneeSeule: number | null;
  age: number | null;
  poids: ValeurCorps | null;
  taille: ValeurCorps | null;
  gras: ValeurCorps | null;
  fcMax: ValeurCorps | null;
}

export async function lireProfilCorps(db: Executeur, t: number = Date.now()): Promise<ProfilCorps> {
  const [sexe, naissance, poids, taille, gras, fcMax] = await Promise.all([lireSexe(db), lireDateNaissance(db), poidsProfil(db, t), tailleProfil(db, t), grasProfil(db, t), fcMaxProfil(db, t)]);
  const anneeSeule = naissance ? null : await lireAnneeNaissance(db);
  return { sexe, naissance, anneeSeule, age: ageA(naissance, anneeSeule, t), poids, taille, gras, fcMax };
}

export async function derniereMensuration(db: Executeur, type: TypeMensuration): Promise<Mensuration | null> {
  return db.getFirstAsync<Mensuration>("SELECT id, type, date, valeur FROM mensurations WHERE type = ? ORDER BY date DESC, rowid DESC LIMIT 1", [type]);
}

/** Historique d'une mesure, de la plus récente à la plus ancienne. */
export function historiqueMensuration(db: Executeur, type: TypeMensuration): Promise<Mensuration[]> {
  return db.getAllAsync<Mensuration>("SELECT id, type, date, valeur FROM mensurations WHERE type = ? ORDER BY date DESC, rowid DESC", [type]);
}

export async function ajouterMensuration(db: Executeur, type: TypeMensuration, valeur: number, date: number = Date.now()): Promise<string> {
  if (!(valeur > 0) || valeur > 300) throw new Error("Mesure illisible");
  const id = nouvelId();
  await db.runAsync("INSERT INTO mensurations (id, type, date, valeur) VALUES (?,?,?,?)", [id, type, date, valeur]);
  return id;
}

/**
 * Tours pris d'un même parcours (planche mensurations, M2) : écrits ensemble, à la même date, ou pas du tout ; rien n'est
 * écrit avant « Enregistrer ». Une valeur illisible fait tout échouer.
 */
export async function ajouterMensurations(db: Executeur, tours: readonly { type: TypeMensuration; valeur: number }[], date: number = Date.now()): Promise<string[]> {
  if (tours.some((x) => !(x.valeur > 0) || x.valeur > 300)) throw new Error("Mesure illisible");
  const ids = tours.map(() => nouvelId());
  await transaction(db, async (db) => {
    for (const [i, x] of tours.entries()) await db.runAsync("INSERT INTO mensurations (id, type, date, valeur) VALUES (?,?,?,?)", [ids[i]!, x.type, date, x.valeur]);
  });
  return ids;
}

/** Corrige la valeur d'une mesure saisie (sa date ne change pas). */
export async function modifierMensuration(db: Executeur, id: string, valeur: number): Promise<void> {
  if (!(valeur > 0) || valeur > 300) throw new Error("Mesure illisible");
  await db.runAsync("UPDATE mensurations SET valeur = ? WHERE id = ?", [valeur, id]);
}

export async function supprimerMensuration(db: Executeur, id: string): Promise<void> {
  await db.runAsync("DELETE FROM mensurations WHERE id = ?", [id]);
}

// Tour de dos et bonnet (planche articulations, D11) : deux types de plus dans « mensurations », chiffrés avec elle à la
// synchro (colonne valeur), datés. Une saisie écrit le bonnet et, s'il est connu, le tour de dos, à la même date. Ils ne
// servent qu'au dessin du personnage : ni page de tour, ni coach (tests/bonnet-garde.test.ts), ni IA.

/** La dernière saisie du tour de dos et du bonnet, null s'il n'y en a pas. */
export async function lireSoutien(db: Executeur): Promise<(Soutien & { date: number }) | null> {
  return soutienDe(await db.getAllAsync<{ type: string; date: number; valeur: number }>("SELECT type, date, valeur FROM mensurations WHERE type IN ('bonnet', 'tour_dos')", []));
}

/** Enregistre une saisie (bonnet 0 à 10, dont DD, tour de dos en cm ou null) : les deux ensemble, ou rien. */
export async function ecrireSoutien(db: Executeur, s: Soutien, date: number = Date.now()): Promise<void> {
  if (!estBonnet(s.bonnet) || (s.tourDos != null && !tourDosValide(s.tourDos))) throw new Error("Mesure illisible");
  await transaction(db, async (db) => {
    await db.runAsync("INSERT INTO mensurations (id, type, date, valeur) VALUES (?,?,?,?)", [nouvelId(), "bonnet", date, s.bonnet]);
    if (s.tourDos != null) await db.runAsync("INSERT INTO mensurations (id, type, date, valeur) VALUES (?,?,?,?)", [nouvelId(), "tour_dos", date, s.tourDos]);
  });
}

/** « Effacer » : toutes les saisies du bonnet et du tour de dos, historique compris (suppression synchronisée). */
export async function effacerSoutien(db: Executeur): Promise<void> {
  await db.runAsync("DELETE FROM mensurations WHERE type IN ('bonnet', 'tour_dos')", []);
}
