// Activités détectées et reconnaissance (planche activite-detectee, validée le 29/10 ; logique pure dans
// ecrans/activite-detectee.ts, changer-activite.ts et reconnaissance.ts). Une journée se relit de ses sources (Whoop, Santé
// Connect, FC de la montre) dans activite_detectee : à associer, ignorée ou associée à une séance. Les choix de sport restent
// sur le téléphone (reconnaissance_choix, jamais synchronisée) ; seule la séance créée voyage.
import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { ecrireReglage, lireReglage } from "./reglages";
import { lireAge, lireSexe } from "./profil";
import { lireZonesFc } from "./zones-fc";
import { recalculerApresModification } from "./recalcul";
import { oublierEstimationCourse } from "./vma";
import { detecterEfforts, diagnostiquerJour, kcalBrutesSelonFc, SEUILS, TOLERANCE_SEANCE, type ActiviteDetectee, type Effort, type Plage, type SourceDetection } from "../../ecrans/activite-detectee";
import { programmeDe, type Prevue, type Programme } from "../../ecrans/activite-programmee";
import { instantDe, jourDe, lirePlanning } from "../../ecrans/planif-donnees";
import { seancesDesOccurrences } from "../../ecrans/planification";
import { lireLieuPrevu } from "./programmations";
import { ecrireDiagnosticActivites, noterEcartees, noterSources, suivreDiagnostic, type SourcesDetectionDiag } from "./diagnostic-activites";
import { contexteDe, MAX_CHOIX, reconnaitre, type Choix, type Contexte, type Pourquoi, type Reconnaissance } from "../../ecrans/reconnaissance";
import { COURSE, MUSCULATION, planChangement, SQL_SPORT, type Activite, type Changement, type SeanceAChanger } from "../../ecrans/changer-activite";
import { FC_REPOS_DEFAUT } from "../../ecrans/effort-jour";
import { sportDeLaSeance, type SportCatalogue } from "../../ecrans/sport-seance";
import { sportDeSeance } from "../sports";
import type { Sante } from "../../natif/sante/types";
import { REGLAGE as REGLAGE_WHOOP } from "../../whoop/constantes";
import { chargeWhoop, zonesWhoop } from "../../whoop/sports";

const JOUR = 86_400_000;
const MIN = 60_000;

export type EtatActivite = "a-associer" | "ignoree" | "associee";

export interface ActiviteLue extends ActiviteDetectee {
  etat: EtatActivite;
  seanceId: string | null;
  /** kcal métabolisme compris (Whoop : kJ ÷ 4,184 ; FC : Keytel) ; les actives se calculent avec le métabolisme du jour. */
  kcalBrutes: number | null;
}

type Ligne = {
  cle: string; source: SourceDetection; debut: number; fin: number; fc_moy: number | null; fc_max: number | null; pas: number | null;
  kcal: number | null; kcal_brutes: number | null; sport_brut: string | null; etat: EtatActivite; seance_id: string | null;
};
const lue = (l: Ligne): ActiviteLue => ({
  cle: l.cle, source: l.source, debut: l.debut, fin: l.fin, fcMoy: l.fc_moy, fcMax: l.fc_max, pas: l.pas, kcal: l.kcal,
  kcalBrutes: l.kcal_brutes, sportBrut: l.sport_brut, etat: l.etat, seanceId: l.seance_id,
});

/** Activités qui commencent dans [debut, fin), dans l'ordre. */
export async function lireActivites(db: Executeur, debut: number, fin: number): Promise<ActiviteLue[]> {
  const l = await db.getAllAsync<Ligne>("SELECT * FROM activite_detectee WHERE debut >= ? AND debut < ? ORDER BY debut", [debut, fin]);
  return l.map(lue);
}

/** Les activités associées dont la séance existe encore (celle dont la séance a disparu n'est plus une séance faite). */
async function associeesVivantes(db: Executeur, l: readonly ActiviteLue[]): Promise<ActiviteLue[]> {
  const a = l.filter((x) => x.etat === "associee" && x.seanceId != null);
  if (!a.length) return [];
  const ids = a.map((x) => x.seanceId!);
  const vivantes = new Set((await db.getAllAsync<{ id: string }>(`SELECT id FROM seances WHERE id IN (${ids.map(() => "?").join(", ")})`, ids)).map((x) => x.id));
  return a.filter((x) => vivantes.has(x.seanceId!));
}

/**
 * Activités « à associer » de [debut, fin) à proposer : jamais une que couvre déjà une séance du même créneau (à 10 min près) ou une
 * activité déjà associée. Une proposition restée en base d'avant la séance (ou d'avant la déconnexion de Whoop) n'est pas redemandée.
 */
export async function lireActivitesAProposer(db: Executeur, debut: number, fin: number): Promise<ActiviteLue[]> {
  const lues = (await lireActivites(db, debut, fin)).filter((a) => a.etat === "a-associer");
  if (!lues.length) return lues;
  const [seances, associees] = await Promise.all([
    db.getAllAsync<Plage>("SELECT debut, fin FROM seances WHERE fin IS NOT NULL AND debut < ? AND fin > ?", [fin + TOLERANCE_SEANCE, debut - TOLERANCE_SEANCE]),
    lireActivites(db, debut - JOUR, fin + JOUR).then((l) => associeesVivantes(db, l)),
  ]);
  return lues.filter((a) => ![...seances, ...associees].some((c) => a.debut < c.fin + TOLERANCE_SEANCE && c.debut < a.fin + TOLERANCE_SEANCE));
}

export async function lireActivite(db: Executeur, cle: string): Promise<ActiviteLue | null> {
  const l = await db.getFirstAsync<Ligne>("SELECT * FROM activite_detectee WHERE cle = ?", [cle]);
  return l ? lue(l) : null;
}

// ---- Réglages de la reconnaissance (D5 : les deux paliers activés par défaut) ------------------------------------------

export const REGLAGES_RECO = { proposer: "reco_proposer", auto: "reco_auto" } as const;

export async function lireReglagesReco(db: Executeur): Promise<{ proposer: boolean; auto: boolean }> {
  const [p, a] = await Promise.all([lireReglage(db, REGLAGES_RECO.proposer), lireReglage(db, REGLAGES_RECO.auto)]);
  return { proposer: p !== "0", auto: a !== "0" };
}

export const ecrireReglageReco = (db: Executeur, cle: keyof typeof REGLAGES_RECO, v: boolean) => ecrireReglage(db, REGLAGES_RECO[cle], v ? "1" : "0");

// ---- Profil de FC et corps ---------------------------------------------------------------------------------------------

export type ProfilFc = { fcRepos: number; fcMax: number };

export async function lireProfilFc(db: Executeur, maintenant = Date.now()): Promise<ProfilFc | null> {
  const z = await lireZonesFc(db, maintenant).catch(() => null);
  return z ? { fcRepos: z.fcRepos?.bpm ?? FC_REPOS_DEFAUT, fcMax: z.fcMax.bpm } : null;
}

async function lireCorps(db: Executeur, maintenant: number): Promise<{ kg: number | null; age: number | null; sexe: "h" | "f" | null }> {
  const [p, age, sexe] = await Promise.all([
    db.getFirstAsync<{ kg: number }>("SELECT kg FROM pesee ORDER BY date DESC LIMIT 1", []),
    lireAge(db, maintenant).catch(() => null),
    lireSexe(db).catch(() => null),
  ]);
  return { kg: p?.kg ?? null, age: age?.age ?? null, sexe: sexe === "h" || sexe === "f" ? sexe : null };
}

// ---- Une journée relue de ses sources -----------------------------------------------------------------------------------

export type SanteActivites = Pick<Sante, "seancesSport" | "pasIntervalles" | "fcEntre" | "nuits">;

/**
 * Relit les activités d'un jour (minuit local `jour`) : Whoop non nommées sans séance, séances « autre » des autres applis,
 * et, sans Whoop, les efforts nets de la FC de la montre. Une nouvelle activité arrive « à associer » (ou associée tout
 * de suite quand la reconnaissance est sûre, palier 2) ; une ignorée ou associée garde son état ; une « à associer » qui
 * a disparu (couverte par une séance, source effacée) est retirée.
 */
export async function rafraichirActivites(db: Executeur, jour: number, sante: SanteActivites, maintenant = Date.now()): Promise<{ ajoutees: number; posees: number }> {
  const finJour = jour + JOUR;
  const fin = Math.min(finJour, maintenant);
  if (fin <= jour) return { ajoutees: 0, posees: 0 };
  const [whoop, seances, existants, whoopConnecte, profil] = await Promise.all([
    db.getAllAsync<{ id: string; debut: number; fin: number; sport_id: number | null; zones: string | null; kj: number | null; fc_moy: number | null; fc_max: number | null; seance_id: string | null }>(
      "SELECT id, debut, fin, sport_id, zones, kj, fc_moy, fc_max, seance_id FROM whoop_seance WHERE debut >= ? AND debut < ?",
      [jour, finJour],
    ),
    db.getAllAsync<Plage>("SELECT debut, fin FROM seances WHERE fin IS NOT NULL AND debut < ? AND fin > ?", [finJour, jour]),
    lireActivites(db, jour, finJour),
    lireReglage(db, REGLAGE_WHOOP.connecte).then((v) => v === "1"),
    lireProfilFc(db, maintenant),
  ]);
  const sc = await sante.seancesSport(jour, finJour).catch(() => null);
  // Pas : lus seulement sur les plages candidates (une lecture chacune), pour reconnaître une marche
  const pasJour: (Plage & { n: number })[] = [];
  const lirePas = async (l: readonly Plage[]) => {
    for (const p of l) {
      if (pasJour.some((x) => x.debut === p.debut && x.fin === p.fin)) continue;
      const v = await sante.pasIntervalles([p.debut, p.fin]).catch(() => null);
      if (v?.[0] != null) pasJour.push({ debut: p.debut, fin: p.fin, n: v[0] });
    }
  };
  await lirePas(whoop.filter((w) => w.seance_id == null));
  // Une activité déjà associée (validée, reconnue d'office) garde son créneau, même si sa séance a changé d'heure ou si sa source
  // (Whoop) n'est plus là : ce créneau n'est jamais redemandé.
  const associees = await associeesVivantes(db, existants);
  const couvertes: Plage[] = [...seances, ...associees];
  let pepfit: Effort[] = [];
  const trace: SourcesDetectionDiag = {
    jour, le: maintenant, whoop_connecte: whoopConnecte, fc_sante: null, efforts_pepfit: [], activites: { whoop: 0, sante: 0, pepfit: 0 },
  };
  let fcJour: { t: number; bpm: number }[] = [];
  // Whoop déconnecté, journal gardé : les jours que Whoop a mesurés restent les siens, la FC de la montre n'y ajoute pas d'effort.
  // Whoop connecté : une activité qu'il a détectée sans que l'utilisateur l'ait traitée n'est pas encore un workout de son API
  // (09/11) : la FC de la montre la trouve, sans attendre Whoop.
  const dansLeJournal = !whoopConnecte && (await db.getFirstAsync("SELECT 1 AS x FROM whoop_jour WHERE jour = ? AND (kj IS NOT NULL OR recup IS NOT NULL OR sommeil_min IS NOT NULL)", [jour])) != null;
  // Une activité Whoop de 10 min ou plus (nommée, marche, déjà rattachée) est déjà dite par Whoop : la FC n'en refait pas une
  const plagesWhoop: Plage[] = whoop.filter((w) => w.fin - w.debut >= SEUILS.DUREE_MIN_CAPTEUR).map((w) => ({ debut: w.debut, fin: w.fin }));
  if (profil && (whoopConnecte || !dansLeJournal)) {
    const fcSc = await sante.fcEntre(jour, fin).catch(() => null);
    trace.fc_sante = fcSc ? fcSc.length : null;
    const fc = [...(fcSc ?? [])].sort((a, b) => a.t - b.t);
    fcJour = fc;
    if (fc.length) {
      const nuits = (await sante.nuits(jour - JOUR / 2, finJour).catch(() => null)) ?? [];
      const exclusions = [...seances, ...associees, ...plagesWhoop, ...nuits.map((n) => ({ debut: n.debut, fin: n.fin }))];
      // efforts d'après la FC seule, puis leurs pas, puis la marche ordinaire écartée
      await lirePas(detecterEfforts(fc, [], profil, exclusions));
      const efforts = detecterEfforts(fc, pasJour, profil, exclusions);
      // un effort qui court encore (dernier point haut à moins de PAUSE_MAX) n'est pas fini : la séance posée serait coupée, il attend
      pepfit = efforts.filter((e) => e.fin <= maintenant - SEUILS.PAUSE_MAX);
      trace.efforts_pepfit = efforts.map((e) => ({ debut: e.debut, fin: e.fin, en_cours: !pepfit.includes(e) }));
    }
  }
  const { gardees: candidats, ecartees } = diagnostiquerJour({
    whoop: whoop.map((w) => ({
      id: w.id, debut: w.debut, fin: w.fin, sportId: w.sport_id, charge: chargeWhoop({ debut: w.debut, fin: w.fin, zones: zonesWhoop(w.zones) }),
      fcMoy: w.fc_moy, fcMax: w.fc_max, kcal: null, seanceId: w.seance_id,
    })),
    sante: (sc ?? []).map((s) => ({ debut: s.debut, fin: s.fin, type: s.type, origine: s.origine, kcal: s.kcal, pas: s.pas })),
    pepfit,
    seances: couvertes,
    ignorees: existants.filter((a) => a.etat === "ignoree"),
    pasJour,
    profil,
  });
  noterEcartees({ debut: jour, fin: finJour }, ecartees, maintenant);
  const kj = new Map(whoop.map((w) => [`whoop:${w.id}`, w.kj]));
  const corps = candidats.some((c) => c.source === "pepfit" || (c.source === "whoop" && !kj.has(c.cle))) ? await lireCorps(db, maintenant) : null;
  const brutes = (c: ActiviteDetectee): number | null => {
    if (c.source === "whoop" && !kj.has(c.cle)) return c.fcMoy != null && corps ? kcalBrutesSelonFc(c.fcMoy, (c.fin - c.debut) / MIN, corps) : null; // détection en attente : d'après la FC
    if (c.source === "whoop") return kj.get(c.cle) != null ? kj.get(c.cle)! / 4.184 : null;
    if (c.source === "pepfit" && c.fcMoy != null && corps) return kcalBrutesSelonFc(c.fcMoy, (c.fin - c.debut) / MIN, corps);
    return null;
  };
  const parCle = new Map(existants.map((a) => [a.cle, a]));
  const nouvelles: ActiviteLue[] = [];
  for (const c of candidats) {
    const b = brutes(c);
    const e = parCle.get(c.cle);
    if (e) {
      if (e.etat === "a-associer") {
        await db.runAsync(
          "UPDATE activite_detectee SET debut = ?, fin = ?, fc_moy = ?, fc_max = ?, pas = ?, kcal = ?, kcal_brutes = ?, sport_brut = ?, maj_le = ? WHERE cle = ?",
          [c.debut, c.fin, c.fcMoy, c.fcMax, c.pas, c.kcal, b, c.sportBrut, maintenant, c.cle],
        );
      }
      continue;
    }
    await db.runAsync(
      `INSERT INTO activite_detectee (cle, source, debut, fin, fc_moy, fc_max, pas, kcal, kcal_brutes, sport_brut, etat, seance_id, maj_le)
       VALUES (?,?,?,?,?,?,?,?,?,?,'a-associer',NULL,?)`,
      [c.cle, c.source, c.debut, c.fin, c.fcMoy, c.fcMax, c.pas, c.kcal, b, c.sportBrut, maintenant],
    );
    nouvelles.push({ ...c, etat: "a-associer", seanceId: null, kcalBrutes: b });
  }
  for (const e of existants) {
    if (e.etat === "a-associer" && !candidats.some((c) => c.cle === e.cle)) await db.runAsync("DELETE FROM activite_detectee WHERE cle = ?", [e.cle]);
  }
  let posees = 0;
  const reglages = await lireReglagesReco(db);
  if (reglages.auto && nouvelles.length) {
    const choix = await lireChoix(db, maintenant);
    // la séance prévue que l'activité recoupe passe avant l'habitude : « prévu à 8:00 » (un recoupement net seulement)
    const programmes = await lireProgrammes(db, nouvelles, maintenant).catch(() => new Map<string, Programme>());
    for (const a of nouvelles) {
      const prog = programmes.get(a.cle);
      // la FC de l'effort : celle du jour relue (la montre), pour un effort de pepfit ou une activité Whoop sans kJ
      const lireFc = async () => (a.source === "pepfit" || (a.source === "whoop" && !kj.has(a.cle)) ? fcJour.filter((e) => e.t >= a.debut && e.t <= a.fin) : null);
      if (prog?.net && prog.prevue.sport) {
        const act = await lireActiviteCatalogue(db, prog.prevue.sport);
        if (act) {
          await associerActivite(db, a, act, { reconnu: pourquoiProgramme(prog.prevue), programme: prog.prevue, profil, fc: await lireFc(), maintenant });
          posees++;
          continue;
        }
      }
      const r = reconnaitre(contexteDe(a, profil), choix, maintenant);
      if (r.palier !== "auto") continue;
      const act = await lireActiviteCatalogue(db, r.sport);
      if (!act) continue;
      await associerActivite(db, a, act, { reconnu: r.pourquoi, profil, fc: await lireFc(), maintenant });
      posees++;
    }
  }
  trace.activites = { whoop: candidats.filter((c) => c.source === "whoop").length, sante: candidats.filter((c) => c.source === "sante").length, pepfit: candidats.filter((c) => c.source === "pepfit").length };
  noterSources(trace);
  // Le diagnostic se relit sans retarder la relecture de l'écran (attendreDiagnostics : les tests l'attendent)
  ecrireDiagnostic("relecture-jour", db, maintenant, sante);
  return { ajoutees: nouvelles.length, posees };
}

/** Écrit diagnostic-activites.json en arrière-plan : jamais d'erreur, jamais d'attente. */
function ecrireDiagnostic(motif: string, db: Executeur, maintenant: number, sante: Pick<SanteActivites, "seancesSport">): void {
  suivreDiagnostic(ecrireDiagnosticActivites(db, { motif, maintenant, sante }));
}

/** Le « pourquoi » d'une activité reconnue d'après le programme : l'heure prévue (et le lieu prévu). */
export const pourquoiProgramme = (p: Prevue): Pourquoi => ({ n: 0, prevuA: p.heure, ...(p.lieu ? { lieuId: p.lieu.id } : {}) });

// ---- Le programme du jour : la séance prévue que l'activité recoupe ---------------------------------------------------------

/**
 * Séances prévues du jour `j` (« 2026-11-08 ») qui ne sont pas déjà faites (une séance terminée du même sport sur leur créneau
 * les valide : planification.ts), avec leur heure, leur durée voulue, le sport de leur routine et leur lieu prévu.
 */
export async function lirePrevuesDuJour(db: Executeur, j: string, maintenant = Date.now()): Promise<Prevue[]> {
  const p = await lirePlanning(db, j, j, maintenant);
  const validees = seancesDesOccurrences(p.occ, p.jours);
  const out: Prevue[] = [];
  for (const o of p.occ) {
    if (o.date !== j || validees.has(o)) continue;
    const reglage = p.reglages.get(o.programmationId);
    out.push({
      programmationId: o.programmationId, origine: o.origine, heure: o.heure, debut: instantDe(o.date, o.heure),
      dureeMin: reglage?.dureeMin ?? o.dureeMin ?? 0, sport: o.sport ?? reglage?.sport ?? null,
      lieu: (await lireLieuPrevu(db, o.programmationId, o.origine)) ?? null,
    });
  }
  return out;
}

/**
 * La séance prévue de chaque activité qui en recoupe une (programmeDe), par clé d'activité. Une séance prévue n'a qu'une
 * activité : la plus proche de son heure.
 */
export async function lireProgrammes(db: Executeur, l: readonly Pick<ActiviteDetectee, "cle" | "debut" | "fin">[], maintenant = Date.now()): Promise<Map<string, Programme>> {
  const parJour = new Map<string, Prevue[]>();
  const trouves: { cle: string; p: Programme }[] = [];
  for (const a of l) {
    const j = jourDe(a.debut);
    let prevues = parJour.get(j);
    if (!prevues) parJour.set(j, (prevues = await lirePrevuesDuJour(db, j, maintenant)));
    const p = programmeDe(a, prevues);
    if (p) trouves.push({ cle: a.cle, p });
  }
  trouves.sort((x, y) => Math.abs(x.p.ecartMs) - Math.abs(y.p.ecartMs));
  const out = new Map<string, Programme>();
  const prises = new Set<string>();
  for (const { cle, p } of trouves) {
    const k = `${p.prevue.programmationId}|${p.prevue.origine}`;
    if (prises.has(k)) continue;
    prises.add(k);
    out.set(cle, p);
  }
  return out;
}

// ---- Associer, ignorer ----------------------------------------------------------------------------------------------------

/** Une activité du catalogue (« cat:padel »), ou null. */
export async function lireActiviteCatalogue(db: Executeur, id: string): Promise<Activite | null> {
  return db.getFirstAsync<Activite>("SELECT id, slug, nom, categorie FROM exercices WHERE id = ?", [id]);
}

/**
 * Sport d'une séance (image en tête de sa page, pas Whoop attendus) : sa marque, son exercice de sport, le type de sa routine,
 * à défaut son nom (sport-seance.ts). null pour une séance de musculation ou sans sport reconnu.
 */
export async function lireSportSeance(db: Executeur, seanceId: string): Promise<Activite | null> {
  return (await lireSportsSeances(db, [seanceId])).get(seanceId) ?? null;
}

/** Le sport de plusieurs séances (lireSportSeance), en quatre requêtes pour tout le lot : une page du Fil. */
export async function lireSportsSeances(db: Executeur, ids: readonly string[]): Promise<Map<string, Activite | null>> {
  const sortie = new Map<string, Activite | null>();
  if (!ids.length) return sortie;
  const marques = ids.map(() => "?").join(", ");
  const [seances, lies, activites] = await Promise.all([
    db.getAllAsync<{ id: string; activite_id: string | null; titre: string | null; routine_nom: string | null; routine_type: string | null }>(
      `SELECT s.id, s.activite_id, s.titre, r.nom AS routine_nom, r.type AS routine_type FROM seances s LEFT JOIN routines r ON r.id = s.routine_id WHERE s.id IN (${marques})`,
      [...ids],
    ),
    db.getAllAsync<Activite & { sport: number; seance_id: string }>(
      `SELECT x.seance_id, e.id, e.slug, e.nom, e.categorie, ${SQL_SPORT} AS sport FROM exercices e
       JOIN (SELECT seance_id, exercice_id, position FROM seance_exercices WHERE seance_id IN (${marques}) UNION SELECT seance_id, exercice_id, 999 FROM series WHERE seance_id IN (${marques})) x ON x.exercice_id = e.id
       ORDER BY x.seance_id, x.position`,
      [...ids, ...ids],
    ),
    db.getAllAsync<SportCatalogue>("SELECT id, slug, nom, nom_en, categorie FROM exercices e WHERE e.whoop_ids IS NOT NULL AND e.id != ?", [MUSCULATION]),
  ]);
  const idsMarque = [...new Set(seances.map((s) => s.activite_id).filter((a): a is string => !!a && a !== MUSCULATION))];
  const marquesLues = idsMarque.length
    ? await db.getAllAsync<Activite>(`SELECT id, slug, nom, categorie FROM exercices WHERE id IN (${idsMarque.map(() => "?").join(", ")})`, idsMarque)
    : [];
  const marqueDe = new Map(marquesLues.map((m) => [m.id, m]));
  for (const s of seances) {
    const exos = lies.filter((e) => e.seance_id === s.id);
    // un sport nommé l'emporte (padel avec un échauffement reste du padel : db/sports.ts) ; sinon l'exercice unique d'un sport
    const sportif = exos.filter((e) => e.sport && e.id !== MUSCULATION);
    const nomme = sportif.find((e) => !["autre", "muscu"].includes(sportDeSeance([{ slug: e.slug, categorie: e.categorie, perso: 0 }])));
    const exercice = nomme ?? (exos.length === 1 ? (sportif[0] ?? null) : null);
    const marque = s.activite_id && s.activite_id !== MUSCULATION ? (marqueDe.get(s.activite_id) ?? null) : null;
    sortie.set(s.id, sportDeLaSeance({ marque, exercice: exercice ? { id: exercice.id, slug: exercice.slug, nom: exercice.nom, categorie: exercice.categorie } : null, typeRoutine: s.routine_type, noms: [s.titre, s.routine_nom] }, activites));
  }
  return sortie;
}

/** Sport d'une routine (image du lieu d'une séance prévue) : son exercice de sport, le type de la routine, à défaut son nom. */
export async function lireSportRoutine(db: Executeur, routineId: string): Promise<Activite | null> {
  const r = await db.getFirstAsync<{ nom: string | null; type: string | null }>("SELECT nom, type FROM routines WHERE id = ?", [routineId]);
  if (!r) return null;
  const [exos, activites] = await Promise.all([
    db.getAllAsync<Activite & { sport: number }>(
      `SELECT e.id, e.slug, e.nom, e.categorie, ${SQL_SPORT} AS sport FROM exercices e
       JOIN routine_exercices x ON x.exercice_id = e.id WHERE x.routine_id = ? ORDER BY x.position`,
      [routineId],
    ),
    db.getAllAsync<SportCatalogue>("SELECT id, slug, nom, nom_en, categorie FROM exercices e WHERE e.whoop_ids IS NOT NULL AND e.id != ?", [MUSCULATION]),
  ]);
  // même choix que pour une séance (lireSportSeance)
  const sportif = exos.filter((e) => e.sport && e.id !== MUSCULATION);
  const nomme = sportif.find((e) => !["autre", "muscu"].includes(sportDeSeance([{ slug: e.slug, categorie: e.categorie, perso: 0 }])));
  const exercice = nomme ?? (exos.length === 1 ? (sportif[0] ?? null) : null);
  return sportDeLaSeance({ marque: null, exercice: exercice ? { id: exercice.id, slug: exercice.slug, nom: exercice.nom, categorie: exercice.categorie } : null, typeRoutine: r.type, noms: [r.nom] }, activites);
}

/** Ce que pepfit propose pour une activité, selon les réglages : rien si « Proposer un sport » est coupé. */
export async function reconnaissanceDe(db: Executeur, a: ActiviteDetectee, profil: ProfilFc | null, maintenant = Date.now()): Promise<Reconnaissance> {
  const r = await lireReglagesReco(db);
  if (!r.proposer) return { palier: "aucun" };
  const res = reconnaitre(contexteDe(a, profil), await lireChoix(db, maintenant), maintenant);
  // la feuille ne pose jamais rien : un « auto » non posé (palier coupé ou activité d'avant) reste une suggestion
  return res.palier === "auto" ? { ...res, palier: "suggestion" } : res;
}

/**
 * L'activité devient une séance de ce sport : l'activité du catalogue et une série de sa durée (la distance de Whoop), la
 * séance Whoop rattachée, la FC de la montre gardée (effort et zones), puis le choix retenu pour la reconnaissance (pas
 * pour un sport posé par pepfit : il n'apprendrait que de lui-même). `refuse` : le sport proposé que l'utilisateur a écarté.
 * `programme` : la séance prévue que l'activité remplace ; la séance créée prend son lieu, et, du même sport sur son créneau, elle la
 * valide (planification.ts : « faite » au lieu de « prévue » ou « manquée »).
 */
export async function associerActivite(
  db: Executeur,
  a: ActiviteLue,
  act: Activite,
  o: { reconnu?: Pourquoi | null; refuse?: string | null; programme?: Prevue | null; profil: ProfilFc | null; fc?: readonly { t: number; bpm: number }[] | null; maintenant?: number },
): Promise<string> {
  const maintenant = o.maintenant ?? Date.now();
  const id = nouvelId();
  const whoopId = a.source === "whoop" ? a.cle.slice("whoop:".length) : null;
  const w = whoopId ? await db.getFirstAsync<{ distance_m: number | null }>("SELECT distance_m FROM whoop_seance WHERE id = ?", [whoopId]) : null;
  await transaction(db, async (db) => {
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, source_ref, reconnu, salle_id, maj_le) VALUES (?,?,?,?,?,?,?,?)", [
      id, act.nom, a.debut, a.fin, a.cle, o.reconnu ? JSON.stringify({ sport: act.id, pourquoi: o.reconnu }) : null, o.programme?.lieu?.id ?? null, maintenant,
    ]);
    await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,0)", [id, act.id]);
    await db.runAsync(
      "INSERT INTO series (id, seance_id, exercice_id, position, type, duree_s, distance_m, faite, fait_le) VALUES (?,?,?,0,'normale',?,?,1,?)",
      [nouvelId(), id, act.id, Math.round((a.fin - a.debut) / 1000), w?.distance_m && w.distance_m > 0 ? w.distance_m : null, a.fin],
    );
    if (whoopId) await db.runAsync("UPDATE whoop_seance SET seance_id = ? WHERE id = ?", [id, whoopId]);
    for (const e of o.fc ?? []) {
      if (e.t >= a.debut && e.t <= a.fin) await db.runAsync("INSERT OR IGNORE INTO seance_fc (seance_id, t, s, bpm) VALUES (?,?,?,?)", [id, e.t, e.t - a.debut, Math.round(e.bpm)]);
    }
    await db.runAsync("UPDATE activite_detectee SET etat = 'associee', seance_id = ?, maj_le = ? WHERE cle = ?", [id, maintenant, a.cle]);
    if (!o.reconnu) await ajouterChoix(db, { contexte: contexteDe({ ...a, lieuId: o.programme?.lieu?.id ?? null }, o.profil), sport: act.id, refuse: o.refuse ?? null, le: maintenant }, id);
  });
  await recalculerApresModification(db, id, [act.id]);
  return id;
}

/** Ignorer : l'activité quitte la journée, ses kcal restent dans les pas du quotidien (D3). */
export async function ignorerActivite(db: Executeur, cle: string, maintenant = Date.now()): Promise<void> {
  await db.runAsync("UPDATE activite_detectee SET etat = 'ignoree', maj_le = ? WHERE cle = ? AND etat = 'a-associer'", [maintenant, cle]);
}

/** « Annuler » après Ignorer. */
export async function retablirActivite(db: Executeur, cle: string, maintenant = Date.now()): Promise<void> {
  await db.runAsync("UPDATE activite_detectee SET etat = 'a-associer', maj_le = ? WHERE cle = ? AND etat = 'ignoree'", [maintenant, cle]);
}

// ---- Choix retenus (reconnaissance) ---------------------------------------------------------------------------------------

async function ajouterChoix(db: Executeur, c: Choix, seanceId: string | null): Promise<void> {
  await db.runAsync("INSERT INTO reconnaissance_choix (id, sport, refuse, detectee, seance_id, contexte, le) VALUES (?,?,?,?,?,?,?)", [
    nouvelId(), c.sport, c.refuse ?? null, c.detectee === false ? 0 : 1, seanceId, JSON.stringify(c.contexte), c.le,
  ]);
  // on ne garde que les plus récents
  await db.runAsync("DELETE FROM reconnaissance_choix WHERE id NOT IN (SELECT id FROM reconnaissance_choix ORDER BY le DESC LIMIT ?)", [MAX_CHOIX]);
}

/** Origines des séances que pepfit crée pour une activité : leurs choix sont déjà dans reconnaissance_choix. */
const SANS_SEANCES_DETECTEES = "(s.source_ref IS NULL OR (s.source_ref NOT LIKE 'whoop:%' AND s.source_ref NOT LIKE 'ancien-whoop:%' AND s.source_ref NOT LIKE 'sante:%' AND s.source_ref NOT LIKE 'pepfit:%'))";

/**
 * Choix pour la reconnaissance : ceux faits sur des activités détectées, puis les séances lancées par l'utilisateur dans
 * l'année (D4 : elles aident la suggestion, jamais l'automatique), avec leur jour, leur heure, leur durée et leur lieu.
 */
export async function lireChoix(db: Executeur, maintenant = Date.now()): Promise<Choix[]> {
  const [stockes, seances] = await Promise.all([
    db.getAllAsync<{ sport: string; refuse: string | null; detectee: number; contexte: string; le: number }>(
      "SELECT sport, refuse, detectee, contexte, le FROM reconnaissance_choix ORDER BY le DESC LIMIT ?",
      [MAX_CHOIX],
    ),
    db.getAllAsync<{ debut: number; fin: number; salle_id: string | null; sport: string | null }>(
      `SELECT s.debut, s.fin, s.salle_id,
         COALESCE(s.activite_id,
           (SELECT se.exercice_id FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id WHERE se.seance_id = s.id AND ${SQL_SPORT} ORDER BY se.position LIMIT 1),
           (SELECT '${MUSCULATION}' FROM seance_exercices se WHERE se.seance_id = s.id LIMIT 1)) AS sport
       FROM seances s WHERE s.fin IS NOT NULL AND s.debut >= ? AND ${SANS_SEANCES_DETECTEES}
       ORDER BY s.debut DESC LIMIT 200`,
      [maintenant - 365 * JOUR],
    ),
  ]);
  const choix: Choix[] = [];
  for (const c of stockes) {
    try {
      choix.push({ contexte: JSON.parse(c.contexte) as Contexte, sport: c.sport, refuse: c.refuse, detectee: c.detectee !== 0, le: c.le });
    } catch {
      // contexte illisible : ignoré
    }
  }
  for (const s of seances) {
    if (!s.sport) continue;
    choix.push({ contexte: contexteDe({ debut: s.debut, fin: s.fin, fcMoy: null, pas: null, sportBrut: null, lieuId: s.salle_id }, null), sport: s.sport, detectee: false, le: s.debut });
  }
  return choix;
}

/** « Oublier ce que pepfit a appris » : les choix seulement ; les séances, elles, restent. */
export async function oublierChoix(db: Executeur): Promise<void> {
  await db.runAsync("DELETE FROM reconnaissance_choix", []);
}

/** Oublier une habitude : les choix de ce sport. */
export async function oublierHabitude(db: Executeur, sport: string): Promise<void> {
  await db.runAsync("DELETE FROM reconnaissance_choix WHERE sport = ?", [sport]);
}

/** Habitudes apprises (choix faits sur des activités détectées), par sport : pour « Ce que pepfit a appris ». */
export async function lireHabitudes(db: Executeur): Promise<{ sport: string; n: number; contextes: Contexte[] }[]> {
  const l = await db.getAllAsync<{ sport: string; contexte: string }>("SELECT sport, contexte FROM reconnaissance_choix ORDER BY le DESC", []);
  const par = new Map<string, Contexte[]>();
  for (const x of l) {
    try {
      par.set(x.sport, [...(par.get(x.sport) ?? []), JSON.parse(x.contexte) as Contexte]);
    } catch {
      // ignoré
    }
  }
  return [...par.entries()].map(([sport, contextes]) => ({ sport, n: contextes.length, contextes })).sort((a, b) => b.n - a.n);
}

// ---- Changer d'activité -------------------------------------------------------------------------------------------------

export interface SeanceLue extends SeanceAChanger {
  id: string;
  debut: number;
  fin: number | null;
  /** Sport posé par pepfit et sa raison (« Reconnu : Padel »), tant que l'utilisateur ne l'a pas changé. */
  reconnu: { sport: string; pourquoi: Pourquoi } | null;
  sourceRef: string | null;
}

/** Ce qu'il faut savoir d'une séance pour en changer le sport (planChangement). */
export async function lireSeanceAChanger(db: Executeur, seanceId: string): Promise<SeanceLue | null> {
  const s = await db.getFirstAsync<{ titre: string | null; debut: number; fin: number | null; activite_id: string | null; reconnu: string | null; source_ref: string | null }>(
    "SELECT titre, debut, fin, activite_id, reconnu, source_ref FROM seances WHERE id = ?",
    [seanceId],
  );
  if (!s) return null;
  const exos = await db.getAllAsync<Activite & { perso: number; series: number; sport: number }>(
    `SELECT e.id, e.slug, e.nom, e.categorie, e.perso, ${SQL_SPORT} AS sport,
       (SELECT COUNT(*) FROM series x WHERE x.seance_id = se.seance_id AND x.exercice_id = e.id AND x.faite = 1) AS series
     FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id WHERE se.seance_id = ? ORDER BY se.position`,
    [seanceId],
  );
  const seule = exos.length === 1 && exos[0]!.sport ? exos[0]! : null;
  const activite = s.activite_id ? await lireActiviteCatalogue(db, s.activite_id) : seule ? { id: seule.id, slug: seule.slug, nom: seule.nom, categorie: seule.categorie } : null;
  const [suivi, fc, whoop, distance, vma] = await Promise.all([
    db.getFirstAsync<{ n: number }>("SELECT 1 AS n FROM suivi_seance WHERE seance_id = ? AND mode = 'course'", [seanceId]),
    db.getFirstAsync<{ n: number }>("SELECT 1 AS n FROM seance_fc WHERE seance_id = ? LIMIT 1", [seanceId]),
    db.getFirstAsync<{ kj: number | null; fc_moy: number | null; zones: string | null }>("SELECT kj, fc_moy, zones FROM whoop_seance WHERE seance_id = ? ORDER BY fin - debut DESC LIMIT 1", [seanceId]),
    db.getFirstAsync<{ m: number | null }>("SELECT SUM(distance_m) AS m FROM series WHERE seance_id = ? AND faite = 1", [seanceId]),
    db.getFirstAsync<{ n: number }>("SELECT 1 AS n FROM mesure_corps WHERE type = 'vma_course' AND origine = ? AND valeur > 0", [seanceId]),
  ]);
  let reconnu: SeanceLue["reconnu"] = null;
  try {
    reconnu = s.reconnu ? (JSON.parse(s.reconnu) as SeanceLue["reconnu"]) : null;
  } catch {
    reconnu = null;
  }
  return {
    id: seanceId,
    debut: s.debut,
    fin: s.fin,
    activite,
    exercices: (seule && !s.activite_id ? [] : exos).map((e) => ({ id: e.id, slug: e.slug, categorie: e.categorie, perso: e.perso, series: e.series })),
    titre: s.titre,
    trace: !!suivi,
    distanceM: distance?.m ?? 0,
    fc: !!fc || whoop?.fc_moy != null || whoop?.zones != null,
    vmaEstimee: !!vma,
    reconnu,
    sourceRef: s.source_ref,
  };
}

/**
 * Change le sport d'une séance (planChangement) : l'activité remplacée ou posée, ou la séance marquée (ses exercices
 * restent) ; le titre s'il était le nom du sport ; la VMA de la course oubliée (recalculée si c'en est une) ; records et
 * statistiques recalculés. Une séance « Reconnu » corrigée, ou issue d'une activité détectée, apprend le nouveau choix
 * (le sport écarté compte contre lui).
 */
export async function changerActivite(db: Executeur, seanceId: string, vers: Activite, maintenant = Date.now()): Promise<Changement | null> {
  const s = await lireSeanceAChanger(db, seanceId);
  if (!s) return null;
  const plan = planChangement(s, vers);
  if (plan.inchange) return plan;
  const de = s.activite?.id ?? null;
  const ecr = plan.ecriture;
  await transaction(db, async (db) => {
    if (ecr.genre === "remplacer") {
      const pos = await db.getFirstAsync<{ position: number }>("SELECT position FROM seance_exercices WHERE seance_id = ? AND exercice_id = ?", [seanceId, ecr.de]);
      await db.runAsync("DELETE FROM seance_exercices WHERE seance_id = ? AND exercice_id = ?", [seanceId, ecr.de]);
      await db.runAsync("INSERT OR IGNORE INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,?)", [seanceId, ecr.vers, pos?.position ?? 0]);
      await db.runAsync("UPDATE series SET exercice_id = ? WHERE seance_id = ? AND exercice_id = ?", [ecr.vers, seanceId, ecr.de]);
      await db.runAsync("UPDATE notes SET exercice_id = ?, maj_le = ? WHERE seance_id = ? AND exercice_id = ?", [ecr.vers, maintenant, seanceId, ecr.de]);
    } else if (ecr.genre === "poser") {
      await db.runAsync("INSERT OR IGNORE INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,0)", [seanceId, ecr.activite]);
      const duree = s.fin ? Math.round((s.fin - s.debut) / 1000) : null;
      await db.runAsync(
        "INSERT INTO series (id, seance_id, exercice_id, position, type, duree_s, distance_m, faite, fait_le) VALUES (?,?,?,0,'normale',?,NULL,1,?)",
        [nouvelId(), seanceId, ecr.activite, duree, s.fin ?? maintenant],
      );
    } else {
      await db.runAsync("UPDATE seances SET activite_id = ? WHERE id = ?", [ecr.activite, seanceId]);
    }
    await db.runAsync("UPDATE seances SET titre = COALESCE(?, titre), reconnu = NULL, maj_le = ? WHERE id = ?", [plan.titre, maintenant, seanceId]);
    // apprendre : une séance reconnue corrigée, ou issue d'une activité détectée
    const detectee = await db.getFirstAsync<Ligne>("SELECT * FROM activite_detectee WHERE seance_id = ?", [seanceId]);
    if (detectee || s.reconnu) {
      const contexte = detectee ? contexteDe(lue(detectee), await lireProfilFc(db, maintenant)) : contexteDe({ debut: s.debut, fin: s.fin ?? s.debut, fcMoy: null, pas: null, sportBrut: null }, null);
      await db.runAsync("DELETE FROM reconnaissance_choix WHERE seance_id = ?", [seanceId]);
      await ajouterChoix(db, { contexte, sport: vers.id, refuse: s.reconnu?.sport ?? de, le: maintenant }, seanceId);
    }
  });
  if (plan.vma || de === COURSE || vers.id === COURSE) await oublierEstimationCourse(db, seanceId);
  await recalculerApresModification(db, seanceId, [...new Set([de, vers.id].filter((x): x is string => x != null))]);
  return plan;
}
