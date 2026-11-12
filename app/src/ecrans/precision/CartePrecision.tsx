// Carte de la précision pepfit dans le volet du Profil (planche precision, section 1 ; P7 : sous la carte du profil) :
// « Précision pepfit · 61 % », la jauge à quatre encoches, le cap atteint et le gain le plus rapide. Toute la carte est
// touchable et ouvre la page. Le chiffre fort du volet reste celui des séances. Un cap passé depuis la dernière fois : à
// l'ouverture du volet, le chiffre compte et la jauge avance (600 ms, courbe sortie), un retour haptique léger ; une fois.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "../../theme";
import { courbe, duree } from "../../theme/mouvement";
import { police, rayon, typo } from "../../theme/typo";
import { haptique } from "../../ui/haptique";
import { useReduit } from "../../ui/reduit";
import { useApp } from "../contexte";
import { passageAMontrer } from "../../precision/memoire";
import { marquerVu } from "../../precision/service";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { CAPS, etapeRapide } from "../../precision/modele";
import { ligneCarte, nomCap, pc } from "../../precision/vue";
import type { EtatPrecision } from "../../precision/service";
import { Jauge } from "./Briques";

export const ENCOCHES_CAPS = CAPS.slice(1).map((c) => c.min);

const TexteAnime = Animated.createAnimatedComponent(TextInput);
const sortie = Easing.bezier(...courbe.sortie);

export function CartePrecision({ e, fond, visite, onPress }: { e: EtatPrecision | null; fond: string; visite: number; onPress: () => void }) {
  const { couleurs } = useTheme();
  const { db } = useApp();
  const reduit = useReduit();
  const score = e?.r.score ?? 0;
  const p = useSharedValue(score);
  const [anime, setAnime] = useState(false);
  // à chaque ouverture du volet : un cap passé et pas encore montré se montre ici (sinon, le score vu est retenu)
  useEffect(() => {
    if (!e || !visite) return;
    const pa = passageAMontrer(e.memoire, e.r.cap.n, e.r.score);
    const fini = () => {
      haptique.depot();
      marquerVu(db, e).catch(console.error);
    };
    if (!pa || reduit || pa.scoreAvant >= e.r.score) {
      p.value = e.r.score;
      setAnime(false);
      if (pa) fini();
      else marquerVu(db, e).catch(console.error);
      return;
    }
    setAnime(true);
    p.value = pa.scoreAvant;
    p.value = withDelay(duree.feuille + 150, withTiming(e.r.score, { duration: 600, easing: sortie }, (ok) => ok && scheduleOnRN(fini)));
  }, [e, visite, db, reduit, p]);
  // « 61 % » : le suffixe de la langue, lu hors du fil de l'interface (t n'est pas un worklet)
  const suffixe = t("precision.pc", { n: 0 }).slice(1);
  const propsChiffre = useAnimatedProps(() => {
    const s = `${Math.round(p.value)}${suffixe}`;
    return { text: s, defaultValue: s } as never;
  });
  const cap = e ? nomCap(e.r.cap) : "";
  const l = e ? ligneCarte(e.r, etapeRapide(e.d)) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={e ? t("precision.carte.a11y", { n: score, cap }) : t("precision.chargement")}
      onPress={onPress}
      style={({ pressed }) => [styles.carte, { backgroundColor: pressed ? couleurs.s3 : fond }]}
    >
      <View style={styles.l1}>
        <Texte variante="exercice" numberOfLines={1} style={{ flex: 1 }}>
          {t("precision.titre")}
        </Texte>
        {e && anime ? (
          <TexteAnime editable={false} underlineColorAndroid="transparent" animatedProps={propsChiffre} defaultValue={pc(score)} style={[typo.exercice, styles.anime, { color: couleurs.t1 }]} />
        ) : e ? (
          <Texte variante="exercice" style={{ fontVariant: ["tabular-nums"] }}>
            {pc(score)}
          </Texte>
        ) : null}
        <View style={{ marginRight: -2 }}>
          <Icone nom="right" couleur={couleurs.t3} taille={16} />
        </View>
      </View>
      <Jauge valeur={score} progres={anime ? p : undefined} encoches={ENCOCHES_CAPS} fond={fond} style={styles.jauge} />
      <Texte variante="corps" couleur="t2" numberOfLines={1} style={styles.l3}>
        <Texte variante="corps" style={{ fontFamily: police.medium, color: couleurs.t1 }}>
          {cap}
        </Texte>
        {l && (l.gain || l.texte) ? ", " : ""}
        {l?.gain ? (
          <Texte variante="corps" style={{ fontFamily: police.semibold, color: couleurs.partieAccueil }}>
            {`${l.gain} `}
          </Texte>
        ) : null}
        {l?.texte ?? ""}
      </Texte>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carte: { marginTop: 12, marginHorizontal: 16, borderRadius: rayon.l, paddingTop: 14, paddingBottom: 14, paddingLeft: 16, paddingRight: 12, minHeight: 44 },
  l1: { flexDirection: "row", alignItems: "center", gap: 8, height: 20 },
  jauge: { marginTop: 12, marginRight: 4 },
  l3: { marginTop: 10, fontSize: 13, lineHeight: 17 },
  anime: { padding: 0, margin: 0, fontVariant: ["tabular-nums"], textAlign: "right", minWidth: 48, height: 20 },
});
