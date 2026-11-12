import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../../ecrans/contexte";
import { GroupeReglages, LigneReglage } from "../../ecrans/Reglage";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { deverrouiller, estProtege } from "../../natif/deverrouillage";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BarreHaut } from "../../ui/Cadre";
import { Interrupteur } from "../../ui/Interrupteur";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { DELAIS_VERROU, type DelaiVerrou } from "../../verrou/regle";

/**
 * Verrouillage (Réglages › Préférences ; planche compte-connexion, 3b et 3c ; D5, D6) : le verrou du téléphone, sans mot de
 * passe pepfit. L'allumer demande une première empreinte (on ne verrouille pas sans savoir déverrouiller) ; téléphone sans
 * verrou d'écran : l'interrupteur est grisé, la raison est écrite, et un bouton ouvre les réglages du téléphone ; au retour,
 * la page relit l'état.
 */
export default function Verrouillage() {
  useLangue();
  const { reglages, regler } = useApp();
  const { couleurs } = useTheme();
  const [protege, setProtege] = useState<boolean | null>(() => estProtege());
  const [message, setMessage] = useState<string | null>(null);
  useFocusEffect(useCallback(() => setProtege(estProtege()), []));
  useEffect(() => {
    const ecoute = AppState.addEventListener("change", (a) => a === "active" && setProtege(estProtege()));
    return () => ecoute.remove();
  }, []);
  const sansVerrou = protege === false;
  const actif = reglages.verrou && !sansVerrou;

  const basculer = async (v: boolean) => {
    setMessage(null);
    if (!v) return regler({ verrou: false });
    const issue = await deverrouiller(t("verrou.fenetreTitre"), t("verrou.moyens"));
    if (issue === "ok") regler({ verrou: true });
    else if (issue === "sansVerrou") setProtege(false);
    else if (issue === "indisponible") setMessage(t("verrou.indisponible"));
  };
  // iPhone : pas d'accès direct à « Face ID et code », les réglages de pepfit (Linking.sendIntent n'existe que sur Android)
  const ouvrirReglages = () =>
    (Platform.OS === "android" ? Linking.sendIntent("android.settings.SECURITY_SETTINGS") : Linking.openSettings()).catch(() => Linking.openSettings());

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("verrou.titre")} />
      <ScrollView contentContainerStyle={{ paddingTop: espace.s, paddingBottom: espace.xxl * 2 }}>
        <GroupeReglages>
          <LigneReglage
            icone="cadenas"
            libelle={t("verrou.verrouiller")}
            sous={t(sansVerrou ? "verrou.sansVerrou" : "verrou.moyens")}
            onPress={sansVerrou ? undefined : () => void basculer(!actif)}
          >
            <Interrupteur valeur={actif} onChange={(v) => void basculer(v)} libelle={t("verrou.verrouiller")} desactive={sansVerrou} />
          </LigneReglage>
          {actif ? <Delai valeur={reglages.verrouDelaiS} onChange={(d) => regler({ verrouDelaiS: d })} /> : null}
        </GroupeReglages>
        {message ? (
          <Texte variante="corps" couleur="t2" style={styles.note}>
            {message}
          </Texte>
        ) : null}
        {sansVerrou ? (
          <>
            <Texte variante="corps" couleur="t3" style={styles.note}>
              {t("verrou.sansVerrouAide")}
            </Texte>
            <BoutonTonal libelle={t("verrou.ouvrirReglages")} onPress={ouvrirReglages} style={styles.bouton} />
          </>
        ) : (
          <Texte variante="corps" couleur="t3" style={styles.note}>
            {/* l'aperçu n'est masqué qu'à partir d'Android 13 (setRecentsScreenshotEnabled) : on ne promet rien de plus ; l'iPhone le masque toujours */}
            {t(Platform.OS === "ios" || Number(Platform.Version) >= 33 ? "verrou.explication" : "verrou.explicationApercu")}
          </Texte>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** « Se reverrouille après » : Aussitôt, 1, 5 ou 15 min (D6), sous l'interrupteur, dans le même groupe. */
function Delai({ valeur, onChange, premier }: { valeur: DelaiVerrou; onChange: (d: DelaiVerrou) => void; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.delai, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }]}>
      <Texte variante="saisie" style={styles.libelle}>
        {t("verrou.reverrouille")}
      </Texte>
      <Segmente
        options={DELAIS_VERROU.map((d) => ({ valeur: String(d), libelle: d === 0 ? t("verrou.aussitot") : t("verrou.min", { min: d / 60 }) }))}
        valeur={String(valeur)}
        onChange={(v) => onChange(Number(v) as DelaiVerrou)}
      />
      <Texte variante="corps" couleur="t3" style={{ marginTop: espace.m }}>
        {t("verrou.delaiNote")}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  delai: { paddingTop: espace.m + 2, paddingBottom: espace.l, paddingHorizontal: espace.l },
  libelle: { fontFamily: "Inter-Regular", fontSize: 15, marginBottom: espace.m },
  note: { paddingHorizontal: espace.xxl + espace.s, paddingTop: espace.m, lineHeight: 18 },
  bouton: { marginHorizontal: espace.l, marginTop: espace.xl },
});
