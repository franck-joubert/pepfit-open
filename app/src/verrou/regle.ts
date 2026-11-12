// Verrou d'ouverture (planche compte-connexion, H3, validée le 03/11 ; D5, D6 ; docs/CODE-VERROU.md) : la règle, sans React
// Native, pour les tests. Le verrou est celui du téléphone (empreinte, visage ou code), jamais un mot de passe pepfit.

import type { Issue as IssueDeverrouillage } from "../natif/deverrouillage/types";

/** Délais de reverrouillage, en secondes : Aussitôt, 1 min, 5 min, 15 min (D6). */
export const DELAIS_VERROU = [0, 60, 300, 900] as const;
export type DelaiVerrou = (typeof DELAIS_VERROU)[number];
/** 1 min par défaut : changer de musique pendant une série ne redemande rien. */
export const DELAI_VERROU_DEFAUT: DelaiVerrou = 60;

/** Clés de la table `reglages` ; hors de REGLAGES_SYNC : le verrou est propre à ce téléphone, il ne voyage pas. */
export const CLE_VERROU = "verrou";
export const CLE_VERROU_DELAI = "verrou_delai";

export const lireDelaiVerrou = (v: string | null | undefined): DelaiVerrou => {
  const n = Number(v);
  return v != null && v !== "" && (DELAIS_VERROU as readonly number[]).includes(n) ? (n as DelaiVerrou) : DELAI_VERROU_DEFAUT;
};

/**
 * Au retour au premier plan : faut-il reverrouiller ? Le délai court depuis le passage en arrière-plan (`quitteA`) ; pendant
 * une séance (ou une course en direct), il attend la fin : pas d'empreinte demandée avec de la magnésie sur les doigts.
 */
export function doitReverrouiller(e: { actif: boolean; quitteA: number | null; maintenant: number; delaiS: number; seanceEnCours: boolean }): boolean {
  if (!e.actif || e.quitteA == null || e.seanceEnCours) return false;
  return e.maintenant - e.quitteA >= e.delaiS * 1000;
}

/**
 * Ce que fait l'écran verrouillé d'une réponse : « ok » ouvre ; « sansVerrou » (verrou du téléphone retiré depuis) ouvre aussi
 * et éteint le réglage, pour ne pas faire croire que pepfit est protégé (3c) ; « indisponible » (pas d'activité au premier
 * plan, un instant) laisse fermé : le bouton « Déverrouiller » réessaie ; « annule » laisse fermé.
 */
export function suiteDeverrouillage(i: IssueDeverrouillage): { ouvrir: boolean; eteindre: boolean } {
  if (i === "ok") return { ouvrir: true, eteindre: false };
  if (i === "sansVerrou") return { ouvrir: true, eteindre: true };
  return { ouvrir: false, eteindre: false };
}

/** Sous-ligne de « Verrouillage » dans Réglages › Préférences (3a) : « Désactivé », « Aussitôt », « Après 1 min »… */
export function etatVerrou(actif: boolean, protege: boolean | null, delaiS: number): { cle: "verrou.desactive" | "verrou.aussitot" | "verrou.apres"; min?: number } {
  // téléphone sans verrou d'écran : rien ne protège pepfit, la ligne le dit
  if (!actif || protege === false) return { cle: "verrou.desactive" };
  if (delaiS === 0) return { cle: "verrou.aussitot" };
  return { cle: "verrou.apres", min: delaiS / 60 };
}
