// FC d'une séance de muscu passée (planche suivi-gps, « Séance passée : courbe de FC avec un repère par série, FC par exercice
// et par série », validée) : courbe colorée par zone, bandes grises des fenêtres d'effort estimées, un trait par coche, les
// numéros des exercices ; la barre des zones de la fin de course ; puis le tableau « FC par exercice » (moyenne « ~ », max,
// récupération), un exercice touché déplie ses séries (le premier est déplié), au style des séries d'une séance sans FC
// (numéro dans sa colonne, « 93 kg × 10 », retour du 30/10) et dans leur ordre. Mêmes briques que BlocEffort
// (horloge d'entrée, dégradé des zones, découpe qui s'ouvre de gauche à droite).
import { useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { largeurContenu } from "../ui/CadreContenu";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Canvas, DashPathEffect, Group, Line, LinearGradient, Path, Rect, vec } from "@shopify/react-native-skia";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX } from "../theme/typo";
import { Picto } from "../ui/Picto";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { arretsZones, ENTREE, Etiquettes, ligneDe, phase, RepartFin, useDecoupe, useEntree } from "./BlocEffort";
import { recupTexte, type FcSerie, type VueFcMuscu } from "./fc-muscu-vue";
import { approx } from "./format";

/** Courbe de la planche : 180 de haut, dont 30 en bas pour les coches et les pictos des exercices ; 24 à droite pour « Z1 » à « Z5 ». */
const COURBE = { hauteur: 180, bas: 30, haut: 6, droite: 24, lo: 80, hi: 175 } as const;

const PICTO_COURBE = 18;

export interface LibelleSerie {
  numero: string;
  /** Couleur du numéro (échauffement, ratée…) ; t3 par défaut. */
  couleur?: string;
  texte: string;
}

export function BlocFcMuscu({ vue, source, exercices, libelles, ralenti }: {
  vue: VueFcMuscu;
  /** « Whoop · en direct ». */
  source: string;
  exercices: Record<string, { nom: string; slug: string | null }>;
  /** Chaque série : son numéro (ou sa lettre, dans la couleur de son type) et « 80 kg × 8 ». */
  libelles: Record<string, LibelleSerie>;
  ralenti?: number;
}) {
  const { couleurs } = useTheme();
  const [largeur, setLargeur] = useState(() => Math.round(largeurContenu()) - 2 * espace.l);
  const h = useEntree(largeur > 0, ralenti);
  const bloc = useAnimatedStyle(() => {
    const k = phase(h.value, ENTREE.bloc[0], ENTREE.bloc[1]);
    return { opacity: k, transform: [{ translateY: (1 - k) * 8 }] };
  });
  const onLayout = (e: LayoutChangeEvent) => {
    const l = Math.round(e.nativeEvent.layout.width) - 2 * espace.l;
    setLargeur((x) => (x === l ? x : l));
  };
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set(vue.exercices[0] ? [vue.exercices[0].exerciceId] : []));
  const basculer = (id: string) =>
    setOuverts((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Animated.View onLayout={onLayout} style={[styles.bloc, { borderBottomColor: couleurs.line }, bloc]}>
      <View style={styles.tete}>
        <Texte variante="entete" couleur="t3" accessibilityRole="header">
          {t("seance.fc.titre")}
        </Texte>
        <Texte variante="meta" couleur="t3">
          {source}
        </Texte>
      </View>
      {largeur > 0 ? <Courbe vue={vue} exercices={exercices} largeur={largeur} t={h} /> : null}
      <View style={styles.zones}>
        <RepartFin vue={vue} t={h} />
      </View>
      <View style={styles.tab}>
        <View style={styles.th}>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.thT, styles.nom, { color: couleurs.t3 }]}>{t("seance.fc.parExercice")}</Text>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.thT, styles.cMoy, { color: couleurs.t3 }]}>{t("seance.fc.moy")}</Text>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.thT, styles.cMax, { color: couleurs.t3 }]}>{t("seance.fc.max")}</Text>
          <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.thT, styles.cRecup, { color: couleurs.t3 }]}>{t("seance.fc.recup")}</Text>
        </View>
        {vue.exercices.map((e) => {
          const x = exercices[e.exerciceId];
          const ouvert = ouverts.has(e.exerciceId);
          return (
            <View key={e.exerciceId}>
              <Appui
                accessibilityRole="button"
                accessibilityLabel={t("seance.fc.ligneLu", { nom: x?.nom ?? "", moy: valeur(e.moy), max: valeur(e.max), recup: recupTexte(e.recup) })}
                accessibilityHint={t("seance.fc.deplier")}
                accessibilityState={{ expanded: ouvert }}
                onPress={() => basculer(e.exerciceId)}
                style={[styles.tr, { borderTopColor: couleurs.line }]}
              >
                <View style={[styles.nom, styles.nomExo]}>
                  <Picto slug={x?.slug ?? null} nom={x?.nom ?? null} taille={28} />
                  <Texte numberOfLines={1} style={styles.nomT}>
                    {x?.nom ?? ""}
                  </Texte>
                </View>
                <Chiffre style={styles.cMoy} texte={estimee(e.moy)} />
                <Chiffre style={styles.cMax} texte={valeur(e.max)} />
                <Chiffre style={styles.cRecup} texte={recupTexte(e.recup)} couleur="t2" />
              </Appui>
              {ouvert ? e.series.map((s) => <LigneSerie key={s.id} s={s} libelle={libelles[s.id] ?? { numero: "", texte: "" }} />) : null}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const valeur = (n: number | null) => (n == null ? "—" : String(n));
/** FC moyenne d'une fenêtre estimée : « ~ 126 ». */
const estimee = (n: number | null) => (n == null ? "—" : approx(String(n)));

function Chiffre({ texte, style, couleur = "t1" }: { texte: string; style: object; couleur?: "t1" | "t2" }) {
  const { couleurs } = useTheme();
  return (
    <Text maxFontSizeMultiplier={POLICE_MAX} numberOfLines={1} style={[styles.chiffre, style, { color: couleurs[couleur] }]}>
      {texte}
    </Text>
  );
}

/** Une série dépliée, comme dans une séance sans FC : numéro en semi-gras dans sa colonne, « 80 kg × 8 » ; valeurs en t2. */
function LigneSerie({ s, libelle }: { s: FcSerie; libelle: LibelleSerie }) {
  const { couleurs } = useTheme();
  return (
    <View
      style={styles.trS}
      accessible
      accessibilityLabel={t("seance.fc.serieLu", { n: libelle.numero, detail: libelle.texte, moy: valeur(s.moy), max: valeur(s.max), recup: recupTexte(s.recup) })}
    >
      <View style={[styles.nom, styles.nomSerie]}>
        <View style={styles.num}>
          <Texte variante="corps" style={{ fontFamily: police.semibold, color: libelle.couleur ?? couleurs.t3 }}>
            {libelle.numero}
          </Texte>
        </View>
        <Texte variante="saisie" numberOfLines={1} style={styles.serieT}>
          {libelle.texte}
        </Texte>
      </View>
      <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.chiffreS, styles.cMoy, { color: couleurs.t2 }]}>{estimee(s.moy)}</Text>
      <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.chiffreS, styles.cMax, { color: couleurs.t2 }]}>{valeur(s.max)}</Text>
      <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.chiffreS, styles.cRecup, { color: couleurs.t2 }]}>{recupTexte(s.recup)}</Text>
    </View>
  );
}

/** Courbe de la séance : bandes des fenêtres, seuils des zones en pointillé, courbe par zone, coches, numéros des exercices. */
function Courbe({ vue, exercices, largeur, t: horloge }: { vue: VueFcMuscu; exercices: Record<string, { nom: string; slug: string | null }>; largeur: number; t: ReturnType<typeof useEntree> }) {
  const { couleurs, mode } = useTheme();
  // Bandes : l'écart avec le fond de la planche (s2 sur blanc ou noir). Depuis les teintes de partie (v2.2.17), la page du jour
  // est teintée et s2 s'y confond : s3 le jour ; la nuit, s2 teinté ressort trop, s1 a la luminance de la planche.
  const bande = mode === "jour" ? couleurs.s3 : couleurs.s1;
  const c = COURBE;
  const bpms = vue.serieFc.map((f) => f.bpm);
  const lo = Math.min(c.lo, Math.min(...bpms) - 4);
  const hi = Math.max(c.hi, Math.max(...bpms) + 4);
  const pw = largeur - c.droite;
  const yBas = c.hauteur - c.bas;
  const X = (s: number) => (s / vue.dureeS) * pw;
  const Y = (v: number) => yBas - ((v - lo) / (hi - lo)) * (yBas - c.haut);
  const chemin = useMemo(
    () => ligneDe(vue.serieFc.map((f) => ({ x: X(f.s), y: Y(f.bpm) }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vue.serieFc, largeur, lo, hi, vue.dureeS],
  );
  const { cs, ps } = arretsZones(Y, Y(hi), Y(lo), vue.bornes, couleurs);
  const decoupe = useDecoupe(horloge, 0, largeur, c.hauteur);
  const etiquettes = vue.bornes.flatMap((b, i) => (b > lo && b < hi ? [{ texte: t("effort.zone", { n: i + 1 }), x: largeur, y: Y(b), ancre: "fin" as const }] : []));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t("seance.fc.courbe")} style={[styles.courbe, { height: c.hauteur }]}>
      <Canvas style={{ width: largeur, height: c.hauteur }}>
        {vue.bandes.map((b, i) => (
          <Rect key={`b${i}`} x={X(b.a)} y={0} width={Math.max(1, X(b.b) - X(b.a))} height={yBas} color={bande} />
        ))}
        {vue.bornes.map((b, i) =>
          b > lo && b < hi ? (
            <Line key={`z${i}`} p1={vec(0, Y(b))} p2={vec(pw, Y(b))} color={couleurs.line2} strokeWidth={0.5} style="stroke">
              <DashPathEffect intervals={[2, 3]} />
            </Line>
          ) : null,
        )}
        <Group clip={decoupe}>
          <Path path={chemin} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round">
            <LinearGradient start={vec(0, Y(hi))} end={vec(0, Y(lo))} colors={cs} positions={ps} />
          </Path>
        </Group>
        {vue.coches.map((s, i) => (
          <Line key={`c${i}`} p1={vec(X(s), yBas + 3)} p2={vec(X(s), yBas + 9)} color={couleurs.t2} strokeWidth={1.5} strokeCap="round" style="stroke" />
        ))}
      </Canvas>
      <Etiquettes l={etiquettes} variante="fin" />
      {vue.numeros.map((n) => {
        const x = exercices[vue.exercices[n.n - 1]?.exerciceId ?? ""];
        return (
          <View key={n.n} style={[styles.numero, { left: Math.min(X(n.s), pw - PICTO_COURBE) }]}>
            <Picto slug={x?.slug ?? null} nom={x?.nom ?? null} taille={PICTO_COURBE} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { paddingBottom: espace.m, borderBottomWidth: StyleSheet.hairlineWidth },
  tete: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: espace.xl, paddingHorizontal: espace.l, paddingBottom: 10 },
  courbe: { marginTop: espace.xs, marginHorizontal: espace.l },
  numero: { position: "absolute", bottom: 0 },
  zones: { marginTop: espace.m, marginHorizontal: espace.l },
  tab: { paddingTop: espace.xs, paddingHorizontal: espace.l },
  th: { height: 30, flexDirection: "row", alignItems: "center", gap: 6 },
  thT: { fontFamily: police.semibold, fontSize: 11, letterSpacing: 0.66, textTransform: "uppercase", textAlign: "right" },
  tr: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  trS: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6 },
  nom: { flex: 1, minWidth: 0, textAlign: "left" },
  nomExo: { flexDirection: "row", alignItems: "center", gap: 10 },
  nomT: { flexShrink: 1, fontFamily: police.medium, fontSize: 15 },
  nomSerie: { flexDirection: "row", alignItems: "center" },
  /** Colonne du numéro de la séance sans FC (history/[id] : 38, recalée de 5 sous le picto). */
  num: { width: 38, marginLeft: -5, alignItems: "center" },
  serieT: { flexShrink: 1, fontFamily: police.regular, fontSize: 15 },
  cMoy: { width: 52 },
  cMax: { width: 44 },
  cRecup: { width: 52 },
  chiffre: { fontFamily: police.regular, fontSize: 15, textAlign: "right", fontVariant: ["tabular-nums"] },
  chiffreS: { fontFamily: police.regular, fontSize: 14, textAlign: "right", fontVariant: ["tabular-nums"] },
});
