import { t } from "../../i18n/index";
import type { Calendrier } from "../../natif/agenda";

// Agenda du téléphone : petites mises en forme partagées par ses écrans.

/** « Perso », « Perso et Travail », « Perso, Travail et Club ». */
export function listeEt(noms: readonly string[]): string {
  if (noms.length < 2) return noms[0] ?? t("agenda.agendas.aucun");
  return t("agenda.liste.et", { a: noms.slice(0, -1).join(", "), b: noms[noms.length - 1]! });
}

/** Noms des agendas, dans l'ordre d'Android ; un identifiant qui n'existe plus est passé. */
export const nomsDe = (ids: readonly string[], cals: readonly Calendrier[]) => cals.filter((c) => ids.includes(c.id)).map((c) => c.titre);

/** Sous-ligne d'un agenda (3c) : le compte qui le porte. */
/** Sous un agenda : l'e-mail du compte qui le porte (retour du 03/11), « Compte Google » seulement s'il manque. */
export const compteDe = (c: Calendrier) => (c.local ? t("agenda.cal.cetTelephone") : c.compte || (c.google ? t("agenda.cal.compteGoogle") : ""));

/**
 * Sous le nom d'un agenda où écrire (retour du 03/11) : le compte (l'e-mail) qui le porte, sans répéter partout
 * « hors du chiffrement » ; seuls l'agenda local (invisible ailleurs) et un agenda de travail (vu des collègues) gardent leur mise en garde.
 */
export function sousDe(c: Calendrier, local: string | null): string {
  if (c.id === local || c.local) return t("agenda.cal.localSous");
  const compte = compteDe(c);
  if (/travail|work|bureau|office|pro\b/i.test(c.titre)) return `${compte}, ${t("agenda.cal.travailSous")}`;
  return compte;
}

/** Bandeau à montrer au retour sur la page Agenda (connexion faite depuis la page des agendas). */
export const annonceAgenda: { texte: string | null } = { texte: null };
