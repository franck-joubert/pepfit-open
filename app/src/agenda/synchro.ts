import type { Executeur } from "../db/executeur";
import { lireRoutines, poserException, retirerException } from "../db/api";
import { nomSql } from "../db/noms";
import { parties } from "../i18n/temps";
import { t, tp } from "../i18n/index";
import { distanceSeance, dureeCourte } from "../ecrans/format";
import { instantDe, jourDe, lirePlanning, type Planning } from "../ecrans/planif-donnees";
import { ajouterJ, faite, type Exception, type Occurrence } from "../ecrans/planification";
import * as natif from "../natif/agenda";
import {
  cleCouple, cleSeance, conflitDe, DUREE_DEFAUT_MIN, empreinte, evenementsPris, FENETRE_ECRITE_J, lienSeance, lieuDeSeance, planReecriture, planSynchro, type Creneau, type EvenementAgenda,
  type LienAgenda, type SeanceAgenda,
} from "./calcul";
import { ecrireLien, ecrireReglagesAgenda, listerLiens, lireReglagesAgenda, oublierAgenda, retirerLien, type ReglagesAgenda } from "./depot";
import { descriptionEvenement, lieuEvenement, ligneDetail, titreEvenement } from "./titre";

// Agenda du téléphone : la synchro (D11 à D13) et la lecture des conflits (D15). Elle tourne au retour dans l'appli, à
// l'ouverture de Sport et après chaque écriture de la planification (usePlanif). Une séance s'écrit comme un événement seul
// (aujourd'hui et 28 jours) : titre au format choisi, durée estimée, lieu, et une description (exercices, durée,
// « Planifiée dans pepfit » et le lien qui l'ouvre) ; pas de rappel. Ajustements du 03/11 : docs/CODE-AGENDA.md § 6.

const pad = (n: number) => String(n).padStart(2, "0");
const heureDe = (ms: number) => {
  const p = parties(ms);
  return `${pad(p.h)}:${pad(p.min)}`;
};

const dureeMs = (o: Occurrence, p: Planning) => (o.dureeMin || Math.round((p.routines.get(o.routineId)?.dureeS ?? 0) / 60) || DUREE_DEFAUT_MIN) * 60_000;

/** Ce qu'il faut pour écrire un événement, en plus du planning : réglages du titre, sports, exercices et lieux des routines. */
export interface ContexteEcriture {
  r: Pick<ReglagesAgenda, "titre">;
  /** Nom affiché de chaque sport (« cat:padel » → « Padel »). */
  sports: Map<string, string>;
  /** Lignes de la description, par routine (« Squat · 4 séries »). */
  exercices: Map<string, string[]>;
  /** Lieu de chaque routine : celui de sa dernière séance faite à un lieu (adresse, sinon nom). */
  lieux: Map<string, string>;
  /** Lieu choisi pour une séance prévue (clé de séance ; null : « Aucun lieu ») ; il passe avant celui de la routine. */
  lieuxChoisis?: Map<string, string | null>;
}

/** Une lecture de chaque : noms des sports, exercices (sans les notes), lieu de la dernière séance de chaque routine. */
export async function lireContexte(db: Executeur, p: Planning, r: ContexteEcriture["r"]): Promise<ContexteEcriture> {
  const routines = [...new Set(p.occ.map((o) => o.routineId))];
  const sportsIds = [...new Set(p.occ.map((o) => o.sport).filter((x): x is string => !!x))];
  const marques = (n: number) => Array.from({ length: n }, () => "?").join(",");
  const progs = [...new Set(p.occ.map((o) => o.programmationId))];
  const [noms, details, lieux, choisis] = await Promise.all([
    sportsIds.length ? db.getAllAsync<{ id: string; nom: string }>(`SELECT id, ${nomSql("e")} AS nom FROM exercices e WHERE id IN (${marques(sportsIds.length)})`, sportsIds) : [],
    lireRoutines(db, routines, { notes: false }),
    routines.length
      ? db.getAllAsync<{ routine_id: string; nom: string; adresse: string | null }>(
          `SELECT s.routine_id, sa.nom, sa.adresse FROM seances s JOIN salle sa ON sa.id = s.salle_id
           WHERE s.routine_id IN (${marques(routines.length)}) ORDER BY s.debut DESC`,
          routines,
        )
      : [],
    progs.length
      ? db.getAllAsync<{ programmation_id: string; date_origine: string; lieu_id: string | null; nom: string | null; adresse: string | null }>(
          `SELECT pl.programmation_id, pl.date_origine, pl.lieu_id, sa.nom, sa.adresse FROM programmation_lieux pl LEFT JOIN salle sa ON sa.id = pl.lieu_id
           WHERE pl.programmation_id IN (${marques(progs.length)})`,
          progs,
        )
      : [],
  ]);
  const f = { series: (n: number) => tp("communs.serie", n), distance: (m: number) => distanceSeance(m) };
  const exercices = new Map<string, string[]>();
  for (const [id, d] of details)
    exercices.set(id, d.blocs.flatMap((b) => b.lignes.map((l) => ligneDetail({ nom: l.exercice.nom, nbSeries: l.nb_series, distances: l.cibles.map((c) => c.distance_m) }, f))));
  const lieuDe = new Map<string, string>();
  for (const l of lieux) {
    const x = lieuEvenement(l);
    if (x && !lieuDe.has(l.routine_id)) lieuDe.set(l.routine_id, x);
  }
  // Lieu choisi pour une séance ; un lieu disparu depuis compte comme rien de choisi.
  const lieuxChoisis = new Map<string, string | null>();
  for (const l of choisis) {
    if (l.lieu_id == null) lieuxChoisis.set(cleSeance(l.programmation_id, l.date_origine), null);
    else if (l.nom != null) lieuxChoisis.set(cleSeance(l.programmation_id, l.date_origine), lieuEvenement({ nom: l.nom, adresse: l.adresse }));
  }
  return { r, sports: new Map(noms.map((x) => [x.id, x.nom])), exercices, lieux: lieuDe, lieuxChoisis };
}

/**
 * Séances prévues, telles que l'agenda doit les montrer ; au-delà de `jusqua` (dernier jour écrit), figées : une séance
 * déplacée loin dans l'agenda garde son événement. Sans `ctx` (conflits, feuille), le titre est le nom seul et sans description.
 */
export function seancesAgenda(p: Planning, jusqua: string = p.a, ctx?: ContexteEcriture): SeanceAgenda[] {
  return p.occ.map((o) => {
    const debut = instantDe(o.date, o.heure);
    const fin = debut + dureeMs(o, p);
    const cle = cleSeance(o.programmationId, o.origine);
    const nom = p.routines.get(o.routineId)?.nom ?? "";
    const duree = dureeCourte((fin - debut) / 1000);
    const titre = ctx
      ? titreEvenement({ nom, sport: o.sport ?? null, nomSport: o.sport ? (ctx.sports.get(o.sport) ?? null) : null, duree }, ctx.r.titre)
      : nom;
    const notes = ctx
      ? descriptionEvenement({
          exercices: ctx.exercices.get(o.routineId) ?? [], duree: t("agenda.evenement.duree", { duree }), note: t("agenda.evenement.note"), lien: lienSeance(o.routineId, cle),
        })
      : "";
    return {
      cle, programmationId: o.programmationId, dateOrigine: o.origine, routineId: o.routineId, titre, notes, lieu: ctx ? lieuDeSeance(ctx.lieuxChoisis, ctx.lieux, cle, o.routineId) : null, debut, fin,
      figee: o.date > jusqua || faite(o, p.jours, p.occ),
    };
  });
}

/** Ce que la synchro a vu bouger dans l'agenda : un bandeau chacun (D12 « Annuler », D13 « Remettre »). */
export type Changement =
  | { genre: "deplacee"; nom: string; heure: string; annuler: () => Promise<unknown> }
  | { genre: "retiree"; nom: string; remettre: () => Promise<unknown> };

export type Issue = { genre: "ok"; changements: Changement[]; ecrites: number } | { genre: "rien" } | { genre: "refuse" };

const details = (s: SeanceAgenda): natif.DetailsEvenement => ({ titre: s.titre, debut: s.debut, fin: s.fin, notes: s.notes, lieu: s.lieu });

let enCours: Promise<Issue> | null = null;

/** Une synchro à la fois : un deuxième appel pendant la première attend la même. */
export function synchroniser(db: Executeur, maintenant = Date.now()): Promise<Issue> {
  enCours ??= passe(db, maintenant).finally(() => (enCours = null));
  return enCours;
}

async function passe(db: Executeur, maintenant: number): Promise<Issue> {
  const r = await lireReglagesAgenda(db);
  if (!r.connecte || !natif.disponible()) return { genre: "rien" };
  if ((await natif.lireAcces()) !== "accorde") return { genre: "refuse" };
  const auj = jourDe(maintenant);
  // Lue deux mois plus loin que la fenêtre écrite : une séance déplacée là-bas hors de la fenêtre reste connue (figée).
  const p = await lirePlanning(db, auj, ajouterJ(auj, FENETRE_ECRITE_J + 62), maintenant);
  const seances = seancesAgenda(p, ajouterJ(auj, FENETRE_ECRITE_J), await lireContexte(db, p, r));
  const liens = await listerLiens(db);
  const parCle = new Map(seances.map((s) => [s.cle, s]));
  const evenements = new Map<string, Creneau | null>();
  for (const l of liens) {
    if (l.etat === "retiree" || !parCle.has(l.cle)) continue;
    // Une lecture ratée n'est pas une suppression : le lien reste tel quel jusqu'à la prochaine fois.
    await natif.evenement(l.evenementId).then((e) => evenements.set(l.evenementId, e), console.error);
  }
  // Un identifiant qui ne répond plus, ou une séance « retirée » : on cherche son événement dans l'agenda écrit (03/11, Google
  // peut le réinsérer sous un autre identifiant). null : lecture ratée, rien n'est conclu.
  const aChercher = liens.some((l) => parCle.has(l.cle) && (l.etat === "retiree" || evenements.get(l.evenementId) === null));
  const ecrits = !aChercher
    ? []
    : r.ecrit
      ? await natif.evenements([r.ecrit], instantDe(ajouterJ(auj, -1)), instantDe(ajouterJ(auj, FENETRE_ECRITE_J + 63))).catch((e: unknown) => (console.error(e), null))
      : null;
  const changements: Changement[] = [];
  for (const a of planSynchro(seances, liens, evenements, instantDe(auj), ecrits)) {
    try {
      if (a.genre === "creer" || a.genre === "recreer") {
        if (!r.ecrit) continue;
        const id = await natif.creerEvenement(r.ecrit, details(a.seance));
        await ecrireLien(db, { ...a.seance, evenementId: id, etat: "ecrite", vu: false, contenu: empreinte(a.seance) });
      } else if (a.genre === "vu") {
        await ecrireLien(db, { ...a.lien, vu: true });
      } else if (a.genre === "relier") {
        // Le même événement, sous un autre identifiant : le lien le suit ; s'il a bougé là-bas, la synchro d'après le verra.
        await ecrireLien(db, { ...a.lien, evenementId: a.evenement.id, etat: a.lien.etat === "retiree" ? "ecrite" : a.lien.etat, vu: true });
      } else if (a.genre === "maj") {
        await natif.modifierEvenement(a.lien.evenementId, details(a.seance));
        await ecrireLien(db, { ...a.lien, debut: a.seance.debut, fin: a.seance.fin, etat: "ecrite", contenu: empreinte(a.seance) });
      } else if (a.genre === "deplacee") {
        // Déplacée là-bas, déplacée ici (D12) : une exception « décalée », comme un décalage fait dans pepfit.
        const avant = p.exceptions.find((e) => e.programmationId === a.lien.programmationId && e.dateOrigine === a.lien.dateOrigine);
        const heure = heureDe(a.vers.debut);
        await poserException(db, a.lien.programmationId, a.lien.dateOrigine, { type: "decalee", nouvelleDate: jourDe(a.vers.debut), nouvelleHeure: heure });
        await ecrireLien(db, { ...a.lien, debut: a.vers.debut, fin: a.vers.fin, etat: "deplacee" });
        changements.push({ genre: "deplacee", nom: a.seance.titre, heure, annuler: () => annulerDeplacement(db, a.lien, a.seance, avant) });
      } else if (a.genre === "retiree") {
        await ecrireLien(db, { ...a.lien, etat: "retiree" });
        changements.push({ genre: "retiree", nom: a.seance.titre, remettre: () => remettre(db, a.lien.cle) });
      } else if (a.genre === "supprimer") {
        await natif.supprimerEvenement(a.lien.evenementId).catch(console.error);
        await retirerLien(db, a.lien.cle);
      } else {
        await retirerLien(db, a.lien.cle);
      }
    } catch (e) {
      console.error(e);
    }
  }
  await ecrireReglagesAgenda(db, { maj: maintenant });
  return { genre: "ok", changements, ecrites: (await listerLiens(db)).filter((l) => l.etat !== "retiree").length };
}

/** « Annuler » du bandeau (D12) : la séance revient à son heure d'avant, ici et dans l'agenda. */
async function annulerDeplacement(db: Executeur, lien: LienAgenda, s: SeanceAgenda, avant: Exception | undefined) {
  if (avant) await poserException(db, lien.programmationId, lien.dateOrigine, avant.type === "retiree" ? { type: "retiree" } : { type: "decalee", nouvelleDate: avant.nouvelleDate!, nouvelleHeure: avant.nouvelleHeure });
  else await retirerException(db, lien.programmationId, lien.dateOrigine);
  await natif.modifierEvenement(lien.evenementId, details(s));
  await ecrireLien(db, { ...lien, etat: "ecrite" });
}

/**
 * « Réécrire mes séances dans l'agenda » (page Agenda, 03/11) : chaque séance de la fenêtre écrite retrouve son événement,
 * recréé s'il a été supprimé là-bas, mis à jour sinon (planReecriture) ; les « retirées » redeviennent écrites. Puis une
 * synchro. Dans la file de la synchro : jamais deux écritures à la fois, donc jamais de doublon. `ecrites` : séances écrites.
 */
export async function reecrireTout(db: Executeur, maintenant = Date.now()): Promise<Issue> {
  while (enCours) await enCours.catch(() => undefined);
  const tour = (async (): Promise<Issue> => {
    const r = await lireReglagesAgenda(db);
    if (!r.connecte || !r.ecrit || !natif.disponible()) return { genre: "rien" };
    if ((await natif.lireAcces()) !== "accorde") return { genre: "refuse" };
    const n = await reecrire(db, r, maintenant);
    const i = await passe(db, maintenant);
    return i.genre === "ok" ? { ...i, ecrites: n } : i;
  })();
  enCours = tour.finally(() => (enCours = null));
  return enCours;
}

async function reecrire(db: Executeur, r: ReglagesAgenda, maintenant: number): Promise<number> {
  const auj = jourDe(maintenant);
  const p = await lirePlanning(db, auj, ajouterJ(auj, FENETRE_ECRITE_J), maintenant);
  const seances = seancesAgenda(p, p.a, await lireContexte(db, p, r));
  const liens = await listerLiens(db);
  const cles = new Set(seances.map((s) => s.cle));
  const evenements = new Map<string, Creneau | null>();
  for (const l of liens) if (cles.has(l.cle)) await natif.evenement(l.evenementId).then((e) => evenements.set(l.evenementId, e), console.error);
  const ecrits = [...evenements.values()].includes(null)
    ? await natif.evenements([r.ecrit!], instantDe(ajouterJ(auj, -1)), instantDe(ajouterJ(auj, FENETRE_ECRITE_J + 2))).catch((e: unknown) => (console.error(e), null))
    : [];
  let n = 0;
  for (const a of planReecriture(seances, liens, evenements, ecrits)) {
    try {
      if (a.genre === "creer") {
        const id = await natif.creerEvenement(r.ecrit!, details(a.seance));
        await ecrireLien(db, { ...a.seance, evenementId: id, etat: "ecrite", vu: false, contenu: empreinte(a.seance) });
      } else {
        await natif.modifierEvenement(a.evenementId, details(a.seance));
        await ecrireLien(db, { ...a.lien, evenementId: a.evenementId, debut: a.seance.debut, fin: a.seance.fin, etat: "ecrite", vu: true, contenu: empreinte(a.seance) });
      }
      n++;
    } catch (e) {
      console.error(e);
    }
  }
  return n;
}

/** « Remettre » (D13) : le lien est oublié, la prochaine synchro réécrit la séance dans l'agenda. */
export async function remettre(db: Executeur, cle: string) {
  await retirerLien(db, cle);
  await synchroniser(db);
}

/** État de chaque séance écrite (mention sous la séance) : déplacée ou retirée de l'agenda. */
export async function etatsLiens(db: Executeur): Promise<Map<string, LienAgenda["etat"]>> {
  return new Map((await listerLiens(db)).map((l) => [l.cle, l.etat]));
}

/** Conflit d'une séance (D15) : le rendez-vous, l'agenda qui le porte, et tout ce qui est pris ce jour-là. */
export interface Conflit {
  evenement: EvenementAgenda;
  agenda: string;
}

/**
 * Conflits des séances à venir de la fenêtre écrite (D15) : le premier rendez-vous qui chevauche chacune, hors « Garder les
 * deux ». `pris` : tous les rendez-vous lus (frise de la feuille, créneau libre).
 */
export async function lireConflits(db: Executeur, p: Planning, maintenant = Date.now()): Promise<{ conflits: Map<string, Conflit>; pris: EvenementAgenda[] }> {
  const vide = { conflits: new Map<string, Conflit>(), pris: [] };
  const r = await lireReglagesAgenda(db);
  if (!r.connecte || !r.lus.length || !natif.disponible() || (await natif.lireAcces()) !== "accorde") return vide;
  const auj = jourDe(maintenant);
  const fin = ajouterJ(auj, FENETRE_ECRITE_J + 1);
  const [cals, evs, liens] = await Promise.all([natif.calendriers(), natif.evenements(r.lus, instantDe(auj), instantDe(fin)), listerLiens(db)]);
  const noms = new Map(cals.map((c) => [c.id, c.titre]));
  const pris = evenementsPris(evs, new Set(liens.map((l) => l.evenementId)));
  const garder = new Set(r.garder);
  const conflits = new Map<string, Conflit>();
  for (const s of seancesAgenda(p)) {
    if (s.figee || s.fin <= maintenant || s.debut >= instantDe(fin)) continue;
    const e = conflitDe(s, pris.filter((x) => !garder.has(cleCouple(s.cle, x.id))));
    if (e) conflits.set(s.cle, { evenement: e, agenda: noms.get(e.calendrierId) ?? "" });
  }
  return { conflits, pris };
}

/** « Garder les deux » (D15) : plus d'alerte pour ce couple. */
export async function garderLesDeux(db: Executeur, cle: string, evenementId: string) {
  const r = await lireReglagesAgenda(db);
  await ecrireReglagesAgenda(db, { garder: [...r.garder.filter((x) => x !== cleCouple(cle, evenementId)), cleCouple(cle, evenementId)] });
}

/** Connexion (D10) : les agendas choisis ; les liens repartent de zéro, puis une première synchro écrit les séances. */
export async function connecter(db: Executeur, lus: string[], ecrit: string): Promise<Issue> {
  await oublierAgenda(db);
  await ecrireReglagesAgenda(db, { connecte: true, lus, ecrit, garder: [] });
  return synchroniser(db);
}

/** Changement des agendas sans se déconnecter : l'agenda écrit change, les séances y passent (retirées de l'ancien). */
export async function changerAgendas(db: Executeur, lus: string[], ecrit: string): Promise<void> {
  const r = await lireReglagesAgenda(db);
  if (r.ecrit && r.ecrit !== ecrit) await retirerSeancesEcrites(db);
  await ecrireReglagesAgenda(db, { lus, ecrit });
  await synchroniser(db);
}

/** Retire de l'agenda les séances que pepfit y a écrites (passées comprises : l'agenda redevient comme avant). */
async function retirerSeancesEcrites(db: Executeur): Promise<number> {
  let n = 0;
  for (const l of await listerLiens(db)) {
    if (l.etat !== "retiree") {
      await natif.supprimerEvenement(l.evenementId).then(() => n++, console.error);
    }
    await retirerLien(db, l.cle);
  }
  return n;
}

/** Nombre de séances écrites dans l'agenda (feuille de déconnexion, D17). */
export const nombreEcrites = async (db: Executeur) => (await listerLiens(db)).filter((l) => l.etat !== "retiree").length;

/** Déconnexion (D17) : pepfit ne lit plus l'agenda ; les séances restent dans pepfit, retirées de l'agenda ou laissées. */
export async function deconnecter(db: Executeur, retirer: boolean): Promise<number> {
  const n = retirer ? await retirerSeancesEcrites(db) : 0;
  await oublierAgenda(db);
  return n;
}

/** Agenda « Ce téléphone seulement » (D10) : créé une fois, puis réutilisé. */
export async function agendaLocal(db: Executeur): Promise<string> {
  const r = await lireReglagesAgenda(db);
  if (r.local && (await natif.calendriers()).some((c) => c.id === r.local)) return r.local;
  const id = await natif.creerAgendaLocal(t("agenda.cal.local"));
  await ecrireReglagesAgenda(db, { local: id });
  return id;
}

/** Heure (« 18:30 ») d'un instant, dans le fuseau choisi. */
export { heureDe };
