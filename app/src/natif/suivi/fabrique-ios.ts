// Couche JS du suivi sur iPhone (module Swift modules/pepfit-suivi/ios, docs/CODE-IOS-SUIVI.md) : même API que
// index.android.ts, sans React Native ni Expo pour être testée avec un faux module (tests/suivi-ios.test.ts).
import type { AppareilFc, Capteurs, EchantillonFc, EtatSuivi, LigneJournal, OptionsSuivi, Point, Suivi, TourNatif } from "./types";

type ReponseAppareils = "accorde" | "refuse" | "bloque";

/** Fonctions du module Swift : celles du Kotlin, sans batterie, ouvrirReglagesBatterie ni ouvrirAppli (propres à
 *  Android), plus les autorisations d'iOS. */
export interface NatifIos {
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
  oublier(): Promise<void>;
  chercherFc(dureeMs: number): Promise<AppareilFc[]>;
  journal(): Promise<[number, string, string][]>;
  /** Position « pendant l'utilisation » (suffit au suivi en arrière-plan) ; vrai si accordée. */
  demanderPosition(): Promise<boolean>;
  /** « refuse » : jamais demandée ; « bloque » : refusée, à changer dans Réglages (iOS ne repose pas la question). */
  etatBluetooth(): ReponseAppareils;
  demanderBluetooth(): Promise<ReponseAppareils>;
}

const absent = () => Promise.reject(new Error("suivi indisponible"));
const nombre = (x: number | null | undefined) => x ?? 0;

/** `natif` null (module absent d'un build plus ancien) : même repli qu'index.ts. */
export function fabriquerSuiviIos(natif: NatifIos | null): Suivi {
  if (!natif) {
    return {
      disponible: false,
      capteurs: async () => null,
      autoriser: async () => false,
      appareils: async () => false,
      demanderAppareils: async () => "refuse",
      demarrer: absent,
      pause: absent,
      reprendre: absent,
      tour: async () => null,
      terminer: absent,
      etat: async () => null,
      ecouter: () => () => {},
      points: async () => [],
      frequences: async () => [],
      tampons: async () => [],
      effacer: async () => {},
      oublier: async () => {},
      chercherFc: async () => [],
      batterie: async () => null,
      ouvrirReglagesBatterie: async () => null,
      journal: async () => [],
      ouvrirAppli: async () => false,
    };
  }
  return {
    disponible: true,
    capteurs: async () => natif.capteurs(),
    // Même moment que PermissionsAndroid : position à l'ouverture du départ, Bluetooth à la première recherche du capteur.
    autoriser: async (o) => {
      let ok = true;
      if (o.position) ok = (await natif.demanderPosition()) && ok;
      if (o.bluetooth) ok = (await natif.demanderBluetooth()) === "accorde" && ok;
      return ok;
    },
    appareils: async () => natif.etatBluetooth() === "accorde",
    demanderAppareils: async () => natif.demanderBluetooth(),
    demarrer: async (o) =>
      natif.demarrer({ mode: o.mode, fc: o.fc ?? true, appareil: o.appareil ?? null, titre: o.titre ?? "Suivi", debut: o.debut ?? null, pauseCumulMs: o.pauseCumulMs ?? 0 }),
    pause: async () => natif.pause(),
    reprendre: async () => natif.reprendre(),
    tour: async () => natif.tour() ?? null,
    terminer: async () => natif.terminer(),
    etat: async () => natif.etat() ?? null,
    ecouter: (f) => {
      const abonnement = natif.addListener("etat", f);
      return () => abonnement.remove();
    },
    points: async (id, depuis = 0) =>
      (await natif.points(id, depuis)).map(
        (l): Point => ({ t: nombre(l[0]), s: nombre(l[1]), lat: nombre(l[2]), lon: nombre(l[3]), altBaro: l[4] ?? null, altGps: l[5] ?? null, precision: nombre(l[6]), vitesse: l[7] ?? null }),
      ),
    frequences: async (id, depuis = 0) => (await natif.frequences(id, depuis)).map((l): EchantillonFc => ({ t: nombre(l[0]), s: nombre(l[1]), bpm: nombre(l[2]) })),
    tampons: async () => natif.tampons(),
    effacer: async (id) => natif.effacer(id),
    oublier: async () => natif.oublier(),
    chercherFc: async (ms) => natif.chercherFc(ms),
    // Pas d'optimisation de batterie à régler sur iPhone : null, comme sans le module (les écrans masquent la ligne).
    batterie: async () => null,
    ouvrirReglagesBatterie: async () => null,
    journal: async () => (await natif.journal()).map(([t, evenement, detail]): LigneJournal => ({ t, evenement, detail })),
    // Un paquet Android ne s'ouvre pas sur iPhone : faux, l'appelant passe à son repli.
    ouvrirAppli: async () => false,
  };
}
