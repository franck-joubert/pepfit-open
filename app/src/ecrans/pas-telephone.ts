// Pas du téléphone en repli (backlog Y, 1/11) : quand ni Whoop ni Santé Connect ne donnent les pas, le compteur du téléphone
// (TYPE_STEP_COUNTER) les compte. Le capteur ne rend qu'un cumul depuis le dernier démarrage, sans historique : l'appli le lit
// quand elle s'ouvre ou qu'une page de pas se lit, et range la différence avec la lecture d'avant dans le jour en cours.
//  - lecture d'avant d'un autre jour : la différence n'est pas rangée (on ne sait pas à quelle heure ils ont été faits) ;
//  - cumul plus petit que celui d'avant : le téléphone a redémarré, le nouveau cumul est compté en entier ;
//  - plus précis qu'une montre : non (téléphone au fond du sac, pas comptés appli fermée entre deux lectures longues).
// Réglages locaux, jamais synchronisés : `pas_telephone_actif` ("1" après la permission), `pas_telephone_dernier` (JSON
// { brut, t }), `pas_telephone_jour:<minuit>` (pas du jour).
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { pasTelephone } from "../natif/pas-telephone";
import type { PasTelephone } from "../natif/pas-telephone";

export const REGLAGE_TEL_ACTIF = "pas_telephone_actif";
export const REGLAGE_TEL_DERNIER = "pas_telephone_dernier";
export const reglageJour = (minuit: number) => `pas_telephone_jour:${minuit}`;

const minuitDe = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Pas à ranger dans le jour : différence des cumuls, redémarrage compris ; 0 si la lecture d'avant est d'un autre jour. */
export function pasAjoutes(avant: { brut: number; t: number } | null, brut: number, maintenant: number): number {
  if (!avant || minuitDe(avant.t) !== minuitDe(maintenant)) return 0;
  return brut >= avant.brut ? brut - avant.brut : brut;
}

export const telephoneActif = async (db: Executeur): Promise<boolean> => (await lireReglage(db, REGLAGE_TEL_ACTIF).catch(() => null)) === "1";

/** Lit le compteur et range la différence dans le jour ; rien si le repli n'est pas activé. Vrai si une lecture a eu lieu. */
export async function echantillonnerTelephone(db: Executeur, maintenant: number = Date.now(), p: Pick<PasTelephone, "compteur"> = pasTelephone): Promise<boolean> {
  if (!(await telephoneActif(db))) return false;
  const brut = await p.compteur();
  if (brut == null) return false;
  let avant: { brut: number; t: number } | null = null;
  try {
    avant = JSON.parse((await lireReglage(db, REGLAGE_TEL_DERNIER)) ?? "null");
  } catch {
    avant = null;
  }
  const plus = pasAjoutes(avant, brut, maintenant);
  if (plus > 0) {
    const cle = reglageJour(minuitDe(maintenant));
    await ecrireReglage(db, cle, String(Number(await lireReglage(db, cle)) + plus));
  }
  await ecrireReglage(db, REGLAGE_TEL_DERNIER, JSON.stringify({ brut, t: maintenant }));
  return true;
}

/** Pas du téléphone de chaque jour (minuit local) ; null pour un jour sans pas rangés (rien de mesuré, pas « 0 »). */
export async function pasTelephoneJours(db: Executeur, jours: readonly number[]): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  if (!(await telephoneActif(db))) return m;
  const l = await db.getAllAsync<{ cle: string; valeur: string }>("SELECT cle, valeur FROM reglages WHERE cle LIKE 'pas_telephone_jour:%'", []);
  const voulus = new Set(jours);
  for (const r of l) {
    const j = Number(r.cle.slice("pas_telephone_jour:".length));
    const n = Number(r.valeur);
    if (voulus.has(j) && n > 0) m.set(j, Math.round(n));
  }
  return m;
}

/** Active le repli : demande la permission (sur un geste), puis première lecture. Faux si refusée ou sans capteur. */
export async function activerTelephone(db: Executeur, p: PasTelephone = pasTelephone): Promise<boolean> {
  if (!(await p.disponible())) return false;
  if (!(await p.autorise()) && !(await p.demander())) return false;
  await ecrireReglage(db, REGLAGE_TEL_ACTIF, "1");
  await echantillonnerTelephone(db, Date.now(), p);
  return true;
}

export async function desactiverTelephone(db: Executeur): Promise<void> {
  await ecrireReglage(db, REGLAGE_TEL_ACTIF, "0");
}
