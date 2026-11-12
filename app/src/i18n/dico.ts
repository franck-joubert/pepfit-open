// Forme des dictionnaires : une chaîne, ou {one, other} pour un pluriel (voir tp()).
export type Pluriel = { one: string; other: string };
export type Entree = string | Pluriel;
export type Dico = Record<string, Entree>;
