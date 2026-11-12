import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { lireReglage, ecrireReglage } from "../db";
import type { Executeur } from "../db/executeur";
import { t } from "../i18n/index";
import { suivi, type Batterie } from "../natif/suivi";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { Feuille } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import {
  apresFeuille,
  casBatterie,
  CLE_BATTERIE,
  coupureDerniereSeance,
  ETAPES_BATTERIE,
  lireMoments,
  noterVu,
  proposerBatterie,
  type EcranBatterie,
  type EtatMoments,
  type MomentBatterie,
} from "./batterie";
import { useApp } from "./contexte";
import { Etapes } from "./FeuilleFc";

// « Batterie non restreinte » : une phrase, le bouton qui ouvre le réglage de pepfit (fiche de l'appli sur Samsung, liste
// « Optimisation de la batterie » ailleurs, fiche en repli) et les étapes de cet écran-là ; « Plus tard ». Au retour dans
// pepfit, le pied dit si c'est réglé. La même feuille sert aux moments (BatterieAuMoment), à la ligne « FC coupée » d'une
// séance passée et à Réglages › Connexions.

export function FeuilleBatterie({ visible, onFermer }: { visible: boolean; onFermer: (issue: { ouverte: boolean; reglee: boolean }) => void }) {
  const { couleurs } = useTheme();
  const [b, setB] = useState<Batterie | null>(null);
  const [ecran, setEcran] = useState<EcranBatterie | null>(null);
  const ouverte = useRef(false);
  useEffect(() => {
    if (!visible) return;
    ouverte.current = false;
    const lire = () => suivi.batterie().then(setB).catch(() => setB(null));
    lire();
    const s = AppState.addEventListener("change", (e) => e === "active" && lire());
    return () => s.remove();
  }, [visible]);
  const regle = b != null && !b.optimisee;
  const fermer = () => onFermer({ ouverte: ouverte.current, reglee: regle });
  // Réglé dans Android puis retour dans pepfit (relu à chaque retour au premier plan) : le pied le dit, puis la feuille
  // se ferme d'elle-même.
  const surFermer = useRef(onFermer);
  surFermer.current = onFermer;
  useEffect(() => {
    if (!visible || !regle || !ouverte.current) return;
    const m = setTimeout(() => surFermer.current({ ouverte: true, reglee: true }), 1200);
    return () => clearTimeout(m);
  }, [visible, regle]);
  const ouvrir = () => {
    ouverte.current = true;
    suivi.ouvrirReglagesBatterie().then(setEcran).catch(console.error);
  };

  return (
    <Feuille
      visible={visible}
      onFermer={fermer}
      titre={t("gps.batterie.titre")}
      sousTitre={t("gps.batterie.intro")}
      pied={
        <View style={styles.pied}>
          {regle ? (
            <>
              <View style={styles.etat} accessibilityLiveRegion="polite">
                <Icone nom="check" taille={22} couleur={couleurs.valide} />
                <Texte style={styles.etatT}>{t("gps.batterie.ok")}</Texte>
              </View>
              <Bouton libelle={t("gps.fc.tuto.continuer")} variante="primaire" large onPress={fermer} />
            </>
          ) : (
            <>
              <Bouton libelle={t("gps.batterie.ouvrir")} variante="primaire" large onPress={ouvrir} />
              <Bouton libelle={t("gps.batterie.plusTard")} large onPress={fermer} />
            </>
          )}
        </View>
      }
    >
      <View style={styles.etapes}>
        <Etapes etapes={ETAPES_BATTERIE[casBatterie(b, ecran)]} />
      </View>
    </Feuille>
  );
}

// Une seule feuille d'office par lancement de l'appli (objet et séance peuvent tomber ensemble).
let dejaCeLancement = false;

async function lireEtat(db: Executeur, b: Batterie | null): Promise<EtatMoments> {
  return lireMoments(await lireReglage(db, CLE_BATTERIE), b?.dejaProposee);
}

/** La feuille d'office quand `actif` devient vrai : `moment` jamais montré, pepfit encore optimisé, pas de refus ; pour
 *  « coupure », seulement si le journal du suivi en montre une dans la dernière séance. */
export function BatterieAuMoment({ moment, actif }: { moment: MomentBatterie; actif: boolean }) {
  const { db } = useApp();
  const [ouverte, setOuverte] = useState(false);
  const vue = useRef(false);
  useEffect(() => {
    if (!actif || vue.current) return;
    vue.current = true;
    (async () => {
      const b = await suivi.batterie();
      const e = await lireEtat(db, b);
      if (!proposerBatterie(b, e, moment, dejaCeLancement)) return;
      if (moment === "coupure" && !coupureDerniereSeance(await suivi.journal())) return;
      dejaCeLancement = true;
      setOuverte(true);
      await ecrireReglage(db, CLE_BATTERIE, JSON.stringify(noterVu(e, moment)));
    })().catch(console.error);
  }, [actif, moment, db]);
  return (
    <FeuilleBatterie
      visible={ouverte}
      onFermer={(issue) => {
        setOuverte(false);
        noterIssue(db, issue).catch(console.error);
      }}
    />
  );
}

/** Après la feuille : « Plus tard » sans rien ouvrir est un refus mémorisé. */
export async function noterIssue(db: Executeur, issue: { ouverte: boolean; reglee: boolean }) {
  const e = await lireEtat(db, await suivi.batterie());
  await ecrireReglage(db, CLE_BATTERIE, JSON.stringify(apresFeuille(e, issue)));
}

const styles = StyleSheet.create({
  pied: { gap: espace.s },
  etat: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  etatT: { fontSize: 15 },
  etapes: { paddingBottom: espace.m },
});
