// Chronos de la transition de la séance, lus dans logcat (`adb logcat -s ReactNativeJS | grep transition`) : temps entre
// l'appui sur la bulle et le premier mouvement, durée de la fermeture, montage du reste de la liste.

let appui = 0;

/** L'appui qui va ouvrir la séance (la bulle). */
export function noterAppui() {
  appui = Date.now();
}

/** Premier mouvement de l'écran : rien si la séance s'est rouverte seule (lancement). */
export function noterPremierMouvement(t: number) {
  if (appui) console.log(`[transition] session first-move ${t - appui} ms`);
  appui = 0;
}

export function noterEtape(etape: string, depuis: number) {
  console.log(`[transition] session ${etape} ${Date.now() - depuis} ms`);
}
