import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackHandler, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { ecrireSuiviLance, listerSalles, lireAnnonces, lireEcranAllume, lireSuiviLance, lireVmaCourante, lireZonesFc, type SuiviLance } from "../db";
import { terminerSuivi } from "./suivi-enregistrer";
import { nomCapteur } from "./fc-muscu-vue";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { suivi, type EchantillonFc, type EtatSuivi, type Point } from "../natif/suivi";
import { annoncer, taire } from "../natif/voix";
import { etatSurCircuit, type EtatCircuit } from "../circuits/suivre";
import { morceauxCircuit, vueDuCircuit, type VueCircuit } from "../circuits/vue";
import { denivele, lisserAltitude, vitesseKmH, type Tour } from "../natif/suivi/logique";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import type { Jetons } from "../theme/jetons";
import { LARGEUR_CONTENU } from "../ui/largeur";
import { haptique } from "../ui/haptique";
import { signalerErreur } from "../ui/FeuilleMessage";
import { Icone, type NomIcone } from "../ui/Icone";
import { Appui, courbes } from "../ui/mouvement";
import { duree } from "../theme/mouvement";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { ecranDirect } from "./guide-fond";
import { altitudeEnUnite, libelleAllure, libelleAltitude, libelleDistance, libelleVitesse } from "./unites";
import {
  alerteGps, allureDuMoment, allureTexte, altitudesRecalees, chronoTexte, distanceTexte, garder, indicesTours, mesureDe,
  morceauxParZone, positionRepere, precisionTexte, projeter, RETOUR_TOUR_MS, tourEnCours, vitesseDuMoment,
  vitesseTexte, zoneDe, zonesDesPoints, type Echantillon, type Pt,
} from "./suivi-direct-vue";
import { CarteDirect } from "./CarteDirect";
import { PhraseCircuit } from "./circuit/PhraseCircuit";
import { titreCourt } from "./SuiviDepart";
import { ALLURE_ESTIMEE_S_KM, annonceEtape, avancer, cibleEtape, dureePrevueS, etatDesTours, fini, nomEtape, resteEtape, verdictZone, type Etape } from "./etapes-course";
import { etapesDuSuivi } from "./etapes-suivi";
import { ConsignesTest, MesuresTest, TestArrete } from "./GuidageTest";
import { approx, heure } from "./format";
import { AnnonceEtape, BandeEtapes, ChiffresGuides, Ensuite, FcEtape, FeuilleEtapes, JaugeEtape, ResteEtape, type EtapeFaite } from "./GuidageDirect";
import { bornesDe, type RefZones } from "./zones-fc";
import { sourceZones } from "./zones-texte";
import { avecPas, familleDuSuivi } from "./familles-sports";
import { effortEnDirect, fcDeLaSeance } from "./direct-familles";
import { BoiteDirect, CourbeFcDirect, RecupDirect, SceneSport, SeanceDirect } from "./DirectFamilles";
import { sante } from "../natif/sante";

// Course en direct (planche suivi-gps, écran 2, v2 validée) : chrono, distance, allure (vitesse à vélo), FC et zone si un capteur
// est connecté, mini-tracé coloré par zone avec le dénivelé et les repères des tours. En bas : cadenas, Tour, Pause (seul plein).
// Verrouillé : plus aucun toucher sauf Tour (D13) et un appui maintenu 1 s sur Maintenir. En pause : chrono grisé, Terminer et
// Reprendre ; Terminer n'existe qu'en pause (D5). GPS perdu : vibration, « GPS perdu », distance en « ~ », allure en « — », puis
// « GPS retrouvé » qui s'efface. À la fin, la séance est enregistrée et le résumé de fin s'ouvre (SuiviFin, lot 3).
// Carte (planche seance-duree, D2) : MapLibre et OpenFreeMap à la place du mini-tracé, la vue suit la position ; avant le
// premier fix, « Recherche du GPS… » ; sans réseau au départ, le mini-tracé revient.
// Tapis, intérieur (mode « fc », retour du 29/10) : le même écran sans GPS : ni carte, ni distance, ni allure ; la
// durée, les tours et la FC restent ; en course guidée, une étape à la distance passe par « Étape ».
// Réduire (retour du 29/10) : le chevron du haut, ou le retour d'Android quand l'écran n'est pas verrouillé, ramène
// à l'appli ; la bulle « séance en cours » montre le chrono et la distance et rouvre cet écran. Le suivi, la FC et les
// annonces continuent (étapes : GuideFond, tant que cet écran est fermé).
// Course guidée (même planche, § 3, D4, D8) : la séance d'un programme enchaîne ses étapes ; chaque changement pose un tour
// (l'étape en cours se relit sur les tours, même après la mort de l'appli), vibre deux fois et s'annonce à voix haute.
// « Étape » remplace Tour. Les étapes finies, l'écran redevient celui du suivi libre.
// Circuit suivi (planche Circuits, lot F, écrans s2 et s3) : choisi au départ (SuiviLance.circuit, gardé avec le suivi : rien à relire, rien
// à demander au réseau), il se dessine sur la carte sous la trace faite (CarteDirect) ou sur le mini-tracé sans fond de carte (« Fond de
// carte indisponible »), et une phrase en dit l'état : « Sur le circuit, il reste 7,6 km » à moins de 40 m du tracé, « À 180 m du circuit,
// reviens vers le tracé » au-delà (PhraseCircuit). Aucun signal sonore, aucune vibration, pas de navigation guidée ; elle prend la place du
// dénivelé en haut de la carte. Le chrono, les capteurs et la ligne de FC ne dépendent pas du circuit.
// Familles de sports (planche familles-sports, D3 du 30/10) : le même écran pour les familles 2 à 5. Sans GPS, la carte devient
// la courbe de FC (ou la scène du sport sans capteur) ; sports et cours : chrono à largeur fixe, FC, temps par zone, pas, effort,
// sans Tour ; récupération : la boîte porte le chrono ou le compte à rebours de la durée visée (D11), ni FC ni effort.

const RELEVE_MS = 2000;
/** Annonce et bilan de l'étape finie : quelques secondes. */
const ANNONCE_MS = 6000;
const DEVERROUILLAGE_MS = 1000;
const MAX_POINTS_TRACE = 1500;
/** En dessous (344 dp), le chrono et les deux grands chiffres rapetissent : 72 et 42 dp au lieu de 84 et 52 (planche Circuits, s3). */
const LARGEUR_ETROITE = 360;

/** Réduit l'écran en direct : retour à l'écran d'avant (l'appli, avec la bulle), sinon l'Accueil. */
const reduire = () => (router.canGoBack() ? router.back() : router.dismissTo("/"));

/** FC de démonstration (pepfitopen://suivi/direct?demo=fc) : pour voir FC, zones et tracé coloré sans capteur (émulateur,
 *  captures de recette). Affichage seul : jamais enregistrée. */
const fcDemo = (s: number) => Math.round(148 + 16 * Math.sin(s / 45_000));

export function SuiviDirect() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const insets = useSafeAreaInsets();
  const [lance, setLance] = useState<SuiviLance | null>(null);
  const [lieu, setLieu] = useState<string | null>(null);
  // Zones de FC personnelles (planche vma-vo2max) ; 190 et ses tranches le temps de la lecture.
  const [fcMax, setFcMax] = useState<RefZones>(190);
  const [etatNatif, setEtat] = useState<EtatSuivi | null>(null);
  const parametres = useLocalSearchParams<{ demo?: string }>();
  const demo = parametres.demo === "fc";
  // Circuit suivi : le tracé décodé une fois, la position projetée à chaque relevé du GPS.
  const circuitLance = lance?.circuit ?? null;
  const vueCircuit = useMemo<VueCircuit | null>(() => (circuitLance ? vueDuCircuit(circuitLance) : null), [circuitLance]);
  const etat = useMemo(() => {
    if (!etatNatif) return etatNatif;
    return demo ? { ...etatNatif, fc: { ...etatNatif.fc, etat: "connecte" as const, bpm: fcDemo(etatNatif.tempsMs) } } : etatNatif;
  }, [demo, etatNatif]);
  const [verrou, setVerrou] = useState(false);
  const [retour, setRetour] = useState<{ tour: Tour; jusqua: number } | null>(null);
  const [retrouveA, setRetrouveA] = useState<number | null>(null);
  const [fin, setFin] = useState(false);
  const [releve, setReleve] = useState(0);
  const [maintenant, setMaintenant] = useState(Date.now());
  const points = useRef<Point[]>([]);
  const frequences = useRef<EchantillonFc[]>([]);
  const historique = useRef<Echantillon[]>([]);
  const fcVue = useRef(false);
  const gpsAvant = useRef<EtatSuivi["gps"]["etat"] | null>(null);
  const [carteKo, setCarteKo] = useState(false);
  const [etapes, setEtapes] = useState<Etape[] | null>(null);
  const [voix, setVoix] = useState(true);
  const [annonce, setAnnonce] = useState<{ texte: string; bilan: { fort: string; suite: string } | null; jusqua: number } | null>(null);
  const [feuille, setFeuille] = useState(false);
  const [vmaConnue, setVmaConnue] = useState<{ vma: number; estimee: boolean } | null>(null);
  const changeEnCours = useRef(false);
  // Sports et cours : les pas de la séance (Santé Connect, relus toutes les 30 s) ; null sans donnée.
  const [pas, setPas] = useState<number | null>(null);
  // Récupération : la vibration de la durée visée atteinte n'est jouée qu'une fois.
  const viseeVibree = useRef(false);

  useEffect(() => {
    lireSuiviLance(db)
      .then(async (l) => {
        setLance(l);
        if (l?.salleId) setLieu((await listerSalles(db)).find((s) => s.id === l.salleId)?.nom ?? null);
        // Course guidée : les étapes de la routine du programme (avec les tests VMA relancés, D3).
        const e = await etapesDuSuivi(db, l);
        if (e) setEtapes(e);
        // Test VMA : l'allure à viser vient de la VMA connue (test, sinon estimée des courses).
        if (e?.some((x) => x.genre === "test")) setVmaConnue(await lireVmaCourante(db));
      })
      .catch(console.error);
    lireZonesFc(db).then(setFcMax).catch(console.error);
    lireAnnonces(db).then(setVoix).catch(console.error);
    return taire;
  }, [db]);

  // État du suivi natif (environ 1 Hz) ; sans suivi en cours, l'écran n'a rien à montrer.
  useEffect(() => {
    let vu = false;
    suivi
      .etat()
      .then((e) => {
        if (vu) return;
        if (!e || e.statut === "arrete") router.replace("/train");
        else setEtat(e);
      })
      .catch(console.error);
    const fin = suivi.ecouter((e) => {
      vu = true;
      setEtat(e);
    });
    return fin;
  }, []);

  // Allure du moment, GPS perdu et retrouvé, FC déjà vue.
  useEffect(() => {
    if (!etat) return;
    historique.current = garder(historique.current, { s: etat.tempsMs, d: etat.distanceM });
    if (etat.fc.etat === "connecte" && etat.fc.bpm != null) fcVue.current = true;
    const g = etat.gps.etat;
    if (g === "perdu" && gpsAvant.current !== "perdu") haptique.alerte();
    if (g === "ok" && gpsAvant.current === "perdu") setRetrouveA(Date.now());
    gpsAvant.current = g;
    setMaintenant(Date.now());
  }, [etat]);

  // Tracé et FC : relevés depuis le tampon du natif, par morceaux.
  const id = etat?.id ?? null;
  useEffect(() => {
    if (!id) return;
    let actif = true;
    const relever = async () => {
      const p = await suivi.points(id, points.current.length);
      const f = await suivi.frequences(id, frequences.current.length);
      if (!actif || (!p.length && !f.length)) return;
      points.current = points.current.concat(p);
      frequences.current = frequences.current.concat(f);
      setReleve((n) => n + 1);
    };
    relever().catch(console.error);
    const h = setInterval(() => relever().catch(console.error), RELEVE_MS);
    return () => {
      actif = false;
      clearInterval(h);
    };
  }, [id]);

  // Écran toujours allumé (D10), réglé au départ.
  useEffect(() => {
    let allume = false;
    lireEcranAllume(db)
      .then((v) => {
        allume = v;
        if (v) activateKeepAwakeAsync("suivi").catch(console.error);
      })
      .catch(console.error);
    return () => {
      if (allume) deactivateKeepAwake("suivi").catch(console.error);
    };
  }, [db]);

  // Cet écran avance lui-même les étapes ; fermé, GuideFond prend le relais.
  useEffect(() => {
    ecranDirect.ouvert = true;
    return () => {
      ecranDirect.ouvert = false;
    };
  }, []);

  // Retour d'Android : réduit l'écran (la bulle le rouvre) ; verrouillé, il ne fait rien.
  const verrouRef = useRef(verrou);
  verrouRef.current = verrou;
  useEffect(() => {
    const s = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!verrouRef.current) reduire();
      return true;
    });
    return () => s.remove();
  }, []);

  // Le retour du tour s'efface après 3 s, « GPS retrouvé » après le sien.
  useEffect(() => {
    if (!retour) return;
    const h = setTimeout(() => setRetour(null), Math.max(0, retour.jusqua - Date.now()));
    return () => clearTimeout(h);
  }, [retour]);
  useEffect(() => {
    if (retrouveA == null) return;
    const h = setTimeout(() => setMaintenant(Date.now()), 4100);
    return () => clearTimeout(h);
  }, [retrouveA]);

  const toucherTour = useCallback(async () => {
    const avant = etat;
    const b = await suivi.tour();
    if (!b || !avant) return;
    const prec = avant.tours.at(-1) ?? { s: 0, d: 0 };
    const dureeS = (b.s - prec.s) / 1000;
    const distanceM = b.d - prec.d;
    const tour: Tour = {
      n: b.n, debutS: prec.s / 1000, finS: b.s / 1000, dureeS, distanceM, enCours: false,
      allure: distanceM >= 10 && dureeS > 0 ? (dureeS * 1000) / distanceM : null,
    };
    setRetour({ tour, jusqua: Date.now() + RETOUR_TOUR_MS });
    setEtat((e) => (e && !e.tours.some((x) => x.n === b.n) ? { ...e, tours: [...e.tours, b] } : e));
  }, [etat]);

  /**
   * Changement d'étape (cible atteinte ou « Étape ») : un tour en marque la borne, deux vibrations et l'annonce de la
   * suivante, le bilan de l'étape finie quelques secondes.
   */
  const changerEtape = useCallback(async () => {
    if (!etapes || !etat || changeEnCours.current) return;
    changeEnCours.current = true;
    try {
      const g = etatDesTours(etat.tours);
      const b = await suivi.tour();
      if (!b) return;
      const prec = etat.tours.at(-1) ?? { s: 0, d: 0 };
      const texte = annonceEtape(etapes[g.i + 1]);
      annoncer(texte, voix);
      const finie = etapes[g.i];
      const bpms = frequences.current.filter((f) => f.s >= prec.s && f.s <= b.s).map((f) => f.bpm);
      const bpmMoy = bpms.length ? Math.round(bpms.reduce((a, x) => a + x, 0) / bpms.length) : null;
      setAnnonce({ texte, bilan: finie ? bilanEtape(finie, (b.s - prec.s) / 1000, b.d - prec.d, bpmMoy) : null, jusqua: Date.now() + ANNONCE_MS });
      setEtat((e) => (e && !e.tours.some((x) => x.n === b.n) ? { ...e, tours: [...e.tours, b] } : e));
    } finally {
      changeEnCours.current = false;
    }
  }, [etapes, etat, voix]);

  // L'étape avance seule à sa cible (distance ou temps), à chaque instantané du natif (aussi écran éteint).
  useEffect(() => {
    if (!etapes || !etat || etat.statut !== "en_cours" || changeEnCours.current) return;
    const g = etatDesTours(etat.tours);
    if (!fini(etapes, g) && avancer(etapes, g, etat.distanceM, etat.tempsMs / 1000).change) changerEtape().catch(console.error);
  }, [etat, etapes, changerEtape]);

  useEffect(() => {
    if (!annonce) return;
    const h = setTimeout(() => setAnnonce(null), Math.max(0, annonce.jusqua - Date.now()));
    return () => clearTimeout(h);
  }, [annonce]);

  /**
   * Reprendre (D3, planche vma-vo2max) : en pause pendant un test VMA, le test est arrêté ; on le clôt (un tour), puis une
   * récupération de 3 min et les 6 min de nouveau. Les relances sont gardées avec le suivi lancé.
   */
  const reprendre = useCallback(async () => {
    const e = await suivi.reprendre();
    setEtat(e);
    if (!etapes || !lance || changeEnCours.current) return;
    const g = etatDesTours(e.tours);
    if (etapes[g.i]?.genre !== "test") return;
    changeEnCours.current = true;
    try {
      const l = { ...lance, relancesTest: [...(lance.relancesTest ?? []), g.i] };
      await ecrireSuiviLance(db, l);
      setLance(l);
      const nouvelles = await etapesDuSuivi(db, l);
      if (nouvelles) setEtapes(nouvelles);
      ecranDirect.version++;
      const b = await suivi.tour();
      if (!b) return;
      const texte = annonceEtape(nouvelles?.[g.i + 1]);
      annoncer(texte, voix);
      setAnnonce({ texte, bilan: null, jusqua: Date.now() + ANNONCE_MS });
      setEtat((x) => (x && !x.tours.some((y) => y.n === b.n) ? { ...x, tours: [...x.tours, b] } : x));
    } finally {
      changeEnCours.current = false;
    }
  }, [db, etapes, lance, voix]);

  const terminer = useCallback(async () => {
    if (fin) return;
    setFin(true);
    try {
      // Le service passe en pause : le résumé peut « Reprendre » ce suivi ; il ne s'arrête qu'à Enregistrer.
      const seanceId = await terminerSuivi(db, lance, { reprenable: true });
      router.replace({ pathname: "/suivi/fin", params: { id: seanceId } });
    } catch (err) {
      signalerErreur()(err);
      setFin(false);
    }
  }, [db, fin, lance]);

  const vue = useMemo(() => {
    const p = points.current;
    const pas = Math.max(1, Math.ceil(p.length / MAX_POINTS_TRACE));
    const garde = p.filter((_, i) => i % pas === 0 || i === p.length - 1);
    const zones = zonesDesPoints(garde, demo ? garde.map((x) => ({ s: x.s, bpm: fcDemo(x.s) })) : frequences.current, fcMax);
    const alt = lisserAltitude(altitudesRecalees(p), p.some((x) => x.altBaro != null));
    return { garde, zones, deniv: p.length ? Math.round(denivele(alt).plus) : 0 };
    // `releve` change à chaque morceau du tampon
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releve, fcMax, demo]);

  // `avantCircuit` : la progression du relevé précédent, pour qu'une boucle (départ et arrivée au même point) ou un aller-retour ne fasse
  // pas sauter la position d'un bout à l'autre du tracé.
  const etroit = useWindowDimensions().width < LARGEUR_ETROITE;
  const avantCircuit = useRef(0);
  const gpsOk = etat?.gps.etat === "ok";
  const latGps = gpsOk ? (etat?.gps.lat ?? null) : null;
  const lonGps = gpsOk ? (etat?.gps.lon ?? null) : null;
  const etatCircuit = useMemo<EtatCircuit | null>(
    () => (vueCircuit && latGps != null && lonGps != null ? etatSurCircuit(vueCircuit, { lat: latGps, lon: lonGps }, avantCircuit.current) : null),
    [vueCircuit, latGps, lonGps],
  );
  useEffect(() => {
    if (etatCircuit?.surCircuit) avantCircuit.current = etatCircuit.progresM;
  }, [etatCircuit]);

  const sportId = lance?.exerciceId ?? "";
  const famille = familleDuSuivi(sportId, etat?.mode === "fc");
  const debutSuivi = etat?.debut ?? null;
  useEffect(() => {
    if (famille !== "seance" || !avecPas(sportId) || debutSuivi == null) return;
    let actif = true;
    const lire = () =>
      sante
        .pasEntre(debutSuivi, Date.now())
        .then((n) => actif && setPas(n))
        // Santé Connect refusé ou absent : les pas restent « sans donnée » (—).
        .catch(() => actif && setPas(null));
    lire();
    const h = setInterval(lire, 30_000);
    return () => {
      actif = false;
      clearInterval(h);
    };
  }, [famille, sportId, debutSuivi]);
  const viseeS = lance?.dureeViseeS ?? null;
  const tempsMs = etat?.tempsMs ?? 0;
  useEffect(() => {
    if (famille !== "recup" || !viseeS || viseeVibree.current || tempsMs < viseeS * 1000) return;
    viseeVibree.current = true;
    haptique.alerte();
  }, [famille, viseeS, tempsMs]);

  if (!etat) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;

  const mesure = mesureDe(lance?.exerciceId ?? "");
  const sansGps = etat.mode === "fc";
  const pause = etat.statut === "pause";
  const perdu = etat.gps.etat === "perdu";
  const alerte = alerteGps(etat.gps.etat, retrouveA, maintenant);
  const tour = tourEnCours(etat);
  const bpm = etat.fc.etat === "connecte" ? etat.fc.bpm : null;
  const zone = bpm != null ? zoneDe(bpm, fcMax) : 0;
  const bornes = bornesDe(fcMax);
  // Le nom du départ et de la fin (« Course à pied », le nom de la routine), pas le titre court de la notification.
  const titre = lance?.titre ?? "";
  const unite = mesure === "vitesse" ? libelleVitesse() : libelleAllure();
  const valeurMoment = perdu
    ? "—"
    : mesure === "vitesse"
      ? vitesseTexte(vitesseDuMoment(historique.current))
      : allureTexte(allureDuMoment(historique.current));
  const valeurTour = (x: Tour) =>
    mesure === "vitesse" ? vitesseTexte(x.dureeS > 0 ? vitesseKmH(x.distanceM, x.dureeS) : null) : allureTexte(x.allure);
  const bas = Math.max(insets.bottom, espace.m) + espace.l;
  const g = etapes ? etatDesTours(etat.tours) : null;
  const guide = etapes && g && !fini(etapes, g) ? { le: etapes, g } : null;
  const position = etat.gps.etat === "ok" && etat.gps.lat != null && etat.gps.lon != null ? { lat: etat.gps.lat, lon: etat.gps.lon } : null;
  const phrase = etatCircuit ? <PhraseCircuit etat={etatCircuit} /> : null;
  const fond = carteKo ? (
    <>
      <Trace points={vue.garde} zones={vue.zones} tours={etat.tours} retour={retour != null} circuit={vueCircuit} etatCircuit={etatCircuit} />
      {phrase}
    </>
  ) : (
    <CarteDirect points={vue.garde} zones={vue.zones} position={position} circuit={vueCircuit} etatCircuit={etatCircuit} haut={phrase} onEchec={() => setCarteKo(true)} />
  );
  // Course guidée : « Étape » à la place de Tour (aussi écran verrouillé) ; ni l'un ni l'autre en sports et cours, en récupération.
  const tourOuEtape = (cle: string) =>
    famille === "seance" || famille === "recup" ? null : guide ? (
      <Commande key={`${cle}-etape`} icone="suiv" libelle={t("gps.guide.etape")} libelleLu={t("gps.guide.etapeLu")} onPress={() => changerEtape().catch(signalerErreur())} />
    ) : (
      <Commande key={`${cle}-tour`} icone="tour" libelle={t("gps.tour")} onPress={() => toucherTour().catch(signalerErreur())} />
    );

  const tete = (
      <View style={styles.tete}>
        {verrou ? null : (
          <Appui accessibilityRole="button" accessibilityLabel={t("gps.reduire")} onPress={reduire} hitSlop={4} style={styles.reduire}>
            <Icone nom="down" taille={24} couleur={couleurs.t1} />
          </Appui>
        )}
        <Texte numberOfLines={1} style={styles.actN}>
          {circuitLance && vueCircuit ? titreCourt({ id: sportId, nom: titre, slug: null }) : titre}
          {circuitLance && vueCircuit ? (
            <Texte couleur="t2" style={styles.actLieu}>{` ${circuitLance.nom}`}</Texte>
          ) : lieu ? (
            <Texte couleur="t2" style={styles.actLieu}>{`, ${lieu}`}</Texte>
          ) : null}
        </Texte>
        {sansGps ? null : (
          <View style={styles.sig}>
            <Icone nom="gps" taille={18} couleur={perdu ? couleurs.rate : etat.gps.etat === "ok" ? couleurs.t2 : couleurs.t3} />
            {etat.gps.etat === "ok" ? (
              <Texte couleur="t2" style={styles.sigTexte}>
                {precisionTexte(etat.gps.precision)}
              </Texte>
            ) : null}
          </View>
        )}
        {etat.fc.etat === "connecte" || (fcVue.current && etat.fc.etat === "perdu") ? (
          <View style={styles.sig}>
            <View style={[styles.pt, { backgroundColor: etat.fc.etat === "connecte" ? couleurs.valide : couleurs.rate }]} />
            <Texte couleur="t2" style={styles.sigTexte}>
              {nomCapteur(etat.fc.appareil)}
            </Texte>
          </View>
        ) : null}
        {verrou ? (
          <View style={styles.bi}>
            <Icone nom="verrou" taille={22} couleur={couleurs.t1} />
          </View>
        ) : null}
      </View>
  );

  const couches = (
    <>
      {/* Verrouillé : tout l'écran ignore les touchers, sauf la barre du bas. */}
      {verrou ? <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} /> : null}

      {alerte ? (
        <View style={[styles.alerte, { backgroundColor: couleurs.s1, bottom: bas + 72 + espace.l }]} accessibilityLiveRegion="polite">
          <Icone nom={alerte === "perdu" ? "alerte" : "check"} taille={22} couleur={alerte === "perdu" ? couleurs.rate : couleurs.valide} />
          <Texte style={styles.alerteTexte}>{t(alerte === "perdu" ? "gps.gpsPerdu" : "gps.gpsRetrouve")}</Texte>
        </View>
      ) : null}

      <View style={[styles.cmd, { paddingBottom: bas }]}>
        {verrou ? (
          <>
            {tourOuEtape("v")}
            <Maintenir key="v-maintenir" onFini={() => setVerrou(false)} icone="verrou" libelle={t("gps.maintenir")} libelleLu={t("gps.deverrouillerLu")} />
          </>
        ) : pause ? (
          <>
            {/* Terminer : appui maintenu 1 s (une fin par erreur se rattrape aussi : « Reprendre » sur le résumé). */}
            <Maintenir key="p-terminer" onFini={() => terminer().catch(console.error)} icone="stop" libelle={t("gps.terminer")} libelleLu={t("gps.terminerLu")} rappel={t("gps.maintenirTerminer")} desactive={fin} />
            <Commande key="p-reprendre" icone="play" libelle={t("gps.reprendre")} plein onPress={() => reprendre().catch(signalerErreur())} />
          </>
        ) : (
          <>
            <Commande key="c-verrou" icone="verrou" libelleLu={t("gps.verrouiller")} carre onPress={() => setVerrou(true)} />
            {tourOuEtape("c")}
            <Commande key="c-pause" icone="pause" libelle={t("gps.pause")} plein onPress={() => suivi.pause().then(setEtat).catch(signalerErreur())} />
          </>
        )}
      </View>
    </>
  );

  const slug = sportId.startsWith("cat:") ? sportId.slice(4) : null;
  // Recette (?demo=fc) : la FC simulée remplit aussi l'historique (courbe, zones, effort), une valeur toutes les 2 s.
  const fcSerie: readonly EchantillonFc[] = demo ? Array.from({ length: Math.floor(etat.tempsMs / 2000) + 1 }, (_, i) => ({ s: i * 2000, bpm: fcDemo(i * 2000) })) as EchantillonFc[] : frequences.current;
  const fcSeance = fcVue.current ? fcDeLaSeance(fcSerie, fcMax) : null;
  // Sans GPS, à la place de la carte : la courbe de FC de la séance, ou la scène du sport sans capteur de FC.
  const boiteInterieur = (cible: number | null) => (
    <BoiteDirect centre={!(fcVue.current && fcSerie.length >= 2)}>
      {fcVue.current && fcSerie.length >= 2 ? <CourbeFcDirect fc={fcSerie} fcMax={fcMax} cible={cible} /> : <SceneSport slug={slug} />}
    </BoiteDirect>
  );

  if (famille === "seance" || famille === "recup") {
    return (
      <View style={{ flex: 1, backgroundColor: couleurs.bg, paddingTop: insets.top }}>
        {tete}
        {famille === "seance" ? (
          <SeanceDirect
            tempsMs={etat.tempsMs}
            pause={pause}
            fc={fcSerie}
            fcVue={fcVue.current}
            bpm={bpm}
            fcMax={fcMax}
            slug={slug}
            pas={avecPas(sportId) ? pas : undefined}
            effort={effortEnDirect(sportId, fcVue.current ? fcSerie : [], etat.tempsMs, fcMax)}
          />
        ) : (
          <RecupDirect tempsMs={etat.tempsMs} pause={pause} slug={slug} lieu={lieu} viseeS={viseeS} />
        )}
        {couches}
      </View>
    );
  }

  if (guide) {
    const { le, g: eg } = guide;
    const et = le[eg.i]!;
    const tempsS = etat.tempsMs / 1000;
    const r = resteEtape(le, eg, etat.distanceM, tempsS);
    const dansM = etat.distanceM - eg.debutM;
    const dansS = tempsS - eg.debutS;
    const allureEtape = et.genre !== "recup" && !perdu && dansM >= 50 && dansS >= 10 ? dansS / (dansM / 1000) : null;
    // Allure de la course jusqu'ici (bornée) pour estimer les étapes à la distance ; 6'00" au km avant 500 m.
    const allureRef = etat.distanceM >= 500 && tempsS > 0 ? Math.min(900, Math.max(150, tempsS / (etat.distanceM / 1000))) : ALLURE_ESTIMEE_S_KM;
    const verdict = bpm != null ? verdictZone(zoneDe(bpm, fcMax), et.zone, dansS) : null;
    const suivante = le[eg.i + 1];
    const resteS = r ? (r.unite === "s" ? r.reste : (r.reste / 1000) * allureRef) : 0;
    const finVers = heure(Date.now() + (resteS + le.slice(eg.i + 1).reduce((a, x) => a + dureePrevueS(x, allureRef), 0)) * 1000);
    const faites: EtapeFaite[] = etat.tours.map((b, k) => {
      const p = etat.tours[k - 1] ?? { s: 0, d: 0 };
      return { dureeS: (b.s - p.s) / 1000, distanceM: b.d - p.d };
    });
    const resteTexte = r ? t("gps.guide.resteCourt", { v: r.unite === "s" ? chronoTexte(r.reste * 1000) : `${Math.ceil(r.reste)} m` }) : null;
    return (
      <View style={{ flex: 1, backgroundColor: couleurs.bg, paddingTop: insets.top }}>
        {tete}
        <BandeEtapes etapes={le} i={eg.i} fait={r ? 1 - r.part : 0} allureSKm={allureRef} onPress={() => setFeuille(true)} />
        <View style={styles.etape}>
          <View style={styles.rang}>
            <ResteEtape reste={r} ecouleS={dansS} allure={allureEtape} pause={pause} />
            {fcVue.current ? <FcEtape bpm={bpm} fcMax={fcMax} visee={et.zone} verdict={verdict} /> : null}
          </View>
          <JaugeEtape part={r?.part ?? 0} zone={et.zone} />
          {annonce ? (
            <AnnonceEtape texte={annonce.texte} voix={voix} bilan={annonce.bilan} />
          ) : et.genre === "test" ? (
            pause ? <TestArrete /> : <MesuresTest distanceM={dansM} tempsS={dansS} resteS={r?.unite === "s" ? r.reste : 0} />
          ) : suivante?.genre === "test" ? (
            <ConsignesTest vma={vmaConnue} />
          ) : suivante ? (
            <Ensuite etape={suivante} />
          ) : null}
        </View>
        {sansGps ? boiteInterieur(et.zone) : <View style={[styles.carteG, { backgroundColor: couleurs.s1 }]}>{fond}</View>}
        <ChiffresGuides duree={chronoTexte(etat.tempsMs)} distance={sansGps ? null : approx(distanceTexte(etat.distanceM), perdu)} allure={valeurMoment} fcMoy={sansGps ? fcSeance?.moy ?? null : null} />
        {couches}
        <FeuilleEtapes visible={feuille} onFermer={() => setFeuille(false)} titre={titre} etapes={le} i={eg.i} faites={faites} resteTexte={resteTexte} finVers={finVers} allureSKm={allureRef} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.bg, paddingTop: insets.top }}>
      {/* Fold déplié : tout le direct tient dans la colonne de 640 dp, la carte comprise (planche Circuits, s3). */}
      <View style={styles.colonne}>
        {/* En-tête : activité, lieu, GPS, capteur ; cadenas quand l'écran est verrouillé. */}
        {tete}

        {/* Chrono et tour en cours (ou tour qui vient de finir, 3 s). */}
        <View style={styles.hautD}>
          <View style={styles.chrono}>
            <Texte style={[styles.chronoB, etroit ? styles.chronoE : null, { color: pause ? couleurs.t3 : couleurs.t1 }]} numberOfLines={1} adjustsFontSizeToFit>
              {chronoTexte(etat.tempsMs)}
            </Texte>
            <View style={styles.lblLigne}>
              <Texte couleur="t3" style={styles.lbl}>
                {t("gps.duree")}
              </Texte>
              {pause ? <Texte style={[styles.lbl, styles.lblFort]}>{t("gps.enPause")}</Texte> : null}
            </View>
          </View>
          <View style={[styles.tour, retour ? { backgroundColor: couleurs.s2 } : null]}>
            <View style={styles.tn}>
              <Icone nom={retour ? "check" : "tour"} taille={14} couleur={retour ? couleurs.valide : couleurs.t3} />
              <Texte style={[styles.tnTexte, { color: retour ? couleurs.t1 : couleurs.t3, fontFamily: retour ? police.semibold : police.regular }]}>
                {t("gps.tourN", { n: retour ? retour.tour.n : tour.n })}
              </Texte>
            </View>
            <Texte style={styles.tourB}>{chronoTexte((retour ? retour.tour.dureeS : tour.dureeS) * 1000)}</Texte>
            {sansGps ? null : (
              <Texte couleur="t2" style={styles.tourSmall}>
                {`${perdu && !retour ? "—" : valeurTour(retour ? retour.tour : tour)} ${unite}`}
              </Texte>
            )}
          </View>
        </View>

        {sansGps ? null : (
          <View style={styles.deux}>
            <Gros valeur={approx(distanceTexte(etat.distanceM), perdu)} unite={libelleDistance()} libelle={t("gps.distance")} />
            <Gros valeur={valeurMoment} unite={unite} libelle={t(mesure === "vitesse" ? "gps.vitesse" : "gps.allure")} />
          </View>
        )}

        {fcVue.current ? (
          <View style={[styles.fc, { borderTopColor: couleurs.line }]}>
            <View style={styles.fcLigne}>
              <Gros valeur={bpm != null ? String(bpm) : "—"} unite={t("gps.bpm")} />
              {zone ? <Texte style={[styles.zn, { color: couleurs[`zone${zone}` as keyof Jetons] }]}>{t("gps.zone", { n: zone })}</Texte> : null}
            </View>
            <View style={styles.zbar}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={[styles.zbarI, { backgroundColor: i === zone ? couleurs[`zone${i}` as keyof Jetons] : couleurs.s3 }]} />
              ))}
              {bpm != null ? <View style={[styles.rep, { left: `${positionRepere(bpm, fcMax) * 100}%`, backgroundColor: couleurs.t1 }]} /> : null}
            </View>
            <View style={styles.zleg}>
              {bornes.map((b, i) => (
                <Texte key={i} numberOfLines={1} style={[styles.zlegT, { color: i + 1 === zone ? couleurs.t1 : couleurs.t3, fontFamily: i + 1 === zone ? police.semibold : police.regular }]}>
                  {t("gps.zoneBorne", { n: i + 1, bpm: b })}
                </Texte>
              ))}
            </View>
            {typeof fcMax === "number" ? null : (
              <Appui accessibilityRole="link" accessibilityLabel={`${sourceZones(fcMax)}, ${t("zones.voir")}`} onPress={() => router.push("/settings/zones")} style={styles.zsrc}>
                <Texte couleur="t3" numberOfLines={1} style={styles.zsrcT}>
                  {sourceZones(fcMax)}
                </Texte>
                <Icone nom="right" taille={14} couleur={couleurs.t3} />
              </Appui>
            )}
          </View>
        ) : null}

        {sansGps ? null : (
          <View style={[styles.carte, { backgroundColor: couleurs.s1 }]}>
            {fond}
            {vueCircuit ? null : (
              <View style={styles.den} pointerEvents="none">
                <Texte style={styles.denB}>{approx(`+${altitudeEnUnite(vue.deniv)} ${libelleAltitude()}`, !etat.baro.present)}</Texte>
                <Texte couleur="t3" style={styles.lbl}>
                  {t("gps.denivele")}
                </Texte>
              </View>
            )}
          </View>
        )}

        {sansGps ? boiteInterieur(null) : null}

        {couches}
      </View>
    </View>
  );
}

/** Bilan d'une étape finie : « 3/6 · 1 km en 4:02 » puis « · 4'02" /km · 162 bpm moy. ». */
function bilanEtape(et: Etape, dureeS: number, distanceM: number, bpmMoy: number | null): { fort: string; suite: string } {
  const temps = chronoTexte(dureeS * 1000);
  const fort = et.distanceM ? `${nomEtape(et)}, ${t("gps.guide.enTemps", { cible: cibleEtape(et), temps })}` : `${nomEtape(et)}, ${temps}`;
  const bouts: string[] = [];
  if (!et.distanceM && et.genre !== "recup" && distanceM >= 100) bouts.push(`${distanceTexte(distanceM)} ${libelleDistance()}`);
  if (et.genre !== "recup" && distanceM >= 50 && dureeS > 0) bouts.push(`${allureTexte((dureeS * 1000) / distanceM)} ${libelleAllure()}`);
  if (bpmMoy != null) bouts.push(t("gps.guide.bpmMoy", { n: bpmMoy }));
  return { fort, suite: bouts.map((b) => `, ${b}`).join("") };
}

/** Grand chiffre (52, léger) et son unité, avec son libellé dessous. */
function Gros({ valeur, unite, libelle }: { valeur: string; unite: string; libelle?: string }) {
  const etroit = useWindowDimensions().width < LARGEUR_ETROITE;
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={styles.grosB}>
        <Texte numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.grosV, etroit ? styles.grosE : null]}>
          {valeur}
        </Texte>
        <Texte couleur="t2" style={styles.grosU}>
          {unite}
        </Texte>
      </View>
      {libelle ? (
        <Texte couleur="t3" style={styles.lbl}>
          {libelle}
        </Texte>
      ) : null}
    </View>
  );
}

function Commande({ icone, libelle, libelleLu, plein, carre, desactive, onPress }: {
  icone: NomIcone;
  libelle?: string;
  libelleLu?: string;
  plein?: boolean;
  carre?: boolean;
  desactive?: boolean;
  onPress: () => void;
}) {
  const { couleurs } = useTheme();
  const texte = plein ? couleurs.surAction : couleurs.t1;
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelleLu ?? libelle}
      disabled={desactive}
      onPress={onPress}
      style={[styles.b, carre ? styles.carre : styles.flex, { backgroundColor: plein ? couleurs.action : couleurs.s2 }]}
    >
      <Icone nom={icone} taille={24} couleur={texte} />
      {libelle ? <Texte style={[styles.bTexte, { color: texte }]}>{libelle}</Texte> : null}
    </Appui>
  );
}

/**
 * Appui maintenu 1 s (déverrouiller, terminer) : la barre se remplit pendant l'appui et se vide si on lâche avant ; l'action
 * part au relâcher d'une barre pleine : la barre du bas ne change pas sous le doigt (sinon le toucher suivant se perd). Lâché
 * trop tôt, `rappel` s'affiche un moment (« Maintiens pour terminer »).
 */
function Maintenir({ onFini, icone, libelle, libelleLu, rappel, desactive = false }: { onFini: () => void; icone: NomIcone; libelle: string; libelleLu: string; rappel?: string; desactive?: boolean }) {
  const { couleurs } = useTheme();
  const p = useSharedValue(0);
  const plein = useRef(false);
  const [aide, setAide] = useState(false);
  useEffect(() => {
    if (!aide) return;
    const m = setTimeout(() => setAide(false), 1800);
    return () => clearTimeout(m);
  }, [aide]);
  // La barre se remplit en scaleX depuis la gauche (le pilote natif, pas la largeur : revue finale n° 61).
  const remplissage = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  const marquer = () => {
    plein.current = true;
  };
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelleLu}
      accessibilityState={{ disabled: desactive }}
      disabled={desactive}
      onPressIn={() => {
        plein.current = false;
        p.value = withTiming(1, { duration: DEVERROUILLAGE_MS, easing: Easing.linear }, (ok) => {
          if (ok) scheduleOnRN(marquer);
        });
      }}
      onPressOut={() => {
        cancelAnimation(p);
        if (plein.current) return onFini();
        p.value = withTiming(0, { duration: duree.sortie, easing: courbes.sortie });
        if (rappel) setAide(true);
      }}
      onLongPress={() => {}}
      delayLongPress={DEVERROUILLAGE_MS + 500}
      style={[styles.b, styles.flex, styles.maintien, { backgroundColor: couleurs.s2 }]}
    >
      <Animated.View style={[styles.remplir, { backgroundColor: couleurs.s3 }, remplissage]} />
      {/* Le rappel (« Maintiens pour terminer ») prend la place de l'icône : avec elle, il était coupé. */}
      {aide && rappel ? null : <Icone nom={icone} taille={24} couleur={couleurs.t1} />}
      <Texte style={[styles.bTexte, styles.maintienTexte]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {aide && rappel ? rappel : libelle}
      </Texte>
    </Appui>
  );
}

/**
 * Mini-tracé sans fond de carte (D2) : trait par zone, détouré du fond, départ, point courant, repères des tours. Avec un circuit suivi
 * (planche Circuits, s3) : le circuit sous la trace faite, coloré par l'altitude, la trace faite en `t1`, le trait pointillé vers le
 * tracé quand on s'en est écarté, et « Fond de carte indisponible » en bas à gauche ; la position et l'état restent.
 */
function Trace({ points, zones, tours, retour, circuit = null, etatCircuit = null }: {
  points: readonly Point[];
  zones: readonly number[];
  tours: EtatSuivi["tours"];
  retour: boolean;
  circuit?: VueCircuit | null;
  etatCircuit?: EtatCircuit | null;
}) {
  const { couleurs } = useTheme();
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: l, height: h } = e.nativeEvent.layout;
    setTaille((x) => (x.l === l && x.h === h ? x : { l, h }));
  };
  // Un seul cadre pour le circuit, la trace faite et le bout du pointillé : l'échelle est la même pour tous.
  const nc = circuit?.points.length ?? 0;
  const ecart = etatCircuit && !etatCircuit.surCircuit ? etatCircuit.plusProche : null;
  const tous = useMemo(() => (circuit || ecart ? [...(circuit?.points ?? []), ...points, ...(ecart ? [ecart] : [])] : points), [circuit, points, ecart]);
  const projetes = useMemo(() => projeter(tous, taille.l, taille.h), [tous, taille]);
  const xyCircuit = projetes.slice(0, nc);
  const xy = projetes.slice(nc, nc + points.length);
  const bout = ecart ? projetes[projetes.length - 1] : undefined;
  const reperes = useMemo(() => indicesTours(points, tours), [points, tours]);
  const chemin = (pts: readonly Pt[], a: number, b: number) => pts.slice(a, b + 1).map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join("");
  const couleurZone = (z: number) => (circuit ? couleurs.t1 : z ? couleurs[`zone${z}` as keyof Jetons] : couleurs.t2);
  const dernier = xy.length - 1;
  let contenu: ReactNode = null;
  if (xyCircuit.length > 1) {
    contenu = (
      <>
        <Path d={chemin(xyCircuit, 0, xyCircuit.length - 1)} fill="none" stroke={couleurs.bg} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        {morceauxCircuit(circuit?.alts ?? null, xyCircuit.length, couleurs.altBas, couleurs.altHaut, couleurs.t3).map((m) => (
          <Path key={`c${m.a}`} d={chemin(xyCircuit, m.a, m.b)} fill="none" stroke={m.couleur} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </>
    );
  }
  if (xy.length) {
    const a = xy[0]!;
    const z = xy[dernier]!;
    contenu = (
      <>
        {contenu}
        {dernier > 0 ? <Path d={chemin(xy, 0, dernier)} fill="none" stroke={couleurs.bg} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {morceauxParZone(zones).map((m) => (
          <Path key={m.debut} d={chemin(xy, m.debut, m.fin)} fill="none" stroke={couleurZone(m.zone)} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {bout ? <Path d={`M${z.x.toFixed(1)},${z.y.toFixed(1)}L${bout.x.toFixed(1)},${bout.y.toFixed(1)}`} fill="none" stroke={couleurs.t2} strokeWidth={1.6} strokeDasharray="3 3" /> : null}
        <Circle cx={a.x} cy={a.y} r={5} fill={couleurs.bg} stroke={couleurs.t1} strokeWidth={2} />
        <Circle cx={z.x} cy={z.y} r={10} fill={couleurs.t1} opacity={0.18} />
        <Circle cx={z.x} cy={z.y} r={5.5} fill={couleurs.t1} stroke={couleurs.bg} strokeWidth={2} />
        {reperes.map((i, k) => {
          const q = xy[i];
          // le repère d'un tour pris à l'instant ne se pose sur le point courant que pendant son retour de 3 s
          if (!q || (i === dernier && !retour && k === reperes.length - 1)) return null;
          return (
            <G key={k}>
              <Circle cx={q.x} cy={q.y} r={9} fill={couleurs.t1} stroke={couleurs.bg} strokeWidth={2} />
              <SvgText x={q.x} y={q.y + 3.8} textAnchor="middle" fontSize={11} fontFamily={police.semibold} fill={couleurs.bg}>
                {String(k + 1)}
              </SvgText>
            </G>
          );
        })}
      </>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {taille.l > 0 ? (
        <Svg width={taille.l} height={taille.h}>
          {contenu}
        </Svg>
      ) : null}
      {circuit ? (
        <Texte couleur="t3" style={styles.fond}>
          {t("circuit.suivre.fond")}
        </Texte>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  colonne: { flex: 1, width: "100%", maxWidth: LARGEUR_CONTENU, alignSelf: "center" },
  tete: { height: 56, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: espace.xl, paddingRight: espace.xs },
  actN: { flex: 1, fontFamily: police.semibold, fontSize: 15 },
  actLieu: { fontFamily: police.regular, fontSize: 15 },
  sig: { minWidth: 44, height: 44, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  sigTexte: { fontSize: 13 },
  pt: { width: 7, height: 7, borderRadius: 3.5 },
  bi: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  reduire: { width: 48, height: 48, marginLeft: -14, alignItems: "center", justifyContent: "center" },
  hautD: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingRight: espace.l },
  chrono: { flex: 1, paddingTop: espace.xs, paddingHorizontal: espace.xl },
  chronoB: { fontFamily: police.light, fontSize: 84, letterSpacing: -2.52, lineHeight: 84, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  chronoE: { fontSize: 72, letterSpacing: -2.16, lineHeight: 72 },
  lblLigne: { flexDirection: "row", gap: espace.s, marginTop: -2 },
  lbl: { fontSize: 12, marginTop: 2 },
  lblFort: { fontFamily: police.semibold },
  tour: { width: 132, minHeight: 84, marginTop: espace.s, paddingVertical: espace.s, paddingHorizontal: espace.m, borderRadius: rayon.l, justifyContent: "center" },
  tn: { flexDirection: "row", alignItems: "center", gap: 6 },
  tnTexte: { fontSize: 12 },
  tourB: { fontFamily: police.regular, fontSize: 28, lineHeight: 32, fontVariant: ["tabular-nums"] },
  tourSmall: { fontSize: 13, fontVariant: ["tabular-nums"] },
  deux: { flexDirection: "row", gap: espace.l, paddingTop: espace.xl, paddingHorizontal: espace.xl },
  grosB: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  grosV: { flexShrink: 1, fontFamily: police.light, fontSize: 52, letterSpacing: -1.04, lineHeight: 55, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  grosE: { fontSize: 42, letterSpacing: -0.84, lineHeight: 45 },
  grosU: { fontFamily: police.regular, fontSize: 16 },
  fc: { marginTop: espace.xxl, marginHorizontal: espace.xl, paddingTop: espace.xl, borderTopWidth: StyleSheet.hairlineWidth },
  fcLigne: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  zn: { fontFamily: police.semibold, fontSize: 32, lineHeight: 36, paddingBottom: 6 },
  zbar: { flexDirection: "row", gap: 3, marginTop: 14 },
  zbarI: { flex: 1, height: 8, borderRadius: 2 },
  rep: { position: "absolute", top: -5, width: 3, height: 18, borderRadius: 2, marginLeft: -1.5 },
  zleg: { flexDirection: "row", gap: 3, marginTop: 6 },
  zlegT: { flex: 1, fontSize: 11, fontVariant: ["tabular-nums"] },
  zsrc: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  zsrcT: { flexShrink: 1, fontSize: 12 },
  // La carte prend toute la hauteur libre jusqu'à la barre du bas (revue finale n° 36 : plus de vide dessous).
  carte: { flex: 1, minHeight: 140, marginTop: espace.xl, marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden" },
  carteG: { flex: 1, minHeight: 140, marginTop: 14, marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden" },
  etape: { paddingTop: 2, paddingHorizontal: espace.l },
  rang: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: espace.s, marginTop: 2 },
  den: { position: "absolute", left: 14, top: espace.m },
  fond: { position: "absolute", left: 14, bottom: 12, fontSize: 12 },
  denB: { fontFamily: police.regular, fontSize: 22, fontVariant: ["tabular-nums"] },
  alerte: { position: "absolute", left: 28, right: 28, minHeight: 52, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  alerteTexte: { fontSize: 15 },
  cmd: { flexDirection: "row", gap: espace.s, paddingTop: espace.l, paddingHorizontal: espace.l },
  b: { height: 72, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  carre: { width: 72 },
  bTexte: { fontFamily: police.semibold, fontSize: 17 },
  maintien: { overflow: "hidden" },
  maintienTexte: { fontSize: 16 },
  remplir: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, transformOrigin: "left" },
});
