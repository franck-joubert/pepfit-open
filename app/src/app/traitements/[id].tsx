import { useLocalSearchParams } from "expo-router";
import { FicheTraitement } from "../../ecrans/FicheTraitement";

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FicheTraitement id={id} />;
}
