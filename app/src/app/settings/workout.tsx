import { Redirect } from "expo-router";

/** Ancienne adresse (pepfitopen://settings/workout) : les réglages de séance vivent dans Sport (planche menu). */
export default function Ancienne() {
  return <Redirect href="/settings/partie/sport" />;
}
