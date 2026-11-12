import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DialogueAbandon, abandonnerSeance } from "../ecrans/abandon-seance";
import { surSeanceChangee } from "../ecrans/bulle-evenement";
import { lireBandeau } from "../ecrans/bandeau-donnees";
import { BULLE_SUIVI, type DonneesBandeau } from "../ecrans/bandeau-seance";
import { abandonnerSuivi } from "../ecrans/suivi-enregistrer";
import { useApp } from "../ecrans/contexte";
import { BandeauSeance } from "./BandeauSeance";
import { FournisseurPartie } from "./ContextePartie";
import { ListeDesintegrable, marquerSuppression } from "./Desintegration";
import { bulleSur, sansAbandonnees } from "./bulle-seance";
import { LARGEUR_CONTENU } from "./largeur";
import { menuVisible } from "./menu-flottant";
import { useEspaceMenu, useMenuMasque } from "./MenuFlottant";
import { courbes } from "./mouvement";
import { duree } from "../theme/mouvement";
import { useReduit } from "./reduit";
import { signalerErreur } from "./FeuilleMessage";

// Bulle « séance en cours » partagée (comme le menu) : une seule instance au-dessus des onglets et de la pile, qui ne se
// démonte jamais en changeant de partie. Ses données (la séance) viennent de ce contexte, relues quand une séance démarre,
// finit ou est abandonnée, et à chaque changement d'écran ; le minuteur de repos s'abonne dans la bulle elle-même.
// Où elle s'affiche : BULLE_SUR (bulle-seance.ts).

interface ContexteBulle {
  /** La séance en cours, ou null. */
  enCours: DonneesBandeau | null;
  /** Hauteur de la bulle affichée (0 si cachée) : le contenu des écrans réserve cette place sous lui. */
  hauteur: number;
  recharger: () => Promise<void>;
  /** Hors onglets : hauteur de la barre du bas de l'écran (sous la bulle), que la bulle laisse libre. */
  reserverBas: (h: number) => void;
  /** Abandon de la séance en cours (même effet que la poubelle de la bulle : elle se désintègre) ; rend la main une fois supprimée. */
  abandonner: (id: string) => Promise<void>;
}

const Contexte = createContext<ContexteBulle>({ enCours: null, hauteur: 0, recharger: async () => {}, reserverBas: () => {}, abandonner: async () => {} });

export function useBulle() {
  return useContext(Contexte);
}

const memeBandeau = (a: DonneesBandeau | null, b: DonneesBandeau | null) => JSON.stringify(a) === JSON.stringify(b);


/** Porte la séance en cours et la couche de la bulle (à poser sous le menu, autour de la pile d'écrans). */
export function FournisseurBulle({ children }: { children: ReactNode }) {
  const { db } = useApp();
  const chemin = usePathname();
  const [enCours, setEnCours] = useState<DonneesBandeau | null>(null);
  const [hauteur, setHauteur] = useState(0);
  const [barre, setBarre] = useState(0);

  // Séances abandonnées depuis la bulle : comptées absentes dès le toucher, même si une lecture partie avant leur
  // suppression les rend encore.
  const abandonnees = useRef(new Set<string>()).current;
  const recharger = useCallback(async () => {
    const d = sansAbandonnees(await lireBandeau(db), abandonnees);
    setEnCours((avant) => (memeBandeau(avant, d) ? avant : d));
  }, [db, abandonnees]);
  const rechargerRef = useRef(recharger);
  rechargerRef.current = recharger;

  // Au changement d'écran (une séance démarre ou finit toujours par un changement d'écran), et sur l'événement direct.
  useEffect(() => {
    recharger().catch((e) => console.error(e));
  }, [recharger, chemin]);
  useEffect(() => surSeanceChangee(() => rechargerRef.current().catch((e) => console.error(e))), []);

  /** Abandon confirmé : la bulle se désintègre au toucher, la base suit ; si la suppression échoue, la bulle revient. */
  const abandonner = useCallback(
    (id: string) => {
      marquerSuppression(id);
      abandonnees.add(id);
      setEnCours(null);
      // Un suivi GPS : le service s'arrête, rien n'est enregistré.
      return (id.startsWith(BULLE_SUIVI) ? abandonnerSuivi(db) : abandonnerSeance(db, id)).catch((e) => {
        console.error(e);
        abandonnees.delete(id);
        recharger().catch((e2) => console.error(e2));
        throw e;
      });
    },
    [db, abandonnees, recharger],
  );

  const valeur = useMemo(() => ({ enCours, hauteur, recharger, reserverBas: setBarre, abandonner }), [enCours, hauteur, recharger, abandonner]);
  return (
    <Contexte.Provider value={valeur}>
      {children}
      <Couche enCours={enCours} chemin={chemin} barre={barre} onHauteur={setHauteur} onAbandonne={(id) => void abandonner(id).catch(signalerErreur("supprimer"))} />
    </Contexte.Provider>
  );
}

function Couche({ enCours, chemin, barre, onHauteur, onAbandonne }: { enCours: DonneesBandeau | null; chemin: string; barre: number; onHauteur: (h: number) => void; onAbandonne: (id: string) => void }) {
  const reduit = useReduit();
  const espaceMenu = useEspaceMenu();
  const masque = useMenuMasque();
  const lieu = bulleSur(chemin) && !masque;
  // Sur un onglet la bulle flotte au-dessus du menu ; ailleurs, au-dessus de la barre du bas de l'écran.
  const bas = menuVisible(chemin) ? espaceMenu : barre;

  // Hors de ses écrans la bulle s'efface puis se démonte (plus de comète qui tourne pour rien).
  const [rendu, setRendu] = useState(lieu);
  const p = useSharedValue(lieu ? 1 : 0);
  const y = useSharedValue(bas);
  const premiere = useRef(true);

  // « Réduire les animations » : le même fondu, plus court (150 ms) ; la bulle ne glisse pas.
  useEffect(() => {
    const ms = reduit ? duree.sortie : duree.bulle;
    if (lieu) {
      setRendu(true);
      p.value = withTiming(1, { duration: ms, easing: courbes.sortie });
      return;
    }
    p.value = withTiming(0, { duration: ms, easing: courbes.sortie });
    const m = setTimeout(() => setRendu(false), ms + 40);
    return () => clearTimeout(m);
  }, [lieu, reduit, p]);

  // Passage onglet ↔ écran poussé : la bulle glisse à sa nouvelle hauteur au lieu de sauter.
  useEffect(() => {
    if (premiere.current || reduit) y.value = bas;
    else y.value = withTiming(bas, { duration: duree.deplacement, easing: courbes.deplacement });
    premiere.current = false;
  }, [bas, reduit, y]);

  const anime = useAnimatedStyle(() => ({ opacity: p.value, bottom: y.value }));
  // L'alerte d'abandon vit ici, hors de la bulle : dans la bulle, sa fenêtre encore en fondu était capturée avec elle et la
  // désintégration montrait l'alerte au lieu de la bulle. `alerte` garde la séance le temps du fondu de fermeture.
  const [alerte, setAlerte] = useState<DonneesBandeau | null>(null);
  const [ouverte, setOuverte] = useState(false);
  const mesuree = useRef(0);
  useEffect(() => {
    if (!lieu) onHauteur(0);
    else onHauteur(mesuree.current);
  }, [lieu, onHauteur]);

  // Abandon : la bulle est retirée de la liste et se désintègre (aux couleurs d'Entraînements) à sa place ; la couche, ancrée
  // en bas, ne replie pas la place pendant les grains (elle glissait vers le bas), elle se libère à la fin.
  return (
    <Animated.View pointerEvents={lieu ? "box-none" : "none"} style={[styles.couche, anime]}>
      {/* Fold déplié : la bulle suit la colonne du contenu (640 dp au plus, centrée, D5). */}
      <View
        style={styles.colonne}
        onLayout={(e) => {
          mesuree.current = e.nativeEvent.layout.height;
          if (lieu) onHauteur(mesuree.current);
        }}
      >
        <FournisseurPartie route="train">
          <ListeDesintegrable
            liste={rendu && enCours ? [enCours] : []}
            cleDe={(d) => d.id}
            garderPlace
            rendu={(d) => (
              <BandeauSeance
                donnees={d}
                onPoubelle={() => {
                  setAlerte(d);
                  setOuverte(true);
                }}
              />
            )}
          />
        </FournisseurPartie>
      </View>
      <DialogueAbandon
        visible={ouverte}
        seriesFaites={alerte?.seriesFaites ?? 0}
        onAnnuler={() => setOuverte(false)}
        onConfirmer={() => {
          setOuverte(false);
          // La bulle se désintègre au toucher, sans vibration ; la base suit (FournisseurBulle).
          if (alerte) onAbandonne(alerte.id);
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  couche: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  colonne: { width: "100%", maxWidth: LARGEUR_CONTENU },
});
