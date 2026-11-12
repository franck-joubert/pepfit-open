// Gestes du ⋯ du récap (planche ajout-seance-v2, D5, D15) : annuler une séance prévue (cette séance, ou toute la série), l'ajouter
// à mes routines, la démarrer. Chaque retrait annonce sa bulle « Rétablir » (8 s, ecrans/activites-evenement) : la page Sport,
// montée derrière, la pose et rend le geste. Sans elle (récap ouvert depuis l'Accueil), la séance reste annulée.
import {
  activerProgrammation, ajouterAMesRoutines, poserException, retirerException, supprimerProgrammation, supprimerRoutine,
} from "../../db";
import { t } from "../../i18n/index";
import { rafraichirRappels } from "../../natif/rappels";
import type { Executeur } from "../../db/executeur";
import { activitesChangees, annoncerAnnulable } from "../activites-evenement";
import { demarrerSport, commencer } from "../commencer";
import { genreSport } from "../lanceur-sports";
import { catalogueSports, typeDeSport } from "../../db";
import type { DonneesRecap } from "./donnees-recap";

type Prevue = NonNullable<DonneesRecap["prevue"]>;

const apres = async (db: Executeur) => {
  activitesChangees();
  await rafraichirRappels(db, { demander: true }).catch(console.error);
};

/** Cette séance seulement : une exception « retirée » ; la bulle la rétablit comme elle était. */
export async function annulerSeule(db: Executeur, p: Prevue): Promise<void> {
  const avant = await db.getFirstAsync<{ type: "retiree" | "decalee"; nouvelle_date: string | null; nouvelle_heure: string | null }>(
    "SELECT type, nouvelle_date, nouvelle_heure FROM programmation_exceptions WHERE programmation_id = ? AND date_origine = ?",
    [p.programmationId, p.dateOrigine],
  );
  await poserException(db, p.programmationId, p.dateOrigine, { type: "retiree" });
  await apres(db);
  annoncerAnnulable({
    texte: t("ps.annulee"),
    action: t("ps.retablir"),
    annuler: async () => {
      if (avant) {
        await poserException(db, p.programmationId, p.dateOrigine, avant.type === "retiree" ? { type: "retiree" } : { type: "decalee", nouvelleDate: avant.nouvelle_date!, nouvelleHeure: avant.nouvelle_heure });
      } else {
        await retirerException(db, p.programmationId, p.dateOrigine);
      }
    },
  });
}

/** Toute la série (ou une séance qui ne se répète pas) : la règle est éteinte tout de suite, supprimée après la bulle. */
export async function annulerSerie(db: Executeur, p: Prevue, texte: string): Promise<void> {
  const actif = (await db.getFirstAsync<{ actif: number }>("SELECT actif FROM programmations WHERE id = ?", [p.programmationId]))?.actif === 1;
  await activerProgrammation(db, p.programmationId, false);
  await apres(db);
  annoncerAnnulable({
    texte,
    action: t("ps.retablir"),
    annuler: () => activerProgrammation(db, p.programmationId, actif),
    confirmer: () => supprimerProgrammation(db, p.programmationId),
  });
}

/** « Ajouter à mes routines » (D5) : une copie à soi, indépendante de la séance ; la bulle la retire. */
export async function ajouterAuxRoutines(db: Executeur, routineId: string, nom: string): Promise<void> {
  const id = await ajouterAMesRoutines(db, routineId);
  if (!id) return;
  annoncerAnnulable({ texte: t("planif.ajouteeAMesRoutines", { nom }), annuler: () => supprimerRoutine(db, id) });
}

/**
 * Démarrer, depuis le récap (un seul chemin, planche section 1) : une routine qui a des exercices passe par `commencer` ; un sport
 * seul (ou une séance prévue sans exercices) par son genre : Force, séance vide ; les autres, le départ du suivi. Le garde
 * « séance en cours » est dans les deux.
 */
export async function demarrerDepuisRecap(db: Executeur, r: DonneesRecap, o: { tapis?: boolean } = {}): Promise<void> {
  const salleId = r.lieu.id;
  const lignes = r.tiroir?.routine.blocs.flatMap((b) => b.lignes).length ?? 0;
  // Le récap est l'écran de lancement : il quitte la pile avec le départ (Back depuis la séance revient à l'origine, pile-lancement.ts).
  if (r.routineId && lignes > 0) return commencer(db, r.routineId, salleId, undefined, 1);
  const sport = r.sport ? (await catalogueSports(db)).find((s) => s.id === r.sport) : undefined;
  if (!sport) return commencer(db, r.routineId, salleId, undefined, 1);
  if (genreSport(sport.id) === "muscu") return commencer(db, r.routineId, salleId, typeDeSport(sport.id) ?? "muscu", 1);
  return demarrerSport(db, sport, { salleId, tapis: o.tapis === true, retirer: 1 });
}
