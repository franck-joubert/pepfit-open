import type { Forme } from "./fr";
import { de as communs } from "./dico-de/communs";
import { de as accueil } from "./dico-de/accueil";
import { de as seance } from "./dico-de/seance";
import { de as exercices } from "./dico-de/exercices";
import { de as salles } from "./dico-de/salles";
import { de as compte } from "./dico-de/compte";
import { de as profil } from "./dico-de/profil";
import { de as region } from "./dico-de/region";
import { de as ui } from "./dico-de/ui";
import { de as planif } from "./dico-de/planif";
import { de as sante } from "./dico-de/sante";
import { de as nutrition } from "./dico-de/nutrition";
import { de as suivi } from "./dico-de/suivi";
import { de as reglages } from "./dico-de/reglages";
import { de as programmes } from "./dico-de/programmes";
import { de as gps } from "./dico-de/gps";
import { de as effort } from "./dico-de/effort";
import { de as parcours } from "./dico-de/parcours";
import { de as boutique } from "./dico-de/boutique";
import { de as mesures } from "./dico-de/mesures";
import { de as mesures_pas } from "./dico-de/mesures-pas";
import { de as mesures_corps } from "./dico-de/mesures-corps";
import { de as mesures_coeur } from "./dico-de/mesures-coeur";
import { de as mesures_energie } from "./dico-de/mesures-energie";
import { de as mesures_sommeil } from "./dico-de/mesures-sommeil";
import { de as mesures_recup } from "./dico-de/mesures-recup";
import { de as mesures_effort } from "./dico-de/mesures-effort";
import { de as mesures_age } from "./dico-de/mesures-age";
import { de as mesures_cartes } from "./dico-de/mesures-cartes";
import { de as vma } from "./dico-de/vma";
import { de as circuits } from "./dico-de/circuits";
import { de as activite } from "./dico-de/activite";
import { de as mensurations } from "./dico-de/mensurations";
import { de as bonnet } from "./dico-de/bonnet";
import { de as precision } from "./dico-de/precision";
import { de as plats } from "./dico-de/plats";
import { de as sportStats } from "./dico-de/sport-stats";
import { de as fil } from "./dico-de/fil";
import { de as profilRetours } from "./dico-de/profil-retours";
import { de as menu } from "./dico-de/menu";
import { de as cycle } from "./dico-de/cycle";
import { de as recuperer } from "./dico-de/recuperer";
import { de as endormir } from "./dico-de/endormir";
import { de as agenda } from "./dico-de/agenda";
import { de as aide } from "./dico-de/aide";
import { de as macros } from "./dico-de/macros";
import { de as verrou } from "./dico-de/verrou";
import { de as heureVoyage } from "./dico-de/heure-voyage";
import { de as horaires } from "./dico-de/horaires";
import { de as effortJour } from "./dico-de/effort-jour";
import { de as tiroirs } from "./dico-de/tiroirs";
import { de as materiel } from "./dico-de/materiel";
import { de as parcoursSeance } from "./dico-de/parcours-seance";
import { de as chiffrement } from "./dico-de/chiffrement";
import { de as appareilsReco } from "./dico-de/appareils-reco";
import { de as fibresEau } from "./dico-de/fibres-eau";
import { de as fibresPage } from "./dico-de/fibres-page";

export const de: Forme = {
  ...communs,
  ...accueil,
  ...seance,
  ...exercices,
  ...salles,
  ...compte,
  ...profil,
  ...region,
  ...ui,
  ...planif,
  ...sante,
  ...nutrition,
  ...suivi,
  ...reglages,
  ...programmes,
  ...gps,
  ...effort,
  ...parcours,
  ...boutique,
  ...mesures,
  ...mesures_pas,
  ...mesures_corps,
  ...mesures_coeur,
  ...mesures_energie,
  ...mesures_sommeil,
  ...mesures_recup,
  ...mesures_effort,
  ...mesures_age,
  ...mesures_cartes,
  ...vma,
  ...circuits,
  ...activite,
  ...mensurations,
  ...bonnet,
  ...precision,
  ...plats,
  ...macros,
  ...sportStats,
  ...fil,
  ...profilRetours,
  ...menu,
  ...cycle,
  ...recuperer,
  ...endormir,
  ...verrou,
  ...agenda,
  ...aide,
  ...heureVoyage,
  ...horaires,
  ...effortJour,
  ...tiroirs,
  ...materiel,
  ...parcoursSeance,
  ...chiffrement,
  ...appareilsReco,
  ...fibresEau,
  ...fibresPage,
};
