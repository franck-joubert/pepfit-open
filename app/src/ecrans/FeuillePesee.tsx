import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { Pesee } from "../db";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, typo } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { RoueDuree } from "../ui/RoueDuree";
import { Texte } from "../ui/Texte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { fixe } from "./composition-vue";
import { anneeDe, jourMois, jourMoisAnnee, nomMoisCourt, versUnite, type Unite } from "./format";
import { datePesee, decomposer, jourPesee, kgSaisi, nbJoursMois, nomOrigine, saisieLocale, saisiePoids, valeursAnnees } from "./poids";
import { useCouleurPartie } from "../ui/ContextePartie";

const MOIS = Array.from({ length: 12 }, (_, i) => i);
const PLEIN = (t: string) => ({ attenue: "", plein: t });

/** Poids en chiffre fort, saisi au clavier décimal dans l'unité des réglages (curseur de la partie). */
export function ChiffrePoids({ texte, onTexte, indice, unite, erreur }: { texte: string; onTexte: (t: string) => void; indice: string; unite: Unite; erreur?: boolean }) {
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  useLangue();
  return (
    <View style={styles.chiffre}>
      <TextInput
        maxFontSizeMultiplier={POLICE_MAX}
        value={texte}
        onChangeText={onTexte}
        keyboardType="decimal-pad"
        placeholder={indice}
        placeholderTextColor={couleurs.t3}
        cursorColor={accent}
        selectionColor={accent}
        accessibilityLabel={unite === "kg" ? t("accueil.poids.poidsCorpsEnKilos") : `${t("accueil.poids.poids")}, ${unite}`}
        style={[typo.chiffreFort, { color: erreur ? couleurs.rate : couleurs.t1, padding: 0, minWidth: 96, textAlign: "center" }]}
      />
      <Texte variante="saisie" couleur="t2">
        {unite}
      </Texte>
    </View>
  );
}

/** Trois roues jour · mois · année ; la roue des jours suit la longueur du mois. `ouverture` remonte les roues à chaque ouverture. */
export function RoueDate({ valeur, onChange, ouverture }: { valeur: number; onChange: (t: number) => void; ouverture: number }) {
  useLangue();
  const maintenant = useRef(Date.now()).current;
  const annees = useRef(valeursAnnees(maintenant)).current;
  const [d, setD] = useState(() => decomposer(valeur));
  const dRef = useRef(d);
  useEffect(() => {
    const v = decomposer(valeur);
    dRef.current = v;
    setD(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverture]);
  const regler = (patch: Partial<typeof d>) => {
    const n = { ...dRef.current, ...patch };
    dRef.current = n;
    setD(n);
    onChange(datePesee(n.jour, n.mois, n.annee, maintenant));
  };
  const nb = nbJoursMois(d.annee, d.mois);
  const jours = Array.from({ length: nb }, (_, i) => i + 1);
  return (
    <View style={styles.roues}>
      <View style={{ flex: 1 }}>
        <RoueDuree
          key={`j-${ouverture}-${nb}`}
          libelle={t("accueil.poids.jour")}
          valeur={Math.min(d.jour, nb)}
          onChange={(v) => regler({ jour: v })}
          valeurs={jours}
          decoupe={(v) => PLEIN(String(v))}
          lue={String}
          traits={false}
        />
      </View>
      <View style={{ flex: 1.5 }}>
        <RoueDuree key={`m-${ouverture}`} libelle={t("accueil.poids.mois")} valeur={d.mois} onChange={(v) => regler({ mois: v })} valeurs={MOIS} decoupe={(v) => PLEIN(nomMoisCourt(v))} lue={nomMoisCourt} traits={false} />
      </View>
      <View style={{ flex: 1 }}>
        <RoueDuree key={`a-${ouverture}`} libelle={t("accueil.poids.annee")} valeur={d.annee} onChange={(v) => regler({ annee: v })} valeurs={annees} decoupe={(v) => PLEIN(String(v))} lue={String} traits={false} />
      </View>
    </View>
  );
}

/** « Date de la pesée » : la roue, « Valider » en bas. Fermer sans valider ne change rien. */
export function FeuilleDatePesee({ visible, valeur, onFermer, onValider }: { visible: boolean; valeur: number; onFermer: () => void; onValider: (t: number) => void }) {
  useLangue();
  const [brouillon, setBrouillon] = useState(valeur);
  const [ouverture, setOuverture] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setBrouillon(valeur);
    setOuverture((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("accueil.poids.titreDate")}
      glisserContenu={false}
      pied={<Bouton libelle={t("accueil.poids.valider")} variante="primaire" large onPress={() => onValider(brouillon)} />}
    >
      <RoueDate valeur={valeur} onChange={setBrouillon} ouverture={ouverture} />
    </Feuille>
  );
}

/** Une pesée existante. Manuelle : poids et date corrigeables, « Supprimer la pesée » en rouge.
 *  Importée : seulement la supprimer (poids et date viennent de la balance). Poids montré et saisi dans l'unité des réglages,
 *  à la virgule de la langue ; enregistré en kg (inchangé s'il n'a pas été retouché : pas d'aller-retour kg / lbs). */
export function FeuillePesee({
  pesee,
  onFermer,
  onEnregistrer,
  onSupprimer,
}: {
  pesee: Pesee | null;
  onFermer: () => void;
  onEnregistrer: (id: string, patch: { kg?: number; date?: number }) => void;
  onSupprimer: (id: string) => void;
}) {
  const { poids: u } = useLangue();
  const [texte, setTexte] = useState("");
  const [depart, setDepart] = useState("");
  const [date, setDate] = useState<number | null>(null);
  const [erreur, setErreur] = useState(false);
  const [ouverture, setOuverture] = useState(0);
  const derniere = useRef(pesee);
  if (pesee) derniere.current = pesee;
  const p = derniere.current;
  useEffect(() => {
    if (!pesee) return;
    const v = saisiePoids(pesee.kg, u);
    setTexte(v);
    setDepart(v);
    setDate(null);
    setErreur(false);
    setOuverture((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pesee]);
  if (!p) return null;
  const manuelle = p.source === "manuel";
  const enregistrer = () => {
    const kg = texte === depart ? p.kg : kgSaisi(texte, u);
    if (kg == null) return setErreur(true);
    onEnregistrer(p.id, { kg, ...(date != null ? { date } : {}) });
  };
  return (
    <Feuille
      visible={pesee != null}
      onFermer={onFermer}
      titre={t("accueil.poids.titrePesee", { date: anneeDe(p.date) === anneeDe(Date.now()) ? jourMois(p.date) : jourMoisAnnee(p.date) })}
      glisserContenu={!manuelle}
      pied={
        <View style={{ gap: espace.s }}>
          {manuelle ? <Bouton libelle={t("accueil.poids.enregistrer")} variante="primaire" large onPress={enregistrer} /> : null}
          <Groupe>
            <Option libelle={t("accueil.poids.supprimerPesee")} icone="trash" danger premier onPress={() => onSupprimer(p.id)} />
          </Groupe>
        </View>
      }
    >
      {manuelle ? (
        <>
          <ChiffrePoids texte={texte} onTexte={(t) => (setTexte(saisieLocale(t)), setErreur(false))} indice={fixe(versUnite(p.kg, u), 1)} unite={u} erreur={erreur} />
          <RoueDate valeur={p.date} onChange={setDate} ouverture={ouverture} />
        </>
      ) : (
        <>
          <View style={styles.chiffre}>
            <Texte variante="chiffreFort">{fixe(versUnite(p.kg, u), 1)}</Texte>
            <Texte variante="saisie" couleur="t2">
              {u}
            </Texte>
          </View>
          <Texte variante="meta" couleur="t3" style={{ textAlign: "center" }}>
            {`${jourPesee(p.date, Date.now())}, ${nomOrigine(p.origine)}`}
          </Texte>
        </>
      )}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  chiffre: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6, paddingVertical: espace.s },
  roues: { flexDirection: "row", gap: 4 },
});
