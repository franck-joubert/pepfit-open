// Page Effort, les briques de la planche effort-pepfit (variante C validée le 31/10, sans unité ni texte d'objectif sur les
// jauges, jamais de maximum) : le grand anneau du jour (le chiffre au centre, l'anneau qui suit la cible), la ligne de la
// cible, « D'où vient ce chiffre » (chaque séance, sa mesure, son score seule ; l'activité de la journée hors séances, pas ou
// FC, docs/EFFORT-ACTIVITE.md ; puis la journée), le tiroir
// « Comprendre l'Effort » (la règle qui part de 0 et s'efface, les quatre repères). Les statistiques sont celles du gabarit
// (Effort.tsx, GrapheBarres). Les données : sport-stats-donnees.ts et effort-charges.ts ; les calculs : effort-pepfit.ts.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Circle, Defs, G, LinearGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { PICTO_TYPE, type TypeProgramme } from "../../db/programmes";
import { t } from "../../i18n/index";
import { avantDelai, DELAI_LECTURE_MS } from "../../natif/sante/logique";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Appui } from "../../ui/mouvement";
import { Texte } from "../../ui/Texte";
import { AnneauSport, useCouleursAnneau } from "../AnneauSport";
import { useApp } from "../contexte";
import { depsActiviteAppareil } from "../effort-activite-appareil";
import { assurerActiviteJour, pasSeancesIndisponibles, type ActiviteJour } from "../effort-activite-donnees";
import { effortsSeancesJour, type EffortDeSeance } from "../effort-charges";
import { COURBE_EFFORT, etatEffort, partAnneau, REPERES_EFFORT, scoreEffort, zoneAnneau, type Cible, type EtatJauge } from "../effort-pepfit";
import { approx, nombre } from "../format";
import { lireSexe } from "../../db/depots/profil";
import { lireRecupJour } from "../recup-donnees";
import { ajustementCible, type ResultatRecup } from "../recup-pepfit";
import { jourEnergie } from "../sante-donnees";
import { motRecup } from "./recup-vue";
import { PictoSeance } from "../Planif";
import { chargesJournees, lireCible, lireEffortJour, type EffortJour } from "../sport-stats-donnees";
import { decaler } from "./periodes";
import { Groupe, LigneMesure, Lignes, TitreGroupe } from "./gabarit";
import { texteDemi, texteEffort } from "./scores-calc";

const JOUR_MS = 86_400_000;

export interface SeanceDuJour {
  id: string;
  nom: string;
  picto: string | null;
  effort: EffortDeSeance | null;
}

export interface DonneesEffortJour {
  jour: number;
  cible: Cible | null;
  effort: EffortJour | null;
  seances: SeanceDuJour[];
  /** Le jour a un total de pas mais pas ceux d'une séance : pas d'activité calculée (jamais un prorata). */
  pasIndisponibles: boolean;
}

/** La cible, l'effort et les séances d'un jour (minuit) ; relus au retour sur la page. */
export function useEffortJour(jour: number, maintenant: number): DonneesEffortJour | null {
  const { db } = useApp();
  const [d, setD] = useState<DonneesEffortJour | null>(null);
  const charger = useCallback(async () => {
    const [cible, effort, efforts, lignes, routines, pasIndisponibles] = await Promise.all([
      lireCible(db, jour, maintenant).catch(() => null),
      lireEffortJour(db, jour),
      effortsSeancesJour(db, jour),
      db.getAllAsync<{ id: string; titre: string | null; routine_id: string | null; routine: string | null; slug: string | null }>(
        `SELECT s.id, s.titre, s.routine_id, r.nom AS routine,
                (SELECT e.slug FROM seance_exercices x JOIN exercices e ON e.id = x.exercice_id
                  WHERE x.seance_id = s.id AND e.slug IS NOT NULL ORDER BY x.position LIMIT 1) AS slug
         FROM seances s LEFT JOIN routines r ON r.id = s.routine_id
         WHERE s.fin IS NOT NULL AND s.debut >= ? AND s.debut < ? ORDER BY s.debut`,
        [jour, jour + JOUR_MS],
      ),
      db.getAllAsync<{ id: string; type: TypeProgramme }>("SELECT id, type FROM routines", []),
      pasSeancesIndisponibles(db, jour).catch(() => false),
    ]);
    const types = new Map(routines.map((r) => [r.id, r.type]));
    setD({
      jour,
      cible,
      effort,
      pasIndisponibles: pasIndisponibles && !effort?.activite,
      seances: lignes
        .map((s) => {
          const type = s.routine_id ? types.get(s.routine_id) : undefined;
          return {
            id: s.id,
            nom: s.titre ?? s.routine ?? t("seance.seance.titreDefaut"),
            picto: (type === "muscu" || type === "cross" ? s.slug : null) ?? (type ? PICTO_TYPE[type] : null) ?? s.slug,
            effort: efforts.get(s.id) ?? null,
          };
        })
        .filter((s) => s.effort != null),
    });
  }, [db, jour, maintenant]);
  useEffect(() => {
    charger().catch(console.error);
  }, [charger]);
  // Aujourd'hui et hier : l'activité de la journée est relue (les pas arrivent au fil du jour, et tard), puis la page se relit.
  useEffect(() => {
    const d = new Date(maintenant);
    if (jour < new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime() || jour > maintenant) return;
    let vivant = true;
    depsActiviteAppareil()
      .then((deps) => avantDelai(assurerActiviteJour(db, jour, { ...deps, maintenant: Date.now() }), DELAI_LECTURE_MS))
      .then(() => (vivant ? charger() : undefined))
      .catch(console.warn);
    return () => {
      vivant = false;
    };
  }, [db, jour, maintenant, charger]);
  useFocusEffect(
    useCallback(() => {
      charger().catch(console.error);
    }, [charger]),
  );
  return d && d.jour === jour ? d : null;
}

/** L'Effort de chaque jour autour de `jour` (trois semaines), écrit sous sa date (D10) : « – » un jour sans rien de mesuré. */
export function useValeursJours(jour: number, maintenant: number): (j: number) => string | null {
  const { db } = useApp();
  const [m, setM] = useState<{ debut: number; fin: number; charges: Map<number, number> } | null>(null);
  const lundi = (() => {
    const d = new Date(jour);
    return decaler(jour, -((d.getDay() + 6) % 7));
  })();
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      const debut = decaler(lundi, -7);
      const fin = decaler(lundi, 14);
      chargesJournees(db, debut, fin)
        .then((c) => vivant && setM({ debut, fin, charges: c.totales }))
        .catch(console.error);
      return () => {
        vivant = false;
      };
    }, [db, lundi]),
  );
  return (j: number) => {
    if (!m || j < m.debut || j >= m.fin || j > maintenant) return null;
    const c = m.charges.get(j);
    return c ? texteEffort(scoreEffort(c)) : "–";
  };
}

/** Le grand anneau du jour (156 dp) : le chiffre au centre, sans unité ; l'anneau est sur 0 à 10, l'arc de la cible dessus (D7). */
export function AnneauEffortJour({ score, cible, estime }: { score: number | null; cible: Cible | null; estime: boolean }) {
  const { couleurs } = useTheme();
  const etat = etatEffort(score, cible);
  return (
    <View style={styles.anneauBoite}>
      <AnneauSport part={partAnneau(score)} zone={zoneAnneau(cible)} etat={etat} taille={156} geo="grand" />
      <View style={styles.dedans} pointerEvents="none">
        <Texte numberOfLines={1} adjustsFontSizeToFit style={[styles.chiffre, { color: score == null ? couleurs.t2 : couleurs.t1 }]}>
          {score == null ? "–" : texteEffort(score)}
        </Texte>
      </View>
    </View>
  );
}

/** « — Ta cible du jour : 6,5 à 7 » et l'état à droite ; sans cible, pourquoi. */
export function LigneCible({ cible, score, aujourdhui }: { cible: Cible | null; score: number | null; aujourdhui: boolean }) {
  const { couleurs } = useTheme();
  const anneau = useCouleursAnneau();
  const etat = etatEffort(score, cible);
  if (!cible)
    return (
      <View style={styles.cible}>
        <Texte style={[styles.cibleTexte, { color: couleurs.t2 }]}>{t("mesEffort.sansCible")}</Texte>
      </View>
    );
  const texte = t(aujourdhui ? "mesEffort.cible" : "mesEffort.cibleJour", { bas: texteDemi(cible.bas), haut: texteDemi(cible.haut) });
  return (
    <View style={styles.cible} accessible accessibilityLabel={`${texte}${etat === "ok" ? `, ${t("mesEffort.tuYEs")}` : etat === "alerte" ? `, ${t("mesEffort.auDessus")}` : ""}`}>
      <View style={[styles.cibleTrait, { backgroundColor: anneau.trait }]} />
      <Texte style={[styles.cibleTexte, { color: couleurs.t2 }]} numberOfLines={1}>
        {texte}
      </Texte>
      {etat !== "cours" ? (
        <Texte style={[styles.cibleEtat, { color: etat === "ok" ? couleurs.valide : couleurs.rate }]}>{t(etat === "ok" ? "mesEffort.tuYEs" : "mesEffort.auDessus")}</Texte>
      ) : null}
    </View>
  );
}

/** Ce qui a servi à mesurer une séance : « ressenti « Bien » · 52 min », « FC · 47 min », « séries · FC · 37 min », « estimé · 30 min ». */
export function mesureDe(e: EffortDeSeance): string {
  const min = t("effort.minN", { n: Math.round(e.minutes) });
  if (e.muscu != null) {
    if (e.methode === "fc") return t("mesEffort.parSeriesFc", { min });
    return e.ressenti ? t("mesEffort.parSeriesRessenti", { mot: t(`seance.effort.${e.ressenti}`), min }) : t("mesEffort.parSeries", { min });
  }
  if (e.methode === "ressenti" && e.ressenti) return t("mesEffort.parRessenti", { mot: t(`seance.effort.${e.ressenti}`), min });
  if (e.methode === "fc") return t(e.estime ? "mesEffort.parFcMuscu" : "mesEffort.parFc", { min });
  return t("mesEffort.parBareme", { min });
}

/** Ce qui a mesuré l'activité de la journée : « 12 400 pas hors séances », « FC de la journée ». */
export function mesureActivite(a: ActiviteJour, avecSeances: boolean): string {
  if (a.methode === "fc") return t(avecSeances ? "mesEffort.activite.fcHors" : "mesEffort.activite.fc");
  return t(avecSeances ? "mesEffort.activite.pasHors" : "mesEffort.activite.pas", { n: nombre(a.pas ?? 0, 0) });
}

/** La tuile de l'activité de la journée, à la taille du picto d'une séance. */
function PictoActivite() {
  const { couleurs, mode } = useTheme();
  return (
    <View style={[styles.tuileActivite, { backgroundColor: couleurs.pictoRepas, borderColor: mode === "jour" ? couleurs.verreFilet : "transparent" }]}>
      <Icone nom="pas" couleur={couleurs.t2} />
    </View>
  );
}

/**
 * « D'où vient ce chiffre » : chaque séance (sa mesure, son score seule), l'activité de la journée hors séances (son score
 * seule), puis la journée, et la phrase.
 */
export function DouVient({ seances, effort, pasIndisponibles = false }: { seances: readonly SeanceDuJour[]; effort: EffortJour | null; pasIndisponibles?: boolean }) {
  const activite = effort?.activite ?? null;
  if ((!seances.length && !activite) || !effort) return null;
  const scores = [...seances.map((s) => s.effort!.score), ...(activite ? [activite.score] : [])];
  return (
    <>
      <TitreGroupe>{t("mesEffort.douVient")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            ...seances.map((s) => {
              const e = s.effort!;
              return (
                <LigneMesure
                  key={s.id}
                  avant={<PictoSeance picto={s.picto} etat="faite" />}
                  titre={s.nom}
                  sous={mesureDe(e)}
                  valeur={texteEffort(e.score)}
                  onPress={() => router.push({ pathname: "/history/[id]", params: { id: s.id } })}
                />
              );
            }),
            ...(activite
              ? [
                  <LigneMesure
                    key="activite"
                    avant={<PictoActivite />}
                    titre={t("mesEffort.activite.titre")}
                    sous={mesureActivite(activite, seances.length > 0)}
                    valeur={texteEffort(activite.score)}
                  />,
                ]
              : pasIndisponibles
                ? [<LigneMesure key="activite" avant={<PictoActivite />} titre={t("mesEffort.activite.titre")} sous={t("mesEffort.activite.pasIndisponibles")} valeur="–" />]
                : []),
            <LigneMesure
              key="journee"
              titre={t("mesEffort.taJournee")}
              valeur={texteEffort(effort.score)}
            />,
          ]}
        </Lignes>
      </Groupe>
      {scores.length >= 2 ? (
        <Texte variante="corps" couleur="t2" style={styles.note}>
          {t("mesEffort.nonAdditif", {
            // « 4,8, 5,3 et 1,8 » : des virgules, puis « et » avant le dernier
            scores: `${scores.slice(0, -1).map((x) => texteEffort(x)).join(", ")}${t("mesEffort.et")}${texteEffort(scores.at(-1)!)}`,
            total: texteEffort(effort.score),
            somme: texteEffort(scores.reduce((a, b) => a + b, 0)),
          })}
        </Texte>
      ) : null}
    </>
  );
}

/** Les deux voisines de l'Effort (planche recuperation, écran 6, D9) : la Récupération de ce matin, qui règle la cible, et la
 * dépense du jour, qui ouvre Énergie (depuis Sport, la jauge des kcal a laissé sa place à la Récupération). */
export function VoirAussi({ jour, maintenant }: { jour: number; maintenant: number }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [d, setD] = useState<{ jour: number; r: ResultatRecup | null; feminin: boolean; kcal: number | null; sport: number; estime: boolean } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      Promise.all([
        lireRecupJour(db, jour).catch(() => null),
        lireSexe(db).catch(() => null),
        jourEnergie(db, jour, maintenant).catch(() => null),
      ])
        .then(([r, sexe, e]) => {
          if (vivant) setD({ jour, r, feminin: sexe === "f", kcal: e?.bilan.depense.kcal ?? null, sport: e?.bilan.sport.kcal ?? 0, estime: e?.bilan.depense.estime ?? false });
        })
        .catch(console.error);
      return () => {
        vivant = false;
      };
    }, [db, jour, maintenant]),
  );
  if (!d || d.jour !== jour) return null;
  const tuile = (nom: "pouls" | "energie") => (
    <View style={[styles.tuileVoir, { backgroundColor: couleurs.pictoRepas }]}>
      <Icone nom={nom} couleur={couleurs.t2} taille={20} />
    </View>
  );
  const r = d.r;
  const a = r ? ajustementCible(r.forme) : 0;
  const mot = r?.niveau ? motRecup(r.niveau, d.feminin) : null;
  const sousR =
    r?.score == null || !mot
      ? t("recup.voirSans")
      : a > 0
        ? t("recup.voirRelevee", { mot, n: a })
        : a < 0
          ? t("recup.voirBaissee", { mot, n: -a })
          : t("recup.voirHabituelle", { mot });
  const param = { jour: String(jour) };
  return (
    <>
      <TitreGroupe>{t("recup.voirAussi")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="recup"
              avant={tuile("pouls")}
              titre={t("recup.ceMatinTitre")}
              sous={sousR}
              valeur={r?.score != null ? nombre(r.score, 0) : "–"}
              unite={r?.score != null ? "%" : undefined}
              onPress={() => router.push({ pathname: "/sante/recuperation", params: param })}
            />,
            <LigneMesure
              key="depense"
              avant={tuile("energie")}
              titre={t("recup.depenseJour")}
              sous={d.kcal != null ? (d.sport > 0 ? t("recup.dontSeance", { kcal: nombre(d.sport, 0) }) : t("recup.rienSeance")) : null}
              valeur={d.kcal != null ? approx(nombre(d.kcal, 0), d.estime) : "–"}
              unite={d.kcal != null ? t("recup.kcal") : undefined}
              onPress={() => router.push({ pathname: "/sante/energie", params: param })}
            />,
          ]}
        </Lignes>
      </Groupe>
    </>
  );
}

/** « Comprendre l'Effort › » : une ligne de 44 dp qui ouvre le tiroir. */
export function LienComprendre({ onPress }: { onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="button" onPress={onPress} style={styles.lien}>
      <Texte style={[styles.lienTexte, { color: couleurs.t1 }]}>{t("mesEffort.comprendre")}</Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Appui>
  );
}

/**
 * La règle du tiroir (D9) : elle part de 0 et s'efface vers la droite, sans graduation finale. Les repères sont posés à leur
 * score, sur une échelle qui s'étire vers le haut (puissance 1,5) : les trois repères du haut ne se serrent plus (limite de la
 * planche), et l'écart qui grandit dit que monter coûte de plus en plus.
 */
function Regle({ largeur }: { largeur: number }) {
  const { couleurs } = useTheme();
  const H = 96;
  const y0 = 44;
  const x = (v: number) => 6 + Math.pow(v / COURBE_EFFORT.echelle, 1.5) * (largeur - 12);
  const reperes = REPERES_EFFORT.map((r) => ({ ...r, v: scoreEffort(r.charge) }));
  return (
    <Svg width={largeur} height={H} accessibilityLabel={t("mesEffort.regleLue", { reperes: reperes.map((r) => `${t(`mesEffort.repere.${r.cle}`)} ${texteDemi(r.v)}`).join(", ") })}>
      <Defs>
        <LinearGradient id="fondu-regle" x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0" stopColor={couleurs.partieEntrainement} />
          <Stop offset="0.82" stopColor={couleurs.partieEntrainement} />
          <Stop offset="1" stopColor={couleurs.partieEntrainement} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={6} y={y0 - 2} width={largeur - 12} height={4} rx={2} fill="url(#fondu-regle)" />
      <SvgText x={6} y={y0 + 24} fontSize={12} fill={couleurs.t3}>
        0
      </SvgText>
      {reperes.map((r, i) => {
        const cx = x(r.v);
        const haut = i % 2 === 0;
        // le nom du repère reste dans la règle (« Marche tranquille » débordait à gauche) : largeur estimée à 11,5 px
        const nom = t(`mesEffort.repere.${r.cle}`);
        const demi = (nom.length * 6.2) / 2;
        const xNom = Math.min(largeur - demi - 2, Math.max(demi + 2, cx));
        return (
          <G key={r.cle}>
            <Circle cx={cx} cy={y0} r={5} fill={couleurs.carteOpaque} stroke={couleurs.t1} strokeWidth={2} />
            <SvgText x={cx} y={haut ? y0 - 14 : y0 + 25} textAnchor="middle" fontSize={15} fontWeight="600" fill={couleurs.t1}>
              {texteDemi(r.v)}
            </SvgText>
            <SvgText x={xNom} y={haut ? y0 - 32 : y0 + 43} textAnchor="middle" fontSize={11.5} fill={couleurs.t2}>
              {nom}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Le tiroir « Comprendre l'Effort » (écran 5) : la règle, puis quatre lignes numérotées. */
export function TiroirEffort({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  const { couleurs } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const lignes: [string, string][] = [
    [t("mesEffort.tiroir.1fort"), t("mesEffort.tiroir.1")],
    [t("mesEffort.tiroir.2fort"), t("mesEffort.tiroir.2")],
    [t("mesEffort.tiroir.3fort"), t("mesEffort.tiroir.3")],
    [t("mesEffort.tiroir.4fort"), t("mesEffort.tiroir.4")],
  ];
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("mesEffort.comprendre")}>
      <View onLayout={(e) => setLargeur(Math.floor(e.nativeEvent.layout.width))} style={styles.regle}>
        {largeur > 0 ? <Regle largeur={largeur} /> : null}
      </View>
      <View style={styles.liste}>
        {lignes.map(([fort, suite], i) => (
          <View key={i} style={styles.item}>
            <View style={[styles.num, { backgroundColor: couleurs.btnTonalFond }]}>
              <Texte style={[styles.numTexte, { color: couleurs.t1 }]}>{nombre(i + 1, 0)}</Texte>
            </View>
            <Texte variante="corps" style={[styles.itemTexte, { color: couleurs.t2 }]}>
              <Texte variante="corps" style={[styles.itemTexte, { color: couleurs.t1, fontFamily: police.semibold }]}>
                {fort}
              </Texte>
              {suite}
            </Texte>
          </View>
        ))}
      </View>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  anneauBoite: { width: 156, height: 156, alignSelf: "center", marginTop: 18, alignItems: "center", justifyContent: "center" },
  dedans: { position: "absolute", left: 20, right: 20, alignItems: "center" },
  chiffre: { fontFamily: police.semibold, fontSize: 52, lineHeight: 58, letterSpacing: -1.6, fontVariant: ["tabular-nums"] },
  cible: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, marginTop: 14, marginHorizontal: 16 },
  cibleTrait: { width: 18, height: 3.5, borderRadius: 2 },
  cibleTexte: { flex: 1, fontFamily: police.regular, fontSize: 14 },
  cibleEtat: { fontFamily: police.semibold, fontSize: 14 },
  note: { fontSize: 13.5, lineHeight: 20, marginTop: 12, marginHorizontal: 16 },
  lien: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, alignSelf: "flex-start", marginTop: 4, marginHorizontal: 16 },
  lienTexte: { fontFamily: police.medium, fontSize: 14 },
  regle: { marginTop: 4, marginBottom: 12 },
  liste: { gap: 14, paddingBottom: 8 },
  item: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  numTexte: { fontFamily: police.semibold, fontSize: 12 },
  tuileVoir: { width: 40, height: 40, borderRadius: rayon.m, alignItems: "center", justifyContent: "center", marginRight: 2 },
  tuileActivite: { width: 44, height: 44, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  itemTexte: { flex: 1, fontSize: 14, lineHeight: 21 },
});
