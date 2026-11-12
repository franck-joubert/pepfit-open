import { useLocalSearchParams } from "expo-router";
import { CartePleine } from "../../../ecrans/circuit/CartePleine";

// La carte d'un circuit en plein écran (planche Circuits, lot C2) : ouverte d'un toucher sur la carte de la page du circuit.
export default function CarteCircuitRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CartePleine id={id} />;
}
