// Vue 3D « au doigt » (D19) : noms des muscles du personnage et libellé d'accessibilité. Les ids viennent de
// picto-3d/v4/sorties/muscles.json (copiés dans les extras de assets/3d/personnage.glb).
import { IDS_MUSCLES } from "../../db/zones-blessure";
import { t, type CleSimple } from "../../i18n/index";

export { IDS_MUSCLES };

/** Noms évalués à la lecture (getters) : ils suivent la langue active. */
export const NOMS_MUSCLES = {} as Record<string, string>;
for (const id of IDS_MUSCLES) Object.defineProperty(NOMS_MUSCLES, id, { get: () => t(`exercices.muscle3d.${id}` as CleSimple), enumerable: true });

/** « Grand dorsal et grand rond » : la liste lue d'une traite, le premier seul en majuscule. */
export function listeMuscles(ids: string[]): string {
  const noms = ids.map((m, i) => (i === 0 ? NOMS_MUSCLES[m] ?? m : (NOMS_MUSCLES[m] ?? m).toLowerCase()));
  return noms.length < 2 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")}${t("exercices.vue3d.et")}${noms[noms.length - 1]}`;
}

/** Libellé de la vue pour le lecteur d'écran : l'exercice, le geste possible, puis les muscles allumés. */
export function libelleVue3D(exercice: string, principaux: string[], secondaires: string[]): string {
  const morceaux = [t("exercices.vue3d.libelle", { exercice })];
  if (principaux.length) morceaux.push(t("exercices.vue3d.principaux", { liste: listeMuscles(principaux).toLowerCase() }));
  if (secondaires.length) morceaux.push(t("exercices.vue3d.secondaires", { liste: listeMuscles(secondaires).toLowerCase() }));
  return morceaux.join(" ");
}
