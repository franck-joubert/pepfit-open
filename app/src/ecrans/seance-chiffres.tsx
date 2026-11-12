// Les chiffres d'une séance en lecture (durée, distance, volume…) : la rangée entre deux filets et la case « titre, valeur, source ».
// La page d'activité (history/[id]) s'en sert.
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { Texte } from "../ui/Texte";

export function Fait({ titre, valeur, source }: { titre: string; valeur: string; source?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Texte variante="meta" couleur="t2">
          {titre}
        </Texte>
      </View>
      <Texte variante="saisie" style={{ fontSize: 15 }}>
        {valeur}
      </Texte>
      {source ? (
        <Texte variante="meta" couleur="t3">
          {source}
        </Texte>
      ) : null}
    </View>
  );
}

/** La rangée de chiffres, entre deux filets. */
export function RangeeChiffres({ children }: { children: ReactNode }) {
  const { couleurs } = useTheme();
  return <View style={[styles.chiffres, { borderColor: couleurs.line }]}>{children}</View>;
}

const styles = StyleSheet.create({
  chiffres: {
    flexDirection: "row",
    gap: espace.xxl + espace.s,
    marginTop: espace.l,
    paddingHorizontal: espace.l,
    paddingVertical: espace.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
