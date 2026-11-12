import { t, tp } from "../i18n/index";
import { jourMois, nombre, versUnite, type Unite } from "./format";

/** Une case de la ligne de statistiques d'une routine : valeur en gras, légende dessous. */
export interface StatRoutine {
  valeur: string;
  legende: string;
}

/** Volume lisible : en tonnes dès 1 000 kg (« 9,8 t »), sinon en kg ; en lbs tel quel. */
export function volumeCourt(kg: number, u: Unite): string {
  if (u === "lbs") return `${nombre(Math.round(versUnite(kg, u)), 0)} lbs`;
  return kg >= 1000 ? `${nombre(kg / 1000, 1)} t` : `${nombre(Math.round(kg), 0)} kg`;
}

/**
 * Statistiques compactes d'une routine (séances, dernière, volume moyen), d'après le volume de chaque séance
 * terminée, de la plus ancienne à la plus récente. Routine jamais faite : rien, la ligne n'est pas montrée.
 */
export function statsRoutine(points: readonly { date: number; valeur: number }[], u: Unite): StatRoutine[] | null {
  const der = points[points.length - 1];
  if (!der) return null;
  const moyenne = points.reduce((t, p) => t + p.valeur, 0) / points.length;
  return [
    { valeur: String(points.length), legende: tp("accueil.routine.legendeSeances", points.length) },
    { valeur: jourMois(der.date), legende: t("accueil.routine.legendeDerniere") },
    { valeur: volumeCourt(moyenne, u), legende: t("accueil.routine.legendeVolumeMoyen") },
  ];
}
