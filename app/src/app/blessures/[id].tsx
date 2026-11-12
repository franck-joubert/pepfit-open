import { useLocalSearchParams } from "expo-router";
import { FicheBlessure } from "../../ecrans/FicheBlessure";

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FicheBlessure id={id} />;
}
