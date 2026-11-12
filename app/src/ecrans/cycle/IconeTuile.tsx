// L'icône d'une ligne du suivi du cycle (planche cycle : « ic-mes ») : 40 × 40, coins de 11, voile de la partie, trait t2.
import { View } from "react-native";
import { useTheme } from "../../theme";
import { Icone, type NomIcone } from "../../ui/Icone";
import { useMesure } from "../mesures/gabarit";

export function IconeTuile({ nom }: { nom: NomIcone }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: m.voile, marginRight: 12 }}>
      <Icone nom={nom} couleur={couleurs.t2} taille={20} />
    </View>
  );
}
