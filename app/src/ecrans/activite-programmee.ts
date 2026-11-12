// Activité détectée et séance programmée : une activité qui tombe sur le créneau d'une séance prévue du jour (début à 45 min
// près, ou chevauchement d'au moins la moitié) est cette séance. Elle reçoit alors le sport de la routine programmée (« Padel ? »,
// « prévu à 8:00 ») au-dessus de l'habitude. Une routine de muscu ne donne pas de sport : l'activité reste à associer. Pur
// (sans React Native ni base) : tests/activite-programmee.test.ts.
import { chevauchement, type Plage } from "./activite-detectee";
import { MUSCULATION } from "./changer-activite";

const MIN = 60_000;

/** Début à moins de 45 min de l'heure prévue : la séance prévue à 8:00 et commencée à 7:52 ou à 8:40. */
export const FENETRE_PROGRAMME_MS = 45 * MIN;
/** Recoupement net (association automatique) : début à 20 min près, ou les trois quarts de l'une couverts par l'autre. */
export const FENETRE_NETTE_MS = 20 * MIN;
export const CHEVAUCHEMENT_NET = 0.75;
export const CHEVAUCHEMENT_MIN = 0.5;

/** Une occurrence programmée du jour, avec son heure en instant : ce que la détection a besoin de savoir. */
export interface Prevue {
  programmationId: string;
  /** Jour d'origine de l'occurrence (clé de programmation_lieux). */
  origine: string;
  /** « 08:00 » */
  heure: string;
  /** Début prévu, en ms. */
  debut: number;
  /** Durée voulue (réglages), sinon estimée de la routine ; 0 : inconnue. */
  dureeMin: number;
  /** Sport de la routine (« cat:padel ») ; null : routine sans sport reconnu. */
  sport: string | null;
  /** Lieu prévu (programmation_lieux), s'il y en a un. */
  lieu: { id: string; nom: string } | null;
}

export interface Programme {
  prevue: Prevue;
  /** Écart entre le début de l'activité et l'heure prévue (ms, positif : commencée après). */
  ecartMs: number;
  /** Le recoupement est net et sans équivoque : l'association peut se faire toute seule (réglage « Le poser tout seul »). */
  net: boolean;
}

const finDe = (p: Prevue) => p.debut + (p.dureeMin > 0 ? p.dureeMin * MIN : 0);

/** La séance prévue que l'activité recoupe : la plus proche en heure ; null sans recoupement, ou si cette séance n'est pas un sport. */
export function programmeDe(a: Plage, prevues: readonly Prevue[]): Programme | null {
  const recoupent = prevues
    .map((p) => {
      const ecartMs = a.debut - p.debut;
      const part = p.dureeMin > 0 ? chevauchement(a, { debut: p.debut, fin: finDe(p) }) : 0;
      return { p, ecartMs, part, ok: Math.abs(ecartMs) <= FENETRE_PROGRAMME_MS || part >= CHEVAUCHEMENT_MIN };
    })
    .filter((x) => x.ok)
    .sort((x, y) => Math.abs(x.ecartMs) - Math.abs(y.ecartMs));
  const [premier, ...autres] = recoupent;
  // le plan n'est pas un sport : une routine de muscu (ou sans sport) laisse l'activité à associer
  if (!premier || !premier.p.sport || premier.p.sport === MUSCULATION) return null;
  const net = (Math.abs(premier.ecartMs) <= FENETRE_NETTE_MS || premier.part >= CHEVAUCHEMENT_NET) && autres.every((x) => x.p.sport === premier.p.sport);
  return { prevue: premier.p, ecartMs: premier.ecartMs, net };
}
