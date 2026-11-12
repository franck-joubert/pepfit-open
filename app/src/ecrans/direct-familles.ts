// Suivi en direct et fin des familles 2 à 5 (planche familles-sports, lots 2 à 5, décisions du 30/10) : ce que les écrans
// calculent, sans React Native (testé dans tests/familles-sports.test.ts).
import type { EchantillonFc } from "../natif/suivi/types";
import { t, type CleSimple } from "../i18n/index";
import { minutesParZone } from "./effort-jour";
import { chargeSeance, scoreEffort } from "./effort-pepfit";
import { fcSur } from "./effort-vue";
import type { RefZones } from "./zones-fc";

/**
 * Effort pepfit de la séance en direct (planche effort-pepfit) : la FC de la séance par zones (Edwards), sinon le barème du
 * sport ; null avant une minute. Le ressenti n'est pas encore dit en direct : la muscu se mesure à la FC, puis au ressenti
 * une fois la séance enregistrée.
 */
export function effortEnDirect(sportId: string, fc: readonly Pick<EchantillonFc, "s" | "bpm">[], tempsMs: number, fcMax: RefZones): number | null {
  if (tempsMs < 60_000) return null;
  const c = chargeSeance({ sportId, minutes: tempsMs / 60_000, zones: fc.length ? minutesParZone(fc, fcMax) : null, ressenti: null });
  return c ? scoreEffort(c.charge) : null;
}

/** Temps par zone (s, Z0 à Z5) et FC moyenne de la séance en direct ; null sans FC. */
export function fcDeLaSeance(fc: readonly Pick<EchantillonFc, "s" | "bpm">[], fcMax: RefZones) {
  const r = fcSur(fc, fcMax);
  return r.temps > 0 ? { zones: r.zones, moy: r.moy == null ? null : Math.round(r.moy), max: r.max } : null;
}

/**
 * Compte à rebours d'une récupération (D11 du 30/10) : ce qui reste de la durée visée, puis le dépassement, compté à part
 * (comme une série en durée, D1 de seance-duree).
 */
export function compteRebours(tempsS: number, viseeS: number): { resteS: number; depasseS: number; atteint: boolean } {
  const atteint = tempsS >= viseeS;
  return { resteS: Math.max(0, Math.ceil(viseeS - tempsS)), depasseS: atteint ? Math.floor(tempsS - viseeS) : 0, atteint };
}

/** Durées visées proposées au départ d'une récupération (minutes) ; « Sans » : le chrono monte. */
export const DUREES_VISEES_MIN = [5, 10, 15, 20] as const;

/** Exemple gris du champ « Score ou niveau » (D5), adapté au sport : raquette, collectif, combat, escalade, golf. */
const EXEMPLES: Record<string, string[]> = {
  raquette: ["tennis", "padel", "squash", "badminton", "tennis-de-table", "pickleball"],
  collectif: [
    "football", "football-americain", "football-australien", "football-gaelique", "hurling", "rugby", "basket", "volley", "handball",
    "netball", "baseball", "softball", "cricket", "hockey-gazon", "hockey-glace", "lacrosse", "ultimate", "water-polo", "polo", "spikeball",
  ],
  combat: ["boxe", "kickboxing", "arts-martiaux", "jiu-jitsu", "lutte", "escrime"],
  escalade: ["escalade"],
  golf: ["golf", "disc-golf"],
};
export function exempleScore(sportId: string): string {
  const slug = sportId.startsWith("cat:") ? sportId.slice(4) : sportId;
  const genre = Object.keys(EXEMPLES).find((k) => EXEMPLES[k]!.includes(slug)) ?? "autre";
  return t(`effort.score.exemple.${genre}` as CleSimple);
}
