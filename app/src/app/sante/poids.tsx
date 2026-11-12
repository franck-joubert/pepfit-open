import { useLocalSearchParams } from "expo-router";
import { Corps } from "../../ecrans/mesures/Corps";

export default function Page() {
  const { jour, section } = useLocalSearchParams<{ jour?: string; section?: string }>();
  return <Corps cle="poids" jour={Number(jour) || null} tours={section === "tours"} />;
}
