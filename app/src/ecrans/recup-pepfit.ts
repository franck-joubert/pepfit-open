// La Récupération pepfit (planche recuperation du 31/10, validée avec ses corrections : « 90 % » partout, couleur
// de l'onglet d'origine). Pur (sans React Native ni base) : testé par tests/recup-pepfit.test.ts ; recopié pour le MCP dans
// serveur/mcp/src/recup.ts (tests/appli.test.ts du MCP vérifie qu'ils donnent le même score).
//
// 1. On stocke les mesures brutes de chaque nuit (recup_nuit, migration 56 : VFC, FC au repos, sommeil), jamais le score.
// 2. Une seule fonction, `scoreRecup(jour, donnees, p = RECUP)`, le calcule à l'affichage : chaque part face à TA norme (les
//    42 nuits d'avant), ramenée sur 0 à 100 (70 = un matin comme d'habitude), puis la moyenne pondérée (NOTES § 2) :
//    Récupération = 0,45 × VFC + 0,20 × FC au repos + 0,25 × Sommeil + 0,10 × Charge.
// 3. Ses paramètres sont dans RECUP, constante unique et versionnée : la changer recalcule tout l'historique sans migration
//    (semainier, semaine, 12 semaines, cible d'Effort, MCP).
// 4. Une part absente compte pour 70 ; la précision est la somme des poids présents × leur qualité ; sous 25 %, pas de score ;
//    sous 40 %, la cible d'Effort n'est pas ajustée (D4). Une VFC très basse plafonne à 66 (D5).
// 5. Le suivi du cycle (planche cycle, § 3.4, D13) change seulement QUELLES nuits font la norme de la VFC et de la FC : celles
//    de la même moitié du cycle dans les 3 derniers cycles terminés (`phase`, donnée par cycle/modele.ts), dès 20 nuits ; le
//    reste est inchangé, et le score sans ajustement est toujours gardé (`ajuste.sans`).
// 6. Version 2 (planche recuperer, 31/10) : les siestes de la veille entrent dans la part Sommeil, avec un poids réduit (D7) :
//    en entier contre la dette des 7 nuits, à 50 % contre le besoin (jusqu'au besoin, jamais au-delà). La nuit, ses phases
//    et sa durée affichée restent celles de la nuit.
// 7. Version 3 (docs/SANS-WHOOP.md C6, décision du 01/11) : aucune VFC sur les 42 nuits ni cette nuit (Garmin, Samsung,
//    Polar, Amazfit, Xiaomi n'en écrivent pas) : le poids de la VFC passe à la FC au repos et au sommeil (`sansVfc`), au lieu
//    d'un 70 qui écrasait le score. La précision reste comptée sur les poids de référence : sans VFC, 55 % au plus.
// 8. Version 4 (planche sommeil, 03/11, D1, D17, D18) : la dette est « à rattraper » (calculerDette : 7 nuits pondérées de
//    7/7 à 1/7, que les nuits longues remboursent ; les siestes comptent dans le sommeil des 24 h), le besoin est celui de
//    pepfit (besoinNuit : objectif + rattrapage + effort récent), jamais celui de Whoop ; les nuits du téléphone comptent, à
//    moitié pour la précision ; sous 40 % de précision, ni dette ni besoin ajouté. La page Sommeil, la sieste, le rappel et le
//    MCP lisent ces mêmes chiffres (`detail.sommeil.calcul`).
// Whoop n'entre jamais ici : ses mesures brutes comptent comme celles de tout capteur, son score jamais (labo/recup seul).

export type ClePart = "vfc" | "fc" | "sommeil" | "charge";
type Paire = readonly [number, number];

export interface ParamsRecup {
  version: number;
  poids: Readonly<Record<ClePart, number>>;
  /** Les poids quand aucune VFC n'a jamais été mesurée (42 nuits et cette nuit). */
  sansVfc: Readonly<Record<ClePart, number>>;
  norme: { nuits: number; min: number; plein: number };
  ecart: { base: number; pente: number; sdMinVfc: number; sdMinFc: number };
  sommeil: {
    duree: number; regularite: number; dette: number; penteDuree: number; regulariteLibre: number; penteRegularite: number; detteParPoint: number;
    qualiteTelephone: number; nuits: number; nuitsRegularite: number;
  };
  charge: { poidsVeille: number; poidsAvantVeille: number; repos: number; normale: number; pente: number; jours: number; zone: Paire };
  neutre: number;
  seuils: Paire;
  garde: { partVfc: number; plafond: number };
  precision: { score: number; prudente: number };
  cible: { milieu: number; pente: number; bornes: Paire };
  plausible: { vfc: Paire; fc: Paire; sommeil: Paire };
  sieste: { poidsDuree: number };
  dette: ParamsDette;
}

/** Tous les paramètres du score (planches/recuperation/outils/modele.js). Changer une valeur : changer aussi `version`. */
export const RECUP: ParamsRecup = {
  // 4 : la dette « à rattraper » et le besoin de pepfit (planche sommeil) ; 3 : sans VFC jamais mesurée, son poids passe à la FC au repos et au sommeil (C6) ; 2 : les siestes de la veille
  version: 4,
  // Les quatre parts : la VFC d'abord (NOTES § 2.6, D1).
  poids: { vfc: 0.45, fc: 0.2, sommeil: 0.25, charge: 0.1 },
  // Sans VFC : ses 45 % partagés entre FC au repos et sommeil au prorata de leurs poids (20 : 25), l'Effort inchangé.
  sansVfc: { vfc: 0, fc: 0.4, sommeil: 0.5, charge: 0.1 },
  // La norme personnelle : les 42 nuits d'avant ; 14 au moins pour s'en servir, pleine confiance à 28 (D7).
  norme: { nuits: 42, min: 14, plein: 28 },
  // Écart à la norme (en écarts types) → part : 70 à la norme, 25 points par écart type ; écarts types planchers.
  ecart: { base: 70, pente: 25, sdMinVfc: 0.05, sdMinFc: 2 },
  // Sommeil : durée face au besoin de pepfit, régularité du milieu de nuit, « à rattraper » des 7 nuits (dette.ts de la planche).
  sommeil: { duree: 0.6, regularite: 0.2, dette: 0.2, penteDuree: 200, regulariteLibre: 15, penteRegularite: 1.5, detteParPoint: 6, qualiteTelephone: 0.6, nuits: 7, nuitsRegularite: 3 },
  // Charge : Effort pepfit de la veille (×2) et de l'avant-veille (×1), face à la moyenne de tes jours (28 jours, repos compris).
  charge: { poidsVeille: 2, poidsAvantVeille: 1, repos: 100, normale: 80, pente: 40, jours: 28, zone: [0.8, 1.3] },
  // Une part absente compte comme un matin habituel.
  neutre: 70,
  // Fatigué sous 34, Prêt dès 67 (D3).
  seuils: [34, 67],
  // Garde : une VFC très basse (part sous 30) ne laisse jamais dire « Prêt » (D5).
  garde: { partVfc: 30, plafond: 66 },
  // Précision : pas de score dessous ; phrase prudente et cible non ajustée dessous (D4).
  precision: { score: 25, prudente: 40 },
  // La cible d'Effort du jour : multiplicateur de la charge visée (NOTES § 5, D10).
  cible: { milieu: 65, pente: 0.006, bornes: [0.6, 1.2] },
  // Mesures aberrantes ignorées (comme l'ancienne forme de la nuit).
  plausible: { vfc: [10, 250], fc: [30, 110], sommeil: [60, 960] },
  // Les siestes de la veille (version 2, planche recuperer, D7) : leur durée compte à 50 % contre le besoin, en entier contre la dette.
  sieste: { poidsDuree: 0.5 },
  // La dette de sommeil et le besoin de la nuit (planche sommeil, NOTES § 2, D1 à D4, D16 à D18).
  dette: {
    fenetre: 7,
    // 45 min plus tôt par soir : sous le gain moyen des études d'allongement du sommeil (+ 51 min, Zhu 2022) (D3).
    avance: 45,
    // au-delà de 7 soirs pour éponger : « dette lourde », sans chiffre d'action en heures (D3)
    soirsMax: 7,
    // le CTA de sieste, lu sur « à rattraper » (D16)
    seuilCta: 90,
    // ce que vaut une nuit selon sa source (choix pepfit) : une montre mesure, un téléphone devine, une saisie se souvient (D17)
    qualite: { montre: 1, telephone: 0.5, saisie: 0.5 },
    // sous 40 % : aucun chiffre d'action, le besoin redevient l'objectif (le seuil de la cible d'Effort, D17)
    precisionMin: 40,
    // l'effort récent : jusqu'à 20 min quand l'Effort d'hier dépasse de 50 % sa moyenne des 28 jours (choix pepfit, D18)
    effortMax: 20,
    effortPlein: 0.5,
    // l'affichage arrondit aux 5 min
    arrondi: 5,
  },
};

export const CLES_PARTS: readonly ClePart[] = ["vfc", "fc", "sommeil", "charge"];

/** Source du sommeil d'une nuit : une montre (phases, ou Whoop), ou le téléphone seul (la durée). */
export type SourceSommeil = "montre" | "telephone";

/** Ce que la base garde d'une nuit (recup_nuit) : la nuit qui finit le matin de `jour`. */
export interface NuitRecup {
  /** VFC de la nuit : RMSSD en ms. */
  rmssd: number | null;
  fcRepos: number | null;
  sommeilMin: number | null;
  /** Milieu de la nuit, en minutes depuis midi la veille (heure locale : 720 = minuit), null sans heures. */
  milieuMin: number | null;
  /** Besoin de sommeil calculé par Whoop (minutes) : gardé pour le labo/sommeil seulement, jamais lu par le score (D18). */
  besoinMin: number | null;
  sourceSommeil: SourceSommeil | null;
}

export interface DonneesRecup {
  /** Les nuits, par jour de réveil (« AAAA-MM-JJ »). */
  nuits: ReadonlyMap<string, NuitRecup>;
  /** Points de l'Effort de chaque jour (séances et activité de la journée), par jour ; un jour absent est un repos. */
  charges: ReadonlyMap<string, number>;
  /** L'objectif de sommeil du profil (minutes) : la base du besoin, et ce contre quoi se compte la dette. */
  objectifSommeil: number;
  /** Minutes de sommeil des siestes de chaque jour (recup_activite, recuperer.ts) ; elles comptent le lendemain matin, dans le
   * sommeil des 24 h de la nuit qui suit (la dette lit les 8 jours d'avant le matin). */
  siestes?: ReadonlyMap<string, number>;
  /**
   * Suivi du cycle (planche cycle, § 3.4) : les jours de la même moitié du cycle que `jour` (3 derniers cycles terminés) et le
   * nombre de nuits à partir duquel leur norme remplace celle des 42 nuits ; null ou absent : la norme habituelle.
   */
  phase?: ((jour: string) => PhaseRecup | null) | null;
}

/** La moitié du cycle d'un matin et ses jours de norme (cycle/modele.ts, joursMemeMoitie). */
export interface PhaseRecup {
  moitie: "premiere" | "seconde";
  jours: ReadonlySet<string>;
  min: number;
}

// ---------------------------------------------------------------- outils

const borne = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const moyenne = (l: readonly number[]) => l.reduce((s, x) => s + x, 0) / l.length;
const ecartType = (l: readonly number[]) => {
  const m = moyenne(l);
  return Math.sqrt(l.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, l.length - 1));
};
const dans = (x: number | null | undefined, [a, b]: readonly [number, number]): x is number => x != null && Number.isFinite(x) && x >= a && x <= b;

/** « AAAA-MM-JJ » décalé de `n` jours (calendrier, sans fuseau). */
export function decalerIso(iso: string, n: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a!, m! - 1, j! + n));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- les parts

/** Qualité d'une norme selon le nombre de nuits : 0 sous 14 (part absente), 0,5 à 14, 1 dès 28. */
export function qualiteNorme(n: number, p: ParamsRecup = RECUP): number {
  if (n < p.norme.min) return 0;
  return borne(0.5 + (0.5 * (n - p.norme.min)) / (p.norme.plein - p.norme.min), 0.5, 1);
}

export interface Norme {
  n: number;
  /** Moyenne et écart type (VFC : sur le logarithme). */
  m: number;
  sd: number;
  log: boolean;
  centre: number;
  /** Zone habituelle : ± 1 écart type (D6). */
  zone: [number, number];
  q: number;
}

/** Norme d'une série (les nuits d'avant, la plus ancienne d'abord), null sans valeur. `toutes` : sans la limite des 42 nuits
 * (la norme de la même phase, qui en compte jusqu'à 3 cycles). */
export function norme(valeurs: readonly number[], log: boolean, sdMin: number, p: ParamsRecup = RECUP, toutes = false): Norme | null {
  const v = (toutes ? valeurs : valeurs.slice(-p.norme.nuits)).map((x) => (log ? Math.log(x) : x));
  if (!v.length) return null;
  const m = moyenne(v);
  const sd = Math.max(sdMin, ecartType(v));
  const ret = (x: number) => (log ? Math.exp(x) : x);
  return { n: v.length, m, sd, log, centre: ret(m), zone: [ret(m - sd), ret(m + sd)], q: qualiteNorme(v.length, p) };
}

/** Écart en écarts types → part de 0 à 100. `sens` : +1 si plus haut est mieux (VFC), −1 sinon (FC au repos). */
export function partEcart(x: number, n: Norme, sens: 1 | -1, p: ParamsRecup = RECUP): { z: number; part: number } {
  const z = (sens * ((n.log ? Math.log(x) : x) - n.m)) / n.sd;
  return { z, part: borne(p.ecart.base + p.ecart.pente * z, 0, 100) };
}

export interface EntreeSommeil {
  dormi: number;
  besoin: number;
  /** Écart type du milieu de nuit sur 7 nuits (minutes), null avec moins de 3 nuits ou le téléphone seul. */
  regularite: number | null;
  /** Dette des 7 nuits (minutes), null avec le téléphone seul. */
  dette: number | null;
}

/** Sommeil = 0,6 × durée + 0,2 × régularité + 0,2 × dette ; sans régularité ni dette, la durée seule (NOTES § 2.4). */
export function partSommeil(e: EntreeSommeil, p: ParamsRecup = RECUP): { duree: number; regularite: number | null; dette: number | null; part: number } {
  const s = p.sommeil;
  const r = e.dormi / e.besoin;
  const duree = r >= 1 ? 100 : borne(100 - s.penteDuree * (1 - r), 0, 100);
  const regularite = e.regularite == null ? null : borne(100 - s.penteRegularite * Math.max(0, e.regularite - s.regulariteLibre), 0, 100);
  const dette = e.dette == null ? null : borne(100 - e.dette / s.detteParPoint, 0, 100);
  const morceaux = ([[duree, s.duree], [regularite, s.regularite], [dette, s.dette]] as [number | null, number][]).filter((x): x is [number, number] => x[0] != null);
  const part = morceaux.reduce((a, [v, w]) => a + v * w, 0) / morceaux.reduce((a, [, w]) => a + w, 0);
  return { duree, regularite, dette, part };
}

/** Charge : R = (2 × veille + avant-veille) ÷ (3 × moyenne de tes jours) ; 100 − 20 R jusqu'à 1, puis 80 − 40 (R − 1). */
export function partCharge(e: { veille: number; avantVeille: number; moyJour: number }, p: ParamsRecup = RECUP): { r: number; part: number } {
  const c = p.charge;
  const r = (c.poidsVeille * e.veille + c.poidsAvantVeille * e.avantVeille) / ((c.poidsVeille + c.poidsAvantVeille) * e.moyJour);
  const part = r <= 1 ? c.repos - (c.repos - c.normale) * r : borne(c.normale - c.pente * (r - 1), 0, 100);
  return { r, part };
}

// ---------------------------------------------------------------- la dette de sommeil (planche sommeil, 03/11)
// Un seul calcul pour la page Sommeil, le CTA de sieste, le rappel, la part sommeil du score et le MCP (NOTES § 2) :
//   sommeil des 24 h = nuit + siestes de la journée d'avant, minute pour minute (Mollicone 2008)
//   écart            = objectif − sommeil des 24 h (positif : manque ; négatif : nuit longue, qui rembourse)
//   à rattraper      = max(0, Σ poids × écart − siestes d'aujourd'hui), poids 7/7 la nuit dernière … 1/7 (nuits mesurées)
//   manque cumulé    = Σ max(0, écart) (petit, informatif)
//   soirs            = ⌈à rattraper ÷ 45 min⌉ ; au-delà de 7 : « dette lourde »
//   précision        = Σ poids × qualité ÷ Σ poids (montre 1, téléphone ou saisie ½, sans mesure 0)
// Tout part des durées brutes : aucun calcul de Whoop (dette, besoin, performance) n'y entre.

export interface ParamsDette {
  fenetre: number;
  avance: number;
  soirsMax: number;
  seuilCta: number;
  qualite: Readonly<Record<SourceNuit, number>>;
  precisionMin: number;
  effortMax: number;
  effortPlein: number;
  arrondi: number;
}

/** Source d'une nuit pour la précision : une montre ou un bracelet, le téléphone, une saisie. */
export type SourceNuit = SourceSommeil | "saisie";

/** Une nuit mesurée : sa durée, les siestes de la journée d'avant (minutes), sa source. */
export interface NuitDette {
  sommeil: number;
  siestes: number;
  source: SourceNuit;
}

/** Une des 7 nuits : âge (0 = la nuit dernière), poids, sommeil des 24 h et écart à l'objectif (0 sans mesure). */
export interface LigneDette {
  age: number;
  mesuree: boolean;
  dormi: number | null;
  ecart: number;
  poids: number;
}

export interface Dette {
  /** Les 7 nuits, la plus récente d'abord. */
  lignes: LigneDette[];
  mesurees: number;
  /** Le manque brut des 7 nuits (minutes) : la somme des manques, sans rien rembourser. */
  cumul: number;
  /** À rattraper (minutes, non arrondi) : le chiffre d'action. */
  aRattraper: number;
  /** Soirs à 45 min plus tôt pour l'éponger (0 : rien à rattraper). */
  soirs: number;
  /** Plus de 7 soirs : pas de chiffre d'action en heures. */
  lourde: boolean;
  /** Précision des 7 nuits (0 à 100). */
  precision: number;
  /** Précision suffisante (40 %) pour un chiffre d'action. */
  chiffre: boolean;
}

/** Poids d'une nuit selon son âge (0 = la nuit dernière) : 7/7, 6/7… 1/7 (D2, choix pepfit). */
export const poidsNuit = (age: number, p: ParamsDette = RECUP.dette): number => (p.fenetre - age) / p.fenetre;

/** Les minutes arrondies pour l'affichage (5 min). */
export const arrondiDette = (m: number, p: ParamsDette = RECUP.dette): number => Math.round(m / p.arrondi) * p.arrondi;

/**
 * La dette des 7 nuits : `nuits` de la plus récente à la plus ancienne (null : pas mesurée, ignorée, D4) ; `siestesDuJour` :
 * les siestes d'aujourd'hui, après la nuit, qui comptent en entier.
 */
export function calculerDette(nuits: readonly (NuitDette | null)[], objectif: number, siestesDuJour = 0, p: ParamsDette = RECUP.dette): Dette {
  const lignes: LigneDette[] = [];
  let cumul = 0;
  let brut = 0;
  let fiable = 0;
  let tout = 0;
  let mesurees = 0;
  for (let age = 0; age < p.fenetre; age++) {
    const n = nuits[age] ?? null;
    const w = poidsNuit(age, p);
    tout += w;
    if (!n) {
      lignes.push({ age, mesuree: false, dormi: null, ecart: 0, poids: w });
      continue;
    }
    const dormi = n.sommeil + Math.max(0, n.siestes);
    const ecart = objectif - dormi;
    lignes.push({ age, mesuree: true, dormi, ecart, poids: w });
    mesurees++;
    cumul += Math.max(0, ecart);
    brut += w * ecart;
    fiable += w * (p.qualite[n.source] ?? 0);
  }
  const aRattraper = Math.max(0, Math.round(brut - Math.max(0, siestesDuJour)));
  const soirs = aRattraper === 0 ? 0 : Math.ceil(aRattraper / p.avance);
  const precision = Math.round((100 * fiable) / tout);
  return { lignes, mesurees, cumul: Math.round(cumul), aRattraper, soirs, lourde: soirs > p.soirsMax, precision, chiffre: precision >= p.precisionMin };
}

export interface BesoinNuit {
  objectif: number;
  /** Ce qui restait à rattraper la veille au soir, 45 min au plus (le plan du coucher). */
  rattrapage: number;
  /** L'effort récent : 0 à 20 min. */
  effort: number;
  total: number;
  /** À rattraper la veille au soir (minutes), null sous le seuil. */
  veille: number | null;
  /** Effort d'hier ÷ sa moyenne des 28 jours, null sans moyenne. */
  ratioEffort: number | null;
  precision: number;
  chiffre: boolean;
}

/**
 * Le besoin de la nuit (D18) : objectif + rattrapage + effort récent. `nuits` : la nuit d'abord, 8 nuits (la 8e sert à la
 * dette de la veille au soir) ; `effort` : l'Effort d'hier et sa moyenne des 28 jours ; `siestesVeille` : les siestes de la
 * veille, déjà comptées le soir. Sous le seuil de précision : l'objectif seul. La dette se compte toujours contre l'objectif,
 * jamais contre ce besoin, qui la contient déjà.
 */
export function besoinNuit(
  nuits: readonly (NuitDette | null)[],
  objectif: number,
  effort: { veille: number; moyenne: number | null } | null,
  siestesVeille = 0,
  p: ParamsDette = RECUP.dette,
): BesoinNuit {
  const r = calculerDette(nuits, objectif, 0, p);
  if (!r.chiffre) return { objectif, rattrapage: 0, effort: 0, total: objectif, veille: null, ratioEffort: null, precision: r.precision, chiffre: false };
  const veille = calculerDette(nuits.slice(1), objectif, siestesVeille, p).aRattraper;
  const rattrapage = Math.min(p.avance, veille);
  const ratio = effort && effort.moyenne != null && effort.moyenne > 0 ? effort.veille / effort.moyenne : null;
  const e = ratio == null ? 0 : Math.round(p.effortMax * borne((ratio - 1) / p.effortPlein, 0, 1));
  return { objectif, rattrapage, effort: e, total: objectif + rattrapage + e, veille, ratioEffort: ratio, precision: r.precision, chiffre: true };
}

/**
 * Le coucher conseillé ce soir (minutes depuis minuit, aux 5 min) depuis le coucher moyen : 45 min plus tôt s'il y a à
 * rattraper, le coucher moyen sinon ; null sous le seuil, en dette lourde ou sans coucher moyen.
 */
export function coucherConseille(coucherMoyen: number | null, d: Dette, p: ParamsDette = RECUP.dette): number | null {
  if (coucherMoyen == null || !d.chiffre || d.lourde) return null;
  const m = arrondiDette(d.aRattraper > 0 ? coucherMoyen - p.avance : coucherMoyen, p);
  return ((m % 1440) + 1440) % 1440;
}

/** La dette et le besoin d'un matin, tels que les lisent la page Sommeil, la sieste, le rappel, le score et le MCP. */
export interface SommeilCalcule {
  dette: Dette;
  besoin: BesoinNuit;
}

/** Les `n` nuits jusqu'au matin de `jour` (la plus récente d'abord), avec les siestes de la journée d'avant chacune. */
export function nuitsDette(jour: string, d: DonneesRecup, n: number, p: ParamsRecup = RECUP): (NuitDette | null)[] {
  return Array.from({ length: n }, (_, i) => {
    const j = decalerIso(jour, -i);
    const x = d.nuits.get(j);
    if (!dans(x?.sommeilMin, p.plausible.sommeil)) return null;
    return { sommeil: x!.sommeilMin!, siestes: Math.max(0, d.siestes?.get(decalerIso(j, -1)) ?? 0), source: x!.sourceSommeil ?? "montre" };
  });
}

/** Moyenne de l'Effort des 28 jours d'avant `jour` (repos compris), null sans aucun. */
function moyenneCharges(jour: string, d: DonneesRecup, p: ParamsRecup): number | null {
  let somme = 0;
  for (let i = 1; i <= p.charge.jours; i++) somme += Math.max(0, d.charges.get(decalerIso(jour, -i)) ?? 0);
  return somme > 0 ? somme / p.charge.jours : null;
}

/** La dette au matin de `jour` (siestes de ce jour non comptées : lireDetteDuJour les retire) et le besoin de sa nuit. */
export function sommeilDuMatin(jour: string, d: DonneesRecup, p: ParamsRecup = RECUP): SommeilCalcule {
  const nuits = nuitsDette(jour, d, p.dette.fenetre + 1, p);
  const veille = decalerIso(jour, -1);
  return {
    dette: calculerDette(nuits, d.objectifSommeil, 0, p.dette),
    besoin: besoinNuit(
      nuits,
      d.objectifSommeil,
      { veille: Math.max(0, d.charges.get(veille) ?? 0), moyenne: moyenneCharges(jour, d, p) },
      Math.max(0, d.siestes?.get(veille) ?? 0),
      p.dette,
    ),
  };
}

// ---------------------------------------------------------------- le score

export interface PartEvaluee {
  part: number;
  /** Qualité de 0 à 1 (la norme, le téléphone). */
  q: number;
}

export interface Apport {
  poids: number;
  /** La part (0 à 100) ; le neutre (70) si absente. */
  valeur: number;
  absente: boolean;
  /** Apport entier : la somme des quatre fait le score (plus grands restes), sauf quand la garde a plafonné. */
  apport: number;
}

/** Le score de quatre parts déjà évaluées (une part null est absente) ; `poids` : ceux du score (sansVfc), la précision
 * se compte toujours sur les poids de référence. */
export function scoreParts(parts: Readonly<Record<ClePart, PartEvaluee | null>>, p: ParamsRecup = RECUP, poids: Readonly<Record<ClePart, number>> = p.poids) {
  let brut = 0;
  let precision = 0;
  const apports = {} as Record<ClePart, Apport>;
  const exacts: { k: ClePart; pts: number }[] = [];
  for (const k of CLES_PARTS) {
    const x = parts[k];
    const w = poids[k];
    const v = x ? x.part : p.neutre;
    apports[k] = { poids: w, valeur: v, absente: !x, apport: 0 };
    exacts.push({ k, pts: w * v });
    brut += w * v;
    if (x) precision += p.poids[k] * x.q;
  }
  let s = brut;
  let garde = false;
  const vfc = parts.vfc;
  if (vfc && vfc.part < p.garde.partVfc && s > p.garde.plafond) {
    s = p.garde.plafond;
    garde = true;
  }
  const entiers = exacts.map((x) => ({ k: x.k, b: Math.floor(x.pts), r: x.pts - Math.floor(x.pts) }));
  let reste = Math.round(brut) - entiers.reduce((a, x) => a + x.b, 0);
  for (const x of [...entiers].sort((a, b) => b.r - a.r)) if (reste-- > 0) x.b += 1;
  for (const x of entiers) apports[x.k].apport = x.b;
  return { valeur: Math.round(s), brut, garde, precision: Math.round(precision * 100), apports };
}

export type NiveauRecup = "pret" | "correct" | "fatigue";
export function niveauRecup(score: number, p: ParamsRecup = RECUP): NiveauRecup {
  return score >= p.seuils[1] ? "pret" : score >= p.seuils[0] ? "correct" : "fatigue";
}

/** Multiplicateur de la cible d'Effort : 1 à 65, amorti par la précision, borné de 0,6 à 1,2 ; 1 sous 40 % ou sans score. */
export function formeCible(score: number | null, precision: number, p: ParamsRecup = RECUP): number {
  if (score == null || precision < p.precision.prudente) return 1;
  const c = p.cible;
  return borne(1 + c.pente * (score - c.milieu) * (precision / 100), c.bornes[0], c.bornes[1]);
}

/** Le détail d'une matinée : ce qu'affichent la page, le MCP et le labo. */
export interface DetailRecup {
  vfc: { valeur: number | null; norme: Norme | null; z: number | null };
  fc: { valeur: number | null; norme: Norme | null; z: number | null };
  sommeil: {
    dormi: number | null;
    /** Le besoin de la nuit, calculé par pepfit (calcul.besoin.total). */
    besoin: number;
    regularite: number | null;
    /** À rattraper ce matin (minutes), null sous 40 % de précision. */
    dette: number | null;
    /** Minutes de sommeil des siestes de la veille comptées ce matin (0 sans sieste). */
    sieste: number;
    /** La dette des 7 nuits et le besoin de la nuit, en entier (page Sommeil, MCP, labo). */
    calcul: SommeilCalcule;
    source: SourceSommeil | null;
    sous: { duree: number; regularite: number | null; dette: number | null } | null;
  };
  charge: { veille: number; avantVeille: number; moyJour: number | null; r: number | null };
}

export interface ResultatRecup {
  jour: string;
  version: number;
  /** Le score (0 à 100), null sous 25 % de précision : rien de la nuit (D4). */
  score: number | null;
  /** Le score calculé même sans assez de données (le labo, « pas de score (66) »). */
  calcule: number;
  brut: number;
  garde: boolean;
  /** Précision pepfit de ce matin (0 à 100) : poids présents × leur qualité. */
  precision: number;
  /** Sous 40 % : phrase prudente, cible non ajustée. */
  prudent: boolean;
  niveau: NiveauRecup | null;
  apports: Record<ClePart, Apport>;
  detail: DetailRecup;
  /** Multiplicateur de la cible d'Effort du jour. */
  forme: number;
  /** Au moins une mesure de la nuit (VFC, FC ou sommeil). */
  nuit: boolean;
  /** Aucune VFC sur les 42 nuits ni cette nuit : calculée sur la FC au repos et le sommeil (poids `sansVfc`). */
  sansVfc: boolean;
  /**
   * Ajusté à la phase du cycle (planche cycle, § 3.4) : la moitié, les nuits de la norme de la VFC et de la FC (null : norme
   * habituelle pour cette part) et le score sans cet ajustement ; null : rien d'ajusté.
   */
  ajuste: { moitie: "premiere" | "seconde"; vfc: number | null; fc: number | null; sans: number | null } | null;
}

/**
 * La Récupération du matin de `jour` (« AAAA-MM-JJ ») : la nuit qui finit ce matin-là, la norme des 42 nuits d'AVANT (jamais
 * la nuit du jour), la charge de la veille et de l'avant-veille face aux 28 jours d'avant. L'unique fonction de score.
 * Avec le suivi du cycle (`d.phase`) : la VFC et la FC se comparent aux nuits de la même moitié des 3 derniers cycles, dès
 * 20 nuits pour chacune ; le score sans ajustement reste dans `ajuste.sans`.
 */
export function scoreRecup(jour: string, d: DonneesRecup, p: ParamsRecup = RECUP): ResultatRecup {
  const habituel = calculerRecup(jour, d, p, null, null);
  const ph = d.phase?.(jour) ?? null;
  if (!ph) return habituel;
  const vfc: number[] = [];
  const fc: number[] = [];
  for (const j of [...ph.jours].sort()) {
    if (j >= jour) continue;
    const n = d.nuits.get(j);
    if (dans(n?.rmssd, p.plausible.vfc)) vfc.push(n!.rmssd!);
    if (dans(n?.fcRepos, p.plausible.fc)) fc.push(n!.fcRepos!);
  }
  const nV = vfc.length >= ph.min ? norme(vfc, true, p.ecart.sdMinVfc, p, true) : null;
  const nF = fc.length >= ph.min ? norme(fc, false, p.ecart.sdMinFc, p, true) : null;
  if (!nV && !nF) return habituel;
  const r = calculerRecup(jour, d, p, nV, nF);
  return { ...r, ajuste: { moitie: ph.moitie, vfc: nV ? vfc.length : null, fc: nF ? fc.length : null, sans: habituel.score } };
}

/** Le score avec les normes données (celles de la phase), sinon celles des 42 nuits d'avant. */
function calculerRecup(jour: string, d: DonneesRecup, p: ParamsRecup, normeVfc: Norme | null, normeFc: Norme | null): ResultatRecup {
  const nuit = d.nuits.get(jour) ?? null;
  // ---- les normes : les 42 nuits d'avant, la plus ancienne d'abord
  const vfcAvant: number[] = [];
  const fcAvant: number[] = [];
  for (let i = p.norme.nuits; i >= 1; i--) {
    const n = d.nuits.get(decalerIso(jour, -i));
    if (dans(n?.rmssd, p.plausible.vfc)) vfcAvant.push(n!.rmssd!);
    if (dans(n?.fcRepos, p.plausible.fc)) fcAvant.push(n!.fcRepos!);
  }
  const nV = normeVfc ?? norme(vfcAvant, true, p.ecart.sdMinVfc, p);
  const nF = normeFc ?? norme(fcAvant, false, p.ecart.sdMinFc, p);
  const vfc = dans(nuit?.rmssd, p.plausible.vfc) ? nuit!.rmssd! : null;
  const fc = dans(nuit?.fcRepos, p.plausible.fc) ? nuit!.fcRepos! : null;
  const sansVfc = vfc == null && vfcAvant.length === 0;
  const eV = vfc != null && nV && nV.q > 0 ? partEcart(vfc, nV, 1, p) : null;
  const eF = fc != null && nF && nF.q > 0 ? partEcart(fc, nF, -1, p) : null;

  // ---- le sommeil : la nuit, sa régularité sur 7 nuits, la dette « à rattraper » et le besoin de pepfit (version 4)
  const dormi = dans(nuit?.sommeilMin, p.plausible.sommeil) ? nuit!.sommeilMin! : null;
  const telephone = nuit?.sourceSommeil === "telephone";
  let regularite: number | null = null;
  if (dormi != null && !telephone) {
    const milieux: number[] = [];
    for (let i = 0; i < p.sommeil.nuits; i++) {
      const n = d.nuits.get(decalerIso(jour, -i));
      if (dans(n?.sommeilMin, p.plausible.sommeil) && n!.milieuMin != null) milieux.push(n!.milieuMin);
    }
    regularite = milieux.length >= p.sommeil.nuitsRegularite ? ecartType(milieux) : null;
  }
  // La dette compte contre l'objectif, jamais contre le besoin, qui la contient déjà ; les siestes de la veille y sont
  // déjà, dans le sommeil des 24 h de la nuit. Les nuits du téléphone comptent ; sous 40 % de précision, pas de dette.
  const calcul = sommeilDuMatin(jour, d, p);
  const besoin = calcul.besoin.total;
  const dette = calcul.dette.chiffre ? calcul.dette.aRattraper : null;
  // les siestes de la veille : leur durée à 50 % jusqu'au besoin ; la nuit elle-même ne change pas
  const sieste = dormi != null ? Math.max(0, d.siestes?.get(decalerIso(jour, -1)) ?? 0) : 0;
  const dormiCompte = dormi != null && sieste > 0 ? Math.max(dormi, Math.min(besoin, dormi + p.sieste.poidsDuree * sieste)) : dormi;
  const eS = dormiCompte != null ? partSommeil({ dormi: dormiCompte, besoin, regularite, dette }, p) : null;

  // ---- la charge : la veille, l'avant-veille, la moyenne des 28 jours d'avant (repos compris)
  const ch = (n: number) => Math.max(0, d.charges.get(decalerIso(jour, -n)) ?? 0);
  let somme = 0;
  for (let i = 1; i <= p.charge.jours; i++) somme += ch(i);
  const moyJour = somme > 0 ? somme / p.charge.jours : null;
  const veille = ch(1);
  const avantVeille = ch(2);
  const eC = moyJour != null ? partCharge({ veille, avantVeille, moyJour }, p) : null;

  const s = scoreParts(
    {
      vfc: eV ? { part: eV.part, q: nV!.q } : null,
      fc: eF ? { part: eF.part, q: nF!.q } : null,
      sommeil: eS ? { part: eS.part, q: telephone ? p.sommeil.qualiteTelephone : 1 } : null,
      charge: eC ? { part: eC.part, q: 1 } : null,
    },
    p,
    sansVfc ? p.sansVfc : p.poids,
  );
  const score = s.precision >= p.precision.score ? s.valeur : null;
  return {
    jour,
    version: p.version,
    score,
    calcule: s.valeur,
    brut: s.brut,
    garde: s.garde,
    precision: s.precision,
    prudent: s.precision < p.precision.prudente,
    niveau: score == null ? null : niveauRecup(score, p),
    apports: s.apports,
    detail: {
      vfc: { valeur: vfc, norme: nV, z: eV?.z ?? null },
      fc: { valeur: fc, norme: nF, z: eF?.z ?? null },
      sommeil: { dormi, besoin, regularite, dette, sieste, calcul, source: dormi != null ? (telephone ? "telephone" : "montre") : null, sous: eS ? { duree: eS.duree, regularite: eS.regularite, dette: eS.dette } : null },
      charge: { veille, avantVeille, moyJour, r: eC?.r ?? null },
    },
    forme: formeCible(score, s.precision, p),
    nuit: vfc != null || fc != null || dormi != null,
    sansVfc,
    ajuste: null,
  };
}

/** Les scores de plusieurs matins (l'historique : toujours recalculé, jamais stocké). */
export function scoresRecup(jours: readonly string[], d: DonneesRecup, p: ParamsRecup = RECUP): Map<string, ResultatRecup> {
  return new Map(jours.map((j) => [j, scoreRecup(j, d, p)]));
}

/** « relevée de 15 % » : l'écart de la cible dû à la Récupération, en % entier signé (0 : non ajustée). */
export const ajustementCible = (forme: number): number => Math.round((forme - 1) * 100);
