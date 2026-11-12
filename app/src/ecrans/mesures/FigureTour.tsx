// Le personnage (l'homme des pictos, piste I, ou la femme peinte de la planche mensurations-femme : D4 ; vues de face et de
// dos) et le mètre ruban (planche mensurations, proto.js `scene`) :
// la zone du tour s'allume en rose sur le corps seul (le calque de la zone est découpé par la silhouette, puis fondu en
// « couleur » la nuit et en « produit » le jour), le mètre l'entoure (moitié arrière en pointillé derrière le corps, moitié
// avant graduée devant), les tours déjà pris restent en trait fin. Une étape : la carte cadre la zone et le cadrage glisse
// d'une étape à l'autre (320 ms, courbe déplacement ; face ↔ dos en fondu de 200 ms) ; sans tour : le personnage entier
// (récapitulatif), les tours s'allument de haut en bas (200 ms chacun, 40 ms d'écart). Mouvement réduit : fondus de 150 ms.
import { useEffect } from "react";
import { Canvas, DashPathEffect, Group, Image as ImageSkia, Paint, Path, Rect, BlurMask, useImage, type SkImage } from "@shopify/react-native-skia";
import { useDerivedValue, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { useTheme } from "../../theme";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { anneauDeFace, cadrage, cadrageEntier, FIGURES, ORDRE_TOURS, persoDe, ZONES, zoneDe, type Anneau, type Perso, type Repere, type Tour, type Vue, type Zone } from "./tours-calc";

const IMAGES: Record<Perso, Record<Vue, number>> = {
  h: { face: require("../../../assets/images/mensurations/face.webp"), dos: require("../../../assets/images/mensurations/dos.webp") },
  f: { face: require("../../../assets/images/mensurations/femme-face.webp"), dos: require("../../../assets/images/mensurations/femme-dos.webp") },
};

/** Durées de la planche (NOTES, Mouvement). */
export const MOUVEMENT_FIGURE = { cadrageMs: 320, vueMs: 200, reduitMs: 150, allumeMs: 200, ecartMs: 40 } as const;

/** Demi-anneau : avant (dessous, devant le corps) ou arrière (dessus, derrière), en coordonnées de l'image. */
function demi(a: Anneau, avant: boolean): string {
  const cx = (a.x0 + a.x1) / 2, rx = (a.x1 - a.x0) / 2 + 3, ry = Math.max(6, rx * 0.2);
  return `M${cx - rx} ${a.y} A${rx} ${ry} 0 0 ${avant ? 0 : 1} ${cx + rx} ${a.y}`;
}

/** Tours déjà pris : trait fin à demi-opacité. */
const OPACITE_FAIT = 0.5;

/** Couleur des graduations sur le ruban : sombre la nuit, claire le jour (la planche). */
const GRADUATION = { nuit: "rgba(40,8,22,0.75)", jour: "rgba(255,255,255,0.8)" } as const;

// Dessiné dans le Canvas de Skia : son moteur de rendu ne voit pas les contextes React (thème) ; le rose et le mode
// viennent du composant qui pose le Canvas.
function Vue1({
  perso,
  vue,
  image,
  zone,
  faits,
  s,
  opacite,
  allumes,
  rose,
  mode,
}: {
  rose: string;
  mode: "nuit" | "jour";
  perso: Perso;
  vue: Vue;
  image: SkImage | null;
  /** La zone de l'étape (sur cette vue ou non), null sans tour. */
  zone: Zone | null;
  faits: readonly Anneau[];
  s: number;
  opacite: SharedValue<number> | number;
  allumes?: readonly (SharedValue<number> | number)[];
}) {
  const f = FIGURES[perso][vue];
  const z = zone && zone.vue === vue ? zone : null;
  const px = (v: number) => v / s;
  if (!image) return null;
  return (
    <Group opacity={opacite}>
      {z ? (
        <Path path={demi(z, false)} style="stroke" strokeWidth={px(1.4)} color={rose} opacity={0.55}>
          <DashPathEffect intervals={[px(3), px(3)]} />
        </Path>
      ) : null}
      <ImageSkia image={image} x={0} y={0} width={f.l} height={f.h} />
      {z ? (
        // la zone, découpée par la silhouette (dstIn), puis posée sur le corps en « couleur » (nuit) ou « produit » (jour)
        <Group layer={<Paint blendMode={mode === "nuit" ? "color" : "multiply"} opacity={mode === "nuit" ? 0.9 : 0.6} />}>
          <Rect x={z.x0 - 8} y={z.y - 16} width={z.x1 - z.x0 + 16} height={32} color={rose}>
            <BlurMask blur={5} style="normal" />
          </Rect>
          <ImageSkia image={image} x={0} y={0} width={f.l} height={f.h} blendMode="dstIn" />
        </Group>
      ) : null}
      {faits.map((a, k) => (
        <Path key={`${a.y}-${a.x0}`} path={demi(a, true)} style="stroke" strokeWidth={px(1.6)} strokeCap="round" color={rose} opacity={allumes?.[k] ?? OPACITE_FAIT} />
      ))}
      {z ? (
        <>
          <Path path={demi(z, true)} style="stroke" strokeWidth={px(6)} strokeCap="round" color={rose} />
          <Path path={demi(z, true)} style="stroke" strokeWidth={px(3)} color={GRADUATION[mode]}>
            <DashPathEffect intervals={[px(1), px(5)]} />
          </Path>
        </>
      ) : null}
    </Group>
  );
}

/**
 * Une étape : `tour` cadré et allumé sur `perso`, `faits` (tours déjà pris) en trait fin sur la même vue. `anime` : le cadrage
 * glisse quand le tour change (le parcours) ; sinon il est posé (vignette, feuille). `sous_poitrine` (feuille du bonnet) :
 * le tour de dos, toujours sur la femme. Un autre personnage remonte la scène (ses coordonnées ne sont pas celles de l'autre)
 * et seules ses deux images sont chargées.
 */
export function FigureEtape(p: PropsEtape) {
  const perso = persoDe(p.perso, p.tour);
  return <Etape key={perso} {...p} perso={perso} />;
}

type PropsEtape = { perso: Perso; tour: Repere; faits: readonly Tour[]; largeur: number; hauteur: number; anime?: boolean };

function Etape({ perso, tour, faits, largeur, hauteur, anime = false }: PropsEtape) {
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const images = { face: useImage(IMAGES[perso].face), dos: useImage(IMAGES[perso].dos) };
  const z = zoneDe(perso, tour);
  const c = cadrage(z, largeur, hauteur, perso);
  const tx = useSharedValue(c.tx), ty = useSharedValue(c.ty), sc = useSharedValue(c.s);
  const opFace = useSharedValue(z.vue === "face" ? 1 : 0), opDos = useSharedValue(z.vue === "dos" ? 1 : 0);
  useEffect(() => {
    const cible = cadrage(zoneDe(perso, tour), largeur, hauteur, perso);
    const bouge = anime && !reduit;
    const d = { duration: MOUVEMENT_FIGURE.cadrageMs, easing: courbes.deplacement };
    tx.value = bouge ? withTiming(cible.tx, d) : cible.tx;
    ty.value = bouge ? withTiming(cible.ty, d) : cible.ty;
    sc.value = bouge ? withTiming(cible.s, d) : cible.s;
    const f = { duration: reduit ? MOUVEMENT_FIGURE.reduitMs : MOUVEMENT_FIGURE.vueMs, easing: courbes.sortie };
    const face = zoneDe(perso, tour).vue === "face" ? 1 : 0;
    opFace.value = anime ? withTiming(face, f) : face;
    opDos.value = anime ? withTiming(1 - face, f) : 1 - face;
  }, [perso, tour, largeur, hauteur, anime, reduit, tx, ty, sc, opFace, opDos]);
  // les deux vues partagent le cadrage : celle qui s'efface suit le mouvement de l'autre
  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }]);
  const anneaux = (v: Vue) => faits.filter((x) => x !== tour && ZONES[perso][x].vue === v).map((x) => ZONES[perso][x]);
  return (
    <Canvas style={{ width: largeur, height: hauteur }} pointerEvents="none">
      <Group transform={transform}>
        <Vue1 perso={perso} vue="face" image={images.face} zone={z} faits={anneaux("face")} s={c.s} opacite={opFace} rose={couleurs.partieSante} mode={mode} />
        <Vue1 perso={perso} vue="dos" image={images.dos} zone={z} faits={anneaux("dos")} s={c.s} opacite={opDos} rose={couleurs.partieSante} mode={mode} />
      </Group>
    </Canvas>
  );
}

/** Le personnage entier, de face, avec les tours pris (récapitulatif) ; ils s'allument de haut en bas à l'ouverture. */
export function FigureEntiere(p: PropsEntiere) {
  return <Entiere key={p.perso} {...p} />;
}

type PropsEntiere = { perso: Perso; faits: readonly Tour[]; largeur: number; hauteur: number };

function Entiere({ perso, faits, largeur, hauteur }: PropsEntiere) {
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const image = useImage(IMAGES[perso].face);
  const c = cadrageEntier(largeur, hauteur, perso);
  // un réglage par tour de l'ordre (le nombre de crochets ne change pas)
  const p0 = useSharedValue(0), p1 = useSharedValue(0), p2 = useSharedValue(0), p3 = useSharedValue(0);
  const p4 = useSharedValue(0), p5 = useSharedValue(0), p6 = useSharedValue(0), p7 = useSharedValue(0);
  const ps = [p0, p1, p2, p3, p4, p5, p6, p7];
  const cles = faits.join(",");
  useEffect(() => {
    ORDRE_TOURS.forEach((t, k) => {
      const v = ps[k]!;
      if (!faits.includes(t)) return void (v.value = 0);
      v.value = 0;
      v.value = reduit
        ? withTiming(OPACITE_FAIT, { duration: MOUVEMENT_FIGURE.reduitMs })
        : withDelay(MOUVEMENT_FIGURE.ecartMs * k, withTiming(OPACITE_FAIT, { duration: MOUVEMENT_FIGURE.allumeMs, easing: courbes.sortie }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cles, reduit]);
  const pris = ORDRE_TOURS.filter((t) => faits.includes(t));
  return (
    <Canvas style={{ width: largeur, height: hauteur }} pointerEvents="none">
      <Group transform={[{ translateX: c.tx }, { translateY: c.ty }, { scale: c.s }]}>
        <Vue1 perso={perso} vue="face" image={image} zone={null} faits={pris.map((t) => anneauDeFace(perso, t))} s={c.s} opacite={1} allumes={pris.map((t) => ps[ORDRE_TOURS.indexOf(t)]!)} rose={couleurs.partieSante} mode={mode} />
      </Group>
    </Canvas>
  );
}
