import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Dimensions, FlatList, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type ListRenderItem, type ListViewToken, type NativeScrollEvent, type NativeSyntheticEvent,
  type ViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { jourEtroit, jourSemaineMois, moisLong } from "../ecrans/format";
import { instantDe } from "../ecrans/planif-donnees";
import { ajouterJ, grilleMois, premierDuMois, semaineDe } from "../ecrans/planification";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { primitifs, type Jetons } from "../theme/jetons";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { BoutonAujourdhui, HALO_VIE_MS, type MarqueJour } from "./BandeSemaine";
import { BasculeVue, type VueAgenda } from "./BasculeVue";
import { BoutonIcone } from "./Cadre";
import { largeurContenu } from "./CadreContenu";
import { Halo } from "./Halo";
import { Serie } from "./Serie";
import { Texte } from "./Texte";
import { useCouleurPartie, useDegrade } from "./ContextePartie";

// Page du mois, LE calendrier de l'appli (planche planification v7, écrans 3 à 5 ; retour du 30/10 : « tous
// doivent avoir le format de défilement vertical », plus de grille à flèches ‹ › nulle part, tests/calendrier-unique) :
// défilement vertical des mois (dix ans de part et d'autre du jour d'arrivée), jours de la semaine fixes en haut, la barre prend le nom du mois
// en haut de l'écran. Chaque jour : une pastille de 28 (pleine, couleur de la partie : faite, D1 ; s1 : manquée ; contour de la couleur de la
// partie : prévue ou aujourd'hui ; aujourd'hui fait : anneau décalé de 2, teintes-parties D5) et, dessous, un libellé court. « Aujourd'hui » n'apparaît dans la barre que si la
// rangée d'aujourd'hui est hors de l'écran ; touché, la liste y défile et un halo part de la pastille.
//
// Fluidité : les mois ont une hauteur fixe (getItemLayout), sont mémoïsés et ne lisent que `jours` (une Map préparée une
// fois par l'appelant) ; un mois ne se redessine que si `jours`, le jour choisi ou visé dans ce mois, ou le halo changent.
//
// API
//   depart, aujourdhui     AAAA-MM-JJ : jour d'arrivée (son mois en haut), aujourd'hui.
//   jours                  Map jour → { marque, libelle, unite } : à garder stable (useMemo) ; un jour absent est vide.
//                          `unite` suit le libellé en t3, après une espace fine insécable (« 2 311 kcal »).
//   onFenetre(de, a)       mois vus (premier jour du premier, dernier jour du dernier) : l'appelant charge ses données
//                          autour (marge large conseillée, pour qu'un défilement rapide trouve ses jours déjà prêts).
//   onJour(j)              toucher d'un jour (stable : useCallback).
//   onRetour()             flèche de retour.
//   choisi, vise           jour choisi (fond de verre), jour visé par un glisser (même fond).
//   mesure(j, v)           cases mesurées pour un glisser-déposer (stable : useCallback).
//   couleur                couleur de la partie (défaut : celle de l'écran, ContextePartie) ; serie : flamme à droite de la barre.
//   couleurFaite           couleur d'un jour fait quand ce n'est pas celle de la partie : le vert « validé » du Sport, comme
//                          le semainier et l'Accueil (revue finale du 30/10, n° 4, D1) ; le chiffre y prend l'encre du fond.
//   degrade                jour fait au dégradé du geste de la partie (Nutrition, teintes-parties du 29/10) : le chiffre blanc y
//                          tient 3:1 au centre, pas sur la couleur à plat de nuit, trop claire. Dégradé natif (backgroundImage),
//                          posé sur l'arrêt du milieu : aucun Svg par jour.
//   children               ce qui se pose par-dessus (feuille du jour, bulles).
//   vue, onVue, titre, liste
//                          bascule liste ou calendrier (ui/BasculeVue) à droite de la barre, sur toutes les pages du mois
//                          (30/10) ; en liste, la barre prend `titre` (« Poids ») et la page montre `liste`.
//   futur                  faux : pas de mois après celui d'aujourd'hui, les jours à venir en t3, sans toucher (mesures).
//   futurJusqua            avec futur faux : les mois vont jusqu'à celui de ce jour (le cycle : la fourchette des prochaines
//                          règles, la seule date à venir montrée, D6 de la planche cycle) ; les jours à venir restent éteints.
//   marque « estimee »     un rond en pointillé de la couleur de la partie, le chiffre en encre (le cycle : prochaines règles).
//   premierMois            premier jour de l'historique : pas de mois avant le sien (dix ans au plus).
//   legende                légende courte sous les jours de la semaine : une pastille par sens (« pesée », « prévue »).
//   marque « point »       un simple point de la couleur de la partie sous le chiffre, sans libellé (Santé : jour qui a des
//                          données, 31/10).
//
// Exemple (journal de Nutrition) :
//   const jours = useMemo(() => new Map(repas.map((r) => [r.jour, { marque: "faite", libelle: `${r.kcal} kcal` }])), [repas]);
//   <PageMois depart={jour} aujourdhui={auj} jours={jours} couleur={couleurs.partieNutrition} degrade
//     onFenetre={(de, a) => setFenetre(autour(de, a))} onJour={ouvrirJour} onRetour={router.back} />

/** « donnee » : un jour qui a une donnée sans être « bon » (mesures : objectif pas atteint) ; anneau de la partie.
 *  « point » : un point de la partie sous le chiffre, rien d'autre (Santé : le jour a des données). */
export type MarqueMois = MarqueJour | "donnee" | "point" | "estimee";

export interface JourMois {
  marque: MarqueMois;
  libelle: string;
  unite?: string;
}

const MOIS = 120;
const TITRE_H = 56;
const RANGEE_H = 52;
/** « Aujourd'hui » : le halo part quand le défilement est posé. */
const HALO_APRES_MS = 350;

const midi = (j: string) => instantDe(j, "12:00");
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** « Octobre » ; hors de l'année d'aujourd'hui, « Août 2027 » (après un long défilement, le mois seul est ambigu). */
const moisDe = (j: string, auj: string) => majuscule(moisLong(midi(j))) + (j.slice(0, 4) === auj.slice(0, 4) ? "" : ` ${j.slice(0, 4)}`);
const rangees = (premier: string) => Math.ceil(grilleMois(premier).length / 7);

export function PageMois({
  depart,
  aujourdhui,
  jours,
  onFenetre,
  onJour,
  onRetour,
  choisi = null,
  vise = null,
  mesure,
  couleur,
  couleurFaite,
  degrade,
  serie,
  vue = "mois",
  onVue,
  titre,
  liste,
  futur = true,
  futurJusqua,
  premierMois,
  legende,
  children,
}: {
  depart: string;
  aujourdhui: string;
  jours: Map<string, JourMois>;
  onFenetre?: (de: string, a: string) => void;
  onJour: (j: string) => void;
  onRetour: () => void;
  choisi?: string | null;
  vise?: string | null;
  mesure?: (j: string, v: ViewInstance | null) => void;
  couleur?: string;
  couleurFaite?: string;
  degrade?: boolean;
  serie?: number;
  vue?: VueAgenda;
  onVue?: (v: VueAgenda) => void;
  titre?: string;
  liste?: ReactNode;
  futur?: boolean;
  futurJusqua?: string | null;
  premierMois?: string | null;
  legende?: readonly { marque: Exclude<MarqueMois, null>; texte: string }[];
  children?: ReactNode;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  const c = couleur ?? accent;
  const geste = useDegrade();
  // Fond d'un jour fait : la couleur de la partie (ou celle d'un jour fait), ou le dégradé du geste (CSS natif, posé sur son
  // arrêt du milieu). Sur le vert, le chiffre blanc ne tient pas de nuit (#2fd06a, 2:1) : il prend l'encre du fond.
  const fait = useMemo(
    () => ({
      ...(degrade
        ? { backgroundColor: geste.arrets[1]!.couleur, backgroundImage: `linear-gradient(135deg, ${geste.arrets.map((a) => `${a.couleur} ${a.offset * 100}%`).join(", ")})` }
        : { backgroundColor: couleurFaite ?? c }),
      encre: couleurFaite && !degrade ? couleurs.bg : primitifs["gris-0"],
      anneau: couleurFaite ?? c,
    }),
    [degrade, geste, c, couleurFaite, couleurs.bg],
  );
  const bas = useSafeAreaInsets().bottom;
  // Les mois, de dix ans avant à dix ans après le jour d'arrivée (sans futur : jusqu'au mois d'aujourd'hui ; pas avant le
  // premier mois de l'historique) ; leurs positions sont calculées d'avance.
  const mois = useMemo(() => {
    const l = Array.from({ length: 2 * MOIS + 1 }, (_, i) => premierDuMois(depart, i - MOIS));
    const fin = futur ? null : premierDuMois(futurJusqua && futurJusqua > aujourdhui ? futurJusqua : aujourdhui);
    const debut = premierMois ? premierDuMois(premierMois) : null;
    return l.filter((m) => (fin == null || m <= fin) && (debut == null || m >= debut || m === premierDuMois(depart)));
  }, [depart, futur, futurJusqua, aujourdhui, premierMois]);
  const iDepart = Math.max(0, mois.indexOf(premierDuMois(depart)));
  const positions = useMemo(() => {
    let y = 0;
    return mois.map((m) => {
      const h = TITRE_H + rangees(m) * RANGEE_H;
      const r = { length: h, offset: y };
      y += h;
      return r;
    });
  }, [mois]);
  const [haut, setHaut] = useState(premierDuMois(depart));
  const listeMois = useRef<FlatList<string>>(null);
  const fenetre = useRef(onFenetre);
  fenetre.current = onFenetre;

  const vus = useRef((e: { viewableItems: ListViewToken[] }) => {
    const v = e.viewableItems.map((x) => x.item as string).sort();
    if (!v.length) return;
    fenetre.current?.(v[0]!, ajouterJ(premierDuMois(v[v.length - 1]!, 1), -1));
  }).current;
  /** Mois en haut de la liste à la position `y` (hauteurs fixes : recherche dichotomique). */
  const moisA = (y: number) => {
    let bas = 0;
    let h = positions.length - 1;
    while (bas < h) {
      const m = (bas + h + 1) >> 1;
      if (positions[m]!.offset <= y) bas = m;
      else h = m - 1;
    }
    return mois[bas]!;
  };

  // « Aujourd'hui » n'apparaît que si la rangée d'aujourd'hui est hors de l'écran (mois d'aujourd'hui dans les vingt ans).
  const moisAuj = premierDuMois(aujourdhui);
  const iAuj = mois.indexOf(moisAuj);
  const rangeeAuj = useMemo(() => {
    if (iAuj < 0) return null;
    const y = positions[iAuj]!.offset + TITRE_H + Math.floor(grilleMois(moisAuj).indexOf(aujourdhui) / 7) * RANGEE_H;
    return { haut: y, bas: y + RANGEE_H };
  }, [positions, iAuj, moisAuj, aujourdhui]);
  const hauteurListe = useRef(Dimensions.get("window").height);
  const visible = (y: number, h: number) => rangeeAuj != null && rangeeAuj.bas > y && rangeeAuj.haut < y + h;
  const [aujVisible, setAujVisible] = useState(() => visible(positions[iDepart]!.offset, hauteurListe.current));
  const defile = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const v = rangeeAuj != null && rangeeAuj.bas > y && rangeeAuj.haut < y + e.nativeEvent.layoutMeasurement.height;
      setAujVisible((x) => (x === v ? x : v));
      // Le titre suit la position (la visibilité, elle, n'est calculée qu'au repos) : le nom du mois en haut de l'écran.
      const m = moisA(y + TITRE_H / 2);
      setHaut((x) => (x === m ? x : m));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeeAuj, positions],
  );
  const [halo, setHalo] = useState(0);
  const allerAujourdhui = () => {
    if (!rangeeAuj) return;
    listeMois.current?.scrollToOffset({ offset: Math.max(0, rangeeAuj.haut - hauteurListe.current / 2 + RANGEE_H / 2), animated: true });
    // Un défilement programmé n'émet pas d'onScroll sur Android : titre, bouton et données sont posés ici.
    setHaut(moisAuj);
    setAujVisible(true);
    fenetre.current?.(premierDuMois(moisAuj, -1), ajouterJ(premierDuMois(moisAuj, 2), -1));
    // Rejoué une fois, puis retiré : un mois remonté plus tard ne le relance pas.
    setTimeout(() => setHalo((n) => n + 1), HALO_APRES_MS);
    setTimeout(() => setHalo(0), HALO_APRES_MS + HALO_VIE_MS);
  };

  const renderItem = useCallback<ListRenderItem<string>>(
    ({ item }) => {
      const dans = (j: string | null) => (j != null && j.startsWith(item.slice(0, 8)) ? j : null);
      return (
        <Mois
          premier={item}
          jours={jours}
          aujourdhui={aujourdhui}
          choisi={dans(choisi)}
          vise={dans(vise)}
          halo={item === moisAuj ? halo : 0}
          futur={futur}
          couleur={c}
          fait={fait}
          onJour={onJour}
          mesure={mesure}
        />
      );
    },
    [jours, aujourdhui, choisi, vise, moisAuj, halo, futur, c, fait, onJour, mesure],
  );

  const enListe = vue === "liste" && onVue != null;
  // Mise en page de la liste des mois, tant que le doigt ne l'a pas fait défiler (aussi au retour de la vue liste) : sans
  // futur, la liste bornée s'arrête plus haut que le mois de départ ; titre et « Aujourd'hui » suivent la position réelle.
  // Sa hauteur change encore après la première mise en page (marges de l'écran connues ensuite) : la position suit.
  const premiereMise = useRef(true);
  const touche = useRef(false);
  /** Position à reposer une fois le contenu mesuré (liste bornée), null sinon. */
  const cible = useRef<number | null>(null);
  if (enListe) {
    premiereMise.current = true;
    touche.current = false;
  }
  const poser = (h: number) => {
    const change = h !== hauteurListe.current;
    hauteurListe.current = h;
    if (!premiereMise.current && (touche.current || !change)) return;
    premiereMise.current = false;
    const der = positions[positions.length - 1]!;
    const y = Math.max(0, Math.min(positions[iDepart]!.offset, der.offset + der.length + espace.xxl - h));
    setHaut(moisA(y + TITRE_H / 2));
    setAujVisible(visible(y, h));
    // Liste bornée : sur Android, l'index de départ hors d'atteinte laissait la dernière rangée (aujourd'hui) sous le bord
    // (Poids, 30/10) ; la position est reposée à la mesure du contenu (la liste ne défile plus d'elle-même : contentOffset).
    if (y !== positions[iDepart]!.offset) {
      cible.current = y;
      requestAnimationFrame(() => listeMois.current?.scrollToOffset({ offset: y, animated: false }));
    }
  };
  const mesureContenu = () => {
    const y = cible.current;
    if (y == null) return;
    cible.current = null;
    requestAnimationFrame(() => listeMois.current?.scrollToOffset({ offset: y, animated: false }));
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.barre}>
        <BoutonIcone nom="back" libelle={t("ui.retour")} onPress={onRetour} />
        <Texte variante="exercice" accessibilityRole="header" style={styles.titre} numberOfLines={1}>
          {enListe ? titre : moisDe(haut, aujourdhui)}
        </Texte>
        {aujVisible || enListe ? null : <BoutonAujourdhui onPress={allerAujourdhui} />}
        {serie ? <Serie n={serie} couleur={c} /> : null}
        {onVue ? <BasculeVue valeur={vue} onChange={onVue} /> : null}
      </View>
      {enListe ? (
        <View style={{ flex: 1, marginBottom: bas }}>{liste}</View>
      ) : (
        <>
          <View style={styles.semaine}>
            {semaineDe(aujourdhui).map((j) => (
              <Texte key={j} variante="meta" couleur="t2" style={styles.lettre}>
                {jourEtroit(midi(j)).toUpperCase()}
              </Texte>
            ))}
          </View>
          {legende?.length ? <Legende items={legende} couleur={c} fait={fait} /> : null}
          <FlatList
            ref={listeMois}
            data={mois}
            keyExtractor={(m) => m}
            // Sans futur, le mois d'aujourd'hui est le dernier : la liste, bornée, s'arrête sur lui (en bas de l'écran).
            initialScrollIndex={iDepart}
            contentOffset={{ x: 0, y: positions[iDepart]!.offset }}
            onContentSizeChange={mesureContenu}
            getItemLayout={(_, i) => ({ ...positions[i]!, index: i })}
            onViewableItemsChanged={vus}
            viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
            onScroll={defile}
            // Le dernier onScroll d'un lancer rapide peut être sauté (limite de 32 ms) : le titre restait sur un mois de
            // passage. La fin du glisser et la fin de l'élan reposent titre et bouton sur la position finale.
            onScrollBeginDrag={() => (touche.current = true)}
            onScrollEndDrag={defile}
            onMomentumScrollEnd={defile}
            scrollEventThrottle={32}
            onLayout={(e) => poser(e.nativeEvent.layout.height)}
            // Mois mémoïsés et légers : on en garde assez de part et d'autre pour qu'un défilement rapide les trouve prêts.
            windowSize={21}
            initialNumToRender={4}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={30}
            // La liste s'arrête au-dessus de la barre de navigation du système (elle ne passe plus sous ses boutons).
            style={{ marginBottom: bas }}
            contentContainerStyle={{ paddingBottom: espace.xxl }}
            renderItem={renderItem}
          />
        </>
      )}
      {children}
    </View>
  );
}

/** Un mois : son nom, puis ses semaines (lundi en premier). Mémoïsé : il ne se redessine que si ses données changent.
 *  Léger, pour suivre un défilement rapide : un seul Pressable pour tout le mois (la case touchée se déduit de la position,
 *  la grille est fixe), des cases en simples View et Text sans hook ; chaque case reste un bouton pour le lecteur d'écran. */
const Mois = memo(function Mois({
  premier,
  jours,
  aujourdhui,
  choisi,
  vise,
  halo,
  futur,
  couleur,
  fait,
  onJour,
  mesure,
}: {
  premier: string;
  jours: Map<string, JourMois>;
  aujourdhui: string;
  /** Jour choisi ou visé, s'il est dans ce mois. */
  choisi: string | null;
  vise: string | null;
  halo: number;
  /** Faux : les jours après aujourd'hui sont éteints (t3) et ne se touchent pas. */
  futur: boolean;
  couleur: string;
  fait: FondFait;
  onJour: (j: string) => void;
  mesure?: (j: string, v: ViewInstance | null) => void;
}) {
  const { couleurs } = useTheme();
  const grille = grilleMois(premier);
  const semaines = Array.from({ length: Math.ceil(grille.length / 7) }, (_, i) => grille.slice(i * 7, i * 7 + 7));
  const toucher = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    const largeur = (largeurContenu() - 2 * espace.s) / 7;
    const r = Math.floor((y - TITRE_H) / RANGEE_H);
    const k = Math.floor((x - espace.s) / largeur);
    const j = r >= 0 && k >= 0 && k < 7 ? semaines[r]?.[k] : null;
    if (j && (futur || j <= aujourdhui)) onJour(j);
  };
  return (
    <Pressable onPress={toucher} accessible={false}>
      <View pointerEvents="none">
        <Text maxFontSizeMultiplier={POLICE_MAX} style={[styles.nomMois, { color: couleurs.t2 }]}>{moisDe(premier, aujourdhui)}</Text>
        {semaines.map((s, i) => (
          <View key={i} style={styles.rangee}>
            {Array.from({ length: 7 }, (_, k) => s[k] ?? null).map((j, k) =>
              j ? (
                <Jour
                  key={j}
                  j={j}
                  r={jours.get(j)}
                  auj={j === aujourdhui}
                  passe={j < aujourdhui}
                  eteint={!futur && j > aujourdhui}
                  choisi={j === choisi}
                  vise={j === vise}
                  halo={j === aujourdhui ? halo : 0}
                  couleur={couleur}
                  fait={fait}
                  couleurs={couleurs}
                  onJour={onJour}
                  mesure={mesure}
                />
              ) : (
                <View key={k} style={styles.jour} />
              ),
            )}
          </View>
        ))}
      </View>
    </Pressable>
  );
});

const ACTIVER = [{ name: "activate" }] as const;

/** Fond d'un jour fait : couleur de la partie, ou dégradé natif posé sur son arrêt du milieu ; encre du chiffre, anneau d'aujourd'hui. */
type FondFait = { backgroundColor: string; backgroundImage?: string; encre: string; anneau: string };

/**
 * Un jour : pastille pleine de la couleur de la partie (fait), s1 (manqué), contour de la partie (prévu, aujourd'hui) ;
 * aujourd'hui fait : anneau décalé de 2 (D5 de teintes-parties : sans lui, on ne le distinguait plus) ; dessous le libellé.
 */
const Jour = memo(function Jour({
  j,
  r,
  auj,
  passe,
  eteint,
  choisi,
  vise,
  halo,
  couleur,
  fait,
  couleurs,
  onJour,
  mesure,
}: {
  j: string;
  r: JourMois | undefined;
  auj: boolean;
  passe: boolean;
  eteint: boolean;
  choisi: boolean;
  vise: boolean;
  halo: number;
  couleur: string;
  fait: FondFait;
  couleurs: Jetons;
  onJour: (j: string) => void;
  mesure?: (j: string, v: ViewInstance | null) => void;
}) {
  const m = r?.marque ?? null;
  const libelle = r?.libelle ?? "";
  // Anneau de la partie : prévu ou aujourd'hui (à venir), ou un jour qui a une donnée sans être « bon » (mesures).
  const cercle = m === "donnee" || m === "estimee" || (!passe && (m === "prevue" || auj) && m !== "faite");
  // Faite : pastille verte du validé (Sport), ou au dégradé du geste (turquoise de Nutrition).
  const fond =
    m === "faite"
      ? fait.backgroundImage ? { backgroundColor: fait.backgroundColor, backgroundImage: fait.backgroundImage } : { backgroundColor: fait.backgroundColor }
      : { backgroundColor: m === "manquee" ? couleurs.s1 : "transparent" };
  return (
    <View
      ref={mesure ? (v) => mesure(j, v) : undefined}
      collapsable={false}
      accessible
      accessibilityRole="button"
      accessibilityLabel={libelle ? `${jourSemaineMois(midi(j))}, ${libelle}` : jourSemaineMois(midi(j))}
      accessibilityState={{ selected: choisi, disabled: eteint }}
      accessibilityActions={eteint ? undefined : ACTIVER}
      onAccessibilityAction={() => onJour(j)}
      style={[styles.jour, (choisi || vise) && { backgroundColor: couleurs.verreCarte, borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.verreFilet }]}
    >
      {/* collapsable={false} : sans fond, Fabric aplatit la pastille ; recréée quand sa couleur arrive, elle perdait son
          arrondi (carrés d'octobre, ronds de septembre sur la même capture). */}
      <View collapsable={false} style={[styles.rond, fond, cercle && { borderWidth: 1.5, borderColor: couleur }, m === "estimee" && { borderStyle: "dashed" }]}>
        {auj && m === "faite" ? <View pointerEvents="none" style={[styles.anneau, { borderColor: fait.anneau }]} /> : null}
        {auj ? <Halo cle={halo} couleur={couleur} rayon={14} /> : null}
        <Text
          maxFontSizeMultiplier={POLICE_MAX}
          style={[
            styles.chiffre,
            { color: m === "faite" ? fait.encre : auj ? couleur : eteint && m !== "estimee" ? couleurs.t3 : couleurs.t1 },
            (m === "faite" || auj) && { fontFamily: police.semibold },
          ]}
        >
          {Number(j.slice(8))}
        </Text>
      </View>
      {/* posé sous la pastille, hors du flux : les chiffres restent alignés d'un jour à l'autre */}
      {m === "point" ? <View style={[styles.point, styles.pointJour, { backgroundColor: couleur }]} /> : null}
      {libelle ? (
        <Text maxFontSizeMultiplier={POLICE_MAX} numberOfLines={1} style={[styles.nom, { color: couleurs.t2 }]}>
          {libelle}
          {r?.unite ? <Text maxFontSizeMultiplier={POLICE_MAX} style={{ color: couleurs.t3 }}>{`\u202f${r.unite}`}</Text> : null}
        </Text>
      ) : null}
    </View>
  );
});

/** Légende courte, sous les jours de la semaine : une petite pastille par sens, dessinée comme celles des jours. */
function Legende({ items, couleur, fait }: { items: readonly { marque: Exclude<MarqueMois, null>; texte: string }[]; couleur: string; fait: FondFait }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.legende}>
      {items.map((x) => (
        <View key={x.marque} style={styles.legendeItem}>
          <View
            style={[
              styles.legendePastille,
              x.marque === "faite"
                ? fait.backgroundImage ? { backgroundColor: fait.backgroundColor, backgroundImage: fait.backgroundImage } : { backgroundColor: fait.backgroundColor }
                : x.marque === "manquee"
                  ? { backgroundColor: couleurs.s1 }
                  : x.marque === "point"
                    ? [styles.point, { backgroundColor: couleur }]
                    : { borderWidth: 1.5, borderColor: couleur, borderStyle: x.marque === "estimee" ? "dashed" : "solid" },
            ]}
          />
          <Text maxFontSizeMultiplier={POLICE_MAX} numberOfLines={1} style={[styles.legendeTexte, { color: couleurs.t2 }]}>
            {x.texte}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { height: 56, flexDirection: "row", alignItems: "center", paddingLeft: espace.xs, paddingRight: espace.l, gap: espace.xs },
  titre: { ...typo.titreBarre, flex: 1, paddingLeft: espace.xs },
  semaine: { flexDirection: "row", paddingHorizontal: espace.s, paddingVertical: espace.s },
  legende: { flexDirection: "row", flexWrap: "wrap", columnGap: espace.l, rowGap: 4, paddingHorizontal: espace.l, paddingBottom: espace.xs },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  legendePastille: { width: 10, height: 10, borderRadius: 5 },
  legendeTexte: { ...typo.meta, fontSize: 11, lineHeight: 14 },
  lettre: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: police.semibold },
  nomMois: { ...typo.exercice, height: TITRE_H, paddingHorizontal: espace.l, paddingTop: espace.l, fontSize: 15 },
  rangee: { height: RANGEE_H, flexDirection: "row", paddingHorizontal: espace.s },
  jour: { flex: 1, height: RANGEE_H, alignItems: "center", justifyContent: "center", borderRadius: rayon.l, gap: 2 },
  rond: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  // 2 d'écart autour de la pastille, puis 1,5 d'anneau : 35 de diamètre, centré sur la pastille.
  anneau: { position: "absolute", top: -3.5, left: -3.5, width: 35, height: 35, borderRadius: 17.5, borderWidth: 1.5 },
  chiffre: { ...typo.saisie, fontSize: 14, fontFamily: police.medium },
  point: { width: 5, height: 5, borderRadius: 2.5 },
  // pastille de 28 centrée dans 52 : son bas à 40 ; le point 4 plus bas
  pointJour: { position: "absolute", top: 44 },
  nom: { ...typo.meta, fontSize: 11, lineHeight: 13, maxWidth: "100%", paddingHorizontal: 1, letterSpacing: -0.2 },
});
