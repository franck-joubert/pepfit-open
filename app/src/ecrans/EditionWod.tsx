import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ajouterExerciceARoutine, auTemps, definirCibleSerie, formatEnRounds, FORMATS, modifierRoutine, modifierTypeRoutine, retirerLigneDeRoutine, supprimerRoutine,
  VALEUR_DEFAUT, vocabulaire, type FormatWod, type LigneRoutineDetail, type RoutineDetail,
} from "../db";
import { minuscule, t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { duree as dureeAnim } from "../theme/mouvement";
import { espace, police, POLICE_MAX, rayon } from "../theme/typo";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { Bouton } from "../ui/Bouton";
import { BoutonIcone } from "../ui/Cadre";
import { ListeDesintegrable } from "../ui/Desintegration";
import { Feuille, Groupe } from "../ui/Feuille";
import { GlisserSupprimer } from "../ui/GlisserSupprimer";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { Picto } from "../ui/Picto";
import { RoueDuree } from "../ui/RoueDuree";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { dureeCourte, nombre, tempsTexte } from "./format";
import { demanderExercices } from "./selection";

// Éditeur d'un WOD (planche idee-programmes, écran « WOD », 28/10) : même programme, même table et même séance qu'en
// musculation ; seuls les mots et la forme changent. Le nom par défaut (« Nouveau WOD ») arrive sélectionné ; le format
// (AMRAP, EMOM, For time, Rounds) se choisit au segmenté et se règle à la roue (durée, temps limite ou rounds) ; chaque
// mouvement a ses répétitions (une série de programme, réglée à la roue). Chaque geste est enregistré tout de suite ; « OK »
// valide le nom et ferme. Un mouvement se retire d'un glissé vers la gauche, « … · Annuler » 8 s.

const DELAI_ANNULER_MS = 8000;
const MINUTES = Array.from({ length: 90 }, (_, i) => i + 1);
const ROUNDS = Array.from({ length: 50 }, (_, i) => i + 1);
const REPS = Array.from({ length: 200 }, (_, i) => i + 1);
/** Temps d'un mouvement au temps (bain froid, boxe, gainage…) : 5 s à 5 min de 5 en 5, puis par 30 s jusqu'à 10 min, puis par minute jusqu'à 1 h. */
const DUREES = [
  ...Array.from({ length: 60 }, (_, i) => (i + 1) * 5),
  ...Array.from({ length: 10 }, (_, i) => 330 + i * 30),
  ...Array.from({ length: 50 }, (_, i) => 660 + i * 60),
];
const PLEIN = (s: string) => ({ attenue: "", plein: s });

type Reglage = { quoi: "format" } | { quoi: "reps" | "duree"; ligne: LigneRoutineDetail } | null;

export function EditionWod({ r, nouvelle, recharger }: { r: RoutineDetail; nouvelle: boolean; recharger: () => Promise<unknown> }) {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const v = vocabulaire(r.type);
  const [nom, setNom] = useState(r.nom);
  const champ = useRef<TextInputInstance>(null);
  const [reglage, setReglage] = useState<Reglage>(null);
  const [brouillon, setBrouillon] = useState(0);
  const format: FormatWod = r.format ?? "amrap";
  const valeur = r.formatValeur ?? VALEUR_DEFAUT[format];
  const lignes = r.blocs.flatMap((b) => b.lignes);

  // Nouveau WOD : le nom proposé arrive sélectionné, clavier ouvert, pour être remplacé d'un geste (planche).
  useEffect(() => {
    if (!nouvelle) return;
    const id = setTimeout(() => champ.current?.focus(), dureeAnim.feuille);
    return () => clearTimeout(id);
  }, [nouvelle]);

  const faire = (p: Promise<unknown>) => p.then(recharger).catch(console.error);

  // Mouvement glissé : il quitte la liste tout de suite, la base attend que « Annuler » ait expiré.
  const [enAttente, setEnAttente] = useState<LigneRoutineDetail | null>(null);
  const attente = useRef<{ id: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const confirmer = () => {
    const a = attente.current;
    if (!a) return Promise.resolve();
    clearTimeout(a.minuterie);
    attente.current = null;
    return retirerLigneDeRoutine(db, a.id);
  };
  useEffect(
    () => () => {
      const a = attente.current;
      if (a) clearTimeout(a.minuterie);
      if (a) retirerLigneDeRoutine(db, a.id).catch(console.error);
    },
    [db],
  );
  const retirer = (l: LigneRoutineDetail) => {
    faire(confirmer());
    const minuterie = setTimeout(() => {
      faire(confirmer());
      setEnAttente(null);
    }, DELAI_ANNULER_MS);
    attente.current = { id: l.id, minuterie };
    setEnAttente(l);
  };
  const annuler = () => {
    if (attente.current) clearTimeout(attente.current.minuterie);
    attente.current = null;
    setEnAttente(null);
  };
  const visibles = enAttente ? lignes.filter((l) => l.id !== enAttente.id) : lignes;

  const nomFinal = () => nom.trim() || t("exercices.routine.sansNom");
  const ok = async () => {
    await confirmer();
    await modifierRoutine(db, r.id, { nom: nomFinal() });
    router.back();
  };
  const fermer = async () => {
    await confirmer();
    if (nouvelle && visibles.length === 0) await supprimerRoutine(db, r.id);
    else await modifierRoutine(db, r.id, { nom: nomFinal() });
    router.back();
  };

  const choisirFormat = (f: FormatWod) => {
    if (f === format) return;
    // Même unité (minutes) : la valeur suit ; minutes ↔ rounds : la valeur par défaut du nouveau format.
    const garde = formatEnRounds(f) === formatEnRounds(format) && r.formatValeur != null;
    faire(modifierTypeRoutine(db, r.id, { format: f, formatValeur: garde ? r.formatValeur : VALEUR_DEFAUT[f] }));
  };
  const ajouter = () => {
    demanderExercices(
      lignes.map((l) => l.exercice_id),
      (ids) =>
        faire(
          (async () => {
            for (const e of ids) await ajouterExerciceARoutine(db, r.id, e, { nbSeries: 1, reposS: 0 });
          })(),
        ),
    );
    router.push({ pathname: "/pick", params: { type: r.type } });
  };

  const enRounds = formatEnRounds(format);
  const libelleReglage = t(enRounds ? "programmes.reglage.rounds" : format === "fortime" ? "programmes.reglage.cap" : "programmes.reglage.duree");
  const texteReglage = enRounds ? nombre(valeur) : dureeCourte(valeur);
  const ouvrirFormat = () => {
    setBrouillon(enRounds ? valeur : Math.max(1, Math.round(valeur / 60)));
    setReglage({ quoi: "format" });
  };
  // Un mouvement au temps (retour du 30/10 : le bain froid, la boxe demandaient des répétitions) : un temps.
  const ouvrirReps = (l: LigneRoutineDetail) => {
    const temps = auTemps(l.exercice.nature);
    setBrouillon(temps ? (l.cibles[0]?.duree_s ?? 60) : (l.cibles[0]?.reps ?? 10));
    setReglage({ quoi: temps ? "duree" : "reps", ligne: l });
  };
  const valider = () => {
    const g = reglage;
    setReglage(null);
    if (!g) return;
    if (g.quoi === "format") faire(modifierTypeRoutine(db, r.id, { formatValeur: enRounds ? brouillon : brouillon * 60 }));
    else if (g.quoi === "duree") faire(definirCibleSerie(db, g.ligne.id, 0, { dureeS: brouillon }));
    else faire(definirCibleSerie(db, g.ligne.id, 0, { reps: brouillon }));
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      {/* En-tête des sous-pages (planche) : 64 de haut, ← en t1, titre 20 / 600 (le mot du type), « OK » tonal. */}
      <View style={styles.entete}>
        <BoutonIcone nom="back" couleur={couleurs.t1} libelle={t("ui.retour")} onPress={() => fermer().catch(console.error)} />
        <Texte variante="titre" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, marginLeft: 2 }}>
          {t(v.modele)}
        </Texte>
        <Appui
          accessibilityRole="button"
          accessibilityLabel={t("programmes.ok")}
          onPress={() => ok().catch(console.error)}
          style={({ pressed }) => [styles.ok, { backgroundColor: pressed ? couleurs.s3 : couleurs.s2 }]}
        >
          <Texte style={[styles.okTexte, { color: couleurs.t1 }]}>{t("programmes.ok")}</Texte>
        </Appui>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: espace.s, paddingBottom: 96 + bas }}>
        <Pressable onPress={() => champ.current?.focus()} style={[styles.nom, { backgroundColor: couleurs.s1 }]}>
          <TextInput
            maxFontSizeMultiplier={POLICE_MAX}
            ref={champ}
            value={nom}
            onChangeText={setNom}
            selectTextOnFocus
            maxLength={60}
            returnKeyType="done"
            cursorColor={couleurs.action}
            selectionColor={`${couleurs.action}4D`}
            accessibilityLabel={t("programmes.nomChamp")}
            style={[styles.nomTexte, { color: couleurs.t1 }]}
          />
          <Icone nom="crayon" couleur={couleurs.t3} taille={18} />
        </Pressable>
        <Segmente<FormatWod>
          options={FORMATS.map((f) => ({ valeur: f, libelle: t(`programmes.format.${f}`) }))}
          valeur={format}
          onChange={choisirFormat}
          style={[styles.segmente, { backgroundColor: couleurs.s1 }]}
        />
        <View style={[styles.groupe, { backgroundColor: couleurs.s1 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${libelleReglage} : ${texteReglage}`}
            onPress={ouvrirFormat}
            style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.s2 }]}
          >
            <Icone nom={enRounds ? "repeat" : "horloge"} couleur={couleurs.t2} taille={20} />
            <Texte style={[styles.ligneTitre, { color: couleurs.t1, flex: 1 }]}>{libelleReglage}</Texte>
            <Texte style={[styles.valeur, { color: couleurs.t1 }]}>{texteReglage}</Texte>
            <View style={{ marginRight: 10 }}>
              <Icone nom="right" couleur={couleurs.t3} taille={16} />
            </View>
          </Pressable>
        </View>
        <Texte variante="entete" couleur="t3" style={styles.lib}>
          {t(v.contenu)}
        </Texte>
        {/* Le groupe reste là tant qu'un mouvement sort : le dernier supprimé se désintègre aussi. */}
        <ListeDesintegrable
          liste={visibles}
          cleDe={(l) => l.id}
          autour={(e) => <View style={[styles.groupe, { backgroundColor: couleurs.s1 }]}>{e}</View>}
          rendu={(l) => (
            <GlisserSupprimer fondContenu={couleurs.s1} onSupprimer={() => retirer(l)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(auTemps(l.exercice.nature) ? "programmes.dureeDe" : "programmes.repsDe", { nom: l.exercice.nom })}
                onPress={() => ouvrirReps(l)}
                style={({ pressed }) => [
                  styles.ligne,
                  styles.mouvement,
                  visibles.indexOf(l) > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
                  pressed && { backgroundColor: couleurs.s2 },
                ]}
              >
                <Picto slug={l.exercice.slug} nom={l.exercice.nom} taille={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Texte numberOfLines={1} style={[styles.ligneTitre, { color: couleurs.t1 }]}>
                    {l.exercice.nom}
                  </Texte>
                  {l.cibles[0]?.kg ? (
                    <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ marginTop: 2 }}>
                      {nombre(l.cibles[0].kg)} kg
                    </Texte>
                  ) : null}
                </View>
                {auTemps(l.exercice.nature) ? (
                  <Texte style={[styles.valeur, { color: l.cibles[0]?.duree_s ? couleurs.t1 : couleurs.t3 }]}>{l.cibles[0]?.duree_s ? tempsTexte(l.cibles[0].duree_s) : "–"}</Texte>
                ) : (
                  <Texte style={[styles.valeur, { color: l.cibles[0]?.reps ? couleurs.t1 : couleurs.t3 }]}>{l.cibles[0]?.reps ? nombre(l.cibles[0].reps) : "–"}</Texte>
                )}
              </Pressable>
            </GlisserSupprimer>
          )}
        />
        <Appui
          accessibilityRole="button"
          onPress={ajouter}
          style={({ pressed }) => [styles.ajouter, { borderColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s2 }]}
        >
          <Icone nom="plus" couleur={couleurs.t2} taille={20} />
          <Texte style={[styles.ajouterTexte, { color: couleurs.t2 }]}>{t(v.ajouterContenu)}</Texte>
        </Appui>
      </ScrollView>
      {enAttente ? <BandeauAnnuler texte={t("accueil.entrainement.routineSupprimee", { nom: enAttente.exercice.nom })} bas={bas + espace.s} onAnnuler={annuler} /> : null}
      <Feuille
        visible={reglage != null}
        onFermer={() => setReglage(null)}
        titre={reglage?.quoi === "reps" || reglage?.quoi === "duree" ? reglage.ligne.exercice.nom : libelleReglage}
        glisserContenu={false}
        pied={<Bouton libelle={t("ui.valider")} variante="primaire" large onPress={valider} />}
      >
        <Groupe>
          {reglage?.quoi === "duree" ? (
            <RoueDuree key={`d-${reglage.ligne.id}`} libelle={t("programmes.reglage.duree")} valeur={brouillon} onChange={setBrouillon} valeurs={DUREES} traits={false} />
          ) : reglage?.quoi === "reps" ? (
            <RoueDuree key={`r-${reglage.ligne.id}`} libelle={t("exercices.routine.repetitions")} valeur={brouillon} onChange={setBrouillon} valeurs={REPS} decoupe={(n) => PLEIN(String(n))} lue={String} traits={false} unite={t("programmes.uniteReps")} />
          ) : reglage?.quoi === "format" ? (
            enRounds ? (
              <RoueDuree key="rounds" libelle={libelleReglage} valeur={brouillon} onChange={setBrouillon} valeurs={ROUNDS} decoupe={(n) => PLEIN(String(n))} lue={String} traits={false} unite={minuscule(t("programmes.reglage.rounds"))} />
            ) : (
              <RoueDuree key="minutes" libelle={libelleReglage} valeur={brouillon} onChange={setBrouillon} valeurs={MINUTES} decoupe={(n) => PLEIN(String(n))} lue={String} traits={false} unite="min" />
            )
          ) : null}
        </Groupe>
      </Feuille>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  entete: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: espace.xs, paddingRight: espace.s },
  ok: { height: 44, paddingHorizontal: 18, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  okTexte: { fontFamily: police.semibold, fontSize: 15 },
  nom: { height: 56, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: espace.m, paddingRight: espace.s, marginBottom: espace.m },
  nomTexte: { flex: 1, fontFamily: police.semibold, fontSize: 20, padding: 0 },
  segmente: { marginBottom: espace.m },
  groupe: { borderRadius: rayon.l, overflow: "hidden", marginBottom: espace.m },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 6, paddingLeft: espace.l, paddingRight: 6 },
  mouvement: { paddingLeft: espace.m },
  ligneTitre: { fontFamily: police.medium, fontSize: 15 },
  valeur: { fontFamily: police.semibold, fontSize: 15, minWidth: 52, paddingHorizontal: espace.s, textAlign: "right" },
  lib: { marginTop: espace.xs, marginBottom: espace.s, marginHorizontal: espace.xs },
  ajouter: { height: 56, borderRadius: rayon.l, borderWidth: 1, borderStyle: "dashed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  ajouterTexte: { fontFamily: police.medium, fontSize: 15 },
});
