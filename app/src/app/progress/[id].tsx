import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useLargeurContenu } from "../../ui/CadreContenu";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import {
  dernieresSeancesExercice,
  lireExercice,
  suggestionPour,
  progressionExercice,
  recordsExercice,
  routinesDeLExercice,
  formaterAllure,
  INFO_NATURE,
  LIBELLE_EQUIPEMENT,
  compteLePoidsDuCorps,
  ajouterNote,
  fusionnerExercices,
  verifierFusion,
  listerNotes,
  modifierNote,
  mesuresExercice,
  MESURES_INVERSEES,
  peseeAvant,
  type Exercice,
  type Note,
  type MesureProgression,
  type Progression,
  type RecordsExercice,
  type SeancePourExercice,
} from "../../db";
import { useTheme } from "../../theme";
import { duree } from "../../theme/mouvement";
import { espace, police, rayon } from "../../theme/typo";
import { useApp, useCharge } from "../../ecrans/contexte";
import { FeuillePoids } from "../../ecrans/FeuillePoids";
import { FeuilleLien, departager } from "../../ecrans/FeuilleLien";
import { FormulaireExercice } from "../../ecrans/FormulaireExercice";
import { NotesExercice } from "../../ecrans/Notes";
import { demanderCochage, demanderUnExercice } from "../../ecrans/selection";
import { serieKgReps } from "../../ecrans/donnees";
import { serieDeReference } from "../../db/depots/recalcul";
import { etatDefilement, hauteur3DAgrandie, resumeSeries, traceMini } from "../../ecrans/exercice-vue";
import { charge, debutJour, distanceTexte, jourMois, jourSemaineMois, nombre, serieNatureTexte, tempsTexte, versUnite } from "../../ecrans/format";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { BoutonIcone } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { EtiquettePerso } from "../../ui/EtiquettePerso";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { FeuilleMessage, type MessageFeuille } from "../../ui/FeuilleMessage";
import { CourbeCarnet, Pastilles, PERIODES } from "../../ui/Courbe";
import { Icone } from "../../ui/Icone";
import { courbes } from "../../ui/mouvement";
import { Picto } from "../../ui/Picto";
import { Persos } from "../../ui/Persos";
import { PhotoEnAttente, TetePersos, TetePhoto } from "../../ecrans/TeteFiche";
import { cle3D } from "../../ui/3d/clips";
import { useLiens } from "../../ui/useLiens";
import { NOMS_MUSCLES } from "../../ui/3d/muscles";
import { focusActif, SORTIE, toucherMuscle, type Focus } from "../../ui/3d/focus";
import { CORPS } from "../../ui/3d/scene";
import { Texte } from "../../ui/Texte";
import { revenir } from "../../ui/revenir";
import { useReduit } from "../../ui/reduit";

// Page d'un exercice (refonte du 26/10) : la 3D d'abord, pleine largeur, « < » et « ⋯ » par-dessus ; le nom ; la
// courbe, qui se replie en une ligne sous la barre au défilement ; puis les records et les séances.

// three.js et expo-gl ne sont chargés que pour un exercice qui a un clip 3D (D19).
const Vue3D = lazy(() => import("../../ui/3d/Vue3D"));

/** Hauteur du bloc 3D sous la barre d'état (le premier tiers de l'écran extérieur du Fold). */
const HAUTEUR_3D = 296;
const BARRE = 56;
/** Bascule de la 3D entre sa taille et toute la hauteur de l'écran : courte et sobre. */
const DUREE_AGRANDIR = 250;

interface Donnees {
  ex: Exercice | null;
  /** Nom de l'exercice du catalogue qui ressemble à cet exercice perso (à confirmer), sinon null. */
  proposition: string | null;
  notes: Note[];
  poidsKg: number | null;
  mesure: MesureProgression;
  prog: Progression;
  records: RecordsExercice;
  /** `record` : battue en séance ; sinon la référence de la première séance, sans médaille (revue finale n° 2). */
  meilleure: { kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null; atteint: number; record: boolean } | null;
  seances: SeancePourExercice[];
  /** Routines où l'exercice sert (planche exercices-perso, section 4). */
  routines: { id: string; nom: string }[];
}

export default function ProgressionExercice() {
  const { id, ajout } = useLocalSearchParams<{ id: string; ajout?: string }>();
  const { db, reglages } = useApp();
  const { couleurs } = useTheme();
  useLiens(); // le lien au catalogue change le picto et la 3D de la fiche
  const insets = useSafeAreaInsets();
  const haut = insets.top;
  const u = reglages.unite;
  const [choix, setChoix] = useState<MesureProgression | null>(null);
  const [periode, setPeriode] = useState(1);
  const [poidsOuvert, setPoidsOuvert] = useState(false);
  const [editionOuverte, setEditionOuverte] = useState(false);
  const [lienOuvert, setLienOuvert] = useState(false);
  const [version, setVersion] = useState(0);
  // Fusion : confirmation et erreurs dans la feuille du bas (jamais la boîte d'alerte native).
  const [fusion, setFusion] = useState<{ cibleId: string; titre: string; texte: string } | null>(null);
  const [message, setMessage] = useState<MessageFeuille | null>(null);
  const [etat, setEtat] = useState({ fond: false, titre: false, mini: false });
  const bornes = useRef({ basTitre: 0, basCourbe: 0, basTete: 0 });
  // 3D agrandie (tap sur la vue) : format 4:3 portrait, la page reste dessous ; le retour Android la réduit d'abord
  const [grand, setGrand] = useState(false);
  const [retour3D, setRetour3D] = useState(0);
  const largeur = useLargeurContenu();
  const basculer3D = () => {
    if (grand) setRetour3D((n) => n + 1); // taille normale : cadrage initial
    setGrand(!grand);
  };
  useEffect(() => {
    if (!grand) return;
    const s = BackHandler.addEventListener("hardwareBackPress", () => {
      setRetour3D((n) => n + 1);
      setGrand(false);
      return true;
    });
    return () => s.remove();
  }, [grand]);
  const jours = PERIODES[periode]!.jours;

  const [d] = useCharge<Donnees>(async () => {
    const ex = await lireExercice(db, id);
    const info = INFO_NATURE[ex?.nature ?? "poids_reps"];
    const mesures = mesuresExercice(ex?.nature ?? "poids_reps", ex?.muscle);
    const m = choix && mesures.includes(choix) ? choix : mesures[0]!;
    const records = await recordsExercice(db, id);
    const meilleurType = info.mesures[0] === "allure" ? "allure" : info.mesures[0] === "duree" ? "duree" : info.mesures[0] === "distance" ? "distance" : info.mesures.includes("e1rm") ? "e1rm" : info.mesures.includes("reps") ? "reps" : "charge";
    const best = records.actuels[meilleurType];
    const serie = best ? (best.serie_id ?? (await serieDeReference(db, best))) : null;
    const lue = serie ? await serieKgReps(db, serie) : null;
    return {
      ex,
      proposition: ex?.perso && !ex.lie_a ? ((await suggestionPour(db, id, { departager }))?.catalogue.nom ?? null) : null,
      notes: await listerNotes(db, { exerciceId: id }, "exercice"),
      poidsKg: compteLePoidsDuCorps(ex?.nature ?? "poids_reps", ex?.muscle) ? ((await peseeAvant(db))?.kg ?? null) : null,
      mesure: m,
      prog: await progressionExercice(db, id, m, jours ? Date.now() - jours * 86_400_000 : 0),
      records,
      meilleure: lue ? { ...lue, record: !!best?.serie_id } : null,
      seances: await dernieresSeancesExercice(db, id, 5),
      routines: await routinesDeLExercice(db, id),
    };
  }, [id, choix, jours, version]);

  // Barre du haut : fond et titre en fondu (200 ms) quand la 3D puis le nom passent dessous ; courbe repliée ensuite.
  const fond = useSharedValue(0);
  const titre = useSharedValue(0);
  const mini = useSharedValue(0);
  useEffect(() => {
    const o = { duration: duree.entree, easing: courbes.sortie };
    fond.value = withTiming(etat.fond ? 1 : 0, o);
    titre.value = withTiming(etat.titre ? 1 : 0, o);
    mini.value = withTiming(etat.mini ? 1 : 0, o);
  }, [etat, fond, titre, mini]);
  const styleFond = useAnimatedStyle(() => ({ opacity: fond.value }));
  const styleTitre = useAnimatedStyle(() => ({ opacity: titre.value }));
  const styleMini = useAnimatedStyle(() => ({ opacity: mini.value, transform: [{ translateY: -6 * (1 - mini.value) }] }));

  const fusionImpossible = (texte: string) => setMessage({ titre: t("accueil.progression.fusionImpossible"), texte });
  const erreurFusion = (e: unknown) => fusionImpossible(e instanceof Error ? e.message : t("accueil.progression.erreur"));
  const fusionner = () => {
    demanderUnExercice(async (cibleId) => {
      try {
        const v = await verifierFusion(db, id, cibleId);
        const cible = await lireExercice(db, cibleId);
        if (!v.ok || !cible) {
          fusionImpossible(v.ok ? t("accueil.progression.introuvable") : v.raison);
          return;
        }
        const nom = d?.ex?.nom ?? "";
        const seances = v.seances === 0 ? t("accueil.progression.aucuneSeanceADeplacer") : tp("accueil.progression.seancesDeplacees", v.seances);
        setFusion({ cibleId, titre: t("accueil.progression.fusionnerDans", { nom, cible: cible.nom }), texte: seances });
      } catch (e) {
        erreurFusion(e);
      }
    });
    router.push({ pathname: "/pick", params: { mode: "fusion", exclu: id } });
  };

  if (!d || !d.ex) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
  const { ex, prog, records, meilleure, seances } = d;
  const info = INFO_NATURE[ex.nature];
  const mesures = mesuresExercice(ex.nature, ex.muscle);
  const champs = info.colonnes.map((c) => c.champ);
  const inverse = MESURES_INVERSEES.includes(d.mesure);
  const allure = ex.allure ?? "km";
  const mesureReps = d.mesure === "reps" || d.mesure === "reps_total";
  const mesureKg = d.mesure === "charge" || d.mesure === "e1rm" || d.mesure === "volume" || d.mesure === "charge_eff";
  // Les courbes en kg suivent l'unité choisie ; les durées, distances, allures et réps s'affichent telles quelles.
  const conv = (v: number) => (mesureKg ? versUnite(v, u) : d.mesure === "allure" ? (allure === "kmh" ? 3600 / v : allure === "500m" ? v / 2 : v) : v);
  const unite = mesureKg ? u : mesureReps ? t("accueil.progression.uniteReps") : d.mesure === "duree" ? "" : d.mesure === "distance" ? "" : allure === "kmh" ? "km/h" : allure === "500m" ? "/500 m" : "/km";
  const decimales = mesureReps || d.mesure === "volume" || d.mesure === "duree" || d.mesure === "distance" ? 0 : 1;
  const montrer = (v: number) =>
    d.mesure === "duree" ? tempsTexte(v) : d.mesure === "distance" ? distanceTexte(v) : d.mesure === "allure" ? formaterAllure(v, allure).replace(/ \S+$/, "") : nombre(conv(v), decimales);
  // Repères de la courbe : ses valeurs sont déjà converties.
  const montrerCourbe = (v: number) =>
    d.mesure === "duree" || d.mesure === "allure" ? tempsTexte(v) : d.mesure === "distance" ? distanceTexte(v) : nombre(v, decimales && Math.abs(v) < 100 ? 1 : 0);
  const libelleMesure = (m: MesureProgression) =>
    ({
      e1rm: t("accueil.progression.mesureE1rm"),
      charge: t("accueil.progression.mesureCharge"),
      volume: t("accueil.progression.mesureVolume"),
      reps: t("accueil.progression.mesureReps"),
      reps_total: t("accueil.progression.mesureRepsTotal"),
      charge_eff: t("accueil.progression.mesureChargeEff"),
      duree: t("accueil.progression.mesureDuree"),
      distance: t("accueil.progression.mesureDistance"),
      allure: t("accueil.progression.mesureAllure"),
    })[m];
  const rec = records.actuels;
  const lignesRecords: { libelle: string; valeur: string; quand: number }[] = [];
  if (rec.charge && champs.includes("kg")) lignesRecords.push({ libelle: t(ex.nature === "assiste" ? "accueil.progression.aideMin" : "accueil.progression.chargeMax"), valeur: charge(rec.charge.valeur, u), quand: rec.charge.atteint_le });
  if (rec.reps && (!champs.includes("kg") || ex.nature !== "poids_reps")) lignesRecords.push({ libelle: t("accueil.progression.repsMax"), valeur: t("communs.reps", { n: rec.reps.valeur }), quand: rec.reps.atteint_le });
  if (rec.duree) lignesRecords.push({ libelle: t("accueil.progression.mesureDuree"), valeur: tempsTexte(rec.duree.valeur), quand: rec.duree.atteint_le });
  if (rec.distance) lignesRecords.push({ libelle: t("accueil.progression.distanceMax"), valeur: distanceTexte(rec.distance.valeur), quand: rec.distance.atteint_le });
  if (rec.allure) lignesRecords.push({ libelle: t("accueil.progression.meilleureAllure"), valeur: formaterAllure(rec.allure.valeur, allure), quand: rec.allure.atteint_le });
  if (rec.volume_seance) lignesRecords.push({ libelle: t("accueil.progression.volumeSeance"), valeur: `${nombre(Math.round(versUnite(rec.volume_seance.valeur, u)), 0)} ${u}`, quand: rec.volume_seance.atteint_le });
  const dernier = prog.points[prog.points.length - 1];
  const valeur = dernier ? dernier.valeur : 0;
  const recordAuj = !!meilleure?.record && debutJour(meilleure.atteint).getTime() === debutJour(Date.now()).getTime();
  const cle3d = cle3D(ex.slug, ex.nom); // seulement les exercices qui ont un clip 3D (tractions pour l'instant)
  const progresse = inverse ? prog.gain < 0 : prog.gain > 0;
  const gain =
    prog.points.length > 1 && prog.gain !== 0
      ? `${prog.gain > 0 ? "+" : "−"}${d.mesure === "duree" || d.mesure === "allure" ? tempsTexte(Math.abs(prog.gain)) : d.mesure === "distance" ? distanceTexte(Math.abs(prog.gain)) : nombre(Math.abs(conv(prog.gain)), decimales)}`
      : null;
  const meta = [LIBELLE_EQUIPEMENT[ex.equipement], ex.muscle].filter(Boolean).join(", ");
  // Tête (D2) : la photo si elle existe, sinon la 3D si l'exercice en a une, sinon les persos et « Ajouter une photo ».
  const tete = ex.photo ? "photo" : cle3d ? "3d" : "persos";
  const secondaires = ex.secondaires.split("|").filter(Boolean);
  const barre = haut + BARRE;

  const surDefilement = (y: number) => {
    const bas3d = tete !== "3d" ? bornes.current.basTete || haut + HAUTEUR_3D : grand ? hauteur3DAgrandie(largeur, haut + HAUTEUR_3D) : haut + HAUTEUR_3D;
    const e = etatDefilement(y, { bas3d, basTitre: bornes.current.basTitre, basCourbe: bornes.current.basCourbe, barre });
    setEtat((a) => (a.fond === e.fond && a.titre === e.titre && a.mini === e.mini ? a : e));
  };
  const bas = (cle: "basTitre" | "basCourbe" | "basTete") => (ev: LayoutChangeEvent) => {
    bornes.current[cle] = ev.nativeEvent.layout.y + ev.nativeEvent.layout.height;
  };

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: ajout ? espace.xxl * 2 + 52 + insets.bottom + espace.l : espace.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(ev) => surDefilement(ev.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {tete === "photo" ? (
          <TetePhoto ex={ex} marge={haut + BARRE} onLayout={bas("basTete")} />
        ) : tete === "persos" ? (
          <TetePersos ex={ex} marge={haut + BARRE} onChange={() => setVersion((v) => v + 1)} onLayout={bas("basTete")} />
        ) : (
          <Bloc3D
            cle={cle3d}
            ex={ex}
            hauteur={haut + HAUTEUR_3D}
            hauteurGrand={hauteur3DAgrandie(largeur, haut + HAUTEUR_3D)}
            grand={grand}
            onBasculer={basculer3D}
            retour={retour3D}
            visible={!etat.fond}
          />
        )}

        <View onLayout={bas("basTitre")} style={styles.tete}>
          <View style={styles.nom}>
            <Texte variante="titre" accessibilityRole="header" style={{ flexShrink: 1 }}>
              {ex.nom}
            </Texte>
            {ex.perso ? <EtiquettePerso coach={ex.coach} /> : null}
          </View>
          <View style={styles.infos}>
            <View style={{ flex: 1, gap: 2 }}>
              {meta ? (
                <Texte variante="meta" couleur="t2">
                  {meta}
                </Texte>
              ) : null}
              {secondaires.length ? (
                <Texte variante="meta" couleur="t2">
                  {t("exercices.fiche.aussi", { muscles: secondaires.join(", ") })}
                </Texte>
              ) : null}
            </View>
            {/* Avec une photo, les persos passent à côté des infos (D5) ; sans, ils sont déjà en tête. */}
            {tete === "photo" ? <Persos principal={ex.muscle} secondaires={secondaires} hauteur={56} /> : null}
          </View>
        </View>

        <View style={styles.bandeaux}>
          <NotesExercice
            types={["exercice"]}
            defaut="exercice"
            notes={d.notes}
            onAjouter={(type, texte) => ajouterNote(db, { exerciceId: ex.id }, type, texte).then(() => setVersion((v) => v + 1))}
            onModifier={(nid, texte) => modifierNote(db, nid, texte).then(() => setVersion((v) => v + 1))}
            onChangerType={() => Promise.resolve()}
          />
          {ex.photo && !ex.photo_distante ? <PhotoEnAttente /> : null}
          {ex.a_verifier ? (
            <Bandeau texte={t("accueil.progression.natureAVerifier", { nature: info.libelle })} onPress={() => setEditionOuverte(true)} />
          ) : null}
          {d.proposition ? <Bandeau texte={t("exercices.lien.ceciEst", { nom: d.proposition })} onPress={() => setLienOuvert(true)} /> : null}
          {compteLePoidsDuCorps(ex.nature, ex.muscle) ? (
            <Bandeau
              texte={d.poidsKg != null ? t("accueil.progression.poidsCorpsValeur", { valeur: `${nombre(versUnite(d.poidsKg, u), 1)} ${u}` }) : t("accueil.progression.poidsCorps")}
              onPress={() => setPoidsOuvert(true)}
            />
          ) : null}
        </View>

        {mesures.length > 1 ? (
          <View style={{ paddingTop: espace.l }}>
            <Pastilles<MesureProgression> libelle={t("accueil.progression.mesure")} options={mesures.map((m) => ({ valeur: m, libelle: libelleMesure(m) }))} valeur={d.mesure} onChange={setChoix} />
          </View>
        ) : null}

        <View style={styles.grand}>
          <Texte style={styles.chiffre}>
            {prog.points.length ? montrer(valeur) : "—"}
            {unite && prog.points.length ? <Texte variante="corps" couleur="t2">{` ${unite}`}</Texte> : null}
          </Texte>
          {gain ? (
            <Texte variante="corps" couleur={progresse ? "valide" : "t3"} style={{ fontVariant: ["tabular-nums"] }}>
              {gain}, {jours ? PERIODES[periode]!.libelle : t("accueil.progression.toutMin")}
            </Texte>
          ) : null}
        </View>
        <View onLayout={bas("basCourbe")} style={{ paddingHorizontal: espace.l, paddingTop: 6 }}>
          <CourbeCarnet points={prog.points.map((p) => ({ date: p.date, valeur: conv(p.valeur) }))} recordFin={recordAuj} inverse={inverse} montrer={montrerCourbe} />
        </View>
        <View style={{ paddingTop: espace.s }}>
          <Pastilles<number>
            libelle={t("accueil.courbe.periode")}
            options={PERIODES.map((p, i) => ({ valeur: i, libelle: p.court, lu: p.libelle }))}
            valeur={periode}
            onChange={setPeriode}
          />
        </View>

        <Entete texte={t("accueil.progression.records")} />
        <View style={[styles.groupe, { backgroundColor: couleurs.s1 }]}>
          <LigneRecord
            libelle={t("accueil.progression.mesureReps")}
            valeur={meilleure ? serieNatureTexte(champs, meilleure, u) || "—" : "—"}
            quand={meilleure?.atteint}
            medaille={!!meilleure?.record}
          />
          {lignesRecords.map((r) => (
            <LigneRecord key={r.libelle} libelle={r.libelle} valeur={r.valeur} quand={r.quand} filet />
          ))}
          {d.routines.length ? <LigneRecord libelle={t("exercices.fiche.routines")} valeur={d.routines.map((r) => r.nom).join(", ")} filet /> : null}
        </View>

        {seances.length ? (
          <>
            <Entete texte={t("accueil.progression.seances")} />
            <View style={[styles.groupe, { backgroundColor: couleurs.s1 }]}>
              {seances.map((s, i) => {
                const faites = s.series.filter((x) => x.faite);
                const travail = faites.filter((x) => x.type !== "echauffement");
                const best = Math.max(0, ...s.series.map((x) => x.e1rm ?? 0));
                const avecRm = best > 0 && !info.poidsCorps && ex.nature === "poids_reps";
                const record = faites.some((x) => x.records.length > 0);
                return (
                  <View key={s.seanceId} style={[styles.seance, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
                    <View style={{ flex: 1 }}>
                      <Texte variante="corps" style={{ fontSize: 15 }}>
                        {jourSemaineMois(s.date)}
                      </Texte>
                      <Texte variante="meta" couleur="t2" style={{ fontVariant: ["tabular-nums"] }}>
                        {resumeSeries(travail.length ? travail : faites, champs, u)}
                      </Texte>
                    </View>
                    {avecRm ? (
                      <Texte variante="meta" couleur="t3" style={{ fontVariant: ["tabular-nums"] }}>
                        1RM {charge(best, u)}
                      </Texte>
                    ) : null}
                    {record ? <Icone nom="medal" couleur={couleurs.record} taille={18} /> : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
        {ex.perso ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setLienOuvert(true)}
            style={({ pressed }) => [styles.fusion, { marginTop: espace.m }, pressed && { backgroundColor: couleurs.s2 }]}
          >
            <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
              {t(ex.lie_a ? "exercices.lien.dissocier" : "exercices.lien.relier")}
            </Texte>
          </Pressable>
        ) : null}
        {ex.perso ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("accueil.progression.fusionnerAutre")}
            onPress={fusionner}
            style={({ pressed }) => [styles.fusion, pressed && { backgroundColor: couleurs.s2 }]}
          >
            <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
              {t("accueil.progression.fusionnerAvec")}
            </Texte>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.barre, { paddingTop: haut, height: barre }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: couleurs.bg }, styleFond]} pointerEvents="none" />
        <BoutonIcone nom="back" libelle={t("accueil.progression.retour")} onPress={revenir} />
        <Animated.View style={[{ flex: 1, paddingHorizontal: 4 }, styleTitre]} pointerEvents="none">
          <Texte variante="exercice" numberOfLines={1}>
            {ex.nom}
          </Texte>
        </Animated.View>
        <BoutonIcone nom="more" libelle={t("accueil.progression.modifier")} onPress={() => setEditionOuverte(true)} />
      </View>
      <Animated.View
        style={[styles.mini, { top: barre, backgroundColor: couleurs.bg, borderBottomColor: couleurs.s2 }, styleMini]}
        pointerEvents="none"
        accessibilityElementsHidden={!etat.mini}
        importantForAccessibility={etat.mini ? "auto" : "no-hide-descendants"}
      >
        <Texte variante="meta" couleur="t3" numberOfLines={1}>
          {libelleMesure(d.mesure)}
        </Texte>
        <MiniCourbe valeurs={prog.points.map((p) => p.valeur)} inverse={inverse} />
        <Texte variante="corps" style={{ fontSize: 15, fontFamily: police.medium, fontVariant: ["tabular-nums"] }}>
          {prog.points.length ? montrer(valeur) : "—"}
        </Texte>
        {gain ? (
          <Texte variante="meta" couleur={progresse ? "valide" : "t3"} style={{ fontVariant: ["tabular-nums"] }}>
            {gain}
          </Texte>
        ) : null}
      </Animated.View>

      {ajout ? (
        <View style={[styles.cta, { paddingBottom: insets.bottom + espace.m, backgroundColor: couleurs.bg }]}>
          <BoutonPrincipal
            libelle={t("accueil.progression.ajouter")}
            onPress={() => {
              demanderCochage(ex.id);
              router.back();
            }}
          />
        </View>
      ) : null}

      <Feuille visible={fusion != null} onFermer={() => setFusion(null)} titre={fusion?.titre} sousTitre={fusion?.texte}>
        <Groupe>
          <Option
            premier
            libelle={t("accueil.progression.fusionner")}
            onPress={() => {
              const f = fusion;
              setFusion(null);
              if (!f) return;
              fusionnerExercices(db, id, f.cibleId)
                .then(() => router.replace({ pathname: "/progress/[id]", params: { id: f.cibleId } }))
                .catch(erreurFusion);
            }}
          />
          <Option libelle={t("accueil.progression.annuler")} onPress={() => setFusion(null)} />
        </Groupe>
      </Feuille>
      <FeuilleMessage message={message} onFermer={() => setMessage(null)} />
      <FeuilleLien exercice={ex} visible={lienOuvert} onFermer={() => setLienOuvert(false)} onFini={() => setVersion((n) => n + 1)} />
      <FeuillePoids visible={poidsOuvert} onFermer={() => setPoidsOuvert(false)} onChange={() => setVersion((n) => n + 1)} />
      <FormulaireExercice
        visible={editionOuverte}
        onFermer={() => setEditionOuverte(false)}
        exercice={ex}
        onLier={() => (setEditionOuverte(false), setLienOuvert(true))}
        onFini={(nid, variante) => {
          setEditionOuverte(false);
          if (variante) router.replace({ pathname: "/progress/[id]", params: { id: nid } });
          else setVersion((n) => n + 1);
        }}
      />
    </View>
  );
}

/**
 * Bloc du haut : le personnage 3D joue le clip (coupé hors écran et en mouvement réduit), un glissé horizontal le fait
 * tourner, deux doigts zooment, un tap l'agrandit (4:3 portrait) ou la réduit ; boutons face / dos et
 * pause en bas à droite, muscles en liste en bas à gauche (toucher un muscle le fait ressortir seul 5 s). Sans clip :
 * même bloc, l'illustration en grand et les muscles de la fiche, sans effet au toucher.
 */
function Bloc3D({
  cle,
  ex,
  hauteur,
  hauteurGrand,
  grand,
  onBasculer,
  retour,
  visible,
}: {
  cle: string | undefined;
  ex: Exercice;
  hauteur: number;
  hauteurGrand: number;
  grand: boolean;
  onBasculer(): void;
  /** Incrémenté au retour à la taille normale : cadrage initial. */
  retour: number;
  visible: boolean;
}) {
  const { couleurs, mode } = useTheme();
  const { reglages } = useApp();
  useLangue();
  const reduit = useReduit();
  const [muscles, setMuscles] = useState<{ principaux: string[]; secondaires: string[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pause, setPause] = useState(reduit);
  const [face, setFace] = useState(false);
  // tap sur un muscle : il ressort seul dans la 3D pendant 5 s (focus.ts) ; on se réveille à la fin pour la sélection
  const [focus, setFocus] = useState<Focus | null>(null);
  useEffect(() => {
    if (!focus) return;
    const reste = focus.fin - performance.now();
    const t = setTimeout(
      () => setFocus((f) => (f !== focus ? f : reste > 0 ? { ...f } : null)),
      reste > 0 ? reste : focus.fin + SORTIE - performance.now(),
    );
    return () => clearTimeout(t);
  }, [focus]);
  const enAvant = focusActif(focus, performance.now()) ? focus!.muscle : null;
  const fond = mode === "jour" ? couleurs.s1 : couleurs.s2;
  const h = useSharedValue(hauteur);
  useEffect(() => {
    h.value = withTiming(grand ? hauteurGrand : hauteur, { duration: reduit ? 0 : DUREE_AGRANDIR, easing: courbes.sortie });
  }, [h, grand, hauteur, hauteurGrand, reduit]);
  const styleHauteur = useAnimatedStyle(() => ({ height: h.value }));
  const couleurs3D = useMemo(
    () => ({
      fond,
      corps: CORPS,
      principal: couleurs.muscle,
      secondaire: couleurs.muscle2,
    }),
    [fond, couleurs],
  );
  const avec3D = !!cle && !erreur;
  const lignes: { cle: string; nom: string; couleur: string }[] = avec3D
    ? [
        ...(muscles?.principaux ?? []).map((m) => ({ cle: m, nom: NOMS_MUSCLES[m] ?? m, couleur: couleurs.muscle })),
        ...(muscles?.secondaires ?? []).map((m) => ({ cle: m, nom: NOMS_MUSCLES[m] ?? m, couleur: couleurs.muscle2 })),
      ]
    : [
        ...(ex.muscle ? [{ cle: ex.muscle, nom: ex.muscle, couleur: couleurs.muscle }] : []),
        ...ex.secondaires.split("|").filter(Boolean).map((m) => ({ cle: m, nom: m, couleur: couleurs.muscle2 })),
      ];

  return (
    <Animated.View style={[{ backgroundColor: fond, overflow: "hidden" }, styleHauteur]}>
      {avec3D ? (
        <Suspense fallback={null}>
          <Vue3D
            cle={cle}
            couleurs={couleurs3D}
            lecture={visible && !pause}
            dos={retour}
            face={face}
            elan={!reduit}
            horizontal
            libelle={t("accueil.progression.en3D", { nom: ex.nom })}
            onPret={setMuscles}
            onErreur={setErreur}
            onTap={onBasculer}
            focus={focus}
            personnage={reglages.personnage}
          />
        </Suspense>
      ) : (
        <View style={styles.illustration} pointerEvents="none">
          <Picto slug={ex.slug} nom={ex.nom} taille={176} />
        </View>
      )}
      {erreur ? (
        <Texte variante="meta" couleur="t3" style={[styles.erreur3D, { top: hauteur - HAUTEUR_3D + BARRE }]}>
          {t("accueil.progression.indisponible3D", { erreur })}
        </Texte>
      ) : null}
      <View style={styles.muscles} pointerEvents="box-none">
        {lignes.slice(0, 4).map((p) => {
          const contenu = (
            <>
              <View style={[styles.point, { backgroundColor: p.couleur }]} />
              <Texte variante="meta" style={{ fontSize: 12, fontFamily: police.medium }}>
                {p.nom}
              </Texte>
            </>
          );
          return avec3D ? (
            <Pressable
              key={p.cle}
              accessibilityRole="button"
              accessibilityLabel={p.nom}
              accessibilityState={{ selected: enAvant === p.cle }}
              hitSlop={{ top: 4, bottom: 4, right: espace.m }}
              onPress={() => setFocus((f) => toucherMuscle(f, p.cle, performance.now()))}
              style={[styles.muscle, { backgroundColor: `${couleurs.bg}${enAvant === p.cle ? "" : "b8"}` }, enAvant && enAvant !== p.cle && { opacity: 0.5 }]}
            >
              {contenu}
            </Pressable>
          ) : (
            <View key={p.cle} style={[styles.muscle, { backgroundColor: `${couleurs.bg}b8` }]}>
              {contenu}
            </View>
          );
        })}
      </View>
      {avec3D ? (
        <View style={styles.commandes}>
          <BoutonIcone nom="sync" libelle={t(face ? "accueil.progression.vueDos" : "accueil.progression.vueFace")} couleur={couleurs.t2} onPress={() => setFace((f) => !f)} />
          <BoutonIcone nom={pause ? "play" : "pause"} libelle={t(pause ? "accueil.progression.lecture" : "accueil.progression.pause")} couleur={couleurs.t2} onPress={() => setPause((p) => !p)} />
        </View>
      ) : null}
    </Animated.View>
  );
}

/** Courbe repliée : le tracé seul, sur la largeur qui reste dans la ligne. */
function MiniCourbe({ valeurs, inverse }: { valeurs: number[]; inverse: boolean }) {
  const { couleurs } = useTheme();
  const [l, setL] = useState(0);
  const h = 20;
  return (
    <View style={{ flex: 1, height: h }} onLayout={(e) => setL(Math.round(e.nativeEvent.layout.width))}>
      {l > 0 && valeurs.length > 1 ? (
        <Svg width={l} height={h}>
          <Path d={traceMini(valeurs, l, h, inverse)} fill="none" stroke={couleurs.t1} strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

function Entete({ texte }: { texte: string }) {
  return (
    <Texte variante="entete" couleur="t3" accessibilityRole="header" style={styles.entete}>
      {texte}
    </Texte>
  );
}

function Bandeau({ texte, onPress }: { texte: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.bandeau, { backgroundColor: pressed ? couleurs.s2 : couleurs.s1 }]}
    >
      <Texte variante="libelle" style={{ flex: 1 }}>
        {texte}
      </Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={18} />
    </Pressable>
  );
}

/** « aujourd'hui », sinon « 23 oct. ». */
function quandTexte(ms: number): string {
  if (debutJour(ms).getTime() === debutJour(Date.now()).getTime()) return t("communs.aujourdhuiMin");
  return jourMois(ms);
}

function LigneRecord({ libelle, valeur, quand, medaille, filet }: { libelle: string; valeur: string; quand?: number; medaille?: boolean; filet?: boolean }) {
  const { couleurs } = useTheme();
  useLangue();
  const l = useLargeurContenu();
  return (
    <View style={[styles.rec, filet && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
      <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
        {libelle}
      </Texte>
      {medaille ? <Icone nom="medal" couleur={couleurs.record} taille={18} /> : null}
      <View style={{ alignItems: "flex-end", maxWidth: l * 0.55 }}>
        <Texte variante="saisie" numberOfLines={1} style={{ fontSize: 15, fontVariant: ["tabular-nums"] }}>
          {valeur}
        </Texte>
        {quand ? (
          <Texte variante="meta" couleur="t3">
            {quandTexte(quand)}
          </Texte>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fusion: { minHeight: 48, justifyContent: "center", marginHorizontal: espace.l, marginTop: espace.xl, paddingHorizontal: espace.m, borderRadius: rayon.m },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espace.l, paddingTop: espace.m },
  barre: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  mini: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: espace.l,
    borderBottomWidth: 1,
  },
  erreur3D: { position: "absolute", left: espace.m, right: espace.m, fontSize: 12 },
  illustration: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingTop: BARRE },
  // une ligne par muscle : 36 px + 4 px de marge de clic de part et d'autre = 44 px, sans chevaucher la voisine (8 px)
  muscles: { position: "absolute", left: espace.m, bottom: espace.m, gap: 8, alignItems: "flex-start", maxWidth: "62%" },
  muscle: { minHeight: 36, borderRadius: 12, paddingLeft: 10, paddingRight: espace.m, flexDirection: "row", alignItems: "center", gap: 6 },
  point: { width: 8, height: 8, borderRadius: 4 },
  commandes: { position: "absolute", right: 4, bottom: 4, flexDirection: "row" },
  tete: { paddingHorizontal: espace.l, paddingTop: 14, gap: 2 },
  nom: { flexDirection: "row", alignItems: "center", gap: espace.s },
  infos: { flexDirection: "row", alignItems: "center", gap: espace.m },
  bandeaux: { paddingHorizontal: espace.l, gap: espace.s, paddingTop: espace.m },
  bandeau: { minHeight: 48, borderRadius: rayon.l, paddingHorizontal: espace.l, flexDirection: "row", alignItems: "center" },
  grand: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingHorizontal: espace.l, paddingTop: 18 },
  chiffre: { fontFamily: police.light, fontSize: 28, letterSpacing: -0.28, fontVariant: ["tabular-nums"] },
  entete: { paddingHorizontal: espace.l, paddingTop: espace.xxl, paddingBottom: espace.s },
  groupe: { marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden" },
  rec: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: espace.l, paddingVertical: 6 },
  seance: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
});
