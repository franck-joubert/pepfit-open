import { requireOptionalNativeModule } from "expo";
import { SON_SILENCE, SONS_IOS } from "../notifs-ios";

// iPhone, appli ouverte : le son d'une alarme (fin du repos, fin de sieste) joué par le module PepfitAlarme (Swift,
// AVAudioSession « playback ») : le mode silencieux ne le coupe pas, contrairement au son d'une notification. Appli fermée,
// c'est le son de la notification, que le mode silencieux coupe (docs/CODE-IOS-RAPPELS.md, limites).
interface Natif {
  jouer(nom: string, boucle: boolean): Promise<boolean>;
  arreterSon(): Promise<void>;
}
const natif = requireOptionalNativeModule<Natif>("PepfitAlarme");

export async function jouerSonAlarme(nom: string): Promise<boolean> {
  if (!natif || nom === SON_SILENCE || !(SONS_IOS as readonly string[]).includes(nom)) return false;
  return natif.jouer(nom, false).catch(() => false);
}

export async function arreterSonAlarme(): Promise<void> {
  await natif?.arreterSon().catch(() => {});
}
