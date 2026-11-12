// Clavier de séance (planche clavier-seance, validée le 29/10) : le clavier numérique de pepfit pour les cases de série.
// Pavé 1 à 9, décimale (« , » en français, seulement pour le poids et la distance), 0, effacer ; à droite la molette au pas
// de la case et Valider (vert), qui passe à la case suivante. Pas de bouton pour réduire : il se ferme en validant la
// dernière case, en touchant ailleurs ou avec le retour. La barre de repos en cours se pose au-dessus (session.tsx).
// Il monte du bas comme le clavier du téléphone (200 ms, courbe feuille) et y redescend (150 ms) ; sa place sous la liste
// est posée d'un coup (revue finale n° 52). Réduire les animations : fondu de 150 ms. Pas de vibration aux touches (n° 41 :
// la vibration est réservée au record et à l'erreur, dont la touche refusée d'une case pleine ; la molette garde son cran).
// Au-dessus du pavé, le matériel du lieu (planche materiel, s1 et s2) : l'avis de la charge la plus proche, sinon la barre chargée.
import { createContext, useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion, withTiming, type EntryAnimationsValues, type ExitAnimationsValues } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bandeCharge } from "../ecrans/charge-seance";
import { lireNombre } from "../ecrans/format";
import { clavierSeance, mesureClavier, moletteDe, separateur, texteMolette, useCaseActive, useClavierOuvert, valeursMolette, type CaseActive, type Touche } from "../ecrans/clavier-seance";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { police, rayon } from "../theme/typo";
import { Icone } from "./Icone";
import { haptique } from "./haptique";
import { Molette } from "./Molette";
import { BarreChargee } from "./DessinBarre";
import { Appui, courbes } from "./mouvement";
import { useReduit } from "./reduit";
import { Texte } from "./Texte";

/** Vrai dans la séance : les cases de série prennent le clavier de pepfit au lieu de celui du téléphone. */
export const ClavierPerso = createContext(false);

const TOUCHE = 52;
const ECART = 6;
/** Valider passe d'une case à l'autre (perte du focus, puis focus) : le clavier attend ce temps avant de partir. */
const GARDE_MS = 80;

/**
 * La case active, gardée un instant quand elle se ferme : entre deux cases, le clavier (et la bande du bas de la séance) ne
 * part pas pour revenir aussitôt.
 */
export function useCaseClavier(): CaseActive | null {
  const c = useCaseActive();
  const [gardee, setGardee] = useState(c);
  useEffect(() => {
    if (c) return setGardee(c);
    const m = setTimeout(() => setGardee(null), GARDE_MS);
    return () => clearTimeout(m);
  }, [c]);
  return c ?? gardee;
}

/** Le clavier est-il à l'écran (ouvert, ou gardé un instant entre deux cases) ? Booléen : stable d'une touche à l'autre. */
export function useClavierAffiche(): boolean {
  const ouvert = useClavierOuvert();
  const [garde, setGarde] = useState(ouvert);
  useEffect(() => {
    if (ouvert) return setGarde(true);
    const m = setTimeout(() => setGarde(false), GARDE_MS);
    return () => clearTimeout(m);
  }, [ouvert]);
  return ouvert || garde;
}

/** Ce qui se pose au bas de l'écran (bande, barre « Ajouter ») s'efface tant que le clavier de pepfit est à l'écran. */
export function SousLeClavier({ children }: { children: ReactNode }) {
  return useClavierAffiche() ? null : <>{children}</>;
}

const entree = (v: EntryAnimationsValues) => {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: v.targetHeight }] },
    animations: { transform: [{ translateY: withTiming(0, { duration: duree.entree, easing: courbes.feuille }) }] },
  };
};
const sortie = (v: ExitAnimationsValues) => {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: { transform: [{ translateY: withTiming(v.currentHeight, { duration: duree.sortie, easing: courbes.sortie }) }] },
  };
};
// Réduire les animations : un fondu court, joué quand même (Reanimated sauterait toute animation).
const fondu = {
  entree: FadeIn.duration(duree.sortie).easing(courbes.sortie).reduceMotion(ReduceMotion.Never),
  sortie: FadeOut.duration(duree.sortie).easing(courbes.sortie).reduceMotion(ReduceMotion.Never),
};

export function ClavierSeance() {
  const { couleurs, mode } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const reduit = useReduit();
  const c = useCaseClavier();
  // Retour Android : ferme le clavier (la case s'enregistre) au lieu de quitter la séance.
  useEffect(() => {
    if (!c) return;
    const s = BackHandler.addEventListener("hardwareBackPress", () => (clavierSeance.quitter(), true));
    return () => s.remove();
  }, [c]);
  // La molette suit en différé (rendu de fond, interruptible) : la case et le pavé se redessinent tout de suite
  // (docs/SEANCE-ORDRE.md, chrono du clavier). Elle n'est plus recréée à chaque chiffre (ses ~200 lignes remontées) : gardée
  // tant que le champ ne change pas, d'une case à l'autre aussi, elle saute sur la valeur tapée (audit M5, docs/PERF-D.md).
  // Durée : la molette part des chiffres tapés (« 30 » → 0:30), pas du masque, qui ne se relit pas.
  const ici = c ? moletteDe(c) : null;
  const molette = useDeferredValue(ici);
  // Dernière charge tapée par série : la case des répétitions qui suit dessine déjà la barre de cette charge.
  const charges = useRef(new Map<string, number | null>());
  if (c?.charge && c.champ === "kg") charges.current.set(c.charge.serie, lireNombre(c.saisie.texte));
  if (!c || !ici) return null;
  const bande = c.charge ? bandeCharge(c.charge, { champ: c.champ, texte: c.saisie.texte, rapproche: c.rapproche, kgSerie: charges.current.get(c.charge.serie) }) : null;
  const fondTouche = mode === "nuit" ? couleurs.s2 : couleurs.bg;
  const pour = molette ?? ici;
  const m = valeursMolette(pour.champ, pour.valeur, { unite: pour.unite, paliers: pour.paliers });
  const touche = (k: Touche, contenu: ReactNode, libelle?: string) => (
    // Le chiffre s'écrit à l'appui, comme une touche physique (le lâcher ajoutait la durée du toucher) ; le lecteur d'écran,
    // qui n'appuie pas, passe par l'action « activer ».
    <Appui
      key={k}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={() => clavierSeance.toucher(k)}
      onPressIn={() => {
        mesureClavier.appui();
        // Case pleine (999 répétitions, 9 999,5 kg…) : la touche ne fait rien, sauf un petit retour de refus.
        if (!clavierSeance.toucher(k)) haptique.refus();
      }}
      style={[styles.touche, { backgroundColor: fondTouche }]}
    >
      {contenu}
    </Appui>
  );
  const chiffre = (k: Touche) => touche(k, <Texte style={[styles.chiffre, { color: couleurs.t1 }]}>{k}</Texte>);
  return (
    <Animated.View
      entering={reduit ? fondu.entree : entree}
      exiting={reduit ? fondu.sortie : sortie}
      style={[styles.clavier, { backgroundColor: mode === "nuit" ? couleurs.s1 : couleurs.s2, paddingBottom: bas + 8 }]}
    >
      {bande && "avis" in bande ? (
        <View style={styles.bande} accessibilityLiveRegion="polite">
          <Icone nom="info" couleur={couleurs.info} taille={16} />
          <View style={styles.bandeTextes}>
            <Texte variante="libelle" style={{ fontFamily: police.semibold, color: couleurs.t1 }}>
              {bande.avis.titre}
            </Texte>
            <Texte variante="meta" couleur="t2">
              {bande.avis.detail}
            </Texte>
          </View>
        </View>
      ) : bande ? (
        <View style={styles.bande}>
          <BarreChargee cote={bande.barre.coteKg} largeur={120} hauteur={34} />
          <View style={styles.bandeTextes}>
            <Texte variante="libelle" style={{ fontFamily: police.semibold, color: couleurs.t1 }}>
              {bande.barre.titre}
            </Texte>
            <Texte variante="corps" couleur="t2">
              {bande.barre.sous}
            </Texte>
          </View>
        </View>
      ) : null}
      <View style={styles.pave}>
        <View style={styles.chiffres}>
          {(["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const).map(chiffre)}
          {c.decimal ? (
            touche("decimal", <Texte style={[styles.chiffre, { color: couleurs.t1 }]}>{separateur()}</Texte>, t("seance.clavier.decimale"))
          ) : (
            <View style={styles.touche} />
          )}
          {chiffre("0")}
          {touche("effacer", <Icone nom="efface" couleur={couleurs.t1} taille={26} />, t("seance.clavier.effacer"))}
        </View>
        <View style={styles.droite}>
          <View style={[styles.colonneMolette, { backgroundColor: fondTouche }]}>
            {/* Bande du centre, plus sombre que la colonne la nuit (celle de la molette s'y confondrait). */}
            <View style={[styles.bandeMolette, { backgroundColor: mode === "nuit" ? couleurs.s1 : couleurs.s2 }]} />
            <Molette
              // Recréée seulement quand le champ change ; une touche tapée ou une autre case la fait sauter sans animation.
              key={pour.cle}
              saut={pour.saut}
              // ±20 crans autour du centre : 50 lignes au plus au lieu de 201 à 721 à l'ouverture du clavier (audit M5).
              fenetre={20}
              bande={false}
              valeurs={m.valeurs}
              indice={m.indice}
              onIndice={(i) => clavierSeance.molette(m.valeurs[i]!)}
              texte={(v) => texteMolette(pour.champ, v)}
              unite={pour.champ === "kg" ? pour.unite : undefined}
              visibles={3}
              largeur={90}
              libelle={t("seance.clavier.molette")}
            />
          </View>
          <Appui
            accessibilityRole="button"
            accessibilityLabel={t("seance.clavier.valider")}
            onPress={() => clavierSeance.valider()}
            style={[styles.valider, { backgroundColor: couleurs.valide }]}
          >
            <Icone nom="check" couleur={mode === "nuit" ? couleurs.bg : "#ffffff"} taille={28} />
          </Appui>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clavier: { paddingTop: 10, paddingHorizontal: 8 },
  pave: { flexDirection: "row", gap: ECART },
  bande: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 40, paddingHorizontal: 8, paddingBottom: 8 },
  bandeTextes: { flex: 1, gap: 2 },
  chiffres: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: ECART },
  touche: { width: "31.6%", flexGrow: 1, height: TOUCHE, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  chiffre: { fontFamily: police.regular, fontSize: 24 },
  droite: { width: 96, gap: ECART },
  colonneMolette: { height: 3 * TOUCHE + 2 * ECART, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bandeMolette: { position: "absolute", left: 6, right: 6, height: 44, top: (3 * TOUCHE + 2 * ECART - 44) / 2, borderRadius: rayon.m },
  valider: { height: TOUCHE, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
