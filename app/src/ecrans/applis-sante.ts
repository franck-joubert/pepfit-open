// Applis qui écrivent dans Santé Connect (carte « Capteurs » de la page Effort, 07/11) : « Santé Connect » n'est pas une
// montre, la ligne dit d'où viennent vraiment les données (« Whoop, Withings »). Une seule lecture légère (sante.originesDonnees),
// gardée 10 min : rouvrir la page ne relit rien. Sans React Native (testé dans tests/applis-sante.test.ts).
import type { Sante } from "../natif/sante";
import { PAQUETS_PROPRES } from "../natif/sante/logique";

const JOUR_MS = 86_400_000;
/** Les 7 derniers jours : assez pour une appli qui n'écrit qu'après une synchro, assez court pour ne pas garder une appli quittée. */
export const FENETRE_APPLIS_MS = 7 * JOUR_MS;
export const VIE_APPLIS_MS = 10 * 60_000;

/** Noms lisibles des applis courantes (paquet Android → nom) ; les autres : la marque tirée du paquet (nomDePaquet). */
const NOMS: Record<string, string> = {
  "com.whoop.android": "Whoop",
  "com.withings.wiscale2": "Withings",
  "com.sec.android.app.shealth": "Samsung Health",
  "com.google.android.apps.fitness": "Fit",
  "com.google.android.apps.wear.companion": "Pixel Watch",
  "com.google.android.gms": "Google",
  "com.fitbit.FitbitMobile": "Fitbit",
  "com.garmin.android.apps.connectmobile": "Garmin",
  "com.ouraring.oura": "Oura",
  "com.strava": "Strava",
  "com.polar.polarflow": "Polar Flow",
  "com.huawei.health": "Huawei Health",
  "com.xiaomi.wearable": "Mi Fitness",
  "com.huami.watch.hmwatchmanager": "Zepp",
  "com.coros.coros": "Coros",
  "com.suunto.connectivity": "Suunto",
};

/** « com.polar.flow » → « Polar » : la marque (deuxième segment) du paquet d'une appli inconnue. */
function nomDePaquet(paquet: string): string {
  const m = paquet.split(".").filter(Boolean);
  const marque = (m.length > 1 ? m[1] : m[0]) ?? paquet;
  return marque.charAt(0).toUpperCase() + marque.slice(1);
}

/** Noms lisibles, sans doublon, hors pepfit et l'ancienne Fonte (leurs séances sont écrites par l'appli : ce n'est pas un capteur) ;
 * Whoop en tête (le capteur de la carte), puis l'ordre de lecture. */
export function nomsApplis(paquets: readonly string[]): string[] {
  const noms: string[] = [];
  for (const p of paquets) {
    if (!p || PAQUETS_PROPRES.includes(p)) continue;
    const nom = NOMS[p] ?? nomDePaquet(p);
    if (!noms.includes(nom)) noms.push(nom);
  }
  return noms.sort((a, b) => Number(b === "Whoop") - Number(a === "Whoop"));
}

let gardee: { t: number; p: Promise<string[]> } | null = null;

/** Les noms des applis qui écrivent dans Santé Connect ; une lecture par `VIE_APPLIS_MS`, deux appels en même temps partagent
 * la même promesse ; un échec n'est pas gardé (liste vide). `oublierApplisSante` : relue à la prochaine fois. */
export function lireApplisSante(sante: Pick<Sante, "originesDonnees">, maintenant = Date.now()): Promise<string[]> {
  if (gardee && maintenant - gardee.t < VIE_APPLIS_MS && maintenant >= gardee.t) return gardee.p;
  const x = {
    t: maintenant,
    p: (sante.originesDonnees ? sante.originesDonnees(maintenant - FENETRE_APPLIS_MS, maintenant) : Promise.resolve(null)).then((l) => nomsApplis(l ?? [])),
  };
  gardee = x;
  x.p.catch(() => {
    if (gardee === x) gardee = null;
  });
  return x.p.catch(() => []);
}

export const oublierApplisSante = () => void (gardee = null);
