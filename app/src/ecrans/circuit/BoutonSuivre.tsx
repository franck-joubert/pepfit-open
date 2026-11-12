import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { activiteAffichee } from "../../circuits/page";
import { sportDeActivite } from "../../circuits/suivre";
import type { ActiviteCircuit, Circuit } from "../../circuits/types";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, menuOnglets } from "../../theme/typo";
import { useMargeColonne } from "../../ui/CadreContenu";
import { DegradeFond } from "../../ui/DegradeFond";
import { BoutonPrincipal } from "../../ui/Degrade";
import { ouvrirDepartCircuit } from "../commencer";

// « Suivre ce circuit » (planche Circuits, lot F) : le seul bouton de la page d'un circuit et de sa carte en plein écran. Il ouvre l'écran de
// départ de l'activité (le même que celui d'une course, d'une randonnée ou d'un vélo) avec la ligne « Circuit » déjà remplie : le sport est celui
// de l'activité que la page montre (le Segmenté), sinon la première du circuit. Le circuit reste suivi sans réseau : il part avec le suivi lancé.

/** Ouvre l'écran de départ avec ce circuit : `choisie` est l'activité du Segmenté de la page, ou null (la première du circuit). */
export function suivreCeCircuit(c: Pick<Circuit, "id" | "activites">, choisie: ActiviteCircuit | null = null): void {
  void ouvrirDepartCircuit(sportDeActivite(activiteAffichee(c.activites, choisie)), c.id);
}

export function BoutonSuivre({ circuit, activite = null, style }: { circuit: Pick<Circuit, "id" | "activites">; activite?: ActiviteCircuit | null; style?: StyleProp<ViewStyle> }) {
  return <BoutonPrincipal libelle={t("circuit.suivre.bouton")} icone="play" onPress={() => suivreCeCircuit(circuit, activite)} style={style} />;
}

/** La hauteur que la barre du bas garde sous la page : le bouton (52), la marge basse du menu et le voile. */
export const BOUTON = 52;

/**
 * Le bouton fixé au bas de la page d'un circuit, sur le voile en dégradé du menu du bas (ui/DegradeFond) et avec la même marge basse que la
 * barre d'une activité (BarreActivite) : la page défile dessous sans se lire à travers le bouton. Sur le Fold déplié, le voile couvre tout
 * l'écran et le bouton reste dans la colonne.
 */
export function BarreSuivre({ circuit, activite }: { circuit: Pick<Circuit, "id" | "activites">; activite: ActiviteCircuit | null }) {
  const { couleurs } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const marge = useMargeColonne();
  const hauteur = BOUTON + menuOnglets.ecartBas + bottom;
  return (
    <View pointerEvents="box-none" style={[styles.barre, { height: hauteur }]}>
      <View pointerEvents="none" style={[styles.voile, { left: -marge, right: -marge, top: -menuOnglets.fondu }]}>
        <DegradeFond id="fonduSuivre" couleur={couleurs.bg} largeur={width} hauteur={hauteur - bottom + menuOnglets.fondu} />
        <View style={{ height: bottom, backgroundColor: couleurs.bg }} />
      </View>
      <BoutonSuivre circuit={circuit} activite={activite} style={[styles.bouton, { bottom: menuOnglets.ecartBas + bottom }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { position: "absolute", left: 0, right: 0, bottom: 0 },
  voile: { position: "absolute", top: 0, bottom: 0 },
  bouton: { position: "absolute", left: espace.l, right: espace.l },
});
