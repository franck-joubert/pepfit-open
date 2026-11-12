// Natures d'exercice (D7), équipements, mesures de fiche (D11) et règles de changement de nature (D10).
import { locale, t, type CleSimple } from "../i18n/index";

export const NATURES = ["poids_reps", "reps", "leste", "assiste", "duree", "duree_poids", "distance_duree", "poids_distance"] as const;
export type Nature = (typeof NATURES)[number];

export const EQUIPEMENTS = [
  "poids_du_corps", "barre", "halteres", "kettlebell", "machine", "poulie", "smith", "barre_fixe", "elastique", "cardio", "disque", "autre",
] as const;
export type Equipement = (typeof EQUIPEMENTS)[number];

export const ALLURES = ["500m", "km", "kmh"] as const;
export type Allure = (typeof ALLURES)[number];

/** Libellés évalués à la lecture (getters) : ils suivent la langue active. */
function libelles<K extends string>(cles: readonly K[], cle: (k: K) => CleSimple): Record<K, string> {
  const o = {} as Record<K, string>;
  for (const k of cles) Object.defineProperty(o, k, { get: () => t(cle(k)), enumerable: true });
  return o;
}

export const LIBELLE_EQUIPEMENT = libelles(EQUIPEMENTS, (e) => `exercices.equipement.${e}` as CleSimple);

export const LIBELLE_ALLURE = libelles(ALLURES, (a) => `exercices.allure.${a}` as CleSimple);

const CLE_MUSCLE: Record<string, string> = {
  "Abdominaux": "abdominaux", "Abducteurs": "abducteurs", "Adducteurs": "adducteurs", "Avant-bras": "avantBras", "Biceps": "biceps", "Cou": "cou",
  "Épaules": "epaules", "Fessiers": "fessiers", "Grand dorsal": "grandDorsal", "Ischio-jambiers": "ischios", "Lombaires": "lombaires",
  "Milieu du dos": "milieuDos", "Mollets": "mollets", "Pectoraux": "pectoraux", "Quadriceps": "quadriceps", "Trapèzes": "trapezes", "Triceps": "triceps",
};

/** Nom affiché d'un muscle stocké (la valeur en base reste le nom français du catalogue). */
export function libelleMuscle(muscle: string): string {
  const c = CLE_MUSCLE[muscle];
  return c ? t(`exercices.muscle.${c}` as CleSimple) : muscle;
}

/** Colonne de saisie d'une série : champ stocké et étiquette affichée au-dessus. */
export type ChampSerie = "kg" | "reps" | "duree_s" | "distance_m";
export interface Colonne {
  champ: ChampSerie;
  etiquette: string;
}

export type Famille = "charge" | "poids_du_corps" | "temps";

export type MesureFiche = "charge" | "e1rm" | "volume" | "reps" | "reps_total" | "charge_eff" | "duree" | "distance" | "allure";

export interface InfoNature {
  libelle: string;
  famille: Famille;
  exemple: string;
  colonnes: Colonne[];
  /** Mesures proposées dans le segmenté de la fiche ; la première est celle par défaut (D11). */
  mesures: MesureFiche[];
  /** Le poids du sportif entre dans la charge effective (D8). */
  poidsCorps: boolean;
}

const structure: Record<Nature, { famille: Famille; champs: ChampSerie[]; mesures: MesureFiche[]; poidsCorps: boolean }> = {
  poids_reps: { famille: "charge", champs: ["kg", "reps"], mesures: ["e1rm", "charge", "volume"], poidsCorps: false },
  reps: { famille: "poids_du_corps", champs: ["reps"], mesures: ["reps", "reps_total", "charge_eff"], poidsCorps: true },
  leste: { famille: "poids_du_corps", champs: ["kg", "reps"], mesures: ["e1rm", "charge", "charge_eff", "volume"], poidsCorps: true },
  assiste: { famille: "poids_du_corps", champs: ["kg", "reps"], mesures: ["charge_eff", "reps", "volume"], poidsCorps: true },
  duree: { famille: "temps", champs: ["duree_s"], mesures: ["duree"], poidsCorps: false },
  duree_poids: { famille: "temps", champs: ["kg", "duree_s"], mesures: ["duree", "charge"], poidsCorps: false },
  distance_duree: { famille: "temps", champs: ["distance_m", "duree_s"], mesures: ["allure", "distance", "duree"], poidsCorps: false },
  poids_distance: { famille: "charge", champs: ["kg", "distance_m"], mesures: ["charge", "distance"], poidsCorps: false },
};

function etiquette(n: Nature, champ: ChampSerie): string {
  if (champ === "kg") return n === "leste" ? "+kg" : n === "assiste" ? "−kg" : "kg";
  if (champ === "distance_m") return "m";
  return t(champ === "reps" ? "exercices.colonne.reps" : "exercices.colonne.temps");
}

/** Libellé, exemple et étiquettes de colonnes sont évalués à la lecture : ils suivent la langue active. */
export const INFO_NATURE = Object.fromEntries(
  NATURES.map((n) => [
    n,
    {
      get libelle() { return t(`exercices.nature.${n}.libelle` as CleSimple); },
      get exemple() { return t(`exercices.nature.${n}.exemple` as CleSimple); },
      get colonnes(): Colonne[] { return structure[n].champs.map((champ) => ({ champ, etiquette: etiquette(n, champ) })); },
      famille: structure[n].famille,
      mesures: structure[n].mesures,
      poidsCorps: structure[n].poidsCorps,
    },
  ]),
) as Record<Nature, InfoNature>;

/** Effort qui se mesure au temps (durée, durée et charge, distance et durée) : sa cible est un temps, pas des répétitions. */
export const auTemps = (n: Nature): boolean => structure[n].famille === "temps";

export function estNature(v: unknown): v is Nature {
  return typeof v === "string" && (NATURES as readonly string[]).includes(v);
}

/**
 * Postes et cardio d'un lieu (planche materiel, D18 et D21) : des clés fines, cochées dans `salle.postes`, chacune reliée à
 * l'équipement des exercices qu'elle rend faisables (cardio, barre fixe, élastique ; le reste : « autre »). Poids du corps n'est
 * plus à cocher : il est toujours là.
 */
export const CARDIO_LIEU = ["tapis", "velo", "rameur", "elliptique", "air_bike", "skierg", "escalier"] as const;
export const POSTES_LIEU = {
  bancs: ["banc_plat", "banc_inclinable", "rack", "cage", "barre_traction", "barres_paralleles"],
  accessoires: ["elastiques", "trx", "tapis_sol", "swiss_ball", "box", "corde", "roue"],
} as const;
export type CardioLieu = (typeof CARDIO_LIEU)[number];
export type PosteLieu = CardioLieu | (typeof POSTES_LIEU)["bancs"][number] | (typeof POSTES_LIEU)["accessoires"][number];
export const TOUS_POSTES_LIEU: readonly PosteLieu[] = [...CARDIO_LIEU, ...POSTES_LIEU.bancs, ...POSTES_LIEU.accessoires];
export const estPosteLieu = (v: unknown): v is PosteLieu => (TOUS_POSTES_LIEU as readonly unknown[]).includes(v);
export const estCardioLieu = (v: unknown): v is CardioLieu => (CARDIO_LIEU as readonly unknown[]).includes(v);

/** Équipement des exercices qu'un poste ou un appareil de cardio rend faisables. */
export function equipementDuPoste(p: PosteLieu): Equipement {
  if (estCardioLieu(p)) return "cardio";
  if (p === "barre_traction") return "barre_fixe";
  if (p === "elastiques") return "elastique";
  return "autre";
}

export const libellePoste = (p: PosteLieu): string => t(`materiel.poste.${p}` as CleSimple);

export function estEquipement(v: unknown): v is Equipement {
  return typeof v === "string" && (EQUIPEMENTS as readonly string[]).includes(v);
}

/** Allure proposée par défaut selon l'exercice (D11) : rameur /500 m, vélo et VTT km/h, sinon /km. */
export function allureParDefaut(slug?: string | null): Allure {
  if (slug && /row/.test(slug)) return "500m";
  if (slug && /bicycl|bike|cycl|velo|vtt/.test(slug)) return "kmh";
  return "km";
}

/** Texte de l'allure pour `secParKm` secondes par kilomètre. */
export function formaterAllure(secParKm: number, allure: Allure): string {
  if (allure === "kmh") return `${new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(3600 / secParKm)} km/h`;
  const s = Math.round(allure === "500m" ? secParKm / 2 : secParKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} ${LIBELLE_ALLURE[allure]}`;
}

/** Allure en secondes par kilomètre, ou null sans distance ni durée. */
export function allureSecParKm(distanceM: number | null, dureeS: number | null): number | null {
  if (!distanceM || !dureeS || distanceM <= 0 || dureeS <= 0) return null;
  return (dureeS * 1000) / distanceM;
}

/** Muscles dont les exercices ne soulèvent pas le corps : un crunch ne déplace pas 78 kg, pas de charge effective. */
const SANS_CHARGE_CORPS = new Set(["Abdominaux", "Lombaires", "Cou"]);

/** Vrai si la charge effective (D8) compte le poids du corps pour cet exercice. */
export function compteLePoidsDuCorps(nature: Nature, muscle: string | null | undefined): boolean {
  return INFO_NATURE[nature].poidsCorps && !SANS_CHARGE_CORPS.has(muscle ?? "");
}

/** Mesures de la fiche d'un exercice : « Charge effective » retirée quand le poids du corps ne compte pas. */
export function mesuresExercice(nature: Nature, muscle: string | null | undefined): MesureFiche[] {
  return INFO_NATURE[nature].mesures.filter((m) => m !== "charge_eff" || compteLePoidsDuCorps(nature, muscle));
}

/** Nature des exercices du catalogue connus de Hevy (types `bodyweight_reps`, `duration`…), par slug. */
export const NATURE_PAR_SLUG: Readonly<Record<string, Nature>> = {
  pullups: "leste",
  "chin-up": "leste",
  "dips-triceps-version": "leste",
  pushups: "reps",
  "ab-roller": "reps",
  crunches: "reps",
  "hanging-leg-raise": "reps",
  "bodyweight-squat": "reps",
  plank: "duree",
};

/** Nature par défaut d'une entrée du catalogue. */
export function natureDuCatalogue(e: { slug: string; categorie: string | null; poids_corps: number; nature?: Nature }): Nature {
  return e.nature ?? natureSansCatalogue(e);
}

/** Nature déduite de la catégorie et du poids du corps, sans la nature imposée par le catalogue. */
export function natureSansCatalogue(e: { slug: string; categorie: string | null; poids_corps: number }): Nature {
  const n = NATURE_PAR_SLUG[e.slug];
  if (n) return n;
  if (e.categorie === "Cardio") return "distance_duree";
  if (e.categorie === "Étirement") return "duree";
  return e.poids_corps ? "reps" : "poids_reps";
}

/** Tractions, suspensions et muscle-ups : tout ce qui se fait à la barre fixe, quel que soit le matériel texte du catalogue. */
const TRACTION = /pull-?ups?|chin-?ups?|chins$|muscle-up|^mixed-grip-chin$|one-handed-hang|^hanging-(leg|pike)/;
/** Dips (barres parallèles, anneaux, banc) : pas d'équipement dédié, au poids du corps. */
const DIPS = /(^|-)dips?($|-)|parallel-bars/;

/** Équipement d'une entrée du catalogue (le matériel texte de free-exercise-db). Mêmes règles que la migration 4. */
export function equipementDuCatalogue(e: { slug: string | null; materiel: string | null; categorie: string | null }): Equipement {
  if (e.categorie === "Cardio") return "cardio";
  const slug = e.slug ?? "";
  if (/smith/.test(slug)) return "smith";
  const m = e.materiel ?? "";
  if (["Poids du corps", "Aucun", "Autre", ""].includes(m)) {
    if (TRACTION.test(slug)) return "barre_fixe";
    if (DIPS.test(slug)) return "poids_du_corps";
  }
  if (slug === "trap-bar-deadlift") return "barre";
  switch (m) {
    case "Barre": case "Barre EZ": return "barre";
    case "Haltère": return "halteres";
    case "Poids du corps": case "Aucun": return "poids_du_corps";
    case "Poulie": return "poulie";
    case "Machine": return "machine";
    case "Kettlebell": return "kettlebell";
    case "Élastique": return "elastique";
    default: return "autre";
  }
}

export interface VerdictNature {
  mode: "en_place" | "variante";
  /** Phrase qui dit ce qui se passe, affichée avant de valider (D10). */
  message: string;
}

const CORPS: Nature[] = ["reps", "leste", "assiste"];

/**
 * Le changement de `de` vers `vers` garde-t-il l'historique intact ? `aDesKg` : une série porte déjà une valeur de kg non nulle.
 * Compatible : réps seules, lesté et assisté entre eux (kg à 0), durée et durée et poids (kg à 0), réps seules vers poids et réps.
 */
export function verdictChangementNature(de: Nature, vers: Nature, aDesKg: boolean): VerdictNature {
  if (de === vers) return { mode: "en_place", message: t("exercices.verdict.rien") };
  const casse = (message: string): VerdictNature => ({ mode: "variante", message });
  if (CORPS.includes(de) && CORPS.includes(vers)) {
    if (de !== "reps" && aDesKg) return casse(t("exercices.verdict.lestAide"));
    return { mode: "en_place", message: t("exercices.verdict.lestAideZero") };
  }
  if (de === "duree" && vers === "duree_poids") return { mode: "en_place", message: t("exercices.verdict.poidsZero") };
  if (de === "duree_poids" && vers === "duree") {
    return aDesKg ? casse(t("exercices.verdict.poidsPerdu")) : { mode: "en_place", message: t("exercices.verdict.tellesQuelles") };
  }
  if (de === "reps" && vers === "poids_reps") return { mode: "en_place", message: t("exercices.verdict.poidsVide") };
  return casse(t("exercices.verdict.sensPerdu"));
}
