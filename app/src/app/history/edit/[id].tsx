import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { lireSeance, modifierSeance, seanceTermineeAuRang, titreSeance, type SeanceDetail } from "../../../db";
import { useTheme } from "../../../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../../../theme/typo";
import { useActionsSeance } from "../../../ecrans/actions-seance";
import { useApp } from "../../../ecrans/contexte";
import { unitesSeance } from "../../../ecrans/donnees";
import { type Unite } from "../../../ecrans/format";
import { LignesHoraires, TitreEditable } from "../../../ecrans/EditionSeance";
import { FeuilleHorairesActivite } from "../../../ecrans/FeuilleHorairesActivite";
import type { Champ } from "../../../ecrans/horaires";
import { FeuilleSalle } from "../../../ecrans/FeuilleSalle";
import { VueSeance } from "../../../ecrans/seance-vue";
import { ChampMessage } from "../../../ecrans/ChampMessage";
import { messageFinal } from "../../../ecrans/message-activite";
import { ZonePhoto } from "../../../ecrans/ZonePhoto";
import { BarreHaut } from "../../../ui/Cadre";
import { BoutonPrincipal } from "../../../ui/Degrade";
import { Icone } from "../../../ui/Icone";
import { t } from "../../../i18n/index";
import { Texte } from "../../../ui/Texte";
import { ContexteDefilement, useDefilementGlisser } from "../../../ui/Glisser";
import { ClavierPerso, ClavierSeance, SousLeClavier } from "../../../ui/ClavierSeance";
import { useClavierEcran } from "../../../ui/useClavierEcran";

// Modifier une séance passée (B) : titre, date, durée, salle, note, photo et séries ; tout s'enregistre au fil de l'eau,
// records et volumes recalculés par src/db. « Terminé » revient à la lecture.
export default function ModifierSeance() {
  // Lien pepfitopen://history/edit/derniere?lieu=1 : la dernière séance terminée, feuille « Lieu de la séance » ouverte.
  const { id: param, lieu } = useLocalSearchParams<{ id: string; lieu?: string }>();
  const { db, reglages } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [seance, setSeance] = useState<SeanceDetail | null>();
  const [unites, setUnites] = useState<Record<string, Unite>>({});
  const [note, setNote] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [salle, setSalle] = useState(false);
  // Feuille Horaires, ouverte sur la ligne touchée (Début, Fin ou Durée).
  const [horaires, setHoraires] = useState<Champ | null>(null);
  const [champ, setChamp] = useState<Champ>("debut");
  useEffect(() => {
    if (lieu === "1") setSalle(true);
  }, [lieu]);
  const [hauteurDock, setHauteurDock] = useState(100);
  // Glisser-déposer des exercices et des séries (comme en séance et dans l'éditeur de routine).
  const { defilement, scrollProps, zoneProps } = useDefilementGlisser();
  // Les cases de série prennent le clavier de pepfit, comme en séance (docs/CLAVIER-PARTOUT.md).
  const { zoneVide } = useClavierEcran(defilement);

  const recharger = useCallback(async () => {
    const id = param === "derniere" ? await seanceTermineeAuRang(db, 0) : param;
    const s = id ? await lireSeance(db, id) : null;
    const u = s ? await unitesSeance(db, s, reglages.unite) : null;
    setSeance(s);
    if (u) setUnites(u);
  }, [db, param, reglages.unite]);

  useFocusEffect(
    useCallback(() => {
      recharger().catch(console.error);
    }, [recharger]),
  );

  const { actions, feuilles, vue, bandeau } = useActionsSeance(seance, unites, recharger, hauteurDock + espace.s);

  if (!seance) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;

  const { debut, fin } = seance.seance;
  const modifier = (patch: Parameters<typeof modifierSeance>[2]) =>
    modifierSeance(db, seance.seance.id, patch)
      .then(recharger)
      .catch(console.error);
  const texteNote = note ?? seance.seance.note ?? "";
  const enregistrerNote = () => {
    if (note === null) return;
    const n = note.trim() || null;
    setNote(null);
    if (n !== seance.seance.note) modifier({ note: n });
  };
  const texteMessage = message ?? seance.seance.message ?? "";
  const enregistrerMessage = () => {
    if (message === null) return;
    const m = messageFinal(message);
    setMessage(null);
    if (m !== (seance.seance.message ?? null)) modifier({ message: m });
  };

  return (
    <ClavierPerso.Provider value>
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("seance.modifier.titre")} retour="close" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ContexteDefilement.Provider value={defilement}>
        <View style={{ flex: 1 }} {...zoneProps}>
        <ScrollView {...scrollProps} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: hauteurDock + espace.xxl }}>
          <View style={{ paddingHorizontal: espace.l }}>
            <TitreEditable titre={seance.seance.titre} routineNom={seance.routineNom} onChanger={(nouveau) => modifier({ titre: nouveau })} />
            {/* Début, Fin et Durée ouvrent la même feuille Horaires ; les séries gardent leur heure (planche Effort, D6). */}
            <LignesHoraires
              debut={debut}
              fin={fin ?? Date.now()}
              onOuvrir={(c) => {
                setChamp(c);
                setHoraires(c);
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("seance.seance.libelleSalleFin", { salle: seance.salle?.nom ?? t("seance.fin.choisir") })}
              onPress={() => setSalle(true)}
              style={({ pressed }) => [styles.ligne, { borderTopColor: couleurs.line }, pressed && { backgroundColor: couleurs.s2 }]}
            >
              <Icone nom="place" couleur={couleurs.t2} taille={24} />
              <Texte variante="saisie" style={{ fontFamily: police.regular, flex: 1 }}>
                {t("seance.seance.salle")}
              </Texte>
              <Texte variante="saisie" couleur="t2" numberOfLines={1} style={{ fontFamily: police.regular, maxWidth: 200 }}>
                {seance.salle?.nom ?? t("seance.fin.choisir")}
              </Texte>
            </Pressable>
            {/* Le message se lit avec l'activité (D2) ; la note reste privée, sous cadenas. */}
            <ChampMessage value={texteMessage} onChangeText={setMessage} onBlur={enregistrerMessage} />
            <View style={styles.privee}>
              <Icone nom="cadenas" couleur={couleurs.t2} taille={16} />
              <Texte variante="meta" couleur="t2">
                {t("seance.modifier.notePrivee")}
              </Texte>
            </View>
            <TextInput
              maxFontSizeMultiplier={POLICE_MAX}
              value={texteNote}
              onChangeText={setNote}
              onBlur={enregistrerNote}
              placeholder={t("seance.fin.note")}
              placeholderTextColor={couleurs.t3}
              cursorColor={couleurs.action}
              multiline
              accessibilityLabel={t("seance.modifier.notePrivee")}
              style={[typo.saisie, styles.note, { fontFamily: police.regular, color: couleurs.t1, backgroundColor: couleurs.s1 }]}
            />
          </View>
          <ZonePhoto seanceId={seance.seance.id} retirable style={{ paddingTop: espace.m }} />
          <View style={{ paddingHorizontal: espace.l, paddingTop: espace.s }}>
            {/* Clavier ouvert : un toucher sur une zone vide le ferme (la case s'enregistre). */}
            <View {...zoneVide}>
              <VueSeance seance={vue ?? seance} unites={unites} activeId={null} actions={actions} margeBas={hauteurDock} />
            </View>
          </View>
        </ScrollView>
        </View>
        </ContexteDefilement.Provider>
      </KeyboardAvoidingView>
      <ClavierSeance />
      <SousLeClavier>
        <View
          onLayout={(e) => setHauteurDock(e.nativeEvent.layout.height)}
          style={[styles.dock, { backgroundColor: couleurs.bg, borderTopColor: couleurs.line, paddingBottom: Math.max(bas, espace.s) + espace.l }]}
        >
          <BoutonPrincipal
            libelle={t("seance.modifier.termine")}
            onPress={() => {
              enregistrerNote();
              router.back();
            }}
          />
        </View>
      </SousLeClavier>
      {feuilles}
      {bandeau}
      <FeuilleHorairesActivite
        visible={horaires != null}
        onFermer={() => setHoraires(null)}
        cible={{ genre: "seance", id: seance.seance.id }}
        titre={titreSeance(seance.seance.titre) ?? seance.routineNom ?? t("seance.seance.titreDefaut")}
        champ={champ}
        onModifie={recharger}
      />
      <FeuilleSalle
        visible={salle}
        onFermer={() => setSalle(false)}
        salleId={seance.salle?.id ?? null}
        onChoisir={(s) => {
          setSalle(false);
          modifier({ salleId: s });
        }}
      />
    </SafeAreaView>
    </ClavierPerso.Provider>
  );
}

const styles = StyleSheet.create({
  ligne: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.l, borderTopWidth: StyleSheet.hairlineWidth },
  privee: { flexDirection: "row", alignItems: "center", gap: espace.s, marginTop: espace.l, paddingHorizontal: espace.xs },
  note: { minHeight: 76, borderRadius: rayon.l, paddingHorizontal: espace.l, paddingVertical: 14, marginTop: espace.m, textAlignVertical: "top" },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espace.l, paddingTop: espace.m, borderTopWidth: StyleSheet.hairlineWidth },
});
