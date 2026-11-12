// Programmes typés (planche idee-programmes, validée le 28/10, NOTES § 2 et § 3). Une routine devient un programme d'un
// type : le type ne change que les mots, le nom proposé, les formats affichés et l'ordre du catalogue ; il ne verrouille rien
// (D4). Les noms internes restent `routine*` (D1) : seule la colonne `routines.type` (migration 30) est nouvelle. Pur (sans
// React Native) : testé par tests/programmes.test.ts.
import type { CleSimple } from "../i18n/fr";

/** Type d'un programme (colonne `routines.type`, texte libre en base : un type inconnu se lit comme « autre »). */
export type TypeProgramme = "muscu" | "cross" | "course" | "velo" | "natation" | "mobilite" | "autre";
/** Ordre par défaut des sections de la sous-page Programmes et des tuiles de la feuille « Nouveau programme ». */
export const TYPES: readonly TypeProgramme[] = ["muscu", "cross", "course", "velo", "natation", "mobilite", "autre"];
/** Les six tuiles de la feuille « Nouveau programme » ; « autre » est la ligne « Autre sport ». */
export const TUILES: readonly TypeProgramme[] = ["muscu", "cross", "course", "velo", "natation", "mobilite"];

export const lireType = (v: string | null | undefined): TypeProgramme => (TYPES as readonly string[]).includes(v ?? "") ? (v as TypeProgramme) : "autre";

/** Formats du cross training (NOTES § 2) ; Tabata = EMOM 20 s / 10 s, pas un format à part. */
export type FormatWod = "amrap" | "emom" | "fortime" | "rounds";
export const FORMATS: readonly FormatWod[] = ["amrap", "emom", "fortime", "rounds"];
export const lireFormat = (v: string | null | undefined): FormatWod | null => ((FORMATS as readonly string[]).includes(v ?? "") ? (v as FormatWod) : null);
/** Valeur d'un format qui vient d'être choisi : durée en s (AMRAP, EMOM, plafond du For time) ou nombre de rounds. */
export const VALEUR_DEFAUT: Record<FormatWod, number> = { amrap: 12 * 60, emom: 10 * 60, fortime: 20 * 60, rounds: 5 };
/** Les rounds se comptent ; les autres formats se règlent en minutes. */
export const formatEnRounds = (f: FormatWod) => f === "rounds";

/** Vignette d'un type (pictos de l'appli, les mêmes que les tuiles de sports). */
export const PICTO_TYPE: Record<TypeProgramme, string | null> = {
  muscu: "couche",
  cross: "kettlebell-swing",
  course: "course",
  velo: "bicycling",
  natation: "natation",
  mobilite: "yoga",
  autre: null,
};

/** Les mots d'un type (NOTES § 2, D2 et D3). Clés de i18n : le texte suit la langue. */
export interface Vocabulaire {
  /** Nom du type : « Musculation », « Cross training »… (en-tête de section, tuile). */
  type: CleSimple;
  /** Le modèle : « Programme », « WOD », « Séance », « Enchaînement » (titre de l'éditeur, sous-titre de tuile). */
  modele: CleSimple;
  /** Nom proposé à la création : « Nouveau WOD »… */
  nomDefaut: CleSimple;
  /** Titre du catalogue ouvert depuis l'éditeur : « Ajouter au WOD ». */
  ajouterAu: CleSimple;
  /** Le contenu : « Exercices », « Mouvements », « Postures ». */
  contenu: CleSimple;
  /** « Ajouter un exercice », « Ajouter un mouvement »… */
  ajouterContenu: CleSimple;
  /** Bouton d'une carte : « Démarrer la séance », « Démarrer le WOD », « Démarrer ». */
  demarrer: CleSimple;
  /** Feuille d'un sport : titre de la liste (« WOD »), dernière ligne (« Tous les WOD ») et séance sans modèle (« WOD libre »). */
  liste: CleSimple;
  tous: CleSimple;
  libre: CleSimple;
}

const vocab = (type: TypeProgramme, modele: string, demarrer: string): Vocabulaire => ({
  type: `programmes.type.${type}` as CleSimple,
  modele: `programmes.modele.${modele}` as CleSimple,
  nomDefaut: `programmes.nomDefaut.${type}` as CleSimple,
  ajouterAu: `programmes.ajouterAu.${modele}` as CleSimple,
  contenu: `programmes.contenu.${type}` as CleSimple,
  ajouterContenu: `programmes.ajouterContenu.${type}` as CleSimple,
  demarrer: `programmes.demarrer.${demarrer}` as CleSimple,
  liste: `programmes.liste.${modele}` as CleSimple,
  tous: `programmes.tous.${modele}` as CleSimple,
  libre: `programmes.libre.${modele}` as CleSimple,
});

const VOCABULAIRE: Record<TypeProgramme, Vocabulaire> = {
  muscu: vocab("muscu", "programme", "seance"),
  cross: vocab("cross", "wod", "wod"),
  course: vocab("course", "seance", "court"),
  velo: vocab("velo", "seance", "court"),
  natation: vocab("natation", "seance", "court"),
  mobilite: vocab("mobilite", "enchainement", "court"),
  autre: vocab("autre", "programme", "seance"),
};
export const vocabulaire = (type: TypeProgramme): Vocabulaire => VOCABULAIRE[type];

/** Type de programme d'un sport du lanceur (`cat:<slug>`), null s'il n'en a pas (padel, randonnée…). */
const TYPE_DE_SPORT: Record<string, TypeProgramme> = {
  "cat:musculation": "muscu",
  "cat:cross-training": "cross",
  "cat:hiit": "cross",
  "cat:course": "course",
  "cat:bicycling": "velo",
  "cat:natation": "natation",
  "cat:yoga": "mobilite",
  "cat:pilates": "mobilite",
};
export const typeDeSport = (sportId: string | null | undefined): TypeProgramme | null => (sportId ? (TYPE_DE_SPORT[sportId] ?? null) : null);

/** Sport (« cat:course ») que dit le type d'un programme : course, vélo, natation seulement (muscu, cross et mobilité n'en nomment pas un). */
const SPORT_DU_TYPE: Partial<Record<TypeProgramme, string>> = { course: "cat:course", velo: "cat:bicycling", natation: "cat:natation" };
export const sportDeType = (type: string | null | undefined): string | null => SPORT_DU_TYPE[lireType(type)] ?? null;

// ---------------------------------------------------------------- catalogue (NOTES § 3)

/** Puces du catalogue : « Tout » (null) puis ces groupes. Un exercice peut appartenir à plusieurs. */
export type GroupeCatalogue = "cross" | "muscu" | "cardio" | "mobilite" | "sports";
export const GROUPES: readonly GroupeCatalogue[] = ["cross", "muscu", "cardio", "mobilite", "sports"];

/** Groupe mis en tête du catalogue ouvert depuis un programme de ce type ; null : ordre alphabétique seul. */
export const GROUPE_DU_TYPE: Record<TypeProgramme, GroupeCatalogue | null> = {
  muscu: "muscu",
  cross: "cross",
  course: "cardio",
  velo: "cardio",
  natation: "sports",
  mobilite: "mobilite",
  autre: null,
};

// Appartenance : une liste de slugs par groupe, avec repli sur les catégories du catalogue (choix fait seul : le plus simple).
// Versionnée avec le code plutôt que dans assets/catalogue (aucun chargement à part, testée ici).
const CATEGORIES: Record<GroupeCatalogue, readonly string[]> = {
  muscu: ["Force", "Force athlétique"],
  cross: ["Haltérophilie", "Pliométrie", "Strongman"],
  cardio: ["Cardio"],
  mobilite: ["Étirement", "Bien-être"],
  sports: ["Sport collectif", "Sport nautique", "Sport de raquette", "Sport de combat", "Montagne", "Loisirs", "Fitness"],
};
const SLUGS: Record<GroupeCatalogue, readonly string[]> = {
  muscu: [],
  // Les mouvements de WOD absents du catalogue (burpee, wall ball, toes-to-bar…, D5) s'ajouteront ici avec lui.
  cross: ["rope-jumping", "assault-bike", "rowing-stationary", "muscle-up", "kipping-muscle-up", "pullups", "chin-up", "sit-up"],
  cardio: [],
  mobilite: ["pilates"],
  sports: [],
};
/** Matériel qui range un exercice en cross training (le kettlebell est le matériel du WOD). */
const EQUIPEMENTS_CROSS = new Set(["kettlebell"]);

export type ExerciceGroupe = { slug: string | null; categorie: string | null; equipement?: string | null; perso?: number };

export function dansGroupe(e: ExerciceGroupe, g: GroupeCatalogue): boolean {
  if (e.slug && SLUGS[g].includes(e.slug)) return true;
  if (e.categorie && CATEGORIES[g].includes(e.categorie)) return true;
  if (g === "cross" && e.equipement && EQUIPEMENTS_CROSS.has(e.equipement)) return true;
  // Exercice perso sans catégorie : de la musculation, comme pour le sport d'une séance (db/sports.ts).
  return g === "muscu" && !e.categorie && e.perso === 1;
}

/**
 * Filtre posé à l'ouverture du choix d'exercices depuis une routine ou une séance libre d'un sport (retours du
 * 30/10) : le groupe du sport, s'il a des exercices dans la liste lue ; sinon aucun. « Tout » le retire.
 */
export function groupeParDefaut(type: TypeProgramme | null, liste: readonly ExerciceGroupe[]): GroupeCatalogue | null {
  const g = type ? GROUPE_DU_TYPE[type] : null;
  return g && liste.some((e) => dansGroupe(e, g)) ? g : null;
}

/** Une section du catalogue : en-tête (clé de i18n, ou le nom d'un groupe) et ses exercices, dans l'ordre reçu. */
export type SectionCatalogue<E> = { titre: CleSimple; exercices: E[] };

/**
 * Le catalogue en sections, à partir de la liste filtrée et triée par la base (ordre alphabétique) :
 * - une puce choisie (`filtre`) : ce groupe seul ;
 * - sinon, avec un groupe en tête (`tete`, celui du type du programme) : ce groupe, puis « Tous les exercices » (tout, le
 *   groupe compris), ou en recherche « Autres » (le reste) ;
 * - sinon : une section, « Tous les exercices » (ou « Résultats » en recherche).
 * Rien n'est masqué tant qu'aucune puce n'est choisie.
 */
export function sectionsCatalogue<E extends ExerciceGroupe>(
  liste: E[],
  o: { tete: GroupeCatalogue | null; filtre: GroupeCatalogue | null; recherche: boolean },
): SectionCatalogue<E>[] {
  if (o.filtre) {
    const g = o.filtre;
    return [{ titre: `programmes.groupe.${g}` as CleSimple, exercices: liste.filter((e) => dansGroupe(e, g)) }];
  }
  const tous: CleSimple = o.recherche ? "exercices.choix.resultats" : "exercices.choix.tous";
  if (!o.tete) return [{ titre: tous, exercices: liste }];
  const g = o.tete;
  const dedans = liste.filter((e) => dansGroupe(e, g));
  const sections: SectionCatalogue<E>[] = [];
  if (dedans.length) sections.push({ titre: `programmes.groupe.${g}` as CleSimple, exercices: dedans });
  if (o.recherche) {
    const autres = liste.filter((e) => !dansGroupe(e, g));
    if (autres.length || !dedans.length) sections.push({ titre: "programmes.autres", exercices: autres });
  } else sections.push({ titre: tous, exercices: liste });
  return sections;
}

// ---------------------------------------------------------------- sous-page Programmes

/** Programmes rangés par type, dans l'ordre des types (`ordre`, puis l'ordre par défaut) ; les types vides n'apparaissent pas. */
export function grouperParType<R extends { type: TypeProgramme }>(routines: R[], ordre: readonly TypeProgramme[] = TYPES): { type: TypeProgramme; routines: R[] }[] {
  return ordreTypes(ordre)
    .map((type) => ({ type, routines: routines.filter((r) => r.type === type) }))
    .filter((g) => g.routines.length > 0);
}

/** Ordre des types : celui enregistré (types connus, sans doublon), puis les types manquants dans l'ordre par défaut. */
export function ordreTypes(lu: readonly string[]): TypeProgramme[] {
  const out: TypeProgramme[] = [];
  for (const x of lu) if ((TYPES as readonly string[]).includes(x) && !out.includes(x as TypeProgramme)) out.push(x as TypeProgramme);
  for (const x of TYPES) if (!out.includes(x)) out.push(x);
  return out;
}
