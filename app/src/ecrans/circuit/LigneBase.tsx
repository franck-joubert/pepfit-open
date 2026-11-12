// La ligne d'un objet de Découvrir (planche planche-decouvrir, l3, et planche Circuits, « Ce que donne un circuit à découvrir ») : le gabarit
// commun d'un lieu et d'un circuit. Vignette de 56 à gauche, le texte au milieu (posé par l'appelant), la distance à droite, un chevron sur la
// carte de prévisualisation. Un seul gabarit : LigneLieu et LigneCircuit ne dessinent que leur vignette et leur texte. Toute la ligne se touche ;
// la ligne touchée se teinte (planche : .dl.appui), sans bouger son contenu.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { useCouleurPartie } from "../../ui/ContextePartie";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";

export const VIGNETTE = 56;

/** `enCarte` : la carte de prévisualisation de la vue carte (planche : .pv) ; la ligne est la même, posée sur un fond plein, avec un chevron. */
export function LigneBase({
  vignette,
  distance,
  accessibilite,
  onOuvrir,
  onToucher,
  chevron = false,
  enCarte = false,
  coche = false,
  children,
}: {
  vignette: ReactNode;
  /** « 0,4 km » à droite ; null : rien (« Mes circuits » n'a pas de distance). */
  distance: string | null;
  accessibilite: string;
  onOuvrir: () => void;
  /** Dès le doigt posé (avant le relâché) : de quoi préparer la page qui va s'ouvrir. */
  onToucher?: () => void;
  chevron?: boolean;
  enCarte?: boolean;
  /** La ligne est celle qui est choisie (feuille « Suivre un circuit ») : une coche à l'accent après la distance. */
  coche?: boolean;
  children: ReactNode;
}) {
  const { couleurs } = useTheme();
  const acc = useCouleurPartie();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilite}
      accessibilityState={coche ? { selected: true } : undefined}
      onPress={onOuvrir}
      onPressIn={onToucher}
      // La ligne touchée s'étend de 12 de chaque côté (planche : .dl.appui) sans bouger son contenu.
      style={({ pressed }) => [
        gabarit.ligne,
        enCarte && [gabarit.carte, { backgroundColor: pressed ? couleurs.s2 : couleurs.s1, borderColor: couleurs.line }],
        !enCarte && pressed && { backgroundColor: couleurs.s2 },
      ]}
    >
      {vignette}
      <View style={gabarit.texte}>{children}</View>
      {distance ? (
        <Texte variante="corps" couleur="t2" numberOfLines={1} style={gabarit.distance}>
          {distance}
        </Texte>
      ) : null}
      {coche ? <Icone nom="check" couleur={acc} taille={22} /> : null}
      {chevron || enCarte ? <Icone nom="right" couleur={couleurs.t3} taille={18} /> : null}
    </Pressable>
  );
}

/** Le gabarit, repris par les lignes d'attente (le même, sans texte). */
export const gabarit = StyleSheet.create({
  ligne: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 5, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 12 },
  // Sur la carte : pas de marge négative, un fond plein, un filet et une ombre (la carte flotte sur le fond de carte).
  carte: { marginHorizontal: 0, paddingVertical: 10, paddingLeft: 10, paddingRight: 8, gap: 12, borderRadius: 12, borderWidth: 1, elevation: 6, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  vignette: { width: VIGNETTE, height: VIGNETTE, borderRadius: 16, overflow: "hidden" },
  ligneAttente: { paddingVertical: 4 },
  centre: { alignItems: "center", justifyContent: "center" },
  texte: { flex: 1, minWidth: 0, gap: 1 },
  distance: { marginLeft: espace.xs },
});
