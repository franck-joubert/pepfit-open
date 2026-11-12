// Mouvement des onglets (ui/Onglets.tsx) : la machine à états de la transition, sans React Native ni Reanimated. Testée par
// tests/onglets-mouvement.test.ts, qui la lit à des instants choisis : aucune horloge réelle, aucun timer.
//
// UN SEUL état source : l'onglet actif (`k`, la propriété de la page). Tout le reste en découle :
//   - `Course` : d'où l'on part (`de`) et où l'on va (`vers`), en parts de 0 à 1 par onglet et par canal ;
//   - une horloge `ms` (0 à `dureeCourse`), seul nombre qui avance.
// Ce qui s'affiche à l'instant `ms` est `canaux(course, ms)` : une fonction pure. Changer d'onglet pendant la route ne cache rien : la
// nouvelle course repart de ce qui est affiché (`reprise`), l'horloge repart de 0. À la fin (`ms ≥ dureeCourse`) ou sans course, les
// canaux valent `vers` EXACTEMENT : un 1 sous l'actif, des 0 ailleurs. Aucun état intermédiaire ne survit à un changement d'onglet.
//
// Quatre canaux, chacun une part par onglet. Tous prennent leur part de la même horloge (retard + durée ≤ 220 ms) :
//   `geo`     largeur de l'onglet, encoche et voile, trait du simple      ease-out « sortie », 220 ms
//   `libelle` opacité du libellé déplié (riche)                          ease : entre après 60 ms (× part restante), 160 ms ; sort en 100 ms
//   `icone`   couleur de l'icône (riche), libellé t2 → t1 (simple)       ease, 160 ms
//   `pose`    échelle de l'icône qui arrive (0,82 → 1)                   ease-out « sortie », 220 ms
// Une même part d'onglet en route est `de + (vers − de) × progression` : le libellé qui s'ouvre et celui qui se ferme se croisent
// (celui-ci s'efface en 100 ms, celui-là paraît à 60 ms), la somme des parts de `geo` vaut toujours 1 (l'encoche est toujours quelque
// part). Mouvement réduit : `geo` et `pose` sautent à `vers` au départ (rien ne glisse), `libelle` et `icone` fondent en 120 ms, linéaire.
//
// Les fonctions « worklet » tournent sur le fil UI de Reanimated (une valeur partagée conduit tout) et, telles quelles, dans les tests.

import { courbe } from "../theme/mouvement";
import { tempsOnglets as TEMPS } from "../theme/onglets";

export type Canal = "geo" | "libelle" | "icone" | "pose";

/** Une part par onglet (0 fermé, 1 ouvert ; `pose` : échelle de l'icône), pour chacun des quatre canaux. */
export interface Canaux {
  geo: number[];
  libelle: number[];
  icone: number[];
  pose: number[];
}

/** Une transition : d'où l'on part, où l'on va (le repos de l'onglet actif), la liste d'onglets qu'elle a vue, le mode. */
export interface Course {
  de: Canaux;
  vers: Canaux;
  /** Les valeurs des onglets, jointes : une autre liste pose le nouveau repos sans route. */
  cle: string;
  reduit: boolean;
}

/** Courbe « sortie » des jetons (theme/mouvement.ts) : part vite, se pose doucement. Pour ce qui bouge. */
const SORTIE = courbe.sortie;
/** `ease` de CSS (theme/onglets.ts) : pour ce qui change d'opacité ou de couleur. */
const FONDU = TEMPS.courbeFondu;

/** Cubic-bezier CSS : l'ordonnée de la courbe `c` (x1, y1, x2, y2) pour l'abscisse `x` de 0 à 1. Newton, repli par dichotomie. */
export function bezier(c: readonly number[], x: number): number {
  "worklet";
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * c[0]!;
  const bx = 3 * (c[2]! - c[0]!) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * c[1]!;
  const by = 3 * (c[3]! - c[1]!) - cy;
  const ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const e = ((ax * t + bx) * t + cx) * t - x;
    if (Math.abs(e) < 1e-6) return ((ay * t + by) * t + cy) * t;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(d) < 1e-6) break;
    t -= e / d;
  }
  let a = 0;
  let b = 1;
  t = x;
  for (let i = 0; i < 40; i++) {
    const e = ((ax * t + bx) * t + cx) * t;
    if (Math.abs(e - x) < 1e-6) break;
    if (e < x) a = t;
    else b = t;
    t = (a + b) / 2;
  }
  return ((ay * t + by) * t + cy) * t;
}

const borne = (v: number) => {
  "worklet";
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

/** Le repos : un 1 sous l'onglet `k`, des 0 ailleurs ; l'icône à sa taille. */
export function repos(k: number, n: number): Canaux {
  "worklet";
  const un: number[] = [];
  for (let i = 0; i < n; i++) un.push(i === k ? 1 : 0);
  return { geo: un, libelle: un.slice(), icone: un.slice(), pose: un.map(() => 1) };
}

/** Une course sans route : le repos de `k` pour la liste `cle`. */
export function poser(k: number, n: number, cle: string, reduit = false): Course {
  "worklet";
  return { de: repos(k, n), vers: repos(k, n), cle, reduit };
}

/** Durée de l'horloge d'une course : au bout, tout est posé. */
export function dureeCourse(reduit: boolean): number {
  "worklet";
  return reduit ? TEMPS.reduit : TEMPS.deplace;
}

/**
 * Avancement (0 à 1) d'un canal pour un onglet qui s'ouvre (`entrant`) ou se ferme, à l'instant `ms` de la course. `de` : la part de
 * départ de l'onglet (un libellé déjà à moitié paru ne rattend pas ses 60 ms en entier).
 */
export function progression(canal: Canal, entrant: boolean, ms: number, reduit: boolean, de = 0): number {
  "worklet";
  if (reduit) return canal === "geo" || canal === "pose" ? 1 : borne(ms / TEMPS.reduit);
  switch (canal) {
    case "libelle":
      return entrant
        ? bezier(FONDU, borne((ms - TEMPS.libelleRetard * (1 - de)) / TEMPS.libelle))
        : bezier(FONDU, borne(ms / TEMPS.libelleSort));
    case "icone":
      return bezier(FONDU, borne(ms / TEMPS.icone));
    default:
      return bezier(SORTIE, borne(ms / TEMPS.deplace));
  }
}

function valeur(canal: Canal, de: number, vers: number, ms: number, reduit: boolean): number {
  "worklet";
  if (de === vers) return vers;
  const p = progression(canal, vers > de, ms, reduit, de);
  return p >= 1 ? vers : de + (vers - de) * p;
}

function canalA(canal: Canal, de: readonly number[], vers: readonly number[], ms: number, reduit: boolean): number[] {
  "worklet";
  const sortie: number[] = [];
  for (let i = 0; i < vers.length; i++) sortie.push(valeur(canal, de[i] ?? vers[i]!, vers[i]!, ms, reduit));
  return sortie;
}

/** Ce qui s'affiche à l'instant `ms` de la course : fonction pure de `(course, ms)`, rien d'autre. */
export function canaux(c: Course, ms: number): Canaux {
  "worklet";
  return {
    geo: canalA("geo", c.de.geo, c.vers.geo, ms, c.reduit),
    libelle: canalA("libelle", c.de.libelle, c.vers.libelle, ms, c.reduit),
    icone: canalA("icone", c.de.icone, c.vers.icone, ms, c.reduit),
    pose: canalA("pose", c.de.pose, c.vers.pose, ms, c.reduit),
  };
}

/** La course est-elle déjà posée ? (Aucune part ne bouge : inutile de lancer l'horloge.) */
export function immobile(c: Course): boolean {
  "worklet";
  const noms: Canal[] = ["geo", "libelle", "icone", "pose"];
  for (let j = 0; j < noms.length; j++) {
    const de = c.de[noms[j]!];
    const vers = c.vers[noms[j]!];
    for (let i = 0; i < vers.length; i++) if (de[i] !== vers[i]) return false;
  }
  return true;
}

/** Sous ce seuil de `geo`, l'onglet est fermé : s'il s'ouvre, son icône se pose (0,82 → 1). */
const FERME = 0.02;

/**
 * La course vers l'onglet `k` d'une liste de `n` onglets (`cle`), lancée à l'instant `ms` de la course `c` : elle part de ce qui est
 * affiché, canal par canal, et l'horloge repart de 0. Une autre liste (valeurs ou nombre d'onglets) ou pas de course : le repos de `k`,
 * posé sans route. Même onglet : la course continue vers le même repos (rien ne saute).
 */
export function reprise(c: Course | null, ms: number, { k, n, cle, reduit }: { k: number; n: number; cle: string; reduit: boolean }): Course {
  "worklet";
  if (!c || c.cle !== cle || c.vers.geo.length !== n) return poser(k, n, cle, reduit);
  const maintenant = canaux(c, ms);
  const pose = maintenant.pose.slice();
  if (!reduit && (maintenant.geo[k] ?? 0) < FERME) pose[k] = TEMPS.poseDepart;
  return { de: { geo: maintenant.geo, libelle: maintenant.libelle, icone: maintenant.icone, pose }, vers: repos(k, n), cle, reduit };
}

/** Encoche (ou trait) : bords gauche et droit de l'onglet actif, moyenne des onglets pondérée par leur part de `geo` (leur somme vaut 1). */
export function encoche(g: { x: readonly number[]; largeurs: readonly number[] }, poids: readonly number[]): { x0: number; x1: number } {
  "worklet";
  let somme = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < poids.length; i++) {
    const p = poids[i] ?? 0;
    somme += p;
    a += p * (g.x[i] ?? 0);
    b += p * ((g.x[i] ?? 0) + (g.largeurs[i] ?? 0));
  }
  return somme > 0 ? { x0: a / somme, x1: b / somme } : { x0: 0, x1: 0 };
}

// ——— Panneaux : le contenu suit le doigt ———

/**
 * Déplacement du panneau (dp) pour un doigt qui a parcouru `dx` : la moitié de la course, avec une butée douce qui ne dépasse jamais
 * `suiviMax` ; sans voisin dans ce sens (bord de la liste), presque rien (`suiviBord`) : la main sent qu'il n'y a rien derrière.
 */
export function suiviGlisse(dx: number, voisin: boolean): number {
  "worklet";
  const x = dx * (voisin ? TEMPS.suivi : TEMPS.suiviBord);
  const m = TEMPS.suiviMax;
  return (m * x) / (m + Math.abs(x));
}

/** Opacité du panneau déplacé de `x` dp : 1 au repos, `suiviOpacite` à la butée. */
export function opaciteGlisse(x: number): number {
  "worklet";
  return 1 - (1 - TEMPS.suiviOpacite) * Math.min(1, Math.abs(x) / TEMPS.suiviMax);
}
