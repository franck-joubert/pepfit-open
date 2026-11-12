import { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect } from "react-native-svg";
import { avantChangementComete, cadenceComete, decalageComete, perimetre, type CadenceComete, type DonneesBandeau } from "../ecrans/bandeau-seance";
import { ThemeInverse, useTheme } from "../theme";
import { axeDegrade, degrades, ombreBandeau } from "../theme/effets";
import { espace, rayon } from "../theme/typo";
import { formaterDuree } from "./BarreRepos";
import { ChronoSeance } from "./ChronoSeance";
import { arretsSvg, useIdSvg } from "./Degrade";
import { Icone } from "./Icone";
import { Appui, courbes } from "./mouvement";
import { comete } from "../theme/mouvement";
import { ecouterReveilAura, inactiviteAura } from "./aura-etat";
import { Texte } from "./Texte";
import { useMinuteur } from "./useMinuteur";
import { noterAppui } from "./mesure-transition";
import { t } from "../i18n/index";
import { useReduit } from "./reduit";
import { suivi } from "../natif/suivi";
import { chronoTexte, distanceTexte } from "../ecrans/suivi-direct-vue";
import { libelleDistance } from "../ecrans/unites";

// Barre « séance en cours » flottante, au-dessus du menu : bordure de 2 px en dégradé CTA, où une comète fait le tour
// de la carte en 1 s (au rythme de l'aura : plus lente puis fixe sans geste) ; pendant un repos, seul le côté droit change (« Repos » et le décompte). Le reste de la carte rouvre la séance,
// la poubelle propose d'abandonner (même alerte que la fin de séance, posée par la couche : CoucheBulle).
// Suivi GPS en cours (retour du 29/10) : la même bulle, le chrono et la distance du service en direct ; elle rouvre
// l'écran de la course.

const EPAISSEUR = 2;
const R = rayon.l - EPAISSEUR / 2;
const COUCHES = 8;
const COMETE = 0.22;
const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface Trait {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

function Queue({ i, total, p, trait, gradient }: { i: number; total: number; p: { value: number }; trait: Trait; gradient: string }) {
  const longueur = total * COMETE * (1 - i / COUCHES);
  const anime = useAnimatedProps(() => ({ strokeDashoffset: decalageComete(longueur, p.value, total) }));
  return (
    <AnimatedRect
      {...trait}
      fill="none"
      stroke={gradient}
      strokeOpacity={0.2}
      strokeWidth={EPAISSEUR}
      strokeLinecap="round"
      strokeDasharray={[longueur, total - longueur]}
      animatedProps={anime}
    />
  );
}

/**
 * Bordure : piste, comète, trait plein. Cadence de l'aura (D1) : un tour par seconde après un geste, un tour toutes les 4 s
 * après 6 s sans geste (entre deux tours, la comète est posée : aucune image), trait plein en fondu après 14 s ; un geste la
 * relance du point où elle est. Mouvement réduit : trait plein seul.
 */
function Bordure({ l, h }: { l: number; h: number }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const id = useIdSvg("bandeau");
  const p = useSharedValue(0);
  const plein = useSharedValue(reduit ? 1 : 0);

  useEffect(() => {
    let etat: CadenceComete | null = null;
    let changement: ReturnType<typeof setTimeout> | undefined;
    let tourSuivant: ReturnType<typeof setTimeout> | undefined;
    const tour = { duration: comete.tour, easing: Easing.linear };
    // Finit le tour en cours à la même vitesse (pas de saut), puis `ensuite`.
    const finirTour = () => withTiming(1, { duration: Math.max(0, (1 - (p.value % 1)) * comete.tour), easing: Easing.linear });
    const passer = (c: CadenceComete) => {
      if (c === etat) return;
      etat = c;
      clearTimeout(tourSuivant);
      cancelAnimation(p);
      if (c === "pleine") {
        plein.value = withTiming(0, { duration: comete.fondu, easing: courbes.sortie });
        p.value = withSequence(finirTour(), withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, tour)), -1, false));
      } else if (c === "repos") {
        p.value = finirTour();
        const relancer = () => {
          p.value = 0;
          p.value = withTiming(1, tour);
          tourSuivant = setTimeout(relancer, comete.periodeRepos);
        };
        tourSuivant = setTimeout(relancer, comete.periodeRepos);
      } else {
        plein.value = reduit ? 1 : withTiming(1, { duration: comete.fondu, easing: courbes.sortie });
      }
    };
    const regler = () => {
      const inactif = inactiviteAura();
      passer(cadenceComete(inactif, reduit));
      clearTimeout(changement);
      const reste = avantChangementComete(inactif, reduit);
      if (reste != null) changement = setTimeout(regler, reste + 16);
    };
    regler();
    const arreter = ecouterReveilAura(regler);
    return () => {
      arreter();
      clearTimeout(changement);
      clearTimeout(tourSuivant);
      cancelAnimation(p);
      cancelAnimation(plein);
    };
  }, [reduit, p, plein]);

  const opacitePlein = useAnimatedProps(() => ({ strokeOpacity: plein.value }));

  if (!l || !h) return null;
  const trait: Trait = { x: EPAISSEUR / 2, y: EPAISSEUR / 2, width: l - EPAISSEUR, height: h - EPAISSEUR, rx: R };
  const total = perimetre(trait.width, trait.height, R);
  const a = axeDegrade(135, l, h);
  const gradient = `url(#${id})`;
  return (
    <Svg width={l} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={a.x1 * l} y1={a.y1 * h} x2={a.x2 * l} y2={a.y2 * h}>
          {arretsSvg(degrades.entrainement.arrets)}
        </LinearGradient>
      </Defs>
      <Rect {...trait} fill="none" stroke={couleurs.reposPiste} strokeWidth={EPAISSEUR} />
      {reduit ? null : Array.from({ length: COUCHES }, (_, i) => <Queue key={i} i={i} total={total} p={p} trait={trait} gradient={gradient} />)}
      <AnimatedRect {...trait} fill="none" stroke={gradient} strokeWidth={EPAISSEUR} animatedProps={opacitePlein} />
    </Svg>
  );
}

// La bulle est dans le thème opposé à l'écran (retour du 27/10) ; son ombre suit l'écran.
export function BandeauSeance(props: { donnees: DonneesBandeau; onPoubelle: () => void }) {
  const { mode } = useTheme();
  return (
    <ThemeInverse>
      <Bulle {...props} ombre={ombreBandeau[mode]} />
    </ThemeInverse>
  );
}

/** Temps et distance du suivi en cours, à chaque instantané du service (environ 1 Hz). */
function useSuiviDirect(actif: boolean): { tempsMs: number; distanceM: number } | null {
  const [e, setE] = useState<{ tempsMs: number; distanceM: number } | null>(null);
  useEffect(() => {
    if (!actif) return;
    suivi
      .etat()
      .then((x) => x && setE({ tempsMs: x.tempsMs, distanceM: x.distanceM }))
      .catch(() => {});
    return suivi.ecouter((x) => setE({ tempsMs: x.tempsMs, distanceM: x.distanceM }));
  }, [actif]);
  return e;
}

function Bulle({ donnees, onPoubelle, ombre }: { donnees: DonneesBandeau; onPoubelle: () => void; ombre: string }) {
  const { couleurs } = useTheme();
  const direct = useSuiviDirect(donnees.suivi != null);
  // Le routeur de cette racine React, pas le routeur global : après une recréation de l'activité, l'ancienne racine le
  // délie en se démontant (« The imperative router is unavailable… » au toucher de la bulle, plantage).
  const routeur = useRouter();
  const minuteur = useMinuteur();
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const repos = minuteur.actif ? { restantS: minuteur.restantS, totalS: minuteur.totalS } : null;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTaille((t) => (t.l === width && t.h === height ? t : { l: width, h: height }));
  };
  return (
    <View onLayout={onLayout} style={[styles.carte, { backgroundColor: couleurs.s1, boxShadow: ombre }]}>
      <Bordure l={taille.l} h={taille.h} />
      <Appui
        accessibilityRole="button"
        accessibilityLabel={t("seance.bandeau.reprendre", { titre: donnees.titre })}
        onPress={() => {
          noterAppui();
          routeur.push(donnees.suivi ? "/suivi/direct" : { pathname: "/session", params: { reprise: "1" } });
        }}
        style={styles.zone}
      >
        <View style={{ flex: 1 }}>
          <Texte variante="exercice" numberOfLines={1} style={{ fontSize: 14 }}>
            {donnees.titre}
          </Texte>
          {/* En séance : « Séance en cours » ; en repos : l'exercice en cours (retour du B3). */}
          <Texte variante="meta" couleur="t3" numberOfLines={1}>
            {donnees.suivi?.gps && direct
              ? `${distanceTexte(direct.distanceM)} ${libelleDistance()}`
              : repos
                ? (donnees.exercice ?? t("seance.bandeau.enCours"))
                : t("seance.bandeau.enCours")}
          </Texte>
        </View>
        <View style={styles.droite}>
          {repos ? (
            <Texte variante="meta" couleur="t3" style={{ fontSize: 11, lineHeight: 12 }}>
              {t("seance.bandeau.repos")}
            </Texte>
          ) : null}
          <Texte
            variante="titreBarre"
            accessibilityRole="timer"
            style={{ lineHeight: 20, fontVariant: ["tabular-nums"], includeFontPadding: false, textAlignVertical: "center" }}
         >
            {donnees.suivi && direct ? chronoTexte(direct.tempsMs) : repos ? formaterDuree(repos.restantS) : <ChronoSeance c={donnees.chrono} />}
          </Texte>
        </View>
      </Appui>
      <Appui accessibilityRole="button" accessibilityLabel={t("seance.fin.abandonner")} onPress={onPoubelle} style={styles.poubelle}>
        <Icone nom="trash" couleur={couleurs.rate} taille={20} />
      </Appui>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { marginHorizontal: espace.l, marginBottom: espace.s, minHeight: 56, borderRadius: rayon.l, flexDirection: "row", alignItems: "center" },
  zone: { flex: 1, minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingLeft: espace.l },
  droite: { alignItems: "flex-end", justifyContent: "center" },
  poubelle: { width: 44, height: 44, marginRight: espace.xs, alignItems: "center", justifyContent: "center" },
});
