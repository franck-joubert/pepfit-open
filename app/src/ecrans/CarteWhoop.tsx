// Carte Whoop de la page Santé : SpO₂ et température de la peau du dernier jour noté, et la dette de
// sommeil. Une valeur absente n'a pas de colonne (rien d'inventé). Même verre que le bilan d'énergie.
import { StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { Texte } from "../ui/Texte";
import type { JourWhoopLu } from "../whoop/lecture";
import { dureeSommeil } from "./sante-vue";
import { libelleJour } from "./FeuilleEnergie";
import { nombre } from "./format";

interface Colonne {
  cle: string;
  libelle: string;
  valeur: string;
  unite: string | null;
}

export function colonnesWhoop(j: JourWhoopLu): Colonne[] {
  const c: Colonne[] = [];
  // Les scores de Whoop ne sont jamais montrés (31/10) : l'effort et la récupération sont ceux de pepfit.
  if (j.spo2 != null) c.push({ cle: "spo2", libelle: t("sante.whoopSpo2"), valeur: nombre(j.spo2, 0), unite: "%" });
  if (j.temp_peau != null) c.push({ cle: "temp", libelle: t("sante.whoopTemp"), valeur: nombre(j.temp_peau, 1), unite: "°C" });
  return c;
}

export function CarteWhoop({ j }: { j: JourWhoopLu }) {
  const { couleurs } = useTheme();
  const cols = colonnes(j);
  if (!cols.length) return null;
  return (
    <View style={[styles.carte, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }]} accessibilityLabel={t("sante.whoop")}>
      <View style={styles.tete}>
        <Texte variante="exercice" style={{ lineHeight: 20 }}>
          {t("sante.whoop")}
        </Texte>
        <Texte variante="meta" couleur="t3">
          {libelleJour(j.jour)}
        </Texte>
      </View>
      <View style={styles.ligne}>
        {cols.map((k) => (
          <View key={k.cle} style={styles.col}>
            <Texte variante="meta" couleur="t2" numberOfLines={1}>
              {k.libelle}
            </Texte>
            <Texte variante="titre" numberOfLines={1} style={{ color: couleurs.t1, lineHeight: 26 }}>
              {k.valeur}
              {k.unite ? <Texte variante="meta" couleur="t2">{` ${k.unite}`}</Texte> : null}
            </Texte>
          </View>
        ))}
      </View>
      {j.sommeil_dette_min ? (
        <Texte variante="meta" couleur="t2" style={{ marginTop: espace.m }}>
          {t("sante.whoopDette", { duree: dureeSommeil(j.sommeil_dette_min) })}
        </Texte>
      ) : null}
    </View>
  );
}

const colonnes = colonnesWhoop;

const styles = StyleSheet.create({
  carte: { marginHorizontal: espace.l, marginTop: espace.m, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingHorizontal: espace.l, paddingBottom: espace.l },
  tete: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  ligne: { flexDirection: "row", gap: espace.m, marginTop: 14 },
  col: { flex: 1, minWidth: 0 },
});
