import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SurfaceFeuille, useTheme } from "../theme";
import { ombreFeuille, voile as voiles } from "../theme/effets";
import { courbe, duree, geste, ressort } from "../theme/mouvement";
import { espace, rayon } from "../theme/typo";
import { reduitMouvement } from "./reduit";
import { useClavier } from "./useClavier";
import { Icone, type NomIcone } from "./Icone";
import { margeColonne } from "./largeur";
import { Texte } from "./Texte";
import { useLangue } from "../i18n/useLangue";
import { t } from "../i18n/index";

/** Glissé vers le bas qui ferme : distance (px) ou vitesse (px/ms). */
const SEUIL = 120;
const VITESSE = geste.vitesse;
const tiroir = Easing.bezier(...courbe.feuille);
const sortie = Easing.bezier(...courbe.sortie);

// Feuille du bas (DESIGN.md §6.9) : nuit fond s1, groupes s2 ; jour fond blanc, groupes s1, filet et ombre douce vers le haut.
// Se ferme en la glissant vers le bas : elle suit le doigt, le voile pâlit avec elle. Sur le pliable déplié ou une tablette, elle
// garde la largeur de la colonne de contenu (D5, ui/largeur.ts), centrée et ancrée en bas ; le voile reste pleine largeur.
export function Feuille({
  visible,
  onFermer,
  titre,
  sousTitre,
  children,
  pied,
  glisserContenu = true,
  enPage = false,
  onRetour,
}: {
  visible: boolean;
  onFermer: () => void;
  titre?: string;
  /** Ligne sous le titre (13, t2) : « 572 kcal · 3 aliments », « Déjeuner ». */
  sousTitre?: string;
  children: ReactNode;
  /** Actions fixées sous la liste, toujours visibles même quand elle défile. */
  pied?: ReactNode;
  /** Faux si le contenu a son propre défilement vertical (roue) : on ne glisse alors que par la poignée et le titre. */
  glisserContenu?: boolean;
  /** Dans la page (pas de fenêtre modale) : un geste commencé dedans peut continuer sur la page (tiroir du mois). */
  enPage?: boolean;
  /** Étape d'une feuille à plusieurs pas : flèche de retour à gauche du titre (planche exercices-perso). */
  onRetour?: () => void;
}) {
  useLangue();
  const { couleurs, mode } = useTheme();
  const ombre = ombreFeuille[mode];
  const { bottom: bas, top: haut } = useSafeAreaInsets();
  // Dans une fenêtre modale, la feuille est posée sur tout l'écran : on la rentre dans la colonne. Dans la page (`enPage`), son
  // parent est déjà la colonne.
  const { width: ecran } = useWindowDimensions();
  const marge = enPage ? 0 : margeColonne(ecran);
  const [monte, setMonte] = useState(visible);
  const hauteur = useRef(Dimensions.get("window").height);
  const ty = useRef(new Animated.Value(hauteur.current)).current;
  const enHaut = useRef(true);
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  // La fenêtre modale ne se redimensionne pas sous le clavier : la feuille monte d'elle-même au-dessus.
  const clavier = useClavier(monte);
  // Clavier ouvert, la feuille monte d'autant : sa hauteur est bornée pour que son haut reste sous la barre d'état (recette
  // du 03/11 : le formulaire d'exercice passait dessous). `cadre` : hauteur de la zone de la feuille, mesurée par le voile.
  const [cadre, setCadre] = useState(0);
  const borne = clavier && cadre ? { maxHeight: Math.min(cadre * 0.86, cadre - clavier - haut - espace.s) } : null;

  // « Réduire les animations » : pas de glissé, la feuille et le voile paraissent et s'effacent en fondu court (150 ms).
  const fondu = useRef(new Animated.Value(1)).current;
  const effacer = (fin: () => void) =>
    Animated.timing(fondu, { toValue: 0, duration: duree.sortie, easing: sortie, useNativeDriver: true }).start(({ finished }) => finished && fin());

  useEffect(() => {
    const reduit = reduitMouvement();
    if (visible) {
      setMonte(true);
      if (reduit) {
        ty.setValue(0);
        fondu.setValue(0);
        Animated.timing(fondu, { toValue: 1, duration: duree.sortie, easing: sortie, useNativeDriver: true }).start();
        return;
      }
      fondu.setValue(1);
      ty.setValue(hauteur.current);
      Animated.timing(ty, { toValue: 0, duration: duree.feuille, easing: tiroir, useNativeDriver: true }).start();
    } else if (monte) {
      if (reduit) effacer(() => setMonte(false));
      else Animated.timing(ty, { toValue: hauteur.current, duration: duree.feuilleSortie, easing: sortie, useNativeDriver: true }).start(() => setMonte(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const glisse = useMemo(() => {
    const vertical = (dx: number, dy: number) => dy > 8 && Math.abs(dy) > Math.abs(dx);
    return {
      poignee: PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => vertical(g.dx, g.dy),
        onPanResponderMove: (_, g) => ty.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => lacher(g.dy, g.vy),
        onPanResponderTerminate: () => lacher(0, 0),
      }),
      contenu: PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => enHaut.current && vertical(g.dx, g.dy),
        onPanResponderMove: (_, g) => ty.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => lacher(g.dy, g.vy),
        onPanResponderTerminate: () => lacher(0, 0),
      }),
    };
    function lacher(dy: number, vy: number) {
      if (dy > SEUIL || vy > VITESSE) {
        // Lancée vite, elle garde l'élan du doigt : le reste du trajet à sa vitesse, entre 120 et 220 ms.
        const reste = Math.max(0, hauteur.current - dy);
        const ms = Math.min(duree.feuilleSortie, Math.max(120, vy > 0 ? reste / vy : duree.feuilleSortie));
        if (reduitMouvement()) effacer(() => fermer.current());
        else Animated.timing(ty, { toValue: hauteur.current, duration: ms, easing: sortie, useNativeDriver: true }).start(() => fermer.current());
      } else {
        Animated.spring(ty, { toValue: 0, velocity: vy, useNativeDriver: true, ...ressort.retour }).start();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ty]);

  const voile = Animated.multiply(ty.interpolate({ inputRange: [0, hauteur.current], outputRange: [1, 0], extrapolate: "clamp" }), fondu);

  return (
    <Cadre enPage={enPage} monte={monte} onFermer={onFermer}>
      <Animated.View onLayout={(e) => setCadre(e.nativeEvent.layout.height)} style={[StyleSheet.absoluteFill, { opacity: voile }]}>
        <Pressable
          accessibilityLabel={t("ui.fermer")}
          onPress={onFermer}
          style={[StyleSheet.absoluteFill, { backgroundColor: voiles[mode] }]}
        />
      </Animated.View>
      <Animated.View
        onLayout={(e) => (hauteur.current = e.nativeEvent.layout.height + bas)}
        {...(glisserContenu ? glisse.contenu.panHandlers : {})}
        style={[
          styles.feuille,
          { backgroundColor: couleurs.feuilleFond, left: marge, right: marge, bottom: clavier, paddingBottom: (clavier ? 0 : bas) + espace.l, opacity: fondu, transform: [{ translateY: ty }] },
          borne,
          ombre && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: couleurs.line, boxShadow: ombre },
        ]}
      >
        <View {...glisse.poignee.panHandlers} style={styles.prise}>
          <View style={[styles.poignee, { backgroundColor: couleurs.feuillePoignee }]} />
          {titre ? (
            <Texte variante="exercice" style={[styles.titre, sousTitre ? { marginBottom: 4 } : null, onRetour ? styles.titreRetour : null]}>
              {titre}
            </Texte>
          ) : null}
          {onRetour ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("ui.retour")}
              onPress={onRetour}
              style={({ pressed }) => [styles.retour, pressed && { backgroundColor: couleurs.s3 }]}
            >
              <Icone nom="back" couleur={couleurs.t2} taille={22} />
            </Pressable>
          ) : null}
          {sousTitre ? (
            <Texte variante="corps" couleur="t2" numberOfLines={2} style={styles.sousTitre}>
              {sousTitre}
            </Texte>
          ) : null}
        </View>
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e) => (enHaut.current = e.nativeEvent.contentOffset.y <= 0)}
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ gap: espace.m }}
        >
          <SurfaceFeuille>{children}</SurfaceFeuille>
        </ScrollView>
        {pied ? (
          <View style={styles.pied}>
            <SurfaceFeuille>{pied}</SurfaceFeuille>
          </View>
        ) : null}
      </Animated.View>
    </Cadre>
  );
}

function Cadre({ enPage, monte, onFermer, children }: { enPage: boolean; monte: boolean; onFermer: () => void; children: ReactNode }) {
  if (!enPage)
    return (
      <Modal visible={monte} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onFermer}>
        {children}
      </Modal>
    );
  return monte ? (
    <View style={[StyleSheet.absoluteFill, { zIndex: 5, elevation: 5 }]} pointerEvents="box-none">
      {children}
    </View>
  ) : null;
}

export function Groupe({ children }: { children: ReactNode }) {
  const { couleurs } = useTheme();
  return <View style={[styles.groupe, { backgroundColor: couleurs.feuilleGroupe }]}>{children}</View>;
}

export function Option({
  libelle,
  icone,
  visuel,
  onPress,
  danger,
  choisi,
  aide,
  premier,
  valeur,
  chevron,
}: {
  libelle: string;
  icone?: NomIcone;
  /** Un dessin à la place de l'icône (picto de barre). */
  visuel?: ReactNode;
  /** Sans geste : une ligne qui dit un état (« Tu l'as signalée »), ni bouton ni retour au toucher. */
  onPress?: () => void;
  danger?: boolean;
  choisi?: boolean;
  aide?: string;
  premier?: boolean;
  /** Valeur courante à droite (t3), avant le chevron. */
  valeur?: string;
  /** Chevron : l'option ouvre une autre feuille ou une page. */
  chevron?: boolean;
}) {
  const { couleurs } = useTheme();
  const c = danger ? couleurs.rate : couleurs.t1;
  const bordure = !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 };
  const contenu = (
    <>
      {visuel ?? (icone ? <Icone nom={icone} couleur={danger ? couleurs.rate : couleurs.t2} /> : null)}
      <View style={{ flex: 1 }}>
        <Texte variante="saisie" style={{ color: c, fontSize: 15 }}>
          {libelle}
        </Texte>
        {aide ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {aide}
          </Texte>
        ) : null}
      </View>
      {valeur ? (
        <Texte variante="corps" couleur="t3" numberOfLines={1}>
          {valeur}
        </Texte>
      ) : null}
      {choisi ? <Icone nom="check" couleur={couleurs.t1} /> : null}
      {chevron ? <Icone nom="right" couleur={couleurs.t3} taille={16} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.option, bordure]}>{contenu}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={choisi != null ? { selected: choisi } : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.option, bordure, pressed && { backgroundColor: couleurs.s3 }]}
    >
      {contenu}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  feuille: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "86%",
    borderTopLeftRadius: rayon.feuille,
    borderTopRightRadius: rayon.feuille,
    paddingHorizontal: espace.l,
  },
  prise: { minHeight: 44, paddingTop: espace.s },
  poignee: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: espace.m },
  titre: { textAlign: "center", marginBottom: espace.m },
  // Titre centré entre la flèche (44 px) et sa place symétrique à droite.
  titreRetour: { minHeight: 44, lineHeight: 44, marginBottom: espace.xs, paddingHorizontal: 44 },
  retour: { position: "absolute", left: -espace.s, top: espace.s + 4 + espace.m, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sousTitre: { textAlign: "center", marginBottom: espace.l },
  pied: { paddingTop: espace.m },
  groupe: { borderRadius: rayon.l, overflow: "hidden" },
  option: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
});
