import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, ScrollView, StyleSheet, View, type GestureResponderEvent } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ecrireReglage, grouperParType, lireReglage, lireType, ordreTypes, PICTO_TYPE, placerRoutine, rangerProgramme, supprimerRoutine, TYPES, vocabulaire,
  type Section, type TypeProgramme,
} from "../db";
import { useTheme } from "../theme";
import { echelle } from "../theme/mouvement";
import { espace, police, rayon } from "../theme/typo";
import { ouvrirRecap } from "./recap/ouvrir-recap";
import { useApp, useCharge } from "./contexte";
import { resumesRoutines, type ResumeRoutine } from "./donnees";
import { FeuilleDeplacerRoutine, FeuilleMenuSection } from "./FeuillesSection";
import { FeuilleNouveauProgramme } from "./FeuilleNouveauProgramme";
import { creerProgramme, detailCarte, metaCarte } from "./programmes-vue";
import { texteQuand } from "./Planif";
import { jourDe } from "./planif-donnees";
import { fenetreSemaine, lundiDe, type Occurrence } from "./planification";
import { usePlanif } from "./usePlanif";
import { ROUTINES } from "../boutique/donnees";
import { EntreeParcourir } from "../boutique/pile";
import { sousEntree } from "../boutique/ui";
import { BoutonPrincipal } from "../ui/Degrade";
import { rafraichirRappels } from "../natif/rappels";
import { cleRangee, type Rangee } from "./ordre-sections";
import { t } from "../i18n/index";
import { BoutonIcone } from "../ui/Cadre";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { useGlisserEntrainement } from "../ui/GlisserEntrainement";
import { ListeDesintegrable } from "../ui/Desintegration";
import { coinsJonction, GlisserSupprimer, useLigneDecalee } from "../ui/GlisserSupprimer";
import { useBulle } from "../ui/CoucheBulle";
import { Icone, type NomIcone } from "../ui/Icone";
import { Picto } from "../ui/Picto";
import { fichierPicto } from "../ui/pictos";
import { Appui } from "../ui/mouvement";
import { ChevronRepli, Repli } from "../ui/Repli";
import { Texte } from "../ui/Texte";
import { revenir } from "../ui/revenir";
import { signalerErreur } from "../ui/FeuilleMessage";

// Page Routines (planche sport-programmes-routines v2, retour 3, validée le 29/10) : en tête « Explorer les routines » (quatre
// vignettes empilées qui s'ouvrent une fois, vers Explorer les routines), un séparateur, puis les routines par type ; sans
// aucune routine, une phrase et « Créer une routine » en bouton plein. Les programmes suivis ont leur page (Programmes.tsx).
// Avant (planche idee-programmes, validée le 28/10 ; avant : Routines, planche page Entraînements A du 27/10) :
// les programmes rangés par type, une section par type qui en a (vignette, nom, nombre). Un en-tête replie sa section au
// toucher, se glisse par appui long (ordre des types) et a son menu ⋯ ; une carte se glisse aussi, dans son type ou un autre
// (elle en prend le type : le type ne verrouille rien, D4), et son ⋯ change son type. « + » ouvre « Nouveau programme » : le
// type d'abord, celui du sport d'où l'on vient présélectionné. Les sections nommées de l'ancienne page (routine_sections)
// restent en base, intactes, mais ne s'affichent plus. Aucun programme n'est mis en avant : chaque carte a son « Démarrer »
// en tonal, pas de dégradé (un seul orange par écran).
/** Pictos montrés sur la carte d'une routine, puis « +n » pour le reste. */
const PICTOS = 5;

const DELAI_ANNULER_MS = 8000;
/** Réglages locaux de la sous-page : ordre des types (glissé ou ⋯ Monter / Descendre) et types repliés. */
const CLE_ORDRE = "programmes.ordre";
const CLE_REPLIES = "programmes.replies";

const liste = (v: string | null): string[] => {
  try {
    const x: unknown = JSON.parse(v ?? "[]");
    return Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : [];
  } catch {
    return [];
  }
};

export function Routines() {
  const { db } = useApp();
  const { couleurs } = useTheme();
  // Sport d'où l'on vient (feuille d'un sport › « Tous les WOD ») : présélectionné dans « Nouveau programme » (D4).
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const [d, recharger] = useCharge<{ ordre: TypeProgramme[]; replies: string[]; routines: ResumeRoutine[] }>(async () => {
    rafraichirRappels(db).catch(console.error);
    return {
      ordre: ordreTypes(liste(await lireReglage(db, CLE_ORDRE))),
      replies: liste(await lireReglage(db, CLE_REPLIES)),
      routines: await resumesRoutines(db),
    };
  }, [db]);
  // Planification : la semaine en cours, pour les prochaines séances des cartes et la programmation du ⋯.
  const lundi = lundiDe(jourDe(Date.now()));
  const plan = usePlanif(fenetreSemaine(lundi));
  const p = plan.p;
  const auj = p?.aujourdhui ?? jourDe(Date.now());
  // Copies locales : replier et glisser s'affichent tout de suite, sans relire les routines.
  const [ordre, setOrdre] = useState<TypeProgramme[]>([...TYPES]);
  const [replies, setReplies] = useState<string[]>([]);
  const [routines, setRoutines] = useState<ResumeRoutine[]>([]);
  useEffect(() => {
    if (!d) return;
    setOrdre(d.ordre);
    setReplies(d.replies);
    setRoutines(d.routines);
  }, [d]);
  const [menu, setMenu] = useState<Section | null>(null);
  const [aDeplacer, setADeplacer] = useState<ResumeRoutine | null>(null);
  const [choixType, setChoixType] = useState(false);
  // La bulle de séance est une couche partagée (ui/CoucheBulle) : le contenu défile dessous, on lui réserve sa place.
  const bulle = useBulle();
  // Sans barre du bas, la bulle se pose au-dessus de la barre de gestes (elle était collée au bord de l'écran).
  const insetBas = useSafeAreaInsets().bottom;
  const reserve = insetBas + espace.s;
  const { reserverBas } = bulle;
  useFocusEffect(useCallback(() => reserverBas(reserve), [reserverBas, reserve]));
  const basContenu = bulle.enCours ? bulle.hauteur + reserve : espace.l;
  const ecrire = (p: Promise<unknown>) => p.then(recharger).catch(signalerErreur());
  // Balayée vers la gauche : la routine quitte la liste tout de suite, la base attend que « Annuler » ait expiré (27/10).
  const [enAttente, setEnAttente] = useState<ResumeRoutine | null>(null);
  const attente = useRef<{ id: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const confirmer = () => {
    const a = attente.current;
    if (!a) return;
    clearTimeout(a.minuterie);
    attente.current = null;
    ecrire(supprimerRoutine(db, a.id));
  };
  // Écran quitté pendant le délai : la suppression part sans attendre.
  useEffect(
    () => () => {
      const a = attente.current;
      if (a) clearTimeout(a.minuterie);
      if (a) supprimerRoutine(db, a.id).catch(signalerErreur("supprimer"));
    },
    [db],
  );

  // Une section par type qui a des programmes, dans l'ordre choisi ; aucun programme : la section Musculation vide (« Ajouter »).
  const visibles = enAttente ? routines.filter((r) => r.id !== enAttente.id) : routines;
  const parType = grouperParType(visibles, ordre);
  // Aucune routine (retour 3) : pas de section vide, une phrase et « Créer une routine » en bas.
  const aucune = !!d && !routines.length;
  const groupes = parType.map((g) => ({
    section: { id: g.type, nom: t(vocabulaire(g.type).type), ordre: 0, repliee: replies.includes(g.type) } satisfies Section,
    routines: g.routines,
  }));
  const sections = groupes.map((g) => g.section);
  const ids: string[] = sections.map((s) => s.id);
  const rangees: Rangee[] = groupes.flatMap(({ section: s, routines: l }): Rangee[] => [
    { genre: "tete", sectionId: s.id, ouverte: !s.repliee, h: 0 },
    ...(s.repliee ? [] : l.length ? l.map((r): Rangee => ({ genre: "carte", id: r.id, sectionId: s.id, h: 0 })) : [{ genre: "vide" as const, sectionId: s.id, h: 0 }]),
  ]);
  const glisse = useGlisserEntrainement({
    sections: ids,
    rangees,
    margeBas: basContenu,
    onDeposerSections: (l) => ranger([...l, ...ordre.filter((x) => !l.includes(x))] as TypeProgramme[]),
    onDeposerRoutine: (id, c) => {
      const avant = groupes.map((g) => ({ sectionId: g.section.id, ids: g.routines.map((r) => r.id) }));
      const apres = placerRoutine(avant, id, c.sectionId, c.rang);
      if (JSON.stringify(apres) === JSON.stringify(avant)) return;
      const parId = new Map(routines.map((r) => [r.id, r]));
      // Les autres programmes (en attente de suppression compris) gardent leur place : seuls ceux affichés bougent.
      const deplaces = new Map(apres.flatMap((g) => g.ids.map((x) => [x, g.sectionId] as const)));
      const ranges = apres.flatMap((g) => g.ids.map((x) => ({ ...parId.get(x)!, type: lireType(g.sectionId) })));
      setRoutines([...ranges, ...routines.filter((r) => !deplaces.has(r.id))]);
      rangerProgramme(db, id, lireType(c.sectionId), c.rang).catch(signalerErreur());
    },
  });

  const ranger = (l: TypeProgramme[]) => {
    setOrdre(l);
    ecrireReglage(db, CLE_ORDRE, JSON.stringify(l)).catch(signalerErreur());
  };
  /** Monte ou descend un type parmi ceux affichés ; les types sans programme gardent leur place relative. */
  const deplacerType = (type: string, sens: -1 | 1) => {
    const i = ids.indexOf(type);
    const voisin = ids[i + sens];
    if (i < 0 || !voisin) return;
    const l = [...ordre];
    const a = l.indexOf(type as TypeProgramme);
    const b = l.indexOf(voisin as TypeProgramme);
    [l[a], l[b]] = [l[b]!, l[a]!];
    ranger(l);
  };
  const nouvelle = async (type: TypeProgramme) => {
    const id = await creerProgramme(db, type);
    router.push({ pathname: "/routine/[id]", params: { id, nouvelle: "1" } });
  };
  const replier = (s: Section) => {
    if (glisse.recent()) return;
    const l = s.repliee ? replies.filter((x) => x !== s.id) : [...replies, s.id];
    setReplies(l);
    ecrireReglage(db, CLE_REPLIES, JSON.stringify(l)).catch(signalerErreur());
  };
  const supprimerLaRoutine = (id: string) => {
    confirmer();
    const r = routines.find((x) => x.id === id);
    if (!r) return;
    const minuterie = setTimeout(() => {
      confirmer();
      setEnAttente((x) => (x?.id === id ? null : x));
    }, DELAI_ANNULER_MS);
    attente.current = { id, minuterie };
    setEnAttente(r);
  };
  const annulerSuppression = () => {
    if (attente.current) clearTimeout(attente.current.minuterie);
    attente.current = null;
    setEnAttente(null);
  };
  const rangMenu = menu ? ids.indexOf(menu.id) : -1;
  const presel = typeParam ? lireType(typeParam) : (groupes[0]?.section.id as TypeProgramme | undefined) ?? "muscu";

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      {/* En-tête de la planche : 64 de haut, ← en t1, titre 20 / 600, + pour un nouveau programme (le type d'abord). */}
      <View style={styles.entetePage}>
        <BoutonIcone nom="back" couleur={couleurs.t1} libelle={t("ui.retour")} onPress={revenir} />
        <Texte variante="titre" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, marginLeft: 2 }}>
          {t("programmes.titre")}
        </Texte>
        <BoutonIcone nom="plus" libelle={t("programmes.nouveau")} onPress={() => setChoixType(true)} />
      </View>
      <View {...glisse.zoneProps} style={{ flex: 1 }}>
        <ScrollView {...glisse.scrollProps} contentContainerStyle={{ paddingBottom: basContenu + espace.l }}>
          {/* Boutique en tête (retour 3) : la grande entrée et son séparateur, au-dessus des types. */}
          <EntreeParcourir
            titre={t("boutique.parcourirRoutines")}
            sous={sousEntree("routine")}
            articles={["r-push-a", "r-kb-emom", "r-hiit-20", "r-hanches"].map((id) => ROUTINES.find((r) => r.id === id)!).filter(Boolean)}
            onPress={() => router.push({ pathname: "/boutique", params: { genre: "routine" } })}
            style={{ marginTop: 4 }}
          />
          {aucune && !enAttente ? (
            <View style={styles.aucune}>
              <Texte style={{ fontFamily: police.semibold, fontSize: 15, textAlign: "center", color: couleurs.t1 }}>{t("boutique.vide.aucun")}</Texte>
              <Texte style={{ fontSize: 13, lineHeight: 19, textAlign: "center", color: couleurs.t2, marginTop: 6 }}>{t("boutique.vide.aucunSous")}</Texte>
            </View>
          ) : null}
          <View {...glisse.listeProps}>
            <ListeDesintegrable
              liste={groupes}
              cleDe={(g) => g.section.id}
              enveloppe={({ section: s, routines }, etat) => {
                const tenu = glisse.tenu;
                const devant = tenu != null && (tenu.genre === "section" ? tenu.id === s.id : routines.some((r) => r.id === tenu.id));
                return { style: devant && { zIndex: 1 }, onLayout: etat === "sort" ? undefined : glisse.posSection(s.id) };
              }}
              rendu={({ section: s, routines }) => {
                const tenu = glisse.tenu;
                const tenue = tenu?.genre === "section" && tenu.id === s.id;
                const porte = tenu?.genre === "routine" && routines.some((r) => r.id === tenu.id);
                const repliee = tenu?.genre === "section" || s.repliee;
                const visee = glisse.survol === s.id;
                const tete: Rangee = { genre: "tete", sectionId: s.id, ouverte: !s.repliee, h: 0 };
                const vide: Rangee = { genre: "vide", sectionId: s.id, h: 0 };
                return (
                  <Animated.View
                    style={[
                      (tenue || porte) && { zIndex: 1 },
                      { transform: [{ translateY: tenue ? glisse.ty : glisse.decalage(`s:${s.id}`) }, { translateX: tenue ? glisse.tx : 0 }, { scale: tenue ? 1.03 : 1 }] },
                    ]}
                  >
                    <Animated.View onLayout={glisse.mesure(tete)} style={{ transform: [{ translateY: glisse.decalage(cleRangee(tete)) }] }}>
                      <View
                        {...glisse.toucher({ genre: "section", id: s.id })}
                        style={[
                          styles.tete,
                          (tenue || visee) && { backgroundColor: tenue ? couleurs.s1 : couleurs.s2, borderRadius: rayon.l },
                          tenue && { elevation: 8 },
                        ]}
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${s.nom}, ${routines.length}`}
                          accessibilityState={{ expanded: !s.repliee }}
                          onPress={() => replier(s)}
                          style={styles.teteNom}
                        >
                          <ChevronRepli ouvert={!repliee} couleur={couleurs.t3} />
                          <VignetteType type={s.id as TypeProgramme} />
                          <Texte variante="entete" couleur="t2" numberOfLines={1} style={{ flexShrink: 1, marginLeft: -2 }}>
                            {s.nom}
                          </Texte>
                          <Texte variante="meta" couleur="t3">
                            {routines.length}
                          </Texte>
                        </Pressable>
                        <BoutonIcone nom="more" taille={20} libelle={t("accueil.entrainement.optionsDe", { nom: s.nom })} onPress={() => !glisse.recent() && setMenu(s)} />
                      </View>
                    </Animated.View>
                    {/* Replier ou déplier : le contenu fond, la place se referme, les sections suivantes glissent (n° 55) ;
                        une section tenue pour être glissée replie tout d'un coup (positions mesurées). */}
                    <Repli ouvert={!repliee} immediat={tenu?.genre === "section"}>
                      <ListeDesintegrable
                        liste={routines}
                        cleDe={(r) => r.id}
                        enveloppe={(r) => ({ style: tenu?.genre === "routine" && tenu.id === r.id && { zIndex: 1 } })}
                        // Section vide, la dernière routine finie de se désintégrer (pas avant) : « Ajouter une routine ».
                        vide={
                          <Animated.View onLayout={glisse.mesure(vide)} style={{ transform: [{ translateY: glisse.decalage(cleRangee(vide)) }] }}>
                            <Appui
                              accessibilityRole="button"
                              accessibilityLabel={t("accueil.entrainement.ajouterRoutine")}
                              onPress={() => !glisse.recent() && nouvelle(lireType(s.id)).catch(signalerErreur())}
                              style={({ pressed }) => [
                                styles.vide,
                                { borderColor: visee ? couleurs.t2 : couleurs.line2 },
                                (pressed || visee) && { backgroundColor: couleurs.s2 },
                              ]}
                            >
                              <Icone nom="plus" couleur={couleurs.t2} taille={18} />
                              <Texte variante="corps" couleur="t2" style={{ fontFamily: police.medium }}>
                                {t("accueil.entrainement.ajouterRoutine")}
                              </Texte>
                            </Appui>
                          </Animated.View>
                        }
                        rendu={(r, etat) => {
                          const carte: Rangee = { genre: "carte", id: r.id, sectionId: s.id, h: 0 };
                          const tenueR = tenu?.genre === "routine" && tenu.id === r.id;
                          // Fantôme qui se désintègre : hors du glisser-déposer.
                          const vive = etat !== "sort";
                          return (
                            <Animated.View
                              {...(vive ? glisse.toucher({ genre: "routine", id: r.id }) : {})}
                              onLayout={vive ? glisse.mesure(carte) : undefined}
                              style={[
                                tenueR && { zIndex: 1 },
                                { transform: [{ translateY: tenueR ? glisse.ty : vive ? glisse.decalage(cleRangee(carte)) : 0 }, { translateX: tenueR ? glisse.tx : 0 }, { scale: tenueR ? 1.03 : 1 }] },
                              ]}
                            >
                              <GlisserSupprimer
                                actif={() => !glisse.recent()}
                                fondContenu="transparent"
                                style={styles.cadreCarte}
                                onSupprimer={() => supprimerLaRoutine(r.id)}
                              >
                                <CarteRoutine
                                  r={r}
                                  tenue={tenueR}
                                  garde={glisse.recent}
                                  onOptions={() => setADeplacer(r)}
                                  prochaine={p?.prochaines.get(r.id)}
                                  orange={p?.plusProche === r.id}
                                  aujourdhui={auj}
                                  seanceEnCours={!!bulle.enCours}
                                />
                              </GlisserSupprimer>
                            </Animated.View>
                          );
                        }}
                      />
                    </Repli>
                  </Animated.View>
                );
              }}
            />
          </View>
        </ScrollView>
        {!enAttente && !plan.regles ? plan.bulle(basContenu + espace.s) : null}
        {enAttente ? (
          <BandeauAnnuler
            texte={t("accueil.entrainement.routineSupprimee", { nom: enAttente.nom })}
            bas={basContenu + espace.s}
            onAnnuler={annulerSuppression}
          />
        ) : null}
      </View>
      <FeuilleMenuSection
        section={menu}
        premiere={rangMenu === 0}
        derniere={rangMenu === ids.length - 1}
        onFermer={() => setMenu(null)}
        libelleAjouter={menu ? t(vocabulaire(lireType(menu.id)).nomDefaut) : undefined}
        onAjouter={() => {
          const s = menu;
          setMenu(null);
          if (s) nouvelle(lireType(s.id)).catch(signalerErreur());
        }}
        onMonter={() => {
          if (menu) deplacerType(menu.id, -1);
          setMenu(null);
        }}
        onDescendre={() => {
          if (menu) deplacerType(menu.id, 1);
          setMenu(null);
        }}
      />
      {/* Sans routine : « Créer une routine », seul bouton plein de la page (le type d'abord, comme le +). En position absolue,
          il ignore le rembourrage bas du SafeAreaView : sa marge compte la barre de navigation et la bulle de séance. */}
      {aucune && !enAttente ? (
        <View style={[styles.basVide, { bottom: (bulle.enCours ? bulle.hauteur + reserve : insetBas) + espace.l }]}>
          <BoutonPrincipal icone="plus" libelle={t("boutique.vide.creer")} onPress={() => setChoixType(true)} />
        </View>
      ) : null}
      <FeuilleNouveauProgramme
        visible={choixType}
        preselection={presel}
        onFermer={() => setChoixType(false)}
        onChoisir={(type) => {
          setChoixType(false);
          nouvelle(type).catch(signalerErreur());
        }}
      />
      <FeuilleDeplacerRoutine
        routine={aDeplacer ? { nom: aDeplacer.nom, sectionId: aDeplacer.type } : null}
        sections={TYPES.map((type) => ({ id: type, nom: t(vocabulaire(type).type), ordre: 0, repliee: false }))}
        libelle={t("programmes.typeLibelle")}
        onFermer={() => setADeplacer(null)}
        onChoisir={(type) => {
          // Changer de type : le programme va en fin de sa nouvelle section, tout son contenu gardé.
          if (aDeplacer) ecrire(rangerProgramme(db, aDeplacer.id, lireType(type), Number.MAX_SAFE_INTEGER));
          setADeplacer(null);
        }}
        programmation={aDeplacer && p ? resumeProgrammation(p.progs.filter((x) => x.routineId === aDeplacer.id && x.actif).map((x) => x.texte)) : undefined}
        onProgrammation={() => {
          if (aDeplacer) plan.actions.ouvrirProgrammation(aDeplacer.id);
          setADeplacer(null);
        }}
      />
      {plan.feuilles}
    </SafeAreaView>
  );
}

/** Les boutons d'une carte gardent leur toucher : un appui long dessus ne prend pas la carte pour la glisser. */
const sansGlisser = (e: GestureResponderEvent) => e.stopPropagation();

/** Vignette d'un type dans l'en-tête de sa section (24 px, planche) ; sans picto (autre sport), l'haltère. */
function VignetteType({ type }: { type: TypeProgramme }) {
  const { couleurs } = useTheme();
  const src = fichierPicto(PICTO_TYPE[type], null, 24);
  return src != null ? (
    <Image source={src} style={styles.vignette} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
  ) : (
    <Icone nom="dumbbell" couleur={couleurs.t3} taille={18} />
  );
}

/** Carte d'un programme : nom, format ou durée et ⋯ (type, programmation), pictos, détail, puis « Démarrer » dans les mots du type.
 *  `garde` : vrai pendant ou juste après un glisser, le toucher qui le termine n'ouvre rien. */
function CarteRoutine({
  r,
  tenue,
  garde,
  onOptions,
  prochaine,
  orange,
  aujourdhui,
  seanceEnCours,
}: {
  r: ResumeRoutine;
  tenue: boolean;
  garde: () => boolean;
  onOptions: () => void;
  prochaine?: Occurrence;
  orange: boolean;
  aujourdhui: string;
  /** Une seule séance à la fois : avec une séance en cours, on y revient par sa bulle ; Démarrer reste, désactivé. */
  seanceEnCours: boolean;
}) {
  const { couleurs, mode } = useTheme();
  const jour = mode === "jour";
  // Glissée vers « Supprimer » : coins de droite droits, une seule pièce avec le bouton (B8 ; elle gardait ses coins ronds).
  const decalee = useLigneDecalee();
  return (
    // Page sans aura : le jour, la carte en verre blanc se confondait avec le fond et son bouton blanc (planche : carte s1).
    <View
      style={[
        styles.carteRoutine,
        { backgroundColor: jour ? (tenue ? couleurs.s2 : couleurs.s1) : tenue ? couleurs.s1 : couleurs.carteOpaque, borderColor: couleurs.verreFilet },
        tenue && { elevation: 8 },
        coinsJonction(decalee),
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("accueil.entrainement.voir", { nom: r.nom, exercices: r.exercices.map((e) => e.nom).join(", ") })}
        onPress={() => !garde() && ouvrirRecap({ routineId: r.id })}
        style={styles.entete}
      >
        <View style={styles.ligne}>
          <Texte variante="exercice" numberOfLines={1} style={{ flex: 1 }}>
            {r.nom}
          </Texte>
          {/* Programme vide : pas de « ~ 0 min » (« Aucun exercice » le dit dessous) ; un WOD montre son format. */}
          {r.exercices.length || r.format ? (
            <Texte variante="meta" couleur="t3">
              {metaCarte(r)}
            </Texte>
          ) : null}
          <View onTouchStart={sansGlisser}>
            <Appui
              accessibilityRole="button"
              accessibilityLabel={t("accueil.entrainement.optionsDe", { nom: r.nom })}
              onPress={() => !garde() && onOptions()}
              hitSlop={12}
              style={({ pressed }) => [styles.options, pressed && { backgroundColor: couleurs.s2 }]}
            >
              <Icone nom="more" couleur={couleurs.t2} taille={20} />
            </Appui>
          </View>
        </View>
        {prochaine ? (
          <View style={styles.prochaine}>
            <Icone nom="cal" couleur={orange ? couleurs.action : couleurs.t2} taille={16} />
            <Texte variante="corps" style={{ color: orange ? couleurs.action : couleurs.t2, fontFamily: orange ? police.medium : police.regular }}>
              {t("planif.prochaine", { quand: texteQuand(prochaine.date, aujourdhui) })}
            </Texte>
          </View>
        ) : null}
        {r.exercices.length ? (
          <View style={styles.pictos}>
            {r.exercices.slice(0, PICTOS).map((e, i) => (
              <Picto key={i} slug={e.slug} nom={e.nom} taille={44} />
            ))}
            {r.exercices.length > PICTOS ? (
              <View style={[styles.reste, { backgroundColor: couleurs.s2 }]}>
                <Texte variante="meta" couleur="t2">
                  +{r.exercices.length - PICTOS}
                </Texte>
              </View>
            ) : null}
          </View>
        ) : null}
        {r.exercices.length ? (
          <Texte variante="corps" couleur="t2" numberOfLines={1} style={styles.detail}>
            {detailCarte(r)}
          </Texte>
        ) : (
          <Texte variante="corps" couleur="t2">
            {t("accueil.entrainement.aucunExercice")}
          </Texte>
        )}
      </Pressable>
      <View onTouchStart={sansGlisser}>
        <BoutonCarte
          icone="play"
          libelle={t(vocabulaire(r.type).demarrer)}
          accessibilityLabel={t("accueil.entrainement.demarrerNom", { nom: r.nom })}
          desactive={r.exercices.length === 0 || seanceEnCours}
          onPress={() => !garde() && ouvrirRecap({ routineId: r.id })}
        />
      </View>
    </View>
  );
}

/** Valeur de « Programmation » dans le ⋯ d'une routine : la première règle, « +n » pour les autres, ou « Aucune ». */
function resumeProgrammation(textes: string[]): string {
  if (!textes.length) return t("planif.aucune");
  const premier = textes[0]!.charAt(0).toUpperCase() + textes[0]!.slice(1);
  return textes.length > 1 ? t("planif.etAutres", { texte: premier, n: textes.length - 1 }) : premier;
}

/** Bouton tonal pleine largeur d'une carte : arrondi 12 dans la carte de 16 ; sur s2 la nuit, sur le fond le jour. */
function BoutonCarte({
  icone,
  libelle,
  accessibilityLabel,
  desactive = false,
  onPress,
}: {
  icone: NomIcone;
  libelle: string;
  accessibilityLabel?: string;
  desactive?: boolean;
  onPress: () => void;
}) {
  const { couleurs, mode } = useTheme();
  const fond = mode === "nuit" ? couleurs.s2 : couleurs.bg;
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? libelle}
      accessibilityState={{ disabled: desactive }}
      disabled={desactive}
      onPress={onPress}
      echelle={echelle.appuiPrincipal}
      style={({ pressed }) => [styles.bouton, { backgroundColor: pressed ? couleurs.s3 : fond, opacity: desactive ? 0.38 : 1 }, mode === "jour" && { borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.line2 }]}
    >
      <Icone nom={icone} couleur={couleurs.t1} taille={icone === "play" ? 16 : 20} />
      <Texte variante="exercice" style={{ fontSize: 15 }}>
        {libelle}
      </Texte>
    </Appui>
  );
}

const styles = StyleSheet.create({
  entreeBoutique: { marginHorizontal: espace.l, marginTop: espace.xs, marginBottom: espace.s },
  entetePage: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: espace.xs, paddingRight: espace.s },
  cadreCarte: { marginHorizontal: espace.l, marginBottom: espace.s, borderRadius: rayon.l },
  carteRoutine: { padding: espace.l, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth },
  entete: { gap: espace.xs, paddingBottom: 14 },
  ligne: { flexDirection: "row", alignItems: "center", gap: espace.m },
  options: { width: 32, height: 28, marginVertical: -4, marginRight: -espace.s, borderRadius: rayon.s, alignItems: "center", justifyContent: "center" },
  detail: { marginTop: espace.s },
  prochaine: { flexDirection: "row", alignItems: "center", gap: 6 },
  pictos: { flexDirection: "row", gap: espace.s, marginTop: 6 },
  reste: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tete: { height: 44, marginTop: espace.s, marginHorizontal: espace.s, flexDirection: "row", alignItems: "center" },
  teteNom: { flex: 1, height: 44, flexDirection: "row", alignItems: "center", gap: espace.s, paddingLeft: espace.l },
  // Marge de 16, comme le reste de la page (revue finale n° 40, D8).
  aucune: { marginTop: 40, marginHorizontal: espace.l },
  basVide: { position: "absolute", left: espace.l, right: espace.l },
  vide: {
    height: 64,
    marginHorizontal: espace.l,
    marginBottom: espace.s,
    borderRadius: rayon.l,
    borderWidth: 1,
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espace.s,
  },
  vignette: { width: 24, height: 24 },
  bouton: { minHeight: 48, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
});
