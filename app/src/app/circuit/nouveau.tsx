import { useLocalSearchParams } from "expo-router";
import { NouveauCircuit } from "../../ecrans/circuit/NouveauCircuit";

// « Faire de cette sortie un circuit » (planche Circuits, c2 et c3) : ouvert par le menu ⋯ d'une sortie GPS, avec sa séance en paramètre.
export default function NouveauCircuitRoute() {
  const { sortie } = useLocalSearchParams<{ sortie: string }>();
  return <NouveauCircuit seanceId={sortie} />;
}
