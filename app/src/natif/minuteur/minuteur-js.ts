import { alerteVibre, type AlerteRepos } from "../../ecrans/alerte-repos";
import type { EtatMinuteur, MinuteurRepos } from "./types";

// Décompte côté JS à partir d'une échéance (survit aux re-rendus, pas à la mort du processus).
export class MinuteurJs implements MinuteurRepos {
  protected alerte: AlerteRepos = "les-deux";
  protected sonUri: string | null = null;
  /** Une notification programmée alertera à la fin du repos. */
  protected notifiee = false;
  protected fin = 0;
  protected total = 0;
  private abonnes = new Set<(e: EtatMinuteur) => void>();
  private tic: ReturnType<typeof setInterval> | null = null;

  demarrer(dureeS: number) {
    this.total = dureeS;
    this.fin = Date.now() + dureeS * 1000;
    this.relancer();
  }

  /** Reprend un repos interrompu par la mort du processus (échéance absolue). */
  reprendre(finMs: number, totalS: number) {
    if (finMs <= Date.now()) return;
    this.total = totalS;
    this.fin = finMs;
    this.relancer();
  }

  /** Échéance absolue en ms (0 : aucun repos). */
  echeance(): number {
    return this.etat().actif ? this.fin : 0;
  }

  ajuster(deltaS: number) {
    if (!this.etat().actif) return;
    this.fin += deltaS * 1000;
    this.total = Math.max(1, this.total + deltaS);
    this.emettre();
  }

  passer() {
    this.fin = 0;
    this.total = 0;
    this.arreter();
    this.emettre();
  }

  regler(alerte: AlerteRepos, sonUri: string | null) {
    this.alerte = alerte;
    this.sonUri = sonUri;
  }

  // Hors Android : l'appli vibre seule à la cible (useChronoSerie), sans notification.
  alerteCible(_finMs: number | null): void {}

  vibrerEnApp(): boolean {
    return alerteVibre(this.alerte) && !this.notifiee;
  }

  alerteVibre(): boolean {
    return alerteVibre(this.alerte);
  }

  etat(): EtatMinuteur {
    const restantS = this.fin ? Math.max(0, Math.ceil((this.fin - Date.now()) / 1000)) : 0;
    return { actif: restantS > 0, restantS, totalS: this.total };
  }

  ecouter(cb: (e: EtatMinuteur) => void) {
    this.abonnes.add(cb);
    cb(this.etat());
    return () => {
      this.abonnes.delete(cb);
    };
  }

  private relancer() {
    this.arreter();
    this.tic = setInterval(() => {
      this.emettre();
      if (!this.etat().actif) this.arreter();
    }, 250);
    this.emettre();
  }

  private arreter() {
    if (this.tic) clearInterval(this.tic);
    this.tic = null;
  }

  private emettre() {
    const e = this.etat();
    this.abonnes.forEach((cb) => cb(e));
  }
}

