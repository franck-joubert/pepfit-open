import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BackHandler, Image, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CRITERES,
  dansPuce,
  filtrer,
  nbFiltres,
  pourToi,
  proches,
  PUCES,
  rechercher,
  SANS_FILTRE,
  type Critere,
  type DureeFiltre,
  type Filtres,
  type Genre,
  type Puce,
  type SeancesFiltre,
} from "../boutique/calculs";
import { faitsBoutique, lireProfil, PROGRAMMES, ROUTINES } from "../boutique/donnees";
import { LIEUX, OBJECTIFS, type Article, type Famille, type Lieu, type Niveau, type Objectif } from "../boutique/modele";
import { Barres, CarteGrande, CartePetite, LigneResultat, TeteSection, useFamille, Vignette } from "../boutique/ui";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, rayon } from "../theme/typo";
import { BoutonIcone } from "../ui/Cadre";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille } from "../ui/Feuille";
import { Icone, type NomIcone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { fichierPicto } from "../ui/pictos";
import { revenir } from "../ui/revenir";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { TYPES, vocabulaire, type TypeProgramme } from "../db";

// Explorer les programmes et Explorer les routines (planche boutiques, validée le 30/10) : deux espaces, la même page, le genre
// venant du lien (?genre=). Puces de lieu en un toucher et « Filtres » ; le texte d'en-tête (ce qu'est un programme, ou une
// routine, et le lien vers l'autre espace) ; « Pour toi » (D3 : trois articles d'après le parcours) ; la grille « Que veux-tu
// faire ? » (planche boutique-programmes, variante B) ; puis une rangée par thème. Une puce, un filtre, un objectif, « Tout
// voir » ou la recherche passent en liste de résultats (les articles de l'espace seulement), avec « Proches de tes filtres »
// pour ne jamais finir sur une page vide. Ni puce, ni objectif, ni lieu sans article dans l'espace (D6 : pas de padel côté
// routines).

type Rangee = { cle: "course" | "salle" | "maison" | "endurance" | "sante"; ids: string[] };
const RANGEES: Record<Genre, Rangee[]> = {
  programme: [
    { cle: "course", ids: ["c5", "c10a", "c10", "semi", "mara"] },
    { cle: "salle", ids: ["fb", "f5", "ppl", "hb", "padel"] },
    { cle: "maison", ids: ["hiit", "hal", "rf", "kb", "pp"] },
    { cle: "endurance", ids: ["nage", "velo", "rando"] },
    { cle: "sante", ids: ["mob", "dos", "gen", "equi"] },
  ],
  routine: [
    { cle: "course", ids: ["r-footing-45", "r-fract-6x1k", "r-seuil-3x10", "r-test-vma"] },
    { cle: "salle", ids: ["r-push-a", "r-full-body"] },
    { cle: "maison", ids: ["r-halteres", "r-hiit-20", "r-kb-emom"] },
    { cle: "sante", ids: ["r-hanches", "r-dos"] },
    { cle: "endurance", ids: ["r-crawl"] },
  ],
};

/** Tuile d'objectif : picto 3D et famille (grille de la variante B, tuiles de la feuille des filtres). */
const OBJECTIF: Record<Objectif, { picto: string; famille: Famille }> = {
  distance: { picto: "course", famille: "endu" },
  muscle: { picto: "couche", famille: "force" },
  force: { picto: "sdt", famille: "force" },
  poids: { picto: "montee-banc", famille: "forme" },
  maison: { picto: "hiit", famille: "forme" },
  mobilite: { picto: "yoga", famille: "sante" },
  nager: { picto: "natation", famille: "endu" },
  sport: { picto: "padel", famille: "force" },
};
const ICONE_LIEU: Record<Lieu, NomIcone> = {
  dehors: "exterieur",
  salle: "dumbbell",
  maison: "domicile",
  maison_halteres: "dumbbell",
  piscine: "piscine",
  padel: "terrain",
};

const libelleCritere = (f: Filtres, c: Critere): string => {
  switch (c) {
    case "niveau":
      return t(`boutique.niveau.${f.niveau}` as "boutique.niveau.1");
    case "objectif":
      return t(`boutique.objectif.${f.objectif}` as "boutique.objectif.distance");
    case "lieu":
      return t(`boutique.lieu.${f.lieu}` as "boutique.lieu.dehors");
    case "seances":
      return f.seances === 5 ? t("boutique.f.cinqPlus") : t("boutique.f.seancesPuce", { n: f.seances ?? 0 });
    case "duree":
      return t(`boutique.duree.${f.duree}` as "boutique.duree.court");
  }
};

/** « 2 programmes », « 3 routines » (« Voir … » : bouton des filtres). */
const compte = (genre: Genre, n: number, voir = false): string =>
  genre === "routine"
    ? tp(voir ? "boutique.f.voirRoutines" : "boutique.resultatsRoutines", n)
    : tp(voir ? "boutique.f.voirProgrammes" : "boutique.resultats", n);

export function Boutique() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  // Liens : ?genre=programme|routine (pages Programmes et Routines ; sans genre, les programmes), ?objectif= (parcours), ?type=
  // (feuille d'un sport : ses routines, retour 4).
  const params = useLocalSearchParams<{ objectif?: string; genre?: string; type?: string; }>();
  const genre: Genre = params.genre === "routine" ? "routine" : "programme";
  const articles: readonly Article[] = genre === "routine" ? ROUTINES : PROGRAMMES;
  const puces = useMemo(() => PUCES.filter((c) => articles.some((p) => dansPuce(p, c))), [articles]);
  const [typeSport, setTypeSport] = useState<TypeProgramme | null>(() => (params.type && (TYPES as readonly string[]).includes(params.type) ? (params.type as TypeProgramme) : null));
  const [profil] = useCharge((db) => lireProfil(db), [db]);
  // « Fait en mars » (retour 9) : pastille cochée et anneau vert sur ce qui a déjà été fait.
  const [faits] = useCharge((db) => faitsBoutique(db), [db]);
  const fait = (id: string) => faits?.get(id) ?? null;
  const [puce, setPuce] = useState<Puce>("tout");
  const [filtres, setFiltres] = useState<Filtres>(() => ({
    ...SANS_FILTRE,
    objectif: params.objectif && (OBJECTIFS as readonly string[]).includes(params.objectif) ? (params.objectif as Objectif) : null,
  }));
  const [rangee, setRangee] = useState<Rangee | null>(null);
  const [recherche, setRecherche] = useState<string | null>(null);
  const [feuille, setFeuille] = useState(false);

  const n = nbFiltres(filtres);
  const liste = puce !== "tout" || n > 0 || rangee != null || typeSport != null || (recherche != null && recherche.trim() !== "");
  const revenirVitrine = useCallback(() => {
    setPuce("tout");
    setFiltres(SANS_FILTRE);
    setTypeSport(null);
    setRangee(null);
    setRecherche(null);
  }, []);
  // Retour Android : d'une liste ou de la recherche, on revient à la vitrine avant de quitter la page.
  useFocusEffect(
    useCallback(() => {
      const s = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!liste && recherche == null) return false;
        revenirVitrine();
        return true;
      });
      return () => s.remove();
    }, [liste, recherche, revenirVitrine]),
  );

  const pt = useMemo(() => (profil ? pourToi(articles, profil) : null), [profil, articles]);
  const sousPourToi = pt
    ? pt.source === "defaut"
      ? t("boutique.pourToi.defaut")
      : t(pt.source === "parcours" ? "boutique.pourToi.parcours" : "boutique.pourToi.historique", {
          liste: pt.raisons.map((r) => t(`boutique.raison.${r}` as "boutique.raison.course")).join(", ") || t("boutique.pourToi.defaut"),
        })
    : null;

  const resultats = useMemo(() => {
    let l = filtrer(articles, filtres, puce);
    if (rangee) l = l.filter((p) => rangee.ids.includes(p.id));
    if (typeSport) l = l.filter((p) => p.type === typeSport);
    if (recherche?.trim()) l = rechercher(l, recherche);
    return l;
  }, [articles, filtres, puce, rangee, recherche, typeSport]);
  const pr = useMemo(
    () => (n > 0 && !recherche?.trim() ? proches(articles, filtres, puce) : { programmes: [], relache: null }),
    [articles, filtres, puce, n, recherche],
  );
  const autre: Genre = genre === "routine" ? "programme" : "routine";
  const ouvrir = (p: Article) => router.push({ pathname: "/boutique/[id]", params: { id: p.id } });

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <View style={styles.entete}>
        <BoutonIcone nom="back" couleur={couleurs.t1} libelle={t("ui.retour")} onPress={() => (liste || recherche != null ? revenirVitrine() : revenir())} />
        {recherche == null ? (
          <>
            <Texte variante="titre" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, marginLeft: 2 }}>
              {t(`boutique.titre.${genre}`)}
            </Texte>
            <BoutonIcone nom="search" couleur={couleurs.t1} libelle={t(`boutique.chercher.${genre}`)} onPress={() => setRecherche("")} />
          </>
        ) : (
          <>
            <TextInput
              autoFocus
              value={recherche}
              onChangeText={setRecherche}
              placeholder={t(`boutique.chercher.${genre}`)}
              placeholderTextColor={couleurs.t3}
              selectionColor={couleurs.action}
              returnKeyType="search"
              maxFontSizeMultiplier={POLICE_MAX}
              style={[styles.champ, { color: couleurs.t1, backgroundColor: couleurs.s1 }]}
            />
            <BoutonIcone nom="close" couleur={couleurs.t1} libelle={t("boutique.fermerRecherche")} onPress={() => setRecherche(null)} />
          </>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces} style={{ flexGrow: 0 }}>
        <PuceBouton on={n > 0} onPress={() => setFeuille(true)} libelle={t("boutique.filtres")} icone="filtre" nombre={n} />
        {typeSport ? <PuceBouton retirer libelle={t(vocabulaire(typeSport).type)} onPress={() => setTypeSport(null)} /> : null}
        {n > 0
          ? CRITERES.filter((c) => filtres[c] != null).map((c) => (
              <PuceBouton key={c} retirer libelle={libelleCritere(filtres, c)} onPress={() => setFiltres({ ...filtres, [c]: null })} />
            ))
          : puces.map((c) => (
              <PuceBouton
                key={c}
                on={puce === c && !rangee}
                libelle={t(`boutique.puce.${c}` as "boutique.puce.tout")}
                onPress={() => (setRangee(null), setPuce(c))}
              />
            ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }} keyboardShouldPersistTaps="handled">
        {liste ? (
          <>
            <TeteSection
              titre={rangee ? t(`boutique.rangee.${rangee.cle}`) : compte(genre, resultats.length)}
              sous={rangee ? compte(genre, resultats.length) : null}
            />
            {resultats.length === 0 && !pr.programmes.length ? (
              <Texte variante="corps" couleur="t2" style={styles.rien}>
                {t("boutique.rien")}
              </Texte>
            ) : null}
            {resultats.map((p, i) => (
              <LigneResultat key={p.id} p={p} filet={i > 0} onPress={() => ouvrir(p)} fait={fait(p.id)} />
            ))}
            {pr.programmes.length ? (
              <>
                <TeteSection titre={t("boutique.proches")} sous={t(pr.relache === "niveau" ? "boutique.relache.niveau" : "boutique.relache.autre")} />
                {pr.programmes.map((p, i) => (
                  <LigneResultat key={p.id} p={p} filet={i > 0} onPress={() => ouvrir(p)} fait={fait(p.id)} />
                ))}
              </>
            ) : null}
          </>
        ) : (
          <>
            {/* Texte d'en-tête (planche boutiques, point 3) : dans le défilement, au-dessus de « Pour toi », vitrine seulement. */}
            <View style={styles.explique}>
              <Texte style={[styles.expliqueTexte, { color: couleurs.t2 }]}>
                <Texte style={{ fontFamily: police.semibold, color: couleurs.t1 }}>{t(`boutique.explique.${genre}Fort`)}</Texte> {t(`boutique.explique.${genre}`)}
              </Texte>
              {/* Lien vers l'autre espace (D4) : pour qui s'est trompé de porte. */}
              <Appui
                accessibilityRole="link"
                accessibilityLabel={`${t(`boutique.croise.${genre}Q`)} ${t(`boutique.croise.${genre}`)}`}
                onPress={() => router.replace({ pathname: "/boutique", params: { genre: autre } })}
                style={styles.croise}
              >
                <Texte style={{ fontSize: 13.5, color: couleurs.t3, marginRight: 4 }}>{t(`boutique.croise.${genre}Q`)}</Texte>
                <Texte style={{ fontFamily: police.medium, fontSize: 13.5, color: couleurs.t2 }}>{t(`boutique.croise.${genre}`)}</Texte>
                <Icone nom="right" couleur={couleurs.t2} taille={16} />
              </Appui>
            </View>
            <TeteSection serre titre={t("boutique.pourToi")} sous={sousPourToi} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} decelerationRate="fast" snapToInterval={312}>
              {(pt?.ids ?? []).map((id) => {
                const p = articles.find((x) => x.id === id);
                return p ? <CarteGrande key={id} p={p} largeur={300} onPress={() => ouvrir(p)} fait={fait(p.id)} /> : null;
              })}
            </ScrollView>
            <TeteSection titre={t("boutique.queVeuxTu")} />
            <View style={styles.grille}>
              {OBJECTIFS.map((o) => (
                <TuileObjectif key={o} o={o} genre={genre} articles={articles} onPress={() => setFiltres({ ...SANS_FILTRE, objectif: o })} />
              ))}
            </View>
            {RANGEES[genre].map((r) => (
              <View key={r.cle}>
                <TeteSection titre={t(`boutique.rangee.${r.cle}`)} onToutVoir={() => setRangee(r)} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                  {r.ids.map((id) => {
                    const p = articles.find((x) => x.id === id);
                    return p ? <CartePetite key={id} p={p} onPress={() => ouvrir(p)} fait={fait(p.id)} /> : null;
                  })}
                </ScrollView>
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <FeuilleFiltres visible={feuille} genre={genre} articles={articles} valeur={filtres} puce={puce} onFermer={() => setFeuille(false)} onValider={(f) => (setFiltres(f), setFeuille(false))} />
    </SafeAreaView>
  );
}

/** Puce de 36 dans une zone de 44, rayon 10 (pas de pilule, D13) : choix rapide (lieu), « Filtres » avec son nombre, ou
 *  filtre actif retirable. */
function PuceBouton({
  libelle,
  onPress,
  on,
  icone,
  nombre,
  retirer,
}: {
  libelle: string;
  onPress: () => void;
  on?: boolean;
  icone?: NomIcone;
  nombre?: number;
  retirer?: boolean;
}) {
  const { couleurs, mode } = useTheme();
  const fond = on ? couleurs.t1 : mode === "nuit" ? couleurs.s2 : couleurs.s1;
  const texte = on ? couleurs.bg : couleurs.t1;
  return (
    <Appui
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      accessibilityLabel={retirer ? t("boutique.retirerFiltre", { nom: libelle }) : libelle}
      onPress={onPress}
      style={styles.puceZone}
    >
      <View
        style={[
          styles.puce,
          { backgroundColor: fond },
          !on && mode === "jour" && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: couleurs.line },
          retirer && { paddingRight: 8 },
        ]}
      >
        {icone ? <Icone nom={icone} couleur={texte} taille={16} /> : null}
        <Texte style={{ fontFamily: on ? police.semibold : police.medium, fontSize: 13.5, color: texte }}>{libelle}</Texte>
        {nombre ? (
          <View style={[styles.nombre, { backgroundColor: couleurs.action }]}>
            <Texte style={{ fontFamily: police.semibold, fontSize: 11, color: couleurs.surAction }}>{nombre}</Texte>
          </View>
        ) : null}
        {retirer ? <Icone nom="close" couleur={couleurs.t2} taille={14} /> : null}
      </View>
    </Appui>
  );
}

/** « Courir une distance · 5 programmes » (ou « 4 routines ») sur le dégradé de sa famille, picto 3D en bas à droite ; pas de
 *  tuile sans article dans l'espace. */
function TuileObjectif({ o, genre, articles, onPress }: { o: Objectif; genre: Genre; articles: readonly Article[]; onPress: () => void }) {
  const { couleurs, mode } = useTheme();
  const nb = articles.filter((p) => p.objectifs.includes(o)).length;
  const nombre = compte(genre, nb);
  const d = OBJECTIF[o];
  const src = fichierPicto(d.picto, null, 100);
  const nuit = mode === "nuit";
  if (!nb) return null;
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={`${t(`boutique.objectif.${o}` as "boutique.objectif.distance")}, ${nombre}`}
      onPress={onPress}
      style={styles.tuileObjectif}
    >
      <Vignette p={{ famille: d.famille, picto: "", gros: { valeur: "", unite: null } }} hauteur={104} chiffre={false} />
      {src != null ? <Image source={src} resizeMode="contain" style={styles.objectifPicto} /> : null}
      <Texte numberOfLines={2} style={[styles.objectifNom, { color: nuit ? "#ffffff" : couleurs.t1 }]}>
        {t(`boutique.objectif.${o}` as "boutique.objectif.distance")}
      </Texte>
      <View style={styles.objectifNb}>
        <Texte numberOfLines={1} style={[styles.objectifNbTexte, { color: nuit ? "rgba(255,255,255,0.7)" : couleurs.t3 }]}>
          {nombre}
        </Texte>
      </View>
    </Appui>
  );
}

// ---------------------------------------------------------------- feuille des filtres

function Tuile({
  on,
  onPress,
  libelle,
  sous,
  children,
  colonne,
}: {
  on: boolean;
  onPress: () => void;
  libelle: string;
  sous?: string;
  children: ReactNode;
  colonne?: boolean;
}) {
  const { couleurs, mode } = useTheme();
  const fond = mode === "nuit" ? couleurs.feuilleGroupe : couleurs.s1;
  return (
    <Appui
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={sous ? `${libelle}, ${sous}` : libelle}
      onPress={onPress}
      style={[
        styles.tuile,
        colonne ? styles.tuileColonne : styles.tuileLigne,
        { backgroundColor: on ? couleurOn(couleurs.action, fond) : fond, borderWidth: 1.5, borderColor: on ? couleurs.action : "transparent" },
      ]}
    >
      {children}
      {sous ? (
        <View style={{ flex: 1 }}>
          <Texte numberOfLines={1} style={[styles.tuileTexte, { flex: 0 }]}>
            {libelle}
          </Texte>
          <Texte numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: couleurs.t3 }}>
            {sous}
          </Texte>
        </View>
      ) : (
        <Texte numberOfLines={2} style={[styles.tuileTexte, colonne && { textAlign: "center", flex: 0 }]}>
          {libelle}
        </Texte>
      )}
    </Appui>
  );
}
/** color-mix(action 13 %, fond) */
function couleurOn(action: string, fond: string) {
  const v = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(v(action, i) * 0.13 + v(fond, i) * 0.87)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function FeuilleFiltres({
  visible,
  genre,
  articles,
  valeur,
  puce,
  onFermer,
  onValider,
}: {
  visible: boolean;
  genre: Genre;
  articles: readonly Article[];
  valeur: Filtres;
  puce: Puce;
  onFermer: () => void;
  onValider: (f: Filtres) => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const [f, setF] = useState<Filtres>(valeur);
  useEffect(() => {
    if (visible) setF(valeur);
  }, [visible, valeur]);
  const basculer = <K extends Critere>(c: K, v: Filtres[K]) => setF((x) => ({ ...x, [c]: x[c] === v ? null : v }));
  const n = filtrer(articles, f, puce).length;
  // Séances par semaine et durée ne parlent que des programmes : cachées dans les routines. Pas d'objectif ni de lieu sans
  // article dans l'espace.
  const routines = genre === "routine";
  const objectifs = OBJECTIFS.filter((o) => articles.some((p) => p.objectifs.includes(o)));
  const lieux = LIEUX.filter((l) => articles.some((p) => p.lieux.includes(l)));
  const libelleTitre = (cle: "boutique.f.niveau" | "boutique.f.objectif" | "boutique.f.lieu" | "boutique.f.seances" | "boutique.f.duree") => (
    <Texte variante="entete" couleur="t3" style={styles.lib}>
      {t(cle)}
    </Texte>
  );
  const SEANCES: { valeur: string; libelle: string }[] = [
    { valeur: "0", libelle: t("boutique.f.toutes") },
    { valeur: "2", libelle: "2" },
    { valeur: "3", libelle: "3" },
    { valeur: "4", libelle: "4" },
    { valeur: "5", libelle: t("boutique.f.cinqPlus") },
  ];
  const DUREES: { valeur: string; libelle: string }[] = [
    { valeur: "0", libelle: t("boutique.f.toutes") },
    { valeur: "court", libelle: t("boutique.duree.court") },
    { valeur: "moyen", libelle: t("boutique.duree.moyen") },
    { valeur: "long", libelle: t("boutique.duree.long") },
  ];
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("boutique.f.titre")}
      pied={
        <View style={styles.pied}>
          <Appui accessibilityRole="button" onPress={() => setF(SANS_FILTRE)} style={styles.effacer}>
            <Texte style={{ fontFamily: police.medium, fontSize: 15, color: couleurs.t2 }}>{t("boutique.f.effacer")}</Texte>
          </Appui>
          <View style={{ flex: 1 }}>
            <BoutonPrincipal libelle={n ? compte(genre, n, true) : t("boutique.f.aucun")} onPress={() => onValider(f)} />
          </View>
        </View>
      }
    >
      <View>
        {libelleTitre("boutique.f.niveau")}
        <View style={styles.tuiles3}>
          {([1, 2, 3] as Niveau[]).map((k) => (
            <Tuile key={k} colonne on={f.niveau === k} onPress={() => basculer("niveau", k)} libelle={t(`boutique.niveau.${k}` as "boutique.niveau.1")}>
              <Barres n={k} couleur={f.niveau === k ? couleurs.action : couleurs.t2} grand />
            </Tuile>
          ))}
        </View>
        {libelleTitre("boutique.f.objectif")}
        <View style={styles.tuiles2}>
          {objectifs.map((o) => {
            const src = fichierPicto(OBJECTIF[o].picto, null, 34);
            return (
              <Tuile
                key={o}
                on={f.objectif === o}
                onPress={() => basculer("objectif", o)}
                libelle={t(`boutique.objectif.${o}` as "boutique.objectif.distance")}
              >
                <View style={styles.tuileIcone}>{src != null ? <Image source={src} style={{ width: 34, height: 34 }} resizeMode="contain" /> : null}</View>
              </Tuile>
            );
          })}
        </View>
        {libelleTitre("boutique.f.lieu")}
        <View style={styles.tuiles2}>
          {lieux.map((l) => (
            <Tuile key={l} on={f.lieu === l} onPress={() => basculer("lieu", l)} libelle={t(`boutique.lieu.${l}` as "boutique.lieu.dehors")}>
              <View style={styles.tuileIcone}>
                <Icone nom={ICONE_LIEU[l]} couleur={f.lieu === l ? couleurs.action : couleurs.t2} taille={20} />
              </View>
            </Tuile>
          ))}
        </View>
        {routines ? null : (
          <>
            {libelleTitre("boutique.f.seances")}
            <Segmente
              options={SEANCES}
              valeur={String(f.seances ?? 0)}
              onChange={(v) => setF((x) => ({ ...x, seances: v === "0" ? null : (Number(v) as SeancesFiltre) }))}
            />
            {libelleTitre("boutique.f.duree")}
            <Segmente options={DUREES} valeur={f.duree ?? "0"} onChange={(v) => setF((x) => ({ ...x, duree: v === "0" ? null : (v as DureeFiltre) }))} />
          </>
        )}
      </View>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  entete: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: 4, paddingRight: 8 },
  champ: { flex: 1, height: 44, borderRadius: rayon.l, paddingHorizontal: 14, fontFamily: police.regular, fontSize: 15, marginLeft: 2 },
  puces: { paddingHorizontal: 16, paddingVertical: 4, gap: 8 },
  puceZone: { height: 44, justifyContent: "center" },
  puce: { height: 36, paddingHorizontal: 14, borderRadius: rayon.m, flexDirection: "row", alignItems: "center", gap: 6 },
  nombre: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  rail: { paddingHorizontal: 16, gap: 12 },
  grille: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  // Demi-largeur, même seule sur sa rangée (planche boutiques, § 4, point 3) : pas de flexGrow.
  tuileObjectif: { width: "48.9%", height: 104, borderRadius: 14, overflow: "hidden" },
  objectifPicto: { position: "absolute", right: -6, bottom: -6, width: 100, height: 100 },
  objectifNom: { position: "absolute", left: 14, top: 12, right: 64, fontFamily: police.semibold, fontSize: 14.5, lineHeight: 19 },
  objectifNb: { position: "absolute", left: 14, bottom: 10, right: 72 },
  objectifNbTexte: { fontSize: 12, lineHeight: 16 },
  explique: { marginTop: 14, marginHorizontal: 16 },
  // 34 em au plus sur le Fold (planche boutiques, point 3).
  expliqueTexte: { fontSize: 14, lineHeight: 20, maxWidth: 34 * 14 },
  croise: { height: 44, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 2, marginLeft: -2, paddingHorizontal: 2 },
  rien: { paddingHorizontal: espace.l, paddingTop: 8, lineHeight: 19 },
  lib: { marginTop: 20, marginBottom: 8, marginHorizontal: 4 },
  tuiles2: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tuiles3: { flexDirection: "row", gap: 8 },
  tuile: { borderRadius: 12, minHeight: 52 },
  tuileLigne: { width: "48.6%", flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 12, paddingRight: 10 },
  tuileColonne: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 6 },
  tuileIcone: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  tuileTexte: { flex: 1, fontFamily: police.medium, fontSize: 14, lineHeight: 18 },
  pied: { flexDirection: "row", alignItems: "center", gap: 8 },
  effacer: { height: 44, paddingHorizontal: 14, justifyContent: "center" },
});
