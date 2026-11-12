// « Batterie non restreinte » (padel du 30/10 : FC de la Whoop coupée et trace GPS en ligne droite, écran éteint). Proposée
// au bon moment, si Android optimise encore pepfit : après la première connexion d'un objet (capteur de FC, montre, Whoop,
// Withings), au premier lancement d'une séance avec GPS ou FC en direct, après une coupure lue dans le journal du suivi.
// Une fois par moment au plus ; « Plus tard » est un refus mémorisé (plus rien d'office, la ligne de Réglages › Connexions
// reste). Réglage guidé, pas la demande directe d'exemption (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS) : Google Play ne l'admet
// pas pour un suivi sportif relié à un capteur Bluetooth standard (docs/BATTERIE.md). Sans React Native (tests/batterie.test.ts).
import type { Batterie, LigneJournal } from "../natif/suivi/types";
import type { EtapeTuto } from "./tuto-fc";

export type MomentBatterie = "objet" | "seance" | "coupure";

/** Écran ouvert par le bouton : la fiche de pepfit (Samsung, ou repli) ou la liste « Optimisation de la batterie ». */
export type EcranBatterie = "fiche" | "liste";
export type CasBatterie = "samsung" | "liste" | "fiche";

/** Ce que pepfit a déjà proposé, sur ce téléphone seulement (préfixe cache_ : ni synchronisé, ni sauvegardé). */
export interface EtatMoments {
  vus: MomentBatterie[];
  refus: boolean;
}
export const CLE_BATTERIE = "cache_batterie_moments";

/** Samsung (One UI) : Batterie › « Non restreinte » dans la fiche de pepfit, puis les listes de veille. Ailleurs : la liste
 *  « Optimisation de la batterie » (pepfit › Non restreinte, ou Ne pas optimiser), ou la fiche si la liste manque. */
export const ETAPES_BATTERIE: Record<CasBatterie, readonly EtapeTuto[]> = {
  samsung: [
    { titre: "gps.batterie.e1", sous: "gps.batterie.e1s" },
    { titre: "gps.batterie.e2", sous: "gps.batterie.e2s" },
    { titre: "gps.batterie.e3", sous: "gps.batterie.e3s" },
  ],
  liste: [
    { titre: "gps.batterie.l1", sous: "gps.batterie.l1s" },
    { titre: "gps.batterie.l2", sous: "gps.batterie.l2s" },
  ],
  fiche: [
    { titre: "gps.batterie.e1", sous: "gps.batterie.e1sAndroid" },
    { titre: "gps.batterie.e2", sous: "gps.batterie.e2s" },
  ],
};

/** `ouvert` : l'écran que le bouton a vraiment ouvert (repli vers la fiche quand la liste manque). */
export function casBatterie(b: Batterie | null, ouvert?: EcranBatterie | null): CasBatterie {
  if (b?.samsung) return "samsung";
  return ouvert === "fiche" ? "fiche" : "liste";
}

/** État relu du réglage ; `dejaProposee` (APK du 30/10, une seule proposition au début d'une séance avec la FC) vaut « seance ». */
export function lireMoments(json: string | null, dejaProposee = false): EtatMoments {
  let e: EtatMoments = { vus: [], refus: false };
  try {
    const o = json ? JSON.parse(json) : null;
    if (o && typeof o === "object") {
      const vus = Array.isArray(o.vus) ? o.vus.filter((m: unknown): m is MomentBatterie => m === "objet" || m === "seance" || m === "coupure") : [];
      e = { vus, refus: o.refus === true };
    }
  } catch {
    // illisible : comme jamais proposée
  }
  if (dejaProposee && !e.vus.includes("seance")) e = { ...e, vus: [...e.vus, "seance"] };
  return e;
}

/** Proposer d'office : module présent (Android), pepfit encore optimisé, pas de refus, ce moment jamais montré, et aucune
 *  autre feuille de batterie depuis le lancement de l'appli (`dejaCeLancement`). */
export function proposerBatterie(b: Batterie | null, e: EtatMoments, moment: MomentBatterie, dejaCeLancement = false): boolean {
  return !!b && b.optimisee && !e.refus && !e.vus.includes(moment) && !dejaCeLancement;
}

export const noterVu = (e: EtatMoments, moment: MomentBatterie): EtatMoments => (e.vus.includes(moment) ? e : { ...e, vus: [...e.vus, moment] });

/** Fermée sans avoir ouvert les réglages ni être réglée : refus mémorisé. Ouverte puis laissée optimisée : pas un refus,
 *  un autre moment pourra la reproposer. */
export function apresFeuille(e: EtatMoments, issue: { ouverte: boolean; reglee: boolean }): EtatMoments {
  return !issue.ouverte && !issue.reglee ? { ...e, refus: true } : e;
}

/** Événements du journal qui disent que la FC ou le suivi a lâché (Frequence.kt, SuiviService.kt). Pas « recherche_vaine » :
 *  elle dit aussi qu'aucun capteur n'est là. */
const COUPURES = new Set(["deconnexion", "silence", "relance_systeme"]);

/** Une coupure dans la dernière séance du journal (de son dernier « debut » à sa « fin » : la déconnexion de l'arrêt ne compte
 *  pas) ; journal vide (ancien APK) : non. */
export function coupureDerniereSeance(lignes: readonly LigneJournal[]): boolean {
  let i = lignes.length - 1;
  while (i >= 0 && lignes[i]?.evenement !== "debut") i--;
  if (i < 0) return false;
  const apres = lignes.slice(i + 1);
  const fin = apres.findIndex((l) => l.evenement === "fin");
  return (fin < 0 ? apres : apres.slice(0, fin)).some((l) => COUPURES.has(l.evenement));
}
