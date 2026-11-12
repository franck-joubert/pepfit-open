// Accueil modulable (planche B · Mosaïque, validée le 27/10) : catalogue des blocs, grille dense et opérations du mode
// Modifier. Pur (sans React Native) : testé par tests/accueil-blocs.test.ts.

export type Taille = "pleine" | "demie";
export type IdBloc =
  | "a-suivre" | "seances" | "whoop" | "pas" | "semaine" | "derniere" | "records" | "poids" | "regularite" | "nutrition"
  // pages de mesure (planche pas, 28/10) : chaque carte ouvre sa page de statistiques
  | "sommeil" | "energie" | "recup" | "effort" | "age"
  // VO2max et VMA (planche vma-vo2max, D1)
  | "vo2max";
export type Bloc = { id: IdBloc; taille: Taille };
/** Couleur de l'icône d'en-tête : la partie à plat (décision 8), l'or pour les records. */
export type Teinte = "partieEntrainement" | "partieSante" | "partieNutrition" | "record";

export type DefBloc = {
  id: IdBloc;
  teinte: Teinte;
  icone: "play" | "cal" | "sante" | "pas" | "chart" | "history" | "medal" | "balance" | "repeat" | "nutrition" | "lune" | "energie" | "pouls" | "eclair" | "agePepfit" | "souffle";
  /** Tailles permises ; la première est celle d'un bloc ajouté si la demie n'existe pas. */
  tailles: Taille[];
  bientot?: boolean;
};

/** Dans l'ordre de la feuille d'ajout. */
export const CATALOGUE: DefBloc[] = [
  { id: "a-suivre", teinte: "partieEntrainement", icone: "play", tailles: ["pleine", "demie"] },
  { id: "seances", teinte: "partieEntrainement", icone: "cal", tailles: ["pleine", "demie"] },
  { id: "whoop", teinte: "partieSante", icone: "sante", tailles: ["pleine", "demie"] },
  { id: "pas", teinte: "partieSante", icone: "pas", tailles: ["demie", "pleine"] },
  { id: "semaine", teinte: "partieEntrainement", icone: "chart", tailles: ["demie", "pleine"] },
  { id: "derniere", teinte: "partieEntrainement", icone: "history", tailles: ["pleine", "demie"] },
  { id: "records", teinte: "record", icone: "medal", tailles: ["demie", "pleine"] },
  { id: "poids", teinte: "partieSante", icone: "balance", tailles: ["demie", "pleine"] },
  { id: "regularite", teinte: "partieEntrainement", icone: "repeat", tailles: ["demie", "pleine"] },
  { id: "sommeil", teinte: "partieSante", icone: "lune", tailles: ["demie", "pleine"] },
  { id: "energie", teinte: "partieSante", icone: "energie", tailles: ["demie", "pleine"] },
  { id: "recup", teinte: "partieSante", icone: "pouls", tailles: ["demie"] },
  { id: "effort", teinte: "partieEntrainement", icone: "eclair", tailles: ["demie"] },
  { id: "age", teinte: "partieSante", icone: "agePepfit", tailles: ["demie"] },
  { id: "vo2max", teinte: "partieSante", icone: "souffle", tailles: ["demie", "pleine"] },
  { id: "nutrition", teinte: "partieNutrition", icone: "nutrition", tailles: ["demie"], bientot: true },
];

/**
 * Blocs branchés sur leurs données. Prochaines séances (planning) et Whoop sont codés mais attendent leur source : faux,
 * ils ne s'affichent pas et ne sont pas proposés. Les passer à vrai suffit à les montrer. Pas lit Santé Connect (27/10).
 */
export const BRANCHE: Record<IdBloc, boolean> = {
  "a-suivre": true,
  seances: true,
  whoop: false,
  pas: true,
  semaine: true,
  derniere: true,
  records: true,
  poids: true,
  regularite: true,
  nutrition: false,
  sommeil: true,
  energie: true,
  recup: true,
  effort: true,
  age: true,
  vo2max: true,
};

/** Accueil d'un nouvel utilisateur (le même que la migration 22). */
export const PAR_DEFAUT: Bloc[] = [
  { id: "a-suivre", taille: "pleine" },
  { id: "semaine", taille: "pleine" },
  { id: "pas", taille: "pleine" },
  { id: "derniere", taille: "pleine" },
];

const DEFS = new Map(CATALOGUE.map((d) => [d.id, d]));
export const defBloc = (id: IdBloc): DefBloc => DEFS.get(id)!;

/** Ce qui vient de la base : ids connus, tailles permises, sans doublon. */
export function lireBlocs(lignes: { id: string; taille: string }[]): Bloc[] {
  const vus = new Set<string>();
  const out: Bloc[] = [];
  for (const l of lignes) {
    const d = DEFS.get(l.id as IdBloc);
    if (!d || d.bientot || vus.has(l.id)) continue;
    vus.add(l.id);
    const taille = d.tailles.includes(l.taille as Taille) ? (l.taille as Taille) : d.tailles[0]!;
    out.push({ id: d.id, taille });
  }
  return out;
}

/** Les blocs montrés : branchés seulement. */
export const visibles = (blocs: Bloc[], branche: Record<IdBloc, boolean> = BRANCHE) => blocs.filter((b) => branche[b.id]);

/**
 * Grille dense : un bloc plein prend sa rangée ; un demi est rejoint par le demi suivant, qui passe devant les pleins
 * d'entre eux. Un demi sans partenaire reste seul sur sa rangée, à gauche.
 */
export function grilleDense(blocs: Bloc[]): Bloc[][] {
  const reste = [...blocs];
  const rangees: Bloc[][] = [];
  while (reste.length) {
    const b = reste.shift()!;
    if (b.taille === "pleine") {
      rangees.push([b]);
      continue;
    }
    const i = reste.findIndex((x) => x.taille === "demie");
    rangees.push(i < 0 ? [b] : [b, reste.splice(i, 1)[0]!]);
  }
  return rangees;
}

/** L'ordre tel qu'on le voit (la grille lue de gauche à droite, de haut en bas). */
export const ordreAffiche = (blocs: Bloc[]) => grilleDense(blocs).flat();

export type Rect = { x: number; y: number; l: number; h: number };

/** Rectangles des blocs : `largeur` de la grille, `ecart` entre blocs ; une rangée prend la hauteur de son plus haut bloc. */
export function disposer(blocs: Bloc[], hauteurs: Partial<Record<IdBloc, number>>, largeur: number, ecart: number): Map<IdBloc, Rect> {
  const demi = (largeur - ecart) / 2;
  const out = new Map<IdBloc, Rect>();
  let y = 0;
  for (const r of grilleDense(blocs)) {
    const h = Math.max(...r.map((b) => hauteurs[b.id] ?? 0));
    r.forEach((b, k) => out.set(b.id, { x: k * (demi + ecart), y, l: b.taille === "pleine" ? largeur : demi, h }));
    y += h + ecart;
  }
  return out;
}

/** Hauteur totale de la grille disposée (0 si vide). */
export function hauteurGrille(places: Map<IdBloc, Rect>): number {
  let bas = 0;
  places.forEach((r) => (bas = Math.max(bas, r.y + r.h)));
  return bas;
}

/**
 * Place du bloc tenu : sa place de départ `r0` déplacée de (`dx`, `dy`), gardée dans la grille (`largeur` × `hauteur`)
 * à `marge` près : le bloc ne sort jamais de l'écran.
 */
export function bornerTenu(r0: Rect, dx: number, dy: number, largeur: number, hauteur: number, marge: number): { x: number; y: number } {
  const b = (v: number, a: number, z: number) => Math.max(a, Math.min(Math.max(a, z), v));
  return { x: b(r0.x + dx, -marge, largeur - r0.l + marge), y: b(r0.y + dy, -marge, hauteur - r0.h + marge) };
}

/** Déplace le bloc `id` au rang `vers` de l'ordre affiché. */
export function deplacer(blocs: Bloc[], id: IdBloc, vers: number): Bloc[] {
  const l = ordreAffiche(blocs);
  const a = l.findIndex((b) => b.id === id);
  if (a < 0) return l;
  const [b] = l.splice(a, 1);
  l.splice(Math.max(0, Math.min(l.length, vers)), 0, b!);
  return l;
}

/**
 * Rang visé par le bloc tenu : on essaie chaque rang et on garde celui où sa place tombe le plus près de son centre
 * (`cx`, `cy` dans le repère de la grille). À égalité, le rang actuel.
 */
export function rangVise(
  blocs: Bloc[],
  id: IdBloc,
  cx: number,
  cy: number,
  hauteurs: Partial<Record<IdBloc, number>>,
  largeur: number,
  ecart: number,
): number {
  const l = ordreAffiche(blocs);
  const a = l.findIndex((b) => b.id === id);
  let meilleur = a;
  let dmin = Infinity;
  for (let r = 0; r < l.length; r++) {
    const p = disposer(deplacer(l, id, r), hauteurs, largeur, ecart).get(id)!;
    const d = Math.hypot(p.x + p.l / 2 - cx, p.y + p.h / 2 - cy);
    if (d < dmin - 0.5 || (Math.abs(d - dmin) <= 0.5 && r === a)) {
      dmin = d;
      meilleur = r;
    }
  }
  return meilleur;
}

const rang = (blocs: Bloc[], id: IdBloc) => ordreAffiche(blocs).findIndex((b) => b.id === id);
export const monter = (blocs: Bloc[], id: IdBloc) => deplacer(blocs, id, rang(blocs, id) - 1);
export const descendre = (blocs: Bloc[], id: IdBloc) => deplacer(blocs, id, rang(blocs, id) + 1);

/** Ajout en fin de liste, en demie si la taille existe (décision 4). */
export function ajouter(blocs: Bloc[], id: IdBloc): Bloc[] {
  const l = ordreAffiche(blocs);
  const d = DEFS.get(id);
  if (!d || d.bientot || l.some((b) => b.id === id)) return l;
  return [...l, { id, taille: d.tailles.includes("demie") ? "demie" : d.tailles[0]! }];
}

export const retirer = (blocs: Bloc[], id: IdBloc) => ordreAffiche(blocs).filter((b) => b.id !== id);

export function changerTaille(blocs: Bloc[], id: IdBloc, taille: Taille): Bloc[] {
  if (!defBloc(id).tailles.includes(taille)) return ordreAffiche(blocs);
  return ordreAffiche(blocs.map((b) => (b.id === id ? { ...b, taille } : b)));
}

/** Blocs proposés dans la feuille d'ajout : absents de l'accueil et branchés, puis les « bientôt » (grisés). */
export function aAjouter(blocs: Bloc[], branche: Record<IdBloc, boolean> = BRANCHE): DefBloc[] {
  const la = new Set(blocs.map((b) => b.id));
  return CATALOGUE.filter((d) => (d.bientot || branche[d.id]) && !la.has(d.id));
}

/**
 * Ce qu'on enregistre après une modification des blocs visibles : leur nouvel ordre, puis les blocs non branchés qui
 * étaient stockés (ils gardent leur place pour le jour où ils arrivent, en fin de liste).
 */
export function fusionnerCaches(stockes: Bloc[], visiblesModifies: Bloc[], branche: Record<IdBloc, boolean> = BRANCHE): Bloc[] {
  const la = new Set(visiblesModifies.map((b) => b.id));
  return [...visiblesModifies, ...stockes.filter((b) => !branche[b.id] && !la.has(b.id))];
}

/**
 * Un seul bouton plein sur l'Accueil (audit du 28/10, n° 20) : quand la séance prévue aujourd'hui a son « Démarrer » plein
 * (bloc Séances prévues en pleine largeur), celui d'« À suivre » passe en tonal.
 */
export function demarrerASuivreTonal(blocs: Bloc[], prochaineAujourdhui: boolean, branche: Record<IdBloc, boolean> = BRANCHE): boolean {
  return prochaineAujourdhui && visibles(blocs, branche).some((b) => b.id === "seances" && b.taille === "pleine");
}
