// Les sources de « tirer pour actualiser », branchées sur ce que l'appli sait déjà faire : jamais de logique de synchro ici,
// seulement les appels existants et leurs gardes. Santé Connect, Whoop, Withings et Polar partent ensemble (chacun rend la main tout de suite s'il n'est pas relié, ou si le fournisseur est coupé).
// Un délai de 15 s par source, un seul tirage à la fois, la page rendue sans attendre les lentes (actualiser/noyau.ts).
import type { Executeur } from "../db/executeur";
import { importerSante } from "../ecrans/sante-donnees";
import { relecture } from "../sync/rafraichir";
import { synchroniserSiBesoin as synchroniserWhoop } from "../whoop";
import { synchroniserSiBesoin as synchroniserWithings } from "../withings";
import { synchroniserSiBesoin as synchroniserPolar } from "../polar";
import { creerActualiseur, DELAI_SOURCE_MS, type Issue, type Source } from "./noyau";

let base: Executeur | null = null;
const db = (): Executeur => {
  if (!base) throw new Error("actualiser : base absente");
  return base;
};

/** Les gardes de Whoop, de Withings et de Polar se règlent en minutes : le même délai de 15 s que les autres sources. */
const MINUTES = DELAI_SOURCE_MS / 60_000;

// Un tirage est un geste de l'utilisateur, pas une synchro de fond : on relit Santé Connect sans attendre les 5 min de l'import
// automatique (`forcer` ne saute pas l'import en cours : il attend la fin du sien, puis en refait un).
const santeConnect: Source = { id: "sante-connect", executer: () => importerSante(db(), { forcer: true }) };
const whoop: Source = { id: "whoop", executer: () => synchroniserWhoop(db(), MINUTES) };
const withings: Source = { id: "withings", executer: () => synchroniserWithings(db(), MINUTES) };
const polar: Source = { id: "polar", executer: () => synchroniserPolar(db(), MINUTES) };

const actualiseur = creerActualiseur({
  sources: [santeConnect, whoop, withings, polar],
  // Un échec reste silencieux : la source réessaiera au prochain tirage.
  surEchec: (id, e) => console.warn(`[actualiser] ${id}`, e instanceof Error ? e.message : ""),
});

export const actualisation = { enCours: actualiseur.enCours, abonner: actualiseur.abonner };

/**
 * Lance l'actualisation : les sources (si leur délai est passé) partent ensemble ; la relecture des écrans qui lisent la base et
 * `apres`, le recalcul propre à la page affichée, suivent dès que les
 * sources ont rendu ou que leur attente est écoulée. Une source lente qui finit ensuite refait la relecture et `apres` sans
 * bruit. Rend « occupe » si une actualisation tourne déjà.
 */
export function actualiserMaintenant(executeur: Executeur, apres?: () => Promise<unknown>): Promise<Issue> {
  base = executeur;
  return actualiseur.lancer(async () => {
    relecture.demander();
    await apres?.();
  });
}
