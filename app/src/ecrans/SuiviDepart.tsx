import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  demarrerSeanceDepuisRoutine, demarrerSeanceSport, ecrireAnnonces, ecrireSuiviLance, listerSalles, lireAnnonces, lireRoutine,
  lireVmaCourante, modifierSeance, type SalleResume,
} from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { suivi } from "../natif/suivi";
import { activitesDuSport, circuitSuivi } from "../circuits/suivre";
import { chargerGarde } from "../circuits/chargement";
import type { CircuitSuivi } from "../circuits/types";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { BoutonPrincipal } from "../ui/Degrade";
import { Icone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { Segmente } from "../ui/Segmente";
import { Appui } from "../ui/mouvement";
import { signalerErreur } from "../ui/FeuilleMessage";
import { fichierPicto } from "../ui/pictos";
import { Texte } from "../ui/Texte";
import { seanceChangee } from "./bulle-evenement";
import { ouvrirSeance } from "./ouvrir-seance";
import type { DonneesRecap } from "./recap/donnees-recap";
import { CarteSeance } from "./recap/CarteSeance";
import { demarrerDepuisRecap } from "./recap/gestes-recap";
import { demarrerSeance } from "./demarrer-seance";
import { useApp } from "./contexte";
import { FeuilleSalle } from "./FeuilleSalle";
import { pictoLieu, sousTitreLieu } from "./Lieux";
import { LigneDeLieu } from "./LigneDeLieu";
import { pictoSport } from "./lanceur-sports";
import { alarmeRecup } from "../natif/alarme-recup";
import { demanderNotifications } from "../natif/notifications";
import { autoriserSuivi } from "./appareils-proximite";
import { LigneDepart, SectionCapteurs, stylesDepart, Tuile, type RecetteCapteurs } from "./SectionCapteurs";
import { capteursDepart, departSansGps } from "./suivi-direct-vue";
import { useCapteursDepart } from "./useCapteursDepart";
import { familleDeSeance, interieurPossible, lieuxDepart } from "./familles-sports";
import { DUREES_VISEES_MIN } from "./direct-familles";
import { etapesAuTemps, etapesDeRoutine, lignesCourse, type Etape } from "./etapes-course";
import { approx, dureeCourte } from "./format";
import { FeuilleCircuits } from "./circuit/FeuilleCircuits";
import { chiffresCircuit } from "./circuit/texte";
import { dureeEstimee } from "./donnees";

// Écran de lancement unique d'une séance (retour du 06 et du 07/11 : plus deux écrans qui se suivent, le récap puis le
// départ ; la musculation sur le même écran noir, pas sur le récap à halo) : le sport (titre et picto), Dehors / Tapis, le lieu
// (touchable, feuille « Lieu de la séance »), les capteurs, puis Démarrer, seul dégradé. Fond noir (planche suivi-gps, écran 1,
// validé) : le halo du récap n'y est pas. Hébergé par le récap (route /seance-recap, EcranRecap) quand on y arrive d'une séance,
// d'une routine ou d'un sport du lanceur, et par /suivi/depart pour une routine de course lancée de sa fiche : dans les deux cas,
// un seul écran empilé, que la séance remplace.
// Séance d'exercices (`seance` : musculation vide, routine, programme de force, sport sans module de suivi) : le même écran, sans
// GPS ni segmenté ; le titre est celui du sport (« Musculation »), sous lui la date d'une séance prévue ; une carte rappelle le
// programme s'il y en a un, la séance si elle est définie (nom, nombre d'exercices), sinon « Séance libre » (CarteSeance) ;
// Démarrer lance la séance au chrono (demarrerDepuisRecap). Les capteurs y sont ceux de la séance : la FC en direct (le réglage de
// Appareils et connexions), « Écran toujours allumé » (le réglage global de la séance) ; le Bluetooth n'est demandé qu'au geste.
// Extérieur / Intérieur (07/11) : seulement pour un sport où un GPS a du sens (course, marche, vélo, rando…) ; grisé sur
// Extérieur quand l'intérieur est impossible (VTT, rando, kayak… : interieurPossible, familles-sports).
// Démarrer reste possible sans GPS ni capteur : le chrono part, les capteurs rejoignent quand ils arrivent.
// Capteurs (useCapteursDepart, SectionCapteurs) : GPS seulement pour un sport dehors ; capteur cardiaque (FC en direct, de
// n'importe quelle marque : le nom du capteur trouvé), allumé d'office si Whoop est connecté, un interrupteur sur sa ligne ;
// éteint, ni Bluetooth, ni recherche, ni « diffusion coupée » ; plusieurs capteurs qui diffusent : « Changer » en propose le
// choix, le dernier utilisé est mémorisé. « Écran toujours allumé ». Course : Dehors / Tapis se choisit ici ; Tapis ou
// intérieur : le suivi en direct sans GPS (service « health », D2 du 29/10), avec la FC si elle est allumée.
// Course guidée (planche seance-duree, D8) : ouvert pour une routine de course d'un programme ; le titre est celui de la
// séance avec ses étapes (« 13 étapes, ~ 52 min »), « Annonces vocales » (D4, oui par défaut) s'ajoute ; Dehors part en
// course guidée ; Tapis aussi, sans carte, ses étapes à la distance passées au temps à la vitesse visée (D3 du 29/10).
// Une séance prévue ajoute sa date sous le titre (`quand`) et le ⋯ du récap (`onMenu` : Modifier, Annuler).
// Circuit (planche Circuits, lot F) : pour la course, la randonnée et le vélo dehors, une ligne « Circuit » entre « Lieu » et « Capteurs » ; vide
// (« Aucun circuit »), elle ouvre la feuille « Suivre un circuit » ; remplie par la page d'un circuit (« Suivre ce circuit », param `circuit`),
// elle montre son nom et ses chiffres. Le circuit part avec le suivi lancé (SuiviLance.circuit) ; Démarrer reste le seul bouton, et reste
// possible sans circuit. Ni le chrono, ni les capteurs, ni la ligne de FC n'en dépendent.
// FC (lot 6) : « Appareils à proximité » expliqués avant la demande d'Android ; sans capteur qui diffuse, « Activer » ouvre
// le tuto (Whoop, ceinture) ; refusés, « Autoriser » les redemande, ou ouvre leur tuto quand Android ne la montre plus. Au
// retour dans pepfit (Whoop, réglages d'Android), la FC qui manquait est recherchée de nouveau, seule.

export type SportDepart = { id: string; nom: string; slug: string | null };

/** Titre court de la notification et de l'en-tête du direct (« Course · Quais de Seine »). */
export function titreCourt(s: SportDepart): string {
  if (s.id === "cat:course") return t("gps.court.course");
  if (s.id === "cat:bicycling") return t("gps.court.velo");
  if (s.id === "cat:randonnee") return t("gps.court.rando");
  return s.nom;
}

/** Recette (lien pepfitopen://suivi/depart…, captures) : tuto ouvert d'office, sa ligne d'état imposée, départ sur Tapis. */
export type RecetteDepart = RecetteCapteurs & { tapis?: boolean };

/**
 * L'écran de lancement occupe un seul écran de la pile : la séance (ou son suivi en direct) le remplace, et Back depuis elle
 * revient à l'origine du lancement (pile-lancement.ts).
 */
const RETIRER = 1;

export function SuiviDepart({ sport, salleId: salleInitiale, routineId = null, circuitId = null, seance = null, quand = null, onMenu, recette = {} }: {
  sport: SportDepart;
  salleId: string | null;
  /** Course guidée : la routine de course dont les étapes sont lancées par le suivi. */
  routineId?: string | null;
  /** « Suivre ce circuit » : le circuit déjà choisi, que la page d'un circuit ouvre ici (planche Circuits, lot F). */
  circuitId?: string | null;
  /** Séance d'exercices à lancer au chrono (musculation, routine, programme) : ce que le récap en a lu. */
  seance?: DonneesRecap | null;
  /** Sous le titre : le jour et l'heure d'une séance prévue (« Jeu. 5 nov., 18:00 »), la durée d'une séance d'exercices. */
  quand?: string | null;
  /** Séance prévue : le ⋯ de la barre (Modifier, Annuler), posé par le récap qui héberge l'écran. */
  onMenu?: () => void;
  recette?: RecetteDepart;
}) {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const insets = useSafeAreaInsets();
  const [salleId, setSalleId] = useState(salleInitiale);
  const [salles, setSalles] = useState<SalleResume[]>([]);
  const [choixLieu, setChoixLieu] = useState(false);
  const [demarrage, setDemarrage] = useState(false);
  const [tapis, setTapis] = useState(!!recette.tapis);
  // Le même écran rouvert par un lien (recette, « Tapis » demandé) garde sinon le lieu d'avant.
  useEffect(() => {
    if (recette.tapis) setTapis(true);
  }, [recette.tapis, sport.id]);
  // Séance d'exercices : jamais de GPS ni de segment ; la FC en direct si le module de suivi est là, l'écran allumé toujours.
  const vus = seance ? { segment: false, gps: false, fc: suivi.disponible } : capteursDepart(sport.id, tapis);
  const capteurs = useCapteursDepart({ gps: vus.gps, fc: vus.fc, ecran: seance ? "seance" : "suivi", demander: !seance, tuto: recette.tuto });
  // Les deux lieux du segmenté (« Extérieur » / « Intérieur », « Piscine » / « Eau libre ») ; `tapis` : le second est choisi.
  const lieux = lieuxDepart(sport.id);
  // Récupération (D11 du 30/10) : une durée visée facultative, en minutes (0 : le chrono monte).
  const recup = !seance && familleDeSeance(sport.id, tapis) === "recup";
  const [visee, setVisee] = useState(0);
  // `dureeS` : la durée estimée de la routine, le calcul de sa carte et de la feuille « Démarrer » (revue finale n° 23).
  const [routine, setRoutine] = useState<{ nom: string; etapes: Etape[]; dureeS: number } | null>(null);
  // Tapis (D3 du 29/10) : la VMA connue fixe la vitesse visée des étapes à la distance, passées au temps.
  const [vma, setVma] = useState<number | null>(null);
  const etapesVues = routine ? (vus.gps ? routine.etapes : etapesAuTemps(routine.etapes, vma)) : [];
  const [annonces, setAnnonces] = useState(true);
  // Circuit (lot F) : pour un sport qui en a, dehors, hors course guidée ; le circuit choisi, ou aucun.
  const [circuitChoisi, setCircuitChoisi] = useState<CircuitSuivi | null>(null);
  const [choixCircuit, setChoixCircuit] = useState(false);
  const avecCircuit = !seance && !routineId && vus.gps && activitesDuSport(sport.id) != null;
  useEffect(() => {
    if (!circuitId) return;
    let vivant = true;
    chargerGarde(db, circuitId)
      .then((g) => vivant && g && setCircuitChoisi(circuitSuivi(g.circuit)))
      .catch(console.error);
    return () => {
      vivant = false;
    };
  }, [db, circuitId]);

  useEffect(() => {
    listerSalles(db).then(setSalles).catch(console.error);
    lireAnnonces(db).then(setAnnonces).catch(console.error);
    if (routineId)
      lireRoutine(db, routineId)
        .then(async (r) => {
          if (!r) return;
          setRoutine({ nom: r.nom, etapes: etapesDeRoutine(lignesCourse(r)), dureeS: dureeEstimee(r) });
          setVma((await lireVmaCourante(db))?.vma ?? null);
        })
        .catch(console.error);
  }, [db, routineId]);

  const lieu = salleId ? salles.find((s) => s.id === salleId) : undefined;
  const picto = fichierPicto(pictoSport(sport.slug), null, 72);
  // Sport sans intérieur possible : le segmenté est grisé sur Extérieur, même si un lien demandait l'autre.
  const interieur = tapis && interieurPossible(sport.id);

  const lancer = async () => {
    // Tapis ou intérieur (D2 du 29/10) : le suivi en direct sans carte, avec la FC si elle est allumée.
    const sansGps = vus.gps ? null : departSansGps(suivi.disponible);
    if (sansGps === "chrono") {
      if (routineId) {
        // La séance de la routine, ses étapes au chrono (D3).
        const id = await demarrerSeanceDepuisRoutine(db, routineId);
        await modifierSeance(db, id, { salleId: salleId ?? null });
        await demanderNotifications("repos");
        await alarmeRecup.demanderHeureExacte();
      } else await demarrerSeanceSport(db, { exerciceId: sport.id, titre: sport.nom, salleId: salleId ?? null });
      seanceChangee();
      // « Écran toujours allumé » coché ici vaut aussi pour cette séance.
      ouvrirSeance({ pathname: "/session", params: capteurs.ecran ? { allume: "1" } : {} }, RETIRER);
      return;
    }
    if (!sansGps) await autoriserSuivi(!!capteurs.fcActive);
    // Temps et distance dans une notification pendant le suivi : demandée ici, expliquée d'abord ; refusée, le suivi part quand même.
    await demanderNotifications("suivi");
    await capteurs.memoriser();
    const e = await suivi.demarrer({
      mode: sansGps ?? "course",
      fc: !!capteurs.fcActive && vus.fc,
      appareil: capteurs.appareil,
      titre: titreCourt(sport),
    });
    await ecrireSuiviLance(db, {
      suiviId: e.id ?? "", exerciceId: sport.id, titre: routine?.nom ?? sport.nom, salleId: salleId ?? null, routineId,
      tapis: sansGps && routineId ? { vma } : null,
      dureeViseeS: recup && visee ? visee * 60 : null,
      circuit: avecCircuit ? circuitChoisi : null,
    });
    ouvrirSeance("/suivi/direct", RETIRER);
  };

  // Séance d'exercices : le capteur trouvé est retenu (la séance le lit à son ouverture, fc-muscu.ts), puis le même geste que le
  // récap l'avait (séance vide, routine, programme) ; le lieu est celui d'ici. Le garde « séance en cours » est dans le geste.
  const lancerSeance = async (s: DonneesRecap) => {
    await capteurs.memoriser();
    await demarrerDepuisRecap(db, { ...s, lieu: { id: salleId ?? null, nom: lieu?.nom ?? s.lieu.nom } });
  };

  // Une séance ou un suivi déjà en cours : la feuille « Tu as une séance en cours » (garde de tous les démarrages) ; annulée ou
  // reprise, l'écran reste (ou part avec la séance reprise).
  const demarrer = async () => {
    if (demarrage) return;
    setDemarrage(true);
    try {
      if (seance) {
        // Le garde est dans le geste, qui ne dit pas s'il a lancé : la séance remplace l'écran ; annulée, il reste, Démarrer rendu.
        await lancerSeance(seance);
        setDemarrage(false);
      } else if ((await demarrerSeance(lancer, RETIRER)) !== "lancee") setDemarrage(false);
    } catch (err) {
      signalerErreur()(err);
      setDemarrage(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.bg, paddingTop: insets.top }}>
      <View style={styles.barre}>
        <Appui accessibilityRole="button" accessibilityLabel={t("ui.retour")} onPress={() => router.back()} style={styles.bi} hitSlop={4}>
          <Icone nom="back" couleur={couleurs.t1} taille={22} />
        </Appui>
        {onMenu ? (
          <Appui accessibilityRole="button" accessibilityLabel={t("ps.plus")} onPress={onMenu} style={styles.bi} hitSlop={4}>
            <Icone nom="more" couleur={couleurs.t1} taille={22} />
          </Appui>
        ) : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: espace.l + 56 + Math.max(insets.bottom, espace.l) + espace.s }} showsVerticalScrollIndicator={false}>
        <View style={styles.sport}>
          <View style={[styles.pic, { backgroundColor: couleurs.s1 }]}>
            {picto != null ? (
              <Image source={picto} style={styles.picImg} />
            ) : seance ? (
              <View style={styles.picVide}>
                <Icone nom="dumbbell" couleur={couleurs.t2} taille={32} />
              </View>
            ) : null}
          </View>
          <View style={styles.titres}>
            <Texte accessibilityRole="header" numberOfLines={2} style={styles.h1}>
              {routine?.nom ?? sport.nom}
            </Texte>
            {quand ? (
              <Texte numberOfLines={1} couleur="t2" style={stylesDepart.small}>
                {quand}
              </Texte>
            ) : null}
            {routine ? (
              <Texte couleur="t2" style={stylesDepart.small}>
                {t("gps.guide.resume", { n: etapesVues.length, duree: approx(dureeCourte(routine.dureeS)) })}
              </Texte>
            ) : null}
          </View>
        </View>
        {vus.segment && interieurPossible(sport.id) ? (
          <View style={styles.segment}>
            <Segmente<"dehors" | "tapis">
              options={[
                { valeur: "dehors", libelle: lieux?.[0] ?? t("gps.exterieur") },
                { valeur: "tapis", libelle: lieux?.[1] ?? t("gps.interieur") },
              ]}
              valeur={interieur ? "tapis" : "dehors"}
              onChange={(v) => setTapis(v === "tapis")}
            />
          </View>
        ) : null}
        {seance ? (
          <View style={styles.carte}>
            <CarteSeance r={seance} />
          </View>
        ) : null}

        <Texte variante="entete" couleur="t3" style={styles.entete}>
          {t("gps.lieu")}
        </Texte>
        {/* La ligne de lieu du sélecteur (LigneDeLieu) : avatar du lieu, adresse courte. */}
        <LigneDeLieu
          icone={lieu ? pictoLieu(lieu.type) : "place"}
          avatar={!!lieu}
          nom={lieu?.nom ?? t("gps.sansLieu")}
          sous={lieu ? sousTitreLieu(lieu) : undefined}
          fin="right"
          marge={espace.xl}
          onPress={() => setChoixLieu(true)}
        />

        {avecCircuit ? (
          <>
            <Texte variante="entete" couleur="t3" style={styles.entete}>
              {t("circuit.suivre.titre")}
            </Texte>
            <Appui
              accessibilityRole="button"
              accessibilityLabel={circuitChoisi ? t("circuit.suivre.ligne", { nom: circuitChoisi.nom, resume: chiffresCircuit(circuitChoisi) }) : t("circuit.suivre.ligneVide")}
              onPress={() => setChoixCircuit(true)}
              style={stylesDepart.lt}
            >
              <Tuile icone="circuit" couleur={couleurs.t2} />
              <View style={stylesDepart.tx}>
                <Texte numberOfLines={1} style={stylesDepart.b}>
                  {circuitChoisi?.nom ?? t("circuit.suivre.aucun")}
                </Texte>
                <Texte numberOfLines={1} couleur="t2" style={stylesDepart.small}>
                  {circuitChoisi ? chiffresCircuit(circuitChoisi) : t("circuit.suivre.aucunAide")}
                </Texte>
              </View>
              <Icone nom="right" couleur={couleurs.t3} taille={22} />
            </Appui>
          </>
        ) : null}

        {recup ? (
          <>
            <Texte variante="entete" couleur="t3" style={styles.entete}>
              {t("gps.dureeVisee")}
            </Texte>
            <View style={styles.segment}>
              <Segmente<string>
                options={[{ valeur: "0", libelle: t("gps.sansDuree") }, ...DUREES_VISEES_MIN.map((m) => ({ valeur: String(m), libelle: t("gps.guide.minCourt", { n: m }) }))]}
                valeur={String(visee)}
                onChange={(v) => setVisee(Number(v))}
              />
            </View>
          </>
        ) : null}

        {vus.fc || seance ? (
          <>
            <Texte variante="entete" couleur="t3" style={styles.entete}>
              {t("gps.capteurs")}
            </Texte>
            <SectionCapteurs c={capteurs} gps={vus.gps} fc={vus.fc} recette={recette} />
            {routineId ? (
              <>
                <View style={[stylesDepart.filet, { backgroundColor: couleurs.line }]} />
                <LigneDepart icone="voix" titre={t("gps.guide.annonces")} sous={t("gps.guide.annoncesSous")}>
                  <Interrupteur
                    libelle={t("gps.guide.annonces")}
                    valeur={annonces}
                    onChange={(v) => {
                      setAnnonces(v);
                      ecrireAnnonces(db, v).catch(signalerErreur());
                    }}
                  />
                </LigneDepart>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.bas, { paddingBottom: Math.max(insets.bottom, espace.l) + espace.s }]}>
        <BoutonPrincipal libelle={t("gps.demarrer")} icone="play" onPress={() => demarrer().catch(console.error)} desactive={demarrage} style={styles.geste} />
      </View>

      {avecCircuit ? (
        <FeuilleCircuits
          visible={choixCircuit}
          sportId={sport.id}
          choisi={circuitChoisi}
          onFermer={() => setChoixCircuit(false)}
          onChoisir={(c) => {
            setChoixCircuit(false);
            setCircuitChoisi(c ? circuitSuivi(c) : null);
          }}
        />
      ) : null}

      <FeuilleSalle
        visible={choixLieu}
        surPlace
        sport={sport}
        salleId={salleId}
        onFermer={() => setChoixLieu(false)}
        onChoisir={(id) => {
          setChoixLieu(false);
          setSalleId(id);
          listerSalles(db).then(setSalles).catch(console.error);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: espace.xs },
  bi: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  sport: { flexDirection: "row", alignItems: "center", gap: espace.l, paddingTop: espace.xs, paddingHorizontal: espace.xl, paddingBottom: espace.s },
  pic: { width: 72, height: 72, borderRadius: rayon.l, overflow: "hidden" },
  picImg: { width: 72, height: 72, resizeMode: "contain" },
  picVide: { flex: 1, alignItems: "center", justifyContent: "center" },
  titres: { flex: 1, minWidth: 0 },
  h1: { fontFamily: police.semibold, fontSize: 24, letterSpacing: -0.24 },
  entete: { paddingTop: espace.xxl, paddingHorizontal: espace.xl, paddingBottom: espace.s },
  bas: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: espace.l, paddingHorizontal: espace.l },
  geste: { height: 56 },
  segment: { paddingHorizontal: espace.xl, paddingTop: espace.l },
  // La carte de la séance (GroupeReglages pose déjà ses 16 de marge) : le même air que le segmenté
  carte: { paddingTop: espace.l },
});
