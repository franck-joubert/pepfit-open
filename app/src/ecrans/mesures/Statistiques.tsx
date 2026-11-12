// Statistiques d'une page de mesure (planche pas, NOTES § 3) : choix de période, puis une carte avec ‹ période ›, l'en-tête
// qui devient la valeur touchée (lu au lecteur d'écran), le graphique glissable et sa légende.
// Gestes de la piste (un seul geste par zone : seul le graphique glisse) :
//   - glissé horizontal : la piste suit le doigt (résistance vers le futur, qui n'existe pas) ; au-delà de 56 px, elle part
//     du côté du geste (180 ms) et la période voisine arrive de l'autre (260 ms) ; sinon elle revient (200 ms) ;
//   - toucher : la colonne la plus proche (colonnes jointives, pleine hauteur) ; re-toucher rend la moyenne ;
//   - appui long (300 ms) puis glisser : la valeur suit le doigt (sans vibration : elle reste au record et à l'erreur, revue
//     finale n° 41).
// Mouvement réduit : fondus seuls. Le défilement vertical de la page garde la main tant que le geste n'est pas horizontal.
// Vue Semaine (31/10 : « comme les semainiers des pages principales ») : pendant qu'on passe d'une semaine à l'autre
// (glissé ou chevrons), le mois s'affiche en petit au-dessus du graphique, collé à gauche, poussé par le suivant : la couche
// des mois du semainier (ui/BandeSemaine, CoucheMois), qui suit le doigt puis la semaine qui arrive, et s'efface ensuite.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { horizontal } from "../../ui/arbitrage-gestes";
import { CoucheMois } from "../../ui/BandeSemaine";
import { indexJour } from "../../ui/glisser-jour";
import { Icone } from "../../ui/Icone";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { Segmente } from "../../ui/Segmente";
import { FONDU_MOIS_MS } from "../../ui/semainier";
import { Texte } from "../../ui/Texte";
import { jourDe } from "../planif-donnees";
import { colonne, GESTE_PISTE } from "./colonne";
import { Groupe, MARGE, TitreGroupe, useMesure } from "./gabarit";

/** État des statistiques : type de période, rang (0 = la plus récente), colonne touchée. */
export function useStats<T extends string>(depart: T, selDepart: number | null = null) {
  const [type, setType] = useState<T>(depart);
  const [k, setK] = useState(0);
  const [sel, setSel] = useState<number | null>(selDepart);
  return {
    type,
    k,
    sel,
    setSel,
    choisirType: (v: T) => {
      setType(v);
      setK(0);
      setSel(null);
    },
    aller: (sens: 1 | -1) => {
      // sens > 0 : vers le passé
      setK((x) => Math.max(0, x + sens));
      setSel(null);
    },
    /** Le semainier et l'agenda : une période (rang `k`, 0 = la plus récente) et un jour choisi. */
    montrer: (v: T, i: number, rang = 0) => {
      setType(v);
      setK(Math.max(0, rang));
      setSel(i);
    },
  };
}

export function Statistiques<T extends string>({
  periodes,
  type,
  onType,
  titre,
  precedent,
  onAller,
  k,
  entete,
  nb,
  sel,
  onSel,
  cle,
  graphe,
  legende,
  libelleGraphe,
  apres,
  titreSection = true,
  lundi = null,
}: {
  periodes: readonly { valeur: T; libelle: string }[];
  type: T;
  onType: (v: T) => void;
  /** « 22 oct. – aujourd'hui » */
  titre: string;
  /** Une période d'avant existe (sinon le chevron et le glissé vers le passé sont coupés). */
  precedent: boolean;
  onAller: (sens: 1 | -1) => void;
  k: number;
  entete: ReactNode;
  /** Colonnes de toucher (une par barre, par jour ou par semaine). */
  nb: number;
  sel: number | null;
  onSel: (i: number | null) => void;
  /** Clé de la période affichée : la piste joue l'arrivée quand elle change. */
  cle: string;
  graphe: (largeur: number) => ReactNode;
  legende?: ReactNode;
  libelleGraphe: string;
  /** Ce qui suit la carte (complément, lignes). */
  apres?: ReactNode;
  titreSection?: boolean;
  /** Vue Semaine : lundi (minuit local) de la semaine affichée ; le mois paraît pendant le passage d'une semaine à l'autre. */
  lundi?: number | null;
}) {
  const peut = (sens: 1 | -1) => (sens > 0 ? precedent : k > 0);
  return (
    <>
      {titreSection ? <TitreGroupe>{t("mesures.statistiques")}</TitreGroupe> : null}
      {periodes.length > 1 ? (
        <Segmente<T> doux options={periodes} valeur={type} onChange={onType} style={{ marginHorizontal: MARGE, marginTop: 8 }} />
      ) : null}
      <Groupe style={styles.carte}>
        <View style={styles.nav}>
          <Chevron sens={1} actif={peut(1)} onPress={() => onAller(1)} libelle={t("mesures.periodePrecedente")} />
          <Texte variante="corps" style={{ fontFamily: police.medium, flex: 1, textAlign: "center" }} numberOfLines={1}>
            {titre}
          </Texte>
          <Chevron sens={-1} actif={peut(-1)} onPress={() => onAller(-1)} libelle={t("mesures.periodeSuivante")} />
        </View>
        <View style={styles.entete} accessibilityLiveRegion="polite">
          {entete}
        </View>
        <Piste nb={nb} sel={sel} onSel={onSel} peut={peut} onAller={onAller} cle={cle} libelle={libelleGraphe} lundi={lundi}>
          {graphe}
        </Piste>
        {legende}
      </Groupe>
      {apres}
    </>
  );
}

function Chevron({ sens, actif, onPress, libelle }: { sens: 1 | -1; actif: boolean; onPress: () => void; libelle: string }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ disabled: !actif }}
      disabled={!actif}
      onPress={onPress}
      style={({ pressed }) => [styles.chevron, pressed && { backgroundColor: couleurs.s2 }, !actif && { opacity: 0.4 }]}
    >
      <Icone nom={sens > 0 ? "left" : "right"} couleur={actif ? couleurs.t2 : couleurs.t3} taille={20} />
    </Pressable>
  );
}

/** Le mois reste à l'écran après l'arrivée de la semaine, le temps d'être lu, puis s'efface (fondu du semainier). */
const MOIS_TENU_MS = 600 + FONDU_MOIS_MS;

/** Piste du graphique : glissé entre périodes, toucher d'une colonne, appui long puis glisser pour parcourir. */
export function Piste({
  nb,
  sel,
  onSel,
  peut,
  onAller,
  cle,
  libelle,
  lundi = null,
  children,
}: {
  lundi?: number | null;
  nb: number;
  sel: number | null;
  onSel: (i: number | null) => void;
  peut: (sens: 1 | -1) => boolean;
  onAller: (sens: 1 | -1) => void;
  cle: string;
  libelle: string;
  children: (largeur: number) => ReactNode;
}) {
  const reduit = useReduit();
  const [largeur, setLargeur] = useState(0);
  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  const arrivee = useRef<1 | -1 | null>(null);
  const etat = useRef({ x0: 0, mode: null as null | "glisse" | "parcours", minuterie: null as ReturnType<typeof setTimeout> | null, dernier: -1 });
  // Vue Semaine : rang (indexJour) du lundi affiché, et la couche des mois (rang du premier jour visible, continu ; visible).
  const r0 = lundi != null ? indexJour(jourDe(lundi)) : null;
  const debut = useSharedValue(r0 ?? 0);
  const libre = useSharedValue(0);
  const mois = useRef({ vise: r0, minuterie: null as ReturnType<typeof setTimeout> | null });
  const vivant = useRef({ nb, sel, onSel, peut, onAller, largeur, reduit, r0 });
  vivant.current = { nb, sel, onSel, peut, onAller, largeur, reduit, r0 };

  /** Le mois paraît (fondu du semainier) ; il s'efface `apres` ms plus tard. */
  const montrerMois = (apres: number | null) => {
    const m = mois.current;
    if (m.minuterie) clearTimeout(m.minuterie);
    m.minuterie = null;
    libre.value = 1;
    if (apres != null) m.minuterie = setTimeout(() => (libre.value = 0), apres);
  };
  /** La couche des mois va sur la semaine `vers` (rang de son lundi), au rythme de la piste. */
  const allerMois = (vers: number, ms: number) => {
    mois.current.vise = vers;
    debut.value = vivant.current.reduit ? vers : withTiming(vers, { duration: ms, easing: courbes.sortie });
    montrerMois(ms + MOIS_TENU_MS);
  };
  // Semaine changée hors du glissé (chevrons) : le mois paraît et suit ; type de période changé : posé, sans rien montrer.
  const r0Vu = useRef(r0);
  useLayoutEffect(() => {
    const avant = r0Vu.current;
    r0Vu.current = r0;
    if (r0 == null || r0 === mois.current.vise) return;
    if (avant == null) {
      mois.current.vise = r0;
      debut.value = r0;
      return;
    }
    allerMois(r0, GESTE_PISTE.arriveeMs);
  }, [r0]);

  // La période voisine arrive du côté du geste, une fois rendue.
  useLayoutEffect(() => {
    const s = arrivee.current;
    if (s == null) return;
    arrivee.current = null;
    const W = vivant.current.largeur;
    tx.value = reduit ? 0 : -s * W * GESTE_PISTE.recul;
    op.value = 0;
    tx.value = withTiming(0, { duration: reduit ? 160 : GESTE_PISTE.arriveeMs, easing: courbes.feuille });
    op.value = withTiming(1, { duration: reduit ? 160 : GESTE_PISTE.arriveeMs, easing: courbes.feuille });
  }, [cle, reduit, tx, op]);

  const choisir = (x: number, basculer: boolean) => {
    const v = vivant.current;
    const i = colonne(x, v.largeur, v.nb);
    if (basculer) v.onSel(v.sel === i ? null : i);
    else if (i !== etat.current.dernier) {
      etat.current.dernier = i;
      v.onSel(i);
    }
  };

  const partir = (sens: 1 | -1) => {
    arrivee.current = sens;
    vivant.current.onAller(sens);
  };

  const geste = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => horizontal(g.dx, g.dy),
      // tant que le geste n'est pas parti en glissé ou en parcours, le défilement vertical de la page peut le reprendre
      onPanResponderTerminationRequest: () => etat.current.mode == null,
      onPanResponderGrant: (e) => {
        const s = etat.current;
        s.x0 = e.nativeEvent.locationX;
        s.mode = null;
        s.dernier = -1;
        s.minuterie = setTimeout(() => {
          if (s.mode) return;
          s.mode = "parcours";
          choisir(s.x0, false);
        }, GESTE_PISTE.appuiLongMs);
      },
      onPanResponderMove: (_, g) => {
        const s = etat.current;
        if (s.mode === "parcours") return choisir(s.x0 + g.dx, false);
        if (!s.mode && horizontal(g.dx, g.dy)) {
          s.mode = "glisse";
          if (s.minuterie) clearTimeout(s.minuterie);
        }
        if (s.mode !== "glisse") return;
        const sens: 1 | -1 = g.dx > 0 ? 1 : -1;
        const x = vivant.current.peut(sens) ? g.dx : g.dx * GESTE_PISTE.resistance;
        tx.value = x;
        const r = vivant.current.r0;
        if (r != null) {
          // le mois suit le doigt, comme sur le semainier (sept jours sur la largeur de la piste)
          montrerMois(null);
          debut.value = r - (x * 7) / Math.max(1, vivant.current.largeur);
        }
      },
      onPanResponderRelease: (_, g) => fin(g.dx, false),
      onPanResponderTerminate: (_, g) => fin(g.dx, true),
    }),
  ).current;

  function fin(dx: number, interrompu: boolean) {
    const s = etat.current;
    if (s.minuterie) clearTimeout(s.minuterie);
    const mode = s.mode;
    s.mode = null;
    if (mode == null) {
      if (!interrompu) choisir(s.x0, true);
      return;
    }
    if (mode === "parcours") return;
    const v = vivant.current;
    const sens: 1 | -1 = dx > 0 ? 1 : -1;
    if (Math.abs(dx) > GESTE_PISTE.seuilGlisse && v.peut(sens) && !interrompu) {
      if (v.r0 != null) allerMois(v.r0 - 7 * sens, GESTE_PISTE.sortieMs + GESTE_PISTE.arriveeMs);
      const W = v.largeur;
      op.value = withTiming(0, { duration: v.reduit ? 120 : GESTE_PISTE.sortieMs, easing: courbes.sortie });
      tx.value = withTiming(v.reduit ? tx.value : sens * W, { duration: v.reduit ? 120 : GESTE_PISTE.sortieMs, easing: courbes.sortie }, (ok) => {
        if (ok) scheduleOnRN(partir, sens);
      });
    } else {
      tx.value = withTiming(0, { duration: GESTE_PISTE.retourMs, easing: courbes.sortie });
      if (v.r0 != null) allerMois(v.r0, GESTE_PISTE.retourMs);
    }
  }

  useEffect(() => () => {
    if (etat.current.minuterie) clearTimeout(etat.current.minuterie);
    if (mois.current.minuterie) clearTimeout(mois.current.minuterie);
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }], opacity: op.value }));
  return (
    <View>
      {/* Mois de la vue Semaine, dans la marge au-dessus du graphique (même couche que le semainier) : ni place, ni toucher. */}
      {r0 != null && largeur > 0 ? (
        <CoucheMois rangs={Array.from({ length: 21 }, (_, i) => r0 - 7 + i)} debut={debut} libre={libre} l={largeur / 7} bord={0} />
      ) : null}
      <View
        onLayout={(e: LayoutChangeEvent) => setLargeur(Math.round(e.nativeEvent.layout.width))}
        style={styles.piste}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={libelle}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "escape" }]}
        onAccessibilityAction={(e) => {
          const v = vivant.current;
          if (e.nativeEvent.actionName === "escape") return v.onSel(null);
          const pas = e.nativeEvent.actionName === "increment" ? 1 : -1;
          v.onSel(Math.max(0, Math.min(v.nb - 1, (v.sel ?? (pas > 0 ? -1 : v.nb)) + pas)));
        }}
        {...geste.panHandlers}
      >
        <Animated.View style={style}>{largeur > 0 ? children(largeur) : null}</Animated.View>
      </View>
    </View>
  );
}

/** En-tête des statistiques : petit titre 12 t3, valeur 28 semibold et son unité 13 t2, ligne 12 t2 (ou une vue). */
export function EnteteStats({
  petit,
  valeur,
  unite,
  ligne,
  vide,
  apres,
  devant,
}: {
  /** Devant le chiffre (la flèche d'une variation de mensuration). */
  devant?: ReactNode;
  petit: string;
  valeur: string;
  unite?: string | null;
  ligne?: ReactNode;
  vide?: boolean;
  apres?: ReactNode;
}) {
  return (
    <>
      <Texte variante="meta" couleur="t3" numberOfLines={1}>
        {petit}
      </Texte>
      {vide ? (
        <Texte style={styles.vide} numberOfLines={1}>
          <Texte couleur="t2" style={styles.vide}>
            {valeur}
          </Texte>
        </Texte>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {devant}
          <Texte numberOfLines={1} style={styles.valeur}>
            {valeur}
            {unite ? <Texte variante="corps" couleur="t2" style={{ letterSpacing: 0 }}>{` ${unite}`}</Texte> : null}
          </Texte>
        </View>
      )}
      {ligne != null ? (
        typeof ligne === "string" ? (
          <Texte variante="meta" couleur="t2" style={{ marginTop: 2 }}>
            {ligne}
          </Texte>
        ) : (
          <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 4 }}>{ligne}</View>
        )
      ) : null}
      {apres}
    </>
  );
}

const styles = StyleSheet.create({
  carte: { paddingLeft: 16, paddingRight: 8, paddingBottom: 14 },
  nav: { flexDirection: "row", alignItems: "center", marginLeft: -12 },
  chevron: { width: 44, height: 44, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  entete: { minHeight: 74, marginTop: 2, marginBottom: 10, paddingRight: 8 },
  valeur: { fontFamily: police.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.56, marginTop: 2, fontVariant: ["tabular-nums"] },
  vide: { fontFamily: police.medium, fontSize: 24, lineHeight: 34, marginTop: 2 },
  piste: { overflow: "hidden" },
});

export function useCouleursGraphe() {
  const { couleurs } = useTheme();
  const m = useMesure();
  return { ...m, t1: couleurs.t1, t2: couleurs.t2, t3: couleurs.t3, line2: couleurs.line2, s3: couleurs.s3 };
}
