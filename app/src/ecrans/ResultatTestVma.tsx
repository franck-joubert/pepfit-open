import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { corrigerTestVma, lireRoutine, lireSexe, lireTestsVma, lireTestVmaSeance, lireZonesFc, type Executeur, type TestVmaLu } from "../db";
import { lireAge } from "../db/depots/profil";
import { minuscule, t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { etapesDeRoutine, lignesCourse } from "./etapes-course";
import { jourMois, nombre } from "./format";
import { Allures, nomCategorie, pourAge } from "./mesures/Vo2";
import { categorieVo2, vmaDemiCooper, vo2maxDeVma, type Sexe } from "./mesures/vma-calc";
import type { Zones } from "./zones-fc";

// Fin d'un test VMA (planche vma-vo2max, écrans 10 et 11, validés le 29/10) : avant la carte et les tours, ta VMA et son écart
// au test d'avant, la VO2max et sa catégorie, la FC max mesurée, trois allures ; « Corriger la distance » (piste de 400 m :
// tours et mètres en plus, ou une autre distance). Un test arrêté avant la fin le dit, sans VMA inventée.

interface Lu {
  test: TestVmaLu | null;
  /** La routine avait un test, mais il n'a pas été couru jusqu'au bout. */
  interrompu: boolean;
  precedent: TestVmaLu | null;
  age: number | null;
  sexe: Sexe | null;
  zones: Zones;
}

async function lire(db: Executeur, seanceId: string, routineId: string | null, debut: number): Promise<Lu | null> {
  const test = await lireTestVmaSeance(db, seanceId);
  if (!test) {
    const r = routineId ? await lireRoutine(db, routineId) : null;
    const avecTest = r ? etapesDeRoutine(lignesCourse(r)).some((e) => e.genre === "test") : false;
    return avecTest ? { test: null, interrompu: true, precedent: null, age: null, sexe: null, zones: await lireZonesFc(db) } : null;
  }
  const [tests, age, sexe, zones] = await Promise.all([lireTestsVma(db), lireAge(db), lireSexe(db), lireZonesFc(db)]);
  const precedent = tests.filter((x) => x.date < debut).at(-1) ?? null;
  return { test, interrompu: false, precedent, age: age?.age ?? null, sexe, zones };
}

export function ResultatTestVma({ db, seanceId, routineId, debut, fcMaxSeance }: { db: Executeur; seanceId: string; routineId: string | null; debut: number; fcMaxSeance: number | null }) {
  const { couleurs } = useTheme();
  const [lu, setLu] = useState<Lu | null>(null);
  const [corriger, setCorriger] = useState(false);
  const relire = useCallback(() => lire(db, seanceId, routineId, debut).then(setLu).catch(console.error), [db, seanceId, routineId, debut]);
  useEffect(() => {
    relire();
  }, [relire]);
  if (!lu) return null;
  if (lu.interrompu || !lu.test)
    return (
      <View style={[styles.carte, { backgroundColor: couleurs.s1 }]}>
        <Texte variante="exercice">{t("vmaTest.interrompu")}</Texte>
        <Texte variante="corps" couleur="t2" style={{ marginTop: 4, lineHeight: 20 }}>
          {t("vmaTest.interrompuSuite")}
        </Texte>
      </View>
    );
  const vma = vmaDemiCooper(lu.test.distanceM) ?? lu.test.distanceM / 100;
  const vo2 = vo2maxDeVma(vma);
  const cat = categorieVo2(vo2, lu.age, lu.sexe);
  const avant = lu.precedent ? lu.precedent.distanceM / 100 : null;
  const mesuree = lu.zones.fcMax.source === "mesuree" && lu.zones.fcMax.date === debut;
  const fcMax = mesuree ? lu.zones.fcMax.bpm : fcMaxSeance;
  return (
    <View style={[styles.carte, { backgroundColor: couleurs.s1 }]} accessible={false}>
      <Texte variante="corps" couleur="t2">{t("vmaTest.taVma")}</Texte>
      <View style={styles.vmaL} accessible accessibilityLabel={`${t("vmaTest.taVma")} ${nombre(vma, 1)} ${t("vo2.kmh")}`}>
        <Texte style={styles.vma}>{nombre(vma, 1)}</Texte>
        <Texte couleur="t2" style={styles.vmaU}>{t("vo2.kmh")}</Texte>
      </View>
      <Texte variante="corps" couleur="t2" style={{ marginTop: 2 }}>
        {avant != null ? (
          <Texte variante="corps" style={{ color: vma >= avant ? couleurs.valide : couleurs.t2, fontFamily: police.medium }}>
            {`${vma >= avant ? "+" : "−"}${nombre(Math.abs(vma - avant), 1)} `}
          </Texte>
        ) : null}
        {[avant != null ? t("vmaTest.depuisLe", { date: jourMois(lu.precedent!.date) }) : null, t("vo2.mEn6", { m: nombre(lu.test.distanceM, 0) })].filter(Boolean).join(", ")}
      </Texte>
      <View style={[styles.deux, { borderTopColor: couleurs.line }]}>
        <View style={{ flex: 1 }}>
          <Texte variante="meta" couleur="t3">{t("vo2.court")}</Texte>
          <Texte style={styles.v}>
            {nombre(vo2, 1)}
            <Texte variante="meta" couleur="t3">{` ${t("vo2.unite")}`}</Texte>
          </Texte>
          <Texte variante="meta" couleur="t2">{pourAge(minuscule(nomCategorie(cat)), lu.age)}</Texte>
        </View>
        {fcMax != null ? (
          <View style={[styles.col2, { borderLeftColor: couleurs.line }]}>
            <Texte variante="meta" couleur="t3">{t("zones.fcMax")}</Texte>
            <Texte style={styles.v}>
              {String(fcMax)}
              <Texte variante="meta" couleur="t3">{` ${t("gps.bpm")}`}</Texte>
            </Texte>
            <Texte variante="meta" couleur="t2">{t(mesuree ? "vmaTest.fcMaxMesuree" : "vmaTest.fcMaxSeance")}</Texte>
          </View>
        ) : null}
      </View>
      <Allures vma={vma} ids={["footing", "seuil", "long"]} />
      <Pressable accessibilityRole="button" onPress={() => setCorriger(true)} style={({ pressed }) => [styles.corriger, pressed && { backgroundColor: couleurs.s2 }]}>
        <Icone nom="regle" couleur={couleurs.partieEntrainement} taille={18} />
        <Texte style={{ fontFamily: police.medium, fontSize: 15 }}>{t("vmaTest.corriger")}</Texte>
      </Pressable>
      <FeuilleDistance
        visible={corriger}
        distanceM={lu.test.distanceM}
        onFermer={() => setCorriger(false)}
        onEnregistrer={(d) => {
          setCorriger(false);
          corrigerTestVma(db, seanceId, d).then(relire).catch(console.error);
        }}
      />
    </View>
  );
}

const TOUR_M = 400;

/** Corriger la distance du test : piste de 400 m (tours, mètres en plus de 10 en 10) ou autre distance (de 10 en 10 m). */
function FeuilleDistance({ visible, distanceM, onFermer, onEnregistrer }: { visible: boolean; distanceM: number; onFermer: () => void; onEnregistrer: (d: number) => void }) {
  const { couleurs } = useTheme();
  const [mode, setMode] = useState<"piste" | "autre">("piste");
  // La distance exacte au départ (pas d'arrondi tant qu'on ne touche à rien) ; les boutons vont de 10 m en 10 m.
  const [d, setD] = useState(Math.round(distanceM));
  useEffect(() => {
    if (visible) setD(Math.round(distanceM));
  }, [visible, distanceM]);
  const tours = Math.floor(d / TOUR_M);
  const reste = d - tours * TOUR_M;
  const borne = (v: number) => Math.max(600, Math.min(2600, v));
  const vma = vmaDemiCooper(d);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("vmaTest.distanceTitre")}
      sousTitre={t("vmaTest.distanceSous", { m: nombre(distanceM, 0) })}
      pied={<BoutonPrincipal libelle={t("vmaTest.enregistrer")} onPress={() => onEnregistrer(d)} />}
    >
      <Segmente<"piste" | "autre">
        options={[
          { valeur: "piste", libelle: t("vmaTest.piste") },
          { valeur: "autre", libelle: t("vmaTest.autre") },
        ]}
        valeur={mode}
        onChange={setMode}
      />
      <View style={[styles.reglages, { backgroundColor: couleurs.feuilleGroupe }]}>
        {mode === "piste" ? (
          <>
            <Pas valeur={String(tours)} unite={t("vmaTest.tours")} moins={() => setD(borne(d - TOUR_M))} plus={() => setD(borne(d + TOUR_M))} libelle={t("vmaTest.tours")} />
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: couleurs.line }} />
            <Pas valeur={String(reste)} unite={t("vmaTest.mEnPlus")} moins={() => setD(borne(tours * TOUR_M + Math.max(0, reste - 10)))} plus={() => setD(borne(tours * TOUR_M + Math.min(390, reste + 10)))} libelle={t("vmaTest.mEnPlus")} />
          </>
        ) : (
          <Pas valeur={nombre(d, 0)} unite="m" moins={() => setD(borne(d - 10))} plus={() => setD(borne(d + 10))} libelle={t("vmaTest.distance")} />
        )}
      </View>
      <View style={styles.total}>
        <Texte variante="corps" couleur="t2">
          {`${t("vmaTest.distance")} `}
          <Texte style={styles.totalV}>{`${nombre(d, 0)} m`}</Texte>
        </Texte>
        <Texte variante="corps" couleur="t2">
          {`${t("vo2.vma")} `}
          <Texte style={styles.totalV}>{vma != null ? `${nombre(vma, 1)} ${t("vo2.kmh")}` : "—"}</Texte>
        </Texte>
      </View>
    </Feuille>
  );
}

function Pas({ valeur, unite, moins, plus, libelle }: { valeur: string; unite: string; moins: () => void; plus: () => void; libelle: string }) {
  const { couleurs } = useTheme();
  const bouton = (icone: "moins" | "plus", f: () => void, lu: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${lu}, ${libelle}`} onPress={f} style={({ pressed }) => [styles.bt, { backgroundColor: pressed ? couleurs.s3 : couleurs.s2 }]}>
      <Icone nom={icone} couleur={couleurs.t1} taille={22} />
    </Pressable>
  );
  return (
    <View style={styles.pas}>
      {bouton("moins", moins, t("vmaTest.moins"))}
      <View style={{ alignItems: "center" }} accessible accessibilityLabel={`${valeur} ${unite}`}>
        <Texte style={styles.pasV}>{valeur}</Texte>
        <Texte variante="corps" couleur="t2">{unite}</Texte>
      </View>
      {bouton("plus", plus, t("vmaTest.plus"))}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { marginHorizontal: espace.l, marginTop: espace.l, borderRadius: rayon.l, paddingTop: 18, paddingHorizontal: espace.l, paddingBottom: espace.s },
  vmaL: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 },
  vma: { fontFamily: police.light, fontSize: 64, lineHeight: 68, letterSpacing: -1.9, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  vmaU: { fontFamily: police.light, fontSize: 20 },
  deux: { flexDirection: "row", marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  col2: { flex: 1, paddingLeft: 14, borderLeftWidth: StyleSheet.hairlineWidth },
  v: { fontFamily: police.medium, fontSize: 20, marginTop: 2, fontVariant: ["tabular-nums"] },
  corriger: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: rayon.l, marginTop: 6 },
  reglages: { marginTop: 12, borderRadius: rayon.l },
  pas: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 },
  bt: { width: 56, height: 56, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  pasV: { fontFamily: police.light, fontSize: 40, lineHeight: 46, fontVariant: ["tabular-nums"] },
  total: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingHorizontal: 4 },
  totalV: { fontFamily: police.semibold, fontSize: 20 },
});
