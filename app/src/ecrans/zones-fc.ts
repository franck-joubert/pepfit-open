// Zones de FC personnelles (NOTES-VMA.md § 4, validée le 29/10) : FC max et FC au repos retenues, puis les cinq
// zones par la méthode de Karvonen (part de la FC de réserve). Pur (sans React Native) : tests/zones-fc.test.ts.
//
// FC MAX (D2 : « Automatique » par défaut, le choix de la feuille FC max dans le réglage « fc_max_mode ») :
//   1. saisie : le réglage « fc_max » (100 à 240), seulement si l'on a choisi « Saisie » ;
//   2. mesurée : la plus haute FC vue en séance sur 12 mois (résumé Whoop de la séance, ou le pic tenu des échantillons du
//      capteur : la 5e plus haute valeur, un pic isolé ne compte pas), si elle vient d'un test VMA (6 min à fond : l'effort donne
//      presque la FC max) ou si elle dépasse l'estimée (une FC vue ne peut pas être au-dessus de ta vraie FC max ; plus
//      basse, elle dit seulement que tu n'es pas encore allé au bout) ;
//   3. estimée : Tanaka, 208 − 0,7 × âge [Tanaka 2001] ; à âge égal, la FC max varie de ±11 bpm (20 à 39 ans) à
//      ±20 bpm (70 à 79 ans) (écart type, Kaminsky 2015, tableau 2) ;
//   4. 190 sans âge (source « défaut », dite « par défaut » à l'écran ; la précision pepfit la compte pour rien). Une FC vue
//      plus basse ne passe pas devant : un pic modéré n'est pas une FC max (lot 6 de la précision, 30/10).
// FC AU REPOS : la médiane des nuits des 30 derniers jours (Whoop, sinon Santé Connect), une nuit au moins ; 30 à 110 bpm.
// ZONES : borne basse de Zk = FC repos + r × (FC max − FC repos), r = 50, 60, 70, 80, 90 % [Karvonen 1957] ; la part de la
// FC de réserve suit la part de la VO2 de réserve, pas celle de la VO2max [Swain 1997]. Sans FC au repos, ou si l'on a
// choisi « % de la FC max » (réglage « zones_methode ») : tranches de 10 % de la FC max, comme avant (la source le dit).
//
// [Tanaka 2001]   Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited. J Am Coll Cardiol
//                 2001;37(1):153-156. doi:10.1016/S0735-1097(00)01054-8
// [Karvonen 1957] Karvonen MJ, Kentala E, Mustala O. The effects of training on heart rate; a longitudinal study. Ann Med
//                 Exp Biol Fenn 1957;35(3):307-315.
// [Swain 1997]    Swain DP, Leutholtz BC. Heart rate reserve is equivalent to %VO2 reserve, not to %VO2max. Med Sci Sports
//                 Exerc 1997;29(3):410-414. doi:10.1097/00005768-199703000-00018

const JOUR = 86_400_000;

/** Parts de la FC de réserve (Karvonen) ou de la FC max (sans FC au repos) des bornes basses de Z1 à Z5. */
export const PARTS_ZONES = [0.5, 0.6, 0.7, 0.8, 0.9] as const;
export const FC_MAX_DEFAUT = 190;
export const JOURS_FC_MAX = 365;
export const JOURS_FC_REPOS = 30;
/** Au-delà, un « pic » est un artefact du capteur. */
export const FC_MAX_PLAUSIBLE = 220;

export type SourceFcMax = "saisie" | "mesuree" | "estimee" | "defaut";
/** Choix de la feuille FC max : automatique (mesurée, sinon d'après l'âge), d'après l'âge seulement, ou saisie. */
export type ModeFcMax = "auto" | "age" | "saisie";
/** Méthode demandée (page Zones de FC) : réserve cardiaque (Karvonen) ou tranches de la FC max. */
export type MethodeZones = "reserve" | "fcmax";
export type SourceFcRepos = "whoop" | "sante_connect";
export type Bornes = [number, number, number, number, number];

export interface FcMaxRetenue {
  bpm: number;
  source: SourceFcMax;
  /** Date de la séance de la FC mesurée. */
  date: number | null;
  /** La plus haute FC vue, même quand elle n'est pas retenue (« la plus haute vue : 172 ; fais le test VMA »). */
  vue: number | null;
}

export interface FcReposRetenue {
  bpm: number;
  source: SourceFcRepos;
  /** Nuits de la médiane. */
  n: number;
}

export interface Zones {
  methode: "karvonen" | "fcmax";
  bornes: Bornes;
  fcMax: FcMaxRetenue;
  fcRepos: FcReposRetenue | null;
}

export const fcMaxTanaka = (age: number): number => Math.round(208 - 0.7 * age);

/** Séance pour la FC max mesurée : le résumé Whoop (fcMax), le pic tenu déjà calculé (base) ou les échantillons du capteur. */
export interface SeanceFc {
  date: number;
  fcMax?: number | null;
  pic?: number | null;
  fc?: readonly { bpm: number }[];
  /** Séance « Test VMA » : 6 min à fond. */
  test?: boolean;
}

/** Pic d'une série d'échantillons, sur la médiane glissante de 5 valeurs (un pic isolé du capteur ne compte pas). */
export function picLisse(fc: readonly { bpm: number }[]): number | null {
  if (fc.length < 5) return null;
  let pic: number | null = null;
  for (let i = 2; i < fc.length - 2; i++) {
    const m = fc.slice(i - 2, i + 3).map((e) => e.bpm).sort((a, b) => a - b)[2]!;
    if (m <= FC_MAX_PLAUSIBLE && (pic == null || m > pic)) pic = m;
  }
  return pic;
}

/** Pic tenu d'une séance : la 5e plus haute valeur (cinq échantillons au moins à ce niveau) ; null sous 5 échantillons. */
export function picTenu(bpm: readonly number[]): number | null {
  const l = bpm.filter((b) => b > 0 && b <= FC_MAX_PLAUSIBLE).sort((a, b) => b - a);
  return l.length >= 5 ? l[4]! : null;
}

/** La plus haute FC vue en séance sur 12 mois, et si elle vient d'un test VMA. */
export function fcMaxVue(seances: readonly SeanceFc[], maintenant: number): { bpm: number; date: number; test: boolean } | null {
  let meilleur: { bpm: number; date: number; test: boolean } | null = null;
  for (const s of seances) {
    if (s.date > maintenant || maintenant - s.date > JOURS_FC_MAX * JOUR) continue;
    const resume = s.fcMax != null && s.fcMax > 0 && s.fcMax <= FC_MAX_PLAUSIBLE ? s.fcMax : null;
    const tenu = s.pic != null && s.pic > 0 && s.pic <= FC_MAX_PLAUSIBLE ? s.pic : 0;
    const pic = Math.max(resume ?? 0, tenu, s.fc ? (picLisse(s.fc) ?? 0) : 0);
    if (pic > 0 && (!meilleur || pic > meilleur.bpm)) meilleur = { bpm: Math.round(pic), date: s.date, test: !!s.test };
  }
  return meilleur;
}

export const saisieValide = (v: number | null): v is number => v != null && v >= 100 && v <= 240;

/**
 * FC max des zones : la saisie si on l'a choisie, sinon (automatique) la mesurée (test VMA, ou au-dessus de l'estimée), sinon
 * Tanaka, sinon 190 (dit « par défaut »). « D'après ton âge » saute la mesurée.
 */
export function resoudreFcMax(p: { mode?: ModeFcMax; saisie: number | null; age: number | null; seances: readonly SeanceFc[]; maintenant: number }): FcMaxRetenue {
  const mode = p.mode ?? "auto";
  const vue = fcMaxVue(p.seances, p.maintenant);
  const estimee = p.age != null && p.age > 0 ? fcMaxTanaka(p.age) : null;
  const base = { vue: vue?.bpm ?? null };
  if (mode === "saisie" && saisieValide(p.saisie)) return { ...base, bpm: Math.round(p.saisie), source: "saisie", date: null };
  if (mode !== "age" && vue && (vue.test || vue.bpm > (estimee ?? FC_MAX_DEFAUT))) return { ...base, bpm: vue.bpm, source: "mesuree", date: vue.date };
  if (estimee != null) return { ...base, bpm: estimee, source: "estimee", date: null };
  return { ...base, bpm: FC_MAX_DEFAUT, source: "defaut", date: null };
}

/** FC au repos des zones : médiane des nuits des 30 derniers jours (Whoop d'abord), null sans nuit. */
export function resoudreFcRepos(
  nuits: readonly { date: number; bpm: number; source: SourceFcRepos }[],
  maintenant: number,
): FcReposRetenue | null {
  const recentes = nuits.filter((n) => n.date <= maintenant && maintenant - n.date <= JOURS_FC_REPOS * JOUR && n.bpm >= 30 && n.bpm <= 110);
  if (!recentes.length) return null;
  const whoop = recentes.filter((n) => n.source === "whoop");
  const l = (whoop.length ? whoop : recentes).map((n) => n.bpm).sort((a, b) => a - b);
  const m = l.length % 2 ? l[(l.length - 1) / 2]! : (l[l.length / 2 - 1]! + l[l.length / 2]!) / 2;
  return { bpm: Math.round(m), source: whoop.length ? "whoop" : "sante_connect", n: l.length };
}

/** Bornes basses de Z1 à Z5 par Karvonen, arrondies au bpm supérieur (181 et 50 → 116, 129, 142, 155, 168). */
export function bornesKarvonen(fcMax: number, fcRepos: number): Bornes {
  const reserve = Math.max(1, fcMax - fcRepos);
  return PARTS_ZONES.map((r) => Math.ceil(fcRepos + r * reserve - 1e-9)) as Bornes;
}

/** Bornes basses de Z1 à Z5 en tranches de 10 % de la FC max (sans FC au repos). */
export function bornesFcMax(fcMax: number): Bornes {
  return PARTS_ZONES.map((r) => Math.ceil(r * fcMax - 1e-9)) as Bornes;
}

/** Les zones de la personne : Karvonen avec une FC au repos (sauf si l'on a choisi la FC max), sinon la part de la FC max. */
export function zonesPersonnelles(fcMax: FcMaxRetenue, fcRepos: FcReposRetenue | null, methode: MethodeZones = "reserve"): Zones {
  const karvonen = methode === "reserve" && fcRepos != null && fcRepos.bpm < fcMax.bpm - 20;
  return {
    methode: karvonen ? "karvonen" : "fcmax",
    bornes: karvonen ? bornesKarvonen(fcMax.bpm, fcRepos.bpm) : bornesFcMax(fcMax.bpm),
    fcMax,
    fcRepos: karvonen ? fcRepos : null,
  };
}

/** Zone 1 à 5 (0 sous Z1) d'après les bornes. */
export function zoneDans(bpm: number, bornes: Readonly<Bornes>): 0 | 1 | 2 | 3 | 4 | 5 {
  for (let i = 4; i >= 0; i--) if (bpm >= bornes[i]!) return (i + 1) as 1 | 2 | 3 | 4 | 5;
  return 0;
}

/** Plages affichées « 116–128 » de Z1 à Z5 (Z5 jusqu'à la FC max). */
export function plagesZones(z: Zones): { bas: number; haut: number }[] {
  return z.bornes.map((b, i) => ({ bas: b, haut: i < 4 ? z.bornes[i + 1]! - 1 : z.fcMax.bpm }));
}

/**
 * Ce qui classe une FC dans les écrans et les calculs : les zones personnelles, ou un nombre (une FC max seule : ses tranches
 * de 10 %, comme avant ; démonstrations et tests).
 */
export type RefZones = number | Zones;
export const bornesDe = (r: RefZones): Bornes => (typeof r === "number" ? bornesFcMax(r) : r.bornes);
export const maxDe = (r: RefZones): number => (typeof r === "number" ? r : r.fcMax.bpm);

/** Milieux des zones Z1 à Z5, en part de la FC de réserve (TRIMP de Banister) ; tranches de la FC max : selon la FC au repos du jour. */
export function milieuxReserve(r: RefZones, fcRepos: number): number[] {
  const milieux = PARTS_ZONES.map((p) => p + 0.05);
  if (typeof r !== "number" && r.methode === "karvonen") return milieux;
  const max = maxDe(r), reserve = Math.max(1, max - fcRepos);
  return milieux.map((m) => (m * max - fcRepos) / reserve);
}
