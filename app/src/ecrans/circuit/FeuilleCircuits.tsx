import { StyleSheet, View } from "react-native";
import { ligneCircuit } from "./ligne";
import { t } from "../../i18n/index";
import type { Circuit, CircuitSuivi } from "../../circuits/types";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { LigneCircuit } from "./LigneCircuit";
import { useCircuitsASuivre } from "./useCircuitsASuivre";

// La feuille « Suivre un circuit » (planche Circuits, lot F, s1) : « Sans circuit » en premier (la sortie est libre, c'est le départ d'avant),
// puis les circuits qui vont à l'activité, du plus proche au plus loin, les siens importés compris. La ligne est celle de Découvrir (une seule
// ligne de circuit partout), la distance à droite est celle jusqu'à son départ ; le circuit choisi porte une coche. Toucher une ligne choisit
// et ferme : aucune page ne s'ouvre ici.
export function FeuilleCircuits({
  visible,
  onFermer,
  sportId,
  choisi,
  onChoisir,
}: {
  visible: boolean;
  onFermer: () => void;
  sportId: string;
  choisi: CircuitSuivi | null;
  onChoisir: (c: Circuit | null) => void;
}) {
  const { liste, attente } = useCircuitsASuivre(sportId, visible);
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("circuit.suivre.feuille")}>
      <Groupe>
        <Option premier icone="close" libelle={t("circuit.suivre.sans")} choisi={choisi == null} onPress={() => onChoisir(null)} />
        {liste.length ? (
          <View style={styles.lignes}>
            {liste.map(({ circuit, m }) => (
              <LigneCircuit key={circuit.id} circuit={circuit} ligne={ligneCircuit(circuit, m)} coche={choisi?.id === circuit.id} onOuvrir={() => onChoisir(circuit)} />
            ))}
          </View>
        ) : attente ? null : (
          <Option icone="circuit" libelle={t("circuit.suivre.vide")} aide={t("circuit.suivre.videAide")} />
        )}
      </Groupe>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  // La ligne d'un circuit déborde de 12 de chaque côté (gabarit de Découvrir) : le groupe lui rend sa marge.
  lignes: { paddingHorizontal: 24, paddingVertical: 8 },
});
