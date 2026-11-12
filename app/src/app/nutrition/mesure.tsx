import { Redirect, useLocalSearchParams } from "expo-router";

// Ancienne page d'une mesure (planche 25) : remplacée par la page d'un tour de Santé (planche mensurations, M6).
export default function Page() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  return <Redirect href={{ pathname: "/sante/tour", params: { type: type ?? "tour_taille" } }} />;
}
