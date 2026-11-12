// « Aider à s'endormir » (planche sommeil du 03/11, validée, B1 à B7, D6 à D11) : ce que les écrans calculent, sans React
// Native (testé par tests/endormir.test.ts). Les méthodes dans l'ordre de leurs preuves (D6), les rythmes des respirations,
// la carte « Ce soir » (D10) et les conseils du soir (D11). Les sources sont dans planches/sommeil/NOTES.md § 3.
import type { NomIcone } from "../../ui/Icone";
import { souffle } from "../recuperer";
import { ecartType } from "../mesures/sommeil-stats";
import type { Dette } from "../recup-pepfit";
import { heureTexte } from "../format";

export type MethodeId = "lente" | "carree" | "armee" | "hypnose" | "musique";

export interface Methode {
  id: MethodeId;
  groupe: "respirer" | "relacher";
  icone: NomIcone;
  /** Durée annoncée (minutes). */
  minutes: number;
}

/** L'ordre de la planche (D6) : la respiration lente d'abord, la plus étudiée ; ni bruit blanc ni 4-7-8. */
export const METHODES: readonly Methode[] = [
  { id: "lente", groupe: "respirer", icone: "vague", minutes: 10 },
  { id: "carree", groupe: "respirer", icone: "carre", minutes: 4 },
  { id: "armee", groupe: "relacher", icone: "corps", minutes: 2 },
  { id: "hypnose", groupe: "relacher", icone: "spirale", minutes: 15 },
  { id: "musique", groupe: "relacher", icone: "son", minutes: 30 },
];

/** Les réglages de l'écran (planche sommeil, NOTES § 3). */
export const ENDORMIR = {
  // Respiration lente : la cohérence cardiaque de Récupérer, 5 s puis 5 s (6 souffles par minute) ; « plus court » : 4 s.
  lente: { normal: 5, court: 4 },
  // Respiration carrée : 4 s par côté, 3 s pour qui est gêné (B4).
  carree: { normal: 4, court: 3 },
  // Méthode de l'armée : six étapes (D9), 15 s chacune avant la suivante.
  armee: { etapes: 6, secondes: 15 },
  // Autohypnose en texte guidé (D8, sans voix enregistrée) : 15 phrases, une par minute.
  hypnose: { phrases: 15, secondes: 60 },
  // Luminosité de la fenêtre pendant l'écran (D7) : 0, le plus bas que permet Android (BRIGHTNESS_OVERRIDE_OFF).
  luminosite: 0,
  // La carte « Ce soir » paraît 2 h avant le coucher conseillé, jusqu'au coucher (D10).
  carteAvantMin: 120,
  // Une séance finie moins d'1 h avant le coucher peut gêner l'endormissement (Stutz 2019).
  seanceProcheMin: 60,
  // Le conseil de régularité : écart type des couchers des 30 dernières nuits, à partir de 30 min (choix pepfit).
  regularite: { nuits: 30, seuilMin: 30, minNuits: 7 },
  // Son doux de la respiration : une note plus haute à l'inspiration, plus basse à l'expiration, entre les deux pour retenir
  // (Hz, ms, volume 0 à 1).
  son: { inspire: 330, retiens: 294, expire: 247, ms: 700, volume: 0.12 },
  // Le fondu d'une étape ou d'une phrase qui change (ms) : lent, c'est la nuit.
  fondu: 600,
} as const;

/** Respiration lente : la phase, le décompte et le remplissage du disque (0 vide, 1 plein) à `s` secondes. */
export function phaseLente(s: number, cote: number) {
  return souffle(s, { inspire: cote, expire: cote });
}

export type MotCarre = "inspire" | "retiens" | "expire" | "retiensVide";
const MOTS_CARRE: readonly MotCarre[] = ["inspire", "retiens", "expire", "retiensVide"];

/** Respiration carrée à `s` secondes : le côté en cours (0 en haut, puis à droite, en bas, à gauche), le mot, le décompte
 * qui monte (1, 2, 3, 4 comme sur la planche) et le cycle en cours (1 pour le premier). */
export function phaseCarree(s: number, cote: number): { cote: number; mot: MotCarre; compte: number; cycle: number } {
  const x = Math.max(0, s);
  const tour = 4 * cote;
  const dans = x % tour;
  const c = Math.min(3, Math.floor(dans / cote));
  return { cote: c, mot: MOTS_CARRE[c]!, compte: Math.min(cote, Math.floor(dans - c * cote) + 1), cycle: Math.floor(x / tour) + 1 };
}

/** Nombre de cycles d'une respiration carrée de `minutes` (4 min à 4 s : 15). */
export const cyclesCarree = (minutes: number, cote: number): number => Math.max(1, Math.round((minutes * 60) / (4 * cote)));

/**
 * Les images clés de l'opacité du côté `i` du carré, sur le pilote 0 → 4 (un côté par unité) : « cote-actif » de la planche
 * (.85 jusqu'à 24,4 %, .2 dès 25,6 %, retour à .85 de 98,8 % à 100 %) décalée de `i` côtés. Le fondu de sortie du dernier côté
 * chevauche le tour suivant : coupé de part et d'autre de 0, à mi-chemin (.525). Entrées croissantes (exigé par interpolate).
 */
export function clesCote(i: 0 | 1 | 2 | 3): { inputRange: number[]; outputRange: number[] } {
  const [a, b] = [0.85, 0.2];
  if (i === 0) return { inputRange: [0, 0.976, 1.024, 3.952, 4], outputRange: [a, a, b, b, a] };
  if (i === 3) return { inputRange: [0, 0.024, 2.952, 3, 3.976, 4], outputRange: [(a + b) / 2, b, b, a, a, (a + b) / 2] };
  return { inputRange: [0, i - 0.048, i, i + 0.976, i + 1.024, 4], outputRange: [b, b, a, a, b, b] };
}

/** Minutes restantes, arrondies au-dessus (0 à la fin). */
export const minutesRestantes = (ecoule: number, total: number): number => Math.max(0, Math.ceil((total - ecoule) / 60));

/** « 6:40 » : minutes et secondes. */
export const mmss = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/** La phrase de l'autohypnose à `s` secondes (0 à phrases − 1). */
export const phraseHypnose = (s: number): number => Math.min(ENDORMIR.hypnose.phrases - 1, Math.floor(Math.max(0, s) / ENDORMIR.hypnose.secondes));

// ---------------------------------------------------------------- la carte « Ce soir » (B1, D10)

/**
 * Ce que la carte et les conseils lisent du calcul de la dette (sommeil-dette.ts, `SommeilDuJour`, de sommeil-calcul) :
 * la dette après les siestes du jour et le coucher conseillé. `SommeilDuJour` s'y passe tel quel.
 */
export interface DetteSoir {
  dette: Pick<Dette, "aRattraper" | "soirs" | "lourde" | "chiffre">;
  /** Coucher conseillé ce soir, minutes du jour (0 à 1439) ; null sous le seuil, en dette lourde ou sans coucher moyen. */
  coucher: number | null;
}

/** « 23:00 » (« 11:00 PM ») depuis des minutes du jour, au format de `heure()`. */
export const heureMin = (m: number): string => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return heureTexte(`${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`);
};

/** Les minutes d'un instant dans sa journée (heure locale). */
export const minuteDuJour = (instant: number): number => {
  const d = new Date(instant);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * La carte « Ce soir » (D10) : 2 h avant le coucher conseillé, jusqu'au coucher, et seulement s'il y a quelque chose à
 * rattraper ou un plan en cours (changement d'heure, voyage : `plan`). Rend les minutes avant le coucher, ou null.
 */
export function carteCeSoir(s: DetteSoir | null, maintenant: number, plan = false): { dans: number; coucher: number } | null {
  if (!s || s.coucher == null) return null;
  if (!plan && !(s.dette.chiffre && s.dette.aRattraper > 0)) return null;
  const dans = (((s.coucher - minuteDuJour(maintenant)) % 1440) + 1440) % 1440;
  return dans <= ENDORMIR.carteAvantMin ? { dans, coucher: s.coucher } : null;
}

/** Le lever habituel (minutes du jour), moyenne des levers (minutes depuis le minuit du réveil) ; null sans aucun. */
export function leverHabituel(levers: readonly (number | null | undefined)[]): number | null {
  const l = levers.filter((x): x is number => x != null && Number.isFinite(x));
  if (!l.length) return null;
  const m = Math.round(l.reduce((a, b) => a + b, 0) / l.length);
  return ((m % 1440) + 1440) % 1440;
}

// ---------------------------------------------------------------- les conseils du soir (B7, D11)

export type Conseil =
  | { type: "regularite"; ecart: number; coucher: number | null }
  | { type: "seance"; fin: number; titre: string | null; proche: boolean; coucherConnu: boolean }
  | { type: "vingtMin" };

export interface JourneeSoir {
  /** Couchers des dernières nuits, en minutes autour du minuit du réveil (versStat). */
  couchers: readonly (number | null | undefined)[];
  /** La dernière séance finie aujourd'hui : son heure de fin (ms) et son titre. */
  seance: { fin: number; titre: string | null } | null;
  /** Coucher conseillé (minutes du jour), sinon le coucher moyen ; null sans aucun. */
  coucher: number | null;
}

/**
 * Trois conseils au plus, tirés de la journée dans pepfit (D11) : la régularité du coucher (si elle varie de 30 min ou
 * plus), la séance du soir (si elle est finie aujourd'hui : gênante sous 1 h avant le coucher, rassurante sinon), la règle
 * des 20 min (toujours). Café et alcool sont une note fixe : pepfit ne les voit pas.
 */
export function conseilsDuSoir(j: JourneeSoir): Conseil[] {
  const l: Conseil[] = [];
  const couchers = j.couchers.filter((x): x is number => x != null && Number.isFinite(x)).slice(0, ENDORMIR.regularite.nuits);
  const sd = couchers.length >= ENDORMIR.regularite.minNuits ? ecartType(couchers) : null;
  if (sd != null && sd >= ENDORMIR.regularite.seuilMin) l.push({ type: "regularite", ecart: Math.round(sd), coucher: j.coucher });
  if (j.seance) {
    const fin = minuteDuJour(j.seance.fin);
    const avant = j.coucher == null ? null : (((j.coucher - fin) % 1440) + 1440) % 1440;
    l.push({ type: "seance", fin: j.seance.fin, titre: j.seance.titre, proche: avant != null && avant < ENDORMIR.seanceProcheMin, coucherConnu: avant != null });
  }
  l.push({ type: "vingtMin" });
  return l.slice(0, 3);
}
