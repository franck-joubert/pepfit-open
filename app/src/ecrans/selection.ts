// Retour du choix d'exercice vers l'écran appelant (routine ou séance), sans passer d'objet dans l'URL.
import type { TypeProgramme } from "../db/programmes";

let attente: ((ids: string[]) => void) | null = null;
let deja: string[] = [];
let aCocher: string[] = [];

// Sport d'une séance libre (Musculation, cross training), retenu au départ : le choix d'exercices s'ouvre filtré sur lui.
const sportsLibres = new Map<string, TypeProgramme>();

export function retenirSportSeance(seanceId: string, type: TypeProgramme): void {
  sportsLibres.set(seanceId, type);
}

export function sportSeanceLibre(seanceId: string): TypeProgramme | null {
  return sportsLibres.get(seanceId) ?? null;
}

export function demanderExercices(dejaPresents: string[], cb: (ids: string[]) => void) {
  deja = dejaPresents;
  attente = cb;
}

export function exercicesDejaPresents(): string[] {
  return deja;
}

export function rendreExercices(ids: string[]) {
  const cb = attente;
  attente = null;
  deja = [];
  aCocher = [];
  cb?.(ids);
}

/** Page d'un exercice ouverte depuis la liste de choix : coche l'exercice, la liste le lit à son retour. */
export function demanderCochage(id: string) {
  aCocher = [...aCocher, id];
}

export function prendreCochages(): string[] {
  const ids = aCocher;
  aCocher = [];
  return ids;
}

/** Ajoute les ids à la sélection sans doublon ni exercice déjà présent ; renvoie la même liste s'il n'y a rien de neuf. */
export function cocher(choisis: string[], ids: string[], dejaPresents: ReadonlySet<string>): string[] {
  const neufs = ids.filter((id, i) => !choisis.includes(id) && !dejaPresents.has(id) && ids.indexOf(id) === i);
  return neufs.length ? [...choisis, ...neufs] : choisis;
}

// Choix unique (« Fusionner avec… ») : l'exercice choisi revient à l'écran appelant, la liste se referme.
let attenteUnique: ((id: string) => void) | null = null;

export function demanderUnExercice(cb: (id: string) => void) {
  attenteUnique = cb;
}

export function rendreUnExercice(id: string) {
  const cb = attenteUnique;
  attenteUnique = null;
  cb?.(id);
}

// « Remplacer l'exercice » : le choix revient avec les options de la feuille (séries gardées, routine) à l'écran appelant.
export interface ContexteRemplacement {
  nom: string;
  dejaPresents: string[];
  nbValidees: number;
  routineNom: string | null;
}
export interface ChoixRemplacement {
  garderSeries: boolean;
  routine: boolean;
}

let remplacement: { ctx: ContexteRemplacement; cb: (id: string, choix: ChoixRemplacement) => void } | null = null;

export function demanderRemplacement(ctx: ContexteRemplacement, cb: (id: string, choix: ChoixRemplacement) => void) {
  remplacement = { ctx, cb };
}

export function contexteRemplacement(): ContexteRemplacement | null {
  return remplacement?.ctx ?? null;
}

export function rendreRemplacement(id: string, choix: ChoixRemplacement) {
  const cb = remplacement?.cb;
  remplacement = null;
  cb?.(id, choix);
}
