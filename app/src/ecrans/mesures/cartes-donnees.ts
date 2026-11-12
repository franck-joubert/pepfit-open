// Données des cartes de mesure (Accueil modulable et page Santé, planche pas § 1 bis à 1 quater) : chaque page expose son
// résumé ; ici on ne lit que les cartes présentes. Rien d'inventé : une carte sans donnée garde son état vide actionnable.
import type { Executeur } from "../../db/executeur";
import { sante } from "../../natif/sante/index";
import { derniersJours, lirePasJours, valeurPas, type ChoixPas } from "../pas-source";
import { lireResumeAge, type ResumeAge } from "./age-donnees";
import { lireMemoirePrecision } from "../../precision/lire";
import { lirePrecision } from "../../precision/service";
import { lireResumeCorps, type ResumeCorps } from "./corps-donnees";
import { lireResumeEnergie, type ResumeEnergie } from "./energie-donnees";
import { habituelA, projection, rythmeHabituel } from "./pas-calc";
import { lireObjectifPas } from "./pas-donnees";
import { decaler, minuit } from "./periodes";
import { lireResumeEffort, lireResumeRecup, type ResumeEffort, type ResumeRecup } from "./scores-donnees";
import { lireResumeSommeil, type ResumeSommeil } from "./sommeil-donnees";
import { lireVo2, type DonneesVo2 } from "./vo2-donnees";

const H = 3_600_000;

export interface CartePas {
  jour: ChoixPas;
  objectif: number;
  /** Ce que tu as d'habitude à cette heure (30 jours, Santé Connect heure par heure), null sans heure par heure. */
  habituel: number | null;
  /** Total du soir au rythme habituel, null sans heure par heure. */
  projection: number | null;
  /** L'heure du calcul (« ton habitude à 16 h 42 »). */
  maintenant: number;
  /** Les 7 derniers jours (aujourd'hui en dernier), null sans donnée. */
  semaine: (number | null)[];
}

/** Pas du jour, objectif et, avec Santé Connect, l'habitude à cette heure et la projection du soir. `habitude` faux : sans
 * les 30 jours heure par heure (l'Accueil les lit après le premier affichage : habitudePas). */
export async function lireCartePas(db: Executeur, maintenant = Date.now(), habitude = true): Promise<CartePas> {
  const [sept, objectif] = await Promise.all([lirePasJours(db, derniersJours(7, maintenant), maintenant), lireObjectifPas(db)]);
  const jour = sept[sept.length - 1]!;
  const c: CartePas = { jour, objectif, habituel: null, projection: null, maintenant, semaine: sept.map(valeurPas) };
  return habitude ? habitudePas(c) : c;
}

/** Pas habituels de chaque heure (30 jours d'avant, en une lecture Santé Connect) ; null sans heure par heure. */
export async function rythmePasHabituel(maintenant: number): Promise<number[] | null> {
  const debut = decaler(minuit(maintenant), -30);
  const bornes = Array.from({ length: 30 * 24 + 1 }, (_, i) => debut + i * H);
  const l = await sante.pasIntervalles(bornes).catch(() => null);
  return l ? rythmeHabituel(Array.from({ length: 30 }, (_, j) => l.slice(j * 24, j * 24 + 24))) : null;
}

/** La carte Pas avec l'habitude à cette heure et la projection du soir (30 jours d'avant, heure par heure, en une lecture
 * Santé Connect) ; telle quelle si les pas du jour ne viennent pas de Santé Connect ou sans heure par heure. */
export async function habitudePas(c: CartePas): Promise<CartePas> {
  if (c.jour.etat !== "valeur" || c.jour.source !== "sante") return c;
  const r = await rythmePasHabituel(c.maintenant);
  if (!r) return c;
  const heure = (c.maintenant - minuit(c.maintenant)) / H;
  return { ...c, habituel: habituelA(r, heure), projection: projection(valeurPas(c.jour) ?? 0, r, heure) };
}

export type IdCarte = "pas" | "poids" | "energie" | "sommeil" | "recup" | "effort" | "age" | "vo2max";

export interface DonneesCartes {
  pas?: CartePas;
  corps?: ResumeCorps;
  energie?: ResumeEnergie;
  sommeil?: ResumeSommeil | null;
  recup?: ResumeRecup | null;
  effort?: ResumeEffort | null;
  age?: ResumeAge | null;
  vo2?: DonneesVo2;
  /** Lectures ouvertes de la précision pepfit (Âge pepfit, VO2max) : fermées, leurs cartes disent « Bientôt ». */
  lectures?: readonly string[];
}

/** Clé de chaque carte dans DonneesCartes. */
export const CLE_CARTE: Record<IdCarte, keyof DonneesCartes> = {
  pas: "pas", poids: "corps", energie: "energie", sommeil: "sommeil", recup: "recup", effort: "effort", age: "age", vo2max: "vo2",
};

/**
 * Les résumés des cartes demandées, chacun posé dès qu'il est lu, sans attendre les autres (M9, docs/PERF-A.md : avant,
 * l'énergie, la plus lente, retenait toutes les cartes de l'Accueil) ; la carte Pas d'abord sans l'habitude à cette heure,
 * puis avec. Une lecture qui échoue pose `undefined` : sa carte reste vide (jamais toute la page).
 */
export async function chargerCartes(
  db: Executeur,
  ids: readonly IdCarte[],
  poser: <K extends keyof DonneesCartes>(k: K, v: DonneesCartes[K]) => void,
  maintenant = Date.now(),
): Promise<void> {
  const veut = new Set(ids);
  const ou = <T>(p: Promise<T>) => p.catch((e: unknown) => (console.warn("carte de mesure", e), undefined));
  const une = <K extends keyof DonneesCartes>(id: IdCarte, k: K, lire: () => Promise<DonneesCartes[K]>) =>
    veut.has(id) ? ou(lire()).then((v) => poser(k, v)) : undefined;
  await Promise.all([
    veut.has("pas")
      ? ou(lireCartePas(db, maintenant, false)).then(async (c) => {
          poser("pas", c);
          if (c) poser("pas", await habitudePas(c));
        })
      : undefined,
    une("poids", "corps", () => lireResumeCorps(db, maintenant)),
    une("energie", "energie", () => lireResumeEnergie(db, maintenant)),
    une("sommeil", "sommeil", () => lireResumeSommeil(db, maintenant)),
    une("recup", "recup", () => lireResumeRecup(db, maintenant)),
    une("effort", "effort", () => lireResumeEffort(db, maintenant)),
    une("age", "age", () => lireResumeAge(db, maintenant)),
    une("vo2max", "vo2", () => lireVo2(db, { maintenant })),
    // la mémoire de la précision (dernier calcul sur le téléphone) ; jamais calculée : on la calcule, toutes parties allumées
    veut.has("age") || veut.has("vo2max")
      ? ou(lireMemoirePrecision(db).then(async (m) => m?.lectures ?? (await lirePrecision(db, {})).memoire.lectures)).then((v) => poser("lectures", v))
      : undefined,
  ]);
}

/** Les résumés des cartes demandées, tous lus ; une lecture qui échoue laisse sa carte vide (jamais toute la page). */
export async function lireCartes(db: Executeur, ids: readonly IdCarte[], maintenant = Date.now()): Promise<DonneesCartes> {
  const d: DonneesCartes = {};
  await chargerCartes(db, ids, (k, v) => void (d[k] = v), maintenant);
  return d;
}
