import { lireActif } from "../i18n/index";
import { normaliser } from "./normaliser";

/**
 * Expression SQL du nom d'affichage d'un exercice dans la langue active, repli sur l'autre langue si vide. Le catalogue n'a de
 * noms qu'en français et en anglais : l'allemand et l'espagnol lisent l'anglais.
 */
export function nomSql(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  const fr = `NULLIF(TRIM(${p}nom), '')`;
  const en = `NULLIF(TRIM(${p}nom_en), '')`;
  return lireActif().langue !== "fr" ? `COALESCE(${en}, ${p}nom)` : `COALESCE(${fr}, ${p}nom_en, ${p}nom)`;
}

/** Nom d'affichage d'un exercice déjà lu (mêmes règles que `nomSql`). */
export function nomAffiche(e: { nom: string; nom_en: string | null }): string {
  const fr = e.nom.trim();
  const en = (e.nom_en ?? "").trim();
  return lireActif().langue !== "fr" ? en || e.nom : fr || en || e.nom;
}

const MOTS_EN = new Set(
  `press curl curls row rows raise raises fly flye flyes pulldown pulldowns pullover pushdown lunge lunges deadlift dumbbell dumbbells barbell cable
  with the and to of on over bench incline decline seated standing lying grip close wide reverse one arm leg back side lateral front rear shoulder
  bicep bicep tricep chest calf calves hip glute glutes hamstring pull push kickback kickbacks twist sit stretch jump walk bar rope
  band bands swing clean snatch jerk lat lats upright hang hanging single double alternating alternate overhead bent straight stiff bridge thrust
  step crossover kneeling hammer flat narrow weighted assisted pushup pushups pullup pullups chin handle low high`
    .split(/\s+/)
    .filter(Boolean),
);
const MOTS_FR = new Set(
  `développé développe couché couche tirage traction tractions élévation écarté écartés écarte écartes haltère haltères barre poulie assis debout
  allongé incliné décliné prise serrée serré jambe jambes bras épaule épaules mollets fessiers dos pectoraux soulevé terre fente fentes presse
  cuisses pompes gainage étirement planche avant arrière militaire nuque poignet avec de du la le les au aux un une sur et en poids corps croisé
  marteau pupitre banc saut relevé buste roue abdominale sans oiseau papillon mollet hanche latéral latérale visage menton`
    .split(/\s+/)
    .filter(Boolean),
);

/** Indices de langue d'un nom : mots propres à l'anglais, mots propres au français (les accents comptent). */
export function indicesLangue(nom: string): { fr: number; en: number } {
  let fr = 0;
  let en = 0;
  for (const m of nom.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (MOTS_FR.has(m)) fr++;
    else if (MOTS_EN.has(m)) en++;
  }
  if (/[àâäçéèêëîïôöùûüœ]/i.test(nom)) fr++;
  return { fr, en };
}

/** Langue probable d'un nom d'exercice (heuristique à listes de mots) : null quand rien ne permet de trancher. */
export function langueProbable(nom: string): "fr" | "en" | null {
  const { fr, en } = indicesLangue(nom);
  return en > fr ? "en" : fr > en ? "fr" : null;
}
