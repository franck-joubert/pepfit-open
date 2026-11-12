// Séance passée (planche Lieux § 4) : ce que montrent la tête et chaque exercice. Pure : testée sans React.
import { INFO_NATURE, type Nature } from "../db/natures";

export interface ExercicePasse {
  nom: string;
  nature: Nature;
  /** Séries faites. */
  series: readonly { type: string; distance_m: number | null; volume: number }[];
}

export interface AffichageExercice {
  /** D7 : exercice seul à une seule ligne de durée, doublon de la durée de la séance. */
  cache: boolean;
  picto: boolean;
  nom: boolean;
  numeros: boolean;
}

export interface VuePassee {
  /**
   * Tout en haut, pleine largeur, derrière l'en-tête : la photo de la séance d'abord, à défaut l'image de son lieu
   * (docs/CODE-PHOTO-LIEU-SEANCE.md), sinon rien. Voir `couvertureSeance`.
   */
  couverture: Couverture;
  /** Le picto du sport de la séance, ou de l'exercice seul ; `null` sans sport et sans exercice seul. */
  heros: "picto" | null;
  /** Sous une couverture, le picto devient petit (pastille à côté du titre) ; sans couverture, il reste grand au-dessus du titre. */
  pictoPetit: boolean;
  volume: number;
  distanceM: number;
  /** Sport sans charge : ni « Volume 0 kg » ni « Séries 1 ». */
  avecVolume: boolean;
  avecSeries: boolean;
  /** Par exercice fait, dans l'ordre. */
  exercices: AffichageExercice[];
}

export type Couverture = "photo" | "lieu" | null;

/**
 * Ordre de priorité de l'image en tête : la photo de la séance elle-même, sinon l'image de son lieu (pas le visuel neutre),
 * sinon rien (le grand picto, comme avant).
 */
export function couvertureSeance(avecPhoto: boolean, avecImageLieu: boolean): Couverture {
  return avecPhoto ? "photo" : avecImageLieu ? "lieu" : null;
}

/**
 * `avecPhoto` : la séance a sa propre photo.
 * `avecSport` : la séance est d'un sport (padel, course…), même sans exercice fait : son picto est en tête, comme celui d'une activité détectée.
 * `avecLieu` : la séance a un lieu qui a une image (pas le visuel neutre) : elle est en tête quand la séance n'a pas de photo.
 */
export function vuePassee(exercices: readonly ExercicePasse[], titre: string, avecPhoto: boolean, avecSport = false, avecLieu = false): VuePassee {
  const faits = exercices.filter((e) => e.series.length > 0);
  const seul = faits.length === 1;
  const couverture = couvertureSeance(avecPhoto, avecLieu);
  const heros = seul || avecSport ? "picto" : null;
  const series = faits.flatMap((e) => e.series);
  const volume = series.filter((x) => x.type !== "echauffement").reduce((s, x) => s + x.volume, 0);
  const distanceM = series.reduce((s, x) => s + (x.distance_m ?? 0), 0);
  return {
    couverture,
    heros,
    pictoPetit: heros === "picto" && couverture != null,
    volume,
    distanceM,
    avecVolume: volume > 0,
    avecSeries: faits.some((e) => INFO_NATURE[e.nature].famille !== "temps"),
    exercices: faits.map((e) => {
      const uneLigne = seul && e.series.length === 1;
      return {
        // D7 : la ligne « 1 · 1 h 22 min » d'une activité à durée seule redit la durée de la séance.
        cache: uneLigne && e.nature === "duree",
        // Sous un grand visuel, l'exercice seul perd son petit picto, et son nom quand il est le titre.
        picto: !(seul && heros),
        nom: !(seul && heros && e.nom.trim().toLowerCase() === titre.trim().toLowerCase()),
        // Un exercice seul, une seule ligne : pas de numéro.
        numeros: !uneLigne,
      };
    }),
  };
}

/** Titre affiché : sans l'emoji de tête des titres importés (« 🏓 Padel » → « Padel »). Le titre en base ne change pas. */
export function titreAffiche(titre: string): string {
  return titre.replace(/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u200D|\s)+/u, "") || titre;
}

/**
 * Note affichée : sans les lignes techniques d'une synchro Whoop arrivées par l'import (« 🩸 Whoop: paddle-tennis | strain 15.2 |
 * HR 126/164 bpm ») ; ces valeurs reviendront dans le bloc d'effort (lot B). Le reste de la note est gardé ; la note en base ne change pas.
 */
export function noteAffichee(note: string | null): string | null {
  if (!note) return null;
  const l = note.split("\n").filter((x) => !/^\W*whoop:\s.*\|\s*strain\b/i.test(x.trim()));
  return l.join("\n").trim() || null;
}
