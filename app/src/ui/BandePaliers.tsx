import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { palierVoisin } from "../db";
import { useBande, type EtatBande } from "../ecrans/bande";
import { nombre } from "../ecrans/format";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { Icone } from "./Icone";
import { Texte } from "./Texte";
import { useLangue } from "../i18n/useLangue";

export function voisinDeBande(b: Pick<EtatBande, "paliers" | "unite" | "valeur">, sens: 1 | -1): number | null {
  if (b.unite === "lbs" && !b.paliers?.length) {
    const v = (b.valeur ?? 0) + sens * 5;
    return v < 0 ? null : v;
  }
  return palierVoisin(b.paliers, b.valeur, sens);
}

/** Bande des paliers posée sur le clavier : − et + sautent au palier voisin, un palier se touche directement (D14). */
export function BandePaliers() {
  const { t } = useLangue();
  const b = useBande();
  const { couleurs } = useTheme();
  const [clavier, setClavier] = useState(0);
  useEffect(() => {
    const ev = Platform.OS === "ios" ? ["keyboardWillShow", "keyboardWillHide"] : ["keyboardDidShow", "keyboardDidHide"];
    const a = Keyboard.addListener(ev[0] as "keyboardDidShow", (e) => setClavier(e.endCoordinates.height));
    const c = Keyboard.addListener(ev[1] as "keyboardDidHide", () => setClavier(0));
    return () => (a.remove(), c.remove());
  }, []);
  if (!b || clavier === 0) return null;

  const moins = voisinDeBande(b, -1);
  const plus = voisinDeBande(b, 1);
  const liste = b.paliers ?? [];
  const fmt = (v: number) => nombre(v, 2);
  const bouton = (sens: 1 | -1, cible: number | null) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sens < 0 ? t("seance.paliers.precedent") : t("seance.paliers.suivant")}
      disabled={cible == null}
      onPress={() => cible != null && b.appliquer(cible)}
      style={({ pressed }) => [styles.pas, { backgroundColor: pressed ? couleurs.s3 : couleurs.s2, opacity: cible == null ? 0.38 : 1 }]}
    >
      {sens < 0 ? (
        <Texte variante="titre" style={{ lineHeight: 22 }}>
          −
        </Texte>
      ) : (
        <Icone nom="plus" couleur={couleurs.t1} taille={20} />
      )}
      <Texte variante="meta" couleur="t2" style={{ fontSize: 11 }}>
        {cible != null ? fmt(cible) : "–"}
      </Texte>
    </Pressable>
  );
  return (
    <View style={[styles.bande, { bottom: clavier, backgroundColor: couleurs.feuilleFond, borderTopColor: couleurs.line2 }]}>
      {bouton(-1, moins)}
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flex: 1 }}>
        {liste.length === 0 ? (
          <Texte variante="meta" couleur="t3">
            {b.unite === "lbs" ? `± ${nombre(5, 0)} lbs` : `± ${nombre(2.5, 1)} kg`}
          </Texte>
        ) : (
          liste.map((p) => {
            const actif = b.valeur === p;
            return (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityLabel={t("seance.paliers.palier", { valeur: fmt(p) })}
                onPress={() => b.appliquer(p)}
                style={[styles.chip, actif ? { backgroundColor: couleurs.t1 } : { backgroundColor: couleurs.s2 }]}
              >
                <Texte variante="saisie" style={{ fontSize: 14, color: actif ? couleurs.bg : couleurs.t1 }}>
                  {fmt(p)}
                </Texte>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      {bouton(1, plus)}
    </View>
  );
}

const styles = StyleSheet.create({
  bande: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: espace.s,
    paddingHorizontal: espace.s,
    paddingVertical: espace.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pas: { minWidth: 56, minHeight: 48, borderRadius: rayon.m, alignItems: "center", justifyContent: "center" },
  chips: { gap: espace.xs, alignItems: "center", paddingHorizontal: espace.xs },
  chip: { minWidth: 56, minHeight: 44, borderRadius: rayon.m, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
});
