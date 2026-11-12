import { ecrireFcMuscu, ecrireFcMuscuLance, lireFcAppareil, lireFcMuscuLance, lireFcDirecte, type Executeur } from "../db";
import { suivi, type EtatSuivi } from "../natif/suivi";

// FC en direct pendant une séance de muscu (planches/suivi-gps § 6, lot 5) : le même service que la course, en mode « muscu »
// (connectedDevice seul). Il part à l'ouverture de la séance si la FC en direct est allumée (réglage du départ d'une course, du
// récap d'une séance de musculation, ou d'Appareils et connexions), lit le capteur retenu au départ (Whoop, ceinture, montre :
// celui que l'écran de lancement a trouvé ou choisi), écrit la FC dans son tampon pendant toute la séance, pause comprise, et se
// clôt à la fin : la FC passe dans seance_fc. Une fin manquée (appli tuée pendant la fin) est rattrapée au lancement suivant
// (reconcilierFcMuscu).

/** Le module natif est là et la FC en direct est allumée (« Capteur cardiaque » du départ, allumé d'office si Whoop est connecté). */
export async function fcMuscuVoulue(db: Executeur): Promise<boolean> {
  return suivi.disponible && (await lireFcDirecte(db));
}

/**
 * Lance (ou retrouve) le service de la FC pour la séance en cours ; null si une course est en cours (le garde de démarrage
 * l'empêche d'habitude). Le suivi resté d'une séance finie est d'abord clos.
 */
export async function demarrerFcMuscu(
  db: Executeur,
  s: { id: string; titre: string; debut: number; pauseDebut: number | null; pauseCumulS: number },
): Promise<EtatSuivi | null> {
  const l = await lireFcMuscuLance(db);
  const e = await suivi.etat();
  if (e && e.statut !== "arrete") {
    if (e.mode !== "muscu") return null;
    if (l?.seanceId === s.id && l.suiviId === e.id) return e;
  }
  if (l || (e && e.statut !== "arrete")) await finirFcMuscu(db);
  // Le capteur retenu à l'écran de lancement ; sans lui, le service cherche (le dernier utilisé, sinon le premier qui diffuse).
  const appareil = await lireFcAppareil(db).catch(() => null);
  const n = await suivi.demarrer({ mode: "muscu", fc: true, appareil, titre: s.titre, debut: s.debut, pauseCumulMs: s.pauseCumulS * 1000 });
  await ecrireFcMuscuLance(db, { suiviId: n.id ?? "", seanceId: s.id });
  return s.pauseDebut != null ? suivi.pause() : n;
}

/** La pause de la séance (bande du bas, feuille Durée) fige aussi le chrono de la notification ; la FC continue d'être notée. */
export async function synchroniserPause(pause: boolean): Promise<EtatSuivi | null> {
  const e = await suivi.etat();
  if (e?.mode !== "muscu") return null;
  if (pause && e.statut === "en_cours") return suivi.pause();
  if (!pause && e.statut === "pause") return suivi.reprendre();
  return e;
}

/**
 * Clôt le service de la FC de la séance (fin, abandon) : la FC passe dans seance_fc si la séance est terminée, rien si elle a
 * été abandonnée (supprimée) ; le tampon est effacé.
 */
export async function finirFcMuscu(db: Executeur): Promise<void> {
  const l = await lireFcMuscuLance(db);
  const e = await suivi.etat();
  const id = l?.suiviId ?? (e?.mode === "muscu" ? e.id : null);
  if (!id) return;
  const capteur = e?.mode === "muscu" ? e.fc.appareil : null;
  if (e?.mode === "muscu" && e.statut !== "arrete") await suivi.terminer();
  const fc = await suivi.frequences(id, 0);
  const s = l ? await db.getFirstAsync<{ debut: number; fin: number | null }>("SELECT debut, fin FROM seances WHERE id = ?", [l.seanceId]) : null;
  if (l && s?.fin != null && fc.length) await ecrireFcMuscu(db, l.seanceId, s.debut, fc.map((f) => ({ t: f.t, bpm: f.bpm })), capteur);
  await ecrireFcMuscuLance(db, null);
  await suivi.effacer(id).catch(() => {});
}

/** La FC notée jusqu'ici pour la séance en cours (fin de séance, parts musculaire et cardio) ; rien sans service. */
export async function fcSeanceEnCours(db: Executeur, seanceId: string): Promise<{ t: number; bpm: number }[]> {
  const l = await lireFcMuscuLance(db);
  if (!l?.suiviId || l.seanceId !== seanceId) return [];
  return (await suivi.frequences(l.suiviId, 0).catch(() => [])).map((f) => ({ t: f.t, bpm: f.bpm }));
}

/** Au lancement : un service de FC dont la séance n'est plus en cours (finie, abandonnée) est clos. */
export async function reconcilierFcMuscu(db: Executeur): Promise<void> {
  const l = await lireFcMuscuLance(db);
  const e = await suivi.etat();
  if (!l && e?.mode !== "muscu") return;
  if (l) {
    const s = await db.getFirstAsync<{ fin: number | null }>("SELECT fin FROM seances WHERE id = ?", [l.seanceId]);
    if (s && s.fin == null) return;
  }
  await finirFcMuscu(db);
}
