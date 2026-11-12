import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { courbe, duree } from "../../theme/mouvement";
import { useTheme } from "../../theme";
import { espace, police, POLICE_MAX, rayon } from "../../theme/typo";
import { COULEURS_MACROS, DEGRADES_MACROS, DEGRADES_SUIVIS, energiePour100, MILIEU_DEGRADE, progression, type CleMacro, type CleSuivi, type Macros, type Unite } from "../../nutrition/calculs";
import type { Consommation, Produit, Repas } from "../../db";
import { Bouton } from "../../ui/Bouton";
import { BarreHaut } from "../../ui/Cadre";
import { FondDegrade } from "../../ui/Degrade";
import { useDegrade } from "../../ui/ContextePartie";
import { Feuille } from "../../ui/Feuille";
import { useClavier } from "../../ui/useClavier";
import { Icone, type NomIcone } from "../../ui/Icone";
import { RoueDuree } from "../../ui/RoueDuree";
import { Texte } from "../../ui/Texte";
import { minuscule, t, tp } from "../../i18n/index";
import { approx as approche, nombre } from "../format";
import { fractionGlyphe } from "../../nutrition/quantite";
import { colonnesGrille, GOUTTIERE } from "./grille";
import { useReduit } from "../../ui/reduit";

// Pièces communes de Nutrition (planche, captures v4) : grille des valeurs (kcal à gauche, puis P · G · L · Suc. en colonnes
// de 59 alignées du résumé au repas et à chaque aliment ; plus étroites si les kcal manquent de place, ./grille.ts), couleur et jauge de chaque valeur, repère de chaque repas, page
// empilée, lignes et champs.

export { COL, COL_SUC, GOUTTIERE } from "./grille";
/**
 * Bord des cartes repas : 16, aligné sur le titre de la page (décision du 28/10, après la planche qui disait 8) ; le
 * résumé part du même bord.
 */
export const MARGE_CARTE = 16;
export const MARGE_ECRAN = 16;
/** Marge des pages empilées : 16 partout (D2 de coherence.md, audit du 28/10 ; la planche disait 20). */
export const MARGE_PAGE = 16;

export const PICTO_REPAS: Record<string, NomIcone> = { petit_dej: "tasse", collation: "pomme", dejeuner: "assiette", gouter: "biscuit", diner: "bol" };

export { nomRepas } from "./nom-repas";
import { nomRepas } from "./nom-repas";
import { useChiffresNutrition, useModeAffichage } from "./mode-affichage";

/** « au déjeuner », « à la collation ». */
export function auRepas(r: Pick<Repas, "cle" | "nom">): string {
  return t(r.cle === "collation" ? "nutrition.alaRepas" : "nutrition.auRepas", { repas: minuscule(nomRepas(r)) });
}

export function useCouleursMacros() {
  const { mode } = useTheme();
  return COULEURS_MACROS[mode];
}

/** Nombre d'unités en fractions : « ¼ », « ½ », « 1 ½ », « 2 » ; hors des quarts : décimal. */
export function fraction(v: number): string {
  return fractionGlyphe(v) ?? nombre(v, 1);
}

/** Valeur arrondie à l'entier (kcal, g) ; « ~ » devant une valeur approximative. */
export function valeurTexte(v: number, approx = false, decimales = 0): string {
  return approche(nombre(v, decimales), approx);
}

export const MACROS: { cle: Exclude<CleMacro, "kcal">; court: "nutrition.p" | "nutrition.gl" | "nutrition.l" | "nutrition.suc"; abrege: "nutrition.prot" | "nutrition.gluc" | "nutrition.lip" | "nutrition.suc" }[] = [
  { cle: "proteines", court: "nutrition.p", abrege: "nutrition.prot" },
  { cle: "glucides", court: "nutrition.gl", abrege: "nutrition.gluc" },
  { cle: "lipides", court: "nutrition.l", abrege: "nutrition.lip" },
  { cle: "sucres", court: "nutrition.suc", abrege: "nutrition.suc" },
];

/**
 * Une rangée de la grille : la première cellule prend la place restante, puis P, G, L (59) et Suc. (58), resserrées si la
 * rangée est étroite ou la police grande (les kcal restent entières : ./grille.ts). Les rangées d'une même carte ont la
 * même largeur, donc les mêmes colonnes.
 */
export function Rangee({ cellules, style, alignement = "baseline" }: { cellules: readonly ReactNode[]; style?: StyleProp<ViewStyle>; alignement?: "baseline" | "flex-start" | "center" }) {
  const { fontScale } = useWindowDimensions();
  const [largeur, setLargeur] = useState(0);
  const { col, suc } = colonnesGrille(largeur, Math.min(fontScale, POLICE_MAX));
  return (
    <View onLayout={(e) => setLargeur(Math.round(e.nativeEvent.layout.width))} style={[styles.rangee, { alignItems: alignement }, style]}>
      <View style={styles.premiere}>{cellules[0]}</View>
      {cellules.slice(1).map((c, i) => (
        <View key={i} style={[styles.col, { width: i === 3 ? suc : col }]}>
          {c}
        </View>
      ))}
    </View>
  );
}

/**
 * Valeurs d'un repas ou d'un aliment. Repas : 14 moyen, kcal dans sa couleur, P · G · L en t1, sucres en t2.
 * Aliment : 13 régulier, kcal en t1, P · G · L en t2, sucres en t3. « kcal » en 12 t3 dans les deux cas.
 */
export function LigneValeurs({ m, niveau }: { m: Macros; niveau: "repas" | "aliment" }) {
  const c = useCouleursMacros();
  const { couleurs } = useTheme();
  // D20 : mode sans chiffres, ni kcal ni macros (la ligne disparaît, l'aliment et sa quantité restent).
  const chiffres = useChiffresNutrition();
  if (!chiffres) return null;
  const repas = niveau === "repas";
  const f = { fontFamily: repas ? police.medium : police.regular, fontSize: repas ? 14 : 13 };
  const macro = repas ? couleurs.t1 : couleurs.t2;
  const sucres = repas ? couleurs.t2 : couleurs.t3;
  return (
    <Rangee
      cellules={[
        <Texte key="k" variante="saisie" style={[f, { color: repas ? c.kcal : couleurs.t1 }]} numberOfLines={1}>
          {valeurTexte(m.kcal, m.approx)}
          <Texte variante="meta" couleur="t3">
            {" "}
            {t("nutrition.kcal")}
          </Texte>
        </Texte>,
        ...MACROS.map((x) => (
          <Texte key={x.cle} variante="saisie" style={[f, { color: x.cle === "sucres" ? sucres : macro }, x.cle === "sucres" && { fontFamily: police.regular }]} numberOfLines={1}>
            {valeurTexte(m[x.cle])}
          </Texte>
        )),
      ]}
    />
  );
}

const courbeJauge = Easing.bezier(...courbe.sortie);

/**
 * Vrai pendant qu'une page poussée se referme sur le journal (revue finale n° 56) : les jauges gardent leur part et ne
 * montent qu'à la fin de la transition, quand la page est visible.
 */
export const AttenteJauges = createContext(false);

/**
 * Jauge d'une valeur : piste, puis la part atteinte. Le dégradé de la valeur s'étale sur toute la piste ; la jauge n'en montre
 * que la part atteinte (pleine au-delà de l'objectif). Après un ajout ou un retrait (audit du 28/10, constat 37, O2), la part
 * glisse de l'ancienne à la nouvelle valeur (250 ms, courbe sortie) ; pas au premier rendu ni quand `jour` change (on lit
 * une autre donnée), ni sous « réduire les animations ». Glissé en transform, sans toucher à la mise en page (revue finale
 * n° 61) : une fenêtre de la largeur de la piste recule de ce qui manque, le dégradé avance d'autant et reste en place.
 */
export function Jauge({ cle, valeur, cible, hauteur = 4, jour }: { cle: CleMacro | CleSuivi; valeur: number; cible: number; hauteur?: number; jour?: string }) {
  const { couleurs, mode } = useTheme();
  const [l, setL] = useState(0);
  const largeur = useSharedValue(0);
  const p = progression(valeur, cible);
  const [a, b, c] = cle === "fibres" || cle === "eau" ? DEGRADES_SUIVIS[mode][cle] : DEGRADES_MACROS[mode][cle];
  const reduit = useReduit();
  const attente = useContext(AttenteJauges);
  const part = useSharedValue(p);
  const jourVu = useRef(jour);
  useEffect(() => {
    if (attente) return;
    const autreJour = jourVu.current !== jour;
    jourVu.current = jour;
    part.value = reduit || autreJour ? p : withTiming(p, { duration: duree.saut, easing: courbeJauge });
  }, [p, jour, reduit, part, attente]);
  const fenetre = useAnimatedStyle(() => ({ transform: [{ translateX: (part.value - 1) * largeur.value }] }));
  const degrade = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - part.value) * largeur.value }] }));
  // D20 : pas d'objectif chiffré (sans chiffres, grossesse, moins de 18 ans), pas de jauge vers un objectif.
  const { objectifsVisibles } = useModeAffichage();
  if (!objectifsVisibles) return null;
  return (
    <View
      onLayout={(e) => {
        largeur.value = e.nativeEvent.layout.width;
        setL(e.nativeEvent.layout.width);
      }}
      style={{ height: hauteur, borderRadius: 2, overflow: "hidden", backgroundColor: couleurs.jaugePiste }}
    >
      {l > 0 ? (
        <Animated.View style={[{ width: l, height: hauteur, borderRadius: 2, overflow: "hidden" }, fenetre]}>
          <Animated.View style={[{ width: l, height: hauteur }, degrade]}>
            <FondDegrade
              angle={90}
              arrets={[
                { offset: 0, couleur: a },
                { offset: MILIEU_DEGRADE[mode], couleur: b },
                { offset: 1, couleur: c },
              ]}
            />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Étiquette de quantité d'un aliment (rayon 6) : « 150 g », « 2 pots · 250 g ». */
export function texteQuantite(c: Pick<Consommation, "quantite_g" | "unite" | "nb_unites" | "produit">): string {
  const g = `${nombre(c.quantite_g, c.quantite_g % 1 ? 1 : 0)} ${c.produit.base === "100ml" ? t("nutrition.ml") : t("nutrition.g")}`;
  if (c.unite === "g") return g;
  const p = c.produit.portions.find((x) => x.type === c.unite);
  const nb = nombre(c.nb_unites, c.nb_unites % 1 ? 2 : 0);
  return `${nb} ${libelleUnite(c.unite, p?.libelle)}, ${g}`;
}

export function libelleUnite(u: Unite, libelle?: string | null): string {
  if (u === "g") return t("nutrition.g");
  return libelle && !/^\d/.test(libelle) ? libelle : t(`nutrition.unite.${u}`);
}

/** Repère d'un repas : sur fond blanc (29/10), cerné de la teinte de la partie le jour ; blanc à 10 % la nuit (D3). */
export function PastilleRepas({ cle, couleur }: { cle: string; couleur?: string }) {
  const { couleurs, mode } = useTheme();
  return (
    <View style={[styles.pastille, { backgroundColor: couleurs.pictoRepas }, mode === "jour" && { borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.verreFilet }]}>
      <Icone nom={PICTO_REPAS[cle] ?? "assiette"} couleur={couleur ?? couleurs.t2} taille={20} />
    </View>
  );
}

/** Case à cocher de la planche : 24, rayon 7, bord 1,5 ; cochée, pleine du vert Nutrition. Zone de 44. */
export function CaseCocher({ coche, onPress, libelle }: { coche: boolean; onPress: () => void; libelle: string }) {
  const { couleurs, mode } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: coche }} accessibilityLabel={libelle} onPress={onPress} style={styles.zoneCase}>
      <View style={[styles.case, coche ? { backgroundColor: couleurs.partieNutrition } : { borderWidth: 1.5, borderColor: couleurs.line2 }]}>
        {coche ? <Icone nom="check" couleur={mode === "nuit" ? "#000" : "#fff"} taille={16} epaisseur={2.5} /> : null}
      </View>
    </Pressable>
  );
}

export const energieDe = (p: Produit) => energiePour100(p.nutriments);

/** Libellé du bouton plein avec son complément régulier : « Ajouter 2 · 244 kcal ». */
export function LibellePrincipal({ libelle, complement }: { libelle: string; complement?: string }) {
  const d = useDegrade();
  return (
    <Texte variante="exercice" numberOfLines={1} style={{ color: d.sur }}>
      {libelle}
      {complement ? <Texte variante="corps" style={{ color: d.sur, fontSize: 15, opacity: 0.9 }}>{`, ${complement}`}</Texte> : null}
    </Texte>
  );
}

// ---- Pages -----------------------------------------------------------------------------------------------------------

/**
 * Page empilée de Nutrition : barre du haut (←, titre 15 semi-gras et son complément t3), contenu à 16 du bord, pied fixé
 * (le bouton plein) sur un fondu. Le clavier pousse la page (bord à bord : la fenêtre ne se redimensionne plus d'elle-même).
 */
export function PageNutrition({
  titre,
  complement,
  droite,
  pied,
  children,
  defile = true,
  onScroll,
}: {
  titre: string;
  complement?: string;
  droite?: ReactNode;
  pied?: ReactNode;
  children: ReactNode;
  defile?: boolean;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}) {
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const clavier = useClavier();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut
        titre={
          complement ? (
            <>
              {titre}
              <Texte variante="corps" couleur="t3" style={{ fontSize: 13 }}>
                {"  "}
                {complement}
              </Texte>
            </>
          ) : (
            titre
          )
        }
      >
        {droite}
      </BarreHaut>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        {defile ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: MARGE_PAGE, paddingBottom: pied ? 112 + bas : espace.xxl + bas }}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: MARGE_PAGE }}>{children}</View>
        )}
        {pied && !clavier ? <Pied>{pied}</Pied> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Pied d'une page : le bouton plein sur un fondu vers le fond (plein au tiers). */
export function Pied({ children }: { children: ReactNode }) {
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  return (
    <View pointerEvents="box-none" style={[styles.pied, { paddingBottom: bas + espace.m }]}>
      <FondDegrade angle={180} arrets={[{ offset: 0, couleur: couleurs.bg, opacite: 0 }, { offset: 0.2, couleur: couleurs.bg, opacite: 1 }]} />
      {children}
    </View>
  );
}

/** En-tête de groupe (11, majuscules, t3), avec une icône facultative et un contenu à droite. */
export function Entete({ children, icone, droite, style }: { children: string; icone?: NomIcone; droite?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.entete, style]}>
      {icone ? <Icone nom={icone} couleur={couleurs.t3} taille={14} /> : null}
      <Texte variante={icone ? "meta" : "entete"} couleur="t3" style={{ flex: 1 }}>
        {children}
      </Texte>
      {droite}
    </View>
  );
}

/** Ligne de page à filet (planche `.row`) : icône, libellé et sous-ligne, valeur t2, chevron ; 56 de haut. */
export function LigneFilet({
  avant,
  icone,
  libelle,
  sous,
  valeur,
  chevron = true,
  onPress,
  droite,
  hauteur = 56,
  sousLignes = 1,
  filet = true,
}: {
  /** Devant l'icône et le libellé : l'heure d'un ajout d'eau. */
  avant?: ReactNode;
  icone?: NomIcone;
  libelle: string;
  sous?: string;
  /** Lignes du sous-titre (une phrase entière, une incohérence). */
  sousLignes?: number;
  valeur?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  droite?: ReactNode;
  hauteur?: number;
  /** Filet du bas (sans : une jauge ou une note suit la ligne, planche macros). */
  filet?: boolean;
}) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.ligneFilet, { minHeight: hauteur, borderBottomColor: couleurs.line }, !filet && { borderBottomWidth: 0 }, pressed && { backgroundColor: couleurs.s1 }]}
    >
      {avant}
      {icone ? <Icone nom={icone} couleur={couleurs.t3} taille={20} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="corps" style={{ fontSize: 16, color: couleurs.t1 }} numberOfLines={1}>
          {libelle}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }} numberOfLines={sousLignes}>
            {sous}
          </Texte>
        ) : null}
      </View>
      {typeof valeur === "string" ? (
        <Texte variante="corps" couleur="t2" style={{ fontSize: 16 }} numberOfLines={1}>
          {valeur}
        </Texte>
      ) : (
        valeur
      )}
      {droite}
      {chevron && onPress ? <Icone nom="right" couleur={couleurs.t3} taille={16} /> : null}
    </Pressable>
  );
}

/**
 * Toute saisie de la Nutrition : le cadre (`cadre`, avec ce qui l'entoure : icône `avant`, unité `apres`) et son liseré vert
 * de focus (planche plats, `.champ.focus` : 1,5 dp à l'intérieur, vert de la partie), posé par-dessus sans rien décaler.
 */
export function SaisieNutrition({ cadre, avant, apres, style, onFocus, onBlur, ...p }: { cadre: StyleProp<ViewStyle>; avant?: ReactNode; apres?: ReactNode } & TextInputProps) {
  const { couleurs } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={cadre}>
      {avant}
      <TextInput
        maxFontSizeMultiplier={POLICE_MAX}
        placeholderTextColor={couleurs.t3}
        selectionColor={couleurs.partieNutrition}
        cursorColor={couleurs.partieNutrition}
        {...p}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={style}
      />
      {apres}
      {focus ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.focus, { borderRadius: StyleSheet.flatten(cadre)?.borderRadius ?? rayon.l, borderColor: couleurs.partieNutrition }]} /> : null}
    </View>
  );
}

/** Champ de recherche ou de saisie (planche `.champ`) : 52 de haut, rayon 12, fond s1, icône t3. */
export function ChampTexte({ icone, style, dansFeuille, ...p }: { icone?: NomIcone; style?: StyleProp<ViewStyle>; dansFeuille?: boolean } & TextInputProps) {
  const { couleurs } = useTheme();
  return (
    <SaisieNutrition
      cadre={[styles.champ, { backgroundColor: dansFeuille ? couleurs.feuilleGroupe : couleurs.s1 }, style]}
      avant={icone ? <Icone nom={icone} couleur={couleurs.t3} taille={20} /> : null}
      {...p}
      style={[styles.saisie, { color: couleurs.t1 }]}
    />
  );
}

/** Bouton tonal (planche `.ton`, `.ajt`) : le bouton commun de l'appli (revue finale n° 7), gardé ici pour ses appelants. */
export { BoutonTonal } from "../../ui/BoutonTonal";

/** Cadre en pointillé (planche `.vide`) : « + Nouveau produit », « + Ajouter un repas ». */
export function CadreVide({ libelle, onPress, style }: { libelle: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.vide, { borderColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s1 }, style]}
    >
      <Icone nom="plus" couleur={couleurs.t2} taille={18} />
      <Texte variante="saisie" couleur="t2" style={{ fontSize: 14 }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

/** Feuille d'une valeur numérique : une roue, « Valider » en pied. Fermer sans valider ne change rien. */
export function FeuilleRoue({
  visible, titre, sous, valeur, valeurs, texte, lue, unite, onFermer, onValider, enPlus,
}: {
  visible: boolean;
  titre: string;
  sous?: string;
  valeur: number;
  valeurs: number[];
  texte: (v: number) => string;
  lue?: (v: number) => string;
  /** Unité posée à droite de la valeur, dans la bande centrale (« g », « L »). */
  unite?: string;
  onFermer: () => void;
  onValider: (v: number) => void;
  /** Contenu sous la roue. */
  enPlus?: ReactNode;
}) {
  const [brouillon, setBrouillon] = useState(valeur);
  useEffect(() => {
    if (visible) setBrouillon(valeur);
  }, [visible, valeur]);
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titre} sousTitre={sous} glisserContenu={false} pied={<Bouton libelle={t("ui.valider")} variante="primaire" large onPress={() => onValider(brouillon)} />}>
      <RoueDuree
        key={visible ? "ouverte" : "fermee"}
        libelle={titre}
        valeur={valeur}
        valeurs={valeurs}
        onChange={setBrouillon}
        traits={false}
        decoupe={(v) => ({ attenue: "", plein: texte(v) })}
        lue={lue ?? texte}
        unite={unite}
      />
      {enPlus}
    </Feuille>
  );
}

/** Valeurs d'une roue : de `min` à `max` par pas de `pas`. */
export function plage(min: number, max: number, pas: number): number[] {
  const v: number[] = [];
  for (let i = 0; min + i * pas <= max + 1e-9; i++) v.push(Math.round((min + i * pas) * 1000) / 1000);
  return v;
}

export { tp };

const styles = StyleSheet.create({
  rangee: { flexDirection: "row" },
  premiere: { flex: 1, minWidth: 0 },
  col: { marginLeft: GOUTTIERE, alignItems: "flex-end" },
  pastille: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  zoneCase: { width: 44, height: 44, marginRight: -10, alignItems: "center", justifyContent: "center" },
  case: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  pied: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: MARGE_ECRAN, paddingTop: 28 },
  entete: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: espace.xl, marginBottom: espace.xs },
  ligneFilet: { flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  champ: { minHeight: 52, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: espace.l },
  saisie: { flex: 1, padding: 0, margin: 0, fontFamily: police.medium, fontSize: 16 },
  focus: { borderWidth: 1.5 },
  vide: { minHeight: 56, borderRadius: rayon.l, borderWidth: 1, borderStyle: "dashed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
});

// ---- Pièces du lot 1, encore utilisées par les écrans pas encore repris -------------------------------------------------

/** Ligne d'un produit : nom, marque et énergie pour 100, puis ce qu'on met à droite. */
export function LigneProduit({ p, droite, onPress, detail }: { p: Produit; droite?: ReactNode; onPress: () => void; detail?: string }) {
  const { couleurs } = useTheme();
  const chiffres = useChiffresNutrition();
  const e = energieDe(p);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [stylesLot1.produit, { backgroundColor: pressed ? couleurs.s3 : "transparent" }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="saisie" numberOfLines={1} style={{ fontFamily: "Inter-Regular", fontSize: 15 }}>
          {p.nom}
        </Texte>
        <Texte variante="meta" couleur="t3" numberOfLines={1}>
          {detail ?? [p.marque, chiffres && `${valeurTexte(e.kcal, e.approx)} ${t("nutrition.kcal")} / ${t(p.base === "100ml" ? "nutrition.100ml" : "nutrition.100g")}`].filter(Boolean).join(", ")}
        </Texte>
      </View>
      {droite}
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

/** Ligne de réglage : icône, libellé, valeur à droite, chevron ; toucher = ouvrir sa roue. */
export function LigneReglage({ icone, libelle, valeur, onPress, premier }: { icone?: NomIcone; libelle: string; valeur?: string; onPress: () => void; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [stylesLot1.reglage, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      {icone ? <Icone nom={icone} couleur={couleurs.t2} taille={22} /> : null}
      <Texte variante="saisie" style={{ flex: 1, fontFamily: "Inter-Regular", fontSize: 15 }}>
        {libelle}
      </Texte>
      {valeur ? (
        <Texte variante="saisie" couleur="t2" style={{ fontFamily: "Inter-Regular", fontSize: 15 }}>
          {valeur}
        </Texte>
      ) : null}
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

/** Groupe de lignes sur fond s1, rayon 12. */
export function GroupeLignes({ children }: { children: ReactNode }) {
  const { couleurs } = useTheme();
  return <View style={{ backgroundColor: couleurs.s1, borderRadius: rayon.l, overflow: "hidden", marginTop: espace.m }}>{children}</View>;
}

const stylesLot1 = StyleSheet.create({
  reglage: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  produit: { minHeight: 56, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: 4 },
});

/** Hauteur de la première ligne du résumé (« Gluc. 848 ») : la même pour les cinq colonnes, resserrées ou non. */
export const LIGNE_RESUME = 20;

/**
 * Une case du résumé : « P 87 » (lettre 11 dans la couleur de la macro, comme le bandeau collé, à gauche de la valeur 15 en t1),
 * « / 175 g » 12 t3, jauge 4. Le bloc « Il reste » la réutilise : sans lettre pour les kcal, `texte` à la place de la valeur
 * (« Objectif atteint ») et `etiquette` pour le lecteur d'écran.
 */
export function CelluleResume({ jour, cle, libelle, lettre, valeur, approx, cible, unite, texte, etiquette }: { jour: string; cle: CleMacro; libelle: string; lettre: string; valeur: number; approx?: boolean; cible: number | null; unite: string; texte?: string; etiquette?: string }) {
  const c = useCouleursMacros();
  const { couleurs } = useTheme();
  const { fontScale } = useWindowDimensions();
  const gauche = cle === "kcal";
  const affiche = texte ?? valeurTexte(valeur, approx);
  return (
    <View style={{ alignSelf: "stretch", alignItems: gauche ? "flex-start" : "flex-end", gap: 3 }}>
      {/* Ligne de hauteur fixe (31/10 : « Gluc. 848 » resserré remontait sa ligne et sa jauge de 3 px) : le texte
          resserré pour tenir dans sa colonne se pose en bas, sur la même ligne de base que ses voisins. */}
      <View style={{ height: LIGNE_RESUME * Math.min(fontScale, POLICE_MAX), justifyContent: "flex-end" }}>
        <Texte accessibilityLabel={etiquette ?? `${libelle} ${affiche}`} variante="meta" couleur="t2" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 11, lineHeight: LIGNE_RESUME }}>
          {lettre ? (
            <Texte variante="entete" style={{ fontSize: 11, lineHeight: LIGNE_RESUME, color: c[cle], textTransform: "none", letterSpacing: 0 }}>
              {lettre}
            </Texte>
          ) : null}
          <Texte variante="saisie" style={{ fontSize: 15, lineHeight: LIGNE_RESUME, color: couleurs.t1 }}>
            {lettre ? " " : ""}
            {affiche}
          </Texte>
        </Texte>
      </View>
      {cible != null ? (
        <>
          <Texte variante="meta" couleur="t3" numberOfLines={1}>
            {`/ ${nombre(cible, 0)} ${unite}`}
          </Texte>
          <View style={{ alignSelf: "stretch", marginTop: 5 }}>
            <Jauge jour={jour} cle={cle} valeur={valeur} cible={cible} />
          </View>
        </>
      ) : unite ? (
        // sans objectif (grossesse, moins de 18 ans) : l'unité seule sous le total
        <Texte variante="meta" couleur="t3" numberOfLines={1}>
          {unite}
        </Texte>
      ) : null}
    </View>
  );
}
