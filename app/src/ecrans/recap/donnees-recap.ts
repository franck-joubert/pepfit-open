// Données du récap commun « avant séance » (planche ajout-seance-v2) : ce que montrent la séance prévue, la routine et le sport
// du moment. Le calcul est dans recap-calc.ts (pur, testé) ; ici, les lectures de la base.
import { lireCleSeance } from "../../agenda/calcul";
import { dernierLieuDuSport } from "../../db/depots/lanceur";
import { lireLieuPrevu, lireReglagesPrevus, lireSeancePrevue } from "../../db/depots/programmations";
import { lireOrigine, lireRoutine, type OrigineRoutine } from "../../db/depots/routines";
import { lireSalle } from "../../db/depots/salles";
import type { Executeur } from "../../db/executeur";
import { catalogueSports } from "../../db/depots/lanceur";
import { lireTiroir, type DonneesTiroir } from "../tiroir-seance-donnees";
import { lieuParDefaut, type LieuChoisi } from "../parcours-seance";
import { MUSCULATION, pictoSport } from "../lanceur-sports";
import { jourDe } from "../planif-donnees";

/** Ce que le récap sait d'une séance, quelle que soit sa porte d'entrée. */
export interface DonneesRecap {
  /** « prevue » : une occurrence d'une programmation ; « routine » : une routine à démarrer maintenant ; « sport » : un sport seul. */
  genre: "prevue" | "routine" | "sport";
  nom: string;
  picto: string | null;
  /** Sport de la séance (identifiant du catalogue), pour le dernier lieu et le picto. */
  sport: string | null;
  routineId: string | null;
  jour: string | null;
  /** « HH:MM » ; null : sans heure. */
  heure: string | null;
  /** Durée voulue (réglages), sinon estimée (routine, arrondie à 5) ; null : aucune. */
  dureeMin: number | null;
  lieu: LieuChoisi;
  origine: OrigineRoutine;
  modifiePar: OrigineRoutine | null;
  /** Séance prévue (clé « programmation|jour d'origine ») : pour Modifier, Annuler, le lieu. */
  prevue: { programmationId: string; dateOrigine: string; repetee: boolean } | null;
  /** La séance a son propre contenu : « Ajouter à mes routines » est proposé. */
  contenuPropre: boolean;
  /** Tiroir historique : exercices, programme lié, rappel (null pour un sport seul). */
  tiroir: DonneesTiroir | null;
  /** Séance d'un programme (étiquette « Programme »). */
  programme: boolean;
}

export interface EntreeRecap {
  /** Clé « programmation|jour d'origine ». */
  seance?: string | null;
  routineId?: string | null;
  /** Sport seul (identifiant du catalogue). */
  sport?: string | null;
  /** Lieu déjà choisi sur la feuille du sport (null : « Non défini »). */
  salleId?: string | null;
}

async function lieuDe(db: Executeur, id: string | null | undefined): Promise<LieuChoisi> {
  const s = id ? await lireSalle(db, id) : null;
  return lieuParDefaut(s ? { id: s.id, nom: s.nom } : null);
}

/** Tout ce que montre le récap ; null si la séance ou la routine n'existe plus. */
export async function lireRecap(db: Executeur, e: EntreeRecap, maintenant = Date.now()): Promise<DonneesRecap | null> {
  const cle = lireCleSeance(e.seance);
  const prevue = cle ? await lireSeancePrevue(db, cle.programmationId, cle.dateOrigine) : null;
  let routineId = e.routineId ?? null;
  if (cle && prevue) {
    routineId = (await db.getFirstAsync<{ routine_id: string }>("SELECT routine_id FROM programmations WHERE id = ?", [cle.programmationId]))?.routine_id ?? null;
  }
  const catalogue = await catalogueSports(db);
  if (!routineId) {
    // Sport seul : « Maintenant », le dernier lieu de ce sport.
    const s = catalogue.find((x) => x.id === e.sport);
    if (!s) return null;
    const lieu = e.salleId !== undefined ? await lieuDe(db, e.salleId) : lieuParDefaut(await dernierLieuDuSport(db, s.id));
    return {
      genre: "sport", nom: s.nom, picto: pictoSport(s.slug), sport: s.id, routineId: null, jour: jourDe(maintenant), heure: null, dureeMin: null, lieu,
      origine: "moi", modifiePar: null, prevue: null, contenuPropre: false, tiroir: null, programme: false,
    };
  }
  const tiroir = await lireTiroir(db, routineId, maintenant);
  if (!tiroir) return null;
  const meta = await db.getFirstAsync<{ origine: string; modifie_par: string | null; visible: number; plan_id: string | null }>(
    "SELECT origine, modifie_par, visible, plan_id FROM routines WHERE id = ?",
    [routineId],
  );
  const reglages = cle && prevue ? await lireReglagesPrevus(db, cle.programmationId) : undefined;
  const regle = cle && prevue ? await db.getFirstAsync<{ regle: string }>("SELECT regle FROM programmations WHERE id = ?", [cle.programmationId]) : null;
  const heureRegle = regle ? ((JSON.parse(regle.regle) as { heure?: string | null }).heure ?? null) : null;
  // Sport de la routine : celui choisi sur la feuille, sinon le premier exercice qui est un sport, sinon la musculation.
  const sport = reglages?.sport ?? (await sportDeRoutine(db, routineId)) ?? MUSCULATION;
  const lignes = tiroir.routine.blocs.flatMap((b) => b.lignes);
  const slug = catalogue.find((x) => x.id === sport)?.slug ?? null;
  const picto = lignes[0]?.exercice.slug ?? (slug ? pictoSport(slug) : null);
  let lieu: LieuChoisi;
  if (cle && prevue) {
    // Lieu choisi pour cette occurrence ; rien de choisi : le dernier lieu de ce sport.
    const l = await lireLieuPrevu(db, cle.programmationId, cle.dateOrigine);
    lieu = l ? { id: l.id, nom: l.nom } : l === null ? lieuParDefaut(null) : lieuParDefaut(await dernierLieuDuSport(db, sport));
  } else {
    lieu = e.salleId !== undefined ? await lieuDe(db, e.salleId) : lieuParDefaut(await dernierLieuDuSport(db, sport));
  }
  const jour = prevue ? prevue.date : jourDe(maintenant);
  const heure = prevue ? (reglages?.sansHeure ? null : (prevue.heure ?? heureRegle)) : null;
  return {
    genre: prevue ? "prevue" : "routine",
    nom: tiroir.routine.nom,
    picto,
    sport,
    routineId,
    jour,
    heure,
    dureeMin: reglages?.dureeMin ?? tiroir.duree?.minutes ?? null,
    lieu,
    origine: lireOrigine(meta?.origine),
    modifiePar: meta?.modifie_par == null ? null : lireOrigine(meta.modifie_par),
    prevue: cle && prevue ? { programmationId: cle.programmationId, dateOrigine: cle.dateOrigine, repetee: prevue.repetee } : null,
    // Un sport seul n'a aucun exercice : rien à ajouter à Mes routines.
    contenuPropre: !!meta && (meta.visible === 0 || meta.plan_id != null) && prevue != null && lignes.length > 0,
    tiroir,
    programme: tiroir.genre === "programme",
  };
}

/** Sport d'une routine : son premier exercice qui est un sport du catalogue (activité Whoop). */
async function sportDeRoutine(db: Executeur, routineId: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ id: string }>(
    `SELECT e.id FROM routine_exercices re JOIN exercices e ON e.id = re.exercice_id
     WHERE re.routine_id = ? AND e.whoop_ids IS NOT NULL ORDER BY re.position LIMIT 1`,
    [routineId],
  );
  return r?.id ?? null;
}

