import { useSyncExternalStore } from "react";
import { lireModeAffichage } from "../../db/depots/objectifs";
import type { Executeur } from "../../db/executeur";
import { modeAffichage, type ModeAffichage } from "../../nutrition/objectifs-calc";

// D20 : le mode d'affichage de toute l'appli (planches macros 4 à 6). Lu une fois au démarrage, relu quand les garde-fous, le
// profil ou les objectifs changent ; chaque écran qui montre des kcal ou des macros le suit (useModeAffichage). Tant qu'il n'est
// pas lu : le calcul complet (l'appli d'avant la règle).

const COMPLET = modeAffichage({ statut: "ok", raisons: [], renvois: [], sansChiffres: false });

let courant: ModeAffichage = COMPLET;
const abonnes = new Set<() => void>();

export function publierModeAffichage(m: ModeAffichage): void {
  const avant = courant;
  courant = m;
  if (avant.ecran !== m.ecran || avant.sansChiffres !== m.sansChiffres || avant.raisons.join() !== m.raisons.join()) for (const f of abonnes) f();
}

/** Relit le mode depuis la base et le publie (sans erreur : une lecture ratée garde le mode courant). */
export async function rafraichirModeAffichage(db: Executeur): Promise<ModeAffichage> {
  try {
    publierModeAffichage(await lireModeAffichage(db));
  } catch (e) {
    console.error(e);
  }
  return courant;
}

export const modeAffichageCourant = () => courant;

const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => void abonnes.delete(f);
};

/** Le mode courant ; l'écran se redessine quand il change. */
export function useModeAffichage(): ModeAffichage {
  return useSyncExternalStore(abonner, modeAffichageCourant, modeAffichageCourant);
}

/** D20 : vrai si les chiffres de nutrition (kcal, macros des aliments et des totaux) se montrent. */
export const useChiffresNutrition = () => useModeAffichage().totauxJournalVisibles;

/** Même chose hors d'un composant (textes composés par une fonction) : le mode courant, sans abonnement. */
export const chiffresNutrition = () => courant.totauxJournalVisibles;

/** Santé sans chiffres (D20) : le bilan sans les apports ni le solde (des chiffres du journal) ; la dépense reste. */
export function bilanAffiche<B extends { apports: number | null; solde: number | null }>(b: B, chiffres: boolean): B {
  return chiffres ? b : { ...b, apports: null, solde: null };
}
