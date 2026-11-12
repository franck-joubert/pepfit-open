import { useEffect } from "react";
import { lireAnnonces, lireSuiviLance } from "../db";
import { suivi } from "../natif/suivi";
import { annoncer } from "../natif/voix";
import { useApp } from "./contexte";
import { annonceEtape, etatDesTours, type Etape } from "./etapes-course";
import { etapesDuSuivi } from "./etapes-suivi";
import { ecranDirect, etapeAPasser } from "./guide-fond";

// Course guidée réduite en bulle (retour du 29/10) : tant que l'écran en direct est fermé, les étapes avancent ici
// à leur cible, avec le tour qui en marque la borne, les deux vibrations et l'annonce vocale, comme dans l'écran (aussi
// écran éteint : le service natif tient l'appli en avant-plan). L'écran rouvert reprend la main (ecranDirect.ouvert).

export function GuideFond() {
  const { db } = useApp();
  useEffect(() => {
    // Étapes du suivi en cours, lues une fois par suivi.
    let pour: string | null = null;
    let etapes: Etape[] | null = null;
    let voix = true;
    let attendu = 0;
    let enCours = false;
    const charger = async (id: string) => {
      pour = id;
      etapes = null;
      attendu = 0;
      const l = await lireSuiviLance(db);
      // Le départ écrit le suivi lancé juste après avoir démarré le service : pas encore là, on relira au prochain instantané.
      if (l?.suiviId !== id) {
        pour = null;
        return;
      }
      etapes = await etapesDuSuivi(db, l);
      voix = await lireAnnonces(db);
    };
    let version = ecranDirect.version;
    return suivi.ecouter((e) => {
      // la FC d'une séance de muscu n'a pas d'étapes
      if (!e.id || enCours || e.mode === "muscu") return;
      if (e.id !== pour || version !== ecranDirect.version) {
        version = ecranDirect.version;
        charger(e.id).catch(console.error);
        return;
      }
      if (!etapeAPasser(etapes, e, attendu)) return;
      enCours = true;
      const suivante = etapes![etatDesTours(e.tours).i + 1];
      attendu = e.tours.length + 1;
      suivi
        .tour()
        .then((b) => {
          if (b) annoncer(annonceEtape(suivante), voix);
          else attendu = 0;
        })
        .catch(console.error)
        .finally(() => {
          enCours = false;
        });
    });
  }, [db]);
  return null;
}
