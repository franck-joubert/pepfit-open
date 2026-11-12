import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Champ } from "../../ecrans/briques";
import { montrerBref } from "../../ecrans/bref";
import { Etiquette } from "../../ecrans/circuit/briques";
import { BoutonLigne } from "../../ecrans/Reglage";
import { FOURNISSEURS, garderIdentifiants, identifiantsAProposer, oublierIdentifiants, redirectionValide, type Fournisseur, type Identifiants } from "../../identifiants";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";

const VIDES: Identifiants = { clientId: "", clientSecret: "", redirection: "" };

/**
 * Mes identifiants API (Réglages › Connexions, version libre) : le client ID, le secret et l'URL de retour de sa propre
 * application chez Whoop, Withings ou Polar. Gardés dans le coffre du téléphone. `?f=whoop` ouvre directement un fournisseur
 * (Connecter sans identifiants mène ici).
 */
export default function MesIdentifiants() {
  useLangue();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const p = useLocalSearchParams<{ f?: string }>();
  const [f, setF] = useState<Fournisseur>(FOURNISSEURS.find((x) => x === p.f) ?? "whoop");
  const [ids, setIds] = useState<Identifiants>(VIDES);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let actif = true;
    identifiantsAProposer(f)
      .then((i) => actif && setIds(i))
      .catch(() => actif && setIds(VIDES));
    return () => {
      actif = false;
    };
  }, [f]);

  const changer = (champ: keyof Identifiants) => (v: string) => setIds((avant) => ({ ...avant, [champ]: v }));
  const complets = !!ids.clientId.trim() && !!ids.clientSecret.trim() && redirectionValide(ids.redirection.trim());

  const enregistrer = async () => {
    if (occupe) return;
    if (!complets) return montrerBref(t("identifiants.incomplets"));
    setOccupe(true);
    try {
      if (!(await garderIdentifiants(f, ids))) return montrerBref(t("identifiants.incomplets"));
      montrerBref(t("identifiants.faits"), true);
      if (p.f) router.back();
    } finally {
      setOccupe(false);
    }
  };

  const oublier = async () => {
    await oublierIdentifiants(f);
    setIds(await identifiantsAProposer(f));
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("identifiants.titre")} />
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <Texte variante="note" couleur="t2" style={{ marginBottom: espace.l }}>
          {t("identifiants.intro")}
        </Texte>
        <Segmente options={FOURNISSEURS.map((x) => ({ valeur: x, libelle: t(`reglages.${x}`) }))} valeur={f} onChange={setF} />

        <Etiquette texte={t("identifiants.clientId")} />
        <Champ serre value={ids.clientId} onChangeText={changer("clientId")} accessibilityLabel={t("identifiants.clientId")} placeholder={t("identifiants.clientId")} />

        <Etiquette texte={t("identifiants.clientSecret")} />
        <Champ serre secureTextEntry value={ids.clientSecret} onChangeText={changer("clientSecret")} accessibilityLabel={t("identifiants.clientSecret")} placeholder={t("identifiants.clientSecret")} />

        <Etiquette texte={t("identifiants.redirection")} />
        <Champ serre keyboardType="url" value={ids.redirection} onChangeText={changer("redirection")} accessibilityLabel={t("identifiants.redirection")} placeholder="https://" />
        <Texte variante="note" couleur="t2" style={styles.aide}>
          {t(f === "withings" ? "identifiants.redirectionWithings" : "identifiants.redirectionAide")}
        </Texte>

        <View style={styles.oublier}>
          <BoutonLigne libelle={t("identifiants.oublier")} onPress={() => void oublier().catch(console.warn)} />
        </View>
      </ScrollView>
      <View style={[styles.dock, { paddingBottom: Math.max(bas, espace.s) + espace.l }]}>
        <BoutonPrincipal libelle={t("identifiants.enregistrer")} desactive={occupe} onPress={() => void enregistrer()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenu: { paddingHorizontal: espace.l, paddingTop: espace.s, paddingBottom: espace.l },
  aide: { marginTop: espace.s, marginLeft: espace.xs },
  oublier: { marginTop: espace.xl, alignItems: "flex-start" },
  dock: { paddingHorizontal: espace.l, paddingTop: espace.m },
});
