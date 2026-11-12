// Messages de bienvenue de l'Accueil (27/10) : le titre en tête de l'onglet, tiré une fois par ouverture.
// {p} : le prénom, jamais en tête (sans prénom, « , {p} » ou « {p} » disparaît) ; {n} : semaines de la série.
// Tutoiement, mots neutres en genre (l'appli sert à tout le monde), 40 caractères au plus avec le prénom.

export type Sport = "padel" | "raquette" | "course" | "velo" | "natation" | "muscu" | "autre";

export interface ContexteBienvenue {
  /** Heure locale, 0 à 23. */
  heure: number;
  /** Sport le plus pratiqué sur 30 jours (au moins deux séances), null sinon. */
  sport: Sport | null;
  /** Semaines d'affilée en cours. */
  serie: number;
  /** Jours depuis la dernière séance terminée, null sans aucune séance. */
  repos: number | null;
  /** Une séance est prévue aujourd'hui et pas encore faite. */
  seanceAujourdhui: boolean;
  /** Un record ces trois derniers jours. */
  recordRecent: boolean;
}

/** general : toujours possible ; moment : selon l'heure ; contexte : selon l'activité (poids le plus fort). */
export type Genre = "general" | "moment" | "contexte";

export interface MessageBienvenue {
  id: string;
  genre: Genre;
  quand?: (c: ContexteBienvenue) => boolean;
  fr: string;
  en: string;
  de: string;
  es: string;
}

const entre = (de: number, a: number) => (c: ContexteBienvenue) => (de <= a ? c.heure >= de && c.heure < a : c.heure >= de || c.heure < a);
const sport = (s: Sport) => (c: ContexteBienvenue) => c.sport === s;
/** Pause longue : deux semaines sans séance. */
export const PAUSE_JOURS = 14;
/** Série mise en avant à partir de trois semaines. */
export const SERIE_MIN = 3;

export const MESSAGES: readonly MessageBienvenue[] = [
  { id: "onyva", genre: "general", fr: "On y va, {p} ?", en: "Shall we, {p}?", de: "Los geht's, {p}?", es: "¿Vamos, {p}?" },
  { id: "bonneseance", genre: "general", fr: "Bonne séance, {p}", en: "Have a good session, {p}", de: "Gutes Training, {p}", es: "Buen entreno, {p}" },
  { id: "atoi", genre: "general", fr: "À toi de jouer, {p}", en: "Your move, {p}", de: "Du bist dran, {p}", es: "Te toca, {p}" },
  { id: "prevu", genre: "general", fr: "Quoi de prévu, {p} ?", en: "What's the plan, {p}?", de: "Was steht an, {p}?", es: "¿Qué toca hoy, {p}?" },
  { id: "alors", genre: "general", fr: "Alors, {p}, on fait quoi ?", en: "So, {p}, what's next?", de: "Und, {p}, was machen wir?", es: "¿Y bien, {p}, qué hacemos?" },
  { id: "retour", genre: "general", fr: "Bon retour, {p}", en: "Welcome back, {p}", de: "Schön, dass du da bist, {p}", es: "Qué bien verte, {p}" },

  { id: "bonjour", genre: "moment", quand: entre(5, 18), fr: "Bonjour {p}", en: "Hello {p}", de: "Hallo {p}", es: "Hola, {p}" },
  { id: "matin", genre: "moment", quand: entre(5, 11), fr: "Bonne matinée, {p}", en: "Morning, {p}", de: "Guten Morgen, {p}", es: "Buenos días, {p}" },
  { id: "tot", genre: "moment", quand: entre(5, 7), fr: "Debout tôt, {p}", en: "Up early, {p}", de: "Früh wach, {p}", es: "Madrugando, {p}" },
  { id: "aprem", genre: "moment", quand: entre(13, 18), fr: "Bon après-midi, {p}", en: "Good afternoon, {p}", de: "Schönen Nachmittag, {p}", es: "Buenas tardes, {p}" },
  { id: "bonsoir", genre: "moment", quand: entre(18, 5), fr: "Bonsoir {p}", en: "Good evening, {p}", de: "Guten Abend, {p}", es: "Buenas noches, {p}" },
  { id: "soiree", genre: "moment", quand: entre(18, 23), fr: "Bonne soirée, {p}", en: "Have a good evening, {p}", de: "Schönen Abend, {p}", es: "Que tengas buena noche, {p}" },
  { id: "debout", genre: "moment", quand: entre(23, 5), fr: "Encore debout, {p} ?", en: "Still up, {p}?", de: "Noch wach, {p}?", es: "¿Sigues en pie, {p}?" },
  { id: "nuit", genre: "moment", quand: entre(22, 5), fr: "Séance de nuit, {p} ?", en: "Night session, {p}?", de: "Nachttraining, {p}?", es: "¿Entreno nocturno, {p}?" },

  { id: "vamos", genre: "contexte", quand: sport("padel"), fr: "Vamos, {p} !", en: "Vamos, {p}!", de: "Vamos, {p}!", es: "¡Vamos, {p}!" },
  { id: "padel", genre: "contexte", quand: sport("padel"), fr: "Une partie de padel, {p} ?", en: "Padel today, {p}?", de: "Eine Runde Padel, {p}?", es: "¿Un partido de pádel, {p}?" },
  { id: "raquette", genre: "contexte", quand: sport("raquette"), fr: "Raquette en main, {p} ?", en: "Racket ready, {p}?", de: "Schläger bereit, {p}?", es: "¿Raqueta en mano, {p}?" },
  { id: "foulee", genre: "contexte", quand: sport("course"), fr: "On allonge la foulée, {p} ?", en: "A longer stride today, {p}?", de: "Heute längere Schritte, {p}?", es: "¿Alargamos la zancada, {p}?" },
  { id: "baskets", genre: "contexte", quand: sport("course"), fr: "Les baskets t'attendent, {p}", en: "Your shoes are waiting, {p}", de: "Deine Laufschuhe warten, {p}", es: "Tus zapatillas te esperan, {p}" },
  { id: "repart", genre: "contexte", quand: sport("muscu"), fr: "On repart, {p}", en: "Back at it, {p}", de: "Weiter geht's, {p}", es: "Volvemos, {p}" },
  { id: "barre", genre: "contexte", quand: sport("muscu"), fr: "La barre t'attend, {p}", en: "The bar is waiting, {p}", de: "Die Hantel wartet, {p}", es: "La barra te espera, {p}" },
  { id: "selle", genre: "contexte", quand: sport("velo"), fr: "En selle, {p}", en: "Saddle up, {p}", de: "Auf den Sattel, {p}", es: "A pedalear, {p}" },
  { id: "bassin", genre: "contexte", quand: sport("natation"), fr: "Le bassin t'attend, {p}", en: "The pool is waiting, {p}", de: "Das Becken wartet, {p}", es: "La piscina te espera, {p}" },

  { id: "serie", genre: "contexte", quand: (c) => c.serie >= SERIE_MIN, fr: "{n} semaines, {p}. On continue.", en: "{n} weeks, {p}. Still going.", de: "{n} Wochen, {p}. Weiter so.", es: "{n} semanas, {p}. Seguimos." },
  { id: "affilee", genre: "contexte", quand: (c) => c.serie >= SERIE_MIN, fr: "{n} semaines d'affilée, {p}", en: "{n} weeks in a row, {p}", de: "{n} Wochen am Stück, {p}", es: "{n} semanas seguidas, {p}" },
  { id: "revoir", genre: "contexte", quand: (c) => c.repos != null && c.repos >= PAUSE_JOURS, fr: "Ça fait plaisir de te revoir, {p}", en: "Good to have you back, {p}", de: "Schön, dich wiederzusehen, {p}", es: "Qué alegría volver a verte, {p}" },
  { id: "revoila", genre: "contexte", quand: (c) => c.repos != null && c.repos >= PAUSE_JOURS, fr: "Te revoilà, {p}", en: "There you are, {p}", de: "Da bist du wieder, {p}", es: "Aquí estás otra vez, {p}" },
  { id: "aujourdhui", genre: "contexte", quand: (c) => c.seanceAujourdhui, fr: "Séance prévue aujourd'hui, {p}", en: "Session planned today, {p}", de: "Heute steht Training an, {p}", es: "Hoy toca entrenar, {p}" },
  { id: "lejour", genre: "contexte", quand: (c) => c.seanceAujourdhui, fr: "C'est le jour, {p}", en: "Today's the day, {p}", de: "Heute ist der Tag, {p}", es: "Hoy es el día, {p}" },
  { id: "record", genre: "contexte", quand: (c) => c.recordRecent, fr: "Joli record, {p}", en: "Nice record, {p}", de: "Starker Rekord, {p}", es: "Buen récord, {p}" },
  { id: "bienjoue", genre: "contexte", quand: (c) => c.recordRecent, fr: "Nouveau record, {p}. Bien joué.", en: "New record, {p}. Well played.", de: "Neuer Rekord, {p}. Gut gemacht.", es: "Nuevo récord, {p}. Bien hecho." },
  { id: "round", genre: "contexte", quand: (c) => c.repos === 0, fr: "Deuxième round, {p} ?", en: "Round two, {p}?", de: "Zweite Runde, {p}?", es: "¿Segundo asalto, {p}?" },
  { id: "bienvenue", genre: "contexte", quand: (c) => c.repos == null, fr: "Bienvenue, {p}", en: "Welcome, {p}", de: "Willkommen, {p}", es: "Te damos la bienvenida, {p}" },
];
