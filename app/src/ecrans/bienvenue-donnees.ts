import { useEffect, useState } from "react";
import type { SQLiteDatabase } from "expo-sqlite";
import { joursDeRepos, JOUR_MS, recordsRecents, seancesTerminees, serieHebdo } from "../db";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { sportDominant, sportsDepuis } from "../db/sports";
import type { ContexteBienvenue } from "../i18n/bienvenue";
import { useLangue } from "../i18n/useLangue";
import { parId, rendre, tirer } from "./bienvenue";
import { useApp } from "./contexte";
import { prochainesSeances } from "./planif-donnees";

export async function lireContexteBienvenue(db: SQLiteDatabase, maintenant: number = Date.now()): Promise<ContexteBienvenue> {
  const [faites, sports, records, prochaines] = await Promise.all([
    seancesTerminees(db),
    sportsDepuis(db, maintenant - 30 * JOUR_MS),
    recordsRecents(db, 1),
    prochainesSeances(db, 1, maintenant).catch(() => []),
  ]);
  return {
    heure: new Date(maintenant).getHours(),
    sport: sportDominant(sports),
    serie: serieHebdo(faites, maintenant).enCours,
    repos: joursDeRepos(faites, maintenant),
    seanceAujourdhui: prochaines[0]?.aujourdhui ?? false,
    recordRecent: (records[0]?.atteint_le ?? 0) >= maintenant - 3 * JOUR_MS,
  };
}

// Un tirage par lancement de l'appli : gardé ici, hors des écrans (ni les rendus ni les changements d'onglet ne le refont).
let tirage: { id: string; c: ContexteBienvenue } | null = null;
let enCours: Promise<void> | null = null;

/** Message de bienvenue du lancement, dans la langue et avec le prénom actuels ; null le temps de la lecture. */
export function useBienvenue(): string | null {
  const { db, reglages } = useApp();
  const { langue } = useLangue();
  const [pret, setPret] = useState(tirage != null);
  useEffect(() => {
    if (tirage) return;
    let vivant = true;
    enCours ??= (async () => {
      const c = await lireContexteBienvenue(db);
      const m = tirer(c, Date.now(), await lireReglage(db, "bienvenue_dernier"));
      tirage = { id: m.id, c };
      await ecrireReglage(db, "bienvenue_dernier", m.id);
    })();
    enCours.then(() => vivant && setPret(true)).catch((e) => console.error(e));
    return () => {
      vivant = false;
    };
  }, [db]);
  const m = pret && tirage ? parId(tirage.id) : undefined;
  return m && tirage ? rendre(m, langue, reglages.prenom, tirage.c) : null;
}
