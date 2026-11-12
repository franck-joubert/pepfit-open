import { Linking } from "react-native";
import * as Location from "../natif/position";
import { suivi } from "../natif/suivi";
import { expliquer } from "../natif/notifications";
import { PAQUET_WHOOP, SITE_WHOOP } from "./tuto-fc";

// Autorisations du départ : la position (suivi GPS) et « Appareils à proximité » (Bluetooth de la FC), expliquées par une feuille de
// l'appli avant la demande d'Android. Partagées par l'écran de départ (course, muscu) et la bande de la séance de muscu.

/**
 * Autorisations du suivi. La position, tant qu'Android peut la demander, est d'abord expliquée par la feuille des
 * notifications (n° 13 de l'audit : même geste que « Fin du repos ») ; « Plus tard » : rien n'est demandé, la ligne GPS
 * propose de réessayer.
 */
export async function autoriserSuivi(bluetooth: boolean): Promise<boolean> {
  const p = await Location.getForegroundPermissionsAsync().catch(() => null);
  const position = !p || p.granted || !p.canAskAgain || (await expliquer("position"));
  const ok = await suivi.autoriser({ position, bluetooth: false });
  return bluetooth ? ok && (await autoriserAppareils(false)) === "accorde" : ok;
}

/** « Plus tard » ou refus : on ne réexplique pas à chaque départ (jusqu'au prochain lancement de l'appli), « Autoriser » reste. */
let appareilsPlusTard = false;

/**
 * « Appareils à proximité » (Bluetooth de la FC) : la feuille d'explication de l'appli, puis la demande d'Android ;
 * `manuel` (« Autoriser » touché) : la demande tout de suite. Aussi à l'ouverture d'une séance de muscu avec la FC en direct.
 */
export async function autoriserAppareils(manuel: boolean): Promise<"accorde" | "refuse" | "bloque"> {
  if (await suivi.appareils()) return "accorde";
  if (!manuel && (appareilsPlusTard || !(await expliquer("appareils")))) {
    appareilsPlusTard = true;
    return "refuse";
  }
  const r = await suivi.demanderAppareils();
  if (r !== "accorde") appareilsPlusTard = true;
  return r;
}

/** « Ouvrir Whoop » (aussi depuis la bande de la séance de muscu) : l'appli si elle est installée, sinon le site de Whoop. */
export async function ouvrirWhoop() {
  if (await suivi.ouvrirAppli(PAQUET_WHOOP).catch(() => false)) return;
  await Linking.openURL(SITE_WHOOP).catch(console.error);
}
