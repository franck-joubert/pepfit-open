// Les mots de la Récupération (planche recuperation, D2 : « Prêt, Correct, Fatigué », accordés selon le profil ; correction de
// Alex : un petit « % » à côté du score, partout). Sans React Native : testé par tests/recup-vue.test.ts.
import { t } from "../../i18n/index";
import { nombre } from "../format";
import type { NiveauRecup, ResultatRecup } from "../recup-pepfit";

/** « 90 % » (en : « 90% »). */
export const texteRecup = (score: number): string => t("recup.pourcent", { n: nombre(Math.round(score), 0) });

/** « Prêt », « Prête », « Correct »… */
export const motRecup = (niveau: NiveauRecup, feminin = false): string => t(`recup.niveau.${niveau}${feminin ? "_f" : ""}` as "recup.niveau.pret");

/** La phrase d'action ; sous 40 % de précision, la phrase prudente (D4). */
export function phraseRecup(niveau: NiveauRecup, prudent: boolean, feminin = false): string {
  if (prudent) return t("recup.phrase.prudente");
  return t(`recup.phrase.${niveau}${feminin ? "_f" : ""}` as "recup.phrase.pret");
}

/** « 7 h 12 », « 0 h 50 » : des minutes de sommeil. */
export function heuresMinutes(min: number): string {
  const m = Math.round(min);
  return t("sante.duree", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

/**
 * Ni VFC ni FC au repos cette nuit (C14) : « sans ta montre » quand le sommeil vient du téléphone (ou manque) ; une montre qui
 * a mesuré le sommeil sans VFC ni FC au repos (Samsung, Garmin, Polar…) était bien là : « sans VFC ni FC au repos ». null :
 * la nuit a une VFC ou une FC au repos.
 */
export function manqueNuit(r: Pick<ResultatRecup, "detail" | "nuit">): "montre" | "vfcFc" | null {
  if (r.detail.vfc.valeur != null || r.detail.fc.valeur != null) return null;
  return r.detail.sommeil.source === "montre" ? "vfcFc" : "montre";
}
