// Fin de course (planche suivi-gps « Fin », lot 3) : la séance est déjà enregistrée à Terminer (lot 2, rien ne se perd) ;
// cet écran la résume : titre, date, bloc d'effort (tracé, sélecteur Zones / Altitude, courbe, temps par zone ou altitude,
// six chiffres), tours (appui long : fusionner), Par km. Même gabarit que la fin d'une séance de muscu (audit du 28/10, n° 9) :
// « Fin de séance » et ← en haut, puis Lieu (feuille des lieux), photo et message, et en bas « Abandonner la séance » (cadre rouge,
// même mot et même alerte que la fin Force : revue finale n° 21, D12) au-dessus d'Enregistrer, seul bouton plein, qui écrit le
// message et ouvre la séance passée. ← et le retour Android referment le résumé. La distance de la machine (intérieur) se tape au
// clavier de séance, comme une distance en séance (n° 17) ; une course guidée a des « Étapes », pas des « Tours » (n° 22).
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { fusionnerTourSeance, lireSeance, modifierSeance, modifierSerie, supprimerSeance, type SeanceDetail } from "../db";
import { t } from "../i18n/index";
import { menagePhotos } from "../photos";
import { useTheme } from "../theme";
import { desintegration } from "../theme/mouvement";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { BarreHaut, Pastille } from "../ui/Cadre";
import { ClavierSeance } from "../ui/ClavierSeance";
import { BoutonPrincipal } from "../ui/Degrade";
import { marquerSuppression } from "../ui/Desintegration";
import { signalerErreur } from "../ui/FeuilleMessage";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { BlocEffort } from "./BlocEffort";
import { useApp } from "./contexte";
import { chargerEffort, type EffortSeance } from "./effort-donnees";
import { FeuilleSalle } from "./FeuilleSalle";
import { heure, jourSemaineMois } from "./format";
import { titreAffiche } from "./seance-passee-vue";
import { TitreEditable } from "./EditionSeance";
import { cloreSuivi, reprendreSuivi, suiviReprenable } from "./suivi-enregistrer";
import { ParKm, TableauTours } from "./ToursKm";
import { ChampMessage } from "./ChampMessage";
import { messageFinal } from "./message-activite";
import { ZonePhoto } from "./ZonePhoto";
import { ResultatTestVma } from "./ResultatTestVma";
import { saisieDecimale, type Unite } from "./format";
import { distanceEnUnite, libelleDistance, metresSaisis } from "./unites";
import { DialogueAbandon } from "./abandon-seance";
import { clavierSeance, useCaseActive } from "./clavier-seance";
import { estCourseGuidee, PALIERS_DISTANCE, texteDistance } from "./fin-suivi";
import { avecPas, familleDuSuivi } from "./familles-sports";
import { exempleScore } from "./direct-familles";
import { sante } from "../natif/sante";

/** Case de la distance de la machine, au clavier de séance. */
const CLE_DISTANCE = "fin-distance";

/** `ralenti` : recette de l'entrée (pepfitopen://suivi/fin?id=…&ralenti=5). */
export function SuiviFin({ seanceId, ralenti }: { seanceId: string; ralenti?: number }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [seance, setSeance] = useState<SeanceDetail | null>(null);
  const [effort, setEffort] = useState<EffortSeance | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [salleOuverte, setSalleOuverte] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hauteurDock, setHauteurDock] = useState(0);
  // Tapis, intérieur (D3 du 29/10) : la distance de la machine, tapée ici ; null tant que rien n'a été touché.
  const [distance, setDistance] = useState<string | null>(null);
  const champDistance = useRef<TextInputInstance>(null);
  // Le suivi est encore en pause (Terminer du direct) : « Reprendre » le relance ; toute autre sortie le clôt.
  const [reprenable, setReprenable] = useState(false);
  // Sports et cours (familles-sports, D5 du 30/10) : score ou niveau, facultatif ; les pas de la séance (Santé Connect).
  const [score, setScore] = useState<string | null>(null);
  const [pas, setPas] = useState<number | null>(null);
  useEffect(() => {
    suiviReprenable(db, seanceId).then(setReprenable, () => setReprenable(false));
  }, [db, seanceId]);

  const recharger = useCallback(async () => {
    const s = await lireSeance(db, seanceId);
    setSeance(s);
    setMessage((m) => m ?? s?.seance.message ?? "");
    setScore((x) => x ?? s?.seance.score ?? "");
    const ef = s ? await chargerEffort(db, s) : null;
    setEffort(ef);
    const m = ef?.saisie?.distanceM;
    setDistance((d) => d ?? texteDistance(m ? Math.round(distanceEnUnite(m) * 100) / 100 : null));
  }, [db, seanceId]);
  const ecrireDistance = useCallback(async () => {
    const saisie = effort?.saisie;
    if (!saisie || distance == null) return;
    const m = metresSaisis(distance);
    if (m === saisie.distanceM) return;
    await modifierSerie(db, saisie.serieId, { distanceM: m });
    await recharger();
  }, [db, distance, effort, recharger]);
  useEffect(() => {
    recharger().catch(console.error);
  }, [recharger]);

  const fermer = useCallback(() => {
    cloreSuivi(db).catch(signalerErreur());
    router.replace("/train");
  }, [db]);
  const enregistrer = async () => {
    await ecrireDistance();
    await cloreSuivi(db);
    const texte = messageFinal(message);
    if (seance && texte !== (seance.seance.message ?? null)) await modifierSeance(db, seanceId, { message: texte });
    await ecrireScore();
    router.replace({ pathname: "/history/[id]", params: { id: seanceId } });
  };
  const ecrireScore = async () => {
    const v = (score ?? "").trim() || null;
    if (seance && v !== (seance.seance.score ?? null)) await modifierSeance(db, seanceId, { score: v });
  };
  const reprendre = async () => {
    if (await reprendreSuivi(db, seanceId)) router.replace("/suivi/direct");
    else setReprenable(false);
  };
  useEffect(() => {
    const s = BackHandler.addEventListener("hardwareBackPress", () => {
      fermer();
      return true;
    });
    return () => s.remove();
  }, [fermer]);

  // Famille du suivi (planche familles-sports) : sans tracé GPS, un sport du dehors est en intérieur ; la natation tracée, dehors.
  const sportId = effort?.exerciceId || seance?.exercices[0]?.exercice.id || "";
  const famille = familleDuSuivi(sportId, (effort?.vue.trace.length ?? 0) < 2);
  const debutS = seance?.seance.debut ?? null;
  const finS = seance?.seance.fin ?? null;
  useEffect(() => {
    if (famille !== "seance" || !avecPas(sportId) || debutS == null) return;
    // Santé Connect refusé ou absent : « — » (pas de donnée).
    sante.pasEntre(debutS, finS ?? Date.now()).then(setPas, () => setPas(null));
  }, [famille, sportId, debutS, finS]);

  // Clavier de séance (n° 17) : la case de la distance s'y inscrit seule (Valider la referme) ; la page la garde au-dessus.
  const clavierOuvert = useCaseActive()?.cle === CLE_DISTANCE;
  const liste = useRef<ScrollViewInstance>(null);
  const defile = useRef(0);
  const avecCaseDistance = !!effort?.saisie;
  useEffect(() => {
    if (!avecCaseDistance) return;
    clavierSeance.inscrire(CLE_DISTANCE, { ordre: 0, focus: () => champDistance.current?.focus(), blur: () => champDistance.current?.blur() });
    clavierSeance.surAssurer((yBas) =>
      liste.current?.measureInWindow((_x, y, _l, h) => {
        const limite = y + h - espace.l;
        if (yBas > limite) liste.current?.scrollTo({ y: defile.current + (yBas - limite), animated: true });
      }),
    );
    return () => {
      clavierSeance.desinscrire(CLE_DISTANCE);
      clavierSeance.surAssurer(null);
      clavierSeance.fermer(CLE_DISTANCE);
    };
  }, [avecCaseDistance]);

  if (!seance) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
  // Les deux places de la case (grille de l'intérieur, ligne sous les chiffres) : le même champ, au clavier de séance. Le
  // clavier du téléphone ne s'ouvre pas ; un clavier physique tape encore (onChangeText).
  const champ = (props: ComponentProps<typeof TextInput>) => (
    <TextInput
      ref={champDistance}
      value={distance ?? ""}
      onChangeText={(v) => setDistance(saisieDecimale(v))}
      onFocus={() => {
        clavierSeance.ouvrir({
          cle: CLE_DISTANCE,
          // Case « décimale à paliers » : la molette du clavier lit et écrit les dixièmes de PALIERS_DISTANCE (une décimale),
          // avec l'unité de distance des réglages à côté (texte seul).
          champ: "kg",
          decimal: true,
          temps: false,
          unite: libelleDistance() as Unite,
          paliers: PALIERS_DISTANCE,
          saisie: { texte: distance ?? "", remplacer: true },
          ecrire: setDistance,
        });
        setTimeout(() => champDistance.current?.measureInWindow((_x, y, _l, h) => clavierSeance.assurer(y + h)), 80);
      }}
      onBlur={() => {
        clavierSeance.fermer(CLE_DISTANCE);
        ecrireDistance().catch(signalerErreur());
      }}
      showSoftInputOnFocus={false}
      selection={clavierOuvert ? { start: (distance ?? "").length, end: (distance ?? "").length } : undefined}
      maxFontSizeMultiplier={POLICE_MAX}
      placeholderTextColor={couleurs.t3}
      cursorColor={couleurs.action}
      {...props}
    />
  );
  // Nom par défaut d'une course : son sport (« Course à pied »), pas « Séance ».
  const defaut = seance.exercices[0]?.exercice.nom ?? t("seance.seance.titreDefaut");
  const titre = seance.seance.titre ? titreAffiche(seance.seance.titre) : null;
  const { debut, fin } = seance.seance;
  // Intérieur (D4 du 30/10) : la distance de la machine se saisit dans la case de la grille, « facultatif » ; vide, la case
  // est cerclée d'orange. L'allure se calcule dès qu'elle est saisie.
  const caseDistance = (
    <Pressable
      key="distance"
      accessibilityRole="button"
      accessibilityLabel={`${t("effort.distance")}, ${t("effort.facultatif")}`}
      onPress={() => champDistance.current?.focus()}
      style={styles.caseD}
    >
      <Texte variante="meta" couleur="t2" numberOfLines={1}>
        {t("effort.distance")}
      </Texte>
      <View style={[styles.caseChamp, { borderColor: distance && !clavierOuvert ? couleurs.line2 : couleurs.action, backgroundColor: couleurs.s1 }]}>
        {champ({
          placeholder: t("effort.facultatif"),
          accessibilityLabel: `${t("effort.distance")}, ${libelleDistance()}, ${t("effort.facultatif")}`,
          style: [styles.caseInput, { fontFamily: distance ? police.medium : police.regular, fontSize: distance ? 17 : 15, color: couleurs.t1 }],
        })}
        <Texte variante="meta" couleur="t2">
          {libelleDistance()}
        </Texte>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("seance.fin.titre")} onRetour={fermer}>
        {reprenable ? <Pastille libelle={t("seance.fin.reprendre")} icone="play" onPress={() => reprendre().catch(signalerErreur())} /> : null}
      </BarreHaut>
      <ScrollView
        ref={liste}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => (defile.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingBottom: (clavierOuvert ? 0 : hauteurDock) + espace.l }}
      >
        {/* Clavier ouvert : un toucher sur une zone vide le ferme (la distance s'enregistre) ; un glissé reste au défilement. */}
        <View onStartShouldSetResponder={() => clavierOuvert} onResponderRelease={() => clavierSeance.quitter()}>
          <View style={styles.tete}>
            <TitreEditable titre={titre} routineNom={defaut} onChanger={(nouveau) => modifierSeance(db, seanceId, { titre: nouveau }).then(recharger).catch(signalerErreur())} />
            <Texte variante="corps" couleur="t2" style={styles.ligne}>
              {`${jourSemaineMois(debut)}, ${heure(debut)}${fin ? ` → ${heure(fin)}` : ""}`}
            </Texte>
            {famille === "recup" ? (
              <View style={styles.aide}>
                <Icone nom="info" couleur={couleurs.t2} taille={18} />
                <Texte variante="corps" couleur="t2" style={{ fontSize: 13, flex: 1 }}>
                  {t("effort.recupHorsEffort")}
                </Texte>
              </View>
            ) : null}
          </View>
          {/* Test VMA (planche vma-vo2max) : le résultat d'abord */}
          <ResultatTestVma db={db} seanceId={seanceId} routineId={seance.seance.routine_id ?? null} debut={debut} fcMaxSeance={effort?.vue.fcMax ?? null} />
          {effort ? (
            <>
              <BlocEffort
                vue={effort.vue}
                variante="fin"
                exerciceId={effort.exerciceId}
                calories={effort.calories}
                ralenti={ralenti}
                famille={famille}
                caseDistance={famille === "interieur" && effort.saisie ? caseDistance : undefined}
                pas={avecPas(sportId) ? pas : undefined}
                effortPepfit={effort.effortPepfit ?? null}
                effortEstime={effort.effortEstime}
              />
              {famille === "interieur" && effort.saisie && !distance ? (
                <View style={[styles.aide, { paddingHorizontal: espace.l, marginTop: 0, marginBottom: espace.s }]}>
                  <Icone nom="info" couleur={couleurs.t2} taille={18} />
                  <Texte variante="corps" couleur="t2" style={{ fontSize: 13, flex: 1 }}>
                    {t("effort.distanceAide")}
                  </Texte>
                </View>
              ) : null}
              <TableauTours
                tours={effort.vue.tours}
                exerciceId={effort.exerciceId}
                etapes={estCourseGuidee(seance.seance)}
                onFusionner={(n) => fusionnerTourSeance(db, seanceId, n).then(recharger).catch(signalerErreur())}
              />
              <ParKm km={effort.vue.km} exerciceId={effort.exerciceId} />
            </>
          ) : null}
          {famille === "seance" ? (
            <View style={styles.score}>
              <View style={styles.scoreL}>
                <Texte variante="exercice">{t("effort.score.titre")}</Texte>
                <Texte variante="meta" couleur="t2">
                  {t("effort.score.facultatif")}
                </Texte>
              </View>
              <TextInput
                value={score ?? ""}
                onChangeText={setScore}
                onEndEditing={() => ecrireScore().catch(signalerErreur())}
                maxFontSizeMultiplier={POLICE_MAX}
                placeholder={exempleScore(sportId)}
                placeholderTextColor={couleurs.t3}
                cursorColor={couleurs.action}
                accessibilityLabel={`${t("effort.score.titre")}, ${t("effort.score.facultatif")}`}
                // chiffres proportionnels : « 6-4 » sans les blancs des chiffres tabulaires
                style={[typo.saisie, styles.scoreC, { fontFamily: police.regular, fontVariant: [], color: couleurs.t1, backgroundColor: couleurs.s1 }]}
              />
            </View>
          ) : null}
          {/* Lieu, photo, note : comme la fin d'une séance de muscu (app/done.tsx). */}
          <View style={styles.reglages}>
            {effort?.saisie && famille !== "interieur" && famille !== "seance" && famille !== "recup" ? (
              // Toute la ligne ouvre le champ (zone de clic large), le chiffre tapé s'aligne à droite avec son unité.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("effort.distance")}
                onPress={() => champDistance.current?.focus()}
                style={({ pressed }) => [styles.ligneLieu, { borderTopColor: couleurs.line }, pressed && { backgroundColor: couleurs.s2 }]}
              >
                <Icone nom="regle" couleur={couleurs.t2} taille={24} />
                <Texte variante="saisie" style={{ fontFamily: police.regular, flex: 1 }}>
                  {t("effort.distance")}
                </Texte>
                {champ({
                  placeholder: "0",
                  accessibilityLabel: `${t("effort.distance")}, ${libelleDistance()}`,
                  style: [typo.saisie, styles.distance, { fontFamily: police.regular, color: couleurs.t1 }],
                })}
                <Texte variante="saisie" couleur="t2" style={{ fontFamily: police.regular }}>
                  {libelleDistance()}
                </Texte>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("seance.seance.libelleSalleFin", { salle: seance.salle?.nom ?? t("seance.fin.choisir") })}
              onPress={() => setSalleOuverte(true)}
              style={({ pressed }) => [styles.ligneLieu, { borderTopColor: couleurs.line }, pressed && { backgroundColor: couleurs.s2 }]}
            >
              <Icone nom="place" couleur={couleurs.t2} taille={24} />
              <Texte variante="saisie" style={{ fontFamily: police.regular, flex: 1 }}>
                {t("seance.seance.salle")}
              </Texte>
              <Texte variante="saisie" couleur="t2" numberOfLines={1} style={{ fontFamily: police.regular, flexShrink: 1 }}>
                {seance.salle?.nom ?? t("seance.fin.choisir")}
              </Texte>
            </Pressable>
            <ZonePhoto seanceId={seanceId} retirable style={{ paddingHorizontal: 0, paddingTop: espace.l }} />
            <ChampMessage value={message ?? ""} onChangeText={setMessage} />
          </View>
        </View>
      </ScrollView>
      {/* Clavier de séance : à la place du dock, le temps de taper la distance. */}
      <ClavierSeance />
      {clavierOuvert ? null : (
        <View
          onLayout={(e) => setHauteurDock(e.nativeEvent.layout.height)}
          style={[styles.dock, { backgroundColor: couleurs.bg, borderTopColor: couleurs.line, paddingBottom: Math.max(bas, espace.s) + espace.l }]}
        >
          <Appui
            accessibilityRole="button"
            onPress={() => setConfirmer(true)}
            style={({ pressed }) => [styles.secondaire, { borderColor: couleurs.rate, backgroundColor: pressed ? couleurs.s2 : "transparent" }]}
          >
            <Texte variante="saisie" style={{ fontSize: 15 }}>
              {t("seance.fin.abandonner")}
            </Texte>
          </Appui>
          <BoutonPrincipal libelle={t("effort.enregistrer")} onPress={() => enregistrer().catch(signalerErreur())} />
        </View>
      )}
      <FeuilleSalle
        visible={salleOuverte}
        surPlace
        sport={sportId ? { id: sportId, nom: seance.exercices[0]?.exercice.nom ?? "" } : null}
        onFermer={() => setSalleOuverte(false)}
        salleId={seance.salle?.id ?? null}
        onChoisir={(id) => {
          setSalleOuverte(false);
          modifierSeance(db, seanceId, { salleId: id }).then(recharger).catch(signalerErreur());
        }}
      />
      {/* « Abandonner la séance ? » : l'alerte de la fin Force (rien n'est gardé : la séance, ses photos, le suivi en pause). */}
      <DialogueAbandon
        visible={confirmer}
        seriesFaites={0}
        onAnnuler={() => setConfirmer(false)}
        onConfirmer={() => {
          setConfirmer(false);
          marquerSuppression(seanceId, desintegration.apresRetour);
          cloreSuivi(db)
            .then(() => supprimerSeance(db, seanceId))
            .then(() => menagePhotos(db))
            .then(fermer)
            .catch(signalerErreur("supprimer"));
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tete: { paddingHorizontal: espace.xl, paddingTop: espace.xs },
  ligne: { marginTop: 6, fontSize: 13 },
  aide: { flexDirection: "row", alignItems: "center", gap: espace.s, marginTop: espace.m },
  caseD: { width: "33.333%", paddingRight: espace.s },
  caseChamp: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, marginTop: 3, paddingHorizontal: espace.s, borderRadius: 10, borderWidth: 1 },
  caseInput: { flex: 1, minWidth: 0, fontSize: 17, paddingVertical: 0 },
  score: { paddingHorizontal: espace.l, marginTop: espace.l },
  scoreL: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: espace.s },
  scoreC: { minHeight: 52, borderRadius: rayon.l, paddingHorizontal: espace.l },
  // Comme app/done.tsx : réglages en bas de page, dock fixe (Supprimer au-dessus d'Enregistrer).
  reglages: { paddingHorizontal: espace.l, marginTop: espace.l },
  ligneLieu: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.l, borderTopWidth: StyleSheet.hairlineWidth },
  distance: { minWidth: 64, minHeight: 44, textAlign: "right", paddingVertical: 0 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espace.l, paddingTop: espace.m, gap: espace.s, borderTopWidth: StyleSheet.hairlineWidth },
  secondaire: { height: 52, borderRadius: rayon.l, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
