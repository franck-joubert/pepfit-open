import { router } from "expo-router";
import { t, tp } from "../../i18n/index";
import { GroupeReglages, LigneReglage, BoutonLigne } from "../Reglage";
import type { DonneesRecap } from "./donnees-recap";
import { aUnProgramme, exercicesDe } from "./recap-calc";

// Ce que l'écran de lancement noir (SuiviDepart) rappelle d'une séance de musculation, dans une carte de lignes de réglage : le
// programme s'il y en a un (son nom, la semaine et la séance), la séance si une est définie (son nom, le nombre d'exercices ;
// touchée : la page de la routine, qui reste le détail), sinon « Séance libre ». Texte minimal : rien d'autre du récap à halo.

export function CarteSeance({ r }: { r: DonneesRecap }) {
  const x = r.tiroir;
  const a = x?.lien?.avancement;
  const n = exercicesDe(r).length;
  const programme = x && x.lien && a && aUnProgramme(r) ? { x, lien: x.lien, a } : null;
  return (
    <GroupeReglages>
      {programme ? (
        <LigneReglage
          icone="cal"
          libelle={programme.lien.nom}
          sous={
            programme.x.genre === "horsProgramme"
              ? t("tiroirs.hors.sous", { routine: programme.x.routine.nom })
              : programme.a.rang != null
                ? t("tiroirs.semaineSeance", { semaine: programme.a.semaine, semaines: programme.a.semaines, n: programme.a.rang, total: programme.a.total })
                : t("tiroirs.semaine", { semaine: programme.a.semaine, semaines: programme.a.semaines })
          }
        >
          {programme.x.genre === "horsProgramme" && programme.x.routinePrevue ? (
            <BoutonLigne libelle={t("tiroirs.hors.laFaire")} onPress={() => router.replace({ pathname: "/seance-recap", params: { routineId: programme.x.routinePrevue! } })} />
          ) : null}
        </LigneReglage>
      ) : null}
      <LigneReglage
        icone="routine"
        libelle={n > 0 ? r.nom : t("accueil.lanceur.seanceLibre")}
        sous={n > 0 ? tp("tiroirs.exercices", n) : undefined}
        onPress={n > 0 && r.routineId ? () => router.push({ pathname: "/routine/view/[id]", params: { id: r.routineId!, detail: "1" } }) : undefined}
      />
    </GroupeReglages>
  );
}
