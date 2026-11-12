// Briques pures de « Récupérer » (sans React Native, testées par tests/page-effort.test.ts) : les noms des activités, la durée,
// la source, les kcal du sauna et du bain froid (aux MET, kcal-seance.ts) et la ligne d'une session
// (« 14:07, 19 min dormies, Samsung Health »). Les composants sont dans briques.tsx, qui les reprend.
import type { Executeur } from "../../db/executeur";
import { t } from "../../i18n/index";
import { heure } from "../format";
import { kcalSeance } from "../kcal-seance";
import { activite, sommeilSieste, type TypeRecup } from "../recuperer";
import type { ActiviteFaite } from "../recuperer-donnees";
import { bmrA, donneesBmr, nomSource } from "../sante-donnees";

/** « Sauna », « Respiration »… (la grille de la feuille). */
export const typeRecupTexte = (type: TypeRecup) => t(`recuperer.type.${type}` as "recuperer.type.sauna");
/** « Cohérence cardiaque » pour la respiration (la liste du jour), sinon le nom du type. */
export const nomRecup = (type: TypeRecup) => t(`recuperer.nom.${type}` as "recuperer.nom.sauna");
export const minTexte = (n: number) => t("recuperer.min", { n: Math.round(n) });
export const minutesDe = (a: { debut: number; fin: number }) => Math.max(1, Math.round((a.fin - a.debut) / 60_000));

/** L'appareil qui a mesuré la session (« Whoop », « Samsung Health »…), null si pepfit seul. */
export function sourceRecup(a: Pick<ActiviteFaite, "sources">): string | null {
  const s = a.sources.find((x) => x !== "pepfit");
  if (!s) return null;
  return s === "whoop" ? "Whoop" : nomSource(s);
}

/** Les kcal nettes d'une session de sauna ou de bain froid (aux MET, comme la dépense du jour) ; null pour les autres. */
export async function kcalRecup(db: Executeur, type: TypeRecup, minutes: number, t0: number): Promise<number | null> {
  const sport = activite(type).sportKcal;
  if (!sport) return null;
  const [d, bmr] = await Promise.all([donneesBmr(db, t0), bmrA(db, t0)]);
  return Math.round(kcalSeance({ minutes, sportId: sport }, { sexe: d.partiel?.sexe ?? null, kg: d.partiel?.kg ?? null, age: d.partiel?.age ?? null }, bmr).kcal);
}

/** La ligne d'une session dans « Ce que tu as fait pour récupérer » (écran 1). */
export function sousLigneRecup(a: ActiviteFaite, kcal: number | null): string {
  const bouts = [heure(a.debut)];
  if (a.type === "sieste") {
    bouts.push(t("recuperer.dormies", { n: sommeilSieste(a) }));
    const s = sourceRecup(a);
    if (s) bouts.push(s);
    return bouts.join(", ");
  }
  bouts.push(minTexte(minutesDe(a)));
  if (a.fcDebut != null && a.fcFin != null) bouts.push(t("recuperer.fcDe", { a: Math.round(a.fcDebut), b: Math.round(a.fcFin) }));
  else if (a.fcMoy != null) bouts.push(t("recuperer.fcMoy", { n: Math.round(a.fcMoy) }));
  if (kcal != null) bouts.push(t("recuperer.kcal", { n: kcal }));
  return bouts.join(", ");
}
