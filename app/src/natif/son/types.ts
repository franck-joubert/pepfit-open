export interface SonTelephone {
  uri: string;
  nom: string;
}

export interface Sons {
  /** Le sélecteur de sons du téléphone est disponible (module natif présent). */
  disponible: boolean;
  /** Ouvre le sélecteur du système ; null si annulé. */
  choisir(actuel: string | null): Promise<SonTelephone | null>;
  /** Crée le canal de notification `id` et supprime les autres canaux commençant par `prefixe`. */
  canal(o: { id: string; nom: string; prefixe: string; uri: string | null; son: boolean; vibration: number[] }): Promise<boolean>;
}
