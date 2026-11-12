// Étapes du parcours (planche ajout-seance-v2, D3 et mouvement) : une seule feuille de hauteur constante, les étapes glissent à
// l'intérieur. L'étape suivante entre par la droite en 280 ms (courbe feuille) ; l'étape quittée recule de 22 % et s'efface.
// Transform et opacité seulement ; mouvement réduit : fondu, rien ne glisse.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../theme";
import { courbe, duree } from "../../theme/mouvement";
import { cible, espace, police } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { useReduit } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";

const tiroir = Easing.bezier(...courbe.feuille);
const sortie = Easing.bezier(...courbe.sortie);
const RECUL = 0.22;

interface Contexte {
  courante: number;
  /** Étape quittée pendant la transition en cours (les autres sont posées sans animation). */
  quittee: number;
  largeur: number;
  reduit: boolean;
}

const Ctx = createContext<Contexte>({ courante: 0, quittee: 0, largeur: 0, reduit: false });

/** Zone de hauteur constante qui porte les étapes (`Etape`). */
export function Etapes({ courante, hauteur, children }: { courante: number; hauteur: number; children: ReactNode }) {
  const reduit = useReduit();
  const [largeur, setLargeur] = useState(0);
  const avant = useRef(courante);
  const quittee = useRef(courante);
  if (avant.current !== courante) {
    quittee.current = avant.current;
    avant.current = courante;
  }
  return (
    <Ctx.Provider value={{ courante, quittee: quittee.current, largeur, reduit }}>
      <View onLayout={(e) => setLargeur(e.nativeEvent.layout.width)} style={{ height: hauteur, overflow: "hidden" }}>
        {largeur > 0 ? children : null}
      </View>
    </Ctx.Provider>
  );
}

/** Une étape : rang croissant dans le sens du parcours (sport, routines, réglages, sous-réglages). */
export function Etape({ rang, children }: { rang: number; children: ReactNode }) {
  const { courante, quittee, largeur, reduit } = useContext(Ctx);
  const actif = rang === courante;
  // 0 : au centre ; 1 : à droite, pas encore venue ; −1 : à gauche, déjà passée.
  const cote = rang === courante ? 0 : rang < courante ? -1 : 1;
  const p = useRef(new Animated.Value(cote)).current;
  const [monte, setMonte] = useState(actif);
  const premiere = useRef(true);
  useEffect(() => {
    if (premiere.current) {
      premiere.current = false;
      return;
    }
    if (actif) setMonte(true);
    // Ni l'étape qui entre ni celle qui sort : posée à sa place tout de suite (pas de survol des étapes sautées).
    if (!actif && rang !== quittee) {
      p.setValue(cote);
      setMonte(false);
      return;
    }
    Animated.timing(p, {
      toValue: cote,
      duration: reduit ? 1 : actif ? duree.feuille : duree.feuilleSortie - 20,
      easing: actif ? tiroir : sortie,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !actif) setMonte(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courante]);
  const translateX = reduit ? 0 : p.interpolate({ inputRange: [-1, 0, 1], outputRange: [-RECUL * largeur, 0, largeur] });
  const opacity = p.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] });
  return (
    <Animated.View
      pointerEvents={actif ? "auto" : "none"}
      accessibilityElementsHidden={!actif}
      importantForAccessibility={actif ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateX }] }]}
    >
      {monte || actif ? children : null}
    </Animated.View>
  );
}

/**
 * En-tête d'une étape (56 de haut) : ← (44 × 44) puis un visuel et le titre, à droite une action en texte (zone de 44 de haut).
 * Sans `onRetour`, le titre part du bord (étape du sport).
 */
export function EnTete({
  titre,
  visuel,
  onRetour,
  action,
  libelleAction,
  onAction,
  icone,
  libelleIcone,
}: {
  titre: string;
  visuel?: ReactNode;
  onRetour?: () => void;
  /** Texte à droite (« Sans heure », « Non définie », « OK »). */
  action?: string;
  libelleAction?: string;
  onAction?: () => void;
  /** Icône à droite, à la place du texte (crayon de la feuille du sport). */
  icone?: "crayon";
  libelleIcone?: string;
}) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.tete}>
      {onRetour ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ui.retour")}
          onPress={onRetour}
          style={({ pressed }) => [styles.retour, pressed && { backgroundColor: couleurs.s3 }]}
        >
          <Icone nom="back" couleur={couleurs.t1} taille={22} />
        </Pressable>
      ) : null}
      {visuel}
      <Texte variante="exercice" numberOfLines={1} style={[styles.titre, !onRetour && { marginLeft: espace.xs }]}>
        {titre}
      </Texte>
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={libelleAction ?? action} onPress={onAction} style={({ pressed }) => [styles.action, pressed && { backgroundColor: couleurs.s3 }]}>
          <Texte style={{ fontFamily: police.semibold, fontSize: 14, color: couleurs.t1 }}>{action}</Texte>
        </Pressable>
      ) : null}
      {icone && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={libelleIcone} onPress={onAction} style={({ pressed }) => [styles.icone, pressed && { backgroundColor: couleurs.s3 }]}>
          <Icone nom={icone} couleur={couleurs.t1} taille={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tete: { height: 56, flexDirection: "row", alignItems: "center" },
  retour: { width: cible.min, height: cible.min, marginLeft: -espace.s, borderRadius: cible.min / 2, alignItems: "center", justifyContent: "center" },
  titre: { flex: 1, minWidth: 0, marginLeft: espace.s },
  action: { minWidth: cible.min, height: cible.min, paddingHorizontal: espace.m, marginRight: -espace.m, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  icone: { width: cible.min, height: cible.min, marginRight: -espace.m, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
