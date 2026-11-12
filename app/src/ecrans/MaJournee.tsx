// Capteurs de la page Sport (planche sport-programmes-routines v2, retour 10, D11 ; planche sport-stats v2, S3 bis ; carte
// compacte du 31/10) : une ligne par capteur relié et utile, un point vert à côté du nom dit « relié » (ambre : à
// reconnecter), la FC en direct s'écrit sur la ligne (capteurs-sport.ts) ; aucun capteur relié : pas de carte (on relie depuis Réglages › Connexions). Les chiffres du jour
// (dépense, pas, effort) sont passés dans la rangée des jauges, sous la date (RangeeSport.tsx).
// Données : journee-donnees.ts (Whoop), Santé Connect (autorisation des pas, applis qui y écrivent : applis-sante.ts), le service de
// suivi (FC en direct), l'écoute du capteur cardiaque Bluetooth (voir `useEcouteCapteur`).
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, View } from "react-native";
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { router, useIsFocused } from "expo-router";
import { useFocusEffect } from "../ui/focus-prechauffe";
import { t } from "../i18n/index";
import { sante, type PermissionSante } from "../natif/sante";
import { suivi, type EtatSuivi } from "../natif/suivi";
import { seanceEnCours } from "../db";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { comete } from "../theme/mouvement";
import { ecouterReveilAura, inactiviteAura } from "../ui/aura-etat";
import { courbes } from "../ui/mouvement";
import { Icone, type NomIcone } from "../ui/Icone";
import { Repli } from "../ui/Repli";
import { Appui } from "../ui/mouvement";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { creerMemoire } from "./memoire-jours";
import { Os } from "./mesures/gabarit";
import { heure, jourMois } from "./format";
import { etatBle, rondsCapteurs, type PhaseEcoute, type Rond } from "./capteurs-sport";
import { lireApplisSante } from "./applis-sante";
import { ouvrirWhoop } from "./appareils-proximite";
import { nomCapteur } from "./capteur-cardiaque";
import { FeuilleFc } from "./FeuilleFc";
import { etatTuto } from "./suivi-direct-vue";
import { useCapteursDepart } from "./useCapteursDepart";
import { lireJournee, PERMISSION_PAS, type Journee } from "./journee-donnees";
import { avantChangementComete, cadenceComete, type CadenceComete } from "./bandeau-seance";

const minuitDe = (date: string) => {
  const [a, m, j] = date.split("-").map(Number);
  return new Date(a!, m! - 1, j!).getTime();
};

type Sante = { disponible: boolean; autorise: boolean; applis: string[] };

/** Écoute du capteur cardiaque Bluetooth : 5 s, une fois à l'ouverture de la page Effort (au premier plan, hors séance), puis au
 *  plus une fois toutes les 5 min (la page rouverte ou remontée ne relance rien) ; jamais en boucle, jamais en arrière-plan. */
export const ECOUTE_BLE_MS = 5000;
export const VIE_ECOUTE_BLE_MS = 5 * 60_000;
/** Dernière écoute, au niveau du module (la carte est remontée quand on revient sur aujourd'hui) : son départ, et le capteur
 *  trouvé (null : rien ; undefined : écoute pas finie). */
let departEcoute: number | null = null;
let nomEcoute: string | null | undefined;

/** Dernière lecture de chaque jour, au niveau de l'onglet (memoire-jours.ts) : revenue sur aujourd'hui, la page du jour est
 *  remontée, et la carte revient tout de suite avec ce qu'elle montrait, puis se met à jour (docs/JAUGES-PASSE.md). */
const memoireCapteurs = creerMemoire<{ j: Journee; sc: Sante }>({ vieMs: 0, max: 4 });

/** `visible` faux : la carte fond et sa place se referme, mais ses données restent lues, pour qu'elle revienne entière
 *  (rouverte vide, le repli ne voyait jamais arriver sa hauteur ; vu à l'émulateur le 31/10). */
export function MaJournee({ date, aujourdhui, visible = true, demoFc, demoCapteurs }: {
  date: string;
  aujourdhui: boolean;
  visible?: boolean;
  demoFc?: number | null;
  /** Recette (pepfitopen://train?applis=Whoop,Withings&ble=Polar H10) : Santé Connect et la ligne Bluetooth imposés à l'écran seulement ; ble : « aucun », « cherche » ou un nom. */
  demoCapteurs?: { applis?: string[]; ble?: string } | null;
}) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [j, setJ] = useState<Journee | null>(() => memoireCapteurs.lu(date)?.j ?? null);
  const [sc, setSc] = useState<Sante>(() => memoireCapteurs.lu(date)?.sc ?? { disponible: false, autorise: false, applis: [] });
  // FC en direct : celle du service de suivi, tant qu'une séance avec FC tourne (environ 1 Hz).
  const [fc, setFc] = useState<EtatSuivi["fc"] | null>(null);
  useEffect(() => {
    if (!suivi.disponible || !aujourdhui) return;
    const lire = (e: EtatSuivi | null) => setFc(e && e.statut !== "arrete" ? e.fc : null);
    suivi.etat().then(lire).catch(() => {});
    return suivi.ecouter(lire);
  }, [aujourdhui]);

  const charger = useCallback(async () => {
    const minuit = minuitDe(date);
    // Les deux posés ensemble : la carte ne change qu'une fois (pas un rond Whoop, puis la montre un instant après).
    const { j: lu, sc: s } = await memoireCapteurs.charger(date, async () => {
      const [lu, dispo] = await Promise.all([lireJournee(db, minuit), sante.disponible().catch(() => false)]);
      const autorise = dispo && (await sante.autorisees().catch((): PermissionSante[] => [])).includes(PERMISSION_PAS);
      // Les applis qui écrivent dans Santé Connect : une lecture légère gardée 10 min (applis-sante.ts), pas une par ouverture
      const applis = autorise ? await lireApplisSante(sante) : [];
      return { j: lu, sc: { disponible: dispo, autorise, applis } };
    });
    setJ(lu);
    setSc(s);
  }, [db, date]);

  // À l'arrivée sur l'onglet ou sur la page ; déjà montrée (mémoire) : relue après le glissé des pages, pas pendant.
  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(() => void charger().catch(console.error), memoireCapteurs.lu(date) ? 600 : 0);
      return () => clearTimeout(id);
    }, [charger, date]),
  );

  const ecoute = useEcouteCapteur(visible && aujourdhui);
  const demoBle = demoCapteurs?.ble;
  const ble = demoBle ? (demoBle === "aucun" ? { etat: "aucun" as const } : demoBle === "cherche" ? { etat: "cherche" as const } : { etat: "trouve" as const, nom: demoBle }) : ecoute.ble;

  const ronds = j
    ? rondsCapteurs({
        whoop: j.whoop,
        sante: demoCapteurs?.applis ? { disponible: true, autorise: true, applis: demoCapteurs.applis } : { disponible: sc.disponible, autorise: sc.autorise, applis: sc.applis },
        ble,
        // Recette (pepfitopen://train?fc=128) : une ceinture simulée à l'écran seulement, pour voir le rond en direct sans capteur.
        fc: aujourdhui ? (demoFc ? { etat: "connecte", bpm: demoFc, appareil: "Polar H10" } : fc) : null,
        maintenant: Date.now(),
      })
    : [];
  if (j) lignesVues = ronds.length;
  // Rien encore lu depuis le lancement : le squelette des jauges, une ligne par capteur vu la dernière fois (une au départ).
  const attente = !j && aujourdhui;

  return (
    <>
    <Repli ouvert={visible && (attente ? lignesVues > 0 : ronds.length > 0)}>
      <View>
        <View style={styles.sect}>
          <Texte variante="entete" couleur="t2">
            {t("journee.capteurs")}
          </Texte>
        </View>
        <View style={[styles.carte, styles.ronds, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }]}>
          {attente
            ? Array.from({ length: lignesVues }, (_, i) => <RondSquelette key={i} />)
            : ronds.map((r) => <RondCapteur key={r.id} r={r} onPress={r.etat === "aucun" ? () => ecoute.c.ouvrirTuto("fc") : () => router.push("/settings/connexions")} />)}
        </View>
      </View>
    </Repli>
    {ble ? (
      <FeuilleFc
        tuto={ecoute.c.tuto}
        etat={ecoute.c.tuto ? etatTuto(ecoute.c.tuto, ecoute.c.essaye, ecoute.c.fc, ecoute.c.appareils) : null}
        onFermer={ecoute.c.fermerTuto}
        onReessayer={ecoute.c.reessayerFc}
        onOuvrirWhoop={() => ouvrirWhoop().catch(console.error)}
        onOuvrirReglages={() => Linking.openSettings().catch(console.error)}
      />
    ) : null}
    </>
  );
}

/**
 * Le capteur cardiaque Bluetooth de la carte (07/11) : le même mécanisme que le départ d'un suivi (useCapteursDepart,
 * suivi.chercherFc : une écoute qui repère les capteurs annonçant le service cardio 0x180D, SANS s'y connecter, la Whoop
 * n'acceptant qu'un récepteur). Seulement si la FC en direct est allumée ET « Appareils à proximité » déjà accordés (rien n'est
 * jamais demandé d'ici). Une écoute de 5 s à l'ouverture de la page (1,2 s après, le temps qu'elle s'affiche), puis une par
 * 5 min au plus ; pas pendant une séance (suivi en cours, séance de muscu ouverte), pas hors du premier plan. Plusieurs
 * capteurs : le dernier utilisé (capteurRetenu, dans le hook).
 */
function useEcouteCapteur(actif: boolean) {
  const { db } = useApp();
  const c = useCapteursDepart({ gps: false, fc: true, ecran: "seance", demander: false, auto: false, dureeMs: ECOUTE_BLE_MS });
  const { chercherFc } = c;
  const [phase, setPhase] = useState<PhaseEcoute>("avant");
  // La ligne a lieu d'être : module de suivi présent, FC en direct allumée, « Appareils à proximité » accordés
  const possible = suivi.disponible && c.fcActive === true && c.appareils === true;

  useFocusEffect(
    useCallback(() => {
      if (!actif || !possible) return;
      const maintenant = Date.now();
      if (departEcoute != null && maintenant >= departEcoute && maintenant - departEcoute < VIE_ECOUTE_BLE_MS) return;
      const id = setTimeout(async () => {
        if (AppState.currentState !== "active") return;
        const [en, seance] = await Promise.all([suivi.etat().catch(() => null), seanceEnCours(db).catch(() => null)]);
        if ((en && en.statut !== "arrete") || seance) return setPhase("seance");
        departEcoute = Date.now();
        nomEcoute = undefined;
        setPhase("cours");
        await chercherFc();
        setPhase("fini");
      }, 1200);
      return () => clearTimeout(id);
    }, [actif, possible, db, chercherFc]),
  );

  // Le résultat de l'écoute (ou d'un essai du tuto) est gardé pour la prochaine ouverture de la carte
  const trouve = c.fc.etat === "trouvee" ? nomCapteur(c.fc.appareil) : null;
  const regle = phase === "fini" && (c.fc.etat === "trouvee" || c.fc.etat === "absente");
  useEffect(() => {
    if (regle) nomEcoute = trouve;
  }, [regle, trouve]);

  return { c, ble: possible ? etatBle(phase, c.fc.etat, trouve, nomEcoute) : null };
}

/** Lignes de la carte la dernière fois qu'elle a été lue (une avant la première lecture). */
let lignesVues = 1;

/** Ligne de capteur en attente : picto estompé, barres du squelette (Os) à la place du nom et de l'état. */
function RondSquelette() {
  const { couleurs } = useTheme();
  return (
    <View style={styles.capt} accessible accessibilityLabel={t("mesures.chargement")}>
      <View style={[styles.picCadre, { opacity: 0.5 }]}>
        <Icone nom="sante" couleur={couleurs.t3} taille={22} />
      </View>
      <View style={[styles.capTx, { gap: 6 }]}>
        <Os largeur={72} hauteur={11} rayon={5} />
        <Os largeur={96} hauteur={10} rayon={5} />
      </View>
    </View>
  );
}

/** Onde du capteur en direct : elle part et s'efface, puis un temps posé. */
const ONDE_MS = 1400;
const ONDE_REPOS_MS = 600;

const quand = (ms: number) => (new Date(ms).toDateString() === new Date().toDateString() ? heure(ms) : jourMois(ms));

/** Un capteur sur une ligne (31/10) : son picto à gauche, puis le point de l'état (vert relié, ambre à reconnecter) et
 * le nom, et dessous la ligne secondaire (« Synchro 9:31 », la FC en direct). Onde verte autour du picto toutes les 2 s. */
function RondCapteur({ r, onPress }: { r: Rond; onPress: () => void }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const direct = r.etat === "direct";
  const diffuse = r.etat === "diffuse";
  const point = r.etat === "revoir" ? couleurs.echauffement : r.etat === "cherche" || r.etat === "aucun" ? couleurs.t3 : couleurs.valide;
  const nom = r.nom ?? (r.id === "sante" ? (Platform.OS === "ios" ? t("journee.santeIos") : t("journee.sante")) : r.id === "ble" ? t("gps.capteurCardiaque") : t("journee.capteurFc"));
  const etat =
    r.etat === "direct"
      ? t("journee.enDirect")
      : r.etat === "revoir"
        ? t("journee.aReconnecter")
        : diffuse
          ? t("gps.fcDiffusee")
          : r.etat === "cherche"
            ? t("gps.recherche")
            : r.etat === "aucun"
              ? t("journee.aucunCapteur")
              : r.id === "sante"
                ? r.applis.length
                  ? r.applis.join(", ")
                  : t("journee.aucuneDonnee")
                : r.synchro != null
                  ? t("journee.synchroA", { quand: quand(r.synchro) })
                  : t("journee.whoopJamais");
  const icone: NomIcone = r.id === "whoop" ? "sante" : r.id === "sante" ? "sync" : "coeur";
  // Onde : un anneau vert qui part du rond et s'efface (1,4 s), puis un temps de repos (0,6 s). Au rythme de l'aura, comme la
  // comète de la bulle (revue finale n° 63) : une onde toutes les 4 s après 6 s sans geste, plus rien après 14 s ; un geste la
  // relance. Rien hors de l'onglet ni sous « Réduire les animations ».
  const premierPlan = useIsFocused();
  const anime = direct && !reduit && premierPlan;
  const onde = useSharedValue(0);
  useEffect(() => {
    if (!anime) {
      cancelAnimation(onde);
      onde.value = 0;
      return;
    }
    const une = () => withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: ONDE_MS, easing: courbes.sortie }), withTiming(1, { duration: ONDE_REPOS_MS }));
    let etat: CadenceComete | null = null;
    let changement: ReturnType<typeof setTimeout> | undefined;
    let suivante: ReturnType<typeof setTimeout> | undefined;
    const passer = (c: CadenceComete) => {
      if (c === etat) return;
      etat = c;
      clearTimeout(suivante);
      if (c === "pleine") {
        onde.value = withRepeat(une(), -1);
        return;
      }
      // Hors cadence pleine : l'onde en cours finit de s'effacer (sans saut), puis plus de boucle.
      cancelAnimation(onde);
      onde.value = withTiming(1, { duration: Math.max(0, (1 - onde.value) * ONDE_MS), easing: courbes.sortie });
      if (c === "repos") {
        const relancer = () => {
          onde.value = une();
          suivante = setTimeout(relancer, comete.periodeRepos);
        };
        suivante = setTimeout(relancer, comete.periodeRepos);
      }
    };
    const regler = () => {
      const inactif = inactiviteAura();
      passer(cadenceComete(inactif, false));
      clearTimeout(changement);
      const reste = avantChangementComete(inactif, false);
      if (reste != null) changement = setTimeout(regler, reste + 16);
    };
    regler();
    const arreter = ecouterReveilAura(regler);
    return () => {
      arreter();
      clearTimeout(changement);
      clearTimeout(suivante);
      cancelAnimation(onde);
    };
  }, [anime, onde]);
  const styleOnde = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - onde.value), transform: [{ scale: 1 + 0.32 * onde.value }] }));
  const lu = direct ? t("journee.bpmLu", { nom, bpm: String(r.bpm) }) : `${nom}, ${etat}`;
  return (
    <Appui accessibilityRole="button" accessibilityLabel={lu} onPress={onPress} style={styles.capt}>
      <View style={styles.picCadre}>
        {anime ? <Reanimated.View pointerEvents="none" style={[styles.onde, { borderColor: couleurs.valide }, styleOnde]} /> : null}
        <Icone nom={icone} couleur={r.etat === "revoir" ? couleurs.echauffement : couleurs.t2} taille={22} />
      </View>
      <View style={styles.capTx}>
        <View style={styles.capNomLigne}>
          <View style={[styles.point, { backgroundColor: point }]} />
          <Texte numberOfLines={1} style={[styles.capNom, { color: couleurs.t1 }]}>
            {nom}
          </Texte>
        </View>
        <Texte numberOfLines={1} variante="meta" style={{ color: r.etat === "revoir" ? couleurs.echauffement : diffuse ? couleurs.valide : couleurs.t2, fontFamily: r.etat === "revoir" ? police.medium : undefined }}>
          {direct ? (
            <>
              <Texte variante="meta" style={[styles.bpm, { color: couleurs.t1 }]}>{`${r.bpm} ${t("journee.bpm")}`}</Texte>
              {`, ${etat}`}
            </>
          ) : (
            etat
          )}
        </Texte>
      </View>
    </Appui>
  );
}

const styles = StyleSheet.create({
  sect: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginTop: espace.m },
  carte: { borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  // Carte compacte (31/10) : un capteur par ligne, côte à côte si la largeur le permet, sinon les uns sous les autres.
  ronds: { flexDirection: "row", flexWrap: "wrap", paddingVertical: espace.xs, paddingHorizontal: espace.xs },
  capt: { flexGrow: 1, flexBasis: 150, minWidth: 0, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: espace.s },
  // Picto de 22 sans rond ; l'onde du direct part d'un cercle de 32 autour de lui.
  picCadre: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  onde: { position: "absolute", width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  capTx: { flex: 1, minWidth: 0 },
  bpm: { fontFamily: police.semibold, fontVariant: ["tabular-nums"] },
  capNomLigne: { flexDirection: "row", alignItems: "center", gap: 6 },
  capNom: { fontFamily: police.medium, fontSize: 13, flexShrink: 1 },
  point: { width: 7, height: 7, borderRadius: 3.5 },
});
