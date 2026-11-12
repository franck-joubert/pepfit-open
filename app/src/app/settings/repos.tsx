import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { alerteSonne, type AlerteRepos } from "../../ecrans/alerte-repos";
import { useApp } from "../../ecrans/contexte";
import { dureeRepos } from "../../ecrans/format";
import { GroupeReglages, LigneReglage } from "../../ecrans/Reglage";
import { LIBELLE_FIN } from "../../ecrans/reglages/Parties";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { sons } from "../../natif/son";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { PartieImposee } from "../../ui/ContextePartie";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { FeuilleRepos } from "../../ui/RoueDuree";

const SON_DEFAUT = "content://settings/system/notification_sound";
const FINS: AlerteRepos[] = ["vibration", "son", "les-deux", "rien"];

/** Repos (Sport › curseurs › Séance › Repos, planche menu) : durée par défaut, fin du repos et son, repris de l'ancienne page Préférences. */
export default function Repos() {
  return (
    <PartieImposee partie="entrainement">
      <Page />
    </PartieImposee>
  );
}

function Page() {
  useLangue();
  const { reglages, regler } = useApp();
  const { couleurs } = useTheme();
  const [ouvert, setOuvert] = useState<"repos" | "fin" | null>(null);
  const fermer = () => setOuvert(null);
  // Le sélecteur du système fait entendre chaque son à la sélection.
  const choisirSon = async () => {
    const s = await sons.choisir(reglages.sonRepos?.uri ?? null);
    if (s) regler({ sonRepos: s.uri === SON_DEFAUT ? null : s });
  };
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("menu.repos")} />
      <ScrollView contentContainerStyle={{ paddingTop: espace.s, paddingBottom: espace.xxl * 2 }}>
        <GroupeReglages>
          <LigneReglage libelle={t("profil.reposDefaut")} valeur={dureeRepos(reglages.reposDefautS)} onPress={() => setOuvert("repos")} />
          <LigneReglage libelle={t("profil.finRepos")} valeur={t(LIBELLE_FIN[reglages.alerteRepos])} onPress={() => setOuvert("fin")} />
          {alerteSonne(reglages.alerteRepos) && sons.disponible ? (
            <LigneReglage libelle={t("profil.son")} valeur={reglages.sonRepos?.nom || t("profil.sonDefaut")} onPress={() => choisirSon().catch(() => {})} />
          ) : null}
        </GroupeReglages>
      </ScrollView>
      <Feuille visible={ouvert === "fin"} onFermer={fermer} titre={t("profil.finRepos")}>
        <Groupe>
          {FINS.map((f, i) => (
            <Option key={f} premier={i === 0} libelle={t(LIBELLE_FIN[f])} choisi={reglages.alerteRepos === f} onPress={() => (regler({ alerteRepos: f }), fermer())} />
          ))}
        </Groupe>
      </Feuille>
      <FeuilleRepos
        visible={ouvert === "repos"}
        onFermer={fermer}
        titre={t("profil.reposDefaut")}
        valeur={reglages.reposDefautS}
        onValider={(d) => {
          fermer();
          regler({ reposDefautS: d });
        }}
      />
    </SafeAreaView>
  );
}
