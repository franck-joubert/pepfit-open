import { useLocalSearchParams } from "expo-router";
import { Coeur } from "../../ecrans/mesures/Coeur";

export default function Page() {
  const { jour } = useLocalSearchParams<{ jour?: string }>();
  return <Coeur cle="fc" jour={Number(jour) || null} />;
}
