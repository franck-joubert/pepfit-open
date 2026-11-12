// Données de « Récupérer » (planche recuperer, 31/10) : les sessions de sieste et d'activités de récupération dans
// recup_activite (migration 59, synchronisée), jamais un effet ni un score ; les règles sont dans recuperer.ts.
//
// - Enregistrer : le minuteur (« Je suis réveillé », fin de l'alarme), « Libre », la saisie après coup, l'import.
// - Sans doublon : après chaque écriture, les sessions du jour passent par `doublons` (une session pepfit absorbe la mesure
//   de l'appareil, Whoop prime entre deux appareils) ; un import déjà vu (id_externe, même supprimé) ne revient pas.
// - Les imports : les siestes (nap) et les activités de récupération de Whoop, les sessions de sommeil de journée (D4) et
//   les étirements et la respiration guidée de Santé Connect.
// - La Récupération lit les siestes ici (siestesParJour) ; « Ce qui marche pour toi » lit les nuits (recup_nuit) et les jours
//   des activités.
import type { Executeur } from "../db/executeur";
import { nouvelId } from "../db/id";
import type { SeanceSport, SommeilNuit } from "../natif/sante/types";
import type { SeanceConvertie, SommeilWhoop } from "../whoop/types";
import {
  doublons, estSiesteSante, estTypeRecup, marche, RECUPERER, SANTE_RECUP, sommeilSieste, WHOOP_RECUP, type EtatMarche, type ModeRecup, type Ressenti,
  type SessionRecup, type TypeRecup,
} from "./recuperer";
import { decalerIso, RECUP } from "./recup-pepfit";

const MIN = 60_000;
const deux = (n: number) => String(n).padStart(2, "0");
/** AAAA-MM-JJ local d'un instant. */
export const isoJour = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
};
const minuitDe = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const decaler = (jour: number, n: number) => {
  const d = new Date(jour);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
};

/** Une session telle que l'appli la lit. */
export interface ActiviteFaite {
  id: string;
  type: TypeRecup;
  debut: number;
  fin: number;
  mode: ModeRecup;
  /** Durée choisie (minutes) ; null en libre ou à l'import. */
  choisi: number | null;
  /** Sommeil mesuré par l'appareil (sieste) ; null sinon. */
  sommeilMin: number | null;
  fcMoy: number | null;
  fcDebut: number | null;
  fcFin: number | null;
  ressenti: Ressenti | null;
  /** « pepfit », « whoop » ou le paquet d'une appli de Santé Connect. */
  sources: string[];
  idExterne: string | null;
  /** Horaires lus chez l'appareil, gardés quand la personne les a modifiés (migration 182) ; null : pas modifiée. */
  debutOrig: number | null;
  finOrig: number | null;
}

interface Ligne {
  id: string;
  type: string;
  debut: number;
  fin: number;
  mode: string;
  duree_choisie_min: number | null;
  sommeil_min: number | null;
  fc_moy: number | null;
  fc_debut: number | null;
  fc_fin: number | null;
  ressenti: string | null;
  sources: string | null;
  id_externe: string | null;
  supprime: number;
  debut_orig?: number | null;
  fin_orig?: number | null;
}

const lireSources = (s: string | null): string[] => {
  try {
    const l = s ? JSON.parse(s) : null;
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const MODES = new Set(["minuteur", "libre", "apres-coup", "import"]);
const deLigne = (l: Ligne): ActiviteFaite | null =>
  estTypeRecup(l.type)
    ? {
        id: l.id,
        type: l.type,
        debut: l.debut,
        fin: l.fin,
        mode: (MODES.has(l.mode) ? l.mode : "apres-coup") as ModeRecup,
        choisi: l.duree_choisie_min,
        sommeilMin: l.sommeil_min,
        fcMoy: l.fc_moy,
        fcDebut: l.fc_debut,
        fcFin: l.fc_fin,
        ressenti: l.ressenti === "repose" || l.ressenti === "pareil" || l.ressenti === "fatigue" ? l.ressenti : null,
        sources: lireSources(l.sources),
        idExterne: l.id_externe,
        debutOrig: l.debut_orig ?? null,
        finOrig: l.fin_orig ?? null,
      }
    : null;

/** Les sessions vivantes qui commencent dans [debut, fin), dans l'ordre. */
export async function lireRecupEntre(db: Executeur, debut: number, fin: number): Promise<ActiviteFaite[]> {
  const l = await db
    .getAllAsync<Ligne>("SELECT * FROM recup_activite WHERE supprime = 0 AND debut >= ? AND debut < ? ORDER BY debut", [debut, fin])
    .catch((): Ligne[] => []);
  return l.map(deLigne).filter((x): x is ActiviteFaite => x != null);
}

/** Une session vivante, par son identifiant. */
export async function lireRecup(db: Executeur, id: string): Promise<ActiviteFaite | null> {
  const l = await db.getFirstAsync<Ligne>("SELECT * FROM recup_activite WHERE id = ? AND supprime = 0", [id]).catch(() => null);
  return l ? deLigne(l) : null;
}

/** La dernière session d'un type : la saisie après coup est pré-remplie comme elle (D11). */
export async function derniereDuType(db: Executeur, type: TypeRecup): Promise<ActiviteFaite | null> {
  const l = await db.getFirstAsync<Ligne>("SELECT * FROM recup_activite WHERE supprime = 0 AND type = ? ORDER BY debut DESC LIMIT 1", [type]).catch(() => null);
  return l ? deLigne(l) : null;
}

export interface NouvelleRecup {
  id?: string;
  type: TypeRecup;
  debut: number;
  fin: number;
  mode: ModeRecup;
  choisi?: number | null;
  sommeilMin?: number | null;
  fcMoy?: number | null;
  fcDebut?: number | null;
  fcFin?: number | null;
  ressenti?: Ressenti | null;
  sources?: string[];
  idExterne?: string | null;
}

/** Écrit une session (créée ou remplacée), puis fusionne les doublons de son jour. Rend son identifiant. */
export async function enregistrerRecup(db: Executeur, a: NouvelleRecup, maintenant = Date.now()): Promise<string> {
  const id = a.id ?? nouvelId();
  const fin = Math.max(a.debut + MIN, a.fin);
  await db.runAsync(
    `INSERT INTO recup_activite (id, type, debut, fin, mode, duree_choisie_min, sommeil_min, fc_moy, fc_debut, fc_fin, ressenti, sources, id_externe, supprime, cree_le, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT (id) DO UPDATE SET type = excluded.type, debut = excluded.debut, fin = excluded.fin, mode = excluded.mode,
       duree_choisie_min = excluded.duree_choisie_min, sommeil_min = excluded.sommeil_min, fc_moy = excluded.fc_moy, fc_debut = excluded.fc_debut,
       fc_fin = excluded.fc_fin, ressenti = excluded.ressenti, sources = excluded.sources, id_externe = excluded.id_externe, supprime = 0, maj_le = excluded.maj_le`,
    [
      id, a.type, a.debut, fin, a.mode, a.choisi ?? null, a.sommeilMin ?? null, a.fcMoy ?? null, a.fcDebut ?? null, a.fcFin ?? null, a.ressenti ?? null,
      JSON.stringify(a.sources ?? ["pepfit"]), a.idExterne ?? null, maintenant, maintenant,
    ],
  );
  await fusionnerRecup(db, a.debut, maintenant);
  return id;
}

/** Corrige une session (quand, durée, ressenti) ; ce que l'appareil a mesuré reste. */
export async function modifierRecup(db: Executeur, id: string, c: { debut?: number; fin?: number; ressenti?: Ressenti | null }, maintenant = Date.now()): Promise<void> {
  const l = await lireRecup(db, id);
  if (!l) return;
  const debut = c.debut ?? l.debut;
  const fin = Math.max(debut + MIN, c.fin ?? l.fin);
  await db.runAsync("UPDATE recup_activite SET debut = ?, fin = ?, ressenti = ?, maj_le = ? WHERE id = ?", [
    debut, fin, c.ressenti !== undefined ? c.ressenti : l.ressenti, maintenant, id,
  ]);
}

/** Supprime une session (suppression douce : un import supprimé ne revient pas). */
export async function supprimerRecup(db: Executeur, id: string, maintenant = Date.now()): Promise<void> {
  await db.runAsync("UPDATE recup_activite SET supprime = 1, maj_le = ? WHERE id = ?", [maintenant, id]);
}

/** Remet une session supprimée (« Annuler » de la bulle, tout de suite après la suppression). */
export async function retablirRecup(db: Executeur, id: string, maintenant = Date.now()): Promise<void> {
  await db.runAsync("UPDATE recup_activite SET supprime = 0, maj_le = ? WHERE id = ?", [maintenant, id]);
}

const versSession = (a: ActiviteFaite): SessionRecup => ({
  id: a.id, type: a.type, debut: a.debut, fin: a.fin, mode: a.mode, sommeilMin: a.sommeilMin, fcMoy: a.fcMoy, sources: a.sources, idExterne: a.idExterne,
});

/**
 * Fusionne les doublons du jour de `t` (et de la veille, pour une sieste à cheval sur minuit) : une session d'appareil absorbée
 * par la session pepfit disparaît (sa mesure et son id_externe passent à pepfit) ; deux appareils, le moins prioritaire est
 * gardé supprimé (son id_externe empêche le réimport). Rend le nombre de sessions fondues.
 */
export async function fusionnerRecup(db: Executeur, t: number, maintenant = Date.now()): Promise<number> {
  const jour = minuitDe(t);
  const l = await lireRecupEntre(db, decaler(jour, -1), decaler(jour, 2));
  const par = new Map(l.map((a) => [a.id, a]));
  let n = 0;
  for (const d of doublons(l.map(versSession))) {
    const garde = par.get(d.garde);
    if (!garde) continue;
    if (d.genre === "absorber") {
      const m = d.mesure;
      const sources = [...new Set([...garde.sources, m.source].filter(Boolean))];
      // l'import part : son id_externe passe à la session pepfit (index unique) ; si elle en a déjà un, l'import reste
      // supprimé, avec le sien, pour ne pas revenir
      if (garde.idExterne == null) await db.runAsync("DELETE FROM recup_activite WHERE id = ?", [d.perd]);
      else await db.runAsync("UPDATE recup_activite SET supprime = 1, maj_le = ? WHERE id = ?", [maintenant, d.perd]);
      await db.runAsync(
        "UPDATE recup_activite SET sommeil_min = COALESCE(?, sommeil_min), fc_moy = COALESCE(?, fc_moy), sources = ?, id_externe = COALESCE(id_externe, ?), maj_le = ? WHERE id = ?",
        [m.sommeilMin, m.fcMoy, JSON.stringify(sources), garde.idExterne == null ? m.idExterne : null, maintenant, d.garde],
      );
    } else {
      await db.runAsync("UPDATE recup_activite SET supprime = 1, maj_le = ? WHERE id = ?", [maintenant, d.perd]);
    }
    n++;
  }
  return n;
}

/** Cet identifiant externe est-il déjà connu (vivant, fondu ou supprimé) ? */
async function dejaVu(db: Executeur, idExterne: string): Promise<boolean> {
  const l = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM recup_activite WHERE id_externe = ?", [idExterne]).catch(() => null);
  return (l?.n ?? 0) > 0;
}

/** Une session d'appareil (Whoop, Santé Connect) : écrite si elle est neuve, puis fusionnée. Vrai si écrite. */
async function importer(db: Executeur, a: NouvelleRecup & { idExterne: string }, maintenant: number): Promise<boolean> {
  if (!(a.fin > a.debut) || (await dejaVu(db, a.idExterne))) return false;
  await enregistrerRecup(db, { ...a, mode: "import" }, maintenant);
  return true;
}

/** Les siestes de Whoop (`nap`, aujourd'hui écartées des nuits par convertir.ts) ; rend le nombre de siestes neuves. */
export async function importerSiestesWhoop(db: Executeur, sommeils: readonly SommeilWhoop[], maintenant = Date.now()): Promise<number> {
  let n = 0;
  for (const s of sommeils) {
    if (!s.nap || s.score_state !== "SCORED" || !s.score) continue;
    const e = s.score.stage_summary;
    const dormi = (e.total_light_sleep_time_milli + e.total_slow_wave_sleep_time_milli + e.total_rem_sleep_time_milli) / MIN;
    if (await importer(db, { type: "sieste", debut: Date.parse(s.start), fin: Date.parse(s.end), mode: "import", sommeilMin: Math.round(dormi), sources: ["whoop"], idExterne: `whoop-sieste:${s.id}` }, maintenant)) n++;
  }
  return n;
}

/** Les séances Whoop d'une activité de récupération (sauna, bain froid, massage…) : rangées ici, pas dans les séances. */
export const estRecupWhoop = (w: Pick<SeanceConvertie, "sportId">): boolean => w.sportId != null && WHOOP_RECUP[w.sportId] != null;

export async function importerActivitesWhoop(db: Executeur, seances: readonly SeanceConvertie[], maintenant = Date.now()): Promise<number> {
  let n = 0;
  for (const w of seances) {
    const type = w.sportId != null ? WHOOP_RECUP[w.sportId] : undefined;
    if (!type) continue;
    if (await importer(db, { type, debut: w.debut, fin: w.fin, mode: "import", fcMoy: w.fcMoy, sources: ["whoop"], idExterne: `whoop:${w.id}` }, maintenant)) n++;
  }
  return n;
}

export interface DepsRecupSante {
  /** Toutes les sessions de sommeil de Santé Connect d'une plage (siestes comprises) ; absent : pas de Santé Connect. */
  sessionsSommeil?: ((debut: number, fin: number) => Promise<SommeilNuit[] | null>) | null;
  seancesSport?: ((debut: number, fin: number) => Promise<SeanceSport[] | null>) | null;
}

const PAQUETS_PEPFIT = ["fit.pep.open", "fit.pep", "us.lug.fonte"];

/**
 * Santé Connect de [debut, fin) : les sessions de sommeil de journée (D4) deviennent des siestes ; STRETCHING et
 * GUIDED_BREATHING, des activités de récupération. La marche n'est pas importée (D14), le yoga reste un sport.
 */
export async function importerRecupSante(db: Executeur, debut: number, fin: number, deps: DepsRecupSante, maintenant = Date.now()): Promise<number> {
  const [sommeils, seances] = await Promise.all([
    deps.sessionsSommeil ? deps.sessionsSommeil(debut, fin).catch(() => null) : Promise.resolve(null),
    deps.seancesSport ? deps.seancesSport(debut, fin).catch(() => null) : Promise.resolve(null),
  ]);
  let n = 0;
  for (const s of sommeils ?? []) {
    if (!estSiesteSante(s.debut, s.fin) || PAQUETS_PEPFIT.includes(s.origine ?? "")) continue;
    const mesure = s.phases || s.etapes?.length ? Math.round(s.minutes) : null;
    const source = s.origine ?? "sante";
    if (await importer(db, { type: "sieste", debut: s.debut, fin: s.fin, mode: "import", sommeilMin: mesure, sources: [source], idExterne: `sante:${source}:${s.debut}` }, maintenant)) n++;
  }
  for (const s of seances ?? []) {
    const type = SANTE_RECUP[s.type];
    if (!type || PAQUETS_PEPFIT.includes(s.origine ?? "")) continue;
    const source = s.origine ?? "sante";
    if (await importer(db, { type, debut: s.debut, fin: s.fin, mode: "import", sources: [source], idExterne: `sante:${source}:${s.debut}` }, maintenant)) n++;
  }
  return n;
}

/** Jours de Santé Connect relus à chaque passe (une sieste arrive tard de la montre). */
export const JOURS_IMPORT_RECUP = 14;
let derniereImport = { db: null as Executeur | null, t: 0 };

/** Les imports de Santé Connect des 14 derniers jours ; au plus une passe par minute (recalcul de fond, pages). */
export async function assurerImportsRecup(db: Executeur, deps: DepsRecupSante, maintenant = Date.now(), force = false): Promise<number> {
  if (!force && derniereImport.db === db && maintenant - derniereImport.t < 60_000) return 0;
  derniereImport = { db, t: maintenant };
  return importerRecupSante(db, decaler(minuitDe(maintenant), -JOURS_IMPORT_RECUP), maintenant, deps, maintenant);
}

// ---------------------------------------------------------------- la Récupération et la dette

/** Les minutes de sommeil des siestes de chaque jour de [debut, fin] (minuits), par « AAAA-MM-JJ ». */
export async function siestesParJour(db: Executeur, debut: number, fin: number): Promise<Map<string, number>> {
  const l = await db
    .getAllAsync<Ligne>("SELECT * FROM recup_activite WHERE supprime = 0 AND type = 'sieste' AND debut >= ? AND debut < ?", [debut, decaler(fin, 1)])
    .catch((): Ligne[] => []);
  const m = new Map<string, number>();
  for (const x of l) {
    const a = deLigne(x);
    if (a) m.set(isoJour(a.debut), (m.get(isoJour(a.debut)) ?? 0) + sommeilSieste(a));
  }
  return m;
}

/**
 * La dette de sommeil du jour : celle des 7 nuits jusqu'à ce matin (scoreRecup, siestes de la veille déjà comptées), puis
 * moins les siestes du jour. `avant` : sans les siestes du jour (« 1 h 50 avant la sieste »).
 */
export function detteDuJour(detteMatin: number | null, siestesJour: number): { avant: number; apres: number } | null {
  if (detteMatin == null) return null;
  return { avant: detteMatin, apres: Math.max(0, detteMatin - siestesJour) };
}

// ---------------------------------------------------------------- ce qui marche pour toi

export interface Marche {
  type: TypeRecup;
  etat: EtatMarche;
  /** VFC moyenne des lendemains et des autres jours (ms), à ta norme d'aujourd'hui ; null en attente. */
  avecMs: number | null;
  sansMs: number | null;
}

/**
 * « Ce qui marche pour toi » (§ 3.7) : sur les 8 dernières semaines, la VFC de chaque matin rapportée à ta norme (ln VFC −
 * moyenne du logarithme des 42 nuits d'avant, dès 14), les lendemains de chaque activité contre les autres matins. Une
 * ligne par type fait au moins une fois, les plus nettes d'abord.
 */
export async function lireCeQuiMarche(db: Executeur, maintenant = Date.now()): Promise<Marche[]> {
  const p = RECUPERER.marche;
  const auj = minuitDe(maintenant);
  const debut = decaler(auj, -(p.jours - 1));
  const [nuits, activites] = await Promise.all([
    db
      .getAllAsync<{ jour: string; rmssd: number | null }>("SELECT jour, rmssd FROM recup_nuit WHERE jour >= ? AND jour <= ?", [isoJour(decaler(debut, -(RECUP.norme.nuits + 1))), isoJour(auj)])
      .catch(() => []),
    lireRecupEntre(db, decaler(debut, -1), decaler(auj, 1)),
  ]);
  const vfc = new Map<string, number>();
  for (const n of nuits) if (n.rmssd != null && n.rmssd >= RECUP.plausible.vfc[0] && n.rmssd <= RECUP.plausible.vfc[1]) vfc.set(n.jour, Math.log(n.rmssd));
  const normeDe = (jour: string): number | null => {
    const l: number[] = [];
    for (let i = 1; i <= RECUP.norme.nuits; i++) {
      const v = vfc.get(decalerIso(jour, -i));
      if (v != null) l.push(v);
    }
    return l.length >= RECUP.norme.min ? l.reduce((a, x) => a + x, 0) / l.length : null;
  };
  // chaque matin des 8 semaines : son écart à sa norme
  const matins: { jour: string; rel: number }[] = [];
  for (let j = debut; j <= auj; j = decaler(j, 1)) {
    const iso = isoJour(j);
    const v = vfc.get(iso);
    const n = normeDe(iso);
    if (v != null && n != null) matins.push({ jour: iso, rel: v - n });
  }
  const normeAuj = normeDe(isoJour(auj)) ?? normeDe(matins.at(-1)?.jour ?? isoJour(auj));
  const joursDe = new Map<TypeRecup, Set<string>>();
  for (const a of activites) {
    if (!joursDe.has(a.type)) joursDe.set(a.type, new Set());
    joursDe.get(a.type)!.add(isoJour(a.debut));
  }
  const out: Marche[] = [];
  for (const [type, jours] of joursDe) {
    const lendemain = (m: { jour: string }) => jours.has(decalerIso(m.jour, -1));
    // un type fait au moins une fois dans les 8 semaines (la veille du premier matin compte)
    if (![...jours].some((j) => j >= isoJour(decaler(debut, -1)))) continue;
    const etat = marche(matins.filter(lendemain).map((m) => m.rel), matins.filter((m) => !lendemain(m)).map((m) => m.rel));
    // aucun lendemain encore (fait aujourd'hui pour la première fois) : rien à dire
    if (etat.etat === "attente" && etat.n === 0) continue;
    const ms = (rel: number) => (normeAuj != null ? Math.exp(normeAuj + rel) : null);
    out.push({ type, etat, avecMs: etat.etat === "attente" ? null : ms(etat.ma), sansMs: etat.etat === "attente" ? null : ms(etat.ms) });
  }
  const rang = (m: Marche) => (m.etat.etat === "net" ? 0 : m.etat.etat === "flou" ? 1 : 2);
  return out.sort((a, b) => rang(a) - rang(b) || (b.etat.etat !== "attente" && a.etat.etat !== "attente" ? Math.abs(b.etat.ecart) - Math.abs(a.etat.ecart) : b.etat.n - a.etat.n));
}
