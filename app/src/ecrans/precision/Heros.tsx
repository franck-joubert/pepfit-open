// Haut de la page « Précision pepfit » (planche precision, sections 2 et 4) : 61 % en 44 Light, le cap et « cap 3 sur 5 », la
// jauge de 8, « Encore 4 % pour Relief ». Passage de cap (une fois par cap, depuis la dernière valeur vue) : 150 ms, puis le
// chiffre compte et la jauge avance ensemble (600 ms, courbe sortie) ; à l'encoche, une lueur (400 ms, ×0,6 → ×1,6, fondu),
// le nom du cap en fondu enchaîné (200 ms), « Nouveau cap », un retour haptique léger ; à 900 ms, « S'ouvrent » (200 ms,
// 8 px, fondu). Mouvement réduit : fondu de 150 ms, pas de lueur.
import { useEffect, useRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "../../theme";
import { courbe } from "../../theme/mouvement";
import { avecOpacite } from "../../theme/teintes";
import { police, rayon, typo } from "../../theme/typo";
import { haptique } from "../../ui/haptique";
import { Icone } from "../../ui/Icone";
import { useReduit } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { CAPS, capN, type Cap } from "../../precision/modele";
import { nomCap } from "../../precision/vue";
import { Jauge } from "./Briques";
import { ENCOCHES_CAPS } from "./CartePrecision";

const TexteAnime = Animated.createAnimatedComponent(TextInput);
const sortie = Easing.bezier(...courbe.sortie);

/** Durées du passage de cap (planche precision, section 4). */
export const PASSAGE = { attente: 150, compte: 600, lueur: 400, bascule: 200, ouvrent: 900, ouvrentMs: 200, reduit: 150 } as const;

export interface Passage {
  capAvant: number;
  scoreAvant: number;
  /** Lectures qui s'ouvrent (« Âge pepfit · Masses grasse et maigre · Date d'arrivée »), vide : pas de ligne. */
  ouvrent: string;
}

export function Heros({ score, cap, passage, onFini }: { score: number; cap: Cap; passage?: Passage | null; onFini?: () => void }) {
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const suivant = CAPS.find((c) => c.min > score) ?? null;
  const avant = passage ? capN(passage.capAvant) : cap;
  const p = useSharedValue(passage ? passage.scoreAvant : score);
  const bascule = useSharedValue(passage ? 0 : 1);
  const lueur = useSharedValue(0);
  const ouvert = useSharedValue(passage ? 0 : 1);
  const fini = useRef(onFini);
  fini.current = onFini;

  const franchir = () => {
    haptique.depot();
    bascule.value = withTiming(1, { duration: reduit ? PASSAGE.reduit : PASSAGE.bascule, easing: sortie });
    if (!reduit) {
      lueur.value = 0;
      lueur.value = withTiming(1, { duration: PASSAGE.lueur, easing: sortie });
    }
  };

  useEffect(() => {
    if (!passage) return;
    let minuterie: ReturnType<typeof setTimeout>;
    if (reduit) {
      p.value = score;
      franchir();
      ouvert.value = withTiming(1, { duration: PASSAGE.reduit });
      minuterie = setTimeout(() => fini.current?.(), PASSAGE.reduit);
    } else {
      p.value = withDelay(PASSAGE.attente, withTiming(score, { duration: PASSAGE.compte, easing: sortie }));
      ouvert.value = withDelay(PASSAGE.ouvrent, withTiming(1, { duration: PASSAGE.ouvrentMs, easing: sortie }));
      minuterie = setTimeout(() => fini.current?.(), PASSAGE.ouvrent + PASSAGE.ouvrentMs);
    }
    return () => clearTimeout(minuterie);
    // une seule fois, à l'arrivée sur la page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // l'encoche du nouveau cap franchie : la lueur, le nom en fondu enchaîné, « Nouveau cap », un retour haptique léger
  useAnimatedReaction(
    () => p.value >= cap.min,
    (franchi, avantFranchi) => {
      if (passage && !reduit && franchi && avantFranchi === false) scheduleOnRN(franchir);
    },
  );

  const propsChiffre = useAnimatedProps(() => {
    const s = String(Math.round(p.value));
    return { text: s, defaultValue: s } as never;
  });
  const styleAvant = useAnimatedStyle(() => ({ opacity: 1 - bascule.value }));
  const styleApres = useAnimatedStyle(() => ({ opacity: bascule.value }));
  const styleOuvert = useAnimatedStyle(() => ({ opacity: ouvert.value, transform: [{ translateY: 8 * (1 - ouvert.value) }] }));
  const styleLueur = useAnimatedStyle(() => ({ opacity: lueur.value > 0 && lueur.value < 1 ? 0.9 * (1 - lueur.value) : 0, transform: [{ scale: 0.6 + lueur.value }] }));
  const bleu = couleurs.partieAccueil;

  return (
    <>
      <View style={styles.heros}>
        <View style={styles.chiffre} accessible accessibilityLabel={t("precision.carte.a11y", { n: score, cap: nomCap(cap) })} accessibilityLiveRegion="polite">
          {passage ? (
            <TexteAnime
              editable={false}
              underlineColorAndroid="transparent"
              animatedProps={propsChiffre}
              defaultValue={String(passage.scoreAvant)}
              maxFontSizeMultiplier={1.3}
              style={[typo.chiffreFort, styles.texteAnime, { color: couleurs.t1 }]}
            />
          ) : (
            <Texte variante="chiffreFort" style={{ lineHeight: 52 }}>
              {score}
            </Texte>
          )}
          <Texte variante="chiffreFort" couleur="t2" style={{ fontSize: 20, lineHeight: 26 }}>
            %
          </Texte>
        </View>
        <View style={styles.cap}>
          <View>
            {passage ? (
              <Animated.View style={[styles.dessus, styleAvant]}>
                <LigneCap cap={avant} />
              </Animated.View>
            ) : null}
            <Animated.View style={styleApres}>
              <LigneCap cap={cap} />
            </Animated.View>
          </View>
          {passage ? (
            <Animated.View style={[styles.nouveau, { backgroundColor: avecOpacite(bleu, mode === "nuit" ? 0.18 : 0.13) }, styleApres]}>
              <Texte variante="meta" style={{ color: bleu, fontFamily: police.semibold }}>
                {t("precision.nouveauCap")}
              </Texte>
            </Animated.View>
          ) : null}
        </View>
        <Jauge
          valeur={score}
          progres={passage ? p : undefined}
          encoches={ENCOCHES_CAPS}
          hauteur={8}
          fond={couleurs.s1}
          style={{ marginTop: 16 }}
          lueur={
            passage && !reduit ? (
              <Animated.View pointerEvents="none" style={[styles.lueur, { left: `${cap.min}%` }, styleLueur]}>
                <Svg width={36} height={36}>
                  <Defs>
                    <RadialGradient id="lueurCap" cx="50%" cy="50%" r="50%">
                      <Stop offset="0" stopColor={bleu} stopOpacity={0.9} />
                      <Stop offset="0.68" stopColor={bleu} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Rect x={0} y={0} width={36} height={36} fill="url(#lueurCap)" />
                </Svg>
              </Animated.View>
            ) : null
          }
        />
        <Texte variante="corps" couleur="t2" style={styles.sous}>
          {suivant ? (
            <>
              {`${t("precision.encorePour", { n: suivant.min - score })} `}
              <Texte variante="corps" style={{ fontFamily: police.medium }}>
                {nomCap(suivant)}
              </Texte>
            </>
          ) : (
            t("precision.tousCaps")
          )}
        </Texte>
      </View>
      {passage?.ouvrent ? (
        <Animated.View style={[styles.ouvert, { backgroundColor: avecOpacite(bleu, mode === "nuit" ? 0.12 : 0.08) }, styleOuvert]} accessible accessibilityLabel={`${t("precision.souvrent")}, ${passage.ouvrent}`}>
          <Icone nom="etincelle" couleur={bleu} taille={20} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Texte variante="libelle" style={{ fontFamily: police.semibold }}>
              {t("precision.souvrent")}
            </Texte>
            <Texte variante="corps" couleur="t2">
              {passage.ouvrent}
            </Texte>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}

function LigneCap({ cap }: { cap: Cap }) {
  return (
    <View style={styles.ligneCap}>
      <Texte variante="exercice">{nomCap(cap)}</Texte>
      <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
        {t("precision.capSur5", { n: cap.n })}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  heros: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 4 },
  chiffre: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  texteAnime: { lineHeight: 52, padding: 0, margin: 0, minWidth: 56 },
  cap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  ligneCap: { flexDirection: "row", alignItems: "center", gap: 8 },
  dessus: { position: "absolute", left: 0, top: 0 },
  nouveau: { height: 22, paddingHorizontal: 8, borderRadius: 7, justifyContent: "center" },
  lueur: { position: "absolute", top: "50%", width: 36, height: 36, marginTop: -18, marginLeft: -18 },
  sous: { marginTop: 8, fontSize: 13 },
  ouvert: { marginTop: 16, marginHorizontal: 16, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
});
