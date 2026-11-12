// Synchro de Polar AccessLink v3. Au premier passage, tout ce que Polar garde : séances des 30 derniers jours (seulement
// celles envoyées à Flow après l'inscription chez notre client, règle de Polar), sommeil et Nightly Recharge des 28 derniers
// jours, FC continue des 28 derniers jours, activité des 365 derniers jours. Ensuite, l'incrémental : les séances pas encore
// vues (détail lu une fois), les listes de nuits (un appel chacune), la FC et l'activité depuis la veille du dernier jour lu.
// Les curseurs n'avancent qu'une fois tout rangé (une synchro interrompue reprend au même point).
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import type { ApiPolar } from "./api";
import { REGLAGE } from "./constantes";
import { convertirActivite, convertirFcContinue, convertirNuit, convertirRecharge, convertirSeance } from "./convertir";
import { enregistrerFc, enregistrerJours, enregistrerNuits, enregistrerSeances } from "./depot";
import type { JourConverti, NuitConvertie, SeanceConvertie } from "./types";

const JOUR = 86_400_000;
/** FC continue : jours relus au premier passage. */
export const JOURS_FC_INITIAUX = 28;
/** Activité : profondeur de Polar (365 jours), lue par tranches de 28 jours (maximum d'un appel). */
export const JOURS_ACTIVITE_INITIAUX = 365;
const TRANCHE_ACTIVITE = 28;

export interface BilanPolar {
  historique: boolean;
  seances: { enrichies: number; creees: number };
  nuits: number;
  mesures: number;
  pointsFc: number;
  jours: number;
  appels: number;
}

/** AAAA-MM-JJ du jour local de `ms`. */
export function jourIso(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Midi du jour AAAA-MM-JJ (heure locale) : les décalages d'un jour ne butent pas sur un changement d'heure. */
function midi(jour: string): number {
  const [a, m, j] = jour.split("-").map(Number);
  return new Date(a!, m! - 1, j!, 12).getTime();
}

/** Jours de `de` à `a` compris (AAAA-MM-JJ). */
export function joursEntre(de: string, a: string): string[] {
  const l: string[] = [];
  const [an, m, j] = de.split("-").map(Number);
  for (let i = 0; l.length < 1000; i++) {
    const x = jourIso(new Date(an!, m! - 1, j! + i, 12).getTime());
    if (x > a) break;
    l.push(x);
  }
  return l;
}

/** Premier jour à relire : la veille du curseur (journée peut-être incomplète au passage d'avant), sinon `initial` jours. */
async function depuis(db: Executeur, cle: string, maintenant: number, initial: number): Promise<{ de: string; historique: boolean }> {
  const c = await lireReglage(db, cle);
  if (c && /^\d{4}-\d{2}-\d{2}$/.test(c)) return { de: jourIso(midi(c) - JOUR), historique: false };
  return { de: jourIso(maintenant - (initial - 1) * JOUR), historique: true };
}

/** Membre pepfit chez Polar : un identifiant au hasard, sans lien avec le compte pepfit. */
const membre = () => `pepfit-${Math.random().toString(36).slice(2, 12)}`;

export async function synchroniserPolar(db: Executeur, api: ApiPolar, maintenant: number = Date.now()): Promise<BilanPolar> {
  const bilan: BilanPolar = { historique: false, seances: { enrichies: 0, creees: 0 }, nuits: 0, mesures: 0, pointsFc: 0, jours: 0, appels: 0 };
  const compter = <T>(p: Promise<T>) => {
    bilan.appels++;
    return p;
  };
  if ((await lireReglage(db, REGLAGE.inscrit)) !== "1") {
    await compter(api.inscrire(membre()));
    await ecrireReglage(db, REGLAGE.inscrit, "1");
  }

  // séances : le détail (FC, zones, tracé) des seules séances pas encore rangées
  const liste = await compter(api.seances());
  const connues = new Set((await db.getAllAsync<{ id: string }>("SELECT id FROM polar_seance", [])).map((x) => x.id));
  const seances: SeanceConvertie[] = [];
  for (const s of liste) {
    if (connues.has(String(s.id))) continue;
    const detail = await compter(api.seance(String(s.id)));
    const c = convertirSeance(detail ?? s);
    if (c) seances.push(c);
  }
  seances.sort((a, b) => a.debut - b.debut);
  bilan.seances = await enregistrerSeances(db, seances, maintenant);

  // sommeil et Nightly Recharge : 28 jours en une lecture chacun
  const [nuitsBrutes, recharges] = await Promise.all([compter(api.nuits()), compter(api.recharges())]);
  const nuits = nuitsBrutes.map(convertirNuit).filter((n): n is NuitConvertie => n != null);
  bilan.mesures = await enregistrerNuits(db, nuits, recharges.map(convertirRecharge), maintenant);
  bilan.nuits = nuits.length;

  // FC continue, jour par jour
  const aujourdhui = jourIso(maintenant);
  const fc = await depuis(db, REGLAGE.curseurFc, maintenant, JOURS_FC_INITIAUX);
  bilan.historique = fc.historique;
  for (const j of joursEntre(fc.de, aujourdhui)) {
    const r = await compter(api.fcJour(j));
    if (r) bilan.pointsFc += await enregistrerFc(db, convertirFcContinue({ ...r, date: r.date || j }));
  }
  await ecrireReglage(db, REGLAGE.curseurFc, aujourdhui);

  // activité du jour (pas), par tranches de 28 jours
  const act = await depuis(db, REGLAGE.curseurActivite, maintenant, JOURS_ACTIVITE_INITIAUX);
  const tous = joursEntre(act.de, aujourdhui);
  const jours: JourConverti[] = [];
  for (let i = 0; i < tous.length; i += TRANCHE_ACTIVITE) {
    const tranche = tous.slice(i, i + TRANCHE_ACTIVITE);
    for (const a of await compter(api.activites(tranche[0]!, tranche[tranche.length - 1]!))) {
      const c = convertirActivite(a);
      if (c) jours.push(c);
    }
  }
  await enregistrerJours(db, jours, maintenant);
  bilan.jours = jours.length;
  await ecrireReglage(db, REGLAGE.curseurActivite, aujourdhui);

  await ecrireReglage(db, REGLAGE.derniereSynchro, String(maintenant));
  return bilan;
}
