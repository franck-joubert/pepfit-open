import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, KeyboardAvoidingView, ScrollView, StyleSheet, useWindowDimensions, View, type ViewInstance } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { activiteAPreremplir, ajouterExerciceASeance, lireSeance, modifierSeance, reglerChrono, seanceEnCours, titreSeance, type SeanceDetail } from "../db";
import { BandeSeance } from "../ecrans/BandeSeance";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { duree } from "../theme/mouvement";
import { useApp } from "../ecrans/contexte";
import { unitesSeance } from "../ecrans/donnees";
import { useActionsSeance } from "../ecrans/actions-seance";
import { ordreExecution } from "../ecrans/ordre-seance";
import { ContexteReperes, VueSeance } from "../ecrans/seance-vue";
import { DUREE_REPRISE_MS, cibleReprise, positionReprise } from "../ecrans/reprise-seance";
import { reduitMouvement } from "../ui/reduit";
import { useVersionSynchro } from "../sync/rafraichir";
import { PleinEcran } from "../ecrans/PleinEcran";
import { nomMachine, type Unite } from "../ecrans/format";
import { FeuilleDuree } from "../ecrans/FeuilleDuree";
import { mettreEnPause, reprendre, type Chrono } from "../ecrans/duree-seance";
import { ChronoSeance } from "../ui/ChronoSeance";
import { ajusterRepos, ecouterTransition, lancerRepos, passerRepos, transitionEnCours } from "../ecrans/repos";
import { demanderExercices, sportSeanceLibre } from "../ecrans/selection";
import { BarreRepos } from "../ui/BarreRepos";
import { ClavierPerso, ClavierSeance, SousLeClavier, useClavierAffiche } from "../ui/ClavierSeance";
import { useClavierEcran } from "../ui/useClavierEcran";
import { useClavier } from "../ui/useClavier";
import { useReduit } from "../ui/reduit";
import { decalageSurClavier, positionRepos } from "../ecrans/repos-barre";
import { clavierSeance, mesureClavier } from "../ecrans/clavier-seance";
import { FeuilleSalle } from "../ecrans/FeuilleSalle";
import { pictoLieu } from "../ecrans/Lieux";
import { BarreHaut, BoutonIcone } from "../ui/Cadre";
import { FeuilleRepos } from "../ui/RoueDuree";
import { Icone } from "../ui/Icone";
import { BandeauRetrait } from "../ecrans/BandeauRetrait";
import { Texte } from "../ui/Texte";
import { useMinuteur } from "../ui/useMinuteur";
import { haptique } from "../ui/haptique";
import { BoutonPrincipal } from "../ui/Degrade";
import { Montee } from "../ui/Montee";
import { noterEtape } from "../ui/mesure-transition";
import { blocsCoquille } from "../ecrans/coquille-seance";
import { Appui, barre, courbes } from "../ui/mouvement";
import { minuteur } from "../natif/minuteur";
import { ecouterChronos, prochaineFinCible } from "../ecrans/chrono-serie";
import { t, tp } from "../i18n/index";
import { signalerErreur } from "../ui/FeuilleMessage";
import { ContexteDefilement, useDefilementGlisser } from "../ui/Glisser";

export default function EcranSeance() {
  const { db, reglages } = useApp();
  const { couleurs } = useTheme();
  const [seance, setSeance] = useState<SeanceDetail | null>();
  const [unites, setUnites] = useState<Record<string, Unite>>({});
  const [minuteurOuvert, setMinuteurOuvert] = useState(false);
  const [salleOuverte, setSalleOuverte] = useState(false);
  const [dureeOuverte, setDureeOuverte] = useState(false);
  // Plein écran (planche idee-plein-ecran, D7) : bascule par l'icône de la barre ; ouverture selon « Guidage ».
  const [plein, setPlein] = useState(reglages.ouvrirPleinEcran);
  // Repos d'une série en durée en plein écran : son décompte est dans le grand affichage (planche seance-duree).
  const [reposDansPlein, setReposDansPlein] = useState(false);
  const onReposAffiche = useCallback((oui: boolean) => setReposDansPlein(oui), []);
  // Fin du compte à rebours d'une série en durée : notification sur le canal de fin du repos (son selon le réglage, écran
  // verrouillé compris), reprogrammée à chaque lancement, pause, coche ou correction (D5).
  useEffect(() => {
    const maj = () => minuteur.alerteCible(prochaineFinCible());
    const fin = ecouterChronos(maj);
    return () => {
      fin();
      minuteur.alerteCible(null);
    };
  }, []);
  // Fold déplié (deux volets) : plein écran à gauche, liste à droite.
  const large = useWindowDimensions().width >= LARGEUR_VOLETS;
  // Ouverture : coquille (premiers blocs) pendant la montée, puis toute la liste, puis les ajouts reprennent leur animation.
  const [pose, setPose] = useState(0);
  const posee = useCallback(() => setPose(Date.now()), []);
  const [vivante, setVivante] = useState(false);
  useEffect(() => {
    if (!pose) return;
    noterEtape("full-list", pose);
    setVivante(true);
  }, [pose]);

  const recharger = useCallback(async () => {
    const en = await seanceEnCours(db);
    if (!en) {
      setSeance(null);
      return;
    }
    const s = await lireSeance(db, en.id);
    // Séance et unités posées ensemble : après une bascule kg / lbs, les charges ne s'affichent jamais dans l'ancienne unité.
    const u = s ? await unitesSeance(db, s, reglages.unite) : null;
    setSeance(s);
    if (u) setUnites(u);
  }, [db, reglages.unite]);

  useFocusEffect(
    useCallback(() => {
      recharger().catch((e) => console.error(e));
    }, [recharger]),
  );

  // L'IA (ou un autre appareil) a modifié la séance : relue aussitôt, sans quitter l'écran.
  const recue = useVersionSynchro();
  const recueVue = useRef(recue);
  useEffect(() => {
    if (recueVue.current === recue) return;
    recueVue.current = recue;
    recharger().catch((e) => console.error(e));
  }, [recue, recharger]);

  useEffect(() => {
    if (seance === null) router.dismissTo("/");
  }, [seance]);

  // Écran allumé : le réglage des séances, ou « Écran toujours allumé » coché au départ d'une course sur tapis (29/10).
  // demo=fc (pepfitopen://session?demo=fc) : FC de démonstration dans la bande du bas (émulateur, captures), jamais enregistrée ;
  // demo=coupure : la même, perdue de 20 à 50 s après l'ouverture (courbe des 5 dernières minutes, docs/FC-COURBE-DIRECT.md).
  // mesure=1 (pepfitopen://session?mesure=1) : chrono du clavier de séance dans logcat (docs/SEANCE-ORDRE.md).
  const parametres = useLocalSearchParams<{ allume?: string; demo?: string; mesure?: string; reprise?: string }>();
  useEffect(() => {
    if (parametres.mesure === "1") mesureClavier.actif = true;
  }, [parametres.mesure]);
  const allume = reglages.ecranAllume || parametres.allume === "1";
  useEffect(() => {
    if (!allume) return;
    activateKeepAwakeAsync("seance").catch((e) => console.warn(e));
    return () => {
      deactivateKeepAwake("seance").catch((e) => console.warn(e));
    };
  }, [allume]);

  // Glisser-déposer des exercices et des séries (comme l'éditeur de routine) : un seul défilement pour tous les gestes.
  const { defilement, scrollProps, zoneProps } = useDefilementGlisser();
  // Clavier de séance (planche clavier-seance) : la case en saisie défile au-dessus du clavier ; l'écran ne s'abonne pas au
  // clavier (audit M5), la barre de repos et la bande du bas le suivent seules (useClavierEcran).
  const { zoneVide } = useClavierEcran(defilement);

  const basEcran = useSafeAreaInsets().bottom;
  // « Annuler » (exercice modifié, série supprimée) au-dessus de la bande du bas, pour ne pas couvrir Pause (recette du 03/11).
  const [hauteurBande, setHauteurBande] = useState(0);
  const { actions, feuilles, vue, bandeau, enregistrerSaisie } = useActionsSeance(
    seance,
    unites,
    recharger,
    hauteurBande ? hauteurBande + espace.s : basEcran + espace.l,
  );

  const ordre = useMemo(() => (vue ? ordreExecution(vue) : []), [vue]);
  const active = ordre.find((x) => !x.faite) ?? null;
  const coquille = useMemo(() => {
    const base = vue ?? seance;
    if (!base || pose) return base;
    const n = blocsCoquille(base.blocs);
    return n < base.blocs.length ? { ...base, blocs: base.blocs.slice(0, n) } : base;
  }, [vue, seance, pose]);

  // Reprise (bulle, bandeau, relance de l'appli : ?reprise=1) : l'exercice à faire est amené au milieu de la liste, une seule
  // fois, une fois la liste entière posée ; jamais si l'utilisateur a déjà touché la liste, saisit ou glisse (docs/CODE-REPRISE-SEANCE.md).
  const reperes = useMemo(() => new Map<string, ViewInstance>(), []);
  const reprise = parametres.reprise === "1";
  const affichee = vue ?? seance;
  const listeRef = useRef(affichee);
  listeRef.current = affichee;
  const complet = !!seance && coquille === affichee;
  const touchee = useRef(false);
  const repriseFaite = useRef(false);
  useEffect(() => {
    if (!reprise || repriseFaite.current || !pose || !complet) return;
    let image = 0;
    const m = setTimeout(() => {
      repriseFaite.current = true;
      if (plein && !large) return;
      const l = listeRef.current;
      const liste = defilement.scrollRef.current;
      if (!l || !liste || touchee.current || defilement.occupee() || clavierSeance.estOuvert() || defilement.defil.y > 2) return;
      const cible = cibleReprise(l);
      const repere = cible?.genre === "exercice" ? reperes.get(cible.exerciceId) : undefined;
      liste.measureInWindow((_x, zoneHaut, _w, zoneH) => {
        const mesurer = (exercice: { haut: number; hauteur: number } | null) => {
          const y = positionReprise(cible, { exercice, zone: zoneH, contenu: defilement.defil.contenu, y: defilement.defil.y });
          if (y == null || touchee.current || defilement.occupee() || clavierSeance.estOuvert()) return;
          if (reduitMouvement()) return liste.scrollTo({ y, animated: false });
          const depart = defilement.defil.y;
          const debut = Date.now();
          const pas = () => {
            if (touchee.current || defilement.occupee() || clavierSeance.estOuvert()) return;
            const k = Math.min(1, (Date.now() - debut) / DUREE_REPRISE_MS);
            liste.scrollTo({ y: depart + (y - depart) * (1 - (1 - k) ** 3), animated: false });
            if (k < 1) image = requestAnimationFrame(pas);
          };
          image = requestAnimationFrame(pas);
        };
        if (!repere) return mesurer(null);
        repere.measureInWindow((_ex, ey, _ew, eh) => mesurer({ haut: ey - zoneHaut + defilement.defil.y, hauteur: eh }));
      });
    }, REPRISE_DELAI_MS);
    return () => {
      clearTimeout(m);
      cancelAnimationFrame(image);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reprise, pose, complet]);

  if (!seance || !coquille) return <Montee onPose={posee}>{null}</Montee>;

  const faites = ordre.filter((x) => x.faite);

  const ajouterExercice = () => {
    demanderExercices(
      seance.exercices.map((e) => e.exercice.id),
      (ids) => {
        (async () => {
          for (const id of ids) await ajouterExerciceASeance(db, seance.seance.id, id, { nbSeries: 3, reposS: reglages.reposDefautS });
          await recharger();
        })().catch(signalerErreur());
      },
    );
    // séance libre d'un sport : le choix s'ouvre filtré sur ses exercices
    const sport = seance.seance.routine_id ? null : sportSeanceLibre(seance.seance.id);
    router.push({ pathname: "/pick", params: { ...(seance.salle ? { salle: seance.salle.id } : {}), ...(sport ? { sport } : {}) } });
  };

  // Séance sans routine : « Séance libre » (lexique), dans la langue du moment (n° 34 de la revue finale).
  const nomDefaut = seance.routineNom ?? t("exercices.commencer.seanceLibre");
  const titre = titreSeance(seance.seance.titre) ?? nomDefaut;
  const chronoSeance: Chrono = { debut: seance.seance.debut, pauseDebut: seance.seance.pause_debut, pauseCumulS: seance.seance.pause_cumul_s };
  // Pause de la bande du bas (planche suivi-gps § 6) : le même état que la feuille Durée.
  const enPause = chronoSeance.pauseDebut !== null;
  const reglerPause = (c: Chrono) =>
    reglerChrono(db, seance.seance.id, { debut: c.debut, pauseDebut: c.pauseDebut, pauseCumulS: c.pauseCumulS })
      .then(recharger)
      .catch(signalerErreur());

  return (
    <Montee onPose={posee}>
    <ClavierPerso.Provider value>
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      {/* L'en-tête reste au-dessus de tout, au dessin comme au toucher (30/10 en séance : la liste passait
          par-dessus et « Terminer » ne répondait plus) : zIndex pour l'ordre des touchers, élévation pour Android. */}
      <View style={styles.entete}>
      <BarreHaut
        titre={titre}
        // En-tête de la planche idee-plein-ecran (28/10) : « 24:12 · 5/16 séries » ; le volume laisse la place à l'icône
        // du plein écran (il reste dans le bilan de fin de séance).
        sousTitre={
          <>
            <ChronoSeance c={chronoSeance} />
            {chronoSeance.pauseDebut !== null ? t("seance.seance.enPause") : ""}
            {`, ${t("seance.seance.bilan", { faites: faites.length, total: ordre.length })}`}
          </>
        }
        onPressTitre={() => setDureeOuverte(true)}
        libelleTitre={t("seance.seance.libelleTitre", { titre })}
        retour="down"
        onRetour={() => (router.canGoBack() ? router.back() : router.dismissTo("/"))}
      >
        <BoutonIcone nom={plein ? "list" : "plein"} libelle={t(plein ? "seance.plein.liste" : "seance.plein.ouvrir")} onPress={() => setPlein((p) => !p)} />
        <BoutonIcone nom="timer" libelle={t("seance.seance.lancerRepos")} onPress={() => setMinuteurOuvert(true)} />
        {/* Le geste principal de la séance : le dégradé de la partie (retour du 27/10). */}
        <BoutonPrincipal libelle={t("seance.seance.terminer")} onPress={() => enregistrerSaisie().catch((e) => console.error(e)).finally(() => router.push("/done"))} compact style={styles.terminer} />
      </BarreHaut>
      </View>
      {/* Bascule liste ⇄ plein écran : fondu enchaîné de 200 ms, sans glissement (ce n'est pas une navigation). */}
      {/* La liste ne déborde jamais de sa zone (rien ne se dessine sous l'en-tête). */}
      <View style={[styles.zone, large && plein && styles.volets]}>
        {plein ? (
          <Animated.View key="plein" entering={fondu.entree} exiting={fondu.sortie} style={large ? styles.voletGauche : StyleSheet.absoluteFill}>
            <PleinEcran seance={vue ?? seance} unites={unites} activeId={active?.id ?? null} actions={actions} large={large} onReposAffiche={onReposAffiche} />
          </Animated.View>
        ) : null}
        {!plein || large ? (
          <Animated.View
            key="liste"
            entering={fondu.entree}
            exiting={large ? undefined : fondu.sortie}
            style={large && plein ? [styles.voletDroit, { borderLeftColor: couleurs.line }] : StyleSheet.absoluteFill}
          >
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <ContexteDefilement.Provider value={defilement}>
            <ContexteReperes.Provider value={reperes}>
            <View style={{ flex: 1 }} {...zoneProps}>
            <ScrollView
              {...scrollProps}
              onTouchStart={() => (touchee.current = true)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.liste}
            >
              {/* Clavier de séance ouvert : un toucher sur une zone vide le ferme (la case s'enregistre). Les cases et les
                  boutons répondent avant ; un glissé reste au défilement. */}
              <View {...zoneVide}>
                <VueSeance seance={coquille} unites={unites} activeId={active?.id ?? null} actions={actions} nouveaux={vivante} />
                {coquille === (vue ?? seance) ? (
                  <>
                    <Appui
                      accessibilityRole="button"
                      onPress={ajouterExercice}
                      style={({ pressed }) => [styles.ajouterExercice, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }]}
                    >
                      <Texte variante="exercice" style={{ fontSize: 14 }}>
                        {t("seance.seance.ajouterExercice")}
                      </Texte>
                    </Appui>
                    {/* La salle quitte l'en-tête (planche : nom, durée, séries, volume) ; elle se choisit ici, au pied de la liste. */}
                    <Appui
                      accessibilityRole="button"
                      accessibilityLabel={t("seance.seance.libelleSalle", { salle: seance.salle?.nom ?? t("seance.seance.salleAucune") })}
                      onPress={() => setSalleOuverte(true)}
                      style={({ pressed }) => [styles.salle, pressed && { backgroundColor: couleurs.s1 }]}
                    >
                      <Icone nom={seance.salle ? pictoLieu(seance.salle.type) : "place"} couleur={couleurs.t2} taille={18} />
                      <Texte variante="libelle" couleur="t2">
                        {seance.salle?.nom ?? t("seance.seance.salle")}
                      </Texte>
                    </Appui>
                  </>
                ) : null}
              </View>
            </ScrollView>
            </View>
            </ContexteReperes.Provider>
            </ContexteDefilement.Provider>
          </KeyboardAvoidingView>
          </Animated.View>
        ) : null}
        {/* En pause : la liste est voilée (45 %), un signe seulement : les touchers passent au travers (30/10 : défiler,
            cocher, modifier, ajouter, Terminer restent possibles). Même un voile resté pendant sa sortie ne bloque rien. */}
        {enPause ? (
          <Animated.View entering={fondu.entree} exiting={fondu.sortie} style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[StyleSheet.absoluteFill, { backgroundColor: couleurs.bg, opacity: 0.45 }]} />
          </Animated.View>
        ) : null}
      </View>
      <Repos sansChiffre={plein && reposDansPlein} />
      <ClavierSeance />
      <SousLeClavier>
        <View onLayout={(e) => setHauteurBande(Math.round(e.nativeEvent.layout.height))}>
          <BandeSeance
            seance={seance}
            demo={parametres.demo === "fc" || parametres.demo === "coupure"}
            demoCoupure={parametres.demo === "coupure"}
            onPause={() => reglerPause(mettreEnPause(chronoSeance, Date.now()))}
            onReprendre={() => reglerPause(reprendre(chronoSeance, Date.now()))}
          />
        </View>
      </SousLeClavier>
      {feuilles}
      <BandeauRetrait onAnnule={() => recharger().catch((e) => console.error(e))} />
      {bandeau}
      <FeuilleSalle
        visible={salleOuverte}
        surPlace
        onFermer={() => setSalleOuverte(false)}
        salleId={seance.salle?.id ?? null}
        aide={(sa) => {
          const n = seance.exercices.filter((e) => e.exercice.equipement !== "poids_du_corps" && !sa.equipements.includes(e.exercice.equipement)).length;
          return n === 0 ? t("seance.seance.tousFaisables") : tp("seance.seance.sansEquipement", n);
        }}
        onChoisir={(id) => {
          setSalleOuverte(false);
          // D6 : une séance vide choisie à un lieu d'une seule activité habituelle reçoit cette activité.
          (async () => {
            await modifierSeance(db, seance.seance.id, { salleId: id });
            const a = await activiteAPreremplir(db, seance.seance.id, id);
            if (a) await ajouterExerciceASeance(db, seance.seance.id, a, { nbSeries: 1, reposS: reglages.reposDefautS });
            await recharger();
          })().catch(signalerErreur());
        }}
      />
      <FeuilleDuree
        visible={dureeOuverte}
        chrono={chronoSeance}
        titre={titreSeance(seance.seance.titre)}
        routineNom={nomDefaut}
        onChrono={(c) => {
          reglerChrono(db, seance.seance.id, { debut: c.debut, pauseDebut: c.pauseDebut, pauseCumulS: c.pauseCumulS })
            .then(recharger)
            .catch(signalerErreur());
        }}
        onTitre={(titreSaisi) => {
          modifierSeance(db, seance.seance.id, { titre: titreSaisi })
            .then(recharger)
            .catch(signalerErreur());
        }}
        onFermer={() => setDureeOuverte(false)}
      />
      <FeuilleRepos
        visible={minuteurOuvert}
        onFermer={() => setMinuteurOuvert(false)}
        titre={t("seance.seance.lancerRepos")}
        valeur={reglages.reposDefautS}
        onValider={(d) => {
          setMinuteurOuvert(false);
          lancerRepos(db, d).catch(signalerErreur());
        }}
      />
    </SafeAreaView>
    </ClavierPerso.Provider>
    </Montee>
  );
}

/**
 * Barre de repos : le décompte se redessine seul, sans la liste des séries. Elle monte du bas et y redescend. Posée sur le
 * pavé de pepfit, ou, quand c'est le clavier du téléphone qui est ouvert (note, titre, champ d'un exercice), sur ce clavier :
 * la liste, qui se resserre déjà au-dessus de lui, perd la hauteur de la barre (son décalage est de la mise en page, pas un
 * abonnement de l'écran). Le décalage se joue comme le clavier de séance : la barre glisse de son ancienne place à la nouvelle.
 */
function Repos({ sansChiffre = false }: { sansChiffre?: boolean }) {
  const { db } = useApp();
  const reduit = useReduit();
  // Hauteur du clavier du téléphone (0 fermé), depuis le bas de l'écran ; le pavé de pepfit n'en fait pas partie.
  const clavierSysteme = useClavier();
  const position = positionRepos({ clavierSeance: useClavierAffiche(), clavierSysteme: clavierSysteme > 0 });
  const repos = useMinuteur();
  const [transition, setTransition] = useState(transitionEnCours);
  useEffect(() => ecouterTransition(setTransition), []);
  // Fin naturelle (1 → 0, pas « Passer ») : retour tactile si l'alerte vibre et qu'aucune notification ne s'en charge.
  const dernier = useRef(repos.restantS);
  useEffect(() => {
    if (!repos.actif && dernier.current === 1 && minuteur.vibrerEnApp()) haptique.succes();
    dernier.current = repos.restantS;
  }, [repos.actif, repos.restantS]);
  // Décalage sur le clavier du téléphone : bord bas de la zone (mesuré, décalage compris) moins le haut du clavier.
  const zone = useRef<ViewInstance>(null);
  const [decalage, setDecalage] = useState(0);
  const decalageActuel = useRef(0);
  const glisse = useSharedValue(0);
  const poser = (d: number) => {
    if (d === decalageActuel.current) return;
    // La barre garde sa place le temps d'un rendu, puis glisse vers la nouvelle.
    glisse.value = d - decalageActuel.current;
    glisse.value = withTiming(0, reduit ? { duration: 0 } : d > decalageActuel.current ? { duration: duree.entree, easing: courbes.feuille } : { duration: duree.sortie, easing: courbes.sortie });
    decalageActuel.current = d;
    setDecalage(d);
  };
  const actif = repos.actif;
  useEffect(() => {
    if (!actif || position !== "clavierSysteme") return poser(0);
    zone.current?.measureInWindow((_x, y, _l, h) => poser(decalageSurClavier(y + h + decalageActuel.current, Dimensions.get("screen").height - clavierSysteme, clavierSysteme)));
    // poser ne dépend que de refs et de valeurs partagées
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, position, clavierSysteme]);
  const glissement = useAnimatedStyle(() => ({ transform: [{ translateY: glisse.value }] }));
  return (
    <View ref={zone} style={actif && decalage ? { marginBottom: decalage } : null}>
      {actif ? (
        <Animated.View entering={barre.entree} exiting={barre.sortie}>
          <Animated.View style={glissement}>
            <BarreRepos
              restantS={repos.restantS}
              totalS={repos.totalS}
              onAjuster={(d) => ajusterRepos(db, d)}
              onPasser={() => passerRepos(db)}
              pas={transition ? 5 : 15}
              sousTitre={transition ? t("seance.repos.machineSuivante", { nom: nomMachine(transition.suivant) }) : null}
              sansChiffre={sansChiffre}
              surBande={position === "bande"}
              surClavier={position !== "bande"}
            />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Après la pose de l'écran, le temps que toute la liste soit mise en page avant de la mesurer (ms). */
const REPRISE_DELAI_MS = 150;

/** Au-delà de cette largeur (dp), l'écran a deux volets : le Fold déplié (816 dp, volets de 408). */
const LARGEUR_VOLETS = 600;

const fondu = {
  entree: FadeIn.duration(duree.entree).easing(courbes.sortie),
  sortie: FadeOut.duration(duree.sortie).easing(courbes.sortie),
};

const styles = StyleSheet.create({
  // Fold déplié : rien d'interactif sur la charnière (12 dp de chaque côté).
  volets: { flexDirection: "row" },
  voletGauche: { flex: 1, paddingRight: 12 },
  voletDroit: { flex: 1, paddingLeft: 12, borderLeftWidth: StyleSheet.hairlineWidth },
  entete: { zIndex: 2, elevation: 2 },
  zone: { flex: 1, overflow: "hidden" },
  terminer: { marginLeft: espace.xs },
  liste: { paddingHorizontal: espace.l, paddingBottom: 120 },
  salle: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s, borderRadius: rayon.l, marginTop: espace.s },
  ajouterExercice: { height: 48, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", marginTop: espace.xl },
});
