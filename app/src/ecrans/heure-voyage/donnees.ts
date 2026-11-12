// Réglages du changement d'heure et du voyage (planche sommeil, D13 à D15) : gardés sur ce téléphone, jamais synchronisés
// (le fuseau de chez soi et le voyage sont ceux de ce téléphone ; le rappel est une notification de ce téléphone).
import { ecrireReglage, lireReglage, type Executeur } from "../../db/api";
import { lireSommeil } from "../mesures/sommeil-donnees";
import { decaler, minuit } from "../mesures/periodes";
import { rythmeHabituel, type Rythme } from "./changement-heure";
import { AVANT_DEFAUT, AVANTS } from "./rappel-coucher";
import { lireVoyageTexte, surFuseauAppareil, type Voyage } from "./voyage";

export const CLES_HEURE = {
  maison: "sommeil_fuseau_maison",
  voyage: "sommeil_voyage",
  rappel: "sommeil_rappel_coucher",
  avant: "sommeil_rappel_avant",
  plan: "sommeil_rappel_plan",
  seances: "sommeil_seances_voyage",
} as const;

export type ChoixSeances = "lieu" | "maison";

export interface ReglagesHeure {
  /** Fuseau de chez soi : celui du téléphone au premier lancement, puis après 30 jours ailleurs. */
  maison: string | null;
  voyage: Voyage | null;
  /** Rappel de coucher : éteint par défaut (D15). */
  rappel: boolean;
  avant: number;
  /** « Pendant un plan » : allumé par défaut. */
  suivrePlan: boolean;
  /** Séances en voyage (D14) : à l'heure du lieu par défaut. */
  seances: ChoixSeances;
}

export async function lireReglagesHeure(db: Executeur): Promise<ReglagesHeure> {
  const [maison, voyage, rappel, avant, plan, seances] = await Promise.all(
    Object.values(CLES_HEURE).map((c) => lireReglage(db, c).catch(() => null)),
  );
  const a = Number(avant);
  return {
    maison: maison || null,
    voyage: lireVoyageTexte(voyage ?? null),
    rappel: rappel === "1",
    avant: (AVANTS as readonly number[]).includes(a) ? a : AVANT_DEFAUT,
    suivrePlan: plan !== "0",
    seances: seances === "maison" ? "maison" : "lieu",
  };
}

export async function ecrireReglagesHeure(db: Executeur, r: Partial<ReglagesHeure>): Promise<void> {
  if (r.maison !== undefined) await ecrireReglage(db, CLES_HEURE.maison, r.maison ?? "");
  if (r.voyage !== undefined) await ecrireReglage(db, CLES_HEURE.voyage, r.voyage ? JSON.stringify(r.voyage) : "");
  if (r.rappel !== undefined) await ecrireReglage(db, CLES_HEURE.rappel, r.rappel ? "1" : "0");
  if (r.avant !== undefined) await ecrireReglage(db, CLES_HEURE.avant, String(r.avant));
  if (r.suivrePlan !== undefined) await ecrireReglage(db, CLES_HEURE.plan, r.suivrePlan ? "1" : "0");
  if (r.seances !== undefined) await ecrireReglage(db, CLES_HEURE.seances, r.seances);
}

/** Rythme habituel des 7 dernières nuits mesurées (moins de 3 : null). */
export async function lireRythme(db: Executeur, maintenant = Date.now()): Promise<Rythme | null> {
  const s = await lireSommeil(db, decaler(minuit(maintenant), -10), maintenant).catch(() => null);
  return s ? rythmeHabituel([...s.stats.values()]) : null;
}

/** Le fuseau du téléphone vu à l'ouverture ou au retour au premier plan : arrivée, retour, ou nouveau chez-soi (D13). */
export async function suivreFuseauAppareil(db: Executeur, appareil: string, maintenant = Date.now()): Promise<void> {
  const r = await lireReglagesHeure(db);
  const e = surFuseauAppareil({ maison: r.maison, voyage: r.voyage }, appareil, maintenant);
  if (e.maison !== r.maison) await ecrireReglagesHeure(db, { maison: e.maison });
  if (JSON.stringify(e.voyage) !== JSON.stringify(r.voyage)) await ecrireReglagesHeure(db, { voyage: e.voyage });
}
