// Rappel de coucher (planche sommeil, D15, écran c4) : éteint par défaut, une notification silencieuse par soir, 30 min
// avant le coucher conseillé ; pendant un plan (changement d'heure, voyage), il suit le plan. Pur : les soirs à prévenir.
import { minuscule, t } from "../../i18n/index";
import { ajouterJ } from "../planification";
import { type Changement, ligneDuJour, type Rythme, planChangement } from "./changement-heure";
import { duree, heureMin, instantDans, jourDans, jourSemaineLong } from "./horloge";
import { ligneVoyage, planVoyage, type Voyage } from "./voyage";

/** Choix de « Quand » (c4) ; 30 min par défaut. */
export const AVANTS = [15, 30, 45, 60] as const;
export const AVANT_DEFAUT = 30;
/** Soirs prévus d'avance : ils sont reposés à chaque ouverture de l'appli. */
export const SOIRS = 7;
/** Identifiant des notifications : « coucher-AAAA-MM-JJ ». */
export const PREFIXE_COUCHER = "coucher-";

export type SourceCoucher = "habituel" | "ete" | "hiver" | "voyage";

export interface SoirRappel {
  /** « coucher-AAAA-MM-JJ » : un par soir. */
  id: string;
  jour: string;
  /** Instant de la notification. */
  instant: number;
  /** Coucher conseillé, minutes depuis le minuit du soir, à l'heure de `fuseau`. */
  coucher: number;
  fuseau: string;
  source: SourceCoucher;
  /** Écart sur l'habitude (− 20 = plus tôt). */
  ecart: number;
  /** Jour du changement d'heure, pour « heure d'été dimanche ». */
  changement?: string;
}

export interface EntreeRappel {
  maintenant: number;
  /** Fuseau de l'appli (celui du téléphone en voyage). */
  fuseau: string;
  rythme: Rythme | null;
  changement: Changement | null;
  voyage: Voyage | null;
  avant: number;
  suivrePlan: boolean;
}

/** Les soirs à prévenir, de ce soir aux 7 suivants ; rien sans rythme connu (moins de 3 nuits). */
export function soirsRappel(e: EntreeRappel): SoirRappel[] {
  if (!e.rythme) return [];
  const r = e.rythme;
  const plan = e.suivrePlan && e.changement ? planChangement(e.changement, r) : null;
  const pv = e.suivrePlan && e.voyage ? planVoyage(e.voyage, r) : null;
  const auj = jourDans(e.maintenant, e.fuseau);
  const soirs: SoirRappel[] = [];
  for (let k = 0; k < SOIRS; k++) {
    const jour = ajouterJ(auj, k);
    let coucher = r.coucher;
    let fuseau = e.fuseau;
    let source: SourceCoucher = "habituel";
    let ecart = 0;
    let changement: string | undefined;
    const lv = pv ? ligneVoyage(pv, jour) : null;
    const lc = plan ? ligneDuJour(plan, jour) : null;
    if (lv) {
      ({ coucher, fuseau, ecart } = lv);
      source = "voyage";
    } else if (lc && !lc.fin && lc.coucher != null) {
      coucher = lc.coucher;
      ecart = lc.decalage;
      source = e.changement!.ete ? "ete" : "hiver";
      changement = e.changement!.jour;
    }
    const instant = instantDans(jour, coucher - e.avant, fuseau);
    if (instant <= e.maintenant) continue;
    soirs.push({ id: `${PREFIXE_COUCHER}${jour}`, jour, instant, coucher, fuseau, source, ecart, ...(changement ? { changement } : {}) });
  }
  return soirs;
}

/** « Coucher dans 30 min ». */
export const titreRappel = (avant: number): string => t("heureVoyage.notifTitre", { d: duree(avant) });

/** « Ce soir 23:25, 20 min plus tôt : heure d'été dimanche. » */
export function corpsRappel(s: SoirRappel): string {
  const heure = heureMin(s.coucher);
  if (s.source === "habituel" || s.ecart === 0) return t("heureVoyage.notifHabituel", { heure });
  const ecart = t(s.ecart < 0 ? "heureVoyage.plusTot" : "heureVoyage.plusTard", { d: duree(s.ecart) });
  const cle = s.source === "voyage" ? "heureVoyage.notifVoyage" : s.source === "ete" ? "heureVoyage.notifEte" : "heureVoyage.notifHiver";
  return t(cle, { heure, ecart, jour: s.changement ? minuscule(jourSemaineLong(s.changement)) : "" });
}
