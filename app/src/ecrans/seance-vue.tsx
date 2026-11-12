// Vue d'une séance (en cours ou passée) : blocs, exercices et lignes de série. E1 : toute série reste modifiable.
import { createContext, memo, useContext, useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type ViewInstance } from "react-native";
import { router } from "expo-router";
import { INFO_NATURE, type ChampSerie, type ExerciceDeSeance, type SeanceDetail, type SerieDetail, type TypeNote, type TypeSerie } from "../db";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { NotesExercice } from "./Notes";
import { RepereBlessure, useReperes } from "./RepereBlessure";
import { tempoDe, tempoTexte } from "./tempo";
import { Icone } from "../ui/Icone";
import { Picto } from "../ui/Picto";
import { Pastille, BoutonIcone } from "../ui/Cadre";
import { BoutonAjouterSerie, EnteteSeries, LigneSerie, type Cellule } from "../ui/LigneSerie";
import { ListeDesintegrable } from "../ui/Desintegration";
import { Texte } from "../ui/Texte";
import { t } from "../i18n/index";
import { useApp } from "./contexte";
import { charge, dureeRepos, libelleSuperset, nombre, plageTexte, serieNatureTexte, tempsTexte, unRmTexte, versUnite, type Unite } from "./format";
import { ecartCible } from "./chrono-serie";
import { noteDecouverte, POURQUOI_LEGER, materielDe, type MotEffort } from "../boutique/poids";
import { lireActif } from "../i18n/index";
import { ligneEssai, ligneProposition, motSousReps } from "./effort-seance";
import { ordreCase } from "./clavier-seance";
import { LETTRE } from "./ordre-seance";
import { clavierSeance } from "./clavier-seance";
import { deplacerBloc, deplacerExercice, idPied, idTete, poserAvant, rangeesDe, rangeesSeries, type LigneDispo } from "./glisser";
import { CadreSuperset, ContexteDefilement, RangeeGlissable, useGlisser, type Glisse } from "../ui/Glisser";
import { LigneEffortVue, NoteSeance, QuestionEffort } from "./EffortSeance";
import { activeDeCarte, memeCarte } from "./seance-rendu";
import { enAffichage, horsCharges, infoCharge, libellePuce, paliersAffiches } from "./charge-seance";
import type { ChargesExercice } from "../db/depots/materiel";
import { BarrePicto } from "../ui/DessinBarre";
import { EtiquettePerso } from "../ui/EtiquettePerso";
import { PastilleVise } from "./FeuilleVise";

export { LETTRE };

export const couleurTypeSerie = (type: TypeSerie, c: { echauffement: string; rate: string; degressive: string }): string | undefined =>
  type === "echauffement" ? c.echauffement : type === "rate" ? c.rate : type === "degressive" ? c.degressive : undefined;

/** En-tête de colonne et libellé d'accessibilité : le nom de la colonne suit la langue (la base garde le français). */
function nomColonne(c: { champ: ChampSerie; etiquette: string }, u: Unite): string {
  if (c.champ === "reps") return t("seance.vue.colReps");
  if (c.champ === "duree_s") return t("seance.vue.colTemps");
  return c.champ === "kg" ? c.etiquette.replace("kg", u) : c.etiquette;
}

/** Colonnes de saisie de l'exercice, selon sa nature (D7). */
export const colonnesDe = (e: ExerciceDeSeance) => INFO_NATURE[e.exercice.nature].colonnes;

export interface Actions {
  onChamp: (serie: SerieDetail, champ: ChampSerie, v: string, u: Unite) => void;
  /** Saisie en cours (clavier de séance) : écrite telle quelle, sans recalcul ni relecture de la séance. */
  onBrouillon?: (serie: SerieDetail, champ: ChampSerie, v: string, u: Unite) => void;
  /** Chrono arrêté : le temps réel et la cible du compte à rebours (D16, D1 A) ; coche la série et lance le repos. */
  onChrono?: (serie: SerieDetail, secondes: number, cibleS: number | null) => void;
  /** Paliers de l'appareil de la salle, par exercice (D14) ; null : + et − par 2,5 kg. */
  paliers?: Record<string, number[] | null>;
  /** Matériel du lieu par exercice (planche materiel, séance) : avis de la charge la plus proche, barre à charger. */
  charges?: Record<string, ChargesExercice | null>;
  /** Nom du lieu de la séance, pour l'avis (« Haltères de Maison »). */
  lieu?: string;
  /** Pastille « Barre 20 kg » : la feuille du choix de la barre. */
  onBarre?: (e: ExerciceDeSeance) => void;
  /** Pastille « Visé : Dur » (planche exercices-perso) : le ressenti visé, pour cette séance seulement. */
  onVise?: (e: ExerciceDeSeance) => void;
  onToggle?: (serie: SerieDetail) => void;
  onNumero: (serie: SerieDetail, e: ExerciceDeSeance) => void;
  onMenu: (e: ExerciceDeSeance) => void;
  onRepos?: (e: ExerciceDeSeance) => void;
  onAjouterSerie: (e: ExerciceDeSeance) => void;
  /** Glisser-déposer des exercices (ordre, superset, repos : `deplacerExercice` / `deplacerBloc`) ; absent : pas de geste. */
  onDisposer?: (lignes: LigneDispo[]) => Promise<unknown>;
  /** Glisser-déposer des séries d'un exercice : leurs ids dans le nouvel ordre. */
  onOrdreSeries?: (e: ExerciceDeSeance, ids: string[]) => Promise<unknown>;
  /** Même suppression que « Supprimer la série » de la feuille Type de série. */
  onSupprimerSerie: (serie: SerieDetail) => void;
  onUnite: (e: ExerciceDeSeance) => void;
  onAjouterNote: (e: ExerciceDeSeance, type: TypeNote, texte: string) => Promise<unknown>;
  onModifierNote: (e: ExerciceDeSeance, id: string, texte: string | null) => Promise<unknown>;
  onTypeNote: (e: ExerciceDeSeance, id: string, vers: TypeNote) => Promise<unknown>;
  /** Séries validées qui battent un record (médaille). */
  records?: Set<string>;
  /** Série en alerte (valeur inhabituelle) et champ fautif. */
  alerte?: { serieId: string; champ: ChampSerie } | null;
  /** « Modifier la série » : champ à reprendre. */
  focus?: { serieId: string; champ: ChampSerie; n: number } | null;
  /** Question « C'était comment ? » ouverte sous une série cochée (planche programmes-charges), et sa réponse. */
  effort?: { ouverte: string | null; onChoisir: (x: SerieDetail, e: ExerciceDeSeance, mot: MotEffort) => void };
}

/** « remplace X · occupé » sous le nom du nouvel exercice, « remplacé par Y » sous l'ancien (t3, 12 px, sans vibration). */
export function TraceRemplacement({ e, marge }: { e: ExerciceDeSeance; marge: number }) {
  const { couleurs } = useTheme();
  if (!e.remplace && !e.remplacePar) return null;
  const texte = e.remplacePar
    ? t("seance.vue.remplacePar", { nom: e.remplacePar.nom })
    : `${t("seance.vue.remplace", { nom: e.remplace!.nom })}${e.remplace!.raison ? `, ${e.remplace!.raison === "occupe" ? t("seance.vue.occupe") : t("seance.vue.manquant")}` : ""}`;
  return (
    <View style={[styles.trace, { paddingLeft: marge }]}>
      <Icone nom="repeat" couleur={couleurs.t3} taille={14} />
      <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ flexShrink: 1 }}>
        {texte}
      </Texte>
    </View>
  );
}

/** Ligne d'une série, la même dans la liste de la séance et dans le plein écran (planche idee-plein-ecran). */
export function LigneDeSerie({
  x,
  e,
  unite: u,
  activeId,
  actions,
  enCours,
  pleinEcran = false,
  appui,
  glisseLibre,
}: {
  x: SerieDetail;
  e: ExerciceDeSeance;
  unite: Unite;
  activeId: string | null;
  actions: Actions;
  enCours: boolean;
  /** Plein écran : pas de ▶ dans la ligne, le grand bouton s'en charge. */
  pleinEcran?: boolean;
  /** Glisser-déposer de la série (appui long sur le numéro) et garde de la suppression au glissé : voir LigneSerie. */
  appui?: object;
  glisseLibre?: () => boolean;
}) {
  const { couleurs } = useTheme();
  const { reglages } = useApp();
  const colonnes = colonnesDe(e);
  // Numéro d'une série : son rang parmi les séries normales affichées (une série qui sort garde le sien, les suivantes
  // prennent tout de suite leur nouveau numéro). Calculé, pas compté au rendu : la liste se redessine aussi seule (fin
  // d'une désintégration), un compteur y repartait d'où il s'était arrêté.
  const normales = e.series.filter((y) => !LETTRE[y.type]);
  const i = normales.findIndex((y) => y.id === x.id);
  const n = i >= 0 ? i + 1 : normales.filter((y) => y.position < x.position).length + 1;
  const lettre = LETTRE[x.type];
  const precedent =
    x.precedent_kg != null || x.precedent_reps != null || x.precedent_duree_s != null || x.precedent_distance_m != null
      ? serieNatureTexte(colonnes.map((c) => c.champ), { kg: x.precedent_kg, reps: x.precedent_reps, duree_s: x.precedent_duree_s, distance_m: x.precedent_distance_m }, u)
      : "–";
  // Seconde ligne : « hors palier » (D14, discret), sinon 1RM si le réglage est allumé. La charge effective (D8) reste dans
  // la fiche de l'exercice : sous le précédent, elle se lisait comme le poids de la série d'avant.
  const paliers = actions.paliers?.[e.exercice.id];
  const note = (() => {
    if (horsCharges(paliers, x.kg, u)) return t("seance.vue.horsPalier");
    // Étape d'une course de programme (D3) : sa zone visée.
    if (x.zone) return t("seance.vue.zone", { n: x.zone });
    const info = INFO_NATURE[e.exercice.nature];
    if (info.poidsCorps) return undefined;
    return reglages.unRmSeance && info.colonnes.some((c) => c.champ === "kg") && info.colonnes.some((c) => c.champ === "reps") ? unRmTexte(x.kg, x.reps, u) || undefined : undefined;
  })();
  return (
    <LigneSerie
      numero={lettre ?? String(n)}
      couleurNumero={couleurTypeSerie(x.type, couleurs)}
      precedent={precedent}
      note={note}
      cellules={colonnes.map((c, k): Cellule => {
        // Matériel du lieu : la case de charge rapproche, le clavier dessine la barre (aussi depuis la case des répétitions).
        const ic = infoCharge(actions.charges?.[e.exercice.id], {
          equipement: e.exercice.equipement, lieu: actions.lieu ?? "", serie: x.id, faite: !!x.faite, kgSerie: x.kg != null ? enAffichage(x.kg, u) : null, unite: u,
        });
        const base = {
          id: `${x.id}-${c.champ}`,
          champ: c.champ,
          onFin: (v: string) => actions.onChamp(x, c.champ, v, u),
          onBrouillon: actions.onBrouillon ? (v: string) => actions.onBrouillon!(x, c.champ, v, u) : undefined,
          ordre: ordreCase(x.position, k),
        };
        if (c.champ === "kg") {
          return { ...base, libelle: t("seance.vue.chargeSerie", { unite: c.etiquette, numero: lettre ?? n }), valeur: charge(x.kg, u), paliers: { liste: paliers?.length ? paliersAffiches(paliers, u) : null, unite: u }, charge: ic };
        }
        if (c.champ === "reps") {
          return {
            ...base,
            libelle: t("seance.vue.repsSerie", { numero: lettre ?? n }),
            valeur: x.reps != null ? String(x.reps) : "",
            indication: plageTexte(x.plage_min, x.plage_max) ?? undefined,
            ecart: reglages.demanderEffort || e.effort || e.rirVise != null ? motSousReps(x) : undefined,
            charge: ic,
          };
        }
        if (c.champ === "distance_m") return { ...base, libelle: t("seance.vue.distanceSerie", { numero: lettre ?? n }), valeur: x.distance_m != null ? String(x.distance_m) : "" };
        return {
          ...base,
          libelle: t("seance.vue.tempsSerie", { numero: lettre ?? n }),
          valeur: tempsTexte(x.duree_s),
          chrono: enCours && actions.onChrono ? { serieId: x.id, cibleS: x.duree_s, onArret: (s, cibleS) => actions.onChrono!(x, s, cibleS) } : undefined,
          ecart: x.faite ? ecartCible(x.duree_s, x.duree_cible_s) : undefined,
        };
      })}
      etat={x.faite ? "faite" : x.id === activeId ? "encours" : "afaire"}
      onToggle={actions.onToggle ? () => actions.onToggle!(x) : undefined}
      onNumero={() => actions.onNumero(x, e)}
      onSupprimer={() => actions.onSupprimerSerie(x)}
      record={actions.records?.has(x.id)}
      alerte={actions.alerte?.serieId === x.id ? actions.alerte.champ : null}
      focus={actions.focus?.serieId === x.id ? actions.focus : null}
      pleinEcran={pleinEcran}
      appui={appui}
      glisseLibre={glisseLibre}
    />
  );
}

/** Les vues des exercices affichés, par id : l'écran de séance les mesure pour la reprise (reprise-seance.ts). Absent ailleurs. */
export const ContexteReperes = createContext<Map<string, ViewInstance> | null>(null);

export function VueSeance({
  seance,
  unites,
  activeId,
  actions,
  nouveaux = true,
  margeBas = 0,
}: {
  seance: SeanceDetail;
  unites: Record<string, Unite>;
  activeId: string | null;
  actions: Actions;
  /** Faux : les blocs qui s'ajoutent entrent sans animation (fin de l'ouverture de la séance). */
  nouveaux?: boolean;
  /** Hauteur couverte en bas de la liste (barre posée dessus) : le défilement automatique du glisser part au-dessus. */
  margeBas?: number;
}) {
  const { couleurs } = useTheme();
  const { reglages } = useApp();
  const enCours = seance.seance.fin == null;
  // D7 (sante-suivi) : les blessures en cours touchées par chaque exercice, en séance seulement.
  const reperes = useReperes(enCours ? seance.exercices.map((e) => e.exercice.id) : []);
  // Glisser-déposer (même geste que l'éditeur de routine) : dans une liste qui pose son défilement, si l'écran sait écrire.
  const ordonnable = useContext(ContexteDefilement) != null && !!actions.onDisposer;
  const affiches = seance.blocs.flatMap((b) => b.exercices);
  const glisser = useGlisser({
    rangees: rangeesDe(affiches.map((e) => ({ id: e.exercice.id, groupe: e.groupeSuperset }))),
    margeBas,
    onDebut: () => clavierSeance.quitter(),
    onDeposer: (d) => {
      const avant: LigneDispo[] = affiches.map((e) => ({ id: e.exercice.id, groupe: e.groupeSuperset, repos: e.reposS }));
      const dispo = d.mode === "bloc" ? deplacerBloc(avant, d.de, d.vers) : deplacerExercice(avant, d.id, d.avant, d.groupe, reglages.reposDefautS);
      return actions.onDisposer?.(dispo) ?? Promise.resolve();
    },
  });
  const glisse: Glisse = { ctl: glisser.ctl, phase: glisser.phase, tenu: glisser.tenu, dedans: glisser.dedans };
  // Pendant le glisser d'un exercice, les cartes se replient (tête seule), comme les cartes dépliées de l'éditeur de routine.
  const replie = glisser.phase !== "repos";
  // Exercice dont une série est tenue : sa carte passe devant les suivantes.
  const [serieTenue, setSerieTenue] = useState<string | null>(null);
  // Le bloc (ou l'exercice) tenu passe devant ses voisins : le zIndex va sur l'enveloppe, enfant direct de la liste.
  const devant = (g: number | null, l: readonly ExerciceDeSeance[]) => {
    const x = glisser.tenu;
    return (x != null && ((g != null && x.groupe === g) || l.some((y) => x.ids.includes(y.exercice.id)))) || l.some((y) => y.exercice.id === serieTenue);
  };
  // Trait rose d'un exercice tenu au-dessus d'un superset : à l'aplomb de celui du superset.
  const trait = { borderLeftWidth: 2, borderLeftColor: couleurs.superset, marginLeft: -espace.l + 6, paddingLeft: espace.l - 8 };

  const reperesVues = useContext(ContexteReperes);
  const exercice = (e: ExerciceDeSeance, dansSuperset: boolean) => (
    <View
      collapsable={false}
      ref={(v) => {
        if (!reperesVues) return;
        if (v) reperesVues.set(e.exercice.id, v);
        else reperesVues.delete(e.exercice.id);
      }}
    >
    <RangeeGlissable
      rangee={{ id: e.exercice.id, type: dansSuperset ? "membre" : "seul", groupe: e.groupeSuperset }}
      glisse={glisse}
      appuiLong={ordonnable}
      dansSuperset={replie && dansSuperset}
      trait={trait}
      zoneAppui
    >
      {(_poignee, appui) => (
        <CarteExercice
          e={e}
          dansSuperset={dansSuperset}
          unite={unites[e.exercice.id] ?? "kg"}
          // La série active seulement pour sa carte : quand elle passe à la suivante, deux cartes se redessinent, pas toutes.
          activeId={activeDeCarte(e.series, activeId)}
          actions={actions}
          enCours={enCours}
          blessures={enCours ? reperes(e.exercice.id) : null}
          appui={appui}
          replie={replie}
          ordonnable={ordonnable && !!actions.onOrdreSeries}
          recent={glisser.ctl.recent}
          margeBas={margeBas}
          onSerieTenue={(oui) => setSerieTenue((x) => (oui ? e.exercice.id : x === e.exercice.id ? null : x))}
        />
      )}
    </RangeeGlissable>
    </View>
  );

  // Séries et exercices retirés : désintégration, les voisins remontent en continu ; ajoutés : leur place s'ouvre, puis
  // fondu. Rien à l'ouverture de l'écran. Blocs indexés par leur premier exercice : retirer un exercice ne fait pas
  // « changer » les blocs suivants.
  // Note de séance (programme) : la consigne d'effort, et pourquoi partir léger s'il y a un exercice à découvrir.
  const decouverte = enCours && seance.exercices.some((e) => e.effort?.decouverte);
  const note = [
    ...(seance.routineNote ?? "").split("\n").filter((l) => l.trim()).map((texte) => ({ icone: "page" as const, texte })),
    ...(decouverte ? [{ icone: "info" as const, texte: POURQUOI_LEGER[lireActif().langue] }] : []),
  ];
  return (
    <>
      <NoteSeance lignes={note} />
      <ListeDesintegrable
        liste={seance.blocs}
        cleDe={(b) => (b.groupeSuperset != null ? `g${b.groupeSuperset}` : b.exercices[0]!.exercice.id)}
        nouveaux={nouveaux}
        enveloppe={(b) => ({ style: devant(b.groupeSuperset, b.exercices) && { zIndex: 10 } })}
        rendu={(b) => {
          if (b.exercices.length === 1 && b.groupeSuperset == null) return exercice(b.exercices[0]!, false);
          const g = b.groupeSuperset!;
          const tours = Math.max(...b.exercices.map((e) => e.series.length));
          const faits = Math.min(...b.exercices.map((e) => e.series.filter((x) => x.faite).length));
          const dernier = b.exercices[b.exercices.length - 1]!;
          return (
            <CadreSuperset groupe={g} glisse={glisse}>
              {/* Trait du superset : d'un bloc au repos ; pendant un glisser, porté par chaque rangée (il suit leurs écarts). */}
              {replie ? null : <View style={[styles.trait, { backgroundColor: couleurs.superset }]} />}
              <RangeeGlissable rangee={{ id: idTete(g), type: "tete", groupe: g }} glisse={glisse} appuiLong={ordonnable} dansSuperset={replie} trait={trait} zoneAppui>
                {(_poignee, appui) => (
                  <View style={styles.teteSuperset} {...appui}>
                    <Texte variante="exercice" style={{ color: couleurs.superset, fontSize: 14 }}>
                      {libelleSuperset(b.exercices.length)}
                    </Texte>
                    <Texte variante="corps" couleur="t2" style={{ flex: 1, fontVariant: ["tabular-nums"] }}>
                      {t("seance.vue.tour", { n: Math.min(faits + 1, tours), total: tours })}
                    </Texte>
                    {actions.onRepos ? (
                      <Pastille
                        libelle={t("seance.vue.repos", { duree: b.reposTransitionS > 0 ? `${dureeRepos(b.reposTransitionS)}, ${dureeRepos(b.reposS)}` : dureeRepos(b.reposS) })}
                        onPress={() => actions.onRepos!(dernier)}
                      />
                    ) : null}
                  </View>
                )}
              </RangeeGlissable>
              <ListeDesintegrable
                liste={b.exercices}
                cleDe={(e) => e.exercice.id}
                nouveaux
                enveloppe={(e) => ({ style: devant(null, [e]) && { zIndex: 10 } })}
                rendu={(e) => exercice(e, true)}
              />
              {/* Pied du superset (rangée du glisser : poser un exercice en dernier du superset), sans rien à voir. */}
              <RangeeGlissable rangee={{ id: idPied(g), type: "pied", groupe: g }} glisse={glisse} appuiLong={false} dansSuperset={replie} trait={trait}>
                {() => <View style={styles.pied} />}
              </RangeeGlissable>
            </CadreSuperset>
          );
        }}
      />
    </>
  );
}

/**
 * Carte d'un exercice de la séance : tête (appui long : glisser l'exercice), notes, séries (appui long sur le numéro : glisser
 * la série). Mémoïsée (audit M5, M6) : une coche ne redessine que la carte de la série, et celle de la série suivante.
 */
const CarteExercice = memo(CarteExerciceBrute, memeCarte);

function CarteExerciceBrute({
  e,
  dansSuperset,
  unite: u,
  activeId,
  actions,
  enCours,
  blessures,
  appui,
  replie,
  ordonnable,
  recent,
  margeBas,
  onSerieTenue,
}: {
  e: ExerciceDeSeance;
  dansSuperset: boolean;
  unite: Unite;
  activeId: string | null;
  actions: Actions;
  enCours: boolean;
  blessures: ReturnType<ReturnType<typeof useReperes>> | null;
  appui: object;
  replie: boolean;
  ordonnable: boolean;
  /** Vrai juste après un glisser d'exercice : le toucher qui l'a lâché n'ouvre rien. */
  recent: () => boolean;
  margeBas: number;
  onSerieTenue: (oui: boolean) => void;
}) {
  const { couleurs } = useTheme();
  const colonnes = colonnesDe(e);
  const ids = e.series.map((x) => x.id);
  const gs = useGlisser({
    rangees: rangeesSeries(ids),
    margeBas,
    onDebut: () => clavierSeance.quitter(),
    onDeposer: (d) => (d.mode === "exercice" ? (actions.onOrdreSeries?.(e, poserAvant(ids, d.id, d.avant)) ?? Promise.resolve()) : Promise.resolve()),
  });
  const glisseSeries: Glisse = { ctl: gs.ctl, phase: gs.phase, tenu: gs.tenu, dedans: false };
  const tenue = gs.tenu != null;
  useEffect(() => onSerieTenue(tenue), [tenue]); // eslint-disable-line react-hooks/exhaustive-deps
  // Le toucher qui lâche une série (ou un exercice) n'ouvre ni la feuille du numéro, ni la progression.
  const occupe = () => recent() || gs.ctl.recent();
  const actionsSerie: Actions = { ...actions, onNumero: (x, ex) => !occupe() && actions.onNumero(x, ex) };
  // Une fois par rendu de la carte, pas une fois par série.
  const essai = enCours ? ligneEssai(e.effort, e.series, e.exercice.equipement, u, actions.paliers?.[e.exercice.id]) : null;
  const proposition = enCours ? ligneProposition(e.effort, e.series, u) : null;
  const barre = enCours ? actions.charges?.[e.exercice.id]?.barre : undefined;
  return (
    <View style={[styles.exercice, { borderBottomColor: couleurs.line }]}>
      <View style={styles.teteExercice} {...appui}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("seance.passee.voirProgression", { nom: e.exercice.nom })}
          onPress={() => !occupe() && router.push({ pathname: "/progress/[id]", params: { id: e.exercice.id } })}
          style={styles.nomExercice}
        >
          <Picto slug={e.exercice.slug} nom={e.exercice.nom} photo={e.exercice.photo_vignette} taille={36} />
          <Texte variante="titreBarre" numberOfLines={2} style={{ flexShrink: 1 }}>
            {e.exercice.nom}
          </Texte>
          {e.exercice.perso ? <EtiquettePerso coach={e.exercice.coach} /> : null}
        </Pressable>
        <BoutonIcone nom="more" libelle={t("seance.vue.options", { nom: e.exercice.nom })} onPress={() => actions.onMenu(e)} />
      </View>
      {/* Replié pendant le glisser d'un exercice : le corps reste monté (saisies, chronos), il ne prend plus de place. */}
      <View style={replie && styles.cache}>
        {blessures ? <RepereBlessure blessures={blessures} marge={46} /> : null}
        <TraceRemplacement e={e} marge={46} />
        {tempoDe(e.tempo, e.exercice) ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: -espace.xs, paddingLeft: 46 }}>
            {t("seance.vue.tempo", { tempo: tempoTexte(tempoDe(e.tempo, e.exercice)!) })}
          </Texte>
        ) : null}
        <NotesExercice
          types={e.ligneRoutineId ? ["exercice", "routine", "seance"] : ["exercice", "seance"]}
          defaut="seance"
          notes={[...e.notesExercice, ...e.notesRoutine, ...e.notes]}
          precedente={e.notePrecedente}
          pastilles={
            <>
              {!dansSuperset && actions.onRepos ? <Pastille libelle={t("seance.vue.repos", { duree: dureeRepos(e.reposS) })} onPress={() => actions.onRepos!(e)} /> : null}
              {/* Le ressenti visé de la ligne de routine, changeable ici pour cette séance seulement ; sans ressenti dans la
                  routine, pas de pastille (il se règle dans la routine). */}
              {actions.onVise && (e.rirVise != null || e.rirRoutine != null) ? (
                <PastilleVise rir={e.rirVise} onPress={() => actions.onVise!(e)} />
              ) : null}
              {barre && actions.onBarre ? (
                <Pastille visuel={<BarrePicto forme={barre.choisie.forme} largeur={26} />} libelle={libellePuce(barre.choisie)} deroulant onPress={() => actions.onBarre!(e)} />
              ) : null}
            </>
          }
          onAjouter={(type, texte) => actions.onAjouterNote(e, type, texte)}
          onModifier={(id, texte) => actions.onModifierNote(e, id, texte)}
          onChangerType={(id, vers) => actions.onTypeNote(e, id, vers)}
        />
        {enCours && e.effort?.decouverte ? (
          <LigneEffortVue
            l={{ icone: "page", texte: noteDecouverte(e.effort.cible.reps, e.effort.cible.rir, materielDe(e.exercice.equipement), lireActif().langue) }}
          />
        ) : null}
        {proposition ? <LigneEffortVue l={proposition} /> : null}
        <EnteteSeries
          colonnes={colonnes.map((c) => ({
            champ: c.champ,
            etiquette: nomColonne(c, u).toUpperCase(),
            onPress: c.champ === "kg" ? () => actions.onUnite(e) : undefined,
          }))}
        />
        <ListeDesintegrable
          liste={e.series}
          cleDe={(x) => x.id}
          nouveaux
          enveloppe={(x) => ({ style: gs.tenu?.ids.includes(x.id) && { zIndex: 10 } })}
          rendu={(x) => {
            return (
              <RangeeGlissable rangee={{ id: x.id, type: "serie", groupe: null }} glisse={glisseSeries} appuiLong={ordonnable} dansSuperset={false} trait={{}} zoneAppui>
                {(_poignee, appuiSerie) => (
                  <View>
                    <LigneDeSerie x={x} e={e} unite={u} activeId={activeId} actions={actionsSerie} enCours={enCours} appui={appuiSerie} glisseLibre={() => !occupe()} />
                    {enCours && actions.effort?.ouverte === x.id ? (
                      <QuestionEffort rirVise={e.rirVise ?? e.effort?.cible.rir ?? null} onChoisir={(m) => actions.effort!.onChoisir(x, e, m)} />
                    ) : null}
                    {essai?.apres === x.id && actions.effort?.ouverte !== x.id ? <LigneEffortVue l={essai} /> : null}
                  </View>
                )}
              </RangeeGlissable>
            );
          }}
        />
        <BoutonAjouterSerie onPress={() => actions.onAjouterSerie(e)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  exercice: { paddingTop: espace.m, paddingBottom: espace.xs, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  teteExercice: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginRight: -10 },
  // Seuls le picto et le nom ouvrent la progression, pas toute la ligne.
  nomExercice: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  trace: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -espace.xs },
  pied: { height: 1 },
  cache: { display: "none" },
  trait: { position: "absolute", left: -espace.l + 6, top: 8, bottom: 8, width: 2, borderRadius: 1 },
  teteSuperset: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 56, paddingTop: espace.s },
});
