// Reconnaissance des activités (29/10 au soir) : avec le temps, pepfit reconnaît le sport d'une activité détectée
// d'après les choix passés de l'utilisateur, sur le téléphone (rien n'est envoyé au serveur, la table des choix n'est pas
// synchronisée). Indices : jour de la semaine, heure, durée, lieu (enregistré ou GPS), FC (part de la réserve), pas par
// minute, sport brut du capteur. Trois paliers : suggestion pré-cochée dès 2 choix semblables ; automatique (« Reconnu :
// Padel · Changer ») dès 5 et une confiance élevée ; jamais d'automatique quand deux sports sont proches. Chaque correction
// fait baisser la confiance. Pur : tests/reconnaissance.test.ts.

export interface Contexte {
  /** Jour de la semaine, lundi = 0. */
  jour: number;
  /** Heure de début, en minutes depuis minuit (heure locale). */
  minute: number;
  dureeMin: number;
  lieuId: string | null;
  position: { lat: number; lon: number } | null;
  /** FC moyenne en part de la réserve (0 au repos, 1 à la FC max) ; null sans FC. */
  reserve: number | null;
  /** Pas par minute ; null sans pas. */
  cadence: number | null;
  /** Sport brut du capteur (« whoop:34 ») ; les entrées sans sport (« whoop:-1 », « sante:0 ») ne disent rien. */
  sportBrut: string | null;
}

export interface Choix {
  contexte: Contexte;
  /** Sport retenu par l'utilisateur (« cat:padel »). */
  sport: string;
  le: number;
  /** Sport que pepfit proposait (pré-coché ou reconnu) et que l'utilisateur a remplacé : une correction. */
  refuse?: string | null;
  /** Faux : une séance lancée par l'utilisateur (D4) ; elle aide la suggestion, jamais l'automatique. */
  detectee?: boolean;
}

/** Poids de chaque indice dans la ressemblance : le lieu et le sport du capteur disent le plus. */
export const POIDS = { lieu: 3, sportBrut: 3, jour: 2, heure: 2, duree: 1, fc: 1, pas: 1 } as const;

export const SEUILS_RECO = {
  /** Deux activités se ressemblent à partir de là (0 à 1). */
  SEMBLABLE: 0.75,
  /** Palier 1 : suggestion pré-cochée. */
  SUGGESTION_N: 2,
  SUGGESTION_CONFIANCE: 0.5,
  /** Palier 2 : sport posé automatiquement. */
  AUTO_N: 5,
  AUTO_CONFIANCE: 0.75,
  /** Palier 3 : un second sport qui pèse au moins la moitié du premier rend le choix ambigu. */
  AMBIGU: 0.5,
  /** Une correction pèse deux fois contre le sport refusé. */
  PENALITE: 2,
  /** Les habitudes changent : un choix compte deux fois moins au bout de 180 jours. */
  DEMI_VIE_JOURS: 180,
  /** Indices qu'une majorité des choix partage pour être cités dans le « pourquoi ». */
  MAJORITE: 0.6,
} as const;

const SANS_SPORT = new Set(["whoop:-1", "whoop:71", "sante:0"]);
const informatif = (s: string | null) => (s != null && !SANS_SPORT.has(s) ? s : null);
const cloche = (x: number, sigma: number) => Math.exp(-((x / sigma) ** 2) / 2);

/** Écart entre deux heures du jour, en minutes (23 h 30 et 0 h 30 : 60). */
export function ecartMinutes(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6_371_000;
}

/** Ressemblance de chaque indice (0 à 1), null quand l'un des deux ne l'a pas. */
export function indices(a: Contexte, b: Contexte): Record<keyof typeof POIDS, number | null> {
  const weekend = (j: number) => j >= 5;
  const brutA = informatif(a.sportBrut);
  const brutB = informatif(b.sportBrut);
  return {
    jour: a.jour === b.jour ? 1 : weekend(a.jour) === weekend(b.jour) ? 0.25 : 0,
    // σ = 1 h : à 30 min 0,88, à 1 h 0,61, à 2 h 0,14
    heure: cloche(ecartMinutes(a.minute, b.minute), 60),
    // durées comparées en rapport : 60 et 75 min 0,82, 60 et 90 min 0,51, 60 et 120 min 0,14
    duree: a.dureeMin > 0 && b.dureeMin > 0 ? cloche(Math.log(a.dureeMin / b.dureeMin), 0.35) : null,
    lieu:
      a.lieuId != null && b.lieuId != null
        ? a.lieuId === b.lieuId ? 1 : 0
        : a.position && b.position ? cloche(distanceM(a.position, b.position), 200) : null,
    fc: a.reserve != null && b.reserve != null ? cloche(a.reserve - b.reserve, 0.1) : null,
    pas: a.cadence != null && b.cadence != null ? cloche(a.cadence - b.cadence, 20) : null,
    sportBrut: brutA != null && brutB != null ? (brutA === brutB ? 1 : 0) : null,
  };
}

/** Ressemblance de deux activités (0 à 1) : moyenne pondérée des indices que les deux ont. */
export function ressemblance(a: Contexte, b: Contexte): number {
  let somme = 0;
  let poids = 0;
  for (const [k, v] of Object.entries(indices(a, b)) as [keyof typeof POIDS, number | null][]) {
    if (v == null) continue;
    somme += POIDS[k] * v;
    poids += POIDS[k];
  }
  return poids > 0 ? somme / poids : 0;
}

/** Ce que les choix semblables ont en commun avec l'activité, pour l'expliquer (« comme tes mardis soir à Casa Padel »). */
export interface Pourquoi {
  /** Nombre de choix semblables de ce sport. */
  n: number;
  jour?: number;
  moment?: "matin" | "midi" | "apresMidi" | "soir";
  lieuId?: string;
  sportBrut?: string;
  /** Reconnue d'après le programme : l'heure prévue (« 08:00 ») de la séance prévue qu'elle recoupe ; `n` vaut alors 0. */
  prevuA?: string;
}

export type Reconnaissance =
  | { palier: "aucun" }
  /** Palier 1 : le sport est pré-coché dans le choix, rien n'est posé sans l'utilisateur. */
  | { palier: "suggestion"; sport: string; confiance: number; pourquoi: Pourquoi }
  /** Palier 2 : le sport est posé, l'activité devient une séance « Reconnu : Padel · Changer ». */
  | { palier: "auto"; sport: string; confiance: number; pourquoi: Pourquoi }
  /** Palier 3 : deux sports proches, rien de pré-coché, les deux en tête du choix ; `n` : choix semblables de chacun. */
  | { palier: "ambigu"; sports: [string, string]; n: [number, number]; pourquoi: Pourquoi };

export const momentDe = (minute: number): NonNullable<Pourquoi["moment"]> =>
  minute < 11 * 60 ? "matin" : minute < 14 * 60 ? "midi" : minute < 18 * 60 ? "apresMidi" : "soir";

function pourquoiDe(c: Contexte, l: readonly Choix[]): Pourquoi {
  const p: Pourquoi = { n: l.length };
  const part = (f: (x: Choix) => boolean) => l.filter(f).length / Math.max(1, l.length);
  const M = SEUILS_RECO.MAJORITE;
  if (c.lieuId != null && part((x) => x.contexte.lieuId === c.lieuId) >= M) p.lieuId = c.lieuId;
  if (part((x) => x.contexte.jour === c.jour) >= M) p.jour = c.jour;
  if (part((x) => ecartMinutes(x.contexte.minute, c.minute) <= 60) >= M) p.moment = momentDe(c.minute);
  const brut = informatif(c.sportBrut);
  if (brut != null && part((x) => x.contexte.sportBrut === brut) >= M) p.sportBrut = brut;
  return p;
}

/** Score d'un sport : choix semblables, leur poids (ressemblance × fraîcheur) et la confiance qui en sort. */
export interface Score {
  sport: string;
  n: number;
  /** Choix semblables faits sur des activités détectées (les seuls qui ouvrent l'automatique, D4). */
  nDetectes: number;
  pour: number;
  contre: number;
  confiance: number;
}

/**
 * Scores des sports pour l'activité `c`, du plus probable au moins probable. Seuls les choix semblables (≥ 0,75) comptent.
 * Pour un sport : ses choix ; contre lui : les choix semblables d'autres sports, plus deux fois chaque correction qui l'a
 * refusé. Confiance = pour ÷ (pour + contre + 1) : 2 choix nets ≈ 0,64, 5 ≈ 0,82, et une seule correction la fait retomber.
 */
export function scores(c: Contexte, choix: readonly Choix[], maintenant: number): Score[] {
  const S = SEUILS_RECO;
  const semblables = choix
    .map((x) => ({ x, poids: ressemblance(c, x.contexte) * 0.5 ** (Math.max(0, maintenant - x.le) / 86_400_000 / S.DEMI_VIE_JOURS) }))
    .filter(({ x }) => ressemblance(c, x.contexte) >= S.SEMBLABLE);
  const total = semblables.reduce((a, s) => a + s.poids, 0);
  const sports = [...new Set(semblables.map((s) => s.x.sport))];
  return sports
    .map((sport) => {
      const siens = semblables.filter((s) => s.x.sport === sport);
      const pour = siens.reduce((a, s) => a + s.poids, 0);
      const refus = semblables.filter((s) => s.x.refuse === sport).reduce((a, s) => a + s.poids, 0);
      const contre = total - pour + S.PENALITE * refus;
      return { sport, n: siens.length, nDetectes: siens.filter((s) => s.x.detectee !== false).length, pour, contre, confiance: pour / (pour + contre + 1) };
    })
    .sort((a, b) => b.pour - a.pour);
}

/** Palier de reconnaissance d'une activité, d'après les choix passés (les plus récents d'abord ou non, peu importe). */
export function reconnaitre(c: Contexte, choix: readonly Choix[], maintenant: number): Reconnaissance {
  const S = SEUILS_RECO;
  const l = scores(c, choix, maintenant);
  const [premier, second] = l;
  if (!premier || premier.n < S.SUGGESTION_N) return { palier: "aucun" };
  const semblables = (sport: string) => choix.filter((x) => x.sport === sport && ressemblance(c, x.contexte) >= S.SEMBLABLE);
  if (second && second.pour >= S.AMBIGU * premier.pour) {
    return {
      palier: "ambigu",
      sports: [premier.sport, second.sport],
      n: [premier.n, second.n],
      pourquoi: pourquoiDe(c, [...semblables(premier.sport), ...semblables(second.sport)]),
    };
  }
  if (premier.confiance < S.SUGGESTION_CONFIANCE) return { palier: "aucun" };
  const pourquoi = pourquoiDe(c, semblables(premier.sport));
  const auto = premier.nDetectes >= S.AUTO_N && premier.confiance >= S.AUTO_CONFIANCE;
  return { palier: auto ? "auto" : "suggestion", sport: premier.sport, confiance: premier.confiance, pourquoi };
}

/** Contexte d'une activité : jour et heure locaux de son début, FC en part de la réserve, pas par minute. */
export function contexteDe(
  a: { debut: number; fin: number; fcMoy: number | null; pas: number | null; sportBrut: string | null; lieuId?: string | null; position?: { lat: number; lon: number } | null },
  profil: { fcRepos: number; fcMax: number } | null,
): Contexte {
  const d = new Date(a.debut);
  const dureeMin = Math.max(0, (a.fin - a.debut) / 60_000);
  return {
    jour: (d.getDay() + 6) % 7,
    minute: d.getHours() * 60 + d.getMinutes(),
    dureeMin,
    lieuId: a.lieuId ?? null,
    position: a.position ?? null,
    reserve: a.fcMoy != null && profil ? (a.fcMoy - profil.fcRepos) / Math.max(1, profil.fcMax - profil.fcRepos) : null,
    cadence: a.pas != null && dureeMin > 0 ? a.pas / dureeMin : null,
    sportBrut: a.sportBrut,
  };
}

/** Choix gardés sur le téléphone : les plus récents. */
export const MAX_CHOIX = 400;
