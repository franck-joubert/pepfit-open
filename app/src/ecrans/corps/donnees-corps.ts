import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "../../ui/focus-prechauffe";
import { abonner, lireActif } from "../../i18n/index";
import { abonnerPrecision } from "../../precision/service";
import { personnageDuLien } from "../../theme/lien";
import { useApp } from "../contexte";
import { useMorphologie } from "../morphologie";
import { chargerSante, oublierMemoire } from "../sante-charge";
import { lecteursSante, memoireSante, retenirSante, type DonneesSante } from "../sante-lecteurs";

// Ce que le contenu du Corps lit, pour la page Santé (ecrans/Sante) :
// les données du jour choisi, et les liens de capture.

/**
 * Liens de capture et de retour posés sur la page qui porte le Corps :
 * ?personnage=homme|femme : le corps montré, pour cet affichage seulement ;
 * ?ecart=-10 : l'âge et l'âme comme à cet écart ; ?mesure=1 : les i/s du personnage dans logcat ;
 * ?lent=6 : le vol de l'âme au ralenti (mise au point sur l'émulateur, qui ne rend que quelques images par seconde) ;
 * ?ame=0 : le personnage sans l'âme (mesure de ce qu'elle coûte, même build) ; ?energie=1 : la feuille Énergie ouverte.
 */
export type LienCorps = { personnage?: string; prepasse?: string; energie?: string; aa?: string; ecart?: string; mesure?: string; lent?: string; ame?: string };

export const useLienCorps = () => useLocalSearchParams<LienCorps>();

/** La morphologie du corps dessiné : celle du profil, ou le personnage imposé par le lien (capture). */
export function useMorphoDuLien() {
  const lien = useLienCorps();
  const impose = personnageDuLien(lien.personnage);
  const lu = useMorphologie();
  return impose ? { tailleCm: null, poidsKg: null, ...lu, sexe: impose === "homme" ? ("h" as const) : ("f" as const) } : lu;
}

/** Les données de la page : chaque partie arrive seule (undefined tant qu'elle n'est pas lue), relue à chaque visite. */
export function useDonneesCorps(date: string, jour: number, passe: boolean): { donnees: Partial<DonneesSante>; relire: () => Promise<void> } {
  const { db } = useApp();
  // la langue, le fuseau et les unités : les noms et les dates lus en base sont relus quand ils changent (comme useCharge)
  const { langue, fuseau, poids, distance } = useSyncExternalStore(abonner, lireActif);
  // préchargées au lancement de l'appli, ou lues à une visite précédente : montrées dès le montage
  const [d, setD] = useState<Partial<DonneesSante>>(() => memoireSante.get(date) ?? {});
  // une saisie (pesée, tour, %gras, profil, date de naissance) : l'âge d'un jour passé gardé en mémoire est oublié (celui
  // d'aujourd'hui, gardé dans la base, se recalcule de lui-même : son empreinte a changé)
  useEffect(() => abonnerPrecision(oublierMemoire), []);
  const lire = useCallback(
    (vivant: () => boolean = () => true) =>
      chargerSante<DonneesSante>(
        lecteursSante(db, date, jour, passe),
        (k, v) => {
          retenirSante(date, k, v);
          setD((x) => ({ ...x, [k]: v }));
        },
        vivant,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, date, passe, jour, langue, fuseau, poids, distance],
  );
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      void lire(() => vivant);
      return () => {
        vivant = false;
      };
    }, [lire]),
  );
  // Tirer pour actualiser (ui/Actualiser) : les sources viennent d'être relues ; les valeurs gardées en mémoire sont oubliées, puis
  // la page se relit comme à une visite.
  const relire = useCallback(() => {
    oublierMemoire();
    return lire();
  }, [lire]);
  return { donnees: d, relire };
}
