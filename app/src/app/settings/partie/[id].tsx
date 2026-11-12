import { useEffect } from "react";
import { ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ContenuReglagesPartie, titreReglagesPartie } from "../../../ecrans/reglages/Parties";
import { ROUTE_PARTIE, type PartieReglee } from "../../../ecrans/reglages/inventaire";
import { useLangue } from "../../../i18n/useLangue";
import { useTheme } from "../../../theme";
import type { Partie } from "../../../theme/effets";
import { espace } from "../../../theme/typo";
import { BarreHaut } from "../../../ui/Cadre";
import { PartieImposee } from "../../../ui/ContextePartie";

const TEINTE: Record<PartieReglee, Partie> = { nutrition: "nutrition", sport: "entrainement", sante: "sante" };

/**
 * Réglages d'une partie en page pleine (planche menu, D21) : ouverts depuis Réglages › Par partie, avec retour vers Réglages
 * et sans « Tous les réglages » ; le même contenu que la feuille des curseurs de l'onglet, dans la teinte de la partie.
 */
export default function ReglagesPartie() {
  useLangue();
  const { id } = useLocalSearchParams<{ id: string }>();
  const connue = !!id && id in ROUTE_PARTIE;
  // partie inconnue (lien pepfitopen:// mal formé) : la page Réglages
  useEffect(() => {
    if (!connue) router.replace("/settings");
  }, [connue]);
  if (!connue) return null;
  const partie = id as PartieReglee;
  return (
    <PartieImposee partie={TEINTE[partie]}>
      <Page partie={partie} />
    </PartieImposee>
  );
}

function Page({ partie }: { partie: PartieReglee }) {
  const { couleurs } = useTheme();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={titreReglagesPartie(partie)} />
      <ScrollView contentContainerStyle={{ paddingTop: espace.s, paddingBottom: espace.xxl * 2 }}>
        <ContenuReglagesPartie partie={partie} aller={(r) => router.push(r as never)} />
      </ScrollView>
    </SafeAreaView>
  );
}
