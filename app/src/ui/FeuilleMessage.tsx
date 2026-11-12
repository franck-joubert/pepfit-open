import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Icone } from "./Icone";
import { espace } from "../theme/typo";
import { Feuille, Groupe, Option } from "./Feuille";
import { Texte } from "./Texte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

export interface MessageFeuille {
  titre: string;
  texte: string;
  /** Réussite (service connecté) : un check vert en tête de la feuille. */
  succes?: boolean;
  /** Action proposée avant « Fermer » (ex. Réessayer) ; la feuille se ferme d'abord. */
  action?: { libelle: string; onPress: () => void };
}

/** Message d'information ou d'erreur dans la feuille du bas (remplace la boîte d'alerte native) : un titre, une phrase, « Fermer ». */
export function FeuilleMessage({ message, onFermer }: { message: MessageFeuille | null; onFermer: () => void }) {
  useLangue();
  return (
    <Feuille visible={message != null} onFermer={onFermer} titre={message?.titre}>
      {message?.succes ? <CheckVert /> : null}
      <Texte variante="corps" couleur="t2" style={styles.texte}>
        {message?.texte}
      </Texte>
      <Groupe>
        {message?.action ? (
          <Option
            premier
            libelle={message.action.libelle}
            onPress={() => {
              const a = message.action!;
              onFermer();
              a.onPress();
            }}
          />
        ) : null}
        <Option premier={!message?.action} libelle={t("ui.fermer")} onPress={onFermer} />
      </Groupe>
    </Feuille>
  );
}

/** Check vert dans un rond teinté (« valide » du thème), 44 px. */
function CheckVert() {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.check, { backgroundColor: couleurs.valideVoile }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icone nom="check" couleur={couleurs.valide} taille={24} epaisseur={2.25} />
    </View>
  );
}

const styles = StyleSheet.create({
  texte: { fontSize: 14, marginBottom: espace.m },
  check: { width: 44, height: 44, borderRadius: 22, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: espace.m },
});

// Erreurs d'écriture (audit du 28/10, n° 18) : une écriture ratée (ajout, suppression, export, sauvegarde) le dit dans la
// feuille du bas au lieu de se perdre dans le journal. Une seule feuille pour toute l'appli (FeuilleErreur, montée avec le
// menu) ; la dernière erreur remplace la précédente.
export type ActionRatee = "enregistrer" | "supprimer" | "exporter" | "sauvegarder" | "partager";

let erreur: MessageFeuille | null = null;
const abonnes = new Set<() => void>();
const montrer = (m: MessageFeuille | null) => {
  erreur = m;
  abonnes.forEach((f) => f());
};
const sAbonner = (f: () => void) => {
  abonnes.add(f);
  return () => void abonnes.delete(f);
};

/** Pour un `.catch` : journalise l'erreur et la montre (« Pas enregistré · Réessaie dans un instant. »). */
export const signalerErreur =
  (action: ActionRatee = "enregistrer") =>
  (e: unknown): void => {
    console.error(e);
    montrer({ titre: t(`ui.erreur.${action}`), texte: t("ui.erreur.texte") });
  };

/** La feuille des erreurs signalées, à monter une fois au-dessus de la pile. */
export function FeuilleErreur() {
  const m = useSyncExternalStore(sAbonner, () => erreur);
  return <FeuilleMessage message={m} onFermer={() => montrer(null)} />;
}
