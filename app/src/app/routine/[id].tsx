import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ajouterExerciceARoutine,
  creerSuperset,
  definirCibleSerie,
  definirReposSuperset,
  definirTypeSerie,
  deplacerLigne,
  disposerRoutine,
  grouperBlocs,
  lireRoutine,
  modifierLigneRoutine,
  definirRirLigne,
  modifierRoutine,
  ordonnerSeriesRoutine,
  restaurerSerieRoutine,
  retirerDuSuperset,
  retirerLigneDeRoutine,
  supprimerSerieRoutine,
  supprimerRoutine,
  type BlocRoutine,
  type ChampSerie,
  type LigneRoutineDetail,
  type RoutineDetail,
  type SerieRoutineRetiree,
  type TypeNote,
  type TypeSerie,
  changerTypeNote,
  ajouterNote,
  modifierNote,
  INFO_NATURE,
  vocabulaire,
} from "../../db";
import { EditionWod } from "../../ecrans/EditionWod";
import { minuscule, t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { espace, POLICE_MAX, rayon, typo } from "../../theme/typo";
import { OptionsTypeSerie } from "../../ecrans/actions-seance";
import { NotesExercice } from "../../ecrans/Notes";
import { couleurTypeSerie } from "../../ecrans/seance-vue";
import { numerosSeries } from "../../ecrans/ordre-seance";
import { useApp, useCharge } from "../../ecrans/contexte";
import { dureeEstimee } from "../../ecrans/donnees";
import { charge, depuisUnite, dureeCourte, dureeRepos, enchainementNoms, libelleSuperset, lireNombre, lireTemps, tempsTexte, titreRepos, type Unite } from "../../ecrans/format";
import { demanderExercices } from "../../ecrans/selection";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { BarreHaut, BoutonIcone, Pastille } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { FeuilleRepos, FeuilleReposSuperset, FeuilleTempo } from "../../ui/RoueDuree";
import { CadreSuperset, ContexteDefilement, RangeeGlissable, useGlisser, type Glisse } from "../../ui/Glisser";
import { ListeDesintegrable, marquerSuppression } from "../../ui/Desintegration";
import { clesParRang } from "../../ui/suppression-animee";
import { duree as dureeAnim } from "../../theme/mouvement";
import { GlisserSupprimer } from "../../ui/GlisserSupprimer";
import { actionsSupprimer, BoutonAjouterSerie, EnteteSeries, GRILLE } from "../../ui/LigneSerie";
import { ClavierPerso, ClavierSeance, SousLeClavier } from "../../ui/ClavierSeance";
import { useChampChiffre } from "../../ui/useChampChiffre";
import { useClavierEcran } from "../../ui/useClavierEcran";
import { ordreCase } from "../../ecrans/clavier-seance";
import { deplacerBloc, deplacerExercice, idPied, idTete, poserAvant, rangeesDe, rangeesSeries, type LigneDispo } from "../../ecrans/glisser";
import { tempoActif, tempoDe, tempoDefautExercice, tempoTexte } from "../../ecrans/tempo";
import { Picto } from "../../ui/Picto";
import { EtiquettePerso } from "../../ui/EtiquettePerso";
import { FeuilleVise, PastilleVise } from "../../ecrans/FeuilleVise";
import { Texte } from "../../ui/Texte";

const LARGEUR_PLAGE = 2 * GRILLE.reps + 16;
const DELAI_ANNULER_MS = 8000;

// Édition d'une routine : chaque geste est enregistré tout de suite ; « Enregistrer » valide le nom et ferme.

type FeuilleOuverte =
  | { type: "ligne"; ligne: LigneRoutineDetail; bloc: number }
  | { type: "superset"; bloc: number }
  | { type: "typeSerie"; ligne: LigneRoutineDetail; rang: number }
  | { type: "reps"; ligne: LigneRoutineDetail }
  | { type: "repos"; ligne: LigneRoutineDetail | null; groupe: number | null }
  | { type: "tempo"; ligne: LigneRoutineDetail }
  | { type: "vise"; ligne: LigneRoutineDetail }
  | null;

export default function EditionRoutine() {
  const { id, nouvelle } = useLocalSearchParams<{ id: string; nouvelle?: string }>();
  const { db, reglages } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [nom, setNom] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<FeuilleOuverte>(null);
  // Nouvelle disposition affichée dès le lâcher, jusqu'à la relecture de la base.
  const [apercu, setApercu] = useState<RoutineDetail | null>(null);
  const dureeInitiale = useRef<number | null>(null);
  const [lue, recharger] = useCharge<RoutineDetail | null>(async () => {
    const d = await lireRoutine(db, id);
    if (d && dureeInitiale.current == null) dureeInitiale.current = dureeEstimee(d);
    if (d) setNom((n) => n ?? d.nom);
    if (d) setNote((n) => n ?? (d.note ?? ""));
    return d;
  }, [id]);

  const faire = (f: () => Promise<unknown>) => {
    setFeuille(null);
    f()
      .then(recharger)
      .catch((e) => console.error(e));
  };

  // Série supprimée : « Série supprimée · Annuler » 8 s ; Annuler la remet à son rang, cible comprise.
  const [retiree, setRetiree] = useState<SerieRoutineRetiree | null>(null);
  const [hauteurBas, setHauteurBas] = useState(0);
  useEffect(() => {
    if (!retiree) return;
    const m = setTimeout(() => setRetiree(null), DELAI_ANNULER_MS);
    return () => clearTimeout(m);
  }, [retiree]);
  const supprimerSerie = (ligneId: string, rang: number) => {
    setFeuille(null);
    supprimerSerieRoutine(db, ligneId, rang)
      .then((x) => {
        setRetiree(x);
        return recharger();
      })
      .catch((e) => console.error(e));
  };
  const annulerRetrait = () => {
    const x = retiree;
    setRetiree(null);
    if (x) faire(() => restaurerSerieRoutine(db, x));
  };

  const r = apercu ?? lue;
  const toutes = r ? r.blocs.flatMap((b) => b.lignes) : [];

  const glisser = useGlisser({
    rangees: rangeesDe(toutes.map((l) => ({ id: l.id, groupe: l.groupe_superset }))),
    margeBas: 88 + bas,
    onDebut: () => setOuverte(null),
    onDeposer: (d) => {
      if (!r) return Promise.resolve();
      const avant: LigneDispo[] = toutes.map((l) => ({ id: l.id, groupe: l.groupe_superset, repos: l.repos_s }));
      const dispo = d.mode === "bloc" ? deplacerBloc(avant, d.de, d.vers) : deplacerExercice(avant, d.id, d.avant, d.groupe, reglages.reposDefautS);
      const parId = new Map(toutes.map((l) => [l.id, l]));
      setApercu({ ...r, blocs: grouperBlocs(dispo.map((x) => ({ ...parId.get(x.id)!, groupe_superset: x.groupe, repos_s: x.repos }))) });
      return disposerRoutine(db, r.id, dispo)
        .then(recharger)
        .finally(() => setApercu(null));
    },
  });
  const glisse = { ctl: glisser.ctl, phase: glisser.phase, tenu: glisser.tenu, dedans: glisser.dedans };
  // Les cases de cible (kg, répétitions, temps, distance) prennent le clavier de pepfit, comme en séance (docs/CLAVIER-PARTOUT.md).
  const { zoneVide } = useClavierEcran(glisser.defilement);
  // Le bloc (ou l'exercice) tenu passe devant ses voisins : le zIndex va sur l'enveloppe, enfant direct de la liste.
  const devant = (g: number | null, l: readonly LigneRoutineDetail[]) => {
    const x = glisser.tenu;
    return x != null && ((g != null && x.groupe === g) || l.some((y) => x.ids.includes(y.id)));
  };
  const trait = { borderLeftWidth: 2, borderLeftColor: couleurs.superset, marginLeft: -espace.s, paddingLeft: espace.s - 2 };
  const basculer = (idLigne: string) => {
    if (glisser.ctl.recent()) return;
    setOuverte((o) => (o === idLigne ? null : idLigne));
  };

  if (!r) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
  // Un WOD a sa forme à lui (planche idee-programmes) : même programme, mêmes tables, autre éditeur.
  if (r.type === "cross") return <EditionWod r={r} nouvelle={!!nouvelle} recharger={recharger} />;
  const v = vocabulaire(r.type);
  // Musculation et autre sport : « Nouveau programme » / « Modifier le programme » ; les autres types : leur mot (« Séance »).
  const titre = r.type === "muscu" || r.type === "autre" ? t(nouvelle ? "exercices.routine.nouvelle" : "exercices.routine.modifier") : t(v.modele);

  const lignes = toutes;
  const blocs = r.blocs.map((b, i) => ({ b, i }));
  const duree = dureeEstimee(r);
  const ecart = Math.round((duree - (dureeInitiale.current ?? duree)) / 60);
  const nbSeries = lignes.reduce((somme, l) => somme + l.nb_series, 0);

  const enregistrer = async () => {
    await modifierRoutine(db, r.id, { nom: nom?.trim() || t("exercices.routine.sansNom"), note: note?.trim() || null });
    router.back();
  };

  const fermer = async () => {
    if (nouvelle && lignes.length === 0) await supprimerRoutine(db, r.id);
    else if (nouvelle) await modifierRoutine(db, r.id, { nom: nom?.trim() || t("exercices.routine.sansNom"), note: note?.trim() || null });
    router.back();
  };

  const ajouter = () => {
    demanderExercices(
      lignes.map((l) => l.exercice_id),
      (ids) =>
        faire(async () => {
          for (const e of ids) await ajouterExerciceARoutine(db, r.id, e, { nbSeries: 3, reposS: reglages.reposDefautS });
        }),
    );
    router.push({ pathname: "/pick", params: { type: r.type } });
  };

  const f = feuille;
  const blocGroupe = f?.type === "repos" && f.groupe != null ? r.blocs.find((b) => b.groupeSuperset === f.groupe) : undefined;
  const blocDe = (i: number): BlocRoutine | undefined => r.blocs[i];

  return (
    <ClavierPerso.Provider value>
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={titre} retour="close" onRetour={() => fermer().catch(console.error)}>
        <BoutonPrincipal compact libelle={t("exercices.routine.enregistrer")} onPress={() => enregistrer().catch(console.error)} />
      </BarreHaut>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: couleurs.line }} />
      <ContexteDefilement.Provider value={glisser.defilement}>
      <View style={{ flex: 1 }} {...glisser.zoneProps}>
      <ScrollView {...glisser.scrollProps} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: espace.l, paddingBottom: 96 + bas }}>
        {/* Clavier de pepfit ouvert : un toucher sur une zone vide le ferme (la case s'enregistre). */}
        <View {...zoneVide}>
        <Texte variante="libelle" couleur="t2" style={{ marginTop: espace.l, marginBottom: espace.s }}>
          {t("exercices.routine.nomLabel")}
        </Texte>
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={nom ?? ""}
          onChangeText={setNom}
          placeholder={t("exercices.routine.nomExemple")}
          placeholderTextColor={couleurs.t3}
          cursorColor={couleurs.action}
          accessibilityLabel={t("exercices.routine.nomLabel")}
          style={[typo.saisie, styles.nom, { fontFamily: "Inter-Regular", color: couleurs.t1, backgroundColor: couleurs.s2 }]}
        />
        <Texte variante="libelle" couleur="t2" style={{ marginTop: espace.m, marginBottom: espace.s }}>
          {t("exercices.routine.noteLabel")}
        </Texte>
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={note ?? ""}
          onChangeText={setNote}
          placeholder={t("exercices.routine.noteExemple")}
          placeholderTextColor={couleurs.t3}
          cursorColor={couleurs.action}
          accessibilityLabel={t("exercices.routine.noteLabel")}
          multiline
          maxLength={600}
          textAlignVertical="top"
          style={[typo.saisie, styles.note, { fontFamily: "Inter-Regular", color: couleurs.t1, backgroundColor: couleurs.s2 }]}
        />
        <View style={[styles.resume, { borderBottomColor: couleurs.line }]}>
          <Icone nom="timer" couleur={couleurs.t2} taille={18} />
          <Texte variante="saisie" style={{ fontSize: 16 }}>
            {dureeCourte(duree)}
          </Texte>
          <Texte variante="libelle" couleur="t2" style={{ flex: 1 }} numberOfLines={1}>
            {tp("exercices.exercice", lignes.length)}, {tp("communs.serie", nbSeries)}
          </Texte>
          {ecart ? (
            <View style={[styles.ecart, { backgroundColor: couleurs.s2 }]}>
              <Texte variante="libelle" couleur="t2">
                {t("communs.min", { n: ecart > 0 ? `+${ecart}` : `−${-ecart}` })}
              </Texte>
            </View>
          ) : null}
        </View>
        <ListeDesintegrable
          liste={blocs}
          cleDe={({ b }) => (b.groupeSuperset != null ? `c${b.groupeSuperset}` : b.lignes[0]!.id)}
          enveloppe={({ b }) => ({ style: devant(b.groupeSuperset, b.lignes) && { zIndex: 10 } })}
          rendu={({ b, i }) => {
            const g = b.groupeSuperset;
            const ligne = (l: LigneRoutineDetail, k: number) => (
              <RangeeGlissable
                rangee={{ id: l.id, type: g == null ? "seul" : "membre", groupe: g }}
                glisse={glisse}
                appuiLong={ouverte !== l.id}
                dansSuperset={g != null}
                trait={trait}
              >
                {(poignee) => (
                  <LigneEdition
                    ligne={l}
                    poignee={poignee}
                    enchaine={g != null && k < b.lignes.length - 1}
                    dansSuperset={g != null}
                    ouverte={ouverte === l.id}
                    onOuvrir={() => basculer(l.id)}
                    onMenu={() => setFeuille({ type: "ligne", ligne: l, bloc: i })}
                    onRepos={g == null ? () => setFeuille({ type: "repos", ligne: l, groupe: null }) : undefined}
                    onVise={() => setFeuille({ type: "vise", ligne: l })}
                    onAjouterSerie={() => faire(() => modifierLigneRoutine(db, l.id, { nbSeries: l.nb_series + 1 }))}
                    unite={reglages.unite}
                    onCible={(rang, c) => faire(() => definirCibleSerie(db, l.id, rang, c))}
                    onType={(rang) => setFeuille({ type: "typeSerie", ligne: l, rang })}
                    onSupprimerSerie={(rang) => supprimerSerie(l.id, rang)}
                    onOrdreSeries={(ordre) => ordonnerSeriesRoutine(db, l.id, ordre).then(recharger)}
                    onModeReps={() => setFeuille({ type: "reps", ligne: l })}
                    onAjouterNote={(type, texte) => ajouterNote(db, { exerciceId: l.exercice_id, ligneId: l.id }, type, texte).then(recharger)}
                    onModifierNote={(nid, texte) => modifierNote(db, nid, texte).then(recharger)}
                    onTypeNote={(nid, vers) => changerTypeNote(db, { exerciceId: l.exercice_id, ligneId: l.id }, nid, vers).then(recharger)}
                  />
                )}
              </RangeeGlissable>
            );
            if (g == null) return ligne(b.lignes[0]!, 0);
            const libelle = libelleSuperset(b.lignes.length);
            return (
              <CadreSuperset groupe={g} glisse={glisse}>
                <RangeeGlissable rangee={{ id: idTete(g), type: "tete", groupe: g }} glisse={glisse} appuiLong dansSuperset trait={trait} ecartHaut={espace.l / 2}>
                  {(poignee) => (
                    <View style={styles.teteSuperset}>
                      <View {...poignee} accessibilityLabel={t("exercices.routine.deplacerBloc", { quoi: minuscule(libelle) })} style={styles.poigneeTete}>
                        <Icone nom="grip" couleur={couleurs.t3} taille={20} />
                      </View>
                      <Texte variante="exercice" style={{ fontSize: 14, color: couleurs.superset }}>
                        {libelle}
                      </Texte>
                      <Texte variante="libelle" couleur="t2" style={{ flex: 1 }}>
                        {tp("exercices.exercice", b.lignes.length)}, {tp("exercices.tour", b.nbTours)}
                      </Texte>
                      <BoutonIcone nom="more" libelle={t("exercices.routine.optionsBloc", { quoi: minuscule(libelle) })} onPress={() => setFeuille({ type: "superset", bloc: i })} />
                    </View>
                  )}
                </RangeeGlissable>
                <ListeDesintegrable
                  liste={b.lignes}
                  cleDe={(l) => l.id}
                  enveloppe={(l) => ({ style: devant(null, [l]) && { zIndex: 10 } })}
                  rendu={(l) => ligne(l, b.lignes.indexOf(l))}
                />
                <RangeeGlissable rangee={{ id: idPied(g), type: "pied", groupe: g }} glisse={glisse} appuiLong={false} dansSuperset trait={trait} ecartBas={espace.l / 2}>
                  {() => (
                    <View style={styles.reposTour}>
                      <Pastille libelle={t("exercices.routine.repos", { duree: b.reposTransitionS > 0 ? `${dureeRepos(b.reposTransitionS)}, ${dureeRepos(b.reposS)}` : dureeRepos(b.reposS) })} onPress={() => setFeuille({ type: "repos", ligne: null, groupe: g })} />
                      <Texte variante="libelle" couleur="t2">
                        {t("exercices.routine.chaqueTour")}
                      </Texte>
                    </View>
                  )}
                </RangeeGlissable>
              </CadreSuperset>
            );
          }}
        />
        {lignes.length === 0 ? (
          // État vide : un picto et un mot (pas de phrase d'explication).
          <View style={{ alignItems: "center", gap: espace.s, marginTop: espace.xxl }}>
            <Icone nom="dumbbell" couleur={couleurs.t3} taille={28} />
            <Texte variante="libelle" couleur="t2">
              {t("exercices.routine.aucunExercice")}
            </Texte>
          </View>
        ) : null}
        </View>
      </ScrollView>
      </View>
      </ContexteDefilement.Provider>
      <ClavierSeance />
      <SousLeClavier>
      {retiree ? <BandeauAnnuler texte={t("seance.ligne.serieSupprimee")} bas={hauteurBas + espace.s} onAnnuler={annulerRetrait} /> : null}
      <View onLayout={(e) => setHauteurBas(e.nativeEvent.layout.height)} style={[styles.basBarre, { paddingBottom: bas + espace.m, backgroundColor: couleurs.bg }]}>
        <Pressable
          accessibilityRole="button"
          onPress={ajouter}
          style={({ pressed }) => [styles.ajouter, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }]}
        >
          <Icone nom="plus" couleur={couleurs.t1} taille={20} />
          <Texte variante="exercice">{t(v.ajouterContenu)}</Texte>
        </Pressable>
      </View>
      </SousLeClavier>

      <Feuille visible={f?.type === "ligne"} onFermer={() => setFeuille(null)} titre={f?.type === "ligne" ? f.ligne.exercice.nom : undefined}>
        {f?.type === "ligne" ? (
          <Groupe>
            <Option premier icone="monter" libelle={t("exercices.routine.monter")} onPress={() => faire(() => deplacerLigne(db, f.ligne.id, -1))} />
            <Option icone="descendre" libelle={t("exercices.routine.descendre")} onPress={() => faire(() => deplacerLigne(db, f.ligne.id, 1))} />
            {f.ligne.groupe_superset == null && blocDe(f.bloc + 1) ? (
              <Option
                icone="link"
                libelle={t("exercices.routine.supersetAvec", { quoi: libelleSuperset(1 + blocDe(f.bloc + 1)!.lignes.length), nom: blocDe(f.bloc + 1)!.lignes[0]!.exercice.nom })}
                onPress={() =>
                  faire(() =>
                    creerSuperset(db, r.id, [f.ligne.id, ...blocDe(f.bloc + 1)!.lignes.map((l) => l.id)], blocDe(f.bloc + 1)!.reposS || 90),
                  )
                }
              />
            ) : null}
            {f.ligne.groupe_superset != null ? (
              <Option icone="unlink" libelle={t("exercices.routine.retirerDuBloc", { quoi: minuscule(libelleSuperset(blocDe(f.bloc)?.lignes.length ?? 2)) })} onPress={() => faire(() => retirerDuSuperset(db, f.ligne.id, reglages.reposDefautS))} />
            ) : null}
            {/* Tempo : exercices à répétitions seulement (29/10). */}
            {tempoActif(f.ligne.exercice) ? (
              <Option icone="timer" libelle={t("exercices.routine.definirTempo")} onPress={() => setFeuille({ type: "tempo", ligne: f.ligne })} />
            ) : null}
            <Option
              icone="trash"
              danger
              libelle={t("exercices.routine.retirerExercice")}
              onPress={() => {
                marquerSuppression(f.ligne.id, dureeAnim.feuilleSortie);
                faire(() => retirerLigneDeRoutine(db, f.ligne.id));
              }}
            />
          </Groupe>
        ) : null}
      </Feuille>

      <Feuille visible={f?.type === "reps"} onFermer={() => setFeuille(null)} titre={t("exercices.routine.repetitions")}>
        {f?.type === "reps" ? (
          <Groupe>
            <Option premier libelle={t("exercices.routine.repetitions")} choisi={!f.ligne.plage_reps} onPress={() => faire(() => modifierLigneRoutine(db, f.ligne.id, { plageReps: false }))} />
            <Option libelle={t("exercices.routine.plage")} choisi={!!f.ligne.plage_reps} onPress={() => faire(() => modifierLigneRoutine(db, f.ligne.id, { plageReps: true }))} />
          </Groupe>
        ) : null}
      </Feuille>

      <Feuille visible={f?.type === "typeSerie"} onFermer={() => setFeuille(null)} titre={t("exercices.routine.typeSerie")}>
        {f?.type === "typeSerie" ? (
          <OptionsTypeSerie
            courant={f.ligne.cibles[f.rang]?.type ?? "normale"}
            onChoisir={(type: TypeSerie) => faire(() => definirTypeSerie(db, f.ligne.id, f.rang, type))}
          />
        ) : null}
      </Feuille>

      <Feuille visible={f?.type === "superset"} onFermer={() => setFeuille(null)} titre={f?.type === "superset" && blocDe(f.bloc) ? libelleSuperset(blocDe(f.bloc)!.lignes.length) : undefined}>
        {f?.type === "superset" && blocDe(f.bloc) ? (
          <Groupe>
            <Option premier icone="monter" libelle={t("exercices.routine.monterBloc", { quoi: minuscule(libelleSuperset(blocDe(f.bloc)!.lignes.length)) })} onPress={() => faire(() => deplacerLigne(db, blocDe(f.bloc)!.lignes[0]!.id, -1))} />
            <Option icone="descendre" libelle={t("exercices.routine.descendreBloc", { quoi: minuscule(libelleSuperset(blocDe(f.bloc)!.lignes.length)) })} onPress={() => faire(() => deplacerLigne(db, blocDe(f.bloc)!.lignes[0]!.id, 1))} />
            {blocDe(f.bloc + 1) ? (
              <Option
                icone="link"
                libelle={t("exercices.routine.ajouterNom", { nom: blocDe(f.bloc + 1)!.lignes[0]!.exercice.nom })}
                onPress={() =>
                  faire(() =>
                    creerSuperset(db, r.id, [...blocDe(f.bloc)!.lignes, ...blocDe(f.bloc + 1)!.lignes].map((l) => l.id), blocDe(f.bloc)!.reposS),
                  )
                }
              />
            ) : null}
            <Option
              icone="unlink"
              libelle={t("exercices.routine.defaire", { quoi: minuscule(libelleSuperset(blocDe(f.bloc)!.lignes.length)) })}
              onPress={() =>
                faire(async () => {
                  for (const l of blocDe(f.bloc)!.lignes) await retirerDuSuperset(db, l.id, reglages.reposDefautS);
                })
              }
            />
          </Groupe>
        ) : null}
      </Feuille>

      <FeuilleTempo
        visible={f?.type === "tempo"}
        tempo={f?.type === "tempo" ? f.ligne.tempo : null}
        defaut={f?.type === "tempo" ? tempoDefautExercice(f.ligne.exercice, reglages.tempos) : null}
        onFermer={() => setFeuille(null)}
        onEnregistrer={(tempo) => {
          if (f?.type !== "tempo") return;
          faire(() => modifierLigneRoutine(db, f.ligne.id, { tempo }));
        }}
      />

      {/* Superset : deux roues, entre les exercices et après le tour (planche idee-plein-ecran, lot 1). */}
      <FeuilleReposSuperset
        visible={f?.type === "repos" && f.groupe != null}
        titre={t("ui.reposSuperset.titre", { quoi: minuscule(libelleSuperset(blocGroupe?.lignes.length ?? 2)) })}
        sousTitre={blocGroupe ? enchainementNoms(blocGroupe.lignes.map((l) => l.exercice.nom)) : undefined}
        transitionS={blocGroupe?.reposTransitionS ?? 0}
        tourS={blocGroupe?.reposS ?? 0}
        onFermer={() => setFeuille(null)}
        onValider={(entre, apres) => {
          if (f?.type !== "repos" || f.groupe == null) return;
          const groupe = f.groupe;
          faire(() => definirReposSuperset(db, r.id, groupe, apres, entre));
        }}
      />
      <FeuilleVise
        visible={f?.type === "vise"}
        onFermer={() => setFeuille(null)}
        nom={f?.type === "vise" ? f.ligne.exercice.nom : ""}
        rir={f?.type === "vise" ? (f.ligne.rir ?? null) : null}
        enSeance={false}
        routine={nom?.trim() || r.nom || null}
        onChoisir={(rir) => {
          if (f?.type !== "vise") return;
          const lid = f.ligne.id;
          setFeuille(null);
          faire(() => definirRirLigne(db, lid, rir));
        }}
      />
      <FeuilleRepos
        visible={f?.type === "repos" && f.groupe == null}
        titre={titreRepos(f?.type === "repos" && f.groupe != null ? (r.blocs.find((b) => b.groupeSuperset === f.groupe)?.lignes.length ?? 2) : null)}
        valeur={f?.type === "repos" ? (f.groupe != null ? (r.blocs.find((b) => b.groupeSuperset === f.groupe)?.reposS ?? 0) : (f.ligne?.repos_s ?? 0)) : 0}
        onFermer={() => setFeuille(null)}
        onValider={(d) => {
          if (f?.type !== "repos") return;
          faire(() => (f.groupe != null ? definirReposSuperset(db, r.id, f.groupe, d) : modifierLigneRoutine(db, f.ligne!.id, { reposS: d })));
        }}
      />
    </SafeAreaView>
    </ClavierPerso.Provider>
  );
}

let serieNeuve = 0;

function LigneEdition({
  ligne,
  poignee,
  ouverte,
  onOuvrir,
  onMenu,
  onRepos,
  onVise,
  onAjouterSerie,
  unite,
  onCible,
  onType,
  onSupprimerSerie,
  onOrdreSeries,
  onModeReps,
  onAjouterNote,
  onModifierNote,
  onTypeNote,
  dansSuperset,
  enchaine,
}: {
  ligne: LigneRoutineDetail;
  poignee: object;
  ouverte: boolean;
  onOuvrir: () => void;
  onMenu: () => void;
  onRepos?: () => void;
  /** Pastille « Visé : Dur » : le ressenti visé de la ligne, pour toutes ses séries (planche exercices-perso, section 5). */
  onVise: () => void;
  onAjouterSerie: () => void;
  unite: Unite;
  onCible: (rang: number, c: { kg?: number | null; reps?: number | null; repsMax?: number | null; dureeS?: number | null; distanceM?: number | null }) => void;
  onType: (rang: number) => void;
  onSupprimerSerie: (rang: number) => void;
  /** Glisser-déposer des séries : anciens rangs dans le nouvel ordre. */
  onOrdreSeries: (ordre: number[]) => Promise<unknown>;
  onModeReps: () => void;
  onAjouterNote: (type: TypeNote, texte: string) => Promise<unknown>;
  onModifierNote: (id: string, texte: string | null) => Promise<unknown>;
  onTypeNote: (id: string, vers: TypeNote) => Promise<unknown>;
  dansSuperset?: boolean;
  enchaine?: boolean;
}) {
  const { couleurs } = useTheme();
  const ex = ligne.exercice;
  const colonnes = INFO_NATURE[ex.nature].colonnes;
  const plage = !!ligne.plage_reps;
  const tempoVu = tempoDe(ligne.tempo, ligne.exercice);
  // Séries indexées par rang en base : des clés stables, pour que seule la série balayée se désintègre.
  const rs = useRef({ cles: [] as string[], retire: null as number | null }).current;
  if (rs.cles.length !== ligne.cibles.length) {
    rs.cles = clesParRang(rs.cles, ligne.cibles.length, rs.retire, () => `${ligne.id}:${serieNeuve++}`);
    rs.retire = null;
  }
  const bas = useSafeAreaInsets().bottom;
  // Glisser-déposer des séries (même geste qu'en séance) : le nouvel ordre s'affiche dès le lâcher, jusqu'à la relecture.
  // Les clés suivent leur série ; `apercu` (anciens rangs dans le nouvel ordre) ne vaut que pour la ligne lue au lâcher.
  const [apercu, setApercu] = useState<{ pour: LigneRoutineDetail; ordre: number[] } | null>(null);
  const ordre = apercu?.pour === ligne ? apercu.ordre : ligne.cibles.map((_, rang) => rang);
  const cibles = ordre.map((r) => ligne.cibles[r]!);
  const numeros = numerosSeries(cibles.map((c) => c.type));
  const gs = useGlisser({
    rangees: rangeesSeries(rs.cles),
    margeBas: 88 + bas,
    onDebut: () => {},
    onDeposer: (d) => {
      if (d.mode !== "exercice") return Promise.resolve();
      const cles = poserAvant(rs.cles, d.id, d.avant);
      const nouvel = cles.map((k) => ordre[rs.cles.indexOf(k)]!);
      rs.cles = cles;
      setApercu({ pour: ligne, ordre: nouvel });
      return onOrdreSeries(nouvel);
    },
  });
  const glisseSeries: Glisse = { ctl: gs.ctl, phase: gs.phase, tenu: gs.tenu, dedans: false };
  const series = cibles.map((c, rang) => ({
    cle: rs.cles[rang]!,
    c,
    rang,
    numero: numeros[rang]!,
    // La dernière série reste : pas de geste de suppression sous deux séries.
    supprimable: ligne.nb_series > 1,
  }));
  const detail = [
    tp("communs.serie", ligne.nb_series),
    INFO_NATURE[ex.nature].famille === "poids_du_corps" ? t("exercices.routine.poidsCorps") : null,
    dansSuperset ? (enchaine ? t("exercices.routine.enchaine") : null) : t("exercices.routine.reposMin", { duree: dureeRepos(ligne.repos_s) }),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={[styles.ligne, { borderBottomColor: couleurs.line }]}>
      <View style={styles.teteLigne}>
        <View {...poignee} accessibilityLabel={t("exercices.routine.deplacer")} style={styles.poignee}>
          <Icone nom="grip" couleur={couleurs.t3} taille={20} />
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouverte }} onPress={onOuvrir} style={styles.ouvrir}>
          <Picto slug={ex.slug} nom={ex.nom} photo={ex.photo_vignette} taille={40} />
          <View style={{ flex: 1 }}>
            <View style={styles.nomPerso}>
              <Texte variante="exercice" numberOfLines={1} style={{ flexShrink: 1 }}>
                {ex.nom}
              </Texte>
              {ex.perso ? <EtiquettePerso coach={ex.coach} /> : null}
            </View>
            {tempoVu ? (
              <Texte variante="meta" couleur="t3" numberOfLines={1}>
                {t("exercices.routine.tempo", { tempo: tempoTexte(tempoVu) })}
              </Texte>
            ) : null}
            {!ouverte ? (
              <Texte variante="libelle" couleur="t2" numberOfLines={1}>
                {detail}
              </Texte>
            ) : null}
          </View>
        </Pressable>
        {ouverte ? (
          <BoutonIcone nom="more" libelle={t("exercices.routine.optionsNom", { nom: ex.nom })} onPress={onMenu} />
        ) : (
          <BoutonIcone nom="down" libelle={t("exercices.routine.deplier", { nom: ex.nom })} onPress={onOuvrir} />
        )}
      </View>
      {ouverte ? (
        <View style={styles.corpsLigne}>
          <NotesExercice
            types={["exercice", "routine"]}
            defaut="routine"
            notes={[...ligne.notesExercice, ...ligne.notes]}
            pastilles={
              <>
                {onRepos ? <Pastille libelle={t("exercices.routine.repos", { duree: dureeRepos(ligne.repos_s) })} onPress={onRepos} /> : null}
                {colonnes.some((c) => c.champ === "reps") ? <PastilleVise rir={ligne.rir ?? null} onPress={onVise} /> : null}
              </>
            }
            onAjouter={onAjouterNote}
            onModifier={onModifierNote}
            onChangerType={onTypeNote}
          />
          <EnteteSeries
            sansCase
            sansPrecedent
            colonnes={colonnes.map((c) => ({
              champ: c.champ,
              etiquette: c.champ === "reps" ? (plage ? t("exercices.routine.plageEntete") : c.etiquette.toUpperCase()) : c.champ === "kg" ? c.etiquette.replace("kg", unite).toUpperCase() : c.etiquette.toUpperCase(),
              largeur: c.champ === "reps" && plage ? LARGEUR_PLAGE : undefined,
              onPress: c.champ === "reps" ? onModeReps : undefined,
              libelleAcces: c.champ === "reps" ? t("exercices.routine.toucherChanger", { quoi: t(plage ? "exercices.routine.plage" : "exercices.routine.repetitions") }) : undefined,
            }))}
          />
          <ListeDesintegrable
            liste={series}
            cleDe={(x) => x.cle}
            nouveaux
            enveloppe={(x) => ({ style: gs.tenu?.ids.includes(x.cle) && { zIndex: 10 } })}
            rendu={({ cle, c, rang, numero, supprimable }) => {
              const supprimer = supprimable
                ? () => {
                    rs.retire = rang;
                    onSupprimerSerie(rang);
                  }
                : undefined;
              const rangee = (appui: object) => (
              <View style={styles.grille}>
                {/* Appui long sur le numéro (et la place du précédent) : glisser la série, comme en séance. */}
                <View style={styles.zoneAppui} {...appui}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("exercices.routine.serieType", { numero })}
                  {...actionsSupprimer(supprimer, () => onType(rang))}
                  onPress={() => !gs.ctl.recent() && onType(rang)}
                  hitSlop={6}
                  style={[styles.numero, { backgroundColor: couleurs.s2 }]}
                >
                  <Texte variante="saisie" style={{ fontSize: 15, color: couleurTypeSerie(c.type, couleurs) ?? couleurs.t1 }}>
                    {numero}
                  </Texte>
                </Pressable>
                <View style={styles.precedent} />
                </View>
                {colonnes.map((col) => {
                  switch (col.champ) {
                    case "kg":
                      return (
                        <ChampCible
                          key="kg"
                          champ="kg"
                          cle={`${cle}:kg`}
                          ordre={ordreCase(rang, 0)}
                          paliers={{ liste: null, unite }}
                          largeur={GRILLE.charge}
                          valeur={charge(c.kg, unite)}
                          clavier="decimal-pad"
                          libelle={t("exercices.routine.chargeVisee", { rang: rang + 1 })}
                          onFin={(v) => {
                            const n = lireNombre(v);
                            onCible(rang, { kg: n != null && n > 0 ? depuisUnite(n, unite) : null });
                          }}
                        />
                      );
                    case "reps":
                      if (plage)
                        return (
                          <View key="reps" style={styles.plage}>
                            <View style={{ flex: 1 }}>
                            <ChampCible
                              champ="reps"
                              cle={`${cle}:reps`}
                              ordre={ordreCase(rang, 1)}
                              valeur={c.reps != null ? String(c.reps) : ""}
                              clavier="number-pad"
                              libelle={t("exercices.routine.repsMin", { rang: rang + 1 })}
                              onFin={(v) => {
                                const n = lireNombre(v);
                                onCible(rang, { reps: n != null && n > 0 ? Math.round(n) : null });
                              }}
                            />
                            </View>
                            <Texte variante="libelle" couleur="t2">
                              {t("exercices.routine.a")}
                            </Texte>
                            <View style={{ flex: 1 }}>
                            <ChampCible
                              champ="reps"
                              cle={`${cle}:repsMax`}
                              ordre={ordreCase(rang, 2)}
                              valeur={c.reps_max != null ? String(c.reps_max) : ""}
                              clavier="number-pad"
                              libelle={t("exercices.routine.repsMax", { rang: rang + 1 })}
                              onFin={(v) => {
                                const n = lireNombre(v);
                                onCible(rang, { repsMax: n != null && n > 0 ? Math.round(n) : null });
                              }}
                            />
                            </View>
                          </View>
                        );
                      return (
                        <ChampCible
                          key="reps"
                          champ="reps"
                          cle={`${cle}:reps`}
                          ordre={ordreCase(rang, 1)}
                          largeur={GRILLE.reps}
                          valeur={c.reps != null ? String(c.reps) : ""}
                          clavier="number-pad"
                          libelle={t("exercices.routine.repsVisees", { rang: rang + 1 })}
                          onFin={(v) => {
                            const n = lireNombre(v);
                            onCible(rang, { reps: n != null && n > 0 ? Math.round(n) : null });
                          }}
                        />
                      );
                    case "distance_m":
                      return (
                        <ChampCible
                          key="distance_m"
                          champ="distance_m"
                          cle={`${cle}:distance_m`}
                          ordre={ordreCase(rang, 3)}
                          largeur={GRILLE.distance}
                          valeur={c.distance_m != null ? String(c.distance_m) : ""}
                          clavier="decimal-pad"
                          libelle={t("exercices.routine.distanceVisee", { rang: rang + 1 })}
                          onFin={(v) => {
                            const n = lireNombre(v);
                            onCible(rang, { distanceM: n != null && n > 0 ? Math.round(n) : null });
                          }}
                        />
                      );
                    case "duree_s":
                      return (
                        <ChampCible
                          key="duree_s"
                          champ="duree_s"
                          cle={`${cle}:duree_s`}
                          ordre={ordreCase(rang, 4)}
                          largeur={GRILLE.temps}
                          valeur={tempsTexte(c.duree_s)}
                          clavier="number-pad"
                          temps
                          libelle={t("exercices.routine.tempsVise", { rang: rang + 1 })}
                          onFin={(v) => onCible(rang, { dureeS: lireTemps(v) || null })}
                        />
                      );
                  }
                })}
              </View>
              );
              return (
                <RangeeGlissable rangee={{ id: cle, type: "serie", groupe: null }} glisse={glisseSeries} appuiLong dansSuperset={false} trait={{}} zoneAppui>
                  {(_poignee, appui) =>
                    supprimer ? (
                      <GlisserSupprimer actif={() => !gs.ctl.recent()} onSupprimer={supprimer}>
                        {rangee(appui)}
                      </GlisserSupprimer>
                    ) : (
                      rangee(appui)
                    )
                  }
                </RangeeGlissable>
              );
            }}
          />
          <BoutonAjouterSerie onPress={onAjouterSerie} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Champ de cible : la valeur est rendue à la fin de la saisie (Valider, toucher ailleurs, ou clavier fermé par le retour
 * Android). Même comportement que la case de série (useChampChiffre) : le clavier de pepfit, pas celui du téléphone.
 */
function ChampCible({
  valeur,
  clavier,
  libelle,
  onFin,
  temps,
  largeur,
  champ,
  cle,
  ordre,
  paliers,
}: {
  largeur?: number;
  valeur: string;
  clavier: "decimal-pad" | "number-pad";
  libelle: string;
  onFin: (v: string) => void;
  temps?: boolean;
  champ: ChampSerie;
  /** Clé de la case dans le clavier de pepfit : unique dans l'écran. */
  cle: string;
  /** Ordre de la case dans l'exercice ouvert : Valider passe à la suivante. */
  ordre: number;
  paliers?: { liste: number[] | null; unite: Unite };
}) {
  const { couleurs } = useTheme();
  const { props, focus, perso } = useChampChiffre({ valeur, onFin, clavier, temps, champ, cle, ordre, paliers });
  const saisie = (
    <TextInput
      maxFontSizeMultiplier={POLICE_MAX}
      {...props}
      cursorColor={couleurs.action}
      selectionColor={couleurs.action}
      placeholder="–"
      placeholderTextColor={couleurs.t3}
      accessibilityLabel={libelle}
      style={[
        typo.saisie,
        styles.champ,
        {
          color: couleurs.t1,
          backgroundColor: focus ? couleurs.serieActiveChamp : "transparent",
          borderWidth: perso && focus ? 1.5 : focus ? 0 : 1,
          borderColor: perso && focus ? couleurs.action : couleurs.line2,
        },
      ]}
    />
  );
  return largeur ? <View style={{ width: largeur }}>{saisie}</View> : saisie;
}

const styles = StyleSheet.create({
  nomPerso: { flexDirection: "row", alignItems: "center", gap: 8 },
  grille: { flexDirection: "row", alignItems: "center", gap: GRILLE.ecart, minHeight: 48 },
  numero: { width: 32, minHeight: 32, marginHorizontal: 2, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  precedent: { flex: 1 },
  zoneAppui: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: GRILLE.ecart },
  plage: { width: LARGEUR_PLAGE, flexDirection: "row", alignItems: "center", gap: espace.xs },
  champ: { minHeight: 40, textAlign: "center", borderRadius: rayon.m, paddingVertical: 0, paddingHorizontal: 2 },
  nom: { height: 48, borderRadius: rayon.l, paddingHorizontal: espace.l },
  note: { minHeight: 48, maxHeight: 160, borderRadius: rayon.l, paddingHorizontal: espace.l, paddingTop: 12, paddingBottom: 12 },
  resume: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  ecart: { height: 28, borderRadius: rayon.s, paddingHorizontal: espace.s, justifyContent: "center" },
  teteSuperset: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 48 },
  poigneeTete: { width: 36, height: 48, marginRight: -espace.s, alignItems: "center", justifyContent: "center" },
  reposTour: { flexDirection: "row", alignItems: "center", gap: espace.m, paddingVertical: espace.s },
  ligne: { borderBottomWidth: StyleSheet.hairlineWidth },
  teteLigne: { flexDirection: "row", alignItems: "center", minHeight: 72 },
  poignee: { width: 36, height: 56, alignItems: "center", justifyContent: "center" },
  ouvrir: { flex: 1, flexDirection: "row", alignItems: "center", gap: espace.m, minHeight: 56 },
  corpsLigne: { paddingLeft: 36, paddingBottom: espace.l, gap: espace.s },
  basBarre: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espace.l, paddingTop: espace.m },
  ajouter: { height: 48, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
});
