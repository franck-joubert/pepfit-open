// Modèle du calcul B (planches/morphologie, validée le 08/11) : tours des GLB v6 mesurés sur leurs bouts
// (picto-3d/corps-v3/modele.py, sorties/modele.json). Recopié de planches/morphologie/outils/morpho-propose.js ; le test
// tests/morphologie-b.test.ts vérifie que les deux sont identiques.

export type TourModele = "poitrine" | "sousPoitrine" | "taille" | "hanches" | "bras" | "cuisse" | "mollet";
/** Effet d'un curseur sur un tour, [côté −1, côté +1], en fraction de la taille. */
type Pentes = Partial<Record<string, Partial<Record<TourModele, readonly [number, number]>>>>;
/** Paliers du bonnet : effet à chaque k ; `corps` : les mêmes sur neuf corps, [adiposité][cage][k]. */
interface Paliers {
  k: readonly number[];
  poitrine: readonly number[];
  sousPoitrine: readonly number[];
  corps?: { adiposite: readonly number[]; cage: readonly number[]; poitrine: readonly (readonly (readonly number[])[])[]; sousPoitrine: readonly (readonly (readonly number[])[])[] };
}
export interface ModeleCorps {
  hBase: number;
  zero: Partial<Record<TourModele, number>>;
  pentes: Pentes;
  paliers?: { bonnet?: Paliers };
}

/**
 * Tours du modèle v3 mesurés sur ses bouts (picto-3d/corps-v3/modele.py : ruban de mesures.py, enveloppe convexe de la
 * coupe, bras baissés ; sous-poitrine au pli sous le sein, sur la cage seule), en fraction de sa hauteur (hBase, pose de
 * Vitruve : celle qui règle l'échelle de Santé). `zero` : curseurs à 0. `pentes[curseur][tour]` = [effet de −1 (retrait),
 * effet de +1], moindres carrés sur ±0,5 et ±1 (écart à la droite : 0,4 cm au plus) ; absent = moins de 0,05 % de la
 * taille ; la tenue n'en a plus (elle reste à 0). Homme à 1,80 m : poitrine 93,3, dos 81,0, taille 77,6, hanches 93,1,
 * bras 31,6, cuisse 56,0, mollet 38,2 cm. Femme à 1,65 m (la belle base du 08/11, sportive, bonnet A) : 90,5, 67,8, 60,8,
 * 94,4, 28,2, 57,5, 41,2 cm.
 */
export const MODELE: { h: ModeleCorps; f: ModeleCorps } = {
  h: { hBase: 1.8267, zero: { poitrine: 0.5181, sousPoitrine: 0.4502, taille: 0.4309, hanches: 0.5174, bras: 0.1754, cuisse: 0.3112, mollet: 0.2121 },
    pentes: {
      adiposite: { poitrine: [0.0252, 0.0996], sousPoitrine: [0.0369, 0.1089], taille: [0.0391, 0.1207], hanches: [0.0394, 0.0746], bras: [0.0154, 0.025], cuisse: [0.0249, 0.0539], mollet: [0.0055, 0.0139] },
      muscle: { poitrine: [0.0238, 0.0678], sousPoitrine: [0.0064, 0.0457], taille: [0.0037, 0.0223], hanches: [0.0059, 0.0118], bras: [0.0222, 0.0381], cuisse: [0.0038, 0.0213], mollet: [0.0053, 0.0084] },
      taille: { poitrine: [0.0002, 0.002], sousPoitrine: [0.0058, 0.021], taille: [0.0272, 0.0475], hanches: [0.0057, 0.0328], cuisse: [0.0013, 0.0164] },
      poitrine: { poitrine: [0.0301, 0.0482], sousPoitrine: [0.0321, 0.0436], taille: [0.0022, 0.0022] },
      bras: { poitrine: [-0.0015, -0.0017], bras: [0.0272, 0.0302] },
      cuisse: { taille: [0.0074, 0.0014], hanches: [0.0433, 0.0152], cuisse: [0.0194, 0.0261] },
      mollet: { mollet: [0.025, 0.0279] },
      hanches: { taille: [0.0043, 0.004], hanches: [0.0206, 0.0211], cuisse: [0.0082, 0.0203] },
    } },
  f: { hBase: 1.6676, zero: { poitrine: 0.5482, sousPoitrine: 0.4107, taille: 0.3686, hanches: 0.5721, bras: 0.1709, cuisse: 0.3483, mollet: 0.2499 },
    pentes: {
      adiposite: { poitrine: [0.023, 0.0984], sousPoitrine: [0.0065, 0.0797], taille: [0.0134, 0.1318], hanches: [0.0141, 0.0594], bras: [0.0259, 0.0583], cuisse: [0.0137, 0.0516], mollet: [0.0085, 0.0117] },
      muscle: { poitrine: [-0.0017, 0.01], sousPoitrine: [-0.0125, 0.0031], taille: [-0.0162, -0.0137], hanches: [0.0048, 0.0125], bras: [-0.0045, -0.0123], cuisse: [0.0074, 0.0191], mollet: [0.0021, -0.0004] },
      taille: { poitrine: [0, 0.001], sousPoitrine: [0.0006, 0.0174], taille: [0.0399, 0.0854], hanches: [0.0002, 0.0164], cuisse: [0, 0.0039] },
      poitrine: { poitrine: [0.0347, 0.0799], sousPoitrine: [0.0437, 0.1065], taille: [0.0029, 0.0402], hanches: [0, 0.0029], bras: [0.001, 0.0007], cuisse: [0, 0.001] },
      bonnet: { poitrine: [0.0385, 0.1618], sousPoitrine: [-0.001, 0.0263], taille: [0, 0.002] },
      bras: { bras: [0.0294, 0.0391] },
      cuisse: { taille: [0.0009, -0.0001], hanches: [0.0353, 0.0222], cuisse: [0.0245, 0.0284], mollet: [0.0005, 0.0001] },
      mollet: { cuisse: [0.0007, 0], mollet: [0.0175, 0.0246] },
      hanches: { sousPoitrine: [0, 0.001], taille: [0.0014, 0.0062], hanches: [0.0193, 0.0273], cuisse: [0.0163, 0.0213] },
    },
    // le bonnet par paliers sur la poitrine et la sous-poitrine (le sein ne grossit pas en droite) : effet à chaque k,
    // droite entre deux (0.05 cm d'écart au plus)
    paliers: { bonnet: { k: [-1.0, -0.5, 0.0, 0.25, 0.5, 0.75, 1.0],
      poitrine: [-0.0382, -0.01997, 0.0, 0.03838, 0.07868, 0.12029, 0.16287],
      sousPoitrine: [0.00096, 0.00048, 0.0, 0.00588, 0.01217, 0.01907, 0.02675],
      // les mêmes paliers sur neuf corps, adiposité × cage (curseur poitrine) à −1, 0, +1 : poitrine[adiposité][cage][k],
      // moins le même corps sans bonnet (D15) ; mélangés selon le corps du moment (bilinéaire)
      corps: { adiposite: [-1.0, 0.0, 1.0], cage: [-1.0, 0.0, 1.0],
        poitrine: [[[-0.03988, -0.02075, 0.0, 0.03958, 0.08101, 0.12371, 0.16737], [-0.03832, -0.02003, 0.0, 0.03904, 0.07994, 0.12215, 0.16545], [-0.0346, -0.01865, 0.0, 0.03832, 0.0785, 0.12005, 0.16275]], [[-0.03988, -0.02063, 0.0, 0.03898, 0.07976, 0.12185, 0.16485], [-0.0382, -0.01997, 0.0, 0.03838, 0.07868, 0.12029, 0.16287], [-0.03412, -0.01835, 0.0, 0.03778, 0.07742, 0.11843, 0.16047]], [[-0.0409, -0.02063, 0.0, 0.0397, 0.08059, 0.12245, 0.16509], [-0.04006, -0.02021, 0.0, 0.03934, 0.07976, 0.12125, 0.16359], [-0.03826, -0.01943, 0.0, 0.03892, 0.07892, 0.11987, 0.16167]]],
        sousPoitrine: [[[0.00078, 0.00042, 0.0, 0.00648, 0.01343, 0.02099, 0.02938], [0.00084, 0.00042, 0.0, 0.00606, 0.01265, 0.01979, 0.02752], [0.00108, 0.00054, 0.0, 0.00564, 0.01169, 0.01823, 0.02513]], [[0.00084, 0.00042, 0.0, 0.00618, 0.01283, 0.02015, 0.02842], [0.00096, 0.00048, 0.0, 0.00588, 0.01217, 0.01907, 0.02675], [0.0012, 0.0006, 0.0, 0.0054, 0.01127, 0.01763, 0.02447]], [[0.00078, 0.00036, 0.0, 0.00624, 0.01295, 0.02063, 0.02872], [0.00096, 0.00048, 0.0, 0.00582, 0.01205, 0.01895, 0.02621], [0.00108, 0.00054, 0.0, 0.00522, 0.01085, 0.01697, 0.02345]]] } } } },
};
/** L'homme aux épaules naturelles (personnage-morph-epaules.glb : clavicules raccourcies de 5,6 cm, tour d'épaules
 *  115,4 cm au lieu de 135,8 à 1,80 m ; bideltoïde 48,6 au lieu de 59,6), à la place de MODELE.h :
 *  calculerB(e, true). */
export const MODELE_EPAULES: ModeleCorps = { hBase: 1.8267, zero: { poitrine: 0.5099, sousPoitrine: 0.4502, taille: 0.4309, hanches: 0.5174, bras: 0.1751, cuisse: 0.3112, mollet: 0.2121 },
  pentes: {
    adiposite: { poitrine: [0.0249, 0.0994], sousPoitrine: [0.0369, 0.1092], taille: [0.0391, 0.1207], hanches: [0.0394, 0.0746], bras: [0.0155, 0.0236], cuisse: [0.0249, 0.0539], mollet: [0.0055, 0.0139] },
    muscle: { poitrine: [0.0201, 0.0613], sousPoitrine: [0.0064, 0.0456], taille: [0.0037, 0.0223], hanches: [0.0059, 0.0118], bras: [0.0223, 0.0377], cuisse: [0.0038, 0.0213], mollet: [0.0053, 0.0084] },
    taille: { poitrine: [0.0002, 0.002], sousPoitrine: [0.0058, 0.021], taille: [0.0272, 0.0475], hanches: [0.0057, 0.0328], cuisse: [0.0013, 0.0164] },
    poitrine: { poitrine: [0.03, 0.0486], sousPoitrine: [0.0321, 0.0436], taille: [0.0022, 0.0022] },
    bras: { poitrine: [-0.0014, -0.0015], bras: [0.0272, 0.0302] },
    cuisse: { taille: [0.0074, 0.0014], hanches: [0.0433, 0.0152], cuisse: [0.0194, 0.0261] },
    mollet: { mollet: [0.025, 0.0279] },
    hanches: { taille: [0.0043, 0.004], hanches: [0.0206, 0.0211], cuisse: [0.0082, 0.0203] },
  } };
