// Parcours de première utilisation (planches/parcours, NOTES § 1) : ce qu'il lit pour se pré-remplir (rejoué depuis le
// Profil) et ce qu'il enregistre, tout sur le téléphone, dans les réglages existants. Règles : parcours-calc.ts.
import type { Executeur } from "../db/executeur";
import { ajouterPesee, peseeAvant } from "../db/depots/pesees";
import { ajouterMensuration, derniereMensuration, ecrireAnneeNaissance, ecrireSexe, lireAnneeNaissance } from "../db/depots/profil";
import { ecrireGardeFous, ecrireObjectif, lireGardeFous } from "../db/depots/objectifs";
import { cibleSautee, declarationsDepuisCoches, declarationsPourSexe, type ChoixGardeFou } from "../nutrition/objectifs-calc";
import type { Declarations, SexeRegle } from "../nutrition/regle";
import { ecrireLanceur } from "../db/depots/lanceur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import {
  ageDe,
  lanceurDepuis,
  lireNaissance,
  naissanceIso,
  objectifParDefaut,
  OBJECTIFS_PARCOURS,
  partiesDepuis,
  SEXES,
  SPORTS_PARCOURS,
  type Naissance,
  type Niveau,
  type ObjectifDefaut,
  type ObjectifParcours,
  type SexeDeclare,
} from "./parcours-calc";
import type { PartiesActives } from "../ui/menu-flottant";

/** Réponses du parcours ; null = pas répondu (« Passer »). */
export interface Reponses {
  prenom: string;
  naissance: Naissance | null;
  sexe: SexeDeclare | null;
  poidsKg: number | null;
  tailleCm: number | null;
  changerPoids: boolean;
  cibleKg: number | null;
  /** kg par semaine, signé. */
  rythme: number;
  objectifs: ObjectifParcours[];
  /** Clés de SPORTS_PARCOURS. */
  sports: string[];
  niveauSport: Niveau | null;
  niveauNutrition: Niveau | null;
  /** Étape des garde-fous (D19) : cases cochées, « rien », ou vide si elle n'est pas faite. Gardées sur le téléphone (D21). */
  gardeFous: ChoixGardeFou[];
}

export const REPONSES_VIDES: Reponses = {
  prenom: "",
  naissance: null,
  sexe: null,
  poidsKg: null,
  tailleCm: null,
  changerPoids: false,
  cibleKg: null,
  rythme: 0,
  objectifs: [],
  sports: [],
  niveauSport: null,
  niveauNutrition: null,
  gardeFous: [],
};

const CLE_FAIT = "parcours_fait";

const liste = <T extends string>(s: string | null, permis: readonly T[]): T[] => {
  try {
    const l = JSON.parse(s ?? "[]") as unknown;
    return Array.isArray(l) ? l.filter((x): x is T => permis.includes(x as T)) : [];
  } catch {
    return [];
  }
};
/** Activités du catalogue prises par « Autre sport » (« cat:… »). */
const autresSports = (s: string | null): string[] => {
  try {
    const l = JSON.parse(s ?? "[]") as unknown;
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string" && x.startsWith("cat:")) : [];
  } catch {
    return [];
  }
};
const niveau = (s: string | null): Niveau | null => (s === "0" || s === "1" || s === "2" || s === "3" ? (Number(s) as Niveau) : null);

/**
 * Premier lancement ? Une installation d'avant le parcours (séances, pesées, prénom, lanceur déjà ouvert) est marquée
 * faite sans rien montrer : le parcours n'apparaît qu'à une vraie première ouverture.
 */
export async function parcoursAFaire(db: Executeur): Promise<boolean> {
  if (etatParcours.aFaire != null) return etatParcours.aFaire;
  etatParcours.aFaire = await parcoursAFaireEnBase(db);
  return etatParcours.aFaire;
}

/** Réponse lue une fois par lancement ; « Aller à l'accueil » la passe à faux (pas de retour au parcours). */
export const etatParcours: { aFaire: boolean | null } = { aFaire: null };

async function parcoursAFaireEnBase(db: Executeur): Promise<boolean> {
  if ((await lireReglage(db, CLE_FAIT)) != null) return false;
  const deja =
    !!(await lireReglage(db, "prenom")) ||
    !!(await lireReglage(db, "lanceur_init")) ||
    ((await db.getFirstAsync<{ n: number }>("SELECT (SELECT COUNT(*) FROM seances) + (SELECT COUNT(*) FROM pesee) AS n", []))?.n ?? 0) > 0;
  if (deja) await ecrireReglage(db, CLE_FAIT, "1");
  return !deja;
}

export async function marquerParcoursFait(db: Executeur): Promise<void> {
  etatParcours.aFaire = false;
  await ecrireReglage(db, CLE_FAIT, "1");
}

/** Réponses déjà connues (parcours rejoué depuis le Profil) : il repart d'elles. */
export async function lireReponses(db: Executeur): Promise<Reponses> {
  const l = (c: string) => lireReglage(db, c);
  const annee = await lireAnneeNaissance(db);
  const sexeLu = (await l("sexe_declare")) ?? (await l("sexe"));
  const cible = Number(await l("nutri_poids_cible"));
  return {
    prenom: (await l("prenom")) ?? "",
    naissance: lireNaissance(await l("naissance")) ?? (annee ? { j: 1, m: 1, a: annee } : null),
    sexe: SEXES.includes(sexeLu as SexeDeclare) ? (sexeLu as SexeDeclare) : null,
    poidsKg: (await peseeAvant(db))?.kg ?? null,
    tailleCm: (await derniereMensuration(db, "taille"))?.valeur ?? null,
    changerPoids: cible > 0,
    cibleKg: cible > 0 ? cible : null,
    rythme: Number(await l("nutri_rythme")) || 0,
    objectifs: liste(await l("parcours_objectifs"), OBJECTIFS_PARCOURS),
    sports: [...new Set([...liste(await l("parcours_sports"), SPORTS_PARCOURS.map((s) => s.cle)), ...autresSports(await l("parcours_sports"))])],
    niveauSport: niveau(await l("niveau_sport")),
    niveauNutrition: niveau(await l("niveau_nutrition")),
    gardeFous: (await lireGardeFous(db)).coches,
  };
}

/** Le sexe du parcours pour la règle : « nb » et « np » comptent comme x (calcul moyen, « Je suis enceinte » proposé). */
export const sexeRegle = (s: SexeDeclare | null): SexeRegle | null => (s === "h" || s === "f" ? s : s ? "x" : null);

/** Les situations déclarées à l'étape des garde-fous, telles que la règle les lit (la grossesse écartée pour un homme). */
export const declarationsDesReponses = (r: Pick<Reponses, "gardeFous" | "sexe">): Declarations => declarationsPourSexe(declarationsDepuisCoches(r.gardeFous), sexeRegle(r.sexe));

/** Grossesse ou trouble alimentaire déclarés : l'étape du poids visé est sautée (D19). */
export const cibleSauteeReponses = (r: Pick<Reponses, "gardeFous" | "sexe">) => cibleSautee(declarationsDesReponses(r));

/** Objectif de kcal par défaut de ces réponses (écrans 4b et 9). */
export function objectifDesReponses(r: Reponses, auj: Date = new Date()): ObjectifDefaut {
  return objectifParDefaut({
    sexe: r.sexe,
    age: r.naissance ? ageDe(r.naissance, auj) : null,
    tailleCm: r.tailleCm,
    poidsKg: r.poidsKg,
    rythme: r.changerPoids && !cibleSauteeReponses(r) ? r.rythme : 0,
    niveauSport: r.niveauSport,
    nbSports: r.sports.length,
    declarations: declarationsDesReponses(r),
  });
}

/**
 * Poids et taille de l'écran Mensurations : seule une molette touchée donne une mesure. Sans geste, sa valeur de départ
 * (70 kg, 170 cm) n'est ni une pesée ni une taille : on garde ce qui était connu (parcours rejoué), sinon rien.
 */
export function mesuresDesMolettes(
  m: { poids: number; poidsTouche: boolean; taille: number; tailleTouchee: boolean },
  connu: Pick<Reponses, "poidsKg" | "tailleCm">,
): Pick<Reponses, "poidsKg" | "tailleCm"> {
  return { poidsKg: m.poidsTouche ? m.poids : connu.poidsKg, tailleCm: m.tailleTouchee ? m.taille : connu.tailleCm };
}

export const partiesDesReponses =(r: Reponses): PartiesActives => partiesDepuis(r.objectifs, r.sports.length, r.changerPoids);

/**
 * Enregistre les réponses (fin du parcours). Ce qui est passé n'écrit rien. Les objectifs de Nutrition : calcul automatique
 * de l'appli quand tout est connu (homme ou femme), sinon les valeurs par défaut calculées avec les replis (NOTES § 1 bis).
 * Renvoie ce que la page de félicitations rappelle.
 */
export async function enregistrerReponses(db: Executeur, r: Reponses, quand: number = Date.now()): Promise<{ objectif: ObjectifDefaut; parties: PartiesActives }> {
  if (r.prenom) await ecrireReglage(db, "prenom", r.prenom.trim());
  if (r.naissance) {
    await ecrireReglage(db, "naissance", naissanceIso(r.naissance));
    await ecrireAnneeNaissance(db, r.naissance.a);
  }
  if (r.sexe === "h" || r.sexe === "f") await ecrireSexe(db, r.sexe);
  if (r.sexe) await ecrireReglage(db, "sexe_declare", r.sexe);
  const avant = await peseeAvant(db);
  if (r.poidsKg != null && avant?.kg !== r.poidsKg) await ajouterPesee(db, r.poidsKg, quand);
  const taille = await derniereMensuration(db, "taille");
  if (r.tailleCm != null && taille?.valeur !== r.tailleCm) await ajouterMensuration(db, "taille", r.tailleCm, quand);
  if (r.gardeFous.length) await ecrireGardeFous(db, r.gardeFous);
  if (r.changerPoids && r.cibleKg != null && !cibleSauteeReponses(r)) {
    await ecrireReglage(db, "nutri_poids_cible", String(r.cibleKg));
    await ecrireReglage(db, "nutri_rythme", String(r.rythme));
  }
  const objectif = objectifDesReponses(r, new Date(quand));
  const auto = !objectif.approche && (r.sexe === "h" || r.sexe === "f");
  await ecrireReglage(db, "nutri_auto", auto ? "1" : "0");
  await ecrireObjectif(db, "repos", objectif.repos);
  await ecrireObjectif(db, "entrainement", objectif.entrainement);
  await ecrireReglage(db, "parcours_objectifs", JSON.stringify(r.objectifs));
  await ecrireReglage(db, "parcours_sports", JSON.stringify(r.sports));
  if (r.sports.length) {
    // Première fois : les sports choisis seuls ; parcours rejoué : en tête de ceux déjà là.
    const init = !!(await lireReglage(db, "lanceur_init"));
    const existants = init ? (await db.getAllAsync<{ exercice_id: string }>("SELECT exercice_id FROM lanceur_sport ORDER BY ordre", [])).map((x) => x.exercice_id) : [];
    const ids = lanceurDepuis(r.sports, existants);
    if (ids.length) {
      await ecrireLanceur(db, ids);
      await ecrireReglage(db, "lanceur_init", "1");
    }
  }
  if (r.niveauSport != null) await ecrireReglage(db, "niveau_sport", String(r.niveauSport));
  if (r.niveauNutrition != null) await ecrireReglage(db, "niveau_nutrition", String(r.niveauNutrition));
  return { objectif, parties: partiesDesReponses(r) };
}

