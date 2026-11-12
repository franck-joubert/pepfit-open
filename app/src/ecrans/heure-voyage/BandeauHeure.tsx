// Bandeau de la page Sommeil (planche sommeil, c1 et c5) : sous « Aujourd'hui », au-dessus de la nuit. Tuile, titre en
// gras, une phrase, chevron ; tout le bandeau ouvre le plan.
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { lireActif, lireDetecte, t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { useCharge } from "../contexte";
import { MARGE, useMesure } from "../mesures/gabarit";
import type { NuitStat } from "../mesures/sommeil-stats";
import { bandeauDuJour } from "./bandeau";
import { rythmeHabituel } from "./changement-heure";
import { lireReglagesHeure } from "./donnees";

/** Tuile d'icône des lignes (40, rayon 11, voile de l'accent ; planche : .tuile-ic). */
export function TuileIcone({ nom, taille = 40 }: { nom: NomIcone; taille?: number }) {
  const m = useMesure();
  return (
    <View style={[styles.tuile, { width: taille, height: taille, backgroundColor: m.voile }]}>
      <Icone nom={nom} couleur={m.fort} taille={20} />
    </View>
  );
}

/** Le bandeau du jour, ou rien. `nuits` : les nuits lues par la page (rythme habituel). */
export function BandeauHeure({ maintenant, nuits }: { maintenant: number; nuits: Iterable<NuitStat> | null }) {
  const { couleurs } = useTheme();
  const [r] = useCharge((db) => lireReglagesHeure(db), [], undefined, "sommeil/heure-voyage");
  if (!r || !nuits) return null;
  const b = bandeauDuJour({ maintenant, fuseau: lireActif().fuseau, appareil: lireDetecte().fuseau, rythme: rythmeHabituel([...nuits]), voyage: r.voyage });
  if (!b) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("heureVoyage.voirPlan", { titre: b.titre })}
      onPress={() => router.push(b.route)}
      style={({ pressed }) => [styles.bandeau, { backgroundColor: pressed ? couleurs.s3 : couleurs.s1, borderColor: couleurs.line2 }]}
    >
      <TuileIcone nom={b.genre === "voyage" || b.genre === "arrivee" ? "avion" : "horloge"} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte style={styles.titre}>{b.titre}</Texte>
        <Texte variante="meta" couleur="t2" style={styles.sous}>
          {b.sous}
        </Texte>
      </View>
      <Icone nom="right" couleur={couleurs.t3} taille={16} epaisseur={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tuile: { borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bandeau: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    marginHorizontal: MARGE,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 10,
    minHeight: 64,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titre: { fontFamily: police.semibold, fontSize: 15, lineHeight: 20 },
  sous: { fontSize: 12.5, lineHeight: 17.5, marginTop: 2, fontVariant: ["tabular-nums"] },
});
