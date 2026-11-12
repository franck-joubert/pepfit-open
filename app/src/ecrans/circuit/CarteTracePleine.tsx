import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { Camera, GeoJSONSource, Layer, Map, type CameraRef, type MapProps } from "@maplibre/maplibre-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ARRETS_EPAISSEUR,
  cadrerBbox,
  cerclePrecision,
  echelle,
  estVueCircuit,
  gesteMaPosition,
  limiterZoom,
  metresParDp,
  peutDezoomer,
  peutZoomer,
  positionDansLaZone,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_SUR_SOI,
  zoomMoins,
  zoomPlus,
  type Permission,
  type PositionPrecise,
  type Bbox,
  type VueCarte,
} from "../../circuits/carte";
import { haversineM } from "../../circuits/geo";
import type { traceGeoJson, VueCircuit } from "../../circuits/vue";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, rayon, TAILLE_MIN } from "../../theme/typo";
import { useCouleurPartie } from "../../ui/ContextePartie";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Appui } from "../../ui/mouvement";
import { revenir } from "../../ui/revenir";
import { Texte } from "../../ui/Texte";
import { lireStyle } from "../CarteDirect";
import { AttributionCarte } from "../AttributionCarte";
import { PALETTES_CARTE, premiereCoucheLibelles, recolorer, type StyleCarte } from "../carte-style";
import { nombre } from "../format";
import { Bref } from "../briques";
import { montrerBref } from "../bref";
import { uniteActive } from "../unites";
import { CarteCircuit } from "./CarteCircuit";

// La carte d'un tracé en plein écran (planche Circuits, « La carte en plein écran », lot C2) : MapLibre sur toute la hauteur, derrière la
// barre d'état, avec le fond d'OpenFreeMap recoloré aux jetons et le tracé en couleurs d'altitude (ou de zones), plus épais de près. Zoom et
// déplacement aux doigts, boutons « + » et « − » pour qui ne peut pas pincer, « Ma position » (le point bleu et son cercle de précision seulement si
// la position est connue et dans la zone), « Voir tout » une fois zoomé ou déplacé, l'échelle, et une carte du bas que l'objet remplit.
// Un seul composant pour un circuit (CartePleine) et pour une séance terminée (CartePleineSeance). On ferme par la croix ou par le geste
// retour d'Android. Sans réseau au départ, le tracé seul sur fond uni (CarteCircuit).

const MARGE_BORD = 12;
const BOUTON = 44;
const ECHELLE_MAX_DP = 96;
/** La barre d'échelle et son libellé : de quoi réserver leur hauteur dans le cadrage du tracé. */
const ECHELLE_HAUT = 28;

/** Les positions connues de moins de 30 minutes servent à l'ouverture : rien n'est demandé, aucune mesure n'est lancée. */
const RECENTE_MS = 30 * 60 * 1000;

async function permission(): Promise<Permission> {
  const p = await Location.getForegroundPermissionsAsync();
  return p.granted ? "accordee" : p.canAskAgain ? "demandable" : "refusee";
}

async function mesurer(): Promise<PositionPrecise | null> {
  try {
    const l =
      (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false }));
    return l ? { lat: l.coords.latitude, lon: l.coords.longitude, precisionM: l.coords.accuracy } : null;
  } catch {
    return null;
  }
}

/** Mouvement de caméra : une erreur du natif (carte pas encore prête, vue détruite) ne doit pas casser l'écran. */
function bouger(f: () => void) {
  try {
    f();
  } catch {
    // le geste suivant retombera sur une carte prête
  }
}

/** Ce que la carte pleine a besoin de savoir d'un tracé : l'objet (un circuit, une séance) la nourrit, elle ne sait rien de lui. */
export interface TracePleine {
  /** Le tracé en GeoJSON, la couleur de chaque morceau dans la propriété `c`. */
  trace: ReturnType<typeof traceGeoJson>;
  /** Pour le fond uni sans réseau (CarteCircuit) : les points, leurs altitudes. */
  vue: VueCircuit;
  bbox: Bbox;
  /** L'arrivée se marque (un tracé linéaire, une séance) ; une boucle revient au départ. */
  arrivee: boolean;
  /** Les libellés qui changent d'un objet à l'autre : le nom accessible de la carte, « Voir tout… » et « Tu es loin de… ». */
  libelles: { pleine: string; tout: string; loin: string };
  /** La carte du bas : ce qui rappelle l'objet (nom, résumé, boutons). */
  bas: ReactNode;
}

export function CarteTracePleine({ trace, vue, bbox, arrivee: avecArrivee, libelles, bas }: TracePleine) {
  const { couleurs, mode } = useTheme();
  const acc = useCouleurPartie();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const [hBas, setHBas] = useState(0);
  const [brut, setBrut] = useState<StyleCarte | null>(null);
  const [sansStyle, setSansStyle] = useState(false);
  const [prete, setPrete] = useState(false);
  const [vueCarte, setVueCarte] = useState<VueCarte | null>(null);
  // Le premier geste du doigt sur la carte replie la mention du fond sur son « i ».
  const [touchee, setTouchee] = useState(false);
  const [position, setPosition] = useState<PositionPrecise | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let actif = true;
    lireStyle()
      .then((s) => actif && setBrut(s))
      .catch(() => actif && setSansStyle(true));
    permission()
      .then(async (p) => {
        if (p !== "accordee") return;
        const l = await Location.getLastKnownPositionAsync({ maxAge: RECENTE_MS });
        if (actif && l) setPosition({ lat: l.coords.latitude, lon: l.coords.longitude, precisionM: l.coords.accuracy });
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, []);

  const style = useMemo(() => (brut ? recolorer(brut, PALETTES_CARTE[mode]) : null), [brut, mode]);
  const avantLibelles = useMemo(() => (style ? premiereCoucheLibelles(style) : undefined), [style]);

  // Le tracé entier se cadre dans ce que les boutons et la carte du bas laissent : en portrait comme la planche (la colonne de boutons
  // à droite occupe le haut), en paysage au-dessous d'une seule rangée et à gauche des boutons.
  const portrait = taille.h > taille.l;
  const marges = useMemo(
    () => ({
      haut: insets.top + MARGE_BORD + (portrait ? 3 * BOUTON + 2 * espace.s + 24 : BOUTON + 16),
      bas: hBas + insets.bottom + 22 + ECHELLE_HAUT + 16,
      gauche: 24,
      droite: portrait ? 24 : 24 + BOUTON + MARGE_BORD,
    }),
    [insets.top, insets.bottom, hBas, portrait],
  );
  const cadre = useMemo(() => (taille.l > 0 ? cadrerBbox(bbox, taille.l, taille.h, marges) : null), [bbox, taille, marges]);
  const actuelle = vueCarte ?? cadre;

  const dansZone = positionDansLaZone(position, bbox);
  const surMoi =
    !!position && dansZone && !!actuelle && haversineM({ lat: actuelle.centre[1], lon: actuelle.centre[0] }, position) < 30 * metresParDp(actuelle.zoom, position.lat);

  const extremites = useMemo(() => {
    const point = (p: { lat: number; lon: number }) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] } });
    return {
      depart: { type: "FeatureCollection" as const, features: [point(vue.points[0]!)] },
      arrivee: { type: "FeatureCollection" as const, features: avecArrivee ? [point(vue.points[vue.points.length - 1]!)] : [] },
    };
  }, [vue, avecArrivee]);
  const moi = useMemo(() => {
    if (!position || !dansZone) return { type: "FeatureCollection" as const, features: [] };
    return {
      type: "FeatureCollection" as const,
      features: [
        { type: "Feature" as const, properties: { k: "cercle" }, geometry: { type: "Polygon" as const, coordinates: [cerclePrecision(position)] } },
        { type: "Feature" as const, properties: { k: "point" }, geometry: { type: "Point" as const, coordinates: [position.lon, position.lat] } },
      ],
    };
  }, [position, dansZone]);

  // L'épaisseur suit le zoom : la même courbe que celle que teste circuits/carte.ts.
  const epaisseur = useCallback((plus: number) => ["interpolate", ["linear"], ["zoom"], ...ARRETS_EPAISSEUR.flatMap(([z, e]) => [z, e + plus])] as never, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTaille((x) => (x.l === width && x.h === height ? x : { l: width, h: height }));
  };

  const zoomer = (haut: boolean) => {
    if (!actuelle || !prete) return;
    bouger(() => camera.current?.zoomTo(haut ? zoomPlus(actuelle.zoom) : zoomMoins(actuelle.zoom), { duration: 250 }));
  };
  const toutLeCircuit = () => {
    if (!cadre || !prete) return;
    bouger(() => camera.current?.easeTo({ center: cadre.centre, zoom: cadre.zoom, duration: 500 }));
  };
  const centrerSur = (p: PositionPrecise) => {
    bouger(() => camera.current?.easeTo({ center: [p.lon, p.lat], zoom: limiterZoom(Math.max(actuelle?.zoom ?? 0, ZOOM_SUR_SOI)), duration: 600 }));
  };
  const maPosition = async () => {
    if (occupe || !prete) return;
    setOccupe(true);
    try {
      let p = await permission();
      let ici = position;
      let geste = gesteMaPosition(p, ici, bbox);
      if (geste === "demander") {
        const r = await Location.requestForegroundPermissionsAsync();
        p = r.granted ? "accordee" : "refusee";
        geste = gesteMaPosition(p, ici, bbox);
      }
      if (geste === "chercher") {
        ici = await mesurer();
        if (!ici) return montrerBref(t("circuit.carte.positionIntrouvable"));
        setPosition(ici);
        geste = gesteMaPosition(p, ici, bbox);
      }
      if (geste === "refuse") montrerBref(t("circuit.carte.positionRefusee"));
      else if (geste === "loin") montrerBref(libelles.loin);
      else if (geste === "centrer" && ici) centrerSur(ici);
    } finally {
      setOccupe(false);
    }
  };

  const miles = uniteActive() === "mi";
  const echelleCarte = actuelle ? echelle(actuelle.zoom, actuelle.centre[1], ECHELLE_MAX_DP, miles) : null;
  const libelleEchelle = echelleCarte ? `${nombre(echelleCarte.valeur, 0)} ${echelleCarte.unite}` : "";
  const haut = insets.top + MARGE_BORD;

  return (
    <View style={[styles.page, { backgroundColor: couleurs.s1 }]} onLayout={onLayout}>
      <StatusBar style={mode === "nuit" ? "light" : "dark"} />
      {style && cadre && hBas > 0 ? (
        <View style={StyleSheet.absoluteFill} accessible accessibilityLabel={libelles.pleine}>
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
            onRegionDidChange={(e) => {
              setVueCarte({ centre: [e.nativeEvent.center[0], e.nativeEvent.center[1]], zoom: e.nativeEvent.zoom });
              if (e.nativeEvent.userInteraction) setTouchee(true);
            }}
          >
            <Camera ref={camera} minZoom={ZOOM_MIN} maxZoom={ZOOM_MAX} initialViewState={{ center: cadre.centre, zoom: cadre.zoom }} />
            <GeoJSONSource id="pepfit-circuit" data={trace}>
              <Layer id="pepfit-circuit-bord" type="line" beforeId={avantLibelles} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": couleurs.bg, "line-width": epaisseur(3.5) }} />
              <Layer id="pepfit-circuit-ligne" type="line" beforeId={avantLibelles} layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": ["get", "c"], "line-width": epaisseur(0) }} />
            </GeoJSONSource>
            <GeoJSONSource id="pepfit-circuit-arrivee" data={extremites.arrivee}>
              <Layer id="pepfit-circuit-arrivee" type="circle" paint={{ "circle-radius": 10, "circle-color": couleurs.t1, "circle-stroke-width": 2.5, "circle-stroke-color": couleurs.bg }} />
              <Layer id="pepfit-circuit-arrivee-centre" type="circle" paint={{ "circle-radius": 3.5, "circle-color": couleurs.bg }} />
            </GeoJSONSource>
            <GeoJSONSource id="pepfit-circuit-depart" data={extremites.depart}>
              <Layer id="pepfit-circuit-depart" type="circle" paint={{ "circle-radius": 10, "circle-color": couleurs.bg, "circle-stroke-width": 3, "circle-stroke-color": couleurs.altBas }} />
              <Layer id="pepfit-circuit-depart-centre" type="circle" paint={{ "circle-radius": 3.5, "circle-color": couleurs.t1 }} />
            </GeoJSONSource>
            <GeoJSONSource id="pepfit-circuit-moi" data={moi}>
              <Layer id="pepfit-circuit-moi-cercle" type="fill" filter={["==", ["get", "k"], "cercle"]} paint={{ "fill-color": couleurs.info, "fill-opacity": 0.18 }} />
              <Layer id="pepfit-circuit-moi-point" type="circle" filter={["==", ["get", "k"], "point"]} paint={{ "circle-radius": 8, "circle-color": couleurs.info, "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" }} />
            </GeoJSONSource>
          </Map>
        </View>
      ) : null}
      {/* Sans réseau au départ : le tracé seul sur fond uni, sans geste, et la phrase qui le dit. */}
      {sansStyle && taille.l > 0 ? (
        <CarteCircuit vue={vue} type={avecArrivee ? "lineaire" : "boucle"} largeur={taille.l} hauteur={taille.h} arrondi={0} marge={48} haut={marges.haut} libelle={libelles.pleine} />
      ) : null}

      <View style={[styles.coin, { top: haut, left: MARGE_BORD }]}>
        <BoutonCarte icone="close" libelle={t("circuit.carte.fermer")} onPress={revenir} />
      </View>
      {!sansStyle ? (
        <View style={[styles.colonne, { top: haut, right: MARGE_BORD }]}>
          <View style={[styles.groupe, { backgroundColor: couleurs.s1, borderColor: couleurs.line }]}>
            <Appui accessibilityRole="button" accessibilityLabel={t("circuit.carte.zoomPlus")} accessibilityState={{ disabled: !actuelle || !peutZoomer(actuelle.zoom) }} disabled={!actuelle || !peutZoomer(actuelle.zoom)} onPress={() => zoomer(true)} style={styles.moitie}>
              <Icone nom="plus" taille={22} couleur={actuelle && peutZoomer(actuelle.zoom) ? couleurs.t1 : couleurs.t3} />
            </Appui>
            <View style={[styles.filet, { backgroundColor: couleurs.line }]} />
            <Appui accessibilityRole="button" accessibilityLabel={t("circuit.carte.zoomMoins")} accessibilityState={{ disabled: !actuelle || !peutDezoomer(actuelle.zoom) }} disabled={!actuelle || !peutDezoomer(actuelle.zoom)} onPress={() => zoomer(false)} style={styles.moitie}>
              <Icone nom="zmoins" taille={22} couleur={actuelle && peutDezoomer(actuelle.zoom) ? couleurs.t1 : couleurs.t3} />
            </Appui>
          </View>
          <BoutonCarte icone="gps" libelle={t("circuit.carte.maPosition")} onPress={() => void maPosition()} allume={surMoi} accent={acc} />
          {actuelle && cadre && !estVueCircuit(actuelle, cadre) ? <BoutonCarte icone="circuit" libelle={libelles.tout} onPress={toutLeCircuit} /> : null}
        </View>
      ) : null}

      {echelleCarte && !sansStyle ? (
        <View pointerEvents="none" style={[styles.echelle, { left: MARGE_BORD, bottom: hBas + insets.bottom + 22 + 8 }]} accessible accessibilityLabel={t("circuit.carte.echelle", { valeur: nombre(echelleCarte.valeur, 0), unite: echelleCarte.unite })}>
          <View style={[styles.barre, { width: echelleCarte.largeurDp, borderColor: couleurs.t1 }]} />
          <Texte variante="meta" couleur="t1" style={styles.echelleTexte}>
            {libelleEchelle}
          </Texte>
        </View>
      ) : null}

      <View onLayout={(e) => setHBas(e.nativeEvent.layout.height)} style={[styles.bas, { bottom: insets.bottom + 22, backgroundColor: couleurs.s1, borderColor: couleurs.line }]}>
        {bas}
      </View>

      {/* La mention du fond : lisible à l'ouverture, puis repliée sur un « i » qui ouvre « Crédits des données » (AttributionCarte). */}
      {style || sansStyle ? <AttributionCarte touchee={touchee} droite style={{ right: MARGE_BORD - 8, bottom: hBas + insets.bottom + 22 }} /> : null}
      <Bref bas={hBas + insets.bottom + 22 + espace.m} />
    </View>
  );
}

/** Un bouton de carte (planche : `cv-ctl`) : 44, rayon 12, surface s1 et filet, l'icône au centre ; allumé, l'accent de la partie. */
function BoutonCarte({ icone, libelle, onPress, allume = false, accent }: { icone: NomIcone; libelle: string; onPress: () => void; allume?: boolean; accent?: string }) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ selected: allume }}
      onPress={onPress}
      style={[styles.bouton, { backgroundColor: couleurs.s1, borderColor: allume && accent ? accent : couleurs.line }]}
    >
      <Icone nom={icone} taille={22} couleur={allume && accent ? accent : couleurs.t1} />
    </Appui>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  coin: { position: "absolute" },
  colonne: { position: "absolute", gap: espace.s, alignItems: "flex-end" },
  bouton: { width: BOUTON, height: BOUTON, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  groupe: { width: BOUTON, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  moitie: { width: BOUTON, height: BOUTON, alignItems: "center", justifyContent: "center" },
  filet: { height: StyleSheet.hairlineWidth },
  echelle: { position: "absolute", gap: 2 },
  barre: { height: 7, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderBottomWidth: 1.5 },
  echelleTexte: { fontSize: TAILLE_MIN + 1 },
  bas: { position: "absolute", left: MARGE_BORD, right: MARGE_BORD, borderRadius: rayon.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: espace.l, paddingVertical: espace.m },
});
