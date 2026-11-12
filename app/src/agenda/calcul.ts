// Agenda du téléphone (planche agenda-ics, validée le 03/11 ; docs/CODE-AGENDA.md) : la part sans base ni module natif,
// testée seule (tests/agenda-telephone.test.ts). Tout est en instants (ms) : les jours et les heures du fuseau choisi sont
// convertis par l'appelant (synchro.ts).

/** Un événement lu dans un agenda du téléphone. */
export interface EvenementAgenda {
  id: string;
  calendrierId: string;
  titre: string;
  debut: number;
  fin: number;
  /** Toute la journée : ne compte pas comme « pris ». */
  journee: boolean;
  /** Marqué « disponible » dans l'agenda : ne compte pas non plus. */
  libre: boolean;
  /** Description de l'événement : celle d'un événement écrit par pepfit porte sa marque (`estDePepfit`). */
  notes?: string;
}

export interface Creneau {
  debut: number;
  fin: number;
}

/**
 * Lien entre une séance prévue et l'événement que pepfit a écrit pour elle. `cle` : « programmation|jour d'origine », stable
 * quand la séance est décalée. `etat` : écrite (à jour), déplacée dans l'agenda (D12, mention « Déplacée dans ton agenda »),
 * retirée de l'agenda (D13, gardée ici, « Remettre »).
 */
export interface LienAgenda {
  cle: string;
  programmationId: string;
  dateOrigine: string;
  evenementId: string;
  debut: number;
  fin: number;
  etat: "ecrite" | "deplacee" | "retiree";
  /**
   * L'événement a été relu au moins une fois sous cet identifiant (migration 64). Tant que non, il ne peut pas être dit
   * « retiré » : un identifiant jamais relu ne prouve rien (03/11).
   */
  vu: boolean;
  /** Empreinte du titre, du lieu et de la description écrits (`empreinte`) ; null : inconnue (écrit avant le 03/11). */
  contenu: string | null;
}

/** Une séance prévue, telle que pepfit la voit maintenant. */
export interface SeanceAgenda {
  cle: string;
  programmationId: string;
  dateOrigine: string;
  routineId: string;
  /** Titre de l'événement, au format choisi (titre.ts). */
  titre: string;
  /** Description (exercices, durée, « Planifiée dans pepfit » et le lien) et lieu de l'événement (null : aucun). */
  notes: string;
  lieu: string | null;
  debut: number;
  fin: number;
  /**
   * Faite, ou au-delà de la fenêtre écrite (déplacée loin dans l'agenda) : ni écrite, ni mise à jour, ni retirée de
   * l'agenda ; son événement reste comme il est.
   */
  figee: boolean;
}

export const cleSeance = (programmationId: string, dateOrigine: string) => `${programmationId}|${dateOrigine}`;

/** L'inverse de `cleSeance` (paramètre `seance` de la fiche, lien écrit dans l'agenda) ; null si la forme ne va pas. */
export function lireCleSeance(cle: string | null | undefined): { programmationId: string; dateOrigine: string } | null {
  if (!cle) return null;
  const i = cle.lastIndexOf("|");
  const date = cle.slice(i + 1);
  if (i <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { programmationId: cle.slice(0, i), dateOrigine: date };
}

/**
 * Lieu écrit pour une séance (migration 68) : celui choisi pour elle (null : « Aucun lieu », le champ reste vide), sinon
 * celui de la dernière séance faite avec sa routine, sinon rien.
 */
export const lieuDeSeance = (choisis: ReadonlyMap<string, string | null> | undefined, derniers: ReadonlyMap<string, string>, cle: string, routineId: string): string | null =>
  choisis?.has(cle) ? choisis.get(cle)! : (derniers.get(routineId) ?? null);

/**
 * Marque d'un événement écrit par pepfit (03/11) : le lien `pepfitopen://routine/view/…` (ou `pepfitopen://seance-groupe/…`) de sa description, ou la ligne
 * « Planifiée dans pepfit » (« Planned in pepfit »), quelle que soit la langue du moment.
 */
const MARQUE = /pepfitopen:\/\/routine\/view\/|pepfitopen:\/\/seance-groupe\/|Planifiée dans pepfit|Planned in pepfit/;
export const estDePepfit = (notes: string | null | undefined) => !!notes && MARQUE.test(notes);

/** Lien écrit dans la description : la routine, et la séance (`seance`, depuis le 03/11) pour la retrouver sans identifiant. */
export const lienSeance = (routineId: string, cle?: string) =>
  `pepfitopen://routine/view/${encodeURIComponent(routineId)}${cle ? `?seance=${encodeURIComponent(cle)}` : ""}`;

/**
 * L'événement d'une séance, retrouvé dans l'agenda écrit quand son identifiant ne répond plus (03/11 : Google peut le
 * réinsérer sous un autre) : par la séance écrite dans son lien, sinon (écrit avant le 03/11) par le lien de sa routine et
 * son début.
 */
export function retrouver(lien: LienAgenda, routineId: string, ecrits: readonly EvenementAgenda[]): EvenementAgenda | null {
  const parSeance = `?seance=${encodeURIComponent(lien.cle)}`;
  const parRoutine = lienSeance(routineId);
  const marques = ecrits.filter((e) => estDePepfit(e.notes));
  return (
    marques.find((e) => e.notes!.includes(parSeance)) ??
    marques.find((e) => e.debut === lien.debut && e.notes!.split("\n").some((l) => l.trim() === parRoutine)) ??
    null
  );
}

/** Empreinte de ce qui est écrit dans l'événement, hors heures : un changement de format ou de routine le réécrit. */
export function empreinte(s: Pick<SeanceAgenda, "titre" | "lieu" | "notes">): string {
  let h = 5381;
  for (const c of `${s.titre}\u0000${s.lieu ?? ""}\u0000${s.notes}`) h = (Math.imul(h, 33) ^ c.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

/** Jours écrits dans l'agenda : aujourd'hui et les 28 suivants (un événement par séance, sans règle de répétition). */
export const FENETRE_ECRITE_J = 28;
/** Durée écrite quand la routine n'a pas de durée estimée. */
export const DUREE_DEFAUT_MIN = 60;
/** Bornes du créneau libre (D15) : de 06:00 à 22:00, au quart d'heure. */
export const JOUR_DEBUT_MIN = 6 * 60;
export const JOUR_FIN_MIN = 22 * 60;
export const PAS_MIN = 15;
const MIN = 60_000;

/**
 * Ce que la synchro doit faire (D11 à D13). L'agenda gagne quand les deux ont bougé : la personne y a déplacé la séance en
 * dernier, ici on ne fait que suivre.
 */
export type ActionAgenda =
  | { genre: "creer"; seance: SeanceAgenda }
  /** Relu une première fois sous son identifiant. */
  | { genre: "vu"; lien: LienAgenda }
  /** Retrouvé sous un autre identifiant (03/11) : le lien le suit ; une séance « retirée » à tort redevient écrite. */
  | { genre: "relier"; seance: SeanceAgenda; lien: LienAgenda; evenement: EvenementAgenda }
  /** Jamais relu, et introuvable : réécrit, sans rien dire. */
  | { genre: "recreer"; seance: SeanceAgenda; lien: LienAgenda }
  | { genre: "maj"; seance: SeanceAgenda; lien: LienAgenda }
  | { genre: "deplacee"; seance: SeanceAgenda; lien: LienAgenda; vers: Creneau }
  | { genre: "retiree"; seance: SeanceAgenda; lien: LienAgenda }
  | { genre: "supprimer"; lien: LienAgenda }
  | { genre: "oublier"; lien: LienAgenda };

/**
 * Plan de la synchro. `evenements` : pour chaque lien, l'événement relu par son identifiant (null : introuvable). `ecrits` :
 * les événements de l'agenda écrit sur la fenêtre (null : lecture ratée), où l'on retrouve une séance dont l'identifiant ne
 * répond plus. « Retirée » (D13) seulement si l'événement, déjà relu une fois, n'est plus nulle part. `debutFenetre` : minuit
 * d'aujourd'hui ; un lien dont la séance a disparu de pepfit voit son événement supprimé s'il est à venir, oublié sinon (le
 * passé de l'agenda ne bouge pas).
 */
export function planSynchro(
  seances: readonly SeanceAgenda[],
  liens: readonly LienAgenda[],
  evenements: ReadonlyMap<string, Creneau | null>,
  debutFenetre: number,
  ecrits: readonly EvenementAgenda[] | null = [],
): ActionAgenda[] {
  const out: ActionAgenda[] = [];
  const parCle = new Map(liens.map((l) => [l.cle, l]));
  const vues = new Set<string>();
  for (const s of seances) {
    vues.add(s.cle);
    if (s.figee) continue;
    const lien = parCle.get(s.cle);
    if (!lien) {
      out.push({ genre: "creer", seance: s });
      continue;
    }
    const autre = () => (ecrits ? retrouver(lien, s.routineId, ecrits) : null);
    // Retirée de l'agenda : gardée ici, pas réécrite d'office (D13) ; « Remettre » la recrée. Sauf si elle y est encore, sous
    // un autre identifiant : retirée à tort (03/11), elle redevient écrite.
    if (lien.etat === "retiree") {
      const e = autre();
      if (e) out.push({ genre: "relier", seance: s, lien, evenement: e });
      continue;
    }
    const ev = evenements.get(lien.evenementId);
    if (ev === undefined) continue;
    if (ev === null) {
      // Lecture de l'agenda ratée : rien de sûr, on attend la prochaine fois.
      if (!ecrits) continue;
      const e = autre();
      if (e) out.push({ genre: "relier", seance: s, lien, evenement: e });
      else out.push(lien.vu ? { genre: "retiree", seance: s, lien } : { genre: "recreer", seance: s, lien });
      continue;
    }
    // Relu : le lien est « vu » (porté par l'action qui suit, ou seul).
    const vu = lien.vu ? lien : { ...lien, vu: true };
    if (ev.debut !== lien.debut) out.push({ genre: "deplacee", seance: s, lien: vu, vers: ev });
    else if (s.debut !== lien.debut || s.fin !== lien.fin || lien.contenu !== empreinte(s)) out.push({ genre: "maj", seance: s, lien: vu });
    else if (!lien.vu) out.push({ genre: "vu", lien: vu });
  }
  for (const lien of liens) {
    if (vues.has(lien.cle)) continue;
    const avenir = lien.debut >= debutFenetre && lien.etat !== "retiree";
    out.push(avenir ? { genre: "supprimer", lien } : { genre: "oublier", lien });
  }
  return out;
}

/** « Réécrire mes séances dans l'agenda » (03/11) : chaque séance de la fenêtre est créée, ou son événement mis à jour. */
export type ActionReecriture = { genre: "creer"; seance: SeanceAgenda } | { genre: "maj"; seance: SeanceAgenda; lien: LienAgenda; evenementId: string };

/**
 * Plan de la réécriture, même pour les séances « retirées » (D13 : c'est la personne qui le demande). Un événement encore là,
 * par son identifiant ou retrouvé dans l'agenda écrit, est mis à jour, jamais doublé ; seul celui qui n'est plus nulle part
 * est recréé. Une lecture ratée (identifiant non relu, ou agenda écrit illisible) laisse la séance telle quelle.
 */
export function planReecriture(
  seances: readonly SeanceAgenda[],
  liens: readonly LienAgenda[],
  evenements: ReadonlyMap<string, Creneau | null>,
  ecrits: readonly EvenementAgenda[] | null,
): ActionReecriture[] {
  const parCle = new Map(liens.map((l) => [l.cle, l]));
  const out: ActionReecriture[] = [];
  for (const s of seances) {
    if (s.figee) continue;
    const lien = parCle.get(s.cle);
    if (!lien) {
      out.push({ genre: "creer", seance: s });
      continue;
    }
    const ev = evenements.get(lien.evenementId);
    if (ev) out.push({ genre: "maj", seance: s, lien, evenementId: lien.evenementId });
    else if (ev === null && ecrits) {
      const e = retrouver(lien, s.routineId, ecrits);
      out.push(e ? { genre: "maj", seance: s, lien, evenementId: e.id } : { genre: "creer", seance: s });
    }
  }
  return out;
}

/**
 * Ce qui compte quand on est pris :ni la journée entière, ni « disponible », ni ce que pepfit a écrit lui-même, reconnu par
 * son identifiant gardé ou par sa marque (03/11 : un identifiant changé faisait d'une séance son propre conflit).
 */
export function evenementsPris(evenements: readonly EvenementAgenda[], ecritsParPepfit: ReadonlySet<string>): EvenementAgenda[] {
  return evenements
    .filter((e) => !e.journee && !e.libre && e.fin > e.debut && !ecritsParPepfit.has(e.id) && !estDePepfit(e.notes))
    .sort((a, b) => a.debut - b.debut || a.fin - b.fin);
}

/** Créneaux pris fusionnés : triés, ceux qui se touchent ou se chevauchent n'en font qu'un. */
export function fusionner(creneaux: readonly Creneau[]): Creneau[] {
  const tries = creneaux.filter((c) => c.fin > c.debut).sort((a, b) => a.debut - b.debut);
  const out: Creneau[] = [];
  for (const c of tries) {
    const der = out[out.length - 1];
    if (der && c.debut <= der.fin) der.fin = Math.max(der.fin, c.fin);
    else out.push({ debut: c.debut, fin: c.fin });
  }
  return out;
}

export const chevauche = (a: Creneau, b: Creneau) => a.debut < b.fin && b.debut < a.fin;

/** Premier rendez-vous (par heure de début) qui chevauche la séance ; null : la séance est libre. */
export function conflitDe(seance: Creneau, pris: readonly EvenementAgenda[]): EvenementAgenda | null {
  let premier: EvenementAgenda | null = null;
  for (const e of pris) if (chevauche(seance, e) && (!premier || e.debut < premier.debut)) premier = e;
  return premier;
}

/** Clé d'un couple séance et rendez-vous gardé tel quel (« Garder les deux », D15). */
export const cleCouple = (cleSeance: string, evenementId: string) => `${cleSeance}#${evenementId}`;

/**
 * Premier créneau libre du même jour (D15, « Décaler à 18:30 ») : au quart d'heure, à partir de l'heure prévue (pas avant
 * maintenant), tant que la séance finit avant 22:00 ; sinon le plus proche avant, pas avant 06:00. `minuit` : début du jour
 * de la séance ; `pris` : rendez-vous et autres séances du jour. null : aucune place.
 */
export function premierCreneauLibre(o: { debut: number; dureeMs: number; minuit: number; maintenant: number; pris: readonly Creneau[] }): number | null {
  const pas = PAS_MIN * MIN;
  const ouverture = o.minuit + JOUR_DEBUT_MIN * MIN;
  const fermeture = o.minuit + JOUR_FIN_MIN * MIN;
  const plancher = Math.max(ouverture, Math.ceil(o.maintenant / pas) * pas);
  const occupes = fusionner(o.pris);
  const libre = (d: number) => !occupes.some((c) => chevauche({ debut: d, fin: d + o.dureeMs }, c));
  const depart = Math.max(o.debut, plancher);
  for (let d = Math.ceil((depart - o.minuit) / pas) * pas + o.minuit; d + o.dureeMs <= fermeture; d += pas) if (libre(d)) return d;
  for (let d = Math.floor((o.debut - o.minuit) / pas) * pas + o.minuit - pas; d >= plancher; d -= pas) if (d + o.dureeMs <= fermeture && libre(d)) return d;
  return null;
}

/**
 * Agendas lus au départ (D10) : tous, sauf les anniversaires, les jours fériés et ceux en lecture seule (abonnements). Les
 * noms sont ceux qu'Android donne aux agendas de Google, en français et en anglais.
 */
export function lusParDefaut(calendriers: readonly { id: string; titre: string; modifiable: boolean }[]): string[] {
  const exclus = /anniversaire|birthday|jours? f[ée]ri[ée]s|holiday|vacances scolaires/i;
  return calendriers.filter((c) => c.modifiable && !exclus.test(c.titre)).map((c) => c.id);
}

/** Agenda écrit par défaut (D10) : le principal s'il est modifiable, sinon le premier modifiable ; null : aucun. */
export function ecritParDefaut(calendriers: readonly { id: string; modifiable: boolean; principal: boolean }[]): string | null {
  return (calendriers.find((c) => c.modifiable && c.principal) ?? calendriers.find((c) => c.modifiable))?.id ?? null;
}
