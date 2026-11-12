import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, Vibration, View } from "react-native";
import Animated, { FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import type { ChampSerie } from "../db";
import { arreterChrono, basculerChrono, chronoDe, ecouleS, toucherChrono, type AffichageChrono } from "../ecrans/chrono-serie";
import { useApp } from "../ecrans/contexte";
import { passerRepos } from "../ecrans/repos";
import { minuteur } from "../natif/minuteur";
import { lireTemps, tempsTexte, type Unite } from "../ecrans/format";
import { signalerErreur } from "./FeuilleMessage";
import { useTheme } from "../theme";
import { duree, echelle, ressort } from "../theme/mouvement";
import { cible, espace, POLICE_MAX, rayon, TAILLE_MIN, typo } from "../theme/typo";
import { GlisserSupprimer, VueDecalable } from "./GlisserSupprimer";
import { haptique } from "./haptique";
import { Icone } from "./Icone";
import { Medaille } from "./Medaille";
import { Appui, courbes, Pop } from "./mouvement";
import { Texte } from "./Texte";
import { t } from "../i18n/index";
import { useReduit } from "./reduit";
import { FondDegrade } from "./Degrade";
import { useChronoSerie } from "./useChronoSerie";
import { useChampChiffre } from "./useChampChiffre";
import type { InfoCharge } from "../ecrans/charge-seance";

export type EtatSerie = "afaire" | "encours" | "faite";

// Grille de la base : 36 / 1fr / 68 / 56 / 48, écart 6 (séance, en-têtes et lignes).
export const GRILLE = { numero: 36, charge: 68, reps: 56, distance: 68, temps: 116, case: cible.caseW, ecart: 6 } as const;
const LARGEUR: Record<ChampSerie, number> = { kg: GRILLE.charge, reps: GRILLE.reps, distance_m: GRILLE.distance, duree_s: GRILLE.temps };

/** Une colonne de saisie d'une série, selon la nature de l'exercice (D7). */
export interface Cellule {
  /** Identifiant stable : id de la série + champ. */
  id: string;
  champ: ChampSerie;
  valeur: string;
  libelle: string;
  /** Texte grisé du champ vide (plage de répétitions de la routine). */
  indication?: string;
  /** E1 : toujours modifiable, même cochée ; la valeur est rendue à la fin de la saisie. */
  onFin: (v: string) => void;
  /** Clavier de séance : la saisie en cours, écrite en base en différé (rien de perdu si l'appli est tuée). */
  onBrouillon?: (v: string) => void;
  /** Charge : la bande des paliers se pose sur le clavier (D14). */
  paliers?: { liste: number[] | null; unite: Unite };
  /** Matériel du lieu (clavier de séance) : la charge la plus proche et son avis, le chargement de la barre. */
  charge?: InfoCharge | null;
  /**
   * Durée : chrono (D16), compte à rebours depuis `cibleS` (planche seance-duree, D1 A) ; `onArret` reçoit le temps réel et
   * la cible du compte (null s'il montait). `ecart` : sous le temps d'une série validée (« +7 s ») ; sous les répétitions,
   * l'effort dit (« dur »).
   */
  chrono?: { serieId: string; cibleS: number | null; onArret: (s: number, cibleS: number | null) => void };
  ecart?: string;
  /** Ordre de la case dans la séance (clavier de séance : Valider passe à la suivante). */
  ordre?: number;
}

interface Props {
  numero: string;
  couleurNumero?: string;
  precedent: string;
  /** Seconde ligne sous le précédent : 1RM, charge effective ou « hors palier ». */
  note?: string;
  cellules: Cellule[];
  etat: EtatSerie;
  onToggle?: () => void;
  onNumero: () => void;
  /** Glisser la ligne vers la gauche, ou action d'accessibilité : supprime la série. */
  onSupprimer?: () => void;
  /** Nouveau record (série validée) : la médaille remplace le numéro. */
  record?: boolean;
  /** Valeur inhabituelle à la coche : ligne orange, panneau à la place de la coche, champ fautif encadré. */
  alerte?: ChampSerie | null;
  /** « Modifier la série » : le champ prend le focus à chaque nouveau `n`. */
  focus?: { champ: ChampSerie; n: number } | null;
  /** Plein écran : pas de ▶ dans la ligne, le grand bouton s'en charge (planche seance-duree). */
  pleinEcran?: boolean;
  /** Appui long du glisser-déposer (Glisser.tsx) : sur le numéro et le précédent, jamais sur les saisies ni la case. */
  appui?: object;
  /** Lu au début de chaque glissé vers la gauche : faux pendant un glisser-déposer, la suppression ne s'en mêle pas. */
  glisseLibre?: () => boolean;
}

/** Encre de la validation (planche animée) : la ligne se remplit depuis la case en 320 ms, 90 ms après l'appui. */
const ENCRE = { duree: 320, delai: 90, rayonDepart: 12, marge: 16 } as const;
/** Case : l'éclat vert part de son bord droit (160 ms), s'efface après 220 ms ; la coche passe du blanc au vert en 440 ms. */
const ECLAT = { duree: 160, tenue: 220, fondu: 200, coche: 440 } as const;

function Champ({
  valeur,
  onFin,
  onBrouillon,
  etat,
  clavier,
  libelle,
  paliers,
  charge,
  cle,
  indication,
  temps,
  autoFocus,
  alerte,
  focusN,
  decale = false,
  champ: nature,
  ordre,
}: {
  valeur: string;
  onFin: (v: string) => void;
  /** Saisie en cours au clavier de séance, écrite en base en différé (même texte que onFin). */
  onBrouillon?: (v: string) => void;
  etat: EtatSerie;
  clavier: "decimal-pad" | "number-pad";
  libelle: string;
  paliers?: Cellule["paliers"];
  charge?: Cellule["charge"];
  cle: string;
  indication?: string;
  /** Saisie d'un temps : masque « hh:mm:ss » rempli de droite à gauche dès le premier chiffre. */
  temps?: boolean;
  autoFocus?: boolean;
  /** Valeur inhabituelle : cadre orange. */
  alerte?: boolean;
  /** Demande de focus (« Modifier la série ») : chaque nouvelle valeur. */
  focusN?: number;
  /** L'écart à la cible s'écrit sous le temps : le texte remonte un peu. */
  decale?: boolean;
  /** Nature de la case (pas de la molette du clavier de séance). */
  champ?: ChampSerie;
  /** Ordre de la case dans la séance : Valider du clavier de séance passe à la suivante. */
  ordre?: number;
}) {
  const { couleurs } = useTheme();
  // Clavier de séance (planche clavier-seance) : le comportement du champ est partagé (useChampChiffre).
  const { props, focus, perso } = useChampChiffre({ valeur, onFin, onBrouillon, clavier, paliers, charge, cle, temps, focusN, champ: nature, ordre });
  const faite = etat === "faite";
  const encours = etat === "encours";
  return (
    <TextInput
      maxFontSizeMultiplier={POLICE_MAX}
      {...props}
      autoFocus={autoFocus}
      cursorColor={couleurs.action}
      selectionColor={couleurs.action}
      placeholder={indication ?? "–"}
      placeholderTextColor={couleurs.t3}
      accessibilityLabel={indication ? t("seance.ligne.vise", { libelle, indication }) : libelle}
      style={[
        styles.champ,
        typo.saisie,
        decale && styles.champDecale,
        {
          color: faite || encours || focus || alerte ? couleurs.t1 : couleurs.t3,
          backgroundColor: alerte ? "transparent" : encours || focus ? couleurs.serieActiveChamp : "transparent",
          borderWidth: alerte || (perso && focus) ? 1.5 : !faite && !encours && !focus ? 1 : 0,
          borderColor: alerte || (perso && focus) ? couleurs.action : couleurs.line2,
        },
      ]}
    />
  );
}

function ChampTemps({
  cellule,
  etat,
  cle,
  alerte,
  focusN,
  aff,
  pleinEcran,
}: {
  cellule: Cellule;
  etat: EtatSerie;
  cle: string;
  alerte?: boolean;
  focusN?: number;
  aff: AffichageChrono | null;
  pleinEcran?: boolean;
}) {
  const { couleurs } = useTheme();
  const { db } = useApp();
  const c = cellule.chrono!;
  const en = chronoDe(c.serieId);
  const [corriger, setCorriger] = useState(false);
  // ▶ : compte à rebours depuis la cible de la case ; ⏸ / ▶ : pause et reprise. La coche (case de droite) l'arrête et garde
  // le temps réel. Lancé pendant un repos, il l'arrête (D7). Seul un temps corrigé après un toucher sert de point de reprise.
  const basculer = () => {
    if (!en && minuteur.etat().actif) passerRepos(db).catch(signalerErreur());
    basculerChrono(c.serieId, lireTemps(cellule.valeur), Date.now(), c.cibleS);
  };
  const depasse = !!aff?.depasse;
  return (
    <View style={{ width: GRILLE.temps, flexDirection: "row", alignItems: "center" }}>
      <View style={{ flex: 1 }}>
        {en && aff ? (
          // Toucher le compte l'arrête et rend le temps modifiable (le temps écoulé est gardé).
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("seance.ligne.modifierChrono", { libelle: cellule.libelle, temps: tempsTexte(ecouleS(en)) })}
            onPress={() => {
              const s = toucherChrono(c.serieId);
              if (s != null) cellule.onFin(tempsTexte(s));
              setCorriger(true);
            }}
            style={[styles.champ, styles.champChrono, { backgroundColor: depasse ? couleurs.valideVoile : couleurs.serieActiveChamp }]}
          >
            <Texte variante="saisie" style={depasse ? { color: couleurs.valide } : undefined}>
              {aff.texte}
            </Texte>
            {/* Le trait du geste se vide comme la barre de repos ; à 0 il reste plein, en vert. */}
            {depasse ? (
              <View style={[styles.traitChrono, { width: "100%", backgroundColor: couleurs.valide }]} />
            ) : aff.reste != null ? (
              <View style={[styles.traitChrono, { width: `${aff.reste * 100}%` }]}>
                <FondDegrade angle={90} />
              </View>
            ) : null}
          </Pressable>
        ) : (
          <View>
            <Champ
              valeur={cellule.valeur}
              onFin={cellule.onFin}
              onBrouillon={cellule.onBrouillon}
              etat={etat}
              clavier="number-pad"
              libelle={cellule.libelle}
              cle={cle}
              temps
              autoFocus={corriger}
              alerte={alerte}
              focusN={focusN}
              decale={!!cellule.ecart}
              champ={cellule.champ}
              ordre={cellule.ordre}
            />
            {cellule.ecart ? (
              // Écart à la cible sous le temps enregistré : vert au-delà, neutre en deçà.
              <Texte variante="meta" pointerEvents="none" style={[styles.ecart, { color: cellule.ecart.startsWith("+") ? couleurs.valide : couleurs.t2 }]}>
                {cellule.ecart}
              </Texte>
            ) : null}
          </View>
        )}
      </View>
      {pleinEcran ? null : etat === "faite" ? (
        // Série validée : plus de lecture / pause ; la place reste pour garder les temps alignés.
        <View style={styles.chrono} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={aff?.marche ? t("seance.ligne.chronoPause") : en ? t("seance.ligne.chronoReprendre") : t("seance.ligne.chronoLancer")}
          onPress={basculer}
          hitSlop={4}
          style={styles.chrono}
        >
          {/* ▶ du geste (orange) sur la série en cours ; atténué comme la case sur les séries à venir. */}
          <Icone nom={aff?.marche ? "pause" : "play"} couleur={aff?.marche || en ? couleurs.t1 : etat === "encours" ? couleurs.action : couleurs.line2} taille={20} />
        </Pressable>
      )}
    </View>
  );
}

export function LigneSerie({ numero, couleurNumero, precedent, note, cellules, etat, onToggle, onNumero, onSupprimer, record = false, alerte = null, focus = null, pleinEcran = false, appui, glisseLibre }: Props) {
  const { couleurs, mode } = useTheme();
  const faite = etat === "faite";
  const encours = etat === "encours" && !alerte;
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  // Médaille et vibration seulement si le record suit une validation (pas à l'ouverture, quand l'historique arrive).
  const faiteAvant = useRef(faite);
  const recordAvant = useRef(record);
  const valideLe = useRef(0);
  const vientDeValider = faite && (!faiteAvant.current || Date.now() - valideLe.current < 3000);
  const nouveauRecord = record && !recordAvant.current && vientDeValider;
  useEffect(() => {
    if (faite && !faiteAvant.current) valideLe.current = Date.now();
    faiteAvant.current = faite;
  }, [faite]);
  useEffect(() => {
    if (nouveauRecord) haptique.succes();
    recordAvant.current = record;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);
  const chrono = cellules.find((c) => c.chrono)?.chrono;
  // Compte à rebours de la série : la cellule l'affiche, la case passe au vert quand la cible est atteinte.
  const aff = useChronoSerie(chrono?.serieId);
  // Valider pendant le chrono (en marche ou en pause) : il s'arrête et sa durée est enregistrée avec la coche.
  // Pas de vibration à la coche : seulement sur un record ou une valeur inhabituelle (26/10).
  const valider = onToggle
    ? () => {
        const cibleS = chrono ? (chronoDe(chrono.serieId)?.cibleS ?? null) : null;
        const s = !faite && !alerte && chrono ? arreterChrono(chrono.serieId) : null;
        if (s != null) chrono!.onArret(s, cibleS);
        else onToggle();
      }
    : undefined;
  // Orange de l'avertissement : action à 15 % la nuit, 10 % le jour (planche).
  const orange = `${couleurs.action}${mode === "nuit" ? "26" : "1a"}`;
  // Dans une ligne supprimable, la ligne perd ses coins de droite quand elle est glissée (jonction nette avec « Supprimer »).
  const ligne = (
    <VueDecalable
      onLayout={(e) => setTaille({ l: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[styles.ligne, onSupprimer && styles.ligneGlissee, encours && { backgroundColor: couleurs.serieActiveFond }]}
    >
      <Encre actif={!!alerte && !faite} couleur={orange} taille={taille} retenue={faite} />
      <Encre actif={faite} couleur={couleurs.valideVoile} taille={taille} />
      <View style={styles.zoneAppui} {...appui}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("seance.ligne.typeSerie", { numero, record: record && faite ? t("seance.ligne.recordVirgule") : "" })}
        {...actionsSupprimer(onSupprimer, onNumero)}
        onPress={onNumero}
        hitSlop={6}
        style={[styles.numero, { backgroundColor: record && faite ? "transparent" : couleurs.s2 }]}
      >
        {record && faite ? (
          <Pop actif montage={nouveauRecord} depart={echelle.recordDepart} config={ressort.record}>
            <Medaille taille={26} />
          </Pop>
        ) : (
          <Animated.View exiting={FadeOut.duration(duree.sortie).easing(courbes.sortie)}>
            <Texte variante="saisie" style={{ fontSize: 15, color: couleurNumero ?? (faite ? couleurs.serieFaiteCoche : couleurs.t1) }}>
              {numero}
            </Texte>
          </Animated.View>
        )}
      </Pressable>
      <View style={styles.precedent}>
        <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ fontSize: 13 }}>
          {precedent}
        </Texte>
        {note ? (
          <Texte variante="meta" couleur="t2" numberOfLines={1} style={{ fontSize: 11 }}>
            {note}
          </Texte>
        ) : null}
      </View>
      </View>
      {cellules.map((c) => {
        const cle = c.id;
        const focusN = focus?.champ === c.champ ? focus.n : undefined;
        return c.chrono ? (
          <ChampTemps key={c.champ} cellule={c} etat={etat} cle={cle} alerte={alerte === c.champ} focusN={focusN} aff={aff} pleinEcran={pleinEcran} />
        ) : (
          <View key={c.champ} style={{ width: LARGEUR[c.champ] }}>
            <Champ
              valeur={c.valeur}
              onFin={c.onFin}
              onBrouillon={c.onBrouillon}
              etat={etat}
              clavier={c.champ === "reps" || c.champ === "duree_s" ? "number-pad" : "decimal-pad"}
              libelle={c.libelle}
              paliers={c.paliers}
              charge={c.charge}
              cle={cle}
              indication={c.indication}
              temps={c.champ === "duree_s"}
              alerte={alerte === c.champ}
              focusN={focusN}
              decale={!!c.ecart}
              champ={c.champ}
              ordre={c.ordre}
            />
            {c.ecart ? (
              // Sous les répétitions d'une série cochée : l'effort dit (« dur », planche programmes-charges).
              <Texte variante="meta" pointerEvents="none" style={[styles.ecart, { color: couleurs.t2, fontFamily: "Inter-Medium" }]}>
                {c.ecart}
              </Texte>
            ) : null}
          </View>
        );
      })}
      {valider ? (
        <Appui
          accessibilityRole="checkbox"
          accessibilityState={{ checked: faite }}
          accessibilityLabel={alerte ? t("seance.ligne.inhabituelle", { numero }) : t("seance.ligne.valider", { numero })}
          onPress={valider}
          echelle={echelle.appuiPetit}
          style={styles.case}
        >
          <CaseSerie faite={faite} encours={encours} alerte={!!alerte && !faite} invite={!!aff?.depasse && !faite} />
        </Appui>
      ) : (
        <View style={styles.case}>
          {faite ? <Icone nom="check" couleur={couleurs.serieFaiteCoche} taille={18} /> : null}
        </View>
      )}
    </VueDecalable>
  );
  return onSupprimer ? (
    <GlisserSupprimer actif={glisseLibre ?? true} onSupprimer={onSupprimer} style={styles.cadreGlisse}>
      {ligne}
    </GlisserSupprimer>
  ) : (
    ligne
  );
}

/**
 * Encre de la ligne : un disque part de la case et gagne la ligne vers la gauche (320 ms, courbe de sortie), puis reste
 * comme fond. Éteinte : fondu de 150 ms ; `retenue` (orange sous l'encre verte) : elle tient jusqu'à la fin du vert.
 * Mouvement réduit : fondu de 150 ms, sans grandir.
 */
function Encre({ actif, couleur, taille, retenue = false }: { actif: boolean; couleur: string; taille: { l: number; h: number }; retenue?: boolean }) {
  const reduit = useReduit();
  const p = useSharedValue(actif ? 1 : 0);
  const o = useSharedValue(actif ? 1 : 0);
  const avant = useRef(actif);
  useEffect(() => {
    if (actif === avant.current) return;
    avant.current = actif;
    if (actif && reduit) {
      p.value = 1;
      o.value = withTiming(1, { duration: duree.sortie, easing: courbes.sortie });
    } else if (actif) {
      o.value = 1;
      p.value = withSequence(withTiming(0, { duration: 0 }), withDelay(ENCRE.delai, withTiming(1, { duration: ENCRE.duree, easing: courbes.sortie })));
    } else if (retenue) o.value = withDelay(ENCRE.delai + ENCRE.duree, withTiming(0, { duration: 0 }));
    else o.value = withTiming(0, { duration: duree.sortie, easing: courbes.sortie });
  }, [actif, reduit, retenue, p, o]);
  const cx = taille.l - 6 - GRILLE.case / 2;
  const cy = taille.h / 2;
  const r = Math.hypot(cx, cy) + ENCRE.marge;
  const depart = r > 0 ? ENCRE.rayonDepart / r : 0;
  const anime = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: depart + (1 - depart) * p.value }] }));
  if (!taille.l) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: couleur }, anime]}
    />
  );
}

/**
 * Case de la série. À faire : encadré clair ; en cours : encadré et coche, sobre (pas de dégradé, 26/10) ;
 * validée : l'éclat vert remplit la case depuis son bord droit, la coche se pose en ressort, blanche puis verte ;
 * alerte : encadré orange, panneau qui se balance.
 */
function CaseSerie({ faite, encours, alerte, invite = false }: { faite: boolean; encours: boolean; alerte: boolean; invite?: boolean }) {
  const { couleurs } = useTheme();
  const reduit = useReduit();
  const eclat = useSharedValue(0);
  const blanc = useSharedValue(0);
  const balance = useSharedValue(0);
  const faiteAvant = useRef(faite);
  const alerteAvant = useRef(alerte);
  useEffect(() => {
    if (faite && !faiteAvant.current && !reduit) {
      const sortie = { duration: ECLAT.duree, easing: courbes.sortie };
      eclat.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, sortie), withDelay(ECLAT.tenue - ECLAT.duree, withTiming(2, { duration: ECLAT.fondu, easing: courbes.sortie })));
      blanc.value = withSequence(withTiming(1, { duration: 0 }), withDelay(ECLAT.coche * 0.45, withTiming(0, { duration: ECLAT.coche * 0.55, easing: courbes.sortie })));
    }
    faiteAvant.current = faite;
  }, [faite, reduit, eclat, blanc]);
  useEffect(() => {
    if (alerte && !alerteAvant.current && !reduit) {
      const pas = { duration: 75, easing: courbes.sortie };
      balance.value = withSequence(withTiming(0, { duration: 0 }), withTiming(-12, pas), withTiming(9, pas), withTiming(-4, pas), withTiming(0, pas));
    }
    alerteAvant.current = alerte;
  }, [alerte, reduit, balance]);
  const styleEclat = useAnimatedStyle(() => ({ opacity: eclat.value <= 1 ? (eclat.value > 0 ? 1 : 0) : 2 - eclat.value, transform: [{ scale: Math.min(1, eclat.value) }] }));
  const styleBlanc = useAnimatedStyle(() => ({ opacity: blanc.value }));
  const styleBalance = useAnimatedStyle(() => ({ transform: [{ rotate: `${balance.value}deg` }] }));
  if (alerte) {
    return (
      <View style={[styles.boite, styles.boiteAlerte, { borderColor: couleurs.action }]}>
        <Animated.View style={[{ transformOrigin: "50% 80%" }, styleBalance]}>
          <Icone nom="alerte" couleur={couleurs.action} taille={20} epaisseur={2} />
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={[styles.boite, !faite && { borderWidth: 1.5, borderColor: invite ? couleurs.valide : encours ? couleurs.t3 : couleurs.line2 }]}>
      <Animated.View pointerEvents="none" style={[styles.eclat, { backgroundColor: couleurs.valide }, styleEclat]} />
      <Pop actif={faite}>
        <View>
          <Icone nom="check" couleur={faite || invite ? couleurs.valide : encours ? couleurs.t2 : couleurs.line2} taille={faite ? 22 : 18} epaisseur={faite ? 2.5 : 2.25} />
          {faite ? (
            <Animated.View style={[StyleSheet.absoluteFill, styleBlanc]}>
              {/* Coche posée sur le vert plein : couleur du fond (planche : --surValide). */}
              <Icone nom="check" couleur={couleurs.bg} taille={22} epaisseur={2.5} />
            </Animated.View>
          ) : null}
        </View>
      </Pop>
    </View>
  );
}

/** Action « Supprimer la série » sur le bouton du numéro (lecteur d'écran), en plus de son appui. */
export function actionsSupprimer(onSupprimer: (() => void) | undefined, onActiver: () => void) {
  if (!onSupprimer) return {};
  return {
    accessibilityActions: [{ name: "activate" }, { name: "supprimer", label: t("seance.ligne.supprimer") }],
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => (e.nativeEvent.actionName === "supprimer" ? onSupprimer() : onActiver()),
  };
}

/** Ligne de série en lecture (page d'une routine) : même grille que la séance, sans saisie ni case. */
export function LigneSerieLecture({
  numero,
  couleurNumero,
  precedent,
  cases,
}: {
  numero: string;
  couleurNumero?: string;
  precedent: string;
  /** `vise` : cible de la routine en t1 ; sinon valeur reprise du précédent, en t3. */
  cases: { champ: ChampSerie; texte: string; vise: boolean; libelle: string }[];
}) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.ligne}>
      <View style={[styles.numero, { backgroundColor: couleurs.s2 }]}>
        <Texte variante="saisie" style={{ fontSize: 15, color: couleurNumero ?? couleurs.t1 }}>
          {numero}
        </Texte>
      </View>
      <View style={styles.precedent}>
        <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ fontSize: 13 }}>
          {precedent}
        </Texte>
      </View>
      {cases.map((c) => (
        <View key={c.champ} accessible accessibilityLabel={t("seance.ligne.valeurCase", { libelle: c.libelle, texte: c.texte === "–" ? t("seance.ligne.vide") : c.texte })} style={{ width: LARGEUR[c.champ], alignItems: "center" }}>
          <Texte variante="saisie" couleur={c.vise ? "t1" : "t3"} numberOfLines={1} style={c.texte.includes("–") && c.texte.length > 1 ? { fontSize: 15 } : undefined}>
            {c.texte}
          </Texte>
        </View>
      ))}
    </View>
  );
}

export interface ColonneEntete {
  champ: ChampSerie;
  etiquette: string;
  /** Largeur de la colonne si elle diffère de la grille (plage de répétitions). */
  largeur?: number;
  /** Libellé d'accessibilité du bouton (par défaut : changement d'unité). */
  libelleAcces?: string;
  /** Touchable (bascule kg / lbs). */
  onPress?: () => void;
}

/** En-têtes de colonnes : SÉRIE / PRÉCÉDENT / colonnes de la nature, puis la place vide de la case (sauf en lecture). */
export function EnteteSeries({ colonnes, sansCase, sansPrecedent }: { colonnes: ColonneEntete[]; sansCase?: boolean; sansPrecedent?: boolean }) {
  return (
    <View style={[styles.ligne, { minHeight: 36 }]}>
      <Texte variante="entete" couleur="t3" style={{ width: GRILLE.numero }}>
        {t("seance.ligne.enteteSerie")}
      </Texte>
      {sansPrecedent ? (
        <View style={styles.precedent} />
      ) : (
        <Texte variante="entete" couleur="t3" style={[styles.precedent, { textAlign: "center" }]}>
          {t("seance.ligne.entetePrecedent")}
        </Texte>
      )}
      {colonnes.map((c) =>
        c.onPress ? (
          <Pressable
            key={c.champ}
            accessibilityRole="button"
            accessibilityLabel={c.libelleAcces ?? t("seance.ligne.unite", { unite: c.etiquette })}
            onPress={c.onPress}
            hitSlop={8}
            style={{ width: c.largeur ?? LARGEUR[c.champ], height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Texte variante="entete" couleur="t2" style={{ fontFamily: "Inter-Medium", fontSize: 12 }}>
              {c.etiquette}
            </Texte>
          </Pressable>
        ) : (
          <Texte key={c.champ} variante="entete" couleur="t3" style={{ width: c.largeur ?? LARGEUR[c.champ], textAlign: "center" }}>
            {c.etiquette}
          </Texte>
        ),
      )}
      {sansCase ? null : (
        <View style={{ width: GRILLE.case }} />
      )}
    </View>
  );
}

/** Bouton discret sous le tableau des séries (séance et édition de routine) ; repris sous un repas (« Ajouter au dîner »). */
export function BoutonAjouterSerie({ onPress, libelle = t("seance.ligne.ajouterSerie") }: { onPress: () => void; libelle?: string }) {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ajouter, pressed && { backgroundColor: couleurs.s1 }]}>
      <Icone nom="plus" couleur={couleurs.t2} taille={18} />
      <Texte variante="libelle" couleur="t2">
        {libelle}
      </Texte>
    </Appui>
  );
}

const styles = StyleSheet.create({
  ajouter: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s, borderRadius: 12 },
  // Hauteurs minimales, pas fixes : à font_scale 1,3 la ligne grandit au lieu de couper le texte.
  ligne: {
    minHeight: cible.ligneSerie,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: GRILLE.ecart,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: rayon.l,
    // L'encre de la validation reste dans la ligne.
    overflow: "hidden",
  },
  // Ligne glissable : la marge négative passe au cadre, qui coupe ce qui déborde pendant le geste.
  cadreGlisse: { marginHorizontal: -6, borderRadius: rayon.l },
  ligneGlissee: { marginHorizontal: 0 },
  numero: { width: 32, minHeight: 32, marginHorizontal: 2, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  precedent: { flex: 1, alignItems: "center" },
  zoneAppui: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: GRILLE.ecart },
  champ: { minHeight: 40, textAlign: "center", borderRadius: rayon.m, paddingVertical: 0, paddingHorizontal: 2 },
  // Compte à rebours : chiffres au centre, trait du geste au pied de la case.
  champChrono: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  traitChrono: { position: "absolute", left: 0, bottom: 0, height: 3, overflow: "hidden" },
  // Écart à la cible sous le temps enregistré (« +7 s ») : le temps remonte de 8 px.
  champDecale: { paddingBottom: 12 },
  ecart: { position: "absolute", left: 0, right: 0, bottom: 1, textAlign: "center", fontSize: TAILLE_MIN, fontFamily: "Inter-SemiBold" },
  chrono: { width: 40, minHeight: 44, alignItems: "center", justifyContent: "center" },
  case: { width: cible.caseW, minHeight: cible.caseH, alignItems: "center", justifyContent: "center" },
  boite: { width: 32, height: 32, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  boiteAlerte: { width: 36, height: 36, borderWidth: 1.5 },
  // Éclat : disque de 1,5 × la case, centré sur son bord droit.
  eclat: { position: "absolute", left: 32 - 48, top: 16 - 48, width: 96, height: 96, borderRadius: 48 },
});
