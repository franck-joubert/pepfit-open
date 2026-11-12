import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput } from "react-native";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, typo } from "../theme/typo";
import { Icone, type NomIcone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { titreFinal, titreValable } from "./edition-seance";
import { t } from "../i18n/index";
import { dureeCourte, heure } from "./format";
import { dureeMin, ecartJourRoue, instantAvecJour, type Champ } from "./horaires";

// Édition d'une séance, commune à « Terminer la séance » et à la séance passée : titre sur place, lignes Début, Fin et Durée.

/** Pause de frappe avant d'enregistrer le nom (la sortie du champ enregistre aussitôt). */
const SAISIE_MS = 500;

/**
 * Nom de la séance, modifiable sur place (planche seance-duree, demande d'Alex du 29/10) : au repos, le crayon dit qu'il
 * se touche ; au toucher, le nom devient un champ, curseur à la fin (pas tout sélectionné), sans feuille ni bouton Valider ;
 * il s'enregistre pendant la frappe et à la sortie du champ. Effacé, il montre et reprend le nom par défaut (`defaut` :
 * routine, sport, sinon « Séance ») ; un titre sans lettre ni chiffre (« - ») vaut un titre vide.
 */
export function TitreEditable({
  titre,
  routineNom,
  onChanger,
}: {
  titre: string | null;
  /** Nom par défaut : la routine, ou le sport d'une course. */
  routineNom: string | null;
  onChanger: (titre: string | null) => void;
}) {
  const { couleurs } = useTheme();
  const defaut = routineNom ?? t("seance.seance.titreDefaut");
  const affiche = titreValable(titre) ?? defaut;
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(affiche);
  // Curseur posé à la fin à l'ouverture, puis rendu au clavier dès que la saisie le déplace.
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const dernier = useRef<string | null>(titreValable(titre));
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (minuterie.current) clearTimeout(minuterie.current);
  }, []);

  const enregistrer = (saisie: string) => {
    const final = titreFinal(saisie);
    const nouveau = final === routineNom ? null : final;
    if (nouveau === dernier.current) return;
    dernier.current = nouveau;
    onChanger(nouveau);
  };
  const changer = (saisie: string) => {
    setTexte(saisie);
    setSelection(undefined);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => enregistrer(saisie), SAISIE_MS);
  };
  const sortir = () => {
    if (minuterie.current) clearTimeout(minuterie.current);
    enregistrer(texte);
    setEdition(false);
  };

  if (!edition) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("seance.edition.renommer", { nom: affiche })}
        onPress={() => {
          const depart = titreValable(titre) ?? defaut;
          setTexte(depart);
          setSelection({ start: depart.length, end: depart.length });
          setEdition(true);
        }}
        style={styles.titre}
      >
        <Texte variante="titreFort" style={{ flexShrink: 1 }}>
          {affiche}
        </Texte>
        <Icone nom="crayon" couleur={couleurs.t3} taille={18} />
      </Pressable>
    );
  }
  return (
    <TextInput
      maxFontSizeMultiplier={POLICE_MAX}
      value={texte}
      onChangeText={changer}
      onSelectionChange={() => setSelection(undefined)}
      selection={selection}
      onSubmitEditing={sortir}
      onBlur={sortir}
      autoFocus
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
      maxLength={60}
      placeholder={defaut}
      placeholderTextColor={couleurs.t3}
      cursorColor={couleurs.action}
      selectionColor={couleurs.action}
      accessibilityLabel={t("seance.edition.nom")}
      style={[typo.titreFort, styles.titre, { color: couleurs.t1, padding: 0, borderBottomWidth: 1.5, borderBottomColor: couleurs.t3 }]}
    />
  );
}

/**
 * Lignes « Début », « Fin » et « Durée » (planche Effort, D6), chacune ouvre la feuille Horaires sur sa ligne : les deux autres suivent,
 * les séries gardent leur heure. `fin` est celle de la séance, ou l'instant présent tant qu'elle court.
 */
export function LignesHoraires({ debut, fin, onOuvrir }: { debut: number; fin: number; onOuvrir: (champ: Champ) => void }) {
  const maintenant = Date.now();
  const memeJour = ecartJourRoue(debut, maintenant) === ecartJourRoue(fin, maintenant);
  return (
    <>
      <LigneModifiable icone="cal" libelle={t("horaires.debut")} valeur={instantAvecJour(debut, maintenant)} onPress={() => onOuvrir("debut")} />
      <LigneModifiable icone="timer" libelle={t("horaires.fin")} valeur={memeJour ? heure(fin) : instantAvecJour(fin, maintenant)} onPress={() => onOuvrir("fin")} />
      <LigneModifiable icone="timer" libelle={t("horaires.duree")} valeur={dureeCourte(dureeMin({ debut, fin }) * 60)} onPress={() => onOuvrir("duree")} />
    </>
  );
}

function LigneModifiable({ icone, libelle, valeur, onPress }: { icone: NomIcone; libelle: string; valeur: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("seance.edition.modifierLigne", { libelle, valeur })}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, { borderTopColor: couleurs.line }, pressed && { backgroundColor: couleurs.s2 }]}
    >
      <Icone nom={icone} couleur={couleurs.t2} taille={24} />
      <Texte variante="saisie" style={{ fontFamily: "Inter-Regular", flex: 1 }}>
        {libelle}
      </Texte>
      <Texte variante="saisie" couleur="t2" style={{ fontFamily: "Inter-Regular" }}>
        {valeur}
      </Texte>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titre: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: espace.s, marginTop: espace.xl - espace.s },
  ligne: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.l, borderTopWidth: StyleSheet.hairlineWidth },
});
