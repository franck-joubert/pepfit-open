import { useLocalSearchParams } from "expo-router";
import { ZoneBlessure } from "../../ecrans/ZoneBlessure";

export default function Page() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ZoneBlessure id={id} />;
}
