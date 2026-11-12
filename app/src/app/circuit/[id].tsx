import { useLocalSearchParams } from "expo-router";
import { PageCircuit } from "../../ecrans/circuit/PageCircuit";

// La page d'un circuit (planche Circuits) : ouverte depuis Découvrir, « Mes circuits », une sortie ou un lien pepfitopen://circuit/<id>.
export default function CircuitRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PageCircuit id={id} />;
}
