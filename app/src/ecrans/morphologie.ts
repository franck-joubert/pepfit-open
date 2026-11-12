import type { SQLiteDatabase } from "expo-sqlite";
import { lireReglage } from "../db";
import { derniereMensuration, grasProfil, lireAge, lireMorphologie as lireProfil, lireSoutien } from "../db/depots/profil";
import { dernierScanZones } from "../db/depots/mesures";
import { ZONES, type Zone } from "../withings/convertir";
import { useCharge } from "./contexte";
import { morphologieDe, type TourSaisi } from "./morphologie-calc";

// Morphologie de l'utilisateur pour le personnage de Santé : ce que l'appli sait déjà, rien d'autre. Sexe du profil
// (Mensurations) à défaut de personnage choisi ; dernière taille mesurée ; dernier poids de corps ; pour le calcul B
// (planche morphologie, D1) : masse grasse, âge, soutien-gorge, derniers tours saisis et dernier Body Scan par zone.
// Les calculs (corps à dessiner, IMC) sont dans morphologie-calc.ts.

export interface Morphologie {
  sexe: "h" | "f" | null;
  tailleCm: number | null;
  poidsKg: number | null;
  /** Dernière masse grasse mesurée (%). */
  grasPct?: number | null;
  /** Âge (ans), pour le taux de gras sans mesure (D5). */
  age?: number | null;
  /** Bonnet rangé (bonnet-calc.ts : 0 à 9, 10 = DD) et tour de dos (cm). */
  bonnet?: number | null;
  tourDosCm?: number | null;
  /** Derniers tours saisis (cm) ; « taille » est le tour de taille. */
  tours?: Partial<Record<TourSaisi, number | null>>;
  /** Dernier Body Scan : % de gras et muscle (kg) de chaque zone (null : zone sans mesure). */
  zonesGras?: Partial<Record<Zone, number | null>>;
  zonesMuscle?: Partial<Record<Zone, number | null>>;
  /** Homme : épaules naturelles (D11, par défaut) ; faux pour le squelette de l'appli (réglage « epaules_3d »). */
  epaules?: boolean;
}

/** Tour saisi du calcul → type de mensuration (le tour de taille est « tour_taille », « taille » étant la hauteur). */
const MENSURATION_DU_TOUR = { taille: "tour_taille", hanches: "hanches", poitrine: "poitrine", bras: "bras", cuisse: "cuisse", mollet: "mollet" } as const;

/** Le dernier Body Scan : % de gras et muscle (kg) de chaque zone. */
async function dernierScan(db: SQLiteDatabase): Promise<Pick<Morphologie, "zonesGras" | "zonesMuscle"> | null> {
  const scan = await dernierScanZones(db);
  if (!scan) return null;
  return {
    zonesGras: Object.fromEntries(ZONES.map((z) => [z, scan.zones[z].grasPct])),
    zonesMuscle: Object.fromEntries(ZONES.map((z) => [z, scan.zones[z].muscle])),
  };
}

/** Lecture dans la base : profil (sexe, taille, poids), personnage choisi à défaut de sexe, puis ce que lit le calcul B. */
export async function lireMorphologie(db: SQLiteDatabase): Promise<Morphologie | null> {
  const [profil, personnage, squelette] = await Promise.all([lireProfil(db), lireReglage(db, "personnage_3d"), lireReglage(db, "epaules_3d")]);
  // Le personnage choisi dans Réglages l'emporte (retour du 03/11 : « Perso 3D femme » et toujours l'homme dans Corps) ;
  // sans choix, le sexe du profil.
  const choisi = personnage === "homme" || personnage === "femme" ? personnage : null;
  const choix = choisi ?? (profil.sexe === "h" ? "homme" : profil.sexe === "f" ? "femme" : null);
  const base = morphologieDe(choix, profil.poidsKg, profil.tailleCm);
  const [gras, age, soutien, scan, ...tours] = await Promise.all([
    grasProfil(db).catch(() => null),
    lireAge(db).catch(() => null),
    lireSoutien(db).catch(() => null),
    dernierScan(db).catch(() => null),
    ...Object.values(MENSURATION_DU_TOUR).map((type) => derniereMensuration(db, type).catch(() => null)),
  ]);
  const plus: Partial<Morphologie> = {
    grasPct: gras?.valeur ?? null,
    age: age?.age ?? null,
    bonnet: soutien?.bonnet ?? null,
    tourDosCm: soutien?.tourDos ?? null,
    tours: Object.fromEntries(Object.keys(MENSURATION_DU_TOUR).map((t, i) => [t, tours[i]?.valeur ?? null])),
    ...scan,
    epaules: squelette !== "appli",
  };
  const rien = plus.grasPct == null && plus.bonnet == null && plus.epaules && scan == null && Object.values(plus.tours!).every((v) => v == null);
  if (base == null && rien) return null;
  return { ...(base ?? { sexe: null, tailleCm: null, poidsKg: null }), ...plus };
}

/** Dernière morphologie lue (lancement de l'appli : sante-lecteurs.ts) : Santé la montre dès son montage, avec le poids. */
let derniere: Morphologie | null | undefined;

/** Lit la morphologie et la garde pour le prochain montage. */
export async function retenirMorphologie(db: SQLiteDatabase): Promise<Morphologie | null> {
  derniere = await lireMorphologie(db);
  return derniere;
}

/** Morphologie connue de l'appli (relue à chaque retour sur l'écran), null sans aucune donnée. */
export function useMorphologie(): Morphologie | null {
  const [m] = useCharge(retenirMorphologie, [], derniere);
  return m ?? null;
}
