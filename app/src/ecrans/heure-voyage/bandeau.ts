// Le bandeau de la page Sommeil (planche sommeil, écran c1, variantes de c5) : changement d'heure dès le jeudi, voyage
// en préparation, arrivée vue au fuseau du téléphone. Pur : le texte du jour, ou rien.
import { minuscule, t } from "../../i18n/index";
import { villeDuFuseau } from "../../i18n/fuseaux";
import { ecartJ } from "../planification";
import { type Changement, changementProche, ligneDuJour, planChangement, type Rythme } from "./changement-heure";
import { duree, heureMin, heurePile, jourDans, jourSemaineLong } from "./horloge";
import { aLHeureDuLieu, ligneVoyage, momentVoyage, planVoyage, type PlanVoyage, type Voyage } from "./voyage";

export type GenreBandeau = "ete" | "hiver" | "voyage" | "arrivee";

export interface Bandeau {
  genre: GenreBandeau;
  titre: string;
  sous: string;
  route: "/sante/heure" | "/sante/voyage";
}

export interface EntreeBandeau {
  maintenant: number;
  /** Fuseau de l'appli (celui du téléphone, sauf choix contraire). */
  fuseau: string;
  /** Fuseau du téléphone. */
  appareil: string;
  rythme: Rythme | null;
  voyage: Voyage | null;
}

const ecartTexte = (d: number) => t(d < 0 ? "heureVoyage.plusTot" : "heureVoyage.plusTard", { d: duree(d) });

/** « New York · 6 h de moins ». */
export function lieuEtEcart(v: Voyage, p: PlanVoyage): string {
  const ville = villeDuFuseau(v.destination);
  const d = duree(p.decalage);
  return t(p.decalage < 0 ? "heureVoyage.lieuMoins" : "heureVoyage.lieuPlus", { ville, d });
}

/** Le bandeau du voyage, ou null s'il n'a rien à dire aujourd'hui. */
export function bandeauVoyage(e: EntreeBandeau): Bandeau | null {
  const v = e.voyage;
  if (!v || !e.rythme) return null;
  const p = planVoyage(v, e.rythme);
  if (p.sousSeuil) return null;
  const moment = momentVoyage(v, p, e.maintenant);
  if (moment === "avant" || moment === "fini") return null;
  const route = "/sante/voyage";
  const ville = villeDuFuseau(v.destination);
  if (p.court) {
    return { genre: "voyage", route, titre: t("heureVoyage.bandeauVoyage", { jour: jourSemaineLong(v.aller), lieu: lieuEtEcart(v, p) }), sous: t("heureVoyage.court") };
  }
  if (moment === "prepa") {
    const l = ligneVoyage(p, jourDans(e.maintenant, v.origine));
    const sous = l ? t("heureVoyage.ceSoirVers", { heure: heureMin(l.coucher), ecart: ecartTexte(l.ecart) }) : t("heureVoyage.planALArrivee");
    return { genre: "voyage", route, titre: t("heureVoyage.bandeauVoyage", { jour: jourSemaineLong(v.aller), lieu: lieuEtEcart(v, p) }), sous };
  }
  const l = ligneVoyage(p, jourDans(e.maintenant, v.destination));
  if (!l) return null;
  if (aLHeureDuLieu(v, e.appareil, e.maintenant)) {
    return { genre: "arrivee", route, titre: t("heureVoyage.bandeauArrivee", { ville }), sous: t("heureVoyage.planContinue", { heure: heureMin(l.coucher) }) };
  }
  return { genre: "voyage", route, titre: t("heureVoyage.bandeauAujourdhui", { lieu: lieuEtEcart(v, p) }), sous: t("heureVoyage.ceSoirHeureDe", { ville, heure: heureMin(l.coucher) }) };
}

/** Sous-titre du changement : le jeudi, le texte de la planche ; ensuite, le soir du plan. */
function sousChangement(c: Changement, auj: string, rythme: Rythme | null): string {
  const saut = t("heureVoyage.saut", { avant: heurePile(c.heureAvant), apres: heurePile(c.heureApres) });
  const plan = planChangement(c, rythme);
  const l = ligneDuJour(plan, auj);
  if (!l || l.fin) return t("heureVoyage.sautFait", { avant: heurePile(c.heureAvant), apres: heurePile(c.heureApres) });
  if (l === plan[0]) {
    if (c.ete) return `${saut} ${t("heureVoyage.avanceDesCeSoir", { d: duree(l.decalage) })}`;
    const j1 = minuscule(jourSemaineLong(plan[0]!.jour));
    const j2 = minuscule(jourSemaineLong(plan[1]!.jour));
    return `${saut} ${t("heureVoyage.reculeJours", { d: duree(l.decalage), j1, j2 })}`;
  }
  const ce = l.coucher != null ? t("heureVoyage.ceSoirVers", { heure: heureMin(l.coucher), ecart: ecartTexte(l.decalage) }) : t("heureVoyage.ceSoirEcart", { ecart: ecartTexte(l.decalage) });
  return `${saut} ${ce}`;
}

export function bandeauChangement(e: EntreeBandeau): Bandeau | null {
  const c = changementProche(e.maintenant, e.fuseau);
  if (!c) return null;
  const auj = jourDans(e.maintenant, e.fuseau);
  const genre = c.ete ? "ete" : "hiver";
  const nom = t(c.ete ? "heureVoyage.ete" : "heureVoyage.hiver");
  const titre = ecartJ(auj, c.jour) === 0 ? t("heureVoyage.depuisCetteNuit", { nom }) : t("heureVoyage.bandeauChangement", { jour: jourSemaineLong(c.jour), nom: minuscule(nom) });
  return { genre, route: "/sante/heure", titre, sous: sousChangement(c, auj, e.rythme) };
}

/** Le bandeau du jour : le voyage d'abord (il dit déjà l'heure du lieu), sinon le changement d'heure. */
export const bandeauDuJour = (e: EntreeBandeau): Bandeau | null => bandeauVoyage(e) ?? bandeauChangement(e);
