// La dette de sommeil sur la page Sommeil (planche sommeil du 03/11, A1 à A6) : ce que la page montre en plus du calcul du
// matin (recup-pepfit.ts, sommeilDuMatin, le même que la Récupération) : les siestes du jour retirées, le coucher moyen des
// 7 nuits et le coucher conseillé, l'appareil qui a mesuré, la part du besoin. Pur : testé sans l'appli.
import {
  calculerDette, coucherConseille, RECUP, type Dette, type NuitDette, type ParamsDette, type SommeilCalcule,
} from "../recup-pepfit";

/** L'appareil dit dans le tiroir (le bracelet Whoop y est nommé, NOTES § 9) et à la fin de sieste (« Ton bracelet », sans marque). */
export type Appareil = "bracelet" | "montre" | "telephone";

export interface SommeilDuJour {
  /** Le calcul du matin : la dette sans les siestes du jour et le besoin de la nuit (celui de la Récupération). */
  matin: SommeilCalcule;
  /** La dette après les siestes du jour : celle du bloc, du coucher conseillé et de la sieste. */
  dette: Dette;
  siestesJour: number;
  objectif: number;
  /** Coucher moyen des 7 nuits, en minutes depuis le minuit de la veille (23:46 = 1426, 00:20 = 1460) ; null sans coucher. */
  coucherMoyen: number | null;
  /** Coucher conseillé ce soir, minutes du jour (0 à 1439) ; null sous le seuil, en dette lourde, sans coucher moyen. */
  coucher: number | null;
  /** L'appareil de la plupart des nuits mesurées ; null sans nuit. */
  appareil: Appareil | null;
}

/**
 * Le coucher moyen : `couchers` en minutes autour du minuit du réveil (sommeil-stats.ts, versStat : −14 = 23:46), rendu
 * depuis le minuit de la veille ; null sans aucun.
 */
export function coucherMoyen(couchers: readonly (number | null | undefined)[]): number | null {
  const l = couchers.filter((x): x is number => x != null && Number.isFinite(x));
  return l.length ? 1440 + l.reduce((a, b) => a + b, 0) / l.length : null;
}

/** L'appareil le plus fréquent des nuits mesurées : téléphone s'il en mesure la plupart, sinon montre ou bracelet (Whoop). */
export function appareilDes(nuits: readonly (NuitDette | null)[], bracelet: boolean): Appareil | null {
  const l = nuits.filter((n): n is NuitDette => n != null);
  if (!l.length) return null;
  const tel = l.filter((n) => n.source !== "montre").length;
  return tel * 2 > l.length ? "telephone" : bracelet ? "bracelet" : "montre";
}

/** Ce que montre la page : la dette du matin moins les siestes du jour, le coucher conseillé, l'appareil. */
export function sommeilDuJour(
  matin: SommeilCalcule,
  nuits: readonly (NuitDette | null)[],
  o: { objectif: number; siestesJour: number; couchers: readonly (number | null | undefined)[]; bracelet: boolean },
  p: ParamsDette = RECUP.dette,
): SommeilDuJour {
  const dette = o.siestesJour > 0 ? calculerDette(nuits, o.objectif, o.siestesJour, p) : matin.dette;
  const moyen = coucherMoyen(o.couchers);
  return { matin, dette, siestesJour: o.siestesJour, objectif: o.objectif, coucherMoyen: moyen, coucher: coucherConseille(moyen, dette, p), appareil: appareilDes(nuits.slice(0, p.fenetre), o.bracelet) };
}

/** La part du besoin dormie (« 76 % de ton besoin »), entière ; null sous le seuil de précision ou sans besoin. */
export function partBesoin(dormi: number, s: SommeilCalcule): number | null {
  return s.besoin.chiffre && s.besoin.total > 0 ? Math.round((dormi / s.besoin.total) * 100) : null;
}


/** L'instant d'un coucher conseillé (minutes du jour) ce soir-là, pour l'écrire à l'heure locale ; `jour` : son minuit. */
export const instantCoucher = (m: number, jour = new Date(new Date().setHours(0, 0, 0, 0)).getTime()): number => jour + m * 60_000;
