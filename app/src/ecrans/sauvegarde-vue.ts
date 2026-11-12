import type { EtatSauvegarde } from "../sauvegarde";
import { ecart } from "../sauvegarde/regles";
import { t } from "../i18n/index";

// Ligne d'état de la sauvegarde (Données et confidentialité, Compte, Profil) : « Dernière sauvegarde : il y a 2 h · Drive ».

export const lieuSauvegarde = (e: Pick<EtatSauvegarde, "fournisseur">) => t(`reglages.lieu.${e.fournisseur ?? "autre"}`);

export function quand(ms: number, maintenant = Date.now()): string {
  const d = ecart(ms, maintenant);
  return d.unite === "min" && d.n === 0 ? t("reglages.aLInstant") : t(`reglages.ilYa.${d.unite}`, { n: d.n });
}

/** Texte et point d'état (actif : vert) ; null sans emplacement choisi. */
export function etatSauvegardeTexte(e: EtatSauvegarde, maintenant = Date.now()): { actif: boolean; texte: string } | null {
  if (!e.dossier) return null;
  const ou = lieuSauvegarde(e);
  if (e.echec != null && (e.derniere == null || e.echec > e.derniere)) return { actif: false, texte: t("reglages.echecSauvegarde", { quand: quand(e.echec, maintenant), ou }) };
  if (e.derniere == null) return { actif: false, texte: t("reglages.jamaisSauvegarde", { ou }) };
  if (e.retablie) return { actif: true, texte: t("reglages.sauvegardeRetablie", { ou }) };
  return { actif: true, texte: t("reglages.derniereSauvegarde", { quand: quand(e.derniere, maintenant), ou }) };
}
