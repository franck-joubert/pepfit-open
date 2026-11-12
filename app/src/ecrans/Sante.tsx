import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type ScrollViewInstance } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { BoutonIcone, TeteOnglet } from "../ui/Cadre";
import { BoutonReglagesPartie } from "./reglages/Parties";
import { useEspaceMenu, useMargeMenu } from "../ui/MenuFlottant";
import { useBulle } from "../ui/CoucheBulle";
import { useHautALArrivee } from "../ui/haut-arrivee";
import { useOngletRetouche } from "../ui/onglet-retouche";
import { brancherDefilementAura } from "../ui/aura-etat";
import { Actualiser, sansEtirement } from "../ui/Actualiser";
import { Texte } from "../ui/Texte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { minuitDe } from "./sante-lecteurs";
import { resumeSante } from "./sante-vue";
import { decaler } from "./sante-donnees";
import { RangeeSport } from "./RangeeSport";
import { jourDe } from "./planif-donnees";
import { useJourCourant } from "./useJourCourant";
import { lundiDe } from "./planification";
import { BandeSemaine, TitreDate } from "../ui/BandeSemaine";
import { arriveeDebut, arriveeRepere } from "../ui/3d/arrivee";
import { BlocCorps } from "./corps/BlocCorps";
import { useDonneesCorps, useMorphoDuLien } from "./corps/donnees-corps";
import { useDefilementCorps } from "./corps/useDefilementCorps";

const MARGE = espace.l;

/**
 * Santé : le semainier (retour du 29/10 : jours passés seulement), puis le contenu du Corps (corps/BlocCorps) : le corps
 * en verre teinté sur l'aura, les valeurs du jour choisi reliées à l'endroit du corps qu'elles décrivent, le bilan de ce jour. Un
 * jour passé : chaque valeur est lue telle qu'elle était à la fin de ce jour ; le corps et le résumé restent ceux d'aujourd'hui.
 */
export function Sante() {
  // mesure de l'arrivée (ui/3d/arrivee.ts) : partie du toucher de l'onglet, ou d'ici sans toucher (lien direct)
  const premierRendu = useRef(true);
  if (premierRendu.current) {
    premierRendu.current = false;
    arriveeDebut();
    arriveeRepere("rendu");
  }
  useEffect(() => arriveeRepere("monte"), []);
  useLangue();
  const { couleurs } = useTheme();
  const marge = useMargeMenu();
  const espaceMenu = useEspaceMenu();
  // séance en cours : la bulle flotte au-dessus du menu, la dernière ligne (Compléments) défile au-dessus d'elle
  const bulle = useBulle();
  // Arrivée par le menu : en haut, d'un coup ; onglet re-touché : remonte en haut en défilant (29/10).
  const defilement = useRef<ScrollViewInstance>(null);
  useHautALArrivee("/health", defilement);
  const focus = useIsFocused();
  // ?date=AAAA-MM-JJ&n= : retour de la page du mois (sante/mois), Santé se pose sur ce jour
  // (les liens de capture ?personnage, ?ecart… sont lus par le Corps : corps/donnees-corps)
  const lien = useLocalSearchParams<{ date?: string; n?: string }>();
  const morpho = useMorphoDuLien();
  // Jour choisi dans le semainier (AAAA-MM-JJ) : aujourd'hui au départ, jamais le futur
  // tenu à jour à minuit : une page restée ouverte ne garde pas l'« aujourd'hui » d'hier (jour passé lu comme aujourd'hui)
  const aujourdhui = useJourCourant();
  const [date, setDate] = useState(aujourdhui);
  // la page était sur aujourd'hui quand minuit a passé : elle suit le nouvel aujourd'hui (un jour passé choisi reste)
  const veille = useRef(aujourdhui);
  useEffect(() => {
    const avant = veille.current;
    veille.current = aujourdhui;
    if (avant !== aujourdhui) setDate((d) => (d === avant ? aujourdhui : d));
  }, [aujourdhui]);
  const choisirJour = (j: string) => setDate(j > aujourdhui ? aujourdhui : j);
  // Onglet re-touché (29/10 au soir) : retour à aujourd'hui, le semainier glisse sur sa semaine ; la page remonte en haut
  // (useHautALArrivee).
  const [recadre, setRecadre] = useState(0);
  useOngletRetouche("/health", () => {
    setDate(aujourdhui);
    setRecadre((n) => n + 1);
  });
  // Un jour touché dans la page du mois : le semainier glisse sur sa semaine, les cartes passent à ce jour.
  useEffect(() => {
    if (!lien.date || !/^\d{4}-\d{2}-\d{2}$/.test(lien.date)) return;
    choisirJour(lien.date);
    setRecadre((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lien.date, lien.n]);
  const jour = minuitDe(date);
  const passe = date !== aujourdhui;
  // Chaque groupe de cartes lu dans la base et posé dès qu'il est prêt ; Santé Connect, Whoop et Withings en fond, puis
  // relus s'ils ont apporté du neuf (sante-charge.ts ; un jour passé : lu à la fin de ce jour)
  const { donnees, relire } = useDonneesCorps(date, jour, passe);
  const resume = resumeSante(morpho);
  // Défilement sur le thread UI (docs/AUDIT-PERF.md, M15) : l'aura le suit sans passer par le JS, qui n'est prévenu qu'au
  // passage d'un seuil (corps ou poitrine sortis de l'écran, corps/useDefilementCorps). Le réveil de l'aura vient du doigt
  // (onTouchMove, app/_layout).
  const enFocus = useSharedValue(focus);
  useEffect(() => {
    enFocus.value = focus;
  }, [focus, enFocus]);
  const { defilement: defile, surDefilement } = useDefilementCorps(enFocus);
  useEffect(() => {
    brancherDefilementAura("sante", defile.y);
    return () => brancherDefilementAura("sante", null);
  }, [defile.y]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      {/* L'en-tête descend avec la page (ui/Actualiser). */}
      <Actualiser defilement={defile.y} recalculer={relire}>
      <TeteOnglet titre={t("ui.onglet.moi")}>
        <BoutonIcone nom="cal" libelle={t("planif.ouvrirMois")} onPress={() => router.push({ pathname: "/sante/mois", params: { jour: date } })} />
        <BoutonReglagesPartie partie="sante" />
      </TeteOnglet>
      <Animated.ScrollView
        {...sansEtirement}
        ref={defilement}
        scrollEventThrottle={16}
        onScroll={surDefilement}
        contentContainerStyle={{ paddingBottom: bulle.enCours ? bulle.hauteur + espaceMenu + espace.l : marge }}
      >
        <BandeSemaine
          lundi={lundiDe(date)}
          recadre={recadre}
          sel={date}
          aujourdhui={aujourdhui}
          couleur={couleurs.partieSante}
          onSel={choisirJour}
          sansFutur
          onSemaine={(s) => choisirJour(jourDe(decaler(jour, 7 * s)))}
          onAujourdhui={() => setDate(aujourdhui)}
          titre={<TitreDate j={date} aujourdhui={aujourdhui} />}
          droite={
            resume ? (
              <Texte variante="meta" couleur="t2" numberOfLines={1} style={styles.resume}>
                {resume}
              </Texte>
            ) : null
          }
        />
        {/* Récupération, Pas, Effort du jour choisi (planche Moi v4) : la rangée de Sport, sous la ligne de la date, avant le
            corps ; chaque case ouvre sa page (Pas, Récupération, Effort), l'Énergie reste dans le bilan sous le personnage */}
        <View style={styles.rangee}>
          <RangeeSport date={date} />
        </View>
        <BlocCorps date={date} aujourdhui={aujourdhui} donnees={donnees} defilement={defile} />
      </Animated.ScrollView>
      </Actualiser>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Planche : « 1,80 m, IMC 24,1 » à droite de la ligne de la date, 13 dp, ne passe jamais à la ligne
  resume: { fontSize: 13, lineHeight: 16, marginLeft: espace.s, flexShrink: 0 },
  rangee: { paddingHorizontal: MARGE },
});
