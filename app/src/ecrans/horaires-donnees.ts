// Horaires d'une activité : lecture et écriture pour une séance (muscu, sport, GPS), une récupération et une nuit (planche
// Effort v2.2, D6 et D7). La logique de lien et de bornes est dans horaires.ts ; ici la base.
//
// - Une séance importée (source_ref : Whoop, Santé Connect, Hevy, détectée par le téléphone) garde ses horaires d'origine
//   (debut_orig, fin_orig) dès qu'on la modifie ; « Rétablir » les remet. Une saisie à la main n'a pas d'original.
// - Les séries gardent leur heure : seule l'enveloppe (début et fin) bouge, et elle doit les contenir. Une séance de sport ou GPS
//   n'a qu'une série de durée (la séance elle-même) : elle suit l'enveloppe.
// - Effort, durées, point du jour et série se relisent de la séance : rien d'autre n'est écrit.
import { recalculerApresModification } from "../db/depots/recalcul";
import { transaction } from "../db/exclusif";
import type { Executeur } from "../db/executeur";
import { seancesTerminees, serieHebdo } from "../db/regularite";
import { ecrireHorairesNuit, retablirNuit } from "./mesures/sommeil-horaires";
import type { Nuit } from "./mesures/sommeil-donnees";
import { isoJour } from "./recup-donnees";
import { ajouterJours, debutJour } from "./format";
import { refuser, type Effet, type Horaires, type Refus } from "./horaires";

export type CibleHoraires =
  | { genre: "seance"; id: string }
  | { genre: "recup"; id: string }
  | { genre: "nuit"; nuit: Nuit };

/** D'où vient l'activité quand elle est importée : la source qui fait foi au départ. */
export type SourceHoraires = "whoop" | "sante" | "hevy" | "telephone";

export interface LectureHoraires {
  horaires: Horaires;
  /** Horaires d'origine quand la personne les a modifiés ; null : pas modifiée (ou saisie à la main). */
  original: Horaires | null;
  /** Source d'une activité importée (le texte « Importée de … ») ; null : saisie à la main. */
  source: SourceHoraires | null;
  /** Heure de la première et de la dernière série faite (muscu) ; null : aucune ou séance de sport. */
  premiereSerie: number | null;
  derniereSerie: number | null;
}

const sourceDeRef = (ref: string | null): SourceHoraires | null =>
  ref == null ? null : ref.startsWith("whoop:") ? "whoop" : ref.startsWith("sante:") ? "sante" : ref.startsWith("hevy:") ? "hevy" : "telephone";

const orig = (d: number | null, f: number | null): Horaires | null => (d != null && f != null ? { debut: d, fin: f } : null);

interface LigneSeance {
  debut: number;
  fin: number | null;
  debut_orig: number | null;
  fin_orig: number | null;
  source_ref: string | null;
}

/** Séance de sport ou GPS : une seule série, de durée ; la série est la séance, elle suit l'enveloppe. */
export async function estSport(db: Executeur, id: string): Promise<boolean> {
  const r = await db.getFirstAsync<{ n: number; nd: number | null }>(
    "SELECT COUNT(*) AS n, SUM(duree_s IS NOT NULL) AS nd FROM series WHERE seance_id = ?",
    [id],
  );
  return r != null && r.n === 1 && r.nd === 1;
}

export async function lireHorairesSeance(db: Executeur, id: string): Promise<LectureHoraires | null> {
  const s = await db.getFirstAsync<LigneSeance>("SELECT debut, fin, debut_orig, fin_orig, source_ref FROM seances WHERE id = ?", [id]);
  if (!s || s.fin == null) return null;
  const sport = await estSport(db, id);
  const b = sport
    ? null
    : await db.getFirstAsync<{ a: number | null; z: number | null }>(
        "SELECT MIN(fait_le) AS a, MAX(fait_le) AS z FROM series WHERE seance_id = ? AND faite = 1 AND fait_le IS NOT NULL",
        [id],
      );
  return {
    horaires: { debut: s.debut, fin: s.fin },
    original: orig(s.debut_orig, s.fin_orig),
    source: sourceDeRef(s.source_ref),
    premiereSerie: b?.a ?? null,
    derniereSerie: b?.z ?? null,
  };
}

interface LigneRecup {
  debut: number;
  fin: number;
  mode: string;
  sources: string | null;
  debut_orig: number | null;
  fin_orig: number | null;
}

const sourceRecup = (r: LigneRecup): SourceHoraires | null => {
  if (r.mode !== "import") return null;
  let sources: unknown;
  try {
    sources = r.sources ? JSON.parse(r.sources) : [];
  } catch {
    sources = [];
  }
  const l = Array.isArray(sources) ? sources.filter((x): x is string => typeof x === "string" && x !== "pepfit") : [];
  return l.includes("whoop") ? "whoop" : "sante";
};

export async function lireHorairesRecup(db: Executeur, id: string): Promise<LectureHoraires | null> {
  const r = await db.getFirstAsync<LigneRecup>("SELECT debut, fin, mode, sources, debut_orig, fin_orig FROM recup_activite WHERE id = ? AND supprime = 0", [id]);
  if (!r) return null;
  return { horaires: { debut: r.debut, fin: r.fin }, original: orig(r.debut_orig, r.fin_orig), source: sourceRecup(r), premiereSerie: null, derniereSerie: null };
}

/** Une nuit : les horaires lus (ou déjà modifiés) et l'original ; la source est celle de la nuit. */
export function lireHorairesNuit(n: Nuit): LectureHoraires {
  return {
    horaires: { debut: n.debut, fin: n.fin },
    original: n.original ?? null,
    source: n.source === "whoop" ? "whoop" : "sante",
    premiereSerie: null,
    derniereSerie: null,
  };
}

export async function lireHoraires(db: Executeur, c: CibleHoraires): Promise<LectureHoraires | null> {
  if (c.genre === "seance") return lireHorairesSeance(db, c.id);
  if (c.genre === "recup") return lireHorairesRecup(db, c.id);
  return lireHorairesNuit(c.nuit);
}

// ---- Effets d'un changement de jour : point du jour et série -------------------------------------------------------------

/** Ce qui change quand l'activité change de jour : le point (séance seulement) et la série, recalculée en entier. */
export async function effetHoraires(db: Executeur, c: CibleHoraires, apres: Horaires, maintenant: number = Date.now()): Promise<Effet | null> {
  if (c.genre === "nuit") {
    return { genre: "nuit", jourAvant: c.nuit.jour, jourApres: debutJour(apres.fin).getTime(), seulAvant: false, serieAvant: 0, serieApres: 0 };
  }
  if (c.genre === "recup") {
    const r = await db.getFirstAsync<{ debut: number }>("SELECT debut FROM recup_activite WHERE id = ?", [c.id]);
    if (!r) return null;
    return { genre: "recup", jourAvant: debutJour(r.debut).getTime(), jourApres: debutJour(apres.debut).getTime(), seulAvant: false, serieAvant: 0, serieApres: 0 };
  }
  const s = await db.getFirstAsync<{ debut: number; fin: number | null }>("SELECT debut, fin FROM seances WHERE id = ?", [c.id]);
  if (!s || s.fin == null) return null;
  const jourAvant = debutJour(s.debut).getTime();
  const jourApres = debutJour(apres.debut).getTime();
  if (jourAvant === jourApres) return { genre: "seance", jourAvant, jourApres, seulAvant: false, serieAvant: 0, serieApres: 0 };
  const autre = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM seances WHERE fin IS NOT NULL AND debut >= ? AND debut < ? AND id <> ?",
    [jourAvant, ajouterJours(jourAvant, 1).getTime(), c.id],
  );
  const toutes = await seancesTerminees(db);
  const apresListe = toutes.slice();
  const i = apresListe.findIndex((x) => x.debut === s.debut && x.fin === s.fin);
  if (i >= 0) apresListe[i] = { debut: apres.debut, fin: apres.fin };
  return {
    genre: "seance",
    jourAvant,
    jourApres,
    seulAvant: (autre?.n ?? 0) === 0,
    serieAvant: serieHebdo(toutes, maintenant).enCours,
    serieApres: serieHebdo(apresListe, maintenant).enCours,
  };
}

// ---- Écriture ------------------------------------------------------------------------------------------------------------

/** Les originaux à écrire : gardés tant que les horaires diffèrent de l'import, effacés quand ils lui redeviennent égaux. */
function originauxApres(importee: boolean, actuel: Horaires, original: Horaires | null, apres: Horaires): Horaires | null {
  if (!importee) return null;
  const o = original ?? actuel;
  return o.debut === apres.debut && o.fin === apres.fin ? null : o;
}

async function appliquerSeance(db: Executeur, id: string, apres: Horaires, original: Horaires | null, maintenant: number): Promise<void> {
  const s = await db.getFirstAsync<LigneSeance>("SELECT debut, fin, debut_orig, fin_orig, source_ref FROM seances WHERE id = ?", [id]);
  if (!s || s.fin == null) return;
  const sport = await estSport(db, id);
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE seances SET debut = ?, fin = ?, debut_orig = ?, fin_orig = ?, maj_le = ? WHERE id = ?", [
      apres.debut, apres.fin, original?.debut ?? null, original?.fin ?? null, maintenant, id,
    ]);
    if (sport) await db.runAsync("UPDATE series SET duree_s = ?, fait_le = ? WHERE seance_id = ?", [Math.round((apres.fin - apres.debut) / 1000), apres.fin, id]);
    if (apres.debut !== s.debut) {
      // la FC gardée se relit depuis le nouveau début (les secondes écoulées du graphique)
      await db.runAsync("UPDATE seance_fc SET s = MAX(0, t - ?) WHERE seance_id = ?", [apres.debut, id]);
      const ex = await db.getAllAsync<{ exercice_id: string }>("SELECT DISTINCT exercice_id FROM series WHERE seance_id = ?", [id]);
      await recalculerApresModification(db, id, ex.map((e) => e.exercice_id));
    }
  });
}

/** Écrit les horaires d'une séance. Rend le refus (bornes relues dans la base) ou null une fois écrit. */
export async function ecrireHorairesSeance(db: Executeur, id: string, apres: Horaires, maintenant: number = Date.now()): Promise<Refus | null> {
  const l = await lireHorairesSeance(db, id);
  if (!l) return null;
  const refus = refuser(apres, { maintenant, premiereSerie: l.premiereSerie, derniereSerie: l.derniereSerie });
  if (refus) return refus;
  if (apres.debut === l.horaires.debut && apres.fin === l.horaires.fin) return null;
  await appliquerSeance(db, id, apres, originauxApres(l.source != null, l.horaires, l.original, apres), maintenant);
  return null;
}

/**
 * Séance qui court encore (page de fin de séance) : seul le début s'écrit, la fin se règle à « Enregistrer ». Les séries gardent leur
 * heure (le début ne passe pas après la première) ; rien n'est décalé, contrairement à l'ancien « Date et heure ».
 */
export async function ecrireDebutSeanceEnCours(db: Executeur, id: string, debut: number, maintenant: number = Date.now()): Promise<Refus | null> {
  const s = await db.getFirstAsync<{ debut: number; fin: number | null }>("SELECT debut, fin FROM seances WHERE id = ?", [id]);
  if (!s || s.fin != null) return null;
  if (debut > maintenant) return { motif: "futur", champ: "debut", maintenant };
  const b = await db.getFirstAsync<{ a: number | null }>("SELECT MIN(fait_le) AS a FROM series WHERE seance_id = ? AND faite = 1 AND fait_le IS NOT NULL", [id]);
  if (b?.a != null && debut > b.a) return { motif: "serieDebut", champ: "debut", serie: b.a };
  if (debut === s.debut) return null;
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE seances SET debut = ?, maj_le = ? WHERE id = ?", [debut, maintenant, id]);
    await db.runAsync("UPDATE seance_fc SET s = MAX(0, t - ?) WHERE seance_id = ?", [debut, id]);
    const ex = await db.getAllAsync<{ exercice_id: string }>("SELECT DISTINCT exercice_id FROM series WHERE seance_id = ?", [id]);
    await recalculerApresModification(db, id, ex.map((e) => e.exercice_id));
  });
  return null;
}

/** Remet les horaires de l'import ; sans original, rien. Rend les horaires remis. */
export async function retablirHorairesSeance(db: Executeur, id: string, maintenant: number = Date.now()): Promise<Horaires | null> {
  const l = await lireHorairesSeance(db, id);
  if (!l?.original) return null;
  await appliquerSeance(db, id, l.original, null, maintenant);
  return l.original;
}

export async function ecrireHorairesRecup(db: Executeur, id: string, apres: Horaires, maintenant: number = Date.now()): Promise<Refus | null> {
  const l = await lireHorairesRecup(db, id);
  if (!l) return null;
  const refus = refuser(apres, { maintenant });
  if (refus) return refus;
  if (apres.debut === l.horaires.debut && apres.fin === l.horaires.fin) return null;
  const o = originauxApres(l.source != null, l.horaires, l.original, apres);
  await db.runAsync("UPDATE recup_activite SET debut = ?, fin = ?, debut_orig = ?, fin_orig = ?, maj_le = ? WHERE id = ?", [
    apres.debut, apres.fin, o?.debut ?? null, o?.fin ?? null, maintenant, id,
  ]);
  return null;
}

export async function retablirHorairesRecup(db: Executeur, id: string, maintenant: number = Date.now()): Promise<Horaires | null> {
  const l = await lireHorairesRecup(db, id);
  if (!l?.original) return null;
  await db.runAsync("UPDATE recup_activite SET debut = ?, fin = ?, debut_orig = NULL, fin_orig = NULL, maj_le = ? WHERE id = ?", [
    l.original.debut, l.original.fin, maintenant, id,
  ]);
  return l.original;
}

export async function ecrireHorairesNuitModifiee(db: Executeur, nuit: Nuit, apres: Horaires, maintenant: number = Date.now()): Promise<Refus | null> {
  const refus = refuser(apres, { maintenant });
  if (refus) return refus;
  const o = nuit.original ?? { debut: nuit.debut, fin: nuit.fin };
  await ecrireHorairesNuit(db, { jour: nuit.cle ?? isoJour(nuit.jour), debut: apres.debut, fin: apres.fin, debutOrig: o.debut, finOrig: o.fin }, maintenant);
  return null;
}

export async function retablirHorairesNuit(db: Executeur, nuit: Nuit): Promise<Horaires | null> {
  if (!nuit.original) return null;
  await retablirNuit(db, nuit.cle ?? isoJour(nuit.jour));
  return { debut: nuit.original.debut, fin: nuit.original.fin };
}

export async function ecrireHoraires(db: Executeur, c: CibleHoraires, apres: Horaires, maintenant: number = Date.now()): Promise<Refus | null> {
  if (c.genre === "seance") return ecrireHorairesSeance(db, c.id, apres, maintenant);
  if (c.genre === "recup") return ecrireHorairesRecup(db, c.id, apres, maintenant);
  return ecrireHorairesNuitModifiee(db, c.nuit, apres, maintenant);
}

export async function retablirHoraires(db: Executeur, c: CibleHoraires, maintenant: number = Date.now()): Promise<Horaires | null> {
  if (c.genre === "seance") return retablirHorairesSeance(db, c.id, maintenant);
  if (c.genre === "recup") return retablirHorairesRecup(db, c.id, maintenant);
  return retablirHorairesNuit(db, c.nuit);
}
