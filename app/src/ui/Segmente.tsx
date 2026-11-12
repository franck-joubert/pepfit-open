import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { courbe } from "../theme/mouvement";
import { police } from "../theme/typo";
import { cible, rayon } from "../theme/typo";
import { reduitMouvement } from "./reduit";
import { Texte } from "./Texte";

interface Props<T extends string> {
  /** `avant` : un repère devant le libellé (carré de statut d'une blessure) ; `sous` : seconde ligne en 11 t3 (« 150 g » sous « Pot »). */
  /** `poids` : part de la largeur (1 par défaut) ; un libellé plus long garde sa taille au lieu de rétrécir (« Onglet fermé »). */
  /** `desactive` : cette option ne se choisit pas (grisée, lecteur d'écran « désactivé ») ; les autres restent libres (« Tout le monde » d'un tracé qui passe près du domicile). */
  options: readonly { valeur: T; libelle: string; avant?: ReactNode; sous?: string; poids?: number; desactive?: boolean }[];
  valeur: T | null;
  onChange: (v: T) => void;
  /** Version compacte, à droite d'une ligne de réglage (maquette `.seg.mini`). */
  mini?: boolean;
  /** Grisé : le choix ne change plus (l'option choisie reste celle qui est posée), lecteur d'écran « désactivé ». */
  desactive?: boolean;
  /** Version des écrans de Santé (planche sante-suivi) : libellé 13, t2 (choisi : t1 medium), fond s1. */
  doux?: boolean;
  /** Dans un groupe (sans effet depuis la v2.2.17 : la piste de la partie, translucide, marche partout). */
  dans?: boolean;
  /** Fond s2 et, le jour, bouton choisi blanc et ombré (planches suivi-gps « Fin » et Lieux « Effort »). */
  jourBlanc?: boolean;
  /**
   * Segmenté glissant (planche parcours, niveaux) : la pastille se tire au doigt d'une option à l'autre, suit le doigt
   * sans retard, puis se pose sur la plus proche (200 ms, courbe sortie), sans vibration (D6 : réservée aux records et aux erreurs) ;
   * toucher une option y va directement. Lecteur d'écran : « réglable ».
   */
  glisse?: boolean;
  /** Options par rangée : les options passent à la ligne dans la même piste (quatre préréglages sur deux rangées de deux aux grandes polices). */
  colonnes?: number;
  style?: StyleProp<ViewStyle>;
}

export function Segmente<T extends string>(props: Props<T>) {
  return props.glisse ? <SegmenteGlisse {...props} /> : <SegmenteFixe {...props} />;
}

function SegmenteFixe<T extends string>({ options, valeur, onChange, mini, desactive, doux, jourBlanc, colonnes, style }: Props<T>) {
  const { couleurs, mode } = useTheme();
  // Plus de gris (v2.2.17, le 29/10) : piste de la partie très pâle, option choisie blanche et ombrée le jour, de la
  // partie la nuit. `dans` ne change plus rien : la piste translucide marche sur le fond comme sur une carte.
  const fond = couleurs.segmentPiste;
  const blanc = mode === "jour";
  const choisi = couleurs.segmentChoisi;
  return (
    <View accessibilityRole="radiogroup" accessibilityState={desactive ? { disabled: true } : undefined} style={[styles.groupe, colonnes ? styles.lignes : null, { backgroundColor: fond }, desactive && styles.grise, style]}>
      {options.map((o) => {
        const actif = o.valeur === valeur;
        return (
          <Pressable
            key={o.valeur}
            accessibilityRole="radio"
            accessibilityState={{ checked: actif, disabled: desactive || o.desactive }}
            accessibilityLabel={o.libelle}
            disabled={desactive || o.desactive}
            onPress={() => onChange(o.valeur)}
            hitSlop={mini ? 4 : undefined}
            style={[styles.option, mini && styles.mini, (doux || !!o.avant) && styles.doux, o.poids ? { flex: o.poids } : null, colonnes ? { flexBasis: `${Math.floor(100 / colonnes) - 5}%` } : null, o.desactive && styles.grise, { backgroundColor: actif ? choisi : "transparent" }, actif && blanc && styles.ombre]}
          >
            {o.avant}
            {doux ? (
              <Texte variante="corps" numberOfLines={1} style={{ fontSize: 13, color: actif ? couleurs.t1 : couleurs.t2, fontFamily: actif ? (jourBlanc ? police.semibold : police.medium) : jourBlanc ? police.medium : police.regular }}>
                {o.libelle}
              </Texte>
            ) : (
              o.sous ? (
                <View style={{ alignItems: "center" }}>
                  <Texte variante="exercice" couleur={actif ? "t1" : "t3"} numberOfLines={1} adjustsFontSizeToFit>
                    {o.libelle}
                  </Texte>
                  <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ fontSize: 11, marginTop: 1 }}>
                    {o.sous}
                  </Texte>
                </View>
              ) : (
                <Texte variante="exercice" couleur={actif ? "t1" : "t3"} numberOfLines={1} adjustsFontSizeToFit>
                  {o.libelle}
                </Texte>
              )
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const POSE_MS = 200;
const PADDING = 3;
const ECART = 3;
const posee = Easing.bezier(...courbe.sortie);

function SegmenteGlisse<T extends string>({ options, valeur, onChange, style }: Props<T>) {
  const { couleurs, mode } = useTheme();
  const n = options.length;
  const k = Math.max(0, options.findIndex((o) => o.valeur === valeur));
  const [largeur, setLargeur] = useState(0);
  const pas = largeur ? (largeur - 2 * PADDING - (n - 1) * ECART) / n + ECART : 0;
  const x = useRef(new Animated.Value(0)).current;
  // Option sous la pastille pendant le geste (libellé en t1), null au repos.
  const [vu, setVu] = useState<number | null>(null);
  const etat = useRef({ k, pas, n, prise: null as null | { tire: boolean; vu: number } });
  etat.current.k = k;
  etat.current.pas = pas;
  etat.current.n = n;
  const surChange = useRef(onChange);
  surChange.current = onChange;
  const valeurs = useRef(options.map((o) => o.valeur));
  valeurs.current = options.map((o) => o.valeur);

  const poser = (i: number, animee: boolean) => {
    const { pas: p } = etat.current;
    if (!p) return;
    if (animee && !reduitMouvement()) Animated.timing(x, { toValue: i * p, duration: POSE_MS, easing: posee, useNativeDriver: true }).start();
    else x.setValue(i * p);
  };
  useEffect(() => {
    if (!etat.current.prise) poser(k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  useEffect(() => {
    poser(k, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pas]);

  const choisir = (i: number) => {
    setVu(null);
    poser(i, true);
    if (i !== etat.current.k) surChange.current(valeurs.current[i]!);
  };

  const geste = useMemo(() => {
    const sous = (lx: number) => {
      const { pas: p, n: nb } = etat.current;
      return Math.max(0, Math.min(nb - 1, Math.floor((lx - PADDING) / p)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const i = sous(e.nativeEvent.locationX);
        etat.current.prise = { tire: i === etat.current.k, vu: etat.current.k };
      },
      onPanResponderMove: (_, g) => {
        const { prise, k: kc, pas: p, n: nb } = etat.current;
        if (!prise?.tire || !p) return;
        const v = Math.max(0, Math.min((nb - 1) * p, kc * p + g.dx));
        x.setValue(v);
        const i = Math.round(v / p);
        if (i !== prise.vu) {
          prise.vu = i;
          setVu(i);
        }
      },
      onPanResponderRelease: (e) => {
        const { prise } = etat.current;
        etat.current.prise = null;
        if (!prise) return;
        const i = prise.tire ? prise.vu : sous(e.nativeEvent.locationX);
        choisir(i);
      },
      onPanResponderTerminate: () => {
        const { prise } = etat.current;
        etat.current.prise = null;
        choisir(prise?.tire ? prise.vu : etat.current.k);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actif = vu ?? k;
  const blanc = mode === "jour";
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ text: options[k]?.libelle ?? "" }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => choisir(Math.max(0, Math.min(n - 1, k + (e.nativeEvent.actionName === "increment" ? 1 : -1))))}
      onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      style={[styles.groupe, { backgroundColor: couleurs.segmentPiste, minHeight: 44 }, style]}
      {...geste.panHandlers}
    >
      {pas ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pastille,
            { width: pas - ECART, backgroundColor: couleurs.segmentChoisi, transform: [{ translateX: x }] },
            blanc && styles.ombre,
          ]}
        />
      ) : null}
      {options.map((o, i) => (
        <View key={o.valeur} pointerEvents="none" style={styles.optionGlisse}>
          <Texte
            variante="corps"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontSize: 13, color: i === actif ? couleurs.t1 : couleurs.t2, fontFamily: i === actif ? police.semibold : police.medium }}
          >
            {o.libelle}
          </Texte>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pastille: { position: "absolute", top: PADDING, bottom: PADDING, left: PADDING, borderRadius: 9 },
  optionGlisse: { flex: 1, flexBasis: 0, minWidth: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  groupe: { flexDirection: "row", borderRadius: rayon.l, padding: 3, gap: 3 },
  grise: { opacity: 0.4 },
  lignes: { flexWrap: "wrap" },
  option: {
    flex: 1,
    minHeight: cible.min,
    borderRadius: rayon.m,
    alignItems: "center",
    justifyContent: "center",
  },
  mini: { flex: 0, minWidth: 48, minHeight: 36, paddingHorizontal: 14 },
  doux: { flexDirection: "row", gap: 6, paddingHorizontal: 6 },
  ombre: { shadowColor: "#111418", shadowOpacity: 0.14, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});
