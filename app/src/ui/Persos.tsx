import { memo } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { libelleMuscle } from "../db/natures";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { allumage, musclesAllumes } from "./persos-calc";
import { VUES_PERSOS } from "./persos-images";

// Petits persos (planche exercices-perso, D5) : le personnage de l'appli de face et de dos, muscles allumés en rouge
// (principal) et rose (secondaires). Couches pré-rendues avec le shader de la 3D (scripts/persos) : aucun contexte GL, rien
// qui bouge. Pas cliquables : on choisit par les puces ; le lecteur d'écran lit les muscles allumés.
export const Persos = memo(function Persos({
  principal,
  secondaires = [],
  hauteur,
  style,
}: {
  principal: string | null | undefined;
  secondaires?: readonly string[];
  /** Hauteur d'un perso, en dp ; l'écart entre les deux vaut 12 % de la largeur d'un perso. */
  hauteur: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { mode } = useTheme();
  const roles = allumage(principal, secondaires);
  const noms = musclesAllumes(principal, secondaires).map(libelleMuscle);
  const libelle = noms.length ? t("exercices.persos.allumes", { muscles: noms.join(", ") }) : t("exercices.persos.aucun");
  const largeurFace = hauteur * VUES_PERSOS.face.ratio;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={libelle} style={[{ flexDirection: "row", gap: Math.round(largeurFace * 0.12) }, style]}>
      {(["face", "dos"] as const).map((v) => {
        const vue = VUES_PERSOS[v];
        const l = hauteur * vue.ratio;
        return (
          <View key={v} style={{ width: l, height: hauteur }}>
            <Image source={vue.corps} style={{ width: l, height: hauteur }} />
            {[...roles].map(([id, role]) => {
              const c = vue.couches[`${mode}-${role}-${id}`];
              if (!c) return null;
              const [x, y, w, h] = c.place;
              return <Image key={id} source={c.source} style={{ position: "absolute", left: x * l, top: y * hauteur, width: w * l, height: h * hauteur }} />;
            })}
          </View>
        );
      })}
    </View>
  );
});
