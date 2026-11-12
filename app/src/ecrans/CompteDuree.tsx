// Grand affichage d'une série en durée en plein écran (planche seance-duree, validée le 29/10) : le compte à rebours est le
// seul élément fort, sous le personnage, son libellé dessous (comme « Durée » du suivi en direct). Orange en marche, vert
// au-delà de la cible (le dépassement compte à part), trait du geste qui se vide. Pendant le repos, son décompte prend la
// place (la barre de repos garde −15, +15 et Passer) : composant à part, seul redessiné à chaque seconde.
// Mouvement (planche, revue finale n° 54) : le chiffre change sans bouger, en fondu de 120 ms ; le trait se vide en continu
// (scaleX sur le fil UI, linéaire). Mouvement réduit : le chiffre seul change, le trait saute.
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { AffichageChrono } from "./chrono-serie";
import { tempsTexte } from "./format";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { police, POLICE_MAX } from "../theme/typo";
import { formaterDuree } from "../ui/BarreRepos";
import { FondDegrade } from "../ui/Degrade";
import { Icone } from "../ui/Icone";
import { courbes } from "../ui/mouvement";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import { useMinuteur } from "../ui/useMinuteur";
import { t } from "../i18n/index";

/** Le chiffre qui change : fondu de 120 ms, sans glissement (comme le décompte du tempo). Sauté en mouvement réduit. */
const entreeChiffre = FadeIn.duration(duree.chiffre).easing(courbes.sortie);
/** Cadence de l'affichage du chrono (useChronoSerie, 250 ms) : le trait rejoint chaque valeur en ligne droite, sans à-coup. */
const PAS_TRAIT = 250;

export function CompteDuree({
  aff,
  cibleS,
  auRepos,
  numeroSuivant,
  poids,
}: {
  aff: AffichageChrono | null;
  /** Durée prévue de la série (null : le chrono montera). */
  cibleS: number | null;
  /** Repos en cours et série pas encore lancée : le décompte du repos prend la place. */
  auRepos: boolean;
  numeroSuivant: number;
  /** Durée et poids : le poids à côté du grand chiffre (« 10 kg »). */
  poids?: string | null;
}) {
  const { couleurs } = useTheme();
  if (auRepos) return <DecompteRepos numero={numeroSuivant} />;
  const depasse = !!aff?.depasse;
  const couleur = depasse ? couleurs.valide : aff?.marche ? couleurs.action : couleurs.t1;
  const texte = aff ? aff.texte : cibleS ? tempsTexte(cibleS) : "–";
  const total = aff && depasse ? tempsTexte(aff.ecouleS) : null;
  const lib = depasse ? t("seance.plein.objectifTenu") : aff ? (cibleS ? t("seance.plein.reste") : t("seance.plein.ecoule")) : cibleS ? t("seance.plein.prete") : t("seance.plein.preteSansCible");
  return (
    <View style={styles.bloc} accessibilityLiveRegion="polite">
      <View style={styles.ligne}>
        <Animated.View key={texte} entering={aff ? entreeChiffre : undefined}>
          <Texte variante="minuteur" accessibilityRole="timer" maxFontSizeMultiplier={POLICE_MAX} style={[styles.gros, { color: couleur }]}>
            {texte}
          </Texte>
        </Animated.View>
        <View style={styles.droite}>
          {poids ? (
            <Texte variante="saisie" maxFontSizeMultiplier={POLICE_MAX} style={styles.droiteFort}>
              {poids}
            </Texte>
          ) : null}
          {total ? (
            <>
              <Texte variante="saisie" maxFontSizeMultiplier={POLICE_MAX} style={styles.droiteFort}>
                {total}
              </Texte>
              <Texte variante="corps" couleur="t2" maxFontSizeMultiplier={POLICE_MAX}>
                {t("seance.plein.auTotal")}
              </Texte>
            </>
          ) : cibleS && aff ? (
            <Texte variante="corps" couleur="t2" maxFontSizeMultiplier={POLICE_MAX}>
              {t("seance.plein.sur", { temps: tempsTexte(cibleS) })}
            </Texte>
          ) : null}
        </View>
      </View>
      <View style={styles.lib}>
        {depasse ? <Icone nom="vibre" couleur={couleurs.valide} taille={18} /> : null}
        <Texte variante="corps" maxFontSizeMultiplier={POLICE_MAX} style={{ fontSize: 14, color: depasse ? couleurs.valide : couleurs.t2 }}>
          {lib}
        </Texte>
      </View>
      {/* Trait du geste qui se vide (comme la barre de repos) ; plein et vert au-delà de la cible ; vide avant le lancement. */}
      <View style={[styles.piste, { backgroundColor: couleurs.s3 }]}>
        {depasse ? (
          <View style={[styles.trait, { width: "100%", backgroundColor: couleurs.valide }]} />
        ) : aff?.reste != null ? (
          <TraitQuiSeVide reste={aff.reste} />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Distance et poids (marche du fermier, D6) : ni chrono ni tempo ; la distance à parcourir en grand, le poids à côté. Le
 * bouton du milieu du plein écran valide la série d'un toucher.
 */
export function CibleDistance({ distance, poids }: { distance: string; poids: string | null }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.bloc}>
      <View style={styles.ligne}>
        <Texte variante="minuteur" maxFontSizeMultiplier={POLICE_MAX} style={[styles.gros, { color: couleurs.t1 }]}>
          {distance}
        </Texte>
        {poids ? (
          <View style={styles.droite}>
            <Texte variante="saisie" maxFontSizeMultiplier={POLICE_MAX} style={styles.droiteFort}>
              {poids}
            </Texte>
          </View>
        ) : null}
      </View>
      <View style={styles.lib}>
        <Texte variante="corps" couleur="t2" maxFontSizeMultiplier={POLICE_MAX} style={{ fontSize: 14 }}>
          {t("seance.plein.aParcourir")}
        </Texte>
      </View>
    </View>
  );
}

/** Trait du geste : part plein au lancement, puis rejoint chaque nouvelle valeur en `PAS_TRAIT` ms, linéaire. */
function TraitQuiSeVide({ reste }: { reste: number }) {
  const reduit = useReduit();
  const part = useSharedValue(reste);
  useEffect(() => {
    part.value = reduit ? reste : withTiming(reste, { duration: PAS_TRAIT, easing: Easing.linear });
  }, [reste, reduit, part]);
  const anime = useAnimatedStyle(() => ({ transform: [{ scaleX: part.value }] }));
  return (
    <Animated.View style={[styles.trait, styles.traitPlein, anime]}>
      <FondDegrade angle={90} />
    </Animated.View>
  );
}

function DecompteRepos({ numero }: { numero: number }) {
  const { couleurs } = useTheme();
  const repos = useMinuteur();
  return (
    <View style={styles.bloc} accessibilityLiveRegion="polite">
      <Texte variante="minuteur" accessibilityRole="timer" accessibilityLabel={t("seance.repos.libelle", { s: repos.restantS })} maxFontSizeMultiplier={POLICE_MAX} style={[styles.gros, { color: couleurs.t1 }]}>
        {formaterDuree(repos.restantS)}
      </Texte>
      <View style={styles.lib}>
        <Texte variante="corps" couleur="t2" maxFontSizeMultiplier={POLICE_MAX} style={{ fontSize: 14 }}>
          {t("seance.plein.reposAvant", { n: numero })}
        </Texte>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { paddingTop: 12 },
  ligne: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  gros: { fontSize: 88, lineHeight: 96, fontFamily: police.light, letterSpacing: -3 },
  droite: { alignItems: "flex-end", paddingBottom: 16 },
  droiteFort: { fontSize: 20 },
  lib: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 20, marginTop: -2 },
  piste: { height: 3, marginTop: 10, borderRadius: 2, overflow: "hidden" },
  trait: { height: 3, overflow: "hidden" },
  traitPlein: { width: "100%", transformOrigin: "left" },
});
