// La charge en séance suit le matériel du lieu (planche materiel, lot séance) : paliers dans l'unité de l'exercice, charge la
// plus proche quand le lieu n'a pas celle voulue (et l'avis qui le dit), chargement de la barre au-dessus du pavé.
// Sans React ni base : la séance (seance-vue, actions-seance), la case (useChampChiffre) et le clavier l'appellent.
import { apercu, barreChargee, barreDe, chargement, enumerer, etendue, net, plusProche, trier, type Disque, type FormeBarre } from "../db/materiel";
import { chargesDe, type ChargesExercice, type Materiel } from "../db/depots/materiel";
import { minusculeInitiale, t } from "../i18n/index";
import { depuisUnite, lireNombre, nombre, versUnite, type Unite } from "./format";

/** Ce que la case de charge sait du matériel : de quoi écrire l'avis et dessiner la barre. */
export interface InfoCharge {
  /** Charges réalisables, en kg (chargesPour). */
  chargesKg: number[];
  /** « Haltères », « Barre droite », le nom de la machine. */
  materiel: string;
  lieu: string;
  /** Barre à charger : poids propre et disques en kg, libellé « Barre droite de 20 kg ». */
  barre?: { libelle: string; poidsPropreKg: number; disques: Disque[]; maxParCote: number };
  /** Série pas encore faite : une charge impossible y est remplacée par la plus proche, à l'ouverture de la case. */
  rapprocher: boolean;
  /** Série de la case (le clavier garde la charge de la série pour sa case de répétitions). */
  serie: string;
  /** Charge de la série, dans l'unité de l'exercice (cases de répétitions). */
  kgSerie: number | null;
  /** Unité de l'exercice (la case des répétitions n'en a pas). */
  unite: Unite;
}

/** Une charge à l'écran : au dixième en lbs, au centième en kg (1,25). */
export const enAffichage = (kg: number, u: Unite): number => (u === "lbs" ? Math.round(versUnite(kg, u) * 10) / 10 : net(kg));

/** Charges réalisables dans l'unité de l'exercice : la molette et la bande les proposent telles quelles. */
export const paliersAffiches = (chargesKg: readonly number[], u: Unite): number[] => trier(chargesKg.map((k) => enAffichage(k, u)));

const EPS = 0.001;
const dans = (liste: readonly number[], v: number) => liste.some((x) => Math.abs(x - v) < EPS);

/** Charge à mettre à la place de `v` (unité affichée) quand le lieu ne la fait pas ; null si elle existe ou s'il n'y a rien. */
export function rapprocher(liste: readonly number[] | null, v: number | null): number | null {
  if (!liste?.length || v == null || !(v > 0) || dans(liste, v)) return null;
  return plusProche(liste, v)?.kg ?? null;
}

/** « hors palier » : la charge de la série (kg) n'est pas une de celles du lieu, comparée dans l'unité affichée. */
export function horsCharges(chargesKg: readonly number[] | null | undefined, kg: number | null, u: Unite): boolean {
  if (!chargesKg?.length || kg == null) return false;
  return !dans(paliersAffiches(chargesKg, u), enAffichage(kg, u));
}

/** Avis au-dessus du pavé : « Pas de 12 kg ici : 8 kg, le plus proche. » et « Haltères de Maison : 4, 8, 20 et 30 kg ». */
export function avisCharge(voulu: number, liste: readonly number[], u: Unite, info: Pick<InfoCharge, "materiel" | "lieu">): { titre: string; detail: string } | null {
  const p = plusProche(liste, voulu);
  if (!p || p.existe) return null;
  const cle = p.plusLourd ? "materiel.avis.lourd" : p.plusLeger ? "materiel.avis.leger" : "materiel.avis.proche";
  return {
    titre: t(cle, { voulu: nombre(voulu, 2), kg: nombre(p.kg, 2), unite: u }),
    detail: t("materiel.avis.detail", { materiel: info.materiel, lieu: info.lieu, liste: apercu(liste, u) }),
  };
}

/**
 * Chargement de la barre pour la charge `v` (unité affichée) : disques d'un côté (kg, pour le dessin), « 20 et 1,25 kg par
 * côté » (ou « Barre seule ») et le libellé de la barre. Null si la barre ne fait pas cette charge.
 */
export function chargementAffiche(v: number | null, u: Unite, barre: NonNullable<InfoCharge["barre"]>): { coteKg: number[]; titre: string; sous: string } | null {
  if (v == null) return null;
  // La valeur affichée est arrondie (lbs) : on retrouve la charge réalisable qu'elle montre.
  const charges = barreChargee(barre.poidsPropreKg, barre.disques, barre.maxParCote);
  const kg = charges.find((c) => Math.abs(enAffichage(c, u) - v) < EPS) ?? depuisUnite(v, u);
  const cote = chargement(kg, barre.poidsPropreKg, barre.disques, barre.maxParCote);
  if (!cote) return null;
  const titre = cote.length ? t("materiel.seance.parCote", { liste: enumerer(cote.map((k) => enAffichage(k, u))), unite: u }) : t("materiel.seance.barreSeule");
  return { coteKg: cote, titre, sous: barre.libelle };
}

/** « Barre du squat » : le nom de l'exercice en minuscule initiale (« Squat » → « squat », « RDL » reste « RDL »). */
export function nomDansPhrase(nom: string): string {
  return nom.length > 1 && nom[1] === nom[1]!.toLowerCase() ? minusculeInitiale(nom) : nom;
}

/** Poids propre d'une barre dans son unité ; celui du type quand il n'est pas saisi. */
export function poidsBarre(m: Materiel): number {
  const d = barreDe(m.forme);
  return m.poidsPropre ?? (m.unite === "lbs" ? d.lbs : d.kg);
}

const nomBarre = (m: Materiel) => t(`materiel.barre.${(m.forme ?? "autre") as FormeBarre}`);

/** Pastille de l'exercice : « Barre 20 kg ». */
export const libellePuce = (m: Materiel): string => t("materiel.seance.puce", { kg: nombre(poidsBarre(m), 2), unite: m.unite });

/** Feuille « Barre du squat » : une option par barre à charger du lieu, son étendue dans l'unité de l'exercice. */
export function optionsBarre(barre: NonNullable<ChargesExercice["barre"]>, tous: readonly Materiel[], u: Unite): { id: string; forme: string | null; titre: string; sous: string; choisie: boolean }[] {
  return barre.barres
    .filter((b) => b.genre === "barre" && !b.prechargee)
    .map((b) => ({
      id: b.id,
      forme: b.forme,
      titre: t("materiel.seance.option", { nom: nomBarre(b), kg: nombre(poidsBarre(b), 2), unite: b.unite }),
      sous: etendue(paliersAffiches(chargesDe(b, tous), u), u),
      choisie: b.id === barre.choisie.id,
    }));
}

/** Libellé du matériel d'un exercice pour l'avis, d'après ses charges : la barre, la machine, sinon le genre. */
export function libelleMateriel(c: ChargesExercice, equipement: string): string {
  if (c.barre) return nomBarre(c.barre.choisie);
  if (c.nom) return c.nom;
  return equipement === "kettlebell" ? t("materiel.genre.kettlebell") : t("materiel.genre.halteres");
}

/** InfoCharge d'un exercice (null sans matériel inventorié pour lui ici). */
export function infoCharge(
  c: ChargesExercice | null | undefined,
  o: { equipement: string; lieu: string; serie: string; faite: boolean; kgSerie: number | null; unite: Unite },
): InfoCharge | null {
  if (!c?.charges.length) return null;
  const b = c.barre;
  return {
    chargesKg: c.charges,
    materiel: libelleMateriel(c, o.equipement),
    lieu: o.lieu,
    barre: b && !b.choisie.prechargee
      ? {
          libelle: t("materiel.seance.barreDe", { nom: nomBarre(b.choisie), kg: nombre(poidsBarre(b.choisie), 2), unite: b.choisie.unite }),
          poidsPropreKg: b.poidsPropreKg,
          disques: b.disques,
          maxParCote: b.maxParCote,
        }
      : undefined,
    rapprocher: !o.faite,
    serie: o.serie,
    kgSerie: o.kgSerie,
    unite: o.unite,
  };
}

export type BandeCharge = { avis: { titre: string; detail: string } } | { barre: { coteKg: number[]; titre: string; sous: string } };

/**
 * Bande au-dessus du pavé : l'avis tant que la case montre la charge mise à la place de la voulue, sinon le chargement de la
 * barre (case de charge : la valeur tapée ; case de répétitions : `kgSerie`, la dernière charge tapée pour la série).
 */
export function bandeCharge(
  ch: InfoCharge,
  o: { champ: string; texte: string; rapproche?: { voulu: number; kg: number } | null; kgSerie?: number | null },
): BandeCharge | null {
  const v = o.champ === "kg" ? lireNombre(o.texte) : o.champ === "reps" ? (o.kgSerie ?? ch.kgSerie) : null;
  if (v == null) return null;
  if (o.champ === "kg" && o.rapproche && Math.abs(o.rapproche.kg - v) < EPS) {
    const avis = avisCharge(o.rapproche.voulu, paliersAffiches(ch.chargesKg, ch.unite), ch.unite, ch);
    if (avis) return { avis };
  }
  const barre = ch.barre ? chargementAffiche(v, ch.unite, ch.barre) : null;
  return barre ? { barre } : null;
}
