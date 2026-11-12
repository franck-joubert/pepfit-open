import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { espace } from "../theme/typo";
import { t } from "../i18n/index";
import { BoutonPrincipal } from "../ui/Degrade";
import { BoutonTonal } from "./nutrition/commun";
import { ouvrirParcours } from "./parcours/demande-parcours";

type Props = {
  /** Aujourd'hui (AAAA-MM-JJ) : le jour que démarre la séance. */
  jour: string;
  /** Où mène « Programmes » (Sport : la boutique des programmes ou la page des programmes). */
  cibleProgrammes?: string;
  /** Séance en cours : on y revient par sa bulle, pas de bouton plein (n° 8). */
  enCours: boolean;
};

/**
 * Les boutons d'aujourd'hui sur la page Activité/Entraînement, dans la page (09/11, au-dessus des Capteurs, ils défilent
 * avec elle) : « Programmes » et « Routines » côte à côte (A1), puis « Ajouter une activité » (ex-« Démarrer une séance », même geste : le parcours de séance), toujours plein (planche v2, retour 1 :
 * la séance prévue n'a plus de bouton).
 */
export function BoutonsSeance({ jour, cibleProgrammes, enCours }: Props) {
  return (
    <View style={styles.bloc}>
      <View style={styles.rangee2}>
        <BoutonTonal icone="cal" libelle={t("accueil.lanceur.programmes")} onPress={() => router.push(cibleProgrammes === "/boutique" ? { pathname: "/boutique", params: { genre: "programme" } } : "/programmes")} style={styles.moitie} />
        <BoutonTonal icone="list" libelle={t("accueil.lanceur.routines")} onPress={() => router.push("/routines")} style={styles.moitie} />
      </View>
      {enCours ? null : <BoutonPrincipal libelle={t("accueil.entrainement.ajouterActivite")} onPress={() => ouvrirParcours({ genre: "sport", jour, mode: "demarrer" })} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: espace.s, marginTop: espace.l },
  rangee2: { flexDirection: "row", gap: espace.s },
  moitie: { flex: 1 },
});
