import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform, type Permission } from "react-native";
import type { AppareilFc, Batterie, Capteurs, EchantillonFc, EtatSuivi, LigneJournal, OptionsSuivi, Point, Suivi, TourNatif } from "./types";

export type * from "./types";

// Module local modules/pepfit-suivi (Kotlin) : service de premier plan, GPS, baromètre, FC BLE, tampon sur disque.
// Absent d'un APK plus ancien : `disponible` est faux.
interface Natif {
  addListener(evenement: "etat", f: (e: EtatSuivi) => void): { remove(): void };
  capteurs(): Capteurs;
  demarrer(o: Required<Omit<OptionsSuivi, "appareil" | "debut">> & { appareil: string | null; debut: number | null }): EtatSuivi;
  pause(): EtatSuivi;
  reprendre(): EtatSuivi;
  tour(): TourNatif | null;
  terminer(): EtatSuivi;
  etat(): EtatSuivi | null;
  points(id: string, depuis: number): Promise<(number | null)[][]>;
  frequences(id: string, depuis: number): Promise<(number | null)[][]>;
  tampons(): Promise<string[]>;
  effacer(id: string): Promise<void>;
  /** Absente d'un APK plus ancien que l'effacement des données. */
  oublier?(): Promise<void>;
  chercherFc(dureeMs: number): Promise<AppareilFc[]>;
  batterie(): Batterie;
  /** « fiche » ou « liste » ; rien sur un APK plus ancien (la liste s'ouvrait). */
  ouvrirReglagesBatterie(): string | void;
  /** Absentes d'un APK plus ancien que le journal des coupures (30/10). */
  journal?(): Promise<[number, string, string][]>;
  /** Absente d'un APK plus ancien que le lot 6. */
  ouvrirAppli?(paquet: string): boolean;
}
const natif = requireOptionalNativeModule<Natif>("PepfitSuivi");

const P = PermissionsAndroid.PERMISSIONS;
const v = Number(Platform.Version);

/** Demandées au moment où elles servent : position à l'ouverture du départ, Bluetooth à la première recherche du capteur.
 *  Les notifications sont demandées à part, à Démarrer, après leur explication (natif/notifications). Pas de position en
 *  arrière-plan : le service démarre appli visible (NOTES, autorisations). */
async function autoriser(o: { position: boolean; bluetooth: boolean }): Promise<boolean> {
  const liste: Permission[] = [];
  if (o.position) liste.push(P.ACCESS_FINE_LOCATION, P.ACCESS_COARSE_LOCATION);
  if (o.bluetooth && v >= 31) liste.push(P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT);
  if (liste.length === 0) return true;
  const r = await PermissionsAndroid.requestMultiple(liste);
  return liste.every((p) => r[p] === PermissionsAndroid.RESULTS.GRANTED);
}

async function appareils(): Promise<boolean> {
  if (v < 31) return true;
  return (await PermissionsAndroid.check(P.BLUETOOTH_SCAN)) && (await PermissionsAndroid.check(P.BLUETOOTH_CONNECT));
}

async function demanderAppareils(): Promise<"accorde" | "refuse" | "bloque"> {
  if (v < 31) return "accorde";
  const r = await PermissionsAndroid.requestMultiple([P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT]);
  const l = [r[P.BLUETOOTH_SCAN], r[P.BLUETOOTH_CONNECT]];
  if (l.every((x) => x === PermissionsAndroid.RESULTS.GRANTED)) return "accorde";
  return l.some((x) => x === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) ? "bloque" : "refuse";
}

const nombre = (x: number | null | undefined) => x ?? 0;

export const suivi: Suivi = {
  disponible: natif != null,
  capteurs: async () => natif?.capteurs() ?? null,
  autoriser,
  appareils,
  demanderAppareils,
  demarrer: async (o) => {
    if (!natif) throw new Error("module pepfit-suivi absent");
    return natif.demarrer({ mode: o.mode, fc: o.fc ?? true, appareil: o.appareil ?? null, titre: o.titre ?? "Suivi", debut: o.debut ?? null, pauseCumulMs: o.pauseCumulMs ?? 0 });
  },
  pause: async () => natif!.pause(),
  reprendre: async () => natif!.reprendre(),
  tour: async () => natif?.tour() ?? null,
  terminer: async () => natif!.terminer(),
  etat: async () => natif?.etat() ?? null,
  ecouter: (f) => {
    const abonnement = natif?.addListener("etat", f);
    return () => abonnement?.remove();
  },
  points: async (id, depuis = 0) =>
    ((await natif?.points(id, depuis)) ?? []).map(
      (l): Point => ({ t: nombre(l[0]), s: nombre(l[1]), lat: nombre(l[2]), lon: nombre(l[3]), altBaro: l[4] ?? null, altGps: l[5] ?? null, precision: nombre(l[6]), vitesse: l[7] ?? null }),
    ),
  frequences: async (id, depuis = 0) =>
    ((await natif?.frequences(id, depuis)) ?? []).map((l): EchantillonFc => ({ t: nombre(l[0]), s: nombre(l[1]), bpm: nombre(l[2]) })),
  tampons: async () => (await natif?.tampons()) ?? [],
  effacer: async (id) => natif?.effacer(id),
  // APK plus ancien : le service s'arrête, les tampons partent avec les fichiers de l'appli (effacer/).
  oublier: async () => {
    if (natif?.oublier) await natif.oublier();
    else natif?.terminer();
  },
  chercherFc: async (ms) => (await natif?.chercherFc(ms)) ?? [],
  batterie: async () => natif?.batterie() ?? null,
  ouvrirReglagesBatterie: async () => {
    if (!natif) return null;
    return natif.ouvrirReglagesBatterie() === "fiche" ? "fiche" : "liste";
  },
  journal: async () => ((await natif?.journal?.()) ?? []).map(([t, evenement, detail]): LigneJournal => ({ t, evenement, detail })),
  ouvrirAppli: async (paquet) => natif?.ouvrirAppli?.(paquet) ?? false,
}
