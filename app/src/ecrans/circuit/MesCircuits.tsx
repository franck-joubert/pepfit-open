import { router } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { PageBriques, Vide } from "../briques";
import { LigneCircuit } from "./LigneCircuit";
import { ligneCircuit } from "./ligne";
import { useMesCircuits } from "./useMesCircuits";

// « Mes circuits » (planche Circuits, i1) : les circuits à toi, faits d'une sortie ou importés, privés ou publiés, du plus récent au plus ancien.
// La même ligne que Découvrir (sans la distance : elle dit où l'on est, pas où est le circuit). Vide, l'écran propose les deux manières d'en avoir
// un : depuis une sortie, ou par un fichier GPX. Le bouton « Importer un GPX » reste en bas de la liste.

const importer = () => router.push("/circuit/importer");

export function MesCircuits() {
  const { couleurs } = useTheme();
  const circuits = useMesCircuits();
  const lignes = useMemo(() => (circuits ?? []).map((c) => ({ circuit: c, ligne: ligneCircuit(c, null) })), [circuits]);
  const vide = circuits != null && circuits.length === 0;

  return (
    <PageBriques
      titre={t("circuit.mes.titre")}
      piedFondu
      pied={circuits && !vide ? <BoutonPrincipal icone="fichier" libelle={t("circuit.importer.action")} onPress={importer} /> : undefined}
    >
      {vide ? (
        <Vide icone="circuit" titre={t("circuit.mes.vide.titre")} texte={t("circuit.mes.vide.texte")}>
          <BoutonTonal hauteur={44} icone="fichier" libelle={t("circuit.importer.action")} onPress={importer} style={styles.pleineLargeur} />
        </Vide>
      ) : null}
      {lignes.map(({ circuit, ligne }) => (
        <LigneCircuit key={circuit.id} circuit={circuit} ligne={ligne} onOuvrir={() => router.push({ pathname: "/circuit/[id]", params: { id: circuit.id } })} />
      ))}
      {lignes.length ? (
        <View style={styles.note}>
          <Icone nom="cadenas" couleur={couleurs.t3} taille={16} />
          <Texte variante="corps" couleur="t2" style={styles.texte}>
            {t("circuit.mes.note")}
          </Texte>
        </View>
      ) : null}
    </PageBriques>
  );
}

const styles = StyleSheet.create({
  pleineLargeur: { alignSelf: "stretch" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: espace.s + 2, paddingHorizontal: espace.xs, marginTop: espace.l },
  texte: { flex: 1, lineHeight: 20 },
});
