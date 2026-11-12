import { useEffect, useState } from "react";
import { supprimerPlat, type Executeur } from "../../db";
import { effacerPhotoPlat } from "../../photos/plats";

// Suppression d'un plat (P11) : le plat quitte les listes tout de suite, « … supprimé · Annuler » reste 8 s, puis il est
// supprimé (base, photo, serveur à la synchro). Une suppression synchronisée ne se reprend pas : on attend donc la fin de
// « Annuler » avant d'écrire. Partagée par Mes plats, l'onglet Mes plats d'Ajouter et la fiche (qui se ferme aussitôt).

export const DELAI_ANNULER_MS = 8000;

interface Attente {
  id: string;
  nom: string;
  minuterie: ReturnType<typeof setTimeout>;
  faire: () => void;
}

let attente: Attente | null = null;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

/** Fait tout de suite la suppression en attente (une autre arrive, ou on quitte). */
export function validerSuppressionPlat(): void {
  const a = attente;
  if (!a) return;
  clearTimeout(a.minuterie);
  attente = null;
  a.faire();
  prevenir();
}

export function demanderSuppressionPlat(db: Executeur, plat: { id: string; nom: string }, apres?: () => void): void {
  validerSuppressionPlat();
  const faire = () =>
    void supprimerPlat(db, plat.id)
      .then((photo) => {
        effacerPhotoPlat(photo);
        apres?.();
      })
      .catch((e) => console.error(e));
  attente = { id: plat.id, nom: plat.nom, faire, minuterie: setTimeout(validerSuppressionPlat, DELAI_ANNULER_MS) };
  prevenir();
}

export function annulerSuppressionPlat(): void {
  if (!attente) return;
  clearTimeout(attente.minuterie);
  attente = null;
  prevenir();
}

/** Le plat en attente de suppression (à cacher des listes, et le bandeau « Annuler »), ou null. */
export function useSuppressionPlat(): { id: string; nom: string } | null {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    abonnes.add(f);
    return () => void abonnes.delete(f);
  }, []);
  return attente ? { id: attente.id, nom: attente.nom } : null;
}
