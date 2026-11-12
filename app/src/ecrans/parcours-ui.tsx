import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type TextInputInstance } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { champVerre, degrades, type Partie } from "../theme/effets";
import { espace, police, POLICE_MAX, rayon } from "../theme/typo";
import { BoutonIcone } from "../ui/Cadre";
import { useCouleurPartie } from "../ui/ContextePartie";
import { FonduDegrade } from "../ui/Degrade";
import { Molette } from "../ui/Molette";
import { courbes } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { formater } from "../i18n/temps";
import { t } from "../i18n/index";
import { ageDe, anneesNaissance, joursDuMois, type Naissance } from "./parcours-calc";
import { useReduit } from "../ui/reduit";

// Briques des deux parcours (planches/parcours, commun.css et source-a.html) : barre du haut (retour, progression,
// « Passer »), titre, champ, âge en grand, molettes de date, bas fixe. Le parcours A prend la couleur de son étape
// (`PartieImposee`) ; le parcours B reste à l'Accueil.

export { COULEUR_PARTIE } from "../ui/partie";

/** Barre du haut : retour (sauf 1re étape), « Passer » discret à droite ; dessous, la barre continue (parcours A) ou les points (B). */
export function TeteParcours({
  onRetour,
  onPasser,
  progression,
  points,
}: {
  onRetour?: () => void;
  onPasser?: () => void;
  /** Parcours A : part faite (0 à 1), barre au dégradé de la partie. */
  progression?: { part: number; partie: Partie };
  /** Parcours B : étape k (0…) sur n, en tirets. */
  points?: { k: number; n: number };
}) {
  const { couleurs } = useTheme();
  return (
    <>
      <View style={styles.tete}>
        {onRetour ? <BoutonIcone nom="back" libelle={t("ui.retour")} couleur={couleurs.t1} onPress={onRetour} /> : null}
        {points ? (
          <View accessible accessibilityLabel={t("compteB.etape", { k: points.k + 1, n: points.n })} style={styles.points} pointerEvents="none">
            {Array.from({ length: points.n }, (_, i) => (
              <View key={i} style={[styles.point, { backgroundColor: i <= points.k ? couleurs.t1 : couleurs.line2 }]} />
            ))}
          </View>
        ) : null}
        {onPasser ? (
          <Pressable accessibilityRole="button" onPress={onPasser} hitSlop={{ top: 4, bottom: 4 }} style={styles.passer}>
            <Texte variante="corps" couleur="t3" style={{ fontSize: 14, fontFamily: police.medium }}>
              {t("parcours.passer")}
            </Texte>
          </Pressable>
        ) : null}
      </View>
      {progression ? <BarreProgression part={progression.part} partie={progression.partie} /> : null}
    </>
  );
}

/** Barre de progression continue : la part faite avance en 220 ms (courbe sortie) ; le dégradé fond d'une partie à l'autre. */
function BarreProgression({ part, partie }: { part: number; partie: Partie }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const p = useSharedValue(part);
  useEffect(() => {
    p.value = reduit ? part : withTiming(part, { duration: duree.pas, easing: courbes.sortie });
  }, [part, p, reduit]);
  // Remplissage pleine largeur étiré depuis la gauche (`scaleX`, revue finale n° 61) : aucune mise en page par image.
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(part * 100) }}
      style={[styles.barre, { backgroundColor: couleurs.line }]}
    >
      <Animated.View style={[styles.rempli, style]}>
        <FonduDegrade arrets={degrades[partie].arrets} angle={90} />
      </Animated.View>
    </View>
  );
}

/** Titre d'une étape : sur-titre facultatif à la couleur de la partie, titre 24, sous-titre 15 t2. */
export function TitreParcours({ titre, sous, sur, couleurSur, haut = 28 }: { titre: string; sous?: string; sur?: string; couleurSur?: string; haut?: number }) {
  return (
    <View style={[styles.titre, { paddingTop: haut }]}>
      {sur ? <Texte style={[styles.sur, { color: couleurSur }]}>{sur}</Texte> : null}
      <Texte variante="titreFort" accessibilityRole="header" style={styles.h2}>
        {titre}
      </Texte>
      {sous ? (
        <Texte variante="note" couleur="t2" style={{ marginTop: 6 }}>
          {sous}
        </Texte>
      ) : null}
    </View>
  );
}

/** Bas fixe : un seul bouton plein, un lien dessous ; remonte avec le clavier (le parent est un KeyboardAvoidingView). */
export function BasParcours({ children }: { children: ReactNode }) {
  const bas = useSafeAreaInsets().bottom;
  return <View style={[styles.bas, { paddingBottom: Math.max(28, bas + 12) }]}>{children}</View>;
}

/**
 * Champ du parcours : libellé visible au-dessus, champ de 60 en 20 medium (prénom). Fond translucide (`champVerre`) :
 * l'aura se voit au travers ; `prefixe` (« @ ») et indication en t2, t3 n'y tenant pas 4,5:1. Au focus, un filet paraît en
 * fondu (opacité seule, aussi en mouvement réduit). `fin` : un bouton au bout du champ (l'œil du mot de passe).
 * `erreur` : un filet rouge fixe (mot de passe incorrect, 4c), dit par la ligne d'erreur dessous.
 */
export function ChampParcours({
  libelle,
  prefixe,
  grand = true,
  curseur,
  fin,
  erreur,
  onFocus,
  onBlur,
  ...reste
}: { libelle: string; prefixe?: string; grand?: boolean; curseur?: string; fin?: ReactNode; erreur?: boolean } & TextInputProps) {
  const { couleurs, mode } = useTheme();
  const accent = useCouleurPartie();
  const champ = useRef<TextInputInstance>(null);
  const focus = useSharedValue(0);
  const filet = useAnimatedStyle(() => ({ opacity: focus.value }));
  const marquer = (v: number) => (focus.value = withTiming(v, { duration: duree.focus, easing: courbes.sortie }));
  return (
    <View style={styles.champBloc}>
      <Texte variante="corps" couleur="t2" style={styles.libelle}>
        {libelle}
      </Texte>
      <Pressable onPress={() => champ.current?.focus()} accessible={false} style={[styles.champ, { height: grand ? 60 : 52, backgroundColor: champVerre[mode].fond }]}>
        <Animated.View pointerEvents="none" style={[styles.filet, { borderColor: champVerre[mode].focus }, filet]} />
        {erreur ? <View pointerEvents="none" style={[styles.filet, { borderColor: couleurs.rate }]} /> : null}
        {prefixe ? <Text maxFontSizeMultiplier={POLICE_MAX} style={[grand ? styles.saisieGrande : styles.saisie, { color: couleurs.t2, marginRight: 2 }]}>{prefixe}</Text> : null}
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          ref={champ}
          placeholderTextColor={couleurs.t2}
          cursorColor={curseur ?? accent}
          selectionColor={curseur ?? accent}
          accessibilityLabel={libelle}
          {...reste}
          onFocus={(e) => (marquer(1), onFocus?.(e))}
          onBlur={(e) => (marquer(0), onBlur?.(e))}
          style={[grand ? styles.saisieGrande : styles.saisie, { flex: 1, color: couleurs.t1, padding: 0 }]}
        />
        {fin}
      </Pressable>
    </View>
  );
}

/**
 * Âge en grand, recalculé à chaque cran : le chiffre monte de 8 px en fondu (120 ms, courbe sortie) ; mouvement réduit :
 * fondu seul. `taille` : 120 (parcours A, au centre) ou 88 (B, sous le titre). `vide` : âge inconnu, en t3.
 */
export function AgeVivant({ age, taille = 120, vide = false }: { age: number; taille?: 120 | 88; vide?: boolean }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const y = useSharedValue(0);
  const o = useSharedValue(1);
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    y.value = reduit ? 0 : 8;
    o.value = reduit ? 0.4 : 0;
    y.value = withTiming(0, { duration: duree.chiffre, easing: courbes.sortie });
    o.value = withTiming(1, { duration: duree.chiffre, easing: courbes.sortie });
  }, [age, y, o, reduit]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  const grand = taille === 120;
  return (
    <View style={styles.age} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.Text
        style={[
          { fontFamily: police.light, fontSize: taille, lineHeight: grand ? 124 : 96, letterSpacing: grand ? -4 : -2, fontVariant: ["tabular-nums"] },
          { color: vide ? couleurs.t3 : couleurs.t1 },
          style,
        ]}
      >
        {age}
      </Animated.Text>
      <Texte variante="corps" couleur="t2" style={{ fontSize: grand ? 20 : 17 }}>
        {t("parcours.ans")}
      </Texte>
    </View>
  );
}

const nomMois = (m: number) => formater(Date.UTC(2000, m - 1, 15, 12), { month: "long" });
const JOURS = Array.from({ length: 31 }, (_, i) => i + 1);
const MOIS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * Les trois molettes jour · mois · année (72 · 148 · 96), une bande commune translucide ; la molette des jours s'arrête au
 * dernier jour du mois (jours inexistants en t3 sous lui), et y glisse quand le mois ou l'année le raccourcit.
 */
export function MolettesDate({ naissance, onChange, vide = false, auj = new Date() }: { naissance: Naissance; onChange: (n: Naissance) => void; vide?: boolean; auj?: Date }) {
  const { mode } = useTheme();
  const annees = useRef(anneesNaissance(auj)).current;
  const n = joursDuMois(naissance.m, naissance.a);
  const courant = useRef(naissance);
  courant.current = naissance;
  // Jour inexistant dans le mois choisi : la molette des jours glisse au dernier jour valide.
  useEffect(() => {
    if (naissance.j > n) onChange({ ...naissance, j: n });
  }, [naissance, n, onChange]);
  const changer = (p: Partial<Naissance>) => onChange({ ...courant.current, ...p });
  const lue = () => `${formater(new Date(naissance.a, naissance.m - 1, Math.min(naissance.j, n)), { day: "numeric", month: "long", year: "numeric" })}, ${ageDe(naissance, auj)} ${t("parcours.ans")}`;
  return (
    <View style={styles.date}>
      <View pointerEvents="none" style={[styles.bandeDate, { backgroundColor: champVerre[mode].fond }]} />
      <Molette
        libelle={t("parcours.jour")}
        lue={lue}
        valeurs={JOURS}
        indice={Math.min(naissance.j, n) - 1}
        onIndice={(i) => changer({ j: i + 1 })}
        texte={String}
        hors={(i) => i >= n}
        dernier={n - 1}
        vide={vide}
        largeur={72}
        bande={false}
      />
      <Molette libelle={t("parcours.mois")} lue={lue} valeurs={MOIS} indice={naissance.m - 1} onIndice={(i) => changer({ m: i + 1 })} texte={nomMois} vide={vide} largeur={148} bande={false} />
      <Molette
        libelle={t("parcours.annee")}
        lue={lue}
        valeurs={annees}
        indice={Math.max(0, annees.indexOf(naissance.a))}
        onIndice={(i) => changer({ a: annees[i]! })}
        texte={String}
        vide={vide}
        largeur={96}
        bande={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tete: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  points: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 4 },
  point: { width: 24, height: 4, borderRadius: 2 },
  passer: { marginLeft: "auto", height: 44, paddingHorizontal: 16, justifyContent: "center" },
  // Marges de 16, comme tout l'écran (revue finale, D8).
  barre: { height: 4, marginHorizontal: espace.l, borderRadius: 2, overflow: "hidden" },
  rempli: { height: 4, borderRadius: 2, overflow: "hidden", transformOrigin: "left" },
  titre: { paddingHorizontal: espace.l },
  sur: { fontFamily: police.medium, fontSize: 15, marginBottom: 6 },
  h2: { lineHeight: 30 },
  bas: { marginTop: "auto", paddingTop: 12, paddingHorizontal: 16, gap: 4 },
  champBloc: { paddingHorizontal: espace.l },
  libelle: { marginTop: 24, marginBottom: 6 },
  champ: { borderRadius: rayon.l, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  filet: { ...StyleSheet.absoluteFill, borderRadius: rayon.l, borderWidth: 1.5 },
  saisieGrande: { fontFamily: police.medium, fontSize: 20 },
  saisie: { fontFamily: police.regular, fontSize: 16 },
  age: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8 },
  date: { height: 308, marginHorizontal: 16, flexDirection: "row", justifyContent: "center", gap: 4 },
  bandeDate: { position: "absolute", left: 0, right: 0, top: 132, height: 44, borderRadius: rayon.l },
});
