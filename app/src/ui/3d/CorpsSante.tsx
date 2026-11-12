// Personnage de l'écran Santé : corps en verre teinté (rose → violet, bord lumineux) par-dessus l'aura, un seul passage de rendu.
// Le contexte GL (expo-gl) vit tant que ce composant est monté : Santé le garde monté onglet quitté (docs/PERF-C.md, M7).
// Caché (onglet gelé ou détaché, page poussée par-dessus, appli en arrière-plan), la vue perd sa surface mais pas son contexte
// (patches/expo-gl) : programmes et textures restent, la boucle est en pause, et le retour n'a qu'à redessiner. Il est libéré
// après 5 min en arrière-plan.
// Rendu à 30 i/s au plus pendant le balancement, 15 i/s au repos, plus rien après 14 s sans geste ; une image si le corps change.
// Entre deux images, la boucle dort sur un minuteur (pas de requestAnimationFrame vide) ; endormie, elle attend un geste.
// Arrivée (30/10) : sa silhouette, un SVG fixe, tant que le GL n'a pas d'image ; puis le corps en fondu par-dessus
// (opacité de la vue, fil UI, 200 ms).
// Pose « homme de Vitruve » (bras un peu au-dessus de l'horizontale, jambes écartées). Scan : une bande de lumière parcourt
// le corps de haut en bas (1,2 s) à l'arrivée puis toutes les 8 à 12 s ; il s'arrête avec le reste après 14 s sans geste
// (sobriété : aucun réveil de la boucle hors activité) et reprend au geste suivant ; jamais en mouvement réduit.
// Zones blessées (planche sante-suivi) : les muscles des blessures actives s'allument (D2) ; toucher le corps lit le muscle sous
// le doigt par une passe d'identifiants (verre-zones.ts). `fixe` : de face ou de dos, sans balancement (choix de la zone, D3).
// Articulations (planche articulations) : `articulations` montre le squelette sous le verre fondu et remonte les points des 13
// articulations à l'écran (D1, D4) ; `reperes` pose un anneau ambre sur les articulations blessées, touchable (Santé, D7).
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, PanResponder, PixelRatio, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useIsFocused } from "expo-router";
import * as THREE from "three";
import type { CorpsAffiche } from "../../ecrans/morphologie-calc";
import { influencesDe } from "../../ecrans/morphologie-calc";
import type { ModeCouleur } from "../../theme/jetons";
import { santeEntree } from "../../theme/mouvement";
import { courbes } from "../mouvement";
import { ecouterReveilAura, inactiviteAura, reveillerAura } from "../aura-etat";
import type { Cote } from "../../db/depots/suivi";
import { chargerCorps, chargerMasqueSante, chargerReliefSante } from "./charger";
import { centreZone, COULEUR_ZONE, FRAG_ZONES, lirePixel, valeursZones } from "./verre-zones";
import { cadrerCorps, matieresVerre, monterCorps, surfaceCorps } from "./corps-gl";
import { creerAme, uniformesVerreAme, verreAvecAme, type DonneesAme } from "./ame";
import { ameCachee, brancherHorlogesAme, ecouterVol, volActif } from "./vol-ame";
import { poseVitruve, preparerCorps } from "./pose";
import { ancreDe, COTE_MARQUE, FONDU_ARTICULATIONS, matiereMarque, monterSquelette, teinterMarque, teinterOs } from "./squelette";
import { pointsChoisis } from "../../ecrans/suivi-calc";
import { arriveeDuree, arriveeImage, arriveeRepere } from "./arrivee";
import { creerRenderer } from "./Vue3D";
import { SilhouetteSante } from "./SilhouetteSante";
import { attenteCorps, avancerRotation, COULEUR_SCAN, SCENE_H, INTERVALLE_SCAN_MS, COULEURS_VERRE, faceAme, lancer, prendRotation, RELIEF, ROTATION_DOIGT, rotationRepos, hauteurScan, HAUTEUR_CORPS, planCorps, prochainScan, rotationCorps, tailleCadre, SCENE_BAS, SCENE_HAUT } from "./verre";

interface Props {
  corps: CorpsAffiche;
  mode: ModeCouleur;
  reduit: boolean;
  /** Prépasse de profondeur (défaut) : seule la surface la plus proche est vue ; false : ancien rendu (captures avant/après). */
  prepasse?: boolean;
  /** Le personnage est prêt et dessiné (au moins une image). */
  onPret?(): void;
  onErreur?(message: string): void;
  /** Muscles allumés (blessures actives, zone choisie). */
  zones?: readonly { zone: string; cote: Cote }[];
  /** Avec `fixe` : de dos. */
  dos?: boolean;
  /** De face (ou de dos), sans balancement. */
  fixe?: boolean;
  /** Toucher le corps : le muscle et le côté sous le doigt (null : hors muscle), et le point touché (dp). */
  onToucher?(m: { zone: string; cote: "g" | "d" } | null, x: number, y: number): void;
  /** Centre à l'écran (dp) de la première zone allumée, recalculé quand elle change (trait de la bulle « Zone »). */
  onCentreZone?(p: { x: number; y: number } | null): void;
  /** Mode Articulation (avec `fixe`) : le squelette sous le verre fondu. */
  articulations?: boolean;
  /** Points des articulations de la vue (« genou:d » → dp), recalculés quand la vue, le corps ou la taille changent. */
  onPoints?(p: Record<string, { x: number; y: number }>): void;
  /** Articulations blessées marquées d'un anneau ambre (actives) ; toucher à 22 dp d'un anneau appelle `onRepere`. */
  reperes?: readonly { id: string; zone: string; cote: Cote }[];
  onRepere?(id: string): void;
  libelle?: string;
  /** Glissé horizontal : le personnage tourne (inertie, retour face à l'écran). */
  tourner?: boolean;
  /** Contour lissé dans le shader (essai : sur l'émulateur, la composition de l'alpha par expo-gl y laisse un liseré sombre ;
   * à juger sur le Fold par `pepfitopen://health?aa=1`). Défaut : non. */
  lisse?: boolean;
  /** L'Âge pepfit en âme dans la poitrine (ame.ts, planches/age-coeur) ; null : pas d'âge, le corps seul. */
  ame?: DonneesAme | null;
  /** La zone du corps est-elle à l'écran (défilement) ? Hors écran, plus aucun rendu. */
  visible?: boolean;
  /** La poitrine est-elle à l'écran ? Sortie (défilement), l'âme et sa lueur ne se dessinent plus. */
  ameVue?: boolean;
  /** La page défile : balancement et scan attendent la fin du geste (le corps suit la page sans être redessiné ; un geste du
   * doigt remettait la boucle à 30 i/s pendant tout le défilement, docs/AUDIT-PERF.md, M15). */
  defile?: boolean;
  /** Largeur de la zone (dp), si l'écran la connaît : la silhouette est là dès le premier rendu (sinon, à la mise en page). */
  largeur?: number;
  /** Mesure (`pepfitopen://health?mesure=1`) : images rendues et temps du rendu, dans logcat toutes les 2 s (« [corps] … »). */
  mesure?: boolean;
}

/**
 * Préchargement (30/10 : « l'arrivée sur la page santé peut lagger au premier chargement ») : le personnage lu,
 * décodé et mis en pose, ses textures copiées, d'avance ; l'arrivée sur Santé ne garde que le contexte GL et la compilation
 * des shaders. Tout reste en cache pour la session (charger.ts).
 */
export async function prechargerCorpsSante(genre: "homme" | "femme", epaules = false): Promise<void> {
  const t = performance.now();
  const [racine] = await Promise.all([chargerCorps(genre, epaules), chargerMasqueSante(), chargerReliefSante()]);
  const tp = performance.now();
  preparerCorps(racine);
  console.log(`[precharge] corps ${genre} pret en ${Math.round(performance.now() - t)} ms (pose ${Math.round(performance.now() - tp)} ms)`);
}

/** Retour à l'écran : images forcées pendant ce temps (ms), la surface neuve de la vue pouvant arriver après le focus. */
const RELANCE_MS = 500;
/** Arrière-plan au-delà duquel le contexte GL est libéré (ms). */
const LIBERER_APRES_MS = 5 * 60_000;

export function CorpsSante({ corps, mode, reduit, prepasse = true, onPret, onErreur, zones = [], dos = false, fixe = false, onToucher, onCentreZone, articulations = false, onPoints, reperes = [], onRepere, libelle, tourner = false, lisse = false, ame = null, visible = true, ameVue = true, defile = false, mesure = false, largeur: largeurConnue }: Props) {
  // le corps paraît en fondu sur sa silhouette, à la première image de chaque contexte GL
  const apparu = useSharedValue(0);
  const styleCorps = useAnimatedStyle(() => ({ opacity: apparu.value }));
  const styleSilhouette = useAnimatedStyle(() => ({ opacity: 1 - apparu.value }));
  const [largeurLue, setLargeur] = useState(0);
  const largeur = largeurConnue ?? largeurLue;
  const e = useRef({
    corps, mode, reduit, sale: true, fin: () => {}, onPret, onErreur, zones, dos, fixe, onToucher, onCentreZone,
    toucher: null as { x: number; y: number } | null, taille: { l: 1, h: 1 }, centre: true, lisse,
    rot: rotationRepos(), depart: 0, reveil: () => {}, vu: true, ame, ameVue, mesure, forcer: false, defile, relance: 0,
    articulations, onPoints, reperes, onRepere, points: true,
  }).current;
  // Écran sans le focus (onglet Santé quitté, gelé mais monté ; écran poussé par-dessus) : plus aucun rendu ni scan.
  // L'inactivité est commune à toute l'appli : sans ce garde, un toucher sur l'Accueil faisait tourner le corps caché.
  // Le corps sorti de l'écran par le défilement ne se dessine plus non plus ; pendant le vol de l'âme (vol-ame.ts), il se
  // dessine même recouvert par la page Âge, le temps de cacher ou de rendre l'âme.
  const vu = useIsFocused() && visible;
  e.vu = vu;
  e.defile = defile;
  e.ame = ame;
  e.ameVue = ameVue;
  e.mesure = mesure;
  // de retour à l'écran : la vue a une surface neuve (vide) ; quelques images tout de suite, le temps qu'elle soit rattachée
  useEffect(() => {
    if (!vu) return;
    e.forcer = true;
    e.relance = performance.now() + RELANCE_MS;
    e.reveil();
  }, [vu, e]);
  e.corps = corps;
  e.mode = mode;
  e.reduit = reduit;
  e.onPret = onPret;
  e.onErreur = onErreur;
  e.zones = zones;
  e.dos = dos;
  e.fixe = fixe;
  e.lisse = lisse;
  e.onToucher = onToucher;
  e.onCentreZone = onCentreZone;
  e.articulations = articulations;
  e.onPoints = onPoints;
  e.reperes = reperes;
  e.onRepere = onRepere;
  const signatureReperes = reperes.map((r) => `${r.zone}:${r.cote}`).join("|");
  const signatureZones = zones.map((z) => `${z.zone}:${z.cote}`).join("|");
  // la boucle endormie ne guette plus : tout changement à dessiner la réveille
  useEffect(() => {
    e.sale = true;
    e.reveil();
  }, [e, corps, mode, reduit, signatureZones, dos, fixe, articulations, signatureReperes]);
  useEffect(() => {
    e.centre = true;
    e.points = true;
    e.reveil();
  }, [e, signatureZones, dos, articulations]);
  // fin du défilement : le balancement reprend
  useEffect(() => {
    if (!defile) e.reveil();
  }, [e, defile]);
  const avecAme = ame != null;
  useEffect(() => {
    e.reveil(); // lueur de l'âme à faire paraître ou disparaître
  }, [e, avecAme, ameVue]);
  // un geste ailleurs dans l'appli (aura-etat) : la cadence repart, la boucle endormie aussi
  useEffect(() => ecouterReveilAura(() => e.vu && e.reveil()), [e]);
  // Arrière-plan prolongé : la vue GL est refaite (clé), ce qui libère le contexte et sa mémoire ; le suivant se crée au retour.
  // Plus court, le contexte attend (le retour ne fait que redessiner).
  const [reprise, setReprise] = useState(0);
  useEffect(() => {
    let liberer: ReturnType<typeof setTimeout> | undefined;
    const s = AppState.addEventListener("change", (etat) => {
      clearTimeout(liberer);
      if (etat === "background") liberer = setTimeout(() => setReprise((n) => n + 1), LIBERER_APRES_MS);
    });
    return () => {
      clearTimeout(liberer);
      s.remove();
    };
  }, []);
  useEffect(() => () => e.fin(), [e]);
  // le vol commence, l'âme est prise ou rendue : une image tout de suite, même endormi
  useEffect(
    () =>
      ecouterVol(() => {
        e.forcer = true;
        e.reveil();
      }),
    [e],
  );

  const surContexte = async (gl: ExpoWebGLRenderingContext) => {
    e.fin(); // un contexte précédent (reprise, autre sexe) s'arrête avant que celui-ci ne démarre
    apparu.value = 0; // vue neuve : sa silhouette jusqu'à la première image
    let vivant = true;
    let image = 0;
    let veille: ReturnType<typeof setTimeout> | undefined;
    const toile = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {}, addEventListener() {}, removeEventListener() {} };
    let renderer: THREE.WebGLRenderer | null = null;
    const pivot = new THREE.Group();
    const uniformes = {
      uTop: { value: new THREE.Vector3() },
      uBot: { value: new THREE.Vector3() },
      uRim: { value: new THREE.Vector3() },
      uH: { value: 1.8 },
      uFade: { value: 1 }, // le fondu d'arrivée est celui de la vue (apparu)
      uScan: { value: -9 },
      uScanCol: { value: new THREE.Vector3() },
      uMasque: { value: null as THREE.Texture | null },
      uPas: { value: 8 },
      uZones: { value: Array.from({ length: 4 }, () => new THREE.Vector2()) },
      uBless: { value: new THREE.Color() },
      // relief (D13) : force de la carte de normales et fond des sillons ; la femme, sur les mêmes UV, l'a adouci
      uRelief: { value: null as THREE.Texture | null },
      uCavite: { value: null as THREE.Texture | null },
      uForce: { value: 0 },
      uCav: { value: 1 },
      // contour lissé dans le shader du verre (sans MSAA sur Android)
      uLisse: { value: e.lisse ? 1 : 0 },
    };
    // l'âme et sa lumière dans le verre : toujours prêtes (cachées sans âge), pour ne pas refaire le contexte quand l'âge arrive
    const verreAme = uniformesVerreAme();
    Object.assign(uniformes, verreAme);
    // verre, prépasse de profondeur et passe d'identifiants (toucher, centre d'une zone : jamais montrée), corps-gl.ts
    const { verre: matiere, profondeur, identifiants } = matieresVerre(uniformes, verreAvecAme(FRAG_ZONES), prepasse);
    const ame = creerAme(verreAme);
    ame.mesh.visible = false;
    brancherHorlogesAme(() => ame.horloges());
    // lueur de l'âme dans le verre : s'éteint en 120 ms quand la signature la prend, revient en 150 ms à l'atterrissage
    let lueur = 0;
    let cache: THREE.Object3D | null = null;
    let racine: THREE.Object3D | null = null;
    // squelette et points des articulations (squelette.ts), construits au premier besoin ; anneaux ambre de Santé
    let squelette: ReturnType<typeof monterSquelette> | null = null;
    const marques: THREE.Mesh[] = [];
    const geoMarque = new THREE.PlaneGeometry(1, 1);
    const matMarque = matiereMarque(e.mode);
    e.fin = () => {
      vivant = false;
      cancelAnimationFrame(image);
      clearTimeout(veille);
      if (racine) pivot.remove(racine); // la copie du personnage part avec ce contexte, le cache reste
      matiere.dispose();
      profondeur.dispose();
      identifiants.dispose();
      squelette?.mesh.geometry.dispose();
      squelette?.matiere.dispose();
      geoMarque.dispose();
      matMarque.dispose();
      ame.dispose();
      brancherHorlogesAme(null);
      renderer?.dispose();
    };
    arriveeRepere("contexte");
    try {
      const tr = performance.now();
      renderer = creerRenderer(gl, toile as unknown as HTMLCanvasElement, true);
      renderer.setClearColor(0x000000, 0);
      arriveeDuree("renderer", performance.now() - tr);
      const [r0, masque, rel] = await Promise.all([chargerCorps(e.corps.sexe === "f" ? "femme" : "homme", e.corps.epaules), chargerMasqueSante(), chargerReliefSante()]);
      arriveeRepere("modele");
      cache = r0;
      uniformes.uMasque.value = masque;
      uniformes.uRelief.value = rel.relief;
      uniformes.uCavite.value = rel.cavite;
      const fem = e.corps.sexe === "f";
      uniformes.uForce.value = fem ? RELIEF.femme.force : RELIEF.homme.force;
      uniformes.uCav.value = fem ? RELIEF.femme.cavite : RELIEF.homme.cavite;
      if (!vivant) return;
    } catch (err) {
      if (vivant) e.onErreur?.(err instanceof Error ? err.message : String(err));
      return;
    }
    const r = renderer;
    const tp = performance.now();
    // une copie du personnage pour ce contexte (corps-gl.ts) : un autre CorpsSante vivant en même temps a la sienne
    const monte = monterCorps(cache!, matiere, prepasse ? profondeur : null);
    const { mesh, ombre, hBase, pied } = monte;
    racine = monte.racine;
    arriveeDuree("preparer", performance.now() - tp);
    pivot.add(racine);
    uniformes.uH.value = hBase;
    const tableMuscles = (racine!.userData as { muscles?: Record<string, number> }).muscles ?? {};
    uniformes.uPas.value = (racine!.userData as { pas?: number }).pas ?? 8;
    const scene = new THREE.Scene();
    scene.add(pivot);
    // l'âme hors du pivot : face à la caméra, sur l'axe de rotation
    scene.add(ame.mesh);
    const cam = new THREE.OrthographicCamera(-1, 1, SCENE_HAUT, SCENE_BAS, 0.1, 20);
    cam.position.z = 6;
    // taille de la surface (px) : celle de la création, puis celle de la mise en page quand elle change (pliage, dépliage,
    // rotation : le contexte gardé ne le voit pas, drawingBufferWidth reste l'ancien). Viewport, caméra, âme, toucher et centre
    // d'une zone la suivent (docs/BLESSURE-TOUCHER.md)
    let l = gl.drawingBufferWidth;
    let h = gl.drawingBufferHeight;
    r.setSize(l, h, false);
    cadrerCorps(cam, l, h);

    let t = 0;
    let dernierRendu = performance.now();
    let signale = false;
    // jusqu'à la fin du fondu de la vue, une image à chaque passage (l'âme différée, la vue qui paraît)
    let finArrivee = 0;
    const appliquer = () => {
      const c = e.corps;
      // calcul B (morphologie-calc.ts) : « nom- » pour une valeur négative, comme la planche
      const idx = mesh.morphTargetDictionary ?? {};
      for (const m of ombre ? [mesh, ombre] : [mesh]) {
        const inf = m.morphTargetInfluences;
        if (inf) influencesDe(idx, inf.length, c.curseurs).forEach((w, j) => (inf[j] = w));
      }
      const k = tailleCadre(c.tailleCm) / 100 / hBase; // c.echelle(hBase), plafonné au cadre
      // bras à l'horizontale : les cases se placent au-dessus et au-dessous (sante-vue.ts, placeCases)
      poseVitruve(racine!);
      pivot.scale.setScalar(k);
      pivot.position.y = -pied * k;
      const v = COULEURS_VERRE[e.mode];
      uniformes.uTop.value.set(...v.top);
      uniformes.uBot.value.set(...v.bot);
      uniformes.uRim.value.set(...v.rim);
      uniformes.uScanCol.value.set(...COULEUR_SCAN[e.mode]);
      valeursZones(e.zones, tableMuscles).forEach(([id, signe], i) => uniformes.uZones.value[i]!.set(id, signe));
      uniformes.uBless.value.set(COULEUR_ZONE[e.mode]);
      ame.placer(tailleCadre(c.tailleCm) / 100, cam, l, h);
      verreAme.uAmeJour.value = e.mode === "jour" ? 1 : 0;
      // articulations : le squelette (pose déjà jouée) sous le verre fondu ; anneaux ambre des articulations blessées
      if (!squelette && (e.articulations || e.reperes.length || e.onPoints)) {
        squelette = monterSquelette(racine!, hBase, pied);
        racine!.add(squelette.mesh);
      }
      if (squelette) {
        squelette.mesh.visible = e.articulations;
        teinterOs(squelette.matiere, e.mode);
      }
      uniformes.uFade.value = e.articulations ? FONDU_ARTICULATIONS[e.mode] : 1;
      teinterMarque(matMarque, e.mode);
      const n = e.reperes.reduce((s, r) => s + pointsChoisis(r.zone, r.cote).length, 0);
      while (marques.length < n) {
        const m = new THREE.Mesh(geoMarque, matMarque);
        m.renderOrder = 10; // par-dessus le verre et l'âme, sans profondeur
        m.frustumCulled = false;
        scene.add(m);
        marques.push(m);
      }
      marques.forEach((m, i) => (m.visible = i < n));
    };
    /** Écran (dp) d'un point du repère de la racine, pose et rotation de cette image. */
    const ecran = (p: THREE.Vector3) => {
      const w = racine!.localToWorld(p.clone()).project(cam);
      return { x: ((w.x + 1) / 2) * e.taille.l, y: ((1 - w.y) / 2) * e.taille.h };
    };
    /** Anneaux des articulations blessées, placés pour cette image (vue de face ou de dos selon la rotation), et leur écran. */
    const placerMarques = (): { id: string; x: number; y: number }[] => {
      if (!squelette || !e.reperes.length) return [];
      pivot.updateMatrixWorld(true);
      const vue = Math.cos(pivot.rotation.y) >= 0 ? "face" : "dos";
      const cote = (COTE_MARQUE * SCENE_H) / Math.max(1, e.taille.h);
      const sortie: { id: string; x: number; y: number }[] = [];
      let i = 0;
      for (const r of e.reperes) {
        for (const cle of pointsChoisis(r.zone, r.cote)) {
          const a = ancreDe(squelette.ancres, vue, cle);
          const m = marques[i++];
          if (!m) continue;
          m.visible = !!a;
          if (!a) continue;
          const w = racine!.localToWorld(a.clone());
          m.position.set(w.x, w.y, 5);
          m.scale.setScalar(cote);
          sortie.push({ id: r.id, ...ecran(a) });
        }
      }
      return sortie;
    };
    // prototype (`mesure`) : images rendues et temps JS du rendu, remontés toutes les 2 s
    const stats = { debut: performance.now(), images: 0, ms: [] as number[] };
    // scan : un passage à l'arrivée, une fois le corps apparu (fondu fini : sur un appareil lent, le chargement et le
    // fondu prennent plus d'1 s), puis toutes les 8 à 12 s
    let debutScan = Infinity;
    // un geste sur le personnage relance la boucle tout de suite (endormie, elle ne regarde que toutes les 300 ms)
    e.reveil = () => {
      if (!vivant) return;
      clearTimeout(veille);
      cancelAnimationFrame(image);
      image = requestAnimationFrame(boucle);
    };
    const boucle = () => {
      if (!vivant || !(e.vu || volActif())) return; // reprise par e.reveil() au retour du focus ou au départ du vol
      const now = performance.now();
      const tourne = avancerRotation(e.rot, Math.min(0.1, (now - dernierRendu) / 1000), now, e.reduit);
      const cadence = planCorps(inactiviteAura(), e.reduit);
      const plan = e.defile ? { ...cadence, intervalleMs: null } : cadence;
      // pas de scan endormi (plus rien après 14 s sans geste) ni en mouvement réduit : il reprend au réveil
      if (plan.intervalleMs == null && now > debutScan + 1200) debutScan = now + prochainScan(Math.random());
      const scan = plan.intervalleMs == null || e.reduit ? null : hauteurScan(now - debutScan);
      const finScan = scan == null && uniformes.uScan.value > -1; // une image pour effacer la bande
      if (scan == null && now > debutScan + 1200) debutScan = now + prochainScan(Math.random());
      // âme : montrée s'il y a un âge, la poitrine à l'écran et la signature pas en vol ; sa lueur suit en fondu
      const ameMontree = e.ame != null && e.ameVue && !ameCachee();
      const rampe = ameMontree ? lueur < 1 : lueur > 0;
      const surface = surfaceCorps(e.taille, PixelRatio.getPixelSizeForLayoutSize);
      const retaille = surface != null && (surface.l !== l || surface.h !== h);
      const du = retaille || tourne || e.sale || e.forcer || now < finArrivee || now < e.relance || rampe || finScan || e.toucher != null || (e.centre && !!e.onCentreZone && e.taille.l > 1) || (e.points && !!e.onPoints && e.taille.l > 1) || (scan != null && now - dernierRendu >= INTERVALLE_SCAN_MS - 2)
        || (plan.intervalleMs != null && now - dernierRendu >= plan.intervalleMs - 2);
      if (!du) {
        // rien à dessiner : on dort jusqu'à la prochaine image prévue ; endormi, jusqu'au prochain e.reveil() (geste dans l'appli,
        // toucher du corps, changement à dessiner, focus, vol)
        const attente = attenteCorps(plan, now - dernierRendu, scan != null, debutScan - now);
        if (attente == null) return;
        if (attente < 12) image = requestAnimationFrame(boucle);
        else
          veille = setTimeout(() => {
            image = requestAnimationFrame(boucle);
          }, attente - 8);
        return;
      }
      const dt = Math.min(0.1, (now - dernierRendu) / 1000);
      dernierRendu = now;
      e.forcer = false;
      if (retaille) {
        l = surface.l;
        h = surface.h;
        r.setSize(l, h, false);
        cadrerCorps(cam, l, h);
        e.sale = true; // l'âme se replace sur la nouvelle surface
        e.centre = true; // et le trait de la zone
        e.points = true; // et les points des articulations
      }
      if (e.sale) {
        appliquer();
        e.sale = false;
      }
      if (!e.reduit) t += dt;
      if (debutScan === Infinity) debutScan = now + 300; // le scan passe une fois le corps paru
      uniformes.uScan.value = scan ?? -9;
      pivot.rotation.y = e.fixe ? (e.dos ? Math.PI + 0.16 : -0.16) : rotationCorps(t, plan.amplitude, e.reduit) + e.rot.angle;
      const ecrans = placerMarques();
      if (e.points && e.onPoints && squelette && e.taille.l > 1) {
        // points des articulations de la vue, à l'écran (dp) : une fois par changement (vue, corps, taille)
        e.points = false;
        pivot.updateMatrixWorld(true);
        const vue = e.dos ? "dos" : "face";
        e.onPoints(Object.fromEntries(Object.entries(squelette.ancres[vue]).map(([cle, p]) => [cle, ecran(p)])));
      }
      // les passes d'identifiants ne voient ni le squelette ni les anneaux
      const cacherPourIds = () => {
        if (squelette) squelette.mesh.visible = false;
        marques.forEach((m) => (m.visible = false));
      };
      const z0 = e.zones[0];
      if (e.centre && e.onCentreZone && e.taille.l > 1) {
        // centre de la zone allumée : la passe d'identifiants lue en entier, une fois par changement
        e.centre = false;
        const id = z0 ? tableMuscles[z0.zone] : undefined;
        if (id == null) e.onCentreZone(null);
        else {
          try {
            mesh.material = identifiants;
            ame.mesh.visible = false; // la passe d'identifiants ne voit pas l'âme (rétablie plus bas, avant le rendu)
            cacherPourIds();
            r.render(scene, cam);
            const tout = new Uint8Array(l * h * 4);
            gl.readPixels(0, 0, l, h, gl.RGBA, gl.UNSIGNED_BYTE, tout);
            const c = centreZone(tout, l, h, id, z0!.cote);
            e.onCentreZone(c && { x: c.fx * e.taille.l, y: c.fy * e.taille.h });
          } catch {
            e.onCentreZone(null); // contexte perdu : pas de trait, rien de plus
          } finally {
            mesh.material = matiere;
          }
        }
      }
      const toucher = e.toucher;
      // un anneau ambre à 22 dp du doigt (cible de 44 dp) ouvre sa blessure, avant les muscles
      const proche = toucher && ecrans.map((p) => ({ id: p.id, d: Math.hypot(p.x - toucher.x, p.y - toucher.y) })).filter((p) => p.d <= 22).sort((a, b) => a.d - b.d)[0];
      if (toucher && proche && e.onRepere) {
        e.toucher = null;
        e.onRepere(proche.id);
      } else if (toucher) {
        e.toucher = null;
        try {
          mesh.material = identifiants;
          ame.mesh.visible = false;
          cacherPourIds();
          r.render(scene, cam);
          const px = new Uint8Array(4);
          gl.readPixels(Math.round((toucher.x / e.taille.l) * l), Math.round((1 - toucher.y / e.taille.h) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          e.onToucher?.(lirePixel(px, tableMuscles), toucher.x, toucher.y);
        } catch {
          e.onToucher?.(null, toucher.x, toucher.y);
        } finally {
          mesh.material = matiere;
        }
      }
      // squelette et anneaux rétablis après les passes d'identifiants
      if (squelette) squelette.mesh.visible = e.articulations;
      placerMarques();
      lueur = ameMontree ? Math.min(1, lueur + dt / 0.15) : Math.max(0, lueur - dt / 0.12);
      if (e.reduit) lueur = ameMontree ? 1 : 0;
      // le corps détourné cache l'âme et sa lueur (faceAme) : de dos, plus rien ne se voit à travers. Première image : le corps
      // seul, l'âme (le shader le plus long à compiler) à l'image suivante, pendant le fondu du corps
      const face = faceAme(pivot.rotation.y);
      ame.mesh.visible = ameMontree && face > 0 && signale;
      ame.voiler(face);
      verreAme.uAme.value.w = lueur * lueur * (3 - 2 * lueur) * face;
      if (e.ame && (ameMontree || lueur > 0)) ame.avancer(dt, e.ame, e.reduit);
      if (!signale) {
        // mesure de l'arrivée : la compilation des programmes seule, puis le reste de la première image
        const tc = performance.now();
        r.compile(scene, cam);
        arriveeDuree("compil", performance.now() - tc);
      }
      const t0 = performance.now();
      r.render(scene, cam);
      gl.endFrameEXP();
      if (e.mesure) {
        const fin = performance.now();
        stats.images += 1;
        stats.ms.push(fin - t0);
        if (fin - stats.debut >= 2000) {
          const tri = stats.ms.slice().sort((x, y) => x - y);
          const moy = tri.reduce((x, y) => x + y, 0) / Math.max(1, tri.length);
          console.log(`[corps] ame=${ame.mesh.visible ? 1 : 0} ips=${((stats.images * 1000) / (fin - stats.debut)).toFixed(1)} rendu_moy=${moy.toFixed(1)}ms rendu_p95=${(tri[Math.floor(tri.length * 0.95)] ?? 0).toFixed(1)}ms images=${stats.images}`);
          stats.debut = fin;
          stats.images = 0;
          stats.ms = [];
        }
      }
      if (!signale) {
        signale = true;
        arriveeDuree("rendu1", performance.now() - t0); // shaders déjà compilés : textures, morphoses, dessin
        arriveeImage();
        apparu.value = e.reduit ? 1 : withTiming(1, { duration: santeEntree.corps, easing: courbes.sortie });
        // d'autres images tout de suite, le temps du fondu : l'âme différée, et la vue visible (en mouvement réduit, sans
        // balancement ni scan, il n'y en avait pas d'autre, et la seule, faite pendant que la vue était à 0, ne s'affichait pas)
        e.forcer = true;
        finArrivee = performance.now() + santeEntree.corps;
        e.onPret?.();
      }
      image = requestAnimationFrame(boucle);
    };
    e.sale = true;
    image = requestAnimationFrame(boucle);
  };

  // Rotation au doigt : prise en capture dès que le glissé est horizontal (ni la page ni le volet ne le prennent), gardée
  // jusqu'au lâcher. L'aura et le rendu se réveillent pendant le geste.
  const glisse = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => prendRotation(g.dx, g.dy),
        onPanResponderGrant: () => {
          e.rot.tenu = true;
          e.rot.vitesse = 0;
          e.depart = e.rot.angle;
          reveillerAura();
          e.reveil();
        },
        onPanResponderMove: (_, g) => {
          e.rot.angle = e.depart + g.dx * ROTATION_DOIGT.radParDp;
          reveillerAura();
        },
        onPanResponderRelease: (_, g) => {
          e.rot.tenu = false;
          e.rot.vitesse = lancer(g.vx, e.reduit);
          e.rot.lache = performance.now();
          e.reveil();
        },
        onPanResponderTerminate: () => {
          e.rot.tenu = false;
          e.rot.lache = performance.now();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [e],
  );
  const gestes = tourner ? glisse.panHandlers : {};

  const vue = (
    <>
      {largeur > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, styleSilhouette]} pointerEvents="none">
          <SilhouetteSante femme={corps.sexe === "f"} tailleCm={corps.tailleCm} largeur={largeur} mode={mode} />
        </Animated.View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, styleCorps]} pointerEvents="none">
        <GLView key={`${corps.sexe}-${corps.epaules}-${reprise}-${prepasse}-${lisse}`} style={StyleSheet.absoluteFill} onContextCreate={surContexte} />
      </Animated.View>
    </>
  );
  // la taille de la zone (dp) sert au toucher, au centre d'une zone et à la surface GL (pliage, dépliage, rotation)
  const mesurer = (ev: LayoutChangeEvent) => {
    const { width, height } = ev.nativeEvent.layout;
    setLargeur(width);
    e.taille = { l: width, h: height };
    e.centre = true;
    e.points = true;
    e.reveil();
  };
  if (!onToucher) {
    return (
      <View style={styles.zone} pointerEvents={tourner ? "auto" : "none"} onLayout={mesurer} {...gestes}>
        {vue}
      </View>
    );
  }
  return (
    <View style={styles.zone} onLayout={mesurer} {...gestes}>
    <Pressable
      accessibilityLabel={libelle}
      style={styles.zone}
      onPress={(ev) => {
        e.toucher = { x: ev.nativeEvent.locationX, y: ev.nativeEvent.locationY };
        e.reveil();
      }}
    >
      {vue}
    </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { height: HAUTEUR_CORPS, alignSelf: "stretch" },
});
