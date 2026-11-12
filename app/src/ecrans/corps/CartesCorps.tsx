import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../theme";
import { couleursSante } from "../../theme/effets";
import { espace, police, rayon } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { bilanAffiche, useChiffresNutrition } from "../nutrition/mode-affichage";
import { echelleBarres, segmentsDepense } from "../energie-calc";
import { kcal, libelleJour, signeEstime } from "../FeuilleEnergie";
import { MiniPrecision } from "../precision/MiniPrecision";
import { nomCategorie, phraseCategorie, pourAge, RampeVo2, texteVo2 } from "../mesures/Vo2";
import { approx, jourMois, nombre } from "../format";
import { type DonneesVo2 } from "../mesures/vo2-donnees";
import { noterVu } from "../mesures/energie-surligne";
import { type JourEnergie } from "../sante-donnees";
import { BarreSegments } from "../sante-ui";

// Les cartes sous le personnage (planche Moi v4), de Santé : le bilan de l'énergie, la VO2max,
// la carte vide qui mène à ce qui débloque une donnée.

const MARGE = espace.l;

/** Carte vide utile : un titre, une phrase, toute la carte ouvre l'écran qui débloque la donnée. */
export function CarteVide({ titre, texte, onPress }: { titre: string; texte: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.bilan, { backgroundColor: pressed ? couleurs.s2 : couleurs.verreCarte, borderColor: couleurs.verreFilet }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <Texte variante="exercice" style={{ lineHeight: 20 }}>
          {titre}
        </Texte>
        <Icone nom="right" couleur={couleurs.t3} taille={16} epaisseur={2} />
      </View>
      <Texte variante="corps" couleur="t2" style={styles.aide}>
        {texte}
      </Texte>
    </Pressable>
  );
}

/** VO2max (planche vma-vo2max, D1) : la valeur à droite, seul élément fort ; la rampe des catégories ; catégorie et VMA. */
export function BlocVo2({ d }: { d: DonneesVo2 }) {
  const { couleurs } = useTheme();
  const v = d.vo2!;
  const sous = d.vma?.source === "test" ? t("vo2.blocSous.test", { date: quandVo2Court(d.vma.date) }) : d.vma ? t("vo2.blocSous.course") : t("vo2.blocSous.uth");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("vo2.ouvrir", { v: texteVo2(d), cat: phraseCategorie(d) })}
      onPress={() => router.push("/sante/vo2max")}
      style={({ pressed }) => [styles.bilan, { backgroundColor: pressed ? couleurs.s2 : couleurs.verreCarte, borderColor: couleurs.verreFilet }]}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Texte variante="exercice" style={{ lineHeight: 20 }}>
              {t("vo2.court")}
            </Texte>
            <Icone nom="right" couleur={couleurs.t3} taille={16} epaisseur={2} />
          </View>
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {sous}
          </Texte>
        </View>
        <Texte variante="titreFort" style={styles.valeurForte}>
          {texteVo2(d)}
          <Texte variante="meta" couleur="t2">{` ${t("vo2.unite")}`}</Texte>
        </Texte>
      </View>
      <RampeVo2 vo2={v.valeur} age={d.age} sexe={d.sexe} mini />
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
        <Texte variante="meta" couleur="t2" style={{ flexShrink: 1 }} numberOfLines={1}>
          {d.categorie ? pourAge(nomCategorie(d.categorie), d.age) : ""}
        </Texte>
        {d.vma ? (
          <Texte variante="meta" couleur="t2">
            {t("vo2.vmaN", { v: approx(nombre(d.vma.vma, 1), d.vma.source !== "test") })}
          </Texte>
        ) : null}
      </View>
    </Pressable>
  );
}

const quandVo2Court = (ms: number) => (new Date(ms).toDateString() === new Date().toDateString() ? t("mesures.aujourdhuiMin") : jourMois(ms));

/** Bilan du jour sous le personnage (D2) : deux barres à la même échelle, le solde à droite, seul élément fort. */
export function Bilan({ e, onPress }: { e: JourEnergie; onPress: () => void }) {
  const { couleurs, mode } = useTheme();
  // ce que le bilan montre du jour : la feuille Énergie surlignera ce qu'une activité associée ou ignorée aura changé
  useEffect(() => noterVu(e.jour, e), [e]);
  const c = couleursSante[mode];
  const b = bilanAffiche(e.bilan, useChiffresNutrition());
  const ech = echelleBarres(b.depense.kcal, b.apports);
  const couleurTerme = { bmr: c.bmr, sport: c.sport, neat: c.neat, digestion: c.digestion };
  const segs = segmentsDepense(b);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sante.energieDetail")}
      onPress={onPress}
      style={({ pressed }) => [styles.bilan, { backgroundColor: pressed ? couleurs.s2 : couleurs.verreCarte, borderColor: couleurs.verreFilet }]}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Texte variante="exercice" style={{ lineHeight: 20 }}>
              {t("sante.energie")}
            </Texte>
            <Icone nom="right" couleur={couleurs.t3} taille={16} epaisseur={2} />
          </View>
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {`${libelleJour(e.jour)}${e.enCours ? `, ${t("cartes.journeeEnCours")}` : ""}`}
          </Texte>
        </View>
        {b.solde != null ? (
          <View style={{ alignItems: "flex-end" }}>
            <Texte variante="meta" couleur="t2">
              {t(b.solde < 0 ? "cartes.deficit" : b.solde > 0 ? "cartes.surplus" : "cartes.equilibre")}
            </Texte>
            <Texte variante="titreFort" style={styles.valeurForte}>
              {signeEstime(b.solde, b.soldeEstime)}
              <Texte variante="meta" couleur="t2">{` ${t("sante.kcal")}`}</Texte>
            </Texte>
          </View>
        ) : null}
      </View>
      <View style={styles.lignes}>
        {b.apports != null ? (
          <View style={styles.ligneBarre}>
            <Texte variante="meta" couleur="t2" style={styles.etiquette}>
              {t("sante.apports")}
            </Texte>
            <View style={{ flex: 1 }}>
              <BarreSegments largeur={ech.apports} segments={[{ couleur: c.apports, valeur: b.apports }]} />
            </View>
            <Texte variante="corps" style={styles.chiffre}>
              {kcal(b.apports, b.soldeEstime)}
              <Texte variante="meta" couleur="t2">{` ${t("sante.kcal")}`}</Texte>
            </Texte>
          </View>
        ) : null}
        <View style={styles.ligneBarre}>
          <Texte variante="meta" couleur="t2" style={styles.etiquette}>
            {t("sante.depense")}
          </Texte>
          <View style={{ flex: 1 }}>
            <BarreSegments largeur={ech.depense} premier={1} segments={segs.map((s) => ({ couleur: couleurTerme[s.cle], valeur: s.kcal }))} />
          </View>
          <Texte variante="corps" style={styles.chiffre}>
            {kcal(b.depense.kcal, b.depense.estime)}
            <Texte variante="meta" couleur="t2">{` ${t("sante.kcal")}`}</Texte>
          </Texte>
        </View>
      </View>
      {/* sa précision, touchable : la feuille de la dépense dit ce qui la fait monter (planche precision, section 7) */}
      <MiniPrecision calcul="depense" style={{ marginTop: 8, marginLeft: -6 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bilan: { marginHorizontal: MARGE, marginTop: espace.m, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingHorizontal: espace.l, paddingBottom: espace.l },
  lignes: { marginTop: 14, gap: 10 },
  aide: { fontSize: 14, marginTop: 6 },
  ligneBarre: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 18 },
  etiquette: { width: 62 },
  chiffre: { width: 92, textAlign: "right", fontFamily: police.medium, fontVariant: ["tabular-nums"] },
  // Chiffres tabulaires : en proportionnels, Inter rend à largeur nulle l'espace fine des milliers de « −1 365 » (vu à
  // l'émulateur, revue finale n° 18) ; les tabulaires la gardent, comme le chiffre fort des pages de mesure.
  valeurForte: { lineHeight: 30, letterSpacing: -0.24, fontVariant: ["tabular-nums"] },
});
