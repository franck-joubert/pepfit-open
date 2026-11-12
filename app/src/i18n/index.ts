// Petit module i18n maison : état actif global (langue, fuseau, unités), t() et tp() utilisables hors composant.
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr, type Cle, type ClePluriel, type CleSimple } from "./fr";
import { detecter, fuseauSysteme, type Actif, type Detecte, type Langue } from "./detection";
import type { Entree } from "./dico";
import { SURCHARGES } from "./plateforme";

export * from "./detection";
export type { Cle, CleSimple, ClePluriel };
export { fr, en, de, es };

export type Params = Record<string, string | number>;

const DICOS: Record<Langue, Record<string, Entree>> = { fr, en, de, es };
/** Repli d'une clé absente : le français pour le français, l'anglais sinon. */
const repli = (l: Langue) => (l === "fr" ? DICOS.fr : DICOS.en);

let actif: Actif = detecter({ codeLangue: "fr", systeme: "metric", fuseau: fuseauSysteme() });
let detecte: Detecte = actif;
const ecouteurs = new Set<() => void>();

export function definirActif(a: Actif): void {
  if (a.langue === actif.langue && a.fuseau === actif.fuseau && a.poids === actif.poids && a.distance === actif.distance) return;
  actif = a;
  for (const f of ecouteurs) f();
}

export function definirDetecte(d: Detecte): void {
  detecte = d;
}

export const lireActif = (): Actif => actif;
export const lireDetecte = (): Detecte => detecte;

export function abonner(f: () => void): () => void {
  ecouteurs.add(f);
  return () => {
    ecouteurs.delete(f);
  };
}

const LOCALES: Record<Langue, string> = { fr: "fr-FR", en: "en-US", de: "de-DE", es: "es-ES" };
/** Locale BCP 47 pour Intl : français, allemand, espagnol → 24 h et virgule ; anglais → 12 h et point. */
export const locale = (): string => LOCALES[actif.langue];

/**
 * Un libellé mis en minuscules pour entrer dans une phrase (« au déjeuner », « le lundi »). L'allemand garde ses majuscules :
 * ses noms communs en portent une (« zum Frühstück », « am Montag »).
 */
export const minuscule = (s: string): string => (actif.langue === "de" ? s : s.toLocaleLowerCase(LOCALES[actif.langue]));
/** Même règle, sur la première lettre seulement (« Lundi 18 h » → « lundi 18 h »). */
export const minusculeInitiale = (s: string): string => (actif.langue === "de" ? s : s.charAt(0).toLocaleLowerCase(LOCALES[actif.langue]) + s.slice(1));

function remplir(modele: string, p?: Params): string {
  return p ? modele.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m)) : modele;
}

export function t(cle: CleSimple, p?: Params): string {
  // iPhone : quelques textes qui nommaient Android (plateforme.ios.ts) ; rien ailleurs
  const e = SURCHARGES[actif.langue][cle] ?? DICOS[actif.langue][cle] ?? repli(actif.langue)[cle] ?? DICOS.fr[cle];
  return remplir(typeof e === "string" ? e : (e?.other ?? cle), p);
}

/** Pluriel : {n} est ajouté aux paramètres. Règle Intl de la langue (en français, 0 et 1 sont au singulier). */
export function tp(cle: ClePluriel, n: number, p?: Params): string {
  const e = DICOS[actif.langue][cle] ?? repli(actif.langue)[cle] ?? DICOS.fr[cle];
  if (typeof e === "string" || !e) return cle;
  // Pas d'Intl.PluralRules : Hermes Android ne l'a pas (plantage du Profil, 27/10). Règles CLDR : fr, 0 et 1 au singulier ; en, de, es, 1 seul.
  const un = actif.langue === "fr" ? Math.abs(n) < 2 : n === 1;
  return remplir(un ? e.one : e.other, { n: nombreCourt(n), ...p });
}

function nombreCourt(n: number): string {
  return new Intl.NumberFormat(locale()).format(n);
}
