import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { Icone, type NomIcone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { Texte } from "../ui/Texte";

// Pages de réglages du profil (planche profil, direction A ; grammaire de Connexion IA) : sections en capitales t3,
// groupes arrondis 12 à 16 px des bords, lignes de 56 px (libellé 15, valeur t2, chevron t3), filet line2 entre deux lignes.

/** Titre de section : capitales 11/600 t3, au-dessus d'un groupe. */
export function SectionReglages({ titre, premiere, style }: { titre: string; premiere?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <Texte variante="entete" couleur="t3" accessibilityRole="header" style={[styles.section, premiere && { paddingTop: espace.s }, style]}>
      {titre}
    </Texte>
  );
}

/** Groupe de lignes. `fond` : surface du groupe (s1 sur une page ; celle du volet dans le volet). */
export function GroupeReglages({ children, fond, style }: { children: ReactNode; fond?: string; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  // Le filet va au-dessus de chaque ligne sauf la première : les lignes absentes (null) ne comptent pas.
  const lignes = Children.toArray(children).filter(isValidElement) as ReactElement<{ premier?: boolean }>[];
  return (
    <View style={[styles.groupe, { backgroundColor: fond ?? couleurs.s1 }, style]}>
      {lignes.map((l, i) => cloneElement(l, { premier: i === 0 }))}
    </View>
  );
}

export type FinLigne = "chevron" | "externe" | "aucune";

/**
 * Ligne de réglage : icône facultative, libellé, sous-ligne t3, valeur t2 et fin (chevron, lien externe, interrupteur,
 * ou un contrôle passé en enfant). `danger` : libellé rouge centré (supprimer, révoquer), seul dans son groupe.
 */
export function LigneReglage({
  icone,
  libelle,
  apresLibelle,
  sous,
  valeur,
  fin,
  interrupteur,
  danger,
  onPress,
  premier,
  hauteur = 56,
  children,
}: {
  icone?: NomIcone;
  libelle: string;
  /** Petit élément collé au libellé (icône « actualiser » d'un service, IconeSynchro). */
  apresLibelle?: ReactNode;
  sous?: ReactNode;
  valeur?: string;
  fin?: FinLigne;
  /** `desactive` : interrupteur grisé (le dernier onglet allumé) ; la ligne ne réagit plus au toucher. */
  interrupteur?: { valeur: boolean; onChange: (v: boolean) => void; desactive?: boolean };
  danger?: boolean;
  onPress?: () => void;
  premier?: boolean;
  /** 56 sur une page, 52 dans le volet (DESIGN §6.10). */
  hauteur?: number;
  children?: ReactNode;
}) {
  const { couleurs } = useTheme();
  const finReelle: FinLigne = fin ?? (onPress && !interrupteur && !children ? "chevron" : "aucune");
  return (
    <Pressable
      accessibilityRole={interrupteur ? undefined : onPress ? "button" : undefined}
      accessibilityLabel={valeur ? `${libelle}, ${valeur}` : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ligne,
        { minHeight: hauteur },
        danger && { justifyContent: "center" },
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      {icone ? <Icone nom={icone} couleur={danger ? couleurs.rate : couleurs.t2} taille={22} /> : null}
      <View style={danger ? null : styles.texte}>
        {apresLibelle ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Texte variante="saisie" style={styles.libelle}>
              {libelle}
            </Texte>
            {apresLibelle}
          </View>
        ) : (
          <Texte variante="saisie" style={[styles.libelle, danger && { color: couleurs.rate, fontFamily: "Inter-Medium" }]}>
            {libelle}
          </Texte>
        )}
        {typeof sous === "string" ? (
          <Texte variante="corps" couleur="t3" numberOfLines={1} style={styles.sous}>
            {sous}
          </Texte>
        ) : (
          sous
        )}
      </View>
      {valeur ? (
        <Texte variante="saisie" couleur="t2" numberOfLines={1} style={styles.valeur}>
          {valeur}
        </Texte>
      ) : null}
      {children}
      {interrupteur ? <Interrupteur valeur={interrupteur.valeur} onChange={interrupteur.onChange} libelle={libelle} desactive={interrupteur.desactive} /> : null}
      {finReelle === "chevron" ? <Icone nom="right" couleur={couleurs.t3} taille={16} /> : null}
      {finReelle === "externe" ? <Icone nom="link" couleur={couleurs.t3} taille={16} /> : null}
    </Pressable>
  );
}

/** Bouton tonal au bout d'une ligne (« Autoriser », « Connecter ») : 36 de haut, zone de 44 ; s2 la nuit, blanc le jour sur le groupe gris. */
export function BoutonLigne({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const { couleurs, mode } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [styles.bouton, { backgroundColor: pressed ? couleurs.s3 : mode === "nuit" ? couleurs.s2 : couleurs.bg }]}
    >
      <Texte variante="corps" style={{ fontSize: 13, fontFamily: "Inter-SemiBold" }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

/** Sous-ligne avec un point d'état (vert plein : actif ; rond vide : éteint ; bleu `info` : à faire, DESIGN v2.2.18, D9 ;
 *  rouge `rate` : une panne qu'on peut réparer, planche menu D11). */
export function SousEtat({
  actif,
  texte,
  attention,
  erreur,
}: {
  actif: boolean;
  texte: string;
  /** Point bleu : à faire (phrase de secours pas encore notée). */
  attention?: boolean;
  /** Point rouge : à reconnecter (Whoop, Withings). */
  erreur?: boolean;
}) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.etat}>
      <View style={[styles.point, erreur ? { backgroundColor: couleurs.rate } : attention ? { backgroundColor: couleurs.info } : actif ? { backgroundColor: couleurs.valide } : { borderWidth: 1.5, borderColor: couleurs.t3 }]} />
      <Texte variante="corps" couleur="t3" numberOfLines={1} style={{ fontSize: 13, flexShrink: 1 }}>
        {texte}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: espace.l, paddingTop: espace.xl, paddingBottom: espace.s },
  groupe: { marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden" },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: espace.s, paddingLeft: espace.l, paddingRight: espace.m },
  texte: { flex: 1, minWidth: 0 },
  libelle: { fontFamily: "Inter-Regular", fontSize: 15 },
  sous: { fontSize: 13, marginTop: 2 },
  valeur: { fontFamily: "Inter-Regular", fontSize: 15, flexShrink: 1, maxWidth: "48%" },
  etat: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  point: { width: 8, height: 8, borderRadius: 4 },
  bouton: { height: 36, paddingHorizontal: 14, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
