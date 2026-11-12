import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { degrades } from "../theme/effets";
import { FondDegrade } from "./Degrade";
import { espace, police, rayon } from "../theme/typo";
import { Icone, type NomIcone } from "./Icone";
import { Appui } from "./mouvement";
import { useVolet } from "./contexte-volet";
import { Texte } from "./Texte";
import { useLangue } from "../i18n/useLangue";
import { t } from "../i18n/index";
import { revenir } from "./revenir";

// Briques d'écran de la base v2.2 : apphead (titre d'onglet), topbar (retour + titre), pastille, bouton icône.
// Les onglets sont dans la barre du bas (MenuFlottant.tsx) ; l'avatar en tête d'onglet ouvre le volet du profil (Volet.tsx).

export function BoutonIcone({
  nom,
  libelle,
  onPress,
  couleur,
  taille = 22,
}: {
  nom: NomIcone;
  libelle: string;
  onPress: () => void;
  couleur?: string;
  taille?: number;
}) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      style={({ pressed }) => [styles.boutonIcone, pressed && { backgroundColor: couleurs.s2 }]}
    >
      <Icone nom={nom} couleur={couleur ?? couleurs.t2} taille={taille} />
    </Appui>
  );
}

/** Rond de l'avatar : silhouette blanche sur le dégradé bleu du global (27/10), faute de photo. */
export function RondAvatar({ taille = 32 }: { taille?: number }) {
  const bleu = degrades.accueil;
  return (
    <View style={[styles.avatar, { width: taille, height: taille, borderRadius: taille / 2 }]}>
      <FondDegrade arrets={bleu.arrets} />
      <Icone nom="user" couleur={bleu.sur} taille={Math.round(taille * 0.56)} />
    </View>
  );
}

/** Avatar du compte (rond de 32, zone de 44) : ouvre le volet du profil. */
function Avatar() {
  useLangue();
  const { ouvrir } = useVolet();
  return (
    <Appui accessibilityRole="button" accessibilityLabel={t("ui.monCompte")} onPress={ouvrir} style={styles.avatarZone}>
      {({ pressed }) => (
        <View style={pressed && { opacity: 0.8 }}>
          <RondAvatar />
        </View>
      )}
    </Appui>
  );
}

/**
 * En-tête d'un onglet : titre 20 / 600, actions à droite (64 de haut). L'avatar (il ouvre le volet du profil) n'est que sur
 * l'Accueil (`avatar`, teintes-parties du 29/10) ; ailleurs, le titre s'aligne sur le bord des cartes, à 16, et le volet
 * s'ouvre par le glissé depuis le bord gauche.
 */
export function TeteOnglet({ titre, avatar = false, children }: { titre: ReactNode; avatar?: boolean; children?: ReactNode }) {
  // 8 de l'en-tête + 8 : le titre à 16 du bord, comme les cartes ; à côté de l'avatar, 4.
  const marge = avatar ? espace.xs : espace.s;
  return (
    <View style={styles.apphead}>
      {avatar ? <Avatar /> : null}
      {typeof titre === "string" ? (
        <Texte variante="titre" accessibilityRole="header" style={{ flex: 1, marginLeft: marge }}>
          {titre}
        </Texte>
      ) : (
        <View style={{ flex: 1, marginLeft: marge }}>{titre}</View>
      )}
      {children}
    </View>
  );
}

/** « OK » d'un mode Modifier (retours du 28/10) : noir légèrement translucide, texte blanc, jour comme nuit ; à 16 du bord
 *  droit (8 de l'en-tête + 8 ici), comme les cartes. */
export function BoutonOk({ onPress }: { onPress: () => void }) {
  useLangue();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ok, { backgroundColor: pressed ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.78)" }]}>
      <Texte variante="exercice" style={{ fontSize: 15, color: "#ffffff" }}>
        {t("accueil.modifier.ok")}
      </Texte>
    </Pressable>
  );
}

/** Barre du haut d'un écran empilé : ← ou ✕, titre, actions (56 de haut). */
export function BarreHaut({
  titre,
  sousTitre,
  retour = "back",
  sansRetour = false,
  onRetour,
  onPressTitre,
  libelleTitre,
  milieu,
  children,
}: {
  /** Texte, ou texte composé (titre et son complément sur la même ligne). */
  titre?: ReactNode;
  /** Un champ de saisie à la place du titre (la recherche) : il prend la largeur, à 16 du bord droit. */
  milieu?: ReactNode;
  sousTitre?: ReactNode;
  retour?: NomIcone;
  /** Écran racine (profil ouvert depuis la pastille avatar) : pas de flèche de retour. */
  sansRetour?: boolean;
  onRetour?: () => void;
  /** Rend le bloc titre + sous-titre touchable (zone pleine hauteur de la barre). */
  onPressTitre?: () => void;
  libelleTitre?: string;
  children?: ReactNode;
}) {
  useLangue();
  return (
    <View style={styles.topbar}>
      {sansRetour ? null : <BoutonIcone nom={retour} libelle={retour === "close" ? t("ui.fermer") : t("ui.retour")} onPress={onRetour ?? revenir} />}
      {milieu ? (
        <View style={{ flex: 1, marginLeft: 2, marginRight: espace.s }}>{milieu}</View>
      ) : (
        <Pressable
          accessibilityRole={onPressTitre ? "button" : undefined}
          accessibilityLabel={onPressTitre ? libelleTitre : undefined}
          disabled={!onPressTitre}
          onPress={onPressTitre}
          style={{ flex: 1, marginLeft: sansRetour ? espace.m : espace.xs, justifyContent: "center", height: 56 }}
        >
          {titre ? (
            <Texte variante="exercice" numberOfLines={1} accessibilityRole="header">
              {titre}
            </Texte>
          ) : null}
          {sousTitre ? (
            <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ fontVariant: ["tabular-nums"] }}>
              {sousTitre}
            </Texte>
          ) : null}
        </Pressable>
      )}
      {children}
    </View>
  );
}

/**
 * Pastille tonale « Repos 2 min » (32 de haut, zone de clic 44). `visuel` : un dessin à la place de l'icône (picto de barre) ;
 * `deroulant` : chevron après le libellé, la pastille ouvre un choix.
 */
export function Pastille({
  icone,
  visuel,
  libelle,
  valeur,
  deroulant,
  onPress,
}: {
  icone?: NomIcone;
  visuel?: ReactNode;
  libelle: string;
  /** Mot fort après le libellé (« Visé : Dur ») : en gras, couleur du texte principal. */
  valeur?: string;
  deroulant?: boolean;
  onPress: () => void;
}) {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="button" accessibilityLabel={valeur ? `${libelle} ${valeur}` : libelle} onPress={onPress} hitSlop={6} style={styles.pastilleZone}>
      {({ pressed }) => (
        <View style={[styles.pastille, { backgroundColor: pressed ? couleurs.s3 : couleurs.s2 }]}>
          {visuel ?? (icone ? <Icone nom={icone} couleur={couleurs.t2} taille={16} /> : null)}
          <Texte variante="corps" couleur="t2">
            {libelle}
            {valeur ? (
              <Texte variante="corps" style={{ color: couleurs.t1, fontFamily: police.semibold }}>
                {` ${valeur}`}
              </Texte>
            ) : null}
          </Texte>
          {deroulant ? <Icone nom="down" couleur={couleurs.t2} taille={16} /> : null}
        </View>
      )}
    </Appui>
  );
}

/** Ligne touchable générique (filet en bas). */
export function Ligne({ onPress, children, style }: { onPress?: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: couleurs.line },
        pressed && { backgroundColor: couleurs.s1 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ok: { minWidth: 64, height: 44, marginRight: espace.s, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", paddingHorizontal: espace.l },
  boutonIcone: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  apphead: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: espace.s, paddingRight: espace.s },
  avatarZone: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  avatar: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  topbar: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: espace.s },
  pastilleZone: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  pastille: { height: 32, borderRadius: rayon.m, paddingHorizontal: espace.m, flexDirection: "row", alignItems: "center", gap: 6 },
});
