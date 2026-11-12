// Briques communes des pages empilées (circuits, lieux, activité) : voile de l'accent, puces, lignes et groupes sur une carte,
// états vides, champ de saisie, message bref et la page elle-même.
import { useEffect, useState, type ReactNode, type Ref } from "react";
import { BackHandler, Pressable, type ScrollViewInstance, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import Animated from "react-native-reanimated";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { avecOpacite } from "../theme/teintes";
import { espace, police } from "../theme/typo";
import { Actualiser, sansEtirement } from "../ui/Actualiser";
import { AuraFond } from "../ui/AuraFond";
import { useDefilementAura } from "../ui/aura-etat";
import { useIdSvg } from "../ui/Degrade";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { BarreHaut } from "../ui/Cadre";
import { useCouleurPartie, useOmbreCarte } from "../ui/ContextePartie";
import { Icone, type NomIcone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { LARGEUR_CONTENU } from "../ui/largeur";
import { useMargeMenu } from "../ui/MenuFlottant";
import { effacerBref, useBref } from "./bref";

/** Carte de verre (fond, filet et ombre de la partie). */
export function Carte({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  const ombre = useOmbreCarte();
  return <View style={[styles.carte, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet, boxShadow: ombre }, style]}>{children}</View>;
}

/** Voile de l'accent (fond des puces, des avatars de cercle) : 10 % le jour, 16 % la nuit (planche : --accVoile). */
export function useVoileAcc() {
  const { mode } = useTheme();
  const acc = useCouleurPartie();
  return avecOpacite(acc, mode === "nuit" ? 0.16 : 0.1);
}

/** Pastille de texte (rôle, état) : filet par défaut, `acc` sur le voile de l'accent, `officiel` en bleu. */
export function Puce({ libelle, icone, ton = "filet" }: { libelle: string; icone?: NomIcone; ton?: "filet" | "acc" | "officiel" | "plein" }) {
  const { couleurs, mode } = useTheme();
  const acc = useCouleurPartie();
  const voile = useVoileAcc();
  const c = ton === "acc" ? acc : ton === "officiel" ? couleurs.info : couleurs.t2;
  const fond = ton === "acc" ? voile : ton === "officiel" ? avecOpacite(couleurs.info, mode === "nuit" ? 0.16 : 0.05) : ton === "plein" ? couleurs.s2 : "transparent";
  const bord = ton === "acc" ? avecOpacite(acc, mode === "nuit" ? 0.45 : 0.36) : ton === "plein" ? "transparent" : couleurs.line2;
  return (
    <View style={[styles.puce, { backgroundColor: fond, borderColor: bord }]}>
      {icone ? <Icone nom={icone} couleur={c} taille={13} epaisseur={2} /> : null}
      <Texte variante="meta" style={{ color: c, fontFamily: police.medium }} numberOfLines={1}>
        {libelle}
      </Texte>
    </View>
  );
}

export function TitreGroupe({ texte, droite, premier = false, haut }: { texte: string; droite?: string; premier?: boolean; haut?: number }) {
  return (
    <View style={[styles.titreGroupe, haut !== undefined && { marginTop: haut }, premier && { marginTop: espace.s }]}>
      <Texte variante="corps" couleur="t2" accessibilityRole="header" style={{ fontFamily: police.semibold, flex: 1 }}>
        {texte}
      </Texte>
      {droite ? (
        <Texte variante="meta" couleur="t3" style={{ fontFamily: police.medium }}>
          {droite}
        </Texte>
      ) : null}
    </View>
  );
}

/** Groupe de lignes sur une carte (planche : .groupe). */
export function GroupeCarte({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Carte style={[{ marginBottom: 0, overflow: "hidden" }, style]}>{children}</Carte>;
}

/**
 * Une ligne (planche : .ligne) : avatar ou icône ronde, titre 15 medium et sous-ligne 12 t3, puis la fin (valeur, compteur,
 * bouton) et le chevron quand elle s'ouvre.
 */
export function LigneBrique({
  avant,
  icone,
  titre,
  apresTitre,
  sous,
  sousIcone,
  valeur,
  fin,
  onPress,
  chevron,
  premier,
  off,
  danger,
  accessibilityLabel,
}: {
  avant?: ReactNode;
  icone?: NomIcone;
  titre: string;
  apresTitre?: ReactNode;
  sous?: string | null;
  /** Petite icône après la sous-ligne (le cadenas d'un cercle privé, planche S1) ; `accessibilityLabel` dit ce qu'elle veut dire. */
  sousIcone?: NomIcone;
  valeur?: string;
  fin?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  premier?: boolean;
  off?: boolean;
  /** Geste qui détruit (Exclure, Bannir) : titre rouge. */
  danger?: boolean;
  accessibilityLabel?: string;
}) {
  const { couleurs } = useTheme();
  const acc = useCouleurPartie();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }, pressed && { backgroundColor: couleurs.s2 }]}
    >
      {avant ?? (icone ? (
        <View style={[styles.ic, { backgroundColor: couleurs.s2 }]}>
          <Icone nom={icone} couleur={acc} taille={18} />
        </View>
      ) : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titreLigne}>
          <Texte variante="saisie" numberOfLines={1} style={[styles.ligneTitre, off && { color: couleurs.t3 }, danger && { color: couleurs.rate }]}>
            {titre}
          </Texte>
          {apresTitre}
        </View>
        {sous ? (
          <View style={styles.sousLigne}>
            <Texte variante="meta" couleur="t3" numberOfLines={2} style={{ flexShrink: 1 }}>
              {sous}
            </Texte>
            {sousIcone ? <Icone nom={sousIcone} couleur={couleurs.t3} taille={13} /> : null}
          </View>
        ) : null}
      </View>
      {valeur ? (
        <Texte variante="libelle" couleur={off ? "t3" : "t2"} numberOfLines={1}>
          {valeur}
        </Texte>
      ) : null}
      {fin}
      {chevron ?? !!onPress ? <Icone nom="right" couleur={couleurs.t3} taille={16} /> : null}
    </Pressable>
  );
}

/** État vide ou d'erreur (planche : .vide) : rond de l'icône, titre, texte, puis les gestes. */
export function Vide({ icone, titre, texte, children }: { icone: NomIcone; titre: string; texte?: string; children?: ReactNode }) {
  const acc = useCouleurPartie();
  const voile = useVoileAcc();
  return (
    <View style={styles.vide}>
      <View style={[styles.videIc, { backgroundColor: voile }]}>
        <Icone nom={icone} couleur={acc} taille={26} epaisseur={1.6} />
      </View>
      <Texte accessibilityRole="header" style={styles.videTitre}>
        {titre}
      </Texte>
      {texte ? (
        <Texte variante="libelle" couleur="t2" style={styles.videTexte}>
          {texte}
        </Texte>
      ) : null}
      {children}
    </View>
  );
}

/** Le message bref, posé en bas de l'écran. */
export function Bref({ bas = espace.l }: { bas?: number }) {
  const b = useBref();
  const annuler = b?.onAnnuler;
  return b ? (
    <BandeauAnnuler
      key={b.id}
      texte={b.texte}
      coche={b.coche}
      bas={bas}
      lignes={2}
      onAnnuler={
        annuler
          ? () => {
              effacerBref();
              annuler();
            }
          : undefined
      }
    />
  ) : null;
}

/** Champ de saisie (planche : .champ) : 52 de haut, rayon 12, préfixe facultatif (« @ »), loupe facultative. */
/** `serre` : champ de formulaire de feuille (48 de haut, 84 pour le texte long), la hauteur de la planche des lieux. */
/** `anneau` : l'anneau à l'accent tant que le champ a le focus (planche : .champ.focus, la recherche). */
/** `effacer` : la croix qui vide le champ (planche : Nommer un admin), une zone de 44 de large, tant qu'il y a du texte. */
export function Champ({
  prefixe, icone, erreur = false, serre = false, anneau = false, effacer, style, ...reste
}: TextInputProps & { prefixe?: string; icone?: NomIcone; erreur?: boolean; serre?: boolean; anneau?: boolean; effacer?: () => void; style?: StyleProp<ViewStyle> }) {
  const { couleurs, mode } = useTheme();
  const acc = useCouleurPartie();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[styles.champ, { backgroundColor: mode === "nuit" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }, anneau && focus && { borderColor: acc }, erreur && { borderColor: couleurs.rate }, serre && styles.champSerre, style]}>
      {icone ? <Icone nom={icone} couleur={couleurs.t3} taille={18} /> : null}
      {prefixe ? (
        <Texte variante="saisie" couleur="t3" style={{ fontSize: 15, fontFamily: police.regular }}>
          {prefixe}
        </Texte>
      ) : null}
      <TextInput
        placeholderTextColor={couleurs.t3}
        selectionColor={acc}
        cursorColor={acc}
        autoCapitalize="none"
        autoCorrect={false}
        {...reste}
        onFocus={(e) => {
          setFocus(true);
          reste.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          reste.onBlur?.(e);
        }}
        style={[styles.saisie, { color: couleurs.t1 }, reste.multiline && (serre ? styles.saisieSerree : styles.saisieHaute)]}
      />
      {effacer && reste.value ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("aide.effacerRecherche")} onPress={effacer} style={({ pressed }) => [styles.efface, pressed && { opacity: 0.8 }]}>
          <Icone nom="close" couleur={couleurs.t3} taille={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Le fond de la page, de transparent à plein, derrière un pied fixe : la liste s'y fond au lieu d'être coupée net. */
function FonduPied() {
  const { couleurs } = useTheme();
  const id = useIdSvg("fp");
  return (
    <View pointerEvents="none" style={styles.fonduPied}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={couleurs.bg} stopOpacity={0} />
            <Stop offset="0.4" stopColor={couleurs.bg} stopOpacity={0.92} />
            <Stop offset="1" stopColor={couleurs.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Page empilée : aura, barre du haut (← et titre), contenu qui défile à 16 des bords, message bref en bas. `pied` : un geste fixé en bas (Créer le cercle) ; `piedFondu` : le fond de la page se fond sous
 * lui, la liste passe derrière sans le couper.
 */
export function PageBriques({
  titre,
  milieu,
  droite,
  children,
  pied,
  piedFondu = false,
  avantDefilement,
  sousMenu = false,
  auFin,
  defilement,
  bloque = false,
  auGlisse,
  sansRetour = false,
  onRetour,
  actualiser,
  enColonne = false,
  carte,
}: {
  titre?: string;
  /** Un champ de saisie à la place du titre, dans la barre du haut (la recherche, planche S1). */
  milieu?: ReactNode;
  droite?: ReactNode;
  children: ReactNode;
  pied?: ReactNode;
  piedFondu?: boolean;
  avantDefilement?: ReactNode;
  /** Page qui garde le menu du bas : la fin du défilement passe dessus (marge du menu), sans marge basse de zone sûre. */
  sousMenu?: boolean;
  /** Liste sans fin : à l'approche du bas (`seuil` dp avant la fin), la page demande la suite. */
  auFin?: { seuil: number; appeler: () => void };
  /** Pour remonter en haut de la page (avatar d'une publication sur le profil). */
  defilement?: Ref<ScrollViewInstance>;
  /** Pendant l'appui long sur une réaction, le doigt glisse sur la palette : la page ne défile pas. */
  bloque?: boolean;
  /** Le doigt fait défiler la page (ferme la palette des réactions). */
  auGlisse?: () => void;
  /** Page racine : pas de flèche de retour. */
  sansRetour?: boolean;
  /** La flèche (et la touche retour d'Android) fait autre chose que quitter l'écran : refermer une zone de la page (l'historique de la recherche). */
  onRetour?: () => void;
  /** Tirer pour actualiser : relit la page. Sans lui, la page ne se tire pas. */
  actualiser?: () => Promise<unknown>;
  /** Route laissée pleine largeur (ui/largeur.ts) : la barre, l'entête et la liste se posent dans une colonne de 640 dp centrée, le fond reste pleine largeur. */
  enColonne?: boolean;
  /** Un corps plein écran, bord à bord, à la place de la liste qui défile (la vue carte de Découvrir) ; il pose lui-même ses commandes dans la colonne. */
  carte?: ReactNode;
}) {
  const margeMenu = useMargeMenu();
  const { defilement: defile, surDefilement } = useDefilementAura(auFin);
  useEffect(() => {
    if (!onRetour) return;
    const abonnement = BackHandler.addEventListener("hardwareBackPress", () => {
      onRetour();
      return true;
    });
    return () => abonnement.remove();
  }, [onRetour]);
  const liste = (
    <Animated.ScrollView {...(actualiser ? sansEtirement : null)} ref={defilement} keyboardShouldPersistTaps="handled" scrollEnabled={!bloque} onScrollBeginDrag={auGlisse} onScroll={surDefilement} scrollEventThrottle={16} contentContainerStyle={{ paddingHorizontal: espace.l, paddingBottom: sousMenu ? margeMenu : 40 }}>
      {children}
    </Animated.ScrollView>
  );
  const colonne = (contenu: ReactNode, plein = false) => (enColonne ? <View style={plein ? styles.colonnePleine : styles.colonne}>{contenu}</View> : contenu);
  const tete = (
    <>
      <BarreHaut titre={titre} milieu={milieu} sansRetour={sansRetour} onRetour={onRetour}>{droite}</BarreHaut>
      {avantDefilement}
    </>
  );
  return (
    <SafeAreaView edges={sousMenu ? ["top"] : ["top", "bottom"]} style={{ flex: 1 }}>
      <AuraFond partie="fil" fixe defilement={defile} />
      {carte ? (
        <>
          {colonne(tete)}
          <View style={{ flex: 1 }}>{carte}</View>
        </>
      ) : actualiser ? (
        // L'en-tête descend avec la liste (ui/Actualiser).
        <Actualiser defilement={defile} recalculer={actualiser} actif={!bloque}>
          {colonne(tete)}
          {colonne(liste, true)}
        </Actualiser>
      ) : (
        <>
          {colonne(tete)}
          {colonne(liste, true)}
        </>
      )}
      {pied ? (
        <View style={styles.pied}>
          {piedFondu ? <FonduPied /> : null}
          {pied}
        </View>
      ) : null}
      <Bref bas={sousMenu ? margeMenu : pied ? 88 : espace.l} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  carte: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: espace.m },
  colonne: { width: "100%", maxWidth: LARGEUR_CONTENU, alignSelf: "center" },
  colonnePleine: { flex: 1, width: "100%", maxWidth: LARGEUR_CONTENU, alignSelf: "center" },
  puce: { flexDirection: "row", alignItems: "center", gap: 5, height: 24, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, alignSelf: "flex-start" },
  titreGroupe: { flexDirection: "row", alignItems: "baseline", marginTop: 22, marginBottom: espace.s, marginLeft: espace.xs },
  ligne: { flexDirection: "row", alignItems: "center", gap: espace.m, minHeight: 56, paddingVertical: espace.s, paddingLeft: espace.l, paddingRight: espace.m },
  titreLigne: { flexDirection: "row", alignItems: "center", gap: 6 },
  sousLigne: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  ligneTitre: { fontSize: 15, lineHeight: 20, flexShrink: 1 },
  ic: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  vide: { alignItems: "flex-start", paddingTop: espace.xxl, paddingHorizontal: espace.s },
  videIc: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  videTitre: { fontFamily: police.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2, marginBottom: espace.s, maxWidth: 320 },
  videTexte: { lineHeight: 21, marginBottom: 22, maxWidth: 340 },
  champ: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 52, borderRadius: 12, paddingLeft: 14, paddingRight: 6, borderWidth: 1.5, borderColor: "transparent" },
  saisie: { flex: 1, fontFamily: police.regular, fontSize: 15, paddingVertical: 12 },
  efface: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  saisieHaute: { minHeight: 96, textAlignVertical: "top", paddingTop: 14 },
  champSerre: { minHeight: 48 },
  saisieSerree: { minHeight: 84 - 3, textAlignVertical: "top", paddingTop: 12, paddingBottom: 12, fontSize: 14, lineHeight: 20 },
  fonduPied: { position: "absolute", left: 0, right: 0, top: -espace.xl, bottom: 0 },
  pied: { paddingHorizontal: espace.l, paddingTop: espace.s, paddingBottom: espace.l },
});
