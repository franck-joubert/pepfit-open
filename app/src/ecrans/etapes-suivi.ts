// Étapes du suivi lancé (course guidée) : celles de la routine, allongées des tests VMA relancés après une pause (D3, planche
// vma-vo2max) ; sur tapis, les étapes à la distance passées au temps (D3 du 29/10). Une seule lecture pour l'écran en direct,
// GuideFond et la fin du suivi : la même suite partout.
import { lireRoutine, type Executeur, type SuiviLance } from "../db/api";
import { avecRelances, etapesAuTemps, etapesDeRoutine, lignesCourse, type Etape } from "./etapes-course";

export async function etapesDuSuivi(db: Executeur, l: SuiviLance | null): Promise<Etape[] | null> {
  const r = l?.routineId ? await lireRoutine(db, l.routineId) : null;
  const lues = r ? etapesDeRoutine(lignesCourse(r)) : [];
  const e = l?.tapis ? etapesAuTemps(lues, l.tapis.vma) : lues;
  return e.length ? avecRelances(e, l?.relancesTest ?? []) : null;
}
