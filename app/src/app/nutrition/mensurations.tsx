import { Redirect } from "expo-router";

// D2 (revue finale du 30/10) : les tours sont une section de Santé › Poids ; l'ancienne route y mène, sur les tours.
export default function Page() {
  return <Redirect href={{ pathname: "/sante/poids", params: { section: "tours" } }} />;
}
