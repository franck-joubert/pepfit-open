import { useEffect, useMemo } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, {
  cancelAnimation, FadeInDown, ReduceMotion, useAnimatedProps, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withSpring, withTiming,
} from "react-native-reanimated";
import { Vignette as VignetteBoutique } from "../boutique/ui";
import { useTheme } from "../theme";
import { avecOpacite } from "../theme/teintes";
import { duree, echelle, glissement, ressort } from "../theme/mouvement";
import { espace, police, POLICE_MAX, rayon } from "../theme/typo";
import { t, tp } from "../i18n/index";
import { courbes } from "../ui/mouvement";
import { Picto } from "../ui/Picto";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import { texteQuand } from "./Planif";
import { jourDe } from "./planif-donnees";
import { etapesCompte, texteEtape } from "./saisie-seance";
import type { Avancement, EtatCase } from "./tiroir-seance-calc";
import type { LienProgramme } from "./tiroir-seance-donnees";

// Avancement du programme (planche seance-tiroirs v2, D5, validée le 03/11) : une ligne jusqu'à 20 séances (séances groupées
// par semaine, 4 px entre deux, 12 entre deux semaines), la grille au-delà (une colonne par semaine). Cases de 6 px, rayon 3,
// 4 px entre deux lignes. Fait : vert validé adouci ; manqué : contour ; à venir : s3 ; aujourd'hui : anneau t1. En fin de
// séance, la case du jour se remplit en vert plein (ressort de la coche, 450 ms après l'ouverture ; réduire les animations :
// fondu de couleur de 150 ms). Une image pour l'accessibilité : pas de zone de clic, un libellé complet.

const HAUT = 6;
const ECART_LIGNE = 4;
const ECART_SEMAINE = 12;
/** Départs de la fin de séance (planche, tableau du mouvement) : bloc à 150 ms, case du jour et comptes à 450 ms. */
export const DEPART_BLOC = 150;
const DEPART_CASE = 450;
const COMPTE_MS = 400;

/** Vert « fait » : le vert validé à 42 % la nuit, 36 % le jour (jeton valide-doux de la planche). */
const valideDoux = (valide: string, mode: "jour" | "nuit") => avecOpacite(valide, mode === "nuit" ? 0.42 : 0.36);

export function CasesAvancement({ a, fin = false, animer = false, libelle }: { a: Avancement; fin?: boolean; animer?: boolean; libelle: string }) {
  const ligne = a.forme === "ligne";
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={libelle}
      style={[styles.cases, { gap: ligne ? ECART_SEMAINE : a.ecartColonnes }]}
    >
      {a.colonnes.map((col, i) => (
        <View key={i} style={ligne ? { flex: col.length, flexDirection: "row", gap: ECART_LIGNE } : { flex: 1, gap: ECART_LIGNE }}>
          {col.map((e, k) => (
            <Case key={k} etat={e} fin={fin} animer={animer} ligne={ligne} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Case({ etat, fin, animer, ligne }: { etat: EtatCase; fin: boolean; animer: boolean; ligne: boolean }) {
  const { couleurs, mode } = useTheme();
  const fond =
    etat === "faite" ? valideDoux(couleurs.valide, mode) : etat === "manquee" ? "transparent" : couleurs.s3;
  return (
    <View style={[styles.case, ligne && { flex: 1 }, { backgroundColor: fond }, etat === "manquee" && { borderWidth: 1, borderColor: couleurs.t3 }]}>
      {etat === "ici" ? fin ? <CaseDuJour animer={animer} /> : <View style={[styles.anneau, { borderColor: couleurs.t1 }]} /> : null}
    </View>
  );
}

/** Case du jour en fin de séance : le vert plein monte (0,6 → 1, ressort de la coche) pendant que l'anneau s'efface. */
function CaseDuJour({ animer }: { animer: boolean }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const p = useSharedValue(animer ? 0 : 1);
  const anneau = useSharedValue(animer ? 1 : 0);
  useEffect(() => {
    if (!animer) return;
    const jamais = { reduceMotion: ReduceMotion.Never };
    p.value = 0;
    anneau.value = 1;
    p.value = withDelay(DEPART_CASE, reduit ? withTiming(1, { duration: duree.sortie, easing: courbes.sortie, ...jamais }) : withSpring(1, { ...ressort.coche, ...jamais }), ReduceMotion.Never);
    anneau.value = withDelay(DEPART_CASE, withTiming(0, { duration: duree.sortie, easing: courbes.sortie, ...jamais }), ReduceMotion.Never);
    return () => {
      cancelAnimation(p);
      cancelAnimation(anneau);
    };
  }, [animer, reduit, p, anneau]);
  const plein = useAnimatedStyle(() =>
    reduit
      ? { opacity: p.value }
      : { opacity: Math.min(1, p.value * 3), transform: [{ scale: echelle.cocheDepart + (1 - echelle.cocheDepart) * p.value }] },
  );
  const bague = useAnimatedStyle(() => ({ opacity: anneau.value }));
  return (
    <>
      <Animated.View style={[styles.anneau, { borderColor: couleurs.t1 }, bague]} />
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: HAUT / 2, backgroundColor: couleurs.valide }, plein]} />
    </>
  );
}

/** Libellé complet de l'avancement (lecteur d'écran). */
export const libelleAvancement = (nom: string, a: Avancement) =>
  t("tiroirs.libelle", {
    programme: nom,
    faites: a.faites,
    total: a.total,
    manquees: a.colonnes.flat().filter((e) => e === "manquee").length,
    semaine: a.semaine,
    semaines: a.semaines,
  });

/** Vignette du programme (catalogue), sinon le picto du premier exercice de la séance. */
export function VignetteProgramme({ lien, taille = 44 }: { lien: LienProgramme; taille?: number }) {
  const { couleurs } = useTheme();
  return lien.programme ? (
    <VignetteBoutique p={lien.programme} hauteur={taille} largeur={taille} rayon={10} chiffre={false} />
  ) : (
    <View style={[styles.vignette, { width: taille, height: taille, backgroundColor: couleurs.s3 }]}>
      <Picto slug={lien.picto} taille={taille} />
    </View>
  );
}

/**
 * Bloc programme de la fin de séance (D10) : entre le titre et les cartes record ; se pose à 150 ms (8 px et fondu, 300 ms),
 * la case du jour se remplit et le pourcentage compte à 450 ms. `animer` faux : posé, valeurs finales.
 */
export function BlocProgrammeFin({ lien, animer }: { lien: LienProgramme; animer: boolean }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const a = lien.avancement;
  const compte = animer && !reduit;
  const pourcent = useMemo(() => (compte ? etapesCompte(a.pourcentAvant, a.pourcent, (x) => `${Math.round(x)} %`, Math.max(1, a.pourcent - a.pourcentAvant)) : [`${a.pourcent} %`]), [compte, a.pourcentAvant, a.pourcent]);
  const faites = useMemo(() => (compte ? etapesCompte(a.faitesAvant, a.faites, (x) => String(Math.round(x)), Math.max(1, a.faites - a.faitesAvant)) : [String(a.faites)]), [compte, a.faitesAvant, a.faites]);
  const auj = jourDe(Date.now());
  return (
    <Animated.View
      entering={animer && !reduit ? FadeInDown.delay(DEPART_BLOC).duration(duree.record).easing(courbes.sortie).withInitialValues({ transform: [{ translateY: glissement.record }] }) : undefined}
      style={[styles.bloc, { backgroundColor: couleurs.s1 }]}
    >
      <View style={styles.tete}>
        <VignetteProgramme lien={lien} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="exercice" numberOfLines={1}>
            {lien.nom}
          </Texte>
          <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ marginTop: 2 }}>
            {t("tiroirs.semaine", { semaine: a.semaine, semaines: a.semaines })}
          </Texte>
        </View>
        <Compte etapes={pourcent} actif={compte} style={styles.pourcent} />
      </View>
      <View style={{ marginTop: espace.m }}>
        <CasesAvancement a={a} fin animer={animer} libelle={libelleAvancement(lien.nom, a)} />
      </View>
      <View style={styles.legende}>
        <Compte etapes={faites} actif={compte} style={[styles.legendeTexte, { fontFamily: police.semibold }]} />
        <Texte variante="corps" couleur="t2" numberOfLines={1} style={[styles.legendeTexte, { flexShrink: 1 }]}>
          {t("tiroirs.faitesSur", { total: a.total })}
          {", "}
          {a.derniere ? (
            <Texte variante="corps" couleur="valide" style={{ fontFamily: police.semibold }}>
              {t("tiroirs.termine")}
            </Texte>
          ) : a.prochaine ? (
            t("tiroirs.prochaine", { quand: texteQuand(a.prochaine, auj) })
          ) : null}
        </Texte>
      </View>
    </Animated.View>
  );
}

/** Séance hors programme en fin de séance (D9) : une ligne calme, sans mouvement. */
export function LigneHorsProgrammeFin({ lien }: { lien: LienProgramme }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.bloc, styles.tete, { backgroundColor: couleurs.s1 }]}>
      <VignetteProgramme lien={lien} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="exercice" numberOfLines={1}>
          {lien.nom}
        </Texte>
        <Texte variante="corps" couleur="t2" numberOfLines={2} style={{ marginTop: 2 }}>
          {t("tiroirs.hors.fin", { n: lien.avancement.rang ?? lien.avancement.faites + 1 })}
        </Texte>
      </View>
    </View>
  );
}

/** Nombre de séances (« 3 exercices · 11 séries ») réutilisé par le tiroir. */
export const resumeSeries = (exercices: number, series: number) =>
  t("tiroirs.resume", { exercices: tp("tiroirs.exercices", exercices), series: tp("tiroirs.series", series) });

const TexteCompte = Animated.createAnimatedComponent(TextInput);

/** Chiffre qui compte en 400 ms (courbe de sortie) à 450 ms, sur le fil UI (comme les cartes record de done.tsx). */
function Compte({ etapes, actif, style }: { etapes: readonly string[]; actif: boolean; style: object | object[] }) {
  const { couleurs } = useTheme();
  const p = useSharedValue(actif ? 0 : 1);
  useEffect(() => {
    if (!actif) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withDelay(DEPART_CASE, withTiming(1, { duration: COMPTE_MS, easing: courbes.sortie }));
    return () => cancelAnimation(p);
  }, [actif, p]);
  const texte = useDerivedValue(() => texteEtape(etapes, p.value), [etapes]);
  const props = useAnimatedProps(() => ({ text: texte.value, defaultValue: texte.value }) as never);
  if (!actif)
    return (
      <Texte numberOfLines={1} style={[style, { color: couleurs.t1 }]}>
        {etapes[etapes.length - 1]}
      </Texte>
    );
  return (
    <TexteCompte
      editable={false}
      caretHidden
      pointerEvents="none"
      importantForAccessibility="no"
      underlineColorAndroid="transparent"
      defaultValue={etapes[0]}
      animatedProps={props}
      maxFontSizeMultiplier={POLICE_MAX}
      numberOfLines={1}
      style={[style, styles.champ, { color: couleurs.t1 }]}
    />
  );
}

const styles = StyleSheet.create({
  cases: { flexDirection: "row" },
  case: { height: HAUT, borderRadius: HAUT / 2 },
  // Anneau du jour : 3 px autour de la case, trait de 1,5 px.
  anneau: { position: "absolute", top: -3, bottom: -3, left: -3, right: -3, borderRadius: HAUT / 2 + 3, borderWidth: 1.5 },
  vignette: { borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  bloc: { marginHorizontal: espace.l, marginBottom: espace.m, borderRadius: rayon.l, padding: espace.l },
  tete: { flexDirection: "row", alignItems: "center", gap: espace.m },
  pourcent: { fontFamily: police.semibold, fontSize: 15, fontVariant: ["tabular-nums"] },
  legende: { flexDirection: "row", alignItems: "baseline", marginTop: espace.m },
  legendeTexte: { fontSize: 13, fontVariant: ["tabular-nums"] },
  champ: { padding: 0, margin: 0 },
});
