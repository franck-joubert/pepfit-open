// « Prends tes mensurations » : le parcours guidé (planche mensurations), ouvert par la section Tours de la page Poids ; ou,
// pour un bilan de coach (planche coach-v2, A3), sur les seuls tours demandés (`tours`, séparés par des virgules), ceux déjà
// pris pour lui (`deja`) et « pour ».
import { useLocalSearchParams } from "expo-router";
import { Parcours } from "../../ecrans/mesures/Parcours";

export default function Page() {
  const { tours, deja, pour } = useLocalSearchParams<{ tours?: string; deja?: string; pour?: string }>();
  // `deja` : « tour_taille:84,hanches:98 », les tours déjà pris pour le bilan.
  const d = Object.fromEntries((deja ?? "").split(",").map((x) => x.split(":")).filter((x) => x.length === 2).map(([k, v]) => [k!, Number(v)]));
  return <Parcours tours={tours ? tours.split(",") : undefined} deja={d} pour={pour} />;
}
