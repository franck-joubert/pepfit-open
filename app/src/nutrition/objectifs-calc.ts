// Entrées de la règle des macros (regle.ts) : ce que l'appli et le serveur MCP lisent chez la personne (dépense des 28 derniers
// jours, séances, pesées, réglages) devient niveau, déclarations et historique. Pur : les deux côtés l'appellent avec les
// mêmes données (tests/macros-contexte.test.ts). Rien ne s'affiche ici.
import { cleJour, decalerJour, SEANCES_PAR_DEFAUT, type ContexteCalcul } from "./calculs";
import { REGLE, type Declarations, type EvaluationCible, type HistoriqueRegle, type NiveauEntrainement, type ResultatNutrition, type SexeRegle } from "./regle";

/** Séances par semaine selon le niveau en sport du parcours (0 à 3) ; défaut 3. */
export const SEANCES_PAR_NIVEAU_SPORT = [2, 3, 4, 6] as const;

/** Niveau du parcours (réglage « niveau_sport », 0 à 3) → niveau d'entraînement (D5) : débutant, intermédiaire (1 et 2), avancé. */
export function niveauDepuisSport(s: string | number | null | undefined): NiveauEntrainement {
  const n = s == null || s === "" ? NaN : Number(s);
  if (n === 0) return "debutant";
  if (n === 3) return "avance";
  return "intermediaire";
}

/** En dessous, l'historique est trop court pour dire quoi que ce soit : le parcours décide. */
const HISTORIQUE_MIN_JOURS = 90;

/**
 * Ancienneté d'entraînement d'après la première séance connue (pepfit ou importée) : moins d'un an, de un à trois ans, plus de
 * trois ans (D5, retours 02/11 : « débutant / avancé » se lisait comme des connaissances, pas comme une ancienneté).
 */
export function niveauDepuisAnciennete(premiere: number | null | undefined, maintenant: number): NiveauEntrainement | null {
  if (premiere == null || !Number.isFinite(premiere)) return null;
  const jours = (maintenant - premiere) / 86_400_000;
  if (jours < HISTORIQUE_MIN_JOURS) return null;
  return jours < 365 ? "debutant" : jours < 3 * 365 ? "intermediaire" : "avance";
}

/** Niveau choisi à la main (réglage « nutri_niveau »), sinon l'ancienneté de l'historique, sinon celui du parcours. */
export function niveauEntrainement(
  choisi: string | null | undefined,
  sport: string | number | null | undefined,
  premiereSeance?: number | null,
  maintenant: number = Date.now(),
): NiveauEntrainement {
  if (choisi === "debutant" || choisi === "intermediaire" || choisi === "avance") return choisi;
  return niveauDepuisAnciennete(premiereSeance, maintenant) ?? niveauDepuisSport(sport);
}

const CLES_DECLARATIONS: readonly (keyof Declarations)[] = ["grossesse", "allaitement", "troubleAlimentaire", "diabeteOuRein", "traitementObesite", "chirurgieBariatrique"];

/** Déclarations de santé (réglage « nutri_declarations » : clés séparées par des virgules) ; les clés inconnues sont ignorées. */
export function declarationsDepuis(csv: string | null | undefined): Declarations {
  const d: Declarations = {};
  for (const c of (csv ?? "").split(",").map((x) => x.trim())) if ((CLES_DECLARATIONS as readonly string[]).includes(c)) d[c as keyof Declarations] = true;
  return d;
}

// ---- D19 : l'étape « Une de ces situations te concerne ? » ------------------------------------------------------------------

/** Les cases de l'étape, dans l'ordre de la planche. « injections ou opération » couvre `traitementObesite` et `chirurgieBariatrique`. */
export type CaseGardeFou = "grossesse" | "allaitement" | "troubleAlimentaire" | "diabeteOuRein" | "traitementObesite";
/** Une réponse : une case, ou « Rien de tout ça » (exclusive). */
export type ChoixGardeFou = CaseGardeFou | "rien";

/** Réglage local « nutri_declarations » : les cases cochées, séparées par des virgules, ou « rien ». Absent : l'étape n'a pas été faite. */
export const CLE_DECLARATIONS = "nutri_declarations";
/** D21 : ces réponses sont des données de santé : gardées sur le téléphone, ni dans le schéma de synchro, ni lues par le serveur MCP. */
export const REPONSE_RIEN = "rien";

/**
 * Les choix proposés selon le sexe : « Je suis enceinte » et « J'allaite » seulement pour « Femme » (f) et « Non précisé » (x)
 * (retour du 03/11 : jamais « J'allaite » à qui s'est déclaré homme) ; « Rien de tout ça » toujours en dernier. Le sexe
 * inconnu (étape pas encore faite) n'offre ni l'une ni l'autre.
 */
export function casesGardeFous(sexe: SexeRegle | null): ChoixGardeFou[] {
  const toutes: ChoixGardeFou[] = ["grossesse", "allaitement", "troubleAlimentaire", "diabeteOuRein", "traitementObesite", "rien"];
  return sexe === "f" || sexe === "x" ? toutes : toutes.filter((c) => c !== "grossesse" && c !== "allaitement");
}

/** Cocher ou décocher un choix : « Rien de tout ça » décoche les autres cases, et cocher une case le décoche. */
export function cocher(coches: readonly ChoixGardeFou[], choix: ChoixGardeFou): ChoixGardeFou[] {
  if (coches.includes(choix)) return coches.filter((c) => c !== choix);
  return choix === "rien" ? ["rien"] : [...coches.filter((c) => c !== "rien"), choix];
}

/** « Continuer » s'allume dès qu'une réponse est donnée (pas de « Passer »). */
export const peutContinuerGardeFous = (coches: readonly ChoixGardeFou[]) => coches.length > 0;

/** Les déclarations que la règle lit d'après les cases cochées. */
export function declarationsDepuisCoches(coches: readonly ChoixGardeFou[]): Declarations {
  const d: Declarations = {};
  for (const c of coches) if (c !== "rien") d[c] = true;
  return d;
}

/** Les cases à montrer cochées : les déclarations enregistrées (« injections ou opération » comprend la chirurgie) ; « rien » si l'étape est faite sans case. */
export function cochesDepuisDeclarations(csv: string | null | undefined): ChoixGardeFou[] {
  if (csv == null || csv.trim() === "") return [];
  const d = declarationsDepuis(csv);
  const c: ChoixGardeFou[] = [];
  if (d.grossesse) c.push("grossesse");
  if (d.allaitement) c.push("allaitement");
  if (d.troubleAlimentaire) c.push("troubleAlimentaire");
  if (d.diabeteOuRein) c.push("diabeteOuRein");
  if (d.traitementObesite || d.chirurgieBariatrique) c.push("traitementObesite");
  return c.length ? c : ["rien"];
}

/** Ce qui s'écrit dans « nutri_declarations » pour ces cases (« rien » : l'étape est faite, aucune case). */
export const csvDepuisCoches = (coches: readonly ChoixGardeFou[]) => (coches.length === 0 || coches.includes("rien") ? REPONSE_RIEN : coches.join(","));

/** L'étape a-t-elle été faite ? */
export const gardeFousRepondus = (csv: string | null | undefined) => csv != null && csv.trim() !== "";

/** « Je suis enceinte » ne vaut plus si le sexe n'est ni « Femme » ni « Non précisé » (la réponse reste enregistrée, la règle l'écarte). */
export function declarationsPourSexe(d: Declarations, sexe: SexeRegle | null): Declarations {
  if (sexe === "f" || sexe === "x" || !d.grossesse) return d;
  const { grossesse: _g, ...reste } = d;
  return reste;
}

/** Grossesse ou trouble alimentaire : l'étape « cible » (poids visé) du parcours est sautée. */
export const cibleSautee = (d: Declarations) => d.grossesse === true || d.troubleAlimentaire === true;

// ---- D20 : ce que l'appli montre selon le statut --------------------------------------------------------------------------

/** L'écran Objectifs : le calcul complet, le calcul limité (une phrase en tête, entretien), sans chiffres, grossesse ou mineur. */
export type EcranObjectifs = "complet" | "limite" | "sans_chiffres" | "grossesse" | "mineur";

export interface ModeAffichage {
  statut: ResultatNutrition["statut"];
  ecran: EcranObjectifs;
  /** Clés de raisons et de renvois (macros.raison.*, macros.renvoi.*). */
  raisons: string[];
  renvois: string[];
  /** D20 : ni calories ni macros nulle part (Objectifs, journal, accueil, IA) ; le journal garde les aliments et les repas. */
  sansChiffres: boolean;
  /** Le tableau des objectifs (kcal, macros, fibres, sucres), les anneaux et les jauges du journal. */
  objectifsVisibles: boolean;
  /** Les totaux du jour dans le journal : gardés pour la grossesse et les mineurs (rien n'interdit de voir ce qu'on mange). */
  totauxJournalVisibles: boolean;
  /** Poids cible, % de gras cible et rythme : retirés quand le calcul est limité (« Objectif : Entretien »). */
  ciblesVisibles: boolean;
}

/** D20 : d'après le statut de la règle, ce que les écrans montrent. Une seule fonction pour l'appli entière. */
export function modeAffichage(r: Pick<ResultatNutrition, "statut" | "raisons" | "renvois" | "sansChiffres">): ModeAffichage {
  const nonCalcule = r.statut === "non_calcule";
  const ecran: EcranObjectifs = nonCalcule ? (r.raisons[0] === "mineur" ? "mineur" : "grossesse") : r.sansChiffres ? "sans_chiffres" : r.statut === "limite" ? "limite" : "complet";
  return {
    statut: r.statut,
    ecran,
    raisons: r.raisons,
    renvois: r.renvois,
    sansChiffres: r.sansChiffres && !nonCalcule,
    objectifsVisibles: ecran === "complet" || ecran === "limite",
    totauxJournalVisibles: ecran !== "sans_chiffres",
    ciblesVisibles: ecran === "complet",
  };
}

// ---- D16 : la note sur la cible ------------------------------------------------------------------------------------------------

/** Réglage local « nutri_cible_geste » : « garder:82:12.2 », la cible que la personne a choisi de garder malgré la note. */
export const CLE_GESTE_CIBLE = "nutri_cible_geste";

export const gesteGarder = (cibleKg: number | null, grasCiblePct: number | null) => `garder:${cibleKg ?? ""}:${grasCiblePct ?? ""}`;

/** La note « cible irréaliste » (étape à 6 mois, « Garder ma cible ») : visible tant que la cible l'est et qu'elle n'a pas été gardée. */
export function noteCibleVisible(cible: Pick<EvaluationCible, "realiste"> | null | undefined, geste: string | null | undefined, cibleKg: number | null, grasCiblePct: number | null): boolean {
  return cible != null && !cible.realiste && geste !== gesteGarder(cibleKg, grasCiblePct);
}

/** Un jour de dépense tel que l'appli le range (table jour_energie, colonne `depense`). */
export interface JourDepense {
  /** « AAAA-MM-JJ ». */
  jour: string;
  kcal: number;
  /** Dépense recalée sur le poids (le journal et les pesées suffisaient). */
  recalee: boolean;
  /** Jour encore ouvert quand il a été écrit : pas final s'il est passé. */
  enCours: boolean;
  /** Apports du journal (pas des habitudes). */
  apportsJournal: boolean;
}

/** Les champs de la colonne `depense` dont la règle a besoin (même forme côté appli et côté serveur). */
export interface DepenseJson {
  kcal?: number;
  recalee?: boolean;
  en_cours?: boolean;
  apports?: { kcal: number | null; source: string | null } | null;
}

export function jourDepenseDepuis(jour: string, d: DepenseJson | null | undefined): JourDepense | null {
  if (!d || !(typeof d.kcal === "number" && d.kcal > 0)) return null;
  return { jour, kcal: d.kcal, recalee: d.recalee === true, enCours: d.en_cours === true, apportsJournal: d.apports?.source === "journal" && (d.apports.kcal ?? 0) > 0 };
}

/**
 * Historique de dépense des 28 jours qui précèdent aujourd'hui (D1). Mesurée : moyenne des jours recalés sur le poids (le
 * journal et les pesées de pepfit), quand 14 jours au moins ont leurs apports au journal. Calculée : moyenne de tous les
 * jours (formule et mesures de l'appli), à partir de 7 jours. Un jour passé écrit avant minuit n'est pas final : écarté.
 */
export function historiqueDepense(jours: readonly JourDepense[], aujourdhui: string): Pick<HistoriqueRegle, "depenseMesuree28j" | "depenseCalculee28j" | "joursAvecApports28j"> {
  const debut = decalerJour(aujourdhui, -REGLE.fenetreJours);
  const fenetre = jours.filter((j) => j.jour >= debut && j.jour < aujourdhui && !j.enCours);
  const moy = (l: readonly JourDepense[]) => l.reduce((a, j) => a + j.kcal, 0) / l.length;
  const recalees = fenetre.filter((j) => j.recalee);
  const joursAvecApports = fenetre.filter((j) => j.apportsJournal).length;
  return {
    depenseMesuree28j: recalees.length >= 7 && joursAvecApports >= REGLE.minJoursApports ? { kcal: Math.round(moy(recalees)), joursAvecApports } : null,
    depenseCalculee28j: fenetre.length >= 7 ? Math.round(moy(fenetre)) : null,
    joursAvecApports28j: joursAvecApports,
  };
}

/** Perte de poids des 12 dernières semaines : (plus haut poids − dernier) ÷ plus haut, en % ; null sans pesée ni perte. */
export function perteRecente(pesees: readonly { date: number; kg: number }[], maintenant: number): number | null {
  const l = pesees.filter((p) => p.date <= maintenant && p.date >= maintenant - 84 * 86_400_000).sort((a, b) => a.date - b.date);
  if (l.length < 2) return null;
  const haut = Math.max(...l.map((p) => p.kg));
  const dernier = l[l.length - 1]!.kg;
  return dernier < haut ? ((haut - dernier) / haut) * 100 : null;
}

/** Séances par semaine : le rythme des 8 dernières semaines s'il y a eu 4 séances au moins, sinon celui du niveau du parcours. */
export function seancesParSemaineMesurees(debuts: readonly number[], maintenant: number, niveauSport: string | number | null | undefined) {
  const n = debuts.filter((d) => d <= maintenant && d >= maintenant - 56 * 86_400_000).length;
  const n8 = n >= 4 ? n / 8 : null;
  const s = niveauSport == null || niveauSport === "" ? NaN : Number(niveauSport);
  const parNiveau = Number.isInteger(s) && s >= 0 && s <= 3 ? SEANCES_PAR_NIVEAU_SPORT[s]! : SEANCES_PAR_DEFAUT;
  return { seancesParSemaine: n8 ?? parNiveau, regulier8Semaines: n >= REGLE.seancesTenHaaf * 8 };
}

export interface EntreesContexte {
  maintenant: number;
  niveauSport: string | number | null;
  /** Début de la plus ancienne séance connue (ms) : règle l'ancienneté quand rien n'est choisi. */
  premiereSeance?: number | null;
  niveauChoisi: string | null;
  declarations: string | null;
  /** Sexe du profil : la grossesse ne vaut que pour « f » et « x ». */
  sexe?: SexeRegle | null;
  /** Réglage « nutri_alerte_glucides » : « 0 » éteint l'alerte (D9). */
  alerteGlucides: string | null;
  debutsSeances: readonly number[];
  pesees: readonly { date: number; kg: number }[];
  jours: readonly JourDepense[];
}

/** Tout ce que la règle lit en plus du profil, rassemblé de la même façon dans l'appli et dans le serveur MCP. */
export function contexteDepuis(e: EntreesContexte): ContexteCalcul {
  const s = seancesParSemaineMesurees(e.debutsSeances, e.maintenant, e.niveauSport);
  return {
    niveau: niveauEntrainement(e.niveauChoisi, e.niveauSport, e.premiereSeance, e.maintenant),
    seancesParSemaine: s.seancesParSemaine,
    regulier8Semaines: s.regulier8Semaines,
    declarations: e.sexe === undefined ? declarationsDepuis(e.declarations) : declarationsPourSexe(declarationsDepuis(e.declarations), e.sexe),
    historique: { ...historiqueDepense(e.jours, cleJour(new Date(e.maintenant))), perteRecentePct12Sem: perteRecente(e.pesees, e.maintenant) },
    alerteGlucides: e.alerteGlucides !== "0",
  };
}
