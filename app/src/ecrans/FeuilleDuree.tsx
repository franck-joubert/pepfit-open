import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, rayon, typo } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { ChronoSeance } from "../ui/ChronoSeance";
import { Feuille } from "../ui/Feuille";
import { RoueDuree } from "../ui/RoueDuree";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { GroupeReglages, LigneReglage } from "./Reglage";
import {
  avecDebut, avecDuree, debutDepuisRoues, deuxChiffres, dureeMinutesLue, dureeMinutesTexte, dureeSeanceS, ecartJours,
  enPause, JOUR_MAX_MIN, libelleJour, mettreEnPause, reprendre, valeursHeures, valeursJours, valeursMinutesDuree, valeursMinutesHeure,
  type Chrono,
} from "./duree-seance";
import { titreFinal } from "./edition-seance";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { parties } from "../i18n/temps";
import { dateSeance } from "./format";

const MINUTES = valeursMinutesDuree();
const HEURES = valeursHeures();
const MINUTES_HEURE = valeursMinutesHeure();
const JOURS = valeursJours();
const ATTENUE = (texte: string) => ({ attenue: "", plein: texte });

type Onglet = "duree" | "debut";

/** Feuille « Durée » d'une séance en cours : titre, durée qui défile, roue de durée ou d'heure de début, pause / reprise.
 *  Le temps ne s'arrête pas pendant qu'elle est ouverte ; les réglages sont écrits après une courte attente et à la fermeture. */
export function FeuilleDuree({
  visible,
  chrono,
  titre,
  routineNom,
  onChrono,
  onTitre,
  onFermer,
}: {
  visible: boolean;
  chrono: Chrono;
  titre: string | null;
  routineNom: string | null;
  onChrono: (c: Chrono) => void;
  onTitre: (t: string | null) => void;
  onFermer: () => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const [c, setC] = useState(chrono);
  const cRef = useRef(chrono);
  const [onglet, setOnglet] = useState<Onglet>("duree");
  const [texte, setTexte] = useState("");
  const [ouverture, setOuverture] = useState(Date.now());
  const attente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aEcrire = useRef(false);
  const titreEcrit = useRef(false);
  const surChrono = useRef(onChrono);
  surChrono.current = onChrono;
  const surTitre = useRef(onTitre);
  surTitre.current = onTitre;

  useEffect(() => {
    if (!visible) return;
    cRef.current = chrono;
    setC(chrono);
    setOnglet("duree");
    setTexte(titre ?? routineNom ?? "");
    setOuverture(Date.now());
    titreEcrit.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const ecrire = useCallback(() => {
    if (attente.current) clearTimeout(attente.current);
    attente.current = null;
    if (!aEcrire.current) return;
    aEcrire.current = false;
    surChrono.current(cRef.current);
  }, []);

  const appliquer = (n: Chrono, tout = false) => {
    cRef.current = n;
    setC(n);
    aEcrire.current = true;
    if (attente.current) clearTimeout(attente.current);
    if (tout) ecrire();
    else attente.current = setTimeout(ecrire, 350);
  };

  const validerTitre = () => {
    if (titreEcrit.current) return;
    const final = titreFinal(texte);
    const nouveau = final === routineNom ? null : final;
    if (nouveau !== titre) surTitre.current(nouveau);
    titreEcrit.current = true;
  };

  const fermer = () => {
    validerTitre();
    ecrire();
    onFermer();
  };

  const maintenant = () => Date.now();
  const minutesDepart = Math.min(JOUR_MAX_MIN, Math.floor(dureeSeanceS(cRef.current, ouverture) / 60));

  const surDuree = useCallback((min: number) => {
    appliquer(avecDuree(cRef.current, min, maintenant()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roues = useRef({ ecart: 0, h: 0, m: 0 });
  const surDebut = (patch: Partial<typeof roues.current>) => {
    roues.current = { ...roues.current, ...patch };
    const now = maintenant();
    const voulu = debutDepuisRoues(roues.current.ecart, roues.current.h, roues.current.m, now);
    appliquer(avecDebut(cRef.current, voulu, now));
  };
  const choisirOnglet = (o: Onglet) => {
    if (o === "debut") {
      const d = parties(cRef.current.debut);
      roues.current = { ecart: ecartJours(cRef.current.debut, maintenant()), h: d.h, m: d.min };
    }
    setOnglet(o);
  };

  const { reglages, regler } = useApp();
  const pause = enPause(c);
  const basculer = () => appliquer(pause ? reprendre(cRef.current, maintenant()) : mettreEnPause(cRef.current, maintenant()), true);

  return (
    <Feuille
      visible={visible}
      onFermer={fermer}
      titre={t("seance.duree.titre")}
      glisserContenu={false}
      pied={<Bouton libelle={pause ? t("seance.duree.reprendre") : t("seance.duree.pause")} variante={pause ? "primaire" : "tonal"} large onPress={basculer} />}
    >
      <TextInput
        maxFontSizeMultiplier={POLICE_MAX}
        value={texte}
        onChangeText={setTexte}
        onBlur={validerTitre}
        onEndEditing={validerTitre}
        onFocus={() => (titreEcrit.current = false)}
        placeholder={routineNom ?? t("seance.seance.titreDefaut")}
        placeholderTextColor={couleurs.t3}
        cursorColor={couleurs.action}
        returnKeyType="done"
        blurOnSubmit
        accessibilityLabel={t("seance.duree.titreSeance")}
        style={[typo.saisie, styles.titre, { fontFamily: "Inter-Regular", color: couleurs.t1, backgroundColor: couleurs.s2 }]}
      />
      <View style={styles.entete}>
        <Texte variante="titreFort" style={{ fontVariant: ["tabular-nums"] }}>
          <ChronoSeance c={c} />
        </Texte>
        <Texte variante="meta" couleur="t3">
          {pause ? t("seance.duree.enPause") : dateSeance(c.debut)}
        </Texte>
      </View>
      <Segmente
        options={[
          { valeur: "duree", libelle: t("seance.edition.duree") },
          { valeur: "debut", libelle: t("seance.duree.debut") },
        ]}
        valeur={onglet}
        onChange={choisirOnglet}
      />
      {onglet === "duree" ? (
        <RoueDuree
          libelle={t("seance.duree.titre")}
          valeur={minutesDepart}
          onChange={surDuree}
          valeurs={MINUTES}
          decoupe={(v) => dureeMinutesTexte(v)}
          lue={dureeMinutesLue}
          repere={(v) => v > 0 && v % 60 === 0}
        />
      ) : (
        <View style={styles.roues}>
          <View style={{ flex: 2.4 }}>
            <RoueDuree libelle={t("seance.duree.jourDebut")} valeur={roues.current.ecart} onChange={(v) => surDebut({ ecart: v })} valeurs={JOURS} decoupe={(v) => ATTENUE(libelleJour(v, ouverture))} lue={(v) => libelleJour(v, ouverture)} traits={false} />
          </View>
          <View style={{ flex: 1 }}>
            <RoueDuree libelle={t("seance.duree.heureDebut")} valeur={roues.current.h} onChange={(v) => surDebut({ h: v })} valeurs={HEURES} decoupe={(v) => ATTENUE(deuxChiffres(v))} lue={(v) => tp("seance.duree.heures", v)} traits={false} />
          </View>
          <Texte variante="saisie" couleur="t3" style={styles.deuxPoints}>
            :
          </Texte>
          <View style={{ flex: 1 }}>
            <RoueDuree libelle={t("seance.duree.minutesDebut")} valeur={roues.current.m} onChange={(v) => surDebut({ m: v })} valeurs={MINUTES_HEURE} decoupe={(v) => ATTENUE(deuxChiffres(v))} lue={(v) => tp("seance.duree.minutes", v)} traits={false} />
          </View>
        </View>
      )}
      {onglet === "debut" ? (
        <Texte variante="meta" couleur="t3" style={{ textAlign: "center" }}>
          {t("seance.duree.debutLe", { date: dateSeance(c.debut) })}
        </Texte>
      ) : null}
      <GroupeReglages>
        <LigneReglage libelle={t("profil.ecranAllume")} interrupteur={{ valeur: reglages.ecranAllume, onChange: (v) => regler({ ecranAllume: v }) }} onPress={() => regler({ ecranAllume: !reglages.ecranAllume })} />
      </GroupeReglages>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  titre: { height: 48, borderRadius: rayon.l, paddingHorizontal: espace.l },
  entete: { alignItems: "center", gap: 2, paddingVertical: espace.s },
  roues: { flexDirection: "row", alignItems: "center", gap: espace.xs },
  deuxPoints: { width: 12, textAlign: "center" },
});
