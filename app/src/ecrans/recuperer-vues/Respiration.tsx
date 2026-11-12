// Cohérence cardiaque guidée (planche recuperer, écran 6) : un disque rose qui grandit quand on inspire et rétrécit quand on
// expire, 5 s chaque fois (6 souffles par minute), le décompte, la progression sur la durée choisie, et la FC en direct avec
// 90 s de courbe si un capteur est là (le service de FC des séances, natif/suivi, comme la FC en muscu). Sans capteur, la carte
// disparaît et le guide reste. À la fin de la durée, ou sur « Arrêter », la session s'enregistre (FC de début, de fin, moyenne).
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { suivi } from "../../natif/suivi";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { reduitMouvement } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { fcMuscuVoulue } from "../fc-muscu";
import { MARGE, PageMesure, useMesure } from "../mesures/gabarit";
import { RECUPERER, souffle, type EnCoursRecup } from "../recuperer";
import { lireEnCoursRecup, terminerRecup, type FinFc } from "../recuperer-session";

const CYCLE = RECUPERER.respiration.inspire + RECUPERER.respiration.expire;
const COURBE_S = 90;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Point = { t: number; bpm: number };

/** La FC en direct pendant la respiration : le service des séances, s'il a un capteur (FC Whoop allumée, Bluetooth accordé). */
function useFcDirecte(actif: boolean) {
  const { db } = useApp();
  const points = useRef<Point[]>([]);
  const [dernier, setDernier] = useState<{ bpm: number; appareil: string | null } | null>(null);
  const lance = useRef<string | null>(null);
  useEffect(() => {
    if (!actif || !suivi.disponible) return;
    let fin: (() => void) | null = null;
    let vivant = true;
    (async () => {
      if (!(await fcMuscuVoulue(db)) || !(await suivi.appareils())) return;
      const e = await suivi.etat();
      if (e && e.statut !== "arrete") return; // une séance ou une course a déjà le service
      const n = await suivi.demarrer({ mode: "muscu", fc: true, titre: t("recuperer.respi.titre"), debut: Date.now(), pauseCumulMs: 0 });
      if (!vivant) {
        await suivi.terminer().catch(() => null);
        if (n.id) await suivi.effacer(n.id).catch(() => {});
        return;
      }
      lance.current = n.id;
      fin = suivi.ecouter((x) => {
        if (x.fc.etat !== "connecte" || x.fc.bpm == null) return;
        points.current.push({ t: Date.now(), bpm: x.fc.bpm });
        setDernier({ bpm: x.fc.bpm, appareil: x.fc.appareil });
      });
    })().catch(console.warn);
    return () => {
      vivant = false;
      fin?.();
      const id = lance.current;
      lance.current = null;
      if (id) suivi.terminer().then(() => suivi.effacer(id)).catch(() => {});
    };
  }, [actif, db]);
  /** FC de début (moyenne des 30 premières secondes), de fin (30 dernières), moyenne. */
  const bilan = (): FinFc | null => {
    const l = points.current;
    if (l.length < 3) return null;
    const moy = (x: Point[]) => (x.length ? x.reduce((a, p) => a + p.bpm, 0) / x.length : null);
    const t0 = l[0]!.t;
    const t1 = l.at(-1)!.t;
    return { moy: moy(l), debut: moy(l.filter((p) => p.t <= t0 + 30_000)), fin: moy(l.filter((p) => p.t >= t1 - 30_000)) };
  };
  return { dernier, points, bilan };
}

export function Respiration() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const m = useMesure();
  const [e, setE] = useState<EnCoursRecup | null | undefined>(undefined);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [largeur, setLargeur] = useState(0);
  const echelle = useRef(new Animated.Value(0)).current;
  const fini = useRef(false);
  const fc = useFcDirecte(!!e);

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      lireEnCoursRecup(db)
        .then((s) => {
          if (!vivant) return;
          setE(s);
          if (!s) router.back();
        })
        .catch(console.error);
      return () => {
        vivant = false;
      };
    }, [db]),
  );

  useEffect(() => {
    const h = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(h);
  }, []);

  // le disque suit le souffle, calé sur le début de la session (il reprend au même point si l'on revient)
  useEffect(() => {
    if (!e || reduitMouvement()) return;
    let arrete = false;
    const lancer = () => {
      if (arrete) return;
      const x = (((Date.now() - e.debut) / 1000) % CYCLE + CYCLE) % CYCLE;
      const inspire = x < RECUPERER.respiration.inspire;
      echelle.setValue(souffle(x).echelle);
      const reste = (inspire ? RECUPERER.respiration.inspire - x : CYCLE - x) * 1000;
      Animated.timing(echelle, { toValue: inspire ? 1 : 0, duration: Math.max(50, reste), easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start(({ finished }) => finished && lancer());
    };
    lancer();
    return () => {
      arrete = true;
      echelle.stopAnimation();
    };
  }, [e, echelle]);

  const arreter = useCallback(() => {
    if (fini.current) return;
    fini.current = true;
    terminerRecup(db, Date.now(), fc.bilan())
      .then((id) => (id ? router.replace({ pathname: "/recuperer/fin", params: { id } }) : router.back()))
      .catch(signalerErreur());
  }, [db, fc]);

  const ecoule = e ? Math.max(0, (maintenant - e.debut) / 1000) : 0;
  const total = e?.choisi != null ? e.choisi * 60 : null;
  useEffect(() => {
    if (total != null && ecoule >= total) arreter();
  }, [total, ecoule, arreter]);

  if (!e) return <PageMesure titre={t("recuperer.respi.titre")}>{null}</PageMesure>;
  const s = souffle(ecoule);
  const phase = t(s.phase === "inspire" ? "recuperer.respi.inspire" : "recuperer.respi.expire");
  const scale = echelle.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  // 90 s de courbe : l'oscillation au rythme du souffle
  const pts = fc.points.current.filter((p) => p.t >= maintenant - COURBE_S * 1000);
  const haut = 46;
  const l = Math.max(1, largeur);
  const bas = pts.length ? Math.min(...pts.map((p) => p.bpm)) - 3 : 0;
  const plage = pts.length ? Math.max(8, Math.max(...pts.map((p) => p.bpm)) + 3 - bas) : 1;
  const x = (p: Point) => (l * (p.t - (maintenant - COURBE_S * 1000))) / (COURBE_S * 1000);
  const y = (p: Point) => haut - ((p.bpm - bas) / plage) * haut;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)} ${y(p).toFixed(1)}`).join("");
  return (
    <PageMesure titre={t("recuperer.respi.titre")} actualiser={false}>
      <View style={styles.souffle} accessible accessibilityRole="timer" accessibilityLabel={t("recuperer.respi.lu", { phase, n: s.reste })}>
        <View style={[styles.disque, styles.d1, { borderColor: couleurs.line2 }]} />
        <View style={[styles.disque, styles.d2, { backgroundColor: m.voile }]} />
        <Animated.View style={[styles.disque, styles.d3, { transform: [{ scale }] }]}>
          <Svg width={150} height={150}>
            <Defs>
              <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#ff4f9a" />
                <Stop offset="1" stopColor="#e5178b" />
              </LinearGradient>
            </Defs>
            <Circle cx={75} cy={75} r={75} fill="url(#g)" />
          </Svg>
        </Animated.View>
        <View style={styles.dedans} pointerEvents="none">
          <Texte style={styles.phase}>{phase}</Texte>
          <Texte style={styles.compte}>{s.reste}</Texte>
        </View>
      </View>
      <Texte variante="corps" couleur="t2" style={styles.rythme}>
        {t("recuperer.respi.rythme")}
      </Texte>
      {total != null ? (
        <View style={styles.progres} accessible accessibilityLabel={t("recuperer.respi.progresLu", { a: mmss(ecoule), b: mmss(total) })}>
          <View style={styles.progresL}>
            <Texte variante="meta" couleur="t2">
              {mmss(Math.min(ecoule, total))}
            </Texte>
            <Texte variante="meta" couleur="t2">
              {mmss(total)}
            </Texte>
          </View>
          <View style={[styles.barre, { backgroundColor: couleurs.jaugePiste }]}>
            <View style={{ width: `${Math.min(100, (ecoule / total) * 100)}%`, height: "100%", borderRadius: 2, backgroundColor: m.fort }} />
          </View>
        </View>
      ) : null}
      {fc.dernier ? (
        <View style={[styles.fc, { backgroundColor: couleurs.s1, borderColor: couleurs.line }]} accessible accessibilityLabel={t("recuperer.respi.fcLu", { n: fc.dernier.bpm })}>
          <View style={styles.fcTete}>
            <Texte style={styles.fcValeur}>
              {fc.dernier.bpm}
              <Texte variante="corps" couleur="t2" style={styles.fcUnite}>
                {" bpm"}
              </Texte>
            </Texte>
            <View style={styles.fcSource}>
              <View style={[styles.pastille, { backgroundColor: couleurs.valide }]} />
              <Texte variante="meta" couleur="t2">
                {t("recuperer.respi.direct", { capteur: fc.dernier.appareil ?? t("recuperer.respi.capteur") })}
              </Texte>
            </View>
          </View>
          <View onLayout={(ev) => setLargeur(Math.floor(ev.nativeEvent.layout.width))} style={{ height: haut + 4, marginTop: 6 }}>
            {largeur > 0 && pts.length > 1 ? (
              <Svg width={largeur} height={haut + 4} viewBox={`0 -2 ${largeur} ${haut + 4}`}>
                <Path d={d} fill="none" stroke={m.fort} strokeWidth={2} strokeLinejoin="round" />
                <Circle cx={x(pts.at(-1)!)} cy={y(pts.at(-1)!)} r={4} fill={m.fort} />
              </Svg>
            ) : null}
          </View>
          <Texte variante="meta" couleur="t3" style={{ marginTop: 4 }}>
            {t("recuperer.respi.fcNote")}
          </Texte>
        </View>
      ) : null}
      <View style={styles.bas}>
        <BoutonTonal libelle={t("recuperer.respi.arreter")} onPress={arreter} />
      </View>
    </PageMesure>
  );
}

const styles = StyleSheet.create({
  souffle: { width: 248, height: 248, marginTop: 22, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  disque: { position: "absolute", borderRadius: 999 },
  d1: { width: 248, height: 248, borderWidth: 1.5, borderStyle: "dashed" },
  d2: { width: 196, height: 196 },
  d3: { width: 150, height: 150, overflow: "hidden", boxShadow: "0px 16px 36px -14px rgba(229,23,139,0.7)" },
  dedans: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  phase: { fontFamily: police.semibold, fontSize: 20, color: "#ffffff" },
  compte: { fontFamily: police.light, fontSize: 34, lineHeight: 38, marginTop: 2, color: "#ffffff", fontVariant: ["tabular-nums"] },
  rythme: { textAlign: "center", marginTop: 16, marginHorizontal: MARGE },
  progres: { marginTop: 18, marginHorizontal: MARGE },
  progresL: { flexDirection: "row", justifyContent: "space-between" },
  barre: { height: 4, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  fc: { marginTop: 18, marginHorizontal: MARGE, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  fcTete: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  fcValeur: { fontFamily: police.semibold, fontSize: 24, fontVariant: ["tabular-nums"] },
  fcUnite: { fontFamily: police.medium, fontSize: 13 },
  fcSource: { flexDirection: "row", alignItems: "center", gap: 6 },
  pastille: { width: 7, height: 7, borderRadius: 4 },
  bas: { marginTop: 28, marginHorizontal: MARGE },
});
