// Écrans qu'une réponse de l'aide (e7) ou du support (e9) peut ouvrir : la clé vient du contenu ou du serveur, la route,
// le libellé du bouton et son icône restent dans l'appli (jamais d'adresse libre venue du serveur).
import type { CleSimple as Cle } from "../i18n/fr";
import type { NomIcone } from "../ui/Icone";
import { ECRANS_AIDE, THEMES_AIDE, type EcranAide, type ThemeAide } from "./types";

export const ECRAN: Record<EcranAide, { route: string; bouton: Cle; icone: NomIcone }> = {
  connexions: { route: "/settings/connexions", bouton: "aide.ecran.connexions", icone: "montre" },
  whoop: { route: "/settings/connexions", bouton: "aide.ecran.whoop", icone: "montre" },
  withings: { route: "/settings/connexions", bouton: "aide.ecran.withings", icone: "montre" },
  sante_connect: { route: "/settings/connexions", bouton: "aide.ecran.santeConnect", icone: "coeurp" },
  sauvegarde: { route: "/settings/data", bouton: "aide.ecran.sauvegarde", icone: "nuage" },
  verrou: { route: "/settings/verrou", bouton: "aide.ecran.verrou", icone: "cadenas" },
  region: { route: "/settings/region", bouton: "aide.ecran.region", icone: "globe" },
  objectifs: { route: "/nutrition/objectifs", bouton: "aide.ecran.objectifs", icone: "cible" },
  rappel: { route: "/settings/rappel", bouton: "aide.ecran.rappel", icone: "reveil" },
  reconnaissance: { route: "/settings/reconnaissance", bouton: "aide.ecran.reconnaissance", icone: "etincelle" },
};

export const estEcran = (x: unknown): x is EcranAide => typeof x === "string" && (ECRANS_AIDE as readonly string[]).includes(x);
export const estTheme = (x: unknown): x is ThemeAide => typeof x === "string" && (THEMES_AIDE as readonly string[]).includes(x);

/** Les thèmes des questions fréquentes (e5) : titre, ce qu'ils couvrent, icône. */
export const THEME: Record<ThemeAide, { titre: Cle; sous: Cle; icone: NomIcone }> = {
  compte: { titre: "aide.theme.compte", sous: "aide.theme.compteSous", icone: "user" },
  appareils: { titre: "aide.theme.appareils", sous: "aide.theme.appareilsSous", icone: "montre" },
  sport: { titre: "aide.theme.sport", sous: "aide.theme.sportSous", icone: "dumbbell" },
  sante: { titre: "aide.theme.sante", sous: "aide.theme.santeSous", icone: "coeurp" },
  nutrition: { titre: "aide.theme.nutrition", sous: "aide.theme.nutritionSous", icone: "pomme" },
  confidentialite: { titre: "aide.theme.confidentialite", sous: "aide.theme.confidentialiteSous", icone: "cadenas" },
};
