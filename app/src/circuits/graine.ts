// La graine des coupes (coupe.ts) : tirée une fois au hasard, gardée sur ce téléphone, jamais envoyée. Une même sortie est
// toujours coupée pareil.
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { aleatoire, b64, pret } from "../sync/chiffrement";

const CLE = "circuits_graine";

export async function graineCoupes(db: Executeur): Promise<string> {
  const lue = await lireReglage(db, CLE);
  if (lue) return lue;
  await pret();
  const g = b64(aleatoire(16));
  await ecrireReglage(db, CLE, g);
  return g;
}
