import { useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Reanimated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useTheme } from "../theme";
import { ombreColle } from "../theme/effets";
import { duree } from "../theme/mouvement";
import { espace } from "../theme/typo";
import { usePartie } from "./ContextePartie";
import { FondDegrade } from "./Degrade";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";
import { compactDe, HAUT_COMPACTE, hauteurBande } from "./semainier";

// Semainier collé au défilement (29/10), Entraînements et Nutrition. La bande de la semaine est posée au-dessus de la
// page, fixe ; la page défile dessous (elle commence à HAUT_BANDE). En descendant, la bande se resserre sur une ligne (chiffre et
// point, sans la lettre du jour), au rythme du défilement ; en remontant tout en haut, elle reprend sa taille. Ses gestes restent
// les mêmes (semaine par semaine, toucher d'une date, retour à 5 s, séparateurs). Une ligne collée en plus (`colle` : les
// macros de la Nutrition) se pose juste dessous quand `montrerColle(true)` est appelé.
// Sans fond (retour du 30/10 : « l'ombre suffit ») : l'aura passe derrière la zone collée, la page est coupée sous
// elle et seule une ombre douce, sous son bord, la sépare de ce qui défile. Rien ne passe sous les chiffres : ils restent lisibles
// sans voile. La ligne collée paraît en fondu et glisse de 6 px vers sa place (200 ms, 150 ms au départ, courbe sortie), sur le
// fil UI ; le bord coupé et l'ombre descendent avec elle et la dévoilent (elle ne passe jamais sur la page), la page ne bouge
// pas. Repassé en sens inverse, le fondu repart d'où il en est. « Réduire les animations » : la bande passe d'une taille à l'autre d'un coup, au seuil ; la ligne collée paraît en
// fondu seul, son bord posé d'un coup. Tout glisse en translateY (revue finale du 30/10, n° 60), aucune hauteur animée.
// Rangée fixée (`fixee`, page Activité, 09/11) : les jauges, posées sous la bande resserrée par-dessus la page, sans fond ; le bord
// coupé descend de `progression` × 44 (0 : au ras de la bande, 1 : sous la ligne des petites jauges) et l'ombre avec lui, la
// page ne bouge pas. La rangée s'anime elle-même (jauges, ecrans/JaugesActivite) ; la zone ne fait que lui laisser la place.
//
//   const zone = useZoneSemainier();
//   <ZoneSemainier zone={zone} bande={<BandeSemaine … compact={zone.compact} />}>
//     <GlisserJour …><ScrollView onScroll={(e) => zone.surDefilement(e.nativeEvent.contentOffset.y)}
//       contentContainerStyle={{ paddingTop: HAUT_BANDE }}>…</ScrollView></GlisserJour>
//   </ZoneSemainier>

/** Glissé de la ligne collée vers sa place (px), depuis le dessous de la bande. */
const GLISSE_COLLE = 6;
/** Hauteur de l'ombre sous le bord de la zone collée. */
const HAUT_OMBRE = 16;

export function useZoneSemainier() {
  const reduit = useReduit();
  const compact = useSharedValue(0);
  // Ligne collée : `colle` suit le fondu (0 absente, 1 posée) ; `colleVue` est l'état visé, sans attendre (mouvement réduit).
  const colle = useSharedValue(0);
  const colleVue = useSharedValue(0);
  const vue = useRef(false);
  const surDefilement = (y: number) => {
    const c = compactDe(y, reduit);
    if (c !== compact.value) compact.value = c;
  };
  const montrerColle = (vu: boolean) => {
    if (vu === vue.current) return;
    vue.current = vu;
    colleVue.value = vu ? 1 : 0;
    // Jamais sauté par Reanimated (« réduire » ne garde que ce fondu : ni glissé ni bord qui bouge, voir les styles).
    colle.value = withTiming(vu ? 1 : 0, { duration: vu && !reduit ? duree.entree : duree.sortie, easing: courbes.sortie, reduceMotion: ReduceMotion.Never });
  };
  return { compact, colle, colleVue, surDefilement, montrerColle };
}

export function ZoneSemainier({
  zone,
  bande,
  colle,
  fixee,
  progression,
  children,
}: {
  zone: { compact: SharedValue<number>; colle: SharedValue<number>; colleVue: SharedValue<number> };
  bande: ReactNode;
  /** Ligne collée sous la bande (macros) : elle paraît et s'efface avec `zone.montrerColle`. */
  colle?: ReactNode;
  /** Rangée fixée sous la bande (jauges de l'Activité), avec son avancement 0 à 1 (sur le fil UI) : le bord coupé la suit. */
  fixee?: ReactNode;
  progression?: SharedValue<number>;
  children: ReactNode;
}) {
  const { mode } = useTheme();
  const partie = usePartie();
  const reduit = useReduit();
  const [hauteurZone, setHauteurZone] = useState(0);
  const hauteurColle = useSharedValue(0);
  const { compact, colle: fondu, colleVue } = zone;
  const sansProgression = useSharedValue(0);
  const avance = progression ?? sansProgression;
  // Bord de la zone collée : sous la bande, plus la ligne collée au fil de son fondu (posée d'un coup en mouvement réduit).
  // La page est coupée là : la fenêtre descend, la page remonte d'autant (elle reste en place). Translations seulement : la
  // fenêtre garde sa hauteur et déborde en bas, hors de l'écran.
  const bord = () => {
    "worklet";
    return hauteurBande(compact.value) + (reduit ? colleVue.value : fondu.value) * hauteurColle.value + avance.value * HAUT_COMPACTE;
  };
  const coupe = useAnimatedStyle(() => ({ transform: [{ translateY: bord() }] }));
  const page = useAnimatedStyle(() => ({ transform: [{ translateY: -bord() }] }));
  const ombre = useAnimatedStyle(() => ({
    opacity: Math.max(compact.value, fondu.value),
    transform: [{ translateY: bord() }],
  }));
  // La ligne collée se dévoile avec le bord (fenêtre qui descend avec lui) : pendant le fondu, elle ne passe jamais sur la page.
  const masque = useAnimatedStyle(() => ({
    transform: [{ translateY: hauteurBande(compact.value) - (1 - (reduit ? colleVue.value : fondu.value)) * hauteurColle.value }],
  }));
  const ligneColle = useAnimatedStyle(() => ({
    opacity: fondu.value,
    transform: [{ translateY: (1 - (reduit ? colleVue.value : fondu.value)) * hauteurColle.value - (reduit ? 0 : GLISSE_COLLE * (1 - fondu.value)) }],
  }));
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setHauteurZone(e.nativeEvent.layout.height)}>
      <Reanimated.View style={[styles.decoupe, coupe]}>
        <Reanimated.View style={[hauteurZone > 0 ? { position: "absolute", left: 0, right: 0, height: hauteurZone } : { flex: 1 }, page]}>{children}</Reanimated.View>
      </Reanimated.View>
      {/* L'ombre tombe sur les cartes coupées seulement (bord des cartes) : sur l'aura, elle dessinerait le fond retiré. */}
      <Reanimated.View pointerEvents="none" style={[styles.ombre, ombre]}>
        <FondDegrade angle={180} arrets={ombreColle(partie, mode)} />
      </Reanimated.View>
      <View pointerEvents="box-none" style={styles.bande}>
        {bande}
      </View>
      {fixee ? (
        <View pointerEvents="box-none" style={styles.fixee}>
          {fixee}
        </View>
      ) : null}
      {colle ? (
        <Reanimated.View pointerEvents="none" style={[styles.colle, masque]}>
          <Reanimated.View
            onLayout={(e) => {
              hauteurColle.value = e.nativeEvent.layout.height;
            }}
            style={ligneColle}
          >
            {colle}
          </Reanimated.View>
        </Reanimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  decoupe: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  ombre: { position: "absolute", top: 0, left: espace.l, right: espace.l, height: HAUT_OMBRE },
  bande: { position: "absolute", top: 0, left: 0, right: 0 },
  colle: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  fixee: { position: "absolute", top: HAUT_COMPACTE, left: espace.l, right: espace.l },
});
