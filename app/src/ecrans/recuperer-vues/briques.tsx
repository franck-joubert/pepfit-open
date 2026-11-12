// Briques de « Récupérer » (planche recuperer, validée le 31/10) : la vignette d'une activité (son picto 3D, ou la tuile rose
// avec la lune pour la sieste, D3), les noms, la ligne d'une session (« 14:07 · 19 min dormies · Samsung Health »), la source,
// les kcal du sauna et du bain froid (aux MET, kcal-seance.ts), et les choix à cocher des feuilles.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { Picto } from "../../ui/Picto";
import { Texte } from "../../ui/Texte";
import { useMesure } from "../mesures/gabarit";
import { activite, type TypeRecup } from "../recuperer";

export { kcalRecup, minTexte, minutesDe, nomRecup, sourceRecup, sousLigneRecup, typeRecupTexte } from "./briques-donnees";
import { minTexte, minutesDe, nomRecup, typeRecupTexte } from "./briques-donnees";

/** Vignette d'une activité : le picto 3D sur sa tuile, ou la tuile rose avec la lune (la sieste, D3). `plein` : la tuile rose
 *  pleine et la lune blanche (la sieste conseillée de la feuille). */
export function VignetteRecup({ type, taille = 40, plein = false }: { type: TypeRecup; taille?: number; plein?: boolean }) {
  const m = useMesure();
  const picto = activite(type).picto;
  if (picto) return <Picto slug={picto} taille={taille} />;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: taille, height: taille, borderRadius: Math.round(taille * 0.27), backgroundColor: plein ? m.fort : m.voile, alignItems: "center", justifyContent: "center" }}
    >
      <Icone nom="lune" couleur={plein ? "#ffffff" : m.fort} taille={Math.round(taille * 0.5)} />
    </View>
  );
}

/** Un choix à cocher des feuilles (la durée de la sieste, l'alarme, le rappel) : liseré et fond rose quand il est choisi. */
export function Choix({
  choisi,
  onPress,
  libelle,
  gauche,
  titre,
  etiquette,
  sous,
  radio = true,
  centre = false,
  style,
}: {
  choisi: boolean;
  onPress: () => void;
  libelle: string;
  gauche?: ReactNode;
  titre?: string;
  etiquette?: string;
  sous?: string;
  radio?: boolean;
  centre?: boolean;
  style?: object;
}) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: choisi }}
      accessibilityLabel={libelle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choix,
        centre && styles.centre,
        { backgroundColor: choisi ? m.voile : pressed ? couleurs.s3 : couleurs.feuilleGroupe, borderColor: choisi ? m.fort : couleurs.line, borderWidth: choisi ? 1.5 : StyleSheet.hairlineWidth },
        style,
      ]}
    >
      {gauche}
      {titre ? (
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.ligneTitre}>
            <Texte style={styles.titre}>{titre}</Texte>
            {etiquette ? (
              <View style={[styles.etiquette, { backgroundColor: m.fort }]}>
                <Texte style={styles.etiquetteTexte}>{etiquette}</Texte>
              </View>
            ) : null}
          </View>
          {sous ? (
            <Texte variante="meta" couleur="t2" style={styles.sous}>
              {sous}
            </Texte>
          ) : null}
        </View>
      ) : null}
      {radio ? (
        <View style={[styles.radio, { borderColor: choisi ? m.fort : couleurs.t3 }]}>{choisi ? <View style={[styles.point, { backgroundColor: m.fort }]} /> : null}</View>
      ) : null}
    </Pressable>
  );
}

/** « 20 min », grand chiffre et petite unité (les options de la sieste). */
export function GrandMin({ n, libre }: { n: number | null; libre?: string }) {
  if (n == null) return <Texte style={[styles.min, { width: 64 }]}>{libre}</Texte>;
  return (
    <Texte style={[styles.min, { width: 64 }]}>
      {n}
      <Texte variante="corps" couleur="t2" style={styles.minUnite}>
        {" min"}
      </Texte>
    </Texte>
  );
}

const styles = StyleSheet.create({
  choix: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14 },
  centre: { justifyContent: "center", minHeight: 48, paddingHorizontal: 6, gap: 0, borderRadius: rayon.l },
  titre: { fontFamily: police.medium, fontSize: 15 },
  ligneTitre: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  etiquette: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  etiquetteTexte: { fontFamily: police.semibold, fontSize: 11, color: "#ffffff" },
  sous: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  point: { width: 10, height: 10, borderRadius: 5 },
  min: { fontFamily: police.semibold, fontSize: 20, letterSpacing: -0.2, fontVariant: ["tabular-nums"] },
  minUnite: { fontFamily: police.medium, fontSize: 13 },
});
