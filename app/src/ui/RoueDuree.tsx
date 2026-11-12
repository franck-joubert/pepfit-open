import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../theme";
import { avecOpacite } from "../theme/teintes";
import { POLICE_MAX, rayon } from "../theme/typo";
import { dureeRoueCourte, indiceRepos, valeursRepos } from "../ecrans/format";
import { decoupeRoue, dureeLue, ECHELLES, interpolationLigne, minutePile, OPACITES, type Decoupe } from "../ecrans/roue";
import { Bouton } from "./Bouton";
import { Feuille } from "./Feuille";
import { useReduit } from "./reduit";
import { dureeTempo, phasesTempo, lireTempo, tempoTexte, valeursTempo, type Tempo } from "../ecrans/tempo";
import { phasesSerie } from "../ecrans/tempo-horloge";
import { ApercuRuban } from "./RubanTempo";
import { Texte } from "./Texte";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

const HAUTEUR = 44;
const VISIBLES = 2;
const VALEURS = valeursRepos();
const FONDU = Math.round(HAUTEUR * 1.6);
const SANS_ECHELLE = ECHELLES.map(() => 1);

let compteurFondu = 0;

/** Roue verticale : on la fait glisser, elle se cale sur une valeur (la plus proche de `valeur` au départ).
 *  Taille et opacité varient en continu selon la distance au centre (pilote natif) ; mouvement réduit : opacité seule.
 *  Silencieuse : pas de vibration au cran (réservée aux records et aux erreurs).
 *  Par défaut : la roue de repos (secondes) ; `valeurs`, `decoupe`, `lue`, `repere` et `traits` l'adaptent (durée en minutes, heure, date). */
export function RoueDuree({
  valeur,
  onChange,
  libelle = t("ui.tempsRepos"),
  valeurs = VALEURS,
  decoupe = decoupeRoue,
  lue = dureeLue,
  repere = minutePile,
  traits = true,
  fond,
  bande,
  unite,
}: {
  valeur: number;
  onChange: (s: number) => void;
  libelle?: string;
  valeurs?: number[];
  decoupe?: (v: number) => Decoupe;
  lue?: (v: number) => string;
  repere?: (v: number) => boolean;
  traits?: boolean;
  /** Fond derrière la roue (ses fondus s'y fondent) : celui de la feuille par défaut, celui de l'écran sur une page. */
  fond?: string;
  /** Couleur de la bande centrale (s2 par défaut). */
  bande?: string;
  /** Unité posée à droite dans la bande centrale (« g », « pot »). */
  unite?: string;
}) {
  const { couleurs } = useTheme();
  const VALEURS = valeurs;
  const fondRoue = fond ?? couleurs.feuilleFond;
  const surChange = useRef(onChange);
  surChange.current = onChange;
  const idFondu = useRef(`roue-fondu-${compteurFondu++}`).current;
  const depart = indiceRepos(valeur, VALEURS);
  const [centre, setCentre] = useState(depart);
  const reduit = useReduit();
  const vue = useRef<ScrollViewInstance>(null);
  const courant = useRef(depart);
  const y = useRef(new Animated.Value(depart * HAUTEUR)).current;

  useEffect(() => {
    const t = setTimeout(() => vue.current?.scrollTo({ y: depart * HAUTEUR, animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aller = (i: number, animee = true) => {
    const j = Math.max(0, Math.min(VALEURS.length - 1, i));
    vue.current?.scrollTo({ y: j * HAUTEUR, animated: animee });
    if (j !== courant.current) {
      courant.current = j;
      setCentre(j);
      surChange.current(VALEURS[j]!);
    }
  };

  const surDefilement = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const i = Math.max(0, Math.min(VALEURS.length - 1, Math.round(e.nativeEvent.contentOffset.y / HAUTEUR)));
          if (i === courant.current) return;
          courant.current = i;
          setCentre(i);
          surChange.current(VALEURS[i]!);
        },
      }),
    [y, VALEURS],
  );

  const plein = couleurs.t1;
  // t1 est translucide depuis la v2.2.17 : un suffixe « 80 » ne vaut que pour un hexadécimal
  const attenue = avecOpacite(couleurs.t1, 0.5);
  const fondu = (id: string, haut: boolean) => (
    <Svg pointerEvents="none" width="100%" height={FONDU} style={[styles.fondu, haut ? { top: 0 } : { bottom: 0 }]}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fondRoue} stopOpacity={haut ? 1 : 0} />
          <Stop offset="1" stopColor={fondRoue} stopOpacity={haut ? 0 : 1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={libelle}
      accessibilityValue={{ text: lue(VALEURS[centre]!) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => aller(courant.current + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      style={{ height: HAUTEUR * (2 * VISIBLES + 1) }}
    >
      <View pointerEvents="none" style={[styles.bande, { backgroundColor: bande ?? couleurs.s2, top: HAUTEUR * VISIBLES }]} />
      <Animated.ScrollView
        ref={vue}
        showsVerticalScrollIndicator={false}
        snapToInterval={HAUTEUR}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={surDefilement}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: HAUTEUR * VISIBLES }}
      >
        {VALEURS.map((v, i) => {
          const d = decoupe(v);
          const marque = traits && repere(v);
          const scale = y.interpolate({ ...interpolationLigne(i, HAUTEUR, reduit ? SANS_ECHELLE : ECHELLES), extrapolate: "clamp" });
          const opacity = y.interpolate({ ...interpolationLigne(i, HAUTEUR, OPACITES), extrapolate: "clamp" });
          return (
            <Pressable key={v} importantForAccessibility="no" onPress={() => aller(i)} style={styles.valeur}>
              <Animated.View style={[styles.ligne, !traits && { justifyContent: "center" }, { opacity, transform: [{ scale }] }]}>
                {traits ? <View style={[styles.trait, { backgroundColor: marque ? couleurs.t3 : "transparent" }]} /> : null}
                <Texte variante="saisie" style={styles.texte}>
                  {d.attenue ? <Text maxFontSizeMultiplier={POLICE_MAX} style={{ color: attenue }}>{d.attenue}</Text> : null}
                  <Text maxFontSizeMultiplier={POLICE_MAX} style={{ color: plein }}>{d.plein}</Text>
                  {d.apres ? <Text maxFontSizeMultiplier={POLICE_MAX} style={{ color: attenue }}>{d.apres}</Text> : null}
                </Texte>
                {traits ? <View style={[styles.trait, { backgroundColor: marque ? couleurs.t3 : "transparent" }]} /> : null}
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
      {fondu(`${idFondu}-haut`, true)}
      {fondu(`${idFondu}-bas`, false)}
      {unite ? (
        <View pointerEvents="none" style={[styles.unite, { top: HAUTEUR * VISIBLES }]}>
          <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
            {unite}
          </Texte>
        </View>
      ) : null}
    </View>
  );
}

/** Feuille de choix d'un repos : la roue au centre, « Valider » (geste principal) fixé en bas. Fermer sans valider ne change rien. */
export function FeuilleRepos({ visible, titre, valeur, onFermer, onValider }: { visible: boolean; titre: string; valeur: number; onFermer: () => void; onValider: (s: number) => void }) {
  useLangue();
  const [brouillon, setBrouillon] = useState(valeur);
  useEffect(() => {
    if (visible) setBrouillon(VALEURS[indiceRepos(valeur, VALEURS)]!);
  }, [visible, valeur]);
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titre} glisserContenu={false} pied={<Bouton libelle={t("ui.valider")} variante="primaire" large onPress={() => onValider(brouillon)} />}>
      <RoueDuree valeur={valeur} onChange={setBrouillon} />
    </Feuille>
  );
}

/** Temps entre les exercices d'un superset : 0 à 2 min par 5 s (D8 : 0 par défaut, on enchaîne). */
const TRANSITIONS = Array.from({ length: 25 }, (_, i) => i * 5);

/** Feuille du repos d'un superset : deux roues côte à côte, « Entre les exercices » et « Après le tour », comme la feuille Tempo. */
export function FeuilleReposSuperset({
  visible,
  titre,
  sousTitre,
  transitionS,
  tourS,
  onFermer,
  onValider,
}: {
  visible: boolean;
  titre: string;
  sousTitre?: string;
  transitionS: number;
  tourS: number;
  onFermer: () => void;
  onValider: (transitionS: number, tourS: number) => void;
}) {
  useLangue();
  const [entre, setEntre] = useState(transitionS);
  const [apres, setApres] = useState(tourS);
  const [ouverture, setOuverture] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setEntre(TRANSITIONS[indiceRepos(transitionS, TRANSITIONS)]!);
    setApres(VALEURS[indiceRepos(tourS, VALEURS)]!);
    setOuverture((n) => n + 1);
  }, [visible, transitionS, tourS]);
  const colonnes: [string, number, number[], (v: number) => void][] = [
    [t("ui.reposSuperset.entre"), transitionS, TRANSITIONS, setEntre],
    [t("ui.reposSuperset.apres"), tourS, VALEURS, setApres],
  ];
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={titre}
      sousTitre={sousTitre}
      glisserContenu={false}
      pied={<Bouton libelle={t("ui.valider")} variante="primaire" large onPress={() => onValider(entre, apres)} />}
    >
      <View style={[styles.tempo, { marginTop: 12 }]}>
        {colonnes.map(([libelle, valeur, valeurs, regler]) => (
          <View key={`${ouverture}-${libelle}`} style={{ flex: 1 }}>
            <Texte variante="meta" couleur="t3" style={styles.libelleRoue}>
              {libelle}
            </Texte>
            <RoueDuree libelle={libelle} valeur={valeur} valeurs={valeurs} onChange={regler} decoupe={(v) => ({ attenue: "", plein: dureeRoueCourte(v) })} traits={false} />
          </View>
        ))}
      </View>
    </Feuille>
  );
}

const SECONDES = valeursTempo();
const CLES_PHASES = ["ui.tempo.descente", "ui.tempo.pauseBas", "ui.tempo.montee", "ui.tempo.pauseHaut"] as const;
const SANS_TEMPO: Tempo = [0, 0, 0, 0];

/** Feuille « Tempo » : quatre roues de 0 à 10 s (descente, pause en bas, montée, pause en haut), notation « 3-1-1-0 » en titre,
 *  la durée d'une répétition en sous-titre et l'aperçu du ruban au-dessus des roues (planche idee-plein-ecran).
 *  « Enregistrer » est le geste principal. Avec `defaut` (tempo de la famille, D5) : les roues partent de lui si la ligne
 *  n'a pas de tempo propre, et « Revenir au tempo par défaut » apparaît si elle en a un ; sans `defaut` : « Retirer le tempo ». */
export function FeuilleTempo({
  visible,
  tempo,
  defaut = null,
  onFermer,
  onEnregistrer,
}: {
  visible: boolean;
  tempo: string | null;
  defaut?: string | null;
  onFermer: () => void;
  onEnregistrer: (t: string | null) => void;
}) {
  useLangue();
  const [brouillon, setBrouillon] = useState<Tempo>(SANS_TEMPO);
  const brouillonRef = useRef(brouillon);
  const [ouverture, setOuverture] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const t = lireTempo(tempo) ?? lireTempo(defaut) ?? SANS_TEMPO;
    brouillonRef.current = t;
    setBrouillon(t);
    setOuverture((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const regler = (i: number, v: number) => {
    const t = [...brouillonRef.current] as Tempo;
    t[i] = v;
    brouillonRef.current = t;
    setBrouillon(t);
  };
  const aTempo = lireTempo(tempo) != null;
  const defautLu = lireTempo(defaut);
  const enregistrer = () => {
    const texte = lireTempo(tempoTexte(brouillonRef.current)) ? tempoTexte(brouillonRef.current) : null;
    // Le tempo de la famille, inchangé : la ligne continue de le suivre (rien de propre à enregistrer).
    onEnregistrer(defautLu && texte === tempoTexte(defautLu) ? null : texte);
  };
  const apercu = useMemo(() => phasesSerie(brouillon, 1), [brouillon]);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("ui.tempo.titre", { valeur: tempoTexte(brouillon) })}
      sousTitre={dureeTempo(brouillon) > 0 ? t("ui.tempo.parRep", { n: dureeTempo(brouillon) }) : undefined}
      glisserContenu={false}
      pied={
        <View style={{ gap: 8 }}>
          <Bouton libelle={t("ui.enregistrer")} variante="primaire" large onPress={enregistrer} />
          {aTempo && defautLu ? (
            <Bouton libelle={t("ui.tempo.revenir", { tempo: tempoTexte(defautLu) })} variante="tonal" large onPress={() => onEnregistrer(null)} />
          ) : aTempo ? (
            <Bouton libelle={t("ui.tempo.retirer")} variante="tonal" large onPress={() => onEnregistrer(null)} />
          ) : null}
        </View>
      }
    >
      <View style={styles.apercu}>
        <ApercuRuban phases={apercu} />
      </View>
      <View style={styles.tempo}>
        {phasesTempo().map((phase, i) => (
          <View key={`${ouverture}-${phase}`} style={{ flex: 1 }}>
            <Texte variante="meta" couleur="t3" numberOfLines={1} style={styles.libelleRoue}>
              {t(CLES_PHASES[i]!)}
            </Texte>
            <RoueDuree
              libelle={t(CLES_PHASES[i]!)}
              valeur={brouillon[i]!}
              onChange={(v) => regler(i, v)}
              valeurs={SECONDES}
              decoupe={(v) => ({ attenue: "", plein: String(v) })}
              lue={(v) => tp("ui.secondeLue", v)}
              traits={false}
            />
          </View>
        ))}
      </View>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  tempo: { flexDirection: "row", gap: 4 },
  // Aperçu du ruban : toute la largeur de la feuille (planche : 14 au-dessus, bords de la feuille).
  apercu: { marginTop: 14, marginHorizontal: -16 },
  libelleRoue: { textAlign: "center", fontSize: 12, height: 30, lineHeight: 30 },
  bande: { position: "absolute", left: 0, right: 0, height: HAUTEUR, borderRadius: rayon.l },
  valeur: { height: HAUTEUR, alignItems: "center", justifyContent: "center" },
  ligne: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 8 },
  texte: { fontSize: 20, fontVariant: ["tabular-nums"] },
  trait: { flex: 1, height: 1 },
  fondu: { position: "absolute", left: 0, right: 0 },
  unite: { position: "absolute", right: 16, height: HAUTEUR, justifyContent: "center" },
});
