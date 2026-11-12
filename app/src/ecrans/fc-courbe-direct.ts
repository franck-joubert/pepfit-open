// Courbe des 5 dernières minutes de la bande de séance (31/10 : « voir que ça marche bien, sans coupure ») : la FC du
// tampon de la bande ramenée à la fenêtre, coupée à chaque silence de plus de TROU_S (un trou dans la ligne, jamais une
// droite qui relie), les trous à montrer, le minimum et le maximum. Sans React Native (tests/fc-courbe-direct.test.ts).
import { TROU_S, type Echantillon } from "./fc-muscu-vue";
import { serieCourbeFc, type PointCourbeFc } from "./fc-trous";

/** Fenêtre de la courbe : le tampon de la bande garde déjà 5 min. */
export const FENETRE_DIRECT_MS = 5 * 60_000;
/** Points dessinés au plus (300 mesures à 1 Hz : une sur deux, pics gardés). */
export const POINTS_DIRECT = 150;
/** Sous 25 bpm, ce n'est pas une FC (un 0 : contact perdu, docs/FC-BASSE.md) : c'est un trou. */
const BPM_MIN = 25;

export interface CourbeDirecte {
  /** Points, temps `s` en secondes depuis le début de la fenêtre (0 à finS) ; `coupe` : la ligne reprend après un trou. */
  serie: PointCourbeFc[];
  /** Silences de plus de TROU_S dans la fenêtre (s), le dernier jusqu'à maintenant si la FC est perdue. */
  trous: { a: number; b: number }[];
  min: PointCourbeFc | null;
  max: PointCourbeFc | null;
  finS: number;
}

export function courbeDirecte(fc: readonly Echantillon[], maintenant: number, fenetreMs = FENETRE_DIRECT_MS): CourbeDirecte {
  const debut = maintenant - fenetreMs;
  const l = fc.filter((f) => f.t >= debut && f.t <= maintenant && f.bpm >= BPM_MIN).map((f) => ({ s: f.t - debut, bpm: f.bpm }));
  const serie = serieCourbeFc(l, POINTS_DIRECT, TROU_S);
  const trous: { a: number; b: number }[] = [];
  for (let i = 1; i < l.length; i++) if (l[i]!.s - l[i - 1]!.s > TROU_S * 1000) trous.push({ a: l[i - 1]!.s / 1000, b: l[i]!.s / 1000 });
  const dernier = l.at(-1);
  if (dernier && fenetreMs - dernier.s > TROU_S * 1000) trous.push({ a: dernier.s / 1000, b: fenetreMs / 1000 });
  let min: PointCourbeFc | null = null;
  let max: PointCourbeFc | null = null;
  for (const p of serie) {
    if (!min || p.bpm < min.bpm) min = p;
    if (!max || p.bpm > max.bpm) max = p;
  }
  return { serie, trous, min, max, finS: fenetreMs / 1000 };
}
