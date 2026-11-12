import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { lireSport, type Sport } from "../../db";
import { useApp } from "../../ecrans/contexte";
import { SuiviDepart } from "../../ecrans/SuiviDepart";
import { useTheme } from "../../theme";

// Écran de lancement d'un sport au suivi GPS (planche suivi-gps) hors récap : pepfitopen://suivi/depart?sport=cat:course&lieu=<id>,
// ouvert depuis la fiche d'une routine de course (&routine=<id> : course guidée par ses étapes, planche seance-duree, D8). Depuis
// le récap (séance, routine, sport du lanceur), c'est le récap lui-même qui montre cet écran (ecrans/recap/EcranRecap) : il n'y
// a jamais deux écrans de lancement empilés (tests/depart-unique.test.ts).
// &circuit=<id> : « Suivre ce circuit » (page d'un circuit, carte pleine) ouvre l'écran avec la ligne « Circuit » déjà remplie.
// Recette (captures, émulateur sans capteur) : &tuto=whoop|ceinture|appareils ouvre le tuto de la FC, &essai=recherche|ok|rien
// montre sa ligne d'état ; &tapis=1 part sur Tapis / Intérieur. Affichage seul.
export default function Depart() {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const { sport: id, lieu, routine, circuit, tuto, essai, tapis } = useLocalSearchParams<{ sport?: string; lieu?: string; routine?: string; circuit?: string; tuto?: string; essai?: string; tapis?: string }>();
  const [sport, setSport] = useState<Sport | null>(null);
  useEffect(() => {
    if (id) lireSport(db, id).then(setSport).catch(console.error);
  }, [db, id]);
  if (!sport) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
  const recette = {
    tuto: tuto === "whoop" || tuto === "ceinture" || tuto === "appareils" ? tuto : undefined,
    essai: essai === "recherche" || essai === "ok" || essai === "rien" ? essai : undefined,
    tapis: tapis === "1",
  } as const;
  return <SuiviDepart sport={sport} salleId={lieu || null} routineId={routine || null} circuitId={circuit || null} recette={recette} />;
}
