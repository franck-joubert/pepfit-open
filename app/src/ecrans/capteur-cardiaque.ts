// Capteur cardiaque du départ (retour du 06/11) : la FC en direct n'est plus « la Whoop » mais celle de n'importe quel
// capteur qui diffuse en Bluetooth (service Heart Rate 0x180D) : Whoop, ceinture Polar ou Garmin, montre. Pur (sans React
// Native) : testé par tests/depart-unique.test.ts. Un seul capteur par séance : si plusieurs diffusent, on garde le choix fait
// ici, sinon le dernier utilisé, sinon le plus proche.
import { t } from "../i18n/index";
import type { AppareilFc } from "../natif/suivi/types";

/** Les capteurs qui diffusent la FC (0x180D), du signal le plus fort au plus faible. */
export const quiDiffusent = (trouves: readonly AppareilFc[]): AppareilFc[] => trouves.filter((a) => a.fc).sort((a, b) => b.rssi - a.rssi);

/**
 * Le capteur retenu parmi ceux qui diffusent : le choix fait pendant cette ouverture de l'écran (s'il diffuse encore), sinon
 * le dernier capteur utilisé (mémorisé), sinon le plus proche. Aucun qui diffuse : null.
 */
export function capteurRetenu(diffusent: readonly AppareilFc[], choisi: string | null, dernier: string | null): AppareilFc | null {
  return (
    (choisi != null ? diffusent.find((a) => a.adresse === choisi) : undefined) ??
    (dernier != null ? diffusent.find((a) => a.adresse === dernier) : undefined) ??
    diffusent[0] ??
    null
  );
}

/** Nom d'affichage du capteur : « Whoop » pour une Whoop (« WHOOP 4C0912… »), sinon son nom Bluetooth, sans nom : « Capteur cardiaque ». */
export function nomCapteur(a: Pick<AppareilFc, "nom">): string {
  const nom = a.nom?.replace(/\s+/g, " ").trim();
  if (!nom) return t("gps.capteurCardiaque");
  return /whoop/i.test(nom) ? t("gps.whoop") : nom;
}

/** Les noms de deux capteurs qui diffusent sous le même nom (deux ceintures du même modèle) : la fin de l'adresse les distingue. */
export function nomsDistincts(l: readonly AppareilFc[]): string[] {
  const noms = l.map(nomCapteur);
  return noms.map((n, i) => (noms.filter((x) => x === n).length > 1 ? `${n} ${l[i]!.adresse.replace(/[^0-9A-Fa-f]/g, "").slice(-4).toUpperCase()}` : n));
}
