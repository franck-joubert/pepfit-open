import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ecrireFcMaxSaisie, ecrireMethodeZones, ecrireModeFcMax, lireModeFcMax, lireReglage, lireZonesFc, CLE_FC_MAX } from "../db";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import type { Jetons } from "../theme/jetons";
import { espace, police, rayon } from "../theme/typo";
import { BarreHaut } from "../ui/Cadre";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { GroupeReglages, LigneReglage, SectionReglages } from "./Reglage";
import { fcMaxTanaka, plagesZones, saisieValide, type MethodeZones, type ModeFcMax, type Zones } from "./zones-fc";
import { sourceZones } from "./zones-texte";
import { lireAge } from "../db/depots/profil";

// Zones de FC (planche vma-vo2max, écran 12 et feuille 13, validés le 29/10) : la bande des cinq zones et leurs bornes, la
// méthode (réserve cardiaque ou tranches de la FC max), une ligne par zone (plage, ce qu'on y fait), puis ce qui les donne :
// la FC max (feuille : automatique, d'après l'âge, saisie) et la FC au repos (sa page). Ouverte depuis Préférences › Séance
// et la ligne de source de chaque barre des zones.

const NOMS = ["recup", "endurance", "tempo", "seuil", "vma"] as const;

export function PageZonesFc() {
  useLangue();
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const [zones, relire] = useCharge((d) => lireZonesFc(d), []);
  const [feuille, setFeuille] = useState(false);
  const [feuilleMethode, setFeuilleMethode] = useState(false);
  const [demandee, setDemandee] = useState<MethodeZones | null>(null);
  useEffect(() => {
    lireReglage(db, "zones_methode").then((v) => setDemandee(v === "fcmax" ? "fcmax" : "reserve")).catch(console.error);
  }, [db]);
  const choisir = (m: MethodeZones) => {
    setDemandee(m);
    ecrireMethodeZones(db, m).then(relire).catch(console.error);
  };
  const texteBande = mode === "nuit" ? "#000000" : "#ffffff";
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("zones.titre")} />
      {zones ? (
        <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
          <Texte couleur="t2" style={styles.quand}>
            {sourceZones(zones)}
          </Texte>
          <Bande zones={zones} couleurs={couleurs} texte={texteBande} />
          {demandee === "reserve" && zones.methode === "fcmax" ? (
            <Texte couleur="t3" style={styles.note}>
              {t("zones.sansRepos")}
            </Texte>
          ) : null}
          <GroupeReglages style={styles.groupe}>
            {plagesZones(zones).map((p, i) => (
              <View key={i} style={[styles.zone, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 } : null]} accessible accessibilityLabel={`${t("zones.zoneN", { n: i + 1 })}, ${t(`zones.nom.${NOMS[i]!}`)}, ${p.bas}–${p.haut} ${t("gps.bpm")}`}>
                <View style={[styles.carre, { backgroundColor: couleurs[`zone${i + 1}` as keyof Jetons] }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Texte variante="saisie" style={styles.zoneT}>{`${t("zones.zoneN", { n: i + 1 })}, ${t(`zones.nom.${NOMS[i]!}`)}`}</Texte>
                  <Texte couleur="t3" style={styles.zoneS}>{`${50 + i * 10}–${60 + i * 10} %, ${t(`zones.usage.${NOMS[i]!}`)}`}</Texte>
                </View>
                <Texte style={styles.zoneV}>
                  {`${p.bas}–${p.haut}`}
                  <Texte couleur="t3" style={styles.zoneU}>{` ${t("gps.bpm")}`}</Texte>
                </Texte>
              </View>
            ))}
          </GroupeReglages>

          <SectionReglages titre={t("zones.calcul")} />
          <GroupeReglages>
            <LigneReglage libelle={t("zones.methode.titre")} valeur={t(`zones.methode.${demandee ?? "reserve"}`)} onPress={() => setFeuilleMethode(true)} hauteur={60} />
            <LigneReglage libelle={t("zones.fcMax")} sous={texteFcMax(zones)} valeur={`${zones.fcMax.bpm} ${t("gps.bpm")}`} onPress={() => setFeuille(true)} hauteur={60} />
            <LigneReglage
              libelle={t("zones.fcRepos")}
              sous={zones.fcRepos ? tp(zones.fcRepos.source === "whoop" ? "zones.reposWhoop" : "zones.reposSc", zones.fcRepos.n) : t("zones.reposAucun")}
              valeur={zones.fcRepos ? `${zones.fcRepos.bpm} ${t("gps.bpm")}` : "—"}
              onPress={() => router.push("/sante/fc")}
              hauteur={60}
            />
          </GroupeReglages>
          <Texte couleur="t3" style={styles.note}>
            {t(demandee === "fcmax" ? "zones.explication.fcmax" : "zones.explication")}
          </Texte>
        </ScrollView>
      ) : null}
      <Feuille visible={feuilleMethode} onFermer={() => setFeuilleMethode(false)} titre={t("zones.methode.titre")} pied={<BoutonPrincipal libelle={t("zones.ok")} onPress={() => setFeuilleMethode(false)} />}>
        <Groupe>
          <Option premier libelle={t("zones.methode.reserve")} aide={t("zones.methode.reserveAide")} choisi={(demandee ?? "reserve") === "reserve"} onPress={() => choisir("reserve")} />
          <Option libelle={t("zones.methode.fcmax")} aide={t("zones.methode.fcmaxAide")} choisi={demandee === "fcmax"} onPress={() => choisir("fcmax")} />
        </Groupe>
        <Texte couleur="t3" style={styles.noteF}>
          {t("zones.methode.partout")}
        </Texte>
      </Feuille>
      <FeuilleFcMax visible={feuille} zones={zones ?? null} onFermer={() => setFeuille(false)} onChange={() => relire().catch(console.error)} />
    </SafeAreaView>
  );
}

/** « Mesurée au test VMA, le 29 oct. », « D'après ton âge (208 − 0,7 × 39) », « Saisie ». */
function texteFcMax(z: Zones): string {
  const s = z.fcMax.source;
  if (s === "mesuree") return t("zones.fcMaxMesuree");
  if (s === "saisie") return t("zones.fcMaxSaisie");
  if (s === "estimee") return t("zones.fcMaxAge");
  return t("zones.fcMaxDefaut");
}

/** La bande des cinq zones (même largeur : chacune vaut 10 % de la réserve ou de la FC max) et leurs bornes dessous. */
function Bande({ zones, couleurs, texte }: { zones: Zones; couleurs: Jetons; texte: string }) {
  const bornes = [...zones.bornes, zones.fcMax.bpm];
  return (
    <View style={styles.bandeBloc} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.bande}>
        {[1, 2, 3, 4, 5].map((z) => (
          <View key={z} style={[styles.bandeI, { backgroundColor: couleurs[`zone${z}` as keyof Jetons] }]}>
            <Texte style={[styles.bandeT, { color: texte }]}>{t("zones.zCourt", { n: z })}</Texte>
          </View>
        ))}
      </View>
      <View style={styles.bornes}>
        {bornes.map((b, i) => (
          <Texte key={i} couleur="t2" style={[styles.borne, i === 0 ? { left: 0 } : i === 5 ? { right: 0 } : { left: `${i * 20}%`, transform: [{ translateX: -12 }] }]}>
            {String(b)}
          </Texte>
        ))}
      </View>
    </View>
  );
}

/** Feuille FC max : automatique (mesurée, sinon d'après l'âge), d'après l'âge, ou saisie (− / + de 1 bpm). */
function FeuilleFcMax({ visible, zones, onFermer, onChange }: { visible: boolean; zones: Zones | null; onFermer: () => void; onChange: () => void }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [modeFc, setModeFc] = useState<ModeFcMax>("auto");
  const [saisie, setSaisie] = useState(180);
  const [age, setAge] = useState<number | null>(null);
  useEffect(() => {
    if (!visible) return;
    Promise.all([lireModeFcMax(db), lireReglage(db, CLE_FC_MAX), lireAge(db)])
      .then(([m, s, a]) => {
        setModeFc(m);
        const v = s == null ? null : Number(s);
        setSaisie(saisieValide(v) ? Math.round(v) : (zones?.fcMax.bpm ?? 180));
        setAge(a?.age ?? null);
      })
      .catch(console.error);
  }, [db, visible, zones]);
  const choisir = (m: ModeFcMax) => {
    setModeFc(m);
    const fait = m === "saisie" ? ecrireFcMaxSaisie(db, saisie).then(() => ecrireModeFcMax(db, m)) : ecrireModeFcMax(db, m);
    fait.then(onChange).catch(console.error);
  };
  const regler = (d: number) => {
    const v = Math.min(240, Math.max(100, saisie + d));
    setSaisie(v);
    ecrireFcMaxSaisie(db, v).then(onChange).catch(console.error);
  };
  const vue = zones?.fcMax.vue ?? null;
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("zones.fcMax")} pied={<BoutonPrincipal libelle={t("zones.ok")} onPress={onFermer} />}>
      <Groupe>
        <Option premier libelle={t("zones.mode.auto")} aide={vue != null ? t("zones.mode.autoAide", { n: vue }) : t("zones.mode.autoAideRien")} choisi={modeFc === "auto"} onPress={() => choisir("auto")} />
        <Option libelle={t("zones.mode.age")} aide={age != null ? t("zones.mode.ageAide", { n: fcMaxTanaka(age), age }) : t("zones.mode.ageAideRien")} choisi={modeFc === "age"} onPress={() => choisir("age")} />
        <Option libelle={t("zones.mode.saisie")} aide={t("zones.mode.saisieAide")} choisi={modeFc === "saisie"} onPress={() => choisir("saisie")} />
      </Groupe>
      {modeFc === "saisie" ? (
        <View style={[styles.reglage, { backgroundColor: couleurs.feuilleGroupe }]}>
          <BoutonPas icone="moins" libelle={t("zones.moins")} onPress={() => regler(-1)} />
          <View style={{ alignItems: "center" }}>
            <Texte style={styles.reglageV}>{String(saisie)}</Texte>
            <Texte couleur="t2" style={{ fontSize: 13 }}>{t("gps.bpm")}</Texte>
          </View>
          <BoutonPas icone="plus" libelle={t("zones.plus")} onPress={() => regler(1)} />
        </View>
      ) : null}
      <Texte couleur="t3" style={styles.noteF}>
        {t("zones.mode.note")}
      </Texte>
    </Feuille>
  );
}

function BoutonPas({ icone, libelle, onPress }: { icone: "plus" | "moins"; libelle: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={libelle} onPress={onPress} style={({ pressed }) => [styles.pas, { backgroundColor: pressed ? couleurs.s3 : couleurs.s2 }]}>
      <Icone nom={icone} taille={22} couleur={couleurs.t1} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quand: { fontSize: 13, marginHorizontal: espace.l, marginTop: espace.xs },
  bandeBloc: { marginHorizontal: espace.l, marginTop: espace.l },
  bande: { flexDirection: "row", gap: 3 },
  bandeI: { flex: 1, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  bandeT: { fontFamily: police.semibold, fontSize: 13 },
  bornes: { height: 18, marginTop: 6 },
  borne: { position: "absolute", fontSize: 12, fontVariant: ["tabular-nums"] },
  groupe: { marginTop: espace.s },
  zone: { flexDirection: "row", alignItems: "center", gap: espace.m, minHeight: 64, paddingVertical: espace.s, paddingHorizontal: espace.l },
  carre: { width: 10, height: 10, borderRadius: 3 },
  zoneT: { fontSize: 15 },
  zoneS: { fontSize: 12, marginTop: 2 },
  zoneV: { fontFamily: police.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  zoneU: { fontFamily: police.regular, fontSize: 12 },
  note: { fontSize: 12, lineHeight: 18, marginHorizontal: espace.l, marginTop: espace.m },
  noteF: { fontSize: 12, lineHeight: 18, marginTop: espace.m },
  reglage: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: espace.m, padding: espace.m, borderRadius: rayon.l },
  reglageV: { fontFamily: police.light, fontSize: 40, lineHeight: 46, fontVariant: ["tabular-nums"] },
  pas: { width: 56, height: 56, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
