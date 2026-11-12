import type { TempsCircuit } from "../../circuits/suivre";
import type { Executeur } from "../executeur";
import { ecrireReglage, lireReglage } from "./reglages";

// « Mon temps » d'un circuit (planche Circuits, lot F) : les fois où la personne l'a fait pendant une sortie suivie. Local au téléphone et
// jamais envoyé (ni compteur, ni classement, ni record côté serveur) : un réglage par circuit, hors de la liste de ceux qui se synchronisent
// (sync/schema.ts). Pas de table, donc pas de migration. Une sortie reprise puis refinie remplace son temps (même `seanceId`).

const cle = (circuitId: string) => `circuit_temps:${circuitId}`;
/** Les 50 derniers temps suffisent : le meilleur temps est gardé à part s'il est plus ancien. */
const TEMPS_MAX = 50;

function lire(json: string | null): TempsCircuit[] {
  if (!json) return [];
  try {
    const l = JSON.parse(json) as unknown;
    return Array.isArray(l)
      ? l.filter((x): x is TempsCircuit => !!x && typeof x.seanceId === "string" && Number.isFinite(x.le) && Number.isFinite(x.dureeS) && x.dureeS > 0)
      : [];
  } catch {
    return [];
  }
}

export async function lireTemps(db: Executeur, circuitId: string): Promise<TempsCircuit[]> {
  return lire(await lireReglage(db, cle(circuitId)));
}

export async function noterTemps(db: Executeur, circuitId: string, temps: TempsCircuit): Promise<void> {
  const autres = (await lireTemps(db, circuitId)).filter((x) => x.seanceId !== temps.seanceId);
  const tous = [...autres, temps].sort((a, b) => b.le - a.le);
  const gardes = tous.slice(0, TEMPS_MAX);
  const meilleur = tous.reduce((m, x) => (x.dureeS < m.dureeS ? x : m), tous[0]!);
  if (!gardes.includes(meilleur)) gardes.push(meilleur);
  await ecrireReglage(db, cle(circuitId), JSON.stringify(gardes));
}
