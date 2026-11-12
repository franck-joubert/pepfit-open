// Source de vérité des textes : toute clé ajoutée ici doit l'être aussi dans en.ts (le compilateur et tests/i18n.test.ts le vérifient).
import type { Dico } from "./dico";
import { fr as communs } from "./dico-fr/communs";
import { fr as accueil } from "./dico-fr/accueil";
import { fr as seance } from "./dico-fr/seance";
import { fr as exercices } from "./dico-fr/exercices";
import { fr as salles } from "./dico-fr/salles";
import { fr as compte } from "./dico-fr/compte";
import { fr as profil } from "./dico-fr/profil";
import { fr as region } from "./dico-fr/region";
import { fr as ui } from "./dico-fr/ui";
import { fr as planif } from "./dico-fr/planif";
import { fr as sante } from "./dico-fr/sante";
import { fr as nutrition } from "./dico-fr/nutrition";
import { fr as suivi } from "./dico-fr/suivi";
import { fr as reglages } from "./dico-fr/reglages";
import { fr as programmes } from "./dico-fr/programmes";
import { fr as gps } from "./dico-fr/gps";
import { fr as effort } from "./dico-fr/effort";
import { fr as parcours } from "./dico-fr/parcours";
import { fr as boutique } from "./dico-fr/boutique";
import { fr as mesures } from "./dico-fr/mesures";
import { fr as mesures_pas } from "./dico-fr/mesures-pas";
import { fr as mesures_corps } from "./dico-fr/mesures-corps";
import { fr as mesures_coeur } from "./dico-fr/mesures-coeur";
import { fr as mesures_energie } from "./dico-fr/mesures-energie";
import { fr as mesures_sommeil } from "./dico-fr/mesures-sommeil";
import { fr as mesures_recup } from "./dico-fr/mesures-recup";
import { fr as mesures_effort } from "./dico-fr/mesures-effort";
import { fr as mesures_age } from "./dico-fr/mesures-age";
import { fr as mesures_cartes } from "./dico-fr/mesures-cartes";
import { fr as vma } from "./dico-fr/vma";
import { fr as circuits } from "./dico-fr/circuits";
import { fr as activite } from "./dico-fr/activite";
import { fr as mensurations } from "./dico-fr/mensurations";
import { fr as bonnet } from "./dico-fr/bonnet";
import { fr as precision } from "./dico-fr/precision";
import { fr as plats } from "./dico-fr/plats";
import { fr as sportStats } from "./dico-fr/sport-stats";
import { fr as fil } from "./dico-fr/fil";
import { fr as profilRetours } from "./dico-fr/profil-retours";
import { fr as menu } from "./dico-fr/menu";
import { fr as cycle } from "./dico-fr/cycle";
import { fr as recuperer } from "./dico-fr/recuperer";
import { fr as endormir } from "./dico-fr/endormir";
import { fr as agenda } from "./dico-fr/agenda";
import { fr as aide } from "./dico-fr/aide";
import { fr as macros } from "./dico-fr/macros";
import { fr as verrou } from "./dico-fr/verrou";
import { fr as heureVoyage } from "./dico-fr/heure-voyage";
import { fr as horaires } from "./dico-fr/horaires";
import { fr as effortJour } from "./dico-fr/effort-jour";
import { fr as tiroirs } from "./dico-fr/tiroirs";
import { fr as materiel } from "./dico-fr/materiel";
import { fr as parcoursSeance } from "./dico-fr/parcours-seance";
import { fr as chiffrement } from "./dico-fr/chiffrement";
import { fr as appareilsReco } from "./dico-fr/appareils-reco";
import { fr as fibresEau } from "./dico-fr/fibres-eau";
import { fr as fibresPage } from "./dico-fr/fibres-page";

export const fr = {
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
} satisfies Dico;

export type Cle = keyof typeof fr;
type EstChaine<K extends Cle> = (typeof fr)[K] extends string ? true : false;
export type CleSimple = { [K in Cle]: EstChaine<K> extends true ? K : never }[Cle];
export type ClePluriel = Exclude<Cle, CleSimple>;
export type Forme = { [K in Cle]: EstChaine<K> extends true ? string : { one: string; other: string } };
