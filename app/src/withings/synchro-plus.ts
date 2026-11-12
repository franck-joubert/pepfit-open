// Lecture de l'activité et du sommeil chez Withings (getactivity, getsummary). Deux régimes :
//  - première lecture : les 365 derniers jours par tranches de 90 jours (une demande par tranche et par sorte, avec more/offset) ;
//    le dernier jour rangé est gardé (REGLAGE.plusJusqua) : une lecture interrompue reprend à la tranche suivante ;
//  - ensuite : ce qui a changé depuis le dernier passage (lastupdate, une heure de recouvrement), en deux demandes.
// Le curseur n'avance qu'une fois tout rangé. Les pesées (synchro.ts) ne dépendent jamais de cette lecture.
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import type { ApiWithings, PlageWithings } from "./api";
import { JOURS_HISTORIQUE, JOURS_TRANCHE, REGLAGE, SCOPE_ACTIVITE } from "./constantes";
import { enregistrerJoursWithings } from "./depot-plus";
import { convertirActivites, convertirNuits, dateLocale } from "./plus";
import { lireFcRepos } from "./fc-nuit";
import { RECOUVREMENT_S } from "./synchro";
import type { ActiviteBrute, JourWithings, SerieSommeilBrute } from "./types";

const PAGES_MAX = 100;
const JOUR_MS = 86_400_000;

export interface BilanPlus {
  /** Faux : la connexion n'a pas le droit user.activity, rien n'a été lu (reconnexion demandée). */
  autorise: boolean;
  tranches: number;
  jours: number;
}

/** La connexion garde-t-elle user.activity ? `scope` est celui des jetons ; absent (jetons d'avant) : non. */
export const aLeDroitActivite = (scope: string | null | undefined): boolean => String(scope ?? "").split(/[\s,]+/).includes(SCOPE_ACTIVITE);

async function toutesLesPages<T>(lire: (offset?: number) => Promise<{ more?: number | boolean; offset?: number }>, pris: (p: never) => T[]): Promise<T[]> {
  const sortie: T[] = [];
  let offset: number | undefined;
  for (let i = 0; i < PAGES_MAX; i++) {
    const p = await lire(offset);
    sortie.push(...pris(p as never));
    if (!p.more || !p.offset) break;
    offset = p.offset;
  }
  return sortie;
}

async function lirePlage(api: ApiWithings, plage: PlageWithings): Promise<JourWithings[]> {
  const activites = await toutesLesPages<ActiviteBrute>((o) => api.activite(plage, o), (p: { activities: ActiviteBrute[] }) => p.activities);
  const series = await toutesLesPages<SerieSommeilBrute>((o) => api.sommeil(plage, o), (p: { series: SerieSommeilBrute[] }) => p.series);
  // une nuit et une activité du même jour : un seul jour, les champs des deux
  const jours = convertirActivites(activites);
  for (const [jour, nuit] of convertirNuits(series)) {
    const a = jours.get(jour);
    jours.set(jour, a ? { ...a, ...Object.fromEntries(Object.entries(nuit).filter(([, v]) => v != null)) } as JourWithings : nuit);
  }
  return [...jours.values()];
}

export async function synchroniserPlus(db: Executeur, api: ApiWithings, scope: string | null | undefined, maintenant: number = Date.now()): Promise<BilanPlus> {
  const bilan: BilanPlus = { autorise: aLeDroitActivite(scope), tranches: 0, jours: 0 };
  if (!bilan.autorise) {
    await ecrireReglage(db, REGLAGE.reconnexion, "1");
    return bilan;
  }
  await ecrireReglage(db, REGLAGE.reconnexion, "");
  const debutPasse = Math.floor(maintenant / 1000);
  const curseur = Number(await lireReglage(db, REGLAGE.plusCurseur)) || 0;
  if (curseur > 0) {
    const jours = await lirePlage(api, { depuis: curseur - RECOUVREMENT_S });
    bilan.tranches = 1;
    bilan.jours = await enregistrerJoursWithings(db, jours, maintenant);
  } else {
    const auj = new Date(maintenant);
    const aujourdhui = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()).getTime();
    const repris = Number(await lireReglage(db, REGLAGE.plusJusqua)) || 0;
    let debut = repris > 0 ? repris + JOUR_MS : aujourdhui - JOURS_HISTORIQUE * JOUR_MS;
    // dates par calendrier (setDate) et non en multiples de 24 h : un changement d'heure ne décale pas les tranches
    while (debut <= aujourdhui) {
      const d = new Date(debut);
      const fin = Math.min(new Date(d.getFullYear(), d.getMonth(), d.getDate() + JOURS_TRANCHE - 1).getTime(), aujourdhui);
      const jours = await lirePlage(api, { debut: dateLocale(debut), fin: dateLocale(fin) });
      bilan.jours += await enregistrerJoursWithings(db, jours, maintenant);
      bilan.tranches++;
      await ecrireReglage(db, REGLAGE.plusJusqua, String(fin));
      const f = new Date(fin);
      debut = new Date(f.getFullYear(), f.getMonth(), f.getDate() + 1).getTime();
    }
  }
  await ecrireReglage(db, REGLAGE.plusCurseur, String(debutPasse));
  await ecrireReglage(db, REGLAGE.plusErreur, "");
  // FC au repos des dernières nuits (FC à la minute) : un échec reste ici, le sommeil et les pas sont déjà rangés
  await lireFcRepos(db, api, maintenant);
  return bilan;
}
