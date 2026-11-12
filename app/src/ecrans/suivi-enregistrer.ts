import { vueDuCircuit } from "../circuits/vue";
import { parcoursFait } from "../circuits/suivre";
import { noterTemps } from "../db/depots/circuits-temps";
import { enregistrerSuivi, enregistrerTestVma, ecrireSuiviLance, lireSport, lireSuiviLance, oublierEstimationCourse, remplacerSuivi, supprimerSeance, type Executeur, type SuiviAEnregistrer, type SuiviLance } from "../db";
import { resultatTest } from "./etapes-course";
import { etapesDuSuivi } from "./etapes-suivi";
import { t } from "../i18n/index";
import { suivi } from "../natif/suivi";
import { denivele, distancesCumulees, lisserAltitude } from "../natif/suivi/logique";
import { COURSE } from "./lanceur-sports";
import { altitudesRecalees } from "./suivi-direct-vue";

// Fin d'un suivi GPS, commune à la course en direct (Terminer) et au garde de démarrage (« Terminer et enregistrer, puis
// démarrer ») : la séance est enregistrée avec son tracé. Depuis le direct (`reprenable`), le service passe seulement en
// pause : le résumé peut « Reprendre » le même suivi ; Enregistrer, le retour ou Supprimer le closent (cloreSuivi). Une
// nouvelle fin d'un suivi repris met à jour la même séance (remplacerSuivi) au lieu d'en créer une seconde.

/** Termine le suivi en cours et l'enregistre ; rend l'identifiant de la séance. `lance` : lu en base s'il n'est pas fourni. */
export async function terminerSuivi(db: Executeur, lance?: SuiviLance | null, { reprenable = false }: { reprenable?: boolean } = {}): Promise<string> {
  const lu = lance === undefined ? await lireSuiviLance(db) : lance;
  // sans le sport retenu au départ (réglage perdu), la séance devient une course : rien ne se perd
  const sport = lu ? null : await lireSport(db, COURSE);
  const l = lu ?? { suiviId: "", exerciceId: COURSE, titre: sport?.nom ?? t("gps.court.course"), salleId: null };
  const e = reprenable ? await suivi.pause() : await suivi.terminer();
  const sid = e.id ?? l.suiviId;
  const p = await suivi.points(sid, 0);
  const f = await suivi.frequences(sid, 0);
  const cumul = distancesCumulees(p);
  const distanceM = cumul.length ? cumul[cumul.length - 1]! : e.distanceM;
  const alt = lisserAltitude(altitudesRecalees(p), e.baro.present);
  const dv = p.length ? denivele(alt) : null;
  const donnees: SuiviAEnregistrer = {
    exerciceId: l.exerciceId,
    titre: l.titre,
    routineId: l.routineId ?? null,
    salleId: l.salleId,
    // tapis, intérieur : suivi de la FC seule (29/10)
    mode: e.mode === "fc" ? "fc" : "course",
    debut: e.debut ?? Date.now() - e.tempsMs,
    fin: Date.now(),
    dureeS: e.tempsMs / 1000,
    distanceM,
    denivelePlusM: dv ? Math.round(dv.plus) : null,
    deniveleMoinsM: dv ? Math.round(dv.moins) : null,
    barometre: e.baro.present,
    points: p,
    fc: f,
    tours: e.tours.map((x) => ({ s: x.s, d: x.d })),
  };
  const seanceId = l.seanceId ?? (await enregistrerSuivi(db, donnees));
  if (l.seanceId) await remplacerSuivi(db, l.seanceId, donnees);
  // Test VMA (planche vma-vo2max) : la distance des 6 min du dernier test fini ; l'estimation de la course se refera.
  const etapes = await etapesDuSuivi(db, l).catch(() => null);
  // Sur tapis, pas de distance mesurée : pas de VMA tirée du test (la distance se saisit à la fin, après coup).
  const test = etapes && e.mode !== "fc" ? resultatTest(etapes, l.relancesTest ?? [], e.tours) : null;
  if (test) await enregistrerTestVma(db, seanceId, donnees.debut, test.distanceM);
  await oublierEstimationCourse(db, seanceId);
  // Circuit suivi (planche Circuits, lot F) : fait de bout en bout, son temps rejoint « Mon temps » (sur le téléphone, jamais envoyé).
  const circuit = l.circuit ? vueDuCircuit(l.circuit) : null;
  if (l.circuit && circuit && e.mode !== "fc") {
    const parcours = parcoursFait(circuit, p, distanceM);
    if (parcours.fait && parcours.dureeS) await noterTemps(db, l.circuit.id, { seanceId, le: donnees.debut, dureeS: parcours.dureeS }).catch(console.error);
  }
  if (reprenable) {
    await ecrireSuiviLance(db, { ...l, suiviId: sid, seanceId });
    return seanceId;
  }
  await ecrireSuiviLance(db, null);
  await suivi.effacer(sid);
  return seanceId;
}

/** Le résumé de cette séance peut-il encore « Reprendre » ? (suivi en pause, enregistré par un Terminer du direct). */
export async function suiviReprenable(db: Executeur, seanceId: string): Promise<boolean> {
  const lu = await lireSuiviLance(db);
  if (lu?.seanceId !== seanceId) return false;
  const e = await suivi.etat();
  return e?.statut === "pause";
}

/** « Reprendre » depuis le résumé : le même suivi repart, temps, distance et tracé continuent. */
export async function reprendreSuivi(db: Executeur, seanceId: string): Promise<boolean> {
  if (!(await suiviReprenable(db, seanceId))) return false;
  await suivi.reprendre();
  return true;
}

/** Clôt un suivi resté en pause sur son résumé (Enregistrer, retour, Supprimer) : le service s'arrête, le tampon s'efface. */
export async function cloreSuivi(db: Executeur): Promise<void> {
  const lu = await lireSuiviLance(db);
  if (!lu?.seanceId) return;
  const e = await suivi.terminer();
  await ecrireSuiviLance(db, null);
  await suivi.effacer(e.id ?? lu.suiviId);
}

/** Abandonne le suivi en cours : le service s'arrête, rien n'est enregistré (une séance déjà posée par un Terminer est retirée), le tampon est effacé. */
export async function abandonnerSuivi(db: Executeur): Promise<void> {
  const lu = await lireSuiviLance(db);
  const e = await suivi.terminer();
  if (lu?.seanceId) await supprimerSeance(db, lu.seanceId);
  await ecrireSuiviLance(db, null);
  await suivi.effacer(e.id ?? lu?.suiviId ?? "");
}
