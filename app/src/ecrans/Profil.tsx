import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listerPesees, listerPlats, listerSalles, nbProduitsConsommes } from "../db";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { BoutonIcone } from "../ui/Cadre";
import { useVolet } from "../ui/contexte-volet";
import { lireActif, t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { etatWhoop } from "../whoop";
import { etatWithings } from "../withings";
import { useApp } from "./contexte";
import { fixe } from "./composition-vue";
import { nombre, versUnite } from "./format";
import { GroupeReglages, LigneReglage, SectionReglages, SousEtat } from "./Reglage";
import { serviceAReconnecter } from "./reglages/etat";
import { CartePrecision } from "./precision/CartePrecision";
import { usePrecision } from "./precision/usePrecision";

// Volet court (planche menu, B validée le 01/11 ; allégé le 05/11) : il ne parle que de toi et tient sur un écran. Plus de carte
// du profil ni de chiffres (séances, durée, records, série) : tout est sur la page Profil (avatar du menu du bas). En tête la
// ligne de la Précision ; puis le suivi (sans Historique, doublon du profil) ; puis la porte des Réglages (tous les réglages, et
// le seul badge : une connexion à reconnecter). Les onglets affichés vont dans Réglages (D20). Nuit : fond s1 de feuille, groupes s2 ; jour : fond s1, groupes blancs.

const MARGE = espace.l;
type Lu = {
  kg: number | null;
  salles: number;
  aliments: number;
  plats: number;
  /** Service à reconnecter (badge rouge de la porte Réglages, D11), ou null. */
  aReconnecter: "whoop" | "withings" | null;
};

export function ContenuProfil({ visite }: { largeur: number; visite: number; onDansRangee: () => void }) {
  useLangue();
  const { db, reglages } = useApp();
  const { couleurs, mode } = useTheme();
  const { fermer, aller } = useVolet();
  const insets = useSafeAreaInsets();
  const [lu, setLu] = useState<Lu | null>(null);
  const langue = lireActif().langue;
  // Précision pepfit (planche precision, P7) : relue à chaque ouverture du volet, calculée sur le téléphone
  const precision = usePrecision(visite);

  // Relu à chaque ouverture (hors de la pile : pas de useFocusEffect ici).
  useEffect(() => {
    let vivant = true;
    (async () => {
      const [pesees, salles, aliments, whoop, withings] = await Promise.all([
        listerPesees(db), listerSalles(db), nbProduitsConsommes(db),
        etatWhoop(db).catch(() => null),
        etatWithings(db).catch(() => null),
      ]);
      const plats = (await listerPlats(db).catch(() => [])).length;
      if (vivant)
        setLu({
          kg: pesees[0]?.kg ?? null, salles: salles.length, aliments, plats,
          aReconnecter: serviceAReconnecter(whoop, withings),
        });
    })().catch((e) => console.error(e));
    return () => {
      vivant = false;
    };
  }, [db, visite, langue]);

  const fond = mode === "nuit" ? couleurs.feuilleGroupe : couleurs.bg;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + espace.s, paddingBottom: insets.bottom + espace.xxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.tete}>
          <BoutonIcone nom="close" libelle={t("ui.fermer")} onPress={fermer} />
        </View>

        {/* Précision pepfit : la carte sous la carte du profil (planche precision P7), rétablie le 01/11 sur le retours
            (la ligne fine du menu court la rendait trop discrète). */}
        <CartePrecision e={precision} fond={fond} visite={visite} onPress={() => aller("/profil/precision")} />

        <SectionReglages titre={t("menu.suivi")} />
        <GroupeReglages fond={fond}>
          {/* D2 de la revue finale : la seule page du poids est Santé › Poids ; « Mensurations » s'ouvre sur ses tours. Une
              décimale, comme la page (« 78,0 kg »). */}
          <LigneReglage
            hauteur={52}
            icone="regle"
            libelle={t("nutrition.mensurations")}
            valeur={lu?.kg != null ? `${fixe(versUnite(lu.kg, reglages.unite), 1)} ${reglages.unite}` : undefined}
            onPress={() => aller({ pathname: "/sante/poids", params: { section: "tours" } })}
          />
          <LigneReglage hauteur={52} icone="classement" libelle={t("nutrition.mesAliments")} valeur={lu ? nombre(lu.aliments, 0) : undefined} onPress={() => aller("/nutrition/aliments")} />
          {/* Mes plats (planche plats, P11) : sous Mes aliments. */}
          <LigneReglage hauteur={52} icone="cocotte" libelle={t("plats.mesPlats")} valeur={lu ? nombre(lu.plats, 0) : undefined} onPress={() => aller("/nutrition/plats")} />
          <LigneReglage hauteur={52} icone="place" libelle={t("salles.titre")} valeur={lu ? String(lu.salles) : undefined} onPress={() => aller("/gyms")} />
        </GroupeReglages>

        {/* La porte des Réglages : le badge rouge seulement pour une connexion à reconnecter. */}
        <GroupeReglages fond={fond} style={{ marginTop: espace.xxl }}>
          <LigneReglage
            hauteur={52}
            icone="curseurs"
            libelle={t("menu.reglages")}
            sous={
              lu?.aReconnecter ? (
                <SousEtat actif={false} erreur texte={t("menu.aReconnecter", { nom: t(lu.aReconnecter === "whoop" ? "reglages.whoop" : "reglages.withings") })} />
              ) : undefined
            }
            onPress={() => aller("/settings")}
          />
        </GroupeReglages>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  tete: { flexDirection: "row", justifyContent: "flex-end", paddingRight: espace.xs },
});
