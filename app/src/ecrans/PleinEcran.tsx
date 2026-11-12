// Plein écran de la séance (planche idee-plein-ecran, lot 3, manuel) : l'exercice en cours, le personnage au tempo, la
// consigne et le décompte (seul élément fort), le ruban de tempo (D1 : A), la série en cours et ses commandes.
// Une seule horloge (performance.now) : décompte, ruban, personnage en découlent ; rien ne dérive avec setTimeout.
// Points d'entrée des lots suivants : `onPhase` (lot 4, voix : une consigne par phase) et `lecture` / `onFinSerie`
// (lot 5, lecture automatique : enchaînement des séries et des repos).
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, FadeIn, useSharedValue, withTiming, type EntryExitAnimationFunction } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ExerciceDeSeance, SeanceDetail } from "../db";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { duree } from "../theme/mouvement";
import { cle3D } from "../ui/3d/clips";
import { AZIMUT_TROIS_QUARTS } from "../ui/3d/orbite";
import { useLiens } from "../ui/useLiens";
import { CORPS } from "../ui/3d/scene";
import { BoutonIcone } from "../ui/Cadre";
import { Icone } from "../ui/Icone";
import { Appui, courbes } from "../ui/mouvement";
import { Picto } from "../ui/Picto";
import { signalerErreur } from "../ui/FeuilleMessage";
import { useReduit } from "../ui/reduit";
import { RubanTempo } from "../ui/RubanTempo";
import { Texte } from "../ui/Texte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { minuteur } from "../natif/minuteur";
import { aUnChrono, arreterChrono, basculerChrono, chronoDe } from "./chrono-serie";
import { CibleDistance, CompteDuree } from "./CompteDuree";
import { useApp } from "./contexte";
import { charge, distanceTexte, tempsTexte, type Unite } from "./format";
import { passerRepos } from "./repos";
import { useChronoSerie } from "../ui/useChronoSerie";
import { ordreExecution, serieAffichee } from "./ordre-seance";
import { decalageVersChrono } from "./saisie-seance";
import { LigneDeSerie, type Actions } from "./seance-vue";
import { tempoJoue, tempoTexte, type Tempo } from "./tempo";
import { dureeSerie, etatA, phasesSerie, repsPrevues, tempsClip, type EtatTempo, type Phase, type ReperesClip, type TypePhase } from "./tempo-horloge";

const Vue3D = lazy(() => import("../ui/3d/Vue3D"));

const CONSIGNES: Record<TypePhase, Parameters<typeof t>[0]> = {
  descente: "seance.plein.descente",
  pauseBas: "seance.plein.tient",
  montee: "seance.plein.monte",
  pauseHaut: "seance.plein.tient",
};

/** Personnage : léger zoom d'entrée (0,97 → 1), sauté en mouvement réduit (Reanimated, ReduceMotion.System). */
const entreeScene: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { transform: [{ scale: 0.97 }] },
    animations: { transform: [{ scale: withTiming(1, { duration: duree.entree, easing: courbes.sortie }) }] },
  };
};
/** Décompte : le chiffre change sans bouger, en fondu de 120 ms. */
const entreeChiffre = FadeIn.duration(duree.chiffre).easing(courbes.sortie);

/**
 * Horloge d'une série au tempo : lecture / pause, état (phase, décompte) mis à jour seulement quand il change, temps
 * écoulé partagé avec le ruban (fil UI) et lu à chaque image par le personnage.
 */
function useHorloge(phases: Phase[], cle: string, reduit: boolean, onPhase?: (e: EtatTempo) => void) {
  const fin = dureeSerie(phases);
  const ecoule = useSharedValue(0);
  const h = useRef({ t0: 0, arret: 0, lecture: false });
  const [lecture, setLecture] = useState(false);
  const [etat, setEtat] = useState<EtatTempo | null>(() => etatA(phases, 0));
  const maintenant = useCallback(() => (h.current.lecture ? (performance.now() - h.current.t0) / 1000 : h.current.arret), []);

  // Nouvelle série ou nouveau tempo : retour au départ, à l'arrêt.
  useEffect(() => {
    h.current = { t0: 0, arret: 0, lecture: false };
    setLecture(false);
    cancelAnimation(ecoule);
    ecoule.value = 0;
    setEtat(etatA(phases, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  useEffect(() => {
    if (!lecture) return;
    let image = 0;
    let avant = "";
    const boucle = () => {
      const x = maintenant();
      const e = etatA(phases, x);
      const k = e ? `${e.i}|${e.restant}|${e.fini}` : "";
      if (k !== avant) {
        const nouvellePhase = !avant || avant.split("|")[0] !== String(e?.i);
        avant = k;
        setEtat(e);
        if (e && nouvellePhase && !e.fini) {
          onPhase?.(e);
          // Mouvement réduit : le ruban saute d'une phase à l'autre au lieu de défiler.
          if (reduit) ecoule.value = e.phase.debut;
        }
      }
      if (e?.fini) {
        h.current = { t0: 0, arret: fin, lecture: false };
        setLecture(false);
        return;
      }
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(image);
  }, [lecture, phases, fin, maintenant, reduit, ecoule, onPhase]);

  const basculer = () => {
    if (!phases.length) return;
    if (h.current.lecture) {
      h.current = { t0: 0, arret: maintenant(), lecture: false };
      cancelAnimation(ecoule);
      if (!reduit) ecoule.value = h.current.arret;
      setLecture(false);
      return;
    }
    // Série finie : ▶ la rejoue depuis le début.
    const depart = h.current.arret >= fin ? 0 : h.current.arret;
    h.current = { t0: performance.now() - depart * 1000, arret: depart, lecture: true };
    if (reduit) ecoule.value = etatA(phases, depart)?.phase.debut ?? 0;
    else {
      ecoule.value = depart;
      ecoule.value = withTiming(fin, { duration: (fin - depart) * 1000, easing: Easing.linear });
    }
    setLecture(true);
  };

  return { lecture, etat, ecoule, maintenant, basculer };
}

/** Repos en cours (minuteur) : ne redessine l'écran que quand il commence ou finit, pas à chaque seconde. */
function useReposActif(): boolean {
  const [actif, setActif] = useState(() => minuteur.etat().actif);
  useEffect(() => minuteur.ecouter((e) => setActif(e.actif)), []);
  return actif;
}

export function PleinEcran({
  seance,
  unites,
  activeId,
  actions,
  onPhase,
  large = false,
  onReposAffiche,
}: {
  seance: SeanceDetail;
  unites: Record<string, Unite>;
  activeId: string | null;
  actions: Actions & { onTempo?: (e: ExerciceDeSeance) => void };
  /** Lot 4 (voix) : appelé au début de chaque phase pendant la lecture. */
  onPhase?: (e: EtatTempo) => void;
  /** Volet gauche du Fold déplié : scène plus haute (planche : 470 au lieu de 410). */
  large?: boolean;
  /** Repos d'une série en durée : le grand affichage montre son décompte, la barre de repos peut cacher le sien. */
  onReposAffiche?: (oui: boolean) => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const { db, reglages } = useApp();
  const reduit = useReduit();
  const bas = useSafeAreaInsets().bottom;

  const ordre = useMemo(() => ordreExecution(seance), [seance]);
  // Ouvert pendant le compte d'une série en durée : sur elle, pas sur la première série à faire (n° 35 de la revue finale).
  const [decalage, setDecalage] = useState(() => decalageVersChrono(ordre, chronoDe));
  // Une série validée fait avancer la série à faire : on revient sur elle (ou sur le chrono qui tourne encore).
  useEffect(() => setDecalage(decalageVersChrono(ordre, chronoDe)), [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const serie = serieAffichee(ordre, decalage);
  const e = serie ? (seance.exercices.find((x) => x.exercice.id === serie.exercice_id) ?? null) : null;
  const u: Unite = e ? (unites[e.exercice.id] ?? "kg") : "kg";

  // Tempo seulement pour un exercice à répétitions (29/10) : ni ruban ni tempo par défaut pour un gainage ou une course.
  const tempo: Tempo | null = e ? tempoJoue(e, reglages.tempos) : null;
  // Série encore vierge : le tempo se joue sur les reps visées (plage, précédente), sinon ▶ resterait grisé.
  const reps = serie ? repsPrevues(serie) : 0;
  useLiens();
  const cle = e ? cle3D(e.exercice.slug, e.exercice.nom) : undefined;
  const [reperes, setReperes] = useState<{ cle: string; r: ReperesClip | null } | null>(null);
  const r = reperes && reperes.cle === cle ? reperes.r : null;
  const phases = useMemo(() => (tempo && reps > 0 ? phasesSerie(tempo, reps, r?.depart ?? "haut") : []), [tempo?.join("-"), reps, r?.depart]); // eslint-disable-line react-hooks/exhaustive-deps
  const cleSerie = `${serie?.id}|${tempo?.join("-")}|${reps}|${r?.depart}`;
  const horloge = useHorloge(phases, cleSerie, reduit, onPhase);
  // Pendant le repos, la série affichée est la prochaine : pas la consigne du tempo comme si elle était en cours (n° 27).
  const auRepos = useReposActif() && !horloge.lecture;
  // Série en durée (gainage, course…) : pas de tempo ; le grand bouton pilote le compte à rebours de la série, celui de sa
  // ligne (planche seance-duree, D1 A) : ▶, ⏸, puis la coche quand la cible est atteinte.
  const parChrono = !phases.length && !!e && !!actions.onChrono && aUnChrono(e.exercice.nature);
  const aff = useChronoSerie(parChrono ? serie?.id : undefined);
  // Distance et poids (D6) : ni chrono ni tempo, le bouton du milieu valide la série d'un toucher.
  const parCoche = !phases.length && !!e && e.exercice.nature === "poids_distance";
  // Repos d'une série en durée : son décompte passe dans le grand affichage, la barre garde −15, +15 et Passer.
  const reposDuree = parChrono && auRepos && !aff;
  useEffect(() => onReposAffiche?.(reposDuree), [reposDuree, onReposAffiche]);
  useEffect(() => () => onReposAffiche?.(false), [onReposAffiche]);

  // Le personnage lit l'horloge à chaque image ; sans repères (clip sans tempo), il tourne en boucle.
  const pilote = useRef<(() => number | null) | null>(null);
  pilote.current = r && phases.length
    ? () => {
        const x = etatA(phases, horloge.maintenant());
        return x ? tempsClip(r, x.fini ? phases[0]!.type : x.phase.type, x.fini ? 0 : x.p) : null;
      }
    : null;

  const fond3D = couleurs.s2;
  const couleurs3D = useMemo(() => ({ fond: fond3D, corps: CORPS, principal: couleurs.muscle, secondaire: couleurs.muscle2 }), [fond3D, couleurs]);
  const [erreur3D, setErreur3D] = useState<string | null>(null);

  if (!serie || !e) return null;

  const normales = e.series.filter((x) => x.type !== "echauffement");
  const rang = normales.findIndex((x) => x.id === serie.id);
  // En-tête : la cible de la série (« Série 1 sur 3 · 1:00 prévue », « 10 kg · 0:45 prévue »), pas seulement les répétitions.
  const quoi = [
    rang >= 0 ? t("seance.plein.serie", { n: rang + 1, total: normales.length }) : null,
    parChrono && serie.kg != null ? `${charge(serie.kg, u)} ${u}` : null,
    parChrono && serie.duree_s ? t("seance.plein.prevue", { temps: tempsTexte(serie.duree_s) }) : null,
    parCoche && serie.kg != null ? `${charge(serie.kg, u)} ${u}` : null,
    parCoche && serie.distance_m != null ? distanceTexte(serie.distance_m) : null,
    serie.kg != null && serie.reps != null ? `${charge(serie.kg, u)} ${u} × ${serie.reps}` : serie.reps != null ? `× ${serie.reps}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const chrono = parChrono ? chronoDe(serie.id) : undefined;
  const chronoMarche = !!aff?.marche;
  // ▶ : lance le compte depuis la cible (et arrête un repos en cours, D7), ⏸ / ▶ : pause et reprise ; à 0, la coche enregistre
  // le temps réel et lance le repos, comme la case de la ligne.
  const commandeChrono = () => {
    if (aff?.depasse) {
      const cible = chronoDe(serie.id)?.cibleS ?? null;
      const s = arreterChrono(serie.id);
      if (s != null) actions.onChrono!(serie, s, cible);
      return;
    }
    if (!chrono && minuteur.etat().actif) passerRepos(db).catch(signalerErreur());
    basculerChrono(serie.id, serie.duree_s, Date.now(), serie.duree_s);
  };
  const etat = horloge.etat;
  const enPhase = etat && !etat.fini ? etat : null;
  const consigne = auRepos ? t("seance.plein.prochaine") : etat ? (etat.fini ? t("seance.plein.fini") : t(CONSIGNES[etat.phase.type])) : null;

  return (
    <View style={styles.plein}>
      <View style={styles.tete}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="exercice" numberOfLines={1} style={styles.nom}>
            {e.exercice.nom}
          </Texte>
          {quoi ? (
            <Texte variante="corps" couleur="t2" numberOfLines={1} style={styles.quoi}>
              {quoi}
            </Texte>
          ) : null}
        </View>
        <BoutonIcone nom="more" couleur={couleurs.t1} libelle={t("seance.vue.options", { nom: e.exercice.nom })} onPress={() => actions.onMenu(e)} />
      </View>

      <Animated.View key={e.exercice.id} entering={entreeScene} style={[styles.scene, { backgroundColor: fond3D, maxHeight: large ? 470 : 410 }]}>
        {cle && !erreur3D ? (
          <Suspense fallback={null}>
            <Vue3D
              cle={cle}
              couleurs={couleurs3D}
              lecture={horloge.lecture || (!r && reperes?.cle === cle)}
              dos={0}
              face={false}
              azimut={AZIMUT_TROIS_QUARTS}
              serre={0.92}
              elan={!reduit}
              horizontal
              libelle={t("accueil.progression.en3D", { nom: e.exercice.nom })}
              onPret={() => {}}
              onErreur={setErreur3D}
              personnage={reglages.personnage}
              pilote={pilote}
              onReperes={(x) => setReperes({ cle, r: x })}
              ips={30}
              redessiner={horloge.lecture ? 0 : empreinte(`${cleSerie}|${etat?.i}`)}
            />
          </Suspense>
        ) : (
          <View style={styles.picto}>
            <Picto slug={e.exercice.slug} nom={e.exercice.nom} taille={160} />
          </View>
        )}
        {tempo ? (
          <Appui
            accessibilityRole="button"
            accessibilityLabel={t("seance.plein.tempoLibelle", { tempo: tempoTexte(tempo) })}
            onPress={() => actions.onTempo?.(e)}
            style={({ pressed }) => [styles.puce, pressed && { backgroundColor: couleurs.s3 }]}
          >
            <Icone nom="tempo" couleur={couleurs.t2} taille={18} />
            <Texte variante="corps" couleur="t2" style={styles.puceTexte}>
              {tempoTexte(tempo)}
            </Texte>
          </Appui>
        ) : null}
      </Animated.View>

      {parChrono ? (
        <CompteDuree aff={aff} cibleS={serie.duree_s} auRepos={reposDuree} numeroSuivant={rang + 1} poids={serie.kg != null ? `${charge(serie.kg, u)} ${u}` : null} />
      ) : parCoche ? (
        <CibleDistance distance={serie.distance_m != null ? distanceTexte(serie.distance_m) : "–"} poids={serie.kg != null ? `${charge(serie.kg, u)} ${u}` : null} />
      ) : etat ? (
        <View style={styles.consigne}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texte variante="exercice" numberOfLines={1} style={styles.phase}>
              {consigne}
            </Texte>
            {/* Au repos, la série à venir est déjà dite sous le nom de l'exercice : pas de seconde ligne en double. */}
            {auRepos ? null : (
              <Texte variante="corps" couleur="t2" style={styles.quoi}>
                {t("seance.plein.rep", { n: (enPhase?.phase.rep ?? (etat.fini ? reps - 1 : 0)) + 1, total: reps })}
              </Texte>
            )}
          </View>
          <View style={styles.cadran} accessibilityLiveRegion="polite">
            {enPhase && !auRepos ? (
              <Animated.View key={`${enPhase.i}-${enPhase.restant}`} entering={entreeChiffre}>
                <Texte variante="minuteur" style={[styles.decompte, { color: couleurs.action }]}>
                  {enPhase.restant}
                </Texte>
              </Animated.View>
            ) : null}
          </View>
        </View>
      ) : null}

      {etat && reglages.rubanTempo ? (
        <View style={styles.ruban}>
          <RubanTempo phases={phases} ecoule={horloge.ecoule} ici={etat.i} fond={couleurs.bg} />
        </View>
      ) : null}

      <View style={styles.serie}>
        <LigneDeSerie x={serie} e={e} unite={u} activeId={serie.faite ? null : serie.id} actions={actions} enCours pleinEcran />
      </View>

      <View style={[styles.commandes, { paddingBottom: Math.max(28, bas + espace.l) }]}>
        <Commande nom="prec" libelle={t("seance.plein.precedente")} onPress={() => setDecalage((d) => d - 1)} desactive={ordre[0]?.id === serie.id} />
        {parChrono ? (
          <Commande
            nom={aff?.depasse ? "check" : chronoMarche ? "pause" : "play"}
            libelle={t(aff?.depasse ? "seance.plein.valider" : chronoMarche ? "seance.ligne.chronoPause" : chrono ? "seance.ligne.chronoReprendre" : "seance.ligne.chronoLancer")}
            onPress={commandeChrono}
            large
            desactive={serie.faite === 1}
          />
        ) : parCoche ? (
          <Commande nom="check" libelle={t("seance.plein.valider")} onPress={() => actions.onToggle?.(serie)} large desactive={serie.faite === 1 || !actions.onToggle} />
        ) : (
          <Commande nom={horloge.lecture ? "pause" : "play"} libelle={t(horloge.lecture ? "seance.plein.pause" : "seance.plein.lecture")} onPress={horloge.basculer} large desactive={!phases.length} />
        )}
        <Commande nom="suiv" libelle={t("seance.plein.suivante")} onPress={() => setDecalage((d) => d + 1)} desactive={ordre[ordre.length - 1]?.id === serie.id} />
      </View>
    </View>
  );
}

/** Petit nombre qui change avec le texte : force une image du personnage à l'arrêt (nouvelle série, retour au départ). */
const empreinte = (texte: string) => [...texte].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

function Commande({ nom, libelle, onPress, large = false, desactive = false }: { nom: "prec" | "suiv" | "play" | "pause" | "check"; libelle: string; onPress: () => void; large?: boolean; desactive?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ disabled: desactive }}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.commande,
        large && { flex: 1.6 },
        { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond, opacity: desactive ? 0.4 : 1 },
        nom === "check" && { borderWidth: 1.5, borderColor: couleurs.valide },
      ]}
    >
      <Icone nom={nom} couleur={nom === "check" ? couleurs.valide : couleurs.t1} taille={large ? 28 : 24} />
    </Appui>
  );
}

const styles = StyleSheet.create({
  plein: { flex: 1, paddingHorizontal: espace.l },
  tete: { flexDirection: "row", alignItems: "flex-end", gap: 12, minHeight: 52, paddingBottom: 12, marginRight: -10 },
  nom: { fontSize: 20, letterSpacing: -0.2 },
  quoi: { fontSize: 14, marginTop: 2 },
  scene: { flex: 1, minHeight: 220, borderRadius: rayon.l, overflow: "hidden" },
  picto: { flex: 1, alignItems: "center", justifyContent: "center" },
  puce: { position: "absolute", top: 4, left: 4, height: 44, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: rayon.l },
  puceTexte: { fontSize: 13, fontFamily: "Inter-Medium", letterSpacing: 0.5 },
  consigne: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 14, paddingBottom: 4, minHeight: 84 },
  phase: { fontSize: 22, letterSpacing: -0.2 },
  cadran: { minWidth: 64, height: 64, alignItems: "flex-end", justifyContent: "center" },
  decompte: { fontSize: 64, lineHeight: 70, fontFamily: police.light, letterSpacing: -2, textAlign: "right" },
  // Frise du tempo bord à bord, hors des marges de 16 (planche tempo-courbe, A) : ses fondus font le bord.
  ruban: { marginHorizontal: -espace.l },
  // Dans la marge de 16 de la page (n° 27 : la rangée débordait presque jusqu'aux bords).
  serie: { marginTop: 10 },
  commandes: { flexDirection: "row", gap: espace.s, paddingTop: 12, marginTop: "auto" },
  commande: { flex: 1, height: 56, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
