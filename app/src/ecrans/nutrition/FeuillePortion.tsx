import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import type { Portion } from "../../nutrition/calculs";
import { champsDepuisPortions, portionsApresSaisie, recalculerPortions, type ChampsPortion } from "../../nutrition/quantite";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { lireNombre, saisieDecimale } from "../format";
import { SaisieNutrition } from "./commun";

// « Modifier la fiche » : le poids du paquet, le nombre de portions du paquet et le poids d'une portion. Les deux derniers se
// calculent l'un l'autre depuis le poids du paquet. Écrit sur la fiche locale seulement (jamais renvoyé à Open Food Facts).

type Cle = keyof ChampsPortion;
const texteDe = (v: number | null) => (v == null ? "" : String(v));

export function FeuillePortion({ visible, portions, ml, onFermer, onEnregistrer }: { visible: boolean; portions: readonly Portion[]; ml: boolean; onFermer: () => void; onEnregistrer: (p: Portion[]) => void }) {
  const { couleurs } = useTheme();
  const [champs, setChamps] = useState<ChampsPortion>({ paquetG: null, portionG: null, nbPortions: null });
  const [saisie, setSaisie] = useState<Record<Cle, string>>({ paquetG: "", portionG: "", nbPortions: "" });
  /** Dernier des deux champs liés modifié : celui que le changement du poids du paquet garde. */
  const pilote = useRef<"portionG" | "nbPortions">("portionG");
  useEffect(() => {
    if (!visible) return;
    const c = champsDepuisPortions(portions);
    setChamps(c);
    setSaisie({ paquetG: texteDe(c.paquetG), portionG: texteDe(c.portionG), nbPortions: texteDe(c.nbPortions) });
    pilote.current = "portionG";
  }, [visible, portions]);

  const changer = (cle: Cle, texte: string) => {
    const propre = saisieDecimale(texte);
    if (cle !== "paquetG") pilote.current = cle;
    const c = recalculerPortions(champs, cle, lireNombre(propre), pilote.current);
    setChamps(c);
    // Le champ tapé garde ce qu'on y écrit (« 12. »), les autres suivent le calcul.
    setSaisie({ paquetG: texteDe(c.paquetG), portionG: texteDe(c.portionG), nbPortions: texteDe(c.nbPortions), [cle]: propre });
  };
  const unite = ml ? t("nutrition.ml") : t("nutrition.g");
  const ligne = (cle: Cle, libelle: string, u?: string) => (
    <View key={cle} style={[styles.ligne, { borderBottomColor: couleurs.line }]}>
      <Texte variante="corps" style={{ flex: 1, fontSize: 15 }}>
        {libelle}
      </Texte>
      <SaisieNutrition
        cadre={[styles.val, { backgroundColor: couleurs.feuilleGroupe }]}
        value={saisie[cle]}
        onChangeText={(x) => changer(cle, x)}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="—"
        accessibilityLabel={libelle}
        style={[styles.valSaisie, { color: couleurs.t1 }]}
      />
      <Texte variante="corps" couleur="t3" style={styles.unite}>
        {u ?? ""}
      </Texte>
    </View>
  );
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("nutrition.modifierFiche")}
      pied={<BoutonPrincipal libelle={t("ui.enregistrer")} onPress={() => onEnregistrer(portionsApresSaisie(portions, champs))} />}
    >
      {ligne("paquetG", t("nutrition.poidsPaquet"), unite)}
      {ligne("nbPortions", t("nutrition.portionsParPaquet"))}
      {ligne("portionG", t("nutrition.poidsPortion"), unite)}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  val: { width: 96, height: 44, borderRadius: rayon.l },
  valSaisie: { flex: 1, textAlign: "right", paddingHorizontal: espace.m, paddingVertical: 0, fontFamily: police.medium, fontSize: 16 },
  unite: { width: 30 },
});
