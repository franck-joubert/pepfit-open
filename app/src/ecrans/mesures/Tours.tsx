// Tours (D2 de la revue finale du 30/10 : une seule page pour le poids) : la section « Tours » de la page Poids, en rose
// Santé. Planche mensurations (validée le 30/10), M8 : elle suit le jour choisi dans le semainier, dit dans son
// titre (« TOURS · JEU. 22 OCT. »). Jour de mesure : les valeurs de ce jour et l'écart avec la précédente, flèche diagonale
// devant (M12 : orange en hausse, bleue en baisse, jamais vert et rouge) ; un tour non pris ce jour-là garde sa dernière
// valeur, datée. Jour sans mesure : une ligne le dit, les valeurs reprises passent en t2 et ne sont datées que si elles
// diffèrent. En tête, « Prendre mes mensurations » ouvre le parcours (Parcours.tsx) ; les huit tours sont toujours listés,
// de haut en bas (M1, cou en tête : M10) ; une ligne ouvre la page du tour (PageTour.tsx) sur ce jour.
import { router } from "expo-router";
import { minusculeInitiale, t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { fixe } from "../composition-vue";
import { jourPesee } from "../poids";
import { TOURS, tourAuJour, type Tours } from "./corps-donnees";
import { Groupe, LigneMesure, Lignes, TitreGroupe, useMesure, Variation } from "./gabarit";
import { minuit } from "./periodes";

const minus = minusculeInitiale;

/** `jour` : le jour choisi dans le semainier (minuit). */
export function SectionTours({ tours, jour, maintenant }: { tours: Tours; jour: number; maintenant: number }) {
  const m = useMesure();
  const { couleurs } = useTheme();
  const lignes = TOURS.map((x) => ({ x, a: tours[x]?.length ? tourAuJour(tours[x]!, jour) : null, jamais: !tours[x]?.length }));
  const unDuJour = lignes.some((q) => q.a?.duJour);
  // jour sans mesure : la date des dernières valeurs reprises (la plus récente), dite une fois
  const repris = lignes.filter((q) => q.a && !q.a.duJour).map((q) => q.a!.m.date);
  const dateReprise = !unDuJour && repris.length ? Math.max(...repris) : null;
  const jourDe = (ms: number) => minus(jourPesee(ms, maintenant));

  return (
    <>
      <TitreGroupe>{t("mensurations.toursDu", { jour: jourPesee(jour, maintenant) })}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="prendre"
              avant={<Icone nom="regle" couleur={m.fort} taille={20} />}
              titre={t("mensurations.prendre")}
              sous={t("mensurations.prendreSous", { n: TOURS.length })}
              onPress={() => router.push("/sante/mensurations")}
            />,
            dateReprise != null ? (
              <Texte key="note" variante="corps" couleur="t2" style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, lineHeight: 18 }}>
                {t("mensurations.noteReport", { jour: "" })}
                <Texte variante="corps" style={{ color: couleurs.t1 }}>
                  {jourDe(dateReprise)}
                </Texte>
              </Texte>
            ) : null,
            ...lignes.map(({ x, a, jamais }) => {
              const sous = jamais
                ? t("mensurations.jamais")
                : a && !a.duJour && (dateReprise == null || minuit(a.m.date) !== minuit(dateReprise))
                  ? jourDe(a.m.date)
                  : null;
              return (
                <LigneMesure
                  key={x}
                  titre={t(`nutrition.mesure.${x}`)}
                  sous={sous}
                  valeur={a ? fixe(a.m.valeur, 1) : "—"}
                  unite={a ? "cm" : null}
                  attenuee={!a?.duJour}
                  sousValeur={a?.duJour && a.precedente ? <Variation d={a.m.valeur - a.precedente.valeur} /> : undefined}
                  onPress={() => router.push({ pathname: "/sante/tour", params: { type: x, jour: String(jour) } })}
                />
              );
            }),
          ]}
        </Lignes>
      </Groupe>
    </>
  );
}
