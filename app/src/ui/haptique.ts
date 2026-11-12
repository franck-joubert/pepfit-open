import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// Retours tactiles : sur Android, les effets du système (View.performHapticFeedback) suivent le réglage
// « Retour tactile » du téléphone et sont plus nets qu'une vibration. Certains n'existent qu'à partir d'Android 14 :
// le module rejette alors la promesse et l'on retombe sur l'effet générique. Un échec ne doit jamais remonter.
const taire = () => {};
const effet = (android: Haptics.AndroidHaptics, repli: () => Promise<void>) => () => {
  (Platform.OS === "android" ? Haptics.performAndroidHapticsAsync(android).catch(repli) : repli()).catch(taire);
};

export const haptique = {
  /** Cran d'une roue, place franchie pendant un glisser. */
  cran: effet(Haptics.AndroidHaptics.Segment_Tick, () => Haptics.selectionAsync()),
  /** Carte soulevée ; seuil de suppression franchi. */
  prise: effet(Haptics.AndroidHaptics.Drag_Start, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Carte posée. */
  depot: effet(Haptics.AndroidHaptics.Gesture_End, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Fin du repos, records : un seul moment fort. */
  succes: effet(Haptics.AndroidHaptics.Confirm, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Touche refusée par le clavier de séance (la case est pleine) : un petit coup sec. */
  refus: effet(Haptics.AndroidHaptics.Reject, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /** Valeur inhabituelle à la coche. */
  alerte: effet(Haptics.AndroidHaptics.Reject, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
