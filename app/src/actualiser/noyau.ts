// Tirer pour actualiser : la partie sans React Native (testée dans tests/actualiser.test.ts). Les règles du tirage (seuil,
// progression de l'indicateur) et l'ordonnanceur : les sources sont injectées, chacune a son délai minimal, jamais deux
// actualisations en même temps. Le branchement sur les vraies sources (serveur, Santé Connect, Whoop, Withings, Polar) est dans
// sources.ts.

/** Écart minimal entre deux actualisations d'une même source (07/11) : un tirage répété ne rappelle pas le serveur. */
export const DELAI_SOURCE_MS = 15_000;

/** Tirage du doigt (dp) au-delà duquel l'indicateur est plein : relâché ensuite, le geste actualise. */
export const SEUIL_TIRAGE = 72;

/** Le tirage commence à compter après cette course (dp) : un doigt qui glisse à peine ne montre rien. */
export const ZONE_MORTE = 6;

/**
 * Les sources partent ensemble et ont ce temps (ms) pour arriver avant que la page affichée se recalcule (mesure du 08/11 : tout
 * attendre en série, puis la page, dépassait la seconde). Une source plus lente finit en fond ; la page se relit alors sans bruit.
 */
export const ATTENTE_SOURCES_MS = 400;

/** Dp dont la page reste descendue pendant que ça actualise : la place de l'indicateur. */
export const REPOS_TIRAGE = 56;

/** Jamais plus bas (dp), même tirée très loin : la résistance monte vite après le seuil. */
export const COURSE_MAX = 88;

/**
 * Dp dont la page (en-tête compris) descend pour un tirage du doigt de `dy` dp : elle suit le doigt, un peu plus lentement, et
 * se trouve à `REPOS_TIRAGE` quand le seuil est franchi ; au-delà elle résiste de plus en plus, sans dépasser `COURSE_MAX`.
 */
export function decalageTirage(dy: number): number {
  "worklet";
  const x = dy - ZONE_MORTE;
  if (!(x > 0)) return 0;
  const course = SEUIL_TIRAGE - ZONE_MORTE;
  if (x <= course) return (x * REPOS_TIRAGE) / course;
  return REPOS_TIRAGE + (COURSE_MAX - REPOS_TIRAGE) * (1 - Math.exp(-(x - course) / 90));
}

/** Progression de l'indicateur (0 à 1) pour un tirage du doigt de `dy` dp. Une résistance douce : elle ralentit vers le seuil. */
export function progressionTirage(dy: number): number {
  "worklet";
  const x = (dy - ZONE_MORTE) / (SEUIL_TIRAGE - ZONE_MORTE);
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  return x * (2 - x);
}

/** Le tirage a franchi le seuil. */
export function seuilFranchi(dy: number): boolean {
  "worklet";
  return dy >= SEUIL_TIRAGE;
}

/**
 * Une erreur de réseau (hors ligne, délai dépassé) : la seule que l'actualisation dit, par la pastille « Hors ligne » ; tout
 * autre échec reste silencieux. Une erreur qui porte un statut HTTP est une réponse du serveur, donc pas du hors ligne.
 */
export function estHorsLigne(e: unknown): boolean {
  const statut = (e as { statut?: unknown } | null)?.statut;
  if (typeof statut === "number") return false;
  const message = e instanceof Error ? e.message : "";
  return /network request failed|failed to fetch|network error|timeout|timed out|connect/i.test(message);
}

export type Source = { id: string; executer: () => Promise<unknown> };

export type Issue = "fait" | "occupe";

export type OptionsActualiseur = {
  /** Les sources : elles partent toutes ensemble. */
  sources: Source[];
  delai?: number;
  /** Le temps laissé aux sources avant le recalcul de la page (ATTENTE_SOURCES_MS). */
  attente?: number;
  maintenant?: () => number;
  /** Une source qui échoue : sa cause, pour la pastille ou le journal ; l'actualisation continue. */
  surEchec?: (id: string, e: unknown) => void;
};

/**
 * L'ordonnanceur : `lancer` démarre ensemble les sources dont le dernier passage date d'au moins `delai`, leur laisse `attente`
 * pour arriver, puis fait `apres` (le recalcul de la page affichée) et rend la main : l'indicateur s'arrête là. Les sources
 * encore en route finissent en fond, et `apres` se refait sans bruit quand elles ont toutes fini. Un appel pendant qu'une
 * actualisation tourne ne fait rien (`occupe`). Une source ou le recalcul qui échoue n'empêche pas les autres ; l'issue est
 * « fait » dans tous les cas.
 */
export function creerActualiseur(o: OptionsActualiseur) {
  const delai = o.delai ?? DELAI_SOURCE_MS;
  const attente = o.attente ?? ATTENTE_SOURCES_MS;
  const maintenant = o.maintenant ?? Date.now;
  const dernier = new Map<string, number>();
  const abonnes = new Set<() => void>();
  let enCours = false;
  const prevenir = () => abonnes.forEach((f) => f());

  const passer = async (s: Source) => {
    const t = maintenant();
    const avant = dernier.get(s.id);
    if (avant !== undefined && t - avant < delai && t >= avant) return;
    dernier.set(s.id, t);
    try {
      await s.executer();
    } catch (e) {
      o.surEchec?.(s.id, e);
    }
  };

  const recalculer = async (apres?: () => Promise<unknown>) => {
    if (apres) await apres().catch((e: unknown) => o.surEchec?.("page", e));
  };

  return {
    enCours: () => enCours,
    abonner(f: () => void) {
      abonnes.add(f);
      return () => void abonnes.delete(f);
    },
    async lancer(apres?: () => Promise<unknown>): Promise<Issue> {
      if (enCours) return "occupe";
      enCours = true;
      prevenir();
      try {
        const toutes = Promise.all(o.sources.map(passer)).then(() => true);
        let minuterie: ReturnType<typeof setTimeout> | undefined;
        const delaiPasse = new Promise<boolean>((fin) => (minuterie = setTimeout(() => fin(false), attente)));
        const finies = await Promise.race([toutes, delaiPasse]);
        clearTimeout(minuterie);
        await recalculer(apres);
        if (!finies) void toutes.then(() => recalculer(apres));
        return "fait";
      } finally {
        enCours = false;
        prevenir();
      }
    },
    /** Pour les tests : oublie les derniers passages. */
    oublier: () => dernier.clear(),
  };
}
