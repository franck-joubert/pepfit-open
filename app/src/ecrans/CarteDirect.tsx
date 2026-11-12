import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Camera, GeoJSONSource, Layer, Map, type CameraRef, type MapProps } from "@maplibre/maplibre-react-native";
import type { EtatCircuit } from "../circuits/suivre";
import { traceGeoJson, type VueCircuit } from "../circuits/vue";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, rayon, TAILLE_MIN } from "../theme/typo";
import type { Jetons } from "../theme/jetons";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { AttributionCarte } from "./AttributionCarte";
import { coneDirection, PALETTES_CARTE, premiereCoucheLibelles, recolorer, STYLE_OPENFREEMAP, type StyleCarte } from "./carte-style";
import { cadrage } from "./cadrage-carte";
import { morceauxParZone } from "./suivi-direct-vue";

// Carte du suivi en direct (planche seance-duree § 3, D2) : MapLibre et les tuiles OpenFreeMap recolorées aux jetons, le
// tracé coloré par la zone de la FC réelle, la position et sa direction ; la vue suit la position tant qu'on ne déplace
// pas la carte, « Recentrer » la ramène. Avant le premier fix : « Recherche du GPS… » au lieu d'un cadre vide. Sans réseau
// au départ (style introuvable) ou carte qui ne se charge pas, `onEchec` : l'écran garde le tracé seul.
// Cadrage (retour du 29/10, cadrage-carte.ts) : au départ, environ 500 m autour de la position ; ensuite la vue
// suit et s'élargit pour garder tout le tracé (3 km de rayon au plus). Un toucher libère la carte, « Recentrer » la remet.
// Circuit suivi (planche Circuits, lot F, écrans s2 et s3) : le tracé du circuit se pose sous la trace faite, coloré par l'altitude comme
// sur sa page ; la trace faite passe en `t1` (les zones de FC ne se lisent plus sur la rampe d'altitude) ; hors du circuit, un trait
// pointillé va de la position au point du tracé le plus proche, et le cadrage le garde dans la vue. Le fond de carte et son attribution
// ne changent pas.

/** Style Positron, lu une fois par lancement de l'appli ; un échec se retente au montage suivant. */
let styleLu: Promise<StyleCarte> | null = null;
export function lireStyle(): Promise<StyleCarte> {
  styleLu ??= fetch(STYLE_OPENFREEMAP)
    .then((r) => {
      if (!r.ok) throw new Error(`style ${r.status}`);
      return r.json() as Promise<StyleCarte>;
    })
    .catch((e: unknown) => {
      styleLu = null;
      throw e;
    });
  return styleLu;
}

/** Le temps laissé à la carte pour finir de se charger une fois son style lu (ms). */
const CARTE_DELAI_MS = 10_000;

type Coord = { lat: number; lon: number };

/** Mouvement de caméra : une erreur du natif (carte pas encore prête, vue détruite) ne doit pas casser l'écran du suivi. */
function bouger(f: () => Promise<void> | void | undefined) {
  try {
    Promise.resolve(f()).catch(() => {});
  } catch {
    // la carte se recentrera au prochain point
  }
}

export function CarteDirect({ points, zones, position, circuit = null, etatCircuit = null, haut = null, onEchec }: {
  points: readonly Coord[];
  /** Zone de FC de chaque point (0 : sans FC). */
  zones: readonly number[];
  /** Position du moment (dernier fix du service) ; sinon le dernier point du tracé. */
  position: Coord | null;
  /** Le circuit suivi, et où l'on en est (null sans circuit ou sans position). */
  circuit?: VueCircuit | null;
  etatCircuit?: EtatCircuit | null;
  /** Posé sur la carte, sous « Recentrer » : la phrase d'état du circuit. */
  haut?: ReactNode;
  onEchec?: () => void;
}) {
  const { mode, couleurs } = useTheme();
  const [brut, setBrut] = useState<StyleCarte | null>(null);
  const [suivre, setSuivre] = useState(true);
  // La caméra native n'existe qu'une fois la carte chargée : avant, la déplacer lève une erreur.
  const [prete, setPrete] = useState(false);
  const camera = useRef<CameraRef>(null);
  const centree = useRef(false);
  // Taille de la carte (dp) : le rayon montré tient dans son petit côté.
  const [taille, setTaille] = useState({ l: 380, h: 368 });

  useEffect(() => {
    let actif = true;
    lireStyle()
      .then((s) => actif && setBrut(s))
      .catch(() => actif && onEchec?.());
    return () => {
      actif = false;
    };
    // onEchec est une fonction de l'écran : seul le premier montage compte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un style lu mais une carte qui ne finit jamais de se charger (réseau coupé entre le style et ses polices : fond gris, aucun tracé) ne sert
  // à rien pendant une sortie : au bout de CARTE_DELAI_MS, l'écran garde le tracé seul.
  useEffect(() => {
    if (!brut || prete) return;
    const id = setTimeout(() => onEchec?.(), CARTE_DELAI_MS);
    return () => clearTimeout(id);
    // onEchec est une fonction de l'écran : seul le premier montage compte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brut, prete]);

  const style = useMemo(() => (brut ? recolorer(brut, PALETTES_CARTE[mode]) : null), [brut, mode]);
  const avantLibelles = useMemo(() => (style ? premiereCoucheLibelles(style) : undefined), [style]);
  const ici = position ?? points.at(-1) ?? null;

  // Hors du circuit, le point le plus proche du tracé entre dans la vue : le trait pointillé se voit en entier.
  const ecart = ici && etatCircuit && !etatCircuit.surCircuit ? { de: ici, vers: etatCircuit.plusProche } : null;
  const vue = ici ? cadrage(ici, ecart ? [...points, ecart.vers] : points, taille.l, taille.h) : null;

  // La vue suit la position : au premier fix, elle s'y pose (500 m autour) ; ensuite elle glisse, et dézoome quand le tracé grandit.
  useEffect(() => {
    if (!vue || !suivre || !prete) return;
    bouger(() => {
      if (centree.current) return camera.current?.easeTo({ center: vue.centre, zoom: vue.zoom, duration: 900 });
      centree.current = true;
      return camera.current?.jumpTo({ center: vue.centre, zoom: vue.zoom });
    });
  }, [vue?.centre[0], vue?.centre[1], vue?.zoom, suivre, prete]); // eslint-disable-line react-hooks/exhaustive-deps

  const couleurZone = (z: number) => (z ? couleurs[`zone${z}` as keyof Jetons] : couleurs.t2);
  const trace = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.length < 2 ? [] : circuit ? [{
        type: "Feature" as const,
        properties: { c: couleurs.t1 },
        geometry: { type: "LineString" as const, coordinates: points.map((p) => [p.lon, p.lat]) },
      }] : morceauxParZone(zones).map((m) => ({
        type: "Feature" as const,
        properties: { c: couleurZone(m.zone) },
        geometry: { type: "LineString" as const, coordinates: points.slice(m.debut, m.fin + 1).map((p) => [p.lon, p.lat]) },
      })),
    }),
    // couleurZone suit couleurs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, zones, couleurs, circuit],
  );
  const devant = useMemo(() => (circuit ? traceGeoJson(circuit, couleurs.altBas, couleurs.altHaut, couleurs.t3) : null), [circuit, couleurs]);
  const pointille = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: ecart
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [[ecart.de.lon, ecart.de.lat], [ecart.vers.lon, ecart.vers.lat]] } }]
        : [],
    }),
    [ecart?.de.lat, ecart?.de.lon, ecart?.vers.lat, ecart?.vers.lon], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pos = useMemo(
    () => ({ type: "FeatureCollection" as const, features: ici ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [ici.lon, ici.lat] } }] : [] }),
    [ici?.lat, ici?.lon], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const cone = useMemo(() => {
    const c = coneDirection(ici ? [...points.slice(-15), ici] : points);
    return { type: "FeatureCollection" as const, features: c ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [c] } }] : [] };
  }, [points, ici?.lat, ici?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentrer = () => {
    setSuivre(true);
    if (vue && prete) bouger(() => camera.current?.easeTo({ center: vue.centre, zoom: vue.zoom, duration: 600 }));
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setTaille({ l: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {style ? (
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={style as MapProps["mapStyle"]}
          androidView="texture"
          attribution={false}
          logo={false}
          compass={false}
          touchRotate={false}
          touchPitch={false}
          onDidFinishLoadingMap={() => setPrete(true)}
          onDidFailLoadingMap={() => onEchec?.()}
          onRegionWillChange={(e) => {
            if (e.nativeEvent.userInteraction) setSuivre(false);
          }}
        >
          <Camera ref={camera} initialViewState={vue ? { center: vue.centre, zoom: vue.zoom } : { zoom: 2 }} />
          {devant ? (
            <GeoJSONSource id="pepfit-circuit" data={devant}>
              <Layer id="pepfit-circuit-bord" type="line" beforeId={avantLibelles} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": couleurs.bg, "line-width": 8.5 }} />
              <Layer id="pepfit-circuit-rampe" type="line" beforeId={avantLibelles} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": ["get", "c"], "line-width": 4.6 }} />
            </GeoJSONSource>
          ) : null}
          <GeoJSONSource id="pepfit-trace" data={trace}>
            <Layer id="pepfit-trace-bord" type="line" beforeId={avantLibelles} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": couleurs.bg, "line-width": 8.5 }} />
            <Layer id="pepfit-trace-zone" type="line" beforeId={avantLibelles} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": ["get", "c"], "line-width": 4.6 }} />
          </GeoJSONSource>
          {ecart ? (
            <GeoJSONSource id="pepfit-ecart" data={pointille}>
              <Layer id="pepfit-ecart-trait" type="line" layout={{ "line-cap": "butt" }} paint={{ "line-color": couleurs.t2, "line-width": 1.6, "line-dasharray": [2, 2] }} />
            </GeoJSONSource>
          ) : null}
          <GeoJSONSource id="pepfit-cone" data={cone}>
            <Layer id="pepfit-cone" type="fill" paint={{ "fill-color": couleurs.t1, "fill-opacity": 0.2 }} />
          </GeoJSONSource>
          <GeoJSONSource id="pepfit-pos" data={pos}>
            <Layer id="pepfit-pos-halo" type="circle" paint={{ "circle-radius": 18, "circle-color": couleurs.t1, "circle-opacity": 0.13 }} />
            <Layer id="pepfit-pos" type="circle" paint={{ "circle-radius": 8, "circle-color": couleurs.t1, "circle-stroke-width": 3, "circle-stroke-color": couleurs.bg }} />
          </GeoJSONSource>
        </Map>
      ) : null}

      {!ici || !style ? (
        <View style={styles.attente} pointerEvents="none">
          <Icone nom="gps" taille={22} couleur={couleurs.t3} />
          <Texte couleur="t2" style={styles.attenteTexte}>
            {t("gps.guide.attente")}
          </Texte>
        </View>
      ) : null}

      {haut}

      {style && ici ? (
        <Appui
          accessibilityRole="button"
          accessibilityLabel={t("gps.guide.recentrer")}
          onPress={recentrer}
          style={[styles.recentrer, { backgroundColor: couleurs.bg }]}
          hitSlop={4}
        >
          <Icone nom="gps" taille={22} couleur={suivre ? couleurs.t2 : couleurs.t1} />
        </Appui>
      ) : null}

      {style ? (
        <AttributionCarte replie style={{ left: 0, bottom: 0 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  attente: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: espace.s },
  attenteTexte: { fontSize: 15 },
  recentrer: { position: "absolute", top: espace.m, right: espace.m, width: 44, height: 44, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
