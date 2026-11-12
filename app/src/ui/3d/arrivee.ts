// Arrivée sur Santé (30/10 : « l'arrivée sur la page santé peut lagger parfois au premier chargement ») : repères
// horodatés, du toucher de l'onglet à la première image du corps, et sonde du fil JS (plus long blocage) le temps de
// l'arrivée. Une ligne « [arrivee] … » dans logcat par arrivée ; la sonde s'arrête avec elle (aucun minuteur au repos).
// Sans rien de React Native.

const PAS_SONDE_MS = 16;
/** Fin de la mesure : une seconde après la première image (le fondu et les entrées s'y jouent), 6 s au plus. */
const APRES_IMAGE_MS = 1000;
const PLAFOND_MS = 6000;

let debut = 0;
let numero = 0;
let reperes: Record<string, number> = {};
let durees: Record<string, number> = {};
let sonde: ReturnType<typeof setInterval> | undefined;
let fin: ReturnType<typeof setTimeout> | undefined;
let dernier = 0;
let pire = 0;
let longs = 0;
let cumulLongs = 0;

/** Ce qu'une arrivée a mesuré (ms depuis le toucher ; durées ; plus long blocage du fil JS et blocages de plus de 50 ms). */
export interface MesureArrivee {
  numero: number;
  reperes: Record<string, number>;
  durees: Record<string, number>;
  jsMax: number;
  longs: number;
  cumulLongs: number;
}

/** Texte de la ligne de logcat. */
export function ligneArrivee(m: MesureArrivee): string {
  const r = Object.entries(m.reperes).map(([k, v]) => `${k}=${Math.round(v)}`).join(" ");
  const d = Object.entries(m.durees).map(([k, v]) => `${k}=${Math.round(v)}`).join(" ");
  return `[arrivee] n=${m.numero} ${r} | ${d} | js_max=${Math.round(m.jsMax)} js_longs=${m.longs}/${Math.round(m.cumulLongs)}ms`;
}

/** L'onglet Santé est touché (ou l'écran se monte sans toucher : lien direct). Une arrivée déjà en cours continue. */
export function arriveeDebut() {
  if (debut) return;
  debut = performance.now();
  numero += 1;
  reperes = {};
  durees = {};
  pire = 0;
  longs = 0;
  cumulLongs = 0;
  dernier = debut;
  sonde = setInterval(() => {
    const t = performance.now();
    const retard = t - dernier - PAS_SONDE_MS;
    if (retard > pire) pire = retard;
    if (retard > 50) {
      longs += 1;
      cumulLongs += retard;
    }
    dernier = t;
  }, PAS_SONDE_MS);
  fin = setTimeout(arriveeFin, PLAFOND_MS);
}

/** Repère horodaté (le premier de ce nom compte). */
export function arriveeRepere(nom: string) {
  if (debut && reperes[nom] == null) reperes[nom] = performance.now() - debut;
}

/** Durée d'une étape (ms). */
export function arriveeDuree(nom: string, ms: number) {
  if (debut && durees[nom] == null) durees[nom] = ms;
}

/** Première image du corps : la mesure se termine une seconde plus tard. */
export function arriveeImage() {
  if (!debut) return;
  arriveeRepere("image1");
  clearTimeout(fin);
  fin = setTimeout(arriveeFin, APRES_IMAGE_MS);
}

function arriveeFin() {
  if (!debut) return;
  clearInterval(sonde);
  clearTimeout(fin);
  console.log(ligneArrivee({ numero, reperes, durees, jsMax: pire, longs, cumulLongs }));
  debut = 0;
}
