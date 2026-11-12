// Briques de la boutique (planche boutique-programmes, commun.css) : vignette en dégradé de la famille avec le picto 3D,
// niveau en trois barres, méta d'une carte (programme ou routine), cartes grande et petite, rangée de résultat, entrées
// compactes « Explorer les programmes » et « Explorer les routines ».
import { useCallback, useState, type ReactNode } from "react";
import { Image, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../theme";
import type { Jetons } from "../theme/jetons";
import { espace, police } from "../theme/typo";
import { t, tp } from "../i18n/index";
import { approx, dureeCourte } from "../ecrans/format";
import { useIdSvg } from "../ui/Degrade";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { fichierPicto } from "../ui/pictos";
import { Texte } from "../ui/Texte";
import { dureeSeance } from "./calculs";
import { PROGRAMMES, ROUTINES, tx } from "./donnees";
import { estRoutine, type Article, type Famille, type Niveau, type Programme } from "./modele";

/** Couleur d'une famille, aux couleurs des parties (endurance bleu, force orange, forme turquoise, santé rose) : gardées par
 *  Alex (D3 du 28/10, revue finale du 30/10). Et son fond de jour. */
const FAMILLE: Record<Famille, { c: keyof Jetons; fond: keyof Jetons }> = {
  endu: { c: "partieAccueil", fond: "fondAccueil" },
  force: { c: "partieEntrainement", fond: "fondEntrainement" },
  forme: { c: "partieNutrition", fond: "fondNutrition" },
  sante: { c: "partieSante", fond: "fondSante" },
};
export function useFamille(f: Famille) {
  const { couleurs } = useTheme();
  return { c: couleurs[FAMILLE[f].c], fond: couleurs[FAMILLE[f].fond] };
}

/** Mélange de deux couleurs « #rrggbb » (color-mix de la planche) : `t` de `a`, le reste de `b`. */
export function melange(a: string, b: string, t: number): string {
  const v = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(v(a, i) * t + v(b, i) * (1 - t))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
/** Couleur avec opacité (« #rrggbb » → rgba). */
export const alpha = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;

/**
 * Vignette d'un programme : voile de la couleur de sa famille, lueur derrière le picto 3D, ombre douce en bas à gauche sous
 * le chiffre (« 10 km », « 5×5 ») en Inter Light. `pastille` : « Dehors », « Course · dehors » (fiche).
 */
export function Vignette({
  p,
  hauteur,
  largeur,
  gros = 34,
  rayon = 14,
  pastille,
  chiffre = true,
  heros = false,
  pastilleHaut = 84,
  fait,
  filet = false,
  style,
}: {
  p: Pick<Programme, "famille" | "picto" | "gros">;
  hauteur: number;
  largeur?: number;
  gros?: number;
  rayon?: number;
  pastille?: string | null;
  chiffre?: boolean;
  heros?: boolean;
  /** Fiche : la pastille se pose sous la barre du haut (zone système comprise). */
  pastilleHaut?: number;
  /** « Fait en mars » (retour 9) : pastille cochée verte et anneau vert de 2 autour de la vignette ; vide : l'anneau seul. */
  fait?: string | null;
  /** Filet de la famille autour (calendrier de « Explorer les programmes » : la nuit, la vignette ne se fond pas dans la carte). */
  filet?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { mode, couleurs } = useTheme();
  const f = useFamille(p.famille);
  const nuit = mode === "nuit";
  const base = nuit ? couleurs.s1 : f.fond;
  const id = useIdSvg("vig");
  const src = fichierPicto(p.picto, null, heros || hauteur > 100 ? 512 : 0);
  const unite = p.gros.unite;
  // Les dégradés SVG veulent une taille en pixels (comme FondDegrade) : la vignette se mesure.
  const [l, setL] = useState(largeur ?? 0);
  const mesurer = useCallback((e: LayoutChangeEvent) => setL(Math.round(e.nativeEvent.layout.width)), []);
  // Carte de rangée « faite » : la silhouette descend sous la pastille plutôt que de passer dessous (B7).
  const cote = Math.round((fait && !heros && hauteur <= 120 ? hauteur - 36 : hauteur) * (heros ? 1.08 : 1.12));
  return (
    <View
      onLayout={mesurer}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { height: hauteur, width: largeur, borderRadius: rayon, overflow: "hidden", backgroundColor: base },
        !nuit && { borderWidth: heros ? 0 : StyleSheet.hairlineWidth * 2, borderColor: alpha(f.c, 0.14) },
        heros && { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
        style,
      ]}
    >
      {l ? (
        <Svg style={StyleSheet.absoluteFill} width={l} height={hauteur}>
          <Defs>
            <LinearGradient id={`${id}l`} x1="25%" y1="7%" x2="75%" y2="93%">
              <Stop offset="0" stopColor={nuit ? melange(f.c, base, 0.26) : melange(f.c, base, 0.12)} />
              <Stop offset={nuit ? "0.78" : "0.8"} stopColor={base} />
            </LinearGradient>
            <RadialGradient id={`${id}r`} cx="82%" cy="30%" rx="90%" ry="110%">
              <Stop offset="0" stopColor={f.c} stopOpacity={nuit ? 0.48 : 0.22} />
              <Stop offset="0.62" stopColor={f.c} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={l} height={hauteur} fill={`url(#${id}l)`} />
          <Rect width={l} height={hauteur} fill={`url(#${id}r)`} />
        </Svg>
      ) : null}
      {src != null ? (
        <Image
          source={src}
          resizeMode="contain"
          style={[
            styles.picto,
            { width: cote, height: cote, right: -Math.round(l * (heros ? 0.08 : 0.04)), bottom: -Math.round(hauteur * (heros ? 0.04 : 0.06)) },
          ]}
        />
      ) : null}
      {l ? (
        <Svg style={StyleSheet.absoluteFill} width={l} height={hauteur} pointerEvents="none">
          <Defs>
            <RadialGradient id={`${id}o`} cx="0%" cy="100%" rx="70%" ry="55%">
              <Stop offset="0" stopColor={nuit ? "#000000" : "#ffffff"} stopOpacity={nuit ? 0.42 : 0.7} />
              <Stop offset="0.7" stopColor={nuit ? "#000000" : "#ffffff"} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={l} height={hauteur} fill={`url(#${id}o)`} />
        </Svg>
      ) : null}
      {fait ? (
        <View style={[styles.pastille, { backgroundColor: nuit ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.82)" }]}>
          <Icone nom="check" couleur={couleurs.valide} taille={13} epaisseur={2.5} />
          <Texte style={[styles.pastilleTexte, { color: nuit ? "#ffffff" : couleurs.t1 }]}>{fait}</Texte>
        </View>
      ) : pastille ? (
        <View style={[styles.pastille, heros && { top: pastilleHaut, left: espace.l }, { backgroundColor: nuit ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.78)" }]}>
          <View style={[styles.point, { backgroundColor: f.c }]} />
          <Texte style={[styles.pastilleTexte, { color: nuit ? "#ffffff" : couleurs.t1 }]}>{pastille}</Texte>
        </View>
      ) : null}
      {chiffre ? (
        <Texte
          numberOfLines={1}
          style={[
            styles.gros,
            { fontSize: gros, letterSpacing: gros > 40 ? -2 : -0.8, left: heros ? espace.l : gros < 30 ? 10 : 14, bottom: heros ? 22 : gros < 30 ? 8 : 10 },
            nuit ? styles.grosNuit : { color: couleurs.t1, textShadowColor: "rgba(255,255,255,0.8)", textShadowRadius: 10 },
          ]}
        >
          {p.gros.valeur}
          {unite ? (
            <Texte style={[styles.unite, { fontSize: heros ? 20 : gros < 30 ? 13 : 15, color: nuit ? "#ffffff" : couleurs.t1 }]}>{` ${unite}`}</Texte>
          ) : null}
        </Texte>
      ) : null}
      {filet ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: rayon, borderWidth: 1, borderColor: alpha(f.c, nuit ? 0.42 : 0.2) }]} /> : null}
      {fait != null ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: rayon, borderWidth: 2, borderColor: couleurs.valide }]} /> : null}
    </View>
  );
}

/** Niveau : trois barres croissantes, toujours accompagnées du mot. */
export function Barres({ n, couleur, grand = false }: { n: Niveau; couleur: string; grand?: boolean }) {
  const { couleurs } = useTheme();
  const h = grand ? [6, 10, 14] : [5, 7.5, 10];
  return (
    <View style={[styles.barres, { height: h[2] }, grand && { gap: 2 }]}>
      {h.map((x, i) => (
        <View key={i} style={{ width: grand ? 4 : 3, height: x, borderRadius: 1, backgroundColor: i < n ? couleur : couleurs.line2 }} />
      ))}
    </View>
  );
}

/** Les exercices d'une routine comptent en muscu, cross et mobilité ; en endurance, ce sont des étapes (échauffement…). */
const compteExercices = (p: Article) => estRoutine(p) && !["course", "velo", "natation"].includes(p.type);

/** Programme : « 8 sem.  4 séances/sem.  ▮▮▯ Intermédiaire » ; routine : « ~ 45 min  6 exercices  ▮▮▯ Intermédiaire ». */
export function Meta({ p, taille = 12.5 }: { p: Article; taille?: number }) {
  const { couleurs } = useTheme();
  const s = { fontSize: taille, lineHeight: 18, color: couleurs.t2 };
  return (
    <View style={styles.meta}>
      {estRoutine(p) ? (
        <>
          <Texte style={s}>{approx(dureeCourte(dureeSeance(p.seance)))}</Texte>
          {compteExercices(p) ? <Texte style={s}>{tp("exercices.exercice", p.seance.blocs.length)}</Texte> : null}
        </>
      ) : (
        <>
          <Texte style={s}>{t("boutique.sem", { n: p.semaines })}</Texte>
          <Texte style={s}>{t("boutique.seancesSem", { n: p.seancesParSemaine })}</Texte>
        </>
      )}
      <View style={styles.metaNiveau}>
        <Barres n={p.niveau} couleur={couleurs.t2} />
        <Texte style={s}>{t(`boutique.niveau.${p.niveau}` as "boutique.niveau.1")}</Texte>
      </View>
    </View>
  );
}

const lieuCourt = (p: Article) => tx(p.lieuCourt).split(", ").pop() ?? "";
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Carte « Pour toi » : grande vignette (168) avec la pastille du lieu. */
export function CarteGrande({ p, largeur, onPress, fait }: { p: Article; largeur: number; onPress: () => void; fait?: string | null }) {
  return (
    <Appui accessibilityRole="button" accessibilityLabel={fait ? `${tx(p.nom)}, ${fait}` : tx(p.nom)} onPress={onPress} style={{ width: largeur }}>
      <Vignette p={p} hauteur={168} pastille={majuscule(lieuCourt(p))} fait={fait} />
      <Texte numberOfLines={1} style={styles.nomGrand}>
        {tx(p.nom)}
      </Texte>
      <Meta p={p} />
    </Appui>
  );
}

/** Carte d'une rangée : vignette 120, nom sur deux lignes. */
export function CartePetite({ p, onPress, fait }: { p: Article; onPress: () => void; fait?: string | null }) {
  return (
    <Appui accessibilityRole="button" accessibilityLabel={fait ? `${tx(p.nom)}, ${fait}` : tx(p.nom)} onPress={onPress} style={{ width: 164 }}>
      <Vignette p={p} hauteur={120} gros={26} fait={fait} />
      <Texte numberOfLines={2} style={styles.nomPetit}>
        {tx(p.nom)}
      </Texte>
      <Meta p={p} taille={12} />
    </Appui>
  );
}

/** Rangée de résultat : vignette 96, nom, résumé sur deux lignes, méta. */
export function LigneResultat({ p, onPress, filet, fait }: { p: Article; onPress: () => void; filet: boolean; fait?: string | null }) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={fait ? `${tx(p.nom)}, ${fait}` : tx(p.nom)}
      onPress={onPress}
      style={[styles.resultat, filet && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}
    >
      <Vignette p={p} hauteur={96} largeur={96} rayon={12} gros={22} fait={fait ? "" : undefined} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="exercice" numberOfLines={1} style={{ marginBottom: 3 }}>
          {tx(p.nom)}
        </Texte>
        <Texte numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: couleurs.t2, marginBottom: 6 }}>
          {tx(p.resume)}
        </Texte>
        <Meta p={p} />
        {fait ? (
          <View style={styles.faitEn}>
            <Icone nom="check" couleur={couleurs.valide} taille={13} epaisseur={2.5} />
            <Texte style={{ fontFamily: police.semibold, fontSize: 12, color: couleurs.valide }}>{fait}</Texte>
          </View>
        ) : null}
      </View>
    </Appui>
  );
}

/** Sous-titre des entrées : « 22 programmes de 4 à 16 semaines : … », « 12 routines à faire une fois : … ». */
export function sousEntree(genre: "programme" | "routine"): string {
  if (genre === "routine") return t("boutique.parcourirRoutinesSous", { n: ROUTINES.length });
  const sem = PROGRAMMES.map((p) => p.semaines);
  return t("boutique.parcourirProgrammesSous", { n: PROGRAMMES.length, min: Math.min(...sem), max: Math.max(...sem) });
}

/** Trois vignettes en éventail (course, force, mobilité), programmes ou routines. */
function Eventail({ bord, genre }: { bord: string; genre: "programme" | "routine" }) {
  const ids = genre === "routine" ? ["r-fract-6x1k", "r-push-a", "r-hanches"] : ["c10", "f5", "mob"];
  const rot = ["-6deg", "0deg", "6deg"];
  const articles: readonly Article[] = genre === "routine" ? ROUTINES : PROGRAMMES;
  return (
    <View style={styles.pile}>
      {ids.map((id, i) => {
        const p = articles.find((x) => x.id === id);
        if (!p) return null;
        return (
          <View key={id} style={[styles.pileCarte, { left: i * 11, top: i === 1 ? 0 : 4, zIndex: i, transform: [{ rotate: rot[i]! }], borderColor: bord }]}>
            <Vignette p={p} hauteur={40} largeur={32} rayon={8} chiffre={false} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * Entrée compacte vers Explorer les programmes ou Explorer les routines : en tête de la feuille « Planifier une séance » (fond
 * du groupe de la feuille ; les deux, programmes puis routines, D5 de la planche boutiques).
 */
export function EntreeBoutique({
  genre,
  onPress,
  dansFeuille = false,
  style,
}: {
  genre: "programme" | "routine";
  onPress: () => void;
  dansFeuille?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { couleurs, mode } = useTheme();
  const fond = dansFeuille ? (mode === "nuit" ? couleurs.feuilleGroupe : couleurs.s1) : couleurs.s1;
  const titre = t(genre === "routine" ? "boutique.parcourirRoutines" : "boutique.parcourirProgrammes");
  const sous = sousEntree(genre);
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={titre}
      accessibilityHint={sous}
      onPress={onPress}
      style={({ pressed }) => [styles.entree, { backgroundColor: pressed ? couleurs.s2 : fond }, style]}
    >
      <Eventail bord={fond} genre={genre} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="exercice">{titre}</Texte>
        <Texte numberOfLines={1} style={{ fontSize: 12.5, color: couleurs.t3, marginTop: 3 }}>
          {sous}
        </Texte>
      </View>
      <View style={{ marginRight: 6 }}>
        <Icone nom="right" couleur={couleurs.t3} taille={18} />
      </View>
    </Appui>
  );
}

/** En-tête de section de la boutique : titre 18, sous-titre, « Tout voir ». `serre` : sous le texte d'en-tête (marge de 14). */
export function TeteSection({ titre, sous, onToutVoir, droite, serre }: { titre: string; sous?: string | null; onToutVoir?: () => void; droite?: ReactNode; serre?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.teteSection, serre && { marginTop: 14 }]}>
      <View style={{ flex: 1 }}>
        <Texte accessibilityRole="header" style={styles.teteTitre}>
          {titre}
        </Texte>
        {sous ? <Texte style={{ fontSize: 12.5, color: couleurs.t3, marginTop: 2 }}>{sous}</Texte> : null}
      </View>
      {onToutVoir ? (
        <Appui accessibilityRole="button" accessibilityLabel={`${t("boutique.toutVoir")}, ${titre}`} onPress={onToutVoir} style={styles.toutVoir}>
          <Texte style={{ fontFamily: police.medium, fontSize: 14, color: couleurs.t2 }}>{t("boutique.toutVoir")}</Texte>
          <Icone nom="right" couleur={couleurs.t2} taille={16} />
        </Appui>
      ) : null}
      {droite}
    </View>
  );
}

const styles = StyleSheet.create({
  picto: { position: "absolute" },
  pastille: { position: "absolute", left: 12, top: 12, height: 24, paddingHorizontal: 9, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 5 },
  point: { width: 6, height: 6, borderRadius: 3 },
  pastilleTexte: { fontFamily: police.semibold, fontSize: 11 },
  gros: { position: "absolute", fontFamily: police.light, lineHeight: undefined, includeFontPadding: false },
  grosNuit: { color: "#ffffff", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 12, textShadowOffset: { width: 0, height: 1 } },
  unite: { fontFamily: police.regular, letterSpacing: 0 },
  barres: { flexDirection: "row", alignItems: "flex-end", gap: 2, marginRight: 5 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10 },
  metaNiveau: { flexDirection: "row", alignItems: "center" },
  nomGrand: { fontFamily: police.semibold, fontSize: 16, marginTop: 12, marginBottom: 4 },
  nomPetit: { fontFamily: police.semibold, fontSize: 14, lineHeight: 19, height: 38, marginTop: 10, marginBottom: 3 },
  resultat: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 8, minHeight: 112 },
  entree: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, paddingVertical: 12, paddingLeft: 14, paddingRight: 8, borderRadius: 16 },
  pile: { width: 58, height: 48 },
  pileCarte: { position: "absolute", borderWidth: 2, borderRadius: 10 },
  teteSection: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, marginTop: 28, marginBottom: 10, minHeight: 44 },
  teteTitre: { fontFamily: police.semibold, fontSize: 18 },
  faitEn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  toutVoir: { height: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 2 },
});
