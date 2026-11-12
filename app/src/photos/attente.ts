// Suppression différée de la photo : elle quitte l'écran tout de suite, « Annuler » la remet pendant `DELAI_ANNULER_MS` ;
// ensuite (ou en quittant l'écran) la suppression est faite pour de bon. Sans React ni Expo, pour les tests.

export const DELAI_ANNULER_MS = 8000;

export class SuppressionDifferee {
  private attente: { id: string; faire: () => void; minuterie: ReturnType<typeof setTimeout> } | null = null;

  private readonly changement: (id: string | null) => void;

  constructor(changement: (id: string | null) => void = () => {}) {
    this.changement = changement;
  }

  /** Photo en attente de suppression, ou null. */
  get enAttente(): string | null {
    return this.attente?.id ?? null;
  }

  /** Demande la suppression de `id` ; une suppression déjà en attente est faite d'abord. */
  demander(id: string, faire: () => void, delai = DELAI_ANNULER_MS): void {
    this.valider();
    const minuterie = setTimeout(() => this.valider(), delai);
    this.attente = { id, faire, minuterie };
    this.changement(id);
  }

  /** Annuler : la photo revient, rien n'est effacé. */
  annuler(): void {
    if (!this.attente) return;
    clearTimeout(this.attente.minuterie);
    this.attente = null;
    this.changement(null);
  }

  /** Fait tout de suite la suppression en attente (délai écoulé, écran quitté). */
  valider(): void {
    const a = this.attente;
    if (!a) return;
    clearTimeout(a.minuterie);
    this.attente = null;
    a.faire();
    this.changement(null);
  }
}
