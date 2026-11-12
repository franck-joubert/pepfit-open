// Page d'un tour (planche mensurations, M6), ouverte par la section Tours de la page Poids, sur le jour qu'elle montrait.
import { Redirect, useLocalSearchParams } from "expo-router";
import { PageTour } from "../../ecrans/mesures/PageTour";
import { estTour } from "../../ecrans/mesures/tours-calc";

export default function Page() {
  const { type, jour } = useLocalSearchParams<{ type?: string; jour?: string }>();
  // la taille (hauteur) n'est pas un tour : elle vit dans le Profil
  if (!estTour(type)) return <Redirect href={{ pathname: "/sante/poids", params: { section: "tours" } }} />;
  return <PageTour key={type} tour={type} jour={Number(jour) || null} />;
}
