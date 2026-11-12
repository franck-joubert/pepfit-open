import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme";
import { rayon } from "../../theme/typo";
import { MACROS_RESTE, resteDuJour } from "../../nutrition/reste";
import type { CleMacro, Objectif } from "../../nutrition/calculs";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { MACROS, MARGE_CARTE, Rangee, useCouleursMacros, valeurTexte } from "./commun";

type Total = Record<CleMacro, number> & { approx: boolean };

/**
 * « Il reste » (planche du 08/11, variante A) : sous les repas d'aujourd'hui seulement (09/11 : plus pour les jours à venir), ce qu'il reste à manger. Dans la
 * même `Rangee` que les repas (mêmes colonnes) : « 140 kcal » sur une ligne, P, G, L avec leur lettre colorée, pas de sucre ni
 * de jauge. Mêmes marges intérieures que les cartes de repas (MARGE_CARTE de chaque côté, filet compris) et même chiffre (14 moyen) : P, G, L tombent au même x que « 691 kcal 63 45 27 ». Fond propre (`resteFond`, noir translucide) : ce n'est pas une carte de repas.
 * Objectif rempli ou franchi : « 0 » pour une macro, « Objectif atteint » à la place des kcal.
 */
export function BlocReste({ jour, total, objectif }: { jour: string; total: Total; objectif: Objectif }) {
  const { couleurs } = useTheme();
  const c = useCouleursMacros();
  const r = resteDuJour(total, objectif);
  const macros = MACROS.filter((x) => (MACROS_RESTE as readonly string[]).includes(x.cle));
  return (
    <View style={[styles.carte, { backgroundColor: couleurs.resteFond, borderColor: couleurs.verreFilet }]}>
      <Texte variante="entete" couleur="t3" style={{ marginBottom: 10 }}>
        {t("nutrition.ilReste")}
      </Texte>
      <Rangee
        cellules={[
          r.kcal.atteint ? (
            <Texte key="k" accessibilityLabel={t("nutrition.objectifAtteint")} variante="saisie" style={{ fontSize: 14, color: couleurs.t1 }} numberOfLines={1}>
              {`${t("nutrition.objectifAtteint")} 👌`}
            </Texte>
          ) : (
            <Texte key="k" variante="saisie" style={{ fontSize: 14, color: couleurs.t1 }} numberOfLines={1}>
              {valeurTexte(r.kcal.reste, total.approx)}
              <Texte variante="meta" couleur="t3">
                {" "}
                {t("nutrition.kcal")}
              </Texte>
            </Texte>
          ),
          ...macros.map((x) => (
            <Texte key={x.cle} accessibilityLabel={`${t(x.abrege)} ${valeurTexte(r.macros[x.cle as (typeof MACROS_RESTE)[number]])}`} variante="meta" couleur="t2" numberOfLines={1}>
              <Texte variante="entete" style={{ fontSize: 11, color: c[x.cle], textTransform: "none", letterSpacing: 0 }}>
                {t(x.court)}
              </Texte>
              <Texte variante="saisie" style={{ fontSize: 14, color: couleurs.t1 }}>
                {" "}
                {valeurTexte(r.macros[x.cle as (typeof MACROS_RESTE)[number]])}
              </Texte>
            </Texte>
          )),
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { marginHorizontal: MARGE_CARTE, marginBottom: 16, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16 },
});
