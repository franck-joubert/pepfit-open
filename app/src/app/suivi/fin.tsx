import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BatterieAuMoment } from "../../ecrans/FeuilleBatterie";
import { SuiviFin } from "../../ecrans/SuiviFin";
import { useTheme } from "../../theme";

// Fin de course (planche suivi-gps « Fin ») : pepfitopen://suivi/fin?id=<séance>, ouvert par Terminer. FC ou suivi coupé pendant la
// course (journal du suivi) et pepfit encore optimisé : « Batterie non restreinte », une fois (moment « coupure »).
export default function Fin() {
  const { couleurs } = useTheme();
  const { id, ralenti } = useLocalSearchParams<{ id?: string; ralenti?: string }>();
  if (!id) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
  return (
    <>
      <SuiviFin seanceId={id} ralenti={Math.min(10, Math.max(1, Number(ralenti) || 1))} />
      <BatterieAuMoment moment="coupure" actif />
    </>
  );
}
