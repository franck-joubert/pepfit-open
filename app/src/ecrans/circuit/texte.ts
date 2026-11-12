import type { Circuit } from "../../circuits/types";
import { t } from "../../i18n/index";
import { nombre } from "../format";
import { altitudeEnUnite, distanceEnUnite, libelleAltitude, libelleDistance } from "../unites";

// Les chiffres d'un circuit en texte (page, partage, carte plein écran), dans les unités de la personne.

/** « 14,1 km » (ou en miles). */
export function distanceTexte(metres: number): string {
  return `${nombre(distanceEnUnite(metres), 1)} ${libelleDistance()}`;
}

/** « +203 m » (ou en pieds) ; null quand le circuit n'a pas de dénivelé. */
export function deniveleTexte(denivelePlusM: number | null): string | null {
  return denivelePlusM == null ? null : `+${nombre(altitudeEnUnite(denivelePlusM), 0)} ${libelleAltitude()}`;
}

/** « Boucle, 14,1 km, +203 m » : la ligne que dit le partage et que la carte plein écran garde en bas. */
export function resumeCircuit(c: Pick<Circuit, "type" | "distanceM" | "denivelePlusM">): string {
  const type = t(`circuit.type.${c.type}`);
  const denivele = deniveleTexte(c.denivelePlusM);
  return denivele ? t("circuit.carte.resume", { type, distance: distanceTexte(c.distanceM), denivele }) : t("circuit.carte.resumeSans", { type, distance: distanceTexte(c.distanceM) });
}

/** « 14,1 km, +203 m » : la ligne « Circuit » de l'écran de départ ; sans altitudes, « 14,1 km ». */
export function chiffresCircuit(c: Pick<Circuit, "distanceM" | "denivelePlusM">): string {
  return [distanceTexte(c.distanceM), deniveleTexte(c.denivelePlusM)].filter(Boolean).join(", ");
}

/** Une petite distance en mètres (« 180 m », « 40 m »), au pas de 10 m, puis en kilomètres dès 1 km : l'écart au tracé et ce qui reste du circuit, dans les unités de la personne. */
export function ecartTexte(metres: number): string {
  if (metres >= 1000) return distanceTexte(metres);
  const m = metres < 100 ? Math.round(metres / 5) * 5 : Math.round(metres / 10) * 10;
  return `${nombre(altitudeEnUnite(m), 0)} ${libelleAltitude()}`;
}

/** « 182 Ko » : le poids d'un fichier, en octets, Ko ou Mo (une décimale sous 10 Mo). */
export function poidsTexte(octets: number): string {
  if (octets < 1024) return t("circuit.importer.octets", { n: nombre(octets, 0) });
  if (octets < 1024 * 1024) return t("circuit.importer.ko", { n: nombre(octets / 1024, 0) });
  const mo = octets / (1024 * 1024);
  return t("circuit.importer.mo", { n: nombre(mo, mo < 10 ? 1 : 0) });
}
