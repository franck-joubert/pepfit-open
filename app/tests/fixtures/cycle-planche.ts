// Les données inventées de la planche cycle (planches/cycle/outils/donnees.js), même tirage fixe : vendredi 30 octobre 2026,
// jour 19 d'un cycle commencé le 12 octobre, 9 épisodes de règles (les 4 plus anciens de Santé Connect). Sert aux tests et au
// jeu de démo de la recette (docs/code-cycle/seed.ts).
import { ecartJ, jourUtc, plus, type JourCycle } from "../../src/cycle/modele.ts";

export const AUJ = "2026-10-30";
const DUREES = [28, 30, 29, 28, 31, 27, 29, 29];
const REGLES_J = [5, 4, 5, 5, 6, 5, 5, 5, 5];
const INTENSITE = [2, 3, 3, 2, 1] as const;

let graine = 20261031;
const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
const normal = () => {
  const u = Math.max(1e-9, alea()),
    v = alea();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const debuts = ["2026-10-12"];
for (let i = DUREES.length - 1; i >= 0; i--) debuts.unshift(plus(debuts[0]!, -DUREES[i]!));

/** Les épisodes : début, fin, source. */
export const REGLES = debuts.map((d, i) => ({ debut: d, fin: plus(d, REGLES_J[i]! - 1), source: (i < 4 ? "sante_connect" : "saisie") as JourCycle["source"] }));

/** Les jours de règles tels que cycle_jour les garde (le dernier jour de chaque épisode marqué comme fin). */
export const JOURS: JourCycle[] = REGLES.flatMap((r, i) =>
  Array.from({ length: REGLES_J[i]! }, (_, k) => ({
    jour: plus(r.debut, k),
    flux: (INTENSITE[k] ?? 1) as JourCycle["flux"],
    fin: k === REGLES_J[i]! - 1,
    energie: null,
    humeur: null,
    gene: null,
    source: r.source,
  })),
);

const ou = (d: string) => {
  const k = [...debuts].reverse().find((b) => jourUtc(b) <= jourUtc(d));
  if (!k) return null;
  const i = debuts.indexOf(k);
  const duree = DUREES[i] ?? 29;
  const j = ecartJ(k, d) + 1;
  return { j, duree, seconde: j >= duree - 12, versSuivant: ecartJ(d, debuts[i + 1] ?? plus(k, 29)) };
};

/** Nuits : VFC un peu plus basse et FC au repos un peu plus haute en seconde moitié. */
export const NUITS: { jour: string; vfc: number; fc: number }[] = [];
for (let d = plus(AUJ, -130); jourUtc(d) <= jourUtc(AUJ); d = plus(d, 1)) {
  const o = ou(d);
  const s = o && o.seconde;
  NUITS.push({ jour: d, vfc: Math.round(Math.exp(Math.log(57) + (s ? -0.1 : 0) + 0.09 * normal())), fc: Math.round(52.5 + (s ? 2.2 : 0) + 1.1 * normal()) });
}
NUITS[NUITS.length - 1]!.vfc = 50;
NUITS[NUITS.length - 1]!.fc = 55;

/** Pesées du matin : une pente douce, de l'eau autour des règles. */
export const PESEES: { jour: string; kg: number }[] = [];
for (let d = plus(AUJ, -130); jourUtc(d) <= jourUtc(AUJ); d = plus(d, 1)) {
  if (alea() < 0.18 && d !== AUJ) continue;
  const o = ou(d);
  const rel = o && o.versSuivant <= 7 ? -o.versSuivant : o ? o.j - 1 : 99;
  const eau = rel >= -6 && rel <= 2 ? 0.8 * Math.max(0, 1 - Math.abs(rel + 0.5) / 5) : 0;
  PESEES.push({ jour: d, kg: Math.round((62.6 - 0.006 * ecartJ(plus(AUJ, -130), d) + eau + 0.18 * normal()) * 10) / 10 });
}
