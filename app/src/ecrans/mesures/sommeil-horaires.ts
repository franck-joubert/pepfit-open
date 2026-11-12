// Horaires modifiés d'une nuit (planche Effort v2, D6 et D7). Une nuit est lue chez Whoop, Santé Connect ou Withings : elle n'a pas
// de ligne locale à corriger. Sa modification est une ligne de `sommeil_horaires` (migration 182), par jour de réveil d'origine,
// avec l'original lu au moment du changement ; `lireSommeil` l'applique, « Rétablir » la supprime, la synchro ne l'écrase pas.
import type { Executeur } from "../../db/executeur";
import { isoJour } from "../recup-donnees";
import { minuit } from "./periodes";
import type { Nuit } from "./sommeil-donnees";

const MIN = 60_000;

export interface HorairesNuit {
  /** Jour de réveil d'origine (AAAA-MM-JJ) : la clé. */
  jour: string;
  debut: number;
  fin: number;
  debutOrig: number;
  finOrig: number;
}

export async function lireHorairesNuits(db: Executeur): Promise<HorairesNuit[]> {
  const l = await db
    .getAllAsync<{ jour: string; debut: number; fin: number; debut_orig: number; fin_orig: number }>(
      "SELECT jour, debut, fin, debut_orig, fin_orig FROM sommeil_horaires",
      [],
    )
    .catch(() => []);
  return l.map((x) => ({ jour: x.jour, debut: x.debut, fin: x.fin, debutOrig: x.debut_orig, finOrig: x.fin_orig }));
}

/** La nuit avec ses horaires modifiés : temps au lit et sommeil suivent l'écart, les phases ne valent plus (rien d'inventé). */
export function nuitModifiee(n: Nuit, h: HorairesNuit): Nuit {
  const auLit = Math.max(1, Math.round((h.fin - h.debut) / MIN));
  const sommeil = Math.max(0, Math.min(auLit, n.sommeilMin + (auLit - n.auLitMin)));
  return {
    ...n,
    jour: minuit(h.fin),
    debut: h.debut,
    fin: h.fin,
    sommeilMin: sommeil,
    auLitMin: auLit,
    phases: null,
    etapes: null,
    perf: null,
    efficacite: Math.round((sommeil / auLit) * 100),
    efficaciteCalculee: true,
    heure: h.fin,
    cle: h.jour,
    original: { debut: h.debutOrig, fin: h.finOrig },
  };
}

export interface NuitsAppliquees {
  nuits: Map<number, Nuit>;
  /** Lignes dont l'original lu a changé depuis (la synchro l'a mis à jour) : à réécrire, la modification reste. */
  originauxADeplacer: HorairesNuit[];
}

/**
 * Applique les horaires modifiés aux nuits lues. Une nuit déplacée vers un jour qui a déjà sa nuit : celle qui a le plus de
 * sommeil reste (même règle que la fusion Santé Connect). Une ligne sans nuit d'origine (source retirée) ne s'applique pas.
 */
export function appliquerHorairesNuits(nuits: ReadonlyMap<number, Nuit>, lignes: readonly HorairesNuit[]): NuitsAppliquees {
  const sortie = new Map(nuits);
  const originauxADeplacer: HorairesNuit[] = [];
  const parCle = new Map<string, Nuit>();
  for (const n of nuits.values()) parCle.set(isoJour(n.jour), n);
  for (const h of lignes) {
    const lue = parCle.get(h.jour);
    if (!lue) continue;
    const lueDebut = lue.debut;
    const lueFin = lue.fin;
    const h2 = lueDebut !== h.debutOrig || lueFin !== h.finOrig ? { ...h, debutOrig: lueDebut, finOrig: lueFin } : h;
    if (h2 !== h) originauxADeplacer.push(h2);
    sortie.delete(lue.jour);
    const nouvelle = nuitModifiee(lue, h2);
    const deja = sortie.get(nouvelle.jour);
    if (!deja || nouvelle.sommeilMin >= deja.sommeilMin) sortie.set(nouvelle.jour, nouvelle);
    else sortie.set(lue.jour, lue);
  }
  return { nuits: sortie, originauxADeplacer };
}

/** Écrit (ou remplace) la modification d'une nuit ; des horaires égaux à l'original la retirent. */
export async function ecrireHorairesNuit(db: Executeur, h: HorairesNuit, maintenant = Date.now()): Promise<void> {
  if (h.debut === h.debutOrig && h.fin === h.finOrig) {
    await db.runAsync("DELETE FROM sommeil_horaires WHERE jour = ?", [h.jour]);
    return;
  }
  await db.runAsync(
    `INSERT INTO sommeil_horaires (jour, debut, fin, debut_orig, fin_orig, maj_le) VALUES (?,?,?,?,?,?)
     ON CONFLICT (jour) DO UPDATE SET debut = excluded.debut, fin = excluded.fin, debut_orig = excluded.debut_orig, fin_orig = excluded.fin_orig, maj_le = excluded.maj_le`,
    [h.jour, h.debut, h.fin, h.debutOrig, h.finOrig, maintenant],
  );
}

/** Rétablit une nuit : la modification disparaît, la nuit lue revient. */
export async function retablirNuit(db: Executeur, jour: string): Promise<void> {
  await db.runAsync("DELETE FROM sommeil_horaires WHERE jour = ?", [jour]);
}
