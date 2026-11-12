// Les méthodes de « Aider à s'endormir » (planche sommeil, B3 à B6) : respiration lente, respiration carrée, méthode de
// l'armée, autohypnose, et l'écran de fin. Noir et braise (ThemeBraise), tête de 64 (Arrêter, titre, son), boutons du bas
// de 56. Mouvement (skill animate) : un guide de respiration, pas une décoration ; Animated natif (transform et opacity),
// les durées et les courbes de la planche ; « Réduire les animations » : le disque s'éclaire au lieu de grandir, le point
// du carré disparaît (les côtés et les mots restent).
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { locale, t, tp } from "../../i18n/index";
import { endormir } from "../../natif/endormir";
import { BRAISE, useTheme } from "../../theme";
import { courbe } from "../../theme/mouvement";
import { police, POLICE_MAX } from "../../theme/typo";
import { Icone, type NomIcone } from "../../ui/Icone";
import { useReduit } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { clesCote, cyclesCarree, ENDORMIR, minutesRestantes, mmss, phaseCarree, phaseLente, phraseHypnose, type MotCarre } from "./endormir";

// La courbe de la planche (easeInOutSine, easings.net) : le souffle accélère puis ralentit, comme une respiration.
const SINUS = Easing.bezier(0.37, 0, 0.63, 1);
const sortie = Easing.bezier(...courbe.sortie);

/** Le temps de la méthode, pauses retirées (relu toutes les 100 ms : le mot et le décompte suivent le point). */
function useChrono() {
  const r = useRef({ debut: Date.now(), pause: null as number | null, cumul: 0 });
  const [, setTic] = useState(0);
  const [enPause, setEnPause] = useState(false);
  useEffect(() => {
    if (enPause) return;
    const h = setInterval(() => setTic((x) => x + 1), 100);
    return () => clearInterval(h);
  }, [enPause]);
  const ecoule = useCallback(() => {
    const c = r.current;
    return Math.max(0, ((c.pause ?? Date.now()) - c.debut - c.cumul) / 1000);
  }, []);
  const basculer = useCallback(() => {
    const c = r.current;
    if (c.pause != null) {
      c.cumul += Date.now() - c.pause;
      c.pause = null;
      setEnPause(false);
    } else {
      c.pause = Date.now();
      setEnPause(true);
    }
  }, []);
  return { ecoule, enPause, basculer };
}

/** Une note douce au début de chaque phase (`cle` qui change, la première comprise), si le son est allumé et hors pause. */
function useNote(cle: string, hz: number, actif: boolean) {
  const avant = useRef<string | null>(null);
  useEffect(() => {
    if (cle === avant.current) return;
    avant.current = cle;
    if (actif) void endormir.tonalite(hz, ENDORMIR.son.ms, ENDORMIR.son.volume);
  }, [cle, hz, actif]);
  useEffect(() => () => void endormir.silence(), []);
}

/** Fondu à l'arrivée d'une nouvelle étape ou phrase (opacité seule : rien ne bouge). */
function Fondu({ cle, children }: { cle: string | number; children: ReactNode }) {
  const o = useRef(new Animated.Value(1)).current;
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    o.setValue(0);
    Animated.timing(o, { toValue: 1, duration: ENDORMIR.fondu, easing: sortie, useNativeDriver: true }).start();
  }, [cle, o]);
  return <Animated.View style={{ opacity: o, alignItems: "center" }}>{children}</Animated.View>;
}

// ---------------------------------------------------------------- la tête, le centre, le bas (planche : tete-s, centre, bas-s)

export function Tete({ titre, onArreter, son, libelleArreter }: { titre?: string; onArreter: () => void; son?: { actif: boolean; lu: string; basculer: () => void }; libelleArreter: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.tete}>
      <BoutonIcone icone="close" lu={libelleArreter} onPress={onArreter} />
      {titre ? (
        <Texte numberOfLines={1} style={[styles.teteTitre, { color: couleurs.t2 }]}>
          {titre}
        </Texte>
      ) : null}
      {son ? (
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: son.actif }} accessibilityLabel={son.lu} onPress={son.basculer} hitSlop={4} style={styles.bi}>
          <Icone nom="son" taille={22} couleur={son.actif ? couleurs.t2 : couleurs.line2} />
          {son.actif ? null : <View style={[styles.barre, { backgroundColor: couleurs.t2 }]} />}
        </Pressable>
      ) : (
        <View style={styles.bi} />
      )}
    </View>
  );
}

function BoutonIcone({ icone, lu, onPress }: { icone: NomIcone; lu: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={lu} onPress={onPress} hitSlop={4} style={styles.bi}>
      <Icone nom={icone} taille={22} couleur={couleurs.t2} />
    </Pressable>
  );
}

export function Bas({ children }: { children: ReactNode }) {
  const bas = useSafeAreaInsets().bottom;
  return <View style={[styles.bas, { paddingBottom: Math.max(34, bas + 16) }]}>{children}</View>;
}

export function BoutonBas({ libelle, icone, iconeApres, onPress, desactive }: { libelle: string; icone?: NomIcone; iconeApres?: NomIcone; onPress: () => void; desactive?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ disabled: !!desactive }}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: pressed ? BRAISE(0.12) : BRAISE(0.06), borderColor: BRAISE(0.1), opacity: desactive ? 0.4 : 1 }]}
    >
      {icone ? <Icone nom={icone} taille={18} couleur={couleurs.t1} /> : null}
      <Texte style={[styles.btnTexte, { color: couleurs.t1 }]}>{libelle}</Texte>
      {iconeApres ? <Icone nom={iconeApres} taille={18} couleur={couleurs.t1} /> : null}
    </Pressable>
  );
}

function Info({ lignes }: { lignes: string[] }) {
  const { couleurs } = useTheme();
  return <Texte style={[styles.info, { color: couleurs.t2 }]}>{lignes.join("\n")}</Texte>;
}

interface PropsMethode {
  onArreter: () => void;
  onFin: () => void;
}

// ---------------------------------------------------------------- B3 · respiration lente

export function Lente({ onArreter, onFin }: PropsMethode) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const ch = useChrono();
  const [cote, setCote] = useState<number>(ENDORMIR.lente.normal);
  const [son, setSon] = useState(true);
  const origine = useRef(0);
  // 0 → 1 à l'inspiration, 1 → 2 à l'expiration, linéaire : la courbe est posée sur chaque moitié par interpolate (comme les
  // images clés de la planche, une courbe par segment).
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (ch.enPause) return;
    let arrete = false;
    const lancer = () => {
      if (arrete) return;
      const c = 2 * cote;
      const x = (((ch.ecoule() - origine.current) % c) + c) % c;
      v.setValue(x / cote);
      Animated.timing(v, { toValue: 2, duration: Math.max(50, (c - x) * 1000), easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => finished && lancer());
    };
    lancer();
    return () => {
      arrete = true;
      v.stopAnimation();
    };
  }, [cote, ch.enPause, ch.ecoule, v]);

  const e = ch.ecoule();
  const total = 10 * 60;
  useEffect(() => {
    if (e >= total) onFin();
  }, [e, total, onFin]);
  const x = e - origine.current;
  const p = phaseLente(x, cote);
  useNote(`${Math.floor(x / cote)}`, p.phase === "inspire" ? ENDORMIR.son.inspire : ENDORMIR.son.expire, son && !ch.enPause);

  // une fois pour toutes, pas à chaque tic du chrono
  const { bulle, motIn, motEx } = useMemo(() => {
    const remplissage = v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0], easing: SINUS });
    return {
      bulle: reduit
        ? { opacity: remplissage.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }
        : { transform: [{ scale: remplissage.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] },
      motIn: v.interpolate({ inputRange: [0, 0.94, 1, 1.94, 2], outputRange: [1, 1, 0, 0, 1] }),
      motEx: v.interpolate({ inputRange: [0, 0.94, 1, 1.94, 2], outputRange: [0, 0, 1, 1, 0] }),
    };
  }, [v, reduit]);
  const changer = () => {
    origine.current = ch.ecoule();
    setCote((c) => (c === ENDORMIR.lente.normal ? ENDORMIR.lente.court : ENDORMIR.lente.normal));
  };

  return (
    <>
      <Tete
        titre={t("endormir.m.lente")}
        onArreter={onArreter}
        libelleArreter={t("endormir.arreter")}
        son={{ actif: son, lu: t(son ? "endormir.son.actif" : "endormir.son.coupe"), basculer: () => setSon((s) => !s) }}
      />
      <View style={styles.centre}>
        <View style={styles.disque} accessible accessibilityRole="image" accessibilityLabel={t("endormir.lente.lu", { n: cote })}>
          <View style={[StyleSheet.absoluteFill, styles.rond, { borderWidth: 1, borderColor: BRAISE(0.16) }]} />
          <Animated.View style={[StyleSheet.absoluteFill, bulle]}>
            <Svg width={240} height={240}>
              <Defs>
                <RadialGradient id="bulle" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="rgb(255,154,110)" stopOpacity={0.05} />
                  <Stop offset="0.7" stopColor="rgb(255,154,110)" stopOpacity={0.1} />
                  <Stop offset="1" stopColor="rgb(255,154,110)" stopOpacity={0.16} />
                </RadialGradient>
              </Defs>
              <Circle cx={120} cy={120} r={119.25} fill="url(#bulle)" stroke={BRAISE(0.42)} strokeWidth={1.5} />
            </Svg>
          </Animated.View>
          <View style={styles.dedans} pointerEvents="none">
            <Animated.Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.mot, { color: couleurs.t1, opacity: motIn }]}>{t("endormir.inspire")}</Animated.Text>
            <Animated.Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.mot, styles.motDessus, { color: couleurs.t1, opacity: motEx }]}>{t("endormir.expire")}</Animated.Text>
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <Info
            lignes={[
              t("endormir.lente.rythme", { n: cote, reste: tp("endormir.restantes", minutesRestantes(e, total)) }),
              t("endormir.lente.conseil"),
            ]}
          />
        </View>
      </View>
      <Bas>
        <BoutonBas libelle={t(ch.enPause ? "endormir.reprendre" : "endormir.pause")} icone={ch.enPause ? "play" : "pause"} onPress={ch.basculer} />
        <BoutonBas
          libelle={cote === ENDORMIR.lente.normal ? t("endormir.lente.court") : t("endormir.lente.normal", { n: ENDORMIR.lente.normal })}
          onPress={changer}
        />
      </Bas>
    </>
  );
}

// ---------------------------------------------------------------- B4 · respiration carrée

const COTE_PX = 232;
const MOTS: Record<MotCarre, "endormir.inspire" | "endormir.retiens" | "endormir.expire"> = {
  inspire: "endormir.inspire",
  retiens: "endormir.retiens",
  expire: "endormir.expire",
  retiensVide: "endormir.retiens",
};

export function Carree({ onArreter, onFin }: PropsMethode) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const ch = useChrono();
  const [cote, setCote] = useState<number>(ENDORMIR.carree.normal);
  const [son, setSon] = useState(true);
  const origine = useRef(0);
  // 0 → 4 : un côté par unité, linéaire (16 s le tour à 4 s par côté).
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (ch.enPause) return;
    let arrete = false;
    const lancer = () => {
      if (arrete) return;
      const c = 4 * cote;
      const x = (((ch.ecoule() - origine.current) % c) + c) % c;
      v.setValue(x / cote);
      Animated.timing(v, { toValue: 4, duration: Math.max(50, (c - x) * 1000), easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => finished && lancer());
    };
    lancer();
    return () => {
      arrete = true;
      v.stopAnimation();
    };
  }, [cote, ch.enPause, ch.ecoule, v]);

  const e = ch.ecoule();
  const x = e - origine.current;
  const cycles = cyclesCarree(4, cote);
  const total = cycles * 4 * cote;
  useEffect(() => {
    if (x >= total) onFin();
  }, [x, total, onFin]);
  const p = phaseCarree(x, cote);
  const hz = p.mot === "inspire" ? ENDORMIR.son.inspire : p.mot === "expire" ? ENDORMIR.son.expire : ENDORMIR.son.retiens;
  useNote(`${p.cycle}-${p.cote}`, hz, son && !ch.enPause);

  // Le côté actif à .85, les autres à .2 (clesCote) ; une fois pour toutes, pas à chaque tic du chrono.
  const anim = useMemo(() => {
    const cotes = ([0, 1, 2, 3] as const).map((i) => v.interpolate(clesCote(i)));
    const tx = v.interpolate({ inputRange: [0, 1, 2, 3, 4], outputRange: [0, COTE_PX, COTE_PX, 0, 0] });
    const ty = v.interpolate({ inputRange: [0, 1, 2, 3, 4], outputRange: [0, 0, COTE_PX, COTE_PX, 0] });
    return { cotes, tx, ty };
  }, [v]);
  const changer = () => {
    origine.current = ch.ecoule();
    setCote((c) => (c === ENDORMIR.carree.normal ? ENDORMIR.carree.court : ENDORMIR.carree.normal));
  };

  return (
    <>
      <Tete
        titre={t("endormir.m.carree")}
        onArreter={onArreter}
        libelleArreter={t("endormir.arreter")}
        son={{ actif: son, lu: t(son ? "endormir.carree.son.actif" : "endormir.carree.son.coupe"), basculer: () => setSon((s) => !s) }}
      />
      <View style={styles.centre}>
        <View style={styles.carre} accessible accessibilityRole="image" accessibilityLabel={t("endormir.carree.lu", { n: cote })}>
          <Animated.View style={[styles.coteH, { top: 0, opacity: anim.cotes[0] }]} />
          <Animated.View style={[styles.coteV, { right: 0, opacity: anim.cotes[1] }]} />
          <Animated.View style={[styles.coteH, { bottom: 0, opacity: anim.cotes[2] }]} />
          <Animated.View style={[styles.coteV, { left: 0, opacity: anim.cotes[3] }]} />
          {reduit ? null : <Animated.View style={[styles.point, { transform: [{ translateX: anim.tx }, { translateY: anim.ty }] }]} />}
          <View style={styles.dedans} pointerEvents="none">
            <Texte style={[styles.mot, { color: couleurs.t1 }]}>{t(MOTS[p.mot])}</Texte>
            <Texte style={styles.compte}>{p.compte}</Texte>
          </View>
        </View>
        <Info
          lignes={[
            t("endormir.carree.cycle", { c: Math.min(cycles, p.cycle), n: cycles, reste: tp("endormir.restantes", minutesRestantes(x, total)) }),
            t("endormir.carree.conseil"),
          ]}
        />
      </View>
      <Bas>
        <BoutonBas libelle={t(ch.enPause ? "endormir.reprendre" : "endormir.pause")} icone={ch.enPause ? "play" : "pause"} onPress={ch.basculer} />
        <BoutonBas libelle={t("endormir.carree.cote", { n: cote === ENDORMIR.carree.normal ? ENDORMIR.carree.court : ENDORMIR.carree.normal })} onPress={changer} />
      </Bas>
    </>
  );
}

// ---------------------------------------------------------------- B5 · méthode de l'armée (D9)

const ETAPES = ["endormir.armee.e1", "endormir.armee.e2", "endormir.armee.e3", "endormir.armee.e4", "endormir.armee.e5", "endormir.armee.e6"] as const;

export function Armee({ onArreter, onFin }: PropsMethode) {
  const { couleurs } = useTheme();
  const ch = useChrono();
  const [k, setK] = useState(0);
  const [voix, setVoix] = useState(true);
  const debutEtape = useRef(0);
  const n = ENDORMIR.armee.etapes;

  // la voix de synthèse hors ligne d'Android (D8), lente ; coupée en quittant
  useEffect(() => {
    if (!voix) return;
    Speech.stop()
      .then(() => Speech.speak(t(ETAPES[k]!), { language: locale(), rate: 0.8, pitch: 0.95 }))
      .catch(() => {});
  }, [k, voix]);
  useEffect(() => () => void Speech.stop().catch(() => {}), []);

  const aller = (i: number) => {
    debutEtape.current = ch.ecoule();
    if (i >= n) onFin();
    else setK(Math.max(0, i));
  };
  const reste = Math.max(0, Math.ceil(ENDORMIR.armee.secondes - (ch.ecoule() - debutEtape.current)));
  useEffect(() => {
    if (reste === 0) aller(k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reste]);

  const sous = k === n - 1 ? t("endormir.armee.derniere", { s: reste }) : t(voix ? "endormir.armee.sous" : "endormir.armee.sousMuet", { s: reste });
  return (
    <>
      <Tete
        titre={t("endormir.armee.titre", { k: k + 1, n })}
        onArreter={onArreter}
        libelleArreter={t("endormir.arreter")}
        son={{
          actif: voix,
          lu: t(voix ? "endormir.armee.voix.actif" : "endormir.armee.voix.coupe"),
          basculer: () => {
            if (voix) void Speech.stop().catch(() => {});
            setVoix((x) => !x);
          },
        }}
      />
      <View style={styles.centre}>
        <View style={styles.etapes} accessible accessibilityRole="image" accessibilityLabel={t("endormir.armee.lu", { k: k + 1, n })}>
          {ETAPES.map((c, i) => (
            <View key={c} style={[styles.etape, { backgroundColor: BRAISE(i < k ? 0.5 : i === k ? 0.85 : 0.2) }]} />
          ))}
        </View>
        <Fondu cle={k}>
          <Texte accessibilityLiveRegion="polite" style={[styles.etapeT, { color: couleurs.t1 }]}>
            {t(ETAPES[k]!)}
          </Texte>
        </Fondu>
        <Texte style={[styles.etapeS, { color: couleurs.t2 }]}>{sous}</Texte>
      </View>
      <Bas>
        <BoutonBas libelle={t("endormir.precedente")} icone="left" desactive={k === 0} onPress={() => aller(k - 1)} />
        <BoutonBas libelle={t("endormir.suivante")} iconeApres="right" onPress={() => aller(k + 1)} />
      </Bas>
    </>
  );
}

// ---------------------------------------------------------------- B6 · autohypnose, en texte guidé (D8 : pas de voix enregistrée)

const PHRASES = [
  "endormir.hypnose.p1", "endormir.hypnose.p2", "endormir.hypnose.p3", "endormir.hypnose.p4", "endormir.hypnose.p5", "endormir.hypnose.p6", "endormir.hypnose.p7",
  "endormir.hypnose.p8", "endormir.hypnose.p9", "endormir.hypnose.p10", "endormir.hypnose.p11", "endormir.hypnose.p12", "endormir.hypnose.p13", "endormir.hypnose.p14",
  "endormir.hypnose.p15",
] as const;

export function Hypnose({ onArreter, onFin }: PropsMethode) {
  const { couleurs } = useTheme();
  const ch = useChrono();
  const e = ch.ecoule();
  const total = ENDORMIR.hypnose.phrases * ENDORMIR.hypnose.secondes;
  useEffect(() => {
    if (e >= total) onFin();
  }, [e, total, onFin]);
  const i = phraseHypnose(e);
  // La voix de synthèse hors ligne d'Android lit chaque phrase, lentement et grave, à son tour ; coupée en quittant ou en pause
  // (04/11 : « lire et fermer les yeux, c'est absurde : ça doit être audio »). Allumée par défaut.
  const [voix, setVoix] = useState(true);
  useEffect(() => {
    if (!voix || ch.enPause) {
      void Speech.stop().catch(() => {});
      return;
    }
    Speech.stop()
      .then(() => Speech.speak(t(PHRASES[i]!), { language: locale(), rate: 0.68, pitch: 0.9 }))
      .catch(() => {});
  }, [i, voix, ch.enPause]);
  useEffect(() => () => void Speech.stop().catch(() => {}), []);
  return (
    <>
      <Tete
        titre={t("endormir.m.hypnose")}
        onArreter={onArreter}
        libelleArreter={t("endormir.arreter")}
        son={{
          actif: voix,
          lu: t(voix ? "endormir.hypnose.voix.actif" : "endormir.hypnose.voix.coupe"),
          basculer: () => setVoix((x) => !x),
        }}
      />
      <View style={styles.centre}>
        <Texte style={[styles.titreA, { color: couleurs.t1 }]}>{t("endormir.hypnose.nom")}</Texte>
        <Texte style={[styles.tempsA, { color: couleurs.t2 }]}>{t("endormir.hypnose.temps", { a: mmss(e), b: mmss(total) })}</Texte>
        <View style={styles.piste}>
          <View style={[styles.pisteRemplie, { width: `${Math.min(100, (e / total) * 100)}%` }]} />
        </View>
        <Fondu cle={i}>
          <Texte accessibilityLiveRegion="polite" style={[styles.etapeT, { color: couleurs.t1 }]}>
            {t(PHRASES[i]!)}
          </Texte>
        </Fondu>
        <Info lignes={[t(voix ? "endormir.hypnose.infoVoix" : "endormir.hypnose.info")]} />
      </View>
      <Bas>
        <BoutonBas libelle={t(ch.enPause ? "endormir.reprendre" : "endormir.pause")} icone={ch.enPause ? "play" : "pause"} onPress={ch.basculer} />
      </Bas>
    </>
  );
}

// ---------------------------------------------------------------- la fin : l'écran reste noir, le téléphone l'éteint

export function Fin({ onArreter }: { onArreter: () => void }) {
  const { couleurs } = useTheme();
  return (
    <>
      <Tete onArreter={onArreter} libelleArreter={t("endormir.fermer")} />
      <View style={styles.centre}>
        <Icone nom="lune" taille={28} couleur={couleurs.t3} />
        <Texte style={[styles.titreA, { color: couleurs.t1, marginTop: 16 }]}>{t("endormir.fin.titre")}</Texte>
        <Texte style={[styles.etapeS, { color: couleurs.t2 }]}>{t("endormir.fin.sous")}</Texte>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  tete: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 4, paddingRight: 8 },
  teteTitre: { flex: 1, textAlign: "center", fontFamily: police.medium, fontSize: 14 },
  bi: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  barre: { position: "absolute", width: 26, height: 1.5, borderRadius: 1, transform: [{ rotate: "-45deg" }] },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 130 },
  bas: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, flexDirection: "row", gap: 12 },
  btn: { flex: 1, height: 56, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnTexte: { fontFamily: police.medium, fontSize: 16 },
  info: { fontFamily: police.regular, fontSize: 13, lineHeight: 21, marginTop: 28, textAlign: "center", fontVariant: ["tabular-nums"] },
  disque: { width: 240, height: 240, alignItems: "center", justifyContent: "center" },
  rond: { borderRadius: 120 },
  dedans: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: 10 },
  mot: { fontFamily: police.medium, fontSize: 22 },
  motDessus: { position: "absolute" },
  carre: { width: COTE_PX, height: COTE_PX },
  coteH: { position: "absolute", left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: "rgb(255,154,110)" },
  coteV: { position: "absolute", top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: "rgb(255,154,110)" },
  point: { position: "absolute", left: -7, top: -7, width: 16, height: 16, borderRadius: 8, backgroundColor: BRAISE(0.9) },
  compte: { fontFamily: police.light, fontSize: 64, lineHeight: 68, letterSpacing: -1.9, color: BRAISE(0.6), fontVariant: ["tabular-nums"] },
  etapes: { flexDirection: "row", gap: 6 },
  etape: { width: 22, height: 4, borderRadius: 2 },
  etapeT: { fontFamily: police.medium, fontSize: 24, lineHeight: 34, letterSpacing: -0.24, marginTop: 28, textAlign: "center" },
  etapeS: { fontFamily: police.regular, fontSize: 13.5, lineHeight: 20, marginTop: 14, maxWidth: 320, textAlign: "center" },
  titreA: { fontFamily: police.medium, fontSize: 20 },
  tempsA: { fontFamily: police.regular, fontSize: 13, marginTop: 8, fontVariant: ["tabular-nums"] },
  piste: { width: 240, height: 2, borderRadius: 1, backgroundColor: BRAISE(0.16), marginTop: 18, overflow: "hidden" },
  pisteRemplie: { height: 2, borderRadius: 1, backgroundColor: BRAISE(0.6) },
});
