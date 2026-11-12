// Bilan énergétique de Santé (planche sante-energie, NOTES § 1 et 2, validée) : métabolisme de base selon la méthode,
// dépense du jour = BMR + EAT net + NEAT + TEF, solde = apports − dépense. Toujours une valeur, avec sa précision
// (NOTES-ENERGIE.md, energie-precision.ts). Sans React Native (tests/energie.test.ts).
import {
  ERREUR_DIGESTION, ERREUR_METHODE, ERREUR_NEAT, ERREUR_SPORT, mifflinPartiel, PAS_DEFAUT, precisionDe, quadratique,
  type ApportsEstimes, type ManqueProfil, type Precision, type ProfilPartiel,
} from "./energie-precision";
import { kcalSeance, type CorpsKcal, type MethodeKcal } from "./kcal-seance";
import type { MotEffort } from "../boutique/poids";

/** kcal par pas (NEAT) et part des apports dépensée par la digestion (TEF) : réglables (D10). KCAL_PAR_PAS : valeur du mode
 * Manuel, et de l'Automatique sans poids ni taille. */
export const KCAL_PAR_PAS = 0.035;
export const PART_DIGESTION = 0.1;
/** Une mesure de la balance (BMR, masse maigre) sert 30 jours, ensuite on passe à la méthode suivante. */
export const VALIDITE_MESURE_JOURS = 30;
// les kcal d'une séance : calculées par pepfit (kcal-seance.ts), jamais celles d'un capteur
export { MET_MUSCULATION, MET_SPORT } from "./kcal-seance";

const JOUR = 86_400_000;

export type MethodeBmr = "auto" | "balance" | "katch" | "cunningham" | "mifflin" | "harris";
export const METHODES_BMR: readonly MethodeBmr[] = ["auto", "balance", "katch", "cunningham", "mifflin", "harris"];
/** Méthode réellement employée : une des méthodes, ou « defaut » (Mifflin complété par l'adulte de référence). */
export type MethodeRetenue = Exclude<MethodeBmr, "auto"> | "defaut";

export interface Profil {
  sexe: "h" | "f";
  kg: number;
  cm: number;
  age: number;
}

export interface DonneesBmr {
  /** Dernier BMR de la balance (Santé Connect) à la date du calcul. */
  balance: { kcal: number; date: number; origine: string | null } | null;
  /** Masse maigre : mesurée, sinon poids × (1 − % de gras). */
  maigre: { kg: number; date: number } | null;
  /** Sexe, poids, taille, âge : null s'il en manque un. */
  profil: Profil | null;
  /** Ce qu'on a du profil, même incomplet (métabolisme par défaut) ; absent : rien. */
  partiel?: ProfilPartiel;
}

export const mifflin = (p: Profil) => 10 * p.kg + 6.25 * p.cm - 5 * p.age + (p.sexe === "h" ? 5 : -161);
export const harrisBenedict = (p: Profil) =>
  p.sexe === "h" ? 88.362 + 13.397 * p.kg + 4.799 * p.cm - 5.677 * p.age : 447.593 + 9.247 * p.kg + 3.098 * p.cm - 4.33 * p.age;
export const katchMcArdle = (maigreKg: number) => 370 + 21.6 * maigreKg;
export const cunningham = (maigreKg: number) => 500 + 22 * maigreKg;

export interface ValeurBmr {
  kcal: number;
  /** Formule (« ~ ») plutôt que mesure de la balance. */
  estime: boolean;
  /** Incertitude (écart type, kcal). */
  sigma: number;
}

const recente = (date: number, t: number) => t - date <= VALIDITE_MESURE_JOURS * JOUR;

/** Valeur de chaque méthode avec les données présentes ; null : méthode sans ses données (grisée, D9). */
export function valeursBmr(d: DonneesBmr): Record<Exclude<MethodeBmr, "auto">, ValeurBmr | null> {
  const formule = (kcal: number, m: keyof typeof ERREUR_METHODE) => ({ kcal, estime: true, sigma: kcal * ERREUR_METHODE[m] });
  return {
    balance: d.balance ? { kcal: d.balance.kcal, estime: false, sigma: d.balance.kcal * ERREUR_METHODE.balance } : null,
    katch: d.maigre ? formule(katchMcArdle(d.maigre.kg), "katch") : null,
    cunningham: d.maigre ? formule(cunningham(d.maigre.kg), "cunningham") : null,
    mifflin: d.profil ? formule(mifflin(d.profil), "mifflin") : null,
    harris: d.profil ? formule(harrisBenedict(d.profil), "harris") : null,
  };
}

/** Métabolisme par défaut : Mifflin avec ce qu'on a, le reste pris à l'adulte de référence ; toujours une valeur. */
export function bmrDefaut(d: DonneesBmr): ValeurBmr & { manques: ManqueProfil[] } {
  const p = d.partiel ?? { sexe: d.profil?.sexe ?? null, kg: d.profil?.kg ?? null, cm: d.profil?.cm ?? null, age: d.profil?.age ?? null };
  const m = mifflinPartiel(p);
  return { kcal: m.kcal, estime: true, sigma: m.sigma, manques: m.manques };
}

/** « Automatique » : balance de moins de 30 jours, sinon Katch-McArdle (masse maigre de moins de 30 jours), sinon Mifflin,
 * sinon le métabolisme par défaut (jamais rien). */
export function methodeAuto(d: DonneesBmr, t: number): MethodeRetenue {
  if (d.balance && recente(d.balance.date, t)) return "balance";
  if (d.maigre && recente(d.maigre.date, t)) return "katch";
  if (d.profil) return "mifflin";
  return "defaut";
}

export interface Bmr extends ValeurBmr {
  methode: MethodeRetenue;
  /** Choix de l'utilisateur ou Automatique. */
  auto: boolean;
  /** Ce qui manque au profil quand la méthode est « defaut » (sinon vide ou absent). */
  manques?: ManqueProfil[];
}

/** BMR retenu : la méthode choisie si ses données existent, sinon Automatique ; toujours une valeur. */
export function choisirBmr(choix: MethodeBmr, d: DonneesBmr, t: number): Bmr {
  const v = valeursBmr(d);
  if (choix !== "auto" && v[choix]) return { ...v[choix]!, methode: choix, auto: false };
  const m = methodeAuto(d, t);
  if (m === "defaut") return { ...bmrDefaut(d), methode: "defaut", auto: true };
  return { ...v[m]!, methode: m, auto: true };
}

export const lireMethode = (s: string | null): MethodeBmr => (METHODES_BMR.includes(s as MethodeBmr) ? (s as MethodeBmr) : "auto");

// ---- Dépense du jour ------------------------------------------------------------------------------------------------

export interface SeanceJour {
  /** Séance pepfit (ou Hevy) : son identifiant ; absent pour une séance d'une autre appli (jour-energie.ts, pour l'IA). */
  id?: string;
  /** Début (ms) : sert seulement à reconnaître la séance dans jour_energie. */
  debut?: number;
  nom: string;
  minutes: number;
  /** FC moyenne de chaque minute (kcal-seance.ts, gardée par effort-charges.ts) ; null ou absente : aucune. */
  fc?: readonly (number | null)[] | null;
  /** FC moyenne de la séance (Whoop, activité détectée), quand la FC minute par minute manque. */
  fcMoy?: number | null;
  /** Ressenti des séries (« C'était comment ? ») : nuance les MET d'une séance sans FC. */
  ressenti?: MotEffort | null;
  /** Appli source (paquet) ou null pour une séance pepfit. */
  origine: string | null;
  /** Pas faits pendant la séance (déjà comptés dans le sport), mesurés sur sa plage ; null inconnus (jamais un prorata). */
  pas: number | null;
  /** Sport de la séance (« cat:padel ») : ses MET quand rien n'est mesuré. */
  sportId?: string | null;
  /** Activité détectée pas encore associée (« Activité détectée »). */
  detectee?: boolean;
}

// ---- kcal par pas : Automatique ou Manuel ------------------------------------------------------------------------------

/** Coût net de la marche : 0,5 kcal par kg et par km (ACSM's Guidelines for Exercise Testing and Prescription, équation
 * métabolique de la marche : 0,1 mL O₂·kg⁻¹·m⁻¹ en terrain plat, ≈ 5 kcal par litre d'O₂). */
export const KCAL_PAR_KG_KM = 0.5;
/** Longueur du pas = taille × ratio (homme 0,415, femme 0,413, sexe inconnu 0,414). */
export const RATIO_FOULEE = { h: 0.415, f: 0.413, inconnu: 0.414 } as const;
/** Foulée plausible (m) pour croire une distance de marche rapportée aux pas. */
const FOULEE_MIN = 0.3;
const FOULEE_MAX = 1.2;

export type ModeKcalPas = "auto" | "manuel";
export const lireModeKcalPas = (s: string | null): ModeKcalPas => (s === "manuel" ? "manuel" : "auto");

export interface KcalPas {
  kcal: number;
  /** distance : distance de marche du jour ÷ pas ; profil : poids et taille ; defaut : 0,035 (estimation) ; manuel : réglé. */
  source: "distance" | "profil" | "defaut" | "manuel";
  /** Ce qui manque à l'Automatique pour sortir de l'estimation. */
  manque: "poids" | "taille" | null;
}

/**
 * kcal par pas « Automatique » : 0,5 kcal/kg/km × poids × longueur du pas. Une distance de marche connue (hors séances, avec
 * ses pas) donne la vraie longueur du pas et passe avant la taille. Sans poids, ou sans taille ni distance : 0,035.
 */
export function kcalParPasAuto(p: { kg: number | null; cm: number | null; sexe: "h" | "f" | null }, marche?: { km: number; pas: number } | null): KcalPas {
  if (!p.kg || p.kg <= 0) return { kcal: KCAL_PAR_PAS, source: "defaut", manque: "poids" };
  if (marche && marche.pas > 0 && marche.km > 0) {
    const foulee = (marche.km * 1000) / marche.pas;
    if (foulee >= FOULEE_MIN && foulee <= FOULEE_MAX) return { kcal: (KCAL_PAR_KG_KM * p.kg * marche.km) / marche.pas, source: "distance", manque: null };
  }
  if (!p.cm || p.cm <= 0) return { kcal: KCAL_PAR_PAS, source: "defaut", manque: "taille" };
  const foulee = (p.cm / 100) * RATIO_FOULEE[p.sexe ?? "inconnu"];
  return { kcal: (KCAL_PAR_KG_KM * p.kg * foulee) / 1000, source: "profil", manque: null };
}

/** kcal par pas retenu : la valeur réglée en Manuel, sinon l'Automatique. */
export function kcalParPasRetenu(
  mode: ModeKcalPas,
  manuel: number,
  p: { kg: number | null; cm: number | null; sexe: "h" | "f" | null },
  marche?: { km: number; pas: number } | null,
): KcalPas {
  return mode === "manuel" ? { kcal: manuel, source: "manuel", manque: null } : kcalParPasAuto(p, marche);
}

export interface EntreeJour {
  bmr: Bmr;
  seances: readonly SeanceJour[];
  /** Pas du jour, null sans donnée (5 000 par défaut, estimés). */
  pas: number | null;
  /** kcal du journal Nutrition, null s'il est vide. */
  apports: number | null;
  /** Journal vide : apports estimés par les habitudes (null : aucune habitude connue). */
  habitudes?: ApportsEstimes | null;
  /** Dépense recalée sur l'évolution du poids : facteur et son incertitude relative. */
  recalage?: { facteur: number; sigmaRel: number } | null;
  /** Poids (MET, Keytel) ; `corps` le complète (sexe, âge, FC au repos et FC max) pour le calcul à la FC. */
  kg: number | null;
  corps?: CorpsKcal | null;
  kcalParPas?: number;
  partDigestion?: number;
  /** Jour pas fini : tout est précédé de « ~ » jusqu'à minuit (D4). */
  enCours: boolean;
  /** Part de la journée écoulée (0 à 1) quand le jour est en cours : le métabolisme de base, les pas par défaut et la digestion
   * estimée par les habitudes montent avec la journée (04/11 : « fais évoluer avec l'avancement de la journée »). */
  avancement?: number;
  /** Activités ignorées (planche activite-detectee, D3) : leurs kcal au-delà de leurs pas, ajoutées aux pas du quotidien. */
  ignorees?: { n: number; kcal: number } | null;
}

export interface Terme {
  kcal: number;
  estime: boolean;
}

export interface BilanJour {
  bmr: Terme;
  /** `estime` : une séance au moins sans FC (MET) ; la ligne Sport dit « calculé à la FC » ou « estimé », sans « ~ ». */
  sport: Terme & { seances: (SeanceJour & { kcal: number; estime: boolean; methode: MethodeKcal })[] };
  /** Pas hors sport ; sans capteur : 5 000 pas par défaut (`defaut`). `seancesSansPas` : une séance au moins sans pas mesurés, le
   * hors séances est inconnu, `pasHorsSport` est alors les pas du jour, séances comprises (jamais un prorata). */
  neat: (Terme & { pasHorsSport: number; defaut: boolean; seancesSansPas?: boolean; ignorees?: number }) | null;
  digestion: Terme & { duJournal: boolean };
  /** Écart dû au recalage par le poids (dépense − formule), 0 sans recalage. */
  ajustement: number;
  /** Dépense et sa précision (écart type, niveau). */
  depense: Terme & { sigma: number; precision: Precision; recalee: boolean };
  /** Apports du journal, sinon estimés par les habitudes (`recharge.source`) ; null sans l'un ni l'autre. */
  apports: number | null;
  recharge: { source: "journal" } | ({ source: "habitudes" } & ApportsEstimes) | null;
  /** apports − dépense ; null sans apports ; estimé si les apports le sont. */
  solde: number | null;
  soldeEstime: boolean;
}

/** EAT d'une séance : le net au-dessus du repos de kcalSeance (FC minute par minute, sa FC moyenne, sinon les MET du sport). */
export function eatSeance(s: SeanceJour, bmrKcal: number, corps: CorpsKcal): { kcal: number; estime: boolean; methode: MethodeKcal } {
  const k = kcalSeance(s, corps, bmrKcal);
  return { kcal: k.kcal, estime: k.methode === "met", methode: k.methode };
}

export function bilanJour(e: EntreeJour): BilanJour {
  const kpp = e.kcalParPas ?? KCAL_PAR_PAS;
  const av = e.enCours && e.avancement != null ? Math.min(1, Math.max(0, e.avancement)) : 1;
  const bmrKcal = e.bmr.kcal * av;
  const part = e.partDigestion ?? PART_DIGESTION;
  const corps: CorpsKcal = { sexe: null, age: null, ...e.corps, kg: e.corps?.kg ?? e.kg };
  const seances = e.seances.map((s) => ({ ...s, ...eatSeance(s, e.bmr.kcal, corps) }));
  const sport = { kcal: seances.reduce((a, s) => a + s.kcal, 0), estime: seances.some((s) => s.estime), seances };
  const pasSport = e.seances.reduce((a, s) => a + (s.pas ?? 0), 0);
  const defaut = e.pas == null;
  const pasHorsSport = defaut ? PAS_DEFAUT : Math.max(0, e.pas! - pasSport);
  const ign = e.ignorees && e.ignorees.n > 0 ? e.ignorees : null;
  const seancesSansPas = !defaut && e.seances.some((s) => s.pas == null);
  const neat = {
    pasHorsSport: defaut ? pasHorsSport * av : pasHorsSport,
    kcal: (defaut ? pasHorsSport * av : pasHorsSport) * kpp + (ign?.kcal ?? 0),
    estime: true,
    defaut,
    ...(seancesSansPas ? { seancesSansPas } : {}),
    ...(ign ? { ignorees: ign.n } : {}),
  };
  const avant = bmrKcal + sport.kcal + neat.kcal;
  const duJournal = e.apports != null && e.apports > 0;
  const habitudes = duJournal ? null : (e.habitudes ?? null);
  const digestion = duJournal
    ? { kcal: e.apports! * part, estime: false, duJournal }
    : habitudes
      ? { kcal: habitudes.kcal * part * av, estime: true, duJournal }
      : { kcal: (avant * part) / (1 - part), estime: true, duJournal };
  const formule = avant + digestion.kcal;
  // incertitude de chaque terme (NOTES-ENERGIE § 3), indépendants
  const sigmaSport = quadratique(...seances.map((s) => s.kcal * (s.methode === "fc" ? ERREUR_SPORT.fc : ERREUR_SPORT.met)));
  const sigmaNeat = defaut ? ERREUR_NEAT.inconnu * bmrKcal : ERREUR_NEAT.pas * neat.kcal + ERREUR_NEAT.horsPas * bmrKcal;
  const sigmaFormule = quadratique(e.bmr.sigma * av, sigmaSport, sigmaNeat, ERREUR_DIGESTION * digestion.kcal);
  const r = e.recalage ?? null;
  const kcal = r ? formule * r.facteur : formule;
  const sigma = r ? quadratique(r.sigmaRel * (kcal - sport.kcal * r.facteur), sigmaSport) : sigmaFormule;
  const depense = {
    kcal,
    // les pas (mesurés ou par défaut) sont toujours une estimation : la dépense porte toujours « ~ »
    estime: true,
    sigma,
    precision: precisionDe(sigma, kcal),
    recalee: r != null,
  };
  const apports = duJournal ? e.apports! : (habitudes?.kcal ?? null);
  return {
    bmr: { kcal: bmrKcal, estime: e.bmr.estime },
    sport,
    neat,
    digestion,
    ajustement: kcal - formule,
    depense,
    apports,
    recharge: duJournal ? { source: "journal" } : habitudes ? { source: "habitudes", ...habitudes } : null,
    solde: apports != null ? apports - kcal : null,
    soldeEstime: !duJournal && apports != null,
  };
}

/** Segments de la barre Dépense (D2), dans l'ordre métabolisme, sport, pas, digestion ; vides retirés. Dépense recalée :
 * chaque terme suit le facteur, la barre fait toujours la dépense. */
export function segmentsDepense(b: BilanJour): { cle: "bmr" | "sport" | "neat" | "digestion"; kcal: number }[] {
  const formule = b.depense.kcal - b.ajustement;
  const k = formule > 0 ? b.depense.kcal / formule : 1;
  return [
    { cle: "bmr" as const, kcal: b.bmr.kcal * k },
    { cle: "sport" as const, kcal: b.sport.kcal * k },
    { cle: "neat" as const, kcal: (b.neat?.kcal ?? 0) * k },
    { cle: "digestion" as const, kcal: b.digestion.kcal * k },
  ].filter((s) => s.kcal > 0.5);
}

/** Largeurs des deux barres à la même échelle (fraction de la piste, la plus longue = 1). */
export function echelleBarres(depense: number, apports: number | null): { depense: number; apports: number } {
  const max = Math.max(depense, apports ?? 0, 1);
  return { depense: depense / max, apports: (apports ?? 0) / max };
}

/** Moyenne des soldes connus (7 derniers jours), null sans aucun. */
export function moyenneSoldes(l: readonly (number | null)[]): number | null {
  const v = l.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Masse maigre : mesurée (balance), sinon poids × (1 − % de gras) ; la date la plus ancienne des deux mesures. */
export function maigreDe(
  maigre: { valeur: number; date: number } | null,
  gras: { valeur: number; date: number } | null,
  poids: { kg: number; date: number } | null,
): { kg: number; date: number } | null {
  if (maigre) return { kg: maigre.valeur, date: maigre.date };
  if (gras && poids && gras.valeur > 0 && gras.valeur < 80) return { kg: poids.kg * (1 - gras.valeur / 100), date: Math.min(gras.date, poids.date) };
  return null;
}
