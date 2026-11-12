import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { courbe, duree } from "../../theme/mouvement";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useFocusEffect } from "../../ui/focus-prechauffe";
import {
  ajouterEau, choisirJourEntrainement, CLES_FIBRES_EAU, deplacerConsommation, ecrireReglage, modifierEau, repeterRepas, restaurerConsommation, restaurerEau, supprimerConsommation, supprimerEau, totalDe,
  type AjoutEau, type Consommation, type Repas,
} from "../../db";
import { useTheme } from "../../theme";
import { espace, menuOnglets, police, POLICE_MAX, rayon } from "../../theme/typo";
import { cleJour, decalerJour, kcalObjectif, type CleMacro } from "../../nutrition/calculs";
import { astuceVisible, PALIER } from "../../nutrition/fibres-eau";
import { placerAliment } from "../../nutrition/glisser";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { BoutonIcone, TeteOnglet } from "../../ui/Cadre";
import { BoutonReglagesPartie } from "../reglages/Parties";
import { BoutonPrincipal } from "../../ui/Degrade";
import { ListeDesintegrable, marquerSuppression } from "../../ui/Desintegration";
import { GlisserSupprimer } from "../../ui/GlisserSupprimer";
import { useGlisserJournal } from "../../ui/GlisserJournal";
import { Icone } from "../../ui/Icone";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { BasFlottant } from "../../ui/MenuFlottant";
import { useOmbreCarte } from "../../ui/ContextePartie";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { jourEtroit, jourSemaineMois, nombre } from "../format";
import { lundiDe } from "../planification";
import { BandeSemaine, LigneBande, TitreDate } from "../../ui/BandeSemaine";
import { HAUT_BANDE, HAUT_COMPACTE } from "../../ui/semainier";
import { Actualiser, sansEtirement } from "../../ui/Actualiser";
import { useZoneSemainier, ZoneSemainier } from "../../ui/ZoneSemainier";
import { confirmerRepos } from "../../nutrition/jour-entrainement";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { useHautALArrivee } from "../../ui/haut-arrivee";
import { useOngletQuitte } from "../../ui/onglet-quitte";
import { useOngletRetouche } from "../../ui/onglet-retouche";
import { GlisserJour, PagesJours, usePositionJour } from "../../ui/GlisserJour";
import { useSautJour } from "../../ui/saut-jour";
import { RevenirAujourdhui } from "../RevenirAujourdhui";
import Reanimated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { courbes, liste as mouvementListe } from "../../ui/mouvement";
import { joursRendus } from "../../ui/glisser-jour";
import { BoutonAjouterSerie } from "../../ui/LigneSerie";
import { AttenteJauges, auRepas, CelluleResume, Jauge, LigneValeurs, MACROS, MARGE_CARTE, nomRepas, PastilleRepas, Rangee, texteQuantite, useCouleursMacros, valeurTexte } from "./commun";
import { blocResteVisible } from "../../nutrition/reste";
import { BlocReste } from "./BlocReste";
import { FeuilleEau, type OngletEau, type SaisieEau } from "./FeuilleEau";
import { instantDe } from "../planif-donnees";
import { BarresFibresEau, CarteConseils, CartePalier, FeuilleHabitudes } from "./FibresEau";
import { FeuilleCopier, FeuilleMenuRepas, FeuilleRepeter, leRepas } from "./FeuillesJournal";
import { lireJournal, voisinsALire, type DonneesJournal } from "./journal-donnees";
import { prendreRetraitFiche } from "./retrait-fiche";
import { prendreBullePlat } from "./plat-brouillon";
import { EtiquetteQuantite } from "./plats-commun";
import { useReduit } from "../../ui/reduit";
import { useDesaturationAura } from "../../ui/aura-etat";
import { DESATURATION_PASSE } from "../../ui/aura-calc";
import { rafraichirModeAffichage, useModeAffichage } from "./mode-affichage";

// Journal du jour (direction A, planche v4, + sur la ligne du titre : D7, une pastille par repas : D8) : ligne du mois et
// bouton « Jour d'entraînement », bande semaine, résumé (libellé à gauche de la valeur, objectif dessous, jauge), un repas
// par carte (titre, ⋯, +, totaux, aliments, « + Ajouter au … »), bandeau collé en haut quand le résumé sort de l'écran,
// un seul bouton plein « Ajouter un aliment » fixé en bas.

const DELAI_ANNULER_MS = 8000;
/** Temps du surlignage d'une ligne ajoutée. */
const SURLIGNE_MS = 1800;
const sortieColle = Easing.bezier(...courbe.sortie);
/** Filet des jauges (revue finale n° 56) : sans fin de transition annoncée par la pile, elles partent quand même. */
const SECOURS_JAUGES_MS = 600;
/**
 * Repli d'un repas (revue finale n° 55) : les cartes suivantes glissent à leur place. Au repli, elles attendent que la liste
 * soit sortie (150 ms) : avant, elle passait sous les cartes en verre qui remontaient (vu à l'émulateur, la nuit).
 */
const glisseCartes = LinearTransition.duration(duree.deplacement).easing(courbes.deplacement);
const glisseCartesApresSortie = LinearTransition.delay(duree.sortie).duration(duree.deplacement).easing(courbes.deplacement);
/**
 * Dépli : la liste paraît quand les cartes suivantes sont presque en place (160 ms sur 220). Plus tôt, elle passait sous les
 * cartes en verre qui descendaient (vu à l'émulateur, la nuit) ; couper la carte n'y fait rien pendant la transition.
 */
const contenuEntre = FadeIn.duration(duree.entree).delay(160).easing(courbes.sortie);

/** La pile racine, vue du journal (onglet) : ses débuts et fins de transition. */
type Pile = { addListener: (type: "transitionStart" | "transitionEnd", f: (e: { data?: { closing?: boolean } }) => void) => () => void };

/**
 * Marge du résumé et du bandeau collé : le bord des cartes et du titre (16). Au bord de leur contenu (32), « / 2,520 kcal »
 * était coupé en anglais.
 */
const MARGE_TABLEAU = MARGE_CARTE;

const maintenantMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Repas ouvert à la lecture d'un jour : aucun, tous pliés (09/11 : « les repas pliés par défaut »). On les ouvre au toucher. */
function ouvertALaLecture(_x: DonneesJournal | null): string | null {
  return null;
}

/** Repas d'un jour, chacun avec ses lignes dans l'ordre. */
function grouper(repas: Repas[], lignes: Consommation[]): Map<string, Consommation[]> {
  const m = new Map<string, Consommation[]>();
  for (const r of repas) m.set(r.id, []);
  for (const l of lignes) m.get(l.repas_id)?.push(l);
  for (const l of m.values()) l.sort((a, b) => a.ordre - b.ordre);
  return m;
}

/** Ce qui vient d'être retiré (un aliment, tout un repas vidé) ou déplacé : « Annuler » le défait pendant 8 s. */
type Retrait = { defaire: () => Promise<unknown>; texte: string; minuterie: ReturnType<typeof setTimeout>; action?: string };

export function Journal() {
  useLangue();
  const { db } = useApp();
  // D20 : sans chiffres (trouble alimentaire, poids bas), le journal garde ses repas et ses aliments, sans kcal ni macros ;
  // grossesse et moins de 18 ans : les totaux restent, sans objectif ni jauge. Relu à chaque jour ouvert.
  const aff = useModeAffichage();
  useEffect(() => {
    void rafraichirModeAffichage(db);
  }, [db]);
  const { couleurs, mode } = useTheme();
  // fond de l'onglet (jour : quasi-blanc vert d'eau) : l'en-tête collé et le fondu du bas le reprennent
  // carte blanche du jour : ombre très douce teintée (v2.2.17)
  const ombre = useOmbreCarte();
  const aujourdhui = cleJour(new Date());
  // Lien pepfitopen://food?date=AAAA-MM-JJ : ouvre le journal de ce jour.
  const { date: dateLien, n: jetonLien } = useLocalSearchParams<{ date?: string; n?: string }>();
  const [date, setDate] = useState(aujourdhui);
  useEffect(() => {
    if (dateLien && /^\d{4}-\d{2}-\d{2}$/.test(dateLien)) setDate(dateLien);
  }, [dateLien, jetonLien]);
  // Données du jour, marquées de leur date : au glissé entre les jours, la page qui arrive montre tout de suite l'aperçu déjà lu
  // (même contenu), jamais les données du jour quitté. Les aperçus (veille, lendemain) sont lus sans rien écrire.
  const [charge, setCharge] = useState<{ date: string; d: DonneesJournal } | null>(null);
  const [apercus, setApercus] = useState<Record<string, DonneesJournal>>({});
  const d = charge?.date === date ? charge.d : (apercus[date] ?? null);
  const setD = (f: (cur: DonneesJournal) => DonneesJournal) => setCharge((c) => (c ? { date: c.date, d: f(c.d) } : c));
  // Repas repliés ou dépliés à la main : valent pour leur jour seulement (pas d'une image avec ceux du jour quitté).
  const [replisJour, setReplisJour] = useState<{ date: string; r: Record<string, boolean> }>({ date, r: {} });
  const replies = replisJour.date === date ? replisJour.r : {};
  const setReplies = (f: (r: Record<string, boolean>) => Record<string, boolean>) => setReplisJour((c) => ({ date, r: f(c.date === date ? c.r : {}) }));
  const [menu, setMenu] = useState<Repas | null>(null);
  const [copier, setCopier] = useState<Repas | null>(null);
  const [repeter, setRepeter] = useState<Repas | null>(null);
  const [hauteurBas, setHauteurBas] = useState(0);
  const [retrait, setRetrait] = useState<Retrait | null>(null);
  // Tiroir d'eau (planche Fibres et eau) : la goutte l'ouvre sur « Ajouter », la barre d'eau sur « Aujourd'hui » ; la feuille des
  // habitudes s'ouvre depuis la carte d'astuce.
  const [eau, setEau] = useState<{ ouvert: boolean; onglet: OngletEau }>({ ouvert: false, onglet: "ajouter" });
  const [habitudes, setHabitudes] = useState(false);
  // Hauteur de la bande et de la ligne du jour, au-dessus des pages du carrousel.
  const [hautPages, setHautPages] = useState(0);
  const lundi = lundiDe(date);
  const position = usePositionJour(date);
  // « Revenir à aujourd'hui » (29/10) : un seul glissé vers aujourd'hui, comme en Entraînements.
  const saut = useSautJour({ jour: date, position, onJour: setDate });
  const zone = useZoneSemainier();
  const reduit = useReduit();
  // Jour passé : l'aura se désature un peu, comme en Sport (31/10).
  useDesaturationAura("nutrition", date < aujourdhui ? DESATURATION_PASSE : 0, !reduit);

  // Retour d'une page poussée (Ajouter, fiche d'un aliment) : les jauges montent quand le journal est revenu, pas sous la
  // transition (revue finale n° 56, comme la pile de la boutique).
  const navigation = useNavigation<{ getParent: () => Pile | undefined }>();
  const [attenteJauges, setAttenteJauges] = useState(false);
  useEffect(() => {
    const pile = navigation.getParent();
    if (!pile) return;
    let secours: ReturnType<typeof setTimeout> | undefined;
    const debut = pile.addListener("transitionStart", (e) => {
      if (e.data?.closing) return;
      clearTimeout(secours);
      setAttenteJauges(true);
      secours = setTimeout(() => setAttenteJauges(false), SECOURS_JAUGES_MS);
    });
    const fin = pile.addListener("transitionEnd", (e) => {
      if (e.data?.closing) return;
      clearTimeout(secours);
      setAttenteJauges(false);
    });
    return () => {
      debut();
      fin();
      clearTimeout(secours);
    };
  }, [navigation]);

  // Lignes du jour déjà vues : au retour sur le journal (ajout, scan), celles qui n'y étaient pas sont surlignées un instant
  // (audit du 28/10, constat 37).
  const vues = useRef<{ date: string; ids: Set<string> } | null>(null);
  const [ajoutees, setAjoutees] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (charge) vues.current = { date: charge.date, ids: new Set(charge.d.lignes.map((l) => l.id)) };
  }, [charge]);

  const recharger = useCallback(async () => {
    const x = await lireJournal(db, date, lundi, cleJour(new Date()));
    setCharge({ date, d: x });
    return x;
  }, [db, date, lundi]);
  // Le jour lu sert aussi d'aperçu quand on le quitte ; la veille et le lendemain ne sont lus que s'ils manquent à la mémoire
  // (audit de performance, M4 : trois journaux relus à chaque changement de jour). On ne garde que les trois jours rendus.
  useEffect(() => {
    if (charge) setApercus((m) => ({ ...m, [charge.date]: charge.d }));
  }, [charge]);
  const apercusLus = useRef(apercus);
  apercusLus.current = apercus;
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      const garder = new Set(joursRendus(date));
      setApercus((m) => Object.fromEntries(Object.entries(m).filter(([j]) => garder.has(j))));
      for (const j of voisinsALire(date, garder, apercusLus.current)) {
        lireJournal(db, j, lundiDe(j), cleJour(new Date()), true)
          .then((x) => vivant && setApercus((m) => ({ ...m, [j]: x })))
          .catch((e) => console.error(e));
      }
      return () => {
        vivant = false;
      };
    }, [db, date]),
  );
  useFocusEffect(
    useCallback(() => {
      const retireFiche = prendreRetraitFiche();
      // Repas enregistré comme plat (planche plats, P9) : le journal ne change pas ; « Voir » ouvre le plat, 8 s.
      const platEnregistre = prendreBullePlat();
      if (platEnregistre) {
        poserBulle(
          t("plats.enregistre", { nom: platEnregistre.nom }),
          async () => router.push({ pathname: "/nutrition/plat", params: { id: platEnregistre.platId, date } }),
          t("plats.voir"),
        );
      }
      const avant = vues.current;
      recharger()
        .then((x) => {
          if (avant?.date === date) {
            const neuves = x.lignes.filter((y) => !avant.ids.has(y.id)).map((y) => y.id);
            if (neuves.length) setAjoutees(new Set(neuves));
          }
          const l = retireFiche ? x.lignes.find((y) => y.id === retireFiche) : null;
          if (!l) return;
          marquerSuppression(l.id, 250);
          retirerRef.current([l], t("nutrition.retire", { nom: l.produit.nom }));
        })
        .catch((e) => console.error(e));
    }, [recharger, date]),
  );
  useEffect(() => {
    if (!ajoutees.size) return;
    const m = setTimeout(() => setAjoutees(new Set()), SURLIGNE_MS);
    return () => clearTimeout(m);
  }, [ajoutees]);

  const repas = useMemo(() => d?.repas ?? [], [d]);
  const lignes = useMemo(() => d?.lignes ?? [], [d]);
  const parRepas = useMemo(() => grouper(repas, lignes), [repas, lignes]);
  const total = totalDe(lignes);
  // Replié par défaut, sauf le repas de l'heure (ou, s'il est vide, le premier repas rempli). Le choix se fixe à la lecture du
  // jour : un repas qui se vide ne se replie pas sous le doigt (sa ligne doit pouvoir se désintégrer).
  const [ouvertJour, setOuvertJour] = useState<{ date: string; id: string | null }>({ date, id: null });
  useEffect(() => {
    if (!d) return;
    // Déjà fixé pour ce jour : gardé, même vidé (29/10 au soir : le repas qui se vidait passait la main au suivant et se
    // repliait, sa dernière ligne disparaissait sans grains).
    setOuvertJour((c) => (c.date === date && c.id ? c : { date, id: ouvertALaLecture(d) }));
  }, [d, date]);
  // Avant que l'effet ne fixe le choix, le même calcul que l'aperçu : la page qui arrive ne bouge pas.
  const ouvertDefaut = (ouvertJour.date === date ? ouvertJour.id : null) ?? ouvertALaLecture(d);
  const estOuvert = (id: string) => replies[id] === false || (replies[id] == null && id === ouvertDefaut);

  // Repli ou dépli d'un repas touché (revue finale n° 55) : le contenu entre en fondu (200 ms, après 160) ou sort (150 ms),
  // les cartes glissent à leur place (220 ms, courbe déplacement ; au repli, après la sortie), le chevron tourne (200 ms).
  // Reanimated lit la transition après le rendu : elle est armée une image avant le changement, le temps du geste seulement
  // (ni suppression, ni glissé entre les jours, ni rechargement). Réduit : rien ne bouge.
  const [bascule, setBascule] = useState<{ id: string; ouvre: boolean } | null>(null);
  const finBascule = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const basculerRepas = (id: string, ouvert: boolean) => {
    const changer = () => setReplies((x) => ({ ...x, [id]: ouvert }));
    if (reduit) return changer();
    setBascule({ id, ouvre: !ouvert });
    requestAnimationFrame(changer);
    clearTimeout(finBascule.current);
    finBascule.current = setTimeout(() => setBascule(null), duree.sortie + duree.deplacement + 80);
  };
  useEffect(() => () => clearTimeout(finBascule.current), []);

  const ecrire = (p: Promise<unknown>) => p.then(recharger).catch(signalerErreur());

  const glisse = useGlisserJournal({
    decalage: hautPages,
    repasIds: repas.map((r) => r.id),
    lignesDe: (id) => (parRepas.get(id) ?? []).map((l) => l.id),
    ouvert: estOuvert,
    margeBas: hauteurBas,
    onOuvrir: (id) => setReplies((r) => ({ ...r, [id]: false })),
    onDeposer: (id, repasId, rang) => {
      const avant = lignes.find((x) => x.id === id);
      if (!avant) return;
      const ordre = placerAliment((parRepas.get(repasId) ?? []).map((x) => x.id), id, rang);
      if (avant.repas_id === repasId && (parRepas.get(repasId) ?? []).map((x) => x.id).join() === ordre.join()) return;
      // Posé tout de suite à l'écran, la base suit ; « … déplacé vers … · Annuler » le remet à sa place (planche, notes).
      const rangAvant = (parRepas.get(avant.repas_id) ?? []).findIndex((x) => x.id === id);
      const vers = repas.find((r) => r.id === repasId);
      if (vers && avant.repas_id !== repasId) {
        poserBulle(t("nutrition.deplaceVers", { nom: avant.produit.nom, repas: leRepas(vers) }), () => deplacerConsommation(db, id, avant.repas_id, rangAvant));
      }
      setD((cur) => (cur ? { ...cur, lignes: cur.lignes.map((x) => (x.id === id ? { ...x, repas_id: repasId } : x)).map((x) => (ordre.includes(x.id) && x.repas_id === repasId ? { ...x, ordre: ordre.indexOf(x.id) } : x)) } : cur));
      ecrire(deplacerConsommation(db, id, repasId, rang));
    },
  });

  // Arrivée par le menu : en haut, d'un coup ; onglet re-touché : remonte en haut en défilant.
  useHautALArrivee("/food", glisse.scrollProps.ref);
  // Onglet re-touché (29/10 au soir) : retour à aujourd'hui, glissé dans le bon sens, semainier compris.
  const [recadre, setRecadre] = useState(0);
  useOngletRetouche("/food", () => {
    saut.sauter(aujourdhui);
    setRecadre((n) => n + 1);
  });

  // Quitté pour un autre onglet : retour à aujourd'hui (pas après la page du mois ou la fiche d'un aliment).
  useOngletQuitte("/food", () => setDate(cleJour(new Date())));

  const ajouter = (r: Repas) => router.push({ pathname: "/nutrition/ajouter", params: { repas: r.id, date } });
  // Une ligne de plat se rouvre sur la fiche du plat (sa quantité et ses ajustements) ; un aliment, sur sa fiche.
  const modifier = (c: Consommation) => router.push({ pathname: c.plat_id ? "/nutrition/plat" : "/nutrition/produit", params: { conso: c.id, date } });

  // Suppression : la ligne part tout de suite (désintégrée), « Annuler » la remet pendant 8 s.
  const poserBulle = (texte: string, defaire: () => Promise<unknown>, action?: string) => {
    if (retrait) clearTimeout(retrait.minuterie);
    const minuterie = setTimeout(() => setRetrait(null), DELAI_ANNULER_MS);
    setRetrait({ defaire, texte, minuterie, action });
  };
  const retirer = (l: Consommation[], texte: string) => {
    poserBulle(texte, () => Promise.all(l.map((x) => restaurerConsommation(db, x))));
    const ids = new Set(l.map((x) => x.id));
    setD((cur) => (cur ? { ...cur, lignes: cur.lignes.filter((x) => !ids.has(x.id)) } : cur));
    Promise.all(l.map((x) => supprimerConsommation(db, x.id))).catch(signalerErreur("supprimer"));
  };
  const retirerRef = useRef(retirer);
  retirerRef.current = retirer;
  const annuler = () => {
    if (!retrait) return;
    clearTimeout(retrait.minuterie);
    setRetrait(null);
    ecrire(retrait.defaire());
  };
  useEffect(
    () => () => {
      if (retrait) clearTimeout(retrait.minuterie);
    },
    [retrait],
  );
  // Eau : l'ajout se pose tout de suite, le tiroir se ferme et « 250 ml d'eau ajoutés · Annuler » dure 8 s ; une suppression garde le
  // tiroir ouvert (il montre le même bandeau dans son pied).
  const fermerEau = () => setEau((e) => ({ ...e, ouvert: false }));
  const ajouterEauMl = (s: SaisieEau) => {
    fermerEau();
    const ajout = ajouterEau(db, { date, heureMin: s.heureMin, ml: s.ml, libelle: s.libelle });
    poserBulle(t("eau.ajoute", { n: s.ml }), async () => supprimerEau(db, (await ajout).id));
    ecrire(ajout);
  };
  const modifierAjoutEau = (id: string, s: SaisieEau) => ecrire(modifierEau(db, id, { ml: s.ml, heureMin: s.heureMin, libelle: s.libelle }));
  const supprimerAjoutEau = (a: AjoutEau) => {
    poserBulle(t("eau.supprime", { n: a.ml }), () => restaurerEau(db, a));
    ecrire(supprimerEau(db, a.id));
  };
  // Carte du bas : « Passer à N g » change l'objectif, « Plus tard » repousse la carte d'une semaine, « Ne plus afficher » la masque.
  const passerPalier = (g: number) => ecrire(ecrireReglage(db, CLES_FIBRES_EAU.fibresObjectif, String(g)));
  const reporterPalier = () => ecrire(ecrireReglage(db, CLES_FIBRES_EAU.palierReporte, decalerJour(aujourdhui, PALIER.reportJours)));
  const masquerAstuce = () => {
    setHabitudes(false);
    ecrire(ecrireReglage(db, CLES_FIBRES_EAU.astuce, "0"));
  };

  const vider = (r: Repas) => {
    const l = parRepas.get(r.id) ?? [];
    if (!l.length) return;
    // La feuille descend, puis les lignes se désintègrent.
    marquerSuppression(l.map((x) => x.id), 220);
    retirer(l, t("nutrition.repasVide", { repas: nomRepas(r) }));
  };

  // Bandeau collé : il paraît quand le résumé est sorti par le haut.
  // Bas du résumé dans la page, plus la hauteur de la bande au-dessus des pages (le résumé est mesuré dans sa page).
  const [basResumePage, setBasResume] = useState(0);
  const basResume = basResumePage > 0 ? hautPages + basResumePage - 24 : 0;
  const haut = useSharedValue(0); // le même défilement pour le tirage (ui/Actualiser)
  const surDefilement = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    glisse.scrollProps.onScroll(e);
    haut.value = Math.max(0, e.nativeEvent.contentOffset.y);
    zone.surDefilement(e.nativeEvent.contentOffset.y);
    // Le résumé passe sous la bande resserrée : la ligne des macros prend le relais juste dessous (fondu et glissé sur le fil
    // UI, ui/ZoneSemainier ; la page est coupée sous elle sans bouger ni se remettre en page, l'aura passe derrière).
    zone.montrerColle(basResume > 0 && e.nativeEvent.contentOffset.y > basResume - HAUT_COMPACTE);
  };

  const objectif = d?.objectif;
  const tenu = glisse.tenu;
  const tenuLigne = tenu ? lignes.find((l) => l.id === tenu.id) : null;
  const choisirJour = (j: string) => setDate(j);

  // Passer en repos un jour qui a des séances enregistrées : confirmé une fois par jour (feuille de l'appli).
  const reposConfirmes = useRef(new Set<string>()).current;
  const [confirmer, setConfirmer] = useState(false);
  const basculerEntrainement = () => {
    if (!d) return;
    if (confirmerRepos({ entrainement: d.entrainement, seancesFaites: d.seancesFaites, dejaConfirme: reposConfirmes.has(date) })) {
      setConfirmer(true);
      return;
    }
    ecrire(choisirJourEntrainement(db, date, !d.entrainement));
  };

  // Une page du carrousel : le jour vif (interactif, glisser-déposer) ou un aperçu de la veille ou du lendemain, même rendu.
  const page = (j: string, vif: boolean) => {
    const dj = vif ? d : (apercus[j] ?? null);
    const repasJ = vif ? repas : (dj?.repas ?? []);
    const parRepasJ = vif ? parRepas : grouper(repasJ, dj?.lignes ?? []);
    const totalJ = vif ? total : totalDe(dj?.lignes ?? []);
    const objectifJ = dj?.objectif;
    const ouvertDj = vif ? null : ouvertALaLecture(dj);
    const ouvertJ = vif ? estOuvert : (id: string) => id === ouvertDj;
    const tenuJ = vif ? tenu : null;
    const cibleJ = vif ? glisse.cible : null;
    return (
      <View>
        {/* Toucher les totaux ouvre les Objectifs (D7), en plus du volet. TalkBack lit les totaux, puis l'indication ; le
            délai d'appui évite que le résumé pâlisse au début d'un glissé entre les jours. */}
        <Pressable
          disabled={!vif || !objectifJ}
          accessibilityRole="button"
          accessibilityHint={t("nutrition.objectifs")}
          unstable_pressDelay={120}
          onPress={() => router.push("/nutrition/objectifs")}
          onLayout={vif ? (e: LayoutChangeEvent) => setBasResume(e.nativeEvent.layout.y + e.nativeEvent.layout.height) : undefined}
          style={({ pressed }) => [styles.resume, pressed && { opacity: 0.6 }]}
        >
          {objectifJ && aff.totauxJournalVisibles ? (
            <Rangee
              alignement="flex-start"
              cellules={[
                <CelluleResume key="k" jour={j} cle="kcal" libelle={t("nutrition.total")} lettre="" valeur={totalJ.kcal} approx={totalJ.approx} cible={aff.objectifsVisibles ? kcalObjectif(objectifJ) : null} unite={t("nutrition.kcal")} />,
                ...MACROS.map((x) => (
                  <CelluleResume key={x.cle} jour={j} cle={x.cle} libelle={t(x.abrege)} lettre={x.cle === "sucres" ? t(x.court).charAt(0) : t(x.court)} valeur={totalJ[x.cle]} cible={aff.objectifsVisibles ? objectifJ[x.cle] : null} unite={t("nutrition.g")} />
                )),
              ]}
            />
          ) : null}
        </Pressable>

        {dj ? <BarresFibresEau jour={j} reglages={dj.fibresEau.reglages} fibres={dj.fibresEau.fibres} eauMl={dj.fibresEau.eauMl} onEau={vif ? (o) => setEau({ ouvert: true, onglet: o }) : () => {}} onFibres={vif ? () => router.push({ pathname: "/nutrition/fibres", params: { jour: String(instantDe(j)) } }) : undefined} /> : null}

        <View {...(vif ? glisse.listeProps : {})}>
          {repasJ.map((r) => {
            const l = parRepasJ.get(r.id) ?? [];
            const ouvert = ouvertJ(r.id);
            const t0 = totalDe(l);
            const visee = cibleJ?.repasId === r.id && tenuJ && tenuJ.repasId !== r.id;
            const tientCarte = tenuJ?.repasId === r.id || cibleJ?.repasId === r.id;
            const rangPlace = cibleJ?.repasId === r.id && tenuJ ? cibleJ.rang : -1;
            const sansTenu = l.filter((x) => x.id !== tenuJ?.id);
            const touche = vif && bascule?.id === r.id;
            return (
              <Reanimated.View
                key={r.id}
                layout={vif && bascule ? (bascule.ouvre ? glisseCartes : glisseCartesApresSortie) : undefined}
                onLayout={vif ? glisse.mesureCarte(r.id) : undefined}
                style={[styles.carte, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet, boxShadow: ombre, zIndex: tientCarte ? 2 : 0 }]}
              >
                <View style={[styles.entete, !ouvert && !l.length && styles.enteteSeule]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: ouvert }}
                    onPress={() => basculerRepas(r.id, ouvert)}
                    style={styles.titre}
                  >
                    <PastilleRepas cle={r.cle} />
                    <Texte variante="titreBarre" numberOfLines={1} style={{ flexShrink: 1, marginLeft: 10 }}>
                      {nomRepas(r)}
                    </Texte>
                    {l.some((x) => x.repete) ? <Icone nom="repeat" couleur={couleurs.t3} taille={14} epaisseur={2} /> : null}
                    <Chevron ouvert={ouvert} anime={touche} />
                  </Pressable>
                  <View style={styles.zonePlus}>
                    <BoutonIcone nom="more" libelle={t("nutrition.optionsRepas", { repas: nomRepas(r) })} onPress={() => setMenu(r)} />
                  </View>
                  {/* Le « + » est le bouton principal du design système, en carré de 44 (08/11), dans l'accent de la Nutrition. */}
                  <BoutonPrincipal compact iconeSeule icone="plus" libelle={t("nutrition.ajouterAuRepas", { repas: nomRepas(r) })} onPress={() => ajouter(r)} style={styles.plusRepas} />
                </View>
                {l.length ? (
                  <View style={styles.totaux}>
                    <LigneValeurs m={t0} niveau="repas" />
                  </View>
                ) : null}

                {/* Monté tant que le repas est ouvert, même vidé : le cadre de la liste reste là le temps que sa dernière ligne
                    supprimée se désintègre. */}
                {ouvert ? (
                  <Reanimated.View entering={touche ? contenuEntre : undefined} exiting={touche ? mouvementListe.sortie : undefined} onLayout={vif ? glisse.mesureListe(r.id) : undefined}>
                  <ListeDesintegrable
                    liste={l}
                    cleDe={(x) => x.id}
                    autour={(e) => (
                      <View style={[styles.liste, { borderTopColor: couleurs.line }]}>
                        {e}
                        {rangPlace >= 0 && rangPlace >= sansTenu.length ? <Place h={tenuJ!.h} /> : null}
                      </View>
                    )}
                    enveloppe={(x) => ({
                      style: x.id === tenuJ?.id ? { height: 0, overflow: "hidden" } : undefined,
                      onLayout: vif ? glisse.mesureLigne(x.id) : undefined,
                    })}
                    rendu={(x, etat) => {
                      const rangDe = sansTenu.findIndex((y) => y.id === x.id);
                      // Une ligne qui sort se désintègre : hors du glisser-déposer (comme les routines).
                      const vive = etat !== "sort";
                      return (
                        <View>
                          {rangPlace >= 0 && rangDe === rangPlace ? <Place h={tenuJ!.h} /> : null}
                          <GlisserSupprimer
                            actif={() => vive && !glisse.recent()}
                            fondContenu="transparent"
                            style={styles.glisse}
                            onSupprimer={() => retirer([x], t("nutrition.retire", { nom: x.produit.nom }))}
                          >
                            <View {...(vif && vive ? glisse.toucher(x.id, r.id) : {})}>
                              <LigneAliment c={x} ajoutee={vif && ajoutees.has(x.id)} onPress={() => vive && !glisse.recent() && modifier(x)} />
                            </View>
                          </GlisserSupprimer>
                        </View>
                      );
                    }}
                  />
                  </Reanimated.View>
                ) : null}
                {ouvert ? (
                  <Reanimated.View
                    entering={touche ? contenuEntre : undefined}
                    exiting={touche ? mouvementListe.sortie : undefined}
                    style={[styles.pied, !l.length && { paddingTop: 0 }]}
                  >
                    <BoutonAjouterSerie libelle={t("nutrition.ajouterAu", { repas: auRepas(r) })} onPress={() => ajouter(r)} />
                  </Reanimated.View>
                ) : null}
                {visee ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.visee, { borderColor: couleurs.partieNutrition }]} /> : null}
              </Reanimated.View>
            );
          })}
          {vif && tenu && tenuLigne ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tenu,
                { top: tenu.haut, backgroundColor: mode === "nuit" ? couleurs.s2 : couleurs.bg, borderColor: couleurs.line, transform: [{ translateY: glisse.ty }, { scale: 1.02 }] },
              ]}
            >
              <LigneAliment c={tenuLigne} />
            </Animated.View>
          ) : null}
        </View>

        {dj && objectifJ && blocResteVisible({ jour: j, aujourdhui, objectif: objectifJ, chiffres: aff.totauxJournalVisibles && aff.objectifsVisibles }) ? <BlocReste jour={j} total={totalJ} objectif={objectifJ} /> : null}

        {vif && dj ? <CarteDuBas dj={dj} aujourdhui={aujourdhui} jour={j} chiffres={aff.totauxJournalVisibles && aff.objectifsVisibles} repas={repasJ} onHabitudes={() => setHabitudes(true)} onPasser={passerPalier} onPlusTard={reporterPalier} /> : null}
      </View>
    );
  };

  return (
    <AttenteJauges.Provider value={attenteJauges}>
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      {/* L'en-tête, le semainier et la page descendent ensemble (ui/Actualiser) ; un aliment tenu (glisser-déposer) suspend le tirage. */}
      <Actualiser defilement={haut} actif={!tenu}>
      <TeteOnglet titre={t("ui.onglet.nutrition")}>
        <BoutonIcone nom="cal" libelle={t("planif.ouvrirMois")} onPress={() => router.push({ pathname: "/nutrition/mois", params: { jour: date } })} />
        <BoutonReglagesPartie partie="nutrition" />
      </TeteOnglet>
      <View style={{ flex: 1 }} {...glisse.zoneProps}>
        {/* Zone collée (29/10, ui/ZoneSemainier) : la bande de la semaine reste en haut et se resserre en descendant ; quand le
            résumé est sorti, la ligne des macros (constat 11) se pose dessous, en fondu. Sans fond : la page est coupée dessous,
            une ombre douce sous le bord (30/10). */}
        <ZoneSemainier
          zone={zone}
          bande={
            <BandeSemaine
              lundi={lundiDe(saut.cible ?? date)}
              recadre={recadre}
              sel={date}
              aujourdhui={aujourdhui}
              couleur={couleurs.partieNutrition}
              onSel={setDate}
              // Hors d'aujourd'hui, « Revenir à aujourd'hui » est en bas : pas de second ↺ en haut.
              marque={(j) => (d?.joursRemplis.has(j) ? "faite" : null)}
              position={position}
              compact={zone.compact}
            />
          }
          colle={
            <View style={styles.colle}>
              {objectif && aff.totauxJournalVisibles ? <BandeauColle jour={date} total={total} cibles={{ kcal: kcalObjectif(objectif), ...objectif }} /> : null}
            </View>
          }
        >
        {/* Glissé entre les jours (retours du 28/10) : la bande reste fixe, la page du jour voisin suit le doigt. */}
        <GlisserJour jour={date} position={position} onJour={(sens) => setDate(decalerJour(date, sens))}>
        <ScrollView
          {...sansEtirement}
          {...glisse.scrollProps}
          onScroll={surDefilement}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: HAUT_BANDE, paddingBottom: hauteurBas + espace.xxl }}
        >
          {/* Bas de l'en-tête dans la page (bande comprise) : les pages du carrousel commencent là. */}
          <View onLayout={(e) => setHautPages(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
            <LigneBande titre={<TitreDate j={date} aujourdhui={aujourdhui} />} />
            {/* Jour de repos / d'entraînement (retours du 28/10) : à droite de la ligne de la date, sous la bande. Repos par défaut,
                sans point ; entraînement avec le point orange. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: !!d?.entrainement }}
              onPress={basculerEntrainement}
              style={styles.entrainement}
            >
              <Texte variante="saisie" style={{ fontSize: 13, color: d?.entrainement ? couleurs.t1 : couleurs.t2 }}>
                {t(d?.entrainement ? "nutrition.jourEntrainement" : "nutrition.jourDeRepos")}
              </Texte>
              {/* Petit interrupteur à droite du texte (retour du 02/11) : la pastille est orange allumée, grise éteinte, sur un fond noir translucide (jour comme nuit). */}
              <View style={[styles.pisteEntr, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
                <View
                  style={[
                    styles.pastilleEntr,
                    d?.entrainement ? { backgroundColor: couleurs.partieEntrainement, alignSelf: "flex-end" } : { backgroundColor: couleurs.t3 },
                  ]}
                />
              </View>
            </Pressable>
          </View>

          <Reanimated.View style={saut.style}>
            <PagesJours jour={date} position={position} rendu={page} saut={saut.saut} decalage={saut.decalage} />
          </Reanimated.View>
        </ScrollView>
        </GlisserJour>
        </ZoneSemainier>
      </View>
      </Actualiser>

      <BasFlottant onHauteur={setHauteurBas}>
        <View style={styles.bas}>
          {/* Empilement du pied, de haut en bas, 8 entre chaque (gap) : « …, Annuler » (constat 25), « Revenir à aujourd'hui »
              hors d'aujourd'hui (29/10), puis rien d'autre : l'ajout et le scan passent par le « + » de chaque repas (08/11). La marge de fin de liste grandit d'autant (BasFlottant). */}
          {retrait ? <BandeauAnnuler texte={retrait.texte} onAnnuler={annuler} action={retrait.action} /> : null}
          <RevenirAujourdhui visible={date !== aujourdhui} onPress={() => saut.sauter(aujourdhui)} />
        </View>
      </BasFlottant>

      <FeuilleMenuRepas
        onPlat={() => {
          const r = menu;
          setMenu(null);
          if (r) router.push({ pathname: "/nutrition/plat-edition", params: { depuis: "repas", repas: r.id, date } });
        }}
        repas={menu}
        lignes={menu ? (parRepas.get(menu.id) ?? []) : []}
        onFermer={() => setMenu(null)}
        hierKcal={menu ? (d?.hier.get(menu.id) ?? null) : null}
        onCommeHier={() => {
          const r = menu;
          setMenu(null);
          if (r) ecrire(repeterRepas(db, { date: decalerJour(date, -1), repasId: r.id }, { date, repasId: r.id }));
        }}
        onCopier={() => (setCopier(menu), setMenu(null))}
        onRepeter={() => (setRepeter(menu), setMenu(null))}
        onHoraires={() => (setMenu(null), router.push("/nutrition/repas"))}
        onVider={() => {
          const r = menu;
          setMenu(null);
          if (r) vider(r);
        }}
      />
      <Feuille visible={confirmer} onFermer={() => setConfirmer(false)} titre={t("nutrition.reposConfirmer.titre")}>
        <Texte variante="corps" couleur="t2" style={styles.confirmerTexte}>
          {t("nutrition.reposConfirmer.texte")}
        </Texte>
        <Groupe>
          <Option
            premier
            libelle={t("nutrition.reposConfirmer.oui")}
            onPress={() => {
              setConfirmer(false);
              reposConfirmes.add(date);
              ecrire(choisirJourEntrainement(db, date, false));
            }}
          />
          <Option libelle={t("nutrition.reposConfirmer.non")} onPress={() => setConfirmer(false)} />
        </Groupe>
      </Feuille>
      <FeuilleEau
        visible={eau.ouvert}
        ongletInitial={eau.onglet}
        estAujourdhui={date === aujourdhui}
        ajouts={d?.fibresEau.ajouts ?? []}
        totalMl={d?.fibresEau.eauMl ?? 0}
        objectifMl={aff.objectifsVisibles && d ? d.fibresEau.reglages.eauObjectifMl : null}
        maintenantMin={maintenantMin}
        bandeau={retrait?.texte ?? null}
        onAnnuler={annuler}
        onFermer={fermerEau}
        onAjouter={ajouterEauMl}
        onModifier={modifierAjoutEau}
        onSupprimer={supprimerAjoutEau}
      />
      <FeuilleHabitudes visible={habitudes} objectifG={d?.fibresEau.reglages.fibresObjectifG ?? 30} onFermer={() => setHabitudes(false)} onMasquer={masquerAstuce} />
      <FeuilleCopier repas={copier} tous={repas} date={date} onFermer={() => setCopier(null)} onCopie={() => (setCopier(null), recharger().catch(console.error))} />
      <FeuilleRepeter repas={repeter} date={date} lignes={repeter ? (parRepas.get(repeter.id) ?? []) : []} onFermer={() => setRepeter(null)} />
    </SafeAreaView>
    </AttenteJauges.Provider>
  );
}

/**
 * Sous les repas, à la même place (planche Fibres et eau, lot 4) : le palier de plus après deux semaines tenues, sinon la carte
 * d'astuce. Aujourd'hui seulement, avec les chiffres et les objectifs affichés (D10, D11) ; jamais les deux ensemble.
 */
function CarteDuBas({ dj, jour, aujourdhui, chiffres, repas, onHabitudes, onPasser, onPlusTard }: {
  dj: DonneesJournal;
  jour: string;
  aujourdhui: string;
  chiffres: boolean;
  repas: readonly Repas[];
  onHabitudes: () => void;
  onPasser: (g: number) => void;
  onPlusTard: () => void;
}) {
  const { reglages, fibres, palier, echange } = dj.fibresEau;
  if (!chiffres || jour !== aujourdhui) return null;
  if (palier != null) {
    return <CartePalier objectifG={reglages.fibresObjectifG} suivantG={palier} onPasser={() => onPasser(palier)} onPlusTard={onPlusTard} />;
  }
  const visible = astuceVisible({ aujourdhui: true, suivi: reglages.fibresSuivi, masquee: !reglages.astuce, chiffres, fibresG: Math.round(fibres?.g ?? 0), objectifG: reglages.fibresObjectifG, echange });
  return visible && echange ? <CarteConseils conseils={[echange]} repas={repas} onPress={onHabitudes} /> : null;
}

/** Bandeau collé : « 1 215 kcal », puis « P 87 », « G 131 », « L 35 », « S 40 » (lettre colorée à gauche du montant) et leurs jauges de 2. */
function BandeauColle({ jour, total, cibles }: { jour: string; total: Record<CleMacro, number> & { approx: boolean }; cibles: Record<CleMacro, number> }) {
  const c = useCouleursMacros();
  const macros = MACROS;
  return (
    <View>
      <Rangee
        cellules={[
          // Les kcal ne sont jamais coupées (« 2 3… » sur l'émulateur) : le texte se resserre plutôt.
          <Texte key="k" variante="saisie" style={{ fontSize: 14, color: c.kcal }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {valeurTexte(total.kcal, total.approx)}
            <Texte variante="meta" couleur="t3">
              {" "}
              {t("nutrition.kcal")}
            </Texte>
          </Texte>,
          ...macros.map((x) => (
            <Texte key={x.cle} variante="saisie" style={{ fontSize: 14 }} numberOfLines={1}>
              <Texte variante="entete" style={{ fontSize: 11, color: c[x.cle], textTransform: "none", letterSpacing: 0 }}>
                {/* Une lettre comme P, G, L : « S » (« Suc. » / « Sug. » ne tient pas dans la colonne). */}
                {x.cle === "sucres" ? t(x.court).charAt(0) : t(x.court)}
              </Texte>
              {` ${nombre(total[x.cle], 0)}`}
            </Texte>
          )),
        ]}
      />
      <Rangee
        alignement="center"
        style={{ marginTop: 6 }}
        cellules={[
          <Jauge key="k" jour={jour} cle="kcal" valeur={total.kcal} cible={cibles.kcal} hauteur={2} />,
          ...macros.map((x) => (
            <View key={x.cle} style={{ alignSelf: "stretch" }}>
              <Jauge jour={jour} cle={x.cle} valeur={total[x.cle]} cible={cibles[x.cle]} hauteur={2} />
            </View>
          )),
        ]}
      />
    </View>
  );
}

/** Une ligne d'aliment (planche `.al2`) : nom 15 et étiquette de quantité, puis ses valeurs en colonnes ; toucher = modifier. */
function LigneAliment({ c, onPress, ajoutee }: { c: Consommation; onPress?: () => void; ajoutee?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.produit.nom}, ${texteQuantite(c)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.aliment, pressed && { backgroundColor: couleurs.s2 }]}
    >
      {ajoutee ? <Surligne couleur={couleurs.partieNutrition} /> : null}
      <View style={styles.nomLigne}>
        <Texte variante="corps" numberOfLines={1} style={{ flex: 1, fontSize: 15, color: couleurs.t1 }}>
          {c.produit.nom}
          {/* Plat ajusté pour cette fois (planche plats, P5) : « ajusté » suit le nom, l'étiquette se teinte. */}
          {c.ajuste ? (
            <Texte variante="meta" couleur="t3">
              {`  ${t("plats.ajuste")}`}
            </Texte>
          ) : null}
        </Texte>
        {c.ajuste ? (
          <EtiquetteQuantite texte={texteQuantite(c)} ajuste />
        ) : (
          <View style={[styles.etiquette, { backgroundColor: couleurs.s2 }]}>
            <Texte variante="meta" couleur="t2" numberOfLines={1}>
              {texteQuantite(c)}
            </Texte>
          </View>
        )}
      </View>
      <View style={{ marginTop: 5 }}>
        <LigneValeurs m={c.macros} niveau="aliment" />
      </View>
    </Pressable>
  );
}

/** Voile vert d'une ligne qui vient d'être ajoutée : paraît (200 ms), tient, puis s'efface ; immobile sous « réduire les animations ». */
function Surligne({ couleur }: { couleur: string }) {
  const reduit = useReduit();
  const v = useRef(new Animated.Value(reduit ? 1 : 0)).current;
  useEffect(() => {
    if (reduit) return;
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: duree.entree, easing: sortieColle, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, delay: SURLIGNE_MS - duree.entree - 600, duration: 600, easing: sortieColle, useNativeDriver: true }),
    ]).start();
  }, [reduit, v]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: rayon.l, backgroundColor: couleur, opacity: Animated.multiply(v, 0.16) }]} />;
}

/** Chevron d'un repas : → replié, ↓ ouvert ; tourne d'un quart de tour (200 ms) quand on touche le repas. */
function Chevron({ ouvert, anime }: { ouvert: boolean; anime: boolean }) {
  const { couleurs } = useTheme();
  const q = useSharedValue(ouvert ? 1 : 0);
  useEffect(() => {
    q.value = anime ? withTiming(ouvert ? 1 : 0, { duration: duree.entree, easing: courbes.sortie }) : ouvert ? 1 : 0;
  }, [ouvert, anime, q]);
  const tourne = useAnimatedStyle(() => ({ transform: [{ rotate: `${q.value * 90}deg` }] }));
  return (
    <Reanimated.View style={tourne}>
      <Icone nom="right" couleur={couleurs.t3} taille={16} epaisseur={2} />
    </Reanimated.View>
  );
}

/** Emplacement d'arrivée d'un aliment tenu : un cadre en pointillé vert à sa hauteur. */
function Place({ h }: { h: number }) {
  const { couleurs } = useTheme();
  return <View style={{ height: h, marginVertical: 2, marginHorizontal: 8, borderRadius: rayon.l, borderWidth: 1.5, borderStyle: "dashed", borderColor: couleurs.partieNutrition }} />;
}

const styles = StyleSheet.create({
  entrainement: { position: "absolute", right: MARGE_CARTE, bottom: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: rayon.l },
  pisteEntr: { width: 28, height: 16, borderRadius: 8, padding: 2, justifyContent: "center" },
  pastilleEntr: { width: 12, height: 12, borderRadius: 6 },
  confirmerTexte: { fontSize: 14, textAlign: "center", marginBottom: espace.l },
  resume: { paddingTop: 10, paddingBottom: 18, paddingHorizontal: MARGE_TABLEAU },
  carte: { marginHorizontal: MARGE_CARTE, marginBottom: 16, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth },
  // Retraits égaux (retour du 27/10) : le picto est à 16 du haut et de la gauche ; le + (carré de 44, bouton principal) à 6 de
  // marge : son bord droit à 16 du bord de la carte, à l'aplomb de la colonne des sucres. Les zones de 44 débordent vers le haut.
  entete: { flexDirection: "row", alignItems: "flex-start", paddingTop: 16, paddingLeft: 16, paddingRight: 10 },
  // Carte repliée sans rien dessous (retours du 28/10, b) : le picto (16 → 52) finissait à 4 du bas de la tête (56) ; 12 de
  // plus lui rendent 16 en bas comme en haut.
  enteteSeule: { paddingBottom: 12 },
  titre: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, height: 44, marginTop: -4, minWidth: 0 },
  zonePlus: { width: 44, height: 44, marginTop: -4, alignItems: "center", justifyContent: "center" },
  plusRepas: { marginTop: -4, marginRight: 6 },
  totaux: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 14 },
  liste: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  glisse: { borderRadius: rayon.l },
  aliment: { paddingTop: 9, paddingBottom: 10, paddingHorizontal: 16, borderRadius: rayon.l },
  nomLigne: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 22 },
  etiquette: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, maxWidth: "55%" },
  // Lien discret de la séance (« + Ajouter une série », retours du 28/10, b) : zone de 44, le reste en marge.
  pied: { paddingTop: 4, paddingHorizontal: 16, paddingBottom: 6 },
  visee: { borderRadius: rayon.l, borderWidth: 2 },
  tenu: { position: "absolute", left: MARGE_CARTE + 4, right: MARGE_CARTE + 4, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, zIndex: 10, elevation: 8, boxShadow: "0px 14px 28px -10px rgba(0,0,0,0.7)" },
  colle: { paddingTop: 4, paddingBottom: 9, paddingHorizontal: MARGE_TABLEAU },
  bas: { paddingHorizontal: 16, gap: espace.s },
});
