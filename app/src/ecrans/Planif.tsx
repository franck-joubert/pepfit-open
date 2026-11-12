import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Image, Pressable, StyleSheet, View, type ViewInstance } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "../ui/focus-prechauffe";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { ListeDesintegrable } from "../ui/Desintegration";
import { coinsJonction, GlisserSupprimer, useLigneDecalee } from "../ui/GlisserSupprimer";
import { Icone } from "../ui/Icone";
import { Medaille } from "../ui/Medaille";
import { fichierPicto } from "../ui/pictos";
import { avecOpacite } from "../theme/teintes";
import { Appui } from "../ui/mouvement";
import { signalerErreur } from "../ui/FeuilleMessage";
import { Surligne, SURLIGNE_MS } from "../ui/Surligne";
import { Texte } from "../ui/Texte";
import { CaseJour as CaseJourBase } from "../ui/BandeSemaine";
import { approx, dureeCourte, heureTexte, jourLong, jourMois, jourSemaineMois, moisLong, nombre } from "./format";
import { effortsSeancesJour } from "./effort-charges";
import { texteEffort } from "./mesures/scores-calc";
import { ouvrirRecap } from "./recap/ouvrir-recap";
import type { AgendaLigne } from "./agenda/useAgenda";
import { cleLigne } from "./cle-ligne";
import { demandeChoix } from "./retrait-ligne";
import { instantDe, lignesDuJour, marque, type LigneJour, type Planning } from "./planif-donnees";
import { ajouterJ, quand } from "./planification";
import { ignorer, LigneActivite, useActivitesJour, type ActiviteVue } from "./ActiviteDetectee";
import { fusionnerParHeure } from "./activites-vue";
import { surActivitesChangees } from "./activites-evenement";
import { useApp } from "./contexte";
import { chiffresSeances, metaSeance, type ChiffresSeance } from "./meta-seance";
import { gabaritLigne } from "./ligne-jour-styles";
import { ContourTuile } from "../ui/ContourTuile";
import { LigneRecup, LigneSommeil } from "./LigneRecup";
import { etatSommeil, sommeilMontre, type ActionsEffortListe, type ElementRecup } from "./page-effort";
import { usePageEffort } from "./usePageEffort";

// Planification (planche v7) : liste des séances du jour (la bande de la semaine et la série sont dans ui/).
// Partagé par Entraînements et la page du mois. Une seule pastille par jour : pleine (faite) > anneau (à venir) > grise
// (manquée), de l'orange du Sport ; dans le semainier, une séance faite prend le vert « validé » (teintes-parties, 29/10).
// Lignes (planche sport-programmes-routines v2, B5, D8, D10, validées le 29/10) : le picto de la séance dans une tuile ; faite,
// anneau vert et case cochée verte ; la séance prévue aujourd'hui n'a plus de bouton : sa carte est encadrée d'orange avec un
// halo, et la toucher la démarre (D10) ; ⋯ garde les options.


/** Nom d'un jour pour l'affichage : instant de midi, dans le fuseau choisi. */
export const midi = (j: string) => instantDe(j, "12:00");
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Nom du mois d'un jour, avec majuscule. */
export function moisDe(j: string): string {
  return majuscule(moisLong(midi(j)));
}

/** Case d'un jour d'un planning (feuille « Décaler ») : la case commune (ui/BandeSemaine), marquée par le planning. */
export function CaseJour({ p, j, ...reste }: { p: Planning; j: string } & Omit<ComponentProps<typeof CaseJourBase>, "aujourdhui" | "marque" | "j">) {
  return <CaseJourBase {...reste} j={j} aujourdhui={p.aujourdhui} marque={marque(p, j)} />;
}

/** Titre d'un jour : nom en capitales (« AUJOURD'HUI », « JEUDI ») et date. */
export function TitreJour({ j, p, style }: { j: string; p: Planning; style?: object }) {
  useLangue();
  const auj = j === p.aujourdhui;
  return (
    <View style={[styles.titreJour, style]}>
      <Texte variante="entete" couleur="t2">
        {auj ? t("planif.aujourdhui") : jourLong(midi(j))}
      </Texte>
      <Texte variante="meta" couleur="t3">
        {auj ? jourSemaineMois(midi(j)) : jourMois(midi(j))}
      </Texte>
    </View>
  );
}

/**
 * Picto d'une séance (B5) : tuile de 44 ; faite, contour vert et coche en bas à droite ; manquée, picto pâli. Faite et notée
 * (planche sport-stats v2, S9, variante A ; planche effort-pepfit, écran 3) : un voile brun très foncé sur tout le picto, l'Effort
 * pepfit en blanc au centre, sans unité, centré sur le carré (la coche chevauche sans rien déplacer). Une séance de récupération
 * n'a pas d'effort, donc pas de voile.
 * Contour vert (retouche du 09/11, « la bordure n'est pas égale partout ») : posé sur le cadre de 44, sans bordure ni découpe
 * entre eux (la bordure décalait l'origine du trait de la sienne et le rognait à droite et en bas), et la coche, du même vert,
 * se fond dans le trait au lieu de le couper par un halo.
 */
export function PictoSeance({ picto, etat, effort }: { picto: string | null | undefined; etat: "faite" | "prevue" | "manquee"; effort?: string | null }) {
  const { couleurs, mode } = useTheme();
  const src = picto ? fichierPicto(picto, null, 44) : undefined;
  return (
    <View style={styles.pic}>
      <View
        style={[
          styles.tuilePic,
          // la bordure fine du jour n'est que pour les séances sans contour : le contour vert est lui-même le cadre
          etat !== "faite" && mode === "jour" && { borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.verreFilet },
          { backgroundColor: couleurs.pictoRepas },
        ]}
      >
        {src != null ? (
          <Image source={src} style={[styles.imagePic, etat === "manquee" && { opacity: 0.4 }]} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        ) : (
          <Icone nom="dumbbell" couleur={etat === "manquee" ? couleurs.t3 : couleurs.t2} />
        )}
        {etat === "faite" && effort ? (
          <View style={styles.voile}>
            <Texte numberOfLines={1} style={[styles.voileTexte, effort.length > 4 && { fontSize: 12, letterSpacing: -0.4 }]}>
              {effort}
            </Texte>
          </View>
        ) : null}
      </View>
      {/* Le contour vert : le composant commun des tuiles (ui/ContourTuile), tour entier, posé d'un coup, au-dessus du voile. */}
      {etat === "faite" ? <ContourTuile part={1} couleur={couleurs.valide} anime={false} /> : null}
      {etat === "faite" ? (
        <View style={[styles.casePic, { backgroundColor: couleurs.valide }]}>
          <Icone nom="check" couleur={couleurs.bg} taille={12} epaisseur={3} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Une séance du jour : picto, nom, sous-ligne, ⋯. `duJour` : la séance prévue aujourd'hui (la première à venir) ; encadrée
 * d'orange avec un halo, sans bouton : la toucher la démarre (D10, sauf pendant une séance en cours : elle s'ouvre).
 */
export function LigneSeance({
  l,
  picto,
  duJour,
  onMenu,
  onAppuiLong,
  onFinAppui,
  leve,
  chiffres,
  surlignee,
  effort,
  agenda,
}: {
  l: LigneJour;
  /** Clé de picto (sport ou premier exercice) ; sans picto, l'haltère. */
  picto?: string | null;
  duJour?: boolean;
  /** ⋯ d'une séance faite (Voir, Supprimer) ; une séance à venir n'en a pas : la carte entière ouvre son récap. */
  onMenu: () => void;
  /** Appui long : position du doigt et de la ligne dans la fenêtre. */
  onAppuiLong?: (x: number, y: number, ligne: { y: number; h: number }) => void;
  onFinAppui?: () => void;
  leve?: boolean;
  /** Séance faite : ce que comptent ses séries (sous-ligne par famille). */
  chiffres?: ChiffresSeance;
  /** Ligne qui vient de changer (activité associée, sport changé) : voile orange un instant. */
  surlignee?: boolean;
  /** Séance faite et notée : l'effort retenu, écrit sur le picto voilé (« 9,8 », « ~ 8,0 »). */
  effort?: string | null;
  /** Agenda du téléphone (planche agenda-ics, § 4) : ligne ambre d'un conflit, cible à part ; mention déplacée ou retirée. */
  agenda?: AgendaLigne;
}) {
  const vue = useRef<ViewInstance>(null);
  const { couleurs } = useTheme();
  // Glissée vers « Supprimer » : coins de droite droits, une seule pièce avec le bouton (29/10).
  const decalee = useLigneDecalee();
  const nom = l.genre === "faite" ? l.seance.titre : l.nom;
  const ouvrir = () => {
    if (l.genre === "faite") router.push({ pathname: "/history/[id]", params: { id: l.seance.id } });
    // Séance pas faite : le récap commun « avant séance » (planche ajout-seance-v2), où l'on démarre, modifie ou annule.
    else ouvrirRecap({ routineId: l.occ.routineId, prevue: l.occ });
  };
  const etat = l.genre === "faite" ? "faite" : l.manquee ? "manquee" : "prevue";
  // Cadre orange de 1,5 ; le halo est posé sur le cadre de la ligne (ListeJour), que la carte ne peut pas dépasser.
  const halo = duJour ? { borderWidth: 1.5, borderColor: couleurs.partieEntrainement } : null;
  return (
    <View
      ref={vue}
      style={[gabaritLigne.seance, { backgroundColor: leve ? couleurs.s1 : couleurs.verreCarte, borderColor: couleurs.verreFilet }, halo, leve && { elevation: 8 }, coinsJonction(decalee)]}
    >
      {surlignee ? <Surligne couleur={couleurs.partieEntrainement} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={effort && l.genre === "faite" ? `${nom}, ${t("sportStats.luVoile", { valeur: effort })}` : nom}
        onPress={ouvrir}
        onLongPress={
          onAppuiLong
            ? (e) => {
                const { pageX, pageY } = e.nativeEvent;
                vue.current?.measureInWindow((_x, y, _w, h) => onAppuiLong(pageX, pageY, { y, h }));
              }
            : undefined
        }
        onPressOut={onFinAppui}
        delayLongPress={350}
        style={gabaritLigne.seanceLigne}
      >
        <PictoSeance picto={picto} etat={etat} effort={effort} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.titreLigne}>
            <Texte variante="exercice" numberOfLines={2} style={{ flexShrink: 1 }}>
              {nom}
            </Texte>
            {/* Sport posé par pepfit (planche activite-detectee) : « Reconnu », la fiche dit pourquoi et « Changer ». */}
            {l.genre === "faite" && l.seance.reconnu ? (
              <View style={[styles.etiquette, { backgroundColor: couleurs.btnTonalFond }]}>
                <Texte variante="meta" couleur="t2" style={{ fontSize: 11, fontFamily: police.semibold }}>
                  {t("activite.reconnu")}
                </Texte>
              </View>
            ) : null}
          </View>
          {l.genre === "faite" ? (
            <View style={gabaritLigne.sousLigne}>
              {l.seance.nbRecords > 0 ? <Medaille taille={16} /> : null}
              <Texte variante="meta" couleur="t2">
                {metaSeance(l.seance.dureeMin, l.seance.nbSeries, chiffres)}
              </Texte>
            </View>
          ) : l.manquee ? (
            <Texte variante="meta" couleur="t3">
              {t("planif.manquee")}
            </Texte>
          ) : (
            <Texte variante="meta" couleur="t2">
              <Texte variante="meta" style={{ color: couleurs.t1, fontFamily: police.semibold }}>
                {l.sansHeure ? t("ps.sansHeure") : heureTexte(l.occ.heure)}
              </Texte>
              {/* Durée voulue telle quelle, durée estimée avec « ≈ » ; aucune durée : rien. */}
              {l.dureeS > 0 ? `, ${l.dureeChoisie ? dureeCourte(l.dureeS) : approx(dureeCourte(l.dureeS))}` : ""}
              {/* Séance d'un coach ou d'une IA (lot AF) : sa provenance, ou sa retouche, dans la même sous-ligne. */}
              {mentionOrigine(l)}
            </Texte>
          )}
        </View>
        {l.genre === "faite" ? (
          <Appui
            accessibilityRole="button"
            accessibilityLabel={t("accueil.entrainement.optionsDe", { nom })}
            onPress={onMenu}
            hitSlop={12}
            style={({ pressed }) => [gabaritLigne.options, pressed && { backgroundColor: couleurs.s2 }]}
          >
            <Icone nom="more" couleur={couleurs.t2} taille={20} />
          </Appui>
        ) : null}
      </Pressable>
      {/* Conflit (D15) : ambre (jeton « echauffement »), icône et texte, jamais la couleur seule ; il ouvre sa feuille. */}
      {agenda?.conflit ? (
        <Appui
          accessibilityRole="button"
          accessibilityLabel={t("agenda.conflit.a11y", { texte: agenda.conflit.texte })}
          onPress={agenda.conflit.onPress}
          style={({ pressed }) => [styles.conflit, pressed && { backgroundColor: couleurs.s2 }]}
        >
          <Icone nom="alerte" couleur={couleurs.echauffement} taille={16} />
          <Texte variante="meta" numberOfLines={2} style={{ flex: 1, fontSize: 12.5, fontFamily: police.medium, color: couleurs.echauffement }}>
            {agenda.conflit.texte}
          </Texte>
          <Icone nom="right" couleur={couleurs.echauffement} taille={16} />
        </Appui>
      ) : null}
      {agenda?.mention ? (
        <View style={styles.mention}>
          <Icone nom="cal" couleur={couleurs.t3} taille={16} />
          <Texte variante="meta" couleur="t2" style={{ fontSize: 12.5 }}>
            {agenda.mention}
          </Texte>
        </View>
      ) : null}
    </View>
  );
}

/** « , proposée par ton coach », « , modifiée par toi » (séance reçue retouchée), rien pour une séance à soi (lot AF). */
const mentionOrigine = (l: LigneJour & { genre: "prevue" }): string =>
  l.origine === "moi" ? "" : l.modifiePar === "moi" ? `, ${t("planif.modifieeParToi")}` : `, ${t(l.origine === "coach" ? "planif.parCoach" : "planif.parIa")}`;

/** Chiffres des séances déjà lus, gardés d'un montage à l'autre : la sous-ligne ne saute pas au retour sur le jour. */
const chiffresLus = new Map<string, ChiffresSeance>();

/** Chiffres des séances faites d'un jour, relus quand une séance change (durée, séries). */
function useChiffres(lignes: readonly LigneJour[]): ReadonlyMap<string, ChiffresSeance> {
  const { db } = useApp();
  const [, relu] = useState(0);
  const faites = lignes.flatMap((l) => (l.genre === "faite" ? [l.seance] : []));
  const cle = faites.map((x) => `${x.id}:${x.nbSeries}:${x.dureeMin}`).join("|");
  useEffect(() => {
    let vivant = true;
    chiffresSeances(db, cle ? cle.split("|").map((x) => x.split(":")[0]!) : [])
      .then((m) => {
        m.forEach((c, id) => chiffresLus.set(id, c));
        if (vivant) relu((n) => n + 1);
      })
      .catch((e) => console.error(e));
    return () => {
      vivant = false;
    };
  }, [db, cle]);
  return chiffresLus;
}

/** Efforts des séances faites déjà lus, par id : le voile ne clignote pas au retour sur le jour. */
const effortsLus = new Map<string, string | null>();

/** Effort pepfit de chaque séance faite d'un jour (effort-charges.ts), écrit comme dans l'appli (« ~ » pour un estimé). */
function useEfforts(j: string, lignes: readonly LigneJour[]): ReadonlyMap<string, string | null> {
  const { db } = useApp();
  const [, relu] = useState(0);
  const cle = lignes.flatMap((l) => (l.genre === "faite" ? [`${l.seance.id}:${l.seance.dureeMin}`] : [])).join("|");
  useFocusEffect(
    useCallback(() => {
      if (!cle) return;
      let vivant = true;
      const [a, m, d] = j.split("-").map(Number);
      effortsSeancesJour(db, new Date(a!, m! - 1, d!).getTime())
        .then((r) => {
          r.forEach((e, id) => effortsLus.set(id, e ? texteEffort(e.score) : null));
          if (vivant) relu((n) => n + 1);
        })
        .catch((e) => console.error(e));
      return () => {
        vivant = false;
      };
    }, [db, j, cle]),
  );
  return effortsLus;
}

/** Écart toléré après « la journée a changé » (association, sport changé, Annuler) pour surligner ce qui a bougé. */
const FENETRE_CHANGEMENT_MS = 5000;

/**
 * Lignes qui viennent de changer après une activité associée, un sport changé ou « Annuler » (planche activite-detectee,
 * ECARTS n° 7 ; revue finale n° 50) : la séance née d'une activité (même début), la séance dont le titre a changé, l'activité
 * qui revient. Surlignées 1,8 s ; rien d'autre ne l'est (séance ajoutée à la main, changement de jour).
 */
function useLignesChangees(j: string, lignes: readonly LigneJour[], activites: readonly ActiviteVue[]): ReadonlySet<string> {
  const vus = useRef<{ j: string; debuts: Set<number>; seances: Map<string, string>; activites: Set<string> } | null>(null);
  const change = useRef(0);
  const [changees, setChangees] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => surActivitesChangees(() => void (change.current = Date.now())), []);
  const faites = lignes.flatMap((l) => (l.genre === "faite" ? [l.seance] : []));
  const cle = `${j}#${faites.map((x) => `${x.id}:${x.titre}`).join("|")}#${activites.map((a) => a.cle).join("|")}`;
  useEffect(() => {
    const avant = vus.current?.j === j ? vus.current : null;
    if (avant && Date.now() - change.current < FENETRE_CHANGEMENT_MS) {
      const neuves = new Set<string>();
      for (const x of faites) {
        const titre = avant.seances.get(x.id);
        if (titre === undefined ? avant.debuts.has(x.debut) : titre !== x.titre) neuves.add(cleLigne({ genre: "faite", seance: x }));
      }
      for (const a of activites) if (!avant.activites.has(a.cle)) neuves.add(a.cle);
      if (neuves.size) setChangees(neuves);
    }
    vus.current = {
      j,
      debuts: new Set([...(avant?.debuts ?? []), ...activites.map((a) => a.debut)]),
      seances: new Map(faites.map((x) => [x.id, x.titre])),
      activites: new Set(activites.map((a) => a.cle)),
    };
    // `cle` résume les séances et activités du jour : l'effet ne tourne que quand elles changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  useEffect(() => {
    if (!changees.size) return;
    const m = setTimeout(() => setChangees(new Set()), SURLIGNE_MS);
    return () => clearTimeout(m);
  }, [changees]);
  return changees;
}

/** Jour sans séance : cadre pointillé « Planifier une séance » (« Ajouter une séance » aujourd'hui et à venir). */
export function CadreProgrammer({ onPress, ajouter = false }: { onPress: () => void; ajouter?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.vide, { borderColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s2 }]}
    >
      <Icone nom="plus" couleur={couleurs.t2} taille={18} />
      <Texte variante="corps" couleur="t2" style={{ fontFamily: police.medium, fontSize: 14 }}>
        {t(ajouter ? "planif.ajouterSeance" : "planif.programmerSeance")}
      </Texte>
    </Appui>
  );
}

/**
 * Séances d'un jour : lignes (balayables), puis le cadre « Programmer une séance » s'il n'y en a aucune (ou `toujours`). Une
 * séance supprimée se désintègre (planche suppression-animee, comme les routines) : la liste est un ListeDesintegrable, l'écart
 * entre les lignes est dans chaque ligne pour se replier avec elle (29/10 au soir : elle se repliait sans grains).
 */
export function ListeJour({
  p,
  j,
  onMenu,
  onBalayer,
  onProgrammer,
  onAppuiLong,
  onFinAppui,
  cachee,
  cadreToujours = false,
  sansCadre = false,
  rienDePrevu = false,
  pictoDe,
  agendaDe,
  effort,
}: {
  p: Planning;
  j: string;
  /** ⋯ d'une séance faite. */
  onMenu: (l: LigneJour) => void;
  onBalayer: (l: LigneJour) => void;
  onProgrammer: () => void;
  onAppuiLong?: (l: LigneJour & { genre: "prevue" }, x: number, y: number, ligne: { y: number; h: number }) => void;
  onFinAppui?: () => void;
  /** Ligne soulevée (glisser-déposer) : sa place reste en pointillé. */
  cachee?: string | null;
  cadreToujours?: boolean;
  /** Jamais de cadre « Programmer une séance » (la page a déjà ce bouton en bas). */
  sansCadre?: boolean;
  /** Aujourd'hui ou à venir (31/10) : sans aucune séance, « Rien de prévu » au-dessus du cadre, qui devient
   *  « Ajouter une séance ». */
  rienDePrevu?: boolean;
  /** Picto d'une ligne (sport ou premier exercice de sa routine). */
  pictoDe?: (l: LigneJour) => string | null;
  /** Agenda du téléphone : conflit ou mention sous une séance prévue (useAgenda). */
  agendaDe?: (l: LigneJour) => AgendaLigne | undefined;
  /** Page Effort (planche Effort v2.2) : la ligne Sommeil en tête et les récupérations parmi les séances, en rose Corps. Sans
   *  ceci (la page du mois), la liste ne montre que les séances et les activités détectées. */
  effort?: ActionsEffortListe;
}) {
  const { couleurs, mode } = useTheme();
  const { db } = useApp();
  const lignes = lignesDuJour(p, j);
  // Activités détectées du jour (planche activite-detectee) : à leur heure, parmi les séances faites.
  const activites = useActivitesJour(j, p.aujourdhui);
  // Sommeil et récupérations (D5) : la nuit qui finit ce jour, les sessions qui y commencent.
  const page = usePageEffort(j, effort?.sommeilAffiche ?? false, effort != null);
  const etatNuit = etatSommeil({ jour: j, aujourdhui: page.aujourdhui, nuit: page.nuit, synchro: page.synchro });
  const sommeil = effort && sommeilMontre(effort.sommeilAffiche, etatNuit) && etatNuit !== "aucune" ? etatNuit : null;
  const elements = fusionnerParHeure<LigneJour, ActiviteVue | ElementRecup>(lignes, [...activites, ...page.recups], (l) => (l.genre === "faite" ? l.seance.debut : null));
  const chiffres = useChiffres(lignes);
  const efforts = useEfforts(j, lignes);
  const changees = useLignesChangees(j, lignes, activites);
  // Halo de la séance du jour (planche) : anneau orange pâle de 4 et lueur douce décalée vers le bas, de l'orange du Sport.
  const o = couleurs.partieEntrainement;
  const halo = { boxShadow: `0px 0px 0px 4px ${avecOpacite(o, mode === "nuit" ? 0.16 : 0.14)}, 0px 12px 28px -12px ${avecOpacite(o, 0.5)}` };
  // La séance du jour, encadrée d'orange : la première séance à venir d'aujourd'hui.
  const premiere = j === p.aujourdhui ? lignes.find((l) => l.genre === "prevue" && !l.manquee) : undefined;
  // Un jour qui n'a que des récupérations n'a pas de séance : son cadre « Ajouter une séance » reste sous elles.
  const sansSeance = lignes.length === 0 && activites.length === 0 && page.recups.length > 0;
  const toujours = !sansCadre && (cadreToujours || sansSeance);
  const cadre = <CadreProgrammer onPress={onProgrammer} ajouter={rienDePrevu} />;
  // Rien du tout ce jour-là : la phrase, discrète, puis le cadre.
  const phrase = rienDePrevu ? (
    <Texte variante="corps" couleur="t2" style={styles.rien}>
      {t("planif.rienDePrevu")}
    </Texte>
  ) : null;
  const rien = phrase ? (
    <View>
      {phrase}
      {cadre}
    </View>
  ) : (
    cadre
  );
  return (
    <View>
      {/* Page Activité : le titre de section de la liste du jour (09/11), au-dessus de la ligne Sommeil et des séances. */}
      {effort ? (
        <Texte variante="entete" couleur="t2" accessibilityRole="header" style={styles.titreListe}>
          {t("effortJour.activites")}
        </Texte>
      ) : null}
      {/* Tête de liste, avant toute activité ; elle n'est ni balayable ni désintégrable : « Masquer » est dans son ⋯. */}
      {effort && sommeil ? (
        <View style={styles.ecart}>
          <LigneSommeil etat={sommeil} nuit={page.nuit ?? null} part={page.part} onOuvrir={() => effort.onOuvrirSommeil(j)} onMenu={() => page.nuit && effort.onMenuSommeil(page.nuit)} />
        </View>
      ) : null}
      <ListeDesintegrable
        liste={elements}
        cleDe={cleLigne}
        // Sans cadre dessous, l'écart de la dernière ligne est repris : la page garde sa mise en place d'avant.
        autour={(e) => <View style={toujours ? null : { marginBottom: -espace.s }}>{e}</View>}
        // Plus aucune séance (la dernière a fini de se désintégrer) : le cadre « Programmer une séance ».
        // Un jour à venir a son cadre sous la liste (`toujours`) : ici, la phrase seule.
        vide={!sansCadre ? (cadreToujours ? phrase : rien) : null}
        rendu={(l, etat) => {
          if ("recupId" in l) {
            // Une récupération (D5) : ni point ni série, ni score ; glissée, elle se supprime (bulle « Annuler »).
            return (
              <GlisserSupprimer
                actif={etat !== "sort"}
                cle={cleLigne(l)}
                fondContenu="transparent"
                style={[styles.ecart, { borderRadius: rayon.l }]}
                onSupprimer={() => effort?.onSupprimerRecup(l)}
              >
                <LigneRecup e={l} onMenu={() => effort?.onMenuRecup(l)} />
              </GlisserSupprimer>
            );
          }
          if ("cle" in l) {
            // Ignorer : glissé tonal (rien n'est détruit), « Annuler » dans la bulle de l'écran
            return (
              <GlisserSupprimer
                actif={etat !== "sort"}
                cle={l.cle}
                fondContenu="transparent"
                action={{ libelle: t("activite.ignorer"), icone: "oeilBarre" }}
                style={[styles.ecart, { borderRadius: rayon.l }]}
                onSupprimer={() => ignorer(db, l.cle).catch(signalerErreur())}
              >
                <View>
                  <LigneActivite a={l} />
                  {changees.has(l.cle) ? <Surligne couleur={couleurs.partieEntrainement} /> : null}
                </View>
              </GlisserSupprimer>
            );
          }
          const cle = cleLigne(l);
          if (cachee === cle) return <View style={[styles.trou, styles.ecart, { borderColor: couleurs.line2 }]} />;
          // Une séance qui sort se désintègre : plus de geste ni de toucher.
          const vive = etat !== "sort";
          return (
            <GlisserSupprimer
              actif={vive}
              cle={cle}
              fondContenu="transparent"
              style={[styles.ecart, { borderRadius: rayon.l }, l === premiere && halo]}
              choix={demandeChoix(l)}
              onSupprimer={() => onBalayer(l)}
            >
              <LigneSeance
                l={l}
                picto={pictoDe?.(l)}
                duJour={l === premiere}
                onMenu={() => onMenu(l)}
                onAppuiLong={vive && l.genre === "prevue" && !l.manquee && onAppuiLong ? (x, y, r) => onAppuiLong(l, x, y, r) : undefined}
                onFinAppui={onFinAppui}
                chiffres={l.genre === "faite" ? chiffres.get(l.seance.id) : undefined}
                surlignee={changees.has(cle)}
                effort={l.genre === "faite" ? efforts.get(l.seance.id) : undefined}
                agenda={vive ? agendaDe?.(l) : undefined}
              />
            </GlisserSupprimer>
          );
        }}
      />
      {toujours ? cadre : null}
    </View>
  );
}

export { cleLigne };

/** « aujourd'hui », « demain », le nom du jour à moins d'une semaine, sinon jj/mm (NOTES § Étiquette des cartes). */
export function texteQuand(date: string, aujourdhui: string): string {
  const q = quand(date, aujourdhui);
  if (q.genre === "jour") return jourLong(midi(date));
  // Au-delà de six jours : « 3 nov. » / « Nov 3 », dans l'ordre de la langue (« 03/11 » se lisait 11 mars en anglais).
  if (q.genre === "date") return jourMois(midi(date));
  return t(q.genre === "aujourdhui" ? "planif.aujourdhuiMin" : "planif.demain");
}

/** Jour touché dans la page du mois : la bande semaine d'Entraînements y revient. */
export const retourMois: { jour: string | null } = { jour: null };

/** Semaine précédente / suivante d'un lundi. */
export const semaineVoisine = (lundi: string, sens: 1 | -1) => ajouterJ(lundi, 7 * sens);

const styles = StyleSheet.create({
  titreJour: { flexDirection: "row", alignItems: "baseline", gap: espace.s, paddingHorizontal: espace.xl, paddingTop: espace.l, paddingBottom: espace.m },
  pic: { width: 44, height: 44 },
  tuilePic: { width: 44, height: 44, borderRadius: rayon.l, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  imagePic: { width: 44, height: 44 },
  // Voile du picto (S9, A) : brun très foncé à 60 % (jeton --voile-pic de la planche), le même la nuit et le jour.
  voile: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(28,13,2,0.6)", alignItems: "center", justifyContent: "center", },
  voileTexte: { color: "#ffffff", fontFamily: police.semibold, fontSize: 15, letterSpacing: -0.3, fontVariant: ["tabular-nums"], textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  // Coche : un disque plein du vert du contour (aucun halo), centré sur le coin ; il se fond dans le trait au lieu de le couper.
  casePic: { position: "absolute", right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  titreLigne: { flexDirection: "row", alignItems: "center", gap: espace.s },
  etiquette: { height: 20, paddingHorizontal: 6, borderRadius: 6, justifyContent: "center" },
  // Sous-lignes de l'agenda, alignées sur le texte (picto 44 + écart 12) ; le conflit tient 44 de haut (cible tactile).
  conflit: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, marginLeft: 50, marginRight: -espace.s, marginBottom: -6, paddingLeft: 6, paddingRight: espace.xs, borderRadius: rayon.m },
  mention: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28, marginTop: espace.xs, marginLeft: 56 },
  vide: {
    height: 56,
    borderRadius: rayon.l,
    borderWidth: 1,
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espace.s,
  },
  rien: { textAlign: "center", fontSize: 14, paddingTop: espace.s, paddingBottom: espace.m },
  trou: { height: 64, borderRadius: rayon.l, borderWidth: 1, borderStyle: "dashed" },
  // Écart sous chaque ligne de séance (dans la ligne : il se replie avec elle quand elle se désintègre).
  ecart: { marginBottom: espace.s },
  titreListe: { paddingTop: espace.xs, paddingBottom: espace.s },
});
