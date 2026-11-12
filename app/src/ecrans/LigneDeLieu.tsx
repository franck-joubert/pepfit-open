import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { Icone, type NomIcone } from "../ui/Icone";
import { ImageLieu } from "../ui/ImageLieu";
import { Texte } from "../ui/Texte";

// LA ligne d'un lieu (08/11 : un seul composant par objet) : le sélecteur « Lieu de la séance », Mes lieux, la séance prévue.
// À gauche l'AVATAR du lieu (le picto de son type : ui/ImageLieu, la même fonction partout, fond plein, jamais d'opacité
// réduite). Puis le nom, puis le sous-titre (règle unique : salles/sous-titre-lieu.ts ; en
// « Autour de moi », la distance devant). Les lignes d'action du sélecteur (« Ajouter un lieu », « Ne pas définir ») gardent leur
// tuile à picto, sans avatar.

/** Nom avec la partie recherchée en gras. */
function Surligne({ texte, q, leger }: { texte: string; q: string; leger: boolean }) {
  const i = q ? texte.toLowerCase().indexOf(q.trim().toLowerCase()) : -1;
  const style = { fontFamily: leger ? police.regular : police.medium, fontSize: 15 };
  if (i < 0) return <Texte variante="saisie" numberOfLines={1} style={[style, { flexShrink: 1 }]}>{texte}</Texte>;
  const n = q.trim().length;
  return (
    <Texte variante="saisie" numberOfLines={1} style={[style, { flexShrink: 1 }]}>
      {texte.slice(0, i)}
      <Texte variante="saisie" style={{ fontFamily: police.semibold, fontSize: 15 }}>
        {texte.slice(i, i + n)}
      </Texte>
      {texte.slice(i + n)}
    </Texte>
  );
}

export function LigneDeLieu({ icone, avatar = false, nom, q = "", sous, distance, fin, onPress, action, leger = false, carte = false, filet = false, marge = espace.l }: {
  icone: NomIcone;
  /** Avatar du lieu (ImageLieu) ; absent : une tuile à picto (lignes d'action). */
  avatar?: boolean;
  nom: string;
  /** Partie du nom à mettre en gras (recherche). */
  q?: string;
  sous?: string | null;
  distance?: string;
  fin?: "check" | "right";
  onPress?: () => void;
  action?: { libelle: string; onPress: () => void };
  /** Nom en regular (« Ajouter un lieu »). */
  leger?: boolean;
  /** Dans une carte de réglages (Mes lieux) : fond de la carte, tuile un cran au-dessus. */
  carte?: boolean;
  /** Filet au-dessus (toutes les lignes d'une carte sauf la première). */
  filet?: boolean;
  /** Marge à gauche et à droite (16 ; 20 sur l'écran de départ). */
  marge?: number;
}) {
  const { couleurs } = useTheme();
  const fond = carte ? couleurs.s1 : couleurs.bg;
  const appuye = carte ? couleurs.s2 : couleurs.s1;
  const lu = [nom, distance, sous].filter(Boolean).join(", ");
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={fin === "check" ? { selected: true } : undefined}
      accessibilityLabel={action ? undefined : lu}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ligne,
        { backgroundColor: pressed && onPress ? appuye : fond, paddingHorizontal: marge },
        filet && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
      ]}
    >
      {avatar ? (
        <ImageLieu picto={icone} taillePicto={20} style={styles.tuile} />
      ) : (
        <View style={[styles.tuile, { backgroundColor: carte ? couleurs.s2 : couleurs.s1 }]}>
          <Icone nom={icone} couleur={couleurs.t2} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Surligne texte={nom} q={q} leger={leger || !!q} />
        {sous || distance ? (
          // Deux lignes à côté d'un bouton (« Réessayer ») : la cause de l'erreur était coupée au milieu (recette du 03/11).
          <Texte variante="meta" couleur="t3" numberOfLines={action ? 2 : 1} style={{ marginTop: 2 }}>
            {distance ? <Texte variante="meta" couleur="t2" style={{ fontFamily: police.medium }}>{distance}</Texte> : null}
            {distance && sous ? ", " : ""}
            {sous}
          </Texte>
        ) : null}
      </View>
      {fin ? <Icone nom={fin} couleur={fin === "check" ? couleurs.t1 : couleurs.t3} /> : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.action, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }]}
        >
          <Texte variante="saisie" style={{ fontSize: 14, color: couleurs.btnTonalTexte }}>
            {action.libelle}
          </Texte>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: espace.s },
  tuile: { width: 40, height: 40, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  action: { height: 44, paddingHorizontal: espace.l, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
