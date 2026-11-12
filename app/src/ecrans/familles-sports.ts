// Cinq familles de sports (validée le 29/10, décisions du 30/10 ; planche planches/familles-sports) :
// chaque sport du catalogue en a une, qui choisit son écran de séance et de fin. Pur (sans React Native ni base) : testé par
// tests/familles-sports.test.ts, dont un test de couverture (aucun sport du catalogue sans famille).
//
//   force      Musculation, cross training : l'écran des routines et des séries (clavier, effort en mots).
//   dehors     Endurance dehors : suivi GPS, carte, allure, étapes, VMA.
//   interieur  Endurance en intérieur : le même suivi sans carte, étapes au temps, FC en direct, distance saisie à la fin.
//   seance     Sports et cours (raquette, collectif, combat, escalade, danse, HIIT…) : chrono, FC, pas, effort ; à la fin, un
//              score ou un niveau facultatif.
//   recup      Récupération et bien-être : durée simple (compte à rebours facultatif), sans effort ni zones ; ne compte pas
//              dans l'effort du jour.
import { t, type CleSimple } from "../i18n/index";
import { aUneFamille, familleDe, FAMILLE_PAR_DEFAUT, FAMILLES, SPORTS_RANGES, type Famille } from "./familles-table";
export { aUneFamille, familleDe, FAMILLE_PAR_DEFAUT, FAMILLES, SPORTS_RANGES, type Famille };

/** Sport d'un id `cat:<slug>` ou slug. */
const slugDe = (id: string) => (id.startsWith("cat:") ? id.slice(4) : id);

/** Nom affiché d'une famille (lexique, D9) : « Force », « Endurance dehors »… « Sports et cours ». */
export const nomFamille = (f: Famille) => t(`accueil.famille.${f}` as CleSimple);

/** Lieu d'un sport au départ : le premier est celui de sa famille, le second (AUTRE_LIEU) celui de l'autre famille. */
export type Lieu = "dehors" | "piscine" | "tapis" | "interieur" | "eauLibre";

/**
 * Sports qui se font dans deux familles selon le lieu, choisi au départ par un segmenté (D2) : le lieu de leur famille, puis
 * l'autre lieu et sa famille. Vélo : « Dehors / Intérieur », le libellé de main.
 */
export const AUTRE_LIEU: Record<string, { lieu: Lieu; famille: Famille; autre: Lieu }> = {
  course: { lieu: "dehors", famille: "interieur", autre: "tapis" },
  marche: { lieu: "dehors", famille: "interieur", autre: "tapis" },
  bicycling: { lieu: "dehors", famille: "interieur", autre: "interieur" },
  natation: { lieu: "piscine", famille: "dehors", autre: "eauLibre" },
};

const CLE_LIEU: Record<Lieu, CleSimple> = {
  dehors: "gps.exterieur",
  tapis: "gps.interieur",
  interieur: "gps.interieur",
  piscine: "accueil.lanceur.piscine",
  eauLibre: "accueil.lanceur.eauLibre",
};

/** Le sport se fait-il dans deux lieux (segmenté au départ) ? */
export const deuxLieux = (id: string): boolean => slugDe(id) in AUTRE_LIEU;

/**
 * Le départ propose-t-il le segmenté « Extérieur / Intérieur » (retour du 07/11) ? Seulement un sport où un GPS peut
 * avoir du sens : ceux du dehors (course, marche, vélo, rando…) et ceux à deux lieux (natation : eau libre). Ni musculation, ni
 * sports et cours, ni récupération.
 */
export const segmentDepart = (id: string): boolean => deuxLieux(id);

/**
 * L'intérieur est possible (tapis, vélo d'appartement, piscine) : le segmenté est actif. Sinon (VTT, rando, ski de fond, kayak…)
 * il est grisé sur Extérieur : `exterieurSeul`. Le drapeau est celui du catalogue des deux lieux (AUTRE_LIEU).
 */
export const interieurPossible = (id: string): boolean => deuxLieux(id);
export const exterieurSeul = (id: string): boolean => familleDe(id) === "dehors" && !interieurPossible(id);

/**
 * Les deux libellés du segmenté du départ (« Extérieur », « Intérieur » ; natation : « Piscine », « Eau libre »), ou null pour
 * un sport sans segmenté.
 */
export function lieuxDepart(id: string): [string, string] | null {
  const a = AUTRE_LIEU[slugDe(id)];
  if (a) return [t(CLE_LIEU[a.lieu]), t(CLE_LIEU[a.autre])];
  return segmentDepart(id) ? [t(CLE_LIEU.dehors), t(CLE_LIEU.interieur)] : null;
}

/** Famille de la séance : celle du sport, ou celle de l'autre lieu quand il a été choisi au départ. */
export function familleDeSeance(id: string, autreLieu: boolean): Famille {
  const a = AUTRE_LIEU[slugDe(id)];
  return autreLieu && a ? a.famille : familleDe(id);
}

/**
 * Famille d'un suivi en cours, d'après son mode : sans GPS, un sport du dehors est en intérieur (course sur tapis, vélo en
 * intérieur) ; avec le GPS, la natation est en eau libre.
 */
export function familleDuSuivi(id: string, sansGps: boolean): Famille {
  const f = familleDe(id);
  if (sansGps && f === "dehors") return "interieur";
  if (!sansGps && f === "interieur" && AUTRE_LIEU[slugDe(id)]?.famille === "dehors") return "dehors";
  return f;
}

/** Une séance de récupération (sauna, étirements…) ne compte pas dans l'effort du jour ; toutes les autres comptent (D6). */
export const compteDansEffort = (f: Famille): boolean => f !== "recup";

/**
 * Unité de la mesure d'un sport d'endurance (correction 4 du 30/10) : allure au km (course, marche, rando), au 500 m
 * (rameur), au 100 m (natation) ; vitesse en km/h (vélos, vélo à air, roller).
 */
export type MesureSport = "allure-km" | "allure-500" | "allure-100" | "vitesse";
const MESURE: Record<string, MesureSport> = {
  bicycling: "vitesse", vtt: "vitesse", "bicycling-stationary": "vitesse", "assault-bike": "vitesse", skating: "vitesse",
  "rowing-stationary": "allure-500", kayak: "allure-500",
  natation: "allure-100",
};
export const mesureSport = (id: string): MesureSport => MESURE[slugDe(id)] ?? "allure-km";

/** Allure (s par km) ramenée à l'unité de la mesure : au 500 m et au 100 m, la même allure divisée. */
export function allureEnUnite(sParKm: number, m: MesureSport): number {
  return m === "allure-500" ? sParKm / 2 : m === "allure-100" ? sParKm / 10 : sParKm;
}

/** Sports où l'on ne marche pas : les pas sont masqués (correction 8 du 30/10). */
const SANS_PAS = new Set(["motocross", "sport-auto", "voile", "plongee"]);
export const avecPas = (id: string): boolean => familleDe(id) === "seance" && !SANS_PAS.has(slugDe(id));

/** Sports rangés par famille, dans l'ordre des familles, chaque groupe dans son ordre d'origine ; les groupes vides sont omis. */
export function grouperParFamille<S extends { id: string }>(sports: readonly S[]): { famille: Famille; sports: S[] }[] {
  return FAMILLES.map((famille) => ({ famille, sports: sports.filter((s) => familleDe(s.id) === famille) })).filter((g) => g.sports.length > 0);
}
