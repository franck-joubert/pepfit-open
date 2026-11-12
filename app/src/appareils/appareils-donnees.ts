// Page Appareils (planche appareils-recommandes-v5, validée le 05/11) : ce que chaque marque apporte à pepfit.
// UN seul fichier de configuration : l'écran (ecrans/Appareils.tsx) ne contient aucune liste. Pur, testé par tests/appareils.test.ts.
// « plein » : lu par pepfit aujourd'hui ; « bientot » : prévu, pas encore lu ; « essai » : lu, mais expérimental.

export type CapaciteId = "fc" | "fcSeance" | "vfc" | "sommeil" | "pas" | "seances" | "poids" | "compo" | "temp";
export type EtatCapacite = "plein" | "bientot" | "essai";
export type Capacite = { id: CapaciteId; etat: EtatCapacite };
export type MarqueId = "telephone" | "whoop" | "withings" | "polar" | "ceinture";

export type Marque = {
  id: MarqueId;
  /** Carte entière « bientôt » (pointillés, logo atténué, étiquette « bientôt » en tête). */
  bientot?: boolean;
  /** Dans l'ordre d'affichage. */
  capacites: readonly Capacite[];
};

const c = (id: CapaciteId, etat: EtatCapacite = "plein"): Capacite => ({ id, etat });

export const MARQUES: Record<MarqueId, Marque> = {
  // Santé Connect (Android) et Apple Santé (iPhone) : app/src/natif/sante/logique.ts lit poids, pas, sommeil, FC au repos, VFC,
  // séances et composition ; la planche affiche les six premiers (la composition passe par la balance de la marque).
  telephone: { id: "telephone", capacites: [c("fc"), c("vfc"), c("sommeil"), c("pas"), c("seances"), c("poids")] },
  // Whoop : API officielle, whoop/convertir.ts (sommeil, `hrv_rmssd_milli`, `skin_temp_celsius`, séances) ; les pas passent par la
  // connexion expérimentale whoop/pas.ts, donc « essai ».
  whoop: { id: "whoop", capacites: [c("sommeil"), c("vfc"), c("temp"), c("seances"), c("pas", "essai")] },
  // Withings, preuve par capacité (main au 05/11) :
  //  poids, composition : getmeas, withings/convertir.ts (TYPES_CORPS : gras, maigre, muscle, eau, os, viscéral) et synchro.ts ;
  //  sommeil : Sleep v2 getsummary, withings/synchro-plus.ts (CHAMPS_SOMMEIL, api.ts) ;
  //  pas : getactivity, withings/synchro-plus.ts (CHAMPS_ACTIVITE, api.ts) ;
  //  température : getmeas types 71 (corps) et 73 (peau), withings/convertir.ts ;
  //  FC : FC au repos de la nuit, calculée depuis la FC à la minute (getintradayactivity) et écrite dans mesure_corps « fc », source
  //  withings, migration 170 (withings/fc-nuit.ts, commit 3847f569 de main) : lue par la Récupération, les zones, les kcal et l'Âge pepfit.
  //  La FC du jour (hr_average, hr_min, hr_max de getactivity) est rangée dans withings_jour mais pas affichée.
  withings: { id: "withings", capacites: [c("poids"), c("compo"), c("sommeil"), c("pas"), c("temp"), c("fc")] },
  // Polar : aucune lecture dans le code, tout est « bientôt ».
  polar: { id: "polar", bientot: true, capacites: [c("seances", "bientot"), c("sommeil", "bientot"), c("vfc", "bientot"), c("fc", "bientot"), c("pas", "bientot")] },
  // Ceinture Bluetooth en séance : la FC en direct (natif/capteur) ; la VFC n'est pas lue.
  ceinture: { id: "ceinture", capacites: [c("fcSeance"), c("vfc", "bientot")] },
};

/** Ordre des cartes sous CONNEXION DIRECTE. */
export const CONNEXION_DIRECTE: readonly MarqueId[] = ["whoop", "withings", "polar"];

export type Hote = "santeConnect" | "appleSante";
export type PlateformeAppareils = "android" | "ios";

/** Santé Connect existe sur Android, Apple Santé sur iPhone : l'hôte du téléphone passe en grand, l'autre en ligne dessous. */
export function hotes(os: PlateformeAppareils): { principal: Hote; autre: Hote } {
  return os === "ios" ? { principal: "appleSante", autre: "santeConnect" } : { principal: "santeConnect", autre: "appleSante" };
}

/** Capacités d'une marque à un état donné (la ligne « bientôt » sous le libellé, le suffixe « essai »). */
export const capacitesEtat = (m: MarqueId, etat: EtatCapacite): CapaciteId[] => MARQUES[m].capacites.filter((x) => x.etat === etat).map((x) => x.id);

/** Icône de l'appli (ui/Icone.tsx) de chaque capacité. */
export const ICONE_CAPACITE: Record<CapaciteId, "coeur" | "pouls" | "lune" | "pas" | "dumbbell" | "balance" | "goutte" | "thermo"> = {
  fc: "coeur",
  fcSeance: "coeur",
  vfc: "pouls",
  sommeil: "lune",
  pas: "pas",
  seances: "dumbbell",
  poids: "balance",
  compo: "goutte",
  temp: "thermo",
};

/** `?vue=iphone|android` dans un lien pepfitopen:// (captures, comme `?apparence=`) : force la plateforme pour la session, affichage seulement. */
export function plateformeDeLaVue(vue: string | undefined, os: string): PlateformeAppareils {
  if (vue === "iphone") return "ios";
  if (vue === "android") return "android";
  return os === "ios" ? "ios" : "android";
}
