import { useEffect, useMemo, useRef } from "react";
import { AppState, PixelRatio, View } from "react-native";
import { useIsFocused } from "expo-router";
import { Easing, type SharedValue, useDerivedValue, useFrameCallback, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Canvas, Fill, Group, RadialGradient, Rect, Shader, Skia, TileMode, vec } from "@shopify/react-native-skia";
import { allureRythme, hexVersRvb, teintesAge } from "./couleur";
import { battementEtroit, battementLarge } from "./battement";
import { SKSL_AME } from "./sksl-ame";
import { veilleSignature } from "./veille";
import { courbes } from "../mouvement";
import { useReduit } from "../reduit";
import type { HorlogesAme } from "../3d/vol-ame";

// Un SkSL refusé par le pilote ne doit pas casser la page : pas de forme, le texte de la page reste.
const EFFET = Skia.RuntimeEffect.Make(SKSL_AME);
if (!EFFET) console.warn("signature-age: SkSL");

/** Transition de score : morphose à l'écran, ease-in-out fort (le jeton `deplacement`) ; durée et force de l'onde suivent
 *  l'amplitude, avec un plancher (un vrai changement de semaine fait 0,1 à 1 an et doit se voir). Mouvement réduit : fondu
 *  0,2 s. */
const COURBE = courbes.deplacement;
const DUREE_REDUIT = 200;
const DUREE_ONDE = 1800;
/** À l'ouverture, la forme part de l'âge de la semaine précédente après ce délai (le temps que l'écran se pose). */
const DELAI_OUVERTURE = 250;
const PERIODE_SOUFFLE = 5.5;
/** Pas de temps borné : au retour d'une pause, la forme reprend où elle était au lieu de sauter. */
const PAS_MAX = 0.05;

/** Durée de la morphose (ms) : 0,6 s pour un petit pas, 1,4 s dès 5 ans d'écart. */
export function dureeTransition(delta: number): number {
  "worklet";
  return 600 + 800 * Math.min(1, Math.abs(delta) / 5);
}
/** Force de l'onde (0..1) : 0,45 au moins, pleine dès 4 ans d'écart. */
export function forceOnde(delta: number): number {
  "worklet";
  return 0.45 + 0.55 * Math.min(1, Math.abs(delta) / 4);
}

export type Mesure = { ips: number; p95: number; images: number };

/** Saturation 0,6 (le saturate() de CSS de la planche age-attente), en matrice de couleur 4 × 5. */
const S = 0.6;
const DESATURE = [
  0.213 + 0.787 * S, 0.715 - 0.715 * S, 0.072 - 0.072 * S, 0, 0,
  0.213 - 0.213 * S, 0.715 + 0.285 * S, 0.072 - 0.072 * S, 0, 0,
  0.213 - 0.213 * S, 0.715 - 0.715 * S, 0.072 + 0.928 * S, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * Signature de l'Âge pepfit, direction A « Souffle » : membrane liquide en SkSL (sksl-ame.ts, généré depuis la planche
 * planches/age-coeur, un seul dessin avec l'âme de la poitrine ; sortie sur fond transparent). Tout se passe sur le thread UI : une horloge Reanimated pousse les uniformes, React ne re-rend pas
 * par image. Horloge arrêtée hors écran (`visible`), écran recouvert ou appli en arrière-plan ; mouvement réduit : image
 * fixe, la couleur fond en 0,2 s. Calme après 20 s, jamais figée à l'écran ; réveillée au retour de l'arrière-plan et par un
 * nouveau score (veille.ts).
 * Décor masqué au lecteur d'écran : la page donne au bloc du chiffre une étiquette parlée (âge, écart en mots).
 *
 * `ecart` : âge pepfit − âge civil (années) ; `ecartPrecedent` : celui de la semaine d'avant, d'où la forme part à
 * l'ouverture (le moment hebdomadaire) ; `rythme` : rythme de vieillissement (−1…3, 1 = normal) ; `fc` : FC de repos
 * (null : inconnue, pas de battement inventé). `valeur` : écart animé partagé avec la page, pour que le chiffre et la ligne
 * suivent la même courbe que la forme (texte animé sur le thread UI). `surMesure` (labo) : cadence, toutes les 2 s.
 *
 * Vol depuis l'âme (planches/age-coeur) : `leger` (1 = l'âme, 0 = la signature) fait passer le dessin de l'un à l'autre ;
 * `horloges` reprend la forme au même instant que l'âme ; `ouverture="vol"` : déjà à l'écart du jour (pas de morphose depuis
 * la semaine passée), l'onde de la semaine part à l'atterrissage (`delaiOnde`), seulement si l'âge a changé.
 *
 * `fantome` (planche age-attente, D2) : la signature en attente, sans âge : floutée de `flou` dp, désaturée, sous un masque
 * radial ; plus lente (forme × 0,6, agitation × 0,5, éclat × 0,7), elle respire et ne bat pas (passer `fc` null).
 */
export function SignatureAge({
  ecart,
  ecartPrecedent,
  rythme,
  fc = null,
  taille,
  fond,
  visible = true,
  valeur,
  surMesure,
  leger,
  horloges = null,
  ouverture = "semaine",
  delaiOnde = 0,
  fantome,
}: {
  ecart: number;
  ecartPrecedent?: number;
  rythme: number;
  fc?: number | null;
  taille: number;
  fond: string;
  visible?: boolean;
  valeur?: SharedValue<number>;
  surMesure?: (m: Mesure) => void;
  leger?: SharedValue<number>;
  horloges?: HorlogesAme | null;
  ouverture?: "semaine" | "vol";
  delaiOnde?: number;
  fantome?: { flou: number };
}) {
  const reduit = useReduit();
  const premierPlan = useIsFocused();

  // Écart animé (celui de la page s'il est fourni), onde du changement, rythme lissé : valeurs partagées ; la cible vient
  // de React une fois par changement.
  const depart = ecartPrecedent ?? ecart;
  const interne = useSharedValue(depart);
  const ecartAnime = valeur ?? interne;
  const onde = useSharedValue(1);
  const ondeAmp = useSharedValue(0);
  const rythmeCible = useSharedValue(rythme);
  const rythmeLisse = useSharedValue(rythme);
  const frequence = useSharedValue((fc ?? 0) / 60);
  const premier = useRef(true);
  useEffect(() => {
    // Première fois : on part de la semaine précédente, après un court délai ; ensuite, de là où en est la forme.
    const delai = premier.current ? DELAI_OUVERTURE : 0;
    if (premier.current) {
      premier.current = false;
      if (ouverture === "vol") {
        // arrivée depuis l'âme : la couleur est déjà celle du jour ; l'onde dit seulement le changement de la semaine
        ecartAnime.value = ecart;
        const delta = ecart - depart;
        if (reduit || Math.abs(delta) < 0.05) return;
        ondeAmp.value = forceOnde(delta);
        onde.value = 0;
        onde.value = withDelay(delaiOnde, withTiming(1, { duration: DUREE_ONDE, easing: Easing.linear }));
        return;
      }
      ecartAnime.value = depart;
    }
    const de = ecartAnime.value;
    if (de === ecart) return;
    const delta = ecart - de;
    ecartAnime.value = withDelay(
      delai,
      withTiming(ecart, { duration: reduit ? DUREE_REDUIT : dureeTransition(delta), easing: COURBE }),
    );
    if (reduit) return;
    ondeAmp.value = forceOnde(delta);
    onde.value = 0;
    onde.value = withDelay(delai, withTiming(1, { duration: DUREE_ONDE, easing: Easing.linear }));
    // `depart` ne sert qu'au premier passage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecart, reduit, ecartAnime, onde, ondeAmp]);
  useEffect(() => {
    rythmeCible.value = rythme;
    frequence.value = (fc ?? 0) / 60;
  }, [rythme, fc, rythmeCible, frequence]);

  // Horloges : temps de la forme (intégré à la vitesse du rythme, donc sans saut, ralenti au repos) ; respiration et
  // battement en temps réel (au repos, leur amplitude baisse, pas leur fréquence).
  const tForme = useSharedValue(horloges?.forme ?? 3);
  const lenteur = fantome ? 0.6 : 1;
  const tReel = useSharedValue(horloges?.reel ?? 0);
  const phaseBat = useSharedValue(horloges?.phase ?? 0);
  const elan = useSharedValue(1);
  const nb = useSharedValue(0);
  const debutMesure = useSharedValue(0);
  const intervalles = useSharedValue<number[]>([]);
  const cadre = useFrameCallback((f) => {
    "worklet";
    const dt = Math.min(PAS_MAX, (f.timeSincePreviousFrame ?? 16) / 1000);
    rythmeLisse.value += (rythmeCible.value - rythmeLisse.value) * (1 - Math.exp(-dt * 3));
    tForme.value += dt * elan.value * allureRythme(rythmeLisse.value).vitesse * lenteur;
    tReel.value += dt;
    phaseBat.value += dt * frequence.value;
    // mesure (labo) : cadence vue par le thread UI, remontée au JS toutes les 2 s seulement
    if (!surMesure || f.timeSincePreviousFrame === null) return;
    if (debutMesure.value === 0) {
      debutMesure.value = f.timestamp;
      return;
    }
    intervalles.value.push(f.timeSincePreviousFrame);
    nb.value += 1;
    if (f.timestamp - debutMesure.value >= 2000) {
      const tri = intervalles.value.slice().sort((a, b) => a - b);
      const m: Mesure = {
        ips: Math.round((nb.value * 1000) / (f.timestamp - debutMesure.value)),
        p95: Math.round(tri[Math.floor(tri.length * 0.95)] ?? 0),
        images: nb.value,
      };
      intervalles.value = [];
      nb.value = 0;
      debutMesure.value = f.timestamp;
      scheduleOnRN(surMesure, m);
    }
  }, false);

  const actif = visible && premierPlan && !reduit && EFFET !== null;
  // Veille (veille.ts) : calme au bout de 20 s, jamais figée à l'écran ; arrière-plan ou écran éteint, plus d'image, et réveil
  // au retour. `ecart` dans les dépendances : un nouveau score la réveille aussi.
  useEffect(() => {
    if (!actif) {
      cadre.setActive(false);
      return;
    }
    const veille = veilleSignature({
      elan: (vers, ms) => (elan.value = withTiming(vers, { duration: ms })),
      images: (oui) => cadre.setActive(oui),
    });
    veille.demarrer(AppState.currentState === "active");
    const etat = AppState.addEventListener("change", veille.etatAppli);
    return () => {
      etat.remove();
      veille.arreter();
    };
  }, [actif, cadre, elan, ecart]);

  const rvbFond = hexVersRvb(fond);
  const px = 2 / (taille * PixelRatio.get());
  const avecBattement = fc !== null;
  const teintes = useDerivedValue(() => teintesAge(ecartAnime.value));
  const uniformes = useDerivedValue(() => {
    const te = teintes.value;
    const fixe = reduit;
    const l = leger ? leger.value : 0;
    const bat = battementEtroit(phaseBat.value) * (1 - l) + battementLarge(phaseBat.value) * l;
    return {
      uRes: [taille, taille],
      uPx: px,
      uT: tForme.value,
      uAgit: fixe ? 0 : allureRythme(rythmeLisse.value).agitation * (fantome ? 0.5 : 1),
      uSouffle: fixe ? 0 : elan.value * Math.sin((tReel.value * 2 * Math.PI) / PERIODE_SOUFFLE),
      uBat: fixe || !avecBattement ? 0 : elan.value * bat,
      uOnde: onde.value,
      uOndeAmp: onde.value >= 1 ? 0 : ondeAmp.value,
      uChaud: te.chaud,
      uEclat: te.eclat * (fantome ? 0.7 : 1),
      uFond: rvbFond,
      uFP: te.froidProfond,
      uFV: te.froidVif,
      uCP: te.chaudProfond,
      uCV: te.chaudVif,
      uLeger: l,
    };
  });

  const flou = fantome?.flou ?? 0;
  const calque = useMemo(() => {
    if (!flou) return null;
    const p = Skia.Paint();
    p.setImageFilter(Skia.ImageFilter.MakeBlur(flou, flou, TileMode.Decal, null));
    p.setColorFilter(Skia.ColorFilter.MakeMatrix(DESATURE));
    return p;
  }, [flou]);

  if (!EFFET) return <View style={{ width: taille, height: taille }} />;
  if (calque)
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
        <Canvas style={{ width: taille, height: taille }}>
          <Group layer>
            <Group layer={calque}>
              <Fill>
                <Shader source={EFFET} uniforms={uniformes} />
              </Fill>
            </Group>
            <Rect x={0} y={0} width={taille} height={taille} blendMode="dstIn">
              <RadialGradient c={vec(taille / 2, taille / 2)} r={taille / 2} colors={["#000000", "#000000", "#00000000"]} positions={[0, 0.62, 1]} />
            </Rect>
          </Group>
        </Canvas>
      </View>
    );
  return (
    // Décor : caché au lecteur d'écran ; c'est le texte du centre (posé par la page) qui porte l'âge et l'écart.
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Canvas style={{ width: taille, height: taille }}>
        <Fill>
          <Shader source={EFFET} uniforms={uniformes} />
        </Fill>
      </Canvas>
    </View>
  );
}

/**
 * Préchauffage (planches/age-coeur) : une image de 1 dp, transparente, dessinée une fois avec le shader de la signature. Le
 * GPU compile son programme à la première image dessinée : posée sur la page Santé dès que l'âme est là, elle évite que la
 * signature qui vole arrive en retard (vu à l'émulateur : le chiffre avant la forme).
 */
export function PrechauffeSignature() {
  if (!EFFET) return null;
  // hors de la membrane (centre du canevas très loin) : le pixel sort transparent
  const u = {
    uRes: [2000, 2000], uPx: 0.001, uT: 3, uAgit: 0, uSouffle: 0, uBat: 0, uOnde: 1, uOndeAmp: 0, uChaud: 0, uEclat: 1,
    uFond: [0, 0, 0], uFP: [0, 0, 0], uFV: [0, 0, 0], uCP: [0, 0, 0], uCV: [0, 0, 0], uLeger: 0,
  };
  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1 }}>
      <Canvas style={{ width: 1, height: 1 }}>
        <Fill>
          <Shader source={EFFET} uniforms={u} />
        </Fill>
      </Canvas>
    </View>
  );
}
