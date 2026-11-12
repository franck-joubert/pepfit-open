// Compteur d'appels aux API des fournisseurs (lot W du carnet, 1/11). Les limites de Whoop sont PAR APPLICATION (le
// client pepfit), pas par personne : 100 appels par minute et 10 000 par jour pour tous les téléphones réunis. Chaque
// téléphone compte ses propres appels et lit les en-têtes X-RateLimit-* que Whoop renvoie (ils disent, eux, ce qui reste à
// toute l'application). Deux usages :
//   - une garde avant chaque appel : attendre la fin de la minute plutôt que déclencher une rafale de 429, refuser tout de
//     suite quand le quota du jour est épuisé ;
//   - un relevé envoyé au serveur (rapport.ts → serveur/pb_hooks/quotas-api.js), qui additionne les téléphones et alerte à
//     70 % du jour.
// Rien de personnel : un nombre d'appels et ce qui reste, par fournisseur. Pur (l'heure est un argument), testé par
// tests/quotas-api.test.ts.

export type Fournisseur = "whoop" | "withings";

export interface Limites {
  minute: number;
  /** null : pas de limite du jour connue. */
  jour: number | null;
}

/**
 * Limites par défaut de chaque fournisseur, par application. Whoop : developer.whoop.com (Rate Limiting), relevables sur
 * demande (Developer Dashboard, « Rate limit increase »). Withings : 120 appels par minute par application partenaire,
 * sans limite du jour publiée (à revérifier avant l'alpha).
 */
export const LIMITES: Record<Fournisseur, Limites> = {
  whoop: { minute: 100, jour: 10_000 },
  withings: { minute: 120, jour: null },
};

/** Part du quota du jour à partir de laquelle on alerte, puis à partir de laquelle c'est critique. */
export const SEUIL_ALERTE = 0.7;
export const SEUIL_CRITIQUE = 0.9;
/** La garde laisse cette marge sous la limite de la minute (les autres téléphones appellent aussi). */
const MARGE_MINUTE = 5;
/** En dessous de ce reste annoncé par le fournisseur, on attend la remise à zéro de la fenêtre. */
const RESTE_MINI = 3;

export type Niveau = "ok" | "alerte" | "critique";

/** En-têtes de limite lus sur une réponse (Whoop : X-RateLimit-Limit, -Remaining, -Reset). */
export interface EntetesLimite {
  /** Appels qui restent dans la fenêtre la plus proche d'être épuisée. */
  restant: number | null;
  /** Secondes avant la remise à zéro de cette fenêtre. */
  reset_s: number | null;
  /** Fenêtres annoncées : limite et durée en secondes (« 100, 100;window=60, 10000;window=86400 »). */
  fenetres: { limite: number; fenetre_s: number }[];
}

const nombre = (v: string | null | undefined): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Lit les en-têtes X-RateLimit-* (null si la réponse n'en porte aucun). */
export function lireEntetes(get: (nom: string) => string | null): EntetesLimite | null {
  const limite = get("X-RateLimit-Limit");
  const restant = nombre(get("X-RateLimit-Remaining"));
  const reset_s = nombre(get("X-RateLimit-Reset"));
  if (limite == null && restant == null && reset_s == null) return null;
  const fenetres = String(limite ?? "")
    .split(",")
    .map((p) => /^\s*(\d+)\s*;\s*window\s*=\s*(\d+)\s*$/i.exec(p))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ limite: Number(m[1]), fenetre_s: Number(m[2]) }));
  return { restant, reset_s, fenetres };
}

/** Jour UTC (AAAA-MM-JJ) : la fenêtre du jour des fournisseurs n'est pas celle du fuseau de la personne. */
export const jourUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

interface Etat {
  minute: number;
  appelsMinute: number;
  jour: string;
  appelsJour: number;
  /** Appels faits depuis le dernier relevé envoyé au serveur. */
  nonRapportes: number;
  /** Plus haut nombre d'appels de ce téléphone dans une même minute depuis le dernier relevé. */
  picNonRapporte: number;
  dernierRapport: number;
  niveauRapporte: Niveau;
  entetes: EntetesLimite | null;
  /** Heure (ms) des derniers en-têtes. */
  entetesLe: number;
  refus429: number;
}

/** Ce qu'on sait d'un fournisseur à l'instant `t`. */
export interface Bilan {
  fournisseur: Fournisseur;
  limites: Limites;
  appels_minute: number;
  appels_jour: number;
  /** Reste annoncé par le fournisseur à la dernière réponse (pour toute l'application), null s'il n'en dit rien. */
  restant: number | null;
  /** Part du jour consommée, la plus haute de ce téléphone et de ce que dit le fournisseur ; null sans limite du jour. */
  part_jour: number | null;
  niveau: Niveau;
  refus_429: number;
}

/** Relevé envoyé au serveur (rapport.ts). */
export interface Releve {
  fournisseur: Fournisseur;
  jour: string;
  appels: number;
  restant: number | null;
  reset_s: number | null;
  fenetre_s: number | null;
  refus_429: number;
  /** Plus haut nombre d'appels de ce téléphone dans une même minute, sur la période du relevé. */
  pic_minute: number;
}

export const niveauDe = (part: number | null): Niveau => (part == null ? "ok" : part >= SEUIL_CRITIQUE ? "critique" : part >= SEUIL_ALERTE ? "alerte" : "ok");

/**
 * Durée de la fenêtre que vise le reste annoncé (Whoop ne le dit pas) : la plus petite fenêtre dont la limite le dépasse et
 * qui dure au moins jusqu'à la remise à zéro annoncée (un reste de 1 remis à zéro dans 5 h vise le jour, pas la minute).
 */
function fenetreDuReste(e: EntetesLimite, l: Limites): number | null {
  if (e.restant == null) return null;
  const fenetres = e.fenetres.length ? e.fenetres : [{ limite: l.minute, fenetre_s: 60 }, ...(l.jour ? [{ limite: l.jour, fenetre_s: 86_400 }] : [])];
  return (
    fenetres
      .filter((f) => e.restant! <= f.limite && (e.reset_s == null || e.reset_s <= f.fenetre_s))
      .sort((a, b) => a.fenetre_s - b.fenetre_s)[0]?.fenetre_s ?? null
  );
}

export class Compteur {
  private etats = new Map<Fournisseur, Etat>();
  private limites: Record<Fournisseur, Limites>;
  constructor(limites: Record<Fournisseur, Limites> = LIMITES) {
    this.limites = limites;
  }

  private etat(f: Fournisseur, t: number): Etat {
    const minute = Math.floor(t / 60_000);
    const jour = jourUtc(t);
    let e = this.etats.get(f);
    if (!e) {
      e = { minute, appelsMinute: 0, jour, appelsJour: 0, nonRapportes: 0, picNonRapporte: 0, dernierRapport: 0, niveauRapporte: "ok", entetes: null, entetesLe: 0, refus429: 0 };
      this.etats.set(f, e);
    }
    if (e.minute !== minute) Object.assign(e, { minute, appelsMinute: 0 });
    if (e.jour !== jour) Object.assign(e, { jour, appelsJour: 0, refus429: 0, niveauRapporte: "ok" as Niveau });
    return e;
  }

  /** Un appel est parti (avant d'avoir sa réponse : un appel refusé compte aussi chez le fournisseur). */
  noterAppel(f: Fournisseur, t: number): void {
    const e = this.etat(f, t);
    e.appelsMinute++;
    e.appelsJour++;
    e.nonRapportes++;
    e.picNonRapporte = Math.max(e.picNonRapporte, e.appelsMinute);
  }

  /** La réponse est arrivée : ses en-têtes de limite, et si c'était un refus pour trop de demandes. */
  noterReponse(f: Fournisseur, t: number, entetes: EntetesLimite | null, refus429 = false): void {
    const e = this.etat(f, t);
    if (entetes) Object.assign(e, { entetes, entetesLe: t });
    if (refus429) e.refus429++;
  }

  bilan(f: Fournisseur, t: number): Bilan {
    const e = this.etat(f, t);
    const l = this.limites[f];
    const restant = e.entetes?.restant ?? null;
    let part: number | null = null;
    if (l.jour) {
      part = e.appelsJour / l.jour;
      // Le reste annoncé vaut pour toute l'application : s'il vise la fenêtre du jour, il dit ce que les autres téléphones ont pris.
      if (e.entetes && jourUtc(e.entetesLe) === e.jour && fenetreDuReste(e.entetes, l) === 86_400) part = Math.max(part, 1 - restant! / l.jour);
    }
    return { fournisseur: f, limites: l, appels_minute: e.appelsMinute, appels_jour: e.appelsJour, restant, part_jour: part, niveau: niveauDe(part), refus_429: e.refus429 };
  }

  /**
   * Garde avant un appel : 0 pour y aller, sinon le temps à attendre (ms) jusqu'à la fin de la fenêtre de la minute ;
   * `epuise` quand le fournisseur annonce le quota du jour épuisé (inutile d'insister avant sa remise à zéro).
   */
  attenteAvant(f: Fournisseur, t: number): { attendre_ms: number; epuise: boolean } {
    const e = this.etat(f, t);
    const l = this.limites[f];
    const h = e.entetes;
    if (h && h.restant != null && h.restant <= RESTE_MINI && h.reset_s != null) {
      const fin = e.entetesLe + h.reset_s * 1000;
      if (fin > t) {
        if (fenetreDuReste(h, l) === 86_400 || h.reset_s > 120) return { attendre_ms: 0, epuise: true };
        return { attendre_ms: fin - t, epuise: false };
      }
    }
    if (e.appelsMinute >= l.minute - MARGE_MINUTE) return { attendre_ms: (e.minute + 1) * 60_000 - t, epuise: false };
    return { attendre_ms: 0, epuise: false };
  }

  /**
   * Relevés à envoyer au serveur : un fournisseur qui a des appels pas encore rapportés, au plus tous les `intervalle_ms`,
   * ou tout de suite quand son niveau monte. Les compteurs « à rapporter » repartent de zéro (`confirmer` après l'envoi).
   */
  aRapporter(t: number, intervalle_ms = 15 * 60_000): Releve[] {
    const out: Releve[] = [];
    for (const f of this.etats.keys()) {
      const e = this.etat(f, t);
      if (e.nonRapportes === 0) continue;
      const niveau = this.bilan(f, t).niveau;
      const monte = niveau !== "ok" && niveau !== e.niveauRapporte;
      if (!monte && t - e.dernierRapport < intervalle_ms) continue;
      const h = e.entetes && jourUtc(e.entetesLe) === e.jour ? e.entetes : null;
      out.push({
        fournisseur: f, jour: e.jour, appels: e.nonRapportes, restant: h?.restant ?? null, reset_s: h?.reset_s ?? null,
        fenetre_s: h ? fenetreDuReste(h, this.limites[f]) : null, refus_429: e.refus429, pic_minute: e.picNonRapporte,
      });
    }
    return out;
  }

  /** Le serveur a reçu ces relevés : leurs appels ne sont plus à rapporter. */
  confirmer(releves: Releve[], t: number): void {
    for (const r of releves) {
      const e = this.etat(r.fournisseur, t);
      if (e.jour === r.jour) e.nonRapportes = Math.max(0, e.nonRapportes - r.appels);
      // Le pic de la minute en cours repart de ce qu'elle a déjà, pour le relevé suivant.
      e.picNonRapporte = e.appelsMinute;
      e.dernierRapport = t;
      e.niveauRapporte = this.bilan(r.fournisseur, t).niveau;
    }
  }
}

/** Le compteur du téléphone, partagé par les clients Whoop et Withings (oublié à la fermeture de l'appli). */
export const quotas = new Compteur();
