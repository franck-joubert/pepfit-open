// Données de la Récupération pepfit (planche recuperation, 31/10) : les mesures brutes de chaque nuit dans recup_nuit
// (migration 56, synchronisée), jamais le score ; le score se calcule à la lecture par recup-pepfit.ts (scoreRecup).
//
// Les nuits, quel que soit le capteur (le score de Whoop n'est jamais lu ici) :
// - VFC et FC au repos : Whoop d'abord (ses mesures brutes), sinon les mesures (Santé Connect, Withings) ; la VFC est la
//   moyenne de celles de la session de sommeil (C15) ;
// - sommeil : la nuit Whoop, sinon la plus longue nuit de Santé Connect ; une nuit avec ses phases vient d'une montre, sans
//   phases du téléphone (la durée seule, NOTES § 2.4) ;
// - le besoin de Whoop (base, dette, effort, sieste) est gardé pour le labo/sommeil seulement : le score lit celui de pepfit
//   (recup-pepfit.ts, besoinNuit), calculé depuis l'objectif du profil, la dette et l'Effort.
// - la provenance de chaque mesure (source_vfc, source_fc, source_nuit ; 'whoop' pour l'API de Whoop comme pour ce que l'appli
//   Whoop dépose dans Santé Connect) : l'IA ne lit une mesure de Whoop qu'avec l'accord de la personne (conformité, point 1).
// Une nuit n'est jamais réécrite par une mesure moins complète (rang) : un téléphone sans montre garde celles de l'autre ; ce
// qu'une lecture n'a pas reste (fusion champ par champ).
// Les charges de l'Effort (séances et activité de la journée) sont lues comme la page Effort, sans le score.
import type { Executeur } from "../db/executeur";
import { historiqueMesure } from "../db/depots/mesures";
import { lireReglage, ecrireReglage, PREFIXE_CACHE } from "../db/depots/reglages";
import type { SommeilNuit } from "../natif/sante/types";
import { ORIGINE_WITHINGS } from "../withings/constantes";
import { fusionnerNuitsWithings, nuitsWithings } from "../withings/lecture";
import { activitesEntre } from "./effort-activite-donnees";
import { chargesParJour, correlation } from "./effort-charges";
import { vfcDesNuits } from "./vfc-nuit";
import { OBJECTIF_SOMMEIL_MIN, REGLAGE_OBJECTIF_SOMMEIL } from "./mesures/sommeil-stats";
import { siestesParJour } from "./recuperer-donnees";
import { joursPourUsage } from "../cycle/donnees";
import { CYCLE, cycles, episodes, joursMemeMoitie, prevision, type JourCycle } from "../cycle/modele";
import { niveauRecup, RECUP, scoreRecup, type Dette, type DonneesRecup, type NiveauRecup, type NuitRecup, type ParamsRecup, type ResultatRecup, type SourceSommeil } from "./recup-pepfit";

/** Jours remplis au premier passage : 12 semaines d'historique et leurs 42 nuits de norme. */
export const JOURS_NUITS = 130;
/** Ensuite, les derniers jours seulement (les nuits arrivent tard, Whoop se recalcule). */
export const JOURS_RELUS = 3;
/** Réglage local : le premier remplissage est fait (rien à voir avec la synchro). */
const REGLAGE_REMPLI = "recup_nuits_rempli";
/** Réglage local (jamais synchronisé) : l'heure de la dernière passe ; les mesures de la nuit (VFC, FC au repos) rangées depuis
 * font relire leurs nuits, même anciennes (C4 : l'import de Santé Connect arrive souvent après le premier remplissage). */
const REGLAGE_PASSE = `${PREFIXE_CACHE}recup_nuits_passe`;

const deux = (n: number) => String(n).padStart(2, "0");
/** AAAA-MM-JJ local d'un instant. */
export const isoJour = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
};
export const minuitIso = (iso: string) => {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, j!).getTime();
};
const minuitDe = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const decaler = (jour: number, n: number) => {
  const d = new Date(jour);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
};

/** Milieu d'une nuit en minutes depuis midi la veille (heure locale) : 720 = minuit, 840 = 2 h du matin. */
export function milieuNuit(debut: number, fin: number): number {
  const d = new Date((debut + fin) / 2);
  return (d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + 720) % 1440;
}

/** Rang d'une nuit (la règle de synchro) : VFC 4, FC au repos 2, sommeil de montre 2, du téléphone 1. */
export function rangNuit(n: Pick<NuitRecup, "rmssd" | "fcRepos" | "sommeilMin" | "sourceSommeil">): number {
  return (n.rmssd != null ? 4 : 0) + (n.fcRepos != null ? 2 : 0) + (n.sommeilMin != null ? (n.sourceSommeil === "telephone" ? 1 : 2) : 0);
}

export interface DepsNuits {
  /** Nuits de Santé Connect d'une plage (sante.nuits) ; absent : pas de Santé Connect. */
  nuitsSante?: ((debut: number, fin: number) => Promise<SommeilNuit[] | null>) | null;
  maintenant?: number;
}

interface LigneNuit {
  jour: string;
  rmssd: number | null;
  fc_repos: number | null;
  sommeil_min: number | null;
  milieu_min: number | null;
  besoin_min: number | null;
  source_vfc: string | null;
  source_sommeil: SourceSommeil | null;
  source_fc?: string | null;
  source_nuit?: string | null;
  rang: number;
}

/** L'appli Whoop dépose aussi dans Santé Connect : ce qu'elle y écrit est une mesure de Whoop. */
const ORIGINE_WHOOP = "com.whoop.android";
const provenance = (m: { source: string; origine: string | null }) => (m.source === "whoop" || m.origine === ORIGINE_WHOOP ? "whoop" : m.source);

type Sources = { sourceVfc: string | null; sourceFc: string | null; sourceNuit: string | null };

const deLigne = (l: LigneNuit): NuitRecup => ({
  rmssd: l.rmssd,
  fcRepos: l.fc_repos,
  sommeilMin: l.sommeil_min,
  milieuMin: l.milieu_min,
  besoinMin: l.besoin_min,
  sourceSommeil: l.source_sommeil,
});

/**
 * Écrit les nuits des jours de réveil [debut, fin] (minuits) depuis les capteurs ; rend le nombre de nuits écrites. Une nuit
 * déjà en base et mieux mesurée (rang plus haut, venue d'un autre téléphone) n'est pas touchée.
 */
export async function ecrireNuitsRecup(db: Executeur, debut: number, fin: number, deps: DepsNuits = {}): Promise<number> {
  const finMs = decaler(fin, 1);
  const [whoop, vfcM, fcM, sc0, nuitsWi, deja] = await Promise.all([
    db
      .getAllAsync<{
        jour: number; vfc: number | null; fc_repos: number | null; sommeil_min: number | null; sommeil_debut: number | null; sommeil_fin: number | null;
        au_lit_min: number | null; besoin_base_min: number | null; sommeil_dette_min: number | null; besoin_effort_min: number | null; besoin_sieste_min: number | null;
      }>(
        `SELECT jour, vfc, fc_repos, sommeil_min, sommeil_debut, sommeil_fin, au_lit_min, besoin_base_min, sommeil_dette_min, besoin_effort_min, besoin_sieste_min
         FROM whoop_jour WHERE jour >= ? AND jour <= ?`,
        [debut, fin],
      )
      .catch(() => []),
    // depuis la veille au soir : une mesure de 23 h appartient à la nuit du premier jour
    historiqueMesure(db, "vfc", debut - 12 * 3_600_000).catch(() => []),
    historiqueMesure(db, "fc", debut).catch(() => []),
    deps.nuitsSante ? deps.nuitsSante(debut - 12 * 3_600_000, Math.min(finMs, deps.maintenant ?? Date.now())).catch(() => null) : Promise.resolve(null),
    nuitsWithings(db, debut - 12 * 3_600_000, Math.min(finMs, deps.maintenant ?? Date.now())),
    db.getAllAsync<LigneNuit>("SELECT * FROM recup_nuit WHERE jour >= ? AND jour <= ?", [isoJour(debut), isoJour(fin)]).catch((): LigneNuit[] => []),
  ]);
  // Withings (lu chez eux) remplace Santé Connect le même jour de réveil ; Whoop passe par-dessus plus bas
  const sc = nuitsWi.length ? fusionnerNuitsWithings(sc0 ?? [], nuitsWi) : sc0;
  const existantes = new Map(deja.map((l) => [l.jour, l]));
  const nuits = new Map<number, NuitRecup & Sources>();
  const vide = (): NuitRecup & Sources => ({
    rmssd: null, fcRepos: null, sommeilMin: null, milieuMin: null, besoinMin: null, sourceSommeil: null, sourceVfc: null, sourceFc: null, sourceNuit: null,
  });
  const de = (j: number) => {
    let n = nuits.get(j);
    if (!n) nuits.set(j, (n = vide()));
    return n;
  };
  // VFC : la moyenne des mesures de la session de sommeil de Santé Connect (C15, vfc-nuit.ts) ; FC au repos : la dernière de
  // chaque jour (mesures de la plus récente à la plus ancienne)
  for (const [j, v] of vfcDesNuits(vfcM.filter((m) => m.date < finMs), sc ?? [])) {
    if (j < debut || j > fin) continue;
    const n = de(j);
    n.rmssd = v.valeur;
    n.sourceVfc = v.derniere.source == null ? null : provenance(v.derniere);
  }
  for (const m of fcM) {
    const j = minuitDe(m.date);
    if (m.date >= finMs || j < debut) continue;
    const n = de(j);
    if (n.fcRepos == null) {
      n.fcRepos = m.valeur;
      n.sourceFc = provenance(m);
    }
  }
  // Santé Connect : la plus longue nuit de chaque réveil
  const plusLongue = new Map<number, SommeilNuit>();
  for (const s of sc ?? []) {
    const j = minuitDe(s.fin);
    if (j < debut || j > fin || !(s.minutes > 0)) continue;
    const d = plusLongue.get(j);
    if (!d || s.minutes > d.minutes) plusLongue.set(j, s);
  }
  for (const [j, s] of plusLongue) {
    const n = de(j);
    n.sommeilMin = Math.round(s.minutes);
    n.milieuMin = milieuNuit(s.debut, s.fin);
    n.sourceSommeil = s.phases || s.etapes?.length ? "montre" : "telephone";
    n.sourceNuit = s.origine === ORIGINE_WHOOP ? "whoop" : s.origine === ORIGINE_WITHINGS ? "withings" : "sante_connect";
  }
  // Whoop par-dessus : ses mesures brutes de la nuit, jamais son score
  for (const w of whoop) {
    const n = de(w.jour);
    if (w.vfc != null) {
      n.rmssd = w.vfc;
      n.sourceVfc = "whoop";
    }
    if (w.fc_repos != null) {
      n.fcRepos = w.fc_repos;
      n.sourceFc = "whoop";
    }
    if (w.sommeil_min && w.sommeil_fin != null) {
      const debutNuit = w.sommeil_debut ?? w.sommeil_fin - (w.au_lit_min ?? w.sommeil_min) * 60_000;
      n.sommeilMin = Math.round(w.sommeil_min);
      n.milieuMin = milieuNuit(debutNuit, w.sommeil_fin);
      n.sourceSommeil = "montre";
      n.sourceNuit = "whoop";
      if (w.besoin_base_min != null) n.besoinMin = Math.round(w.besoin_base_min + (w.sommeil_dette_min ?? 0) + (w.besoin_effort_min ?? 0) + (w.besoin_sieste_min ?? 0));
    }
  }
  const maintenant = deps.maintenant ?? Date.now();
  let ecrites = 0;
  for (const [j, lue] of nuits) {
    const iso = isoJour(j);
    const e = existantes.get(iso);
    // Fusion champ par champ : ce que cette lecture n'a pas (la montre d'un autre téléphone, le sommeil du téléphone) reste.
    const n = e
      ? {
          rmssd: lue.rmssd ?? e.rmssd,
          sourceVfc: lue.rmssd != null ? lue.sourceVfc : e.source_vfc,
          fcRepos: lue.fcRepos ?? e.fc_repos,
          sourceFc: lue.fcRepos != null ? lue.sourceFc : (e.source_fc ?? null),
          ...(lue.sommeilMin != null
            ? { sommeilMin: lue.sommeilMin, milieuMin: lue.milieuMin, besoinMin: lue.besoinMin, sourceSommeil: lue.sourceSommeil, sourceNuit: lue.sourceNuit }
            : { sommeilMin: e.sommeil_min, milieuMin: e.milieu_min, besoinMin: e.besoin_min, sourceSommeil: e.source_sommeil, sourceNuit: e.source_nuit ?? null }),
        }
      : lue;
    const rang = rangNuit(n);
    if (!rang) continue;
    const arrondi = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
    const ligne = [arrondi(n.rmssd), arrondi(n.fcRepos), n.sommeilMin, arrondi(n.milieuMin), n.besoinMin, n.sourceVfc, n.sourceSommeil, n.sourceFc, n.sourceNuit] as const;
    if (e) {
      if (e.rang > rang) continue;
      const pareil = [e.rmssd, e.fc_repos, e.sommeil_min, e.milieu_min, e.besoin_min, e.source_vfc, e.source_sommeil, e.source_fc, e.source_nuit].every((x, i) => (x ?? null) === (ligne[i] ?? null));
      if (pareil && e.rang === rang) continue;
    }
    await db.runAsync(
      `INSERT INTO recup_nuit (jour, rmssd, fc_repos, sommeil_min, milieu_min, besoin_min, source_vfc, source_sommeil, source_fc, source_nuit, rang, maj_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (jour) DO UPDATE SET rmssd = excluded.rmssd, fc_repos = excluded.fc_repos, sommeil_min = excluded.sommeil_min,
         milieu_min = excluded.milieu_min, besoin_min = excluded.besoin_min, source_vfc = excluded.source_vfc,
         source_sommeil = excluded.source_sommeil, source_fc = excluded.source_fc, source_nuit = excluded.source_nuit,
         rang = excluded.rang, maj_le = excluded.maj_le`,
      [iso, ...ligne, rang, maintenant],
    );
    ecrites++;
  }
  return ecrites;
}

/** Une passe à la fois ; la dernière passe, pour ne pas relire les capteurs à chaque écran (une minute d'écart au moins). */
let enCours: Promise<number> | null = null;
let derniere = { db: null as Executeur | null, t: 0 };
const ECART_MS = 60_000;

/**
 * Tient les nuits à jour : la première fois les 130 derniers jours, ensuite les 3 derniers, ou depuis la plus ancienne mesure
 * de la nuit (VFC, FC au repos : Santé Connect, Withings, FC déduite de la nuit) rangée depuis la passe d'avant (C4). Appelée
 * par le recalcul de fond, la page Récupération (après l'import) et la jauge de Sport ; les appels rapprochés rejoignent la
 * passe en cours.
 */
export function assurerNuitsRecup(db: Executeur, deps: DepsNuits = {}, force = false): Promise<number> {
  const maintenant = deps.maintenant ?? Date.now();
  if (enCours) return enCours;
  if (!force && derniere.db === db && maintenant - derniere.t < ECART_MS) return Promise.resolve(0);
  enCours = (async () => {
    const auj = minuitDe(maintenant);
    const rempli = (await lireReglage(db, REGLAGE_REMPLI).catch(() => null)) === String(RECUP.version);
    const passe = Number(await lireReglage(db, REGLAGE_PASSE).catch(() => null)) || 0;
    const neuve = rempli && passe
      ? await db.getFirstAsync<{ d: number | null }>("SELECT MIN(date) AS d FROM mesure_corps WHERE type IN ('vfc', 'fc') AND cree_le >= ?", [passe]).catch(() => null)
      : null;
    const depuisNeuve = neuve?.d != null ? Math.ceil((auj - minuitDe(neuve.d)) / 86_400_000) : 0;
    const jours = rempli ? Math.min(JOURS_NUITS, Math.max(JOURS_RELUS, depuisNeuve)) : JOURS_NUITS;
    const n = await ecrireNuitsRecup(db, decaler(auj, -jours), auj, deps);
    if (!rempli) await ecrireReglage(db, REGLAGE_REMPLI, String(RECUP.version)).catch(() => undefined);
    await ecrireReglage(db, REGLAGE_PASSE, String(maintenant)).catch(() => undefined);
    derniere = { db, t: maintenant };
    return n;
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}

/** Pour les tests : oublie la dernière passe. */
export const oublierPasseNuits = () => {
  derniere = { db: null, t: 0 };
};

// ---------------------------------------------------------------- lecture

/** Nuits relues avant le premier matin quand la Récupération suit le cycle : 3 cycles de 60 jours au plus. */
const JOURS_NUITS_CYCLE = CYCLE.recup.cycles * CYCLE.plausible[1];

/**
 * La moitié du cycle de chaque matin pour la Récupération (planche cycle, § 3.4) : depuis les jours de règles, relus une fois.
 * null sans jours ou sans l'usage « Récupération » du suivi.
 */
export function phaseRecup(jours: readonly JourCycle[] | null, aujourdhui: string): DonneesRecup["phase"] {
  if (!jours?.length) return null;
  const cs = cycles(episodes(jours, aujourdhui));
  const pv = prevision(cs);
  return (j) => {
    const m = joursMemeMoitie(j, cs, CYCLE, pv);
    return m ? { ...m, min: CYCLE.recup.nuitsMin } : null;
  };
}

/** Les nuits et les charges dont ont besoin les matins de [debut, fin] (minuits) : 42 nuits et 28 jours de plus avant. Avec
 * le suivi du cycle (usage Récupération) : les nuits des 3 derniers cycles aussi, et la moitié de chaque matin. */
export async function lireDonneesRecup(db: Executeur, debut: number, fin: number): Promise<DonneesRecup> {
  const cycle = await joursPourUsage(db, "recup").catch(() => null);
  const depuisNuits = decaler(debut, -((cycle ? Math.max(JOURS_NUITS_CYCLE, RECUP.norme.nuits) : RECUP.norme.nuits) + 1));
  const depuisCharges = decaler(debut, -(RECUP.charge.jours + 1));
  const [lignes, seances, activites, obj, siestes] = await Promise.all([
    db.getAllAsync<LigneNuit>("SELECT * FROM recup_nuit WHERE jour >= ? AND jour <= ?", [isoJour(depuisNuits), isoJour(fin)]).catch((): LigneNuit[] => []),
    chargesParJour(db, depuisCharges, fin).catch(() => new Map<number, number>()),
    activitesEntre(db, depuisCharges, fin).catch(() => new Map()),
    lireReglage(db, REGLAGE_OBJECTIF_SOMMEIL).catch(() => null),
    // les siestes des 8 jours d'avant le premier matin jusqu'au dernier jour : elles comptent dans le sommeil des 24 h de la
    // nuit qui suit, et la dette lit 8 nuits (planche sommeil, besoinNuit)
    siestesParJour(db, decaler(debut, -(RECUP.dette.fenetre + 1)), fin).catch(() => new Map<string, number>()),
  ]);
  const charges = new Map<string, number>();
  for (const [j, c] of seances) charges.set(isoJour(j), (charges.get(isoJour(j)) ?? 0) + c);
  for (const [j, a] of activites) charges.set(isoJour(j), (charges.get(isoJour(j)) ?? 0) + a.charge);
  const o = Number(obj);
  return {
    nuits: new Map(lignes.map((l) => [l.jour, deLigne(l)])),
    charges,
    objectifSommeil: o >= 240 && o <= 720 ? o : OBJECTIF_SOMMEIL_MIN,
    siestes,
    phase: phaseRecup(cycle, isoJour(Math.max(fin, minuitDe(Date.now())))),
  };
}

/** La Récupération du matin d'un jour (minuit). */
export async function lireRecupJour(db: Executeur, jour: number, p: ParamsRecup = RECUP): Promise<ResultatRecup> {
  return scoreRecup(isoJour(jour), await lireDonneesRecup(db, jour, jour), p);
}

/** La Récupération de chaque matin de [debut, fin] (minuits), par minuit ; rien d'après `maintenant`. */
export async function lireRecupJours(db: Executeur, debut: number, fin: number, maintenant = Date.now(), p: ParamsRecup = RECUP): Promise<Map<number, ResultatRecup>> {
  const derniere = Math.min(fin, minuitDe(maintenant));
  const d = await lireDonneesRecup(db, debut, derniere);
  const out = new Map<number, ResultatRecup>();
  for (let j = debut; j <= derniere; j = decaler(j, 1)) out.set(j, scoreRecup(isoJour(j), d, p));
  return out;
}

/**
 * Le dernier matin de la semaine qui a une nuit mesurée, pour la Précision pepfit : sa précision, son âge en jours (0 : ce
 * matin) et ses parts présentes sur 4 ; null sans nuit cette semaine.
 */
/**
 * La qualité moyenne des sources des nuits mesurées de la dette (1 : toutes d'une montre, ½ : toutes du téléphone, D17),
 * pondérée comme la précision de calculerDette ; null sans nuit mesurée.
 */
export function qualiteSources(d: Dette): number | null {
  const tout = d.lignes.reduce((s, l) => s + l.poids, 0);
  const mesure = d.lignes.reduce((s, l) => s + (l.mesuree ? l.poids : 0), 0);
  return mesure > 0 ? Math.min(1, (d.precision * tout) / (100 * mesure)) : null;
}

/** La précision du dernier matin de la semaine qui a une nuit mesurée, et la qualité des sources de sa dette (precision/lire.ts). */
export async function lireDernierMatinRecup(
  db: Executeur,
  maintenant = Date.now(),
): Promise<{ precision: number; jours: number; parts: number; cycle: "ajuste" | "attente" | null; qualiteSommeil: number | null } | null> {
  const auj = minuitDe(maintenant);
  const [l, cycle] = await Promise.all([lireRecupJours(db, decaler(auj, -6), auj, maintenant), joursPourUsage(db, "recup").catch(() => null)]);
  for (let i = 0; i <= 6; i++) {
    const r = l.get(decaler(auj, -i));
    if (r?.nuit)
      return {
        precision: r.precision,
        jours: i,
        parts: Object.values(r.apports).filter((a) => !a.absente).length,
        cycle: cycle ? (r.ajuste ? "ajuste" : "attente") : null,
        qualiteSommeil: qualiteSources(r.detail.sommeil.calcul.dette),
      };
  }
  return null;
}

/** Heure de la nuit d'un jour (fin du sommeil) : « Ce matin, 7:02 ». Whoop ou Santé Connect ne sont pas nommés. */
export async function finNuit(db: Executeur, jour: number, deps: DepsNuits = {}): Promise<number | null> {
  const w = await db.getFirstAsync<{ f: number | null }>("SELECT sommeil_fin AS f FROM whoop_jour WHERE jour = ?", [jour]).catch(() => null);
  if (w?.f != null) return w.f;
  const sc = deps.nuitsSante ? await deps.nuitsSante(jour - 12 * 3_600_000, decaler(jour, 1)).catch(() => null) : null;
  const l = (sc ?? []).filter((n) => minuitDe(n.fin) === jour).sort((a, b) => b.minutes - a.minutes)[0];
  return l?.fin ?? null;
}

// ---------------------------------------------------------------- labo (4 semaines, puis supprimé)

export interface LigneComparaisonRecup {
  jour: number;
  score: number | null;
  calcule: number;
  precision: number;
  apports: Record<"vfc" | "fc" | "sommeil" | "charge", number>;
  /** Le score de Whoop de ce matin (whoop_jour.recup) : lu ici seulement, pour comparer. */
  whoop: number | null;
}

export interface ComparaisonRecup {
  lignes: LigneComparaisonRecup[];
  correlation: number | null;
  /** Écart moyen (pepfit − Whoop) par bande de Whoop. */
  ecartParBande: Record<NiveauRecup, { n: number; ecart: number | null }>;
}

/** Les 28 derniers matins : notre score, ses parts, sa précision, et celui de Whoop (labo/recup). */
export async function lireComparaisonRecup(db: Executeur, maintenant = Date.now(), jours = 28): Promise<ComparaisonRecup> {
  const auj = minuitDe(maintenant);
  const debut = decaler(auj, -(jours - 1));
  const [nous, whoop] = await Promise.all([
    lireRecupJours(db, debut, auj, maintenant),
    db.getAllAsync<{ jour: number; recup: number | null }>("SELECT jour, recup FROM whoop_jour WHERE jour >= ? AND jour <= ?", [debut, auj]).catch(() => []),
  ]);
  const w = new Map(whoop.map((x) => [x.jour, x.recup]));
  const lignes: LigneComparaisonRecup[] = [...nous.values()].reverse().map((r) => ({
    jour: minuitIso(r.jour),
    score: r.score,
    calcule: r.calcule,
    precision: r.precision,
    apports: { vfc: r.apports.vfc.apport, fc: r.apports.fc.apport, sommeil: r.apports.sommeil.apport, charge: r.apports.charge.apport },
    whoop: w.get(minuitIso(r.jour)) ?? null,
  }));
  const couples = lignes.filter((l) => l.score != null && l.whoop != null).map((l) => [l.score!, l.whoop!] as [number, number]);
  const ecartParBande = { pret: { n: 0, ecart: null }, correct: { n: 0, ecart: null }, fatigue: { n: 0, ecart: null } } as ComparaisonRecup["ecartParBande"];
  const sommes = { pret: 0, correct: 0, fatigue: 0 };
  for (const [nousS, whoopS] of couples) {
    const b = niveauRecup(whoopS);
    ecartParBande[b].n++;
    sommes[b] += nousS - whoopS;
  }
  for (const b of ["pret", "correct", "fatigue"] as const) ecartParBande[b].ecart = ecartParBande[b].n ? sommes[b] / ecartParBande[b].n : null;
  return { lignes, correlation: correlation(couples), ecartParBande };
}

// ---------------------------------------------------------------- labo du sommeil (planche sommeil, D19)

export interface LigneComparaisonSommeil {
  jour: number;
  /** Notre « à rattraper » de ce matin (calculerDette, siestes du jour non retirées) ; null sous le seuil de précision. */
  aRattraper: number | null;
  precision: number;
  /** La dette de Whoop de ce matin (whoop_jour.sommeil_dette_min) : lue ici seulement, pour comparer. */
  whoop: number | null;
  /** Nous − Whoop, en minutes. */
  ecart: number | null;
  /** Notre besoin de la nuit et celui de Whoop (base + dette + effort + sieste). */
  besoin: number;
  besoinWhoop: number | null;
}

export interface ComparaisonSommeil {
  lignes: LigneComparaisonSommeil[];
  correlation: number | null;
  /** Écart moyen (nous − Whoop) des matins où les deux sont chiffrés. */
  ecartMoyen: number | null;
  n: number;
}

/** Les 28 derniers matins : notre « à rattraper » et notre besoin, face à la dette et au besoin de Whoop (labo/sommeil). */
export async function lireComparaisonSommeil(db: Executeur, maintenant = Date.now(), jours = 28): Promise<ComparaisonSommeil> {
  const auj = minuitDe(maintenant);
  const debut = decaler(auj, -(jours - 1));
  type W = { jour: number; sommeil_dette_min: number | null; besoin_base_min: number | null; besoin_effort_min: number | null; besoin_sieste_min: number | null };
  const [nous, whoop] = await Promise.all([
    lireRecupJours(db, debut, auj, maintenant),
    db
      .getAllAsync<W>("SELECT jour, sommeil_dette_min, besoin_base_min, besoin_effort_min, besoin_sieste_min FROM whoop_jour WHERE jour >= ? AND jour <= ?", [debut, auj])
      .catch((): W[] => []),
  ]);
  const w = new Map(whoop.map((x) => [x.jour, x]));
  const lignes: LigneComparaisonSommeil[] = [...nous.values()].reverse().map((r) => {
    const { dette, besoin } = r.detail.sommeil.calcul;
    const j = minuitIso(r.jour);
    const x = w.get(j);
    const aRattraper = dette.chiffre ? dette.aRattraper : null;
    const whoopDette = x?.sommeil_dette_min == null ? null : Math.round(x.sommeil_dette_min);
    return {
      jour: j,
      aRattraper,
      precision: dette.precision,
      whoop: whoopDette,
      ecart: aRattraper != null && whoopDette != null ? aRattraper - whoopDette : null,
      besoin: besoin.total,
      besoinWhoop: x?.besoin_base_min == null ? null : Math.round(x.besoin_base_min + (x.sommeil_dette_min ?? 0) + (x.besoin_effort_min ?? 0) + (x.besoin_sieste_min ?? 0)),
    };
  });
  const couples = lignes.filter((l) => l.ecart != null).map((l) => [l.aRattraper!, l.whoop!] as [number, number]);
  const ecartMoyen = couples.length ? couples.reduce((s, [a, b]) => s + a - b, 0) / couples.length : null;
  return { lignes, correlation: correlation(couples), ecartMoyen, n: couples.length };
}
