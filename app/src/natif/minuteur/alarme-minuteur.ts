import { alerteSonne, alerteVibre, type AlerteRepos } from "../../ecrans/alerte-repos";

// Fin du repos et fin d'une série en durée sur l'alarme native de la sieste (modules/pepfit-alarme, « créneaux » repos et
// cible) : setAlarmClock, puis un service qui joue le son sur le flux ALARME et vibre en USAGE_ALARM. Elle sonne appli fermée,
// téléphone en veille, en mode silencieux et en « Ne pas déranger » qui laisse passer les alarmes (docs/CODE-IMPORTS-MINUTEUR.md).
// Sans expo ici : la logique se teste sous Node (tests/minuteur-alarme.test.ts).

export type Creneau = "repos" | "cible";

/** Ce que reçoit `programmerMinuteur` (Kotlin : classe Minuteur de PepfitAlarmeModule.kt). */
export interface ReglageMinuteur {
  creneau: Creneau;
  fin: number;
  titre: string;
  corps: string;
  canal: string;
  son: boolean;
  uri: string | null;
  vibration: number[];
  lien: string;
}

export interface NatifMinuteur {
  programmerMinuteur(r: ReglageMinuteur): Promise<boolean>;
  annulerMinuteur(creneau: Creneau): Promise<void>;
}

/**
 * Vibration de l'alarme native : deux impulsions de 250 ms. Celle du canal de notification (VIBRATION_REPOS, 60 ms) se sent
 * à peine téléphone en poche ; l'alarme, elle, vibre même en mode silencieux, elle doit donc se sentir.
 */
export const VIBRATION_REPOS_ALARME = [0, 250, 150, 250];

/** Toucher la notification ouvre la séance (route app/session.tsx). */
export const LIEN_SEANCE = "pepfitopen://session";

/** Le module natif s'il sait faire un minuteur (un APK plus ancien n'a que l'alarme de sieste, ou rien). */
export function natifMinuteur(m: unknown): NatifMinuteur | null {
  const n = m as Partial<NatifMinuteur> | null | undefined;
  return n && typeof n.programmerMinuteur === "function" && typeof n.annulerMinuteur === "function" ? (n as NatifMinuteur) : null;
}

/** Le réglage à programmer, ou null : rien à faire sonner (pas d'échéance, échéance passée, alerte « rien »). */
export function reglageMinuteur(
  o: { creneau: Creneau; fin: number | null; alerte: AlerteRepos; sonUri: string | null; titre: string; corps: string; canal: string },
  maintenant = Date.now(),
): ReglageMinuteur | null {
  if (!o.fin || o.fin <= maintenant || o.alerte === "rien") return null;
  const son = alerteSonne(o.alerte);
  return {
    creneau: o.creneau,
    fin: o.fin,
    titre: o.titre,
    corps: o.corps,
    canal: o.canal,
    son,
    uri: son ? o.sonUri : null,
    vibration: alerteVibre(o.alerte) ? VIBRATION_REPOS_ALARME : [],
    lien: LIEN_SEANCE,
  };
}

/**
 * Pose les demandes une à une, par créneau : la dernière gagne, jamais deux minuteries (le natif remplace celle du créneau).
 * `poser` rend vrai si l'alarme est programmée.
 */
export class FileMinuteur {
  private files = new Map<Creneau, Promise<unknown>>();
  private natif: NatifMinuteur;
  constructor(natif: NatifMinuteur) {
    this.natif = natif;
  }

  poser(creneau: Creneau, r: ReglageMinuteur | null): Promise<boolean> {
    const avant = this.files.get(creneau) ?? Promise.resolve();
    const suite = avant.then(async () => {
      if (!r) {
        await this.natif.annulerMinuteur(creneau).catch(() => {});
        return false;
      }
      return this.natif.programmerMinuteur(r).catch(() => false);
    });
    this.files.set(creneau, suite.catch(() => {}));
    return suite;
  }
}
