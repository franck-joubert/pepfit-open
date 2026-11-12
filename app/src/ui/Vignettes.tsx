import { StyleSheet, View } from "react-native";
import { espace } from "../theme/typo";
import { Picto } from "./Picto";
import { clePicto } from "./pictos";
import { useLiens } from "./useLiens";
import { Texte } from "./Texte";
import { useLangue } from "../i18n/useLangue";
import { tp } from "../i18n/index";

const MAX = 5;

/** Jusqu'à 5 exercices faisables, un picto chacun (deux exercices au même picto n'en font qu'un), puis « +n » pour le reste. */
export function Vignettes({ exercices, taille = 28 }: { exercices: readonly { slug: string | null; nom: string }[]; taille?: number }) {
  useLangue();
  useLiens();
  const vus = new Set<string>();
  const choisis: { slug: string | null; nom: string }[] = [];
  for (const e of exercices) {
    const cle = clePicto(e.slug, e.nom);
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    choisis.push(e);
    if (choisis.length === MAX) break;
  }
  const reste = exercices.length - choisis.length;
  if (exercices.length === 0) return null;
  return (
    <View style={styles.ligne} accessibilityLabel={tp("ui.exercices", exercices.length)}>
      {choisis.map((e) => (
        <Picto key={e.slug ?? e.nom} slug={e.slug} nom={e.nom} taille={taille} />
      ))}
      {reste > 0 ? (
        <Texte variante="meta" couleur="t2" style={{ fontVariant: ["tabular-nums"] }}>
          +{reste}
        </Texte>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: "row", alignItems: "center", gap: espace.xs },
});
