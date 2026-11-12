// Santé fusionnée : ce que Polar a donné en direct s'ajoute à Santé Connect, à la même place, pour tous les calculs qui lisent
// la FC, le sommeil ou les pas (Effort du jour, activité détectée, Récupération, Sommeil, Précision, Âge…), sans calcul à part.
//   - FC : les échantillons de Santé Connect et la FC continue de Polar (5 min) et de ses nuits, réunis et triés ;
//   - nuits : une nuit Polar remplace la nuit Santé Connect qu'elle recouvre (la copie de Polar Flow, ou la même nuit vue
//     par une autre appli) : stades et FC lus à la source ;
//   - pas : un jour sans pas dans Santé Connect prend ceux de Polar (Polar Flow écrit le total du jour dans Santé Connect :
//     jamais compté deux fois) ;
//   - séances : la copie Polar Flow d'une séance lue chez Polar est écartée (la séance pepfit l'a déjà).
// Autorisations : tant que des données Polar existent, « fc-montre », « sommeil » et « pas » comptent comme accordées (les
// chemins de calcul qui les demandent lisent alors Polar). L'écran Connexions et l'accueil gardent les autorisations de
// Santé Connect seules (natif/sante : santeConnect). Pur sauf `lecteurPolar` (base) ; tests/polar.test.ts.
import type { Executeur } from "../db/executeur";
import { minuit } from "../natif/sante/logique";
import type { PasJour, PermissionSante, Sante, SeanceSport, SommeilNuit } from "../natif/sante/types";
import { ORIGINE_POLAR, PAQUET_POLAR_FLOW } from "./constantes";

const H = 3_600_000;
/** Autorisations que les données Polar remplissent. */
export const PERMISSIONS_POLAR: readonly PermissionSante[] = ["fc-montre", "sommeil", "pas"];
/** Durée de vie de « Polar a-t-il des données ? » (comme les autorisations de Santé Connect, 30 s). */
const VIE_ACTIF_MS = 30_000;

export interface LecteurPolar {
  /** Des données Polar existent sur ce téléphone (connecté, ou gardées à la déconnexion). */
  actif(): Promise<boolean>;
  fc(debut: number, fin: number): Promise<{ t: number; bpm: number }[]>;
  /** Nuits terminées dans ]debut, fin], de la plus ancienne à la plus récente. */
  nuits(debut: number, fin: number): Promise<SommeilNuit[]>;
  /** Pas des jours AAAA-MM-JJ demandés (absents : pas de donnée). */
  pas(jours: readonly string[]): Promise<Map<string, number>>;
  /** Séances Polar qui recouvrent [debut, fin]. */
  seances(debut: number, fin: number): Promise<{ debut: number; fin: number }[]>;
}

let actifGarde: { valeur: Promise<boolean>; jusqua: number } | null = null;
/** Oublie « Polar a-t-il des données ? » (connexion, synchro, déconnexion). */
export function oublierPolar(): void {
  actifGarde = null;
}

/** AAAA-MM-JJ du jour local de `ms`. */
const jourIso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type LigneNuit = { debut: number; fin: number; minutes: number | null; leger_min: number | null; profond_min: number | null; paradoxal_min: number | null; eveil_min: number | null; etapes: string | null };

function enNuit(l: LigneNuit): SommeilNuit {
  let etapes: SommeilNuit["etapes"] = [];
  try {
    etapes = l.etapes ? (JSON.parse(l.etapes) as [number, number, number][]).map(([debut, fin, type]) => ({ debut, fin, type })) : [];
  } catch {
    etapes = [];
  }
  const avecPhases = l.leger_min != null || l.profond_min != null || l.paradoxal_min != null;
  return {
    debut: l.debut,
    fin: l.fin,
    minutes: l.minutes ?? Math.round((l.fin - l.debut) / 60_000),
    phases: avecPhases ? { leger: l.leger_min ?? 0, profond: l.profond_min ?? 0, paradoxal: l.paradoxal_min ?? 0, eveil: l.eveil_min ?? 0 } : null,
    origine: ORIGINE_POLAR,
    etapes,
  };
}

/** Lecteur sur la base de l'appli. `base` : la base, ouverte au premier appel seulement. */
export function lecteurPolar(base: () => Promise<Executeur>, horloge: () => number = Date.now): LecteurPolar {
  return {
    actif() {
      const t = horloge();
      if (!actifGarde || actifGarde.jusqua < t) {
        const valeur = base()
          .then((db) =>
            db.getFirstAsync<{ x: number }>(
              "SELECT (EXISTS (SELECT 1 FROM polar_fc) OR EXISTS (SELECT 1 FROM polar_nuit) OR EXISTS (SELECT 1 FROM polar_jour)) AS x",
              [],
            ),
          )
          .then((r) => (r?.x ?? 0) === 1, () => false);
        actifGarde = { valeur, jusqua: t + VIE_ACTIF_MS };
      }
      return actifGarde.valeur;
    },
    async fc(debut, fin) {
      const db = await base();
      return db.getAllAsync<{ t: number; bpm: number }>("SELECT t, bpm FROM polar_fc WHERE t >= ? AND t <= ? ORDER BY t", [debut, fin]);
    },
    async nuits(debut, fin) {
      const db = await base();
      const l = await db.getAllAsync<LigneNuit>(
        "SELECT debut, fin, minutes, leger_min, profond_min, paradoxal_min, eveil_min, etapes FROM polar_nuit WHERE fin > ? AND fin <= ? ORDER BY fin",
        [debut, fin],
      );
      return l.map(enNuit);
    },
    async pas(jours) {
      if (!jours.length) return new Map();
      const db = await base();
      const l = await db.getAllAsync<{ jour: string; pas: number }>(
        `SELECT jour, pas FROM polar_jour WHERE pas IS NOT NULL AND jour IN (${jours.map(() => "?").join(",")})`,
        [...jours],
      );
      return new Map(l.map((x) => [x.jour, x.pas]));
    },
    async seances(debut, fin) {
      const db = await base();
      return db.getAllAsync<{ debut: number; fin: number }>("SELECT debut, fin FROM polar_seance WHERE debut < ? AND fin > ?", [fin, debut]);
    },
  };
}

const chevauche = (a: { debut: number; fin: number }, b: { debut: number; fin: number }) => a.debut < b.fin && b.debut < a.fin;

/** FC réunie, triée, un point par instant (Santé Connect d'abord). */
export function fusionnerFc(sc: readonly { t: number; bpm: number }[], polar: readonly { t: number; bpm: number }[]): { t: number; bpm: number }[] {
  const vus = new Set(sc.map((x) => x.t));
  return [...sc, ...polar.filter((x) => !vus.has(x.t))].sort((a, b) => a.t - b.t);
}

/** Nuits réunies : une nuit Polar remplace celles de Santé Connect qu'elle recouvre. */
export function fusionnerNuits(sc: readonly SommeilNuit[], polar: readonly SommeilNuit[]): SommeilNuit[] {
  return [...sc.filter((n) => !polar.some((p) => chevauche(n, p))), ...polar].sort((a, b) => a.fin - b.fin);
}

/** [debut, fin] est-il une journée locale entière (ou aujourd'hui jusqu'à maintenant) ? Renvoie son jour, sinon null. */
export function journee(debut: number, fin: number, maintenant: number): string | null {
  if (minuit(debut) !== debut) return null;
  const lendemain = minuit(debut, 1);
  if (fin > lendemain || fin <= debut) return null;
  return fin === lendemain || (fin >= maintenant - 60_000 && maintenant < lendemain) ? jourIso(debut) : null;
}

/** La Santé de l'appli, Polar compris. */
export function avecPolar(s: Sante, p: LecteurPolar, horloge: () => number = Date.now): Sante {
  const surPolar = async <T>(lire: () => Promise<T>, defaut: T): Promise<T> => ((await p.actif()) ? lire().catch(() => defaut) : defaut);
  /** Pas de Polar pour les intervalles « journée » restés sans pas dans Santé Connect. */
  const completerPas = async (bornes: readonly number[], sc: readonly (number | null)[] | null): Promise<(number | null)[] | null> => {
    if (!(await p.actif())) return sc ? [...sc] : null;
    const t = horloge();
    const jours = bornes.slice(1).map((fin, i) => journee(bornes[i]!, fin, t));
    const pas = await p.pas(jours.filter((j): j is string => j != null)).catch(() => new Map<string, number>());
    if (!pas.size) return sc ? [...sc] : null;
    return jours.map((j, i) => sc?.[i] ?? (j != null ? (pas.get(j) ?? null) : null));
  };
  return {
    ...s,
    autorisees: async () => {
      const a = await s.autorisees();
      return (await p.actif()) ? [...a, ...PERMISSIONS_POLAR.filter((x) => !a.includes(x))] : a;
    },
    fcEntre: async (debut, fin) => {
      const [sc, polar] = await Promise.all([s.fcEntre(debut, fin), surPolar(() => p.fc(debut, fin), null)]);
      if (!polar?.length) return sc;
      return fusionnerFc(sc ?? [], polar);
    },
    nuits: async (debut, fin) => {
      const [sc, polar] = await Promise.all([s.nuits(debut, fin), surPolar(() => p.nuits(debut, fin), null)]);
      if (!polar?.length) return sc;
      return fusionnerNuits(sc ?? [], polar);
    },
    sommeilDeLaNuit: async () => {
      const t = horloge();
      const [sc, polar] = await Promise.all([s.sommeilDeLaNuit(), surPolar(() => p.nuits(minuit(t) - 6 * H, t), null)]);
      const derniere = polar?.reduce<SommeilNuit | null>((a, n) => (!a || n.fin - n.debut > a.fin - a.debut ? n : a), null) ?? null;
      return derniere ?? sc;
    },
    seancesSport: async (debut, fin) => {
      const [sc, polar] = await Promise.all([s.seancesSport(debut, fin), surPolar(() => p.seances(debut, fin), null)]);
      if (!sc || !polar?.length) return sc;
      return sc.filter((x: SeanceSport) => !(x.origine === PAQUET_POLAR_FLOW && polar.some((y) => chevauche(x, y))));
    },
    pasIntervalles: async (bornes) => {
      if (bornes.length < 2) return [];
      return completerPas(bornes, await s.pasIntervalles(bornes));
    },
    pasEntre: async (debut, fin) => {
      const sc = await s.pasEntre(debut, fin);
      if (sc != null) return sc;
      return (await completerPas([debut, fin], [null]))?.[0] ?? null;
    },
    pasDuJour: async () => {
      const sc = await s.pasDuJour();
      if (sc != null) return sc;
      const t = horloge();
      return (await completerPas([minuit(t), t], [null]))?.[0] ?? null;
    },
    pasSurJours: async (jours = 7) => {
      const sc = await s.pasSurJours(jours);
      if (!(await p.actif())) return sc;
      const t = horloge();
      const debuts = Array.from({ length: jours }, (_, i) => minuit(t, i - jours + 1));
      const pas = await p.pas(debuts.map(jourIso)).catch(() => new Map<string, number>());
      if (!pas.size) return sc;
      return debuts.map((jour, i): PasJour => ({ jour, pas: sc?.[i]?.pas ?? pas.get(jourIso(jour)) ?? null }));
    },
  };
}
