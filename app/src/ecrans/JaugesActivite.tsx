// Jauges de la page Activité (09/11 ; planche activite-jauges) : Récupération, Pas et Effort en grand, aérées, en tête de
// page : l'icône et la valeur dans l'anneau, le libellé dessous. Au défilement elles se métamorphosent en la petite ligne fixée
// sous le semainier (anneau de 20 à gauche de sa case, valeur et unité à droite) et se défont en remontant. Le calcul est pur
// (metamorphose-jauges.ts) ; ici, tout est lu sur le fil UI : transform et opacité des éléments, géométrie de l'anneau par
// animatedProps (AnneauSport `morphe`), aucun re-rendu à chaque pixel. Une seule composante pour les deux états : la copie
// posée dans la page (avancement 0, elle défile et glisse avec les jours) et la copie fixée par-dessus (avancement suivant le
// défilement) se relaient quand l'avancement quitte 0 (train.tsx) ; elles sont identiques à 0.
// Toute la case se touche (Récupération, Pas, Effort ouvrent leur page) : la zone suit la hauteur de la rangée, jamais moins de
// 44. Même rangée sur le Fold déplié (anneau de 112) que sur le téléphone (96).
import { StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { router } from "expo-router";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police } from "../theme/typo";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { AnneauSport } from "./AnneauSport";
import { Os } from "./mesures/gabarit";
import { HAUT_LIGNE, etatCellule, hauteurRangee, mesures, type Mesures } from "./metamorphose-jauges";
import { lireJauges, useStatsJour, type JaugeLue } from "./RangeeSport";

type Props = {
  date: string;
  /** Avancement de la métamorphose, 0 (grandes) à 1 (fixées), sur le fil UI. */
  p: SharedValue<number>;
  /** Opacité de la rangée entière, 0 à 1, sur le fil UI : les deux copies se relaient. */
  visible: SharedValue<number>;
  /** Vrai : cette copie prend les touches et se lit au lecteur d'écran. */
  actif: boolean;
};

/** En attendant les chiffres : les trois cases à leur place, anneau vide et barre à la place de la valeur. */
const EN_ATTENTE = [
  { cle: "recup", icone: "pouls", libelle: "recup.titre", unite: "recup.court" },
  { cle: "pas", icone: "pas", libelle: "sportStats.pas", unite: "sportStats.unitePas" },
  { cle: "effort", icone: "eclair", libelle: "sportStats.effort", unite: "sportStats.uniteEffort" },
] as const;

export function JaugesActivite({ date, p, visible, actif }: Props) {
  const s = useStatsJour(date);
  // La page a ses marges de 16 ; Fold déplié (colonne large) : anneau de 112.
  const { width } = useWindowDimensions();
  const large = width >= 600;
  const largeur = width - 2 * espace.l;
  const m = mesures(large);
  const cw = largeur / 3;
  const rangee = useAnimatedStyle(() => ({ opacity: visible.value }));
  const jauges = s ? lireJauges(s) : null;
  const jour = s ? String(s.jour) : "";
  return (
    <Animated.View
      pointerEvents={actif ? "box-none" : "none"}
      accessibilityElementsHidden={!actif}
      importantForAccessibility={actif ? "auto" : "no-hide-descendants"}
      style={[{ width: largeur, height: m.hauteur }, rangee]}
    >
      {EN_ATTENTE.map((x, i) => {
        const j = jauges?.[i];
        return (
          <Cellule
            key={x.cle}
            rang={i}
            cw={cw}
            m={m}
            p={p}
            large={large}
            icone={x.icone}
            libelle={j?.libelle ?? t(x.libelle)}
            unite={j?.unite ?? t(x.unite)}
            jauge={j}
            onPress={j ? () => router.push({ pathname: j.route, params: { jour } }) : undefined}
          />
        );
      })}
    </Animated.View>
  );
}

function Cellule({
  rang,
  cw,
  m,
  p,
  large,
  icone,
  libelle,
  unite,
  jauge,
  onPress,
}: {
  rang: number;
  cw: number;
  m: Mesures;
  p: SharedValue<number>;
  large: boolean;
  icone: JaugeLue["icone"];
  libelle: string;
  unite: string;
  jauge?: JaugeLue;
  onPress?: () => void;
}) {
  const { couleurs } = useTheme();
  const k = m.k;
  // La zone de la case suit la rangée (jamais sous 44) : repliée, elle ne couvre pas la liste dessous.
  const zone = useAnimatedStyle(() => ({ height: Math.max(HAUT_LIGNE, hauteurRangee(p.value, m)) }));
  const bague = useAnimatedStyle(() => {
    const e = etatCellule(p.value, cw, m);
    return { transform: [{ translateX: e.gauche + e.taille / 2 - m.anneau / 2 }, { translateY: e.haut + e.taille / 2 - m.anneau / 2 }, { scale: e.echelle }] };
  });
  const pictogramme = useAnimatedStyle(() => {
    const e = etatCellule(p.value, cw, m);
    return { opacity: e.iconeOpacite, transform: [{ translateX: e.cx - cw / 2 }, { translateY: e.iconeY - 9 }, { scale: e.iconeEchelle }] };
  });
  const dedans = useAnimatedStyle(() => {
    const e = etatCellule(p.value, cw, m);
    return { opacity: e.dedansOpacite, transform: [{ translateX: e.cx - cw / 2 }, { translateY: e.dedansY - 10 * k }, { scale: e.dedansEchelle }] };
  });
  const dehors = useAnimatedStyle(() => {
    const e = etatCellule(p.value, cw, m);
    return { opacity: e.dehorsOpacite, transform: [{ translateX: e.dehorsX }, { translateY: e.cy - 9 }] };
  });
  const uniteStyle = useAnimatedStyle(() => ({ opacity: etatCellule(p.value, cw, m).uniteOpacite }));
  const legende = useAnimatedStyle(() => {
    const e = etatCellule(p.value, cw, m);
    return { opacity: e.libelleOpacite, transform: [{ translateX: e.cx - cw / 2 }, { translateY: e.libelleY }] };
  });
  const contenu = (
    <>
      <Animated.View pointerEvents="none" style={[styles.bague, { width: m.anneau, height: m.anneau }, bague]}>
        <AnneauSport
          part={jauge?.part ?? 0}
          zone={jauge?.zone ?? null}
          etat={jauge?.etat ?? "cours"}
          taille={m.anneau}
          geo="grand"
          morphe={{ p, mesures: m }}
        />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.pictogramme, { left: cw / 2 - 9 }, pictogramme]}>
        <Icone nom={icone} couleur={couleurs.t2} taille={18} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.dedans, { width: cw, height: 20 * k }, dedans]}>
        {jauge ? (
          <Texte numberOfLines={1} style={[styles.valeurGrande, { fontSize: 20 * k, lineHeight: 20 * k, color: couleurs.t1 }]}>
            {jauge.valeur}
            {jauge.suffixe ? <Texte style={[styles.suffixeGrand, { fontSize: 16 * k, color: couleurs.t2 }]}>{` ${jauge.suffixe}`}</Texte> : null}
          </Texte>
        ) : (
          <Os largeur={44} hauteur={14} rayon={7} />
        )}
      </Animated.View>
      {jauge ? (
        <Animated.View pointerEvents="none" style={[styles.dehors, dehors]}>
          <Texte numberOfLines={1} style={[styles.valeurPetite, { color: couleurs.t1 }]}>
            {jauge.valeur}
            {jauge.suffixe ? <Texte style={[styles.suffixePetit, { color: couleurs.t2 }]}>{` ${jauge.suffixe}`}</Texte> : null}
          </Texte>
          <Animated.View style={uniteStyle}>
            <Texte numberOfLines={1} style={[styles.unite, { color: couleurs.t3 }]}>{` ${unite}`}</Texte>
          </Animated.View>
        </Animated.View>
      ) : null}
      <Animated.View pointerEvents="none" style={[styles.legende, { width: cw }, legende]}>
        <Texte numberOfLines={1} style={[styles.libelle, { color: couleurs.t2 }, large && { fontSize: 14 }]}>
          {libelle}
        </Texte>
      </Animated.View>
    </>
  );
  // `Appui` est un Pressable animé : il prend le style animé de la zone (la hauteur), seul le type de `style` ne le dit pas.
  const place = [styles.case, { left: rang * cw, width: cw }, zone] as unknown as StyleProp<ViewStyle>;
  // Sans chiffres, la case n'ouvre rien : une vue, pas un bouton.
  if (!onPress || !jauge) return <Animated.View style={place}>{contenu}</Animated.View>;
  return (
    <Appui accessibilityRole="button" accessibilityLabel={jauge.lu} onPress={onPress} style={place}>
      {contenu}
    </Appui>
  );
}

const styles = StyleSheet.create({
  case: { position: "absolute", top: 0 },
  bague: { position: "absolute", left: 0, top: 0 },
  pictogramme: { position: "absolute", top: 0, width: 18, height: 18 },
  dedans: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center" },
  valeurGrande: { fontFamily: police.semibold, letterSpacing: -0.2, fontVariant: ["tabular-nums"], includeFontPadding: false },
  suffixeGrand: { fontFamily: police.regular, letterSpacing: 0 },
  dehors: { position: "absolute", left: 0, top: 0, height: 18, flexDirection: "row", alignItems: "baseline" },
  valeurPetite: { fontFamily: police.semibold, fontSize: 14, lineHeight: 18, letterSpacing: -0.1, fontVariant: ["tabular-nums"], includeFontPadding: false },
  suffixePetit: { fontFamily: police.regular, fontSize: 12, letterSpacing: 0 },
  unite: { fontFamily: police.regular, fontSize: 12, lineHeight: 18, letterSpacing: 0, includeFontPadding: false },
  legende: { position: "absolute", left: 0, top: 0, height: 16, alignItems: "center" },
  libelle: { fontFamily: police.regular, fontSize: 13, lineHeight: 16, includeFontPadding: false },
});
