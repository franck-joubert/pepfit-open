import { Redirect } from "expo-router";

/** Ancienne adresse (pepfitopen://settings/preferences) : la page a été répartie (planche menu) ; tout se retrouve dans Réglages. */
export default function Ancienne() {
  return <Redirect href="/settings" />;
}
