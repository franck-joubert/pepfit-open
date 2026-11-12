// Ressenti visé (planche exercices-perso, section 5) : la pastille « Visé : Dur » et sa feuille, communes à la ligne de
// routine (toutes ses séries) et à la séance (cette séance seulement). Les quatre mots de « C'était comment ? », puis « Aucun ».
import { StyleSheet, View } from "react-native";
import { MOTS_EFFORT, motDeRir, rirDeMot } from "../boutique/poids";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { police, rayon } from "../theme/typo";
import { Pastille } from "../ui/Cadre";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";

/** « Visé : Dur », ou « Ressenti visé » quand la ligne n'en a pas. */
export function PastilleVise({ rir, onPress }: { rir: number | null; onPress: () => void }) {
  useLangue();
  const mot = motDeRir(rir);
  return mot ? (
    <Pastille icone="cible" libelle={t("exercices.vise.pastilleDebut")} valeur={t(`seance.effort.${mot}`)} onPress={onPress} />
  ) : (
    <Pastille icone="cible" libelle={t("exercices.vise.aucunePastille")} onPress={onPress} />
  );
}

/**
 * `routine` : nom de la routine. `garde` (séance seulement) : le ressenti de la ligne de routine, rappelé dans l'aide
 * (« Pull A garde « Dur » ») ; absent dans l'éditeur de routine.
 */
export function FeuilleVise({
  visible,
  onFermer,
  nom,
  rir,
  enSeance,
  routine,
  garde,
  onChoisir,
}: {
  visible: boolean;
  onFermer: () => void;
  nom: string;
  rir: number | null;
  enSeance: boolean;
  routine: string | null;
  garde?: number | null;
  onChoisir: (rir: number | null) => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const choisi = motDeRir(rir);
  const motGarde = motDeRir(garde ?? null);
  const fort = { color: couleurs.t1, fontFamily: police.semibold };
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("exercices.vise.titre", { nom })}>
      <View style={styles.aide}>
        <Icone nom="info" couleur={couleurs.t2} taille={18} />
        <Texte variante="meta" couleur="t2" style={styles.aideTexte}>
          {enSeance ? (
            <>
              {t("exercices.vise.seanceAvant")}
              <Texte variante="meta" style={[styles.aideTexte, fort]}>
                {t("exercices.vise.seanceFort")}
              </Texte>
              {t("exercices.vise.seanceApres")}
              {routine && motGarde ? ` ${t("exercices.vise.seanceGarde", { routine, mot: t(`seance.effort.${motGarde}`) })}` : ""}
            </>
          ) : (
            <>
              {t("exercices.vise.routineAvant")}
              <Texte variante="meta" style={[styles.aideTexte, fort]}>
                {routine ? t("exercices.vise.routineDans", { routine }) : t("exercices.vise.routineSansNom")}
              </Texte>
              {t("exercices.vise.routineApres")}
            </>
          )}
        </Texte>
      </View>
      <View style={styles.mots} accessibilityRole="radiogroup">
        {MOTS_EFFORT.map((m) => {
          const on = m === choisi;
          const libelle = t(`seance.effort.${m}`);
          const sous = t(`seance.effort.${m}Sous`);
          return (
            <Appui
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t("seance.effort.choix", { mot: libelle, sous })}
              onPress={() => onChoisir(rirDeMot(m).rir)}
              style={[styles.mot, { backgroundColor: on ? couleurs.t1 : couleurs.s2 }]}
            >
              <Texte style={{ fontFamily: police.semibold, fontSize: 15, color: on ? couleurs.bg : couleurs.t1 }}>{libelle}</Texte>
              <Texte style={{ fontFamily: police.medium, fontSize: 11, marginTop: 2, color: on ? couleurs.bg : couleurs.t2, opacity: on ? 0.75 : 1 }}>{sous}</Texte>
            </Appui>
          );
        })}
      </View>
      <Groupe>
        <Option premier libelle={t("exercices.vise.aucun")} choisi={rir == null} onPress={() => onChoisir(null)} />
      </Groupe>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  aide: { flexDirection: "row", gap: 8, marginHorizontal: 4, alignItems: "flex-start" },
  aideTexte: { flexShrink: 1, fontSize: 13, lineHeight: 19 },
  mots: { flexDirection: "row", gap: 6 },
  mot: { flex: 1, height: 56, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
