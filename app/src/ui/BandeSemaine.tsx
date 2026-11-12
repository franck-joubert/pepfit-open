import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, View, type ViewInstance } from "react-native";
import { jourEtroit, jourLong, jourMois, jourSemaineMois, moisAnnee } from "../ecrans/format";
import { instantDe } from "../ecrans/planif-donnees";
import { lundiDe } from "../ecrans/planification";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { horizontal } from "./arbitrage-gestes";
import { jourDeIndex } from "./glisser-jour";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";
import { SAUT_MS } from "./saut-jour";
import {
  buteeDouce, casesRendues, cranSemaine, debutCadre, dureeBande, fonduSemaine, FONDU_MOIS_MS, HAUT_BANDE, HAUT_LETTRE, hauteurBande, lundiProche, milieuChiffre, minuterieRetour,
  moisRendus, PASTILLE, rangTouche, recentrer, sautRecadrage, SEMAINIER, separateursMois, separateursSemaine, suivreBande, xEtiquette,
} from "./semainier";
import { Halo } from "./Halo";
import { Icone } from "./Icone";
import { Serie } from "./Serie";
import { Texte } from "./Texte";
import { useCouleurPartie } from "./ContextePartie";

// Bande de la semaine, commune aux parties qui suivent des jours (Entraînements, journal de Nutrition, compléments de
// Santé) : sept jours visibles, du lundi au dimanche. Glissée, elle passe de semaine en semaine sans changer le jour affiché
// (aimantée à la semaine), et revient seule sur la semaine du jour affiché après 5 s sans geste ; toucher une date l'affiche et
// recadre la bande sur sa semaine (29/10 au soir : logique dans ui/semainier.ts). Un séparateur de mois, dans la couleur
// de la partie, est toujours là entre le dernier jour d'un mois et le 1er du suivant ; entre deux semaines, un séparateur de
// 4 px de haut n'apparaît que pendant que le doigt glisse (fondu court, d'un coup en mouvement réduit). Pendant le défilement,
// le mois s'affiche en petit au-dessus, collé à gauche, poussé par le suivant. La bande
// commence juste sous l'en-tête, à la même hauteur partout ; le nom du mois n'y figure plus : l'en-tête porte l'icône
// calendrier qui ouvre la page du mois (ui/PageMois.tsx). Sous la bande, une ligne de 44 : « Aujourd'hui » à gauche,
// seulement quand la semaine d'aujourd'hui n'est pas à l'écran (au toucher, un halo part de la case d'aujourd'hui), et la
// série à droite (facultative).
//
// Une case : lettre du jour, chiffre (couleur de la partie en semi-gras aujourd'hui), pastille de 6 px. Aujourd'hui est
// toujours cerclé de 1,5 px dans la couleur de la partie ; le jour choisi prend le fond de verre des cartes (verre-carte,
// verre-filet), les deux se cumulent.
//
// API
//   lundi, sel, aujourdhui  AAAA-MM-JJ : semaine affichée (son lundi), jour choisi, aujourd'hui.
//   onSel(j)                toucher d'un jour.
//   onSemaine               ignoré depuis le 29/10 (la bande défile d'elle-même) ; gardé pour les appelants.
//   onVue(premier)          bande arrêtée : premier jour visible (charger les marques des semaines qu'on vient voir).
//   marque(j)               marque de chaque jour : "faite" (point plein de la couleur de la partie : turquoise de la
//                           Nutrition), "prevue" (anneau de la couleur de la partie, comme le contour de la page du
//                           mois), "manquee" (t3), null. Facultatif.
//   couleur                 couleur de la partie (orange du Sport, turquoise de Nutrition, rose de Santé) ; défaut :
//                           celle de l'écran (ContextePartie).
//   couleurFaite            couleur du point « faite » quand ce n'est pas celle de la partie : une séance faite est verte,
//                           le vert « validé » (teintes-parties, 29/10 ; revient sur l'orange de D1).
//   onAujourdhui()          retour à aujourd'hui (l'appelant remet `sel` à aujourd'hui) ; sans lui, pas de bouton.
//   serie                   semaines d'affilée (flamme), à droite sous la bande ; sans elle, rien.
//   droite                  autre mot à droite de cette ligne (Moi : « 1,80 m, IMC 24,1 »), quand il n'y a pas de série.
//   titre                   à gauche de la ligne sous la bande (date du jour affiché : TitreDate) ; avec lui, « Aujourd'hui »
//                           se réduit à son icône ↺, juste après.
//   vise, mesure(j, v)      glisser-déposer d'une séance sur un jour (Entraînements) : case visée, cases mesurées.
//   position                glissé du contenu entre les jours (ui/GlisserJour) : position continue en jours. Pendant ce geste,
//                           seul le fond du jour choisi glisse vers le jour voisin, au prorata du doigt ; le jour changé, la
//                           bande se recadre sur sa semaine. Glisser sur la bande, elle, ne change jamais le jour (29/10).
//   recadre                 compteur : à chaque nouvelle valeur, la bande revient sur la semaine du jour affiché, même s'il n'a
//                           pas changé (onglet re-touché, 29/10 au soir : semainier et jour à aujourd'hui).
//   sansFutur               pages qui ne montrent que le passé (Santé, mesures) : jours d'après aujourd'hui éteints, sans toucher,
//                           et le glissé bute en douceur sur la semaine en cours (29/10 au soir). Sans lui (Sport,
//                           Nutrition), la bande va aussi vers les semaines à venir (planification).
//
// Exemple (journal de Nutrition) :
//   const [sel, setSel] = useState(aujourdhui);
//   <TeteOnglet titre="Nutrition"><BoutonIcone nom="cal" libelle={t("planif.ouvrirMois")} onPress={ouvrirMois} /></TeteOnglet>
//   <BandeSemaine
//     lundi={lundiDe(sel)} sel={sel} aujourdhui={aujourdhui} couleur={couleurs.partieNutrition}
//     onSel={setSel} onAujourdhui={() => setSel(aujourdhui)}
//     marque={(j) => (joursRemplis.has(j) ? "faite" : null)}
//   />

export type MarqueJour = "faite" | "prevue" | "manquee" | null;

/** Cran et recadrage : la bande prolonge l'élan du doigt puis se pose (courbe « sortie »). */
const COURBE_BANDE = courbes.sortie;
const HAUTEUR_CASE = HAUT_BANDE;
/** Durée de vie du halo (deux anneaux de 700 ms, le second décalé de 140) : ensuite il est retiré. */
export const HALO_VIE_MS = 1000;

const midi = (j: string) => instantDe(j, "12:00");

/**
 * Pastille d'un jour (6 px). « Faite » et « prévue » prennent la couleur de la partie : pleine si faite, anneau de 1,5 px si
 * prévue (comme le contour du mois). Une séance faite prend le vert « validé » (`faite`, teintes-parties du 29/10).
 */
export function Pastille({ m, couleur, faite }: { m: MarqueJour; couleur?: string; faite?: string }) {
  const { couleurs } = useTheme();
  const c = couleur ?? couleurs.action;
  const fond = m === "faite" ? (faite ?? c) : m === "manquee" ? couleurs.t3 : "transparent";
  // collapsable={false} : sans couleur, Fabric aplatit la vue ; recréée quand la couleur arrive, elle perdait son arrondi.
  return <View collapsable={false} style={[styles.pastille, { backgroundColor: fond }, m === "prevue" && { borderWidth: 1.5, borderColor: c }]} />;
}

/** Case d'un jour : lettre, chiffre, pastille. Utilisée seule ailleurs (choix d'un jour dans « Décaler »). */
export function CaseJour({
  j,
  aujourdhui,
  marque,
  couleur,
  couleurFaite,
  lettre = true,
  choisi,
  vise,
  cercle,
  eteint,
  halo = 0,
  onPress,
  mesure,
  remplir = false,
  styleLettre,
  valeur,
}: {
  j: string;
  aujourdhui: string;
  marque: MarqueJour;
  couleur?: string;
  /** Couleur du point « faite » si ce n'est pas celle de la partie (séance faite : vert « validé »). */
  couleurFaite?: string;
  lettre?: boolean;
  choisi?: boolean;
  vise?: boolean;
  /** Jour d'origine (Décaler) : cerclé. */
  cercle?: boolean;
  eteint?: boolean;
  /** Rejoue le halo d'aujourd'hui à chaque nouvelle valeur (0 : rien). */
  halo?: number;
  onPress?: () => void;
  mesure?: (v: ViewInstance | null) => void;
  /** Dans la bande : la case prend la hauteur de sa place (bande resserrée au défilement). */
  remplir?: boolean;
  /** Lettre du jour qui s'efface et se replie quand la bande se resserre (style animé partagé par les cases). */
  styleLettre?: object;
  /** Une valeur écrite sous la date à la place de la pastille (page Effort, D10) ; null : la pastille. */
  valeur?: string | null;
}) {
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  const c = couleur ?? accent;
  const auj = j === aujourdhui;
  return (
    <Pressable
      ref={mesure}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={jourSemaineMois(midi(j))}
      accessibilityState={{ selected: !!choisi, disabled: !!eteint }}
      disabled={eteint || !onPress}
      onPress={onPress}
      style={[
        styles.case,
        remplir && { height: undefined, alignSelf: "stretch", flex: 1 },
        !lettre && { height: 60 },
        (choisi || vise) && { backgroundColor: couleurs.verreCarte, borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.verreFilet },
        auj && { borderWidth: 1.5, borderColor: c },
        cercle && { borderWidth: 1.5, borderColor: couleurs.t2 },
      ]}
    >
      {auj ? <Halo cle={halo} couleur={c} rayon={rayon.l} fin={1.25} /> : null}
      {lettre ? (
        <Reanimated.View style={[styles.lettreBoite, styleLettre]}>
          <Texte variante="meta" couleur="t3" style={styles.lettre}>
            {jourEtroit(midi(j)).toUpperCase()}
          </Texte>
        </Reanimated.View>
      ) : null}
      <Texte variante="saisie" style={[styles.chiffre, { color: auj ? c : eteint ? couleurs.t3 : couleurs.t1 }, auj && { fontFamily: police.semibold }]}>
        {Number(j.slice(8))}
      </Texte>
      {valeur != null ? (
        <Texte numberOfLines={1} style={[styles.valeurJour, { color: choisi ? couleurs.t1 : couleurs.t3 }]}>
          {valeur}
        </Texte>
      ) : (
        <Pastille m={marque} couleur={c} faite={couleurFaite} />
      )}
    </Pressable>
  );
}

/**
 * Ligne sous la bande collée (ui/ZoneSemainier) : la date du jour affiché à gauche, la série à droite. Elle défile avec la
 * page, la bande reste en haut.
 */
export function LigneBande({ titre, serie, couleur }: { titre: ReactNode; serie?: number; couleur?: string }) {
  return (
    <View style={styles.ligne}>
      <View style={styles.gauche}>{titre}</View>
      {serie ? <Serie n={serie} couleur={couleur} /> : null}
    </View>
  );
}

/** Date du jour affiché, sur la ligne sous la bande (retours du 28/10) : « AUJOURD'HUI mer. 28 oct. », « JEUDI 29 oct. ». */
export function TitreDate({ j, aujourdhui }: { j: string; aujourdhui: string }) {
  const auj = j === aujourdhui;
  return (
    <View accessible accessibilityRole="header" style={styles.titreDate}>
      <Texte variante="entete" couleur="t2" numberOfLines={1}>
        {auj ? t("planif.aujourdhui") : jourLong(midi(j))}
      </Texte>
      <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ flexShrink: 1 }}>
        {auj ? jourSemaineMois(midi(j)) : jourMois(midi(j))}
      </Texte>
    </View>
  );
}

/** ↺ seul, à côté de la date : ramène à aujourd'hui (zone de 44). */
function BoutonIconeAujourdhui({ onPress }: { onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("planif.aujourdhui")} onPress={onPress} style={styles.icone}>
      <Icone nom="retour" couleur={couleurs.t2} taille={16} />
    </Pressable>
  );
}

/** « ↺ Aujourd'hui » : ramène à aujourd'hui (bande de la semaine, page du mois). */
export function BoutonAujourdhui({ onPress }: { onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.aujourdhui}>
      <Icone nom="retour" couleur={couleurs.t2} taille={16} />
      <Texte variante="saisie" style={{ fontSize: 13 }}>
        {t("planif.aujourdhui")}
      </Texte>
    </Pressable>
  );
}

export function BandeSemaine({
  lundi,
  sel,
  aujourdhui,
  onSel,
  marque,
  valeur,
  couleur,
  couleurFaite,
  onAujourdhui,
  serie,
  droite,
  vise,
  mesure,
  titre,
  position,
  onVue,
  compact,
  recadre,
  sansFutur,
}: {
  titre?: ReactNode;
  position?: SharedValue<number>;
  lundi: string;
  sel: string;
  aujourdhui: string;
  onSel: (j: string) => void;
  /** Ancien balayage par semaine : ignoré, la bande défile d'elle-même de semaine en semaine (29/10). Gardé pour les appelants. */
  onSemaine?: (sens: 1 | -1) => void;
  marque?: (j: string) => MarqueJour;
  /** Valeur de chaque jour, écrite sous sa date à la place de la pastille (page Effort) ; null : la pastille. */
  valeur?: (j: string) => string | null;
  couleur?: string;
  couleurFaite?: string;
  onAujourdhui?: () => void;
  serie?: number;
  droite?: ReactNode;
  vise?: string | null;
  mesure?: (j: string, v: ViewInstance | null) => void;
  /** Bande arrêtée : premier jour visible (pour charger les marques des semaines qu'on vient voir). */
  onVue?: (premier: string) => void;
  /**
   * Bande collée au défilement (ui/ZoneSemainier) : resserrement 0 → 1. Avec lui, la ligne de la date n'est pas dessinée ici
   * (l'appelant pose LigneBande dans la page qui défile).
   */
  compact?: SharedValue<number>;
  /** Nouvelle valeur : la bande revient sur la semaine du jour affiché (onglet re-touché), même défilée sans changer de jour. */
  recadre?: number;
  /** Pages qui ne montrent que le passé (mesures, Santé) : jours d'après aujourd'hui éteints, glissé arrêté à la semaine en cours. */
  sansFutur?: boolean;
}) {
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  const reduit = useReduit();
  const [l, setL] = useState(0);
  const cadre = debutCadre(lundi);
  // Rang (indexJour) du premier jour visible : continu pendant le geste, entier à l'arrêt. Les cases sont posées une fois pour
  // toutes par rapport à `origine` : changer les cases rendues (centre) ne déplace rien à l'écran.
  const debut = useSharedValue(cadre);
  // La même position, tenue côté JS (lire `debut.value` ici peut donner une valeur en retard sur l'animation) : sert au
  // toucher d'une date et aux mesures des cases ; à l'arrêt, c'est le cran où la bande s'est posée.
  const pos = useRef(cadre);
  const [origine] = useState(cadre);
  const [centre, setCentre] = useState(cadre);
  const [halo, setHalo] = useState(0);
  // Défilement libre en cours (geste, élan, attente du retour) : l'étiquette du mois n'existe que là.
  const libre = useSharedValue(0);
  // Doigt sur la bande : les séparateurs de semaine n'existent que là (0 → 1 au début du geste, → 0 au lâcher).
  const doigt = useSharedValue(0);
  // Pages sans futur : la bande ne va pas plus loin que la semaine d'aujourd'hui.
  const max = sansFutur ? debutCadre(lundiDe(aujourdhui)) : null;
  const opts = useRef({ l, centre, reduit, cadre, onVue, max });
  opts.current = { l, centre, reduit, cadre, onVue, max };
  const fondu = (pose: boolean) => {
    const f = fonduSemaine(pose, opts.current.reduit);
    doigt.value = f.ms ? withTiming(f.vers, { duration: f.ms, easing: courbes.sortie }) : f.vers;
  };

  /** Bande arrêtée sur `rang` : rend d'autres cases si elle s'est éloignée, prévient l'appelant. */
  const arretee = (rang: number) => {
    if (recentrer(opts.current.centre, rang)) setCentre(rang);
    opts.current.onVue?.(jourDeIndex(rang));
  };
  /**
   * Amène la bande sur `vers` (cran ou recadrage) en `ms` (par défaut : selon le chemin) ; « Réduire les animations » ou trop
   * loin des cases rendues : d'un coup.
   */
  const amener = (vers: number, ms?: number) => {
    cancelAnimation(debut);
    pos.current = vers;
    const de = debut.value;
    if (opts.current.reduit || sautRecadrage(opts.current.centre, vers) || Math.abs(vers - de) < 1e-3) {
      debut.value = vers;
      if (sautRecadrage(opts.current.centre, vers)) setCentre(vers);
      arretee(vers);
      return;
    }
    debut.value = withTiming(vers, { duration: ms ?? dureeBande(de, vers), easing: COURBE_BANDE }, (fini) => {
      if (fini) scheduleOnRN(arretee, vers);
    });
  };
  const amenerRef = useRef(amener);
  amenerRef.current = amener;
  const retour = useRef(
    minuterieRetour(() => {
      libre.value = 0;
      amenerRef.current(opts.current.cadre);
    }),
  ).current;
  useEffect(() => retour.annuler, [retour]);

  // Jour affiché changé (date touchée, glissé du contenu, « Aujourd'hui », page du mois) : la bande se recadre sur sa semaine.
  useEffect(() => {
    retour.annuler();
    libre.value = 0;
    // Même durée et même courbe que le glissé d'un jour (« Revenir à aujourd'hui » : ensemble, ui/saut-jour.ts).
    amenerRef.current(cadre, SAUT_MS);
  }, [cadre, retour, libre]);
  // Onglet re-touché : la bande revient sur la semaine du jour affiché (aujourd'hui), même si le jour n'a pas changé.
  const recadreVu = useRef(recadre);
  useEffect(() => {
    if (recadre === recadreVu.current) return;
    recadreVu.current = recadre;
    retour.annuler();
    libre.value = 0;
    amenerRef.current(opts.current.cadre, SAUT_MS);
  }, [recadre, retour, libre]);

  const geste = useRef(0);
  const pan = useRef(
    PanResponder.create({
      // Glisser la bande fait défiler les semaines, sans changer le jour affiché (29/10) : la bande, plus profonde que
      // la zone du jour (ui/GlisserJour), prend le geste avant elle.
      onMoveShouldSetPanResponder: (_, g) => horizontal(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => {
        retour.annuler();
        cancelAnimation(debut);
        libre.value = 1;
        fondu(true);
        // Le seuil de prise ne fait pas sauter la bande.
        geste.current = pos.current + g.dx / Math.max(1, opts.current.l);
      },
      onPanResponderMove: (_, g) => {
        const v = buteeDouce(suivreBande(geste.current, g.dx, opts.current.l), opts.current.max);
        debut.value = v;
        pos.current = v;
      },
      onPanResponderRelease: (_, g) => {
        amenerRef.current(cranSemaine(debut.value, g.vx, opts.current.l, geste.current, opts.current.max));
        fondu(false);
        retour.lacher();
      },
      onPanResponderTerminate: () => {
        amenerRef.current(Math.min(lundiProche(debut.value), opts.current.max ?? Infinity));
        fondu(false);
        retour.lacher();
      },
    }),
  ).current;

  const piste = useAnimatedStyle(() => ({ transform: [{ translateX: (origine - debut.value) * l }] }));
  // Séparateurs alignés sur le milieu des chiffres, qui monte quand la bande se resserre.
  const alignes = useAnimatedStyle(() => ({ transform: [{ translateY: milieuChiffre(compact ? compact.value : 0) }] }));
  const semaines = useAnimatedStyle(() => ({ opacity: doigt.value, transform: [{ translateY: milieuChiffre(compact ? compact.value : 0) }] }));
  // Resserrement : la bande perd la hauteur de la lettre, qui s'efface (une seule valeur partagée par toutes les cases).
  const hauteur = useAnimatedStyle(() => ({ height: compact ? hauteurBande(compact.value) : HAUTEUR_CASE }));
  const styleLettre = useAnimatedStyle(() => {
    const c = compact ? compact.value : 0;
    return { height: HAUT_LETTRE * (1 - c), opacity: Math.max(0, 1 - 2 * c) };
  });

  // Toucher d'une date : la bande calcule le jour sous le doigt (rangTouche) ; un doigt qui a bougé n'est pas un toucher.
  const appui = useRef({ x: 0, y: 0 });
  const toucherA = (x: number, pageX: number, pageY: number) => {
    if (Math.abs(pageX - appui.current.x) > 10 || Math.abs(pageY - appui.current.y) > 10) return;
    const j = jourDeIndex(rangTouche(pos.current, x, opts.current.l, espace.s));
    // Jour éteint (futur d'une page sans futur) : pas de toucher, comme sa case.
    if (sansFutur && j > aujourdhui) return;
    toucher(j);
  };
  // Mesure d'une case pour le glisser-déposer d'une séance (planification) : d'après la bande, pour la même raison.
  const bandeRef = useRef<ViewInstance | null>(null);
  const caseMesurable = (r: number) =>
    ({
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) =>
        bandeRef.current?.measureInWindow((bx, by, _w, bh) => cb(bx + espace.s + (r - pos.current) * opts.current.l, by, opts.current.l, bh)),
    }) as unknown as ViewInstance;

  const toucher = (j: string) => {
    retour.annuler();
    libre.value = 0;
    onSel(j);
    // Même semaine que le jour affiché : `cadre` ne change pas, la bande revient quand même sur elle.
    amenerRef.current(debutCadre(lundiDe(j)), SAUT_MS);
  };

  // « Aujourd'hui » : seulement quand la semaine d'aujourd'hui n'est pas celle du jour affiché.
  const horsEcran = lundi !== lundiDe(aujourdhui);
  const ligne = !compact && (onAujourdhui != null || serie != null || titre != null || droite != null);
  const revenir = () => {
    onAujourdhui?.();
    // Le halo est rejoué une fois, puis remis à zéro : revenir plus tard à la semaine ne le relance pas.
    setHalo((n) => n + 1);
    setTimeout(() => setHalo(0), HALO_VIE_MS);
  };
  const rangs = casesRendues(centre);
  return (
    <View>
      {/* Mois du défilement libre, en superposition dans la marge au-dessus de la bande : ni place prise, ni toucher. */}
      {l > 0 ? <CoucheMois rangs={rangs} debut={debut} libre={libre} l={l} /> : null}
      <Reanimated.View
        ref={bandeRef}
        {...pan.panHandlers}
        onLayout={(e) => setL((e.nativeEvent.layout.width - 2 * espace.s) / 7)}
        style={[styles.bande, hauteur]}
      >
        {l > 0 ? (
          <>
            {position ? <FondChoisi position={position} debut={debut} l={l} /> : null}
            <Reanimated.View style={[styles.piste, piste]}>
              {rangs.map((r) => {
                const j = jourDeIndex(r);
                return (
                  <View key={r} style={[styles.place, { left: (r - origine) * l, width: l }]}>
                    <CaseJour
                      remplir
                      styleLettre={styleLettre}
                      j={j}
                      aujourdhui={aujourdhui}
                      marque={marque ? marque(j) : null}
                      valeur={valeur ? valeur(j) : null}
                      couleur={couleur}
                      couleurFaite={couleurFaite}
                      choisi={!position && j === sel}
                      vise={j === vise}
                      halo={halo}
                      eteint={sansFutur && j > aujourdhui}
                      onPress={() => toucher(j)}
                      mesure={mesure ? (v) => mesure(j, v ? caseMesurable(r) : null) : undefined}
                    />
                  </View>
                );
              })}
              {/* Entre deux semaines (29/10 au soir) : 4 px de haut, texte secondaire, seulement pendant le glissé. */}
              <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, semaines]}>
                {separateursSemaine(rangs, jourDeIndex).map((r) => (
                  <View key={`s${r}`} style={[styles.sepSemaine, { left: (r - origine) * l - SEMAINIER.semaineLargeur / 2, backgroundColor: couleurs.t2 }]} />
                ))}
              </Reanimated.View>
              {/* Entre deux mois : toujours là, dans la couleur de la partie ; sans place ni toucher. */}
              <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, alignes]}>
                {separateursMois(rangs, jourDeIndex).map((r) => (
                  <View key={`m${r}`} style={[styles.sepMois, { left: (r - origine) * l - SEMAINIER.moisLargeur / 2, backgroundColor: couleur ?? accent }]} />
                ))}
              </Reanimated.View>
            </Reanimated.View>
            {/* Couche de toucher, au-dessus des cases : le jour touché est calculé d'après la bande (rangTouche). Ignorée par le
                lecteur d'écran, qui active les cases elles-mêmes. Un glissé horizontal la cède à la bande (défilement). */}
            <View
              // Jamais aplatie par Fabric : sans elle à l'écran, le toucher retombait sur la case d'avant le défilement.
              collapsable={false}
              accessible={false}
              importantForAccessibility="no"
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                appui.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
              }}
              onResponderRelease={(e) => toucherA(e.nativeEvent.locationX, e.nativeEvent.pageX, e.nativeEvent.pageY)}
            />
          </>
        ) : null}
      </Reanimated.View>
      {ligne ? (
        <View style={styles.ligne}>
          <View style={styles.gauche}>
            {titre}
            {onAujourdhui && horsEcran ? titre ? <BoutonIconeAujourdhui onPress={revenir} /> : <BoutonAujourdhui onPress={revenir} /> : null}
          </View>
          {serie ? <Serie n={serie} couleur={couleur} /> : droite}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Mois du défilement, au-dessus d'une bande de jours (le semainier ; la piste des statistiques en vue Semaine) : une étiquette
 * par mois des jours `rangs`, visible quand `libre` vaut 1. `debut` : rang (indexJour) du premier jour visible, continu pendant
 * le geste ; `l` : largeur d'un jour ; `bord` : marge gauche où l'étiquette se colle (celle de la page par défaut).
 */
export function CoucheMois({
  rangs, debut, libre, l, bord = espace.l,
}: {
  rangs: readonly number[]; debut: SharedValue<number>; libre: SharedValue<number>; l: number; bord?: number;
}) {
  const reduit = useReduit();
  const [largeurs, setLargeurs] = useState<Record<string, number>>({});
  const mois = moisRendus(rangs, jourDeIndex);
  return (
    <View pointerEvents="none" style={styles.moisCouche}>
      {mois.map((m, i) => (
        <EtiquetteMois
          key={m.cle}
          cle={m.cle}
          rang={m.rang}
          suivant={mois[i + 1]?.rang ?? null}
          debut={debut}
          libre={libre}
          l={l}
          bord={bord}
          largeur={largeurs[m.cle] ?? 0}
          reduit={reduit}
          onLargeur={(w) => setLargeurs((x) => (x[m.cle] === w ? x : { ...x, [m.cle]: w }))}
        />
      ))}
    </View>
  );
}

/**
 * Étiquette d'un mois (« octobre 2026 ») : collée sur la marge de la page, poussée par celle du mois suivant qui arrive avec son
 * 1er jour (ui/semainier.ts) ; fondu de 200 ms, d'un coup en mouvement réduit.
 */
function EtiquetteMois({
  cle, rang, suivant, debut, libre, l, bord, largeur, reduit, onLargeur,
}: {
  cle: string; rang: number; suivant: number | null; debut: SharedValue<number>; libre: SharedValue<number>; l: number; bord: number; largeur: number; reduit: boolean;
  onLargeur: (w: number) => void;
}) {
  const anime = useAnimatedStyle(() => ({
    opacity: reduit ? libre.value : withTiming(libre.value, { duration: FONDU_MOIS_MS, easing: courbes.sortie }),
    transform: [{ translateX: xEtiquette(rang, suivant, debut.value, l, largeur, bord) }],
  }));
  return (
    <Reanimated.View style={[styles.mois, anime]} onLayout={(e) => onLargeur(Math.ceil(e.nativeEvent.layout.width))}>
      <Texte variante="meta" couleur="t3" numberOfLines={1} style={styles.moisTexte}>
        {moisAnnee(midi(`${cle}-15`))}
      </Texte>
    </Reanimated.View>
  );
}

/** Fond du jour affiché, posé sous les cases : il suit la position du contenu (en jours) et la bande, sur le fil de l'interface. */
function FondChoisi({ position, debut, l }: { position: SharedValue<number>; debut: SharedValue<number>; l: number }) {
  const { couleurs } = useTheme();
  const anime = useAnimatedStyle(() => {
    const x = position.value - debut.value;
    // Hors de la bande visible (défilée vers d'autres semaines) : pas de fond.
    return { opacity: x > -1 && x < 7 ? 1 : 0, transform: [{ translateX: x * l }] };
  });
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[styles.fondChoisi, { width: l, backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }, anime]}
    />
  );
}

const styles = StyleSheet.create({
  bande: { height: HAUTEUR_CASE, overflow: "hidden" },
  piste: { position: "absolute", top: 0, bottom: 0, left: espace.s, right: espace.s },
  place: { position: "absolute", top: 0, bottom: 0 },
  // Mois : 40 % de la hauteur des cases (suit la bande resserrée). Semaine : 4 px. Centrés, puis alignés sur les chiffres.
  sepMois: {
    position: "absolute", width: SEMAINIER.moisLargeur, borderRadius: SEMAINIER.moisLargeur / 2,
    top: `${50 - (SEMAINIER.moisHauteur * 100) / 2}%`, height: `${SEMAINIER.moisHauteur * 100}%`,
  },
  sepSemaine: {
    position: "absolute", width: SEMAINIER.semaineLargeur, height: SEMAINIER.semaineHauteur, borderRadius: SEMAINIER.semaineLargeur / 2,
    top: "50%", marginTop: -SEMAINIER.semaineHauteur / 2,
  },
  fondChoisi: { position: "absolute", top: 0, bottom: 0, left: espace.s, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth },
  moisCouche: { position: "absolute", top: -14, left: 0, right: 0, height: 15, overflow: "hidden", zIndex: 1 },
  mois: { position: "absolute", top: 0, left: 0 },
  moisTexte: { fontSize: 11, lineHeight: 14 },
  case: { flex: 1, height: HAUTEUR_CASE, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", gap: 4 },
  lettre: { fontSize: 11, lineHeight: HAUT_LETTRE, fontFamily: police.semibold },
  lettreBoite: { height: HAUT_LETTRE, overflow: "hidden", justifyContent: "flex-end" },
  chiffre: { fontSize: 16, fontFamily: police.medium },
  pastille: { width: PASTILLE, height: PASTILLE, borderRadius: PASTILLE / 2 },
  valeurJour: { fontSize: 11, lineHeight: 13, marginTop: -2, fontFamily: police.medium, fontVariant: ["tabular-nums"] },
  ligne: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: espace.l },
  gauche: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  titreDate: { flexShrink: 1, flexDirection: "row", alignItems: "baseline", gap: espace.s },
  icone: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  aujourdhui: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingRight: espace.s },
});
