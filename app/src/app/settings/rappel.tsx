import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ecrireReglagesPlanif, lireReglagesPlanif } from "../../db";
import { useApp, useCharge } from "../../ecrans/contexte";
import { FeuilleHeure, FeuilleRappelDefaut, rappelCourt } from "../../ecrans/FeuillesPlanif";
import { GroupeReglages, LigneReglage } from "../../ecrans/Reglage";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { rafraichirRappels } from "../../natif/rappels";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { PartieImposee } from "../../ui/ContextePartie";

/** Rappel (Sport › curseurs › Rappels et détection, planche menu) : heure des séances et rappel, repris de l'ancienne page Préférences. */
export default function Rappel() {
  return (
    <PartieImposee partie="entrainement">
      <Page />
    </PartieImposee>
  );
}

function Page() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [ouvert, setOuvert] = useState<"heure" | "rappel" | null>(null);
  const fermer = () => setOuvert(null);
  const [planif, relire] = useCharge(lireReglagesPlanif, []);
  const ecrire = (r: { heureDefaut?: string; rappelDefautMin?: number }) =>
    ecrireReglagesPlanif(db, r)
      .then(relire)
      .then(() => rafraichirRappels(db, { demander: true }))
      .catch(console.error);
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("menu.rappel")} />
      <ScrollView contentContainerStyle={{ paddingTop: espace.s, paddingBottom: espace.xxl * 2 }}>
        {planif ? (
          <GroupeReglages>
            <LigneReglage libelle={t("reglages.heureSeances")} valeur={planif.heureDefaut} onPress={() => setOuvert("heure")} />
            <LigneReglage libelle={t("reglages.rappel")} valeur={t("reglages.avant", { duree: rappelCourt(planif.rappelDefautMin) })} onPress={() => setOuvert("rappel")} />
          </GroupeReglages>
        ) : null}
      </ScrollView>
      <FeuilleHeure
        visible={ouvert === "heure"}
        valeur={planif?.heureDefaut ?? "18:00"}
        onFermer={fermer}
        onValider={(h) => {
          fermer();
          ecrire({ heureDefaut: h });
        }}
      />
      <FeuilleRappelDefaut
        visible={ouvert === "rappel"}
        valeur={planif?.rappelDefautMin ?? 30}
        onFermer={fermer}
        onValider={(m) => {
          fermer();
          ecrire({ rappelDefautMin: m });
        }}
      />
    </SafeAreaView>
  );
}
