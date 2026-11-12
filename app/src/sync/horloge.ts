// Horloge hybride (HLC) : millisecondes murales, compteur, nœud. Sa forme texte se compare dans l'ordre alphabétique,
// ce qui donne l'ordre « dernier qui écrit gagne » ligne par ligne (NOTES § 6.2), même si les horloges des téléphones dérivent.

export interface Hlc {
  ms: number;
  c: number;
  noeud: string;
}

export const hlcTexte = (h: Hlc) => `${String(h.ms).padStart(15, "0")}-${String(h.c).padStart(5, "0")}-${h.noeud}`;

export function lireHlc(t: string): Hlc | null {
  const m = /^(\d{15})-(\d{5})-(.+)$/.exec(t);
  return m ? { ms: Number(m[1]), c: Number(m[2]), noeud: m[3]! } : null;
}

export class Horloge {
  private ms = 0;
  private c = 0;
  readonly noeud: string;

  constructor(noeud: string, etat?: string | null) {
    this.noeud = noeud;
    const h = etat ? lireHlc(etat) : null;
    if (h) {
      this.ms = h.ms;
      this.c = h.c;
    }
  }

  /** Estampille d'une écriture locale faite à `physique` (ms) : toujours plus grande que tout ce que l'horloge a vu. */
  envoyer(physique: number): string {
    if (physique > this.ms) {
      this.ms = physique;
      this.c = 0;
    } else this.c++;
    return this.etat();
  }

  /** Une estampille reçue fait avancer l'horloge : la prochaine écriture locale passera après elle. */
  recevoir(t: string): void {
    const h = lireHlc(t);
    if (!h) return;
    if (h.ms > this.ms) {
      this.ms = h.ms;
      this.c = h.c;
    } else if (h.ms === this.ms && h.c > this.c) this.c = h.c;
  }

  etat(): string {
    return hlcTexte({ ms: this.ms, c: this.c, noeud: this.noeud });
  }
}
