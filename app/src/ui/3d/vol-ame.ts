// Vol de l'âme (planches/age-coeur, validé le 29/10) : l'Âge pepfit quitte la poitrine du personnage de Santé et devient la
// grande signature de la page Âge (élément partagé). État commun aux deux écrans, sans rien de React Native :
// - la page Santé pose le départ (rectangle de l'âme à l'écran, ses horloges) puis ouvre la page Âge ;
// - la page Âge le lit, fait voler sa signature depuis ce rectangle, cache l'âme du corps quand la sienne est à l'écran,
//   et au retour la ramène dans la poitrine avant de rendre l'âme au corps ;
// - le personnage (CorpsSante) lit `ameCachee` à chaque image et continue de se dessiner pendant le vol (`volActif`), même
//   recouvert : sans ça, sa dernière image garderait l'âme sous la signature qui s'en va.

/** Horloges de l'âme : temps de la forme (intégré au rythme), temps réel (souffle), phase du battement. */
export interface HorlogesAme {
  forme: number;
  reel: number;
  phase: number;
}

export interface DepartVol {
  /** Centre de l'âme dans la fenêtre (dp) et côté de son carré (dp). */
  x: number;
  y: number;
  cote: number;
  horloges: HorlogesAme | null;
  /** Instant du toucher (ms). */
  t0: number;
  /** Ralenti de mise au point (`pepfitopen://health?lent=6`) : les durées du vol multipliées ; 1 sinon. */
  lent?: number;
}

let depart: DepartVol | null = null;
let cachee = false;
let actif = false;
let horlogesSource: (() => HorlogesAme) | null = null;
const ecouteurs = new Set<() => void>();
const prevenir = () => ecouteurs.forEach((f) => f());

/** Un départ plus vieux que ça n'est plus celui de la page qui s'ouvre (ouverte par un autre chemin). Large : sur un appareil
 * chargé, la page Âge met parfois plus d'une seconde à se monter (1,7 s vu à l'émulateur) et le vol doit encore partir. */
export const DEPART_VALIDE_MS = 5000;

/** La page Santé pose le départ juste avant d'ouvrir la page Âge. */
export function lancerVol(d: Omit<DepartVol, "horloges" | "t0">, maintenant = Date.now()): void {
  depart = { ...d, horloges: horlogesSource?.() ?? null, t0: maintenant };
  actif = true;
  prevenir();
}

/** La page Âge lit le départ à l'ouverture (null : ouverte par un autre chemin, ou trop tard). Le départ reste connu pour le
 * retour. */
export function departVol(maintenant = Date.now()): DepartVol | null {
  return depart && maintenant - depart.t0 <= DEPART_VALIDE_MS ? depart : null;
}

/** Le rectangle d'arrivée du retour : celui du départ (la page Santé n'a pas bougé dessous). */
export function retourVol(): DepartVol | null {
  return depart;
}

/** L'âme du corps est cachée tant que la signature tient sa place (du premier vol jusqu'à l'atterrissage du retour). */
export function cacherAme(c: boolean): void {
  if (cachee === c) return;
  cachee = c;
  prevenir();
}
export function ameCachee(): boolean {
  return cachee;
}

/** Le personnage se dessine pendant le vol, même recouvert par la page Âge. */
export function activerVol(a: boolean): void {
  if (actif === a) return;
  actif = a;
  prevenir();
}
export function volActif(): boolean {
  return actif;
}

/** Fin d'un aller-retour (ou d'une page Âge fermée sans vol) : plus de départ, âme rendue au corps. */
export function finirVol(): void {
  depart = null;
  cachee = false;
  actif = false;
  prevenir();
}

/** Le personnage branche la lecture de ses horloges (null : plus de personnage). */
export function brancherHorlogesAme(f: (() => HorlogesAme) | null): void {
  horlogesSource = f;
}

/** Abonnement (le personnage se réveille quand le vol commence ou que l'âme change d'état) ; rend de quoi se désabonner. */
export function ecouterVol(f: () => void): () => void {
  ecouteurs.add(f);
  return () => void ecouteurs.delete(f);
}
