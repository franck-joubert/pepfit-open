import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "expo-router";
import { useFocusEffect } from "../ui/focus-prechauffe";
import type { SQLiteDatabase } from "expo-sqlite";
import { base, synchroniserPoidsSante } from "../db";
import { compteurEcritures } from "../db/exclusif";
import { cleCharge, memoireCharge, retenirCharge } from "./memoire-charges";
import { sante } from "../natif/sante";
import { ecrireReglages, lireReglages, type Reglages } from "./donnees";
import { reprendreRepos } from "./repos";
import { minuteur } from "../natif/minuteur";
import { sauvegarderSiDue } from "../sauvegarde";
import { synchroRecue, useVersionDonnees } from "../sync/rafraichir";
import { synchroniserSiBesoin as synchroniserWhoopSiBesoin } from "../whoop";
import { synchroniserSiBesoin as synchroniserWithingsSiBesoin } from "../withings";
import { reprendreFitatu } from "../fitatu";
import { abonner, definirActif, lireActif, definirDetecte, lireDetecte, resoudre } from "../i18n/index";
import { detecterAppareil } from "../i18n/appareil";
import { enFond } from "./fond";
import { rafraichirModeAffichage } from "./nutrition/mode-affichage";
import { surFuseauDuTelephone } from "./heure-voyage/fuseau-appareil";

interface ContexteApp {
  db: SQLiteDatabase;
  reglages: Reglages;
  regler(r: Partial<Reglages>): void;
}

const Contexte = createContext<ContexteApp | null>(null);

/**
 * Whoop et Withings au lancement et au retour au premier plan, seulement si la dernière synchro date de plus de 15 min (les
 * limites de l'API Whoop sont par application, pas par utilisateur : jamais de synchro périodique appli ouverte).
 * Ce qui est neuf relit les écrans ouverts (Pas, Effort, Sport…).
 */
async function synchroniserAppareils(db: SQLiteDatabase) {
  const r = await Promise.all([synchroniserWhoopSiBesoin(db).catch(() => false), synchroniserWithingsSiBesoin(db).catch(() => false)]);
  if (r.some(Boolean)) synchroRecue.annoncer();
}

/** Ouvre la base, pose le schéma des écrans, lit les réglages et reprend un repos en cours. */
export function FournisseurApp({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<{ db: SQLiteDatabase; reglages: Reglages } | null>(null);
  // Les préférences de région du moment, pour le fuseau relu au retour au premier plan (voyage, planche sommeil D13).
  const region = useRef<Reglages["region"] | null>(null);

  useEffect(() => {
    (async () => {
      const db = await base();
      const detecte = detecterAppareil();
      definirDetecte(detecte);
      const reglages = await lireReglages(db, detecte);
      definirActif(resoudre(reglages.region, detecte));
      region.current = reglages.region;
      minuteur.regler(reglages.alerteRepos, reglages.sonRepos?.uri ?? null);
      // Rien d'attendu ici ne doit pouvoir bloquer l'affichage : tant que `etat` est nul, aucun écran (donc aucun lien profond
      // pepfitopen://) n'est monté, et un appel natif qui ne rend jamais la main (Santé Connect à froid) laissait l'écran noir.
      await Promise.race([reprendreRepos(db).catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
      // D20 : le mode sans chiffres avant le premier écran, pour qu'aucun chiffre de nutrition ne s'affiche un instant.
      await Promise.race([rafraichirModeAffichage(db), new Promise((r) => setTimeout(r, 1500))]);
      setEtat({ db, reglages });
      // Tout ce qui suit attend le premier écran, puis passe un par un, hors des gestes (fond.ts).
      enFond("appareils", () => synchroniserAppareils(db));
      enFond("poids-sante", () => synchroniserPoidsSante(db, sante).catch(() => false));
      // Import de l'historique Fitatu pas fini (appli fermée, figée en arrière-plan, réseau, 429) : il reprend où il en était.
      enFond("fitatu", () => reprendreFitatu(db).catch(() => {}));
      // Sauvegarde périodique dans le dossier choisi, si elle est due : quelques secondes après le lancement, pour ne pas
      // ralentir le premier écran ; un échec reste affiché dans Données et confidentialité.
      setTimeout(() => enFond("sauvegarde", () => sauvegarderSiDue(db).catch(() => {})), 5000);
      // Voyage et rappel de coucher (planche sommeil, D13, D15) : le fuseau du téléphone, puis les 7 soirs à prévenir.
      const fuseau = () => enFond("fuseau", () => surFuseauDuTelephone(db, region.current ?? reglages.region).catch(() => {}));
      fuseau();
      AppState.addEventListener("change", (a) => {
        if (a !== "active") return;
        fuseau();
        enFond("appareils", () => synchroniserAppareils(db));
        enFond("fitatu", () => reprendreFitatu(db).catch(() => {}));
        enFond("sauvegarde", () => sauvegarderSiDue(db).catch(() => {}));
      });
    })().catch((e) => console.error(e));
  }, []);

  const regler = useCallback((r: Partial<Reglages>) => {
    const fusion = <E extends { reglages: Reglages }>(e: E): E => {
      const reglages = { ...e.reglages, ...r };
      region.current = reglages.region;
      if (r.region || r.unite) {
        // Un choix d'unité forcé par l'ancien champ « unite » vaut un choix de poids.
        if (r.unite && !r.region) reglages.region = { ...reglages.region, poids: r.unite };
        const d = lireDetecte();
        reglages.unite = reglages.region.poids === "auto" ? d.poids : reglages.region.poids;
        definirActif(resoudre(reglages.region, d));
      }
      if (r.alerteRepos || r.sonRepos !== undefined) minuteur.regler(reglages.alerteRepos, reglages.sonRepos?.uri ?? null);
      return { ...e, reglages };
    };
    setEtat((e) => {
      if (!e) return e;
      return fusion(e);
    });
    base()
      .then((db) => ecrireReglages(db, r))
      .catch(() => {});
  }, []);

  if (!etat) return null;
  return <Contexte.Provider value={{ db: etat.db, reglages: etat.reglages, regler }}>{children}</Contexte.Provider>;
}

export function useApp(): ContexteApp {
  // Tout écran qui lit les réglages se redessine aussi quand la langue, le fuseau ou les unités changent.
  useSyncExternalStore(abonner, lireActif);
  const c = useContext(Contexte);
  if (!c) throw new Error("useApp hors de FournisseurApp");
  return c;
}

/** Une lecture d'écran sans résultat en 10 s, ou en échec, est « en panne » (docs/PAS-CHARGEMENT.md). */
export const DELAI_CHARGE_MS = 10_000;
/**
 * Charge des données à chaque retour sur l'écran ; renvoie [valeur, recharger, panne]. `panne` : la lecture a échoué ou n'a
 * rien rendu en 10 s ; l'écran le dit (EnPanne, « Réessayer ») au lieu de rester sur son squelette. Une lecture lente qui
 * finit par arriver efface la panne.
 *
 * `memoire` (nom de l'écran, M12) : la page s'affiche tout de suite avec la dernière valeur lue (même d'une visite d'avant),
 * puis la relit en fond ; au retour sur l'écran, rien n'est relu si la valeur a moins de 30 s et que la base n'a pas été
 * écrite depuis. `recharger()` relit toujours.
 */
export function useCharge<T>(
  lire: (db: SQLiteDatabase) => Promise<T>,
  deps: unknown[] = [],
  initial?: T,
  memoire?: string,
): [T | undefined, () => Promise<void>, boolean] {
  const { db } = useApp();
  const { langue, fuseau, poids, distance } = useSyncExternalStore(abonner, lireActif);
  const recue = useVersionDonnees();
  const cle = cleCharge(memoire, [langue, fuseau, poids, distance, ...deps], db);
  // `initial` : une valeur déjà lue ailleurs (page Âge ouverte depuis Santé), montrée tout de suite puis relue
  const [v, setV] = useState<T | undefined>(() => initial ?? memoireCharge<T>(cle)?.v);
  const [panne, setPanne] = useState(false);
  // La langue, le fuseau et les unités font partie des dépendances : les noms et les dates lus en base sont relus quand ils changent.
  const lireEtGarder = useCallback(async () => {
    setPanne(false);
    const minuteur = setTimeout(() => setPanne(true), DELAI_CHARGE_MS);
    const ecritures = compteurEcritures();
    try {
      const x = await lire(db);
      retenirCharge(cle, x, ecritures);
      setV(x);
      setPanne(false);
    } catch (e) {
      setPanne(true);
      throw e;
    } finally {
      clearTimeout(minuteur);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, langue, fuseau, poids, distance, cle, ...deps]);
  useFocusEffect(
    useCallback(() => {
      const m = memoireCharge<T>(cle);
      if (m) {
        // une autre clé (autre jour) déjà lue : montrée tout de suite ; fraîche, elle n'est pas relue
        setV(m.v);
        if (m.frais) return;
      }
      lireEtGarder().catch((e) => console.error(e));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lireEtGarder]),
  );
  // Un changement reçu par la synchro (l'IA a modifié une routine, une séance…) ou un tirage pour actualiser : relu aussitôt,
  // sans quitter l'écran. Un écran qui n'a pas le focus (un autre onglet, une page sous une autre) ne se relit pas : tous les
  // onglets ouverts relançaient leurs lectures en même temps et la file de la base retardait la page tirée de ~500 ms (mesure du
  // 08/11) ; à son retour, le focus le relit si sa valeur n'est plus fraîche (plus de 30 s, ou base écrite depuis).
  const vue = useRef(recue);
  const focus = useIsFocused();
  useEffect(() => {
    if (vue.current === recue) return;
    vue.current = recue;
    if (!focus) return;
    lireEtGarder().catch((e) => console.error(e));
  }, [recue, focus, lireEtGarder]);
  return [v, lireEtGarder, panne];
}
