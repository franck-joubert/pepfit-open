import { useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { cancelAnimation, Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { carteOr } from "../theme/effets";
import { boucleMedaille, duree, echelle, glissement, reflet, ressort } from "../theme/mouvement";
import { espace, police, rayon } from "../theme/typo";
import { BoutonTonal } from "../ui/BoutonTonal";
import { BoutonPrincipal, FondDegrade, Reflet } from "../ui/Degrade";
import { Feuille } from "../ui/Feuille";
import { haptique } from "../ui/haptique";
import { Medaille } from "../ui/Medaille";
import { courbes } from "../ui/mouvement";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { nombre } from "./format";
import { lireCarteFin, type CarteFin } from "./tiroir-seance-donnees";

// Carte de fin de programme (planche seance-tiroirs v2, D11 à D14) : après « Enregistrer » de la dernière séance, une feuille
// sur l'onglet Sport. Héros doré (la médaille fait un demi-tour à 280 ms, sur le ressort des records ; retour tactile au même
// moment), le nom du programme, « Programme terminé », notre bravo. Trois chiffres (360, 400, 440 ms). « Choisir la suite » ouvre
// la boutique sur les programmes (D14). Pas de confettis : la médaille, le reflet doré et le retour tactile suffisent.

const DEPART_MEDAILLE = 280;
const DEPART_CHIFFRES = [360, 400, 440] as const;
const courbeReflet = Easing.bezier(...reflet.courbeMedaille);

let planId: string | null = null;
const abonnes = new Set<() => void>();
const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => void abonnes.delete(f);
};
const poser = (id: string | null) => {
  planId = id;
  abonnes.forEach((f) => f());
};

/** Ouvre la carte de fin du programme `id` (appelé par l'écran de fin après l'enregistrement de la dernière séance). */
export const montrerFinProgramme = (id: string) => poser(id);

export function CarteFinProgramme() {
  useLangue();
  const { db } = useApp();
  const id = useSyncExternalStore(abonner, () => planId);
  const [c, setC] = useState<CarteFin | null>(null);

  useEffect(() => {
    if (!id) {
      setC(null);
      return;
    }
    let vif = true;
    (async () => {
      const x = await lireCarteFin(db, id);
      if (!vif) return;
      if (!x) return poser(null);
      setC(x);
    })().catch(() => poser(null));
    return () => {
      vif = false;
    };
  }, [db, id]);

  const fermer = () => poser(null);
  const suite = () => {
    fermer();
    router.push({ pathname: "/boutique", params: { genre: "programme" } });
  };

  return (
    <Feuille
      visible={c != null && c.planId === id}
      onFermer={fermer}
      pied={
        <View style={{ gap: espace.s }}>
          <BoutonPrincipal libelle={t("tiroirs.carte.suite")} onPress={suite} />
          <BoutonTonal libelle={t("ui.fermer")} onPress={fermer} />
        </View>
      }
    >
      {c ? <Contenu c={c} /> : null}
    </Feuille>
  );
}

function Contenu({ c }: { c: CarteFin }) {
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const or = carteOr[mode];
  // Texte secondaire du héros : blanc à 76 % la nuit (4,5:1 sur le haut doré), t2 le jour (planche, relecture).
  const t2Heros = mode === "nuit" ? "rgba(255,255,255,0.76)" : couleurs.t2;

  // Médaille : demi-tour de 0,8 à 1 sur le ressort des records, à 280 ms ; retour tactile au même moment.
  const tour = useSharedValue(reduit ? 1 : 0);
  useEffect(() => {
    const h = setTimeout(() => haptique.succes(), DEPART_MEDAILLE);
    if (!reduit) tour.value = withDelay(DEPART_MEDAILLE, withSpring(1, ressort.record));
    return () => {
      clearTimeout(h);
      cancelAnimation(tour);
    };
  }, [reduit, tour]);
  const medaille = useAnimatedStyle(() => ({
    opacity: Math.min(1, tour.value * 2),
    transform: [{ perspective: 200 }, { rotateY: `${-180 * (1 - tour.value)}deg` }, { scale: echelle.recordDepart + (1 - echelle.recordDepart) * tour.value }],
  }));

  // Reflet du héros : 1 280 ms (1 s après la médaille), puis toutes les 6 s, comme les cartes record.
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduit) return;
    const b = boucleMedaille();
    let m: ReturnType<typeof setTimeout>;
    const passer = () => {
      p.value = 0;
      p.value = withTiming(1, { duration: b.passage, easing: courbeReflet });
      m = setTimeout(passer, b.passage + b.pause);
    };
    m = setTimeout(passer, DEPART_MEDAILLE + b.delai);
    return () => {
      clearTimeout(m);
      cancelAnimation(p);
      p.value = 0;
    };
  }, [reduit, p]);

  const entree = (delai: number) =>
    reduit ? undefined : FadeInDown.delay(delai).duration(duree.record).easing(courbes.sortie).withInitialValues({ transform: [{ translateY: glissement.record }] });

  const chiffres = [
    { valeur: String(c.faites), suite: ` / ${c.total}`, libelle: tp("tiroirs.carte.seances", c.total) },
    { valeur: String(c.semaines), suite: "", libelle: tp("tiroirs.carte.semaines", c.semaines) },
    ...(c.gain ? [{ valeur: `+${nombre(c.gain.kg, 1)}`, suite: " kg", libelle: c.gain.nom }] : []),
  ];

  return (
    <View accessibilityRole="summary" accessibilityLabel={`${c.nom}, ${t("tiroirs.carte.termine")}`}>
      <View style={[styles.heros, { backgroundColor: or.fond, borderColor: or.filet, boxShadow: or.ombre }]}>
        <View style={styles.coupe}>
          <FondDegrade arrets={or.arrets} angle={135} />
          {reduit ? null : <Reflet p={p} arrets={or.reflet} />}
        </View>
        <Animated.View style={medaille}>
          <Medaille taille={56} />
        </Animated.View>
        <Texte variante="corps" numberOfLines={2} style={[styles.prog, { color: t2Heros }]}>
          {c.nom}
        </Texte>
        <Texte variante="titre" accessibilityRole="header" style={styles.titre}>
          {t("tiroirs.carte.termine")}
        </Texte>
        <Texte variante="corps" style={[styles.mot, { color: t2Heros }]}>
          {c.prenom ? tp("tiroirs.carte.bravo", c.semaines, { prenom: c.prenom }) : tp("tiroirs.carte.bravoSeul", c.semaines)}
        </Texte>
      </View>

      <View style={styles.chiffres}>
        {chiffres.map((x, i) => (
          <Animated.View
            key={i}
            entering={entree(DEPART_CHIFFRES[i]!)}
            accessible
            accessibilityLabel={`${x.valeur}${x.suite}, ${x.libelle}`}
            style={[styles.chiffre, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: couleurs.line }]}
          >
            <Texte numberOfLines={1} style={[styles.valeur, { color: couleurs.t1 }]}>
              {x.valeur}
              {x.suite ? <Texte style={[styles.suite, { color: couleurs.t3 }]}>{x.suite}</Texte> : null}
            </Texte>
            <Texte variante="meta" couleur="t2" numberOfLines={1} style={{ marginTop: 2 }}>
              {x.libelle}
            </Texte>
          </Animated.View>
        ))}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  heros: { alignItems: "center", borderRadius: rayon.xl, borderWidth: 1, paddingTop: espace.xxl, paddingHorizontal: espace.xl, paddingBottom: 22, overflow: "hidden" },
  coupe: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: rayon.xl, overflow: "hidden" },
  prog: { marginTop: espace.m, fontSize: 14, fontFamily: police.medium, textAlign: "center" },
  titre: { marginTop: 2, fontSize: 24, fontFamily: police.semibold, textAlign: "center" },
  mot: { marginTop: espace.s, maxWidth: 300, fontSize: 14, lineHeight: 20, textAlign: "center" },
  chiffres: { flexDirection: "row", marginTop: espace.l },
  chiffre: { flex: 1, alignItems: "center", paddingVertical: 6 },
  valeur: { fontSize: 24, lineHeight: 30, fontFamily: police.light, fontVariant: ["tabular-nums"] },
  suite: { fontSize: 13, fontFamily: police.regular },
});
