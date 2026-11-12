// Briques de la précision pepfit (planche precision, sections 1, 2 et 7) : la jauge (piste bleue translucide, remplissage
// dégradé pep, encoches aux seuils), les quatre traits et leur mot, les lignes des groupes (filet en retrait de 50), les
// titres de section avec leur colonne « Précision ».
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useTheme } from "../../theme";
import { degrades, type Arret } from "../../theme/effets";
import { avecOpacite } from "../../theme/teintes";
import { police, rayon } from "../../theme/typo";
import { useCouleurPartie, useOmbreCarte } from "../../ui/ContextePartie";
import { FondDegrade } from "../../ui/Degrade";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { PRECISIONS, type Precision } from "../energie-precision";

/** Remplissage : le dégradé pep (Accueil) de gauche à droite, 0, 60 et 100 % ; le même partout, volet compris. */
const ac = degrades.accueil.arrets;
export const ARRETS_JAUGE: Arret[] = [
  { offset: 0, couleur: ac[0]!.couleur },
  { offset: 0.6, couleur: ac[1]!.couleur },
  { offset: 1, couleur: ac[2]!.couleur },
];

/**
 * Jauge de 6 (carte) ou 8 (page) : piste bleue translucide, remplissage dégradé, encoches de 2 aux seuils, de la couleur du
 * fond qui la porte. `progres` : valeur animée (passage de cap) ; sinon `valeur`.
 */
export function Jauge({
  valeur,
  progres,
  encoches,
  hauteur = 6,
  fond,
  arrets = ARRETS_JAUGE,
  piste,
  lueur,
  style,
}: {
  valeur: number;
  progres?: SharedValue<number>;
  encoches: readonly number[];
  hauteur?: number;
  /** Couleur des encoches : le fond de la carte ou de la page. */
  fond: string;
  arrets?: readonly Arret[];
  /** Couleur de la piste (par défaut, le bleu pep translucide). */
  piste?: string;
  /** Lueur posée sur une encoche (passage de cap). */
  lueur?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { couleurs, mode } = useTheme();
  const animee = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(100, progres ? progres.value : valeur))}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(valeur) }}
      style={[{ height: hauteur, borderRadius: hauteur / 2, backgroundColor: piste ?? avecOpacite(couleurs.partieAccueil, mode === "nuit" ? 0.2 : 0.14) }, style]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: hauteur / 2, overflow: "hidden" }]}>
        <Animated.View style={[styles.remplissage, { borderRadius: hauteur / 2 }, animee]}>
          <FondDegrade arrets={arrets} angle={90} />
        </Animated.View>
        {encoches.map((x) => (
          <View key={x} style={[styles.encoche, { left: `${x}%`, backgroundColor: fond }]} />
        ))}
      </View>
      {lueur}
    </View>
  );
}

/** Quatre traits qui montent (3 de large, 4 à 10 de haut), ceux atteints en t2 ; `taille` du texte : 12 (13 dans une feuille). */
export function Traits({ niveau }: { niveau: Precision }) {
  const { couleurs } = useTheme();
  const rang = PRECISIONS.indexOf(niveau);
  return (
    <View style={styles.traits}>
      {PRECISIONS.map((p, i) => (
        <View key={p} style={{ width: 3, height: 4 + i * 2, borderRadius: 1, backgroundColor: i <= rang ? couleurs.t2 : couleurs.line2 }} />
      ))}
    </View>
  );
}

/** Les traits et un mot (12, t3) : la colonne « Précision » de « Tes calculs ». */
export function Niveau({ niveau, texte, grand }: { niveau: Precision; texte: string; grand?: boolean }) {
  return (
    <View style={styles.niveau}>
      <Traits niveau={niveau} />
      <Texte variante="meta" couleur={grand ? "t2" : "t3"} numberOfLines={1} style={grand ? { fontSize: 13 } : null}>
        {texte}
      </Texte>
    </View>
  );
}

/** « En attente » : le cercle en pointillés de 14 et le mot (ou le cap qu'il faut). */
export function Attente({ texte }: { texte: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.niveau}>
      <Icone nom="attente" couleur={couleurs.t3} taille={14} />
      <Texte variante="meta" couleur="t3" numberOfLines={1}>
        {texte}
      </Texte>
    </View>
  );
}

/** Titre de section (11/600, capitales, t3) et sa colonne à droite (12, t3). */
export function SectionP({ titre, droite, style }: { titre: string; droite?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <Texte variante="entete" couleur="t3" accessibilityRole="header">
        {titre}
      </Texte>
      {droite ? (
        <Texte variante="meta" couleur="t3">
          {droite}
        </Texte>
      ) : null}
    </View>
  );
}

/** Groupe arrondi (12, à 16 des bords) ; `fond` : s1 sur la page, feuilleGroupe dans une feuille. */
export function GroupeP({ children, fond, style }: { children: ReactNode; fond?: string; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  const ombre = useOmbreCarte();
  return <View style={[styles.groupe, { backgroundColor: fond ?? couleurs.s1 }, !fond && ombre ? { boxShadow: ombre } : null, style]}>{children}</View>;
}

/**
 * Ligne d'un groupe (56 au moins) : icône 20 t2, titre 15 et sa ligne 13 t2, puis à droite un gain en bleu, un indice, une
 * valeur ou une coche ; chevron t3 si elle mène quelque part. Filet en retrait (de 50) au-dessus, sauf la première.
 */
export function LigneP({
  icone,
  couleurIcone,
  titre,
  sous,
  gain,
  valeur,
  droite,
  coche,
  attenuee,
  premiere,
  onPress,
  libelle,
}: {
  icone?: NomIcone;
  /** Couleur de l'icône (t2 ; la coche verte de « Déjà là »). */
  couleurIcone?: string;
  titre: string;
  sous?: string;
  gain?: string | null;
  valeur?: string;
  droite?: ReactNode;
  coche?: boolean;
  /** Titre en t2 (lecture en attente). */
  attenuee?: boolean;
  premiere?: boolean;
  onPress?: () => void;
  libelle?: string;
}) {
  const { couleurs } = useTheme();
  const bleu = useCouleurPartie();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={libelle ?? [titre, sous, gain, valeur].filter(Boolean).join(", ")}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.s3 }]}
    >
      {premiere ? null : <View style={[styles.filet, { borderTopColor: couleurs.line }]} />}
      {icone ? <Icone nom={icone} couleur={couleurIcone ?? couleurs.t2} taille={20} epaisseur={couleurIcone ? 2.25 : 1.75} /> : null}
      <View style={styles.texte}>
        <Texte variante="corps" couleur={attenuee ? "t2" : "t1"} style={styles.titre}>
          {titre}
        </Texte>
        {sous ? (
          <Texte variante="corps" couleur="t2" style={styles.sous}>
            {sous}
          </Texte>
        ) : null}
      </View>
      {gain ? (
        <Texte variante="corps" style={[styles.gain, { color: bleu }]}>
          {gain}
        </Texte>
      ) : null}
      {valeur ? (
        <Texte variante="corps" couleur="t2" style={styles.valeur}>
          {valeur}
        </Texte>
      ) : null}
      {droite}
      {coche ? <Icone nom="check" couleur={couleurs.valide} taille={20} epaisseur={2.25} /> : null}
      {onPress ? (
        <View style={{ marginLeft: -6 }}>
          <Icone nom="right" couleur={couleurs.t3} taille={16} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  remplissage: { position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" },
  encoche: { position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1 },
  traits: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 10 },
  niveau: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  section: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 20, paddingBottom: 8, paddingHorizontal: 16 },
  groupe: { marginHorizontal: 16, borderRadius: rayon.l, overflow: "hidden" },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8, paddingLeft: 16, paddingRight: 12 },
  filet: { position: "absolute", top: 0, left: 50, right: 0, borderTopWidth: 0.5 },
  texte: { flex: 1, minWidth: 0, gap: 2 },
  titre: { fontSize: 15, lineHeight: 20 },
  sous: { fontSize: 13, lineHeight: 17 },
  gain: { fontSize: 15, fontFamily: police.semibold, fontVariant: ["tabular-nums"] },
  valeur: { fontSize: 15, fontVariant: ["tabular-nums"] },
});
