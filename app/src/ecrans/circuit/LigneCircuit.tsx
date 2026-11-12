// La ligne d'un circuit (planche Circuits, « Ce que donne un circuit à découvrir ») : le même composant dans la liste de Découvrir, la carte de
// prévisualisation, « Mes circuits » et la feuille du départ, construit sur le gabarit de la ligne d'un lieu (LigneBase). Cinq éléments : la
// vignette (la photo du lieu de départ, un voile, le tracé), le nom et son cadenas (le circuit est à toi seul), « Type, distance, dénivelé »,
// « Départ lieu », la distance jusqu'au départ à droite. Toute la ligne se touche et ouvre la page du circuit, jamais celle du lieu.
import { StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import type { Circuit } from "../../circuits/types";
import type { LigneCircuitTexte } from "./ligne";
import { VignetteCircuit } from "./VignetteCircuit";
import { LigneBase } from "./LigneBase";

export function LigneCircuit({
  circuit,
  ligne,
  onOuvrir,
  chevron = false,
  enCarte = false,
  coche = false,
}: {
  circuit: Circuit;
  ligne: LigneCircuitTexte;
  onOuvrir: () => void;
  chevron?: boolean;
  enCarte?: boolean;
  coche?: boolean;
}) {
  const { couleurs } = useTheme();
  return (
    <LigneBase vignette={<VignetteCircuit circuit={circuit} />} distance={ligne.distance} accessibilite={ligne.accessibilite} onOuvrir={onOuvrir} chevron={chevron} enCarte={enCarte} coche={coche}>
      <View style={styles.nom}>
        <Texte variante="saisie" numberOfLines={1} style={styles.titre}>
          {ligne.nom}
        </Texte>
        {ligne.prive ? (
          <View style={styles.cadenas} accessible accessibilityLabel={t("circuit.ligne.prive")}>
            <Icone nom="cadenas" couleur={couleurs.t3} taille={14} />
          </View>
        ) : null}
      </View>
      <Texte variante="corps" couleur="t2" numberOfLines={1} style={styles.sous}>
        {ligne.sous}
      </Texte>
      {ligne.depart ? (
        <Texte variante="meta" couleur="t3" numberOfLines={2} style={styles.sous}>
          {ligne.depart}
        </Texte>
      ) : null}
    </LigneBase>
  );
}

const styles = StyleSheet.create({
  nom: { flexDirection: "row", alignItems: "center", gap: 6 },
  titre: { fontFamily: police.semibold, fontSize: 15, lineHeight: 20, flexShrink: 1 },
  cadenas: { alignItems: "center", justifyContent: "center" },
  sous: { lineHeight: 18 },
});
