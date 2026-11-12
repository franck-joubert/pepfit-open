// Repère en séance (planche sante-suivi, D7) : sous le nom d'un exercice dont un muscle principal ou secondaire du catalogue
// est touché par une blessure active ou réduite, un carré rouge et « Épaule droite · active » (13 px, une ligne, 44 de
// haut) qui ouvre la fiche. Ni alerte, ni conseil, ni remplacement proposé ; rien sur les exercices sans lien.
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { listerBlessures, musclesDesExercices, type BlessureListe } from "../db";
import { minuscule, t } from "../i18n/index";
import { useTheme } from "../theme";
import { useCharge } from "./contexte";
import { libelleStatut, reperesExercice } from "./suivi-calc";
import { Texte } from "../ui/Texte";

/** Blessures en cours et muscles des exercices de la séance, lus une fois par écran. */
export function useReperes(ids: readonly string[]): (exerciceId: string) => BlessureListe[] {
  const cle = [...ids].sort().join("|");
  const [d] = useCharge(async (db) => {
    const blessures = (await listerBlessures(db)).filter((b) => b.statut !== "disparue" && b.zone);
    return { blessures, muscles: blessures.length ? await musclesDesExercices(db, ids) : new Map() };
  }, [cle]);
  return (id) => {
    const m = d?.muscles.get(id);
    return d && m ? reperesExercice(m.muscle, m.secondaires, d.blessures) : [];
  };
}

export function RepereBlessure({ blessures, marge }: { blessures: readonly BlessureListe[]; marge: number }) {
  const { couleurs } = useTheme();
  if (!blessures.length) return null;
  return (
    <View style={{ paddingLeft: marge, marginTop: -6, marginBottom: -4 }}>
      {blessures.map((b) => {
        const statut = minuscule(libelleStatut(b.statut));
        return (
          <Pressable
            key={b.id}
            accessibilityRole="button"
            accessibilityLabel={t("suivi.repereLu", { titre: b.titre, statut })}
            onPress={() => router.push({ pathname: "/blessures/[id]", params: { id: b.id } })}
            style={styles.repere}
          >
            <View style={[styles.carre, { backgroundColor: couleurs.rate }]} />
            <Texte variante="corps" numberOfLines={1} style={{ color: couleurs.rate, flexShrink: 1 }}>
              {b.titre}
              <Texte variante="corps" couleur="t2">{`, ${statut}`}</Texte>
            </Texte>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  repere: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingRight: 8 },
  carre: { width: 8, height: 8, borderRadius: 2 },
});
