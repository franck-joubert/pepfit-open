import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage, PREFIXE_CACHE } from "../db/depots/reglages";
import type { LienAgenda } from "./calcul";
import { lireTitre, titreDepuisAncien, type TitreCompose } from "./titre";

// Agenda du téléphone : liens séance ↔ événement (migration 63, table locale) et réglages de la connexion. Les réglages
// portent le préfixe des caches : propres à ce téléphone (identifiants d'agenda d'Android), ni synchronisés, ni sauvegardés ;
// une restauration déconnecte l'agenda (on le reconnecte, les liens repartent de zéro).

const CLE = {
  connecte: `${PREFIXE_CACHE}agenda_connecte`,
  lus: `${PREFIXE_CACHE}agenda_lus`,
  ecrit: `${PREFIXE_CACHE}agenda_ecrit`,
  maj: `${PREFIXE_CACHE}agenda_maj`,
  garder: `${PREFIXE_CACHE}agenda_garder`,
  local: `${PREFIXE_CACHE}agenda_local`,
  // Première version du titre (interrupteur et modèle) : lue seulement pour la migration vers `titre`.
  emoji: `${PREFIXE_CACHE}agenda_emoji`,
  format: `${PREFIXE_CACHE}agenda_format`,
  titre: `${PREFIXE_CACHE}agenda_titre`,
} as const;

export interface ReglagesAgenda {
  connecte: boolean;
  /** Agendas qui comptent quand tu es pris. */
  lus: string[];
  /** Agenda où s'écrivent les séances. */
  ecrit: string | null;
  /** Dernière synchro réussie (ms). */
  maj: number | null;
  /** Couples séance et rendez-vous gardés tels quels (« Garder les deux »). */
  garder: string[];
  /** Agenda « Ce téléphone seulement » créé par pepfit. */
  local: string | null;
  /** Titre de l'événement écrit (03/11) : éléments cochés et ordonnés. Gardé à la déconnexion. */
  titre: TitreCompose;
}

const liste = (v: string | null): string[] => {
  try {
    const x = v ? JSON.parse(v) : [];
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
};

export async function lireReglagesAgenda(db: Executeur): Promise<ReglagesAgenda> {
  const [connecte, lus, ecrit, maj, garder, local, emoji, format, titre] = await Promise.all(Object.values(CLE).map((c) => lireReglage(db, c)));
  return {
    connecte: connecte === "1", lus: liste(lus ?? null), ecrit: ecrit || null, maj: maj ? Number(maj) : null, garder: liste(garder ?? null), local: local || null,
    // Pas encore de titre composé : l'ancien réglage converti, sans changement visible.
    titre: titre ? lireTitre(titre) : titreDepuisAncien(format, emoji === "1"),
  };
}

export async function ecrireReglagesAgenda(db: Executeur, r: Partial<ReglagesAgenda>): Promise<void> {
  if (r.connecte != null) await ecrireReglage(db, CLE.connecte, r.connecte ? "1" : "0");
  if (r.lus) await ecrireReglage(db, CLE.lus, JSON.stringify(r.lus));
  if (r.ecrit !== undefined) await ecrireReglage(db, CLE.ecrit, r.ecrit ?? "");
  if (r.maj != null) await ecrireReglage(db, CLE.maj, String(r.maj));
  if (r.garder) await ecrireReglage(db, CLE.garder, JSON.stringify(r.garder));
  if (r.local !== undefined) await ecrireReglage(db, CLE.local, r.local ?? "");
  if (r.titre) await ecrireReglage(db, CLE.titre, JSON.stringify({ ordre: r.titre.ordre, coches: r.titre.coches }));
}

/** Déconnexion : tout ce qui touche à l'agenda quitte ce téléphone (l'agenda local créé par pepfit reste connu, pour resservir). */
export async function oublierAgenda(db: Executeur): Promise<void> {
  await db.runAsync("DELETE FROM agenda_liens", []);
  await db.runAsync("DELETE FROM reglages WHERE cle IN (?, ?, ?, ?, ?)", [CLE.connecte, CLE.lus, CLE.ecrit, CLE.maj, CLE.garder]);
}

type Ligne = {
  cle: string; programmation_id: string; date_origine: string; evenement_id: string; debut: number; fin: number; etat: LienAgenda["etat"]; vu: number; contenu: string | null;
};
const lien = (l: Ligne): LienAgenda => ({
  cle: l.cle, programmationId: l.programmation_id, dateOrigine: l.date_origine, evenementId: l.evenement_id, debut: l.debut, fin: l.fin, etat: l.etat,
  vu: l.vu === 1, contenu: l.contenu,
});

export async function listerLiens(db: Executeur): Promise<LienAgenda[]> {
  return (await db.getAllAsync<Ligne>("SELECT cle, programmation_id, date_origine, evenement_id, debut, fin, etat, vu, contenu FROM agenda_liens", [])).map(lien);
}

export async function ecrireLien(db: Executeur, l: LienAgenda, maintenant = Date.now()): Promise<void> {
  await db.runAsync(
    `INSERT INTO agenda_liens (cle, programmation_id, date_origine, evenement_id, debut, fin, etat, vu, contenu, maj_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (cle) DO UPDATE SET evenement_id = excluded.evenement_id, debut = excluded.debut, fin = excluded.fin, etat = excluded.etat,
       vu = excluded.vu, contenu = excluded.contenu, maj_le = excluded.maj_le`,
    [l.cle, l.programmationId, l.dateOrigine, l.evenementId, l.debut, l.fin, l.etat, l.vu ? 1 : 0, l.contenu, maintenant],
  );
}

export async function retirerLien(db: Executeur, cle: string): Promise<void> {
  await db.runAsync("DELETE FROM agenda_liens WHERE cle = ?", [cle]);
}
