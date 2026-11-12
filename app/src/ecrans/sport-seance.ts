// Sport d'une séance, pour l'image en tête de sa page (retour du 02/11 : le « Padel 1 h 30 » lancé depuis une routine
// n'avait pas le picto du padel que la séance détectée du même sport avait). Pur : tests/sport-seance.test.ts.
import { sportDeType } from "../db/programmes";
import type { Activite } from "./changer-activite";

export type SportCatalogue = Activite & { nom_en: string | null };

const norme = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Le sport que dit un nom (« Padel 1 h 30 », « Course à pied ») : l'activité du catalogue dont le nom (français, anglais ou slug)
 * se lit en mots entiers dans ce texte ; le plus long nom l'emporte. Aucun sport ne se déduit d'un mot de moins de 3 lettres.
 */
export function sportDuNom(texte: string | null | undefined, sports: readonly SportCatalogue[]): SportCatalogue | null {
  const mots = ` ${norme(texte ?? "")} `;
  if (mots.trim() === "") return null;
  let meilleur: { sport: SportCatalogue; n: number } | null = null;
  for (const s of sports) {
    for (const nom of [s.nom, s.nom_en, s.slug?.replace(/-/g, " ")]) {
      const n = nom ? norme(nom) : "";
      if (n.length >= 3 && mots.includes(` ${n} `) && (!meilleur || n.length > meilleur.n)) meilleur = { sport: s, n: n.length };
    }
  }
  return meilleur?.sport ?? null;
}

export interface IndicesSport {
  /** Sport posé sur la séance (activité détectée ou importée, « Changer d'activité »). */
  marque: Activite | null;
  /** Premier exercice de la séance qui porte un sport (hors musculation). */
  exercice: Activite | null;
  /** Type de la routine d'où elle vient (course, vélo, natation disent leur sport). */
  typeRoutine: string | null;
  /** Titre de la séance, puis nom de sa routine. */
  noms: readonly (string | null | undefined)[];
}

/**
 * Sport de la séance : sa marque, sinon son exercice de sport, sinon le type de sa routine, sinon son nom. La musculation n'est
 * pas « un sport » ici (une séance de muscu garde son exercice seul en tête, ou rien). `activites` : les sports du catalogue.
 */
export function sportDeLaSeance(i: IndicesSport, activites: readonly SportCatalogue[]): Activite | null {
  if (i.marque) return i.marque;
  if (i.exercice) return i.exercice;
  const duType = sportDeType(i.typeRoutine);
  const trouve = (s: SportCatalogue | null | undefined): Activite | null => (s ? { id: s.id, slug: s.slug, nom: s.nom, categorie: s.categorie } : null);
  const type = trouve(activites.find((a) => a.id === duType));
  if (type) return type;
  for (const n of i.noms) {
    const s = trouve(sportDuNom(n, activites));
    if (s) return s;
  }
  return null;
}
