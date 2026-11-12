import { router } from "expo-router";
import { ouvrirSeance } from "./ouvrir-seance";
import { seanceChangee } from "./bulle-evenement";
import { demarrerSeance as garder } from "./demarrer-seance";
import { COURSE, genreSport, lancementDirect, MUSCULATION } from "./lanceur-sports";
import { positionIci } from "./position-ici";
import { suivi } from "../natif/suivi";
import { alarmeRecup } from "../natif/alarme-recup";
import { demanderNotifications } from "../natif/notifications";
import { retenirSportSeance } from "./selection";
import { demarrerSeance, demarrerSeanceDepuisRoutine, demarrerSeanceSport, lireLieuProbable, lireRoutine, modifierSeance, typeDeSport, type Executeur, type Sport, type TypeProgramme } from "../db";

// Tous les démarrages passent par le garde (demarrer-seance.tsx) : une séance ou un suivi GPS déjà en cours pose la feuille
// « Tu as une séance en cours » (reprendre, terminer puis démarrer, abandonner puis démarrer, annuler).

/**
 * Démarre une séance (depuis une routine ou vide). `salleId` : le lieu choisi dans la feuille d'un sport (sinon la salle par
 * défaut). Une routine de course (programme, D8 de la planche seance-duree) ouvre l'écran de lancement du suivi : dehors,
 * course guidée par ses étapes ; sur tapis, la séance au chrono comme avant. `sport` : le type du sport d'une séance libre (le
 * choix d'exercices s'ouvrira filtré sur lui). `retirer` : les écrans de lancement empilés sous la séance (le récap : 1), retirés de
 * la pile pour que Back revienne à l'origine du lancement (pile-lancement.ts). L'écran de lancement d'un suivi (SuiviDepart) est
 * un écran à lui seul : il se retire lui-même au Démarrer.
 */
export async function commencer(db: Executeur, routineId: string | null, salleId?: string | null, sport?: TypeProgramme | null, retirer = 0): Promise<void> {
  await garder(async () => {
    const course = routineId != null && suivi.disponible && (await lireRoutine(db, routineId))?.type === "course";
    // Sans lieu choisi : le lieu où je suis selon le GPS (29/10), sinon la règle D3 (la salle par défaut en musculation).
    if (salleId === undefined) salleId = await lireLieuProbable(db, course ? COURSE : MUSCULATION, await positionIci());
    if (course) {
      router.push({ pathname: "/suivi/depart", params: { sport: COURSE, routine: routineId, ...(salleId ? { lieu: salleId } : {}) } });
      return;
    }
    const id = routineId ? await demarrerSeanceDepuisRoutine(db, routineId) : await demarrerSeance(db, null);
    if (salleId !== undefined) await modifierSeance(db, id, { salleId });
    if (!routineId && sport) retenirSportSeance(id, sport);
    // Fin du repos en notification : l'autorisation est demandée ici, au premier démarrage d'une séance (expliquée d'abord).
    await demanderNotifications("repos");
    await alarmeRecup.demanderHeureExacte();
    seanceChangee();
    ouvrirSeance("/session", retirer);
  }, retirer);
}

/**
 * Démarre un sport du lanceur (hors Force) : l'écran de lancement du suivi, pour les quatre familles (planche familles-sports,
 * D3 du 30/10) ; le lieu (Dehors / Tapis…) s'y choisit, `tapis` le présélectionne. Sans module de suivi (iOS, APK trop ancien) :
 * une séance de durée. Le récap montre lui-même cet écran pour ses sports au suivi : cette porte sert aux autres chemins.
 */
export async function demarrerSport(db: Executeur, sport: Sport, o: { salleId: string | null; tapis: boolean; retirer?: number }): Promise<void> {
  const retirer = o.retirer ?? 0;
  await garder(async () => {
    if (genreSport(sport.id) === "suivi" && suivi.disponible) {
      router.push({ pathname: "/suivi/depart", params: { sport: sport.id, ...(o.salleId ? { lieu: o.salleId } : {}), ...(o.tapis ? { tapis: "1" } : {}) } });
      return;
    }
    await demarrerSeanceSport(db, { exerciceId: sport.id, titre: sport.nom, salleId: o.salleId });
    seanceChangee();
    ouvrirSeance("/session", retirer);
  }, retirer);
}

/**
 * « Suivre ce circuit » (planche Circuits, lot F) : l'écran de lancement du suivi, avec le sport du circuit et la ligne « Circuit » déjà
 * remplie. Le même garde que les autres démarrages : une séance déjà en cours pose sa feuille avant.
 */
export async function ouvrirDepartCircuit(sport: string, circuitId: string): Promise<void> {
  await garder(async () => {
    router.push({ pathname: "/suivi/depart", params: { sport, circuit: circuitId } });
  });
}

/**
 * Un sport de la feuille « Démarrer une séance » ou d'« Autre sport », sans feuille intermédiaire (retours du 28/10, b) :
 * au lieu probable (D3), séance vide (musculation), départ du suivi (GPS) ou séance au chrono. Garde compris.
 */
export async function lancerSport(db: Executeur, sport: Sport): Promise<void> {
  const salleId = await lireLieuProbable(db, sport.id, await positionIci());
  if (lancementDirect(sport.id) === "muscu") return commencer(db, null, salleId ?? undefined, typeDeSport(sport.id) ?? "muscu");
  return demarrerSport(db, sport, { salleId, tapis: false });
}
