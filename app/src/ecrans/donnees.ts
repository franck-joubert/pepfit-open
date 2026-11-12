// Ce qui manque à src/db pour les écrans (tout le reste passe par src/db, voir src/db/API.md).
import { colonnesExercice } from "../db/depots/exercices";
import { transaction } from "../db/exclusif";
import type { FormatWod, TypeProgramme } from "../db/programmes";
import { nomSql } from "../db/noms";
import {
  ajouterSerie,
  consoliderSeance,
  lireRoutine,
  lireRoutines,
  listerRoutines,
  modifierLigneRoutine,
  modifierSeance,
  supprimerSerie,
  terminerSeance,
  type Executeur,
  type Exercice,
  type LigneRoutineDetail,
  type RoutineDetail,
  type SeanceDetail,
} from "../db/api";
import { detecterEquipements, uniteEquipementPour } from "../db/depots/inventaire";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { lireAlerteRepos, type AlerteRepos } from "./alerte-repos";
import type { Unite } from "./format";
import { PREFERENCES_AUTO, estLangue, fuseauValide, type Detecte, type Preferences } from "../i18n/detection";
import { dureeRepDefaut, dureeTempo, lireTempo, tempoDe, TEMPOS_USINE, type Famille } from "./tempo";
import { messageFinal } from "./message-activite";
import type { PartiesActives } from "../ui/menu-flottant";
import { CLE_VERROU, CLE_VERROU_DELAI, lireDelaiVerrou, type DelaiVerrou } from "../verrou/regle";

// ---------------------------------------------------------------- réglages

export interface Reglages {
  /** Unité de poids effective (le choix « auto » est résolu par la détection) ; le choix brut est dans `region.poids`. */
  unite: Unite;
  /** Choix de langue, fuseau et unités : « auto » ou une valeur forcée. */
  region: Preferences;
  reposDefautS: number;
  alerteRepos: AlerteRepos;
  /** Son choisi parmi ceux du téléphone (null : son de notification par défaut). */
  sonRepos: { uri: string; nom: string } | null;
  ecranAllume: boolean;
  unRmSeance: boolean;
  /** Question « C'était comment ? » après chaque série (planche programmes-charges, effort en mots) ; non par défaut. */
  demanderEffort: boolean;
  /** Personnage de la vue 3D. */
  personnage: Personnage;
  /** Épaules de l'homme dans Santé (planche morphologie, D11) : naturelles par défaut, ou larges (le squelette des séances). */
  epaules: "naturelles" | "appli";
  /** Prénom seul, pour s'adresser à l'utilisateur (vide : aucun prénom dans les messages). */
  prenom: string;
  /** Guidage (planche idee-plein-ecran) : tempos par défaut par famille (D5), ruban du plein écran, vue d'ouverture de la séance. */
  tempos: Record<Famille, string>;
  rubanTempo: boolean;
  ouvrirPleinEcran: boolean;
  /** Parties montrées dans le menu du bas (profil, retours du 28/10) ; l'Accueil y est toujours. */
  parties: PartiesActives;
  /** Verrou d'ouverture (planche compte-connexion, H3) : celui du téléphone ; propre à ce téléphone (ne voyage pas). */
  verrou: boolean;
  /** Délai de reverrouillage en secondes (0, 60, 300, 900 ; 1 min par défaut, D6). */
  verrouDelaiS: DelaiVerrou;
  /** Ligne « Sommeil » en tête de la liste du jour de l'onglet Effort (planche effort, D8 et D9) ; oui par défaut. Réglage de
   *  l'appareil, gardé à la déconnexion : masquer la ligne n'arrête pas la lecture du sommeil. */
  sommeilAffiche: boolean;
}

export type Personnage = "homme" | "femme";

/** Clé « unite » absente : auto. Les installations existantes gardent leur choix kg / lbs, devenu un choix forcé. */
export async function lirePreferencesRegion(db: Executeur): Promise<Preferences> {
  return preferencesDe(await lireCles(db, CLES_REGION));
}

/** Réglage d'appareil « Afficher le sommeil » (« 0 » : ligne masquée) ; absent : affichée. */
export const CLE_SOMMEIL_AFFICHE = "effort_sommeil";
const CLES_REGION = ["unite", "langue", "fuseau", "unite_distance"] as const;
const CLES_REGLAGES = [
  ...CLES_REGION, "repos_defaut", "alerte_repos", "son_fin_repos", "son_repos_uri", "son_repos_nom", "ecran_allume", "un_rm_seance",
  "demander_effort", "personnage_3d", "epaules_3d", "prenom", "tempo_poly", "tempo_isolation", "ruban_tempo", "ouvrir_plein_ecran", "partie_train",
  "partie_food", "partie_health", CLE_VERROU, CLE_VERROU_DELAI, CLE_SOMMEIL_AFFICHE,
] as const;

/** Plusieurs réglages en une requête (le lancement en lisait 26 un par un : docs/AUDIT-PERF.md, M11) ; absent : null. */
async function lireCles<C extends string>(db: Executeur, cles: readonly C[]): Promise<(c: C) => string | null> {
  const lignes = await db.getAllAsync<{ cle: string; valeur: string }>(
    `SELECT cle, valeur FROM reglages WHERE cle IN (${cles.map(() => "?").join(", ")})`,
    [...cles],
  );
  const m = new Map(lignes.map((x) => [x.cle, x.valeur]));
  return (c) => m.get(c) ?? null;
}

function preferencesDe(l: (c: (typeof CLES_REGION)[number]) => string | null): Preferences {
  const u = l("unite");
  const lg = l("langue");
  const fu = l("fuseau");
  const di = l("unite_distance");
  return {
    langue: estLangue(lg) ? lg : PREFERENCES_AUTO.langue,
    fuseau: fu && fuseauValide(fu) ? fu : "auto",
    poids: u === "kg" || u === "lbs" ? u : "auto",
    distance: di === "km" || di === "mi" ? di : "auto",
  };
}

export async function lireReglages(db: Executeur, detecte?: Pick<Detecte, "poids">): Promise<Reglages> {
  const l = await lireCles(db, CLES_REGLAGES);
  const region = preferencesDe(l);
  const uri = l("son_repos_uri");
  return {
    region,
    unite: region.poids === "auto" ? (detecte?.poids ?? "kg") : region.poids,
    reposDefautS: Number(l("repos_defaut") ?? 120),
    alerteRepos: lireAlerteRepos(l("alerte_repos"), l("son_fin_repos")),
    sonRepos: uri ? { uri, nom: l("son_repos_nom") ?? "" } : null,
    // non par défaut (retours du 28/10, b) ; un choix déjà fait (« 1 » ou « 0 ») est gardé
    ecranAllume: l("ecran_allume") === "1",
    unRmSeance: l("un_rm_seance") === "1",
    demanderEffort: l("demander_effort") === "1",
    personnage: l("personnage_3d") === "femme" ? "femme" : "homme",
    epaules: l("epaules_3d") === "appli" ? "appli" : "naturelles",
    prenom: l("prenom") ?? "",
    tempos: {
      poly: lireTempo(l("tempo_poly")) ? l("tempo_poly")! : TEMPOS_USINE.poly,
      isolation: lireTempo(l("tempo_isolation")) ? l("tempo_isolation")! : TEMPOS_USINE.isolation,
    },
    rubanTempo: l("ruban_tempo") !== "0",
    ouvrirPleinEcran: l("ouvrir_plein_ecran") === "1",
    parties: {
      train: l("partie_train") !== "0",
      food: l("partie_food") !== "0",
      health: l("partie_health") !== "0",
    },
    verrou: l(CLE_VERROU) === "1",
    verrouDelaiS: lireDelaiVerrou(l(CLE_VERROU_DELAI)),
    sommeilAffiche: l(CLE_SOMMEIL_AFFICHE) !== "0",
  };
}

export async function ecrireReglages(db: Executeur, r: Partial<Reglages>): Promise<void> {
  const b = (v: boolean) => (v ? "1" : "0");
  if (r.unite) await ecrireReglage(db, "unite", r.unite);
  if (r.region) {
    const g = r.region;
    await ecrireReglage(db, "langue", g.langue);
    await ecrireReglage(db, "fuseau", g.fuseau);
    await ecrireReglage(db, "unite", g.poids === "auto" ? "" : g.poids);
    await ecrireReglage(db, "unite_distance", g.distance);
  }
  if (r.reposDefautS != null) await ecrireReglage(db, "repos_defaut", String(r.reposDefautS));
  if (r.alerteRepos) await ecrireReglage(db, "alerte_repos", r.alerteRepos);
  if (r.sonRepos !== undefined) {
    await ecrireReglage(db, "son_repos_uri", r.sonRepos?.uri ?? "");
    await ecrireReglage(db, "son_repos_nom", r.sonRepos?.nom ?? "");
  }
  if (r.ecranAllume != null) await ecrireReglage(db, "ecran_allume", b(r.ecranAllume));
  if (r.unRmSeance != null) await ecrireReglage(db, "un_rm_seance", b(r.unRmSeance));
  if (r.demanderEffort != null) await ecrireReglage(db, "demander_effort", b(r.demanderEffort));
  if (r.personnage) await ecrireReglage(db, "personnage_3d", r.personnage);
  if (r.epaules) await ecrireReglage(db, "epaules_3d", r.epaules);
  if (r.prenom != null) await ecrireReglage(db, "prenom", r.prenom.trim());
  if (r.tempos) {
    await ecrireReglage(db, "tempo_poly", r.tempos.poly);
    await ecrireReglage(db, "tempo_isolation", r.tempos.isolation);
  }
  if (r.rubanTempo != null) await ecrireReglage(db, "ruban_tempo", b(r.rubanTempo));
  if (r.ouvrirPleinEcran != null) await ecrireReglage(db, "ouvrir_plein_ecran", b(r.ouvrirPleinEcran));
  if (r.parties) {
    await ecrireReglage(db, "partie_train", b(r.parties.train));
    await ecrireReglage(db, "partie_food", b(r.parties.food));
    await ecrireReglage(db, "partie_health", b(r.parties.health));
  }
  if (r.verrou != null) await ecrireReglage(db, CLE_VERROU, b(r.verrou));
  if (r.verrouDelaiS != null) await ecrireReglage(db, CLE_VERROU_DELAI, String(r.verrouDelaiS));
  if (r.sommeilAffiche != null) await ecrireReglage(db, CLE_SOMMEIL_AFFICHE, b(r.sommeilAffiche));
}

/** Unité choisie pour chaque exercice (bascule « KG / LBS » de l'en-tête), sinon celle de son équipement dans la salle, sinon l'unité par défaut. */
export async function unitesExercices(db: Executeur, ids: string[], defaut: Unite, salleId: string | null = null): Promise<Record<string, Unite>> {
  const out: Record<string, Unite> = {};
  if (!ids.length) return out;
  // les choix de tous les exercices en une lecture ; la salle n'est lue que pour ceux qui n'en ont pas
  const choix = new Map(
    (await db.getAllAsync<{ cle: string; valeur: string }>(`SELECT cle, valeur FROM reglages WHERE cle IN (${ids.map(() => "?").join(",")})`, ids.map((id) => `unite:${id}`))).map(
      (x) => [x.cle, x.valeur],
    ),
  );
  for (const id of ids) {
    const v = choix.get(`unite:${id}`) ?? null;
    out[id] = v === "lbs" || v === "kg" ? v : ((await uniteEquipementPour(db, id, salleId)) ?? defaut);
  }
  return out;
}

/**
 * Unités d'une séance. En cours, l'équipement de sa salle compte (on charge ses disques, sa pile). Terminée, plus : la salle
 * d'aujourd'hui (réglée depuis, posée après coup par la détection du lieu, reçue d'un autre appareil) ne change pas l'unité
 * d'une séance faite, qui suit celle de sa routine : le choix de l'exercice, sinon l'unité du profil (anomalie « LBS »).
 */
export const unitesSeance = (db: Executeur, s: SeanceDetail, defaut: Unite): Promise<Record<string, Unite>> =>
  unitesExercices(db, s.exercices.map((e) => e.exercice.id), defaut, s.seance.fin == null ? (s.salle?.id ?? null) : null);

export async function choisirUniteExercice(db: Executeur, exerciceId: string, u: Unite): Promise<void> {
  await ecrireReglage(db, `unite:${exerciceId}`, u);
}

// ---------------------------------------------------------------- exercices

/** Exercices faits récemment, du plus récent au plus ancien (section « Récents » du choix). */
export async function exercicesRecents(db: Executeur, n = 3, maintenant: number = Date.now()): Promise<Exercice[]> {
  // Les séances des 90 derniers jours d'abord (index des séances par date), tout l'historique seulement s'il en manque (audit
  // de performance, M10 : toutes les séries relues à chaque ouverture du choix).
  const lire = (depuis: number) =>
    db.getAllAsync<Exercice>(
      `SELECT ${colonnesExercice("e")} FROM exercices e
       JOIN (SELECT s.exercice_id, MAX(se.debut) AS d FROM seances se JOIN series s ON s.seance_id = se.id
             WHERE se.debut >= ? AND s.faite = 1 GROUP BY s.exercice_id) r ON r.exercice_id = e.id
       ORDER BY r.d DESC LIMIT ?`,
      [depuis, n],
    );
  const recents = await lire(maintenant - 90 * 86_400_000);
  return recents.length >= n ? recents : lire(0);
}

// ---------------------------------------------------------------- records

export interface RecordSeance {
  serieId: string;
  exerciceId: string;
  nom: string;
  kg: number | null;
  reps: number | null;
}

/** Séries d'une séance qui ont battu un record (1RM estimé, charge, ou réps sans charge), une par exercice. */
export async function recordsDeSeance(db: Executeur, seanceId: string): Promise<RecordSeance[]> {
  const l = await db.getAllAsync<{ serie_id: string; exercice_id: string; nom: string; kg: number | null; reps: number | null }>(
    `SELECT DISTINCT r.serie_id, r.exercice_id, ${nomSql("e")} AS nom, s.kg, s.reps FROM records r
     JOIN series s ON s.id = r.serie_id JOIN exercices e ON e.id = r.exercice_id
     WHERE r.seance_id = ? AND r.type IN ('e1rm', 'charge', 'reps')
     ORDER BY s.position`,
    [seanceId],
  );
  const vus = new Set<string>();
  return l
    .filter((x) => (vus.has(x.exercice_id) ? false : (vus.add(x.exercice_id), true)))
    .map((x) => ({ serieId: x.serie_id, exerciceId: x.exercice_id, nom: x.nom, kg: x.kg, reps: x.reps }));
}

// ---------------------------------------------------------------- routines

const EFFORT_S = 60; // série sans cible connue
const MISE_EN_PLACE_S = 15; // installation et respiration avant une série en répétitions

/** Durée d'une série : son temps cible tel quel, sinon répétitions × durée d'une répétition (tempo de la ligne ou défaut de l'exercice) + mise en place, sinon 60 s. */
export function dureeSerie(l: LigneRoutineDetail, rang: number): number {
  const c = l.cibles[rang];
  if (c?.duree_s != null) return c.duree_s;
  if (c?.reps != null) {
    const tempo = tempoDe(l.tempo, l.exercice) ?? tempoDe(l.exercice.tempo, l.exercice);
    return c.reps * (tempo ? dureeTempo(tempo) : dureeRepDefaut(l.exercice)) + MISE_EN_PLACE_S;
  }
  return EFFORT_S;
}

const dureeSeries = (l: LigneRoutineDetail): number => l.cibles.reduce((t, _, rang) => t + dureeSerie(l, rang), 0);

/** Durée estimée : durée réelle de chaque série (voir `dureeSerie`) + repos entre les séries (pas après la dernière) ; un superset ne prend qu'un repos par tour. */
export function dureeEstimee(r: RoutineDetail): number {
  let total = 0;
  let dernierRepos = 0;
  for (const b of r.blocs) {
    if (b.groupeSuperset == null) {
      for (const l of b.lignes) {
        total += dureeSeries(l) + l.nb_series * l.repos_s;
        dernierRepos = l.repos_s;
      }
    } else {
      total += b.lignes.reduce((t, l) => t + dureeSeries(l), 0) + b.nbTours * b.reposS;
      dernierRepos = b.reposS;
    }
  }
  // Pas de repos après la toute dernière série : une séance d'une série de 120 min dure 120 min, pas 2 h 02 (04/11).
  return Math.max(0, total - dernierRepos);
}

export interface ResumeRoutine {
  id: string;
  nom: string;
  sectionId: string | null;
  type: TypeProgramme;
  format: FormatWod | null;
  formatValeur: number | null;
  exercices: { nom: string; slug: string | null }[];
  /** Séries de toute la routine (somme des lignes). */
  series: number;
  dureeS: number;
  derniere: number | null;
}

/** Routines avec leurs exercices (nom et slug, pour le picto) et la durée estimée (lignes « .rt »). */
export async function resumesRoutines(db: Executeur): Promise<ResumeRoutine[]> {
  const out: ResumeRoutine[] = [];
  // toutes les routines en quatre lectures (lireRoutines), plus la liste : plus une lecture par routine
  const [liste, details] = await Promise.all([listerRoutines(db), lireRoutines(db, undefined, { notes: false })]);
  for (const r of liste) {
    // Les routines d'un plan de la boutique se voient dans « En cours » et le calendrier, pas dans les listes.
    if (r.planId) continue;
    const d = details.get(r.id);
    if (!d) continue;
    out.push({
      id: r.id,
      nom: r.nom,
      sectionId: r.sectionId,
      type: r.type,
      format: r.format,
      formatValeur: r.formatValeur,
      exercices: d.blocs.flatMap((b) => b.lignes.map((l) => ({ nom: l.exercice.nom, slug: l.exercice.slug }))),
      series: d.blocs.reduce((n, b) => n + b.lignes.reduce((m, l) => m + l.nb_series, 0), 0),
      dureeS: dureeEstimee(d),
      derniere: r.derniereFois,
    });
  }
  return out;
}

/**
 * Pictos des lignes de séance du Sport (planche sport-programmes-routines v2, B5) : pour chaque routine, celles des plans
 * comprises, son type et le slug de son premier exercice ; pour chaque séance des 60 derniers jours, le slug de son premier
 * exercice. Une seule lecture par écran.
 */
export async function pictosSport(db: Executeur, maintenant: number = Date.now()) {
  const routines = new Map<string, { type: TypeProgramme; slug: string | null }>();
  for (const r of await db.getAllAsync<{ id: string; type: TypeProgramme; slug: string | null }>(
    `SELECT r.id, r.type, (SELECT e.slug FROM routine_exercices re JOIN exercices e ON e.id = re.exercice_id
       WHERE re.routine_id = r.id AND e.slug IS NOT NULL ORDER BY re.position LIMIT 1) AS slug FROM routines r`,
    [],
  ))
    routines.set(r.id, { type: r.type, slug: r.slug });
  const seances = new Map<string, string>();
  for (const x of await db.getAllAsync<{ id: string; slug: string | null }>(
    `SELECT se.id, (SELECT e.slug FROM seance_exercices x JOIN exercices e ON e.id = x.exercice_id
       WHERE x.seance_id = se.id AND e.slug IS NOT NULL ORDER BY x.position LIMIT 1) AS slug FROM seances se WHERE se.debut > ?`,
    [maintenant - 60 * 86_400_000],
  ))
    if (x.slug) seances.set(x.id, x.slug);
  return { routines, seances };
}

// ---------------------------------------------------------------- séance

/** Repos d'un exercice pendant la séance (pastille « Repos … ») ; dans un superset, le dernier porte le repos du tour. */
export async function changerReposSeance(db: Executeur, seanceId: string, exerciceId: string, reposS: number): Promise<void> {
  await db.runAsync("UPDATE seance_exercices SET repos_s = ? WHERE seance_id = ? AND exercice_id = ?", [reposS, seanceId, exerciceId]);
  // Réglé à la main, il remplace aussi les récups propres aux étapes (D3).
  await db.runAsync("UPDATE series SET repos_s = NULL WHERE seance_id = ? AND exercice_id = ? AND repos_s IS NOT NULL", [seanceId, exerciceId]);
}

/** Ajoute une série à la fin d'un exercice, reprise de la dernière (comme Hevy). */
export async function ajouterSerieA(
  db: Executeur,
  seanceId: string,
  exerciceId: string,
  groupe: number | null,
  v: { kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null },
  id?: string,
) {
  await ajouterSerie(db, {
    id, seanceId, exerciceId, groupeSuperset: groupe, kg: v.kg ?? undefined, reps: v.reps ?? undefined,
    dureeS: v.duree_s ?? undefined, distanceM: v.distance_m ?? undefined,
  });
}

/** Changements de nombre de séries que « Mettre à jour la routine » appliquerait (ancien → nouveau). */
export async function changementsRoutine(db: Executeur, s: SeanceDetail) {
  if (!s.seance.routine_id) return [];
  const r = await lireRoutine(db, s.seance.routine_id);
  const out: { ligneId: string; nom: string; avant: number; apres: number }[] = [];
  for (const l of r?.blocs.flatMap((b) => b.lignes) ?? []) {
    const n = s.exercices.find((e) => e.exercice.id === l.exercice_id)?.series.filter((x) => x.faite).length ?? 0;
    if (n > 0 && n !== l.nb_series) out.push({ ligneId: l.id, nom: l.exercice.nom, avant: l.nb_series, apres: n });
  }
  return out;
}

/**
 * État par défaut de « Mettre à jour la routine » : allumé seulement si aucune ligne ne perd de séries.
 * Une séance écourtée ne doit jamais rétrécir la routine sans qu'on le veuille.
 */
export function majRoutineParDefaut(changements: { avant: number; apres: number }[]): boolean {
  return changements.length > 0 && changements.every((c) => c.apres >= c.avant);
}

/**
 * Fin de séance : les séries non cochées sont retirées, la note enregistrée (la salle l'est déjà, par la pastille),
 * et la routine prend le nombre de séries fait si « Mettre à jour la routine » est allumé. Tout ou rien.
 */
export async function terminer(
  db: Executeur,
  s: SeanceDetail,
  o: { note?: string; message?: string; majRoutine: boolean; fin?: number },
): Promise<void> {
  await transaction(db, async (db) => {
    if (o.majRoutine) for (const c of await changementsRoutine(db, s)) await modifierLigneRoutine(db, c.ligneId, { nbSeries: c.apres });
    for (const e of s.exercices) for (const x of e.series) if (!x.faite) await supprimerSerie(db, x.id);
    // La note (privée) et le message (lu avec l'activité) sont deux champs : chacun n'est écrit que s'il est donné.
    await modifierSeance(db, s.seance.id, {
      ...(o.note === undefined ? {} : { note: o.note || null }),
      ...(o.message === undefined ? {} : { message: messageFinal(o.message) }),
    });
    await terminerSeance(db, s.seance.id, o.fin);
    await detecterEquipements(db, s.seance.id);
  });
  await consoliderSeance(db, s.seance.id);
}

/** Charge et répétitions d'une série (ligne « Meilleure série » de la progression). */
export function serieKgReps(db: Executeur, serieId: string) {
  return db.getFirstAsync<{ kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null; atteint: number }>(
    "SELECT s.kg, s.reps, s.duree_s, s.distance_m, se.debut AS atteint FROM series s JOIN seances se ON se.id = s.seance_id WHERE s.id = ?",
    [serieId],
  );
}
