// Pas et FC d'une séance passée, pris aux vraies sources seulement (retour du 30/10 : « ~ 1 192 » pas pour 2 h de
// padel). Le « ~ » venait d'un prorata des pas du jour ; or un padel concentre ses pas. Désormais : 1. Santé Connect sur la
// plage de la séance (pas, FC de la montre) ; 2. rien, et pour une séance Whoop le geste qui apporte la source qui manque.
// La séance qui a sa propre FC (capteur en direct) la garde. Sans React Native (tests/seance-padel.test.ts).
import type { Executeur } from "../db/executeur";
import { transaction } from "../db/exclusif";
import { lireReglage } from "../db/depots/reglages";
import type { PermissionSante, Sante } from "../natif/sante/types";
import { REGLAGE } from "../whoop/constantes";
import { lireSportSeance } from "../db/depots/activites";
import { lireActivites, rattacherASeance, TOLERANCE_MS } from "../whoop/depot";
import { idSport } from "../whoop/sports";
import { PERMISSION_PAS } from "./journee-donnees";
import { TROU_COURBE_S } from "./fc-trous";
import { memeCreneau } from "./planification";

export const PERMISSION_FC: PermissionSante = "fc-montre";

export type SourceMesure = "sante";
/** « sante » : autoriser Santé Connect. */
export type GesteSource = "sante";

export interface PasMesures {
  pas: number;
  source: SourceMesure;
}

export interface SourcesSeance {
  pas: PasMesures | null;
  /** FC venue d'ailleurs que la séance (heure murale, ms) ; null si la séance a la sienne ou s'il n'y en a pas. */
  fc: { echantillons: { t: number; bpm: number }[]; source: SourceMesure } | null;
  /** La séance a sa FC, coupée par endroits (capteur perdu en direct) : celle d'une autre source, pour combler les trous
   *  (fc-trous.ts) ; null sans trou ou sans autre source. */
  complement: { echantillons: { t: number; bpm: number }[]; source: SourceMesure } | null;
  /** Séance Whoop : ce qui manque encore et le geste qui l'apporte ; null si rien ne manque ou si aucun geste n'y peut rien. */
  manque: { pas: boolean; fc: boolean; geste: GesteSource } | null;
}

export interface DepsSources {
  sante: Pick<Sante, "autorisees" | "pasEntre" | "fcEntre">;
  maintenant?: number;
}

/** Une séance finie depuis moins de 36 h peut encore attendre son activité Whoop (Whoop la range quelques minutes après). */
export const ATTENTE_WHOOP_MS = 36 * 3_600_000;
/** Écart minimal entre deux relectures de Whoop demandées par la fiche d'une séance. */
export const RELECTURE_WHOOP_MS = 5 * 60_000;

/**
 * Faut-il relire Whoop pour cette séance ? (padel du 30/10 ouvert 6 min après la fin : ni pas ni effort, l'activité Whoop
 * n'était pas encore là). Oui si Whoop est connecté, la séance récente, sans activité Whoop rattachée, et Whoop pas relu depuis
 * RELECTURE_WHOOP_MS. La relecture range l'activité et la rattache (enregistrerSeances) ; la fiche se recharge ensuite.
 */
export async function doitRelireWhoop(db: Executeur, seance: { id: string; fin: number }, maintenant: number = Date.now()): Promise<boolean> {
  if (maintenant - seance.fin > ATTENTE_WHOOP_MS || maintenant < seance.fin) return false;
  const [connecte, dernier, lie] = await Promise.all([
    lireReglage(db, REGLAGE.connecte),
    lireReglage(db, REGLAGE.derniereSynchro),
    db.getFirstAsync<{ n: number }>("SELECT 1 AS n FROM whoop_seance WHERE seance_id = ? LIMIT 1", [seance.id]),
  ]);
  return connecte === "1" && !lie && maintenant - (Number(dernier) || 0) > RELECTURE_WHOOP_MS;
}

/** La FC propre de la séance (heure murale) a-t-elle un silence de plus de TROU_COURBE_S, jusqu'à sa fin comprise ? */
export async function fcCoupee(db: Executeur, seance: { id: string; fin: number }): Promise<boolean> {
  const l = await db.getAllAsync<{ t: number }>("SELECT t FROM seance_fc WHERE seance_id = ? ORDER BY t", [seance.id]);
  if (!l.length) return false;
  const bords = [...l.map((x) => x.t), Math.max(seance.fin, l.at(-1)!.t)];
  return bords.some((t, i) => i > 0 && t - bords[i - 1]! > TROU_COURBE_S * 1000);
}

/**
 * L'activité Whoop du même créneau que la séance, rattachée si elle ne l'était pas (séance lancée à la main depuis une routine :
 * Whoop l'a rangée sans séance, ou avant la fin de la séance pepfit). Règle de `faite` (planification.ts) : même sport ou même
 * famille, début dans les 90 min de celui de la séance ou chevauchement ; une activité Whoop sans sport prend celui de la séance.
 * Sont prises les activités sans séance et celles qui ont leur propre séance créée pour Whoop (elle se fond dans celle-ci, comme
 * retraiterSeancesWhoop) ; une activité déjà rattachée à une séance pepfit ou Hevy ne l'est jamais. La plus proche par le début ;
 * renvoie sa ligne, ou null.
 */
export async function rattacherWhoop(
  db: Executeur,
  seance: { id: string; debut: number; fin: number },
  sport: string | null,
): Promise<{ id: string; debut: number; fin: number; sport_id: number | null } | null> {
  if (!sport) return null;
  const l = await db.getAllAsync<{ id: string; debut: number; fin: number; sport_id: number | null; sport: string | null }>(
    `SELECT w.id, w.debut, w.fin, w.sport_id, w.sport FROM whoop_seance w LEFT JOIN seances s ON s.id = w.seance_id
     WHERE (w.seance_id IS NULL OR s.source_ref = 'whoop:' || w.id) AND w.debut < ? AND w.fin > ?`,
    [seance.fin + TOLERANCE_MS, seance.debut - TOLERANCE_MS],
  );
  if (!l.length) return null;
  const activites = await lireActivites(db);
  const retenues = l
    .filter((w) => memeCreneau({ debut: w.debut, fin: w.fin, sport: activites.get(idSport(w.sport_id, w.sport) ?? -999)?.id }, { debut: seance.debut, fin: seance.fin, sport }))
    .sort((a, b) => Math.abs(a.debut - seance.debut) - Math.abs(b.debut - seance.debut));
  for (const w of retenues) if (await transaction(db, (t) => rattacherASeance(t, w.id, seance.id))) return { id: w.id, debut: w.debut, fin: w.fin, sport_id: w.sport_id };
  return null;
}

export async function sourcesSeance(db: Executeur, seance: { id: string; debut: number; fin: number }, d: DepsSources): Promise<SourcesSeance> {
  const [lie, propre, autorisees, sport] = await Promise.all([
    db.getFirstAsync<{ id: string; debut: number; fin: number; sport_id: number | null }>("SELECT id, debut, fin, sport_id FROM whoop_seance WHERE seance_id = ? ORDER BY fin - debut DESC LIMIT 1", [seance.id]),
    db.getFirstAsync<{ n: number }>("SELECT 1 AS n FROM seance_fc WHERE seance_id = ? LIMIT 1", [seance.id]),
    d.sante.autorisees().catch((): PermissionSante[] => []),
    lireSportSeance(db, seance.id).catch(() => null),
  ]);
  const scPas = autorisees.includes(PERMISSION_PAS);
  const scFc = autorisees.includes(PERMISSION_FC);
  // L'activité Whoop du créneau, rattachée si elle ne l'était pas : sa plage est celle que Santé Connect lit
  const w = lie ?? (await rattacherWhoop(db, seance, sport?.id ?? null).catch(() => null));
  const plage = w ?? seance;

  // 1. Santé Connect sur la plage de la séance
  let pas: PasMesures | null = null;
  let fc: SourcesSeance["fc"] = null;
  if (scPas) {
    const n = await d.sante.pasEntre(plage.debut, plage.fin).catch(() => null);
    if (n != null && n > 0) pas = { pas: Math.round(n), source: "sante" };
  }
  if (!propre && scFc) {
    const l = await d.sante.fcEntre(plage.debut, plage.fin).catch(() => null);
    if (l && l.length >= 2) fc = { echantillons: [...l].sort((a, b) => a.t - b.t), source: "sante" };
  }

  // FC propre coupée : Santé Connect, pour en combler les trous
  let complement: SourcesSeance["complement"] = null;
  if (propre && scFc && (await fcCoupee(db, seance))) {
    const l = await d.sante.fcEntre(plage.debut, plage.fin).catch(() => null);
    if (l && l.length >= 2) complement = { echantillons: [...l].sort((a, b) => a.t - b.t), source: "sante" };
  }

  // 2. Le geste qui apporte ce qui manque (séance Whoop : la montre a ces données, il suffit d'autoriser Santé Connect)
  const manquePas = !pas && !scPas;
  const manqueFc = !propre && !fc && !scFc;
  const manque: SourcesSeance["manque"] = w && (manquePas || manqueFc) ? { pas: manquePas, fc: manqueFc, geste: "sante" } : null;
  return { pas, fc, complement, manque };
}
