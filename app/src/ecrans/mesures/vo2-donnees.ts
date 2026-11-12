// VO2max et VMA (planche vma-vo2max, validée le 29/10 ; NOTES-VMA.md) : ce que lisent la page, le bloc de la page Santé et
// la carte de l'Accueil. Les calculs sont purs (vma-calc.ts, zones-fc.ts) ; ici, la lecture de la base. Sans React Native :
// tests/vo2-donnees.test.ts.
import type { Executeur } from "../../db/executeur";
import { lireAge, lireSexe } from "../../db/depots/profil";
import { compterCoursesEstimees, lireEstimationsCourses, lireTestsVma, majEstimationsCourses, type TestVmaLu } from "../../db/depots/vma";
import { lireZonesFc, nuitsFcRepos } from "../../db/depots/zones-fc";
import { lireSuivi } from "../../db/depots/suivi-gps";
import {
  categorieVo2, estimerVma, JOURS_ESTIMATION, percentileVo2, vmaRetenue, vo2maxRetenue, type Categorie, type Portion, type Sexe, type VmaRetenue, type Vo2maxRetenue,
} from "./vma-calc";
import { resoudreFcRepos, type FcReposRetenue, type Zones } from "../zones-fc";

const JOUR = 86_400_000;

export interface PointVo2 {
  date: number;
  vma: number;
  src: "test" | "course";
  /** Distance des 6 min (tests). */
  distanceM: number | null;
  seanceId: string | null;
}

export interface DonneesVo2 {
  vma: VmaRetenue | null;
  /** Meilleure estimation des courses des 90 derniers jours (et sa portion, si on l'a demandée). */
  estimee: { vma: number; date: number; seanceId: string; portion: Portion | null } | null;
  tests: TestVmaLu[];
  /** Courses GPS lues pour l'estimation (90 jours). */
  courses: number;
  vo2: Vo2maxRetenue | null;
  categorie: Categorie | null;
  percentile: number | null;
  age: number | null;
  sexe: Sexe | null;
  zones: Zones;
  fcRepos: FcReposRetenue | null;
  /** Tests et estimations des courses, du plus ancien au plus récent (graphique). */
  historique: PointVo2[];
}

/**
 * Tout l'état VO2max d'aujourd'hui. `detail` : relit le tracé de la meilleure course pour dire sa portion (« tes 10 min les
 * plus rapides : 4'11"/km ») ; la page seulement, les cartes s'en passent.
 */
export async function lireVo2(db: Executeur, { maintenant = Date.now(), detail = false }: { maintenant?: number; detail?: boolean } = {}): Promise<DonneesVo2> {
  const zones = await lireZonesFc(db, maintenant);
  await majEstimationsCourses(db, zones.fcMax.bpm, maintenant);
  const depuis90 = maintenant - JOURS_ESTIMATION * JOUR;
  const [tests, estimations, courses, age, sexe, nuits] = await Promise.all([
    lireTestsVma(db),
    lireEstimationsCourses(db, 0),
    compterCoursesEstimees(db, depuis90),
    lireAge(db, maintenant),
    lireSexe(db),
    nuitsFcRepos(db, maintenant),
  ]);
  const recentes = estimations.filter((e) => e.date >= depuis90 && e.date <= maintenant);
  const meilleure = recentes.reduce<(typeof recentes)[number] | null>((a, e) => (!a || e.vma > a.vma ? e : a), null);
  let portion: Portion | null = null;
  if (detail && meilleure) {
    const s = await lireSuivi(db, meilleure.seanceId);
    portion = s ? (estimerVma([{ id: meilleure.seanceId, date: meilleure.date, points: s.points, fc: s.fc }], zones.fcMax.bpm, meilleure.date)?.portion ?? null) : null;
  }
  const estimee = meilleure ? { ...meilleure, portion } : null;
  const vma = vmaRetenue(tests, estimee, maintenant);
  const fcRepos = resoudreFcRepos(nuits, maintenant);
  const vo2 = vo2maxRetenue(vma, zones.fcMax.bpm, fcRepos?.bpm ?? null, sexe);
  const ageN = age?.age ?? null;
  const historique: PointVo2[] = [
    ...tests.map((t) => ({ date: t.date, vma: t.distanceM / 100, src: "test" as const, distanceM: t.distanceM, seanceId: t.seanceId })),
    ...estimations.map((e) => ({ date: e.date, vma: e.vma, src: "course" as const, distanceM: null, seanceId: e.seanceId })),
  ].sort((a, b) => a.date - b.date);
  return {
    vma,
    estimee,
    tests,
    courses,
    vo2,
    categorie: vo2 ? categorieVo2(vo2.valeur, ageN, sexe) : null,
    percentile: vo2 ? percentileVo2(vo2.valeur, ageN, sexe) : null,
    age: ageN,
    sexe,
    zones,
    fcRepos,
    historique,
  };
}
