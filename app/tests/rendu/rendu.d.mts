export interface Noeud {
  type: string;
  /** Une liste défilante : les `scrollTo` demandés. */
  defilements?: { x?: number; y?: number; animated?: boolean }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  enfants: Noeud[];
  texte?: string;
}
export interface Rendu {
  racine: Noeud;
  erreurs: unknown[];
  jusqua(pred: (racine: Noeud) => boolean, quoi?: string): Promise<void>;
  agir(f: () => unknown): Promise<void>;
  demonter(): Promise<void>;
}
export function monter(element: unknown): Promise<Rendu>;
export function trouver(noeud: Noeud, pred: (n: Noeud) => boolean, sortie?: Noeud[]): Noeud[];
export function texte(noeud: Noeud): string;
export function textes(racine: Noeud): string[];
export function vider(): void;
export function activerHorloge(): void;
export function avancer(ms: number): void;
export function agirSec(f: () => unknown): void;
