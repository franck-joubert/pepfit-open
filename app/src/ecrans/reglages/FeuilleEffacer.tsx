import { useState } from "react";
import { Pressable, StyleSheet, TextInput } from "react-native";
import { effacerCeTelephone } from "../../effacer";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../../theme/typo";
import { Attente } from "../../ui/Attente";
import { useCouleurPartie } from "../../ui/ContextePartie";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { FeuilleMessage, type MessageFeuille } from "../../ui/FeuilleMessage";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";

/**
 * « Effacer les données de ce téléphone » (tout en bas de Réglages, seul, planche menu ; avant : Données et confidentialité).
 * Sur le modèle de « Supprimer le compte » (mot à taper, rouge tonal). Réussi, l'appli redémarre sur la bienvenue ; raté, la
 * feuille du message le dit et propose de réessayer (chaque geste de l'effacement est rejouable).
 */
export function FeuilleEffacer({ visible, onFermer, onExporter }: { visible: boolean; onFermer: () => void; onExporter: () => void }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  const motEffacement = t("reglages.motEffacement");
  const [saisie, setSaisie] = useState("");
  const [efface, setEfface] = useState(false);
  // Whoop n'a pas répondu à la révocation : une ligne dans la feuille, le temps de la lire, puis l'effacement continue.
  const [whoopRate, setWhoopRate] = useState(false);
  const [rate, setRate] = useState<MessageFeuille | null>(null);
  const [vu, setVu] = useState(visible);
  // chaque ouverture repart d'un champ vide
  if (visible !== vu) {
    setVu(visible);
    if (visible) {
      setSaisie("");
      setWhoopRate(false);
    }
  }

  const effacer = async () => {
    setEfface(true);
    try {
      await effacerCeTelephone(db, async () => {
        setWhoopRate(true);
        await new Promise((r) => setTimeout(r, 3000));
      });
    } catch (err) {
      console.error(err);
      onFermer();
      setRate({ titre: t("reglages.effacerRate"), texte: t("reglages.effacerRateTexte"), action: { libelle: t("reglages.reessayer"), onPress: () => void effacer() } });
    } finally {
      setEfface(false);
    }
  };
  const motTape = saisie.trim() === motEffacement;

  return (
    <>
      <Feuille visible={visible} onFermer={() => !efface && onFermer()} titre={t("reglages.effacerTitre")}>
        <Texte variante="corps" couleur="t2" style={styles.texte}>
          {t("reglages.effacerPart")}
        </Texte>
        <Texte variante="corps" couleur="t2" style={styles.texte}>
          {t("reglages.effacerReste")}
        </Texte>
        <Groupe>
          <Option premier icone="export" libelle={t("compte.exporter")} chevron onPress={onExporter} />
        </Groupe>
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={saisie}
          onChangeText={setSaisie}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!efface}
          placeholder={t("compte.tape", { mot: motEffacement })}
          placeholderTextColor={couleurs.t3}
          cursorColor={accent}
          accessibilityLabel={t("compte.tapeConfirmer", { mot: motEffacement })}
          style={[typo.saisie, styles.champ, { fontFamily: police.regular, color: couleurs.t1, backgroundColor: couleurs.feuilleGroupe }]}
        />
        {whoopRate ? (
          <Texte variante="libelle" couleur="t2" style={{ marginTop: espace.m }}>
            {t("reglages.effacerWhoopInjoignable")}
          </Texte>
        ) : null}
        {/* Rouge tonal (D3), comme « Supprimer le compte » : jamais un second bouton plein. Champ et bouton sur la couleur des
            groupes de la feuille, de jour comme de nuit (sur le fond, ils disparaissaient de jour). */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !motTape || efface, busy: efface }}
          disabled={!motTape || efface}
          onPress={() => void effacer()}
          style={({ pressed }) => [styles.danger, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe, opacity: motTape ? 1 : 0.38 }]}
        >
          {efface ? (
            <Attente />
          ) : (
            <Texte variante="exercice" style={{ color: couleurs.rate }}>
              {t("reglages.effacer")}
            </Texte>
          )}
        </Pressable>
      </Feuille>
      <FeuilleMessage message={rate} onFermer={() => setRate(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  texte: { fontSize: 14, marginBottom: espace.m },
  champ: { minHeight: 52, borderRadius: rayon.l, paddingHorizontal: espace.l, marginTop: espace.l },
  danger: { minHeight: 52, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", marginTop: espace.l },
});
