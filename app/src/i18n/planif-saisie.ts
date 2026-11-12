// Saisie libre d'une programmation (NOTES § Grammaire, reprise de Stache rapide.py) : « tous les lundis à 18h », « un
// mercredi sur deux », « le dernier dimanche du mois », « demain », « 18 nov », « every other wednesday », « at 6pm »…
// Français et anglais sont compris quelle que soit la langue de l'appli (l'allemand et l'espagnol ne sont pas encore lus :
// seule la phrase rendue existe dans ces langues) ; chaque mot inconnu est rapproché des mots connus
// (une lettre d'écart, deux à partir de six lettres, sans ambiguïté), les variantes courantes sont redressées (« tout lé
// jour » → « tous les jours », « everyday »), singulier et pluriel valent l'un pour l'autre, et les moments de la journée
// donnent une heure (matin 8h, midi 12h, après-midi 15h, soir 19h, nuit 22h ; « 9h le soir » → 21h). Une saisie qui reste
// incomprise reçoit une proposition (`suggerer`, lecture plus tolérante). Pur : testé par tests/planification.test.ts et
// tests/planif-saisie.test.ts.
import { ajouterJ, iso, jourSem, type Regle } from "../ecrans/planification";

export type { Langue } from "./detection";
import type { Langue } from "./detection";

export interface Correction {
  de: string;
  vers: string;
}

export interface Analyse {
  regle: Regle;
  /** Une heure a été saisie (sinon celle du profil, montrée en gris). */
  heureSaisie: boolean;
  corrections: Correction[];
}

const JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const JOURS_EN = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const JOURS_EN_COURTS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MOIS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fevr: 2, fev: 2, february: 2, feb: 2,
  mars: 3, march: 3, mar: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, june: 6, jun: 6,
  juillet: 7, juil: 7, july: 7, jul: 7,
  aout: 8, august: 8, aug: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};
const ORDINAUX: Record<string, number> = {
  "1er": 1, premier: 1, "1e": 1, first: 1, "1st": 1,
  "2e": 2, "2eme": 2, deuxieme: 2, second: 2, "2nd": 2,
  "3e": 3, "3eme": 3, troisieme: 3, third: 3, "3rd": 3,
  "4e": 4, "4eme": 4, quatrieme: 4, fourth: 4, "4th": 4,
  dernier: -1, last: -1,
};
const MOTS = [
  "tous", "toutes", "les", "le", "la", "chaque", "et", "un", "une", "sur", "deux", "jour", "jours", "semaine", "semaines",
  "mois", "du", "de", "prochain", "prochaine", "demain", "apres", "aujourd", "hui", "ce", "cette",
  "every", "other", "day", "days", "daily", "week", "weeks", "weekly", "on", "and", "the", "of", "month", "next", "tomorrow",
  "today", "this", "at", "soir", "tonight",
  // Moments de la journée, semaine et week-end, heures (connus : on ne les rapproche pas d'un jour, « matins » ≠ « mardis »).
  "matin", "matins", "midi", "midis", "soirs", "nuit", "nuits", "apresmidi", "apresmidis", "morning", "mornings", "noon",
  "afternoon", "afternoons", "evening", "evenings", "night", "nights", "weekend", "weekends", "end", "ends", "weekday",
  "weekdays", "vers", "around", "heure", "heures", "clock", "in", "au", "en", "fois", "through", "to",
];

/** Variantes courantes d'un mot (fautes d'oreille, mots collés, abréviations), redressées avant tout le reste. */
const VARIANTES: Record<string, string> = {
  tout: "tous", tou: "tous", toue: "tous", touts: "tous", tousse: "tous",
  toute: "toutes", tte: "toutes", ttes: "toutes",
  lez: "les", lai: "les", lais: "les", ls: "les",
  chaques: "chaque",
  jr: "jour", jrs: "jours", sem: "semaine",
  matinee: "matin", soiree: "soir", soirees: "soirs", aprem: "apresmidi", aprems: "apresmidis",
  everyday: "every day", evry: "every", evey: "every", eveyr: "every", tmrw: "tomorrow", tomorow: "tomorrow",
  "week-end": "weekend",
};

/** Tous les mots connus, et le jour (0 = lundi) de chacun. */
const JOUR_DE = new Map<string, number>();
JOURS_FR.forEach((j, i) => {
  JOUR_DE.set(j, i);
  JOUR_DE.set(j + "s", i);
});
JOURS_EN.forEach((j, i) => {
  JOUR_DE.set(j, i);
  JOUR_DE.set(j + "s", i);
});
JOURS_EN_COURTS.forEach((j, i) => JOUR_DE.set(j, i));
const VOCABULAIRE = [...new Set([...JOUR_DE.keys(), ...Object.keys(MOIS), ...Object.keys(ORDINAUX), ...MOTS])];

/** Minuscules, sans accents ; apostrophes, tirets et virgules deviennent des espaces. */
export function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’\-,.;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const l = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = l[0]!;
    l[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const avant = l[j]!;
      l[j] = Math.min(l[j]! + 1, l[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = avant;
    }
  }
  return l[b.length]!;
}

/**
 * Le mot connu le plus proche, s'il n'y en a qu'un à la plus petite distance permise. `tolerant` (proposition d'une saisie
 * incomprise) : dès trois lettres, une lettre d'écart de plus, et l'ambiguïté tranchée : même première lettre, puis un jour
 * (on planifie des jours : « mrdi » est mardi, pas midi), puis le mot le plus court.
 */
export function rapprocher(mot: string, tolerant = false): string | null {
  if (mot.length < (tolerant ? 3 : 4) || /\d/.test(mot)) return null;
  const permis = tolerant ? (mot.length >= 5 ? 2 : 1) : mot.length >= 6 ? 2 : 1;
  let meilleur = permis + 1;
  let choix: string[] = [];
  for (const v of VOCABULAIRE) {
    if (v.length < 3) continue;
    const d = distance(mot, v);
    if (d < meilleur) {
      meilleur = d;
      choix = [v];
    } else if (d === meilleur) choix.push(v);
  }
  if (meilleur > permis) return null;
  // Un pluriel et son singulier (« lundi », « lundis ») ne sont pas une ambiguïté.
  const sens = new Set(choix.map((c) => (JOUR_DE.has(c) ? `j${JOUR_DE.get(c)}` : MOIS[c] ? `m${MOIS[c]}` : c)));
  if (sens.size === 1) return choix.sort((a, b) => a.length - b.length)[0]!;
  if (!tolerant) return null;
  const rang = (c: string) => (c[0] === mot[0] ? 0 : 2) + (JOUR_DE.has(c) ? 0 : 1);
  return choix.sort((a, b) => rang(a) - rang(b) || a.length - b.length)[0]!;
}

const heureTexte = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** L'heure dans le texte (« à 18h », « 18h30 », « 18:00 », « at 6pm », « 6:30pm ») et le reste du texte. */
function extraireHeure(t: string): { heure: string | null; reste: string } {
  const formes: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/(?:^| )(?:at |a |vers |around )?(\d{1,2})(?::(\d{2}))? ?(am|pm)(?= |$)/, (m) => {
      let h = Number(m[1]);
      if (h < 1 || h > 12) return null;
      if (m[3] === "pm" && h < 12) h += 12;
      if (m[3] === "am" && h === 12) h = 0;
      return heureTexte(h, Number(m[2] ?? 0));
    }],
    [/(?:^| )(?:at |a |vers |around )?(\d{1,2})(?: ?h(?:eures?)?(?: ?(\d{2}))?|:(\d{2})| o clock)(?= |$)/, (m) => {
      const h = Number(m[1]);
      const mn = Number(m[2] ?? m[3] ?? 0);
      return h < 24 && mn < 60 ? heureTexte(h, mn) : null;
    }],
  ];
  for (const [re, f] of formes) {
    const m = t.match(re);
    if (!m) continue;
    const h = f(m);
    if (!h) return { heure: null, reste: "\u0000" };
    return { heure: h, reste: (t.slice(0, m.index) + " " + t.slice(m.index! + m[0].length)).replace(/\s+/g, " ").trim() };
  }
  return { heure: null, reste: t };
}

/** Moment de la journée : heure par défaut, et s'il fait passer « 9h » à 21h (après-midi, soir, nuit). */
type Moment = "matin" | "midi" | "apresmidi" | "soir" | "nuit";
const MOMENT_DE: Record<string, Moment> = {
  matin: "matin", matins: "matin", morning: "matin", mornings: "matin",
  midi: "midi", midis: "midi", noon: "midi",
  apresmidi: "apresmidi", apresmidis: "apresmidi", afternoon: "apresmidi", afternoons: "apresmidi",
  soir: "soir", soirs: "soir", evening: "soir", evenings: "soir",
  nuit: "nuit", nuits: "nuit", night: "nuit", nights: "nuit",
};
const MOMENTS: Record<Moment, { heure: number; apresMidi: boolean }> = {
  matin: { heure: 8, apresMidi: false },
  midi: { heure: 12, apresMidi: false },
  apresmidi: { heure: 15, apresMidi: true },
  soir: { heure: 19, apresMidi: true },
  nuit: { heure: 22, apresMidi: true },
};
const MOT_MOMENT = `(${Object.keys(MOMENT_DE).sort((a, b) => b.length - a.length).join("|")})`;

/**
 * Le moment de la journée dans le texte (« le soir », « du matin », « in the evening »), retiré du texte. « tous les
 * matins », « every evening » deviennent « tous les jours » ; « ce soir », « tonight » deviennent aujourd'hui.
 */
function extraireMoment(t: string): { moment: Moment | null; reste: string } {
  let x = ` ${t} `
    .replace(/ apres midis? /g, (m) => (m.includes("midis") ? " apresmidis " : " apresmidi "))
    .replace(/ (?:ce|cet|cette) (?=(?:matin|apresmidi|soir|nuit) )/g, " aujourd hui ")
    .replace(/ tonight /g, " today evening ")
    .replace(/ this (?=(?:morning|afternoon|evening) )/g, " today ")
    .replace(new RegExp(` (?:tous les|toutes les|chaque|every|les) ${MOT_MOMENT} `, "g"), " tous les jours $1 ")
    .replace(new RegExp(`^ (matins|soirs|nuits|mornings|evenings|nights|afternoons|apresmidis) `), " tous les jours $1 ");
  const m = x.match(new RegExp(` (?:(?:de l|de la|du|le|la|de|l|en|au|dans la|dans le|in the|the|at|a) )?${MOT_MOMENT}(?= )`));
  if (!m) return { moment: null, reste: t };
  x = x.slice(0, m.index) + " " + x.slice(m.index! + m[0].length);
  return { moment: MOMENT_DE[m[1]!]!, reste: x.replace(/\s+/g, " ").trim() };
}

/** Le prochain `jour` (0 = lundi) après `de`, ou `de` lui-même si `inclus`. */
function prochainJour(de: string, jour: number, inclus = false): string {
  const n = (jour - jourSem(de) + 7) % 7;
  return ajouterJ(de, n === 0 && !inclus ? 7 : n);
}

/** Jour et mois sans année : cette année, ou l'an prochain si la date est passée. */
function sansAnnee(aujourdhui: string, m: number, j: number, an?: number): string | null {
  if (m < 1 || m > 12 || j < 1 || j > 31) return null;
  const a = an ?? Number(aujourdhui.slice(0, 4));
  const d = iso(a, m, j);
  if (Number(d.slice(8)) !== j) return null;
  return an == null && d < aujourdhui ? iso(a + 1, m, j) : d;
}

const JR = `(${[...JOUR_DE.keys()].sort((a, b) => b.length - a.length).join("|")})`;
const LISTE = `${JR}(?: (?:et |and )?(?:le |on )?${JR})*`;
const jours = (s: string) => [...new Set(s.split(" ").filter((w) => JOUR_DE.has(w)).map((w) => JOUR_DE.get(w)!))].sort();

type Forme = [RegExp, (m: RegExpMatchArray, auj: string) => Omit<Regle, "heure" | "debut"> | null];
const R = (s: string) => new RegExp(`^${s}$`);
const FORMES: Forme[] = [
  // Mensuel : « le 1er samedi du mois », « le dernier dimanche du mois », « first saturday of the month ».
  [R(`(?:le |the )?(${Object.keys(ORDINAUX).join("|")}) ${JR} (?:du mois|de chaque mois|of the month|of every month|of each month)`),
    (m) => ({ freq: "mois", intervalle: 1, jours: [JOUR_DE.get(m[2]!)!], ordinal: ORDINAUX[m[1]!] })],
  // Tous les jours, tous les N jours, un jour sur deux.
  [R(`(?:(?:tous|toutes) les jours?|chaque jours?|every days?|daily|everyday)`), () => ({ freq: "jour", intervalle: 1, jours: [] })],
  [R(`(?:(?:un|1) jour sur (?:deux|2)|tous les deux jours|every other day|every second day)`), () => ({ freq: "jour", intervalle: 2, jours: [] })],
  [R(`(?:tous les|every) (\\d{1,2}) (?:jours?|days?)`), (m) => (Number(m[1]) > 0 ? { freq: "jour", intervalle: Number(m[1]), jours: [] } : null)],
  // En semaine, le week-end.
  [R(`(?:en semaine|(?:les |tous les )?jours de (?:la )?semaine|du lundi au vendredi|(?:on |every )?weekdays?|(?:from )?monday (?:to|through) friday)`),
    () => ({ freq: "semaine", intervalle: 1, jours: [0, 1, 2, 3, 4] })],
  [R(`(?:le |les |chaque |tous les |every |on |on the |the )?(?:weekends?|week ends?)`), () => ({ freq: "semaine", intervalle: 1, jours: [5, 6] })],
  // Un sur deux.
  [R(`(?:un|une) ${JR} sur (?:deux|2)`), (m) => ({ freq: "semaine", intervalle: 2, jours: [JOUR_DE.get(m[1]!)!] })],
  [R(`every other (${LISTE})`), (m) => ({ freq: "semaine", intervalle: 2, jours: jours(m[1]!) })],
  [R(`(?:toutes les|every) (\\d{1,2}|deux) (?:semaines|weeks) (?:le |les |on |the )?(${LISTE})`),
    (m) => {
      const n = m[1] === "deux" ? 2 : Number(m[1]);
      return n > 0 ? { freq: "semaine", intervalle: n, jours: jours(m[2]!) } : null;
    }],
  // Dates uniques.
  [R(`(?:demain|tomorrow)`), (_, auj) => ({ freq: "unique", intervalle: 1, jours: [], date: ajouterJ(auj, 1) })],
  [R(`(?:apres demain)`), (_, auj) => ({ freq: "unique", intervalle: 1, jours: [], date: ajouterJ(auj, 2) })],
  [R(`(?:aujourd hui|today|ce soir|tonight)`), (_, auj) => ({ freq: "unique", intervalle: 1, jours: [], date: auj })],
  [R(`(?:${JR} (?:prochain|prochaine)|next ${JR})`), (m, auj) => ({ freq: "unique", intervalle: 1, jours: [], date: prochainJour(auj, JOUR_DE.get((m[1] ?? m[2])!)!) })],
  [R(`(?:ce|this) ${JR}`), (m, auj) => ({ freq: "unique", intervalle: 1, jours: [], date: prochainJour(auj, JOUR_DE.get(m[1]!)!, true) })],
  [R(`(?:le |on )?(?:${JR} )?(\\d{1,2})(?:er)? (${Object.keys(MOIS).join("|")})(?: (\\d{4}))?`), (m, auj) => {
    const d = sansAnnee(auj, MOIS[m[3]!]!, Number(m[2]), m[4] ? Number(m[4]) : undefined);
    return d ? { freq: "unique", intervalle: 1, jours: [], date: d } : null;
  }],
  [R(`(?:on )?(?:${JR} )?(${Object.keys(MOIS).join("|")}) (\\d{1,2})(?:st|nd|rd|th)?(?: (\\d{4}))?`), (m, auj) => {
    const d = sansAnnee(auj, MOIS[m[2]!]!, Number(m[3]), m[4] ? Number(m[4]) : undefined);
    return d ? { freq: "unique", intervalle: 1, jours: [], date: d } : null;
  }],
  [/^(?:le )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/, (m, auj) => {
    const an = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
    const d = sansAnnee(auj, Number(m[2]), Number(m[1]), an);
    return d ? { freq: "unique", intervalle: 1, jours: [], date: d } : null;
  }],
  // Hebdomadaire : « tous les lundis », « le lundi », « chaque lundi », « lundi et jeudi », « every monday », « mondays ».
  [R(`(?:tous les |toutes les |chaque |le |les |every |on )?(${LISTE})`), (m) => ({ freq: "semaine", intervalle: 1, jours: jours(m[1]!) })],
];

/**
 * Analyse la saisie. `aujourdhui` : le jour ; `minutes` : l'heure qu'il est (minutes depuis minuit), pour « à 18h » seul
 * (aujourd'hui si l'heure n'est pas passée, demain sinon). Null si rien n'est compris.
 */
export function analyser(texte: string, aujourdhui: string, minutes: number): Analyse | null {
  return lire(preparer(texte, false), aujourdhui, minutes);
}

const CONNU = (w: string) => VOCABULAIRE.includes(w) || /^\d/.test(w) || ["a", "h", "s", "l", "o"].includes(w);

/** Les mots de la saisie, redressés (variantes, « tous le » → « tous les », fautes de frappe) et leurs corrections. */
function preparer(texte: string, tolerant: boolean): { mots: string[]; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const brut = ` ${texte.toLowerCase()} `.replace(/ week-ends? /g, (m) => m.replace("week-end", "weekend"));
  const mots = normaliser(brut)
    .split(" ")
    .filter(Boolean)
    .flatMap((w) => {
      const v = VARIANTES[w];
      if (v) corrections.push({ de: w, vers: v });
      return (v ?? w).split(" ");
    });
  // « tous le jour », « toutes la semaine » : après tous / toutes, l'article est « les ».
  for (let i = 1; i < mots.length; i++)
    if ((mots[i - 1] === "tous" || mots[i - 1] === "toutes") && ["le", "la", "l"].includes(mots[i]!)) {
      corrections.push({ de: mots[i]!, vers: "les" });
      mots[i] = "les";
    }
  return {
    mots: mots.map((w) => {
      if (CONNU(w)) return w;
      const v = rapprocher(w, tolerant);
      if (!v) return w;
      corrections.push({ de: w, vers: v });
      return v;
    }),
    corrections,
  };
}

/** La règle d'une saisie préparée : moment de la journée, heure, puis la première forme qui convient. */
function lire({ mots, corrections }: { mots: string[]; corrections: Correction[] }, aujourdhui: string, minutes: number): Analyse | null {
  const { moment, reste: sansMoment } = extraireMoment(mots.join(" "));
  let { heure, reste } = extraireHeure(sansMoment);
  if (reste === "\u0000") return null;
  if (moment) {
    // « le soir 9 », « 6 in the evening » : avec un moment, un nombre seul en fin de saisie est une heure.
    const nu = heure ? null : reste.match(/(?:^| )(?:(?:at|a|vers|around) )?(\d{1,2})$/);
    if (nu && Number(nu[1]) <= 12) {
      heure = heureTexte(Number(nu[1]), 0);
      reste = reste.slice(0, nu.index).trim();
    }
    const mo = MOMENTS[moment];
    if (!heure) heure = heureTexte(mo.heure, 0);
    else {
      const [h, mn] = heure.split(":").map(Number) as [number, number];
      // « 9h le soir » → 21h ; « 2h du matin » reste 2h ; « 11h la nuit » → 23h, « 1h la nuit » reste 1h.
      if (mo.apresMidi && h < 12 && (moment !== "nuit" || h >= 6)) heure = heureTexte(h + 12, mn);
    }
  }
  const fin = { heure, debut: aujourdhui };
  if (!reste) {
    if (!heure) return null;
    const [h, m] = heure.split(":").map(Number) as [number, number];
    const date = h * 60 + m > minutes ? aujourdhui : ajouterJ(aujourdhui, 1);
    return { regle: { freq: "unique", intervalle: 1, jours: [], date, ...fin }, heureSaisie: true, corrections };
  }
  // Singulier et pluriel valent l'un pour l'autre ; « tous les lundi » se lit « tous les lundis » (JOUR_DE a les deux).
  reste = reste.replace(/^(tous les|toutes les|every) (jour|day)$/, "$1 $2s");
  for (const [re, f] of FORMES) {
    const m = reste.match(re);
    if (!m) continue;
    const r = f(m, aujourdhui);
    if (!r || (r.freq === "semaine" && r.jours.length === 0)) return null;
    return { regle: { ...r, ...fin }, heureSaisie: heure != null, corrections };
  }
  return null;
}

/**
 * Proposition pour une saisie incomprise (« Tu veux dire : tous les jours à 18:00 ? ») : lecture tolérante (mots courts
 * rapprochés, une lettre d'écart de plus), puis sans les mots restés inconnus, puis sans un mot à la fois. Null : rien.
 */
export function suggerer(texte: string, aujourdhui: string, minutes: number): Analyse | null {
  if (!normaliser(texte)) return null;
  const pr = preparer(texte, true);
  // Sans les mots inconnus de la lecture stricte (« stp », « s'il te plaît ») : chiffres et mots du vocabulaire seulement.
  const strict = preparer(texte, false);
  const essais: { mots: string[]; corrections: Correction[] }[] = [
    pr,
    { mots: strict.mots.filter((w) => VOCABULAIRE.includes(w) || /^\d/.test(w)), corrections: strict.corrections },
  ];
  for (let i = 0; i < pr.mots.length && pr.mots.length > 1; i++) essais.push({ mots: pr.mots.filter((_, k) => k !== i), corrections: pr.corrections });
  for (const e of essais) {
    if (!e.mots.length) continue;
    const a = lire(e, aujourdhui, minutes);
    if (a) return a;
  }
  return null;
}

// ——— Phrase normalisée (aperçu, résumé, règle réécrite) ———

const NOMS: Record<Langue, { jours: string[]; mois: string[] }> = {
  fr: {
    jours: JOURS_FR,
    mois: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  },
  en: {
    jours: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    mois: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
  de: {
    jours: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
    mois: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
  },
  es: {
    jours: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    mois: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  },
};

/** Morceau de la phrase ; `corrige` : mot rapproché d'une faute de frappe (souligné en pointillé). */
export type Morceau = { texte: string; corrige?: boolean };

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function liste(l: string[], et: string): string {
  return l.length < 2 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} ${et} ${l[l.length - 1]}`;
}

/** Phrase de la règle, sans l'heure : « Tous les lundis », « Un mercredi sur deux », « Samedi 31 octobre »… */
export function phraseRegle(r: Regle, langue: Langue, corrections: Correction[] = []): Morceau[] {
  const n = NOMS[langue];
  const corriges = new Set(corrections.filter((c) => JOUR_DE.has(c.vers)).map((c) => JOUR_DE.get(c.vers)!));
  // Pluriel : « lundis » ; en espagnol, seuls sábado et domingo prennent un s (« los lunes », « los sábados »).
  const s = (i: number) => (langue === "es" && i < 5 ? "" : "s");
  const jour = (i: number, pluriel = false): Morceau => ({ texte: n.jours[i]! + (pluriel ? s(i) : ""), corrige: corriges.has(i) || undefined });
  const joints = (l: number[], pluriel = false): Morceau[] => {
    const et = { fr: "et", en: "and", de: "und", es: "y" }[langue];
    return l.flatMap((j, k): Morceau[] => [
      ...(k === 0 ? [] : [{ texte: k === l.length - 1 ? ` ${et} ` : ", " }]),
      jour(j, pluriel),
    ]);
  };
  const fr = langue === "fr";
  const out: Morceau[] = langue === "de" ? phraseDe(r, n.mois, jour, joints) : langue === "es" ? phraseEs(r, n.mois, jour, joints) : (() => {
    switch (r.freq) {
      case "jour":
        return [{ texte: r.intervalle === 1 ? (fr ? "tous les jours" : "every day") : fr ? `tous les ${r.intervalle} jours` : `every ${r.intervalle} days` }];
      case "semaine":
        if (r.intervalle === 1)
          return r.jours.length === 1 ? [{ texte: fr ? "tous les " : "every " }, jour(r.jours[0]!, fr)] : joints(r.jours);
        if (r.intervalle === 2 && r.jours.length === 1)
          return fr ? [{ texte: "un " }, jour(r.jours[0]!), { texte: " sur deux" }] : [{ texte: "every other " }, jour(r.jours[0]!)];
        return [{ texte: fr ? `toutes les ${r.intervalle} semaines le ` : `every ${r.intervalle} weeks on ` }, ...joints(r.jours)];
      case "mois": {
        const o = r.ordinal ?? 1;
        const ord = fr ? (o === -1 ? "dernier" : o === 1 ? "1er" : `${o}e`) : (["", "first", "second", "third", "fourth"][o] ?? "last");
        return fr
          ? [{ texte: `le ${ord} ` }, ...joints(r.jours), { texte: " du mois" }]
          : [{ texte: `${o === -1 ? "last" : ord} ` }, ...joints(r.jours), { texte: " of the month" }];
      }
      case "annee":
      case "unique": {
        const d = r.date ?? r.debut;
        const j = jourSem(d);
        const jj = Number(d.slice(8));
        const mm = n.mois[Number(d.slice(5, 7)) - 1]!;
        return fr ? [jour(j), { texte: ` ${jj} ${mm}` }] : [jour(j), { texte: `, ${mm} ${jj}` }];
      }
    }
  })();
  return [{ ...out[0]!, texte: majuscule(out[0]!.texte) }, ...out.slice(1)];
}

type Jour = (i: number, pluriel?: boolean) => Morceau;
type Joints = (l: number[], pluriel?: boolean) => Morceau[];

/** « Jeden Montag », « Jeden zweiten Mittwoch », « Am letzten Sonntag des Monats », « Samstag, 31. Oktober ». */
function phraseDe(r: Regle, mois: string[], jour: Jour, joints: Joints): Morceau[] {
  switch (r.freq) {
    case "jour":
      return [{ texte: r.intervalle === 1 ? "jeden Tag" : `alle ${r.intervalle} Tage` }];
    case "semaine":
      if (r.intervalle === 1) return r.jours.length === 1 ? [{ texte: "jeden " }, jour(r.jours[0]!)] : joints(r.jours);
      if (r.intervalle === 2 && r.jours.length === 1) return [{ texte: "jeden zweiten " }, jour(r.jours[0]!)];
      return [{ texte: `alle ${r.intervalle} Wochen am ` }, ...joints(r.jours)];
    case "mois": {
      const o = r.ordinal ?? 1;
      const ord = o === -1 ? "letzten" : (["", "ersten", "zweiten", "dritten", "vierten"][o] ?? "letzten");
      return [{ texte: `am ${ord} ` }, ...joints(r.jours), { texte: " des Monats" }];
    }
    case "annee":
    case "unique": {
      const d = r.date ?? r.debut;
      return [jour(jourSem(d)), { texte: `, ${Number(d.slice(8))}. ${mois[Number(d.slice(5, 7)) - 1]}` }];
    }
  }
}

/** « Todos los lunes », « Cada dos miércoles », « El último domingo del mes », « Sábado 31 de octubre ». */
function phraseEs(r: Regle, mois: string[], jour: Jour, joints: Joints): Morceau[] {
  switch (r.freq) {
    case "jour":
      return [{ texte: r.intervalle === 1 ? "todos los días" : `cada ${r.intervalle} días` }];
    case "semaine":
      if (r.intervalle === 1) return r.jours.length === 1 ? [{ texte: "todos los " }, jour(r.jours[0]!, true)] : joints(r.jours);
      if (r.intervalle === 2 && r.jours.length === 1) return [{ texte: "cada dos " }, jour(r.jours[0]!, true)];
      return [{ texte: `cada ${r.intervalle} semanas, el ` }, ...joints(r.jours)];
    case "mois": {
      const o = r.ordinal ?? 1;
      const ord = o === -1 ? "último" : (["", "primer", "segundo", "tercer", "cuarto"][o] ?? "último");
      return [{ texte: `el ${ord} ` }, ...joints(r.jours), { texte: " del mes" }];
    }
    case "annee":
    case "unique": {
      const d = r.date ?? r.debut;
      return [jour(jourSem(d)), { texte: ` ${Number(d.slice(8))} de ${mois[Number(d.slice(5, 7)) - 1]}` }];
    }
  }
}

export const texteMorceaux = (m: Morceau[]) => m.map((x) => x.texte).join("");

/** Texte enregistré d'une règle réécrite (« Mardi et jeudi à 18h » / « Tuesday and Thursday at 6:00 PM »). */
export function texteRegle(r: Regle, langue: Langue): string {
  const p = texteMorceaux(phraseRegle(r, langue));
  if (!r.heure) return p;
  const [h, m] = r.heure.split(":").map(Number) as [number, number];
  const mm = String(m).padStart(2, "0");
  if (langue === "fr") return `${p} à ${h}h${m ? mm : ""}`;
  if (langue === "de") return `${p} um ${h}${m ? `:${mm}` : ""} Uhr`;
  if (langue === "es") return `${p} a ${h === 1 ? "la" : "las"} ${h}:${mm}`;
  return `${p} at ${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
