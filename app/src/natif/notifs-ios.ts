import type { DiagIos } from "./alarme-recup/types";

// iPhone (docs/CODE-IOS-RAPPELS.md) : les règles pures des notifications locales, testées sous Node (tests/notifs-ios.test.ts).
// iOS n'a ni canal ni alarme pour une appli tierce : son, vibration et urgence se disent dans chaque notification.

/**
 * iOS garde au plus 64 notifications programmées par appli (au-delà, les plus lointaines sont oubliées sans erreur ; une
 * notification quotidienne compte pour une). Part de chaque famille ; le reste (8) est gardé pour les alarmes : fin-repos,
 * fin-cible, fin-sieste et ses 3 relances, fin-sieste-libre, rappel-sieste.
 */
export const PLAFOND_IOS = { planif: 14, repas: 21, coucher: 7, traitements: 10, regles: 3 } as const;

/** Les `n` plus proches (par `quand`), dans l'ordre du temps. */
export function plafonner<T>(prevus: readonly T[], n: number, quand: (x: T) => number): T[] {
  return [...prevus].sort((a, b) => quand(a) - quand(b)).slice(0, Math.max(0, n));
}

/** Sons de l'appli (app/assets/sons, copiés dans l'appli iOS par plugins/ios-rappels.js ; app/scripts/sons-ios.py). */
export const SON_REPOS = "pepfit-repos.wav";
/** 28 s : iOS joue au plus 30 s ; au-delà, il remplace le son par celui par défaut. */
export const SON_REVEIL = "pepfit-reveil.wav";
/** Un son muet : une notification sans son ne vibre pas sur iPhone ; avec lui, elle vibre seulement (à tester sur un iPhone). */
export const SON_SILENCE = "pepfit-silence.wav";
export const SONS_IOS = [SON_REPOS, SON_REVEIL, SON_SILENCE] as const;

/** Le son d'une notification d'alarme sur iPhone : le fichier choisi, le son muet (vibrer seulement) ou rien. */
export function sonIos(o: { sonne: boolean; vibre: boolean; son: string }): string | false {
  if (o.sonne) return o.son;
  return o.vibre ? SON_SILENCE : false;
}

/** Catégorie des alarmes (fin de sieste ou d'activité) : « Arrêter » et « Reporter » sur la notification. */
export const CATEGORIE_ALARME = "pepfit-alarme";
export const ACTION_ARRETER = "arreter";
export const ACTION_REPORTER = "reporter";
export const REPORT_MS = 5 * 60_000;

/** Relances de l'alarme de fin de sieste : le son d'une notification dure au plus 30 s ; trois autres le prolongent. */
export const RELANCES = 3;
export const ECART_RELANCE_MS = 30_000;
export const idRelance = (i: number) => `fin-sieste-r${i}`;
export const estRelance = (id: string) => /^fin-sieste-r\d+$/.test(id);

/** Les instants des relances après `fin`. */
export function relances(fin: number): { id: string; quand: number }[] {
  return Array.from({ length: RELANCES }, (_, i) => ({ id: idRelance(i + 1), quand: fin + (i + 1) * ECART_RELANCE_MS }));
}

/** Le diagnostic du module Swift (getNotificationSettings) en objet de l'appli ; null sans le module. */
export function lireDiagIos(d: Record<string, unknown> | null | undefined): DiagIos | null {
  if (!d) return null;
  const u = d.urgentes;
  return {
    autorisees: d.autorisees === true,
    sons: d.sons !== false,
    urgentes: u === "oui" || u === "non" ? u : "absent",
    verrou: d.verrou !== false,
  };
}
