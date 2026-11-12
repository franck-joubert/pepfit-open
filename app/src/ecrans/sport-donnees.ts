// Données de l'onglet Sport (app/(tabs)/train.tsx), lues en parallèle à chaque arrivée : huit lectures indépendantes qui se
// suivaient l'une après l'autre (audit de performance, M13). Le planning, les rappels et les jauges ont leurs propres lecteurs.
import {
  catalogueSports, lireLanceur, listerSalles, seancesTerminees, serieHebdo, type Executeur, type SalleResume, type Sport,
} from "../db/api";
import { plansEnCours, type PlanEnCours } from "../boutique/donnees";
import { pictosSport, resumesRoutines, type ResumeRoutine } from "./donnees";
import { lireCibleProgrammes, type CibleProgrammes } from "./entree-programmes";
import { SPORT_RECUP } from "./recuperer";

export type DonneesSport = {
  serie: number;
  sports: Sport[];
  catalogue: Sport[];
  routines: ResumeRoutine[];
  salles: SalleResume[];
  plans: PlanEnCours[];
  pictos: Awaited<ReturnType<typeof pictosSport>>;
  cibleProgrammes: CibleProgrammes;
};

export async function lireSport(db: Executeur): Promise<DonneesSport> {
  const [terminees, sports, catalogue, routines, salles, plans, pictos, cibleProgrammes] = await Promise.all([
    seancesTerminees(db),
    lireLanceur(db),
    catalogueSports(db),
    resumesRoutines(db),
    listerSalles(db),
    plansEnCours(db),
    pictosSport(db),
    lireCibleProgrammes(db),
  ]);
  // Récupérer (planche recuperer, D2) : sauna, bain froid, massage, étirements et méditation ne sont plus des séances de sport,
  // ils se démarrent par « Récupérer » (la ligne en bas de « Démarrer une séance ») ; le yoga reste un sport
  const sport = (s: Sport) => SPORT_RECUP[s.id] == null;
  return { serie: serieHebdo(terminees).enCours, sports: sports.filter(sport), catalogue: catalogue.filter(sport), routines, salles, plans, pictos, cibleProgrammes };
}
