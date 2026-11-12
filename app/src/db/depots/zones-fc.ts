import type { Executeur } from "../executeur";
import { derniereMesure, historiqueMesure } from "./mesures";
import { lireAge } from "./profil";
import { ecrireReglage, lireReglage, PREFIXE_CACHE } from "./reglages";
import {
  resoudreFcMax, resoudreFcRepos, zonesPersonnelles, JOURS_FC_MAX, JOURS_FC_REPOS, type MethodeZones, type ModeFcMax, type SeanceFc, type Zones,
} from "../../ecrans/zones-fc";

// Zones de FC personnelles (NOTES-VMA.md § 6, planche vma-vo2max validée le 29/10) : ce que la base sait pour les calculer.
// La règle elle-même est pure (ecrans/zones-fc.ts) ; ici, la lecture : choix de la feuille FC max, âge, pics des séances
// des 12 derniers mois (résumés Whoop, pic tenu des échantillons de pepfit, FC max du profil Whoop), tests VMA, nuits de FC
// au repos des 30 derniers jours (Whoop, Santé Connect).

const JOUR = 86_400_000;
export const CLE_FC_MAX = "fc_max";
export const CLE_FC_MAX_MODE = "fc_max_mode";
export const CLE_ZONES_METHODE = "zones_methode";
/** Test VMA d'une séance (mesure_corps : valeur = distance des 6 min, origine = la séance). */
export const TYPE_TEST_VMA = "vma_test";

export async function lireModeFcMax(db: Executeur): Promise<ModeFcMax> {
  const v = await lireReglage(db, CLE_FC_MAX_MODE);
  return v === "age" || v === "saisie" ? v : "auto";
}
export const ecrireModeFcMax = (db: Executeur, m: ModeFcMax) => ecrireReglage(db, CLE_FC_MAX_MODE, m);
export const ecrireFcMaxSaisie = (db: Executeur, bpm: number) => ecrireReglage(db, CLE_FC_MAX, String(Math.round(bpm)));

export async function lireMethodeZones(db: Executeur): Promise<MethodeZones> {
  return (await lireReglage(db, CLE_ZONES_METHODE)) === "fcmax" ? "fcmax" : "reserve";
}
export const ecrireMethodeZones = (db: Executeur, m: MethodeZones) => ecrireReglage(db, CLE_ZONES_METHODE, m);

/** FC minute par minute gardée pour les kcal (ecrans/kcal-fc.ts, PREFIXE_FC_MINUTES : même clé). */
const PREFIXE_FC_MINUTES = `${PREFIXE_CACHE}fc_min:`;

/**
 * Pics des séances des 12 derniers mois : résumés Whoop, pic tenu (5e plus haute valeur) des séances pepfit, profil Whoop ; et
 * sans capteur en direct, la FC de la montre (Santé Connect) gardée minute par minute par l'Effort : sa 2e plus haute minute
 * (deux minutes au moins à ce niveau ; une montre peut n'écrire qu'une FC par minute) (C10).
 */
export async function seancesFc(db: Executeur, maintenant = Date.now()): Promise<SeanceFc[]> {
  const depuis = maintenant - JOURS_FC_MAX * JOUR;
  const [whoop, pepfit, montre, tests, profil] = await Promise.all([
    db.getAllAsync<{ debut: number; fc_max: number }>("SELECT debut, fc_max FROM whoop_seance WHERE debut >= ? AND fc_max IS NOT NULL", [depuis]),
    db.getAllAsync<{ id: string; debut: number; pic: number | null }>(
      `SELECT s.id AS id, s.debut AS debut, (SELECT f.bpm FROM seance_fc f WHERE f.seance_id = s.id ORDER BY f.bpm DESC LIMIT 1 OFFSET 4) AS pic
       FROM seances s WHERE s.debut >= ? AND EXISTS (SELECT 1 FROM seance_fc f WHERE f.seance_id = s.id)`,
      [depuis],
    ),
    db
      .getAllAsync<{ id: string; debut: number; pic: number | null }>(
        `SELECT s.id AS id, s.debut AS debut,
           (SELECT j.value FROM json_each(g.valeur, '$.fc') j WHERE j.value > 0 ORDER BY j.value DESC LIMIT 1 OFFSET 1) AS pic
         FROM seances s JOIN reglages g ON g.cle = ? || s.id
         WHERE s.debut >= ? AND json_valid(g.valeur) AND NOT EXISTS (SELECT 1 FROM seance_fc f WHERE f.seance_id = s.id)`,
        [PREFIXE_FC_MINUTES, depuis],
      )
      .catch(() => []),
    db.getAllAsync<{ origine: string | null }>("SELECT origine FROM mesure_corps WHERE type = ?", [TYPE_TEST_VMA]),
    derniereMesure(db, "fc_max", maintenant),
  ]);
  const testees = new Set(tests.map((t) => t.origine));
  return [
    ...whoop.map((w) => ({ date: w.debut, fcMax: w.fc_max })),
    ...pepfit.map((p) => ({ date: p.debut, pic: p.pic, test: testees.has(p.id) })),
    ...montre.filter((p) => p.pic != null).map((p) => ({ date: p.debut, pic: p.pic, test: testees.has(p.id) })),
    // la FC max du profil Whoop (celle que Whoop retient pour toi) fait foi comme un test : une seule résolution de la FC
    // max dans l'appli (lot 6 de la précision), elle ne s'efface plus derrière les 190 par défaut
    ...(profil ? [{ date: profil.date, fcMax: profil.valeur, test: true }] : []),
  ];
}

/** Nuits de FC au repos des 30 derniers jours (Whoop, sinon Santé Connect). */
export async function nuitsFcRepos(db: Executeur, maintenant = Date.now()) {
  const l = await historiqueMesure(db, "fc", maintenant - JOURS_FC_REPOS * JOUR);
  return l.filter((m) => m.date <= maintenant).map((m) => ({ date: m.date, bpm: m.valeur, source: m.source === "whoop" ? ("whoop" as const) : ("sante_connect" as const) }));
}

/** Les zones de FC de la personne, avec leurs sources (écran en direct, fins de séance, effort du jour, page Zones de FC). */
export async function lireZonesFc(db: Executeur, maintenant = Date.now()): Promise<Zones> {
  const [mode, saisie, age, seances, nuits, methode] = await Promise.all([
    lireModeFcMax(db),
    lireReglage(db, CLE_FC_MAX),
    lireAge(db, maintenant),
    seancesFc(db, maintenant),
    nuitsFcRepos(db, maintenant),
    lireMethodeZones(db),
  ]);
  const fcMax = resoudreFcMax({ mode, saisie: saisie == null ? null : Number(saisie), age: age?.age ?? null, seances, maintenant });
  return zonesPersonnelles(fcMax, resoudreFcRepos(nuits, maintenant), methode);
}
