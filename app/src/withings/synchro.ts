// Synchro de Withings (getmeas) : au premier branchement, tout l'historique (sans date) ; ensuite, ce qui a changé depuis le
// dernier passage (lastupdate = updatetime gardé, moins une heure de recouvrement). On suit more/offset jusqu'au bout ; le
// curseur n'avance qu'une fois tout rangé (une synchro interrompue reprend au même point).
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import type { ApiWithings } from "./api";
import { REGLAGE, VERSION_CONVERSION } from "./constantes";
import { diagnostiquer } from "./convertir";
import { enregistrerMesures } from "./depot";
import type { DiagnosticWithings, GroupeWithings } from "./types";

/** Recouvrement de la reprise (s) : une mesure synchronisée par la balance juste avant `updatetime` est relue. */
export const RECOUVREMENT_S = 3600;
const PAGES_MAX = 500;

export interface BilanWithings {
  /** Vrai pour la lecture de tout l'historique (premier branchement). */
  historique: boolean;
  groupes: number;
  pesees: number;
  mesures: number;
  pages: number;
  /** Ce que l'API a livré et ce qui a été écarté (aussi gardé dans les réglages, pour Connexions). */
  diagnostic: DiagnosticWithings;
}

/** Une synchro sans rien de neuf garde les types, les écartés et la date de la dernière livraison : sans cela, le journal
 *  ne dirait plus rien dès le passage suivant. */
function avecDernierePrise(d: DiagnosticWithings, avant: string | null): DiagnosticWithings {
  if (d.groupes > 0 || !avant) return d;
  try {
    const p = JSON.parse(avant) as DiagnosticWithings;
    return Array.isArray(p?.types) && p.ecartes ? { ...p, groupes: 0, ancien: true } : d;
  } catch {
    return d;
  }
}

export async function synchroniserWithings(db: Executeur, api: ApiWithings, maintenant: number = Date.now()): Promise<BilanWithings> {
  // Conversion plus riche que celle qui a lu l'historique (zones du Body Scan, viscéral…) : on relit tout une fois.
  const relire = Number(await lireReglage(db, REGLAGE.versionConversion)) !== VERSION_CONVERSION;
  const curseur = relire ? 0 : Number(await lireReglage(db, REGLAGE.curseur)) || 0;
  const depuis = curseur > 0 ? curseur - RECOUVREMENT_S : 0;
  const bilan: BilanWithings = { historique: depuis === 0, groupes: 0, pesees: 0, mesures: 0, pages: 0, diagnostic: { groupes: 0, types: [], ecartes: { objectifs: 0, ambigus: 0, positions: [], inconnus: [], nuls: 0 }, dernier: null } };
  const groupes: GroupeWithings[] = [];
  let offset: number | undefined;
  let fin = 0;
  for (let i = 0; i < PAGES_MAX; i++) {
    const p = await api.mesures(depuis, offset);
    bilan.pages++;
    groupes.push(...p.measuregrps);
    if (i === 0) fin = Number(p.updatetime) || Math.floor(maintenant / 1000);
    if (!p.more || !p.offset) break;
    offset = p.offset;
  }
  bilan.groupes = groupes.length;
  const { mesures, diagnostic } = diagnostiquer(groupes);
  bilan.diagnostic = avecDernierePrise(diagnostic, await lireReglage(db, REGLAGE.diagnostic));
  const ecrit = await enregistrerMesures(db, mesures, maintenant);
  bilan.pesees = ecrit.pesees;
  bilan.mesures = ecrit.mesures;
  await ecrireReglage(db, REGLAGE.curseur, String(Math.max(curseur, fin)));
  await ecrireReglage(db, REGLAGE.versionConversion, String(VERSION_CONVERSION));
  await ecrireReglage(db, REGLAGE.derniereSynchro, String(maintenant));
  await ecrireReglage(db, REGLAGE.diagnostic, JSON.stringify(bilan.diagnostic));
  return bilan;
}
