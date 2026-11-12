// « Récupérer » : la sieste et les activités de récupération (planche recuperer du 31/10, validée avec les
// décisions recommandées D1 à D14). Pur (sans React Native ni base) : testé par tests/recuperer.test.ts ; les chiffres des
// tableaux de NOTES § 3 en sortent.
//
// 1. On stocke les sessions (recup_activite, migration 59), jamais un effet ni un score : la Récupération et « Ce qui marche
//    pour toi » se recalculent à l'affichage depuis RECUPERER (version 1), comme RECUP.
// 2. Seule la sieste compte dans la Récupération du lendemain, avec un poids réduit (RECUP.sieste, recup-pepfit.ts) : sa
//    durée en entier contre la dette des 7 nuits, à 50 % contre le besoin. La note de la nuit ne change jamais (D7).
// 3. Les autres activités n'ajoutent aucun point : elles sont notées pour montrer ce qui marche pour la personne.
import { RECUP } from "./recup-pepfit";

/** Les types d'activité de récupération (colonne `type`). */
export const TYPES_RECUP = ["sieste", "respiration", "sauna", "bain-froid", "massage", "rouleau", "etirements", "mobilite", "marche", "active"] as const;
export type TypeRecup = (typeof TYPES_RECUP)[number];

/** Comment la session est née (colonne `mode`). */
export const MODES_RECUP = ["minuteur", "libre", "apres-coup", "import"] as const;
export type ModeRecup = (typeof MODES_RECUP)[number];

/** Le ressenti facultatif après une sieste (D13). */
export const RESSENTIS = ["repose", "pareil", "fatigue"] as const;
export type Ressenti = (typeof RESSENTIS)[number];

/** Les paramètres de « Récupérer » : une constante unique et versionnée, comme RECUP. Changer une valeur : changer `version`. */
export const RECUPERER = {
  version: 2,
  sieste: {
    // sieste éclair : avant le sommeil profond (Brooks et Lack 2006) ; la seule conseillée. Version 2 (planche sommeil, D16) :
    // le cycle de 90 min « quand la dette est forte » est retiré, faute de source.
    eclair: 20,
    endormissement: 5, // ajouté à l'alarme : « 20 min » de sieste, l'alarme sonne à 25 min (D6)
    tard: 17, // après 17 h : 20 min au plus, la nuit compte davantage
    tot: 12, // avant midi : la sieste éclair seulement
    // une session de Santé Connect est une sieste si elle commence entre 10 h et 20 h et dure moins de 3 h (D4)
    fenetre: [10, 20] as const,
    dureeMax: 180,
    // une sieste « Libre » restée ouverte est fermée d'office au bout de 3 h (NOTES § 3.2)
    libreMax: 180,
  },
  /** Doublon : une session pepfit et une session d'appareil du même type qui se recouvrent à 50 % ou plus ne font qu'une (D5). */
  recouvrement: 0.5,
  /** « Ce qui marche pour toi » : 8 semaines, 8 lendemains avec et 8 sans ; un écart d'au moins 3 % et de 2 fois son incertitude (D12). */
  marche: { jours: 56, minAvec: 8, minSans: 8, ecartMin: 0.03, t: 2 },
  /** Le rappel (D10) : éteint par défaut, 13:30, dès 2 h à rattraper (RECUP.dette), pause de 7 jours après deux rappels ignorés. */
  rappel: { heure: 13 * 60 + 30, detteMin: 120, ignoresPause: 2, pauseJours: 7 },
  /** Cohérence cardiaque guidée : 5 s pour inspirer, 5 s pour expirer, 6 souffles par minute (Lehrer et Gevirtz 2014). */
  respiration: { inspire: 5, expire: 5 },
} as const;

/** Le poids de la sieste dans la part Sommeil du lendemain (RECUP version 2). */
export const POIDS_DUREE_SIESTE = RECUP.sieste.poidsDuree;

export interface ActiviteRecup {
  type: TypeRecup;
  /** Durée proposée au démarrage (minutes) ; la sieste prend la recommandation. */
  duree: number;
  /** Durées de la saisie après coup (écran 7) ; « Autre » en plus. */
  durees: readonly number[];
  /** Picto 3D des activités (`p:<nom>`, ui/pictos) ; null : la tuile rose avec la lune (D3). */
  picto: string | null;
  /** Sport du catalogue dont les kcal se calculent aux MET (famille thermique, kcal-seance.ts) ; null : aucune kcal. */
  sportKcal: string | null;
}

/** Le catalogue « Récupérer », dans l'ordre de la feuille (écran 2). */
export const ACTIVITES: readonly ActiviteRecup[] = [
  { type: "sieste", duree: 20, durees: [20, 30, 90], picto: null, sportKcal: null },
  { type: "respiration", duree: 5, durees: [3, 5, 10], picto: "meditation", sportKcal: null },
  { type: "sauna", duree: 15, durees: [10, 15, 20], picto: "sauna", sportKcal: "cat:sauna" },
  { type: "bain-froid", duree: 3, durees: [2, 3, 5], picto: "bain-froid", sportKcal: "cat:bain-froid" },
  { type: "massage", duree: 30, durees: [20, 30, 60], picto: "massage", sportKcal: null },
  { type: "rouleau", duree: 10, durees: [5, 10, 15], picto: "calves-smr", sportKcal: null },
  { type: "etirements", duree: 10, durees: [5, 10, 20], picto: "calf-stretch", sportKcal: null },
  { type: "mobilite", duree: 15, durees: [10, 15, 20], picto: "90-90-hip-stretch", sportKcal: null },
  { type: "marche", duree: 20, durees: [15, 20, 30], picto: "marche", sportKcal: null },
  { type: "active", duree: 20, durees: [15, 20, 30], picto: "bicycling", sportKcal: null },
];
const PAR_TYPE = new Map(ACTIVITES.map((a) => [a.type, a]));
export const activite = (t: TypeRecup): ActiviteRecup => PAR_TYPE.get(t)!;
export const estTypeRecup = (x: unknown): x is TypeRecup => typeof x === "string" && (TYPES_RECUP as readonly string[]).includes(x);

// ---------------------------------------------------------------- la sieste : conseil et alarme

export type RaisonSieste = "matin" | "tard" | "eclair";

/** La durée conseillée selon l'heure (décimale, 14,12 = 14:07), avec sa raison (§ 3.1) : toujours la sieste éclair (D16). */
export function recommandation(heure: number, p = RECUPERER.sieste): { min: number; raison: RaisonSieste } {
  if (heure < p.tot) return { min: p.eclair, raison: "matin" };
  if (heure >= p.tard) return { min: p.eclair, raison: "tard" };
  return { min: p.eclair, raison: "eclair" };
}

/** L'alarme : la durée choisie plus le temps de s'endormir (D6) ; null en « Libre », sans alarme. */
export const alarmeSieste = (min: number | null, p = RECUPERER.sieste): number | null => (min == null ? null : min + p.endormissement);

/** Heure décimale locale d'un instant. */
export const heureDecimale = (t: number): number => {
  const d = new Date(t);
  return d.getHours() + d.getMinutes() / 60;
};

// ---------------------------------------------------------------- sans doublon avec la montre

/** Ce que la fusion lit d'une session. */
export interface SessionRecup {
  id: string;
  type: TypeRecup;
  debut: number;
  fin: number;
  mode: ModeRecup;
  sommeilMin: number | null;
  fcMoy: number | null;
  /** Source de la mesure : « pepfit », « whoop », ou le paquet de l'appli de Santé Connect. */
  sources: readonly string[];
  idExterne: string | null;
}

/** Recouvrement de deux sessions rapporté à la plus courte (0 à 1). */
export function recouvre(a: { debut: number; fin: number }, b: { debut: number; fin: number }): number {
  const c = Math.max(0, Math.min(a.fin, b.fin) - Math.max(a.debut, b.debut));
  const court = Math.min(a.fin - a.debut, b.fin - b.debut);
  return court > 0 ? c / court : 0;
}

export const memeSession = (a: SessionRecup, b: SessionRecup, r = RECUPERER.recouvrement): boolean => a.type === b.type && recouvre(a, b) >= r;

/** Priorité d'un appareil (la page Sommeil : Whoop prime, comme pour la nuit) ; plus haut gagne. */
const priorite = (s: SessionRecup) => (s.sources.includes("whoop") ? 2 : 1);

export type DecisionFusion =
  /** Une session d'appareil absorbée par la session pepfit : la mesure passe à pepfit, l'import disparaît. */
  | { genre: "absorber"; garde: string; perd: string; mesure: { sommeilMin: number | null; fcMoy: number | null; source: string; idExterne: string | null } }
  /** Deux sessions d'appareils : la moins prioritaire est retirée (gardée supprimée, pour ne pas revenir à l'import). */
  | { genre: "retirer"; garde: string; perd: string };

/**
 * Les doublons d'une liste de sessions vivantes : une session pepfit (minuteur, libre, après coup) et une session d'appareil du
 * même type qui se recouvrent à 50 % ou plus ne font qu'une ; l'appareil donne la mesure (sommeil réel, FC), pepfit garde
 * l'origine (minuteur, durée choisie), `sources` liste les deux. Deux appareils : Whoop prime, sinon la plus ancienne reste.
 */
export function doublons(l: readonly SessionRecup[]): DecisionFusion[] {
  const out: DecisionFusion[] = [];
  const pris = new Set<string>();
  const tri = [...l].sort((a, b) => a.debut - b.debut || a.id.localeCompare(b.id));
  for (const p of tri.filter((x) => x.mode !== "import")) {
    // la mesure du meilleur appareil (Whoop prime) ; les autres appareils de la même sieste sont retirés. Une session déjà
    // mesurée par Whoop (sa mesure est passée à pepfit) ne reprend pas celle d'un appareil moins prioritaire arrivé après.
    const l = tri.filter((a) => a.mode === "import" && !pris.has(a.id) && memeSession(p, a)).sort((a, b) => priorite(b) - priorite(a));
    const deja = p.sources.includes("whoop") ? 2 : 0;
    l.forEach((a, i) => {
      pris.add(a.id);
      if (i === 0 && priorite(a) >= deja) out.push({ genre: "absorber", garde: p.id, perd: a.id, mesure: { sommeilMin: a.sommeilMin, fcMoy: a.fcMoy, source: a.sources[0] ?? "", idExterne: a.idExterne } });
      else out.push({ genre: "retirer", garde: p.id, perd: a.id });
    });
  }
  const imports = tri.filter((x) => x.mode === "import" && !pris.has(x.id));
  for (let i = 0; i < imports.length; i++) {
    for (let j = i + 1; j < imports.length; j++) {
      const a = imports[i]!;
      const b = imports[j]!;
      if (pris.has(a.id) || pris.has(b.id) || !memeSession(a, b) || a.sources[0] === b.sources[0]) continue;
      const [garde, perd] = priorite(b) > priorite(a) ? [b, a] : [a, b];
      pris.add(perd.id);
      out.push({ genre: "retirer", garde: garde.id, perd: perd.id });
    }
  }
  return out;
}

/** Sommeil compté d'une sieste (§ 3.3) : mesuré par l'appareil, sinon au minuteur la durée au lit moins l'endormissement, sinon sa durée. */
export function sommeilSieste(s: { debut: number; fin: number; mode: ModeRecup; sommeilMin: number | null }, p = RECUPERER.sieste): number {
  if (s.sommeilMin != null && s.sommeilMin >= 0) return s.sommeilMin;
  const min = Math.max(0, (s.fin - s.debut) / 60_000);
  return Math.round(s.mode === "minuteur" ? Math.max(0, min - p.endormissement) : min);
}

// ---------------------------------------------------------------- les imports

/** Une session de sommeil de Santé Connect est-elle une sieste (D4) : commence entre 10 h et 20 h, dure moins de 3 h. */
export function estSiesteSante(debut: number, fin: number, p = RECUPERER.sieste): boolean {
  const h = heureDecimale(debut);
  return h >= p.fenetre[0] && h < p.fenetre[1] && fin > debut && fin - debut < p.dureeMax * 60_000;
}

/** Les activités Whoop de récupération (sport_id) : 236 Air Compression n'en est pas (§ 3.4). */
export const WHOOP_RECUP: Readonly<Record<number, TypeRecup>> = { 233: "sauna", 88: "bain-froid", 121: "massage", 237: "rouleau", 128: "etirements", 70: "respiration" };

/** Santé Connect (ExerciseSessionRecord.EXERCISE_TYPE_*) : STRETCHING (71) et GUIDED_BREATHING (33). La marche (79) reste du sport (D14). */
export const SANTE_RECUP: Readonly<Record<number, TypeRecup>> = { 71: "etirements", 33: "respiration" };

/** Les sports du catalogue qui deviennent des activités de récupération (D2) : leurs séances passées migrent (migration 59). */
export const SPORT_RECUP: Readonly<Record<string, TypeRecup>> = {
  "cat:sauna": "sauna", "cat:bain-froid": "bain-froid", "cat:massage": "massage", "cat:etirements": "etirements", "cat:meditation": "respiration",
};

// ---------------------------------------------------------------- ce qui marche pour toi

export type EtatMarche =
  | { etat: "attente"; n: number; manque: number }
  | { etat: "net" | "flou"; n: number; ecart: number; t: number; ma: number; ms: number };

/**
 * « Ce qui marche pour toi » (§ 3.7) : la VFC du lendemain rapportée à ta norme (ln VFC − norme), les lendemains d'une activité
 * contre les autres jours. Écart en %, incertitude de Welch ; « net » seulement au-delà des deux seuils.
 */
export function marche(avec: readonly number[], sans: readonly number[], p = RECUPERER.marche): EtatMarche {
  if (avec.length < p.minAvec || sans.length < p.minSans) return { etat: "attente", n: avec.length, manque: Math.max(0, p.minAvec - avec.length) };
  const m = (l: readonly number[]) => l.reduce((a, x) => a + x, 0) / l.length;
  const v = (l: readonly number[]) => {
    const mm = m(l);
    return l.reduce((a, x) => a + (x - mm) ** 2, 0) / (l.length - 1);
  };
  const d = m(avec) - m(sans);
  const se = Math.sqrt(v(avec) / avec.length + v(sans) / sans.length);
  const ecart = Math.exp(d) - 1;
  const t = se > 0 ? d / se : 0;
  const net = Math.abs(ecart) >= p.ecartMin && Math.abs(t) >= p.t;
  return { etat: net ? "net" : "flou", n: avec.length, ecart, t, ma: m(avec), ms: m(sans) };
}

// ---------------------------------------------------------------- le rappel, jamais intrusif (§ 3.8)

export interface EtatRappel {
  /** Jour (AAAA-MM-JJ) du dernier rappel programmé, et s'il a été suivi d'une sieste. */
  dernier: string | null;
  ignores: number;
  /** Pause jusqu'à ce jour exclu (AAAA-MM-JJ). */
  pauseJusqua: string | null;
}

export const RAPPEL_VIDE: EtatRappel = { dernier: null, ignores: 0, pauseJusqua: null };

export function lireEtatRappel(json: string | null): EtatRappel {
  try {
    const o = json ? JSON.parse(json) : null;
    if (!o || typeof o !== "object") return RAPPEL_VIDE;
    return {
      dernier: typeof o.dernier === "string" ? o.dernier : null,
      ignores: Number.isInteger(o.ignores) && o.ignores >= 0 ? o.ignores : 0,
      pauseJusqua: typeof o.pauseJusqua === "string" ? o.pauseJusqua : null,
    };
  } catch {
    return RAPPEL_VIDE;
  }
}

/** Un rappel passé sans sieste ce jour-là compte comme ignoré ; deux de suite : pause de 7 jours ; une sieste remet à zéro. */
export function bilanRappel(e: EtatRappel, aujourdhui: string, siesteLeJour: (jour: string) => boolean, decaler: (iso: string, n: number) => string, p = RECUPERER.rappel): EtatRappel {
  if (!e.dernier || e.dernier >= aujourdhui) return e;
  if (siesteLeJour(e.dernier)) return { ...e, dernier: null, ignores: 0 };
  const ignores = e.ignores + 1;
  if (ignores >= p.ignoresPause) return { dernier: null, ignores: 0, pauseJusqua: decaler(aujourdhui, p.pauseJours) };
  return { ...e, dernier: null, ignores };
}

/**
 * Programmer le rappel d'aujourd'hui ? Activé, avant l'heure, dette d'au moins 2 h, aucune sieste faite ce jour-là, aucune
 * séance en cours, pas en pause. Au plus un par jour.
 */
export function doitRappeler(o: {
  actif: boolean; minuteDuJour: number; heure: number; dette: number | null; siesteFaite: boolean; seanceEnCours: boolean; aujourdhui: string; etat: EtatRappel;
}, p = RECUPERER.rappel): boolean {
  if (!o.actif || o.siesteFaite || o.seanceEnCours || o.minuteDuJour >= o.heure) return false;
  if ((o.dette ?? 0) < p.detteMin) return false;
  if (o.etat.pauseJusqua && o.aujourdhui < o.etat.pauseJusqua) return false;
  return true;
}

// ---------------------------------------------------------------- la cohérence cardiaque guidée

/** Où en est le souffle à `s` secondes du début : la phase, les secondes qui restent, et l'échelle du disque (0 à 1). */
export function souffle(s: number, p: { inspire: number; expire: number } = RECUPERER.respiration): { phase: "inspire" | "expire"; reste: number; echelle: number } {
  const cycle = p.inspire + p.expire;
  const x = ((s % cycle) + cycle) % cycle;
  if (x < p.inspire) return { phase: "inspire", reste: Math.ceil(p.inspire - x), echelle: x / p.inspire };
  return { phase: "expire", reste: Math.ceil(cycle - x), echelle: 1 - (x - p.inspire) / p.expire };
}

// ---------------------------------------------------------------- la session en cours (réglage local, survit à l'appli tuée)

export interface EnCoursRecup {
  /** Identifiant de la session qui sera enregistrée. */
  id: string;
  type: TypeRecup;
  debut: number;
  /** Durée choisie (minutes) ; null en « Libre ». */
  choisi: number | null;
  /** Échéance de l'alarme (ms) ; null sans alarme. */
  alarme: number | null;
}

export function lireEnCours(json: string | null): EnCoursRecup | null {
  try {
    const o = json ? JSON.parse(json) : null;
    if (!o || typeof o.id !== "string" || !estTypeRecup(o.type) || typeof o.debut !== "number") return null;
    return { id: o.id, type: o.type, debut: o.debut, choisi: typeof o.choisi === "number" ? o.choisi : null, alarme: typeof o.alarme === "number" ? o.alarme : null };
  } catch {
    return null;
  }
}

/** Échéance de l'alarme d'une session qui démarre à `debut` : la sieste ajoute l'endormissement ; « Libre » n'en a pas. */
export function echeance(type: TypeRecup, debut: number, choisi: number | null): number | null {
  if (choisi == null) return null;
  const min = type === "sieste" ? alarmeSieste(choisi)! : choisi;
  return debut + min * 60_000;
}

/** Une sieste « Libre » restée ouverte au-delà de 3 h est fermée d'office, à 3 h. */
export function finOffice(e: EnCoursRecup, maintenant: number, p = RECUPERER.sieste): number | null {
  if (e.choisi != null) return null;
  const max = e.debut + p.libreMax * 60_000;
  return maintenant >= max ? max : null;
}
