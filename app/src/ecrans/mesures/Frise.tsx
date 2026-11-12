// Frise du parcours des mensurations (planche mensurations, M2) : les tours de haut en bas, au dessin des cases du semainier
// (ui/BandeSemaine : case de 64, nom 11 semi-gras, valeur 16 medium, pastille 6). L'étape en cours a le fond de verre et
// l'anneau rose, sa valeur suit la molette ; prise : pastille pleine ; passée : « — » et pastille creuse ; l'étape où l'on
// reprend après une correction : anneau rose. Toucher une étape la rouvre. La case courante glisse d'une case à l'autre
// (220 ms, courbe déplacement) ; mouvement réduit : elle saute.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { fixe } from "../composition-vue";
import type { EtatParcours } from "./tours-calc";

// 8 tours depuis le cou (M10) : 49 dp par case à 412 ; la valeur passe de 16 à 14 pour que « 120,0 » et « 102,5 » ne
// se touchent pas.
const MARGE = 6;
const GLISSE_MS = 220;
const nom = (x: string) => t(`nutrition.mesure.${x}` as "nutrition.mesure.cou");
/** Nom court de la frise : « Taille » pour le tour de taille. */
const court = (x: string) => (x === "tour_taille" ? t("mensurations.court.tour_taille") : nom(x));

export function Frise({ etat, courante, onEtape }: { etat: EtatParcours; courante: number | null; onEtape: (k: number) => void }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const [largeur, setLargeur] = useState(0);
  const caseL = largeur ? (largeur - 2 * MARGE) / etat.ordre.length : 0;
  const x = useSharedValue(etat.i * caseL);
  useEffect(() => {
    x.value = reduit || !caseL ? etat.i * caseL : withTiming(etat.i * caseL, { duration: GLISSE_MS, easing: courbes.deplacement });
  }, [etat.i, caseL, reduit, x]);
  const glisse = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={styles.frise} onLayout={(e) => setLargeur(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {caseL && !etat.recap ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.courante, { left: MARGE, width: caseL, backgroundColor: couleurs.verreCarte, borderColor: couleurs.partieSante }, glisse]}
        />
      ) : null}
      {etat.ordre.map((x2, k) => {
        const v = etat.valeurs[x2];
        const passe = etat.passes.includes(x2);
        const enCours = k === etat.i && !etat.recap;
        const texte = enCours && courante != null ? fixe(courante, 1) : v != null ? fixe(v, 1) : passe ? "—" : "";
        const lu = enCours
          ? t("mensurations.etape.courante", { tour: nom(x2), v: texte })
          : v != null
            ? t("mensurations.etape.prise", { tour: nom(x2), v: `${fixe(v, 1)} cm` })
            : passe
              ? t("mensurations.etape.passee", { tour: nom(x2) })
              : t("mensurations.etape.aPrendre", { tour: nom(x2) });
        const pastille =
          etat.reprise === k
            ? { borderWidth: 1.5, borderColor: couleurs.partieSante }
            : v != null
              ? { backgroundColor: couleurs.partieSante }
              : passe
                ? { borderWidth: 1, borderColor: couleurs.t3 }
                : null;
        return (
          <Pressable key={x2} accessibilityRole="tab" accessibilityState={{ selected: enCours }} accessibilityLabel={lu} onPress={() => onEtape(k)} style={styles.case}>
            <Texte numberOfLines={1} style={[styles.nom, { color: enCours ? couleurs.t1 : v != null ? couleurs.t2 : couleurs.t3 }]}>
              {court(x2)}
            </Texte>
            <Texte
              numberOfLines={1}
              style={[styles.valeur, enCours ? { color: couleurs.partieSante, fontFamily: police.semibold } : { color: passe && v == null ? couleurs.t3 : couleurs.t1 }]}
            >
              {texte}
            </Texte>
            <View style={[styles.pastille, pastille]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frise: { height: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: MARGE },
  courante: { position: "absolute", top: 2, height: 64, borderRadius: rayon.l, borderWidth: 1.5 },
  case: { flex: 1, minWidth: 0, height: 64, alignItems: "center", justifyContent: "center", gap: 3 },
  nom: { fontSize: 11, lineHeight: 15, fontFamily: police.semibold },
  valeur: { fontSize: 14, lineHeight: 20, height: 20, fontFamily: police.medium, fontVariant: ["tabular-nums"], letterSpacing: -0.2 },
  pastille: { width: 6, height: 6, borderRadius: 3 },
});
