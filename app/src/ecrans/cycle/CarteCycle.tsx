// La carte Cycle de Santé (planche cycle, écran 1, D3) : sous Récupération et Effort. Le titre « Cycle », la phase en mots
// simples, le jour en grand à droite (« Jour · 19 »), une frise fine, puis « Prochaines règles : 8 – 12 nov. · estimation ».
// Toucher la carte ouvre la page Cycle. Sans aucun jour noté : la carte vide « Note tes règles pour commencer », même gabarit.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import type { DonneesCycle } from "../../cycle/donnees";
import { fourchetteCourte, luPrevision, motPhase } from "./cycle-vue";
import { Frise } from "./Frise";

export function CarteCycle({ d }: { d: DonneesCycle }) {
  const { couleurs } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const e = d.etat;
  const ph = e.phase;
  const pv = d.reglages.prevision ? e.prevision : ({ possible: false, raison: "aucun" } as const);
  const style = ({ pressed }: { pressed: boolean }) => [styles.carte, { backgroundColor: pressed ? couleurs.s2 : couleurs.verreCarte, borderColor: couleurs.verreFilet }];
  const ouvrir = () => router.push("/sante/cycle");
  const titre = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Texte variante="exercice" style={{ lineHeight: 20 }}>
        {t("cycle.titre")}
      </Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} epaisseur={2} />
    </View>
  );
  if (!ph)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${t("cycle.titre")}, ${t("cycle.carteVide")}`} onPress={ouvrir} style={style}>
        {titre}
        <Texte variante="corps" couleur="t2" style={{ fontSize: 14, marginTop: 6 }}>
          {t("cycle.carteVide")}
        </Texte>
      </Pressable>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("cycle.luCarte", { j: ph.j, phase: motPhase(ph.nom), prevision: luPrevision(pv) })}
      onPress={ouvrir}
      style={style}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flexShrink: 1 }}>
          {titre}
          {motPhase(ph.nom) ? (
            <Texte variante="meta" couleur="t2" style={{ marginTop: 2 }}>
              {motPhase(ph.nom)}
            </Texte>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Texte variante="meta" couleur="t2">
            {t("cycle.jour")}
          </Texte>
          <Texte variante="titreFort" style={styles.valeurForte}>
            {String(ph.j)}
          </Texte>
        </View>
      </View>
      <View style={{ marginTop: 14 }} onLayout={(x) => setLargeur(Math.floor(x.nativeEvent.layout.width))}>
        {largeur > 0 ? <Frise etat={{ ...e, prevision: pv }} largeur={largeur} mini fond={couleurs.verreCarte} /> : <View style={{ height: 34 }} />}
      </View>
      {d.reglages.prevision ? (
        <Texte variante="meta" couleur="t2" style={{ marginTop: 10 }}>
          {pv.possible ? (
            <>
              {t("cycle.prochainesCarte")}
              <Texte variante="meta" style={{ color: couleurs.t1, fontFamily: police.semibold }}>
                {fourchetteCourte(pv)}
              </Texte>
              {`, ${t("cycle.estimation")}`}
            </>
          ) : e.prevision.possible === false && e.prevision.raison === "variable" ? (
            t("cycle.tropVariable")
          ) : (
            `${t("cycle.prochainesCarte")}${t("cycle.apresUnCycle")}`
          )}
        </Texte>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carte: { marginHorizontal: espace.l, marginTop: espace.m, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingHorizontal: espace.l, paddingBottom: espace.l },
  // comme les valeurs fortes des cartes de Santé (Énergie, VO2max)
  valeurForte: { lineHeight: 30, letterSpacing: -0.24, fontVariant: ["tabular-nums"] },
});
