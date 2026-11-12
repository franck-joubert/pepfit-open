import { estSiesteSante } from "../../ecrans/recuperer";
import type { EtatSante, FrequenceRepos, MesureSante, PasJour, PermissionSante, PoidsCorporel, Sante, SeanceSport, SommeilNuit, TypeMesureSante } from "./types";

// Logique de Santé Connect, sans module natif : testée avec un natif simulé (tests/sante.test.ts).

/** Accès bruts du module Kotlin modules/pepfit-sante. Dates en ms. */
export interface NatifSante {
  /** 1 absent, 2 à mettre à jour, 3 disponible. */
  statut(): Promise<number>;
  autorisees(): Promise<string[]>;
  demander(permissions: string[]): Promise<string[]>;
  /** Santé Connect sait donner l'historique (READ_HEALTH_DATA_HISTORY). Absente d'un module natif plus ancien que l'appli. */
  historiquePossible?(): Promise<boolean>;
  poids(debut: number, fin: number): Promise<{ kg: number; date: number; origine: string }[]>;
  /** Pas de chaque intervalle [bornes[i], bornes[i+1]] ; -1 sans donnée. */
  pas(bornes: number[]): Promise<number[]>;
  /** Pas de chaque heure de [debut, fin] en une demande : [début de l'heure, pas] des heures avec une donnée. Absente d'un
   * module natif plus ancien que l'appli. */
  pasHeures?(debut: number, fin: number): Promise<[number, number][]>;
  sommeil(debut: number, fin: number): Promise<SessionSommeil[]>;
  frequenceRepos(debut: number, fin: number): Promise<{ bpm: number; date: number; origine: string }[]>;
  exporter(debut: number, fin: number, titre: string, id: string): Promise<void>;
  mesures(type: Exclude<TypeMesureSante, "fc">, debut: number, fin: number): Promise<{ valeur: number; date: number; origine: string }[]>;
  seancesSport(debut: number, fin: number): Promise<{ debut: number; fin: number; type: number; titre: string | null; origine: string }[]>;
  /** kcal actives de chaque intervalle [bornes[i], bornes[i+1]] ; -1 sans donnée. */
  kcalActives(bornes: number[]): Promise<number[]>;
  /** Distance (m) de chaque intervalle ; -1 sans donnée. Absente d'un module natif plus ancien que l'appli. */
  distance?(bornes: number[]): Promise<number[]>;
  /** Échantillons de FC de l'intervalle. Absente d'un module natif plus ancien que l'appli. */
  fc?(debut: number, fin: number): Promise<{ t: number; bpm: number }[]>;
  /** Applis qui ont écrit des pas sur l'intervalle (enregistrements bruts). Absente d'un module natif plus ancien. */
  originesPas?(debut: number, fin: number): Promise<string[]>;
  /** Applis qui écrivent dans Santé Connect sur l'intervalle, pour les types demandés (« pas », « fc », « sommeil », « sport ») : une page
   * d'enregistrements par type. Absente d'un module natif plus ancien que l'appli. */
  origines?(debut: number, fin: number, types: string[]): Promise<string[]>;
  /** Enregistrements bruts de pas de l'intervalle (toutes applis, priorités de Santé Connect ignorées). Absente d'un module natif plus ancien. */
  pasBruts?(debut: number, fin: number): Promise<{ debut: number; fin: number; pas: number; origine: string }[]>;
  /** Règles de l'intervalle (périodes et flux). Absente d'un module natif plus ancien que l'appli. */
  regles?(debut: number, fin: number): Promise<{ periodes: { debut: number; fin: number; id: string }[]; flux: { date: number; flux: number; id: string }[] }>;
  installees(paquets: string[]): Promise<string[]>;
  ouvrir(paquet: string | null): Promise<void>;
}

export interface SessionSommeil {
  debut: number;
  fin: number;
  origine: string;
  etapes: { debut: number; fin: number; type: number }[];
}

const DISPONIBLE = 3;
const HEURE = 3_600_000;
const JOUR = 86_400_000;
/** Une lecture de Santé Connect qui ne répond pas en 10 s échoue (la page s'affiche avec ce qu'elle a) : docs/PAS-CHARGEMENT.md. */
export const DELAI_LECTURE_MS = 10_000;
/** Lecture groupée par heure : au plus 31 jours (744 heures) par demande. */
const TRANCHE_HEURES = 31 * JOUR;

export class ErreurDelaiSante extends Error {
  override name = "ErreurDelaiSante";
}

/** `p`, ou ErreurDelaiSante après `ms` (la lecture native continue, son résultat est ignoré). */
export function avantDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((ok, ko) => {
    const minuteur = setTimeout(() => ko(new ErreurDelaiSante(`Santé Connect sans réponse en ${ms} ms`)), ms);
    p.then(
      (v) => (clearTimeout(minuteur), ok(v)),
      (e: unknown) => (clearTimeout(minuteur), ko(e)),
    );
  });
}

/** Les bornes tombent sur des heures pleines (la dernière peut être « maintenant ») : la lecture par heure les sert. */
const surLesHeures = (bornes: number[]) => bornes.every((b, i) => (i === bornes.length - 1 || b % HEURE === 0) && (i === 0 || b > bornes[i - 1]!));

/**
 * Pas de chaque intervalle [bornes[i], bornes[i+1]] par la lecture groupée par heure (une demande par tranche de 31 jours, au
 * lieu d'une par intervalle) : la somme des heures de l'intervalle, -1 s'il n'en a aucune. Même forme que `pas(bornes)`.
 */
async function pasParHeures(pasHeures: NonNullable<NatifSante["pasHeures"]>, bornes: number[]): Promise<number[]> {
  const fin = bornes[bornes.length - 1]!;
  const heures: [number, number][] = [];
  for (let a = bornes[0]!; a < fin; a += TRANCHE_HEURES) heures.push(...(await pasHeures(a, Math.min(a + TRANCHE_HEURES, fin))));
  const v = bornes.slice(1).map(() => -1);
  for (const [t, n] of heures) {
    if (t < bornes[0]! || t >= fin) continue;
    // dernier intervalle qui commence à t ou avant (bornes croissantes : dichotomie)
    let [g, d] = [0, bornes.length - 2];
    while (g < d) {
      const m = (g + d + 1) >> 1;
      if (bornes[m]! <= t) g = m;
      else d = m - 1;
    }
    const i = g;
    v[i] = (v[i]! < 0 ? 0 : v[i]!) + n;
  }
  return v;
}

/**
 * Pas d'une plage d'après les enregistrements bruts de toutes les applis, quand l'agrégat de Santé Connect n'en rend aucun (l'appli de la
 * montre n'est pas dans ses priorités, ou n'y a pas encore écrit). Chaque enregistrement compte pour sa part dans la plage (prorata de
 * la durée) ; la montre et le téléphone comptent les mêmes pas : le total de chaque appli est gardé à part et la plus haute l'emporte
 * (jamais la somme, qui doublerait). null sans enregistrement.
 */
export function fusionnerPasBruts(enregistrements: readonly { debut: number; fin: number; pas: number; origine: string }[], debut: number, fin: number): number | null {
  const parAppli = new Map<string, number>();
  for (const e of enregistrements) {
    if (!(e.pas >= 0) || !(e.fin > e.debut)) continue;
    const commun = Math.min(e.fin, fin) - Math.max(e.debut, debut);
    if (commun <= 0) continue;
    parAppli.set(e.origine, (parAppli.get(e.origine) ?? 0) + (e.pas * commun) / (e.fin - e.debut));
  }
  return parAppli.size ? Math.round(Math.max(...parAppli.values())) : null;
}
const FENETRE_POIDS = 30 * JOUR;

export const PERMISSIONS: Record<PermissionSante, string> = {
  poids: "android.permission.health.READ_WEIGHT",
  pas: "android.permission.health.READ_STEPS",
  sommeil: "android.permission.health.READ_SLEEP",
  "frequence-cardiaque": "android.permission.health.READ_RESTING_HEART_RATE",
  seances: "android.permission.health.WRITE_EXERCISE",
  gras: "android.permission.health.READ_BODY_FAT",
  maigre: "android.permission.health.READ_LEAN_BODY_MASS",
  os: "android.permission.health.READ_BONE_MASS",
  eau: "android.permission.health.READ_BODY_WATER_MASS",
  bmr: "android.permission.health.READ_BASAL_METABOLIC_RATE",
  vfc: "android.permission.health.READ_HEART_RATE_VARIABILITY",
  respiration: "android.permission.health.READ_RESPIRATORY_RATE",
  sport: "android.permission.health.READ_EXERCISE",
  "kcal-actives": "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
  distance: "android.permission.health.READ_DISTANCE",
  taille: "android.permission.health.READ_HEIGHT",
  "fc-montre": "android.permission.health.READ_HEART_RATE",
  regles: "android.permission.health.READ_MENSTRUATION",
  historique: "android.permission.health.READ_HEALTH_DATA_HISTORY",
};

/** Demandées avec les autres quand Santé Connect sait les donner, sans compter dans le résultat de la demande : sans elles, tout
 * marche, sur 30 jours d'avant la première autorisation (version de Santé Connect trop ancienne, refus). */
export const PERMISSIONS_FACULTATIVES: readonly PermissionSante[] = ["historique"];

/** Ce que lit la page Santé (cases, bilan, Composition, Sommeil) : demandé d'un coup depuis ses sources. La FC de la montre
 * (« fc-montre ») en fait partie : sans Whoop, c'est elle qui mesure l'Effort et les kcal des séances, l'activité de la
 * journée et les activités détectées (docs/AUDIT-SANS-WHOOP.md). */
export const PERMISSIONS_PAGE_SANTE: PermissionSante[] = [
  "poids", "pas", "sommeil", "frequence-cardiaque", "gras", "maigre", "os", "eau", "bmr", "vfc", "respiration", "sport", "kcal-actives", "distance", "taille",
  "fc-montre",
];

/** Ce que demandent les gestes « Autoriser » de Santé Connect (parcours d'arrivée, Connexions, sources de la page Santé) : la
 * page Santé et l'historique au-delà de 30 jours (facultatif, ne compte pas dans « autorisée »). */
export const PERMISSIONS_DEMANDE_SANTE: PermissionSante[] = [...PERMISSIONS_PAGE_SANTE, "historique"];

/** Paquets de l'appli (pepfit, puis l'ancienne Fonte) : leurs séances, écrites dans Santé Connect, ne comptent pas deux fois. */
export const PAQUETS_PROPRES: readonly string[] = ["fit.pep.open", "fit.pep", "us.lug.fonte"];

/** Ce que lit `originesDonnees` : le type du natif et l'autorisation qui l'ouvre (la FC, séances : lecture des autres applis). */
const TYPES_ORIGINES: readonly [string, PermissionSante][] = [["pas", "pas"], ["fc", "fc-montre"], ["sommeil", "sommeil"], ["sport", "sport"]];

/** Mesures valides (valeur > 0), de la plus récente à la plus ancienne. */
export function mesuresTriees(l: { valeur: number; date: number; origine: string }[]): MesureSante[] {
  return l
    .filter((x) => Number.isFinite(x.valeur) && x.valeur > 0)
    .sort((a, b) => b.date - a.date)
    .map((x) => ({ valeur: x.valeur, date: x.date, origine: x.origine || null }));
}

/**
 * Une nuit par jour de réveil (la plus longue des sessions qui finissent ce jour-là), de la plus ancienne à la plus récente.
 * Une sieste (session de journée, recuperer.ts, D4) n'est jamais une nuit : elle va dans « Siestes » (recup_activite).
 */
export function nuitsParJour(sessions: SessionSommeil[]): SommeilNuit[] {
  const parJour = new Map<number, SessionSommeil[]>();
  for (const s of sessions) {
    if (!(s.fin > s.debut) || estSiesteSante(s.debut, s.fin)) continue;
    const j = minuit(s.fin);
    parJour.set(j, [...(parJour.get(j) ?? []), s]);
  }
  return [...parJour.keys()].sort((a, b) => a - b).map((j) => nuit(parJour.get(j)!)!).filter(Boolean);
}

/** Minuit (heure locale) du jour de `ms`, décalé de `decalage` jours. */
export function minuit(ms: number, decalage = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + decalage).getTime();
}

/** Bornes des `jours` derniers jours : minuit de chacun, puis `maintenant` (aujourd'hui est en cours). */
export function bornesJours(maintenant: number, jours: number): number[] {
  return [...Array.from({ length: jours }, (_, i) => minuit(maintenant, i - jours + 1)), maintenant];
}

export function pasParJour(bornes: number[], valeurs: number[]): PasJour[] {
  return bornes.slice(0, -1).map((jour, i) => {
    const v = valeurs[i];
    return { jour, pas: v == null || v < 0 ? null : Math.round(v) };
  });
}

/** Pesée la plus récente, kg arrondis au centième ; les valeurs aberrantes sont ignorées. */
export function plusRecentPoids(pesees: { kg: number; date: number; origine: string }[]): PoidsCorporel | null {
  const p = pesees.filter((x) => x.kg > 0 && x.kg <= 500).reduce<(typeof pesees)[number] | null>((a, x) => (!a || x.date > a.date ? x : a), null);
  return p ? { kg: Math.round(p.kg * 100) / 100, date: p.date, origine: p.origine || null } : null;
}

const PHASE: Record<number, "leger" | "profond" | "paradoxal" | "eveil" | undefined> = {
  1: "eveil", // AWAKE
  3: "eveil", // OUT_OF_BED
  7: "eveil", // AWAKE_IN_BED
  4: "leger", // LIGHT
  5: "profond", // DEEP
  6: "paradoxal", // REM
};
const minutes = (ms: number) => Math.round(ms / 60_000);

/** La nuit : la plus longue session terminée dans la fenêtre. Temps endormi = session moins éveils si les phases sont connues. */
export function nuit(sessions: SessionSommeil[]): SommeilNuit | null {
  const s = sessions.filter((x) => x.fin > x.debut).reduce<SessionSommeil | null>((a, x) => (!a || x.fin - x.debut > a.fin - a.debut ? x : a), null);
  if (!s) return null;
  let phases: SommeilNuit["phases"] = null;
  let eveil = 0;
  if (s.etapes.length) {
    const ms = { leger: 0, profond: 0, paradoxal: 0, eveil: 0 };
    for (const e of s.etapes) {
      const p = PHASE[e.type];
      if (p) ms[p] += Math.max(0, e.fin - e.debut);
    }
    eveil = ms.eveil;
    phases = { leger: minutes(ms.leger), profond: minutes(ms.profond), paradoxal: minutes(ms.paradoxal), eveil: minutes(ms.eveil) };
  }
  const etapes = [...s.etapes].sort((a, b) => a.debut - b.debut);
  return { debut: s.debut, fin: s.fin, minutes: minutes(s.fin - s.debut - eveil), phases, origine: s.origine || null, etapes };
}

export function derniereFrequence(mesures: { bpm: number; date: number; origine: string }[]): FrequenceRepos | null {
  const m = mesures.filter((x) => x.bpm > 0).reduce<(typeof mesures)[number] | null>((a, x) => (!a || x.date > a.date ? x : a), null);
  return m ? { bpm: Math.round(m.bpm), date: m.date, origine: m.origine || null } : null;
}

/** `statut` et `autorisees` gardés 30 s (docs/PERF-A.md, M1) : avant, chaque lecture les refaisait (3 appels natifs au lieu d'un). */
export const VIE_AUTORISATIONS_MS = 30_000;

/** Une lecture gardée `vieMs` ; deux appels en même temps partagent la même promesse ; un échec n'est pas gardé. */
function gardee<T>(lire: () => Promise<T>, maintenant: () => number, vieMs: number) {
  let m: { t: number; p: Promise<T> } | null = null;
  return {
    lire(): Promise<T> {
      const t = maintenant();
      if (m && t - m.t < vieMs && t >= m.t) return m.p;
      const x = { t, p: lire() };
      m = x;
      x.p.catch(() => {
        if (m === x) m = null;
      });
      return x.p;
    },
    oublier: () => void (m = null),
  };
}

/** Une lecture refusée par Santé Connect (autorisation retirée entre-temps) : les autorisations sont relues. */
const refusee = (e: unknown) => /SecurityException/i.test(String((e as { message?: unknown })?.message ?? e));

/** Sante branchée sur un module natif ; null (APK sans le module) : tout est « non-branche ». */
export function fabriquerSante(natif: NatifSante | null, maintenant: () => number = Date.now, delaiMs: number = DELAI_LECTURE_MS): Sante {
  const statut = gardee(async () => natif != null && (await avantDelai(natif.statut(), delaiMs)) === DISPONIBLE, maintenant, VIE_AUTORISATIONS_MS);
  const autorisations = gardee(
    async (): Promise<Set<string>> => new Set(natif && (await statut.lire()) ? await avantDelai(natif.autorisees(), delaiMs) : []),
    maintenant,
    VIE_AUTORISATIONS_MS,
  );
  const oublier = () => {
    statut.oublier();
    autorisations.oublier();
  };
  const present = () => statut.lire();
  const accordees = () => autorisations.lire();
  /** Lit seulement si l'autorisation est accordée ; une lecture sans réponse en `delaiMs` échoue (l'écriture, elle, attend). */
  const si = async <T>(p: PermissionSante, lire: (n: NatifSante) => Promise<T>, attendre = false): Promise<T | null> => {
    if (!natif || !(await accordees()).has(PERMISSIONS[p])) return null;
    const l = lire(natif).catch((e: unknown) => {
      if (refusee(e)) oublier();
      throw e;
    });
    return attendre ? l : avantDelai(l, delaiMs);
  };
  /** Santé Connect présent et assez récent pour l'historique ; un module natif ancien ou une erreur : non. */
  const historiquePossible = async () => !!natif?.historiquePossible && (await present()) && (await avantDelai(natif.historiquePossible(), delaiMs).catch(() => false));
  /** Pas par intervalle : lecture groupée par heure si le module la connaît et que les bornes s'y prêtent, sinon un appel par intervalle. */
  const pasDe = (n: NatifSante, bornes: number[]) => (n.pasHeures && bornes.length > 2 && surLesHeures(bornes) ? pasParHeures(n.pasHeures, bornes) : n.pas(bornes));
  /** Pas d'une plage d'après les enregistrements bruts (fusion des applis) ; null sans module récent, sans enregistrement ou en échec. */
  const pasBrutsEntre = async (debut: number, fin: number): Promise<number | null> => {
    const l = await si("pas", (n) => (n.pasBruts ? n.pasBruts(debut, fin) : Promise.resolve(null))).catch(() => null);
    return l ? fusionnerPasBruts(l, debut, fin) : null;
  };
  const peseesEntre = async (debut: number, fin: number): Promise<PoidsCorporel[] | null> => {
    const l = await si("poids", (n) => n.poids(debut, fin));
    return l
      ? l.filter((x) => x.kg > 0 && x.kg <= 500).sort((a, b) => b.date - a.date).map((x) => ({ kg: Math.round(x.kg * 100) / 100, date: x.date, origine: x.origine || null }))
      : null;
  };
  const mesuresEntre = (type: TypeMesureSante, debut: number, fin: number): Promise<MesureSante[] | null> =>
    // la FC au repos a son propre accès (frequenceRepos) et sa propre autorisation
    type === "fc"
      ? si("frequence-cardiaque", (n) => n.frequenceRepos(debut, fin).then((l) => mesuresTriees(l.map((x) => ({ valeur: x.bpm, date: x.date, origine: x.origine })))))
      : si(type, (n) => n.mesures(type, debut, fin).then(mesuresTriees));

  return {
    disponible: present,
    autorisees: async () => {
      const a = await accordees();
      return (Object.keys(PERMISSIONS) as PermissionSante[]).filter((p) => a.has(PERMISSIONS[p]));
    },
    demanderPermissions: async (ps) => {
      if (!natif || !(await present())) return false;
      // une facultative que Santé Connect ne sait pas donner n'est pas demandée (elle ne serait jamais accordée)
      const possible = ps.some((p) => PERMISSIONS_FACULTATIVES.includes(p)) && (await historiquePossible());
      const demandees = ps.filter((p) => possible || !PERMISSIONS_FACULTATIVES.includes(p));
      if (!demandees.length) return false;
      const requises = demandees.some((p) => !PERMISSIONS_FACULTATIVES.includes(p)) ? demandees.filter((p) => !PERMISSIONS_FACULTATIVES.includes(p)) : demandees;
      // Une demande qui échoue côté natif ne doit jamais faire tomber l'appli : on relit simplement l'état.
      await natif.demander(demandees.map((p) => PERMISSIONS[p])).catch((e: unknown) => console.warn("Santé Connect : demande refusée", e));
      autorisations.oublier();
      const a = await accordees();
      return requises.every((p) => a.has(PERMISSIONS[p]));
    },
    historiquePossible: () => historiquePossible(),
    dernierPoids: async () => {
      const t = maintenant();
      return (await si("poids", (n) => n.poids(t - FENETRE_POIDS, t).then(plusRecentPoids))) ?? null;
    },
    pesees: async (jours) => {
      const t = maintenant();
      return peseesEntre(t - jours * JOUR, t);
    },
    peseesEntre: (debut, fin) => peseesEntre(debut, fin),
    etatPoids: async (paquets): Promise<EtatSante> => {
      const eteintes = paquets.map((paquet) => ({ paquet, installee: false, partage: false }));
      if (!natif) return { connecteur: "non-branche", applis: eteintes };
      if (!(await present())) return { connecteur: "absent", applis: eteintes };
      const installees = new Set(await natif.installees(paquets));
      const t = maintenant();
      const pesees = await si("poids", (n) => n.poids(t - FENETRE_POIDS, t));
      const origines = new Set((pesees ?? []).map((p) => p.origine));
      return {
        connecteur: pesees ? "pret" : "a-autoriser",
        applis: paquets.map((paquet) => ({ paquet, installee: installees.has(paquet), partage: origines.has(paquet) })),
      };
    },
    pasDuJour: async () => {
      const t = maintenant();
      const v = await si("pas", (n) => n.pas([minuit(t), t]));
      return v ? pasParJour([minuit(t), t], v)[0]!.pas : null;
    },
    pasSurJours: async (jours = 7) => {
      const bornes = bornesJours(maintenant(), jours);
      return si("pas", (n) => pasDe(n, bornes).then((v) => pasParJour(bornes, v)));
    },
    sommeilDeLaNuit: async () => {
      const t = maintenant();
      const debut = minuit(t) - 6 * 3_600_000;
      const sessions = await si("sommeil", (n) => n.sommeil(debut, t));
      return sessions ? nuit(sessions.filter((s) => s.fin > debut && s.fin <= t)) : null;
    },
    frequenceRepos: async () => {
      const t = maintenant();
      return (await si("frequence-cardiaque", (n) => n.frequenceRepos(t - 7 * JOUR, t).then(derniereFrequence))) ?? null;
    },
    nuits: async (debut, fin) => {
      const sessions = await si("sommeil", (n) => n.sommeil(debut, fin));
      return sessions ? nuitsParJour(sessions.filter((s) => s.fin > debut && s.fin <= fin)) : null;
    },
    sessionsSommeil: async (debut, fin) => {
      const sessions = await si("sommeil", (n) => n.sommeil(debut, fin));
      return sessions
        ? sessions
            .filter((s) => s.fin > s.debut && s.fin > debut && s.fin <= fin)
            .sort((a, b) => a.debut - b.debut)
            .map((s) => nuit([s])!)
        : null;
    },
    mesures: async (type, jours) => {
      const t = maintenant();
      return mesuresEntre(type, t - jours * JOUR, t);
    },
    mesuresEntre: (type, debut, fin) => mesuresEntre(type, debut, fin),
    seancesSport: async (debut, fin) => {
      const brutes = await si("sport", (n) => n.seancesSport(debut, fin));
      if (!brutes) return null;
      const l = brutes.filter((x) => x.fin > x.debut && !PAQUETS_PROPRES.includes(x.origine)).sort((a, b) => a.debut - b.debut);
      const ok = await accordees();
      const parIntervalle = async (lire: (n: NatifSante, b: number[]) => Promise<number[]>, p: PermissionSante) =>
        natif && l.length && ok.has(PERMISSIONS[p]) ? Promise.all(l.map((x) => lire(natif, [x.debut, x.fin]).then((v) => v[0] ?? -1))) : l.map(() => -1);
      const kcal = await parIntervalle((n, b) => n.kcalActives(b), "kcal-actives");
      const pas = await parIntervalle((n, b) => n.pas(b), "pas");
      return l.map((x, i): SeanceSport => ({
        debut: x.debut,
        fin: x.fin,
        type: x.type,
        titre: x.titre || null,
        origine: x.origine || null,
        kcal: kcal[i]! >= 0 ? kcal[i]! : null,
        pas: pas[i]! >= 0 ? Math.round(pas[i]!) : null,
      }));
    },
    pasEntre: async (debut, fin) => {
      const v = await si("pas", (n) => n.pas([debut, fin]));
      return v && v[0] != null && v[0] >= 0 ? Math.round(v[0]) : pasBrutsEntre(debut, fin);
    },
    distanceEntre: async (debut, fin) => {
      const v = await si("distance", (n) => (n.distance ? n.distance([debut, fin]) : Promise.resolve([-1])));
      return v && v[0] != null && v[0] >= 0 ? v[0] : null;
    },
    originesPas: async (debut, fin) => si("pas", (n) => (n.originesPas ? n.originesPas(debut, fin) : Promise.resolve(null))),
    originesDonnees: async (debut, fin) => {
      if (!natif || !(await present())) return null;
      const a = await accordees();
      const types = TYPES_ORIGINES.filter(([, p]) => a.has(PERMISSIONS[p]));
      if (!types.length) return null;
      // Module plus ancien (ou iPhone) : les seules applis qui écrivent des pas
      const lire = natif.origines
        ? natif.origines(debut, fin, types.map(([k]) => k))
        : types.some(([k]) => k === "pas") && natif.originesPas
          ? natif.originesPas(debut, fin)
          : Promise.resolve([]);
      return avantDelai(
        lire.catch((e: unknown) => {
          if (refusee(e)) oublier();
          throw e;
        }),
        delaiMs,
      );
    },
    fcEntre: async (debut, fin) => {
      const l = await si("fc-montre", (n) => (n.fc ? n.fc(debut, fin) : Promise.resolve(null)));
      return l ? l.filter((x) => x.bpm > 0 && x.t >= debut && x.t <= fin).sort((a, b) => a.t - b.t) : null;
    },
    distanceIntervalles: async (bornes) => {
      if (bornes.length < 2) return [];
      const v = await si("distance", (n) => (n.distance ? n.distance(bornes) : Promise.resolve(bornes.slice(1).map(() => -1))));
      return v ? bornes.slice(1).map((_, i) => (v[i] != null && v[i]! >= 0 ? v[i]! : null)) : null;
    },
    pasIntervalles: async (bornes) => {
      if (bornes.length < 2) return [];
      const v = await si("pas", (n) => pasDe(n, bornes));
      if (!v) return null;
      const l = bornes.slice(1).map((_, i) => (v[i] != null && v[i]! >= 0 ? Math.round(v[i]!) : null));
      // Aujourd'hui (dernier intervalle, jusqu'à maintenant) : sans agrégat, les enregistrements bruts (la page Pas et la jauge le disent pareil)
      const dernier = l.length - 1;
      if (dernier >= 0 && l[dernier] == null && bornes[dernier + 1]! - bornes[dernier]! <= JOUR + HEURE) l[dernier] = await pasBrutsEntre(bornes[dernier]!, bornes[dernier + 1]!);
      return l;
    },
    regles: async (debut, fin) => {
      const r = await si("regles", (n) => (n.regles ? n.regles(debut, fin) : Promise.resolve(null)));
      return r
        ? {
            periodes: r.periodes.filter((x) => Number.isFinite(x.debut) && x.fin >= x.debut).sort((a, b) => a.debut - b.debut),
            flux: r.flux.filter((x) => Number.isFinite(x.date) && x.date >= debut && x.date <= fin).sort((a, b) => a.date - b.date),
          }
        : null;
    },
    ouvrirReglages: async (paquet) => {
      if (natif && (await present())) await natif.ouvrir(paquet ?? null);
      oublier();
    },
    oublierAutorisations: oublier,
    exporterSeance: async (s) =>
      (await si("seances", (n) => n.exporter(s.debut, s.fin, s.titre, s.id ?? `pepfit-seance-${s.debut}`).then(() => true), true)) ?? false,
  };
}
