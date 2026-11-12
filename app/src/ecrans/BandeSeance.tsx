import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lireZonesFc, type SeanceDetail } from "../db";
import { t } from "../i18n/index";
import { suivi, type EtatSuivi } from "../natif/suivi";
import { useTheme } from "../theme";
import type { Jetons } from "../theme/jetons";
import { duree } from "../theme/mouvement";
import { espace, police, rayon } from "../theme/typo";
import { Icone, type NomIcone } from "../ui/Icone";
import { Appui, courbes } from "../ui/mouvement";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import { useMinuteur } from "../ui/useMinuteur";
import { useApp } from "./contexte";
import { CourbeFcDirecte } from "./CourbeFcDirecte";
import { FeuilleFc } from "./FeuilleFc";
import { demarrerFcMuscu, fcMuscuVoulue, synchroniserPause } from "./fc-muscu";
import { BatterieAuMoment } from "./FeuilleBatterie";
import { bandeFc, picDuRepos, type BandeFc, type Echantillon } from "./fc-muscu-vue";
import { autoriserAppareils, ouvrirWhoop } from "./appareils-proximite";
import { chronoTexte, etatTuto, type EtatFc, type Tuto } from "./suivi-direct-vue";
import { bornesDe, FC_MAX_DEFAUT, type RefZones } from "./zones-fc";

// Bande fixe en bas de la séance (planches/suivi-gps § 6, option A, D4 validée) : la FC de la Whoop, sa zone et, pendant un
// repos, la baisse depuis le pic de la série (« −32 ») ; Pause, tonal, à droite (Terminer garde le seul dégradé de l'écran).
// En pause : « En pause 2:14 » et Reprendre, ▶ orange ; c'est la même pause que la feuille Durée. Sans Whoop : Pause seule.
// Diffusion coupée : « Activer » ouvre le tuto « Activer la FC en direct » de la course. La bande ne se redessine qu'elle à
// chaque instantané du service (1 Hz), pas la liste des séries.
// Toucher la FC déplie la bande vers le haut (31/10) : le chiffre rétrécit, la courbe des 5 dernières minutes
// apparaît (CourbeFcDirecte, coupures visibles) ; retoucher replie. Retenu pour la séance ; sans capteur, rien à déplier.

/** Ce que la bande garde de la FC (le pic d'une série se cherche jusqu'à 1 min avant sa coche). */
const GARDE_MS = 5 * 60_000;
const RELEVE_MS = 2000;
const RECHERCHE_FC_MS = 8000;
/** Hauteur dont la bande monte, dépliée (titre, courbe et leurs marges). */
const PANNEAU = 74;
/** Le chiffre déplié : 30 → 20. */
const ECHELLE_DEPLIEE = 2 / 3;
/** Séances dont la courbe est dépliée (retenu pendant la séance, même si l'écran est refermé puis rouvert). */
const deplies = new Set<string>();

/**
 * FC de démonstration (pepfitopen://session?demo=fc, comme le suivi GPS) : pour voir la bande sans capteur (émulateur, captures).
 * Affichage seul : jamais enregistrée. Pendant un repos, la FC culmine 8 s après la coche puis redescend. Le tampon de
 * démonstration a une coupure de 40 s, 2 min 30 avant l'ouverture ; demo=coupure perd aussi la FC de 20 à 50 s après.
 */
function fcDemo(t: number, coche: number | null, repos: boolean): number {
  if (!repos || coche == null) return Math.round(148 + 6 * Math.sin(t / 9000));
  const x = (t - coche) / 1000;
  return x < 8 ? Math.round(140 + 1.6 * x) : Math.max(96, Math.round(153 - 0.9 * (x - 8)));
}

export function BandeSeance({ seance, demo = false, demoCoupure = false, haut, onPause, onReprendre }: {
  seance: SeanceDetail;
  /** Au-dessus de la FC : la ligne du direct sur écran (planche seance-live, P5). */
  haut?: ReactNode;
  demo?: boolean;
  demoCoupure?: boolean;
  onPause: () => void;
  onReprendre: () => void;
}) {
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const repos = useMinuteur();
  const [active, setActive] = useState(demo);
  const [appareils, setAppareils] = useState<boolean | null>(demo ? true : null);
  const [etat, setEtat] = useState<EtatSuivi | null>(null);
  const [fcMax, setFcMax] = useState<RefZones>(FC_MAX_DEFAUT);
  const [maintenant, setMaintenant] = useState(Date.now());
  const depuis = useRef(Date.now());
  const vue = useRef(false);
  const fc = useRef<Echantillon[]>([]);
  const [tuto, setTuto] = useState<Tuto | null>(null);
  const [essaye, setEssaye] = useState(false);
  const [recherche, setRecherche] = useState<EtatFc>({ etat: "absente" });

  const s = seance.seance;
  const pause = s.pause_debut;
  const [ouvert, setOuvert] = useState(() => deplies.has(s.id));
  const demoT0 = useRef(Date.now());
  const reduit = useReduit();
  // L'écran de séance peut déjà être monté quand le lien de démonstration arrive : la coupure part de son arrivée.
  useEffect(() => {
    demoT0.current = Date.now();
  }, [demo, demoCoupure]);
  const ref = useRef(seance);
  ref.current = seance;

  useEffect(() => {
    lireZonesFc(db).then(setFcMax).catch(console.error);
  }, [db]);

  const lancer = useCallback(async () => {
    const x = ref.current.seance;
    depuis.current = Date.now();
    const titre = x.titre ?? ref.current.routineNom ?? t("seance.seance.titreDefaut");
    const e = await demarrerFcMuscu(db, { id: x.id, titre, debut: x.debut, pauseDebut: x.pause_debut, pauseCumulS: x.pause_cumul_s });
    if (e) setEtat(e);
  }, [db]);

  // À l'ouverture de la séance : la FC Whoop allumée, « Appareils à proximité » (expliqués puis demandés, une fois par
  // lancement de l'appli), puis le service ; s'il tourne déjà pour cette séance, on le retrouve.
  useEffect(() => {
    if (demo) return;
    let fini = false;
    (async () => {
      const voulue = await fcMuscuVoulue(db);
      if (fini) return;
      setActive(voulue);
      if (!voulue) return;
      const r = await autoriserAppareils(false);
      if (fini) return;
      setAppareils(r === "accorde");
      if (r === "accorde") await lancer();
    })().catch(console.error);
    return () => {
      fini = true;
    };
  }, [db, demo, s.id, lancer]);

  useEffect(
    () =>
      suivi.ecouter((e) => {
        if (e.mode !== "muscu") return;
        if (e.fc.etat === "connecte" && e.fc.bpm != null) vue.current = true;
        setEtat(e);
      }),
    [],
  );

  // FC du tampon, par morceaux (le pic de la dernière série pour la baisse pendant le repos).
  const id = etat?.id ?? null;
  useEffect(() => {
    if (!id || demo) return;
    let actif = true;
    let lus = 0;
    fc.current = [];
    const relever = async () => {
      const l = await suivi.frequences(id, lus);
      if (!actif || !l.length) return;
      lus += l.length;
      const limite = Date.now() - GARDE_MS;
      fc.current = fc.current.concat(l.map((f) => ({ t: f.t, bpm: f.bpm }))).filter((f) => f.t >= limite);
    };
    relever().catch(console.error);
    const h = setInterval(() => relever().catch(console.error), RELEVE_MS);
    return () => {
      actif = false;
      clearInterval(h);
    };
  }, [id, demo]);

  // La pause de la séance fige aussi le chrono de la notification.
  const statut = etat?.statut ?? null;
  useEffect(() => {
    if (demo || etat?.mode !== "muscu") return;
    if ((pause != null && statut === "en_cours") || (pause == null && statut === "pause")) synchroniserPause(pause != null).then((e) => e && setEtat(e)).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause, statut, demo]);

  // Une seconde à la fois : la démonstration, le temps de la pause, l'attente du service (lui émet déjà à 1 Hz).
  const lance = etat != null;
  useEffect(() => {
    if (!demo && pause == null && (lance || !active)) return;
    const h = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(h);
  }, [demo, pause, lance, active]);

  const chercher = useCallback(async () => {
    setRecherche({ etat: "recherche" });
    try {
      const l = await suivi.chercherFc(RECHERCHE_FC_MS);
      const a = l.filter((x) => x.fc).sort((x, y) => y.rssi - x.rssi)[0];
      setRecherche(a ? { etat: "trouvee", appareil: a } : { etat: "absente" });
    } catch {
      setRecherche({ etat: "refus" });
    }
  }, []);

  // Retour dans pepfit (appli Whoop, réglages d'Android) : « Appareils à proximité » relus ; accordés, le service part. Le
  // tuto ouvert dit le résultat (le service, lui, se reconnecte seul au capteur dès qu'il diffuse).
  const vivant = useRef({ tuto, active, etat });
  vivant.current = { tuto, active, etat };
  useEffect(() => {
    if (demo) return;
    const abonnement = AppState.addEventListener("change", (e) => {
      if (e !== "active") return;
      suivi
        .appareils()
        .then(async (ok) => {
          const v = vivant.current;
          setAppareils(ok);
          if (v.tuto) setEssaye(true);
          if (ok && v.active && !v.etat) await lancer();
          if (v.tuto === "fc") await chercher();
        })
        .catch(console.error);
    });
    return () => abonnement.remove();
  }, [demo, lancer, chercher]);

  const ouvrirTuto = (x: Tuto) => {
    setEssaye(false);
    setTuto(x);
  };
  const autoriser = async () => {
    const r = await autoriserAppareils(true);
    setAppareils(r === "accorde");
    if (r === "accorde") await lancer();
    else if (r === "bloque") ouvrirTuto("appareils");
  };

  const coche = derniereCoche(seance);
  const t0 = demo ? maintenant : Date.now();
  const absente = (ti: number) => {
    const x = ti - demoT0.current;
    return (x >= -150_000 && x < -110_000) || (demoCoupure && x >= 20_000 && x < 50_000);
  };
  const bpmDemo = demo && !absente(t0) ? fcDemo(t0, coche, repos.actif) : null;
  if (demo) {
    fc.current = [];
    for (let ti = t0 - GARDE_MS; ti <= t0; ti += 1000) {
      if (absente(ti)) continue;
      fc.current.push({ t: ti, bpm: repos.actif && coche != null && ti >= coche - 60_000 ? (ti < coche ? 140 : fcDemo(ti, coche, true)) : fcDemo(ti, null, false) });
    }
  }
  const b: BandeFc = bandeFc({
    active,
    appareils,
    etat: demo ? "connecte" : (etat?.fc.etat ?? null),
    bpm: demo ? bpmDemo : (etat?.fc.bpm ?? null),
    vue: demo || vue.current,
    depuisMs: t0 - depuis.current,
    fcMax,
    pic: repos.actif ? picDuRepos(fc.current, coche, t0) : null,
  });

  const couleurZone = (z: number) => (z ? couleurs[`zone${z}` as keyof Jetons] : couleurs.t3);
  const enPause = pause != null;

  // Déplier : seulement avec un capteur qui donne (ou a donné) la FC, et hors pause (la pause garde l'état pour la reprise).
  const peutDeplier = !enPause && (b.genre === "fc" || b.genre === "perdue");
  const deplie = ouvert && peutDeplier;
  const basculer = () => {
    const n = !ouvert;
    if (n) deplies.add(s.id);
    else deplies.delete(s.id);
    setOuvert(n);
  };
  const bornes = useMemo(() => bornesDe(fcMax), [fcMax]);
  // Le panneau monte et le chiffre rétrécit sur le fil UI ; la courbe reste montée le temps de la descente, puis s'arrête.
  const k = useSharedValue(deplie ? 1 : 0);
  const [monte, setMonte] = useState(deplie);
  useEffect(() => {
    if (deplie) setMonte(true);
    if (reduit) {
      k.value = deplie ? 1 : 0;
      if (!deplie) setMonte(false);
      return;
    }
    k.value = withTiming(deplie ? 1 : 0, { duration: deplie ? duree.feuille : duree.feuilleSortie, easing: courbes.sortie }, (fini) => {
      if (fini && !deplie) scheduleOnRN(setMonte, false);
    });
  }, [deplie, reduit, k]);
  const panneau = useAnimatedStyle(() => ({ height: k.value * PANNEAU, opacity: k.value }));
  const chiffre = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - ECHELLE_DEPLIEE) * k.value }] }));

  const fcVue =
    b.genre === "fc" ? (
      <Animated.View style={[styles.fc, styles.origine, chiffre]}>
        <Icone nom="sante" taille={22} couleur={couleurZone(b.zone)} />
        <Texte style={styles.bpm}>{String(b.bpm)}</Texte>
        <Texte couleur="t2" style={styles.unite}>
          {t("gps.bpm")}
        </Texte>
        {b.zone ? <Texte style={[styles.zone, { color: couleurZone(b.zone) }]}>{t("gps.zone", { n: b.zone })}</Texte> : null}
        {repos.actif && b.baisse != null ? (
          <Texte couleur="t2" style={styles.baisse}>{`−${b.baisse}`}</Texte>
        ) : null}
      </Animated.View>
    ) : (
      <Animated.View style={[styles.fc, styles.origine, chiffre]}>
        <Icone nom="sante" taille={22} couleur={couleurs.t3} />
        <Texte style={styles.bpm}>—</Texte>
        <Texte couleur="t2" style={styles.unite}>
          {t("gps.bpm")}
        </Texte>
      </Animated.View>
    );

  return (
    <View style={[styles.bande, { backgroundColor: couleurs.s1, paddingBottom: bas }, mode === "jour" && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
      {monte ? (
        <Animated.View style={[styles.panneau, panneau]} pointerEvents="none">
          <View style={styles.panneauDedans}>
            <CourbeFcDirecte fc={fc} bornes={bornes} />
          </View>
        </Animated.View>
      ) : null}
      {haut}
      <View style={styles.ligne}>
        {enPause ? (
          <View style={styles.fc} accessibilityRole="timer">
            <Texte style={styles.pause} couleur="t2">
              {t("gps.enPause")}
            </Texte>
            <Texte style={styles.pauseT}>{chronoTexte(Math.max(0, (demo ? maintenant : Date.now()) - pause))}</Texte>
          </View>
        ) : peutDeplier ? (
          <Appui
            accessibilityRole="button"
            accessibilityLabel={b.genre === "fc" ? t("seance.fc.lu", { bpm: b.bpm, zone: b.zone }) : t("gps.bpm")}
            accessibilityHint={t(ouvert ? "seance.fc.reduireCourbe" : "seance.fc.voirCourbe")}
            accessibilityState={{ expanded: ouvert }}
            echelle={1}
            onPress={basculer}
            style={styles.zoneFc}
          >
            {fcVue}
          </Appui>
        ) : b.genre === "recherche" ? (
          <View style={styles.fc}>
            <Icone nom="sante" taille={22} couleur={couleurs.t3} />
            <Texte couleur="t2" style={styles.etat}>
              {t("gps.recherche")}
            </Texte>
          </View>
        ) : b.genre === "coupee" ? (
          <View style={styles.fc}>
            <Icone nom="sante" taille={22} couleur={couleurs.t3} />
            <Texte couleur="t2" style={styles.etat} numberOfLines={1}>
              {t(b.action === "autoriser" ? "seance.fc.refusee" : "seance.fc.coupee")}
            </Texte>
            <Tonal
              petit
              libelle={t(b.action === "autoriser" ? "gps.fc.autoriser" : "gps.fc.activer")}
              onPress={() => (b.action === "autoriser" ? autoriser().catch(console.error) : ouvrirTuto("fc"))}
            />
          </View>
        ) : null}
        {peutDeplier ? null : <View style={styles.esp} />}
        {enPause ? (
          <Tonal icone="play" couleurIcone={couleurs.action} libelle={t("gps.reprendre")} onPress={onReprendre} />
        ) : (
          <Tonal icone="pause" libelle={t("gps.pause")} onPress={onPause} />
        )}
      </View>
      <FeuilleFc
        tuto={tuto}
        etat={tuto === "fc" && b.genre === "fc" ? "ok" : tuto ? etatTuto(tuto, essaye, recherche, appareils) : null}
        onFermer={() => setTuto(null)}
        onReessayer={() => {
          setEssaye(true);
          chercher().catch(console.error);
        }}
        onOuvrirWhoop={() => ouvrirWhoop().catch(console.error)}
        onOuvrirReglages={() => Linking.openSettings().catch(console.error)}
      />
      {/* « Batterie non restreinte », une fois par moment : première séance avec la FC en direct, premier capteur connecté */}
      <BatterieAuMoment moment="seance" actif={!demo && etat != null} />
      <BatterieAuMoment moment="objet" actif={!demo && etat?.fc.etat === "connecte"} />
    </View>
  );
}

/** Heure de la dernière coche de la séance (le repos en cours la suit) ; null avant la première. */
function derniereCoche(s: SeanceDetail): number | null {
  let m: number | null = null;
  for (const e of s.exercices) for (const x of e.series) if (x.faite && x.fait_le != null && (m == null || x.fait_le > m)) m = x.fait_le;
  return m;
}

/** Bouton tonal de la bande (48 de haut ; « Activer » : 44). */
function Tonal({ icone, couleurIcone, libelle, petit = false, onPress }: { icone?: NomIcone; couleurIcone?: string; libelle: string; petit?: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      style={({ pressed }) => [styles.tonal, petit && styles.tonalPetit, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }]}
    >
      {icone ? <Icone nom={icone} taille={22} couleur={couleurIcone ?? couleurs.btnTonalTexte} /> : null}
      <Texte style={[styles.tonalT, { color: couleurs.btnTonalTexte }]}>{libelle}</Texte>
    </Appui>
  );
}

const styles = StyleSheet.create({
  bande: {},
  ligne: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: espace.m, paddingLeft: espace.xl, paddingRight: espace.l },
  fc: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1, minWidth: 0 },
  bpm: { fontFamily: police.light, fontSize: 30, letterSpacing: -0.3, fontVariant: ["tabular-nums"], includeFontPadding: false },
  unite: { fontSize: 13 },
  zone: { fontFamily: police.semibold, fontSize: 15, marginLeft: 4 },
  baisse: { fontSize: 14, marginLeft: 6, fontVariant: ["tabular-nums"] },
  etat: { fontSize: 15, flexShrink: 1 },
  pause: { fontSize: 15 },
  pauseT: { fontFamily: police.medium, fontSize: 15, marginLeft: -4, fontVariant: ["tabular-nums"] },
  esp: { flex: 1 },
  /** Toute la place jusqu'à Pause : une zone de toucher large, 48 de haut au moins. */
  zoneFc: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: "center" },
  origine: { transformOrigin: "0% 50%" },
  panneau: { overflow: "hidden" },
  panneauDedans: { position: "absolute", left: 0, right: 0, bottom: 0, height: PANNEAU, paddingTop: espace.m, paddingLeft: espace.xl, paddingRight: espace.l },
  tonal: { height: 48, paddingHorizontal: 18, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.s },
  tonalPetit: { height: 44, paddingHorizontal: 14 },
  tonalT: { fontFamily: police.semibold, fontSize: 15 },
});
