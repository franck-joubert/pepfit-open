import Animated from "react-native-reanimated";
import { t } from "../i18n/index";
import { liste } from "../ui/mouvement";
import { BoutonTonal } from "./nutrition/commun";

// « Revenir à aujourd'hui », bouton tonal du bas d'Entraînements et du journal de Nutrition (29/10) : le même
// composant aux deux endroits, seulement quand le jour affiché n'est pas aujourd'hui ; il entre et sort en fondu (liste.entree,
// liste.sortie : sautés en mouvement réduit). Le geste (useSautJour) glisse du jour affiché vers aujourd'hui.

export function RevenirAujourdhui({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  if (!visible) return null;
  return (
    <Animated.View entering={liste.entree} exiting={liste.sortie}>
      <BoutonTonal icone="retour" libelle={t("accueil.entrainement.revenirAujourdhui")} onPress={onPress} />
    </Animated.View>
  );
}
