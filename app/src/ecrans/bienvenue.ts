// Tirage et rendu du message de bienvenue de l'Accueil (catalogue : src/i18n/bienvenue.ts). Logique pure, testée.
import { MESSAGES, type ContexteBienvenue, type Genre, type MessageBienvenue } from "../i18n/bienvenue";
import type { Langue } from "../i18n/detection";

/** Une condition vraie pèse plus qu'un moment de la journée, qui pèse plus qu'un message général. */
export const POIDS: Record<Genre, number> = { general: 1, moment: 2, contexte: 5 };

/** Générateur déterministe (mulberry32) : même graine, même suite. */
export function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Messages possibles dans ce contexte : sans condition, ou condition vraie. */
export function eligibles(c: ContexteBienvenue, catalogue: readonly MessageBienvenue[] = MESSAGES): MessageBienvenue[] {
  return catalogue.filter((m) => !m.quand || m.quand(c));
}

/** Tirage pondéré, jamais `dernier` deux fois d'affilée (s'il y a un autre choix). */
export function tirer(
  c: ContexteBienvenue,
  graine: number,
  dernier: string | null = null,
  catalogue: readonly MessageBienvenue[] = MESSAGES,
): MessageBienvenue {
  const tous = eligibles(c, catalogue);
  const choix = tous.length > 1 ? tous.filter((m) => m.id !== dernier) : tous;
  const total = choix.reduce((s, m) => s + POIDS[m.genre], 0);
  let r = hasard(graine)() * total;
  for (const m of choix) {
    r -= POIDS[m.genre];
    if (r < 0) return m;
  }
  return choix[choix.length - 1]!;
}

/** Texte affiché : sans prénom, « , {p} » ou « {p} » disparaît (« Bonjour », « Encore debout ? »). */
export function rendre(m: MessageBienvenue, langue: Langue, prenom: string, c: Pick<ContexteBienvenue, "serie">): string {
  const p = prenom.trim();
  const modele = m[langue];
  const texte = p ? modele.replace("{p}", p) : modele.replace(/,? \{p\}/, "");
  return texte.replace("{n}", String(c.serie));
}

export const parId = (id: string | null): MessageBienvenue | undefined => MESSAGES.find((m) => m.id === id);
