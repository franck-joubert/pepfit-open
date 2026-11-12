// Gabarit commun des pages de mesure (planche pas, variante A validée le 28/10, NOTES § 1) : en-tête, semainier et jour
// choisi (EnteteJour.tsx), « quand », chiffre fort et son anneau, bloc propre, statistiques (Statistiques.tsx), liste, sources.
// Mesures de la planche (mesures.css) : quand 13 t2, chiffre 56 light, titre de groupe 11 à 28 du bloc précédent, groupes
// opaques s1 en rayon 12, lignes de 56 au moins. Rose Santé partout ; les pages partagées (Énergie, Pas, Effort) prennent
// la couleur de l'onglet d'origine, ou de leur section (pages-partagees.ts), et le halo marié de leurs deux domaines.
import { AvecPep } from "../../ui/Pep";
import { createContext, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ScrollViewInstance, type StyleProp, type ViewInstance, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { Actualiser, sansEtirement } from "../../ui/Actualiser";
import { AuraFond, HaloPartage } from "../../ui/AuraFond";
import { useDefilementAura } from "../../ui/aura-etat";
import type { PageHalo } from "../../ui/aura-calc";
import { usePartie } from "../../ui/ContextePartie";
import type { Partie } from "../../theme/effets";
import { BoutonPrincipal } from "../../ui/Degrade";
import { BoutonIcone } from "../../ui/Cadre";
import { FondPlein, useMargeColonne } from "../../ui/CadreContenu";
import { Icone, type NomIcone } from "../../ui/Icone";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { revenir } from "../../ui/revenir";
import { Texte } from "../../ui/Texte";
import { fixe } from "../composition-vue";
import { nombre } from "../format";
import { JETON_POINT, type NiveauPoint } from "./niveau-point";

export const MARGE = 16;

// ---- Accent : rose Santé, orange Sport (Effort) -------------------------------------------------------------------------

export type Accent = "sante" | "sport" | "nutrition";

export interface CouleursMesure {
  /** Valeur forte : barre à l'objectif, courbe, anneau. */
  fort: string;
  /** Barre sous l'objectif, pastille de relevé (0,62 / 0,7 après l'audit de contraste). */
  doux: string;
  /** Zone claire d'un rail (facteurs de l'âge). */
  voile: string;
  /** Trait du rythme habituel. */
  habituel: string;
  /** Fond des groupes (s1) : sert au détourage des étiquettes de valeur. */
  groupe: string;
  /** Grille des graphiques. */
  grille: string;
  /** Filet entre deux lignes. */
  sep: string;
}

// Rose ou orange de la mesure, à leurs opacités ; le reste vient des jetons de la page, teintés de sa partie (v2.2.17, revue
// finale n° 6 : plus aucun gris opaque) : groupe = s1, grille et filets = line.
const PALETTE: Record<"nuit" | "jour", Record<Accent, Pick<CouleursMesure, "fort" | "doux" | "voile">> & Pick<CouleursMesure, "habituel">> = {
  nuit: {
    sante: { fort: "#ff4f9a", doux: "rgba(255,79,154,0.7)", voile: "rgba(255,79,154,0.16)" },
    sport: { fort: "#f97316", doux: "rgba(249,115,22,0.62)", voile: "rgba(249,115,22,0.16)" },
    nutrition: { fort: "#1bd8bb", doux: "rgba(27,216,187,0.62)", voile: "rgba(27,216,187,0.16)" },
    habituel: "rgba(255,255,255,0.5)",
  },
  jour: {
    sante: { fort: "#e5178b", doux: "rgba(229,23,139,0.62)", voile: "rgba(229,23,139,0.12)" },
    sport: { fort: "#e8590c", doux: "rgba(232,89,12,0.55)", voile: "rgba(232,89,12,0.12)" },
    nutrition: { fort: "#0ca291", doux: "rgba(12,162,145,0.62)", voile: "rgba(12,162,145,0.12)" },
    habituel: "rgba(0,0,0,0.45)",
  },
};

const ContexteAccent = createContext<Accent>("sante");

/** Partie (aura) d'un accent. */
const PARTIE_ACCENT: Record<Accent, Partie> = { sport: "entrainement", nutrition: "nutrition", sante: "sante" };

/** Accent d'une partie : l'orange pour Sport, le turquoise pour Nutrition, le rose sinon. */
export function accentDe(partie: Partie): Accent {
  return partie === "entrainement" ? "sport" : partie === "nutrition" ? "nutrition" : "sante";
}

/** L'accent d'un écran posé hors de PageMesure (la page agenda de l'Effort : points orange). */
export function AccentMesure({ accent, children }: { accent: Accent; children: ReactNode }) {
  return <ContexteAccent.Provider value={accent}>{children}</ContexteAccent.Provider>;
}

/** Couleurs de la mesure, selon le mode et l'accent de la page. */
export function useMesure(): CouleursMesure {
  const { mode, couleurs } = useTheme();
  const accent = useContext(ContexteAccent);
  const p = PALETTE[mode];
  return { ...p[accent], habituel: p.habituel, groupe: couleurs.s1, grille: couleurs.line, sep: couleurs.line };
}

// ---- Page --------------------------------------------------------------------------------------------------------------

/**
 * Page de mesure : l'aura Santé au repos, l'en-tête (← titre, actions de 44), le contenu qui défile. `defilement` reçoit
 * la vue qui défile (le semainier y amène les statistiques).
 */
export function PageMesure({
  titre,
  actions,
  accent: accentPropre,
  aura = true,
  halo,
  children,
  defilement,
  styleFond,
  styleTete,
  debord = false,
  actualiser = true,
}: {
  titre: string;
  actions?: ReactNode;
  accent?: Accent;
  /** false : le fond uni de Santé, sans aura (Âge pepfit : l'animation Souffle peint son fond, elle se fond dans un uni). */
  aura?: boolean;
  /** Page partagée (Énergie, Pas, Effort) : halo marié de ses deux domaines, accent de la visite (pages-partagees.ts). */
  halo?: PageHalo;
  children: ReactNode;
  defilement?: (v: ScrollViewInstance | null) => void;
  /** Page qui s'anime elle-même (Âge pepfit, modale transparente) : opacité du fond uni et de l'en-tête. */
  styleFond?: ComponentProps<typeof Animated.View>["style"];
  styleTete?: ComponentProps<typeof Animated.View>["style"];
  /**
   * Fold ouvert : le défilement va jusqu'aux bords de l'écran (le contenu reste dans la colonne de 640) ; un bloc peut alors
   * déborder de la colonne (semainier par semaine de l'Âge, BandeSemaines `deborde`). Sans lui, le défilement coupe à la colonne.
   */
  debord?: boolean;
  /** false : pas de « tirer pour actualiser » (réglage ou exercice guidé : Rappel du coucher, Respiration). */
  actualiser?: boolean;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const { defilement: defileAura, surDefilement } = useDefilementAura();
  // page partagée ou page fille : la couleur de la visite (onglet d'origine ou section de rattachement, ContextePartie) ;
  // sinon le rose de Santé
  const partieVisite = usePartie();
  const accent = halo ? accentDe(partieVisite) : (accentPropre ?? accentDe(partieVisite));
  const marges = useSafeAreaInsets();
  const margeColonne = useMargeColonne();
  const deborde = debord && margeColonne > 0;
  const contenu = (
    <>
      {halo ? <HaloPartage page={halo} defilement={defileAura} /> : aura ? <AuraFond partie={PARTIE_ACCENT[accent]} fixe defilement={defileAura} /> : <FondPlein style={[{ backgroundColor: couleurs.fondSante }, styleFond]} />}
      {/* Tirer pour actualiser : l'en-tête descend avec la page ; la marge négative du Fold est sur la zone (les toucher hors de
          la zone n'arriveraient pas au défilement), l'en-tête reprend alors la marge de la colonne. */}
      <Actualiser defilement={defileAura} actif={actualiser} style={deborde ? { marginHorizontal: -margeColonne } : undefined}>
        <Animated.View style={[styles.tete, styleTete, deborde && { marginHorizontal: margeColonne }]}>
          <BoutonIcone nom="back" libelle={t("ui.retour")} onPress={revenir} />
          <Texte variante="titre" accessibilityRole="header" accessibilityLabel={titre} numberOfLines={1} style={styles.titre}>
            <AvecPep texte={titre} />
          </Texte>
          {actions}
        </Animated.View>
        <Animated.ScrollView
          {...sansEtirement}
          ref={defilement}
          onScroll={surDefilement}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 104, paddingHorizontal: deborde ? margeColonne : 0 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </Animated.ScrollView>
      </Actualiser>
    </>
  );
  return (
    <ContexteAccent.Provider value={accent}>
      {/* Page qui s'anime elle-même (Âge pepfit) : marges posées dès la première image. Le SafeAreaView natif les applique
          quelques images après le montage de la modale : la signature, mesurée avant, descendait ensuite de 62 dp et le vol
          partait sous l'âme (vu à l'émulateur). */}
      {styleFond ? (
        <View style={{ flex: 1, paddingTop: marges.top, paddingBottom: marges.bottom }}>{contenu}</View>
      ) : (
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
          {contenu}
        </SafeAreaView>
      )}
    </ContexteAccent.Provider>
  );
}

/** Bouton d'en-tête (cible de l'objectif, +, agenda). */
export function ActionTete({ nom, libelle, onPress }: { nom: NomIcone; libelle: string; onPress: () => void }) {
  return <BoutonIcone nom={nom} libelle={libelle} onPress={onPress} taille={20} />;
}

/** « Aujourd'hui, 28 oct. · Santé Connect 16:38 » : d'où et de quand vient le chiffre. */
export function Quand({ texte }: { texte: string }) {
  return (
    <Texte variante="corps" couleur="t2" style={styles.quand} numberOfLines={2}>
      {texte}
    </Texte>
  );
}

/**
 * Chiffre fort (56 light), son unité (20 light t2) et la ligne qui le situe ; à droite, l'anneau ou rien. `vide` : « Pas de
 * donnée » en 28 t2 à la place du chiffre (un jour sans donnée n'est jamais un zéro).
 */
export function Heros({
  valeur,
  unite,
  sous,
  droite,
  vide,
  serre,
  libelle,
}: {
  valeur: string;
  unite?: string | null;
  sous?: ReactNode;
  droite?: ReactNode;
  vide?: boolean;
  /** Avec `vide` : interligne de 34 au lieu de 62, pour que « Pas de donnée ce jour-là » tienne sur deux lignes à 344 dp. */
  serre?: boolean;
  libelle?: string;
}) {
  return (
    <View style={styles.heros} accessible accessibilityLabel={libelle}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {vide ? (
          <Texte variante="corps" couleur="t2" style={[styles.sansDonnee, serre && { lineHeight: 34 }]}>
            {valeur}
          </Texte>
        ) : (
          <Texte numberOfLines={1} adjustsFontSizeToFit style={styles.chiffre}>
            {valeur}
            {unite ? <Texte couleur="t2" style={styles.uniteForte}>{` ${unite}`}</Texte> : null}
          </Texte>
        )}
        {sous != null ? (
          typeof sous === "string" ? (
            <Texte variante="corps" couleur="t2" style={{ marginTop: 2 }}>
              {sous}
            </Texte>
          ) : (
            sous
          )
        ) : null}
      </View>
      {droite}
    </View>
  );
}

const CercleAnime = Animated.createAnimatedComponent(Circle);
const R_ANNEAU = 40;
const C_ANNEAU = 2 * Math.PI * R_ANNEAU;

/**
 * Anneau fin (6 px, sans texte) : la part de l'objectif, dans `couleur` (celle de la mesure par défaut : les fibres ont leur
 * tilleul) ; au-delà, un second tour fin (2,5 px, t1) par-dessus. Il se remplit
 * à l'ouverture (700 ms, courbe sortie, 80 ms après l'écran) : le seul moment « joué » de la page. Mouvement réduit : fondu.
 */
export function Anneau({ part, taille = 96, couleur }: { part: number; taille?: number; couleur?: string }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const reduit = useReduit();
  const p = useSharedValue(reduit ? 1 : 0);
  const o = useSharedValue(reduit ? 0 : 1);
  useEffect(() => {
    if (reduit) {
      p.value = 1;
      o.value = withTiming(1, { duration: 200, easing: courbes.sortie });
    }
    else p.value = withDelay(80, withTiming(1, { duration: 700, easing: courbes.sortie }));
  }, [reduit, p, o]);
  const t1 = Math.max(0, Math.min(1, part));
  const t2 = Math.max(0, Math.min(1, part - 1));
  const arc1 = useAnimatedProps(() => ({ strokeDashoffset: C_ANNEAU * (1 - t1 * p.value) }));
  const arc2 = useAnimatedProps(() => ({ strokeDashoffset: C_ANNEAU * (1 - t2 * p.value) }));
  const fondu = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={fondu} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={taille} height={taille} viewBox="0 0 96 96">
        <Circle cx={48} cy={48} r={R_ANNEAU} fill="none" stroke={couleurs.s3} strokeWidth={6} />
        {t1 > 0 ? (
          <CercleAnime
            cx={48}
            cy={48}
            r={R_ANNEAU}
            fill="none"
            stroke={couleur ?? m.fort}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${C_ANNEAU} ${C_ANNEAU}`}
            animatedProps={arc1}
            transform="rotate(-90 48 48)"
          />
        ) : null}
        {t2 > 0 ? (
          <CercleAnime
            cx={48}
            cy={48}
            r={R_ANNEAU}
            fill="none"
            stroke={couleurs.t1}
            strokeOpacity={0.85}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${C_ANNEAU} ${C_ANNEAU}`}
            animatedProps={arc2}
            transform="rotate(-90 48 48)"
          />
        ) : null}
      </Svg>
    </Animated.View>
  );
}

/** Trois chiffres sous le chiffre fort (Distance, Calories, Reste), séparés d'un filet. */
export function Trois({ cases }: { cases: readonly { titre: string; valeur: string; unite?: string }[] }) {
  const m = useMesure();
  return (
    <View style={[styles.trois, { borderTopColor: m.sep }]}>
      {cases.map((c, i) => (
        <View key={c.titre} style={[{ flex: 1 }, i > 0 && { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: m.sep }]} accessible accessibilityLabel={`${c.titre} ${c.valeur} ${c.unite ?? ""}`}>
          <Texte variante="meta" couleur="t3">
            {c.titre}
          </Texte>
          <Texte numberOfLines={1} style={styles.troisValeur}>
            {c.valeur}
            {c.unite ? <Texte variante="meta" couleur="t3">{` ${c.unite}`}</Texte> : null}
          </Texte>
        </View>
      ))}
    </View>
  );
}

/** Titre de groupe : 11, majuscules, t3, à 28 du bloc précédent. */
export function TitreGroupe({ children }: { children: string }) {
  return (
    <Texte variante="entete" couleur="t3" accessibilityRole="header" style={styles.titreGroupe}>
      {children}
    </Texte>
  );
}

/** Groupe opaque (s1, rayon 12) ; `bloc` : marges intérieures d'un bloc dessiné (14 16 12). */
export function Groupe({ children, bloc, style }: { children: ReactNode; bloc?: boolean; style?: StyleProp<ViewStyle> }) {
  const m = useMesure();
  return <View style={[styles.groupe, { backgroundColor: m.groupe }, bloc && styles.bloc, style]}>{children}</View>;
}

/** Filet entre deux lignes, en retrait de 16. */
export function Filet() {
  const m = useMesure();
  return <View style={{ height: 1, marginHorizontal: MARGE, backgroundColor: m.sep }} />;
}

/** Lignes d'un groupe séparées par des filets (les valeurs nulles sont sautées). */
export function Lignes({ children }: { children: ReactNode[] }) {
  const l = children.filter((x) => x != null && x !== false);
  return (
    <>
      {l.map((x, i) => (
        <View key={i}>
          {i > 0 ? <Filet /> : null}
          {x}
        </View>
      ))}
    </>
  );
}

/**
 * Ligne de la planche (`.ligne`) : titre 15, sous-titre 12 t3 ; valeur 15 medium et son unité 12 t3, sous-valeur 12 t3 ;
 * chevron si elle s'ouvre. `etat` : valeur d'état d'une source (« Utilisée », 13 t2).
 */
export function LigneMesure({
  titre,
  sous,
  valeur,
  unite,
  sousValeur,
  etat,
  avant,
  onPress,
  libelle,
  haut,
  attenuee,
  fleche = "droite",
  droite,
}: {
  titre: string;
  sous?: string | null;
  valeur?: string | null;
  /** Valeur reprise d'un autre jour (section Tours) : en t2, sans graisse. */
  attenuee?: boolean;
  unite?: string | null;
  sousValeur?: ReactNode;
  etat?: string | null;
  avant?: ReactNode;
  onPress?: () => void;
  libelle?: string;
  /** Aligné en haut (facteurs de l'âge, avec un rail sous le titre). */
  haut?: ReactNode;
  /** Le chevron d'une ligne qui s'ouvre : « bas » ou « haut » pour une liste qui se déplie (« Voir les 3 autres »). */
  fleche?: "droite" | "bas" | "haut";
  /** À droite de la valeur : un interrupteur (la ligne n'est alors pas touchable, c'est lui qui l'est). */
  droite?: ReactNode;
}) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessible={droite != null && !onPress ? false : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={libelle ?? [titre, sous, valeur, unite, typeof sousValeur === "string" ? sousValeur : null, etat].filter(Boolean).join(", ")}
      style={({ pressed }) => [styles.ligne, haut != null && { alignItems: "flex-start", paddingVertical: 12 }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      {avant}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="corps" style={{ fontSize: 15 }}>
          {titre}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {sous}
          </Texte>
        ) : null}
        {haut}
      </View>
      {valeur != null || sousValeur != null || etat ? (
        <View style={{ alignItems: "flex-end", flexShrink: 0, maxWidth: "58%" }}>
          {valeur != null ? (
            <Texte numberOfLines={1} style={[styles.valeurLigne, attenuee && { color: couleurs.t2, fontFamily: police.regular }]}>
              {valeur}
              {unite ? <Texte variante="meta" couleur="t3">{` ${unite}`}</Texte> : null}
            </Texte>
          ) : null}
          {etat ? (
            <Texte variante="corps" couleur="t2" numberOfLines={1}>
              {etat}
            </Texte>
          ) : null}
          {sousValeur != null ? (
            typeof sousValeur === "string" ? (
              <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }} numberOfLines={1}>
                {sousValeur}
              </Texte>
            ) : (
              <View style={{ marginTop: 2 }}>{sousValeur}</View>
            )
          ) : null}
        </View>
      ) : null}
      {droite}
      {onPress ? (
        <View style={{ marginRight: -4, transform: fleche === "haut" ? [{ rotate: "180deg" }] : undefined }}>
          <Icone nom={fleche === "droite" ? "right" : "down"} couleur={couleurs.t3} taille={16} epaisseur={2} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** « Ajouter une pesée » : + rose, libellé en encre (contraste corrigé après l'audit). */
export function LigneAjout({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.s3 }]}>
      <Icone nom="plus" couleur={m.fort} taille={20} />
      <Texte variante="corps" style={{ fontSize: 15, fontFamily: police.medium, flex: 1 }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

/** Écart relatif écrit : flèche + signe + pourcentage, ou « = stable » (jamais la couleur seule). `egal` : autre mot. */
export function Signe({ ecart, egal, seuil = 0.005, couleur }: { ecart: number; egal?: string; seuil?: number; couleur?: string }) {
  const { couleurs } = useTheme();
  const c = couleur ?? couleurs.t2;
  const r = Math.round(ecart * 100);
  if (Math.abs(ecart) < seuil || r === 0)
    return (
      <Texte variante="meta" style={{ color: c, fontFamily: police.medium }}>
        {egal ?? t("mesures.stable")}
      </Texte>
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }} accessible accessibilityLabel={`${r > 0 ? "+" : "−"}${Math.abs(r)} %`}>
      <Icone nom={r > 0 ? "hautFleche" : "basFleche"} couleur={c} taille={12} epaisseur={2.2} />
      <Texte variante="meta" style={{ color: c, fontFamily: police.medium }}>{`${r > 0 ? "+" : "−"}${nombre(Math.abs(r), 0)} %`}</Texte>
    </View>
  );
}

/**
 * Variation d'une mensuration (retour du 30/10, M12) : flèche diagonale devant le nombre, ↗ en hausse (orange),
 * ↘ en baisse (bleu), jamais vert ni rouge (aucun sens n'est pénalisant) ; « = » sans flèche. Le texte garde le signe : la
 * couleur ne porte jamais seule le sens. `suite` : ce qui suit le nombre (« cm depuis le 8 oct. »).
 */
export function Variation({ d, dec = 1, suite = "", couleur = "t3", taille = 12 }: { d: number; dec?: number; suite?: string; couleur?: "t2" | "t3"; taille?: number }) {
  const r = Math.round(d * 10 ** dec);
  const texte = r === 0 ? `=${suite}` : `${r > 0 ? "+" : "−"}${fixe(Math.abs(d), dec)}${suite}`;
  const lu = r === 0 ? `${t("mensurations.stable")}${suite}` : `${t(r > 0 ? "mensurations.hausse" : "mensurations.baisse", { v: fixe(Math.abs(d), dec) })}${suite}`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }} accessible accessibilityLabel={lu}>
      {r !== 0 ? <FlecheVariation d={d} taille={taille} /> : null}
      <Texte variante="meta" couleur={couleur} numberOfLines={1}>
        {texte}
      </Texte>
    </View>
  );
}

/** La flèche seule (devant un chiffre fort : l'évolution des statistiques) ; rien si l'écart est nul. */
export function FlecheVariation({ d, taille = 12 }: { d: number; taille?: number }) {
  const { couleurs } = useTheme();
  if (Math.abs(d) < 1e-9) return null;
  return <Icone nom={d > 0 ? "hausse" : "baisse"} couleur={d > 0 ? couleurs.hausse : couleurs.baisse} taille={taille} epaisseur={taille > 16 ? 2.4 : 2.2} />;
}

/** Légende juste sous un graphique. */
/** `creux` : pastille cerclée (point estimé, page VO2max). */
export type Cle = { libelle: string; trait?: "plein" | "point" | "tiret"; carre?: string; pastille?: boolean; creux?: boolean; couleur?: string };

export function Cles({ cles, style }: { cles: readonly Cle[]; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <View style={[styles.cles, style]}>
      {cles.map((c) => (
        <View key={c.libelle} style={styles.cle}>
          {c.carre ? (
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.carre }} />
          ) : c.creux ? (
            <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 1.75, borderColor: c.couleur ?? m.fort }} />
          ) : c.pastille ? (
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.couleur ?? m.doux }} />
          ) : c.trait === "tiret" ? (
            <View style={{ width: 16, flexDirection: "row", gap: 2 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ width: 2.5, height: 1.5, backgroundColor: couleurs.t2 }} />
              ))}
            </View>
          ) : c.trait === "point" ? (
            <View style={{ width: 16, flexDirection: "row", gap: 2.5, alignItems: "center" }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: c.couleur ?? m.habituel }} />
              ))}
            </View>
          ) : (
            <View style={{ width: 16, height: 2.25, borderRadius: 1, backgroundColor: c.couleur ?? m.fort }} />
          )}
          {/* un libellé plus long que la ligne passe à la ligne, jamais coupé au bord (recette du prévu, 04/11) */}
          <Texte variante="meta" couleur="t2" style={{ flexShrink: 1 }}>
            {c.libelle}
          </Texte>
        </View>
      ))}
    </View>
  );
}

/** Deux chiffres face à face en tête d'un bloc (« +819 pas · ~9 170 »). */
export function Duo({ gauche, droite, style }: { gauche: ReactNode; droite?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.duo, style]}>
      <View style={{ flexShrink: 1 }}>{gauche}</View>
      {droite ? <View style={{ alignItems: "flex-end", flexShrink: 1 }}>{droite}</View> : null}
    </View>
  );
}

/** Valeur d'un duo : 20 semibold (ou medium à droite), unité 13 t2, ligne 12 t3. */
export function ValeurDuo({ valeur, unite, sous, avant, droite }: { valeur: string; unite?: string; sous?: string; avant?: string; droite?: boolean }) {
  return (
    <>
      {avant ? (
        <Texte variante="meta" couleur="t3" style={droite ? { textAlign: "right" } : undefined}>
          {avant}
        </Texte>
      ) : null}
      <Texte numberOfLines={1} style={[styles.duoValeur, droite && { fontFamily: police.medium, textAlign: "right" }]}>
        {valeur}
        {unite ? <Texte variante="corps" couleur="t2">{` ${unite}`}</Texte> : null}
      </Texte>
      {sous ? (
        <Texte variante="meta" couleur="t3" style={[{ marginTop: 1 }, droite && { textAlign: "right" }]}>
          {sous}
        </Texte>
      ) : null}
    </>
  );
}

/** Note de bas de bloc : 12 t3, interligne 18. */
export function Note({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Texte variante="meta" couleur="t3" style={[{ lineHeight: 18, marginTop: 10 }, style]}>
      {children}
    </Texte>
  );
}

/** Rail de comparaison (même échelle) : libellé 112, rail de 8, valeur 64 ; `repere` : trait vertical (repères OMS). */
export function RailCompare({
  libelle,
  part,
  valeur,
  style = "fort",
  repere,
  largeurLibelle = 112,
}: {
  libelle: string;
  part: number;
  valeur: string;
  style?: "fort" | "doux" | "objectif";
  repere?: number;
  largeurLibelle?: number;
}) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <View style={styles.cmp} accessible accessibilityLabel={`${libelle} ${valeur}`}>
      <Texte variante="meta" couleur="t2" style={{ width: largeurLibelle }} numberOfLines={1}>
        {libelle}
      </Texte>
      <View style={{ flex: 1, height: 8, justifyContent: "center" }}>
        <Remplissage
          part={part}
          style={
            style === "objectif"
              ? { borderWidth: 1.25, borderStyle: "dashed", borderColor: couleurs.t2, backgroundColor: "transparent" }
              : { backgroundColor: style === "doux" ? m.doux : m.fort }
          }
        />
        {repere != null ? <View style={[styles.repere, { left: `${Math.max(0, Math.min(1, repere)) * 100}%`, backgroundColor: couleurs.t1 }]} /> : null}
      </View>
      <Texte style={styles.cmpValeur} numberOfLines={1}>
        {valeur}
      </Texte>
    </View>
  );
}

/** Rail centré sur zéro (perte à gauche, gain à droite) : « Ce qui a bougé », groupes de l'âge pepfit. `max` : l'échelle. */
export function RailZero({ valeur, max, largeurLibelle = 104, libelle, texte }: { valeur: number; max: number; largeurLibelle?: number; libelle: string; texte: string }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const part = Math.min(1, Math.abs(valeur) / (max || 1)) / 2;
  return (
    <View style={styles.cmp} accessible accessibilityLabel={`${libelle} ${texte}`}>
      <Texte variante="meta" couleur="t2" style={{ width: largeurLibelle }} numberOfLines={1}>
        {libelle}
      </Texte>
      <View style={{ flex: 1, height: 8 }}>
        <View style={{ position: "absolute", left: "50%", top: -4, bottom: -4, width: 1, backgroundColor: couleurs.line2 }} />
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            borderRadius: 3,
            width: `${part * 100}%`,
            ...(valeur < 0 ? { right: "50%" } : { left: "50%" }),
            backgroundColor: valeur < 0 ? m.fort : m.doux,
          }}
        />
      </View>
      <Texte style={styles.cmpValeur} numberOfLines={1}>
        {texte}
      </Texte>
    </View>
  );
}

/** Barre qui se remplit de gauche à droite à l'ouverture (420 ms, courbe sortie ; mouvement réduit : fondu). */
export function Remplissage({ part, style, hauteur = 8 }: { part: number; style?: StyleProp<ViewStyle>; hauteur?: number }) {
  const reduit = useReduit();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(80, withTiming(1, { duration: reduit ? 200 : 420, easing: courbes.sortie }));
  }, [part, reduit, p]);
  const s = useAnimatedStyle(() => (reduit ? { opacity: p.value } : { transform: [{ scaleX: 0.02 + 0.98 * p.value }] }));
  return (
    <Animated.View
      style={[{ height: hauteur, borderRadius: 3, width: `${Math.max(0, Math.min(1, part)) * 100}%`, transformOrigin: "left" }, style, s]}
    />
  );
}

// ---- Agenda ----------------------------------------------------------------------------------------------------------

/** Point de couleur du jour (VFC, FC au repos, sommeil) : jetons des zones de FC, jamais le rouge d'erreur ; décrit en mots.
 *  Neutre (sans donnée ni référence) : un anneau t3 vide, comme une pastille « prévue » (revue finale n° 46). */
export function PointJour({ niveau, libelle, taille = 10, style }: { niveau: NiveauPoint; libelle?: string; taille?: number; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  const jeton = JETON_POINT[niveau];
  return (
    <View
      accessible
      accessibilityLabel={libelle ?? t(`point.${niveau}` as "point.normal")}
      style={[
        { width: taille, height: taille, borderRadius: taille / 2 },
        jeton ? { backgroundColor: couleurs[jeton] } : { borderWidth: 1.5, borderColor: couleurs.t3 },
        style,
      ]}
    />
  );
}

/** « L », « M »… : initiale du jour de la semaine, dans la langue. */
export function initialeJour(jour: number): string {
  const l = t("mesures.initialesJours").split(",");
  return l[new Date(jour).getDay()] ?? "";
}

// ---- États -------------------------------------------------------------------------------------------------------------

/** Bloc vide dans une page (« Rien n'a été compté », « Pas de score sans Whoop »). */
export function BlocVide({ titre, texte, style }: { titre: string; texte: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Groupe bloc style={[{ marginTop: 24 }, style]}>
      <Texte variante="exercice">{titre}</Texte>
      <Texte variante="corps" couleur="t2" style={{ lineHeight: 20, marginTop: 6 }}>
        {texte}
      </Texte>
    </Groupe>
  );
}

/** Page vide (aucune source, aucune pesée) : icône 44 en couleur de la mesure, titre 20, phrase 15, une action pleine. */
export function PageVide({ icone, titre, texte, action, onAction }: { icone: NomIcone; titre: string; texte: string; action: string; onAction: () => void }) {
  const m = useMesure();
  return (
    <View style={styles.vide}>
      <Icone nom={icone} couleur={m.fort} taille={44} epaisseur={1.5} />
      <Texte variante="titre" style={{ marginTop: 16, textAlign: "center" }}>
        {titre}
      </Texte>
      <Texte variante="corps" couleur="t2" style={{ fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: "center" }}>
        {texte}
      </Texte>
      <BoutonPrincipal libelle={action} onPress={onAction} style={{ marginTop: 20 }} />
    </View>
  );
}

/** Lecture en panne (échec, ou rien en 10 s : useCharge) : à la place du squelette, jamais de chargement sans fin. */
export function EnPanne({ onReessayer, texte }: { onReessayer: () => void; texte?: string }) {
  return <PageVide icone="alerte" titre={t("mesures.panneTitre")} texte={texte ?? t("mesures.panneTexte")} action={t("mesures.reessayer")} onAction={onReessayer} />;
}

const PULSATION_OS = 1400;

/** Squelette à la place exacte d'un chiffre, au filet de la partie : deux pulsations au plus (2 × 1 400 ms, courbe sortie),
 *  puis fixe ; arrêté hors de l'écran (revue finale n° 47). Mouvement réduit : fixe. */
export function Os({ largeur, hauteur, rayon: r = 6, style }: { largeur: number | `${number}%`; hauteur: number; rayon?: number; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const vu = useIsFocused();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduit || !vu) {
      cancelAnimation(o);
      o.value = 1;
      return;
    }
    o.value = withRepeat(withTiming(0.55, { duration: PULSATION_OS, easing: courbes.sortie }), 4, true);
    return () => cancelAnimation(o);
  }, [reduit, vu, o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: largeur, height: hauteur, borderRadius: r, backgroundColor: couleurs.line }, style, s]} />;
}

/** Bouton plein des pages de mesure : le dégradé de la partie, comme partout (revue finale n° 7, D6 : plus d'encre). */
export function BoutonPlein({ libelle, onPress, style }: { libelle: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return <BoutonPrincipal libelle={libelle} onPress={onPress} style={[{ marginTop: 16 }, style]} />;
}

/** Tient la page à défiler jusqu'à une vue (le semainier amène les statistiques sous les yeux). */
export function useDefileVers() {
  const page = useRef<ScrollViewInstance | null>(null);
  const cible = useRef<ViewInstance | null>(null);
  const aller = () => {
    const p = page.current, c = cible.current;
    if (!p || !c) return;
    c.measureLayout(p as unknown as ViewInstance, (_x: number, y: number) => p.scrollTo({ y: Math.max(0, y - 120), animated: true }), () => {});
  };
  return { page: (v: ScrollViewInstance | null) => void (page.current = v), cible: (v: ViewInstance | null) => void (cible.current = v), aller };
}

export const styles = StyleSheet.create({
  tete: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: 6, paddingRight: 8 },
  titre: { flex: 1, marginLeft: 2 },
  // pas de marge négative : le défilement (ou le cadre glissant du jour) rognerait le haut du texte
  quand: { marginHorizontal: MARGE },
  heros: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginHorizontal: MARGE, minHeight: 96, gap: 12 },
  chiffre: { fontFamily: police.light, fontSize: 56, lineHeight: 62, letterSpacing: -1.7, fontVariant: ["tabular-nums"] },
  uniteForte: { fontFamily: police.light, fontSize: 20, letterSpacing: 0 },
  sansDonnee: { fontFamily: police.medium, fontSize: 28, lineHeight: 62, letterSpacing: -0.3 },
  trois: { flexDirection: "row", marginTop: 18, marginHorizontal: MARGE, borderTopWidth: 1, paddingTop: 14 },
  troisValeur: { fontFamily: police.medium, fontSize: 17, marginTop: 3, fontVariant: ["tabular-nums"] },
  titreGroupe: { marginTop: 28, marginHorizontal: MARGE },
  groupe: { borderRadius: rayon.l, marginTop: 8, marginHorizontal: MARGE, overflow: "hidden" },
  bloc: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 12 },
  ligne: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 16 },
  valeurLigne: { fontFamily: police.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  cles: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6, marginTop: 8 },
  cle: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  duo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 },
  duoValeur: { fontFamily: police.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2, fontVariant: ["tabular-nums"] },
  cmp: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 30 },
  cmpValeur: { width: 64, textAlign: "right", fontFamily: police.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
  repere: { position: "absolute", top: -4, bottom: -4, width: 2, marginLeft: -1, borderRadius: 1 },
  vide: { marginTop: 72, marginHorizontal: MARGE, marginBottom: 24, alignItems: "center" },
});
