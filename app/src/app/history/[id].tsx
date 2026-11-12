import { useCallback, useEffect, useState } from "react";
import { Image, PixelRatio, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { creerRoutineDepuisSeance, fusionnerTourSeance, INFO_NATURE, modifierSeance, lirePhotoSeance, lireSeance, seanceTermineeAuRang, supprimerSeance, type SeanceDetail } from "../../db";
import { menagePhotos } from "../../photos";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { useApp } from "../../ecrans/contexte";
import { unitesSeance } from "../../ecrans/donnees";
import { dateLongueSeance, distanceSeance, dureeCourte, nombre, serieNatureTexte, versUnite, type Unite } from "../../ecrans/format";
import { doitRelireWhoop, sourcesSeance, type SourcesSeance } from "../../ecrans/seance-sources";
import { synchroniser } from "../../whoop";
import { sante } from "../../natif/sante/index";
import { minutesEntre } from "../../ecrans/edition-seance";
import { pictoLieu } from "../../ecrans/Lieux";
import { noteAffichee, titreAffiche, vuePassee, type AffichageExercice, type Couverture } from "../../ecrans/seance-passee-vue";
import { couleurTypeSerie, LETTRE } from "../../ecrans/seance-vue";
import { Fait, RangeeChiffres } from "../../ecrans/seance-chiffres";
import { FeuilleSalle } from "../../ecrans/FeuilleSalle";
import { ZonePhoto } from "../../ecrans/ZonePhoto";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { BarreSurPhoto, barreReplie, useHautEntete } from "../../ecrans/BarreSurPhoto";
import { BarreHaut, BoutonIcone } from "../../ui/Cadre";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { fichierPicto } from "../../ui/pictos";
import { useLiens } from "../../ui/useLiens";
import { Texte } from "../../ui/Texte";
import { t, tp } from "../../i18n/index";
import { marquerSuppression } from "../../ui/Desintegration";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { desintegration } from "../../theme/mouvement";
import { BlocEffort, LigneGeste } from "../../ecrans/BlocEffort";
import { chargerEffort, chargerFcMuscu, type EffortSeance, type FcMuscuSeance } from "../../ecrans/effort-donnees";
import { BulleCalcul, EffortGrand, PartsEffort, partsEffort } from "../../ecrans/EffortGrandSeance";
import { effortSeance, type EffortDeSeance } from "../../ecrans/effort-charges";
import { BlocFcMuscu, type LibelleSerie } from "../../ecrans/BlocFcMuscu";
import { FeuilleBatterie } from "../../ecrans/FeuilleBatterie";
import { suivi } from "../../natif/suivi";
import type { Jetons } from "../../theme/jetons";
import { ParKm, TableauTours } from "../../ecrans/ToursKm";
import { FeuilleChangerActivite } from "../../ecrans/FeuilleChangerActivite";
import { lireActiviteCatalogue, lireSeanceAChanger, lireSportSeance } from "../../db/depots/activites";
import { circuitDeSortie } from "../../db/depots/circuits";
import type { Activite } from "../../ecrans/changer-activite";
import { phrasePourquoi } from "../../ecrans/activites-vue";
import { cardioDansFcMuscu, chiffresSuivi, estCourseGuidee, estSuiviPepfit } from "../../ecrans/fin-suivi";
import { ExerciceLu, exoLuDe, type ExoLu } from "../../ecrans/activite/ExerciceLu";
import { MessageActivite } from "../../ecrans/MessageActivite";
import { FeuilleHorairesActivite } from "../../ecrans/FeuilleHorairesActivite";
import { estSerieUnique } from "../../ecrans/horaires";
import { Bref } from "../../ecrans/briques";

/** Séances pour lesquelles Whoop a déjà été relu depuis l'ouverture de l'appli (une fois chacune, même en cas d'échec). */
const whoopRelu = new Set<string>();

// LA page d'une activité, la seule : ouverte depuis Sport ou l'historique. Menu « … », photo et modification.
//
// Séance terminée, en lecture (A) : la photo de la séance tout en haut, pleine largeur, sinon rien ; elle monte derrière l'en-tête
// transparent (ecrans/BarreSurPhoto.tsx). Sous une image, le
// picto de son sport ou d'un exercice seul est une petite pastille à gauche du titre ; sans image, il reste grand au-dessus. Puis titre, date · heure, le lieu et son
// picto, durée, distance, volume, séries, note, puis les séries faites (planche Lieux § 4). Le menu « … » mène à l'édition (B),
// crée une routine à partir de la séance ou la supprime.
export default function SeancePassee() {
  // « derniere » (lien pepfitopen://history/derniere?rang=n) : la n-ième séance terminée, la plus récente d'abord ; &menu=1 : menu ouvert.
  const { id: param, rang, menu: menuLien } = useLocalSearchParams<{ id: string; rang?: string; menu?: string }>();
  const { db, reglages } = useApp();
  const { couleurs } = useTheme();
  const [seance, setSeance] = useState<SeanceDetail | null>();
  const [photo, setPhoto] = useState(false);
  const [unites, setUnites] = useState<Record<string, Unite>>({});
  const [menu, setMenu] = useState(false);
  // Le circuit déjà fait de cette sortie (planche Circuits, menu ⋯) : un circuit par sortie, la ligne du menu ouvre le sien.
  const [circuitId, setCircuitId] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [lieu, setLieu] = useState(false);
  const [effort, setEffort] = useState<EffortSeance | null>(null);
  // L'effort de la séance et sa source (planche sport-stats v2, S8, S11) : en grand à droite du nom, l'infobulle au toucher.
  const [effortRetenu, setEffortRetenu] = useState<EffortDeSeance | null>(null);
  const [bulleEffort, setBulleEffort] = useState(false);
  // « Photo supprimée · Annuler » de la photo de couverture : posée ici, sous la barre transparente, hors de la page qui défile.
  const [annulerPhoto, setAnnulerPhoto] = useState<{ annuler: () => void } | null>(null);
  const surAttentePhoto = useCallback((annuler: (() => void) | null) => setAnnulerPhoto(annuler ? { annuler } : null), []);
  const [sources, setSources] = useState<SourcesSeance | null>(null);
  const [fcMuscu, setFcMuscu] = useState<FcMuscuSeance | null>(null);
  // Sport posé par pepfit (planche activite-detectee) : « Reconnu : Padel », sa raison et « Changer ».
  const [reconnu, setReconnu] = useState<{ sport: string; phrase: string } | null>(null);
  const [changer, setChanger] = useState(false);
  // Feuille Horaires (début, fin, durée) d'une séance de sport ou d'une sortie GPS.
  const [horaires, setHoraires] = useState(false);
  // Sport de la séance (padel, course… : sa marque, son exercice, sa routine ou son nom) : son picto est en tête même sans exercice fait.
  const [sportSeance, setSportSeance] = useState<Activite | null>(null);
  // FC coupée en direct et pepfit encore optimisé par Android : la ligne « FC coupée … » ouvre l'aide du réglage de batterie.
  const [optimisee, setOptimisee] = useState(false);
  const [aideBatterie, setAideBatterie] = useState(false);
  // Barre du haut posée sur l'image de tête : transparente, puis pleine une fois l'image défilée.
  const [replie, setReplie] = useState(false);
  const hautEntete = useHautEntete();
  const { width: largeurEcran } = useWindowDimensions();
  useEffect(() => {
    if (menuLien === "1") setMenu(true);
  }, [menuLien]);
  const seanceId = seance?.seance.id;
  useEffect(() => {
    if (!seanceId) return;
    let actif = true;
    circuitDeSortie(db, seanceId)
      .then((c) => actif && setCircuitId(c?.id ?? null))
      .catch(() => actif && setCircuitId(null));
    return () => {
      actif = false;
    };
  }, [db, seanceId, menu]);

  const recharger = useCallback(async () => {
    const id = param === "derniere" ? await seanceTermineeAuRang(db, Number(rang ?? 0) || 0) : param;
    const s = id ? await lireSeance(db, id) : null;
    // Séance et unités posées ensemble : après une bascule kg / lbs, les charges ne s'affichent jamais dans l'ancienne unité.
    // La photo aussi (elle décide du héros : pas de saut à l'affichage).
    // Le sport aussi (il décide du héros avec la photo).
    const [u, ph, sp] = s
      ? await Promise.all([unitesSeance(db, s, reglages.unite), lirePhotoSeance(db, s.seance.id), lireSportSeance(db, s.seance.id).catch(() => null)])
      : [null, null, null];
    // La séance s'affiche d'abord ; effort, FC et activité reconnue suivent, lus ensemble (audit de performance, M13 : huit
    // lectures l'une après l'autre avant le premier affichage).
    setSeance(s);
    setPhoto(!!ph);
    setSportSeance(sp);
    if (u) setUnites(u);
    const [ef, fm, rc, retenu] = s
      ? await Promise.all([
          chargerEffort(db, s),
          chargerFcMuscu(db, s),
          lireSeanceAChanger(db, s.seance.id),
          s.seance.fin != null ? effortSeance(db, s.seance.id).catch(() => null) : null,
        ])
      : [null, null, null, null];
    const act = rc?.reconnu ? await lireActiviteCatalogue(db, rc.reconnu.sport) : null;
    const lieuId = rc?.reconnu?.pourquoi.lieuId;
    const lieu = lieuId ? ((await db.getFirstAsync<{ nom: string }>("SELECT nom FROM salle WHERE id = ?", [lieuId]))?.nom ?? null) : null;
    setReconnu(rc?.reconnu && act ? { sport: act.nom, phrase: phrasePourquoi(rc.reconnu.pourquoi, { lieu }) } : null);
    setEffort(ef);
    setEffortRetenu(retenu);
    if (ef?.vue.coupureFc) setOptimisee((await suivi.batterie().catch(() => null))?.optimisee ?? false);
    setFcMuscu(fm);
    // Pas et FC des vraies sources (Santé Connect) : après le premier rendu, la lecture peut prendre une seconde.
    const fin = s?.seance.fin;
    if (!s || fin == null) {
      setSources(null);
      return null;
    }
    const src = await sourcesSeance(db, { id: s.seance.id, debut: s.seance.debut, fin }, { sante }).catch(() => null);
    setSources(src);
    if (src?.fc) {
      // FC venue d'ailleurs : découpée par exercice pour une muscu cochée, sinon la courbe du bloc d'effort
      const fm2 = fm ?? (await chargerFcMuscu(db, s, src.fc));
      setFcMuscu(fm2);
      if (!fm2) setEffort(await chargerEffort(db, s, src.fc));
    } else if (src?.complement) {
      // FC du capteur coupée en direct : ses trous comblés par Whoop ou Santé Connect, marqués comme tels (muscu comprise :
      // sans cela sa moyenne et son max ne voyaient que les moments où le lien tenait, docs/FC-BASSE.md)
      if (fm) setFcMuscu(await chargerFcMuscu(db, s, src.complement));
      setEffort(await chargerEffort(db, s, src.complement));
    }
    return { id: s.seance.id, fin };
  }, [db, param, rang, reglages.unite]);

  useFocusEffect(
    useCallback(() => {
      recharger()
        .then(async (lue) => {
          // Séance toute récente sans son activité Whoop (pas, effort, FC) : Whoop relu une fois, puis la fiche rechargée.
          if (!lue || whoopRelu.has(lue.id) || !(await doitRelireWhoop(db, lue))) return;
          whoopRelu.add(lue.id);
          await synchroniser(db);
          await recharger();
        })
        .catch(console.error);
    }, [recharger, db]),
  );

  if (!seance) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;

  // Ce que la page montre : la séance entière.
  const faits = seance.exercices.filter((e) => e.series.some((x) => x.faite));
  const series = seance.exercices.flatMap((e) => e.series).filter((x) => x.faite);
  const debut = seance.seance.debut;
  const fin = seance.seance.fin ?? null;
  const titre = titreAffiche(seance.seance.titre ?? seance.routineNom ?? t("seance.seance.titreDefaut"));
  const note = noteAffichee(seance.seance.note);
  const hautImage = hautEntete + Math.min(largeurEcran / 2, 240);
  const lieuNom = seance.salle?.nom ?? null;
  const lieuType = seance.salle?.type;
  const vue = vuePassee(
    faits.map((e) => ({ nom: e.exercice.nom, nature: e.exercice.nature, series: e.series.filter((x) => x.faite) })),
    titre,
    photo,
    sportSeance != null,
    false,
  );
  const couverture: Couverture = vue.couverture;
  const seul = faits.length === 1 ? faits[0]! : null;
  // Le picto de son sport, à défaut celui de l'exercice seul.
  const picto = sportSeance ?? (seul ? { slug: seul.exercice.slug, nom: seul.exercice.nom, id: seul.exercice.id } : null);
  const heros = vue.heros;
  const pictoPetit = vue.pictoPetit;
  const fcMuscuComplet = !!fcMuscu && faits.every((e) => e.series.every((x) => !x.faite || x.fait_le != null));
  // Suivi (course, tapis…) : durée et distance au format de sa fin (« 0:46 », « 0,16 km »), pas « 1 min · 167 m » (n° 25).
  const suiviChiffres = effort && estSuiviPepfit(effort) ? chiffresSuivi(effort.vue) : null;
  // Une seule courbe de FC : celle de la muscu remplace le Cardio de Whoop (ses kcal passent dans la rangée du haut).
  const cardioFondu = cardioDansFcMuscu(fcMuscu, effort);
  const distance = suiviChiffres ? suiviChiffres.distance : vue.distanceM > 0 ? distanceSeance(vue.distanceM) : null;
  const changePhoto = () => recharger().catch(console.error);
  const dateTexte = dateLongueSeance(debut);

  // Les exercices, lus de la même façon d'où qu'ils viennent.
  const exercices: { exo: ExoLu; affichage: AffichageExercice }[] = fcMuscuComplet
    ? [] // « FC par exercice » liste déjà chaque exercice et ses séries : pas une seconde fois (retour du 30/10)
    : faits.flatMap((e, i) => {
        const a = vue.exercices[i]!;
        return a.cache ? [] : [{ exo: exoLuDe(e, unites[e.exercice.id] ?? "kg", suiviChiffres != null, couleurs), affichage: a }];
      });

  const enRoutine = async () => {
    setMenu(false);
    const r = await creerRoutineDepuisSeance(db, seance.seance.id);
    if (r) router.push({ pathname: "/routine/[id]", params: { id: r } });
  };

  return (
    <SafeAreaView edges={couverture ? [] : ["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      {/* Avec une image de tête, la barre est posée dessus (transparente) ; sans, elle reste au-dessus, comme avant. */}
      {couverture ? (
        <BarreSurPhoto replie={replie} titre={t("seance.passee.titre")}>
          {(blanc) => <BoutonIcone nom="more" couleur={blanc ? "rgba(255,255,255,0.96)" : undefined} libelle={t("seance.passee.options")} onPress={() => setMenu(true)} />}
        </BarreSurPhoto>
      ) : (
        <BarreHaut titre={t("seance.passee.titre")}>
          <BoutonIcone nom="more" libelle={t("seance.passee.options")} onPress={() => setMenu(true)} />
        </BarreHaut>
      )}
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}
          onScrollBeginDrag={() => setBulleEffort(false)}
          scrollEventThrottle={16}
          onScroll={couverture ? (e) => setReplie(barreReplie(e.nativeEvent.contentOffset.y, hautImage, hautEntete)) : undefined}
        >
          {couverture === "photo" ? (
            <ZonePhoto seanceId={seance.seance.id} couverture={{ haut: hautEntete }} onChange={changePhoto} surAttente={surAttentePhoto} />
          ) : heros === "picto" && picto ? (
            <Heros slug={picto.slug} nom={picto.nom} id={picto.id} />
          ) : null}
          {/* Le message de l'activité (planche 15), sous l'image et avant le titre, entier : la page est l'endroit où tout se lit. */}
          {seance.seance.message ? <MessageActivite texte={seance.seance.message} complet style={styles.legende} /> : null}
          <View style={[styles.tete, styles.teteLigne, (heros || couverture) && { paddingTop: espace.xl }]}>
            {/* Sous une image de tête : le picto du sport en petite pastille, à gauche du titre. */}
            {pictoPetit && picto ? <Heros petit slug={picto.slug} nom={picto.nom} id={picto.id} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texte variante="titreFort" accessibilityRole="header">
                {titre}
              </Texte>
              <Texte variante="corps" couleur="t2" style={styles.ligneTete}>
                {dateTexte}
              </Texte>
              {lieuNom ? (
                <View style={styles.lieu}>
                  <Icone nom={pictoLieu(lieuType)} couleur={couleurs.t3} taille={16} />
                  <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ fontSize: 13, flexShrink: 1 }}>
                    {lieuNom}
                  </Texte>
                </View>
              ) : null}
            </View>
            {effortRetenu ? <EffortGrand effort={effortRetenu} ouvert={bulleEffort} onBasculer={() => setBulleEffort((o) => !o)} /> : null}
            {effortRetenu && bulleEffort ? (
              <View style={[styles.bulleEffort, { top: (heros || couverture ? espace.xl : espace.m) + 70 }]}>
                <BulleCalcul effort={effortRetenu} onFermer={() => setBulleEffort(false)} />
              </View>
            ) : null}
          </View>
          <PartsEffort parts={partsEffort(effortRetenu)} style={styles.parts} />
          {reconnu ? (
            <View style={[styles.reconnu, { backgroundColor: couleurs.btnTonalFond }]}>
              <Icone nom="history" couleur={couleurs.partieEntrainement} taille={20} />
              <View style={{ flex: 1, gap: 1 }}>
                <Texte variante="corps" style={{ fontSize: 14, fontFamily: police.semibold }}>
                  {t("activite.reconnuSport", { sport: reconnu.sport })}
                </Texte>
                <Texte variante="meta" couleur="t2" numberOfLines={2}>
                  {reconnu.phrase}
                </Texte>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("activite.changerActivite")}
                onPress={() => setChanger(true)}
                hitSlop={4}
                style={({ pressed }) => [styles.changer, { backgroundColor: pressed ? couleurs.s3 : couleurs.verreCarte }]}
              >
                <Texte variante="corps" style={{ fontSize: 14, fontFamily: police.semibold }}>
                  {t("activite.changer")}
                </Texte>
              </Pressable>
            </View>
          ) : null}
          <RangeeChiffres>
            {suiviChiffres ? (
              <Fait titre={t("seance.passee.duree")} valeur={suiviChiffres.duree} />
            ) : fin ? (
              <Fait titre={t("seance.passee.duree")} valeur={dureeCourte(minutesEntre(debut, fin) * 60)} />
            ) : null}
            {distance ? <Fait titre={t("seance.passee.distance")} valeur={distance} /> : null}
            {vue.avecVolume ? (
              <Fait titre={t("seance.passee.volume")} valeur={`${nombre(Math.round(versUnite(vue.volume, reglages.unite)), 0)} ${reglages.unite}`} />
            ) : null}
            {/* Séance de muscu avec la FC (planche suivi-gps, lot 5) : FC moy. et FC max à la place du nombre de séries. */}
            {fcMuscu ? (
              <>
                {fcMuscu.vue.fcMoy != null ? <Fait titre={t("seance.fc.fcMoy")} valeur={String(fcMuscu.vue.fcMoy)} /> : null}
                {fcMuscu.vue.fcMax != null ? <Fait titre={t("seance.fc.fcMax")} valeur={String(fcMuscu.vue.fcMax)} /> : null}
                {fcMuscu.calories != null ? (
                  <Fait titre={t("effort.calories")} valeur={`${nombre(fcMuscu.calories, 0)} ${t("effort.kcal")}`} />
                ) : null}
              </>
            ) : vue.avecSeries ? (
              <Fait titre={t("seance.passee.series")} valeur={String(series.length)} />
            ) : null}
            {/* pas de la séance, jamais estimés (Santé Connect sur sa plage), avec leur source */}
            {sources?.pas ? (
              <Fait titre={t("seance.passee.pas")} valeur={nombre(sources.pas.pas, 0)} source={t("seance.sources.sante")} />
            ) : null}
          </RangeeChiffres>
          {fcMuscu ? (
            <>
              <BlocFcMuscu
                vue={fcMuscu.vue}
                source={fcMuscu.source}
                exercices={Object.fromEntries(seance.exercices.map((e) => [e.exercice.id, { nom: e.exercice.nom, slug: e.exercice.slug }]))}
                libelles={libellesSeries(seance, unites, couleurs)}
              />
            </>
          ) : null}
          {/* Bloc d'effort (planche Lieux) : celui d'un suivi de pepfit (tracé, FC, tours), de Whoop, ou de la FC d'une montre par Santé Connect (C7). */}
          {effort && cardioFondu ? (
            // la ligne qui dit comment avoir les pas ou la FC qui manquent reste : le bloc seul n'est plus là pour la porter
            <View style={styles.expire}>{ligneManque(sources?.manque ?? null, true, () => recharger().then(() => undefined))}</View>
          ) : null}
          {effort && !cardioFondu ? (
            <>
              <BlocEffort
                vue={effort.vue}
                variante="passee"
                exerciceId={effort.exerciceId}
                calories={effort.calories}
                source={effort.source}
                pied={ligneManque(sources?.manque ?? null, !!fcMuscu, () => recharger().then(() => undefined))}
                onCoupure={optimisee ? () => setAideBatterie(true) : undefined}
              />
              <TableauTours
                tours={effort.vue.tours}
                exerciceId={effort.exerciceId}
                etapes={estCourseGuidee(seance.seance)}
                onFusionner={(n) => fusionnerTourSeance(db, seance.seance.id, n).then(recharger).catch(signalerErreur())}
              />
              <ParKm km={effort.vue.km} exerciceId={effort.exerciceId} />
            </>
          ) : null}
          {note ? (
            <Texte variante="corps" couleur="t2" style={styles.note}>
              {note}
            </Texte>
          ) : null}
          {couverture !== "photo" ? <ZonePhoto seanceId={seance.seance.id} onChange={changePhoto} /> : null}
          {exercices.map(({ exo, affichage }) => (
            <ExerciceLu key={exo.cle} e={exo} affichage={affichage} />
          ))}
        </ScrollView>
        {annulerPhoto ? (
          <View pointerEvents="box-none" style={{ position: "absolute", top: hautEntete, left: espace.l, right: espace.l, zIndex: 30, elevation: 30 }}>
            <BandeauAnnuler texte={t("exercices.photo.supprimee")} onAnnuler={annulerPhoto.annuler} />
          </View>
        ) : null}
      </View>
      <Bref />

      <>
          <Feuille visible={menu} onFermer={() => setMenu(false)} titre={titre}>
            <Groupe>
              {/* Changer d'activité (planche activite-detectee) : le picto et les calculs suivent le sport. */}
              <Option
                premier
                icone="swap"
                libelle={t("activite.changerActivite")}
                aide={t("activite.changerSous")}
                onPress={() => {
                  setMenu(false);
                  setChanger(true);
                }}
              />
              <Option icone="routine" libelle={t("seance.passee.enRoutine")} onPress={() => enRoutine().catch(signalerErreur())} />
              {/* Le lieu d'une séance terminée se choisit ou se change ici (même feuille qu'en séance, « Ne pas définir le lieu » le retire). */}
              <Option
                icone={seance.salle ? pictoLieu(seance.salle.type) : "place"}
                libelle={t(seance.salle ? "seance.passee.changerLieu" : "seance.passee.definirLieu")}
                onPress={() => {
                  setMenu(false);
                  setLieu(true);
                }}
              />
              {/* Une séance de muscu ouvre la page de modification (ses lignes Début, Fin et Durée ouvrent les Horaires) ; un sport ou une sortie GPS, directement les Horaires. */}
              <Option
                icone="crayon"
                libelle={t("seance.passee.modifier")}
                aide={t("horaires.modifierAide")}
                onPress={() => {
                  setMenu(false);
                  if (estSerieUnique(seance.exercices.flatMap((e) => e.series))) setHoraires(true);
                  else router.push({ pathname: "/history/edit/[id]", params: { id: seance.seance.id } });
                }}
              />
              {/* Une sortie avec un tracé GPS peut devenir un circuit (planche Circuits) : sans le début ni la fin, et un seul circuit par sortie. */}
              {effort && effort.vue.trace.length >= 2 ? (
                circuitId ? (
                  <Option
                    icone="circuit"
                    libelle={t("circuit.menu.deja")}
                    aide={t("circuit.menu.dejaAide")}
                    onPress={() => {
                      setMenu(false);
                      router.push({ pathname: "/circuit/[id]", params: { id: circuitId } });
                    }}
                  />
                ) : (
                  <Option
                    icone="circuit"
                    libelle={t("circuit.menu.faire")}
                    aide={t("circuit.menu.faireAide")}
                    onPress={() => {
                      setMenu(false);
                      router.push({ pathname: "/circuit/nouveau", params: { sortie: seance.seance.id } });
                    }}
                  />
                )
              ) : null}
            </Groupe>
            <Groupe>
              <Option
                premier
                danger
                icone="trash"
                libelle={t("seance.passee.supprimer")}
                onPress={() => {
                  setMenu(false);
                  setConfirmer(true);
                }}
              />
            </Groupe>
          </Feuille>
          <FeuilleBatterie
            visible={aideBatterie}
            onFermer={() => {
              setAideBatterie(false);
              suivi.batterie().then((b) => setOptimisee(b?.optimisee ?? false)).catch(console.error);
            }}
          />
          <FeuilleChangerActivite seanceId={seance.seance.id} visible={changer} onFermer={() => setChanger(false)} onChange={changePhoto} />
          <FeuilleHorairesActivite
            visible={horaires}
            onFermer={() => setHoraires(false)}
            cible={{ genre: "seance", id: seance.seance.id }}
            titre={titre}
            onModifie={recharger}
          />
          <FeuilleSalle
            visible={lieu}
            onFermer={() => setLieu(false)}
            salleId={seance.salle?.id ?? null}
            onChoisir={(salleId) => {
              setLieu(false);
              modifierSeance(db, seance.seance.id, { salleId })
                .then(recharger)
                .catch(signalerErreur());
            }}
          />
          <Feuille visible={confirmer} onFermer={() => setConfirmer(false)} titre={t("seance.passee.supprimerQuestion")}>
            <Texte variante="corps" couleur="t2" style={{ textAlign: "center", marginBottom: espace.s }}>
              {t("seance.passee.effacement", { series: tp("communs.serie", series.length) })}
            </Texte>
            <Groupe>
              <Option
                premier
                danger
                icone="trash"
                libelle={t("seance.passee.confirmerSupprimer")}
                onPress={() => {
                  setConfirmer(false);
                  marquerSuppression(seance.seance.id, desintegration.apresRetour);
                  supprimerSeance(db, seance.seance.id)
                    .then(() => menagePhotos(db))
                    .then(() => router.back())
                    .catch(signalerErreur("supprimer"));
                }}
              />
              <Option libelle={t("seance.passee.garder")} onPress={() => setConfirmer(false)} />
            </Groupe>
          </Feuille>
      </>
    </SafeAreaView>
  );
}

/** « 1 · 80 kg × 8 » (W, F, D pour l'échauffement, l'échec, la dégressive), comme les séries lues plus bas. */
function libellesSeries(s: SeanceDetail, unites: Record<string, Unite>, couleurs: Jetons): Record<string, LibelleSerie> {
  const out: Record<string, LibelleSerie> = {};
  for (const e of s.exercices) {
    const champs = INFO_NATURE[e.exercice.nature].colonnes.map((c) => c.champ);
    let n = 0;
    for (const x of e.series.filter((y) => y.faite)) {
      const lettre = LETTRE[x.type];
      if (!lettre) n++;
      out[x.id] = { numero: lettre ?? String(n), couleur: couleurTypeSerie(x.type, couleurs) ?? undefined, texte: serieNatureTexte(champs, x, unites[e.exercice.id] ?? "kg") };
    }
  }
  return out;
}

/**
 * Séance Whoop sans ses pas ou sans sa courbe : une ligne et un geste pour les avoir (l'autorisation de Santé Connect, puis
 * relecture). La courbe déjà découpée par exercice ne manque pas.
 */
function ligneManque(manque: SourcesSeance["manque"], courbeMuscu: boolean, recharger: () => Promise<void>) {
  if (!manque) return null;
  const fc = manque.fc && !courbeMuscu;
  if (!manque.pas && !fc) return null;
  const quoi = t(manque.pas && fc ? "seance.sources.pasFc" : manque.pas ? "seance.sources.pas" : "seance.sources.fc");
  return (
    <LigneGeste
      texte={t("seance.sources.santeAutoriser", { quoi })}
      onPress={() => {
        sante.demanderPermissions(["pas", "fc-montre"]).then(() => recharger()).catch(signalerErreur());
      }}
    />
  );
}

/**
 * Picto de l'exercice seul en grand, sans photo de séance : le 512, jamais agrandi au-delà de sa taille native (512 px ≈ 195 dp
 * sur le Fold), centré sur une tuile s2 de 248 ; il ouvre la progression. Sous l'image du lieu, un peu d'air au-dessus.
 */
function Heros({ slug, nom, id, petit = false }: { slug: string | null; nom: string; id: string | null; petit?: boolean }) {
  const { couleurs } = useTheme();
  useLiens();
  const src = fichierPicto(slug, nom, 512);
  const cote = petit ? 72 : Math.min(248, Math.floor(512 / PixelRatio.get()));
  const contenu =
    src != null ? <Image source={src} style={{ width: cote, height: cote }} resizeMode="contain" /> : <Icone nom="dumbbell" couleur={couleurs.t3} taille={petit ? 28 : 96} />;
  const style = [petit ? styles.pastille : styles.heros, { backgroundColor: couleurs.s2 }];
  if (!id) return <View style={style}>{contenu}</View>;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={t("seance.passee.voirProgression", { nom })}
      onPress={() => router.push({ pathname: "/progress/[id]", params: { id } })}
      style={style}
    >
      {contenu}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heros: { marginHorizontal: espace.l, marginTop: espace.xs, height: 248, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  // Petit picto sous une image de tête : 64 de côté (zone de clic > 44) ; le picto, recadré de ses marges, garde ses muscles rouges lisibles.
  pastille: { width: 64, height: 64, borderRadius: rayon.m, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  tete: { paddingHorizontal: espace.l, paddingTop: espace.m },
  // Nom et date à gauche, l'effort à droite (S11) ; l'infobulle passe au-dessus de ce qui suit.
  teteLigne: { flexDirection: "row", alignItems: "flex-start", gap: espace.m, paddingRight: espace.s, zIndex: 8, elevation: 8 },
  // Sous le chiffre (64 de haut), sa pointe au-dessus de lui.
  bulleEffort: { position: "absolute", left: 0, right: 0 },
  parts: { marginHorizontal: espace.l, marginTop: espace.m },
  ligneTete: { marginTop: 6, fontSize: 13 },
  lieu: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, minHeight: 20 },
  note: { fontSize: 14, lineHeight: 20, paddingHorizontal: espace.l, paddingTop: espace.l },
  expire: { paddingHorizontal: espace.l },
  reconnu: { marginHorizontal: espace.l, marginTop: espace.l, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.m, paddingVertical: 10, paddingLeft: 14, paddingRight: espace.s },
  changer: { minHeight: 36, paddingHorizontal: espace.m, borderRadius: rayon.m, alignItems: "center", justifyContent: "center" },
  legende: { paddingHorizontal: espace.l, paddingTop: espace.xl, paddingBottom: espace.m },
});
