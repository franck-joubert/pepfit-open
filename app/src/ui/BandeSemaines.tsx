import { useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, View } from "react-native";
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { avecOpacite } from "../theme/teintes";
import { espace, police, rayon } from "../theme/typo";
import { horizontal } from "./arbitrage-gestes";
import { useMargeColonne } from "./CadreContenu";
import { useCouleurPartie } from "./ContextePartie";
import { Icone } from "./Icone";
import { courbes } from "./mouvement";
import { useReduit } from "./reduit";
import { SAUT_MS } from "./saut-jour";
import { fonduSemaine, minuterieRetour, SEMAINIER } from "./semainier";
import {
  buteeCases, caseTouchee, cranCase, dureeCases, geometrieSemaines, opaciteLibelle, SEMAINES_BANDE, separateursEntreSemaines,
  separateursMoisSemaines, suivreCases, voisines, type GeometrieSemaines,
} from "./semainier-semaines";
import { libelleSemaine, moisDuJeudi, titreSemaine } from "./semaines-libelles";
import { Texte } from "./Texte";

// Semainier par semaine (planche age-semainier, validée le 30/10 ; logique dans ui/semainier-semaines.ts) : le
// semainier des onglets (BandeSemaine) avec une case par semaine, « Semaine du 19 au 25 octobre 2026 ». Les semaines voisines
// dépassent de chaque côté (chevron) ; les toucher affiche la semaine d'avant ou d'après. Glisser parcourt sans changer la
// semaine affichée (D1) : au lâcher la bande s'aimante sur une semaine, la toucher l'affiche, sinon la bande revient seule
// sur la semaine affichée après 5 s. Rien après la semaine en cours ni avant la première : la bande bute en douceur.
// Séparateur de mois (couleur de la partie) toujours là avant la première semaine d'un mois ; trait de 4 dp entre deux
// semaines pendant le glissé seulement, et les chevrons s'effacent. Sous la bande, une ligne de 44 : le titre de la semaine
// affichée (« CETTE SEMAINE », « SEMAINE DERNIÈRE »…), le texte de l'appelant, et ↺ hors de la semaine en cours.
//
// Une case : libellé en Medium 15, t1 (t3 si la semaine n'a pas assez de données) ; la semaine affichée prend le fond de verre
// des cartes, la semaine en cours un anneau de 1 dp dans la couleur de la partie à 45 % (D2 : l'anneau plein des jours, sur
// une case de 332 dp, écrasait la forme de la page). Le libellé des voisines s'efface avec la distance au centre : au repos,
// seul le bord de leur case dépasse.
//
// API
//   semaines        la plus ancienne d'abord, la dernière est la semaine en cours : { lundi (minuit local), vide? }.
//   affichee        rang de la semaine affichée ; onAffiche(i) au toucher d'une semaine, ou de ↺.
//   sous            texte à droite du titre de la ligne (Âge : « prochain calcul lundi 2 nov., dans 3 jours »).
//   couleur         couleur de la partie (séparateur de mois, anneau) ; défaut : celle de l'écran.
//   deborde         Fold ouvert : la bande va jusqu'aux bords de l'écran, au-delà de la colonne de 640 (le parent doit le
//                   permettre : PageMesure `debord`) ; la case du centre reste dans la colonne.

export interface SemaineBande {
  lundi: number;
  vide?: boolean;
}

export function BandeSemaines({
  semaines,
  affichee,
  onAffiche,
  sous,
  couleur,
  deborde = false,
}: {
  semaines: readonly SemaineBande[];
  affichee: number;
  onAffiche: (i: number) => void;
  sous?: string;
  couleur?: string;
  deborde?: boolean;
}) {
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  const c = couleur ?? accent;
  const reduit = useReduit();
  const margeColonne = useMargeColonne();
  const marge = deborde ? margeColonne : 0;
  const n = semaines.length;
  const derniere = n - 1;
  const [largeur, setLargeur] = useState(0);
  const g = geometrieSemaines(Math.max(0, largeur - 2 * marge), marge);
  // Rang de la semaine au centre : continu pendant le geste ; la même valeur tenue côté JS (toucher, cran).
  const pos = useSharedValue(affichee);
  const posJs = useRef(affichee);
  // Doigt sur la bande : traits entre les semaines (0 → 1), chevrons effacés.
  const doigt = useSharedValue(0);
  const opts = useRef({ g, reduit, affichee, derniere, onAffiche });
  opts.current = { g, reduit, affichee, derniere, onAffiche };

  const amener = (vers: number, ms?: number) => {
    cancelAnimation(pos);
    posJs.current = vers;
    const de = pos.value;
    if (opts.current.reduit || Math.abs(vers - de) < 1e-3) {
      pos.value = vers;
      return;
    }
    pos.value = withTiming(vers, { duration: ms ?? dureeCases(de, vers), easing: courbes.sortie });
  };
  const amenerRef = useRef(amener);
  amenerRef.current = amener;
  const fondu = (pose: boolean) => {
    const f = fonduSemaine(pose, opts.current.reduit);
    doigt.value = f.ms ? withTiming(f.vers, { duration: f.ms, easing: courbes.sortie }) : f.vers;
  };
  const retour = useRef(minuterieRetour(() => amenerRef.current(opts.current.affichee))).current;
  useEffect(() => retour.annuler, [retour]);

  // Semaine affichée changée (toucher, ↺, appelant) : la bande se recadre sur elle, comme le saut d'un jour.
  useEffect(() => {
    retour.annuler();
    amenerRef.current(affichee, SAUT_MS);
  }, [affichee, retour]);

  /** Toucher une semaine l'affiche ; déjà affichée, la bande revient seulement sur elle. */
  const choisir = (k: number) => {
    retour.annuler();
    if (k === opts.current.affichee) amenerRef.current(k, SAUT_MS);
    else opts.current.onAffiche(k);
  };

  const geste = useRef(0);
  const pan = useRef(
    PanResponder.create({
      // Glisser la bande parcourt les semaines sans changer la semaine affichée (D1).
      onMoveShouldSetPanResponder: (_, e) => horizontal(e.dx, e.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, e) => {
        retour.annuler();
        cancelAnimation(pos);
        fondu(true);
        // Le seuil de prise ne fait pas sauter la bande.
        geste.current = posJs.current + e.dx / Math.max(1, opts.current.g.pas);
      },
      onPanResponderMove: (_, e) => {
        const { g: geo, derniere: max } = opts.current;
        const v = buteeCases(suivreCases(geste.current, e.dx, geo.pas), 0, max, geo.pas);
        pos.value = v;
        posJs.current = v;
      },
      onPanResponderRelease: (_, e) => {
        const { g: geo, derniere: max } = opts.current;
        amenerRef.current(cranCase(posJs.current, e.vx, geo.pas, geste.current, 0, max));
        fondu(false);
        retour.lacher();
      },
      onPanResponderTerminate: () => {
        amenerRef.current(Math.max(0, Math.min(opts.current.derniere, Math.round(posJs.current))));
        fondu(false);
        retour.lacher();
      },
    }),
  ).current;

  // Toucher : la semaine sous le doigt est calculée d'après la bande ; un doigt qui a bougé n'est pas un toucher.
  const appui = useRef({ x: 0, y: 0 });
  const toucherA = (x: number, pageX: number, pageY: number) => {
    if (Math.abs(pageX - appui.current.x) > 10 || Math.abs(pageY - appui.current.y) > 10) return;
    const k = caseTouchee(posJs.current, x, opts.current.g, n);
    if (k != null) choisir(k);
  };

  const piste = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.value * g.pas }] }));
  const traits = useAnimatedStyle(() => ({ opacity: doigt.value }));
  const chevronG = useAnimatedStyle(() => ({ opacity: voisines(pos.value, n).gauche ? 1 - doigt.value : 0 }));
  const chevronD = useAnimatedStyle(() => ({ opacity: voisines(pos.value, n).droite ? 1 - doigt.value : 0 }));

  const mois = separateursMoisSemaines(semaines.map((s) => moisDuJeudi(s.lundi)));
  const entre = separateursEntreSemaines(n, mois);
  const xEcart = (k: number) => g.x0 + k * g.pas - SEMAINES_BANDE.ecart / 2;
  const centre = Math.round(posJs.current);
  return (
    <View>
      <View
        {...pan.panHandlers}
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        style={[styles.bande, marge ? { marginHorizontal: -marge } : null]}
      >
        {largeur > 0 ? (
          <>
            <Reanimated.View style={[styles.piste, piste]}>
              {semaines.map((s, k) => (
                <CaseSemaine
                  key={s.lundi}
                  k={k}
                  lundi={s.lundi}
                  vide={!!s.vide}
                  g={g}
                  pos={pos}
                  affichee={k === affichee}
                  enCours={k === derniere}
                  anneau={avecOpacite(c, 0.45)}
                  onPress={() => choisir(k)}
                />
              ))}
              {/* Entre deux semaines : 4 dp, texte secondaire, seulement pendant le glissé. */}
              <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, traits]}>
                {entre.map((k) => (
                  <View key={`s${k}`} style={[styles.sepSemaine, { left: xEcart(k) - SEMAINIER.semaineLargeur / 2, backgroundColor: couleurs.t2 }]} />
                ))}
              </Reanimated.View>
              {/* Entre deux mois : toujours là, dans la couleur de la partie. */}
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {mois.map((k) => (
                  <View key={`m${k}`} style={[styles.sepMois, { left: xEcart(k) - SEMAINIER.moisLargeur / 2, backgroundColor: c }]} />
                ))}
              </View>
            </Reanimated.View>
            <Chevron cote="g" g={g} style={chevronG} libelle={t("ui.semaines.precedente")} actif={centre > 0} onPress={() => choisir(Math.round(posJs.current) - 1)} />
            <Chevron cote="d" g={g} style={chevronD} libelle={t("ui.semaines.suivante")} actif={centre < derniere} onPress={() => choisir(Math.round(posJs.current) + 1)} />
            {/* Couche de toucher, au-dessus des cases : la semaine touchée est calculée d'après la bande (caseTouchee). Ignorée
                par le lecteur d'écran, qui active les cases et les chevrons eux-mêmes. Un glissé horizontal la cède à la bande. */}
            <View
              collapsable={false}
              accessible={false}
              importantForAccessibility="no"
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                appui.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
              }}
              onResponderRelease={(e) => toucherA(e.nativeEvent.locationX, e.nativeEvent.pageX, e.nativeEvent.pageY)}
            />
          </>
        ) : null}
      </View>
      <View style={styles.ligne}>
        <View accessible accessibilityRole="header" style={styles.titre}>
          <Texte variante="entete" couleur="t2" numberOfLines={1}>
            {titreSemaine(derniere - affichee)}
          </Texte>
          {sous ? (
            <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {sous}
            </Texte>
          ) : null}
        </View>
        {affichee !== derniere ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("ui.semaines.revenir")} onPress={() => onAffiche(derniere)} style={styles.revenir}>
            <Icone nom="retour" couleur={couleurs.t2} taille={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Case d'une semaine. Le libellé long est gardé s'il tient sur une ligne, sinon les mois s'abrègent (« du 26 oct. au 1er nov. »).
 */
function CaseSemaine({
  k, lundi, vide, g, pos, affichee, enCours, anneau, onPress,
}: {
  k: number; lundi: number; vide: boolean; g: GeometrieSemaines; pos: SharedValue<number>; affichee: boolean; enCours: boolean;
  anneau: string; onPress: () => void;
}) {
  const { couleurs } = useTheme();
  const [court, setCourt] = useState(false);
  useEffect(() => setCourt(false), [g.case]);
  const libelle = libelleSemaine(lundi, court);
  const style = useAnimatedStyle(() => ({ opacity: opaciteLibelle(k - pos.value) }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={enCours ? t("ui.semaines.enCours", { libelle }) : vide ? t("ui.semaines.vide", { libelle }) : libelle}
      accessibilityState={{ selected: affichee }}
      onPress={onPress}
      style={[
        styles.case,
        { left: g.x0 + k * g.pas, width: g.case },
        affichee ? { backgroundColor: couleurs.verreCarte, borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.verreFilet } : { borderWidth: 1, borderColor: couleurs.line },
        enCours && { borderWidth: 1, borderColor: anneau },
      ]}
    >
      <Reanimated.View style={style}>
        <Texte
          variante="saisie"
          numberOfLines={2}
          maxFontSizeMultiplier={1.15}
          onTextLayout={(e) => {
            if (!court && e.nativeEvent.lines.length > 1) setCourt(true);
          }}
          style={[styles.libelle, { color: vide ? couleurs.t3 : couleurs.t1 }]}
        >
          {libelle}
        </Texte>
      </Reanimated.View>
    </Pressable>
  );
}

/** Chevron dans la part qui dépasse d'une voisine ; la zone de toucher (calculée par la bande) va de son bord à la case. */
function Chevron({
  cote, g, style, libelle, actif, onPress,
}: {
  cote: "g" | "d"; g: GeometrieSemaines; style: object; libelle: string; actif: boolean; onPress: () => void;
}) {
  const { couleurs } = useTheme();
  // centré dans la part visible de la voisine (de son bord de bande à l'écart)
  const visible = g.x0 - SEMAINES_BANDE.ecart;
  return (
    <Reanimated.View pointerEvents="box-none" style={[styles.chevron, { width: visible, [cote === "g" ? "left" : "right"]: 0 }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={libelle}
        accessibilityElementsHidden={!actif}
        importantForAccessibility={actif ? "auto" : "no-hide-descendants"}
        disabled={!actif}
        onPress={onPress}
        style={styles.chevronCible}
      >
        <Icone nom={cote === "g" ? "left" : "right"} couleur={couleurs.t2} taille={16} />
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  bande: { height: SEMAINES_BANDE.haut, overflow: "hidden" },
  piste: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  case: { position: "absolute", top: 0, height: SEMAINES_BANDE.haut, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", paddingHorizontal: espace.m },
  libelle: { fontSize: 15, lineHeight: 20, fontFamily: police.medium, textAlign: "center" },
  sepMois: {
    position: "absolute", width: SEMAINIER.moisLargeur, borderRadius: SEMAINIER.moisLargeur / 2,
    top: `${50 - (SEMAINIER.moisHauteur * 100) / 2}%`, height: `${SEMAINIER.moisHauteur * 100}%`,
  },
  sepSemaine: {
    position: "absolute", width: SEMAINIER.semaineLargeur, height: SEMAINIER.semaineHauteur, borderRadius: SEMAINIER.semaineLargeur / 2,
    top: "50%", marginTop: -SEMAINIER.semaineHauteur / 2,
  },
  chevron: { position: "absolute", top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  chevronCible: { width: 32, height: SEMAINES_BANDE.haut, alignItems: "center", justifyContent: "center" },
  ligne: { height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: espace.l },
  titre: { flexShrink: 1, flexDirection: "row", alignItems: "baseline", gap: espace.s },
  revenir: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: 2 },
});
