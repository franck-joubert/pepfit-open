// La carte en plein écran d'une séance terminée (demande d'Alex, 08/11) : le bloc d'effort pose le tracé qu'il montre, l'écran
// /suivi/carte le reprend. Pur (sans React) : tests/carte-seance.test.ts. Le tracé passe par ce petit magasin plutôt que par les
// paramètres de la route (des centaines de points) ; sans lui (l'appli relancée sur cet écran), l'écran revient à la page.
import { bbox as bboxDe } from "../circuits/geo";
import type { Bbox } from "../circuits/carte";
import type { VueCircuit } from "../circuits/vue";
import type { Jetons } from "../theme/jetons";
import { melange, niveauAlt, type PointTrace, type VueEffort } from "./effort-vue";
import type { ModeEffort } from "./effort-modes";
import { morceauxParZone } from "./suivi-direct-vue";

type Trace = readonly PointTrace[];

export interface TracePosee {
  trace: Trace;
  altitude: VueEffort["altitude"];
  /** Le mode du sélecteur au moment du toucher : le tracé garde ses couleurs en grand. */
  mode: ModeEffort;
  distanceM: number;
  dureeS: number;
}

let posee: TracePosee | null = null;

export function poserTrace(t: TracePosee): void {
  posee = t;
}
export function tracePosee(): TracePosee | null {
  return posee;
}
export function oublierTrace(): void {
  posee = null;
}

/** Points par morceau de l'altitude : comme le tracé animé de la page (BlocEffort, morceauxTrace). */
const PAS_ALTITUDE = 6;

/** Un morceau de même couleur : les points `a` à `b` inclus. */
export interface MorceauCouleur {
  a: number;
  b: number;
  couleur: string;
}

/** Les couleurs du tracé selon le mode (zones de FC, ou altitude en dégradé) : la même règle que `morceauxTrace` de la page. */
export function couleursTrace(trace: Trace, mode: ModeEffort, couleurs: Pick<Jetons, "t3" | "altBas" | "altHaut" | "zone1" | "zone2" | "zone3" | "zone4" | "zone5">, alt: { min: number; max: number } | null): MorceauCouleur[] {
  if (mode === "altitude" && alt) {
    const out: MorceauCouleur[] = [];
    for (let a = 0; a < trace.length - 1; a += PAS_ALTITUDE) {
      const b = Math.min(a + PAS_ALTITUDE, trace.length - 1);
      const h = trace[a]!.alt;
      out.push({ a, b, couleur: h == null ? couleurs.t3 : melange(couleurs.altBas, couleurs.altHaut, niveauAlt(h, alt.min, alt.max)) });
    }
    return out;
  }
  return morceauxParZone(trace.map((p) => p.zone)).map((m) => ({ a: m.debut, b: m.fin, couleur: m.zone ? couleurs[`zone${m.zone}` as "zone1"] : couleurs.t3 }));
}

/** Le tracé d'une séance pour la carte pleine (MapLibre) : un trait par morceau, sa couleur dans `c`. */
export function traceGeoJsonSeance(trace: Trace, morceaux: readonly MorceauCouleur[]) {
  return {
    type: "FeatureCollection" as const,
    features: morceaux.map((m) => ({
      type: "Feature" as const,
      properties: { c: m.couleur },
      geometry: { type: "LineString" as const, coordinates: trace.slice(m.a, m.b + 1).map((p) => [p.lon, p.lat]) },
    })),
  };
}

/** Ce que la carte de repli (sans réseau) et le cadrage lisent : les points, les altitudes, la distance cumulée. */
export function vueDeLaTrace(trace: Trace): { vue: VueCircuit; bbox: Bbox } | null {
  if (trace.length < 2) return null;
  const alts = trace.every((p) => p.alt != null) ? trace.map((p) => p.alt as number) : null;
  const points = trace.map((p) => ({ lat: p.lat, lon: p.lon }));
  const cumul = trace.map((p) => p.d);
  return { vue: { points, alts, cumul, longueurM: cumul[cumul.length - 1]! }, bbox: bboxDe(points) };
}
