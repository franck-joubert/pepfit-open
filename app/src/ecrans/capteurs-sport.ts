// Capteurs du Sport en ronds (planche sport-programmes-routines v2, retour 10 et D11, validés le 29/10) : un rond par capteur
// relié et utile au Sport, sans React Native (testé dans tests/capteurs-sport.test.ts). L'anneau dit l'état : vert, relié ;
// ambre, relié mais muet (« À reconnecter ») ; en direct, la FC s'écrit dans le rond. Un capteur jamais relié n'a pas de rond ;
// aucun rond : pas de carte. La FC en direct est celle que lit le service de suivi (séance avec FC) : hors séance, aucune
// connexion Bluetooth n'est ouverte pour la montrer. Santé Connect porte son nom et les applis qui y écrivent (« Whoop,
// Withings ») ; le capteur cardiaque Bluetooth (07/11) est repéré par une écoute courte, sans connexion (useCapteurBle).

/** Synchro Whoop de plus de 24 h : relié mais muet. */
export const MUET_MS = 24 * 3600_000;

/** « diffuse » : un capteur annonce la FC en Bluetooth ; « cherche » : écoute en cours ; « aucun » : rien trouvé. */
export type EtatRond = "relie" | "direct" | "revoir" | "diffuse" | "cherche" | "aucun";

export interface Rond {
  id: "whoop" | "sante" | "fc" | "ble";
  /** Nom affiché : « Whoop », le nom Bluetooth du capteur (« Polar H10 ») ; null : celui de la ligne (« Santé Connect », « Capteur cardiaque »). */
  nom: string | null;
  etat: EtatRond;
  bpm: number | null;
  /** Dernière synchro (ms), pour « Synchro 17:02 ». */
  synchro: number | null;
  /** Santé Connect : les applis qui y écrivent (« Whoop », « Withings »), vide : « Aucune donnée ». */
  applis: string[];
}

export interface EntreeCapteurs {
  whoop: { connecte: boolean; derniereSynchro: number | null };
  sante: { disponible: boolean; autorise: boolean; applis?: readonly string[] };
  /** Écoute du capteur cardiaque Bluetooth : null, la ligne n'a pas lieu d'être (FC en direct éteinte, « Appareils à proximité » refusés, séance en cours). */
  ble?: { etat: "cherche" } | { etat: "aucun" } | { etat: "trouve"; nom: string } | null;
  /** FC lue par le service de suivi ; null sans séance en cours. */
  fc: { etat: string; bpm: number | null; appareil: string | null } | null;
  maintenant: number;
}

/** La Whoop diffuse sa FC en Bluetooth sous son nom (« WHOOP 4A1B2C ») : elle va dans le rond Whoop. */
export const estWhoop = (appareil: string | null) => !!appareil && /whoop/i.test(appareil);

export function rondsCapteurs(e: EntreeCapteurs): Rond[] {
  const direct = e.fc && e.fc.etat === "connecte" && e.fc.bpm != null ? e.fc : null;
  const whoopDirect = direct && estWhoop(direct.appareil) ? direct.bpm : null;
  const out: Rond[] = [];
  const w = e.whoop;
  if (w.connecte) {
    const muet = w.derniereSynchro != null && e.maintenant - w.derniereSynchro > MUET_MS;
    out.push({ id: "whoop", nom: "Whoop", etat: whoopDirect != null ? "direct" : muet ? "revoir" : "relie", bpm: whoopDirect, synchro: w.derniereSynchro, applis: [] });
  } else if (w.derniereSynchro != null) {
    // Déjà synchronisée, plus reliée (jeton expiré ou refusé) : à reconnecter.
    out.push({ id: "whoop", nom: "Whoop", etat: "revoir", bpm: null, synchro: w.derniereSynchro, applis: [] });
  }
  if (e.sante.disponible && e.sante.autorise) out.push({ id: "sante", nom: null, etat: "relie", bpm: null, synchro: null, applis: [...(e.sante.applis ?? [])] });
  if (direct && whoopDirect == null) out.push({ id: "fc", nom: direct.appareil, etat: "direct", bpm: direct.bpm, synchro: null, applis: [] });
  // Pas d'écoute pendant la FC en direct d'une séance : le capteur y est déjà connecté
  else if (e.ble && !direct) {
    const b = e.ble;
    out.push({ id: "ble", nom: b.etat === "trouve" ? b.nom : null, etat: b.etat === "trouve" ? "diffuse" : b.etat, bpm: null, synchro: null, applis: [] });
  }
  return out;
}

/** Où en est l'écoute du capteur cardiaque Bluetooth : pas encore (cette ouverture), en cours, finie, ou séance en cours (aucune écoute). */
export type PhaseEcoute = "avant" | "cours" | "fini" | "seance";

/** Ce que dit la ligne : l'écoute en cours (ou un essai du tuto), le capteur trouvé, ou rien trouvé ; avant l'écoute de cette
 *  ouverture, ce que la dernière disait (la carte remontée), sinon « Recherche… » ; pendant une séance, rien. */
export function etatBle(phase: PhaseEcoute, fc: string, trouve: string | null, memoire: string | null | undefined): EntreeCapteurs["ble"] {
  if (phase === "seance") return null;
  if (phase === "cours" || fc === "recherche") return { etat: "cherche" as const };
  if (trouve) return { etat: "trouve" as const, nom: trouve };
  if (phase === "fini") return { etat: "aucun" as const };
  if (memoire === undefined) return { etat: "cherche" as const };
  return memoire ? { etat: "trouve" as const, nom: memoire } : { etat: "aucun" as const };
}
