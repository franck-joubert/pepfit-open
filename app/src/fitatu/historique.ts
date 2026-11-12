// Historique Fitatu : de la création du compte jusqu'à aujourd'hui, par lots de LOT_JOURS jours, du plus ancien au plus
// récent. Chaque jour est un appel (Fitatu n'a pas de lecture par période), chaque produit nouveau un appel de plus :
// EN_VOL appels au plus en même temps, départs espacés de PAUSE_MS. Un 429 qui persiste ralentit l'import (un appel à la
// fois, pause d'au moins 1 s) au lieu de l'arrêter ; une coupure réseau est réessayée. Un lot lu est converti au format
// {jours, aliments} puis passé à importerFitatu (idempotent, une transaction par lot) ; l'avancement est gardé après chaque
// lot : une coupure (appli fermée, session) reprend au lot suivant. Mesures et cause du 31/10 : docs/FITATU-VITESSE.md.
// Une fois fini, « Mettre à jour » relit depuis quelques jours avant la fin précédente jusqu'à aujourd'hui ; « Tout
// réimporter » relit tout l'historique. Chaque jour relu est mis en accord avec Fitatu (docs/FITATU-MAJ.md).
// Sans React ni réseau : testé par tests/fitatu-connexion.test.ts.
import type { ExportFitatu, FicheFitatu, ItemFitatu, RapportFitatu } from "../import/fitatu";
import { ErreurFitatu, type CodeFitatu } from "./api";

/** Jours par lot : une transaction et un point de reprise par lot. */
export const LOT_JOURS = 28;
/** Appels à Fitatu en même temps, au plus (API privée : on reste discret). */
export const EN_VOL = 3;
/** Écart entre deux départs d'appel : 4 appels par seconde au plus. */
export const PAUSE_MS = 250;
/** Après un 429 qui persiste (Retry-After déjà attendu par le client) : attente, puis nouvel essai, ESSAIS_429 fois. */
export const ATTENTE_LIMITE_MS = 30_000;
export const ESSAIS_429 = 4;
/** Coupure réseau (appli revenue au premier plan, Wi-Fi qui saute) : attente puis nouvel essai, ESSAIS_RESEAU fois. */
export const ATTENTE_RESEAU_MS = 5_000;
export const ESSAIS_RESEAU = 3;
/** Jours relus avant la fin précédente par « Mettre à jour » (repas ajoutés après coup). */
export const RELECTURE_JOURS = 7;
/** Sans date de création lisible, l'historique remonte à ce nombre de jours. */
export const REPLI_JOURS = 730;

/** Avancement gardé (réglage fitatu_import) : période en cours, dernier jour importé, totaux. */
export interface EtatImportFitatu {
  /** AAAA-MM-JJ, inclus. */
  debut: string;
  fin: string;
  /** Dernier jour importé ; null avant le premier lot. */
  fait: string | null;
  fini?: boolean;
  joursAvecRepas: number;
  alimentsImportes: number;
  alimentsDejaPresents: number;
  /** Mise en accord (docs/FITATU-MAJ.md) : lignes mises à jour, supprimées ; lignes sèches de plus de 800 g signalées. */
  alimentsMisAJour?: number;
  alimentsSupprimes?: number;
  alertes?: string[];
  produitsCrees: number;
  erreurs: number;
}

export interface Progression {
  /** Jours lus sur la période en cours, et leur total. */
  jours: number;
  total: number;
  alimentsImportes: number;
}

export type IssueImport = "fini" | "coupe" | CodeFitatu;

const JOUR_MS = 86_400_000;
const enMs = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const enIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const decaler = (iso: string, jours: number) => enIso(enMs(iso) + jours * JOUR_MS);
export const ecart = (de: string, a: string) => Math.round((enMs(a) - enMs(de)) / JOUR_MS);

/** Lots de `taille` jours de `debut` à `fin` (inclus), du plus ancien au plus récent. */
export function lots(debut: string, fin: string, taille = LOT_JOURS): string[][] {
  const l: string[][] = [];
  for (let d = debut; d <= fin; d = decaler(d, taille)) {
    const lot: string[] = [];
    for (let i = 0; i < taille && decaler(d, i) <= fin; i++) lot.push(decaler(d, i));
    l.push(lot);
  }
  return l;
}

export function lireEtat(brut: string | null): EtatImportFitatu | null {
  if (!brut) return null;
  try {
    const e = JSON.parse(brut) as EtatImportFitatu;
    return typeof e.debut === "string" && typeof e.fin === "string" && (e.fait === null || typeof e.fait === "string") ? e : null;
  } catch {
    return null;
  }
}

/** La réponse est-elle une journée lue en entier (`dietPlan`, même vide) ? Seules celles-là sont mises en accord. */
export const jourLu = (reponse: unknown): boolean => {
  const plan = (reponse as { dietPlan?: unknown } | null)?.dietPlan;
  return !!plan && typeof plan === "object" && !Array.isArray(plan);
};

/** Alertes gardées dans l'avancement, au plus. */
const MAX_ALERTES = 50;

/** Repas d'une journée lue (`dietPlan`) au format de l'import : lignes supprimées (deletedAt) écartées. */
export function repasDuJour(reponse: unknown): ExportFitatu["jours"][string] {
  const plan = (reponse as { dietPlan?: unknown } | null)?.dietPlan;
  const r: ExportFitatu["jours"][string] = {};
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return r;
  for (const [cle, repas] of Object.entries(plan as Record<string, unknown>)) {
    const items = (repas as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) continue;
    const vivants = items.filter((i): i is ItemFitatu & { deletedAt?: unknown } => !!i && typeof i === "object" && !(i as { deletedAt?: unknown }).deletedAt);
    if (vivants.length) r[cle] = { mealName: (repas as { mealName?: string | null }).mealName ?? null, items: vivants };
  }
  return r;
}

export interface DepsHistorique {
  jour(date: string): Promise<unknown>;
  produit(id: number | string): Promise<unknown>;
  /** Produit déjà importé, sous la clé fitatu:produit:<id> ou fitatu:perso:<id> : sa fiche est inutile. */
  produitConnu(id: number | string): Promise<"produit" | "perso" | null>;
  /** importerFitatu dans une transaction exclusive ; `joursRelus` : jours lus en entier, mis en accord. */
  importer(e: ExportFitatu, joursRelus: string[]): Promise<RapportFitatu>;
  lireEtat(): Promise<string | null>;
  ecrireEtat(e: string): Promise<void>;
  attendre(ms: number): Promise<void>;
  /** AAAA-MM-JJ du jour. */
  aujourdhui(): string;
  /** Première date de l'historique (création du compte). */
  premiereDate(): Promise<string>;
  /** Faux si Fitatu a été déconnecté entre-temps : on s'arrête sans rien écrire de plus. */
  actif(): Promise<boolean>;
  progres?(p: Progression): void;
  /** Horloge (ms) des mesures ; Date.now par défaut. */
  maintenant?(): number;
  /** Mesures de chaque lot (journal de l'appli). */
  mesure?(m: MesureLot): void;
}

export interface MesureLot {
  jours: number;
  appels: number;
  /** Lecture chez Fitatu, puis écriture en base (ms). */
  lectureMs: number;
  ecritureMs: number;
  /** Appels en même temps et écart entre deux départs, après d'éventuels 429. */
  enVol: number;
  pauseMs: number;
}

export interface Cadence {
  enVol: number;
  pauseMs: number;
}

/**
 * File des appels à Fitatu : `enVol` au plus en même temps, départs espacés de `pauseMs` (pas de pause avant le premier).
 * Un 429 qui persiste passe à un appel à la fois et allonge la pause (1 s, puis 2 s et 3 s si le même appel est encore
 * refusé), attend ATTENTE_LIMITE_MS et réessaie ; une coupure réseau attend ATTENTE_RESEAU_MS et réessaie.
 */
export function fileAppels(attendre: (ms: number) => Promise<void>, depart: Cadence) {
  const c = { ...depart };
  let enCours = 0;
  let appels = 0;
  let porte: Promise<void> = Promise.resolve();
  const enAttente: (() => void)[] = [];
  const prendre = async () => {
    while (enCours >= c.enVol) await new Promise<void>((r) => enAttente.push(r));
    enCours++;
  };
  const rendre = () => {
    enCours--;
    enAttente.shift()?.();
  };
  const tour = () => (porte = porte.then(() => (appels++ > 0 ? attendre(c.pauseMs) : undefined)));
  const appeler = async <T>(f: () => Promise<T>): Promise<T> => {
    let limites = 0;
    let coupures = 0;
    for (;;) {
      await prendre();
      try {
        await tour();
        return await f();
      } catch (x) {
        if (!(x instanceof ErreurFitatu)) throw x;
        if (x.code === "limite" && ++limites < ESSAIS_429) {
          c.enVol = 1;
          c.pauseMs = Math.max(c.pauseMs, 1_000 * limites); // 1 s, puis 2 s, 3 s si le même appel est encore refusé
          await attendre(ATTENTE_LIMITE_MS);
          continue;
        }
        if (x.code === "reseau" && ++coupures < ESSAIS_RESEAU) {
          await attendre(ATTENTE_RESEAU_MS);
          continue;
        }
        throw x;
      } finally {
        rendre();
      }
    }
  };
  return { appeler, cadence: () => ({ ...c }), appels: () => appels };
}


/** Nouvelle période : tout l'historique la première fois (ou `tout`), sinon la fin de la précédente (moins RELECTURE_JOURS) à aujourd'hui. */
async function nouvellePeriode(d: DepsHistorique, avant: EtatImportFitatu | null, tout = false): Promise<EtatImportFitatu> {
  const fin = d.aujourdhui();
  const debut = avant?.fini && !tout ? decaler(avant.fin, -RELECTURE_JOURS) : await d.premiereDate();
  const vide = { joursAvecRepas: 0, alimentsImportes: 0, alimentsDejaPresents: 0, produitsCrees: 0, erreurs: 0 };
  return { ...vide, debut: debut > fin ? fin : debut, fin, fait: null };
}

/**
 * Importe la période en cours (reprise au lot qui suit le dernier fait), ou en ouvre une nouvelle (`mettreAJour`, ou
 * premier import). `toutReimporter` ouvre une période sur tout l'historique, même si un import est fini ou en cours. Session refusée, 429 ou réseau qui persistent, serveur : arrêt, l'avancement reste et l'issue le dit.
 */
export async function importerHistorique(d: DepsHistorique, o: { mettreAJour?: boolean; toutReimporter?: boolean; cadence?: Cadence; lot?: number } = {}): Promise<IssueImport> {
  let e = lireEtat(await d.lireEtat());
  if (!e || (e.fini && o.mettreAJour) || o.toutReimporter) {
    e = await nouvellePeriode(d, e, o.toutReimporter);
    await d.ecrireEtat(JSON.stringify(e));
  }
  if (e.fini) return "fini";
  const total = ecart(e.debut, e.fin) + 1;
  const reste = lots(e.fait ? decaler(e.fait, 1) : e.debut, e.fin, o.lot);
  const fiches = new Map<string, FicheFitatu>();
  const file = fileAppels(d.attendre, o.cadence ?? { enVol: EN_VOL, pauseMs: PAUSE_MS });
  const maintenant = d.maintenant ?? Date.now;
  let lus = e.fait ? ecart(e.debut, e.fait) + 1 : 0;
  d.progres?.({ jours: lus, total, alimentsImportes: e.alimentsImportes });
  try {
    for (const lot of reste) {
      if (!(await d.actif())) return "coupe";
      const t0 = maintenant();
      const appels0 = file.appels();
      const exp: ExportFitatu = { exporte_le: d.aujourdhui(), jours: {}, aliments: {} };
      const lues = await Promise.all(
        lot.map(async (date) => {
          let reponse: unknown;
          try {
            reponse = await file.appeler(() => d.jour(date));
          } catch (x) {
            if (x instanceof ErreurFitatu && x.code === "absent") reponse = null; // jour jamais ouvert
            else throw x;
          }
          d.progres?.({ jours: ++lus, total, alimentsImportes: e!.alimentsImportes });
          return [date, repasDuJour(reponse), jourLu(reponse)] as const;
        }),
      );
      for (const [date, repas] of lues) if (Object.keys(repas).length) exp.jours[date] = repas;
      // un jour absent (404) ou illisible n'est pas relu : ses lignes restent
      const relus = lues.filter(([, , lu]) => lu).map(([date]) => date);
      // fiches des produits nouveaux (les recettes et les aliments libres se convertissent avec leurs propres valeurs)
      const aLire = new Set<string>();
      for (const repas of Object.values(exp.jours).flatMap((j) => Object.values(j))) {
        for (const i of repas.items) {
          if ((i.foodType ?? "PRODUCT").toUpperCase() !== "PRODUCT" || i.productId == null) continue;
          const cle = `PRODUCT:${i.productId}`;
          if (fiches.has(cle) || aLire.has(String(i.productId))) continue;
          const connu = await d.produitConnu(i.productId);
          // produit perso déjà importé : sa clé (fitatu:perso:…) se retrouve sans relire la fiche
          if (connu) {
            if (connu === "perso") fiches.set(cle, { private: true });
            continue;
          }
          aLire.add(String(i.productId));
        }
      }
      await Promise.all(
        [...aLire].map(async (id) => {
          try {
            fiches.set(`PRODUCT:${id}`, (await file.appeler(() => d.produit(id))) as FicheFitatu);
          } catch (x) {
            // produit supprimé ou caché : l'aliment garde les valeurs du journal
            if (x instanceof ErreurFitatu && x.code === "absent") fiches.set(`PRODUCT:${id}`, { _erreur: 404 });
            else throw x;
          }
        }),
      );
      for (const cle of Object.keys(exp.jours).length ? fiches.keys() : []) exp.aliments[cle] = fiches.get(cle)!;
      if (!(await d.actif())) return "coupe";
      const t1 = maintenant();
      const r = Object.keys(exp.jours).length || relus.length ? await d.importer(exp, relus) : null;
      e = {
        ...e,
        fait: lot.at(-1)!,
        joursAvecRepas: e.joursAvecRepas + (r?.joursImportes ?? 0),
        alimentsImportes: e.alimentsImportes + (r?.alimentsImportes ?? 0),
        alimentsDejaPresents: e.alimentsDejaPresents + (r?.alimentsDejaPresents ?? 0),
        alimentsMisAJour: (e.alimentsMisAJour ?? 0) + (r?.alimentsMisAJour ?? 0),
        alimentsSupprimes: (e.alimentsSupprimes ?? 0) + (r?.alimentsSupprimes ?? 0),
        alertes: [...(e.alertes ?? []), ...(r?.alertes ?? [])].slice(-MAX_ALERTES),
        produitsCrees: e.produitsCrees + (r?.produitsCrees ?? 0),
        erreurs: e.erreurs + (r?.erreurs.length ?? 0),
      };
      await d.ecrireEtat(JSON.stringify(e));
      d.mesure?.({ jours: lot.length, appels: file.appels() - appels0, lectureMs: t1 - t0, ecritureMs: maintenant() - t1, ...file.cadence() });
      lus = ecart(e.debut, e.fait!) + 1;
      d.progres?.({ jours: lus, total, alimentsImportes: e.alimentsImportes });
    }
  } catch (x) {
    if (x instanceof ErreurFitatu) return x.code;
    throw x;
  }
  await d.ecrireEtat(JSON.stringify({ ...e, fini: true }));
  return "fini";
}
