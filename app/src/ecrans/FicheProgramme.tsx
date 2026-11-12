import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AvecPep } from "../ui/Pep";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient as LG, Pattern, Rect, Stop } from "react-native-svg";
import { dureeSeance, profil, volumes, ZONES, type Segment } from "../boutique/calculs";
import { article, cibleBloc, langue, nomExercice, sousVolume, texteVolume, tx } from "../boutique/donnees";
import { estRoutine, SOURCES, type Article, type Programme, type Seance } from "../boutique/modele";
import { usePageArrivee } from "../boutique/page-arrivee";
import { alpha, Barres, useFamille, Vignette } from "../boutique/ui";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { duree as durees } from "../theme/mouvement";
import { espace, police, rayon, TAILLE_MIN } from "../theme/typo";
import { BoutonIcone } from "../ui/Cadre";
import { useLargeurContenu } from "../ui/CadreContenu";
import { BoutonPrincipal } from "../ui/Degrade";
import { Icone, type NomIcone } from "../ui/Icone";
import { Appui, courbes } from "../ui/mouvement";
import { Picto } from "../ui/Picto";
import { revenir } from "../ui/revenir";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { FeuilleDemarrer } from "./FeuilleDemarrer";
import { FicheRoutine } from "./FicheRoutine";
import { approx, dureeCourte, libelleSuperset } from "./format";

// Fiche d'un programme (planche boutique-programmes : a7 et a8 pour l'endurance, b3 pour la force) : visuel en dégradé de la
// famille avec le picto 3D et le chiffre fort, quatre chiffres, avertissement médical (D5), « À tes jours », volume semaine
// par semaine avec les phases, liste des semaines, séance type (profil des zones en endurance, pictos des exercices en
// force), progression, principes et sources, marquage « en relecture » (D4). « Démarrer ce programme » ouvre la feuille.
// Une routine de la boutique (l'autre rayon) a sa propre fiche, FicheRoutine, faite des mêmes briques.

/** Semaines montrées avant « Voir les n semaines ». */
const SEMAINES_VISIBLES = 4;

export function FicheProgramme() {
  useLangue();
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = article(id ?? "");
  if (a && estRoutine(a)) return <FicheRoutine r={a} />;
  return <FicheDuProgramme p={a} />;
}

function FicheDuProgramme({ p }: { p: Programme | null }) {
  const { couleurs } = useTheme();
  const haut = useSafeAreaInsets().top;
  const [demarrer, setDemarrer] = useState(false);
  // Passé le visuel, la barre du haut devient pleine avec le nom du programme (planche a8).
  const [colle, setColle] = useState(false);
  if (!p)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: couleurs.bg, padding: espace.l }}>
        <Texte variante="corps" couleur="t2">
          {t("boutique.fiche.introuvable")}
        </Texte>
      </SafeAreaView>
    );
  return (
    <View style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const c = passeLeVisuel(e.nativeEvent.contentOffset.y, haut);
          if (c !== colle) setColle(c);
        }}
      >
        <Vignette p={p} hauteur={340} gros={64} rayon={28} heros pastille={tx(p.lieuCourt)} pastilleHaut={haut + 64} />
        <View style={styles.ft}>
          <Texte accessibilityRole="header" style={styles.titre}>
            {tx(p.nom)}
          </Texte>
          {/* Mention de marque sous le titre (règle « pep », retour 6) : « Programme pepfit », pep en italique. */}
          <Texte style={[styles.marque, { color: couleurs.t2 }]}>
            <AvecPep texte={t("boutique.fiche.marque")} />
          </Texte>
          <Texte style={[styles.description, { color: couleurs.t2 }]}>{tx(p.description)}</Texte>
        </View>
        <Chiffres p={p} />
        {p.avertissement ? <Carte icone="alerte" titre={t("boutique.fiche.avertissement")} texte={tx(p.avertissement)} fort /> : null}
        <Carte icone="cal" titre={t("boutique.fiche.aTesJours")} texte={t("boutique.fiche.aTesJoursTexte")} />
        <SousTitre titre={t("boutique.fiche.parSemaine")} sous={sousVolume(p)} />
        <Volume p={p} />
        <Semaines p={p} />
        <SeanceType p={p} />
        {p.progression ? <Carte icone="repeat" texte={tx(p.progression)} /> : null}
        <SousTitre titre={t("boutique.fiche.principes")} />
        <Texte style={[styles.paragraphe, { color: couleurs.t2 }]}>{tx(p.principes)}</Texte>
        <Carte icone="info" titre={t("boutique.fiche.relecture")} texte={t("boutique.fiche.relectureTexte")} neutre />
        <Texte style={[styles.sources, { color: couleurs.t3 }]}>
          {t("boutique.fiche.construit")} {p.sources.map((i) => SOURCES[i]).join(" ; ")}.
        </Texte>
      </ScrollView>
      <BarreHaut colle={colle} titre={tx(p.nom)} />
      <BasFixe>
        <BoutonPrincipal libelle={t("boutique.fiche.demarrer")} icone="play" onPress={() => setDemarrer(true)} />
      </BasFixe>
      <FeuilleDemarrer p={p} visible={demarrer} onFermer={() => setDemarrer(false)} />
    </View>
  );
}

/** Hauteur de défilement où le visuel est passé : la barre du haut devient pleine (planche a8). */
export const passeLeVisuel = (y: number, haut: number) => y > 340 - haut - 64;

/** Barre du haut posée sur le visuel : retour dans un rond translucide ; pleine, avec le titre, une fois le visuel passé. */
export function BarreHaut({ colle, titre }: { colle: boolean; titre: string }) {
  const { couleurs } = useTheme();
  const haut = useSafeAreaInsets().top;
  return colle ? (
    <Animated.View
      entering={FadeIn.duration(durees.bulle).easing(courbes.sortie)}
      exiting={FadeOut.duration(durees.sortie).easing(courbes.sortie)}
      style={[styles.tete, { paddingTop: haut, backgroundColor: couleurs.bg, borderBottomColor: couleurs.line }]}
    >
      <BoutonIcone nom="back" couleur={couleurs.t1} libelle={t("ui.retour")} onPress={revenir} />
      <Texte numberOfLines={1} style={{ flex: 1, fontFamily: police.semibold, fontSize: 17, marginLeft: 2 }}>
        {titre}
      </Texte>
    </Animated.View>
  ) : (
    <View style={[styles.barre, { top: haut + 4 }]} pointerEvents="box-none">
      <Rond icone="back" libelle={t("ui.retour")} onPress={revenir} />
    </View>
  );
}

export function Rond({ icone, libelle, onPress }: { icone: NomIcone; libelle: string; onPress: () => void }) {
  const { mode, couleurs } = useTheme();
  const nuit = mode === "nuit";
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      style={[styles.rond, { backgroundColor: nuit ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.75)" }]}
    >
      <Icone nom={icone} couleur={nuit ? "#ffffff" : couleurs.t1} taille={20} />
    </Appui>
  );
}

/** Bas fixe : le bouton principal sur un fondu du fond de page. */
export function BasFixe({ children }: { children: ReactNode }) {
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [t2, setT2] = useState({ l: 0, h: 0 });
  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => setT2({ l: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
      style={[styles.basFixe, { paddingBottom: bas + espace.l }]}
    >
      {t2.l ? (
        <Svg style={StyleSheet.absoluteFill} width={t2.l} height={t2.h} pointerEvents="none">
          <Defs>
            <LinearGradientFondu couleur={couleurs.bg} />
          </Defs>
          <Rect width={t2.l} height={t2.h} fill="url(#basfixe)" />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
function LinearGradientFondu({ couleur }: { couleur: string }) {
  return (
    <LG id="basfixe" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={couleur} stopOpacity={0} />
      <Stop offset="0.3" stopColor={couleur} stopOpacity={0.92} />
      <Stop offset="0.55" stopColor={couleur} stopOpacity={1} />
    </LG>
  );
}

function Chiffres({ p }: { p: Programme }) {
  const { couleurs } = useTheme();
  const cases: { valeur: ReactNode; legende: string }[] = [
    { valeur: String(p.semaines), legende: t("boutique.fiche.semaines") },
    { valeur: String(p.seancesParSemaine), legende: t("boutique.fiche.seancesSem") },
    {
      valeur: (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Barres n={p.niveau} couleur={couleurs.t1} />
          <Texte style={styles.chiffre}>{p.niveau === 2 ? t("boutique.niveauCourt.2") : t(`boutique.niveau.${p.niveau}` as "boutique.niveau.1")}</Texte>
        </View>
      ),
      legende: t("boutique.fiche.niveau"),
    },
    { valeur: tx(p.materiel), legende: t("boutique.fiche.materiel") },
  ];
  return (
    <View style={[styles.chiffres, { backgroundColor: couleurs.s1 }]}>
      {cases.map((c, i) => (
        <View key={i} style={[styles.case, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: couleurs.line2 }]}>
          {typeof c.valeur === "string" ? (
            <Texte numberOfLines={1} adjustsFontSizeToFit style={styles.chiffre}>
              {c.valeur}
            </Texte>
          ) : (
            c.valeur
          )}
          <Texte numberOfLines={1} style={{ fontSize: 11.5, color: couleurs.t3, marginTop: 3 }}>
            {c.legende}
          </Texte>
        </View>
      ))}
    </View>
  );
}

/** Carte d'information : teinte de l'action (À tes jours, progression), rouge doux pour l'avertissement, neutre pour la relecture. */
export function Carte({ icone, titre, texte, fort, neutre }: { icone: NomIcone; titre?: string; texte: string; fort?: boolean; neutre?: boolean }) {
  const { couleurs } = useTheme();
  const teinte = fort ? couleurs.rate : couleurs.action;
  return (
    <View style={[styles.carte, { backgroundColor: neutre ? couleurs.s1 : alpha(teinte, 0.09) }]}>
      <Icone nom={icone} couleur={neutre ? couleurs.t2 : teinte} taille={18} />
      <Texte style={{ flex: 1, fontSize: 13, lineHeight: 18, color: couleurs.t2 }}>
        {titre ? <Texte style={{ fontFamily: police.semibold, fontSize: 13, color: couleurs.t1 }}>{titre} </Texte> : null}
        {texte}
      </Texte>
    </View>
  );
}

export function SousTitre({ titre, sous }: { titre: string; sous?: string }) {
  const { couleurs } = useTheme();
  return (
    <Texte accessibilityRole="header" style={styles.h5}>
      {titre}
      {sous ? <Texte style={{ fontFamily: police.regular, fontSize: 13, color: couleurs.t3 }}>{`  ${sous}`}</Texte> : null}
    </Texte>
  );
}

/** Volume semaine par semaine : barres de la couleur de la famille (la première pleine, l'affûtage pâle), puis les phases. */
function Volume({ p }: { p: Programme }) {
  const { couleurs } = useTheme();
  const f = useFamille(p.famille);
  const v = useMemo(() => volumes(p), [p]);
  const mx = Math.max(...v, 1);
  const derniere = p.calendrier.length - 1;
  const jourJ = p.calendrier[derniere]!.seances.some((c) => p.seances[c]!.epreuve);
  const phaseAff = p.phases.findIndex((ph) => /affûtage|taper/i.test(ph.nom.fr));
  // Les barres poussent quand la fiche est arrivée, pas sous son entrée (comme la pile, revue finale n° 64).
  const arrivee = usePageArrivee("fiche");
  // Au-delà de 12 semaines, les étiquettes de volume se gênent : on ne les garde que sous les barres (S1, S2…) un cran sur deux.
  const serre = v.length > 12;
  return (
    <View style={[styles.vol, { backgroundColor: couleurs.s1 }]}>
      <View style={styles.barresVol}>
        {v.map((x, i) => {
          const aff = phaseAff >= 0 && p.calendrier[i]!.phase === phaseAff;
          return (
            <View key={i} style={styles.colonne}>
              {!serre ? (
                <Texte numberOfLines={1} style={[styles.etiquette, { color: couleurs.t3 }]}>
                  {i === derniere && jourJ
                    ? t("boutique.fiche.jourJ")
                    : texteVolume(p, x)
                        .replace(" min", "")
                        .replace(/ séries?| sets?/, "")}
                </Texte>
              ) : null}
              <BarreVolume i={i} arrivee={arrivee} hauteur={Math.max(4, Math.round((x / mx) * 68))} couleur={i === 0 ? f.c : alpha(f.c, aff ? 0.34 : 0.7)} />
              <Texte style={[styles.semaineNum, { color: i === 0 ? couleurs.t1 : couleurs.t3 }, i === 0 && { fontFamily: police.semibold }]}>
                {serre && i % 2 === 1 ? "" : `S${i + 1}`}
              </Texte>
            </View>
          );
        })}
      </View>
      <View style={styles.phases}>
        {p.phases.map((ph, i) => (
          <View key={i} style={{ flex: ph.a - ph.de + 1, borderTopWidth: 2, borderTopColor: couleurs.line2, paddingTop: 5 }}>
            <Texte numberOfLines={1} style={{ fontSize: 11.5, color: couleurs.t2 }}>
              {tx(ph.nom)}
            </Texte>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Une barre qui pousse depuis le bas à l'arrivée de la fiche (cascade de 30 ms, courbe de sortie). */
function BarreVolume({ i, hauteur, couleur, arrivee }: { i: number; hauteur: number; couleur: string; arrivee: boolean }) {
  const e = useSharedValue(0);
  useEffect(() => {
    if (!arrivee) return;
    e.value = withDelay(120 + i * 30, withTiming(1, { duration: durees.barre, easing: courbes.sortie }));
  }, [e, i, arrivee]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.08 + 0.92 * e.value }], opacity: 0.4 + 0.6 * e.value }));
  return (
    <Animated.View
      style={[
        {
          width: "100%",
          height: hauteur,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          borderRadius: 2,
          backgroundColor: couleur,
          transformOrigin: "bottom",
        },
        style,
      ]}
    />
  );
}

function Semaines({ p }: { p: Programme }) {
  const { couleurs, mode } = useTheme();
  const [toutes, setToutes] = useState(false);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const v = useMemo(() => volumes(p), [p]);
  const liste = toutes ? p.calendrier : p.calendrier.slice(0, SEMAINES_VISIBLES);
  return (
    <View style={[styles.groupe, { backgroundColor: couleurs.s1 }]}>
      {liste.map((w, i) => {
        const titre = w.allegee ? t("boutique.fiche.allegee") : tx(p.phases[w.phase]!.nom);
        const sous = [
          t("boutique.fiche.resumeSemaine", { n: w.seances.length, volume: texteVolume(p, v[w.n - 1]!) }),
          w.accent && !w.allegee ? tx(w.accent) : null,
        ]
          .filter(Boolean)
          .join(", ");
        const ouv = ouverte === w.n;
        return (
          <View key={w.n} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }}>
            <Appui
              accessibilityRole="button"
              accessibilityState={{ expanded: ouv }}
              accessibilityLabel={`${t("boutique.fiche.semaine", { n: w.n })}, ${titre}, ${sous}`}
              onPress={() => setOuverte(ouv ? null : w.n)}
              style={styles.semaine}
            >
              <View
                style={[
                  styles.num,
                  { backgroundColor: mode === "nuit" ? couleurs.s2 : couleurs.bg },
                  mode === "jour" && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: couleurs.line },
                ]}
              >
                <Texte style={{ fontFamily: police.semibold, fontSize: 13 }}>{w.n}</Texte>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Texte style={{ fontFamily: police.medium, fontSize: 15 }}>{titre}</Texte>
                <Texte numberOfLines={ouv ? undefined : 1} style={{ fontSize: 12, color: couleurs.t3, marginTop: 2 }}>
                  {sous}
                </Texte>
              </View>
              <View style={{ marginRight: 10, transform: [{ rotate: ouv ? "90deg" : "0deg" }] }}>
                <Icone nom="right" couleur={couleurs.t3} taille={16} />
              </View>
            </Appui>
            {ouv ? (
              <View style={styles.detailSemaine}>
                {w.seances.map((c, k) => (
                  <View key={k} style={styles.ligneSeance}>
                    <Texte style={{ flex: 1, fontSize: 13, color: couleurs.t1 }} numberOfLines={2}>
                      {tx(p.seances[c]!.nom)}
                    </Texte>
                    <Texte variante="meta" couleur="t3">{approx(dureeCourte(dureeSeance(p.seances[c]!)))}</Texte>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      {p.calendrier.length > SEMAINES_VISIBLES ? (
        <Appui accessibilityRole="button" onPress={() => setToutes(!toutes)} style={[styles.plus, { borderTopColor: couleurs.line2 }]}>
          <Texte style={{ fontFamily: police.medium, fontSize: 14, color: couleurs.t2 }}>
            {toutes ? t("boutique.fiche.moinsSemaines") : t("boutique.fiche.toutesSemaines", { n: p.calendrier.length })}
          </Texte>
        </Appui>
      ) : null}
    </View>
  );
}

/** Profil des zones d'une séance (même dessin que l'éditeur cardio validé : hauteur selon la zone, récupération hachurée). */
export function Profil({ segments, largeur, hauteur }: { segments: Segment[]; largeur: number; hauteur: number }) {
  const { couleurs } = useTheme();
  const zone = (z: number) => couleurs[`zone${z}` as "zone1"];
  const total = segments.reduce((s, b) => s + b.s, 0) || 1;
  const g = 1.5;
  const utile = largeur - g * (segments.length - 1);
  let x = 0;
  return (
    <Svg width={largeur} height={hauteur} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <Pattern id="hachure" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect width={2} height={4} fill={zone(2)} />
        </Pattern>
      </Defs>
      {segments.map((b, i) => {
        const w = (b.s / total) * utile;
        const h = (hauteur * (b.zone + 1)) / 6;
        const r = <Rect key={i} x={x} y={hauteur - h} width={Math.max(1, w)} height={h} rx={2.5} fill={b.recup ? "url(#hachure)" : zone(b.zone)} />;
        x += w + g;
        return r;
      })}
    </Svg>
  );
}

/** Exemple de routine : endurance, le profil et les étapes ; force, les routines de la première semaine en segmenté. */
function SeanceType({ p }: { p: Programme }) {
  const premieres = [...new Set(p.calendrier[0]!.seances)];
  const autres = premieres.length > 1 && premieres.length <= 3 && premieres.every((c) => profil(p.seances[c]!).length === 0);
  const [choix, setChoix] = useState(autres ? premieres[0]! : p.seanceType);
  const s: Seance = p.seances[choix] ?? p.seances[p.seanceType]!;
  return (
    <>
      <SousTitre titre={t(autres ? "boutique.fiche.routinesProgramme" : "boutique.fiche.seanceType")} />
      {autres ? (
        <View style={{ marginHorizontal: 16, marginBottom: 10 }}>
          <Segmente options={premieres.map((c) => ({ valeur: c, libelle: tx(p.seances[c]!.nom).split(", ").pop()! }))} valeur={choix} onChange={setChoix} />
        </View>
      ) : null}
      <ContenuSeance p={p} s={s} />
    </>
  );
}

/** Le contenu d'une séance du catalogue : nom et durée, puis le profil des zones et les étapes (endurance) ou les exercices. */
export function ContenuSeance({ p, s }: { p: Article; s: Seance }) {
  const { couleurs } = useTheme();
  // Largeur de la colonne de contenu (D5) : bornée sur le Fold déplié, celle de l'écran sur le téléphone.
  const width = useLargeurContenu();
  const segments = profil(s);
  const zone = (z: number) => couleurs[`zone${z}` as "zone1"];
  // Superset (deux exercices) ou circuit (trois et plus) : le mot dépend de la taille du groupe (lexique du 29/10).
  const groupe = (n: number) => libelleSuperset(s.blocs.filter((x) => x.superset === n).length);
  return (
    <>
      <View style={[styles.stc, { backgroundColor: couleurs.s1 }]}>
        <View style={styles.tt}>
          <Texte variante="exercice" style={{ flex: 1 }} numberOfLines={2}>
            {tx(s.nom)}
          </Texte>
          <Texte style={{ fontSize: 12.5, color: couleurs.t3 }}>{approx(dureeCourte(dureeSeance(s)))}</Texte>
        </View>
        {segments.length ? (
          <>
            <View style={{ marginTop: 14 }}>
              <Profil segments={segments} largeur={width - 64} hauteur={44} />
            </View>
            <View style={styles.etapes}>
              {s.blocs.flatMap((b, i) => {
                const zoneTexte = b.zone ? `${ZONES[b.zone]![langue()].split(", ")[1]} (Z${b.zone})` : null;
                const ligne = (cle: string, carre: ReactNode, fort: string, texte: string) => (
                  <View key={cle} style={styles.etape}>
                    {carre}
                    <Texte style={{ flex: 1, fontSize: 13, color: couleurs.t2 }}>
                      <Texte style={{ fontFamily: police.semibold, fontSize: 13, color: couleurs.t1 }}>{fort}</Texte>
                      {`  ${texte}`}
                    </Texte>
                  </View>
                );
                const carre = <View style={[styles.carre, { backgroundColor: b.zone ? zone(b.zone) : couleurs.t3 }]} />;
                // Un bloc répété : l'effort (allure et zone), puis sa récupération hachurée (planche a8).
                if (b.series > 1)
                  return [
                    ligne(`${i}`, carre, cibleBloc(b), zoneTexte ?? nomExercice(p, b.exo)),
                    ...(b.reposS
                      ? [
                          ligne(
                            `${i}r`,
                            <View style={[styles.carre, { backgroundColor: alpha(zone(2), 0.45) }]} />,
                            dureeCourte(b.reposS),
                            b.note ? tx(b.note) : t("boutique.fiche.recupLibre"),
                          ),
                        ]
                      : []),
                  ];
                return [
                  ligne(`${i}`, carre, cibleBloc(b), [b.note ? tx(b.note) : nomExercice(p, b.exo), b.zone ? `(Z${b.zone})` : null].filter(Boolean).join(" ")),
                ];
              })}
            </View>
          </>
        ) : (
          <View style={{ marginTop: 6 }}>
            {s.blocs.map((b, i) => (
              <View key={i} style={styles.exo}>
                <Picto slug={b.exo.startsWith("perso:") ? null : b.exo} nom={nomExercice(p, b.exo)} taille={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Texte numberOfLines={2} style={{ fontFamily: police.medium, fontSize: 14 }}>
                    {nomExercice(p, b.exo)}
                  </Texte>
                  {b.superset != null || b.tempo ? (
                    <Texte style={{ fontSize: 11.5, color: b.superset != null ? couleurs.superset : couleurs.t3, marginTop: 1 }}>
                      {[b.superset != null ? groupe(b.superset) : null, b.tempo ? `tempo ${b.tempo}` : null].filter(Boolean).join(", ")}
                    </Texte>
                  ) : null}
                </View>
                <Texte style={{ fontSize: 13, color: couleurs.t2 }}>{cibleBloc(b)}</Texte>
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  tete: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    height: undefined,
    minHeight: 64,
    paddingLeft: 4,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barre: { position: "absolute", left: 8, right: 8, height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rond: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  ft: { paddingHorizontal: espace.l, paddingTop: 20 },
  titre: { fontFamily: police.semibold, fontSize: 24, lineHeight: 30 },
  marque: { fontFamily: police.semibold, fontSize: 14, marginTop: 2, marginBottom: 2 },
  description: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  chiffres: { flexDirection: "row", marginHorizontal: 16, marginTop: 20, borderRadius: 14, paddingVertical: 14 },
  case: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  chiffre: { fontFamily: police.semibold, fontSize: 17 },
  carte: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  h5: { fontFamily: police.semibold, fontSize: 17, paddingHorizontal: espace.l, paddingTop: 28, paddingBottom: 12 },
  vol: { marginHorizontal: 16, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 12, borderRadius: 14 },
  barresVol: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 104 },
  colonne: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  etiquette: { fontSize: TAILLE_MIN, height: 14, lineHeight: 14 },
  semaineNum: { fontSize: 11 },
  phases: { flexDirection: "row", gap: 8, marginTop: 10 },
  groupe: { marginHorizontal: 16, marginTop: 12, borderRadius: rayon.l, overflow: "hidden" },
  semaine: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingVertical: 6, paddingLeft: 16, paddingRight: 6 },
  num: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  detailSemaine: { paddingLeft: 62, paddingRight: 16, paddingBottom: 12, gap: 6 },
  ligneSeance: { flexDirection: "row", alignItems: "center", gap: 8 },
  plus: { height: 48, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth },
  stc: { marginHorizontal: 16, padding: 16, borderRadius: 14 },
  tt: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  etapes: { marginTop: 12, gap: 8 },
  etape: { flexDirection: "row", alignItems: "center", gap: 10 },
  carre: { width: 10, height: 10, borderRadius: 3 },
  exo: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  paragraphe: { fontSize: 14, lineHeight: 21, paddingHorizontal: espace.l },
  sources: { fontSize: 12, lineHeight: 18, paddingHorizontal: espace.l, paddingTop: 16 },
  basFixe: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: 16 },
});
