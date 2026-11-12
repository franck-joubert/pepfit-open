import { Fragment } from "react";
import { StyleSheet, Text } from "react-native";
import { police, POLICE_MAX } from "../theme/typo";

/**
 * Règle de « pep » (planche sport-programmes-routines v2, retour 6, validée le 29/10) : quand pepfit est un titre ou une mention
 * de marque (titre de page, en-tête de carte, « Programme pepfit » sous le titre d'une fiche), « pep » s'écrit en Inter
 * semi-grasse italique et « fit » droit, même taille et même couleur ; dans le texte courant (phrase, aide, bouton,
 * notification), pepfit reste droit : ne pas utiliser ce composant. Une seule graisse italique embarquée (600, celle des
 * titres) : le texte autour doit être en semi-gras. À poser dans un Texte : il en hérite la taille et la couleur.
 */
export function AvecPep({ texte }: { texte: string }) {
  const morceaux = texte.split(/(pepfit)/);
  if (morceaux.length === 1) return <>{texte}</>;
  return (
    <>
      {morceaux.map((m, i) =>
        m === "pepfit" ? (
          <Fragment key={i}>
            <Text maxFontSizeMultiplier={POLICE_MAX} style={styles.pep}>pep</Text>fit
          </Fragment>
        ) : (
          m
        ),
      )}
    </>
  );
}

const styles = StyleSheet.create({ pep: { fontFamily: police.semiboldItalique } });
