// Données de la page Pas (planche pas) : les jours (règle commune de pas-source.ts : Withings, Santé Connect, puis le
// compteur du téléphone), l'heure par heure d'aujourd'hui et le rythme habituel de 30 jours (Santé Connect, une seule
// lecture chacun), l'objectif quotidien (réglage `pas_objectif`, 8 000 par défaut, D4), la taille et le coefficient de
// calories des pas ; l'heure par heure d'un jour passé (lireHeuresPas). Rien d'inventé : sans donnée, null.
import type { Executeur } from "../../db/executeur";
import { lireMorphologie } from "../../db/depots/profil";
import { JOURS_PESEE_CALCUL, peseeAvant } from "../../db/depots/pesees";
import { ecrireReglage, lireReglage } from "../../db/depots/reglages";
import { pasTelephone } from "../../natif/pas-telephone";
import { sante } from "../../natif/sante/index";
import { avantDelai, DELAI_LECTURE_MS } from "../../natif/sante/logique";
import type { Sante } from "../../natif/sante/types";
import { PERMISSION_PAS } from "../journee-donnees";
import { activerTelephone, telephoneActif } from "../pas-telephone";
import { derniersJours, lirePasJours, type ChoixPas, type SantePas } from "../pas-source";
import { lireReglagesEnergie } from "../sante-donnees";
import { kcalParPasRetenu } from "../energie-calc";
import { lireObjectif, objectifProfil, rythmeHabituel } from "./pas-calc";
import { decaler, minuit } from "./periodes";

export const REGLAGE_OBJECTIF_PAS = "pas_objectif";
/** Historique lu : un an et un mois (l'année glissante et la période d'avant du mois). */
export const JOURS_HISTORIQUE = 400;

export async function lireObjectifPas(db: Executeur): Promise<number> {
  return lireObjectif(await lireReglage(db, REGLAGE_OBJECTIF_PAS));
}

export function ecrireObjectifPas(db: Executeur, n: number): Promise<void> {
  return ecrireReglage(db, REGLAGE_OBJECTIF_PAS, String(Math.round(n)));
}

export type EtatSanteConnect = "absente" | "aAutoriser" | "autorisee";

export interface DonneesPas {
  maintenant: number;
  objectif: number;
  /** Proposé « d'après tes pas », null avant 30 jours avec donnée. */
  profil: { moyenne: number; objectif: number } | null;
  /** Choix de chaque jour (minuit → choix), du plus ancien à aujourd'hui. */
  jours: Map<number, ChoixPas>;
  aujourdhui: ChoixPas;
  /** Pas de chaque heure d'aujourd'hui (24, null après maintenant ou sans donnée) ; null sans Santé Connect. */
  heures: (number | null)[] | null;
  /** Moyenne de chaque heure sur les 30 jours d'avant ; null sans donnée heure par heure. */
  habituel: number[] | null;
  tailleCm: number | null;
  kcalParPas: number;
  santeConnect: EtatSanteConnect;
  /** Repli sur le compteur de pas du téléphone : « actif », « a-activer » (capteur présent, pas encore demandé), « indisponible » (iPhone, APK sans le module, pas de capteur). */
  telephone: "actif" | "a-activer" | "indisponible";
  /** Premier jour avec une donnée, null sans aucune. */
  premier: number | null;
  /** Aucun pas sur 7 jours alors que Santé Connect en a (enregistrements bruts) : les applis qui les ont écrits, hors des
   * priorités de Santé Connect (C12) ; null sinon. */
  horsPriorite: string[] | null;
}

/** Bornes horaires de `jour` (minuit local) : 25 bornes, justes aux changements d'heure. */
function heuresDu(jour: number): number[] {
  const d = new Date(jour);
  return Array.from({ length: 25 }, (_, h) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime());
}

/**
 * Pas de chaque heure de `jour` (Santé Connect, une lecture) : 24 valeurs, null pour les heures après `maintenant` ; null si
 * la lecture échoue ou si le jour n'a pas commencé. Un jour passé est lu en entier, aujourd'hui jusqu'à `maintenant`.
 */
export async function lireHeuresPas(jour: number, maintenant: number = Date.now(), s: Pick<Sante, "pasIntervalles"> = sante): Promise<(number | null)[] | null> {
  const b = heuresDu(jour).filter((x) => x < maintenant);
  if (!b.length) return null;
  const l = await s.pasIntervalles(b.length === 25 ? b : [...b, maintenant]).catch(() => null);
  return l ? Array.from({ length: 24 }, (_, h) => (h < l.length ? l[h]! : null)) : null;
}

/**
 * Toutes les données de la page. Les lectures de Santé Connect (jours, heure par heure, rythme habituel) partent ensemble et
 * ont chacune `delaiMs` : passé ce délai, la page s'affiche avec ce qu'elle a (jours de Santé Connect vides, Whoop gardé ; pas
 * d'heure par heure) au lieu de rester sur son squelette (Fold, 31/10 : docs/PAS-CHARGEMENT.md).
 */
export async function lireDonneesPas(db: Executeur, maintenant: number = Date.now(), s: Sante = sante, delaiMs: number = DELAI_LECTURE_MS): Promise<DonneesPas> {
  const auj = minuit(maintenant);
  const borne = <T>(p: Promise<T>, repli: () => T | Promise<T>, quoi: string): Promise<T> =>
    avantDelai(p, delaiMs).catch((e: unknown) => (console.warn("[pas] timeout", quoi, e), repli()));
  const [objectif, morpho, reglagesE, disponible, autorisees, pesee] = await Promise.all([
    lireObjectifPas(db),
    lireMorphologie(db).catch(() => ({ tailleCm: null, poidsKg: null, sexe: null })),
    lireReglagesEnergie(db),
    s.disponible().catch(() => false),
    s.autorisees().catch((): string[] => []),
    peseeAvant(db, maintenant, JOURS_PESEE_CALCUL).catch(() => null),
  ]);
  const autorise = (autorisees as string[]).includes(PERMISSION_PAS);
  const [telActif, telDispo] = await Promise.all([telephoneActif(db), pasTelephone.disponible().catch(() => false)]);
  const santeConnect: EtatSanteConnect = !disponible ? "absente" : autorise ? "autorisee" : "aAutoriser";
  const liste = derniersJours(JOURS_HISTORIQUE, maintenant);
  // Santé Connect sans réponse : les jours sans lui (Whoop gardé, Santé Connect vide)
  const sansLecture: SantePas = { autorisees: async () => autorisees as string[], pasEntre: async () => null, pasIntervalles: async () => null };
  // 30 jours d'avant, heure par heure, en une lecture
  const debut = decaler(auj, -30);
  const bornes: number[] = [];
  for (let i = 0; i < 30; i++) bornes.push(...heuresDu(decaler(debut, i)).slice(0, 24));
  bornes.push(auj);
  const [choix, heures, h30] = await Promise.all([
    borne(lirePasJours(db, liste, maintenant, s), () => lirePasJours(db, liste, maintenant, sansLecture), "jours"),
    autorise ? borne(lireHeuresPas(auj, maintenant, s), () => null, "heures") : null,
    autorise ? borne(s.pasIntervalles(bornes).catch(() => null), () => null, "habituel") : null,
  ]);
  const jours = new Map(liste.map((j, i) => [j, choix[i]!]));
  const aujourdhui = jours.get(auj) ?? { etat: "a-connecter" as const };
  const habituel = h30 ? rythmeHabituel(Array.from({ length: 30 }, (_, i) => h30.slice(i * 24, i * 24 + 24))) : null;
  const valeurs = liste.map((j) => {
    const c = jours.get(j)!;
    return c.etat === "valeur" ? c.pas : null;
  });
  const premierI = valeurs.findIndex((v) => v != null);
  // 7 jours sans pas, Santé Connect autorisé : des pas écrits que l'agrégat ne rend pas ? (une lecture, C12)
  const sansPas = autorise && valeurs.slice(-7).every((v) => v == null);
  const origines = sansPas && s.originesPas ? await borne(s.originesPas(decaler(auj, -6), maintenant).catch(() => null), () => null, "origines") : null;
  return {
    maintenant,
    objectif,
    profil: objectifProfil(valeurs.slice(-91, -1)),
    jours,
    aujourdhui,
    heures,
    habituel,
    tailleCm: morpho.tailleCm ?? null,
    // la même valeur que le bilan de l'Énergie (lot 6 de la précision : la page prenait 0,035 en mode Automatique) :
    // Manuel, sinon d'après le poids et la taille (0,035 dit « par défaut » seulement sans eux)
    kcalParPas: kcalParPasRetenu(reglagesE.modeKcalPas, reglagesE.kcalParPas, { kg: pesee?.kg ?? null, cm: morpho.tailleCm, sexe: morpho.sexe }).kcal,
    santeConnect,
    telephone: telActif ? "actif" : telDispo ? "a-activer" : "indisponible",
    premier: premierI >= 0 ? liste[premierI]! : null,
    horsPriorite: origines?.length ? origines : null,
  };
}

/** Active le repli sur le compteur du téléphone (permission « activité physique » demandée ici, sur le geste) ; vrai si activé. */
export const activerPasTelephone = (db: Executeur): Promise<boolean> => activerTelephone(db);

/** Demande la lecture des pas ; refusée, ouvre les réglages de Santé Connect. Vrai si c'est accordé. */
export async function autoriserPasSante(): Promise<boolean> {
  if (await sante.demanderPermissions([PERMISSION_PAS]).catch(() => false)) return true;
  await sante.ouvrirReglages().catch(() => {});
  return false;
}

