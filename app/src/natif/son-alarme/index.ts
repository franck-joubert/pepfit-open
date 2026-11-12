// Android et web : rien à faire ici (Android : l'alarme native joue son son sur le flux ALARME, natif/alarme-recup).

/** iPhone : joue le son d'alarme `nom` (app/assets/sons), appli ouverte ; faux si rien n'est joué. */
export async function jouerSonAlarme(_nom: string): Promise<boolean> {
  return false;
}

/** iPhone : coupe le son d'alarme joué par l'appli. */
export async function arreterSonAlarme(): Promise<void> {}
