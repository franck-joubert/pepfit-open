// Rappel de l'objectif de dépense sur la page Énergie (31/10 : la référence « / 2 738 kcal » quitte la jauge de Sport,
// elle se lit ici). Même langage que la page Pas : l'anneau fin face à l'objectif, et une feuille « Objectif de dépense »
// ouverte par l'icône cible de l'en-tête ou en touchant le bloc. L'objectif est ta journée d'habitude (la dépense moyenne des
// 30 jours d'avant, lireDepenseHabitude) : calculé, il ne se règle pas ; la feuille dit ce qu'il est et quand l'anneau de
// Sport passe au vert.
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { Feuille } from "../../ui/Feuille";
import { Texte } from "../../ui/Texte";
import { approx, nombre } from "../format";
import { DEPENSE, objectifDepense } from "../jauges-sport";
import { Anneau, Groupe, LigneMesure, Lignes, MARGE, useMesure } from "./gabarit";

const pc = (v: number) => nombre(v * 100, 0);

/** Bloc sous le solde : la dépense du jour, « / 2 738 kcal », sa part et l'anneau. */
export function BlocObjectifDepense({ kcal, estime, habitude, onPress }: { kcal: number; estime: boolean; habitude: number | null; onPress: () => void }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const o = objectifDepense(kcal, habitude);
  const valeur = approx(nombre(kcal, 0), estime);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        o && habitude != null
          ? t("energie.libelleObjectifDepense", { kcal: valeur, p: o.p, ref: nombre(habitude, 0) })
          : `${t("energie.depenseDuJour")} ${valeur} ${t("sante.kcal")}, ${t("energie.sansHabitude")}`
      }
      style={({ pressed }) => [styles.bloc, { backgroundColor: pressed ? couleurs.s3 : m.groupe }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="meta" couleur="t2">
          {t("energie.depenseDuJour")}
        </Texte>
        <Texte numberOfLines={1} style={styles.valeur}>
          {valeur}
          <Texte variante="corps" couleur="t2">
            {habitude != null ? ` ${t("sportStats.surKcal", { ref: nombre(habitude, 0) })}` : ` ${t("sante.kcal")}`}
          </Texte>
        </Texte>
        <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
          {o ? t("energie.partHabitude", { p: o.p }) : t("energie.sansHabitude")}
        </Texte>
      </View>
      <Anneau part={o?.part ?? 0} taille={64} />
    </Pressable>
  );
}

/** Feuille « Objectif de dépense » : la journée d'habitude, ce qu'elle est, ce jour face à elle, les repères de couleur. */
export function FeuilleObjectifDepense({
  visible,
  onFermer,
  habitude,
  kcal,
  estime,
}: {
  visible: boolean;
  onFermer: () => void;
  habitude: number | null;
  kcal: number | null;
  estime: boolean;
}) {
  const { couleurs } = useTheme();
  const o = objectifDepense(kcal, habitude);
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("energie.objectifDepense")}>
      <View style={styles.chiffre} accessible accessibilityLabel={habitude != null ? `${nombre(habitude, 0)} ${t("energie.kcalParJour")}` : t("energie.sansHabitude")}>
        <Texte style={[styles.grand, { color: habitude != null ? couleurs.t1 : couleurs.t2 }]}>{habitude != null ? nombre(habitude, 0) : "—"}</Texte>
        <Texte variante="corps" couleur="t2">
          {t("energie.kcalParJour")}
        </Texte>
      </View>
      <Texte variante="corps" couleur="t2" style={styles.aide}>
        {t("energie.habitudeAide")}
        {habitude == null ? ` ${t("energie.habitudeAttente")}` : ""}
      </Texte>
      <Groupe style={{ marginHorizontal: 0 }}>
        <Lignes>
          {[
            kcal != null ? (
              <LigneMesure key="jour" titre={t("energie.ceJour")} valeur={approx(nombre(kcal, 0), estime)} unite={t("sante.kcal")} sousValeur={o ? `${o.p} %` : undefined} />
            ) : null,
            <LigneMesure key="vert" titre={t("energie.repereVert")} sous={t("energie.repereVertAide", { ok: pc(DEPENSE.ok), trop: pc(DEPENSE.trop) })} />,
            <LigneMesure key="rouge" titre={t("energie.repereRouge")} sous={t("energie.repereRougeAide", { trop: pc(DEPENSE.trop) })} />,
          ]}
        </Lignes>
      </Groupe>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  bloc: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, marginHorizontal: MARGE, borderRadius: rayon.l, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
  valeur: { fontFamily: police.light, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, fontVariant: ["tabular-nums"], marginTop: 2 },
  chiffre: { alignItems: "center", marginTop: 4 },
  grand: { fontFamily: police.light, fontSize: 44, lineHeight: 52, letterSpacing: -0.9, fontVariant: ["tabular-nums"] },
  aide: { marginTop: 14, marginBottom: 6, lineHeight: 21 },
});
