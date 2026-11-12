import { useLocalSearchParams } from "expo-router";
import { Corps } from "../../ecrans/mesures/Corps";

export default function Page() {
  const { jour } = useLocalSearchParams<{ jour?: string }>();
  return <Corps cle="gras" jour={Number(jour) || null} />;
}
