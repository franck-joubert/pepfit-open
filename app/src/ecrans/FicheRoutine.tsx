import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dureeSeance } from "../boutique/calculs";
import { langue, tx } from "../boutique/donnees";
import type { RoutineBoutique } from "../boutique/modele";
import { Barres, Vignette } from "../boutique/ui";
import { ajouterProgrammation, ajouterRoutineBoutique, lireReglagesPlanif } from "../db";
import { minusculeInitiale, t } from "../i18n/index";
import { texteRegle } from "../i18n/planif-saisie";
import { useLangue } from "../i18n/useLangue";
import { rafraichirRappels } from "../natif/rappels";
import { useTheme } from "../theme";
import { espace, police } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille } from "../ui/Feuille";
import { signalerErreur } from "../ui/FeuilleMessage";
import { Texte } from "../ui/Texte";
import { commencer } from "./commencer";
import { useApp, useCharge } from "./contexte";
import { BarreHaut, BasFixe, Carte, ContenuSeance, passeLeVisuel, SousTitre } from "./FicheProgramme";
import { ChampProgrammation } from "./FeuillesPlanif";
import { dureeCourte } from "./format";
import { jourDe } from "./planif-donnees";

// Fiche d'une routine de la boutique (rayon « Routines », lexique du 29/10 ; hors planche, faite des briques de la fiche
// programme a7) : visuel, titre, description, quatre chiffres (durée, exercices ou étapes, niveau, matériel),
// avertissement, puis la routine elle-même. En bas : « Planifier » et « Démarrer » ; l'un ou l'autre l'ajoute à mes routines
// (une seule fois : on retrouve la même si on revient).

export function FicheRoutine({ r }: { r: RoutineBoutique }) {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const haut = useSafeAreaInsets().top;
  const [planifier, setPlanifier] = useState(false);
  const [planifiee, setPlanifiee] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [colle, setColle] = useState(false);
  const [reglages] = useCharge((db) => lireReglagesPlanif(db), []);
  const p = reglages ? { aujourdhui: jourDe(Date.now()), heureDefaut: reglages.heureDefaut } : null;

  // Une routine tient souvent en un écran et demi : près du bas avant d'avoir passé le visuel, la barre devient pleine
  // aussi (sinon le rond du retour reste posé sur le chiffre). Fin de geste et fin d'élan comptent : le dernier évènement
  // de défilement n'arrive pas toujours pile au bout.
  const defiler = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const bas = contentSize.height - layoutMeasurement.height;
    const c = passeLeVisuel(contentOffset.y, haut) || (contentOffset.y > 24 && contentOffset.y >= bas - 24);
    if (c !== colle) setColle(c);
  };

  const demarrer = async () => {
    if (enCours) return;
    setEnCours(true);
    try {
      await commencer(db, await ajouterRoutineBoutique(db, r, langue()));
    } catch (e) {
      signalerErreur()(e);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        scrollEventThrottle={32}
        onScroll={defiler}
        onScrollEndDrag={defiler}
        onMomentumScrollEnd={defiler}
      >
        <Vignette p={r} hauteur={340} gros={64} rayon={28} heros pastille={tx(r.lieuCourt)} pastilleHaut={haut + 64} />
        <View style={styles.ft}>
          <Texte accessibilityRole="header" style={styles.titre}>
            {tx(r.nom)}
          </Texte>
          <Texte style={[styles.description, { color: couleurs.t2 }]}>{tx(r.description)}</Texte>
        </View>
        <Chiffres r={r} />
        {r.avertissement ? <Carte icone="alerte" titre={t("boutique.fiche.avertissement")} texte={tx(r.avertissement)} fort /> : null}
        {planifiee ? (
          <Carte icone="check" texte={planifiee} />
        ) : (
          <Carte icone="routine" titre={t("boutique.r.mesRoutines")} texte={t("boutique.r.mesRoutinesTexte")} />
        )}
        <SousTitre titre={t("boutique.r.contenu")} />
        <ContenuSeance p={r} s={r.seance} />
        {r.seance.note ? <Texte style={[styles.paragraphe, { color: couleurs.t2 }]}>{tx(r.seance.note)}</Texte> : null}
        <Carte icone="info" titre={t("boutique.fiche.relecture")} texte={t("boutique.r.relectureTexte")} neutre />
      </ScrollView>
      <BarreHaut colle={colle} titre={tx(r.nom)} />
      <BasFixe>
        <View style={styles.boutons}>
          <View style={{ flex: 1 }}>
            <Bouton large libelle={t("boutique.r.planifier")} onPress={() => setPlanifier(true)} />
          </View>
          <View style={{ flex: 1.4 }}>
            <BoutonPrincipal libelle={t("boutique.r.demarrer")} icone="play" desactive={enCours} onPress={() => void demarrer()} />
          </View>
        </View>
      </BasFixe>
      <Feuille visible={planifier && p != null} onFermer={() => setPlanifier(false)} titre={t("planif.programmerNom", { nom: tx(r.nom) })}>
        {p ? (
          <ChampProgrammation
            p={p}
            autoFocus
            aide
            placeholder={t("planif.exemple")}
            onAjouter={(_texte, a) => {
              setPlanifier(false);
              (async () => {
                const id = await ajouterRoutineBoutique(db, r, langue());
                const quand = texteRegle(a.regle, langue());
                await ajouterProgrammation(db, id, quand, a.regle);
                // « Tous les lundis à 18h » au milieu d'une phrase : sans majuscule.
                setPlanifiee(t("boutique.r.planifiee", { nom: tx(r.nom), quand: minusculeInitiale(quand) }));
                // La routine est planifiée : un rappel pas reprogrammé n'est pas une écriture ratée, il va au journal.
                await rafraichirRappels(db, { demander: true }).catch((e: unknown) => console.warn("[rappels]", e));
              })().catch(signalerErreur());
            }}
          />
        ) : (
          <View />
        )}
      </Feuille>
    </View>
  );
}

/** Durée, exercices (ou étapes en endurance), niveau, matériel : les quatre chiffres de la fiche programme. */
function Chiffres({ r }: { r: RoutineBoutique }) {
  const { couleurs } = useTheme();
  const endurance = ["course", "velo", "natation"].includes(r.type);
  const cases: { valeur: ReactNode; legende: string }[] = [
    { valeur: dureeCourte(dureeSeance(r.seance)), legende: t("boutique.r.duree") },
    { valeur: String(r.seance.blocs.length), legende: t(endurance ? "boutique.r.etapes" : "boutique.r.exercices") },
    {
      valeur: (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Barres n={r.niveau} couleur={couleurs.t1} />
          <Texte style={styles.chiffre}>{r.niveau === 2 ? t("boutique.niveauCourt.2") : t(`boutique.niveau.${r.niveau}` as "boutique.niveau.1")}</Texte>
        </View>
      ),
      legende: t("boutique.fiche.niveau"),
    },
    { valeur: tx(r.materiel), legende: t("boutique.fiche.materiel") },
  ];
  return (
    <View style={[styles.chiffres, { backgroundColor: couleurs.s1 }]}>
      {cases.map((c, i) => (
        <View key={i} style={[styles.case, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: couleurs.line2 }]}>
          {typeof c.valeur === "string" ? (
            <Texte numberOfLines={1} adjustsFontSizeToFit style={styles.chiffre}>
              {c.valeur}
            </Texte>
          ) : (
            c.valeur
          )}
          <Texte numberOfLines={1} style={{ fontSize: 11.5, color: couleurs.t3, marginTop: 3 }}>
            {c.legende}
          </Texte>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ft: { paddingHorizontal: espace.l, paddingTop: 20 },
  titre: { fontFamily: police.semibold, fontSize: 24, lineHeight: 30 },
  description: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  chiffres: { flexDirection: "row", marginHorizontal: 16, marginTop: 20, borderRadius: 14, paddingVertical: 14 },
  case: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  chiffre: { fontFamily: police.semibold, fontSize: 17 },
  paragraphe: { fontSize: 14, lineHeight: 21, paddingHorizontal: espace.l, paddingTop: espace.m },
  boutons: { flexDirection: "row", alignItems: "center", gap: 10 },
});
