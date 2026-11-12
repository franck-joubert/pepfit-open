// Alarme de fin de sieste et des activités de récupération (planche recuperer, D9) : un réglage à part, `alerte_sieste`, son
// et vibration par défaut, sans « rien » (une alarme de sieste qui ne sonne pas n'a pas de sens). Le minuteur de repos garde le
// sien. Même système que le minuteur de repos (alerte-repos.ts, natif/minuteur) : un canal Android par combinaison mode + son,
// sur le flux alarme, et une notification à heure exacte (setAlarmClock). Pur : tests/recuperer-session.test.ts.
import type { DiagAlarme } from "../natif/alarme-recup/types";
import { alerteSonne, alerteVibre, type AlerteRepos } from "./alerte-repos";

export type AlerteSieste = Exclude<AlerteRepos, "rien">;
export const MODES_ALERTE_SIESTE: readonly AlerteSieste[] = ["les-deux", "son", "vibration"];
export const REGLAGE_ALERTE_SIESTE = "alerte_sieste";

/** Le réglage, son et vibration sans réglage ni valeur lisible. */
export function lireAlerteSieste(v: string | null): AlerteSieste {
  return MODES_ALERTE_SIESTE.includes(v as AlerteSieste) ? (v as AlerteSieste) : "les-deux";
}

export const siesteSonne = (m: AlerteSieste) => alerteSonne(m);
export const siesteVibre = (m: AlerteSieste) => alerteVibre(m);

/** Une vibration longue et répétée, comme un réveil (le minuteur de repos n'a qu'une impulsion). */
export const VIBRATION_SIESTE = [0, 600, 400, 600, 400, 600];

/** Tous les canaux de fin de sieste commencent ainsi : ceux du minuteur de repos (« fin-repos ») ne sont jamais touchés. */
export const PREFIXE_CANAL_SIESTE = "fin-sieste";

function empreinte(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Un canal Android est figé une fois créé : `fin-sieste-<mode>-<son>`, construit comme canalRepos. */
export function canalSieste(mode: AlerteSieste, sonUri: string | null): string {
  if (!siesteSonne(mode)) return `${PREFIXE_CANAL_SIESTE}-${mode}`;
  return `${PREFIXE_CANAL_SIESTE}-${mode}-${sonUri ? empreinte(sonUri) : "defaut"}`;
}

/** Les identifiants des notifications de « Récupérer ». */
export const ID_FIN_RECUP = "fin-sieste";
export const ID_LIBRE_RECUP = "fin-sieste-libre";
export const ID_RAPPEL_SIESTE = "rappel-sieste";
export const CANAL_RAPPEL_SIESTE = "rappel-sieste";
export const CATEGORIE_RAPPEL_SIESTE = "rappel-sieste";
export const ACTION_DEMARRER_SIESTE = "demarrer";

/**
 * Ce qui couperait vraiment l'alarme, pour la ligne discrète de l'écran de la sieste. Le mode silencieux, le vibreur et « Ne
 * pas déranger » en priorité ou en alarmes seulement ne coupent rien : l'alarme passe par le flux ALARME et vibre en
 * USAGE_ALARM, comme celle d'une appli Horloge. Rien à dire sans diagnostic (APK sans le module natif, web).
 * iPhone (`d.ios`) : une notification, pas une alarme. Notifications coupées, sons coupés, « Notifications urgentes »
 * éteintes (une Concentration la tairait) ; sinon, si elle sonne, le rappel que le mode silencieux coupe le son (l'appli ne
 * peut pas le lire).
 */
export type AvertissementAlarme = "total" | "bloquee" | "volume" | "retard" | "notifications" | "sons" | "urgentes" | "silencieux";
export function avertissementAlarme(d: DiagAlarme | null, sonne = true): AvertissementAlarme | null {
  if (!d) return null;
  if (d.ios) {
    if (!d.ios.autorisees) return "notifications";
    if (sonne && !d.ios.sons) return "sons";
    if (d.ios.urgentes === "non") return "urgentes";
    return sonne ? "silencieux" : null;
  }
  if (d.neDeranger === "total") return "total";
  if (d.neDeranger === "priorite" && !d.alarmesPermises) return "bloquee";
  if (d.volumeAlarme <= 0) return "volume";
  // « Alarmes et rappels » refusée (SCHEDULE_EXACT_ALARM) : l'alarme sonne, mais peut-être en retard.
  if (!d.heureExacte) return "retard";
  return null;
}
