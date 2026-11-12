// Valeurs stockées : echauffement = série W, rate = échec (la contrainte SQL de la migration 1 est conservée).
export type TypeSerie = "normale" | "echauffement" | "rate" | "degressive";

import type { Allure, Equipement, Nature } from "./natures";

/** `duree`, `distance` : meilleure valeur ; `allure` : secondes par kilomètre, plus bas = mieux. En assisté, `charge` = l'aide, plus bas = mieux. */
export type TypeRecord = "e1rm" | "charge" | "volume_serie" | "volume_seance" | "reps" | "duree" | "distance" | "allure";

export interface Exercice {
  id: string;
  nom: string;
  muscle: string | null;
  equipement: Equipement;
  poids_corps: number;
  slug: string | null;
  nom_en: string | null;
  secondaires: string;
  categorie: string | null;
  picto: string | null;
  perso: number;
  nature: Nature;
  allure: Allure | null;
  appareil_id: string | null;
  /** 1 : nature déduite à l'import, à confirmer. */
  a_verifier: number;
  /** Note d'exercice (migration 9) : épinglée, affichée à chaque fois qu'on fait l'exercice. */
  note: string | null;
  /** Tempo de l'exercice (migration 36) : null = défaut de sa famille, « off » = aucun, sinon « 3-0-1-0 » (ecrans/tempo.ts). */
  tempo: string | null;
  /** Photo de l'exercice (migration 70, D2) : photo et vignette dans documents/photos ; photo_distante, posée par la synchro. */
  photo: string | null;
  photo_vignette: string | null;
  photo_distante: string | null;
  /** Machine du catalogue (db/machines.ts) ; null = « Sans précision » (D4). */
  machine_id: string | null;
  /** Prénom du coach dont vient l'exercice (migration 100) : étiquette « De <coach> » ; null sinon. */
  coach: string | null;
  /** Slug de l'exercice du catalogue auquel cet exercice perso est relié (migration 186) : son picto et sa 3D s'appliquent. */
  lie_a: string | null;
  /** 1 : la suggestion de rattachement a été refusée, on ne la redemande plus (migration 186). */
  lien_refuse: number;
}

export interface RoutineExercice {
  id: string;
  routine_id: string;
  exercice_id: string;
  position: number;
  groupe_superset: number | null;
  nb_series: number;
  repos_s: number;
  /** Superset : temps entre deux exercices d'un tour (migration 31) ; 0 = on enchaîne. */
  repos_transition_s: number;
  /** Note de routine : affichée à chaque séance de cette routine. */
  note: string | null;
  /** 1 : les répétitions visées sont une plage (reps … reps_max). */
  plage_reps: number;
  /** Tempo « 3-1-1-0 » (descente, pause en bas, montée, pause en haut, en secondes) ; null = aucun. */
  tempo: string | null;
  /** Zone de FC visée (course d'un programme, migration 39) ; null = aucune. */
  zone?: number | null;
  /** Ressenti visé de la ligne (migration 41) : réserve de répétitions, 0 = Max … 3 = Facile ; null = aucun. */
  rir?: number | null;
}

export interface Serie {
  id: string;
  seance_id: string;
  exercice_id: string;
  position: number;
  groupe_superset: number | null;
  type: TypeSerie;
  kg: number | null;
  reps: number | null;
  faite: number;
  fait_le: number | null;
  volume: number;
  e1rm: number | null;
  precedent_kg: number | null;
  precedent_reps: number | null;
  precedent_duree_s: number | null;
  precedent_distance_m: number | null;
  duree_s: number | null;
  /** Durée prévue quand le compte à rebours a enregistré duree_s (migration 38) : l'écart s'affiche sous le temps. */
  duree_cible_s?: number | null;
  /** Ligne de routine d'origine, zone visée (1 à 5) et récupération après la série (migration 39, étapes d'une course). */
  ligne_id?: string | null;
  zone?: number | null;
  repos_s?: number | null;
  distance_m: number | null;
  rpe: number | null;
  /** Charge effective (D8) : pesée + lest ou − aide ; null sans pesée ou pour les natures sans poids du corps. */
  charge_eff: number | null;
  /** Plage de répétitions visée par la routine : simple indication dans le champ réps vide. */
  plage_min: number | null;
  plage_max: number | null;
}

export interface Seance {
  id: string;
  routine_id: string | null;
  titre: string | null;
  debut: number;
  fin: number | null;
  salle_id: string | null;
  note: string | null;
  /** Score ou niveau, texte libre (sports et cours, migration 44). */
  score?: string | null;
  /** Message écrit à la fin de l'activité, lu avec elle quand elle est partagée (migration 181, 280 signes au plus). */
  message?: string | null;
  /** Horaires d'origine d'une activité importée que la personne a modifiée (migration 182) ; null : jamais modifiée. */
  debut_orig?: number | null;
  fin_orig?: number | null;
  volume_kg: number;
  nb_series: number;
  /** Début de la pause en cours (ms) ou null ; `pause_cumul_s` : pauses déjà terminées. */
  pause_debut: number | null;
  pause_cumul_s: number;
}

export interface RecordExercice {
  id: string;
  exercice_id: string;
  type: TypeRecord;
  valeur: number;
  serie_id: string | null;
  seance_id: string;
  atteint_le: number;
  actuel: number;
}

export interface Pesee {
  id: string;
  date: number;
  kg: number;
  source: "manuel" | "sante_connect";
  /** Paquet Android de l'appli d'origine d'une pesée importée ; null sinon. */
  origine: string | null;
}

export interface Salle {
  id: string;
  nom: string;
  defaut: number;
  /** Équipements cochés, séparés par `|`. */
  equipements: string;
  ordre: number;
  /** Porte ouverte au partage plus tard : aucun écran. */
  proprietaire_id: string;
  publique: number;
  source_id: string | null;
  /** Salle OSM : adresse courte et position (null pour une salle perso). */
  adresse: string | null;
  lat: number | null;
  lon: number | null;
  /** Type de lieu (migration 25, registre db/lieux.ts) ; texte ouvert, « salle » par défaut. */
  type: string;
  /** Lieu privé partagé de cette salle (migration 190) : l'identifiant du lieu côté serveur ; null : salle non partagée. */
  lieu_partage?: string | null;
  cree_le: number;
  maj_le: number;
}

/** Photo d'une séance (une au plus) : chemins relatifs au dossier des documents. */
export interface PhotoSeance {
  id: string;
  seance_id: string;
  chemin_local: string;
  chemin_vignette: string;
  largeur: number;
  hauteur: number;
  octets: number;
  cle_distante: string | null;
  cree_le: number;
  maj_le: number;
}

export type TypeAppareil = "pile" | "poulie" | "smith" | "halteres" | "disques" | "assistance";

export interface Appareil {
  id: string;
  salle_id: string;
  nom: string;
  type: TypeAppareil;
  /** Liste dépliée des paliers, en kg (le pas régulier n'est qu'une façon de la saisir). */
  paliers_kg: number[];
  /** Machine du catalogue (machines.ts) ; null pour un appareil créé à la main. */
  machine_id: string | null;
  /** Palier et max dans l'unité de l'appareil (null : pas saisi ; max null = « Sans max »). */
  palier: number | null;
  max_val: number | null;
  unite: "kg" | "lbs";
}
