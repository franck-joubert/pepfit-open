import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ajouterMachines, exercicesParType, lireInventaire, listerExercices, libelleMachine, MACHINES, palierParDefaut, uniteProfil, type MachineCatalogue,
} from "../../db";
import { disquesDuTrou, lireMateriel } from "../../db/depots/materiel";
import { etendue } from "../../db/materiel";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { useApp, useCharge } from "../../ecrans/contexte";
import { chargesValeurs, FeuilleMachine, type ValeursMachine } from "../../ecrans/materiel/FeuilleMachine";
import { BarreHaut } from "../../ui/Cadre";
import { Coche } from "../../ui/Coche";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Texte } from "../../ui/Texte";
import { Vignettes } from "../../ui/Vignettes";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";

const FAMILLES: [MachineCatalogue["famille"], "salles.famille.machine" | "salles.famille.poulie" | "salles.famille.smith"][] = [
  ["machine", "salles.famille.machine"],
  ["poulie", "salles.famille.poulie"],
  ["smith", "salles.famille.smith"],
];

/** Ajout de machines à une salle : on coche, chaque machine cochée montre ses charges (un toucher ouvre la feuille Machine, planche materiel a7). */
export default function AjouterMachine() {
  const { salle } = useLocalSearchParams<{ salle: string }>();
  const { db } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [inv] = useCharge(() => lireInventaire(db, salle), [db, salle]);
  const [exos] = useCharge(async () => exercicesParType(await listerExercices(db)), [db]);
  const [unite] = useCharge(() => uniteProfil(db), [db]);
  const [disques] = useCharge(async () => disquesDuTrou(await lireMateriel(db, salle), "50"), [db, salle]);
  const [choix, setChoix] = useState<Record<string, ValeursMachine>>({});
  const [reglage, setReglage] = useState<string | null>(null);
  if (!inv || !unite || !disques) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;

  const charges = (c: ValeursMachine) => {
    const l = chargesValeurs(c, disques);
    return l.length ? etendue(l, c.unite) : t("materiel.detail.machineSans");
  };
  const presentes = new Set(inv.machines.map((m) => m.machineId));
  const ids = Object.keys(choix);
  const basculer = (m: MachineCatalogue) =>
    setChoix((c) => {
      if (c[m.id]) {
        const { [m.id]: _, ...reste } = c;
        return reste;
      }
      // Smith et machines à disques : poids à vide à saisir, sans valeur par défaut (D9).
      return { ...c, [m.id]: { mode: m.famille === "smith" ? "disques" : "pile", premiere: null, pas: palierParDefaut(m.id, unite), max: null, appoint: [], unite } };
    });

  const tuile = (m: MachineCatalogue, libelle: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("salles.regler", { libelle })}
      onPress={() => setReglage(m.id)}
      style={[styles.tuile, { backgroundColor: couleurs.s2 }]}
    >
      <Texte variante="meta" couleur="t2">
        {libelle}
      </Texte>
    </Pressable>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("salles.ajouterMachine")} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: espace.xl, paddingBottom: 120 + bas }}>
        {FAMILLES.map(([famille, cleTitre]) => (
          <View key={famille}>
            <Texte variante="exercice" style={styles.titre}>
              {t(cleTitre)}
            </Texte>
            {MACHINES.filter((m) => m.famille === famille).map((m, i) => {
              const deja = presentes.has(m.id);
              const c = choix[m.id];
              const coche = deja || !!c;
              return (
                <View key={m.id} style={[styles.bloc, { borderBottomColor: couleurs.line }, i === 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: coche, disabled: deja }}
                    disabled={deja}
                    onPress={() => basculer(m)}
                    style={[styles.ligne, deja && { opacity: 0.5 }]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Texte variante="saisie" style={{ fontFamily: "Inter-Regular" }}>
                        {libelleMachine(m.id)}
                      </Texte>
                      <Vignettes exercices={exos?.get(`machine:${m.id}`) ?? []} />
                    </View>
                    <View style={[styles.case, { borderColor: coche ? couleurs.t1 : couleurs.line2, backgroundColor: coche ? couleurs.t1 : "transparent" }]}>
                      {coche ? <Coche couleur={couleurs.bg} /> : null}
                    </View>
                  </Pressable>
                  {c ? <View style={styles.tuiles}>{tuile(m, charges(c))}</View> : null}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={[styles.dock, { backgroundColor: couleurs.bg, borderTopColor: couleurs.line, paddingBottom: Math.max(bas, espace.s) + espace.l }]}>
        <BoutonPrincipal
          libelle={ids.length ? tp("salles.ajouterMachines", ids.length) : t("ui.ajouter")}
          desactive={ids.length === 0}
          onPress={() =>
            ajouterMachines(
              db,
              salle,
              ids.map((id) => {
                const c = choix[id]!;
                return { machineId: id, palier: c.pas, max: c.max, min: c.premiere, appoint: c.appoint, disques: c.mode === "disques", unite: c.unite };
              }),
            )
              .then(() => router.back())
              .catch((e) => console.error(e))
          }
        />
      </View>
      <FeuilleMachine
        visible={reglage != null}
        nom={reglage ? libelleMachine(reglage) : ""}
        valeurs={reglage ? choix[reglage] ?? null : null}
        disquesKg={disques}
        onFermer={() => setReglage(null)}
        onEnregistrer={(v) => {
          const r = reglage;
          setReglage(null);
          if (r) setChoix((c) => ({ ...c, [r]: v }));
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  titre: { marginTop: espace.xxl, marginBottom: espace.s },
  bloc: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: espace.xs },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.l, paddingVertical: espace.s },
  case: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  tuiles: { flexDirection: "row", gap: espace.s, paddingBottom: espace.s },
  tuile: { minHeight: 44, borderRadius: rayon.l, paddingHorizontal: espace.l, alignItems: "center", justifyContent: "center" },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espace.xl, paddingTop: espace.l, borderTopWidth: StyleSheet.hairlineWidth },
});
