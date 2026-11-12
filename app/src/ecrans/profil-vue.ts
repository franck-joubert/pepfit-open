// Volet du profil : calculs sans écran (testés dans tests/profil-vue.test.ts).
import type { TypeRecord } from "../db/types";
import { t } from "../i18n/index";
import { PRIORITE } from "./fin-seance-vue";
import { nombre } from "./format";

export interface RecordRecent {
  exercice_id: string;
  nom: string;
  nature: string | null;
  type: TypeRecord;
  valeur: number;
  seance_id: string;
  atteint_le: number;
}

/**
 * Les `n` derniers records, du plus récent au plus ancien : une carte par exercice et par séance, avec le type le
 * plus parlant (comme en fin de séance). `lignes` : records battus, du plus récent au plus ancien.
 */
export function derniersRecords(lignes: readonly RecordRecent[], n = 5): RecordRecent[] {
  const parCle = new Map<string, RecordRecent>();
  const ordre: string[] = [];
  const rang = (t: TypeRecord) => {
    const i = PRIORITE.indexOf(t);
    return i < 0 ? PRIORITE.length : i;
  };
  for (const r of lignes) {
    const cle = `${r.seance_id}|${r.exercice_id}`;
    const deja = parCle.get(cle);
    if (!deja) {
      parCle.set(cle, r);
      ordre.push(cle);
    } else if (rang(r.type) < rang(deja.type)) parCle.set(cle, r);
  }
  return ordre
    .map((c) => parCle.get(c)!)
    .sort((a, b) => b.atteint_le - a.atteint_le)
    .slice(0, n);
}

// ——— Sommaire du volet (planche profil, direction A) : l'état de chaque entrée, sur une ligne t3 ———

/** Préférences : apparence, langue, unité de poids (« Auto · Français · kg »). */
export const resumePreferences = (apparence: string, langue: string, poids: string) => [apparence, langue, poids].join(", ");

/** Connexions actives, dans l'ordre de la page (« Santé Connect · Claude »), ou « Aucune ». */
export function resumeConnexions(santeConnect: boolean, ia: readonly string[]): string {
  const l = [...(santeConnect ? [t("reglages.santeConnect")] : []), ...ia.filter(Boolean)];
  return l.length ? l.join(", ") : t("reglages.aucune");
}

const ORDRE_PERMISSIONS = [
  ["pas", "reglages.permissions.pas"],
  ["poids", "reglages.permissions.poids"],
  ["sommeil", "reglages.permissions.sommeil"],
  ["frequence-cardiaque", "reglages.permissions.fc"],
] as const;

/** Santé Connect : les trois premières données autorisées parmi pas, poids, sommeil, fréquence cardiaque. */
export function resumePermissions(accordees: readonly string[]): string {
  const l = ORDRE_PERMISSIONS.filter(([p]) => accordees.includes(p)).map(([, c]) => t(c));
  const texte = l.slice(0, 3).join(", ");
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** Temps total d'entraînement : en heures rondes, en minutes sous l'heure (« 0 h » pour 2 min ne disait rien). */
export function dureeTotale(min: number): string {
  if (min < 60) return t("communs.min", { n: Math.round(min) });
  return t("communs.h", { n: nombre(Math.round(min / 60), 0) });
}
