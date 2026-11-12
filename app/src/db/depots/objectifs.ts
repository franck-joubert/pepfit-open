import type { Executeur } from "../executeur";
import { OBJECTIF_DEFAUT, cleJour, objectifDetail, versObjectif, type Activite, type CompositionCalcul, type ContexteCalcul, type Objectif, type ObjectifDetail, type TypeJour } from "../../nutrition/calculs";
import {
  CLE_DECLARATIONS,
  CLE_GESTE_CIBLE,
  cochesDepuisDeclarations,
  contexteDepuis,
  csvDepuisCoches,
  declarationsDepuis,
  declarationsPourSexe,
  gardeFousRepondus,
  gesteGarder,
  jourDepenseDepuis,
  modeAffichage,
  type ChoixGardeFou,
  type DepenseJson,
  type JourDepense,
  type ModeAffichage,
} from "../../nutrition/objectifs-calc";
import { gardeFous, type Declarations, type EtapeCible, type SexeRegle } from "../../nutrition/regle";
import { lireReglage, ecrireReglage } from "./reglages";
import { listerPesees } from "./pesees";
import { grasProfil, lireAge, lireMorphologie } from "./profil";

// Objectifs de Nutrition : deux jeux (entraînement / repos), calculés ou réglés aux roues ; jour d'entraînement par date.

interface LigneObjectif extends Objectif {
  jour: TypeJour;
}

/** Objectifs d'un type de jour : ceux qui sont réglés, sinon ceux de l'auto, sinon les valeurs par défaut. */
export async function lireObjectif(db: Executeur, jour: TypeJour): Promise<Objectif> {
  if ((await lireReglage(db, "nutri_auto")) === "1") {
    const calcule = await objectifCalcule(db, jour);
    if (calcule) return calcule;
  }
  const l = await db.getFirstAsync<LigneObjectif>("SELECT jour, proteines, glucides, lipides, sucres FROM objectifs WHERE jour = ?", [jour]);
  return l ? { proteines: l.proteines, glucides: l.glucides, lipides: l.lipides, sucres: l.sucres } : OBJECTIF_DEFAUT[jour];
}

export async function ecrireObjectif(db: Executeur, jour: TypeJour, o: Objectif): Promise<void> {
  await db.runAsync(
    "INSERT INTO objectifs (jour, proteines, glucides, lipides, sucres) VALUES (?,?,?,?,?) ON CONFLICT(jour) DO UPDATE SET proteines = excluded.proteines, glucides = excluded.glucides, lipides = excluded.lipides, sucres = excluded.sucres",
    [jour, o.proteines, o.glucides, o.lipides, o.sucres],
  );
}

/** Jours de dépense déjà calculés par l'appli (table jour_energie) sur les 30 derniers jours ; vide s'il n'y en a pas encore. */
async function joursDepense(db: Executeur, maintenant: number): Promise<JourDepense[]> {
  const debut = cleJour(new Date(maintenant - 30 * 86_400_000));
  const lignes = await db.getAllAsync<{ jour: string; depense: string }>("SELECT jour, depense FROM jour_energie WHERE jour >= ?", [debut]);
  const jours: JourDepense[] = [];
  for (const l of lignes) {
    try {
      const j = jourDepenseDepuis(l.jour, JSON.parse(l.depense) as DepenseJson);
      if (j) jours.push(j);
    } catch {
      // une ligne illisible ne compte pas
    }
  }
  return jours;
}

/** Le sexe déclaré au parcours (h, f ; « nb » et « np » du parcours comptent comme x), sinon celui du profil. */
export async function sexeDeclare(db: Executeur): Promise<SexeRegle | null> {
  const s = (await lireReglage(db, "sexe_declare")) ?? (await lireReglage(db, "sexe"));
  return s === "h" || s === "f" ? s : s === "x" || s === "nb" || s === "np" ? "x" : null;
}

/** Ce que la règle lit chez la personne en plus du profil : niveau, déclarations, séances, pesées, dépense des 28 jours. */
/** Début de la plus ancienne séance terminée (pepfit ou importée), null sans séance. */
export async function lirePremiereSeance(db: Executeur): Promise<number | null> {
  const r = await db.getFirstAsync<{ d: number | null }>("SELECT MIN(debut) AS d FROM seances WHERE fin IS NOT NULL", []);
  return r?.d ?? null;
}

export async function lireContexteCalcul(db: Executeur, maintenant: number = Date.now()): Promise<ContexteCalcul> {
  const seances = await db.getAllAsync<{ debut: number }>("SELECT debut FROM seances WHERE fin IS NOT NULL AND debut >= ?", [maintenant - 56 * 86_400_000]);
  return contexteDepuis({
    maintenant,
    niveauSport: await lireReglage(db, "niveau_sport"),
    niveauChoisi: await lireReglage(db, "nutri_niveau"),
    premiereSeance: await lirePremiereSeance(db),
    declarations: await lireReglage(db, CLE_DECLARATIONS),
    sexe: await sexeDeclare(db),
    alerteGlucides: await lireReglage(db, "nutri_alerte_glucides"),
    debutsSeances: seances.map((x) => x.debut),
    pesees: (await listerPesees(db)).map((p) => ({ date: p.date, kg: p.kg })),
    jours: await joursDepense(db, maintenant),
  });
}

/**
 * Objectifs calculés par la règle des macros (docs/CODE-MACROS.md) avec tout ce qu'elle dit : statut, méthode, source de la
 * dépense, fourchette, alertes, mention. null s'il manque le sexe, la taille, le poids ou la naissance (âge depuis la date
 * complète, sinon l'année).
 */
export async function objectifDetailCalcule(db: Executeur, jour: TypeJour, maintenant: number = Date.now()): Promise<ObjectifDetail | null> {
  const m = await lireMorphologie(db);
  const sexe = await sexeDeclare(db);
  const age = await lireAge(db, maintenant);
  if (!sexe || !m.tailleCm || !m.poidsKg || !age) return null;
  const rythme = Number(await lireReglage(db, "nutri_rythme")) || 0;
  const a = await lireReglage(db, "nutri_activite");
  const activite: Activite = a === "assise" || a === "physique" ? a : "debout";
  const compo = await lireComposition(db, maintenant);
  return objectifDetail({ sexe, tailleCm: m.tailleCm, poidsKg: m.poidsKg, age: age.age }, jour, rythme, activite, compo, await lireContexteCalcul(db, maintenant));
}

/** Objectifs calculés (quatre valeurs) ; null s'il manque le profil, ou si la règle ne donne pas de chiffres (mineur, grossesse,
 * trouble déclaré, IMC bas : le statut est dans objectifDetailCalcule). */
export async function objectifCalcule(db: Executeur, jour: TypeJour, maintenant: number = Date.now()): Promise<Objectif | null> {
  const d = await objectifDetailCalcule(db, jour, maintenant);
  return d && d.proteinesG != null ? versObjectif(d, jour) : null;
}

/** Cible lue d'un réglage : un nombre positif, sinon null. */
const cibleLue = (s: string | null) => (Number(s) > 0 ? Number(s) : null);

/**
 * Le % de gras dans le calcul : le dernier connu, et le couple poids cible / % cible. Sans % actuel, le % cible reste en
 * mémoire mais ne compte pas (pas de cible sans valeur de base, le 31/10) ; undefined : calcul d'avant, au poids.
 */
export async function lireComposition(db: Executeur, maintenant: number = Date.now()): Promise<CompositionCalcul | undefined> {
  const gras = await grasProfil(db, maintenant);
  if (!gras) return undefined;
  return { grasPct: gras.valeur, cibleKg: cibleLue(await lireReglage(db, "nutri_poids_cible")), grasCiblePct: cibleLue(await lireReglage(db, "nutri_gras_cible")) };
}

/** Jour d'entraînement : choisi par Alex pour cette date, sinon vrai si une séance a été faite ce jour-là. */
export async function estJourEntrainement(db: Executeur, date: string): Promise<boolean> {
  const choix = await lireReglage(db, `nutri_entrainement:${date}`);
  if (choix != null) return choix === "1";
  const [a, m, j] = date.split("-").map(Number) as [number, number, number];
  const debut = new Date(a, m - 1, j).getTime();
  const n = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances WHERE fin IS NOT NULL AND debut >= ? AND debut < ?", [debut, debut + 86_400_000]);
  return (n?.n ?? 0) > 0;
}

export const choisirJourEntrainement = (db: Executeur, date: string, oui: boolean) => ecrireReglage(db, `nutri_entrainement:${date}`, oui ? "1" : "0");

export { cleJour };

// ---- D19, D21 : les réponses de l'étape « Une de ces situations te concerne ? » -------------------------------------------------
// Des données de santé : réglage local « nutri_declarations », hors de la liste synchronisée (sync/schema.ts) ; le serveur MCP
// ne le lit pas (tests/macros-garde-fous.test.ts).

/** Les cases cochées (« rien » si l'étape est faite sans case, vide si elle ne l'est pas encore) et si l'étape a été faite. */
export async function lireGardeFous(db: Executeur): Promise<{ repondu: boolean; coches: ChoixGardeFou[]; declarations: Declarations }> {
  const csv = await lireReglage(db, CLE_DECLARATIONS);
  return { repondu: gardeFousRepondus(csv), coches: cochesDepuisDeclarations(csv), declarations: declarationsPourSexe(declarationsDepuis(csv), await sexeDeclare(db)) };
}

/** Enregistre les réponses (le parcours, ou « Mettre à jour ma situation ») : « Rien de tout ça » ou une liste de cases. */
export async function ecrireGardeFous(db: Executeur, coches: readonly ChoixGardeFou[]): Promise<void> {
  await ecrireReglage(db, CLE_DECLARATIONS, csvDepuisCoches(coches));
}

// ---- D20 : ce que l'appli montre -----------------------------------------------------------------------------------------------

/**
 * Le mode d'affichage de toute l'appli (Objectifs, journal, accueil) : d'après le statut de la règle ; sans profil complet, d'après
 * les seules réponses des garde-fous et l'âge (poids et taille de référence : le poids bas ne peut pas se voir sans eux).
 */
export async function lireModeAffichage(db: Executeur, maintenant: number = Date.now()): Promise<ModeAffichage> {
  const d = await objectifDetailCalcule(db, "repos", maintenant);
  if (d) return modeAffichage(d);
  const { declarations } = await lireGardeFous(db);
  const age = await lireAge(db, maintenant);
  const g = gardeFous(
    { sexe: (await sexeDeclare(db)) ?? "x", age: age?.age ?? 30, tailleCm: 175, poidsKg: 70, grasPct: null, niveau: "intermediaire", activite: "debout", declarations },
    { type: "maintien", rythmeSouhaitePctSemaine: null, poidsCibleKg: null, grasCiblePct: null },
  );
  return modeAffichage({ ...g, renvois: [] });
}

// ---- D16 : la note sur la cible --------------------------------------------------------------------------------------------------

/** « Viser 79 kg à 12,2 % » : l'étape remplace le poids cible (le % de gras cible ne change pas) et la note disparaît. */
export async function viserEtape(db: Executeur, etape: Pick<EtapeCible, "poidsKg">): Promise<void> {
  await ecrireReglage(db, "nutri_poids_cible", String(etape.poidsKg));
  await ecrireReglage(db, CLE_GESTE_CIBLE, "");
}

/** « Garder ma cible » : la note se range tant que la cible ne change pas. */
export async function garderMaCible(db: Executeur): Promise<void> {
  await ecrireReglage(db, CLE_GESTE_CIBLE, gesteGarder(cibleLue(await lireReglage(db, "nutri_poids_cible")), cibleLue(await lireReglage(db, "nutri_gras_cible"))));
}

/** Le geste enregistré sur la note (null sans geste). */
export async function lireGesteCible(db: Executeur): Promise<string | null> {
  const g = await lireReglage(db, CLE_GESTE_CIBLE);
  return g ? g : null;
}
