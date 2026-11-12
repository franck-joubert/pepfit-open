// La mesure de la montre arrive APRÈS la sieste : Whoop note une sieste quelques minutes après le réveil (ou à la main, plus
// tard), Santé Connect reçoit celle de la montre à sa synchro. Sans relecture, l'écran « Sieste enregistrée » affichait la
// durée au lit moins 5 min comme si elle était mesurée, et la mesure n'était lue qu'à l'ouverture de Santé (Whoop : après
// 15 min). Ici, une sieste qui vient de finir attend sa mesure : relecture de Whoop et de Santé Connect 2, 5, 10, 20, 40,
// 90, 180 puis 360 min après la fin, et au retour de l'appli si une relecture est due ; quand la mesure est là, la fusion
// (`doublons`, Whoop prime) absorbe la session pepfit, et la dette et la Récupération, calculées à la lecture, la suivent.
// À part de recuperer-donnees.ts pour rester testable sans réseau ni module natif (les lectures sont des dépendances).
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage, PREFIXE_CACHE } from "../db/depots/reglages";
import { lireRecup } from "./recuperer-donnees";

// état de ce téléphone (préfixe cache_) : ni synchronisé, ni sauvegardé
export const REGLAGE_RELEVE = `${PREFIXE_CACHE}recup_releve`;
const MIN = 60_000;
/** Minutes après la fin de la sieste : une relecture à chacune, puis plus rien (la mesure qui n'est pas venue en 6 h ne viendra pas). */
export const DELAIS_RELEVE = [2, 5, 10, 20, 40, 90, 180, 360] as const;

/** Une sieste qui attend la mesure de la montre : `faites` relectures tentées. */
export interface Attente {
  id: string;
  fin: number;
  faites: number;
}

export function lireAttentes(json: string | null): Attente[] {
  try {
    const l = json ? JSON.parse(json) : null;
    return Array.isArray(l)
      ? l.filter((a): a is Attente => a && typeof a.id === "string" && Number.isFinite(a.fin) && Number.isInteger(a.faites) && a.faites >= 0)
      : [];
  } catch {
    return [];
  }
}

/** L'instant de la prochaine relecture de cette sieste ; null quand toutes sont faites. */
export function echeanceReleve(a: Attente): number | null {
  const d = DELAIS_RELEVE[a.faites];
  return d == null ? null : a.fin + d * MIN;
}

/** Les relectures dues à `maintenant` ; l'indice de la première non encore échue passe en `faites` (une appli rouverte tard ne relit qu'une fois). */
export function apresReleve(a: Attente, maintenant: number): Attente {
  let faites = a.faites;
  while (faites < DELAIS_RELEVE.length && a.fin + DELAIS_RELEVE[faites]! * MIN <= maintenant) faites++;
  return { ...a, faites };
}

async function ecrireAttentes(db: Executeur, l: Attente[]): Promise<void> {
  await ecrireReglage(db, REGLAGE_RELEVE, l.length ? JSON.stringify(l) : "");
}

export const attentesDe = async (db: Executeur): Promise<Attente[]> => lireAttentes(await lireReglage(db, REGLAGE_RELEVE).catch(() => null));

/** La sieste `id`, finie à `fin`, attend la mesure de la montre. */
export async function attendreMontre(db: Executeur, id: string, fin: number): Promise<void> {
  const l = (await attentesDe(db)).filter((a) => a.id !== id);
  await ecrireAttentes(db, [...l, { id, fin, faites: 0 }]);
  prevenir();
}

/** Cette sieste attend-elle encore la mesure de la montre (affichée « en attente » par l'écran de fin) ? */
export async function enAttenteDeMontre(db: Executeur, id: string): Promise<boolean> {
  return (await attentesDe(db)).some((a) => a.id === id);
}

/** Les lectures de la montre : Whoop (synchro de l'API) et Santé Connect (siestes), chacune seulement si elle est reliée. */
export interface DepsReleve {
  /** Faux sans aucune montre : rien à relire, les attentes sont abandonnées. */
  montre: () => Promise<boolean>;
  whoop: () => Promise<unknown>;
  sante: () => Promise<unknown>;
}

const abonnes = new Set<() => void>();
function prevenir() {
  abonnes.forEach((f) => f());
}
/** L'écran de fin et les pages de Santé se rafraîchissent quand l'attente change (mesure arrivée, ou abandon). */
export function ecouterReleve(f: () => void): () => void {
  abonnes.add(f);
  return () => void abonnes.delete(f);
}

let enCours: Promise<number> | null = null;

/**
 * Relit la montre pour les siestes dont une relecture est due. Rend le nombre de siestes dont la montre a répondu (la fusion
 * est faite par les imports eux-mêmes : recuperer-donnees.ts). Une sieste supprimée ou déjà mesurée sort de l'attente ; sans
 * montre, tout sort. Une seule relecture à la fois.
 */
export function relireMontre(db: Executeur, deps: DepsReleve, maintenant = Date.now()): Promise<number> {
  enCours ??= relire(db, deps, maintenant).finally(() => {
    enCours = null;
  });
  return enCours;
}

async function relire(db: Executeur, deps: DepsReleve, maintenant: number): Promise<number> {
  const toutes = await attentesDe(db);
  if (!toutes.length) return 0;
  const dues = toutes.filter((a) => (echeanceReleve(a) ?? Infinity) <= maintenant);
  const montre = await deps.montre().catch(() => true);
  if (!dues.length && montre) return 0;
  if (montre) {
    await deps.whoop().catch((e: unknown) => console.error(e));
    await deps.sante().catch((e: unknown) => console.error(e));
  }
  let repondu = 0;
  const reste: Attente[] = [];
  for (const a of toutes) {
    const s = await lireRecup(db, a.id);
    // supprimée, ou la montre a répondu (une source autre que pepfit : la fusion l'a absorbée)
    if (!s) continue;
    if (s.sources.some((x) => x !== "pepfit")) {
      repondu++;
      continue;
    }
    if (!montre) continue;
    const suite = dues.some((d) => d.id === a.id) ? apresReleve(a, maintenant) : a;
    if (echeanceReleve(suite) != null) reste.push(suite);
  }
  await ecrireAttentes(db, reste);
  prevenir();
  return repondu;
}

/** Le délai avant la prochaine relecture due (ms), pour le minuteur de l'appli ouverte ; null sans attente. */
export async function prochaineReleve(db: Executeur, maintenant = Date.now()): Promise<number | null> {
  const e = (await attentesDe(db)).map(echeanceReleve).filter((x): x is number => x != null);
  return e.length ? Math.max(0, Math.min(...e) - maintenant) : null;
}
