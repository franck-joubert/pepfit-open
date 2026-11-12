import { useEffect, useState } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { calendrier, pile } from "../theme/mouvement";
import { espace, police } from "../theme/typo";
import { Icone } from "../ui/Icone";
import { Appui, courbes } from "../ui/mouvement";
import { fichierPicto } from "../ui/pictos";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import type { Article, Famille } from "./modele";
import { usePageArrivee } from "./page-arrivee";
import { Vignette } from "./ui";

// Entrées « Explorer » des pages Programmes et Routines. Routines (planche sport-programmes-routines v2, retours 2 et 3, D12,
// validés le 29/10) : quatre vignettes empilées en éventail serré (54 entre deux), chacune un peu tournée ; à l'ouverture de
// la page, elles partent empilées au centre (déjà visibles) et s'écartent à leur place et à leur angle (jeton `pile` : 520 ms
// chacune, 40 ms d'écart, courbe « sortie », une fois, 120 ms après l'arrivée de la page, revue finale n° 64).
// Programmes (planche boutiques, variante A, validée le 30/10) : un calendrier, jours en colonnes, semaines S1 à S3 en lignes
// et S4 en fantôme, trois séances par semaine qui se posent case après case (jeton `calendrier`).
// « Réduire les animations » : posées d'emblée. Seul mouvement de la page.
// En petit (feuille d'un sport) : jusqu'à quatre vignettes, sans mouvement. Puis un séparateur sous la grande entrée.

const GRANDE = { l: 88, h: 110, x: [-125, -71, -17, 37], y: [10, 2, 0, 8], r: [-7, -2.5, 2, 6.5] };
const PETITE = { l: 32, h: 42, pas: 14, y: [5, 1, 0, 4], r: [-7, -2.5, 2, 6.5] };

function CarteDeLaPile({ p, i, bord, arrivee }: { p: Article; i: number; bord: string; arrivee: boolean }) {
  const reduit = useReduit();
  // 0 : empilée au centre ; 1 : à sa place et à son angle. La courbe est dans withTiming (Reanimated).
  const k = useSharedValue(reduit ? 1 : 0);
  useEffect(() => {
    if (reduit) {
      k.value = 1;
      return;
    }
    if (!arrivee) return;
    k.value = withDelay(pile.delai + i * pile.ecart, withTiming(1, { duration: pile.duree, easing: courbes.sortie }));
    // une seule fois par ouverture de la page : `arrivee` ne repasse pas à faux
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivee, reduit]);
  const x0 = -GRANDE.l / 2, x1 = GRANDE.x[i]!, y1 = GRANDE.y[i]!, r1 = GRANDE.r[i]!;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x0 + (x1 - x0) * k.value }, { translateY: 10 + (y1 - 10) * k.value }, { rotate: `${r1 * k.value}deg` }, { scale: 0.96 + 0.04 * k.value }],
  }));
  return (
    <Reanimated.View style={[styles.carte, { zIndex: i + 1, borderColor: bord }, style]}>
      <Vignette p={p} hauteur={GRANDE.h} largeur={GRANDE.l} rayon={12} chiffre={false} />
    </Reanimated.View>
  );
}

/** Les quatre vignettes empilées ; elles s'ouvrent une fois, la page arrivée (D12, n° 64). */
export function PileVignettes({ articles, bord }: { articles: readonly Article[]; bord: string }) {
  const arrivee = usePageArrivee("pile");
  return (
    <View style={styles.pile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {articles.slice(0, 4).map((p, i) => (
        <CarteDeLaPile key={p.id} p={p} i={i} bord={bord} arrivee={arrivee} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- calendrier (Explorer les programmes)

/** La semaine type : lundi course, mercredi force, vendredi mobilité ; un point sur les jours libres. */
const SEMAINE_TYPE: ({ picto: string; famille: Famille } | null)[] = [
  { picto: "course", famille: "endu" },
  null,
  { picto: "squat", famille: "force" },
  null,
  { picto: "yoga", famille: "sante" },
  null,
  null,
];
const SANS_CHIFFRE = { valeur: "", unite: null };
/** Largeur des étiquettes S1… ; hauteur de la ligne des jours ; nombre de semaines (la dernière en fantôme). */
const CAL = { lab: 30, h0: 18, n: 4, max: 400 };

function SeancePosee({ i, x, y, cote, rayon, s, arrivee }: { i: number; x: number; y: number; cote: number; rayon: number; s: { picto: string; famille: Famille }; arrivee: boolean }) {
  const reduit = useReduit();
  const { mode } = useTheme();
  // 0 : un peu au-dessus, plus petite et pâle (déjà visible) ; 1 : posée.
  const k = useSharedValue(reduit ? 1 : 0);
  useEffect(() => {
    if (reduit) {
      k.value = 1;
      return;
    }
    if (!arrivee) return;
    k.value = withDelay(calendrier.delai + i * calendrier.ecart, withTiming(1, { duration: calendrier.duree, easing: courbes.sortie }));
    // une seule fois par ouverture de la page : `arrivee` ne repasse pas à faux
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivee, reduit]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * k.value,
    transform: [{ translateY: -7 * (1 - k.value) }, { scale: 0.86 + 0.14 * k.value }],
  }));
  return (
    <Reanimated.View
      style={[
        styles.seance,
        { left: x, top: y, borderRadius: rayon, boxShadow: mode === "nuit" ? "0px 4px 10px -6px rgba(0,0,0,0.5)" : "0px 4px 10px -6px rgba(224,57,26,0.35)" },
        style,
      ]}
    >
      {/* Le fond et le filet de la vignette, la silhouette entière par-dessus (planche : picto cadré sur sa boîte). */}
      <Vignette p={{ famille: s.famille, picto: "", gros: SANS_CHIFFRE }} hauteur={cote} largeur={cote} rayon={rayon} chiffre={false} filet />
      <Image source={fichierPicto(s.picto)} resizeMode="contain" style={[styles.silhouette, { width: cote - 4, height: cote - 4 }]} />
    </Reanimated.View>
  );
}

/** Le calendrier : 400 de large au plus, centré (Fold) ; les séances se posent une fois, la page arrivée. */
export function CalendrierSeances() {
  useLangue();
  const { couleurs } = useTheme();
  const arrivee = usePageArrivee("calendrier");
  const [dispo, setDispo] = useState(0);
  const W = Math.min(dispo, CAL.max);
  const large = dispo >= CAL.max;
  const cote = large ? 36 : 32;
  const rayon = large ? 10 : 9;
  const rh = cote + 6;
  const H = CAL.h0 + rh * CAL.n - 6;
  const cw = (W - CAL.lab) / 7;
  // Initiales du dico (dimanche en tête) : lundi en tête, comme le semainier.
  const ini = t("mesures.initialesJours").split(",");
  const jours = [...ini.slice(1), ini[0]!];
  let i = 0;
  return (
    <View onLayout={(e) => setDispo(Math.round(e.nativeEvent.layout.width))} style={{ height: H, marginBottom: 2 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {W > 0 ? (
        <View style={{ width: W, height: H, alignSelf: "center" }}>
          {jours.map((l, j) => (
            <Texte key={j} style={[styles.jour, { left: CAL.lab + j * cw, width: cw, color: couleurs.t3 }]}>
              {l}
            </Texte>
          ))}
          {Array.from({ length: CAL.n }, (_, sem) => {
            const y = CAL.h0 + sem * rh;
            const fantome = sem === CAL.n - 1;
            return (
              <View key={sem} style={[StyleSheet.absoluteFill, fantome && { opacity: 0.3 }]}>
                <Texte style={[styles.semaine, { top: y + cote / 2 - 7, color: couleurs.t3 }]}>{t("boutique.calSemaine", { n: sem + 1 })}</Texte>
                {SEMAINE_TYPE.map((s, j) => {
                  const cx = CAL.lab + j * cw + cw / 2;
                  if (!s) return <View key={j} style={[styles.point, { left: cx - 2, top: y + cote / 2 - 2, backgroundColor: couleurs.line2 }]} />;
                  return <SeancePosee key={j} i={i++} x={cx - cote / 2} y={y} cote={cote} rayon={rayon} s={s} arrivee={arrivee} />;
                })}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- entrées

/** Grande entrée (pages Programmes et Routines), puis son séparateur. Visuel : le calendrier (programmes) ou la pile
 *  des `articles` (routines). */
export function EntreeParcourir({
  titre,
  sous,
  articles,
  calendrier: avecCalendrier = false,
  onPress,
  style,
}: {
  titre: string;
  sous: string;
  articles?: readonly Article[];
  calendrier?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  useLangue();
  const { couleurs, mode } = useTheme();
  return (
    <View style={style}>
      <Appui
        accessibilityRole="button"
        accessibilityLabel={titre}
        accessibilityHint={sous}
        onPress={onPress}
        style={[styles.entree, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }, mode === "jour" && styles.ombreJour]}
      >
        {avecCalendrier ? <CalendrierSeances /> : <PileVignettes articles={articles ?? []} bord={couleurs.carteOpaque} />}
        <View style={styles.bas}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texte style={[styles.titre, { color: couleurs.t1 }]}>{titre}</Texte>
            <Texte numberOfLines={2} style={[styles.sous, { color: couleurs.t2 }]}>
              {sous}
            </Texte>
          </View>
          <View style={[styles.fleche, { backgroundColor: couleurs.s2 }]}>
            <Icone nom="right" couleur={couleurs.t1} taille={18} />
          </View>
        </View>
      </Appui>
      {/* Séparateur sous l'entrée (retours 2 et 3) : filet de la partie à 30 %. */}
      <View accessibilityRole="none" style={[styles.separateur, { backgroundColor: couleurs.line2 }]} />
    </View>
  );
}

/** Entrée compacte (feuille d'un sport) : la même pile, en petit et sans mouvement, le nombre de routines de ce sport. */
export function EntreeParcourirPetite({ articles, sous, onPress }: { articles: readonly Article[]; sous: string; onPress: () => void }) {
  useLangue();
  const { couleurs } = useTheme();
  const l = articles.slice(0, 4);
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={t("boutique.parcourirRoutines")}
      accessibilityHint={sous}
      onPress={onPress}
      style={({ pressed }) => [styles.petite, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
    >
      <View style={[styles.pilePetite, { width: PETITE.l + PETITE.pas * (l.length - 1) + 8 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {l.map((p, i) => (
          <View
            key={p.id}
            style={[styles.cartePetite, { left: i * PETITE.pas, top: PETITE.y[i], zIndex: i, borderColor: couleurs.feuilleGroupe, transform: [{ rotate: `${PETITE.r[i]}deg` }] }]}
          >
            <Vignette p={p} hauteur={PETITE.h} largeur={PETITE.l} rayon={8} chiffre={false} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="exercice">{t("boutique.parcourirRoutines")}</Texte>
        <Texte numberOfLines={1} style={{ fontSize: 12.5, color: couleurs.t2, marginTop: 3 }}>
          {sous}
        </Texte>
      </View>
      <View style={{ marginRight: 6 }}>
        <Icone nom="right" couleur={couleurs.t3} taille={18} />
      </View>
    </Appui>
  );
}

const styles = StyleSheet.create({
  entree: { marginHorizontal: espace.l, paddingTop: 14, paddingBottom: 14, paddingLeft: espace.l, paddingRight: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  ombreJour: { boxShadow: "0px 1px 2px 0px rgba(224,57,26,0.06), 0px 8px 20px -12px rgba(224,57,26,0.22)" },
  pile: { height: 128, marginTop: 2, marginBottom: 4 },
  // Posée au centre de la pile : les déplacements partent de là (translateX de −44 = centrée).
  carte: { position: "absolute", left: "50%", top: 6, borderRadius: 14, borderWidth: 2, overflow: "hidden", boxShadow: "0px 6px 14px -6px rgba(0,0,0,0.4)" },
  jour: { position: "absolute", top: 0, fontFamily: police.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.66, textAlign: "center", fontVariant: ["tabular-nums"] },
  semaine: { position: "absolute", left: 0, fontFamily: police.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.2, fontVariant: ["tabular-nums"] },
  point: { position: "absolute", width: 4, height: 4, borderRadius: 2 },
  seance: { position: "absolute" },
  silhouette: { position: "absolute", left: 2, top: 2 },
  bas: { flexDirection: "row", alignItems: "center", gap: espace.s, paddingTop: espace.s },
  titre: { fontFamily: police.semibold, fontSize: 17, letterSpacing: -0.1 },
  sous: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  fleche: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  separateur: { height: 1, marginHorizontal: espace.l, marginTop: 20, marginBottom: 6 },
  petite: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, paddingVertical: 12, paddingLeft: 12, paddingRight: 8, borderRadius: 16 },
  pilePetite: { height: 50 },
  cartePetite: { position: "absolute", borderWidth: 2, borderRadius: 10, overflow: "hidden" },
});
