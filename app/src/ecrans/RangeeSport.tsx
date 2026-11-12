// Rangée des jauges de Sport (planche sport-stats v2, S1, S2, S3, S7 ; validée le 30/10) : sous la date, avant les séances, à
// la place de la carte « Ma journée ». Trois cases (1,2 : 1 : 1) : un anneau de 40 dp avec son icône (pouls, pas, éclair), puis
// le libellé et la valeur. La Récupération pepfit remplace la dépense (planche recuperation, le 31/10) : « 90 % », son
// anneau sur 100, vert dès « Prêt », orange en dessous, jamais rouge (D8) ; la dépense reste dans Santé et la page Effort.
// Plus de référence sous la valeur (« / 8 000 », « cible 6,5 – 7 ») : l'anneau dit la part de l'objectif, la page de la jauge
// le chiffre (31/10) ; la rangée est resserrée d'autant.
// L'effort est l'Effort pepfit (planche effort-pepfit) : le chiffre seul, sans unité ; son anneau suit la cible du jour. Pas
// de source à côté d'« Effort » (30/10) ; un effort estimé garde son « ~ ». Pas de coche : la couleur de l'anneau dit
// l'état (jauges-sport.ts, effort-pepfit.ts) et le libellé d'accessibilité le dit en mots. Toute la case se touche : la
// Récupération ouvre sa page, les pas ouvrent Pas, l'effort ouvre la page Effort. Même rangée sur le Fold ouvert que sur l'écran extérieur (06/11 : pas de 3e ligne sous les valeurs). Sur la page Activité, ces trois jauges sont les grandes jauges métamorphosées (JaugesActivite) ; la rangée d'ici sert à Santé.
import { useCallback, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import Animated, { withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { espace, police } from "../theme/typo";
import { Appui } from "../ui/mouvement";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import { AnneauSport } from "./AnneauSport";
import { useApp } from "./contexte";
import { etatEffort, partAnneau as partEffort, scoreEffort, zoneAnneau, type EtatJauge } from "./effort-pepfit";
import { nombre } from "./format";
import { etatPas, etatRecup, partAnneau } from "./jauges-sport";
import { Os } from "./mesures/gabarit";
import { motRecup } from "./mesures/recup-vue";
import { isoDe } from "./planification";
import { chargerStatsJour, memoireStats, minuitDe, type StatsJour } from "./stats-jour";
import { texteDemi, texteEffort } from "./mesures/scores-calc";

export type { StatsJour } from "./stats-jour";

/** Du squelette aux chiffres : le fondu part à peu près de l'opacité du squelette (pas de rangée vide entre les deux). */
const DUREE_FONDU = duree.entree;
const depuisSquelette: EntryExitAnimationFunction = () => {
  "worklet";
  return { initialValues: { opacity: 0.4 }, animations: { opacity: withTiming(1, { duration: DUREE_FONDU }) } };
};

/** Délai de la relecture d'un jour déjà montré : après le glissé des pages (accroche ≈ 300 ms). */
const RELECTURE_MS = 600;

/** Les chiffres d'un jour (AAAA-MM-JJ) : ceux en mémoire tout de suite, puis relus à l'arrivée sur l'onglet (stats-jour.ts). */
export function useStatsJour(date: string): StatsJour | null {
  const { db } = useApp();
  const [s, setS] = useState<{ date: string; s: StatsJour } | null>(() => {
    const m = memoireStats.lu(date);
    return m ? { date, s: m } : null;
  });
  const charger = useCallback(
    async (toujours: boolean) => {
      if (!toujours && memoireStats.frais(date)) return;
      const poser = (x: StatsJour) => setS({ date, s: x });
      poser(await chargerStatsJour(db, date, poser));
    },
    [db, date],
  );
  useFocusEffect(
    useCallback(() => {
      // À l'arrivée sur l'onglet ou sur la page (montée) : aujourd'hui bouge (pas, séance finie), il est toujours relu ; un
      // jour passé, s'il a vieilli. Déjà montré (mémoire) : relu après le glissé des pages, pas pendant (une page blanche de
      // 250 ms à l'émulateur, la relecture des trois pages montées en même temps que leur montage).
      const toujours = minuitDe(date) >= minuitDe(isoDe(new Date()));
      const id = setTimeout(() => void charger(toujours).catch(console.error), memoireStats.lu(date) ? RELECTURE_MS : 0);
      return () => clearTimeout(id);
    }, [charger, date]),
  );
  // Un autre jour demandé par la même page : celui en mémoire, sinon le squelette (jamais les chiffres d'un autre jour).
  if (s?.date === date) return s.s;
  return memoireStats.lu(date) ?? null;
}

/** Ce que montre chaque case : valeur, part, état (et une ligne de plus, Fold ouvert). */
function cases(s: StatsJour) {
  const vide = t("journee.vide");
  const r = s.recup;
  const score = r?.score ?? null;
  const etatP = etatPas(s.pas?.pas ?? null, s.objectifPas, s.jour, s.maintenant);
  const e = s.effort;
  const cible = s.cible;
  const etatE = etatEffort(e?.score ?? null, cible);
  const valeurE = e ? texteEffort(e.score) : vide;
  return {
    recup: {
      valeur: score != null ? nombre(score, 0) : vide,
      suffixe: score != null ? "%" : undefined,
      ref2: r?.niveau ? motRecup(r.niveau, s.feminin) : "",
      part: score != null ? score / 100 : 0,
      etat: etatRecup(score),
    },
    pas: {
      valeur: s.pas ? nombre(s.pas.pas, 0) : vide,
      ref2: s.pas ? t(s.pas.source === "whoop" ? "journee.source.whoop" : "journee.source.mesure") : "",
      part: partAnneau(s.pas?.pas ?? null, s.objectifPas),
      etat: etatP,
    },
    effort: {
      valeur: valeurE,
      ref2: cible && cible.habitude > 0 ? t("sportStats.habitude", { valeur: texteEffort(scoreEffort(cible.habitude)) }) : t("sportStats.seancesJour"),
      part: partEffort(e?.score ?? null),
      zone: zoneAnneau(cible),
      etat: etatE,
    },
  };
}

const etatLu = (etat: EtatJauge, retard: boolean) =>
  etat === "ok" ? `, ${t("sportStats.etat.ok")}` : etat === "alerte" ? `, ${t(retard ? "sportStats.etat.alerteRetard" : "sportStats.etat.alerteHaut")}` : "";

/** Une jauge lue (Récupération, Pas, Effort) : ce qu'elle montre, son texte lu et la page qu'elle ouvre. */
export type JaugeLue = {
  cle: "recup" | "pas" | "effort";
  icone: "pouls" | "pas" | "eclair";
  flex: number;
  libelle: string;
  /** Unité courte de la petite jauge (« récup », « pas », « effort »). */
  unite: string;
  valeur: string;
  suffixe?: string;
  ref2?: string;
  part: number;
  zone?: [number, number] | null;
  etat: EtatJauge;
  lu: string;
  /** Page qu'elle ouvre (jour en paramètre). */
  route: "/sante/recuperation" | "/sante/pas" | "/sante/effort";
};

/** Les trois jauges d'un jour, dans l'ordre de la rangée : un seul endroit pour les valeurs et les textes lus. */
export function lireJauges(s: StatsJour): JaugeLue[] {
  const c = cases(s);
  const score = s.recup?.score ?? null;
  return [
    {
      cle: "recup",
      icone: "pouls",
      flex: 1.2,
      libelle: t("recup.titre"),
      unite: t("recup.court"),
      ...c.recup,
      lu:
        score != null
          ? t("recup.luJauge", { valeur: t("recup.pourcent", { n: nombre(score, 0) }), mot: c.recup.ref2 ? `, ${c.recup.ref2}` : "" })
          : t("recup.luSansScore"),
      route: "/sante/recuperation",
    },
    {
      cle: "pas",
      icone: "pas",
      flex: 1,
      libelle: t("sportStats.pas"),
      unite: t("sportStats.unitePas"),
      ...c.pas,
      lu: t("sportStats.luPas", { valeur: c.pas.valeur, ref: t("sportStats.luPasRef", { ref: nombre(s.objectifPas, 0) }), etat: etatLu(c.pas.etat, true) }),
      route: "/sante/pas",
    },
    {
      cle: "effort",
      icone: "eclair",
      flex: 1,
      libelle: t("sportStats.effort"),
      unite: t("sportStats.uniteEffort"),
      ...c.effort,
      lu: t("sportStats.luEffort", {
        valeur: c.effort.valeur,
        ref: s.cible ? t("sportStats.luEffortRef", { bas: texteDemi(s.cible.bas), haut: texteDemi(s.cible.haut) }) : t("sportStats.luSansCible"),
        etat: etatLu(c.effort.etat, false),
      }),
      route: "/sante/effort",
    },
  ];
}

export function RangeeSport({ date, onLayout }: { date: string; onLayout?: (e: LayoutChangeEvent) => void }) {
  const s = useStatsJour(date);
  const large = useWindowDimensions().width >= 600;
  const reduit = useReduit();
  // Fondu du squelette vers les chiffres, seulement s'ils ont été attendus (un jour en mémoire est posé tel quel).
  const attendu = useRef(s == null);
  if (!s) return <SqueletteRangee large={large} onLayout={onLayout} />;
  const jour = String(s.jour);
  return (
    <Animated.View
      entering={attendu.current && !reduit ? depuisSquelette : undefined}
      style={[styles.rangee, large && styles.rangeeLarge]}
      onLayout={onLayout}
    >
      {lireJauges(s).map((j) => (
        <Case
          key={j.cle}
          flex={j.flex}
          icone={j.icone}
          libelle={j.libelle}
          valeur={j.valeur}
          suffixe={j.suffixe}
          ref2={j.ref2 ?? ""}
          part={j.part}
          zone={j.zone}
          etat={j.etat}
          large={large}
          lu={j.lu}
          onPress={() => router.push({ pathname: j.route, params: { jour } })}
        />
      ))}
    </Animated.View>
  );
}

/**
 * En attendant les chiffres (un jour passé lu dans Santé Connect, jusqu'à quelques secondes) : les trois cases à leur place
 * et à leur taille, anneau vide estompé et barres du squelette des pages de mesure (Os) au lieu du libellé et de la valeur.
 */
export function SqueletteRangee({ large, onLayout }: { large: boolean; onLayout?: (e: LayoutChangeEvent) => void }) {
  const cases: { flex: number; icone: "pouls" | "pas" | "eclair" }[] = [
    { flex: 1.2, icone: "pouls" },
    { flex: 1, icone: "pas" },
    { flex: 1, icone: "eclair" },
  ];
  return (
    <View style={[styles.rangee, large && styles.rangeeLarge]} onLayout={onLayout} accessible accessibilityLabel={t("mesures.chargement")}>
      {cases.map((x) => (
        <View key={x.icone} style={[styles.case, { flex: x.flex }, large && { gap: 12 }]}>
          <View style={styles.estompe}>
            <AnneauSport part={0} etat="cours" taille={large ? 48 : 40} icone={x.icone} anime={false} />
          </View>
          <View style={styles.tx}>
            <View style={styles.osLib}>
              <Os largeur={44} hauteur={10} rayon={5} />
            </View>
            <View style={[styles.osVal, large && { height: 23 }]}>
              <Os largeur={56} hauteur={14} rayon={7} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function Case({
  flex,
  icone,
  libelle,
  valeur,
  suffixe,
  ref2,
  part,
  zone,
  etat,
  large,
  lu,
  onPress,
}: {
  flex: number;
  icone: "pouls" | "pas" | "eclair";
  libelle: string;
  valeur: string;
  /** Le petit « % » de la Récupération (correction d'Alex, 31/10). */
  suffixe?: string;
  ref2: string;
  part: number;
  zone?: [number, number] | null;
  etat: EtatJauge;
  large: boolean;
  lu: string;
  onPress: () => void;
}) {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="button" accessibilityLabel={lu} onPress={onPress} style={[styles.case, { flex }, large && { gap: 12 }]}>
      <AnneauSport part={part} zone={zone} etat={etat} taille={large ? 48 : 40} icone={icone} />
      <View style={styles.tx}>
        <Texte numberOfLines={1} style={[styles.lib, { color: couleurs.t2 }, large && { fontSize: 13 }]}>
          {libelle}
        </Texte>
        <Texte numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.val, { color: couleurs.t1 }, large && { fontSize: 18, lineHeight: 23 }]}>
          {valeur}
          {suffixe ? <Texte style={[styles.suffixe, { color: couleurs.t2 }, large && { fontSize: 13 }]}>{` ${suffixe}`}</Texte> : null}
        </Texte>
      </View>
    </Appui>
  );
}

const styles = StyleSheet.create({
  // Planche : 2 en haut, 12 en bas, 12 des bords (la page est à 16 : −4) ; sans la référence, la hauteur d'une case (52).
  rangee: { flexDirection: "row", gap: espace.s, paddingTop: 2, paddingBottom: 12, marginHorizontal: -4, minHeight: 52 },
  rangeeLarge: { marginHorizontal: 0, paddingBottom: 14 },
  case: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 52, paddingVertical: 2, paddingHorizontal: 4, borderRadius: 12, minWidth: 0 },
  tx: { flex: 1, minWidth: 0 },
  lib: { fontFamily: police.regular, fontSize: 12, lineHeight: 15 },
  val: { fontFamily: police.semibold, fontSize: 16.5, lineHeight: 21, letterSpacing: -0.2, fontVariant: ["tabular-nums"] },
  ref: { fontFamily: police.regular, fontSize: 12, lineHeight: 15, fontVariant: ["tabular-nums"] },
  estompe: { opacity: 0.5 },
  osLib: { height: 15, justifyContent: "center" },
  osVal: { height: 21, justifyContent: "center" },
  suffixe: { fontFamily: police.regular, fontSize: 12, letterSpacing: 0 },
});
