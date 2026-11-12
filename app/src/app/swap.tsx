import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  alternativesPour, equipementRetirable, libelleMuscle, lireExercice, LIBELLE_EQUIPEMENT, remplacerExercice, retirerEquipementSalle, uniteEquipementPour,
  type Alternative, type Exercice, type RaisonAlternative, type RetraitPossible,
} from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { useApp } from "../ecrans/contexte";
import { poserRetraitRecent } from "../ecrans/retrait-recent";
import { jourMois, serieTexte, tempsTexte, type Unite } from "../ecrans/format";
import { BarreHaut } from "../ui/Cadre";
import { Icone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { Picto } from "../ui/Picto";
import { Texte } from "../ui/Texte";

const RAISONS: [RaisonAlternative, "exercices.alternative.occupe" | "exercices.alternative.manquant"][] = [
  ["occupe", "exercices.alternative.occupe"],
  ["manquant", "exercices.alternative.manquant"],
];

function derniere(a: Alternative, unite: Unite): string {
  const d = a.derniere;
  if (!d) return "";
  const perf = d.kg != null || d.reps != null ? serieTexte(d.kg, d.reps, unite) : tempsTexte(d.dureeS);
  return [perf, jourMois(d.le)].filter(Boolean).join(", ");
}

export default function AlternativeEcran() {
  const { db, reglages } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const { seance, exercice: exerciceId } = useLocalSearchParams<{ seance: string; exercice: string }>();
  const [actuel, setActuel] = useState<Exercice | null>(null);
  const [raison, setRaison] = useState<RaisonAlternative | null>(null);
  const [liste, setListe] = useState<{ faits: Alternative[]; jamais: Alternative[] } | null>(null);
  const [retirable, setRetirable] = useState<RetraitPossible | null>(null);
  const [retirer, setRetirer] = useState(true);
  const [unites, setUnites] = useState<Record<string, Unite>>({});

  useEffect(() => {
    if (!seance || !exerciceId) return;
    lireExercice(db, exerciceId).then(setActuel).catch(() => {});
    equipementRetirable(db, seance, exerciceId).then(setRetirable).catch(() => {});
    (async () => {
      const l = await alternativesPour(db, seance, exerciceId);
      setListe(l);
      const salle = (await db.getFirstAsync<{ salle_id: string | null }>("SELECT salle_id FROM seances WHERE id = ?", [seance]))?.salle_id ?? null;
      const u: Record<string, Unite> = {};
      for (const a of [...l.faits, ...l.jamais]) u[a.exercice.id] = (await uniteEquipementPour(db, a.exercice.id, salle)) ?? reglages.unite;
      setUnites(u);
    })().catch((e) => console.error(e));
  }, [db, seance, exerciceId, reglages.unite]);

  const choisir = (a: Alternative) => {
    if (!seance || !exerciceId) return;
    remplacerExercice(db, seance, exerciceId, a.exercice.id, { raison })
      .then(async () => {
        if (raison === "manquant" && retirer && retirable) {
          const r = await retirerEquipementSalle(db, retirable.salleId, retirable.type);
          if (r) poserRetraitRecent({ retraitId: r.id, libelle: r.libelle, salleNom: retirable.salleNom });
        }
      })
      .then(() => router.back())
      .catch((e) => console.error(e));
  };

  const ligne = (a: Alternative, premier: boolean) => {
    const detail = [LIBELLE_EQUIPEMENT[a.exercice.equipement], derniere(a, unites[a.exercice.id] ?? reglages.unite)].filter(Boolean).join(", ");
    return (
      <Pressable
        key={a.exercice.id}
        accessibilityRole="button"
        accessibilityLabel={t("exercices.alternative.remplacer", { nom: a.exercice.nom })}
        onPress={() => choisir(a)}
        style={({ pressed }) => [
          styles.ligne,
          !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
          pressed && { backgroundColor: couleurs.s1 },
        ]}
      >
        <Picto slug={a.exercice.slug} nom={a.exercice.nom} taille={40} />
        <View style={{ flex: 1 }}>
          <Texte variante="saisie" numberOfLines={1} style={{ fontSize: 15 }}>
            {a.exercice.nom}
          </Texte>
          {detail ? (
            <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ fontSize: 13 }}>
              {detail}
            </Texte>
          ) : null}
        </View>
        <Icone nom="right" couleur={couleurs.t3} taille={22} />
      </Pressable>
    );
  };

  const section = (titre: string, l: Alternative[]) =>
    l.length ? (
      <View>
        <Texte variante="entete" couleur="t2" style={styles.entete}>
          {titre}
        </Texte>
        {l.map((a, i) => ligne(a, i === 0))}
      </View>
    ) : null;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("exercices.alternative.titre")} />
      <ScrollView contentContainerStyle={{ paddingBottom: bas + espace.xxl }}>
        {actuel ? (
          <View style={styles.actuel}>
            <Picto slug={actuel.slug} nom={actuel.nom} taille={36} />
            <Texte variante="titreBarre" numberOfLines={1} style={{ flexShrink: 1 }}>
              {actuel.nom}
            </Texte>
            {actuel.muscle ? (
              <Texte variante="corps" couleur="t2">
                {libelleMuscle(actuel.muscle)}
              </Texte>
            ) : null}
          </View>
        ) : null}
        {actuel?.equipement === "poids_du_corps" ? null : (
          <>
            <View style={styles.raisonTete}>
              <Texte variante="entete" couleur="t2" style={{ flex: 1 }}>
                {t("exercices.alternative.raison")}
              </Texte>
              <Texte variante="corps" couleur="t3">
                {t("exercices.alternative.facultatif")}
              </Texte>
            </View>
            <View style={styles.raisons}>
              {RAISONS.map(([r, cle]) => {
                const libelle = t(cle);
                const actif = raison === r;
                return (
                  <Pressable
                    key={r}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: actif }}
                    accessibilityLabel={libelle}
                    onPress={() => setRaison(actif ? null : r)}
                    style={[styles.raison, { backgroundColor: couleurs.s2 }, actif && { borderColor: couleurs.t1, borderWidth: 2 }]}
                  >
                    <Texte variante="saisie" couleur={actif ? "t1" : "t2"} style={{ fontSize: 15, textAlign: "center" }}>
                      {libelle}
                    </Texte>
                  </Pressable>
                );
              })}
            </View>
            {raison === "manquant" && retirable ? (
              <View style={styles.retirer}>
                <Texte variante="saisie" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
                  {t("exercices.alternative.retirer", { nom: retirable.libelle })}
                </Texte>
                <Interrupteur valeur={retirer} onChange={setRetirer} libelle={t("exercices.alternative.retirer", { nom: retirable.libelle })} />
              </View>
            ) : null}
          </>
        )}
        {liste ? (
          <>
            {section(t("exercices.alternative.dejaFaits"), liste.faits)}
            {section(t("exercices.alternative.jamaisFaits"), liste.jamais)}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actuel: { flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingTop: espace.m, minHeight: 56 },
  raisonTete: { flexDirection: "row", alignItems: "center", paddingHorizontal: espace.l, paddingTop: espace.xl, paddingBottom: espace.s },
  raisons: { flexDirection: "row", gap: espace.s, paddingHorizontal: espace.l },
  raison: { flex: 1, minHeight: 52, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", paddingHorizontal: espace.s },
  retirer: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingTop: espace.s },
  entete: { paddingHorizontal: espace.l, paddingTop: espace.xxl, paddingBottom: espace.s },
  ligne: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: espace.l, paddingHorizontal: espace.l, paddingVertical: espace.m },
});
