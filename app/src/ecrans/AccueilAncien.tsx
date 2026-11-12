import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { SQLiteDatabase } from "expo-sqlite";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ecrireAccueil } from "../db";
import { compteurEcritures } from "../db/exclusif";
import {
  aAjouter, ajouter, changerTaille, defBloc, descendre, fusionnerCaches, monter, ordreAffiche, retirer, visibles,
  type Bloc, type IdBloc, type Taille,
} from "./accueil-blocs";
import { lireAccueilBase, type DonneesAccueil } from "./accueil-donnees";
import { FRAICHEUR_CHARGE_MS } from "./memoire-charges";
import { chargerCartes, CLE_CARTE, type DonneesCartes, type IdCarte } from "./mesures/cartes-donnees";
import { actionBloc, ContenuBloc, libelleBloc } from "./BlocsAccueil";
import { useBienvenue } from "./bienvenue-donnees";
import { useApp, useCharge } from "./contexte";
import { signalerPremierEcran } from "./fond";
import { FeuillePoids } from "./FeuillePoids";
import { retourMois } from "./Planif";
import { useTheme } from "../theme";
import { duree, glissement } from "../theme/mouvement";
import { espace, police, rayon } from "../theme/typo";
import { t, tp } from "../i18n/index";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { BarreHaut, BoutonIcone, BoutonOk, TeteOnglet } from "../ui/Cadre";
import { LARGEUR_MIN_LOGO } from "../ui/logo";
import { LogoPepfit } from "../ui/LogoPepfit";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { signalerErreur } from "../ui/FeuilleMessage";
import { PlaceBloc, useGlisserAccueil } from "../ui/GlisserAccueil";
import { useHautALArrivee } from "../ui/haut-arrivee";
import { Icone } from "../ui/Icone";
import { courbes } from "../ui/mouvement";
import { useBulle } from "../ui/CoucheBulle";
import { useEspaceMenu, useMargeMenu, useMasquerMenu } from "../ui/MenuFlottant";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { useReduit } from "../ui/reduit";

// ANCIEN ACCUEIL, désactivé (Social v4, A) : l'onglet Accueil est maintenant le fil (app/(tabs)/feed.tsx) et « / » redirige vers le
// premier onglet allumé (app/(tabs)/index.tsx). Ce composant et ses blocs (accueil-blocs, BlocsAccueil, cartes) sont gardés tels
// quels, prêts à être rebranchés ; rien ne le monte aujourd'hui.
// Accueil modulable (planche B · Mosaïque, validée le 27/10) : une grille dense de blocs pleins ou demis, dans l'ordre
// choisi. « Modifier l'accueil » (fin de liste, ou appui long sur un bloc) : glisser pour déplacer, ✕ pour retirer (8 s
// pour annuler), toucher un bloc pour sa taille et son ordre, « Ajouter un bloc » pour le catalogue. Menu du bas masqué.

const ECART = espace.s;
const DELAI_ANNULER_MS = 8000;

/** Cartes de mesure gardées d'une visite à l'autre (M9, docs/PERF-A.md) : l'Accueil remonté les montre tout de suite, puis
 * les relit (pas avant 30 s sans écriture dans la base, comme useCharge) ; une seule lecture à la fois. */
const gardees: { cartes: DonneesCartes; lu: number; ecritures: number; enCours: boolean; montrer: ((c: DonneesCartes) => void) | null } = {
  cartes: {},
  lu: -Infinity,
  ecritures: -1,
  enCours: false,
  montrer: null,
};

/** Les cartes de mesure de l'Accueil, chacune posée à son arrivée, après les blocs de la base (`ids` : lus avec eux) ;
 * `enAttente` : celles jamais lues encore. `relire` : tout de suite (une pesée ajoutée). */
function useCartesAccueil(db: SQLiteDatabase, ids: readonly IdCarte[] | undefined) {
  const [cartes, setCartes] = useState<DonneesCartes>(gardees.cartes);
  useEffect(() => {
    gardees.montrer = setCartes;
    setCartes(gardees.cartes);
    return () => void (gardees.montrer === setCartes && (gardees.montrer = null));
  }, []);
  const cle = ids?.join(",");
  const lire = useCallback(
    (forcer: boolean) => {
      if (!ids?.length) return;
      // une lecture déjà en cours (retour sur l'onglet avant sa fin) : pas doublée, ses cartes se posent quand même
      if (gardees.enCours && !forcer) return;
      const tout = ids.every((id) => CLE_CARTE[id] in gardees.cartes);
      if (!forcer && tout && Date.now() - gardees.lu < FRAICHEUR_CHARGE_MS && gardees.ecritures === compteurEcritures()) return;
      const ecritures = compteurEcritures();
      const debut = Date.now();
      gardees.enCours = true;
      chargerCartes(db, ids, (k, v) => {
        gardees.cartes = { ...gardees.cartes, [k]: v };
        gardees.montrer?.(gardees.cartes);
      })
        .then(() => Object.assign(gardees, { lu: debut, ecritures }))
        .catch(console.error)
        .finally(() => (gardees.enCours = false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, cle],
  );
  useFocusEffect(useCallback(() => lire(false), [lire]));
  const enAttente = useMemo(() => new Set((ids ?? []).filter((id) => !(CLE_CARTE[id] in cartes))), [cle, cartes]);
  return { cartes, enAttente, relire: () => lire(true) };
}

/**
 * `poussee` : la page « Tableau de bord » de ton profil (retour du 05/11) : retour et titre à la place du logo, le reste est
 * l'ancien Accueil, modifiable à ta main.
 */
export function AccueilAncien({ poussee = false }: { poussee?: boolean }) {
  const { db, reglages } = useApp();
  const { couleurs, mode } = useTheme();
  const u = reglages.unite;
  // La base d'abord (blocs posés tout de suite, gardés d'une visite à l'autre), puis les cartes de mesure (M9, M12)
  const [base, rechargerBase] = useCharge((b) => lireAccueilBase(b), [db], undefined, "accueil");
  const { cartes, enAttente, relire: relireCartes } = useCartesAccueil(db, base?.cartesVoulues);
  const d = useMemo<DonneesAccueil | undefined>(() => base && { ...base, cartes, enAttente }, [base, cartes, enAttente]);
  const recharger = () => {
    relireCartes();
    return rechargerBase();
  };
  const marge = useMargeMenu();
  const espaceMenu = useEspaceMenu();
  // La bulle de séance est une couche partagée (ui/CoucheBulle) : le contenu défile dessous, on lui réserve sa place.
  const bulle = useBulle();
  const zone = bulle.hauteur + espaceMenu;

  // Copie locale des blocs stockés : une modification s'affiche tout de suite, la base suit.
  const [blocs, setBlocs] = useState<Bloc[] | null>(null);
  const blocsRef = useRef<Bloc[]>([]);
  blocsRef.current = blocs ?? [];
  useEffect(() => {
    if (base) setBlocs(base.stockes);
  }, [base]);

  // L'icône calendrier ouvre le mois d'Entraînements, comme dans Entraînements et Nutrition (audit, constat 5 ; l'Historique
  // reste dans le volet et sous « Cette semaine ») : un jour touché y ramène, et c'est la page Entraînements qui le montre.
  useFocusEffect(
    useCallback(() => {
      if (retourMois.jour) router.navigate("/train");
    }, []),
  );

  const [edition, setEdition] = useState(false);
  const [options, setOptions] = useState<IdBloc | null>(null);
  const [ajout, setAjout] = useState(false);
  const [poidsOuvert, setPoidsOuvert] = useState(false);
  const [largeur, setLargeur] = useState(0);
  useMasquerMenu(edition);

  // Retrait différé : le bloc disparaît, la base ne change qu'à la fin du délai, à la modification suivante ou en quittant.
  const [enRetrait, setEnRetrait] = useState<IdBloc | null>(null);
  const attente = useRef<{ id: IdBloc; minuterie: ReturnType<typeof setTimeout> } | null>(null);

  /** Applique `f` aux blocs visibles (le retrait en attente devient définitif) et enregistre. */
  const appliquer = useCallback(
    (f: (v: Bloc[]) => Bloc[]) => {
      const a = attente.current;
      if (a) clearTimeout(a.minuterie);
      attente.current = null;
      setEnRetrait(null);
      const stockes = blocsRef.current;
      const base = ordreAffiche(visibles(stockes).filter((b) => b.id !== a?.id));
      const tout = fusionnerCaches(stockes, f(base));
      blocsRef.current = tout;
      setBlocs(tout);
      ecrireAccueil(db, tout).catch(signalerErreur());
    },
    [db],
  );
  const appliquerRef = useRef(appliquer);
  appliquerRef.current = appliquer;
  // En quittant l'écran, le retrait en attente est fait.
  useEffect(
    () => () => {
      if (attente.current) appliquerRef.current((v) => v);
    },
    [],
  );

  const retirerBloc = (id: IdBloc) => {
    if (attente.current) appliquer((v) => v);
    setOptions(null);
    const minuterie = setTimeout(() => appliquerRef.current((v) => v), DELAI_ANNULER_MS);
    attente.current = { id, minuterie };
    setEnRetrait(id);
  };
  const annulerRetrait = () => {
    if (attente.current) clearTimeout(attente.current.minuterie);
    attente.current = null;
    setEnRetrait(null);
  };
  const quitter = useCallback(() => {
    if (attente.current) appliquer((v) => v);
    setOptions(null);
    setAjout(false);
    setEdition(false);
  }, [appliquer]);

  // Réglages › Par partie › Accueil (pepfitopen://?modifier=1) : l'accueil s'ouvre en mode Modifier.
  const modifier = useLocalSearchParams<{ modifier?: string }>().modifier;
  useEffect(() => {
    if (modifier !== "1") return;
    setEdition(true);
    router.setParams({ modifier: undefined });
  }, [modifier]);

  // Retour Android : quitte le mode Modifier.
  useEffect(() => {
    if (!edition) return;
    const s = BackHandler.addEventListener("hardwareBackPress", () => {
      quitter();
      return true;
    });
    return () => s.remove();
  }, [edition, quitter]);

  const affiches = ordreAffiche(visibles(blocs ?? []).filter((b) => b.id !== enRetrait));
  const glisse = useGlisserAccueil({
    blocs: affiches,
    largeur,
    ecart: ECART,
    marge: espace.l,
    margeBas: 0,
    onDeposer: (l) => appliquer(() => l),
  });
  // Arrivée par le menu : en haut, d'un coup ; onglet re-touché : remonte en haut en défilant (29/10).
  useHautALArrivee(poussee ? "/tableau-de-bord" : "/", glisse.scrollProps.ref);
  // l'Accueil rempli : la synchro, les imports et les préchargements peuvent partir (ecrans/fond.ts)
  const rempli = !!d && !!blocs;
  useEffect(() => {
    if (rempli) signalerPremierEcran();
  }, [rempli]);

  if (!d || !blocs) return <View style={{ flex: 1 }} />;

  const bord = edition ? 1 : StyleSheet.hairlineWidth;
  const filet = mode === "nuit" ? couleurs.s3 : couleurs.line2;
  const proposes = aAjouter(affiches);
  const choisi = options ? affiches.find((b) => b.id === options) : undefined;
  const rangChoisi = choisi ? affiches.indexOf(choisi) : -1;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      {edition ? (
        <View style={styles.teteModif}>
          <Texte variante="titre" numberOfLines={1} style={{ flex: 1, marginLeft: espace.xl }}>
            {t("accueil.modifier.titre")}
          </Texte>
          <BoutonOk onPress={quitter} />
        </View>
      ) : poussee ? (
        <BarreHaut titre={t("pr.tableauBord")}>
          <BoutonIcone nom="cal" libelle={t("planif.ouvrirMois")} onPress={() => router.push("/calendrier")} />
        </BarreHaut>
      ) : (
        <TeteOnglet avatar titre={<LogoPepfit largeur={LARGEUR_LOGO} />}>
          <BoutonIcone nom="cal" libelle={t("planif.ouvrirMois")} onPress={() => router.push("/calendrier")} />
        </TeteOnglet>
      )}
      <View {...glisse.zoneProps} style={{ flex: 1 }}>
        <ScrollView {...glisse.scrollProps} contentContainerStyle={{ paddingBottom: bulle.enCours && !edition ? zone + espace.l : marge }}>
          {/* Le message de bienvenue fait partie du contenu : il défile avec la page, l'en-tête (avatar, calendrier) reste fixe. */}
          {edition ? null : <Bienvenue />}
          <View style={styles.grille}>
            <View
              onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
              style={{ height: glisse.hauteur, opacity: glisse.pret && largeur > 0 ? 1 : 0 }}
            >
              {affiches.map((b) => {
                const tenu = glisse.tenu === b.id;
                const action = edition ? null : actionBloc(b.id, d, () => setPoidsOuvert(true), b.taille);
                const rect = glisse.places.get(b.id)!;
                return (
                  <PlaceBloc
                    key={b.id}
                    pos={glisse.position(b.id)}
                    rect={rect}
                    tenu={tenu}
                    animer={edition}
                    {...(edition ? glisse.toucher(b.id) : {})}
                  >
                    <Pressable
                      accessibilityRole={edition || action ? "button" : undefined}
                      accessibilityLabel={edition ? t("accueil.modifier.optionsDe", { nom: libelleBloc(b.id) }) : undefined}
                      disabled={!edition && !action}
                      onPress={() => {
                        if (glisse.recent()) return;
                        if (edition) setOptions(b.id);
                        else action?.();
                      }}
                      onLongPress={edition ? undefined : () => setEdition(true)}
                      delayLongPress={350}
                      style={({ pressed }) => [
                        styles.carte,
                        { borderWidth: bord, borderColor: edition ? filet : couleurs.verreFilet, backgroundColor: pressed && !edition ? couleurs.s2 : couleurs.verreCarte },
                        tenu && { boxShadow: "0 12px 28px rgba(0,0,0,0.28)" },
                      ]}
                    >
                      {/* Le contenu garde sa hauteur naturelle (non étirée par la rangée) : c'est elle qu'on mesure. */}
                      <View onLayout={glisse.mesure(b.id, bord)} style={[styles.contenu, b.taille === "demie" && styles.contenuDemi]}>
                        {edition ? <Controle bloc={b} onRetirer={() => retirerBloc(b.id)} /> : null}
                        <View pointerEvents={edition ? "none" : "box-none"}>
                          <ContenuBloc bloc={b} d={d} db={db} u={u} interactif={!edition} edition={edition} onPoids={() => setPoidsOuvert(true)} />
                        </View>
                      </View>
                    </Pressable>
                  </PlaceBloc>
                );
              })}
            </View>
            {edition ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setAjout(true)}
                style={({ pressed }) => [styles.ajout, { borderColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s1 }]}
              >
                <Icone nom="plus" couleur={couleurs.t2} taille={18} />
                <Texte style={[styles.fin, { color: couleurs.t2 }]}>{t("accueil.modifier.ajouter")}</Texte>
              </Pressable>
            ) : null}
          </View>
          {edition ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setEdition(true)}
              style={({ pressed }) => [styles.ligneModif, pressed && { backgroundColor: couleurs.s1 }]}
            >
              <Icone nom="crayon" couleur={couleurs.t2} taille={18} />
              {/* D18 de la planche menu : pas de curseurs dans l'en-tête de l'Accueil ; ce lien discret en bas, et Réglages › Par partie › Accueil. */}
              <Texte style={[styles.fin, { color: couleurs.t2 }]}>{t("menu.personnaliser")}</Texte>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {enRetrait ? (
        <BandeauAnnuler
          texte={t("accueil.modifier.retire", { nom: libelleBloc(enRetrait) })}
          bas={edition ? espace.l : (bulle.enCours ? zone : espaceMenu) + espace.s}
          onAnnuler={annulerRetrait}
        />
      ) : null}

      <Feuille visible={choisi != null} onFermer={() => setOptions(null)} titre={choisi ? libelleBloc(choisi.id) : undefined}>
        {choisi && defBloc(choisi.id).tailles.length > 1 ? (
          <View style={{ marginBottom: espace.m }}>
            <Segmente<Taille>
              options={[
                { valeur: "demie", libelle: t("accueil.modifier.demi") },
                { valeur: "pleine", libelle: t("accueil.modifier.pleine") },
              ]}
              valeur={choisi.taille}
              onChange={(taille) => appliquer((v) => changerTaille(v, choisi.id, taille))}
            />
          </View>
        ) : null}
        {choisi && affiches.length > 1 ? (
          <Groupe>
            {rangChoisi > 0 ? <Option premier libelle={t("accueil.modifier.monter")} icone="monter" onPress={() => appliquer((v) => monter(v, choisi.id))} /> : null}
            {rangChoisi < affiches.length - 1 ? (
              <Option premier={rangChoisi === 0} libelle={t("accueil.modifier.descendre")} icone="descendre" onPress={() => appliquer((v) => descendre(v, choisi.id))} />
            ) : null}
          </Groupe>
        ) : null}
        {choisi ? (
          <View style={{ marginTop: espace.m }}>
            <Groupe>
              <Option premier danger libelle={t("accueil.modifier.retirerAccueil")} icone="trash" onPress={() => retirerBloc(choisi.id)} />
            </Groupe>
          </View>
        ) : null}
      </Feuille>

      <Feuille visible={ajout} onFermer={() => setAjout(false)} titre={t("accueil.modifier.ajouter")}>
        <View style={styles.apercus}>
          {proposes.map((def) => {
            const n = def.tailles.length;
            return (
              <Pressable
                key={def.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: !!def.bientot }}
                disabled={def.bientot}
                onPress={() => {
                  appliquer((v) => ajouter(v, def.id));
                  setAjout(false);
                }}
                style={({ pressed }) => [
                  styles.apercu,
                  { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe },
                  def.bientot && { opacity: 0.38 },
                ]}
              >
                <View pointerEvents="none" style={{ flex: 1 }}>
                  <ContenuBloc bloc={{ id: def.id, taille: "demie" }} d={d} db={db} u={u} interactif={false} />
                </View>
                {/* Point faible 8 : le nombre de tailles passe sous l'aperçu, le libellé garde toute la ligne. */}
                {n > 1 ? (
                  <Texte variante="meta" couleur="t3" style={{ fontSize: 11, marginTop: espace.s }}>
                    {tp("accueil.modifier.nbTailles", n)}
                  </Texte>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Feuille>

      <FeuillePoids visible={poidsOuvert} onFermer={() => setPoidsOuvert(false)} onChange={() => recharger().catch((e) => console.error(e))} />
    </SafeAreaView>
  );
}

/**
 * Titre de l'onglet : le message de bienvenue du lancement (le menu garde « Accueil »), en grand sous la ligne de
 * l'avatar pour aérer l'en-tête (retour du 27/10) ; en tête du contenu, il défile avec lui. Il entre une fois, en fondu avec une légère montée ; rien
 * avec « réduire les animations ». Deux lignes au plus si le prénom est long, équilibrées : pas de mot seul en fin de
 * ligne (« quoi ? », revue finale n° 29).
 */
function Bienvenue() {
  const texte = useBienvenue();
  const reduit = useReduit();
  const v = useSharedValue(reduit ? 1 : 0);
  useEffect(() => {
    if (texte != null && v.value < 1) v.value = withTiming(1, { duration: duree.bienvenue, easing: courbes.sortie });
  }, [texte != null, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * glissement.bienvenue }] }));
  return (
    <Animated.View style={[styles.bienvenue, style]}>
      <Texte variante="titre" accessibilityRole="header" numberOfLines={2} textBreakStrategy="balanced" style={{ fontSize: 30, lineHeight: 36 }}>
        {texte ?? ""}
      </Texte>
    </Animated.View>
  );
}

/** Ligne de contrôle d'un bloc en mode Modifier : poignée, libellé, taille (blocs pleins), ✕. */
function Controle({ bloc, onRetirer }: { bloc: Bloc; onRetirer: () => void }) {
  const { couleurs } = useTheme();
  const nom = libelleBloc(bloc.id);
  return (
    <View style={styles.controle}>
      <View accessible accessibilityLabel={t("accueil.modifier.deplacer", { nom })} style={styles.cible}>
        <Icone nom="grip" couleur={couleurs.t3} taille={20} />
      </View>
      <Texte numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ flex: 1, fontFamily: police.medium, fontSize: 13, color: couleurs.t2 }}>
        {nom}
      </Texte>
      {bloc.taille === "pleine" && defBloc(bloc.id).tailles.length > 1 ? (
        <Texte variante="meta" couleur="t2" style={{ marginRight: 2 }}>
          {t("accueil.modifier.pleine")}
        </Texte>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t("accueil.modifier.retirer", { nom })} onPress={onRetirer} hitSlop={ELARGIR_CIBLE} style={styles.cible}>
        <Icone nom="close" couleur={couleurs.t3} taille={18} />
      </Pressable>
    </View>
  );
}

/** Poignée et ✕ du mode Modifier à 24 de large (le titre d'une demi-carte tient sur sa ligne) ; le ✕ garde 44 au toucher. */
const CIBLE_ETROITE = 24;
const ELARGIR_CIBLE = { left: 10, right: 10 };

/** Logo à côté de l'avatar : 80 px (retours du 28/10, b : un peu plus petit), pile au seuil du symbole. */
const LARGEUR_LOGO = LARGEUR_MIN_LOGO;

const styles = StyleSheet.create({
  teteModif: { height: 64, flexDirection: "row", alignItems: "center", paddingRight: espace.s },
  grille: { paddingHorizontal: espace.l, gap: ECART },
  bienvenue: { paddingHorizontal: espace.l, paddingTop: espace.m, paddingBottom: espace.xl },
  carte: { flex: 1, borderRadius: rayon.l },
  contenu: { position: "absolute", top: 0, left: 0, right: 0, paddingTop: 14, paddingHorizontal: espace.l, paddingBottom: espace.l },
  contenuDemi: { minHeight: 132 },
  controle: { flexDirection: "row", alignItems: "center", gap: 2, height: 44, marginTop: -10, marginLeft: -2, marginRight: -3, marginBottom: 4 },
  cible: { width: CIBLE_ETROITE, height: 44, alignItems: "center", justifyContent: "center" },
  ajout: { height: 64, borderRadius: rayon.l, borderWidth: 1, borderStyle: "dashed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  ligneModif: { minHeight: 52, marginTop: espace.l, marginHorizontal: espace.l, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  fin: { fontFamily: police.medium, fontSize: 14 },
  apercus: { flexDirection: "row", flexWrap: "wrap", gap: ECART },
  apercu: { width: "48.5%", minHeight: 132, borderRadius: rayon.l, paddingTop: 14, paddingHorizontal: espace.l, paddingBottom: espace.l },
});
