// Gestes communs à la séance en cours et à une séance passée (E1) : saisie, type de série, menus, repos.
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ajouterNote, changerReposSupersetSeance, changerTypeNote, definirRirSeance, definirTempoSeance, lireExercice, type Exercice, disposerSeance, ecrireSaisieSerie, ordonnerSeriesSeance, INFO_NATURE, modifierNote, modifierSerie, paliersPour, type ChampSerie, remplacerExercice, resumeRemplacement, retirerExerciceDeSeance, supprimerSerie, type ExerciceDeSeance, type SeanceDetail, type SerieDetail, type TypeNote, type TypeSerie } from "../db";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { BandePaliers } from "../ui/BandePaliers";
import { Bouton } from "../ui/Bouton";
import { marquerSuppression } from "../ui/Desintegration";
import { BoutonPrincipal } from "../ui/Degrade";
import { haptique } from "../ui/haptique";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { espace } from "../theme/typo";
import { FeuilleRepos, FeuilleReposSuperset, FeuilleTempo } from "../ui/RoueDuree";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { useApp } from "./contexte";
import { essaiSuivant, materielDe, rirDeMot, rpeDeRir, type MotEffort } from "../boutique/poids";
import { clavierSeance } from "./clavier-seance";
import { minuscule, t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { ajouterSerieA, changerReposSeance, choisirUniteExercice } from "./donnees";
import { enchainementNoms, libelleSuperset, relireCharge, titreRepos, versUnite, type Unite } from "./format";
import { tempoActif, tempoDe, tempoDefautExercice } from "./tempo";
import { meilleursAvant } from "./seance-historique";
import { avecAjouts, serieAjoutee } from "./ajout-optimiste";
import { nouvelId } from "../db/id";
import { exerciceEmporte, sansExercice, sansSerie } from "./retrait-serie";
import { avecDisposition, avecOrdreSeries } from "./ordre-seance";
import type { LigneDispo } from "./glisser";
import { demanderRemplacement } from "./selection";
import { avecCoches, cocherOptimiste, cochesEnAttente, type Coche } from "./coche-optimiste";
import { signalerErreur } from "../ui/FeuilleMessage";
import { AUCUN, recordsDeSeance, texteInhabituel, valeurInhabituelle, type ChampInhabituel, type Meilleurs } from "./seance-reperes";
import { patchSaisie, saisieDe, serieAffichee, serieDeCase } from "./saisie-en-cours";
import { chargesPour, choisirBarre, lireMateriel, type ChargesExercice, type Materiel } from "../db/depots/materiel";
import { nomDansPhrase, optionsBarre } from "./charge-seance";
import { BarrePicto } from "../ui/DessinBarre";
import { FormulaireExercice, type AnnulationExercice } from "./FormulaireExercice";
import { FeuilleVise } from "./FeuilleVise";

/** Dernière série supprimée : l'exercice part de l'écran tout de suite, la base attend que « Annuler » ait expiré. */
const DELAI_ANNULER_MS = 8000;

/** « Exercice modifié · partout » : 5 s pour annuler une modification faite en séance (planche exercices-perso, D3). */
const DELAI_MODIFIE_MS = 5000;

/** La feuille d'avertissement monte quand l'encre orange a gagné la ligne (planche : 250 + 320 ms). */
const DELAI_FEUILLE_ALERTE = 570;

export const typesSerie = (): [TypeSerie, string][] => [
  ["echauffement", t("seance.actions.echauffement")],
  ["normale", t("seance.actions.normale")],
  ["rate", t("seance.actions.echec")],
  ["degressive", t("seance.actions.degressive")],
];

/** Les quatre types de série, comme dans la feuille de l'entraînement. */
export function OptionsTypeSerie({ courant, onChoisir }: { courant: TypeSerie; onChoisir: (type: TypeSerie) => void }) {
  useLangue();
  return (
    <Groupe>
      {typesSerie().map(([type, l], i) => (
        <Option key={type} premier={i === 0} libelle={l} choisi={courant === type} onPress={() => onChoisir(type)} />
      ))}
    </Groupe>
  );
}

type Ouvert =
  | { quoi: "type"; serie: SerieDetail; e: ExerciceDeSeance }
  | { quoi: "menu"; e: ExerciceDeSeance }
  | { quoi: "repos"; e: ExerciceDeSeance }
  | { quoi: "tempo"; e: ExerciceDeSeance }
  | { quoi: "barre"; e: ExerciceDeSeance }
  | { quoi: "vise"; e: ExerciceDeSeance }
  | null;

/**
 * `vue` : la séance à afficher (sans l'exercice dont la dernière série attend sa suppression) ; `bandeau` : « Annuler »,
 * posé à `basAnnuler` du bas de l'écran.
 */
export { patchSaisie };

export function useActionsSeance(seance: SeanceDetail | null | undefined, unites: Record<string, Unite>, recharger: () => Promise<void>, basAnnuler: number = espace.l) {
  const { db, reglages } = useApp();
  const [ouvert, setOuvert] = useState<Ouvert>(null);
  const fermer = () => setOuvert(null);
  const enCours = seance?.seance.fin == null;
  const [paliers, setPaliers] = useState<Record<string, number[] | null>>({});
  // Matériel du lieu (planche materiel, séance) : charges par exercice et inventaire, relus après le choix d'une barre.
  const [charges, setCharges] = useState<Record<string, ChargesExercice | null>>({});
  const [materiel, setMateriel] = useState<Materiel[]>([]);
  const [versionMateriel, setVersionMateriel] = useState(0);
  const salleId = seance?.salle?.id ?? null;
  const exercices = seance?.exercices.map((e) => e.exercice.id).join("|") ?? "";
  useEffect(() => {
    if (!seance) return;
    (async () => {
      const m: Record<string, number[] | null> = {};
      const c: Record<string, ChargesExercice | null> = {};
      for (const e of seance.exercices) {
        if (!INFO_NATURE[e.exercice.nature].colonnes.some((x) => x.champ === "kg")) continue;
        c[e.exercice.id] = enCours ? await chargesPour(db, e.exercice.id, salleId) : null;
        m[e.exercice.id] = c[e.exercice.id]?.charges ?? (await paliersPour(db, e.exercice.id, salleId));
      }
      setPaliers(m);
      setCharges(c);
      setMateriel(enCours && salleId ? await lireMateriel(db, salleId) : []);
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, salleId, exercices, enCours, versionMateriel]);
  const faire = (f: () => Promise<unknown>) => {
    f()
      .then(recharger)
      .catch((e) => console.error(e));
  };

  // Série supprimée : elle se désintègre tout de suite, la base ne l'efface qu'à l'expiration d'« Annuler » (« Série
  // supprimée · Annuler », décision du 27/10), à la suppression suivante, ou quand l'écran se ferme. Dernière
  // série d'un exercice : toute la carte part avec elle (« « X » retiré · Annuler »).
  const [enAttente, setEnAttente] = useState<{ serieId: string; exerciceId: string | null; texte: string } | null>(null);
  const attente = useRef<{ serieId: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const confirmer = () => {
    const a = attente.current;
    if (!a) return;
    clearTimeout(a.minuterie);
    attente.current = null;
    // La carte reste masquée jusqu'à la relecture : elle ne réapparaît pas entre la suppression et le rechargement.
    supprimerSerie(db, a.serieId)
      .then(recharger)
      .catch((e) => console.error(e))
      .finally(() => setEnAttente((x) => (attente.current ? x : null)));
  };
  useEffect(
    () => () => {
      const a = attente.current;
      if (a) clearTimeout(a.minuterie);
      if (a) supprimerSerie(db, a.serieId).catch((e) => console.error(e));
    },
    [db],
  );
  const supprimerLaSerie = (x: SerieDetail, delai: number) => {
    if (!seance) return;
    const exerciceId = exerciceEmporte(seance, x.id);
    confirmer();
    marquerSuppression(exerciceId ?? x.id, delai);
    const nom = exerciceId ? seance.exercices.find((e) => e.exercice.id === exerciceId)!.exercice.nom : "";
    attente.current = { serieId: x.id, minuterie: setTimeout(confirmer, DELAI_ANNULER_MS) };
    setEnAttente({ serieId: x.id, exerciceId, texte: exerciceId ? t("seance.ligne.exerciceRetire", { nom }) : t("seance.ligne.serieSupprimee") });
  };
  const annulerSuppression = () => {
    if (attente.current) clearTimeout(attente.current.minuterie);
    attente.current = null;
    setEnAttente(null);
  };
  // « Modifier l'exercice » (planche exercices-perso, section 3) : le formulaire monte par-dessus la séance ; enregistré, la
  // modification vaut partout et « Annuler » la défait pendant 5 s. À l'expiration, l'ancienne photo est effacée.
  // L'exercice reste après la fermeture : le formulaire descend avec son contenu.
  const [edition, setEdition] = useState<{ ex: Exercice; ouvert: boolean } | null>(null);
  const fermerEdition = () => setEdition((x) => x && { ...x, ouvert: false });
  const [modifie, setModifie] = useState<AnnulationExercice | null>(null);
  const minuterieModifie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finirModifie = (a: AnnulationExercice | null) => {
    if (minuterieModifie.current) clearTimeout(minuterieModifie.current);
    minuterieModifie.current = null;
    a?.confirmer();
    setModifie(null);
  };
  const modifieCourant = useRef<AnnulationExercice | null>(null);
  modifieCourant.current = modifie;
  useEffect(() => () => finirModifie(modifieCourant.current), []); // eslint-disable-line react-hooks/exhaustive-deps
  const exerciceModifie = (a?: AnnulationExercice) => {
    fermerEdition();
    recharger().catch((e) => console.error(e));
    if (!a) return;
    finirModifie(modifieCourant.current);
    setModifie(a);
    minuterieModifie.current = setTimeout(() => finirModifie(a), DELAI_MODIFIE_MS);
  };
  const annulerModifie = () => {
    const a = modifieCourant.current;
    if (minuterieModifie.current) clearTimeout(minuterieModifie.current);
    minuterieModifie.current = null;
    setModifie(null);
    a?.annuler()
      .then(recharger)
      .catch((e) => console.error(e));
  };
  // Séries ajoutées, affichées avant que la base ait écrit (retirées après la relecture, ou si l'écriture échoue).
  const [ajouts, setAjouts] = useState<SerieDetail[]>([]);
  // Exercices retirés par le menu : ils quittent l'écran (et se désintègrent) au toucher, la base écrit derrière.
  const [retires, setRetires] = useState<string[]>([]);
  // Glisser-déposer : le nouvel ordre s'affiche dès le lâcher, jusqu'à la relecture de la base (comme l'éditeur de routine).
  const [apercu, setApercu] = useState<SeanceDetail | null>(null);
  // Coches posées à l'écran avant l'écriture (audit M6) ; oubliées quand la séance relue les confirme.
  const [coches, setCoches] = useState<ReadonlyMap<string, Coche>>(new Map());
  useEffect(() => {
    if (seance) setCoches((m) => cochesEnAttente(seance, m));
  }, [seance]);
  const vue = useMemo(() => {
    const base = apercu ?? seance;
    let v = base && enAttente ? (enAttente.exerciceId ? sansExercice(base, enAttente.exerciceId) : sansSerie(base, enAttente.serieId)) : base;
    if (v) for (const id of retires) v = sansExercice(v, id);
    return v ? avecCoches(avecAjouts(v, ajouts), coches) : v;
  }, [seance, apercu, enAttente, ajouts, retires, coches]);
  const ordonner = (montre: SeanceDetail, ecrire: () => Promise<unknown>) => {
    setApercu(montre);
    return ecrire()
      .then(recharger)
      .finally(() => setApercu(null));
  };

  // Repères : meilleures valeurs d'avant cette séance (record, valeur inhabituelle). Null tant qu'elles ne sont pas lues.
  const [meilleurs, setMeilleurs] = useState<Record<string, Meilleurs> | null>(null);
  const seanceId = seance?.seance.id ?? null;
  const debut = seance?.seance.debut ?? 0;
  useEffect(() => {
    if (!seanceId) return;
    meilleursAvant(db, exercices ? exercices.split("|") : [], seanceId, debut)
      .then(setMeilleurs)
      .catch((e) => console.error(e));
  }, [db, seanceId, debut, exercices]);
  const records = useMemo(
    () =>
      vue && meilleurs
        ? recordsDeSeance(
            vue.exercices.flatMap((e) => e.series.map((x) => ({ id: x.id, exercice_id: x.exercice_id, kg: x.kg, reps: x.reps, duree_s: x.duree_s, faite: x.faite, echauffement: x.type === "echauffement" }))),
            meilleurs,
          )
        : new Set<string>(),
    [vue, meilleurs],
  );

  // Valeur inhabituelle à la coche : la ligne passe en alerte, la feuille monte ; rien n'est écrit tant que Alex n'a pas choisi.
  const [alerte, setAlerte] = useState<{ serieId: string; champ: ChampInhabituel; e: ExerciceDeSeance; serie: SerieDetail } | null>(null);
  const [feuilleAlerte, setFeuilleAlerte] = useState(false);
  const [focus, setFocus] = useState<{ serieId: string; champ: ChampSerie; n: number } | null>(null);
  const uniteDe = (x: Pick<SerieDetail, "exercice_id">): Unite => unites[x.exercice_id] ?? "kg";
  /** La série telle que l'écran la montre : la case en saisie (clavier de séance) l'emporte sur la mémoire et la base. */
  const affichee = (x: SerieDetail): SerieDetail => serieAffichee(x, clavierSeance.caseActive(), uniteDe(x));
  const inhabituelle = (x: SerieDetail): ChampInhabituel | null => {
    if (!meilleurs || x.type === "echauffement") return null;
    const e = seance?.exercices.find((y) => y.exercice.id === x.exercice_id);
    // Course : la durée suit la distance, elle n'est pas comparée.
    const sansDuree = e?.exercice.nature === "distance_duree";
    return valeurInhabituelle({ kg: x.kg, reps: x.reps, duree_s: sansDuree ? null : x.duree_s }, meilleurs[x.exercice_id] ?? AUCUN);
  };
  const avertir = (x: SerieDetail, champ: ChampInhabituel) => {
    const e = seance?.exercices.find((y) => y.exercice.id === x.exercice_id);
    if (!e) return;
    setAlerte({ serieId: x.id, champ, e, serie: x });
    haptique.alerte();
    setTimeout(() => setFeuilleAlerte(true), DELAI_FEUILLE_ALERTE);
  };
  // « C'était comment ? » (planche programmes-charges, variante B) : sous la série qu'on vient de cocher, si le réglage
  // « Demander l'effort » est allumé, ou toujours pendant les essais d'un exercice à découvrir (il faut la réponse pour
  // proposer le poids suivant). Une autre coche, ou la réponse, la referme.
  const [questionEffort, setQuestionEffort] = useState<string | null>(null);
  // Écritures des coches, l'une après l'autre dans l'ordre des gestes.
  const ecritures = useRef<Promise<unknown>>(Promise.resolve());
  /**
   * Coche optimiste (audit M6, coche-optimiste.ts) : la case passe au vert et le repos part dans la même image ; l'écriture
   * suit après l'image, sans relire la séance. Échec : coche retirée, repos arrêté, feuille d'erreur.
   */
  const cocher = (x: SerieDetail, faite: boolean): Promise<void> => {
    if (!vue) return Promise.resolve();
    // La case de cette série encore en saisie : sa valeur part avec la coche (même écriture), pas celle d'avant.
    const saisie = saisieDe(x.id, clavierSeance.caseActive(), uniteDe(x));
    if (faite) {
      // Le clavier de séance se ferme à la coche (la case en saisie s'enregistre) : la question et la séance restent visibles.
      clavierSeance.quitter();
      const e = vue.exercices.find((y) => y.exercice.id === x.exercice_id);
      const aReps = !!e && INFO_NATURE[e.exercice.nature].colonnes.some((c) => c.champ === "reps");
      // Un ressenti visé sur la ligne (planche exercices-perso, D6) : la question s'ouvre aussi, le mot visé cerclé.
      setQuestionEffort(aReps && x.type === "normale" && (reglages.demanderEffort || e?.effort?.decouverte || e?.rirVise != null) ? x.id : null);
    } else if (questionEffort === x.id) setQuestionEffort(null);
    return cocherOptimiste({
      db,
      seance: vue,
      serie: x,
      faite,
      saisie,
      file: ecritures,
      poser: (c) => setCoches((m) => new Map(m).set(x.id, c)),
      retirer: (c) =>
        setCoches((m) => {
          if (m.get(x.id) !== c) return m;
          const n = new Map(m);
          n.delete(x.id);
          return n;
        }),
      erreur: signalerErreur("enregistrer"),
    });
  };
  /** Réponse : l'effort part dans `series.rpe` ; un exercice à découvrir reçoit le poids de l'essai suivant (ou trouvé). */
  const choisirEffort = (x: SerieDetail, e: ExerciceDeSeance, mot: MotEffort) => {
    setQuestionEffort(null);
    faire(async () => {
      const { rir, auMoins } = rirDeMot(mot);
      await modifierSerie(db, x.id, { rpe: rpeDeRir(rir) });
      const ef = e.effort;
      if (!ef?.decouverte || x.kg == null || !(x.kg > 0) || x.reps == null) return;
      const essai = essaiSuivant({ kg: x.kg, reps: x.reps, rir, auMoins }, ef.cible, materielDe(e.exercice.equipement), paliers[e.exercice.id]);
      const restantes = e.series.filter((y) => !y.faite && y.type === "normale" && y.position > x.position);
      for (const y of essai.etat === "trouve" ? restantes : restantes.slice(0, 1)) await modifierSerie(db, y.id, { kg: essai.kg });
    });
  };
  const ignorer = () => {
    if (!alerte) return;
    const x = affichee(alerte.serie);
    setFeuilleAlerte(false);
    // La série passe en vert une fois la feuille descendue ; l'orange reste dessous jusqu'à la fin de l'encre.
    setTimeout(() => {
      cocher(x, true).then(() => setAlerte(null));
    }, duree.feuilleSortie);
  };
  const modifier = () => {
    if (!alerte) return;
    const { serieId, champ } = alerte;
    setFeuilleAlerte(false);
    setAlerte(null);
    setFocus({ serieId, champ, n: Date.now() });
  };

  const lieu = (e: ExerciceDeSeance) => ({ exerciceId: e.exercice.id, seanceId: seance!.seance.id, ligneId: e.ligneRoutineId });

  // Gestes : des fonctions stables d'un rendu à l'autre (elles appellent toujours la dernière version), pour que les
  // cartes d'exercice mémoïsées ne se redessinent pas toutes à chaque coche (audit M5, M6).
  const gestes = useGestesStables({
    onAjouterNote: (e: ExerciceDeSeance, type: TypeNote, texte: string) => ajouterNote(db, lieu(e), type, texte).then(recharger),
    onModifierNote: (_e: ExerciceDeSeance, id: string, texte: string | null) => modifierNote(db, id, texte).then(recharger),
    onTypeNote: (e: ExerciceDeSeance, id: string, vers: TypeNote) => changerTypeNote(db, lieu(e), id, vers).then(recharger),
    onChamp: (x: SerieDetail, champ: ChampSerie, v: string, u: Unite) => faire(() => modifierSerie(db, x.id, patchSaisie(champ, v, u))),
    onBrouillon: (x: SerieDetail, champ: ChampSerie, v: string, u: Unite) => {
      ecrireSaisieSerie(db, x.id, patchSaisie(champ, v, u)).catch((e) => console.error(e));
    },
    onChrono: enCours
      ? (y: SerieDetail, secondes: number, cibleS: number | null = null) =>
          faire(async () => {
            const x = affichee(y);
            // Temps réel du compte à rebours, et sa cible pour l'écart affiché sous le temps (planche seance-duree).
            await modifierSerie(db, x.id, { dureeS: secondes, dureeCibleS: cibleS });
            const champ = inhabituelle({ ...x, duree_s: secondes });
            if (champ) avertir({ ...x, duree_s: secondes }, champ);
            else await cocher(x, true);
          })
      : undefined,
    onToggle: enCours
      ? (y: SerieDetail) => {
          // La valeur affichée, case en saisie comprise : 85 corrigé en 5 puis coché tout de suite, c'est 5 (docs/ALERTE-REPS.md).
          const x = affichee(y);
          if (!x.faite) {
            // Déjà en alerte : la valeur a pu être corrigée sur place ; sinon la feuille remonte (avec la valeur du moment).
            const champ = inhabituelle(x);
            if (champ && alerte?.serieId === x.id) {
              setAlerte({ ...alerte, champ, serie: x });
              return setFeuilleAlerte(true);
            }
            if (champ) return avertir(x, champ);
            if (alerte?.serieId === x.id) setAlerte(null);
          }
          void cocher(x, !x.faite);
        }
      : undefined,
    onSupprimerSerie: (x: SerieDetail) => supprimerLaSerie(x, 0),
    onDisposer: (lignes: LigneDispo[]) => (seance ? ordonner(avecDisposition(apercu ?? seance, lignes), () => disposerSeance(db, seance.seance.id, lignes)) : Promise.resolve()),
    onOrdreSeries: (e: ExerciceDeSeance, ids: string[]) =>
      seance ? ordonner(avecOrdreSeries(apercu ?? seance, e.exercice.id, ids), () => ordonnerSeriesSeance(db, seance.seance.id, e.exercice.id, ids)) : Promise.resolve(),
    onNumero: (serie: SerieDetail, e: ExerciceDeSeance) => setOuvert({ quoi: "type", serie, e }),
    onMenu: (e: ExerciceDeSeance) => setOuvert({ quoi: "menu", e }),
    /** Puce « 3-1-2-0 » du plein écran : la feuille Tempo directement. */
    onTempo: enCours ? (e: ExerciceDeSeance) => setOuvert({ quoi: "tempo", e }) : undefined,
    onRepos: enCours ? (e: ExerciceDeSeance) => setOuvert({ quoi: "repos", e }) : undefined,
    onBarre: enCours ? (e: ExerciceDeSeance) => setOuvert({ quoi: "barre", e }) : undefined,
    /** Pastille « Visé : Dur » : le ressenti visé, pour cette séance seulement. */
    onVise: enCours ? (e: ExerciceDeSeance) => setOuvert({ quoi: "vise", e }) : undefined,
    onAjouterSerie: (e: ExerciceDeSeance) => {
      // Mise à jour optimiste : la ligne s'ouvre aussitôt ; la base écrit derrière, l'écran se relit, puis l'ajout est retiré.
      const e2 = avecAjouts(seance!, ajouts).exercices.find((y) => y.exercice.id === e.exercice.id) ?? e;
      const id = nouvelId();
      const a = serieAjoutee(seance!.seance.id, e2, id);
      setAjouts((l) => [...l, a]);
      const retirer = () => setAjouts((l) => l.filter((x) => x.id !== id));
      ajouterSerieA(db, seance!.seance.id, e.exercice.id, e.groupeSuperset, { kg: a.kg, reps: a.reps, duree_s: a.duree_s, distance_m: a.distance_m }, id)
        .then(recharger)
        .then(retirer, (err) => {
          console.error(err);
          retirer();
        });
    },
    // Les nombres affichés ne bougent pas : ils sont relus dans la nouvelle unité et la base (en kg) suit ; le précédent est converti.
    onUnite: (e: ExerciceDeSeance) => {
      const de: Unite = unites[e.exercice.id] ?? "kg";
      const vers: Unite = de === "lbs" ? "kg" : "lbs";
      faire(async () => {
        await choisirUniteExercice(db, e.exercice.id, vers);
        for (const x of e.series) {
          const kg = relireCharge(x.kg, de, vers);
          if (kg !== x.kg) await modifierSerie(db, x.id, { kg });
        }
      });
    },
  });
  const alerteVue = useMemo(() => (alerte ? { serieId: alerte.serieId, champ: alerte.champ as ChampSerie } : null), [alerte]);
  const choisir = useGestesStables({ choisirEffort });
  // Même ensemble de records : même objet (une coche sans record ne change pas les props des cartes).
  const recordsGardes = useRef(records);
  if (!memeEnsemble(recordsGardes.current, records)) recordsGardes.current = records;
  const recordsStables = recordsGardes.current;
  const actions = useMemo(
    () => ({
      ...gestes,
      paliers,
      charges,
      lieu: seance?.salle?.nom,
      records: recordsStables,
      alerte: alerteVue,
      focus,
      effort: enCours ? { ouverte: questionEffort, onChoisir: choisir.choisirEffort } : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paliers, charges, seance?.salle?.nom, recordsStables, alerteVue, focus, enCours, questionEffort],
  );

  const choisirType = (type: TypeSerie) => {
    if (ouvert?.quoi !== "type") return;
    const id = ouvert.serie.id;
    fermer();
    faire(() => modifierSerie(db, id, { type }));
  };

  // Superset dont on règle le repos : la feuille à deux roues (entre les exercices, après le tour).
  // Feuille « Barre du squat » : une option par barre à charger du lieu ; le choix est gardé pour l'exercice et le lieu.
  const barreDe = ouvert?.quoi === "barre" ? { e: ouvert.e, b: charges[ouvert.e.exercice.id]?.barre } : null;
  const choisirLaBarre = (id: string) => {
    if (!barreDe || !salleId) return;
    const exerciceId = barreDe.e.exercice.id;
    fermer();
    faire(async () => {
      await choisirBarre(db, exerciceId, salleId, id);
      setVersionMateriel((v) => v + 1);
    });
  };

  const membres = ouvert?.quoi === "repos" && ouvert.e.groupeSuperset != null && seance ? seance.exercices.filter((x) => x.groupeSuperset === ouvert.e.groupeSuperset) : [];

  const feuilles = (
    <>
      <BandePaliers />
      <FeuilleAlerte
        visible={feuilleAlerte}
        alerte={alerte}
        unite={alerte ? (unites[alerte.e.exercice.id] ?? "kg") : "kg"}
        onFermer={() => setFeuilleAlerte(false)}
        onModifier={modifier}
        onIgnorer={ignorer}
      />
      <Feuille visible={ouvert?.quoi === "type"} onFermer={fermer} titre={t("seance.actions.typeSerie")}>
        <OptionsTypeSerie courant={ouvert?.quoi === "type" ? ouvert.serie.type : "normale"} onChoisir={choisirType} />
        <Groupe>
          <Option
            premier
            danger
            icone="trash"
            libelle={t("seance.ligne.supprimer")}
            onPress={() => {
              if (ouvert?.quoi !== "type") return;
              const serie = ouvert.serie;
              fermer();
              supprimerLaSerie(serie, duree.feuilleSortie);
            }}
          />
        </Groupe>
      </Feuille>

      <Feuille visible={ouvert?.quoi === "menu"} onFermer={fermer} titre={ouvert?.quoi === "menu" ? ouvert.e.exercice.nom : undefined}>
        <Groupe>
          <Option
            premier
            icone="chart"
            libelle={t("seance.actions.voirProgression")}
            onPress={() => {
              if (ouvert?.quoi !== "menu") return;
              const id = ouvert.e.exercice.id;
              fermer();
              router.push({ pathname: "/progress/[id]", params: { id } });
            }}
          />
          {enCours ? (
            <Option
              icone="crayon"
              libelle={t("seance.actions.modifierExercice")}
              onPress={() => {
                if (ouvert?.quoi !== "menu") return;
                const id = ouvert.e.exercice.id;
                fermer();
                lireExercice(db, id)
                  .then((ex) => ex && setEdition({ ex, ouvert: true }))
                  .catch((err) => console.error(err));
              }}
            />
          ) : null}
          <Option
            icone="plus"
            libelle={t("seance.ligne.ajouterSerie")}
            onPress={() => {
              if (ouvert?.quoi !== "menu") return;
              const e = ouvert.e;
              fermer();
              gestes.onAjouterSerie(e);
            }}
          />
          {/* Tempo : exercices à répétitions seulement (29/10). */}
          {enCours && ouvert?.quoi === "menu" && tempoActif(ouvert.e.exercice) ? (
            <Option
              icone="timer"
              libelle={ouvert?.quoi === "menu" && tempoDe(ouvert.e.tempo, ouvert.e.exercice) ? t("seance.actions.modifierTempo") : t("seance.actions.definirTempo")}
              onPress={() => {
                if (ouvert?.quoi !== "menu") return;
                setOuvert({ quoi: "tempo", e: ouvert.e });
              }}
            />
          ) : null}
          {enCours ? (
            <Option
              icone="swap"
              libelle={t("seance.actions.alternative")}
              onPress={() => {
                if (ouvert?.quoi !== "menu" || !seance) return;
                const id = ouvert.e.exercice.id;
                fermer();
                router.push({ pathname: "/swap", params: { seance: seance.seance.id, exercice: id } });
              }}
            />
          ) : null}
          {enCours ? (
            <Option
              icone="repeat"
              libelle={t("seance.actions.remplacer")}
              onPress={() => {
                if (ouvert?.quoi !== "menu" || !seance) return;
                const e = ouvert.e;
                const seanceId = seance.seance.id;
                fermer();
                resumeRemplacement(db, seanceId, e.exercice.id)
                  .then((r) => {
                    demanderRemplacement(
                      { nom: e.exercice.nom, dejaPresents: seance.exercices.map((x) => x.exercice.id), nbValidees: r.nbValidees, routineNom: r.routineNom },
                      (id, choix) => faire(() => remplacerExercice(db, seanceId, e.exercice.id, id, choix)),
                    );
                    router.push({ pathname: "/pick", params: { mode: "remplacer", ...(seance.salle ? { salle: seance.salle.id } : {}) } });
                  })
                  .catch((err) => console.error(err));
              }}
            />
          ) : null}
        </Groupe>
        <Groupe>
          <Option
            premier
            danger
            icone="trash"
            libelle={t("seance.actions.retirer")}
            onPress={() => {
              if (ouvert?.quoi !== "menu" || !seance) return;
              const id = ouvert.e.exercice.id;
              fermer();
              // Sans attendre l'écriture, la relecture ni la feuille : la désintégration part au toucher.
              marquerSuppression(id);
              setRetires((l) => [...l, id]);
              retirerExerciceDeSeance(db, seance.seance.id, id)
                .then(recharger)
                .catch((err) => console.error(err))
                .finally(() => setRetires((l) => l.filter((x) => x !== id)));
            }}
          />
        </Groupe>
      </Feuille>

      <Feuille
        visible={ouvert?.quoi === "barre"}
        onFermer={fermer}
        titre={barreDe ? t("materiel.seance.choixTitre", { exercice: nomDansPhrase(barreDe.e.exercice.nom) }) : undefined}
        sousTitre={barreDe ? t("materiel.seance.choixSous", { exercice: nomDansPhrase(barreDe.e.exercice.nom), lieu: seance?.salle?.nom ?? "" }) : undefined}
      >
        {barreDe?.b ? (
          <Groupe>
            {optionsBarre(barreDe.b, materiel, unites[barreDe.e.exercice.id] ?? "kg").map((o, i) => (
              <Option
                key={o.id}
                premier={i === 0}
                visuel={<BarrePicto forme={o.forme} largeur={36} />}
                libelle={o.titre}
                aide={o.sous}
                choisi={o.choisie}
                onPress={() => choisirLaBarre(o.id)}
              />
            ))}
          </Groupe>
        ) : null}
      </Feuille>
      <FeuilleTempo
        visible={ouvert?.quoi === "tempo"}
        tempo={ouvert?.quoi === "tempo" ? ouvert.e.tempo : null}
        defaut={ouvert?.quoi === "tempo" ? tempoDefautExercice(ouvert.e.exercice, reglages.tempos) : null}
        onFermer={fermer}
        onEnregistrer={(tempo) => {
          if (ouvert?.quoi !== "tempo" || !seance) return;
          const id = ouvert.e.exercice.id;
          fermer();
          faire(() => definirTempoSeance(db, seance.seance.id, id, tempo));
        }}
      />

      <FeuilleVise
        visible={ouvert?.quoi === "vise"}
        onFermer={fermer}
        nom={ouvert?.quoi === "vise" ? ouvert.e.exercice.nom : ""}
        rir={ouvert?.quoi === "vise" ? ouvert.e.rirVise : null}
        enSeance
        routine={seance?.routineNom ?? null}
        garde={ouvert?.quoi === "vise" ? ouvert.e.rirRoutine : null}
        onChoisir={(rir) => {
          if (ouvert?.quoi !== "vise" || !seance) return;
          const e = ouvert.e;
          fermer();
          faire(() => definirRirSeance(db, seance.seance.id, e.exercice.id, rir, e.rirRoutine));
        }}
      />
      <FormulaireExercice
        visible={!!edition?.ouvert}
        exercice={edition?.ex ?? null}
        enSeance
        onFermer={fermerEdition}
        onOuvrirExistant={(id) => {
          fermerEdition();
          router.push({ pathname: "/progress/[id]", params: { id } });
        }}
        onFini={(_id, _variante, a) => exerciceModifie(a)}
      />

      <FeuilleReposSuperset
        visible={ouvert?.quoi === "repos" && membres.length > 1}
        titre={t("ui.reposSuperset.titre", { quoi: minuscule(libelleSuperset(membres.length)) })}
        sousTitre={membres.length ? enchainementNoms(membres.map((x) => x.exercice.nom)) : undefined}
        transitionS={membres[0]?.reposTransitionS ?? 0}
        tourS={membres[membres.length - 1]?.reposS ?? 0}
        onFermer={fermer}
        onValider={(entre, apres) => {
          if (ouvert?.quoi !== "repos" || !seance || ouvert.e.groupeSuperset == null) return;
          const groupe = ouvert.e.groupeSuperset;
          fermer();
          faire(() => changerReposSupersetSeance(db, seance.seance.id, groupe, entre, apres));
        }}
      />
      <FeuilleRepos
        visible={ouvert?.quoi === "repos" && membres.length <= 1}
        onFermer={fermer}
        titre={titreRepos(ouvert?.quoi === "repos" && ouvert.e.groupeSuperset != null ? (seance?.exercices.filter((x) => x.groupeSuperset === ouvert.e.groupeSuperset).length ?? 1) : null)}
        valeur={ouvert?.quoi === "repos" ? ouvert.e.reposS : 0}
        onValider={(d) => {
          if (ouvert?.quoi !== "repos" || !seance) return;
          const id = ouvert.e.exercice.id;
          fermer();
          faire(() => changerReposSeance(db, seance.seance.id, id, d));
        }}
      />
    </>
  );

  const bandeau = modifie ? (
    <BandeauAnnuler coche texte={t("exercices.formulaire.modifie")} bas={basAnnuler} onAnnuler={annulerModifie} />
  ) : enAttente ? (
    <BandeauAnnuler texte={enAttente.texte} bas={basAnnuler} onAnnuler={annulerSuppression} />
  ) : null;

  /**
   * Avant de quitter la séance (Terminer) : la case encore en saisie est enregistrée, recalcul compris, et le clavier se
   * ferme ; la fin de séance relit la base et y trouve la valeur affichée (l'écriture différée n'a pas toujours eu lieu).
   */
  const enregistrerSaisie = async (): Promise<void> => {
    const a = clavierSeance.caseActive();
    const c = a ? serieDeCase(a.cle) : null;
    const x = c ? vue?.exercices.flatMap((e) => e.series).find((y) => y.id === c.serieId) : undefined;
    const p = x ? saisieDe(x.id, a, uniteDe(x)) : null;
    clavierSeance.quitter();
    if (x && p) await modifierSerie(db, x.id, p);
  };
  return { actions, feuilles, vue, bandeau, enregistrerSaisie };
}

/** Feuille « Valeur … inhabituelle » : panneau à côté du titre, textes centrés, « Modifier la série » en geste principal. */
function FeuilleAlerte({
  visible,
  alerte,
  unite,
  onFermer,
  onModifier,
  onIgnorer,
}: {
  visible: boolean;
  alerte: { champ: ChampInhabituel; e: ExerciceDeSeance; serie: SerieDetail } | null;
  unite: Unite;
  onFermer: () => void;
  onModifier: () => void;
  onIgnorer: () => void;
}) {
  const { couleurs } = useTheme();
  const s = alerte?.serie;
  const texte = alerte && s ? texteInhabituel(alerte.champ, { kg: s.kg != null ? versUnite(s.kg, unite) : null, reps: s.reps, duree_s: s.duree_s }, unite) : null;
  return (
    <Feuille visible={visible} onFermer={onFermer}>
      {texte && alerte ? (
        <View style={styles.alerte}>
          <View style={styles.alerteTete}>
            <Icone nom="alerte" couleur={couleurs.action} taille={22} epaisseur={2} />
            <Texte variante="exercice" style={{ fontSize: 17, flexShrink: 1, textAlign: "center" }}>
              {texte.titre}
            </Texte>
          </View>
          <Texte variante="corps" couleur="t2" style={styles.centre}>
            {alerte.e.exercice.nom}
          </Texte>
          <Texte variante="corps" style={[styles.centre, styles.question]}>
            {texte.avant}
            <Texte variante="exercice" style={{ fontVariant: ["tabular-nums"] }}>
              {texte.valeur}
            </Texte>
            {texte.apres}
          </Texte>
          <View style={styles.boutons}>
            <BoutonPrincipal libelle={t("seance.actions.modifierSerie")} onPress={onModifier} />
            <Bouton large libelle={t("seance.actions.ignorer")} onPress={onIgnorer} />
          </View>
        </View>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  alerte: { gap: espace.s, paddingBottom: espace.s },
  alerteTete: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  centre: { textAlign: "center" },
  question: { fontSize: 15, marginTop: espace.s },
  boutons: { gap: espace.s, marginTop: espace.l },
});

const memeEnsemble = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Des fonctions stables : la même fonction à chaque rendu tant que la clé existe, qui appelle la dernière version reçue.
 * Une clé absente (undefined : geste indisponible, séance passée) reste absente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useGestesStables<T extends Record<string, ((...a: any[]) => any) | undefined>>(f: T): T {
  const derniere = useRef(f);
  derniere.current = f;
  const cache = useRef(new Map<string, unknown>());
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(f)) {
    if (f[k] === undefined) continue;
    let g = cache.current.get(k);
    if (!g) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      g = (...a: any[]) => derniere.current[k]!(...a);
      cache.current.set(k, g);
    }
    out[k] = g;
  }
  return out as T;
}
