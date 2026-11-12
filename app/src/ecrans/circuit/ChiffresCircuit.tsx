import { StyleSheet, View } from "react-native";
import { dureeEstimeeMin } from "../../circuits/duree";
import { segmentsDuree } from "../../circuits/page";
import type { ActiviteCircuit, Circuit } from "../../circuits/types";
import { t } from "../../i18n/index";
import { espace, police } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { nombre } from "../format";
import { altitudeEnUnite, distanceEnUnite, libelleAltitude, libelleDistance } from "../unites";

// Les trois chiffres d'un circuit (planche Circuits, page ; ceux de la planche Suivi GPS) : distance, dénivelé, durée, le chiffre en
// 26 et son unité en 14 à côté, le libellé dessous. La durée suit l'activité du Segmenté (elle n'est pas la même à pied et en courant).
// Un dénivelé inconnu se dit (« Indisponible ») au lieu d'un zéro qui mentirait.

function Chiffre({ morceaux, libelle, lu }: { morceaux: { v: string; u: string | null }[]; libelle: string; lu: string }) {
  return (
    <View style={styles.chiffre} accessible accessibilityLabel={`${libelle} : ${lu}`}>
      <Texte numberOfLines={1} importantForAccessibility="no">
        {morceaux.map((m, i) => (
          <Texte key={i} style={styles.grand}>
            {i > 0 ? " " : ""}
            {m.v}
            {m.u ? <Texte style={styles.unite}>{` ${m.u}`}</Texte> : null}
          </Texte>
        ))}
      </Texte>
      <Texte variante="meta" couleur="t3" numberOfLines={2}>
        {libelle}
      </Texte>
    </View>
  );
}

export function ChiffresCircuit({ circuit, activite }: { circuit: Pick<Circuit, "distanceM" | "denivelePlusM">; activite: ActiviteCircuit }) {
  const km = libelleDistance();
  const m = libelleAltitude();
  const distance = nombre(distanceEnUnite(circuit.distanceM), 1);
  const denivele = circuit.denivelePlusM == null ? null : `+${nombre(altitudeEnUnite(circuit.denivelePlusM), 0)}`;
  const minutes = dureeEstimeeMin(circuit.distanceM, circuit.denivelePlusM, activite);
  const duree = segmentsDuree(minutes).map((s) => ({ v: s.v, u: s.u ? t(`circuit.duree.${s.u}`) : null }));
  const dureeLue = duree.map((s) => `${s.v}${s.u ? ` ${s.u}` : ""}`).join(" ");

  return (
    <View style={styles.rangee}>
      <Chiffre morceaux={[{ v: distance, u: km }]} libelle={t("circuit.distance")} lu={`${distance} ${km}`} />
      {denivele ? (
        <Chiffre morceaux={[{ v: denivele, u: m }]} libelle={t("circuit.denivele")} lu={`${denivele} ${m}`} />
      ) : (
        <View style={styles.chiffre} accessible accessibilityLabel={`${t("circuit.denivele")} : ${t("circuit.denivele.indispo")}`}>
          <Texte variante="saisie" couleur="t2" style={styles.indispo} importantForAccessibility="no">
            {t("circuit.denivele.indispo")}
          </Texte>
          <Texte variante="meta" couleur="t3">
            {t("circuit.denivele")}
          </Texte>
        </View>
      )}
      <Chiffre morceaux={duree} libelle={t(`circuit.duree.${activite}`)} lu={dureeLue} />
    </View>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: "row", gap: espace.l, marginTop: espace.l },
  chiffre: { flex: 1, minWidth: 0 },
  grand: { fontFamily: police.semibold, fontSize: 26, lineHeight: 30, letterSpacing: -0.4 },
  unite: { fontFamily: police.medium, fontSize: 14 },
  // La hauteur d'un chiffre : « Indisponible » reste aligné sur les libellés voisins.
  indispo: { lineHeight: 30, paddingTop: 5 },
});
