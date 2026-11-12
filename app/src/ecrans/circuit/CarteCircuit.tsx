import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Canvas, Circle, DashPathEffect, Path } from "@shopify/react-native-skia";
import { morceauxCircuit, type VueCircuit } from "../../circuits/vue";
import type { Point, TypeCircuit } from "../../circuits/types";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, rayon, TAILLE_MIN } from "../../theme/typo";
import { largeurContenu } from "../../ui/CadreContenu";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { ligneDe } from "../BlocEffort";
import { FondCarte } from "../FondCarte";
import { projeter, vueProjection } from "../suivi-direct-vue";

// Le tracé d'un circuit sur son fond de carte (planche Circuits, page : la carte sous le nom). Le même fond fixe que la séance passée
// (FondCarte : Positron d'OpenFreeMap recoloré, aucun geste), le tracé par-dessus en couleurs d'altitude (la rampe d'une sortie
// terminée : turquoise en bas, jaune en haut), le départ en rond, l'arrivée en drapeau pour un circuit linéaire. Sans réseau, le fond
// uni et « Fond de carte indisponible » : le tracé reste. Le même composant sert la page et la couverture sans photo (D14), et l'aperçu d'un
// nouveau circuit (planche, « Nouveau circuit »), qui y ajoute `autour` : ce qui ne part jamais (le début et la fin de la sortie, en pointillé,
// avec la pastille « Coupé ») et le lieu perso que le tracé frôle (un anneau rouge et « Près de ton domicile »). Ces repères restent sur le téléphone.

/** Ce que l'aperçu d'un nouveau circuit pose autour du tracé gardé. */
export interface AutourCarte {
  /** Les morceaux coupés, en pointillé gris, rattachés au tracé gardé. */
  pointilles?: readonly (readonly Point[])[];
  /** Le lieu perso que le tracé gardé frôle (à moins de 150 m) : jamais montré sur une carte publique. */
  domicile?: Point | null;
}

export function CarteCircuit({
  vue,
  type,
  hauteur,
  largeur,
  marge = 28,
  haut = 28,
  trait = 4,
  arrondi = rayon.xl,
  libelle,
  onOuvrir,
  entre,
  autour,
}: {
  vue: VueCircuit;
  type: TypeCircuit;
  hauteur: number;
  /** Connue (la couverture occupe tout l'écran) ; sinon mesurée sur la colonne, comme le bloc d'effort. */
  largeur?: number;
  /** Place gardée sur les côtés et en bas, et au-dessus du tracé (sous la barre d'une couverture). */
  marge?: number;
  haut?: number;
  trait?: number;
  arrondi?: number;
  libelle?: string;
  /** La carte se touche pour s'ouvrir en plein écran : la puce en coin le dit. Sans geste, la carte est une image. */
  onOuvrir?: () => void;
  /** Posé entre le fond de carte et le tracé (le voile sombre d'une couverture : il ne ternit pas le trait). */
  entre?: ReactNode;
  autour?: AutourCarte;
}) {
  const { couleurs } = useTheme();
  const [mesuree, setMesuree] = useState(() => Math.max(0, Math.round(largeurContenu()) - 2 * espace.l));
  const [sansFond, setSansFond] = useState(false);
  const l = largeur ?? mesuree;
  // Le cadre contient aussi ce qui est autour (la sortie entière, le domicile) : le tracé gardé ne remplit plus tout, comme sur la planche.
  const tous = useMemo(() => (autour ? [...vue.points, ...(autour.pointilles ?? []).flat(), ...(autour.domicile ? [autour.domicile] : [])] : vue.points), [vue.points, autour]);
  const xyTous = useMemo(() => projeter(tous, l, hauteur, marge, haut), [tous, l, hauteur, marge, haut]);
  const xy = useMemo(() => xyTous.slice(0, vue.points.length), [xyTous, vue.points.length]);
  const fond = useMemo(() => vueProjection(tous, l, hauteur, marge, haut), [tous, l, hauteur, marge, haut]);
  const morceaux = useMemo(
    () => morceauxCircuit(vue.alts, xy.length, couleurs.altBas, couleurs.altHaut, couleurs.t3).map((m) => ({ chemin: ligneDe(xy, m.a, m.b), couleur: m.couleur })),
    [vue.alts, xy, couleurs.altBas, couleurs.altHaut, couleurs.t3],
  );
  // Les points de `autour` dans l'ordre où `tous` les a posés : les morceaux coupés, puis le domicile.
  const coupes = useMemo(() => {
    let i = vue.points.length;
    return (autour?.pointilles ?? []).map((m) => {
      const pts = xyTous.slice(i, i + m.length);
      i += m.length;
      return pts.length >= 2 ? ligneDe(pts) : null;
    });
  }, [autour, xyTous, vue.points.length]);
  const maison = autour?.domicile ? xyTous[xyTous.length - 1] : undefined;
  const premierCoupe = autour?.pointilles?.[0]?.length ? xyTous[vue.points.length] : undefined;
  const depart = xy[0];
  const arrivee = xy[xy.length - 1];
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setMesuree((x) => (x === w ? x : w));
  };

  return (
    <Pressable
      accessibilityRole={onOuvrir ? "button" : "image"}
      accessibilityLabel={libelle ?? t(onOuvrir ? "circuit.carte.agrandir" : "circuit.carte.libelle")}
      disabled={!onOuvrir}
      onPress={onOuvrir}
      onLayout={largeur == null ? onLayout : undefined}
      style={[styles.cadre, { height: hauteur, borderRadius: arrondi, backgroundColor: couleurs.s1 }]}
    >
      {fond && l > 0 ? <FondCarte vue={fond} onIndisponible={() => setSansFond(true)} /> : null}
      {entre}
      {l > 0 ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          {morceaux.map((m, i) => (
            <Path key={i} path={m.chemin} style="stroke" strokeWidth={trait} strokeCap="round" strokeJoin="round" color={m.couleur} />
          ))}
          {coupes.map((c, i) =>
            c ? (
              <Path key={`c${i}`} path={c} style="stroke" strokeWidth={2.5} strokeCap="round" strokeJoin="round" color={couleurs.t3}>
                <DashPathEffect intervals={[3, 7]} />
              </Path>
            ) : null,
          )}
          {maison ? (
            <>
              <Circle cx={maison.x} cy={maison.y} r={13} color={couleurs.bg} />
              <Circle cx={maison.x} cy={maison.y} r={13} style="stroke" strokeWidth={3} color={couleurs.rate} />
              <Circle cx={maison.x} cy={maison.y} r={4} color={couleurs.rate} />
            </>
          ) : null}
          {depart ? (
            <>
              <Circle cx={depart.x} cy={depart.y} r={11} color={couleurs.bg} />
              <Circle cx={depart.x} cy={depart.y} r={11} style="stroke" strokeWidth={3} color={couleurs.altBas} />
              <Circle cx={depart.x} cy={depart.y} r={4} color={couleurs.t1} />
            </>
          ) : null}
        </Canvas>
      ) : null}
      {type === "lineaire" && arrivee && l > 0 ? (
        <View pointerEvents="none" style={[styles.drapeau, { left: arrivee.x - 14, top: arrivee.y - 14, backgroundColor: couleurs.t1 }]} accessibilityLabel={t("circuit.carte.arrivee")}>
          <Icone nom="drapeau" couleur={couleurs.bg} taille={14} />
        </View>
      ) : null}
      {premierCoupe && l > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.coupe, { left: Math.max(espace.s, Math.min(l - 92, premierCoupe.x - 10)), top: Math.max(espace.s, premierCoupe.y - 34), backgroundColor: couleurs.bg }]}
          accessibilityLabel={t("circuit.nouveau.coupeLue")}
        >
          <Icone nom="oeilBarre" couleur={couleurs.t2} taille={14} />
          <Texte variante="meta" couleur="t2" style={styles.coupeTexte}>
            {t("circuit.nouveau.coupe")}
          </Texte>
        </View>
      ) : null}
      {maison && l > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.coupe, { left: Math.max(espace.s, Math.min(l - 168, maison.x - 20)), top: Math.max(espace.s, maison.y - 42), backgroundColor: couleurs.bg }]}
          accessibilityLabel={t("circuit.nouveau.pres")}
        >
          <Icone nom="domicile" couleur={couleurs.rate} taille={14} />
          <Texte variante="meta" style={[styles.coupeTexte, { color: couleurs.t1 }]}>
            {t("circuit.nouveau.pres")}
          </Texte>
        </View>
      ) : null}
      {sansFond ? (
        <Texte variante="meta" couleur="t3" style={styles.sansFond} pointerEvents="none">
          {t("circuit.carte.indisponible")}
        </Texte>
      ) : null}
      {onOuvrir ? (
        <View pointerEvents="none" style={[styles.puce, { backgroundColor: couleurs.bg }]} importantForAccessibility="no-hide-descendants">
          <Icone nom="agrandir" couleur={couleurs.t1} taille={16} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cadre: { width: "100%", overflow: "hidden" },
  drapeau: { position: "absolute", width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sansFond: { position: "absolute", left: espace.m, bottom: espace.s + 2, fontSize: TAILLE_MIN + 1 },
  // 32 de dessin dans une carte entière à toucher : la zone de toucher est celle de la carte, bien au-delà de 44.
  coupe: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 5, height: 26, paddingHorizontal: 9, borderRadius: 13 },
  coupeTexte: { fontSize: 12, lineHeight: 16 },
  puce: { position: "absolute", top: espace.s, right: espace.s, width: 32, height: 32, borderRadius: rayon.m, alignItems: "center", justifyContent: "center" },
});
