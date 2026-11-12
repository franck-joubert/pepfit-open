import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import { router, useFocusEffect, useIsFocused } from "expo-router";
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { detecterEquipements, equipementsDetectes, lireSeance, modifierSeance, recordsExercice, seanceEnCours, titreSeance, type SeanceDetail } from "../db";
import { useTheme } from "../theme";
import { carteOr } from "../theme/effets";
import { boucleMedaille, duree, echelle, glissement, reflet, ressort } from "../theme/mouvement";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { useApp } from "../ecrans/contexte";
import { changementsRoutine, majRoutineParDefaut, terminer } from "../ecrans/donnees";
import { nombre, serieNatureTexte, versUnite, type Unite } from "../ecrans/format";
import { LignesHoraires, TitreEditable } from "../ecrans/EditionSeance";
import { FeuilleHoraires } from "../ecrans/FeuilleHoraires";
import { ecrireDebutSeanceEnCours, type LectureHoraires } from "../ecrans/horaires-donnees";
import type { Champ, Horaires } from "../ecrans/horaires";
import { finDepuisDuree, minutesEntre } from "../ecrans/edition-seance";
import { cartesRecords, ecartExercice, RETOUR_FIN_SEANCE, ecartRecord, meilleureSerie, mesureRecord, valeurRecord, type CarteRecord } from "../ecrans/fin-seance-vue";
import { EtiquetteEquipements } from "../ecrans/EtiquetteEquipements";
import { FeuilleNouveauxEquipements } from "../ecrans/FeuilleNouveauxEquipements";
import { FeuilleSalle } from "../ecrans/FeuilleSalle";
import { ChampMessage } from "../ecrans/ChampMessage";
import { ZonePhoto } from "../ecrans/ZonePhoto";
import { finSansPauses } from "../ecrans/duree-seance";
import { passerRepos } from "../ecrans/repos";
import { fcSeanceEnCours, finirFcMuscu } from "../ecrans/fc-muscu";
import { partsSeanceEnCours } from "../ecrans/effort-charges";
import { PartsEffort } from "../ecrans/EffortGrandSeance";
import { BatterieAuMoment } from "../ecrans/FeuilleBatterie";
import { abandonnerSeance, DialogueAbandon } from "../ecrans/abandon-seance";
import { etapesCompte, texteEtape } from "../ecrans/saisie-seance";
import { BlocProgrammeFin, DEPART_BLOC, LigneHorsProgrammeFin } from "../ecrans/AvancementProgramme";
import { montrerFinProgramme } from "../ecrans/CarteFinProgramme";
import { lireFinProgramme, type FinProgramme } from "../ecrans/tiroir-seance-donnees";
import { INFO_NATURE } from "../db";
import { BarreHaut, Pastille } from "../ui/Cadre";
import { BoutonPrincipal, FondDegrade, Reflet } from "../ui/Degrade";
import { signalerErreur } from "../ui/FeuilleMessage";
import { Icone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { haptique } from "../ui/haptique";
import { Medaille } from "../ui/Medaille";
import { Appui, courbes } from "../ui/mouvement";
import { Picto } from "../ui/Picto";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import { t, tp } from "../i18n/index";

// Fin de séance (refonte du 26/10) : une carte dorée par record en tête, les exercices et leur écart avec la fois
// précédente, puis date, durée, salle et message (D2 de la planche Effort : le champ « Note » est devenu « Ajouter un message »). En bas, fixés : « Mettre à jour la routine » s'il y a lieu,
// « Abandonner la séance » (secondaire bordé de rouge, avec alerte) au-dessus d'« Enregistrer » (le geste principal).

export default function FinSeance() {
  const { db, reglages } = useApp();
  const { couleurs, mode } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [s, setS] = useState<SeanceDetail | null>(null);
  const [cartes, setCartes] = useState<CarteRecord[]>([]);
  const [changements, setChangements] = useState<Awaited<ReturnType<typeof changementsRoutine>>>([]);
  const [maj, setMaj] = useState(false);
  const [message, setMessage] = useState("");
  const [salleOuverte, setSalleOuverte] = useState(false);
  const [nouveaux, setNouveaux] = useState(0);
  const [nouveauxOuverts, setNouveauxOuverts] = useState(false);
  const [abandon, setAbandon] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [dureeReglee, setDureeReglee] = useState<number | null>(null);
  // Feuille Horaires de la séance qui court : lue à l'ouverture (la séance n'est pas encore enregistrée, pas d'original ni de source).
  const [horaires, setHoraires] = useState<{ champ: Champ; lecture: LectureHoraires } | null>(null);
  const [horairesOuverts, setHorairesOuverts] = useState(false);
  const [hauteurDock, setHauteurDock] = useState(200);
  // Programme de la séance (planche seance-tiroirs, D10) : bloc d'avancement, ou ligne calme si la séance n'y compte pas.
  const [prog, setProg] = useState<FinProgramme | null>(null);
  const [parts, setParts] = useState<Awaited<ReturnType<typeof partsSeanceEnCours>>>(null);
  // Clavier ouvert (message) : la liste se raccourcit au-dessus de lui, le message défile en vue et le pied fixe se retire.
  const [clavier, setClavier] = useState(false);
  const liste = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", () => setClavier(true));
    const b = Keyboard.addListener("keyboardDidHide", () => setClavier(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  /** Séance relue : ses cartes de record suivent (un début déplacé peut recalculer les records). */
  const appliquer = useCallback(
    async (d: SeanceDetail | null) => {
      setS(d);
      if (!d) return;
      const avecRecord = d.exercices.filter((e) => e.series.some((x) => x.faite && x.records.length));
      const historiques: Record<string, Awaited<ReturnType<typeof recordsExercice>>["historique"]> = {};
      for (const e of avecRecord) historiques[e.exercice.id] = (await recordsExercice(db, e.exercice.id)).historique;
      setCartes(
        cartesRecords(
          d.seance.id,
          avecRecord.map((e) => ({ id: e.exercice.id, nom: e.exercice.nom, records: e.series.filter((x) => x.faite).flatMap((x) => x.records) })),
          historiques,
        ),
      );
    },
    [db],
  );

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const en = await seanceEnCours(db);
        if (!en) return router.dismissTo(RETOUR_FIN_SEANCE);
        const d = await lireSeance(db, en.id);
        // L'étiquette « nouvel équipement » est connue avant la séance : arrivée pendant l'entrée des cartes or, elle
        // les recouvrait (la carte en cours d'entrée ne suivait pas le décalage ; vu à la recette du lot L2).
        if (d) setNouveaux((await detecterEquipements(db, d.seance.id)).length);
        if (d) setProg(await lireFinProgramme(db, d.seance.routine_id).catch(() => null));
        // Musculaire et cardio, avec la FC de la séance seulement (docs/CODE-EFFORT-CHARGE.md) : sinon rien.
        if (d) {
          const chrono = { debut: d.seance.debut, pauseDebut: d.seance.pause_debut, pauseCumulS: d.seance.pause_cumul_s };
          const fc = await fcSeanceEnCours(db, d.seance.id);
          setParts(await partsSeanceEnCours(db, d.seance.id, finSansPauses(chrono, Date.now()), fc).catch(() => null));
        }
        await appliquer(d);
        if (d) {
          const c = await changementsRoutine(db, d);
          setChangements(c);
          setMaj(majRoutineParDefaut(c));
          setMessage(d.seance.message ?? "");
        }
      })().catch((e) => console.error(e));
    }, [db, appliquer]),
  );

  // Vibration seulement s'il y a un record, une fois, avec la première carte.
  const avecRecords = cartes.length > 0;
  // Avec le bloc programme, les cartes record partent 80 ms après lui (planche, tableau du mouvement).
  const depart = prog?.genre === "programme" ? DEPART_BLOC + echelleDelai : 150;
  useEffect(() => {
    if (!avecRecords) return;
    const minuterie = setTimeout(() => haptique.succes(), depart + echelleDelai);
    return () => clearTimeout(minuterie);
  }, [avecRecords, depart]);

  if (!s) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;

  const series = s.exercices.flatMap((e) => e.series);
  const faites = series.filter((x) => x.faite);
  const volume = faites.filter((x) => x.type !== "echauffement").reduce((somme, x) => somme + x.volume, 0);
  const u = reglages.unite;
  // Séance sans routine : « Séance libre » (lexique), dans la langue du moment (n° 34 de la revue finale).
  const nomDefaut = s.routineNom ?? t("exercices.commencer.seanceLibre");
  const titre = titreSeance(s.seance.titre) ?? nomDefaut;
  const debut = s.seance.debut;
  const chronoS = { debut, pauseDebut: s.seance.pause_debut, pauseCumulS: s.seance.pause_cumul_s };
  const faits = s.exercices.filter((e) => e.series.some((x) => x.faite));

  const relire = () =>
    lireSeance(db, s.seance.id)
      .then(appliquer)
      .then(() => detecterEquipements(db, s.seance.id))
      .then((l) => setNouveaux(l.length));
  const modifier = (patch: Parameters<typeof modifierSeance>[2]) =>
    modifierSeance(db, s.seance.id, patch).then(relire).catch(signalerErreur());

  // La fin d'une séance qui court est l'instant présent, sauf durée réglée (finDepuisDuree : jamais dans le futur).
  const finAffichee = dureeReglee === null ? finSansPauses(chronoS, Date.now()) : finDepuisDuree(debut, dureeReglee, finSansPauses(chronoS, Date.now()));
  const ouvrirHoraires = (champ: Champ) => {
    const prem = faites.reduce<number | null>((m, x) => (x.fait_le == null ? m : m == null ? x.fait_le : Math.min(m, x.fait_le)), null);
    const dern = faites.reduce<number | null>((m, x) => (x.fait_le == null ? m : m == null ? x.fait_le : Math.max(m, x.fait_le)), null);
    setHoraires({ champ, lecture: { horaires: { debut, fin: finAffichee }, original: null, source: null, premiereSerie: prem, derniereSerie: dern } });
    setHorairesOuverts(true);
  };
  // Valider : le début s'écrit (les séries gardent leur heure), la fin se règle par la durée, enregistrée avec la séance.
  const validerHoraires = (h: Horaires) => {
    setHorairesOuverts(false);
    if (h.debut === debut && h.fin === finAffichee) return;
    setDureeReglee(minutesEntre(h.debut, h.fin));
    if (h.debut !== debut) ecrireDebutSeanceEnCours(db, s.seance.id, h.debut).then(relire).catch(signalerErreur());
  };

  const enregistrer = async () => {
    if (envoi) return;
    setEnvoi(true);
    try {
      const maintenant = finSansPauses(chronoS, Date.now());
      const fin = dureeReglee === null ? maintenant : finDepuisDuree(debut, dureeReglee, maintenant);
      await terminer(db, s, { message, majRoutine: maj && changements.length > 0, fin });
      await passerRepos(db);
      // FC de la séance (lot 5) : le service s'arrête, la FC passe dans la séance.
      await finirFcMuscu(db).catch(signalerErreur());
      // Dernière séance du programme (D11) : la carte de fin s'ouvre sur l'onglet Sport.
      if (prog?.genre === "programme" && prog.lien.avancement.derniere) montrerFinProgramme(prog.lien.planId);
      router.dismissTo(RETOUR_FIN_SEANCE);
    } finally {
      setEnvoi(false);
    }
  };

  const abandonner = async () => {
    setAbandon(false);
    await abandonnerSeance(db, s.seance.id);
    router.dismissTo(RETOUR_FIN_SEANCE);
  };

  const detailMaj =
    changements.length === 1
      ? `${changements[0]!.apres > changements[0]!.avant ? "+" : "−"}${tp("communs.serie", Math.abs(changements[0]!.apres - changements[0]!.avant))}, ${changements[0]!.nom}`
      : tp("seance.fin.exercices", changements.length);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      {/* Reprendre : retour à la séance, toujours en cours tant qu'on n'a pas enregistré (demande d'Alex, 29/10). */}
      <BarreHaut titre={t("seance.fin.titre")}>
        <Pastille libelle={t("seance.fin.reprendre")} icone="play" onPress={() => (router.canGoBack() ? router.back() : router.replace("/session"))} />
      </BarreHaut>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView ref={liste} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: (clavier ? 0 : hauteurDock) + espace.l }}>
          <View style={styles.tete}>
            <TitreEditable titre={titreSeance(s.seance.titre)} routineNom={nomDefaut} onChanger={(nouveau) => modifier({ titre: nouveau })} />
            {/* Une activité sans série (Padel) n'écrit pas « 0 série, 0 kg » (planche Effort, écart 1). */}
            {faites.length ? (
              <Texte variante="meta" couleur="t2">
                {tp("communs.serie", faites.length)}, {nombre(Math.round(versUnite(volume, u)), 0)} {u}
              </Texte>
            ) : null}
            {nouveaux > 0 ? <EtiquetteEquipements n={nouveaux} onPress={() => setNouveauxOuverts(true)} /> : null}
            <PartsEffort parts={parts} style={styles.parts} />
          </View>

          {prog?.genre === "programme" ? <BlocProgrammeFin lien={prog.lien} animer /> : prog ? <LigneHorsProgrammeFin lien={prog.lien} /> : null}

          {cartes.length ? (
            <View style={styles.cartes}>
              {cartes.map((c, i) => (
                <CarteOr key={c.exerciceId} carte={c} rang={i} depart={depart} u={u} serie={s.exercices.find((e) => e.exercice.id === c.exerciceId)} />
              ))}
            </View>
          ) : null}

          {faits.length ? (
            <View style={[styles.groupe, { backgroundColor: couleurs.s1 }]}>
              {faits.map((e, i) => {
                const ss = e.series.filter((x) => x.faite);
                const champs = INFO_NATURE[e.exercice.nature].colonnes.map((c) => c.champ);
                const best = meilleureSerie(ss);
                const record = ss.some((x) => x.records.length > 0);
                const ecart = record ? null : ecartExercice(ss);
                return (
                  <View key={e.exercice.id} style={[styles.exo, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
                    <Picto slug={e.exercice.slug} nom={e.exercice.nom} photo={e.exercice.photo_vignette} taille={40} />
                    <View style={{ flex: 1 }}>
                      <Texte variante="exercice" numberOfLines={1}>
                        {e.exercice.nom}
                      </Texte>
                      <Texte variante="meta" couleur="t2" numberOfLines={1}>
                        {tp("communs.serie", ss.length)}
                        {best ? `, ${serieNatureTexte(champs, best, u, false)}` : ""}
                      </Texte>
                    </View>
                    {record ? (
                      <Texte variante="exercice" style={{ color: couleurs.record }}>
                        {t("seance.fin.record")}
                      </Texte>
                    ) : ecart ? (
                      <Texte variante="exercice" couleur={ecart.signe > 0 ? "valide" : "t3"} style={{ fontVariant: ["tabular-nums"] }}>
                        {ecart.texte}
                      </Texte>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.reglages}>
            <LignesHoraires debut={debut} fin={finAffichee} onOuvrir={ouvrirHoraires} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("seance.seance.libelleSalleFin", { salle: s.salle?.nom ?? t("seance.fin.choisir") })}
              onPress={() => setSalleOuverte(true)}
              style={({ pressed }) => [styles.ligne, { borderTopColor: couleurs.line }, pressed && { backgroundColor: couleurs.s2 }]}
            >
              <Icone nom="place" couleur={couleurs.t2} taille={24} />
              <Texte variante="saisie" style={{ fontFamily: police.regular, flex: 1 }}>
                {t("seance.seance.salle")}
              </Texte>
              <Texte variante="saisie" couleur="t2" style={{ fontFamily: police.regular }}>
                {s.salle?.nom ?? t("seance.fin.choisir")}
              </Texte>
            </Pressable>
            <ZonePhoto seanceId={s.seance.id} retirable style={{ paddingHorizontal: 0, paddingTop: espace.l }} />
            <ChampMessage value={message} onChangeText={setMessage} onFocus={() => setTimeout(() => liste.current?.scrollToEnd({ animated: true }), 300)} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {clavier ? null : (
        <View
          onLayout={(e) => setHauteurDock(e.nativeEvent.layout.height)}
          style={[styles.dock, { backgroundColor: couleurs.bg, borderTopColor: couleurs.line, paddingBottom: Math.max(bas, espace.s) + espace.l }]}
        >
          {s.seance.routine_id && changements.length ? (
            <View style={styles.maj}>
              <View style={{ flex: 1 }}>
                <Texte variante="saisie" numberOfLines={1} style={{ fontFamily: police.regular, fontSize: 15 }}>
                  {t("seance.fin.majRoutine", { nom: s.routineNom ?? titre })}
                </Texte>
                <Texte variante="meta" couleur="t2" numberOfLines={1}>
                  {detailMaj}
                </Texte>
              </View>
              <Interrupteur valeur={maj} onChange={setMaj} libelle={t("seance.fin.majRoutine", { nom: s.routineNom ?? titre })} />
            </View>
          ) : null}
          <Appui
            accessibilityRole="button"
            onPress={() => setAbandon(true)}
            style={({ pressed }) => [styles.secondaire, { borderColor: couleurs.rate, backgroundColor: pressed ? couleurs.s2 : "transparent" }]}
          >
            <Texte variante="saisie" style={{ fontSize: 15 }}>
              {t("seance.fin.abandonner")}
            </Texte>
          </Appui>
          <BoutonPrincipal libelle={t("seance.fin.enregistrer")} desactive={envoi} onPress={() => enregistrer().catch(signalerErreur())} />
        </View>
      )}

      <DialogueAbandon
        visible={abandon}
        seriesFaites={faites.length}
        onAnnuler={() => setAbandon(false)}
        onConfirmer={() => abandonner().catch(signalerErreur("supprimer"))}
      />

      <FeuilleNouveauxEquipements
        visible={nouveauxOuverts}
        salleId={s.salle?.id ?? null}
        onFermer={() => setNouveauxOuverts(false)}
        onChange={() => {
          if (s.salle?.id) equipementsDetectes(db, s.salle.id).then((l) => setNouveaux(l.length)).catch((e) => console.error(e));
        }}
      />
      <FeuilleHoraires
        visible={horairesOuverts}
        onFermer={() => setHorairesOuverts(false)}
        titre={titre}
        lecture={horaires?.lecture ?? null}
        champ={horaires?.champ}
        onValider={validerHoraires}
      />
      <FeuilleSalle
        visible={salleOuverte}
        surPlace
        onFermer={() => setSalleOuverte(false)}
        salleId={s.salle?.id ?? null}
        onChoisir={(id) => {
          setSalleOuverte(false);
          modifier({ salleId: id });
        }}
      />
      {/* FC coupée pendant la séance (journal du suivi) et pepfit encore optimisé : « Batterie non restreinte », une fois */}
      <BatterieAuMoment moment="coupure" actif />
    </SafeAreaView>
  );
}

/** Décalage d'une carte à la suivante (ms). */
const echelleDelai = 80;

const courbeReflet = Easing.bezier(...reflet.courbeMedaille);

/**
 * Carte dorée d'un record : monte en fondu (l'une après l'autre, 80 ms), la médaille pivote d'un demi-tour en se posant,
 * le chiffre compte depuis l'ancien record, puis un reflet repasse toutes les 6 s (la carte suivante le suit à 80 ms).
 * Revue finale n° 13 : le reflet passe par minuterie, seulement écran visible (entre deux passages, aucune image n'est
 * demandée) ; le compte tourne sur le fil UI (aucun rendu React par image).
 */
function CarteOr({ carte: c, rang, depart, u, serie }: { carte: CarteRecord; rang: number; depart: number; u: Unite; serie?: SeanceDetail["exercices"][number] }) {
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const vu = useIsFocused();
  const or = carteOr[mode];
  const delai = depart + rang * echelleDelai;
  const champs = serie ? INFO_NATURE[serie.exercice.nature].colonnes.map((x) => x.champ) : [];
  const assiste = serie?.exercice.nature === "assiste";
  // « Meilleure série » : la série elle-même (+10 × 8), son nombre de réps compté ; sinon la valeur du record.
  const serieRecord = c.type === "reps" ? serie?.series.find((x) => x.id === c.serieId) : undefined;
  const v = valeurRecord(c.type, c.valeur, u);
  const texteDe = (x: number) =>
    serieRecord ? serieNatureTexte(champs, { ...serieRecord, reps: Math.round(x) }, u, false) : valeurRecord(c.type, c.type === "reps" ? Math.round(x) : x, u).valeur;
  const texteValeur = texteDe(c.valeur);
  const comptable = !reduit && c.precedent != null && (c.type === "e1rm" || c.type === "charge" || c.type === "reps");
  const etapes = useMemo(
    () => (comptable ? etapesCompte(c.precedent!, c.valeur, texteDe) : [texteValeur]),
    // texteDe ne dépend que de ce qui suit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comptable, c.precedent, c.valeur, c.type, u, serieRecord?.kg, serieRecord?.reps, champs.join()],
  );
  const compte = useCompte(etapes, delai + 120, comptable);
  const unite = serieRecord ? "" : v.unite;
  const ecart = ecartRecord(c, u);

  // Médaille : demi-tour sur elle-même, de 0,8 à 1, sur le ressort des records.
  const tour = useSharedValue(reduit ? 1 : 0);
  useEffect(() => {
    if (reduit) return;
    tour.value = withDelay(delai + 80, withSpring(1, ressort.record));
    return () => cancelAnimation(tour);
  }, [reduit, delai, tour]);
  // Reflet de la carte : même rythme que celui de la médaille (ui/Medaille), un passage par minuterie.
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduit || !vu) return;
    const b = boucleMedaille();
    let m: ReturnType<typeof setTimeout>;
    const passer = () => {
      p.value = 0;
      p.value = withTiming(1, { duration: b.passage, easing: courbeReflet });
      m = setTimeout(passer, b.passage + b.pause);
    };
    m = setTimeout(passer, b.delai + rang * echelleDelai);
    return () => {
      clearTimeout(m);
      cancelAnimation(p);
      p.value = 0;
    };
  }, [reduit, vu, rang, p]);
  const medaille = useAnimatedStyle(() => ({
    opacity: Math.min(1, tour.value * 2),
    transform: [{ perspective: 200 }, { rotateY: `${-180 * (1 - tour.value)}deg` }, { scale: echelle.recordDepart + (1 - echelle.recordDepart) * tour.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(delai).duration(duree.record).easing(courbes.sortie).withInitialValues({ transform: [{ translateY: glissement.record }] })}
      accessible
      accessibilityLabel={t("seance.fin.libelleRecord", { nom: c.nom, mesure: mesureRecord(c.type, assiste), valeur: texteValeur, unite, ecart: ecart ? `, ${ecart}` : "" })}
      style={[styles.carte, { backgroundColor: or.fond, borderColor: or.filet, boxShadow: or.ombre }]}
    >
      <View style={styles.coupe}>
        <FondDegrade arrets={or.arrets} angle={135} />
        {reduit ? null : <Reflet p={p} arrets={or.reflet} />}
      </View>
      <Animated.View style={medaille}>
        <Medaille taille={36} />
      </Animated.View>
      <Texte variante="corps" numberOfLines={1} style={{ marginTop: espace.m, fontSize: 14, fontFamily: police.medium, color: couleurs.t2 }}>
        {c.nom}
      </Texte>
      {comptable ? (
        // Le chiffre qui compte : un champ en lecture seule dont le texte change sur le fil UI ; l'unité à côté, sur la ligne de base.
        <View style={styles.ligneCompte}>
          <TexteCompte
            editable={false}
            caretHidden
            pointerEvents="none"
            importantForAccessibility="no"
            underlineColorAndroid="transparent"
            defaultValue={etapes[0]}
            animatedProps={compte}
            maxFontSizeMultiplier={POLICE_MAX}
            numberOfLines={1}
            style={[styles.valeur, styles.compte, { color: couleurs.t1 }]}
          />
          {unite ? <Texte variante="corps" couleur="t3">{` ${unite}`}</Texte> : null}
        </View>
      ) : (
        <Texte style={styles.valeur} numberOfLines={1}>
          {texteValeur}
          {unite ? <Texte variante="corps" couleur="t3">{` ${unite}`}</Texte> : null}
        </Texte>
      )}
      <View style={styles.basCarte}>
        <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ flexShrink: 1 }}>
          {mesureRecord(c.type, assiste)}
        </Texte>
        {ecart ? (
          <Texte variante="meta" style={{ color: couleurs.record, fontFamily: police.semibold }}>
            {ecart}
          </Texte>
        ) : null}
      </View>
    </Animated.View>
  );
}

const TexteCompte = Animated.createAnimatedComponent(TextInput);

/**
 * Chiffre qui compte de la première à la dernière étape en 400 ms (courbe de sortie), après `delai` : la progression est une
 * valeur partagée, le texte en découle sur le fil UI (useDerivedValue), sans rendu React à chaque image.
 */
function useCompte(etapes: readonly string[], delai: number, actif: boolean) {
  const p = useSharedValue(actif ? 0 : 1);
  useEffect(() => {
    if (!actif) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withDelay(delai, withTiming(1, { duration: COMPTE_MS, easing: courbes.sortie }));
    return () => cancelAnimation(p);
  }, [actif, delai, p]);
  const texte = useDerivedValue(() => texteEtape(etapes, p.value), [etapes]);
  return useAnimatedProps(() => ({ text: texte.value, defaultValue: texte.value }) as never);
}

const COMPTE_MS = 400;

const styles = StyleSheet.create({
  tete: { paddingHorizontal: espace.l, paddingBottom: espace.m, gap: espace.xs },
  parts: { marginTop: espace.s },
  cartes: { flexDirection: "row", flexWrap: "wrap", gap: espace.s, marginHorizontal: espace.l },
  carte: { flexGrow: 1, flexBasis: "45%", borderRadius: rayon.l, borderWidth: 1, padding: espace.l, overflow: "hidden" },
  coupe: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: rayon.l, overflow: "hidden" },
  valeur: { marginTop: 2, fontFamily: police.light, fontSize: 26, lineHeight: 30, letterSpacing: -0.26, fontVariant: ["tabular-nums"] },
  ligneCompte: { flexDirection: "row", alignItems: "baseline" },
  compte: { padding: 0, margin: 0, marginTop: 2, flexShrink: 1 },
  basCarte: { flexDirection: "row", justifyContent: "space-between", gap: 6, marginTop: espace.xs },
  groupe: { marginHorizontal: espace.l, marginTop: espace.m, borderRadius: rayon.l, overflow: "hidden" },
  exo: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  reglages: { paddingHorizontal: espace.l, marginTop: espace.l },
  ligne: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.l, borderTopWidth: StyleSheet.hairlineWidth },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espace.l, paddingTop: espace.m, gap: espace.s, borderTopWidth: StyleSheet.hairlineWidth },
  maj: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.xs },
  secondaire: { height: 52, borderRadius: rayon.l, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
