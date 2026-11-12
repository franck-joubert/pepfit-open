import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../ecrans/contexte";
import { drapeaux } from "../drapeaux";
import {
  AgeVivant,
  BasParcours,
  ChampParcours,
  COULEUR_PARTIE,
  MolettesDate,
  TeteParcours,
  TitreParcours,
} from "../ecrans/parcours-ui";
import {
  ageDe,
  cleDeSport,
  etapes as listeEtapes,
  indiceProche,
  NAISSANCE_DEPART,
  NB_ETAPES,
  NIVEAUX,
  OBJECTIFS_PARCOURS,
  POIDS_DEPART,
  RANG,
  rythmeSigne,
  semainesPour,
  SEXES,
  SPORTS_PARCOURS,
  TAILLE_DEPART,
  TAILLES_MOLETTE,
  THEME,
  type Etape,
  type Naissance,
  type Niveau,
  type ObjectifParcours,
} from "../ecrans/parcours-calc";
import { cibleSauteeReponses, enregistrerReponses, lireReponses, marquerParcoursFait, mesuresDesMolettes, objectifDesReponses, REPONSES_VIDES, sexeRegle, type Reponses } from "../ecrans/parcours-donnees";
import { ChoixGardeFous, cochesValides } from "../ecrans/garde-fous-ui";
import { rafraichirModeAffichage } from "../ecrans/nutrition/mode-affichage";
import { peutContinuerGardeFous, type ChoixGardeFou } from "../nutrition/objectifs-calc";
import { BoutonLigne, GroupeReglages, LigneReglage, SousEtat } from "../ecrans/Reglage";
import { FeuilleCatalogue } from "../ecrans/FeuilleSport";
import { catalogueSports, type Sport } from "../db/depots/lanceur";
import { dateEstimee } from "../nutrition/calculs";
import { sante, santeConnect } from "../natif/sante";
import { PERMISSIONS_DEMANDE_SANTE } from "../natif/sante/logique";
import { commencerConnexion, etatWhoop } from "../whoop";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { espace, police, rayon } from "../theme/typo";
import { AuraFond } from "../ui/AuraFond";
import { PartieImposee } from "../ui/ContextePartie";
import { BoutonPrincipal } from "../ui/Degrade";
import { Icone } from "../ui/Icone";
import { Molette } from "../ui/Molette";
import { courbes } from "../ui/mouvement";
import { fichierPicto } from "../ui/pictos";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { useClavier } from "../ui/useClavier";
import { t } from "../i18n/index";
import { formater } from "../i18n/temps";
import { useLangue } from "../i18n/useLangue";
import { approx, nombre, versUnite } from "../ecrans/format";
import { crans, poidsTexte as texteDuPoids } from "../ecrans/parcours-unite";
import { signalerErreur } from "../ui/FeuilleMessage";
import { useReduit } from "../ui/reduit";

// Parcours A, première utilisation (planches/parcours/parcours-a.html, validée le 28/10 ; NOTES § 1). Ouvert au
// premier lancement ((tabs)/_layout), rejouable depuis le Profil (?rejouer=1). Pas d'écran de bienvenue (D1) : on commence
// par le prénom. Chaque étape a son thème (aura, barre, bouton) ; tout est enregistré à la fin, sur le téléphone.

const sortie = courbes.sortie;
const DECALAGE = 24;
/** kcal groupées par une espace insécable entière (« 2 050 ») : l'espace fine d'Intl disparaît presque en petit corps. */
const kcal = (n: number) => nombre(n, 0).replace(/\u202f/g, "\u00a0");

/** Contenu qui entre de 24 px en fondu (220 ms) depuis le côté où l'on va ; mouvement réduit : fondu seul. */
const entree =
  (sens: 1 | -1, reduit: boolean): EntryExitAnimationFunction =>
  () => {
    "worklet";
    const x = reduit ? 0 : DECALAGE * sens;
    return {
      initialValues: { opacity: 0, transform: [{ translateX: x }] },
      animations: { opacity: withTiming(1, { duration: duree.pas, easing: sortie }), transform: [{ translateX: withTiming(0, { duration: duree.pas, easing: sortie }) }] },
    };
  };
/** Contenu qui sort de 24 px en fondu (150 ms) vers l'autre côté. */
const sortieEcran =
  (sens: 1 | -1, reduit: boolean): EntryExitAnimationFunction =>
  () => {
    "worklet";
    const x = reduit ? 0 : -DECALAGE * sens;
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: { opacity: withTiming(0, { duration: duree.sortie, easing: sortie }), transform: [{ translateX: withTiming(x, { duration: duree.sortie, easing: sortie }) }] },
    };
  };

export default function Bienvenue() {
  const { db, reglages, regler } = useApp();
  useLangue();
  const u = reglages.unite;
  const cran = crans(u);
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const bas = useSafeAreaInsets();
  const { rejouer, labo } = useLocalSearchParams<{ rejouer?: string; labo?: string }>();
  // Labo des macros (drapeau laboMacros, captures) : l'étape des garde-fous d'une femme, avec ses cases cochées.
  const gardesLabo = drapeaux.laboMacros && labo ? (labo.split(",").filter((c) => c !== "vide") as ChoixGardeFou[]) : null;
  const [r, setR] = useState<Reponses>(gardesLabo ? { ...REPONSES_VIDES, prenom: "Alex", sexe: "f" } : REPONSES_VIDES);
  const [pret, setPret] = useState(!rejouer);
  const [etape, setEtape] = useState<Etape>(gardesLabo ? "gardeFous" : "prenom");
  const [sens, setSens] = useState<1 | -1>(1);
  // Clavier écouté sur les seules étapes à champ : en quittant l'une d'elles, la hauteur retombe à zéro (Android n'envoie
  // pas toujours « clavier caché » quand le champ disparaît ; le bas resterait remonté, « Continuer » hors de sa zone).
  const clavier = useClavier(etape === "prenom");

  // Valeurs des molettes et champs en cours (Continuer les enregistre dans `r`, « Passer » non).
  const [prenom, setPrenom] = useState("");
  const [naissance, setNaissance] = useState<Naissance>(NAISSANCE_DEPART);
  const [naissanceVue, setNaissanceVue] = useState(false);
  const [sexe, setSexe] = useState<Reponses["sexe"]>(gardesLabo ? "f" : null);
  const [gardes, setGardes] = useState<ChoixGardeFou[]>(gardesLabo ?? []);
  const [poids, setPoids] = useState(POIDS_DEPART);
  const [taille, setTaille] = useState(TAILLE_DEPART);
  const [mesuresVues, setMesuresVues] = useState(false);
  // Molette touchée : sans geste, la valeur de départ n'est pas une mesure et n'est pas enregistrée (audit 28/10, n° 2).
  const [poidsTouche, setPoidsTouche] = useState(false);
  const [tailleTouchee, setTailleTouchee] = useState(false);
  const [changer, setChanger] = useState(false);
  const [cible, setCible] = useState(POIDS_DEPART);
  const [rythme, setRythme] = useState(cran.rythmes[1]!);
  const [objectifs, setObjectifs] = useState<ObjectifParcours[]>([]);
  const [sports, setSports] = useState<string[]>([]);
  const [niveauSport, setNiveauSport] = useState<Niveau>(1);
  const [niveauNutri, setNiveauNutri] = useState<Niveau>(0);
  const [catalogue, setCatalogue] = useState<Sport[]>([]);
  const [autre, setAutre] = useState(false);
  // chiffres : faux si la règle n'en donne pas (mineur, grossesse) ou n'en montre pas (D20) ; la ligne des kcal disparaît.
  const [fin, setFin] = useState<{ kcal: number; chiffres: boolean; onglets: string } | null>(null);

  // Parcours rejoué : il repart des réponses déjà connues.
  useEffect(() => {
    if (!rejouer) return;
    lireReponses(db)
      .then((x) => {
        setR(x);
        setPrenom(x.prenom);
        if (x.naissance) (setNaissance(x.naissance), setNaissanceVue(true));
        setSexe(x.sexe);
        setGardes(x.gardeFous);
        if (x.poidsKg) setPoids(cran.poids[indiceProche(cran.poids, x.poidsKg)]!);
        if (x.tailleCm) setTaille(TAILLES_MOLETTE[indiceProche(TAILLES_MOLETTE, x.tailleCm)]!);
        setMesuresVues(!!(x.poidsKg || x.tailleCm));
        setChanger(x.changerPoids);
        if (x.cibleKg) setCible(cran.poids[indiceProche(cran.poids, x.cibleKg)]!);
        if (x.rythme) setRythme(cran.rythmes[indiceProche(cran.rythmes, Math.abs(x.rythme))]!);
        setObjectifs(x.objectifs);
        setSports(x.sports);
        if (x.niveauSport != null) setNiveauSport(x.niveauSport);
        if (x.niveauNutrition != null) setNiveauNutri(x.niveauNutrition);
      })
      .catch(console.error)
      .finally(() => setPret(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, rejouer]);

  useEffect(() => {
    catalogueSports(db).then(setCatalogue).catch(console.error);
  }, [db]);

  const etapes = listeEtapes(changer, cibleSauteeReponses(r));
  const aller = useCallback((e: Etape | null, s: 1 | -1) => {
    if (!e) return;
    setSens(s);
    setEtape(e);
    // Revenir sur une étape depuis la fin : tout se réenregistre en y revenant.
    if (e !== "bravo") setFin(null);
  }, []);
  // Le premier geste sur les molettes de date fait quitter le t3 à l'âge.
  const surNaissance = useCallback((n: Naissance) => {
    setNaissance(n);
    setNaissanceVue(true);
  }, []);
  const suivante = (p: Partial<Reponses> = {}) => {
    const nr = { ...r, ...p };
    setR(nr);
    const l = listeEtapes(nr.changerPoids, cibleSauteeReponses(nr));
    aller(l[l.indexOf(etape) + 1] ?? null, 1);
  };
  const precedente = useCallback(() => {
    const i = etapes.indexOf(etape);
    if (i > 0) aller(etapes[i - 1]!, -1);
    return i > 0;
  }, [etapes, etape, aller]);

  // Retour d'Android : l'étape précédente ; à la première, comportement normal (quitter, ou revenir au Profil).
  useEffect(() => {
    const h = BackHandler.addEventListener("hardwareBackPress", precedente);
    return () => h.remove();
  }, [precedente]);

  // En entrant dans les objectifs, la case de poids coche d'office « Perdre ou gagner du poids ».
  useEffect(() => {
    if (etape === "objectifs" && r.changerPoids) setObjectifs((o) => (o.includes("poids") ? o : [...o, "poids"]));
  }, [etape, r.changerPoids]);

  const theme = THEME[etape];
  const th = couleurs[COULEUR_PARTIE[theme]];

  const terminer = async () => {
    const nr = { ...r };
    const { objectif, parties } = await enregistrerReponses(db, nr);
    await rafraichirModeAffichage(db);
    regler({ prenom: nr.prenom, parties, personnage: nr.sexe === "f" ? "femme" : "homme" });
    const noms = [parties.train && t("ui.onglet.entrainement"), parties.food && t("ui.onglet.nutrition"), parties.health && t("ui.onglet.moi")].filter(Boolean);
    setFin({ kcal: objectif.moyenne, chiffres: objectif.statut !== "non_calcule" && !objectif.sansChiffres, onglets: noms.length ? noms.join(", ") : t("parcours.ongletsAucun") });
  };
  // On arrive aux félicitations : tout est enregistré, la page le rappelle.
  useEffect(() => {
    if (etape === "bravo" && !fin) terminer().catch(signalerErreur());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape]);

  const allerAccueil = () => {
    marquerParcoursFait(db)
      .then(() => router.replace("/"))
      .catch(signalerErreur());
  };
  if (!pret) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;

  // Poids dans l'unité des réglages (revue finale n° 45), enregistré en kg.
  const poidsTexte = (kg: number) => texteDuPoids(kg, u);
  const continuer = (libelle = t("parcours.continuer"), onPress: () => void, desactive = false, lien?: ReactNode) => (
    <BasParcours>
      <BoutonPrincipal libelle={libelle} onPress={onPress} desactive={desactive} />
      {lien}
    </BasParcours>
  );

  const contenu = (): ReactNode => {
    switch (etape) {
      case "prenom":
        return (
          <>
            <TitreParcours titre={t("parcours.prenom.titre")} />
            <ChampParcours
              libelle={t("parcours.prenom.libelle")}
              value={prenom}
              onChangeText={setPrenom}
              autoFocus={!rejouer}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              maxLength={30}
              returnKeyType="next"
              onSubmitEditing={() => suivante({ prenom: prenom.trim() })}
              curseur={th}
            />
            {continuer(
              undefined,
              () => suivante({ prenom: prenom.trim() }),
            )}
          </>
        );
      case "age":
        return (
          <>
            <TitreParcours titre={t("parcours.age.titre")} sur={r.prenom ? t("parcours.age.enchante", { p: r.prenom }) : undefined} couleurSur={th} />
            <View style={styles.centre}>
              <AgeVivant age={ageDe(naissance, new Date())} vide={!naissanceVue} />
            </View>
            <MolettesDate naissance={naissance} onChange={surNaissance} vide={!naissanceVue} />
            {continuer(undefined, () => suivante({ naissance: naissanceVue ? naissance : r.naissance }))}
          </>
        );
      case "sexe":
        return (
          <>
            <TitreParcours titre={t("parcours.sexe.titre")} sous={t("parcours.sexe.sous")} />
            <View accessibilityRole="radiogroup" style={[styles.opts, { backgroundColor: couleurs.s1 }]}>
              {SEXES.map((s, i) => (
                <Option key={s} libelle={t(`parcours.sexe.${s}`)} actif={sexe === s} premier={i === 0} couleur={th} onPress={() => setSexe(s)} />
              ))}
            </View>
            {continuer(undefined, () => suivante({ sexe, gardeFous: cochesValides(gardes, sexeRegle(sexe)) }))}
          </>
        );
      case "gardeFous": {
        // D19 : pas de « Passer » ; « Continuer » attend une case, « Rien de tout ça » compris.
        const coches = cochesValides(gardes, sexeRegle(r.sexe));
        return (
          <>
            <TitreParcours titre={t("macros.garde.titre")} sous={t("macros.garde.sousTitre")} />
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
              <ChoixGardeFous sexe={sexeRegle(r.sexe)} coches={coches} onChange={setGardes} couleur={th} />
              <Texte variante="corps" couleur="t3" style={styles.piedGardes}>
                {t("macros.garde.pied")}
              </Texte>
            </ScrollView>
            {continuer(t("macros.garde.continuer"), () => suivante({ gardeFous: coches }), !peutContinuerGardeFous(coches))}
          </>
        );
      }
      case "mensurations":
        return (
          <>
            <TitreParcours titre={t("parcours.mensurations.titre")} />
            <View style={styles.mol}>
              <View style={{ flex: 1 }}>
                <Texte variante="corps" couleur="t2" style={styles.libMol}>
                  {t("parcours.poids")}
                </Texte>
                <Molette
                  libelle={t("parcours.poids")}
                  valeurs={cran.poids}
                  indice={indiceProche(cran.poids, poids)}
                  onIndice={(i) => (setPoids(cran.poids[i]!), setPoidsTouche(true), setMesuresVues(true))}
                  texte={poidsTexte}
                  unite={u}
                  vide={!mesuresVues}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Texte variante="corps" couleur="t2" style={styles.libMol}>
                  {t("parcours.taille")}
                </Texte>
                <Molette
                  libelle={t("parcours.taille")}
                  valeurs={TAILLES_MOLETTE}
                  indice={indiceProche(TAILLES_MOLETTE, taille)}
                  onIndice={(i) => (setTaille(TAILLES_MOLETTE[i]!), setTailleTouchee(true), setMesuresVues(true))}
                  texte={String}
                  unite="cm"
                  vide={!mesuresVues}
                />
              </View>
            </View>
            {/* Grossesse ou trouble alimentaire déclarés : pas de poids à viser (D19), la case disparaît. */}
            {cibleSauteeReponses(r) ? null : (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: changer }}
                onPress={() => setChanger((c) => !c)}
                style={({ pressed }) => [styles.ligneCase, { backgroundColor: pressed ? couleurs.s2 : couleurs.s1 }]}
              >
                <Case actif={changer} couleur={th} />
                <Texte variante="saisie" style={styles.texteOpt}>
                  {t("parcours.changerPoids")}
                </Texte>
              </Pressable>
            )}
            {continuer(undefined, () => {
              const c = changer && !cibleSauteeReponses(r);
              if (c && !r.cibleKg) setCible(poids);
              suivante({ ...mesuresDesMolettes({ poids, poidsTouche, taille, tailleTouchee }, r), changerPoids: c });
            })}
          </>
        );
      case "cible": {
        const depuis = r.poidsKg ?? poids;
        const ecart = cible - depuis;
        const rs = rythmeSigne(rythme, depuis, cible);
        // Estimation provisoire : le niveau en sport (séances par semaine) n'est connu qu'après ; le chiffre final est celui
        // des félicitations (décision du 28/10 : des chiffres qui suivent les réponses, dits provisoires ici).
        const o = objectifDesReponses({ ...r, cibleKg: cible, rythme: rs, changerPoids: true });
        const date = dateEstimee(depuis, cible, rs, new Date());
        const signe = ecart < 0 ? "− " : ecart > 0 ? "+ " : "";
        const chiffres = o.statut !== "non_calcule" && !o.sansChiffres;
        return (
          <>
            <TitreParcours titre={t("parcours.cible.titre")} />
            <View style={styles.cible}>
              <Molette
                libelle={t("parcours.cible.libelle")}
                valeurs={cran.poids}
                indice={indiceProche(cran.poids, cible)}
                onIndice={(i) => setCible(cran.poids[i]!)}
                texte={poidsTexte}
                unite={u}
                visibles={5}
              />
            </View>
            <Texte variante="corps" couleur="t2" style={styles.ecart}>
              {ecart ? (
                <>
                  <Texte variante="corps" style={{ fontSize: 15, fontFamily: police.semibold }}>{`${signe}${poidsTexte(Math.abs(ecart))} ${u}`}</Texte>
                  {t("parcours.cible.depuis", { poids: `${poidsTexte(depuis)} ${u}` })}
                </>
              ) : (
                t("parcours.cible.garder")
              )}
            </Texte>
            <View style={styles.lib}>
              <Texte variante="corps" couleur="t2" style={{ fontSize: 13 }}>
                {t("parcours.rythme")}
              </Texte>
              <Texte variante="corps" couleur="t3" style={{ fontSize: 13 }}>
                {t("parcours.parSemaine", { u })}
              </Texte>
            </View>
            <Segmente
              doux
              jourBlanc
              style={{ marginHorizontal: 16 }}
              options={cran.rythmes.map((x) => ({ valeur: String(x), libelle: `${signe}${nombre(versUnite(x, u), 2)}` }))}
              valeur={String(rythme)}
              onChange={(v) => setRythme(Number(v))}
            />
            <View style={[styles.carte, { backgroundColor: couleurs.s1 }]}>
              <Texte variante="corps" couleur="t2" style={{ fontSize: 13 }}>
                {date ? t("parcours.atteint") : t("parcours.maintien")}
              </Texte>
              {date ? (
                <Texte style={styles.carteTitre}>{approx(formater(date, { day: "numeric", month: "long", year: "numeric" }))}</Texte>
              ) : null}
              {/* D20 : sans chiffres de la règle (moins de 18 ans, poids bas), pas de kcal ; la durée reste. */}
              {chiffres || date ? (
                <Texte variante="corps" couleur="t3" style={{ fontSize: 13, marginTop: 4 }}>
                  {!chiffres
                    ? t("parcours.atteintSemaines", { n: semainesPour(depuis, cible, rythme) })
                    : date
                      ? t("parcours.atteintDetail", { n: semainesPour(depuis, cible, rythme), kcal: approx(kcal(o.moyenne)) })
                      : t("parcours.maintienDetail", { kcal: approx(kcal(o.moyenne)) })}
                </Texte>
              ) : null}
            </View>
            {continuer(undefined, () => suivante({ cibleKg: cible, rythme: rs }))}
          </>
        );
      }
      case "objectifs":
        return (
          <>
            <TitreParcours titre={t("parcours.objectifs.titre")} sous={t("parcours.plusieurs")} />
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
              <View style={[styles.opts, { backgroundColor: couleurs.s1 }]}>
                {OBJECTIFS_PARCOURS.map((o, i) => (
                  <Option
                    key={o}
                    multiple
                    libelle={t(`parcours.objectif.${o}`)}
                    actif={objectifs.includes(o)}
                    premier={i === 0}
                    couleur={th}
                    onPress={() => setObjectifs((l) => (l.includes(o) ? l.filter((x) => x !== o) : [...l, o]))}
                  />
                ))}
              </View>
            </ScrollView>
            {continuer(undefined, () => suivante({ objectifs }))}
          </>
        );
      case "sports": {
        const autres = sports.filter((s) => s.startsWith("cat:"));
        const basculer = (cle: string) => setSports((l) => (l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle]));
        return (
          <>
            <TitreParcours titre={t("parcours.sports.titre")} sous={t("parcours.plusieurs")} />
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sports}>
              {SPORTS_PARCOURS.map((s) => (
                <TuileSport key={s.cle} nom={t(`parcours.sport.${s.cle}` as "parcours.sport.musculation")} picto={s.picto} actif={sports.includes(s.cle)} couleur={th} onPress={() => basculer(s.cle)} />
              ))}
              {autres.map((id) => {
                const c = catalogue.find((x) => x.id === id);
                return <TuileSport key={id} nom={c?.nom ?? id} picto={c?.slug ?? null} actif couleur={th} onPress={() => basculer(id)} />;
              })}
              <Pressable accessibilityRole="button" onPress={() => setAutre(true)} style={styles.autre}>
                <Icone nom="search" couleur={couleurs.t2} taille={18} />
                <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
                  {t("parcours.autreSport")}
                </Texte>
              </Pressable>
            </ScrollView>
            {continuer(undefined, () => suivante({ sports }))}
            <FeuilleCatalogue
              visible={autre}
              titre={t("parcours.autreSport")}
              sports={catalogue}
              deja={sports.map((c) => (c.startsWith("cat:") ? c : (SPORTS_PARCOURS.find((s) => s.cle === c)?.id ?? c)))}
              ajout
              onFermer={() => setAutre(false)}
              onChoisir={(s) => basculer(cleDeSport(s.id) ?? s.id)}
            />
          </>
        );
      }
      case "niveau":
        return (
          <>
            <TitreParcours titre={t("parcours.niveau.titre")} />
            <Niveaux titre={t("parcours.enSport")} valeur={niveauSport} onChange={setNiveauSport} desc="parcours.descSport" haut={28} />
            <Niveaux titre={t("parcours.enNutrition")} valeur={niveauNutri} onChange={setNiveauNutri} desc="parcours.descNutri" haut={20} />
            {continuer(undefined, () => suivante({ niveauSport, niveauNutrition: niveauNutri }))}
          </>
        );
      case "objets":
        return (
          <>
            <TitreParcours titre={t("parcours.objets.titre")} sous={t("parcours.objets.sous")} />
            <Objets />
            {continuer(undefined, () => suivante())}
          </>
        );
      case "bravo":
        return (
          <>
            <View style={styles.bravo}>
              <Texte accessibilityRole="header" style={styles.bravoTitre}>
                {r.prenom ? t("parcours.bravo.titre", { p: r.prenom }) : t("parcours.bravo.titreSansPrenom")}
              </Texte>
            </View>
            <View style={[styles.coffre, { backgroundColor: couleurs.s1 }]}>
              <View style={[styles.rond, { backgroundColor: `${couleurs.valide}29` }]}>
                <Icone nom="bouclier" couleur={couleurs.valide} taille={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Texte style={styles.coffreTitre}>{t("parcours.coffre.titre")}</Texte>
                <Texte variante="corps" couleur="t2" style={styles.coffreTexte}>
                  {t("donnees.coffreLocal")}
                </Texte>
              </View>
            </View>
            <View style={[styles.recap, { backgroundColor: couleurs.s1 }]}>
              {fin?.chiffres !== false ? (
                <Rappel premier libelle={t("parcours.objectifJour")} valeur={fin ? t("parcours.kcal", { n: approx(kcal(fin.kcal)) }) : ""} onPress={() => aller("niveau", -1)} />
              ) : null}
              <Rappel premier={fin?.chiffres === false} libelle={t("parcours.onglets")} valeur={fin?.onglets ?? ""} onPress={() => aller("objectifs", -1)} />
            </View>
            {continuer(t("parcours.allerAccueil"), allerAccueil, !fin)}
          </>
        );
    }
  };

  const sansTete = etape === "bravo";
  return (
    <PartieImposee partie={theme}>
      <View style={{ flex: 1, backgroundColor: couleurs.bg }}>
        <AuraFond partie={theme} fixe />
        <View style={{ flex: 1, paddingTop: bas.top, paddingBottom: clavier ? Math.max(0, clavier - bas.bottom) : 0 }}>
          {sansTete ? null : (
            <TeteParcours
              onRetour={etapes.indexOf(etape) > 0 ? () => precedente() : rejouer ? () => (router.canGoBack() ? router.back() : router.replace("/")) : undefined}
              onPasser={etape === "gardeFous" ? undefined : () => suivante()}
              progression={{ part: RANG[etape] / NB_ETAPES, partie: theme }}
            />
          )}
          <View style={{ flex: 1 }}>
            <Animated.View key={etape} entering={entree(sens, reduit)} exiting={sortieEcran(sens, reduit)} style={StyleSheet.absoluteFill}>
              {contenu()}
            </Animated.View>
          </View>
        </View>
      </View>
    </PartieImposee>
  );
}

/** Ligne du rappel des félicitations (planche : 52 de haut, libellé 15, valeur 15 t2, chevron) : chacune ramène à son étape. */
function Rappel({ libelle, valeur, premier, onPress }: { libelle: string; valeur: string; premier?: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle}, ${valeur}`}
      onPress={onPress}
      style={({ pressed }) => [styles.rappel, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s2 }]}
    >
      <Texte variante="corps" style={{ fontSize: 15 }}>
        {libelle}
      </Texte>
      <Texte variante="corps" couleur="t2" numberOfLines={1} style={styles.rappelValeur}>
        {valeur}
      </Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

/** Rangée à pastille (choix unique) ou à case (choix multiple), 60 de haut. */
function Option({ libelle, actif, premier, couleur, multiple, onPress }: { libelle: string; actif: boolean; premier: boolean; couleur: string; multiple?: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: actif }}
      onPress={onPress}
      style={({ pressed }) => [styles.opt, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s2 }]}
    >
      <Texte variante="saisie" style={styles.texteOpt}>
        {libelle}
      </Texte>
      {multiple ? (
        <Case actif={actif} couleur={couleur} />
      ) : (
        <View style={[styles.rad, { borderColor: actif ? couleur : couleurs.line2 }]}>{actif ? <View style={[styles.radPlein, { backgroundColor: couleur }]} /> : null}</View>
      )}
    </Pressable>
  );
}

function Case({ actif, couleur }: { actif: boolean; couleur: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.case, actif ? { backgroundColor: couleur, borderColor: couleur } : { borderColor: couleurs.line2 }]}>
      {actif ? <Icone nom="check" couleur={couleurs.bg} taille={14} epaisseur={2.6} /> : null}
    </View>
  );
}

/** Tuile de sport : picto de l'appli (ou icône générique, D4), nom, coche ronde ; choisie : filet et voile de la partie. */
function TuileSport({ nom, picto, actif, couleur, onPress }: { nom: string; picto: string | null; actif: boolean; couleur: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  const src = picto ? fichierPicto(picto, null, 128) : undefined;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: actif }}
      accessibilityLabel={nom}
      onPress={onPress}
      style={({ pressed }) => [styles.tuile, { backgroundColor: pressed ? couleurs.s2 : couleurs.s1 }, actif && { borderColor: couleur }]}
    >
      {actif ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: couleur, opacity: 0.12, borderRadius: rayon.l - 2 }]} /> : null}
      {src != null ? (
        <Image source={src} style={styles.picto} resizeMode="contain" />
      ) : (
        <View style={styles.sansPicto}>
          <Icone nom="dumbbell" couleur={couleurs.t3} taille={20} />
        </View>
      )}
      <Texte variante="corps" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.nomSport}>
        {nom}
      </Texte>
      {actif ? (
        <View style={[styles.coche, { backgroundColor: couleur }]}>
          <Icone nom="check" couleur={couleurs.bg} taille={12} epaisseur={2.8} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Un niveau : libellé, segmenté glissant, ligne qui dit ce que veut dire le niveau choisi. */
function Niveaux({ titre, valeur, onChange, desc, haut }: { titre: string; valeur: Niveau; onChange: (n: Niveau) => void; desc: "parcours.descSport" | "parcours.descNutri"; haut: number }) {
  return (
    <>
      <Texte variante="corps" couleur="t2" style={[styles.libNiveau, { marginTop: haut }]}>
        {titre}
      </Texte>
      <Segmente
        glisse
        style={{ marginHorizontal: 16 }}
        options={NIVEAUX.map((n) => ({ valeur: String(n), libelle: t(`parcours.niveau.${n}`) }))}
        valeur={String(valeur)}
        onChange={(v) => onChange(Number(v) as Niveau)}
      />
      <Texte variante="corps" couleur="t3" style={styles.desc}>
        {t(`${desc}.${valeur}`)}
      </Texte>
    </>
  );
}

/** « Connecte tes objets » (D7), facultatif : Santé Connect et Whoop, comme dans Profil › Connexions. */
function Objets() {
  const { db } = useApp();
  const [sc, setSc] = useState<"indisponible" | "a_autoriser" | "ok" | null>(null);
  const [whoop, setWhoop] = useState<boolean | null>(null);
  const relire = useCallback(async () => {
    const dispo = await sante.disponible().catch(() => false);
    const accordees = dispo ? await santeConnect.autorisees().catch(() => []) : [];
    setSc(!dispo ? "indisponible" : accordees.length ? "ok" : "a_autoriser");
    setWhoop(!!(await etatWhoop(db).catch(() => null))?.connecte);
  }, [db]);
  useEffect(() => {
    relire().catch(console.error);
  }, [relire]);
  return (
    <GroupeReglages style={{ marginTop: 24 }}>
      <LigneReglage
        icone="coeur"
        libelle={t("parcours.objets.santeConnect")}
        sous={sc === "ok" ? <SousEtat actif texte={t("parcours.objets.connecte")} /> : sc === "indisponible" ? t("parcours.objets.indisponible") : t("parcours.objets.santeConnectSous")}
      >
        {sc === "a_autoriser" ? (
          <BoutonLigne
            libelle={t("parcours.objets.connecter")}
            onPress={() => sante.demanderPermissions(PERMISSIONS_DEMANDE_SANTE).then(relire).catch(console.error)}
          />
        ) : null}
      </LigneReglage>
      <LigneReglage icone="flamme" libelle={t("parcours.objets.whoop")} sous={whoop ? <SousEtat actif texte={t("parcours.objets.connecte")} /> : t("parcours.objets.whoopSous")}>
        {whoop === false ? <BoutonLigne libelle={t("parcours.objets.connecter")} onPress={() => commencerConnexion().catch(console.error)} /> : null}
      </LigneReglage>
    </GroupeReglages>
  );
}

// Marges de 16 partout, textes compris (revue finale, D8) ; la molette du poids visé reste centrée (112 de chaque côté).
const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  opts: { marginTop: 24, marginHorizontal: 16, borderRadius: rayon.l, overflow: "hidden" },
  opt: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingHorizontal: 16 },
  texteOpt: { flex: 1, fontFamily: police.regular, fontSize: 16 },
  rad: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radPlein: { width: 12, height: 12, borderRadius: 6 },
  case: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  mol: { flexDirection: "row", gap: 12, marginTop: 24, marginHorizontal: 16 },
  libMol: { textAlign: "center", marginBottom: 6 },
  piedGardes: { fontSize: 13, lineHeight: 18, paddingTop: 12, paddingHorizontal: 16 },
  ligneCase: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, marginTop: 20, marginHorizontal: 16, paddingHorizontal: 16, borderRadius: rayon.l },
  cible: { marginTop: 24, marginHorizontal: 112 },
  ecart: { textAlign: "center", fontSize: 15, marginTop: 10 },
  lib: { flexDirection: "row", gap: 6, marginTop: 24, marginBottom: 8, marginHorizontal: espace.l },
  carte: { marginTop: 24, marginHorizontal: 16, padding: 16, borderRadius: rayon.l },
  carteTitre: { fontFamily: police.semibold, fontSize: 22, marginTop: 2 },
  sports: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 6, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 8 },
  tuile: {
    width: "49.2%",
    height: 54,
    borderRadius: rayon.l,
    borderWidth: 2,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 6,
    paddingRight: 6,
  },
  picto: { width: 42, height: 42 },
  sansPicto: { width: 42, height: 44, alignItems: "center", justifyContent: "center" },
  nomSport: { flex: 1, fontSize: 15, fontFamily: police.medium },
  coche: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  autre: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, marginTop: 4 },
  libNiveau: { fontSize: 13, marginHorizontal: espace.l, marginBottom: 8 },
  desc: { fontSize: 13, lineHeight: 19, marginTop: 10, marginHorizontal: espace.l, minHeight: 38 },
  bravo: { paddingTop: 56, paddingHorizontal: espace.l },
  bravoTitre: { fontFamily: police.semibold, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  recap: { marginTop: 24, marginHorizontal: 16, borderRadius: rayon.l, overflow: "hidden" },
  rappel: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingLeft: 16, paddingRight: 12 },
  rappelValeur: { flex: 1, textAlign: "right", fontSize: 15 },
  coffre: { flexDirection: "row", gap: 14, marginTop: 28, marginHorizontal: 16, padding: 16, borderRadius: rayon.l },
  rond: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  coffreTitre: { fontFamily: police.semibold, fontSize: 16 },
  coffreTexte: { fontSize: 14, lineHeight: 20, marginTop: 4 },
});
