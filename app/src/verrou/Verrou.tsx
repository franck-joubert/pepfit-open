import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, BackHandler, Modal, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SQLiteDatabase } from "expo-sqlite";
import { seanceEnCours } from "../db";
import { useApp } from "../ecrans/contexte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { deverrouillageEnCours, deverrouiller, estProtege, masquerApercu } from "../natif/deverrouillage";
import { suivi } from "../natif/suivi";
import { SurfacePartie, useTheme } from "../theme";
import { espace } from "../theme/typo";
import { BoutonPrincipal } from "../ui/Degrade";
import { LogoPepfit } from "../ui/LogoPepfit";
import { Texte } from "../ui/Texte";
import { doitReverrouiller, suiteDeverrouillage } from "./regle";

/** Une séance de muscu ou une course en direct en cours : le délai attend sa fin (D6). */
async function enSeance(db: SQLiteDatabase): Promise<boolean> {
  const s = await seanceEnCours(db).catch(() => null);
  if (s) return true;
  const e = await suivi.etat().catch(() => null);
  return !!e && e.statut !== "arrete";
}

/**
 * Verrou d'ouverture (planche compte-connexion, H3 ; D5, D6) : celui du téléphone, sans mot de passe pepfit.
 * À froid, verrou allumé : seul l'écran verrouillé (3d) est monté, avant le premier rendu de l'appli ; rien ne s'affiche
 * dessous, et les liens et notifications attendent le déverrouillage. Ensuite, l'appli reste montée et l'écran revient par
 * une fenêtre (Modal) au-dessus de tout, feuilles comprises, quand le délai est passé. La fenêtre d'Android s'ouvre seule (3e).
 * Téléphone sans verrou d'écran (retiré depuis) : pepfit s'ouvre et le réglage s'éteint, pour ne pas faire croire qu'il protège.
 */
export function GardeVerrou({ children }: { children: ReactNode }) {
  useLangue();
  const { db, reglages, regler } = useApp();
  const sansVerrou = estProtege() === false;
  // Android et iPhone (Face ID, Touch ID ou code : modules/pepfit-deverrouillage/ios) ; pas le web
  const actif = Platform.OS !== "web" && reglages.verrou && !sansVerrou;
  const [monte, setMonte] = useState(!actif);
  const [ferme, setFerme] = useState(actif);
  const etat = useRef({ actif, delai: reglages.verrouDelaiS, ferme, quitteA: null as number | null, seance: false, demande: false });
  etat.current.actif = actif;
  etat.current.delai = reglages.verrouDelaiS;
  etat.current.ferme = ferme;

  useEffect(() => {
    if (reglages.verrou && sansVerrou) regler({ verrou: false });
  }, [reglages.verrou, sansVerrou, regler]);

  // Aperçu masqué dans les applis récentes tant que le verrou est allumé (Android 13 et plus).
  useEffect(() => {
    masquerApercu(actif).catch(() => {});
    if (!actif) setFerme(false);
  }, [actif]);

  const demander = useCallback(async () => {
    const e = etat.current;
    if (e.demande) return;
    e.demande = true;
    try {
      const issue = await deverrouiller(t("verrou.fenetreTitre"), t("verrou.moyens"));
      // Android 9 et moins (réglage revenu d'une sauvegarde) : rien ne peut déverrouiller, pepfit s'ouvre et le réglage s'éteint
      const s = suiteDeverrouillage(issue === "indisponible" && Platform.OS === "android" && Number(Platform.Version) < 29 ? "sansVerrou" : issue);
      if (s.eteindre) regler({ verrou: false });
      if (s.ouvrir) {
        setMonte(true);
        setFerme(false);
      }
    } finally {
      e.demande = false;
    }
  }, [regler]);

  // Verrouillé : la fenêtre d'Android s'ouvre seule ; « Déverrouiller » sert après un « Annuler ». Fermé en arrière-plan
  // (Aussitôt) : elle attend le retour au premier plan.
  useEffect(() => {
    if (ferme && AppState.currentState !== "background") demander().catch(() => {});
  }, [ferme, demander]);

  useEffect(() => {
    const ecoute = AppState.addEventListener("change", (a) => {
      const e = etat.current;
      if (!e.actif || deverrouillageEnCours()) return;
      if (a === "background") {
        e.quitteA = Date.now();
        e.seance = false;
        enSeance(db)
          .then((oui) => {
            e.seance = oui;
            // Aussitôt : fermé dès l'arrière-plan, pour qu'au retour rien ne s'affiche avant l'écran verrouillé
            if (!oui && e.delai === 0 && e.quitteA != null) setFerme(true);
          })
          .catch(() => {});
      } else if (a === "active") {
        masquerApercu(true).catch(() => {});
        const q = e.quitteA;
        e.quitteA = null;
        if (e.ferme) demander().catch(() => {});
        else if (doitReverrouiller({ actif: true, quitteA: q, maintenant: Date.now(), delaiS: e.delai, seanceEnCours: e.seance })) setFerme(true);
      }
    });
    return () => ecoute.remove();
  }, [db, demander]);

  if (!monte) return <EcranVerrou onDeverrouiller={demander} />;
  return (
    <>
      {children}
      {/* Retour : pepfit passe derrière, comme depuis l'accueil, sans rien montrer. */}
      <Modal visible={ferme} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => BackHandler.exitApp()}>
        <EcranVerrou onDeverrouiller={demander} />
      </Modal>
    </>
  );
}

/** Écran verrouillé (3d) : le symbole, « pepfit est verrouillé », les moyens, et « Déverrouiller » en bas. */
function EcranVerrou({ onDeverrouiller }: { onDeverrouiller: () => void }) {
  // hors de la pile, il prend lui-même la teinte de l'Accueil, comme les pages de réglages
  return (
    <SurfacePartie partie="accueil">
      <Contenu onDeverrouiller={onDeverrouiller} />
    </SurfacePartie>
  );
}

function Contenu({ onDeverrouiller }: { onDeverrouiller: () => void }) {
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  return (
    <View style={[StyleSheet.absoluteFill, styles.ecran, { backgroundColor: couleurs.bg, paddingBottom: bas + espace.l }]}>
      <View style={styles.centre}>
        <LogoPepfit largeur={64} />
        <Texte variante="titre" style={styles.titre}>
          {t("verrou.verrouille")}
        </Texte>
        <Texte variante="note" couleur="t2" style={styles.sous}>
          {t("verrou.verrouilleSous")}
        </Texte>
      </View>
      <BoutonPrincipal libelle={t("verrou.deverrouiller")} onPress={onDeverrouiller} style={styles.bouton} />
    </View>
  );
}

const styles = StyleSheet.create({
  // au-dessus de la pastille de synchro, posée après l'appli (FournisseurApp)
  ecran: { zIndex: 100, elevation: 100 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: espace.xxl * 2 },
  titre: { marginTop: espace.xl, textAlign: "center" },
  sous: { marginTop: espace.s, textAlign: "center", maxWidth: 180 },
  bouton: { marginHorizontal: espace.l },
});
