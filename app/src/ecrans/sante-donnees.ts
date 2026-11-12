// Données de la page Santé (planche sante-energie) : ce que l'appli a déjà (pesées, mensurations, journal Nutrition,
// séances) et ce que Santé Connect donne (pas, sommeil, VFC, FC au repos, composition, séances des autres applis).
// Rien d'inventé : une donnée absente reste null et son affichage n'existe pas.
import {
  JOURS_PESEE_CALCUL, ageA, derniereMesure, historiqueMesure, importerMesures, importerPeseesSante, kcalParJour, lireAge, lireMorphologie, lireReglage, peseeAvant,
  totalDe, type Executeur, type TypeMesureCorps, type ValeurCorps,
} from "../db/api";
import { t } from "../i18n/index";
import { cleJour } from "../nutrition/calculs";
import { sante } from "../natif/sante/index";
import { nuitsWhoop } from "../whoop/lecture";
import { nuitsWithings } from "../withings/lecture";
import { lirePasJour, valeurPas, type ChoixPas } from "./pas-source";
import { niveauNuit, normaleAu, parNuit, type CleCoeur } from "./mesures/coeur-calc";
import { niveauSommeil, type NiveauPoint } from "./mesures/niveau-point";
import { lireSommeilDuJour } from "./mesures/sommeil-donnees";
import { partBesoin } from "./mesures/sommeil-dette";
import { PERMISSIONS_DEMANDE_SANTE } from "../natif/sante/logique";
import type { Sante, SeanceSport } from "../natif/sante/types";
import {
  bilanJour, choisirBmr, KCAL_PAR_PAS, kcalParPasRetenu, lireMethode, lireModeKcalPas, maigreDe, PART_DIGESTION,
  type BilanJour, type Bmr, type DonneesBmr, type KcalPas, type MethodeBmr, type ModeKcalPas, type SeanceJour,
} from "./energie-calc";
import { pasDesSeances } from "./pas-seances";
import {
  activitesDuJour, apportsDuLot, chargerLot, choixPasDuJour, consommationsDuJourLot, derniereDans, distanceDuJour, distancePlage, garderLot, peseeDuLot,
  pepfitDuJour, prechargerSante, santePasDuJour, sportsDuJour, whoopDuJour, whoopSansSeanceDuJour, type LotEnergie,
} from "./energie-lot";
import { ORIGINE_WHOOP } from "../whoop/depot";
import { lireActivites } from "../db/depots/activites";
import { kcalQuotidienIgnorees } from "./activite-detectee";
import { kcalSeance, SPORT_SANTE, type CorpsKcal } from "./kcal-seance";
import { deduireFcReposNuits } from "./fc-repos-nuit";
import { reprendreHistoriqueSante } from "./sante-historique";
import { cleFcSante } from "./kcal-fc";
import { SANTE_RECUP } from "./recuperer";
import { SPORT_MUSCU } from "./kcal-comparaison";
import {
  apportsHabitudes, decaler, etatRecalage, FENETRE_RECALAGE, MIN_ETENDUE_PESEES, MIN_JOURS_APPORTS, MIN_PESEES, RECUL_HABITUDES, recaler,
  type ApportJour, type ApportsEstimes, type ManqueProfil, type Recalage,
} from "./energie-precision";

export { decaler, type ManqueProfil };

const JOUR = 86_400_000;

/** Réglages de la dépense (D9, D10). */
export const REGLAGES_ENERGIE = { methode: "sante_bmr_methode", kcalParPas: "sante_kcal_pas", modeKcalPas: "sante_kcal_pas_mode", digestion: "sante_digestion" } as const;

export interface ReglagesEnergie {
  methode: MethodeBmr;
  /** kcal par pas : Automatique (poids, taille, distance) par défaut, ou Manuel (kcalParPas). */
  modeKcalPas: ModeKcalPas;
  /** Valeur du mode Manuel. */
  kcalParPas: number;
  partDigestion: number;
}

export async function lireReglagesEnergie(db: Executeur): Promise<ReglagesEnergie> {
  const kpp = Number(await lireReglage(db, REGLAGES_ENERGIE.kcalParPas));
  const dig = Number(await lireReglage(db, REGLAGES_ENERGIE.digestion));
  return {
    methode: lireMethode(await lireReglage(db, REGLAGES_ENERGIE.methode)),
    modeKcalPas: lireModeKcalPas(await lireReglage(db, REGLAGES_ENERGIE.modeKcalPas)),
    kcalParPas: kpp > 0 && kpp < 1 ? kpp : KCAL_PAR_PAS,
    partDigestion: dig > 0 && dig < 0.5 ? dig : PART_DIGESTION,
  };
}

/** Appli d'où vient une donnée (paquet Android) : son nom, sinon « Santé Connect ». */
const APPLIS: Record<string, string> = {
  "com.withings.wiscale2": "Withings",
  withings: "Withings", // lue directement chez Withings (withings/constantes.ts, ORIGINE_WITHINGS)
  "com.whoop.android": "Whoop",
  polar: "Polar", // lue directement chez Polar (polar/constantes.ts, ORIGINE_POLAR)
  "fi.polar.polarflow": "Polar",
  "com.sec.android.app.shealth": "Samsung Health",
  "com.fitbit.FitbitMobile": "Fitbit",
  "com.garmin.android.apps.connectmobile": "Garmin",
  "com.ouraring.oura": "Oura",
  "com.google.android.apps.fitness": "Google Fit",
  "fit.pep.open": "pepfit open",
  "fit.pep": "pepfit",
  "us.lug.fonte": "Fonte", // ancienne appli (avant le renommage), peut rester installée
};
export function nomSource(paquet: string | null | undefined): string {
  return (paquet && APPLIS[paquet]) || t("sante.santeConnect");
}

/** Nom de la source d'une valeur du corps (profil.ts) : « Saisie », « Whoop », ou l'appli passée par Santé Connect. */
export function nomSourceCorps(v: Pick<ValeurCorps, "source" | "origine">): string {
  return v.source === "saisie" ? t("sante.saisie") : v.source === "whoop" ? "Whoop" : nomSource(v.origine);
}

/** Écart minimal entre deux imports de Santé Connect (M8, docs/PERF-A.md) : Santé, Poids et VFC ouverts l'un après l'autre
 * n'en font qu'un. */
export const ECART_IMPORT_SANTE_MS = 5 * 60_000;
let importEnCours: Promise<number> | null = null;
let dernierImport = -Infinity;

/**
 * Lit Santé Connect et range les mesures du corps (balance, taille) et les pesées dans la base ; rend le nombre de valeurs
 * ajoutées. Jamais sur le chemin d'affichage : les pages lisent la base, puis se relisent si l'import a apporté du neuf. Deux
 * appels en même temps partagent le même import ; un appel moins de 5 min après le dernier rend 0, sauf `forcer` (après une
 * autorisation : attend l'import en cours, puis en refait un).
 */
export function importerSante(db: Executeur, o: { forcer?: boolean; maintenant?: number } = {}): Promise<number> {
  if (importEnCours) return o.forcer ? importEnCours.then(() => importerSante(db, o)) : importEnCours;
  const t = o.maintenant ?? Date.now();
  if (!o.forcer && t - dernierImport < ECART_IMPORT_SANTE_MS && t >= dernierImport) return Promise.resolve(0);
  dernierImport = t;
  const p = (async () => {
    if (!(await sante.disponible().catch(() => false))) return 0;
    const [mesures, pesees] = await Promise.all([importerMesures(db, sante).catch(() => 0), importerPeseesSante(db, sante).catch(() => 0)]);
    // après les mesures de la montre : la FC au repos des nuits qui n'en ont pas, déduite de la FC de nuit (C5)
    const repos = await deduireFcReposNuits(db, sante, t).catch(() => 0);
    // puis, si l'historique est accordé, quelques tranches de plus avant ces 30 jours (sante-historique.ts)
    const historique = await reprendreHistoriqueSante(db, { maintenant: t }).catch((e: unknown) => (console.warn("[sante] historique", e instanceof Error ? e.message : ""), 0));
    return mesures + pesees + repos + historique;
  })().finally(() => {
    importEnCours = null;
  });
  importEnCours = p;
  return p;
}

/** Le prochain import n'attend pas les 5 min (autorisation accordée, tests). */
export function oublierImportSante(): void {
  dernierImport = -Infinity;
}

/** Demande d'un coup ce que lit la page Santé, et l'historique si Santé Connect sait le donner (geste de l'utilisateur : la
 * ligne Santé Connect des sources). */
export async function autoriserSante(): Promise<boolean> {
  const ok = await sante.demanderPermissions(PERMISSIONS_DEMANDE_SANTE).catch(() => false);
  oublierImportSante();
  return ok;
}

/** Données des méthodes du métabolisme à la date `t` (fin du jour pour un jour passé : paliers, D4). */
export async function donneesBmr(db: Executeur, t: number): Promise<DonneesBmr> {
  const [bmr, maigre, gras, pesee, morpho, an] = await Promise.all([
    derniereMesure(db, "bmr", t),
    derniereMesure(db, "maigre", t),
    derniereMesure(db, "gras", t),
    // une pesée de plus d'un an ne fait plus le poids du jour : le poids manque, et le bilan le dit (lot 6 de la précision)
    peseeAvant(db, t, JOURS_PESEE_CALCUL),
    lireMorphologie(db),
    lireAge(db, t),
  ]);
  return assemblerBmr(bmr, maigre, gras, pesee, morpho, an?.age ?? null);
}

/** Données des méthodes du métabolisme à partir de leurs lectures (donneesBmr, ou le lot de plusieurs jours). */
function assemblerBmr(
  bmr: { valeur: number; date: number; origine: string | null } | null,
  maigre: Parameters<typeof maigreDe>[0],
  gras: Parameters<typeof maigreDe>[1],
  pesee: { kg: number; date: number } | null,
  morpho: { sexe: "h" | "f" | null; tailleCm: number | null },
  age: number | null,
): DonneesBmr {
  const poids = pesee ? { kg: pesee.kg, date: pesee.date } : null;
  const kg = poids?.kg ?? null;
  return {
    balance: bmr ? { kcal: bmr.valeur, date: bmr.date, origine: bmr.origine } : null,
    maigre: maigreDe(maigre, gras, poids),
    profil: morpho.sexe && morpho.tailleCm && kg && age ? { sexe: morpho.sexe, kg, cm: morpho.tailleCm, age } : null,
    partiel: { sexe: morpho.sexe, kg, cm: morpho.tailleCm, age },
  };
}

/** Distance de marche hors séances (km) et ses pas, pour la longueur réelle du pas ; null sans distance Santé Connect. */
async function marcheHorsSeances(lot: LotEnergie, jour: number, plages: readonly { debut: number; fin: number }[], pasHors: number | null): Promise<{ km: number; pas: number } | null> {
  if (!pasHors) return null;
  const total = distanceDuJour(lot, jour);
  if (total == null) return null;
  let m = total;
  for (const p of plages) m -= (await distancePlage(lot, jour, p.debut, p.fin)) ?? 0;
  return m > 0 ? { km: m / 1000, pas: pasHors } : null;
}

/** Nom d'une séance d'une autre appli : son titre, sinon le sport (types Santé Connect les plus courants). */
function nomSport(s: SeanceSport): string {
  if (s.titre) return s.titre;
  const sports: Record<number, string> = { 8: "sante.sport.velo", 56: "sante.sport.course", 79: "sante.sport.marche", 74: "sante.sport.natation", 70: "sante.sport.musculation", 76: "sante.sport.tennis" };
  const cle = sports[s.type];
  return cle ? t(cle as "sante.sport.velo") : t("sante.sport.autre");
}

// ---- Énergie : toujours un bilan ------------------------------------------------------------------------------------

/** Manques, dans l'ordre de la phrase : poids, taille, âge, sexe. */
export function manquesProfil(p: { sexe: "h" | "f" | null; tailleCm: number | null; kg: number | null; age: number | null }): ManqueProfil[] {
  const l: ManqueProfil[] = [];
  if (p.kg == null) l.push("poids");
  if (p.tailleCm == null) l.push("taille");
  if (p.age == null) l.push("age");
  if (p.sexe == null) l.push("sexe");
  return l;
}

/** Bloc Énergie de Santé : toujours le bilan, plus ou moins précis (retour du 29/10 : plus de « à compléter »).
 * La variante « a-completer » n'est plus produite ; gardée le temps que les écrans qui la testent encore la retirent. */
export type EtatEnergie = { etat: "bilan"; e: JourEnergie } | { etat: "a-completer"; manques: ManqueProfil[] };

export async function etatEnergie(db: Executeur, jour: number, maintenant = Date.now()): Promise<EtatEnergie> {
  return { etat: "bilan", e: await jourEnergie(db, jour, maintenant) };
}

/** Où compléter ce qui manque : le sexe et l’âge dans Réglages › Moi › Corps, le poids et la taille dans Santé › Composition. */
export function routeManque(manques: readonly ManqueProfil[]): "/settings/corps" | "/sante/composition" {
  return manques.some((m) => m === "poids" || m === "taille") ? "/sante/composition" : "/settings/corps";
}

/** « ton poids, ta taille et ton âge » */
export function listeManques(manques: readonly ManqueProfil[]): string {
  const mots = manques.map((m) => t(`sante.manque.${m}` as "sante.manque.poids"));
  return mots.length < 2 ? (mots[0] ?? "") : `${mots.slice(0, -1).join(", ")} ${t("sante.manque.et")} ${mots[mots.length - 1]}`;
}

export interface JourEnergie {
  jour: number;
  bmr: Bmr;
  bilan: BilanJour;
  /** Source du BMR de la balance (paquet) et sa date. */
  bmrMesure: { origine: string | null; date: number } | null;
  nbRepas: number;
  enCours: boolean;
  /** Dépense recalée sur le poids (null : pas encore assez de journal ou de pesées). */
  recalage: Recalage | null;
  /** kcal par pas retenu et d'où il vient (Automatique : distance, profil, estimation ; Manuel). */
  kcalPas: KcalPas & { mode: ModeKcalPas };
  /** Ce que sait le calcul des séances (poids, FC, calibration) : les kcal d'une séance prévue (energie-prevu.ts). */
  corps?: CorpsKcal;
  /** Apports habituels du jour (journal ou non, pour le jour en cours seulement) : le prévu de la page Énergie, jamais le réel. */
  habitudesJour?: ApportsEstimes | null;
}

const minuitDe = (date: string) => {
  const [a, m, j] = date.split("-").map(Number);
  return new Date(a!, m! - 1, j!).getTime();
};

/** Jours tenus du journal entre deux minuits (compris), kcal de chacun. */
async function journalEntre(db: Executeur, debut: number, fin: number): Promise<ApportJour[]> {
  const m = await kcalParJour(db, cleJour(new Date(debut)), cleJour(new Date(fin)));
  return [...m.entries()].map(([date, kcal]) => ({ jour: minuitDe(date), kcal })).filter((a) => a.kcal > 0);
}

/** Dépense de la formule seule d'un jour passé (recalage) : gardée 10 minutes, réglages compris. */
const VIE_FORMULE = 10 * 60_000;
const formules = new Map<string, { kcal: number; sigma: number; lu: number }>();

/** Oublie les dépenses gardées (journal, pesée ou réglage modifié). */
export function oublierFormules(): void {
  formules.clear();
}

const cleReglages = (r: ReglagesEnergie) => `${r.methode}|${r.modeKcalPas}|${r.kcalParPas}|${r.partDigestion}`;

/** Ce que le recalage d'un jour lit dans la base : les 28 jours d'avant (journal, pesées), et s'ils suffisent. */
function entreeRecalage(lot: LotEnergie, jour: number) {
  const debut = decaler(jour, -FENETRE_RECALAGE);
  const fin = decaler(jour, -1);
  const apports = apportsDuLot(lot, debut, fin);
  const pesees = lot.pesees.filter((p) => p.date >= debut && p.date < jour).map((p) => ({ date: p.date, kg: p.kg }));
  const etat = etatRecalage(apports, pesees);
  const suffit = etat.joursApports >= MIN_JOURS_APPORTS && etat.pesees >= MIN_PESEES && etat.etendueJours >= MIN_ETENDUE_PESEES;
  return { debut, fin, apports, pesees, etat, suffit };
}

/** Jours dont le recalage de `jour` doit calculer la formule (ni gardée en mémoire ni pas assez de journal ou de pesées). */
function formulesAFaire(lot: LotEnergie, jour: number, r: ReglagesEnergie): number[] {
  const e = entreeRecalage(lot, jour);
  if (!e.suffit) return [];
  const l: number[] = [];
  for (let j = e.debut; j <= e.fin; j = decaler(j, 1)) {
    const c = formules.get(`${j}|${cleReglages(r)}`);
    if (!c || lot.maintenant - c.lu >= VIE_FORMULE) l.push(j);
  }
  return l;
}

/**
 * Recalage de la dépense pour un jour : les 28 jours qui le précèdent (journal, pesées, dépense de la formule). On ne
 * calcule la formule de ces jours que si le journal et les pesées suffisent (sinon null, sans coût).
 */
async function recalageAvant(lot: LotEnergie, jour: number, r: ReglagesEnergie, sexe: "h" | "f" | null) {
  const { debut, fin, apports, pesees, etat, suffit } = entreeRecalage(lot, jour);
  if (!suffit) return { recalage: null, etat };
  const gras = derniereDans(lot.mesures.gras, jour);
  const formule: { kcal: number; sigma: number }[] = [];
  for (let j = debut; j <= fin; j = decaler(j, 1)) {
    const cle = `${j}|${cleReglages(r)}`;
    const c = formules.get(cle);
    if (c && lot.maintenant - c.lu < VIE_FORMULE) {
      formule.push(c);
      continue;
    }
    const e = await calculerJour(lot, j, r, false);
    const v = { kcal: e.bilan.depense.kcal, sigma: e.bilan.depense.sigma, lu: lot.maintenant };
    formules.set(cle, v);
    formule.push(v);
  }
  return { recalage: recaler({ apports, pesees, formule, grasPct: gras?.valeur ?? null, sexe }), etat };
}

/** Bilan d'un jour (minuit local) : toujours une valeur, plus ou moins précise selon les données (NOTES-ENERGIE). */
export async function jourEnergie(db: Executeur, jour: number, maintenant = Date.now(), reglages?: ReglagesEnergie, s: Sante = sante): Promise<JourEnergie> {
  const m = await joursEnergie(db, [jour], maintenant, reglages ?? (await lireReglagesEnergie(db)), s);
  return m.get(jour)!;
}

/**
 * Bilans de plusieurs jours en un lot (energie-lot.ts) : la base lue une fois pour tous les jours et leurs recalages, Santé
 * Connect une fois par source (et pas du tout pour les jours finis déjà lus). Mêmes bilans que jour par jour.
 */
export async function joursEnergie(db: Executeur, jours: readonly number[], maintenant: number, r: ReglagesEnergie, s: Sante = sante): Promise<Map<number, JourEnergie>> {
  const res = new Map<number, JourEnergie>();
  if (!jours.length) return res;
  const auj = decaler(maintenant, 0);
  const recales = jours.map((j) => Math.min(j, auj));
  const lot = await chargerLot(db, decaler(Math.min(...recales), -FENETRE_RECALAGE), Math.max(...jours), maintenant, s);
  const aLire = new Set<number>(jours);
  for (const j of recales) for (const f of formulesAFaire(lot, j, r)) aLire.add(f);
  await prechargerSante(lot, aLire);
  for (const j of jours) if (!res.has(j)) res.set(j, await calculerJour(lot, j, r, true));
  await garderLot(lot);
  return res;
}

async function calculerJour(lot: LotEnergie, jour: number, r: ReglagesEnergie, adaptatif: boolean): Promise<JourEnergie> {
  const maintenant = lot.maintenant;
  const finJour = jour + JOUR;
  const enCours = maintenant < finJour;
  const t0 = Math.min(maintenant, finJour - 1);
  const an = ageA(lot.naissance.date, lot.naissance.annee, t0);
  const d = assemblerBmr(derniereDans(lot.mesures.bmr, t0), derniereDans(lot.mesures.maigre, t0), derniereDans(lot.mesures.gras, t0), peseeDuLot(lot, t0), lot, an);
  const bmr = choisirBmr(r.methode, d, t0);
  const corps: CorpsKcal = {
    sexe: d.partiel?.sexe ?? null,
    kg: d.partiel?.kg ?? null,
    age: an,
    fcRepos: derniereDans(lot.mesures.fc, t0)?.valeur ?? null,
    fcMax: derniereDans(lot.mesures.fc_max, t0)?.valeur ?? null,
    calibration: lot.calibration,
  };
  await prechargerSante(lot, [jour]);
  const sports = sportsDuJour(lot, jour);
  const pepfit = pepfitDuJour(lot, jour);
  const ignorees = whoopSansSeanceDuJour(lot, jour);
  const choixPas = choixPasDuJour(lot, jour);
  const conso = consommationsDuJourLot(lot, jour);
  const activites = activitesDuJour(lot, jour);
  // Activités détectées (planche activite-detectee) : à associer, elles comptent dans Sport ; ignorées, leurs kcal vont aux
  // pas du quotidien (D3). Une séance « autre » de Santé Connect est retrouvée par sa clé.
  const etatSante = new Map(activites.filter((a) => a.source === "sante").map((a) => [a.cle, a.etat]));
  const cleSante = (s: { debut: number; origine: string | null }) => `sante:${s.origine ?? "?"}:${s.debut}`;
  const pas = valeurPas(choixPas);
  const chevauche = (a: { debut: number; fin: number }, b: { debut: number; fin: number }) => a.debut < b.fin && b.debut < a.fin;
  // la marche est déjà dans les pas (NEAT) : pas de terme Sport pour elle (NOTES § 2). Une séance pepfit passe toujours devant
  // sa copie Santé Connect (mêmes heures) : ses kcal se calculent chez nous (kcal-seance.ts), la copie n'apporte que son nom.
  // Avant le 31/10, une séance pepfit sans kJ de Whoop cédait la place à sa copie, comptée aux kcal « actives » de Santé
  // Connect sur sa plage : le téléphone au sac, presque rien (docs/KCAL-SEANCES.md). Une séance Whoop gardée sans séance
  // (marche de tous les jours) ne compte pas.
  const autres = (sports ?? []).filter(
    (s) =>
      s.debut >= jour && s.debut < finJour && s.type !== 79 && SANTE_RECUP[s.type] == null &&
      !pepfit.some((f) => chevauche(f, s)) &&
      !(s.origine === ORIGINE_WHOOP && ignorees.some((w) => chevauche(w, s))) &&
      etatSante.get(cleSante(s)) !== "ignoree",
  );
  const minutes = (x: { debut: number; fin: number }) => Math.round((x.fin - x.debut) / 60_000);
  // une activité détectée qui recouvre une séance déjà comptée n'est pas comptée deux fois (kcal ni pas)
  const detectees = activites.filter(
    (a) => a.etat === "a-associer" && a.source !== "sante" && !autres.some((s) => chevauche(s, a)) && !pepfit.some((f) => chevauche(f, a)),
  );
  // pas de chaque séance : ceux de Whoop (lus à l'ouverture de sa fiche ou en fond) ou de sa plage, sinon aucun (jamais un
  // prorata : le hors séances est alors inconnu) ; le NEAT ne compte que les pas hors séances (plages disjointes : chaque pas une fois)
  const plages = [
    ...autres.map((s) => ({ debut: s.debut, fin: s.fin, mesures: s.pas })),
    ...pepfit.map((f) => ({ debut: f.debut, fin: f.fin, mesures: f.pasWhoop })),
    ...detectees.map((a) => ({ debut: a.debut, fin: a.fin, mesures: a.pas })),
  ];
  const pasSeances = await pasDesSeances(choixPas, plages, santePasDuJour(lot, jour)).catch(() => plages.map(() => null));
  const nomAutre = (s: SeanceSport) => (etatSante.get(cleSante(s)) === "a-associer" ? t("activite.detectee") : nomSport(s));
  // FC d'une séance Santé Connect : sa FC minute par minute gardée (la montre, kcal-fc.ts, C11), sinon celle de la séance
  // Whoop qui la recouvre (Whoop en FC), sinon ses MET
  const whoop = whoopDuJour(lot, jour);
  const fcWhoop = (x: { debut: number; fin: number }) => whoop.find((w) => w.fcMoy != null && chevauche(w, x))?.fcMoy ?? null;
  const seances: SeanceJour[] = [
    ...autres.map((s) => ({
      debut: s.debut,
      nom: nomAutre(s),
      minutes: minutes(s),
      fc: lot.fcSante?.get(cleFcSante(s)) ?? null,
      fcMoy: fcWhoop(s),
      sportId: SPORT_SANTE[s.type] ?? null,
      origine: s.origine,
      detectee: etatSante.get(cleSante(s)) === "a-associer",
    })),
    ...pepfit.map((f) => ({ id: f.id, debut: f.debut, nom: f.nom, minutes: minutes(f), fc: f.fc, fcMoy: f.fcMoy, ressenti: f.ressenti, origine: null, sportId: f.sportId ?? SPORT_MUSCU })),
    ...detectees.map((a) => ({ debut: a.debut, nom: t("activite.detectee"), minutes: minutes(a), fcMoy: a.fcMoy, origine: a.source === "whoop" ? ORIGINE_WHOOP : null, detectee: true })),
  ].map((s, i) => ({ ...s, pas: pasSeances[i]?.pas ?? null}));
  const pasHors = pas != null ? Math.max(0, pas - seances.reduce((a, s) => a + (s.pas ?? 0), 0)) : null;
  const kcalPas = {
    ...kcalParPasRetenu(
      r.modeKcalPas,
      r.kcalParPas,
      { kg: d.partiel?.kg ?? null, cm: d.partiel?.cm ?? null, sexe: d.partiel?.sexe ?? null },
      // la longueur du pas se mesure sur les pas hors séances : sans les pas d'une séance, ils ne sont pas connus
      r.modeKcalPas === "auto" && seances.every((s) => s.pas != null) ? await marcheHorsSeances(lot, jour, plages, pasHors) : null,
    ),
    mode: r.modeKcalPas,
  };
  const total = totalDe(conso);
  const journal = conso.length && total.kcal > 0;
  // journal vide : les habitudes des jours tenus avant (seulement pour le bilan affiché, pas pour le recalage)
  const habitudes = adaptatif && !journal ? apportsHabitudes(await journalEntre(lot.db, decaler(jour, -RECUL_HABITUDES), decaler(jour, -1)), jour) : null;
  // le jour en cours : ses apports habituels même avec un journal (les apports encore à venir du prévu, energie-prevu.ts)
  const habitudesJour = adaptatif && enCours ? (habitudes ?? apportsHabitudes(await journalEntre(lot.db, decaler(jour, -RECUL_HABITUDES), decaler(jour, -1)), jour)) : null;
  const rec = adaptatif ? await recalageAvant(lot, Math.min(jour, decaler(maintenant, 0)), r, d.partiel?.sexe ?? null) : null;
  const bilan = bilanJour({
    bmr,
    seances,
    pas,
    apports: journal ? total.kcal : null,
    habitudes,
    recalage: rec?.recalage ?? null,
    kg: d.partiel?.kg ?? null,
    corps,
    kcalParPas: kcalPas.kcal,
    partDigestion: r.partDigestion,
    enCours,
    avancement: enCours ? (maintenant - jour) / JOUR : 1,
    ignorees: ignoreesDuJour(activites, kcalPas.kcal, bmr.kcal, corps),
  });
  return {
    jour,
    bmr,
    bilan,
    bmrMesure: bmr.methode === "balance" && d.balance ? { origine: d.balance.origine, date: d.balance.date } : null,
    nbRepas: new Set(conso.map((c) => c.repas_id)).size,
    enCours,
    recalage: rec?.recalage ?? null,
    kcalPas,
    corps,
    habitudesJour,
  };
}

/** Activités ignorées du jour : leurs kcal (calculées chez nous à leur FC moyenne ; sans FC, rien de plus que leurs pas) au-delà
 * de leurs pas, ajoutées aux pas du quotidien (comptées une fois, D3). */
function ignoreesDuJour(
  l: readonly { etat: string; fcMoy: number | null; pas: number | null; debut: number; fin: number }[],
  kcalParPas: number,
  bmrKcal: number,
  corps: CorpsKcal,
) {
  const ign = l.filter((a) => a.etat === "ignoree");
  if (!ign.length) return null;
  const actives = ign.map((a) => ({
    kcal: a.fcMoy != null ? kcalSeance({ minutes: (a.fin - a.debut) / 60_000, fcMoy: a.fcMoy }, corps, bmrKcal).kcal : null,
    pas: a.pas,
  }));
  return { n: ign.length, kcal: kcalQuotidienIgnorees(actives, kcalParPas) };
}

/** Métabolisme de base retenu à l'instant `t` (méthode des réglages) : kcal actives d'une activité à partir de ses brutes. */
export async function bmrA(db: Executeur, t: number): Promise<number> {
  const r = await lireReglagesEnergie(db);
  return choisirBmr(r.methode, await donneesBmr(db, t), t).kcal;
}

/** Soldes des 7 derniers jours jusqu'à `jour` compris (null : ni journal ni habitude ce jour-là ; `estime` : apports
 * estimés par les habitudes). */
export async function soldesSemaine(db: Executeur, jour: number, maintenant = Date.now()): Promise<{ jour: number; solde: number | null; estime: boolean }[]> {
  const r = await lireReglagesEnergie(db);
  const jours = Array.from({ length: 7 }, (_, i) => decaler(jour, i - 6));
  const m = await joursEnergie(db, jours, maintenant, r).catch(() => null);
  return jours.map((j) => {
    const b = m?.get(j)?.bilan;
    return { jour: j, solde: b?.solde ?? null, estime: b?.soldeEstime ?? false };
  });
}

// ---- Cases de la page ------------------------------------------------------------------------------------------------

export interface DonneesPage {
  /** Dernière pesée jusqu'à `maintenant` (un jour passé du semainier), null sans pesée avant. */
  poids: number | null;
  sommeilMin: number | null;
  /** Part du besoin dormie (sommeil ÷ besoin de la nuit calculé par pepfit, %), comme la page Sommeil ; jamais la
   * performance de Whoop. null sous le seuil de précision. La case montre alors « 43 % · 4 h 37 » (sante-vue.ts). */
  performance: number | null;
  vfc: number | null;
  fcRepos: number | null;
  pas: number | null;
  gras: number | null;
  /** Point de couleur de la nuit (retour du 29/10) : VFC et FC au repos face à ta normale, sommeil d'après la
   * part du besoin (mesures/coeur-calc.ts, mesures/niveau-point.ts). */
  points: Record<"sommeil" | "vfc" | "fc", NiveauPoint>;
}

const FENETRE_CASE = 7 * JOUR;

/** Valeurs des cases : la nuit, les pas du jour, et les dernières VFC, FC au repos et % de gras (7 jours pour les deux
 * premières, la mesure de la balance la plus récente pour le gras). Un jour passé (semainier de la page Santé) : `maintenant`
 * est la fin de ce jour, sa nuit est celle qui finit ce jour-là. */
export async function donneesPage(db: Executeur, maintenant = Date.now(), passe = false): Promise<DonneesPage> {
  const jourMinuit = new Date(new Date(maintenant).getFullYear(), new Date(maintenant).getMonth(), new Date(maintenant).getDate()).getTime();
  const [nuitSante, pasJour, vfc, fc, gras, nuitsW, nuitsWi, pesee] = await Promise.all([
    passe
      ? sante
          .nuits(jourMinuit, maintenant)
          .then((l) => l?.[l.length - 1] ?? null)
          .catch(() => null)
      : sante.sommeilDeLaNuit().catch(() => null),
    lirePasJour(db, jourMinuit, maintenant),
    derniereMesure(db, "vfc", maintenant),
    derniereMesure(db, "fc", maintenant),
    derniereMesure(db, "gras", maintenant),
    nuitsWhoop(db, jourMinuit - 18 * 3_600_000, maintenant),
    nuitsWithings(db, jourMinuit - 18 * 3_600_000, maintenant),
    db.getFirstAsync<{ kg: number }>("SELECT kg FROM pesee WHERE date <= ? ORDER BY date DESC LIMIT 1", [maintenant]),
  ]);
  // ta normale des 30 nuits d'avant la dernière mesure (31 jours lus avant elle), pour le point de la case
  const point = async (cle: CleCoeur, m: { date: number; valeur: number } | null): Promise<NiveauPoint> => {
    if (!m || maintenant - m.date > FENETRE_CASE) return "neutre";
    const l = (await historiqueMesure(db, cle, m.date - 31 * JOUR)).filter((x) => x.date <= maintenant);
    return niveauNuit(cle, m.valeur, normaleAu(cle, parNuit(l), m.date));
  };
  const [pointVfc, pointFc] = await Promise.all([point("vfc", vfc), point("fc", fc)]);
  // Whoop prioritaire pour la nuit, puis Withings ; sinon Santé Connect. Les pas suivent la règle commune (pas-source.ts).
  const nuitW = nuitsW.length ? nuitsW[nuitsW.length - 1]! : null;
  const nuitWi = nuitsWi.length ? nuitsWi[nuitsWi.length - 1]! : null;
  const nuit = nuitW ?? nuitWi ?? nuitSante;
  const pas = valeurPas(pasJour);
  // Le besoin de la nuit vient de pepfit (le calcul de la Récupération et de la page Sommeil), Whoop ou non.
  const performance = nuit ? await lireSommeilDuJour(db, jourMinuit, undefined, maintenant).then((s) => partBesoin(nuit.minutes, s.matin)).catch(() => null) : null;
  const recente = (m: { date: number } | null) => m != null && maintenant - m.date <= FENETRE_CASE;
  return {
    poids: pesee?.kg ?? null,
    sommeilMin: nuit?.minutes ?? null,
    performance,
    vfc: recente(vfc) ? vfc!.valeur : null,
    fcRepos: recente(fc) ? fc!.valeur : null,
    pas,
    gras: gras?.valeur ?? null,
    points: { sommeil: nuit ? niveauSommeil(performance) : "neutre", vfc: pointVfc, fc: pointFc },
  };
}

// ---- Composition -----------------------------------------------------------------------------------------------------

export type CleComposition = "poids" | "gras" | "maigre";

export interface PointMesure {
  date: number;
  valeur: number;
  origine: string | null;
  manuel?: boolean;
}

/** Historique d'une mesure de Composition (poids : pesées ; maigre : mesuré, sinon poids × (1 − gras) le même jour). */
export async function historiqueComposition(db: Executeur, cle: TypeMesureCorps | "poids" | "maigre-calcule", depuis = 0): Promise<PointMesure[]> {
  if (cle === "poids") {
    const l = await db.getAllAsync<{ date: number; kg: number; source: string; origine: string | null }>(
      "SELECT date, kg, source, origine FROM pesee WHERE date >= ? ORDER BY date DESC",
      [depuis],
    );
    return l.map((p) => ({ date: p.date, valeur: p.kg, origine: p.origine, manuel: p.source === "manuel" }));
  }
  if (cle === "maigre-calcule") {
    const mesure = await historiqueMesure(db, "maigre", depuis);
    if (mesure.length) return mesure.map((m) => ({ date: m.date, valeur: m.valeur, origine: m.origine }));
    const gras = await historiqueMesure(db, "gras", depuis);
    const l: PointMesure[] = [];
    for (const g of gras) {
      const p = await peseeAvant(db, g.date + 6 * 3_600_000);
      if (p && Math.abs(p.date - g.date) < 12 * 3_600_000) l.push({ date: g.date, valeur: p.kg * (1 - g.valeur / 100), origine: g.origine });
    }
    return l;
  }
  return (await historiqueMesure(db, cle, depuis)).map((m) => ({ date: m.date, valeur: m.valeur, origine: m.origine }));
}
