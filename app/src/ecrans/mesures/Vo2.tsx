import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { t, tp } from "../../i18n/index";
import { useTheme } from "../../theme";
import { avecOpacite } from "../../theme/teintes";
import { police, rayon } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { Appui } from "../../ui/mouvement";
import { Texte } from "../../ui/Texte";
import { useCharge } from "../contexte";
import { approx, heure, jourMois, jourMoisAnnee, nombre } from "../format";
import { allureTexte } from "../../natif/suivi/logique";
import { sourceZones } from "../zones-texte";
import { AttenteLecture } from "../precision/AttenteLecture";
import { MiniPrecision, STYLE_MINI } from "../precision/MiniPrecision";
import { usePrecision } from "../precision/usePrecision";
import { lecture } from "../../precision/modele";
import { BoutonPlein, Cles, Duo, EnPanne, Groupe, Heros, LigneMesure, Lignes, MARGE, Note, PageMesure, PageVide, Quand, TitreGroupe, useMesure, ValeurDuo } from "./gabarit";
import { Statistiques } from "./Statistiques";
import {
  ALLURES, allureA, bornesRampe, CATEGORIES, categorieVo2, JOURS_ESTIMATION, positionRampe, vmaRetenue, vo2maxDeVma, facteurUth, type Categorie, type Sexe,
} from "./vma-calc";
import { lireVo2, type DonneesVo2, type PointVo2 } from "./vo2-donnees";

// VO2max et VMA (planche vma-vo2max, écrans 1 à 4, validés le 29/10 ; D1, D4, D6) : le gabarit des pages de mesure. Quand,
// chiffre fort et sa catégorie pour l'âge et le sexe (FRIEND 2015) ; ta place sur la rampe des cinq catégories ; ta VMA et
// tes allures ; statistiques (tests pleins, estimations des courses cerclées, valeur retenue en marches, repères de l'âge) ;
// tests ; zones de FC ; sources ; méthode. Sans test : VMA estimée des courses ; sans course : VO2max d'après la FC (Uth),
// « estimée, à confirmer » ; rien : une seule action.

const JOUR = 86_400_000;
/** La routine « Test VMA » de la boutique (rayon Routines). */
export const ROUTINE_TEST_VMA = "r-test-vma";
export const ouvrirTestVma = () => router.push({ pathname: "/boutique/[id]", params: { id: ROUTINE_TEST_VMA } });

// ---- Textes ------------------------------------------------------------------------------------------------------------

export const nomCategorie = (c: Categorie) => t(`vo2.cat.${c}`);

/** « Bonne pour ton âge » ; sans âge connu, la catégorie est celle des 40-49 ans et la phrase le dit (lot 6 de la précision :
 * plus d'âge 40 pris sans le dire). */
export const pourAge = (cat: string, age: number | null) => (age != null ? t("vo2.pourTonAge", { cat }) : t("vo2.pourAdulte", { cat }));

/** « Très bonne pour un homme de 39 ans », « Très bonne pour ton âge », « Bonne pour un adulte de 40 à 49 ans ». */
export function phraseCategorie(d: Pick<DonneesVo2, "categorie" | "age" | "sexe">): string {
  if (!d.categorie) return "";
  const cat = nomCategorie(d.categorie);
  return d.age != null && d.sexe ? t(`vo2.pourUn.${d.sexe}`, { cat, age: d.age }) : pourAge(cat, d.age);
}

const dateCourte = (ms: number, maintenant: number) =>
  new Date(ms).getFullYear() === new Date(maintenant).getFullYear() ? jourMois(ms) : jourMoisAnnee(ms);
const memeJour = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Ligne « quand » : le test, la course de l'estimation, ou la FC. */
export function quandVo2(d: DonneesVo2, maintenant = Date.now()): string {
  if (d.vma?.source === "test") {
    const date = memeJour(d.vma.date, maintenant) ? t("vo2.aujourdhuiA", { h: heure(d.vma.date) }) : dateCourte(d.vma.date, maintenant);
    return t("vo2.quand.test", { date });
  }
  if (d.vma) return t("vo2.quand.course", { date: dateCourte(d.vma.date, maintenant) });
  return t("vo2.quand.uth", { source: d.fcRepos?.source === "sante_connect" ? t("accueil.blocs.santeConnect") : t("accueil.blocs.sourceWhoop") });
}

const estimee = (d: DonneesVo2) => d.vo2 != null && d.vo2.methode !== "vma-test";
export const texteVo2 = (d: DonneesVo2) => (d.vo2 ? approx(nombre(d.vo2.valeur, d.vo2.methode === "uth" ? 0 : 1), estimee(d)) : "—");

// ---- Rampe des catégories ----------------------------------------------------------------------------------------------

const OPACITES = { jour: [0.16, 0.32, 0.5, 0.72, 1], nuit: [0.26, 0.4, 0.56, 0.76, 1] } as const;

/** Cinq segments de même largeur (des rangs), le repère placé dans le sien ; en grand : la valeur, les noms, les bornes. */
/** `decimales` : celles du chiffre fort (0 pour la VO2max d'après la FC, estimation large). */
export function RampeVo2({ vo2, age, sexe, mini = false, decimales = 1 }: { vo2: number; age: number | null; sexe: Sexe | null; mini?: boolean; decimales?: number }) {
  const { couleurs, mode } = useTheme();
  const pos = positionRampe(vo2, age, sexe) * 100;
  const b = bornesRampe(age, sexe);
  const cat = categorieVo2(vo2, age, sexe);
  const rose = couleurs.partieSante;
  const haut = mini ? 6 : 10;
  return (
    <View style={{ marginTop: mini ? 14 : 30 }} accessible accessibilityLabel={`${nomCategorie(cat)} : ${nombre(vo2, 1)} ${t("vo2.unite")}`}>
      {mini ? null : (
        <Texte style={[styles.bulle, { left: `${Math.min(92, Math.max(8, pos))}%` }]}>{nombre(vo2, decimales)}</Texte>
      )}
      <View style={[styles.rampe, { height: haut, gap: mini ? 2 : 3 }]}>
        {OPACITES[mode].map((o, i) => (
          <View key={i} style={{ flex: 1, borderRadius: 3, backgroundColor: avecOpacite(rose, o) }} />
        ))}
        <View style={[styles.rep, mini ? styles.repMini : null, { left: `${pos}%`, backgroundColor: couleurs.t1, borderColor: couleurs.bg }]} />
      </View>
      {mini ? null : (
        <>
          <View style={styles.noms}>
            {CATEGORIES.map((c) => (
              <Texte key={c.id} numberOfLines={1} couleur={c.id === cat ? "t1" : "t3"} style={[styles.nom, c.id === cat && { fontFamily: police.semibold }]}>
                {nomCategorie(c.id)}
              </Texte>
            ))}
          </View>
          <View style={styles.bornes}>
            {[1, 2, 3, 4].map((i) => (
              <Texte key={i} couleur="t3" style={[styles.borne, { left: `${i * 20}%` }]}>
                {nombre(b[i]!, 1)}
              </Texte>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// ---- Statistiques ------------------------------------------------------------------------------------------------------

type TypeP = "mois" | "trim" | "annee" | "tout";
const LONGUEUR: Record<Exclude<TypeP, "tout">, number> = { mois: 30, trim: 90, annee: 365 };
const COLONNES = 48;

/** VMA retenue à une date : le dernier test de moins de 6 mois, sinon la meilleure course des 90 jours d'avant. */
function retenueA(h: readonly PointVo2[], date: number): number | null {
  const tests = h.filter((p) => p.src === "test" && p.date <= date).map((p) => ({ date: p.date, distanceM: p.distanceM ?? p.vma * 100 }));
  const courses = h.filter((p) => p.src === "course" && p.date <= date && date - p.date <= JOURS_ESTIMATION * JOUR);
  const meilleure = courses.reduce<PointVo2 | null>((a, p) => (!a || p.vma > a.vma ? p : a), null);
  return vmaRetenue(tests, meilleure, date)?.vma ?? null;
}

function GrapheVo2({ points, de, a, largeur, sel, age, sexe, historique }: {
  points: readonly PointVo2[];
  de: number;
  a: number;
  largeur: number;
  sel: PointVo2 | null;
  age: number | null;
  sexe: Sexe | null;
  historique: readonly PointVo2[];
}) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const W = Math.max(40, largeur - 34);
  const H = 176;
  const base = H - 22;
  const b = bornesRampe(age, sexe);
  const vals = points.map((p) => vo2maxDeVma(p.vma));
  const lo = Math.floor(Math.min(b[3]!, ...vals) - 1.5);
  const hi = Math.ceil(Math.max(b[4]!, ...vals) + 1.5);
  const x = (d: number) => ((d - de) / Math.max(1, a - de)) * W;
  const y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (base - 16);
  // Marches de la valeur retenue, du début de la période à aujourd'hui
  const dates = [de, ...points.map((p) => p.date)];
  let chemin = "";
  let avant: number | null = null;
  for (const d of dates) {
    const v = retenueA(historique, d);
    if (v == null) continue;
    const yy = y(vo2maxDeVma(v)).toFixed(1);
    if (avant == null) chemin = `M${x(d).toFixed(1)} ${yy}`;
    else if (v !== avant) chemin += `H${x(d).toFixed(1)}V${yy}`;
    avant = v;
  }
  if (chemin) chemin += `H${W}`;
  const reperes: [number, string][] = [[b[3]!, t("vo2.repere.tresBonne")], [b[4]!, t("vo2.repere.excellente")]];
  return (
    <Svg width={largeur} height={H}>
      <Line x1={0} x2={W} y1={base} y2={base} stroke={couleurs.line2} />
      {reperes.map(([v, l]) => (
        <G key={l}>
          <Line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={couleurs.t1} strokeOpacity={0.38} strokeWidth={1.25} strokeDasharray="4 4" />
          <SvgText x={W + 6} y={y(v) + 4} fontSize={11} fontFamily={police.regular} fill={couleurs.t3}>
            {nombre(v, 1)}
          </SvgText>
          <SvgText x={4} y={y(v) - 6} fontSize={11} fontFamily={police.regular} fill={couleurs.t3}>
            {l}
          </SvgText>
        </G>
      ))}
      {chemin ? <Path d={chemin} fill="none" stroke={m.fort} strokeWidth={2.25} strokeLinejoin="round" /> : null}
      {sel ? <Line x1={x(sel.date)} x2={x(sel.date)} y1={4} y2={base} stroke={couleurs.t1} strokeOpacity={0.25} /> : null}
      {points.map((p, i) => {
        const on = sel === p;
        return p.src === "test" ? (
          <Circle key={i} cx={x(p.date)} cy={y(vo2maxDeVma(p.vma))} r={on ? 6 : 4.5} fill={m.fort} stroke={m.groupe} strokeWidth={2} />
        ) : (
          <Circle key={i} cx={x(p.date)} cy={y(vo2maxDeVma(p.vma))} r={on ? 5.5 : 4} fill={m.groupe} stroke={m.fort} strokeWidth={1.75} />
        );
      })}
      <SvgText x={0} y={H - 3} fontSize={11} fontFamily={police.regular} fill={couleurs.t3}>
        {jourMois(de)}
      </SvgText>
      <SvgText x={W} y={H - 3} textAnchor="end" fontSize={11} fontFamily={police.medium} fill={couleurs.t1}>
        {t("mesures.aujCourt")}
      </SvgText>
    </Svg>
  );
}

function StatsVo2({ d, maintenant }: { d: DonneesVo2; maintenant: number }) {
  const m = useMesure();
  const [type, setType] = useState<TypeP>("annee");
  const [k, setK] = useState(0);
  const [col, setCol] = useState<number | null>(null);
  const h = d.historique;
  const premier = h[0]?.date ?? maintenant - 365 * JOUR;
  const L = type === "tout" ? null : LONGUEUR[type] * JOUR;
  const a = L ? maintenant - k * L : maintenant;
  const de = L ? a - L : Math.min(premier, maintenant - 30 * JOUR);
  const points = h.filter((p) => p.date >= de && p.date <= a);
  const precedent = L != null && h.some((p) => p.date < de);
  // La colonne touchée désigne le point le plus proche dans le temps.
  const sel = col == null || !points.length ? null : points.reduce((best, p) => (Math.abs(p.date - (de + ((col + 0.5) / COLONNES) * (a - de))) < Math.abs(best.date - (de + ((col + 0.5) / COLONNES) * (a - de))) ? p : best), points[0]!);
  const titre = k === 0 ? `${dateCourte(de, maintenant)} – ${t("mesures.aujourdhuiMin")}` : `${dateCourte(de, maintenant)} – ${dateCourte(a, maintenant)}`;
  const nT = points.filter((p) => p.src === "test").length;
  const nE = points.length - nT;
  const entete = sel ? (
    <>
      <Texte variante="meta" couleur="t3">{t(sel.src === "test" ? "vo2.pointTest" : "vo2.pointCourse", { date: dateCourte(sel.date, maintenant) })}</Texte>
      <Texte style={styles.enteteV}>
        {approx(nombre(vo2maxDeVma(sel.vma), 1), sel.src !== "test")}
        <Texte variante="corps" couleur="t2">{` ${t("vo2.unite")}`}</Texte>
      </Texte>
      <Texte variante="meta" couleur="t2">
        {sel.src === "test" ? t("vo2.pointTestSous", { v: nombre(sel.vma, 1), m: nombre(sel.distanceM ?? 0, 0) }) : t("vo2.pointCourseSous", { v: nombre(sel.vma, 1) })}
      </Texte>
    </>
  ) : points.length ? (
    <>
      <Texte variante="meta" couleur="t3">{t("vo2.evolution", { periode: type === "tout" ? t("vo2.depuisDebut") : t(`mesuresCorps.longueur.${type}`) })}</Texte>
      <Texte style={styles.enteteV}>
        {`${vo2maxDeVma(points.at(-1)!.vma) >= vo2maxDeVma(points[0]!.vma) ? "+" : "−"}${nombre(Math.abs(vo2maxDeVma(points.at(-1)!.vma) - vo2maxDeVma(points[0]!.vma)), 1)}`}
        <Texte variante="corps" couleur="t2">{` ${t("vo2.unite")}`}</Texte>
      </Texte>
      <Texte variante="meta" couleur="t2">
        {[t("vo2.deA", { de: nombre(vo2maxDeVma(points[0]!.vma), 1), a: nombre(vo2maxDeVma(points.at(-1)!.vma), 1) }), nT ? tp("vo2.nTests", nT) : null, nE ? tp("vo2.nEstimations", nE) : null].filter(Boolean).join(", ")}
      </Texte>
    </>
  ) : (
    <Texte variante="corps" couleur="t2" style={{ marginTop: 18 }}>
      {t("vo2.aucunPoint")}
    </Texte>
  );
  const meilleure = h.reduce<PointVo2 | null>((x, p) => (!x || p.vma > x.vma ? p : x), null);
  const anTests = h.filter((p) => p.src === "test" && p.date >= maintenant - 365 * JOUR).length;
  return (
    <Statistiques<TypeP>
      periodes={(["mois", "trim", "annee", "tout"] as const).map((v) => ({ valeur: v, libelle: t(`mesuresCorps.periode.${v}`) }))}
      type={type}
      onType={(v) => {
        setType(v);
        setK(0);
        setCol(null);
      }}
      titre={titre}
      precedent={precedent}
      onAller={(s) => {
        setK((x) => Math.max(0, x + s));
        setCol(null);
      }}
      k={k}
      entete={entete}
      nb={COLONNES}
      sel={col}
      onSel={setCol}
      cle={`${type}-${k}`}
      libelleGraphe={t("vo2.graphe")}
      graphe={(largeur) => <GrapheVo2 points={points} de={de} a={a} largeur={largeur} sel={sel} age={d.age} sexe={d.sexe} historique={h} />}
      legende={
        <Cles
          cles={[
            { libelle: t("vo2.cle.test"), pastille: true, couleur: m.fort },
            { libelle: t("vo2.cle.course"), creux: true },
            { libelle: t("vo2.cle.retenue"), trait: "plein" },
            { libelle: t("vo2.cle.reperes"), trait: "tiret" },
          ]}
        />
      }
      apres={
        <Groupe>
          <Lignes>
            {[
              meilleure ? <LigneMesure key="m" titre={t("vo2.meilleure")} sous={dateCourte(meilleure.date, maintenant)} valeur={nombre(vo2maxDeVma(meilleure.vma), 1)} /> : null,
              <LigneMesure key="t" titre={t("vo2.testsVma")} sous={t("vo2.surUnAn")} valeur={String(anTests)} />,
              <LigneMesure key="c" titre={t("vo2.coursesLues")} sous={t("vo2.coursesLuesSous")} valeur={String(d.courses)} />,
            ]}
          </Lignes>
        </Groupe>
      }
    />
  );
}

// ---- Page --------------------------------------------------------------------------------------------------------------

export function PageVo2() {
  const maintenant = Date.now();
  const [d, recharger, panne] = useCharge((db) => lireVo2(db, { detail: true }), [], undefined, "sante/vo2max");
  // Précision pepfit : la VO2max et sa catégorie s'affichent quand leur calcul est sûr (précision ≥ 50, cap Portrait)
  const precision = usePrecision();
  const { couleurs: c } = useTheme();
  if (!d) return <PageMesure titre={t("vo2.titre")}>{panne ? <EnPanne onReessayer={() => void recharger().catch(console.error)} /> : null}</PageMesure>;
  if (!d.vo2) {
    return (
      <PageMesure titre={t("vo2.titre")}>
        <PageVide icone="souffle" titre={t("vo2.videTitre")} texte={t("vo2.videTexte")} action={t("vo2.voirTest")} onAction={ouvrirTestVma} />
      </PageMesure>
    );
  }
  if (!precision) return <PageMesure titre={t("vo2.titre")}>{null}</PageMesure>;
  if (!lecture(precision.r, "vo2").ouverte)
    return (
      <PageMesure titre={t("vo2.titre")}>
        <AttenteLecture calcul="vo2" e={precision} fond={c.s1} />
      </PageMesure>
    );
  const testsVma = d.tests.slice().reverse();
  return (
    <PageMesure titre={t("vo2.titre")}>
      <Quand texte={quandVo2(d, maintenant)} />
      <Heros
        valeur={texteVo2(d)}
        unite={t("vo2.unite")}
        libelle={`${texteVo2(d)} ${t("vo2.unite")}, ${phraseCategorie(d)}`}
        sous={<LigneCategorie d={d} />}
      />
      {/* sa précision remplace « à confirmer, estimée » (planche precision, section 7) */}
      <MiniPrecision calcul="vo2" style={STYLE_MINI} />
      <TitreGroupe>{d.age != null && d.sexe ? t("vo2.place", { qui: t(`vo2.qui.${d.sexe}`), de: Math.max(20, Math.floor(Math.min(d.age, 79) / 10) * 10), a: Math.max(29, Math.floor(Math.min(d.age, 79) / 10) * 10 + 9) }) : t("vo2.placeSans")}</TitreGroupe>
      <Groupe bloc>
        <RampeVo2 vo2={d.vo2.valeur} age={d.age} sexe={d.sexe} decimales={d.vo2.methode === "uth" ? 0 : 1} />
        <Note>{d.age != null && d.sexe ? t("vo2.noteFriend") : t("vo2.noteSansProfil")}</Note>
      </Groupe>
      {d.vo2.methode === "uth" ? <Note style={{ marginHorizontal: MARGE }}>{t("vo2.noteUth", { f: nombre(facteurUth(d.sexe), 1), max: d.zones.fcMax.bpm, repos: d.fcRepos?.bpm ?? 0 })}</Note> : null}
      <BlocVma d={d} maintenant={maintenant} />
      <StatsVo2 d={d} maintenant={maintenant} />
      {testsVma.length ? (
        <>
          <TitreGroupe>{t("vo2.testsVma")}</TitreGroupe>
          <Groupe>
            <Lignes>
              {testsVma.map((x) => (
                <LigneMesure
                  key={x.date}
                  titre={memeJour(x.date, maintenant) ? t("mesures.aujourdhui") : dateCourte(x.date, maintenant)}
                  sous={t("vo2.mEn6", { m: nombre(x.distanceM, 0) })}
                  valeur={nombre(x.distanceM / 100, 1)}
                  unite={t("vo2.kmh")}
                  sousValeur={t("vo2.vo2N", { v: nombre(vo2maxDeVma(x.distanceM / 100), 1) })}
                  onPress={x.seanceId ? () => router.push({ pathname: "/history/[id]", params: { id: x.seanceId! } }) : undefined}
                />
              ))}
            </Lignes>
          </Groupe>
        </>
      ) : null}
      <TitreGroupe>{t("vo2.zones")}</TitreGroupe>
      <Groupe>
        <LigneMesure
          titre={t("zones.titre")}
          sous={sourceZones(d.zones)}
          valeur={`Z2 ${d.zones.bornes[1]}–${d.zones.bornes[2] - 1}`}
          onPress={() => router.push("/settings/zones")}
        />
      </Groupe>
      <TitreGroupe>{t("mesures.sources")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="t"
              titre={t("vo2.src.test")}
              sous={d.tests.length ? t("vo2.src.testSous", { date: dateCourte(d.tests.at(-1)!.date, maintenant) }) : t("vo2.src.testAucun")}
              etat={d.vma?.source === "test" ? t("vo2.etat.utilise") : null}
              onPress={ouvrirTestVma}
            />,
            <LigneMesure key="c" titre={t("vo2.src.courses")} sous={tp("vo2.src.coursesSous", d.courses)} etat={d.vma?.source === "estimee" ? t("vo2.etat.utilise") : t("vo2.etat.siPasTest")} />,
            <LigneMesure key="f" titre={t("vo2.src.fc")} sous={sourceZones(d.zones)} etat={d.vo2.methode === "uth" ? t("vo2.etat.utilise") : t("vo2.etat.siPasVma")} onPress={() => router.push("/settings/zones")} />,
            <LigneMesure
              key="p"
              titre={t("vo2.src.profil")}
              sous={d.age != null && d.sexe ? t("vo2.src.profilSous", { sexe: t(`vo2.sexe.${d.sexe}`), age: d.age }) : t("vo2.src.profilVide")}
              etat={t("vo2.etat.utilise")}
              onPress={() => router.push("/settings/corps")}
            />,
          ]}
        </Lignes>
      </Groupe>
      <Note style={{ marginHorizontal: MARGE, marginTop: 12 }}>{t("vo2.noteMethode")}</Note>
    </PageMesure>
  );
}

/** « ● Très bonne pour un homme de 39 ans · mieux que 82 % », « estimée », « à confirmer ». */
function LigneCategorie({ d }: { d: DonneesVo2 }) {
  const m = useMesure();
  const uth = d.vo2?.methode === "uth";
  return (
    <View style={styles.cat}>
      <View style={[styles.pt, { backgroundColor: m.fort }]} />
      <Texte variante="corps" style={{ flexShrink: 1 }}>
        {phraseCategorie(d)}
        <Texte variante="corps" couleur="t2">
          {!uth && d.percentile != null ? `, ${t("vo2.mieuxQue", { n: Math.floor(d.percentile) })}` : ""}
        </Texte>
      </Texte>
    </View>
  );
}

/** Bloc « VMA et allures » : la VMA (test, estimée ou rien), le test à faire ou refaire, les cinq allures. */
function BlocVma({ d, maintenant }: { d: DonneesVo2; maintenant: number }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const v = d.vma;
  const tests = d.tests;
  const precedent = tests.length >= 2 ? tests[tests.length - 2]! : null;
  const refaireEstimee = v?.refaire && d.estimee && v.source === "test" && d.estimee.vma > v.vma;
  return (
    <>
      <TitreGroupe>{t("vo2.vmaAllures")}</TitreGroupe>
      <Groupe bloc>
        {v ? (
          <Duo
            gauche={
              <ValeurDuo
                avant={t("vo2.vma")}
                valeur={approx(nombre(v.vma, 1), v.source !== "test")}
                unite={t("vo2.kmh")}
                sous={
                  v.source === "test"
                    ? memeJour(v.date, maintenant)
                      ? t("vo2.testAujourdhui", { m: nombre(v.vma * 100, 0) })
                      : t("vo2.testDu", { m: nombre(v.vma * 100, 0), date: dateCourte(v.date, maintenant) })
                    : d.estimee?.portion
                      ? t("vo2.portion", { min: Math.round(d.estimee.portion.dureeS / 60), allure: allureTexte(3600 / d.estimee.portion.vitesseKmH), date: dateCourte(d.estimee.date, maintenant) })
                      : t("vo2.estimee")
                }
              />
            }
            droite={
              v.source === "test" && precedent ? (
                <ValeurDuo droite avant={t("vo2.depuis", { date: dateCourte(precedent.date, maintenant) })} valeur={`${v.vma >= precedent.distanceM / 100 ? "+" : "−"}${nombre(Math.abs(v.vma - precedent.distanceM / 100), 1)} ${t("vo2.kmh")}`} />
              ) : undefined
            }
          />
        ) : (
          <>
            <Texte variante="meta" couleur="t3">{t("vo2.vma")}</Texte>
            <Texte variante="exercice" style={{ marginTop: 2 }}>{t("vo2.pasDeVma")}</Texte>
            <Texte variante="corps" style={styles.phrase}>{t("vo2.phraseSansVma")}</Texte>
            <BoutonPlein libelle={t("vo2.voirTest")} onPress={ouvrirTestVma} />
          </>
        )}
        {v?.source === "estimee" ? (
          <>
            <Texte variante="corps" style={[styles.phrase, { marginTop: 0 }]}>{t("vo2.phraseEstimee")}</Texte>
            <BoutonPlein libelle={t("vo2.faireTest")} onPress={ouvrirTestVma} />
          </>
        ) : null}
        {v?.refaire ? (
          <>
            <View style={[styles.bandeau, { backgroundColor: couleurs.s2 }]}>
              <Icone nom="hautFleche" couleur={m.fort} taille={18} />
              <Texte variante="corps" style={{ flex: 1, lineHeight: 19 }}>
                {refaireEstimee ? t("vo2.refaire", { v: approx(nombre(d.estimee!.vma, 1)) }) : t("vo2.refaireVieux")}
                <Texte variante="corps" couleur="t2">{` ${t("vo2.refaireSuite")}`}</Texte>
              </Texte>
            </View>
            <BoutonPlein libelle={t("vo2.refaireTest")} onPress={ouvrirTestVma} />
          </>
        ) : null}
        {v ? <Allures vma={v.vma} /> : null}
        {v?.source === "test" && !v.refaire ? (
          <>
            <Appui accessibilityRole="button" onPress={ouvrirTestVma} style={[styles.tonal, { backgroundColor: couleurs.s2 }]}>
              <Icone nom="timer" couleur={couleurs.t1} taille={18} />
              <Texte style={{ fontFamily: police.medium, fontSize: 15 }}>{t("vo2.refaireTest")}</Texte>
            </Appui>
            <Note>{t("vo2.noteRefaire")}</Note>
          </>
        ) : null}
      </Groupe>
    </>
  );
}

/** Tes allures : footing, marathon, seuil, fractionné long et court, en part de la VMA (lente – rapide, au km). */
export function Allures({ vma, ids }: { vma: number; ids?: readonly string[] }) {
  const m = useMesure();
  return (
    <View style={[styles.allures, { borderTopColor: m.sep }]}>
      {ALLURES.filter((x) => !ids || ids.includes(x.id)).map((x, i) => (
        <View key={x.id} style={[styles.al, i ? { borderTopWidth: 1, borderTopColor: m.sep } : null]} accessible accessibilityLabel={`${t(`vo2.allure.${x.id}`)}, ${plage(vma, x)} ${t("vo2.parKm")}`}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texte variante="corps" style={{ fontSize: 15 }}>{t(`vo2.allure.${x.id}`)}</Texte>
            <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>{`${pourcent(x)}, ${t(`vo2.routine.${x.id}`)}`}</Texte>
          </View>
          <Texte style={styles.alV}>
            {plage(vma, x)}
            <Texte variante="meta" couleur="t3">{` ${t("vo2.parKm")}`}</Texte>
          </Texte>
        </View>
      ))}
    </View>
  );
}

const pourcent = (x: (typeof ALLURES)[number]) => (x.de === x.a ? `${Math.round(x.de * 100)} %` : `${Math.round(x.de * 100)}–${Math.round(x.a * 100)} %`);
const plage = (vma: number, x: (typeof ALLURES)[number]) =>
  x.de === x.a ? allureTexte(allureA(vma, x.de)) : `${allureTexte(allureA(vma, x.de))} – ${allureTexte(allureA(vma, x.a))}`;

const styles = StyleSheet.create({
  bulle: { position: "absolute", top: -24, width: 60, marginLeft: -30, textAlign: "center", fontFamily: police.semibold, fontSize: 13 },
  rampe: { flexDirection: "row" },
  rep: { position: "absolute", top: -6, height: 22, width: 6, marginLeft: -3, borderRadius: 3, borderWidth: 2 },
  repMini: { top: -4, height: 14, width: 5, marginLeft: -2.5, borderWidth: 1.5 },
  noms: { flexDirection: "row", gap: 3, marginTop: 10 },
  nom: { flex: 1, fontSize: 11 },
  bornes: { height: 16, marginTop: 2 },
  borne: { position: "absolute", width: 40, marginLeft: -20, textAlign: "center", fontSize: 11, fontVariant: ["tabular-nums"] },
  enteteV: { fontFamily: police.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, marginTop: 2, fontVariant: ["tabular-nums"] },
  cat: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  pt: { width: 8, height: 8, borderRadius: 4 },
  phrase: { lineHeight: 20, marginTop: 12 },
  bandeau: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 14, padding: 12, borderRadius: rayon.l },
  allures: { marginTop: 14, borderTopWidth: 1 },
  al: { flexDirection: "row", alignItems: "center", minHeight: 52, gap: 12 },
  alV: { fontFamily: police.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  tonal: { height: 48, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 },
});
