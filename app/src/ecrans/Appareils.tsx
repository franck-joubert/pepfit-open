import { Image, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { CONNEXION_DIRECTE, ICONE_CAPACITE, MARQUES, hotes, plateformeDeLaVue, type CapaciteId, type Hote, type MarqueId } from "../appareils/appareils-donnees";
import { IMAGE_APPLE_SANTE, IMAGE_SANTE_CONNECT } from "../appareils/images-hotes";
import { logoPolar, logoWhoop, logoWithings, ratioLogoPolar, ratioLogoWhoop, ratioLogoWithings } from "../appareils/logos-marques";
import { useTheme } from "../theme";
import { BoutonIcone } from "../ui/Cadre";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { revenir } from "../ui/revenir";
import type { Jetons } from "../theme/jetons";

// Page Appareils recommandés, codée sur la planche appareils-recommandes-v5 (validée le 05/11) : mesures en px de la planche
// (390 de large, marges de 24). Les couleurs sont celles de l'appli (jetons nuit/jour), la teinte des pastilles celle de la partie Santé.
// Les listes sont dans appareils/appareils-donnees.ts ; les textes dans i18n/dico-*/appareils-reco.ts.

const LOGOS: Record<"whoop" | "withings" | "polar", { xml: string; ratio: number }> = {
  whoop: { xml: logoWhoop, ratio: ratioLogoWhoop },
  withings: { xml: logoWithings, ratio: ratioLogoWithings },
  polar: { xml: logoPolar, ratio: ratioLogoPolar },
};
const IMAGES_HOTE: Record<Hote, { uri: string }> = { santeConnect: { uri: IMAGE_SANTE_CONNECT }, appleSante: { uri: IMAGE_APPLE_SANTE } };
const NOM_HOTE: Record<Hote, "appareilsReco.santeConnect" | "appareilsReco.appleSante"> = { santeConnect: "appareilsReco.santeConnect", appleSante: "appareilsReco.appleSante" };
const PLATEFORME_HOTE: Record<Hote, "appareilsReco.android" | "appareilsReco.iphone"> = { santeConnect: "appareilsReco.android", appleSante: "appareilsReco.iphone" };

export default function Appareils() {
  useLangue();
  const { couleurs } = useTheme();
  const vue = useLocalSearchParams<{ vue?: string }>().vue;
  const { principal, autre } = hotes(plateformeDeLaVue(vue, Platform.OS));
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <ScrollView contentContainerStyle={styles.ecran}>
        <View style={styles.retour}>
          <BoutonIcone nom="left" libelle={t("ui.retour")} onPress={revenir} couleur={couleurs.t1} />
        </View>
        <Texte accessibilityRole="header" style={[styles.h1, { color: couleurs.t1 }]}>
          {t("appareilsReco.titre")}
        </Texte>
        <Texte couleur="t2" style={styles.intro}>
          {t("appareilsReco.intro")}
        </Texte>

        <Titre texte={t("appareilsReco.viaTelephone")} />
        <View style={[styles.carte, { borderTopColor: couleurs.line }]}>
          <HotePrincipal hote={principal} />
          <Icones marque="telephone" />
          <Texte couleur="t2" style={styles.compat}>
            {t("appareilsReco.compat")}
          </Texte>
          <HoteAutre hote={autre} />
        </View>

        <Titre texte={t("appareilsReco.connexionDirecte")} style={{ marginTop: 36 }} />
        <Texte couleur="t2" style={styles.interet}>
          {t("appareilsReco.interet")}
        </Texte>
        {CONNEXION_DIRECTE.map((m) => (
          <CarteMarque key={m} marque={m} />
        ))}

        <Titre texte={t("appareilsReco.enSeance")} style={{ marginTop: 36 }} />
        <View style={[styles.carte, { borderTopColor: couleurs.line }]}>
          <View style={styles.tete}>
            <Texte style={[styles.nomSeul, { color: couleurs.t1 }]}>{t("appareilsReco.ceinture")}</Texte>
          </View>
          <Icones marque="ceinture" />
        </View>
        <Texte couleur="t3" style={[styles.pied, { borderTopColor: couleurs.line }]}>
          {t("appareilsReco.pied")}
        </Texte>
      </ScrollView>
    </SafeAreaView>
  );
}

function Titre({ texte, style }: { texte: string; style?: object }) {
  return (
    <Texte variante="entete" couleur="t3" accessibilityRole="header" style={[styles.h2, style]}>
      {texte}
    </Texte>
  );
}

/** Hôte du téléphone en grand : icône de 60, nom de 21, étiquette de la plateforme. */
function HotePrincipal({ hote }: { hote: Hote }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.hotePrincipal}>
      <View style={styles.imgPrincipal}>
        <Image source={IMAGES_HOTE[hote]} accessible={false} style={{ width: 48, height: 48 }} resizeMode="contain" />
      </View>
      <View>
        <Texte style={[styles.nomPrincipal, { color: couleurs.t1 }]}>{t(NOM_HOTE[hote])}</Texte>
        <Texte couleur="t2" style={styles.sur}>
          {t(PLATEFORME_HOTE[hote])}
        </Texte>
      </View>
    </View>
  );
}

/** L'autre hôte, une ligne sous « Compatible avec » : « Fonctionne également avec [icône] Apple Santé (iPhone). » */
function HoteAutre({ hote }: { hote: Hote }) {
  const { couleurs } = useTheme();
  const plateforme = t(PLATEFORME_HOTE[hote]);
  return (
    <View style={styles.hoteAutre}>
      <Texte couleur="t2" style={styles.autreTexte}>
        {t("appareilsReco.autreAvant")}
      </Texte>
      <View style={styles.imgAutre}>
        <Image source={IMAGES_HOTE[hote]} accessible={false} style={{ width: 16, height: 16 }} resizeMode="contain" />
      </View>
      <Texte couleur="t2" style={styles.autreTexte}>
        <Texte style={[styles.autreTexte, { color: couleurs.t1, fontFamily: "Inter-SemiBold" }]}>{t(NOM_HOTE[hote])}</Texte>
        {" "}
        {t("appareilsReco.autreApres", { plateforme })}
      </Texte>
    </View>
  );
}

function CarteMarque({ marque }: { marque: MarqueId }) {
  const { couleurs } = useTheme();
  const m = MARQUES[marque];
  const logo = LOGOS[marque as keyof typeof LOGOS];
  const couleurLogo = m.bientot ? couleurs.t2 : couleurs.t1;
  return (
    <View style={[styles.carte, { borderTopColor: couleurs.line }]}>
      <View style={styles.tete}>
        <SvgXml xml={logo.xml} width={15 * logo.ratio} height={15} color={couleurLogo} accessibilityLabel={marque === "whoop" ? "Whoop" : marque === "withings" ? "Withings" : "Polar"} />
        {m.bientot ? (
          <Texte couleur="t3" style={styles.etiq}>
            {t("appareilsReco.bientot")}
          </Texte>
        ) : null}
      </View>
      <Icones marque={marque} />
    </View>
  );
}

/** Rangée d'icônes de données d'une marque : pastille de 40 (pleine, ou en pointillé si « bientôt »), libellé de 11. */
function Icones({ marque }: { marque: MarqueId }) {
  const { couleurs } = useTheme();
  const m = MARQUES[marque];
  return (
    <View style={styles.icones}>
      {m.capacites.map((c) => {
        const bientot = c.etat === "bientot";
        const libelle = t(`appareilsReco.cap.${c.id}` as CleCapacite);
        const suffixe = c.etat === "essai" ? t("appareilsReco.essai") : null;
        // « bientôt » sous le libellé, sauf dans une carte déjà entièrement « bientôt »
        const dessous = bientot && !m.bientot ? t("appareilsReco.bientot") : null;
        return (
            <View key={c.id} accessible accessibilityLabel={[libelle, suffixe ?? dessous].filter(Boolean).join(", ")} style={styles.ic}>
              <View
                style={[
                  styles.pastille,
                  bientot
                    ? { borderWidth: 1, borderStyle: "dashed", borderColor: couleurs.line }
                    : { backgroundColor: fondPastille(couleurs) },
                ]}
              >
                <Icone nom={ICONE_CAPACITE[c.id]} couleur={bientot ? couleurs.t3 : couleurs.partieSante} taille={20} epaisseur={1.7} />
              </View>
              <Texte style={[styles.lab, { color: bientot ? couleurs.t3 : couleurs.t2 }]}>
                {libelle}
                {suffixe ? <Texte style={{ fontSize: 11, color: couleurs.t3 }}>{` ${suffixe}`}</Texte> : null}
              </Texte>
              {dessous ? <Texte style={[styles.dessous, { color: couleurs.t3 }]}>{dessous}</Texte> : null}
            </View>
        );
      })}
    </View>
  );
}

type CleCapacite = `appareilsReco.cap.${CapaciteId}`;

/** Fond de la pastille : la teinte Santé à 14 % la nuit, 10 % le jour (planche : --accfond). */
export const fondPastille = (c: Jetons): string => hexAlpha(c.partieSante, c.bg === "#000000" ? 0.14 : 0.1);

export function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const styles = StyleSheet.create({
  ecran: { paddingHorizontal: 24, paddingBottom: 48 },
  retour: { marginLeft: -12, width: 44, height: 44 },
  h1: { fontFamily: "Inter-SemiBold", fontSize: 22, lineHeight: 31, letterSpacing: -0.22, marginTop: 4, marginBottom: 6 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 36 },
  h2: { letterSpacing: 0.88, lineHeight: 15, marginBottom: 4 },
  interet: { fontSize: 12, lineHeight: 18.6, marginTop: 2, marginBottom: 14 },
  carte: { paddingVertical: 22, borderTopWidth: 1 },
  tete: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28, marginBottom: 16 },
  etiq: { fontSize: 11, letterSpacing: 0.22 },
  nomSeul: { fontFamily: "Inter-SemiBold", fontSize: 15, lineHeight: 18 },
  icones: { flexDirection: "row", flexWrap: "wrap", columnGap: 4, rowGap: 14, marginLeft: -6 },
  ic: { width: 52, alignItems: "center", gap: 6 },
  pastille: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  // libellé sur une ligne, centré sous la pastille et libre de dépasser les 52 de la colonne (white-space: nowrap de la planche)
  lab: { fontSize: 11, lineHeight: 13.75, textAlign: "center", width: 92, marginHorizontal: -20 },
  dessous: { fontSize: 11, lineHeight: 13.5, textAlign: "center", marginTop: -6, width: 92, marginHorizontal: -20 },
  compat: { fontSize: 12, lineHeight: 18.6, marginTop: 20 },
  pied: { fontSize: 12, lineHeight: 17, borderTopWidth: 1, paddingTop: 18, marginTop: 8 },
  hotePrincipal: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 24 },
  imgPrincipal: { width: 60, height: 60, borderRadius: 15, backgroundColor: "#fff", padding: 6 },
  nomPrincipal: { fontFamily: "Inter-SemiBold", fontSize: 21, lineHeight: 25, letterSpacing: -0.21 },
  sur: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  hoteAutre: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  autreTexte: { fontSize: 12, lineHeight: 17 },
  imgAutre: { width: 20, height: 20, borderRadius: 6, backgroundColor: "#fff", padding: 2 },
});
