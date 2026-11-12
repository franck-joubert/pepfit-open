import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { ecrireEcranAllume, ecrireFcAppareil, ecrireFcDirecte, lireEcranAllume, lireFcAppareil, lireFcDirecte } from "../db";
import { suivi, type AppareilFc } from "../natif/suivi";
import { signalerErreur } from "../ui/FeuilleMessage";
import { autoriserAppareils, autoriserSuivi } from "./appareils-proximite";
import { capteurRetenu, quiDiffusent } from "./capteur-cardiaque";
import { useApp } from "./contexte";
import { gpsPret, reessayerAuRetour, type Tuto } from "./suivi-direct-vue";

// Capteurs du départ (retour du 06/11 : un seul écran de lancement) : le GPS, le capteur cardiaque (FC en direct,
// n'importe quelle marque : Whoop, ceinture, montre) et « Écran toujours allumé », lus et réglés au même endroit pour les deux
// écrans qui les montrent : le départ d'un sport au suivi (SuiviDepart) et le récap d'une séance de musculation. Comportement
// du lot 6 de la course guidée conservé : « Appareils à proximité » expliqués avant la demande d'Android, sans capteur qui
// diffuse « Activer » ouvre le tuto, et au retour dans pepfit la FC qui manquait est recherchée de nouveau, seule.

export type Gps = { etat: "recherche" } | { etat: "refus" } | { etat: "ok"; precision: number | null };
export type Fc =
  | { etat: "recherche" }
  | { etat: "refus" }
  | { etat: "absente" }
  | { etat: "trouvee"; appareil: AppareilFc };

const RECHERCHE_FC_MS = 8000;

export interface OptionsCapteurs {
  /** Le sport se fait dehors : la position est lue, la ligne GPS est montrée. */
  gps: boolean;
  /** La FC en direct a un sens pour ce départ (pas en récupération). */
  fc: boolean;
  /** « suivi » : le réglage « Écran toujours allumé » du départ d'un suivi ; « seance » : celui de la séance de musculation (global). */
  ecran: "suivi" | "seance";
  /**
   * Les autorisations (position, Bluetooth) sont expliquées puis demandées à l'ouverture (départ d'un suivi). Sinon, le
   * Bluetooth n'est demandé qu'au geste : l'interrupteur de la FC, ou « Autoriser » (récap d'une séance de musculation).
   */
  demander: boolean;
  /** Recette (captures) : tuto ouvert d'office. */
  tuto?: "whoop" | "ceinture" | "appareils";
  /**
   * Faux : la recherche du capteur n'est jamais lancée seule (ni à l'ouverture, ni au retour dans pepfit hors tuto) : l'écran
   * l'appelle (`chercherFc`) quand il le décide. Carte « Capteurs » de la page Effort : une écoute à l'ouverture de la page.
   */
  auto?: boolean;
  /** Durée de la recherche (ms) ; 8 s par défaut. */
  dureeMs?: number;
}

export function useCapteursDepart(o: OptionsCapteurs) {
  const { db, reglages, regler } = useApp();
  const [gps, setGps] = useState<Gps>({ etat: "recherche" });
  // Tous les capteurs qui diffusent (du plus proche au plus loin) : plusieurs, un choix ; un seul capteur par séance.
  const [diffusent, setDiffusent] = useState<AppareilFc[]>([]);
  const [cherche, setCherche] = useState(o.auto !== false);
  const [refus, setRefus] = useState(false);
  // Le capteur touché dans le choix pendant cette ouverture ; le dernier utilisé, mémorisé, passe avant le plus proche.
  const [choisi, setChoisi] = useState<string | null>(null);
  const [dernier, setDernier] = useState<string | null>(null);
  const retenu = capteurRetenu(diffusent, choisi, dernier);
  const fc: Fc = refus ? { etat: "refus" } : cherche ? { etat: "recherche" } : retenu ? { etat: "trouvee", appareil: retenu } : { etat: "absente" };
  const [ecranSuivi, setEcranSuivi] = useState(false);
  const [autorise, setAutorise] = useState<boolean | null>(null);
  // Réessai de la ligne GPS (après « Plus tard » ou un refus) : relance la lecture du fix, même si `autorise` ne change pas.
  const [essai, setEssai] = useState(0);
  const [fcActive, setFcActive] = useState<boolean | null>(null);
  const [tuto, setTuto] = useState<Tuto | null>(o.tuto ? (o.tuto === "appareils" ? "appareils" : "fc") : null);
  // Un essai a été fait depuis l'ouverture du tuto (retour dans pepfit, Réessayer) : sa ligne d'état peut parler.
  const [essaye, setEssaye] = useState(false);
  const [appareils, setAppareils] = useState<boolean | null>(null);
  // Recette : un lien reçu par l'écran déjà ouvert rouvre le tuto demandé.
  useEffect(() => {
    if (o.tuto) setTuto(o.tuto === "appareils" ? "appareils" : "fc");
  }, [o.tuto]);

  useEffect(() => {
    lireEcranAllume(db).then(setEcranSuivi).catch(console.error);
    lireFcDirecte(db).then(setFcActive, () => setFcActive(false));
    lireFcAppareil(db).then(setDernier).catch(console.error);
  }, [db]);

  // Autorisations au moment où elles servent : un départ de suivi cherche GPS et capteur dès qu'il s'ouvre (Bluetooth seulement si
  // la FC en direct est allumée). Le récap de musculation ne demande rien en s'ouvrant : le Bluetooth déjà accordé suffit.
  useEffect(() => {
    if (fcActive == null) return;
    if (o.demander) autoriserSuivi(fcActive && o.fc).then(setAutorise, () => setAutorise(false));
    else if (autorise == null) suivi.appareils().then(setAutorise, () => setAutorise(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fcActive, o.demander, o.fc]);

  // GPS : précision du fix en continu tant que l'écran est ouvert (le service natif ne part qu'à Démarrer).
  useEffect(() => {
    if (autorise == null || !o.gps) return;
    let fini = false;
    let abonnement: Location.LocationSubscription | null = null;
    (async () => {
      const p = await Location.getForegroundPermissionsAsync();
      if (!p.granted) return setGps({ etat: "refus" });
      // pas de dialogue « Précision de la localisation » de Google : le service natif lit le GPS seul de toute façon
      const opt = { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: false };
      abonnement = await Location.watchPositionAsync(opt, (l) => {
        const precision = l.coords.accuracy ?? null;
        setGps(gpsPret(precision) ? { etat: "ok", precision } : { etat: "recherche" });
      });
      if (fini) abonnement.remove();
    })().catch(() => setGps({ etat: "recherche" }));
    return () => {
      fini = true;
      abonnement?.remove();
    };
  }, [autorise, o.gps, essai]);

  // Une recherche à la fois : le retour d'une demande d'Android relance aussi la recherche (AppState), en même temps que la demande.
  const recherche = useRef(false);
  const chercherFc = useCallback(async () => {
    if (recherche.current) return;
    recherche.current = true;
    setCherche(true);
    setRefus(false);
    try {
      setDiffusent(quiDiffusent(await suivi.chercherFc(o.dureeMs ?? RECHERCHE_FC_MS)));
    } catch {
      setDiffusent([]);
      setRefus(true);
    } finally {
      recherche.current = false;
      setCherche(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.dureeMs]);
  // Une demande d'« Appareils à proximité » en cours (interrupteur allumé sur le récap d'une séance de musculation).
  const demande = useRef(false);
  useEffect(() => {
    if (autorise == null || !fcActive || !o.fc || o.auto === false) return;
    // Récap de musculation, rien demandé à l'ouverture : sans « Appareils à proximité », la ligne le dit et « Autoriser » les demande.
    if (!o.demander && !autorise) {
      if (!demande.current) {
        setCherche(false);
        setRefus(true);
      }
      return;
    }
    chercherFc().catch(console.error);
  }, [autorise, fcActive, o.fc, o.demander, chercherFc]);

  // Retour dans pepfit (appli Whoop, réglages d'Android, ceinture mise) : « Appareils à proximité » relus, et la FC allumée qui
  // manquait recherchée de nouveau ; le tuto ouvert dit le résultat (coche verte).
  const vivant = useRef({ fcActive, fc, tuto });
  vivant.current = { fcActive, fc, tuto };
  useEffect(() => {
    suivi.appareils().then(setAppareils, () => setAppareils(null));
    const s = AppState.addEventListener("change", (e) => {
      if (e !== "active") return;
      suivi
        .appareils()
        .then((ok) => {
          const v = vivant.current;
          setAppareils(ok);
          if (v.tuto) setEssaye(true);
          if ((o.auto !== false || v.tuto) && reessayerAuRetour(!!v.fcActive, v.fc, ok)) chercherFc().catch(console.error);
        })
        .catch(() => setAppareils(null));
    });
    return () => s.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chercherFc, o.auto]);

  const ouvrirTuto = (x: Tuto) => {
    setEssaye(false);
    setTuto(x);
  };

  const autoriserFc = async () => {
    const r = await autoriserAppareils(true);
    setAppareils(r === "accorde");
    if (r === "accorde") return chercherFc();
    if (r === "bloque") ouvrirTuto("appareils");
  };

  /** L'interrupteur de la FC en direct (le même réglage que dans Appareils et connexions) : allumé, le Bluetooth est demandé au besoin. */
  const basculerFc = (v: boolean) => {
    setFcActive(v);
    ecrireFcDirecte(db, v).catch(signalerErreur());
    if (!v || o.demander || autorise !== false) return;
    demande.current = true;
    setCherche(true);
    autoriserAppareils(false)
      .catch(() => "refuse" as const)
      .then((r) => {
        demande.current = false;
        setAppareils(r === "accorde");
        if (r === "accorde") return setAutorise(true);
        setCherche(false);
        setRefus(true);
      });
  };

  /** Le capteur touché dans le choix : retenu pour cette séance et mémorisé pour les suivantes. */
  const choisirCapteur = (adresse: string) => {
    setChoisi(adresse);
    setDernier(adresse);
    ecrireFcAppareil(db, adresse).catch(signalerErreur());
  };

  const ecran = o.ecran === "seance" ? reglages.ecranAllume : ecranSuivi;
  const basculerEcran = (v: boolean) => {
    if (o.ecran === "seance") return regler({ ecranAllume: v });
    setEcranSuivi(v);
    ecrireEcranAllume(db, v).catch(signalerErreur());
  };

  const reessayerGps = () => suivi.autoriser({ position: true, bluetooth: !!fcActive }).then((ok) => (setAutorise(ok), setEssai((n) => n + 1)));

  /** Le capteur que le départ demande au service natif ; null : il cherche lui-même (le dernier utilisé, sinon le premier qui diffuse). */
  const appareil = fcActive && o.fc && fc.etat === "trouvee" ? fc.appareil.adresse : null;
  /** Au Démarrer : le capteur trouvé est retenu pour les prochains départs (récap de musculation comprise, qui le lit à l'ouverture de la séance). */
  const memoriser = () => (appareil ? ecrireFcAppareil(db, appareil).catch(console.error) : Promise.resolve());

  return {
    gps, fc, diffusent, fcActive, ecran, tuto, essaye, appareils, appareil,
    basculerFc, basculerEcran, choisirCapteur, memoriser, ouvrirTuto, autoriserFc, chercherFc, reessayerGps,
    fermerTuto: () => setTuto(null),
    reessayerFc: () => {
      setEssaye(true);
      chercherFc().catch(console.error);
    },
  };
}

export type CapteursDepart = ReturnType<typeof useCapteursDepart>;
