import { Redirect } from "expo-router";

// D2 (revue finale du 30/10) : une seule page pour le poids. L'ancienne page Composition mène à Santé › Poids.
export default function Page() {
  return <Redirect href="/sante/poids" />;
}
