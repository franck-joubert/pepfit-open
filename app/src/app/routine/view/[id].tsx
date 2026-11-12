import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  dupliquerRoutine,
  INFO_NATURE,
  lirePrecedents,
  lireRoutine,
  nbSeancesRoutine,
  progressionRoutine,
  supprimerRoutine,
  type LigneRoutineDetail,
  type PointProgression,
  type RoutineDetail,
  type Serie,
} from "../../../db";
import { t, tp } from "../../../i18n/index";
import { useLangue } from "../../../i18n/useLangue";
import { useTheme } from "../../../theme";
import { espace, rayon } from "../../../theme/typo";
import { useApp, useCharge } from "../../../ecrans/contexte";
import { tempoDe, tempoTexte } from "../../../ecrans/tempo";
import { dureeEstimee, unitesExercices } from "../../../ecrans/donnees";
import { dureeCourte, dureeRepos, libelleSuperset, titreRepos, type Unite } from "../../../ecrans/format";
import { seriesLecture } from "../../../ecrans/routine-lecture";
import { statsRoutine } from "../../../ecrans/routine-stats";
import { couleurTypeSerie, LETTRE } from "../../../ecrans/seance-vue";
import { BoutonIcone } from "../../../ui/Cadre";
import { Feuille, Groupe, Option } from "../../../ui/Feuille";
import { Icone, type NomIcone } from "../../../ui/Icone";
import { EnteteSeries, LigneSerieLecture } from "../../../ui/LigneSerie";
import { Picto } from "../../../ui/Picto";
import { Texte } from "../../../ui/Texte";
import { marquerSuppression } from "../../../ui/Desintegration";
import { desintegration } from "../../../theme/mouvement";
import { revenir } from "../../../ui/revenir";

interface Donnees {
  r: RoutineDetail | null;
  /** Volume de chaque séance terminée avec la routine. */
  volumes: PointProgression[];
  nbSeances: number;
  precedents: Record<string, Serie[]>;
  unites: Record<string, Unite>;
}

// Détail d'une routine (planche v2) : nom, durée à droite, note ; statistiques sur une ligne si elle a déjà été faite ;
// exercices comme la séance, en lecture. On n'y démarre plus : démarrer, planifier et régler le lieu se font dans le récap
// commun (ajout-seance-v2). Ce détail s'ouvre depuis « Voir les exercices » du récap (`detail=1`) ; toute autre entrée
// (lien de l'agenda, liste, accueil, programme, profil) est envoyée au récap.
export default function PageRoutine() {
  const { id, seance, detail } = useLocalSearchParams<{ id: string; seance?: string; detail?: string }>();
  if (detail !== "1") {
    const params: Record<string, string> = seance ? { seance } : { routineId: id };
    return <Redirect href={{ pathname: "/seance-recap", params }} />;
  }
  return <DetailRoutine id={id} />;
}

function DetailRoutine({ id }: { id: string }) {
  const { db, reglages } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const u = reglages.unite;
  const [menu, setMenu] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [defile, setDefile] = useState(false);

  const [d] = useCharge<Donnees>(async () => {
    const r = await lireRoutine(db, id);
    const ids = [...new Set(r?.blocs.flatMap((b) => b.lignes.map((l) => l.exercice_id)) ?? [])];
    // précédents de tous les exercices en une lecture, le reste en parallèle (audit de performance, M13)
    const [precedents, volumes, nbSeances, unites] = await Promise.all([
      lirePrecedents(db, ids),
      progressionRoutine(db, id, "volume"),
      nbSeancesRoutine(db, id),
      unitesExercices(db, ids, u),
    ]);
    return { r, volumes: volumes.points, nbSeances, precedents, unites };
  }, [id, u]);

  if (!d || !d.r) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
  const { r, nbSeances } = d;
  const stats = statsRoutine(d.volumes, u);
  const lignes = r.blocs.flatMap((b) => b.lignes);
  const nbSeries = lignes.reduce((somme, l) => somme + l.nb_series, 0);

  const dupliquer = async () => {
    setMenu(false);
    const copie = await dupliquerRoutine(db, r.id);
    if (copie) router.replace({ pathname: "/routine/view/[id]", params: { id: copie, detail: "1" } });
  };
  const supprimer = async () => {
    setConfirmer(false);
    marquerSuppression(r.id, desintegration.apresRetour);
    await supprimerRoutine(db, r.id);
    router.back();
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <View style={[styles.tete, defile && { borderBottomColor: couleurs.line }]}>
        <BoutonIcone nom="back" libelle={t("exercices.routine.retour")} onPress={revenir} />
        <Texte variante="exercice" numberOfLines={1} style={{ flex: 1, opacity: defile ? 1 : 0 }} importantForAccessibility="no">
          {r.nom}
        </Texte>
        <BoutonIcone nom="more" libelle={t("exercices.routine.options")} onPress={() => setMenu(true)} />
      </View>
      <ScrollView
        onScroll={(e) => setDefile(e.nativeEvent.contentOffset.y > 40)}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingBottom: espace.xxl + bas }}
      >
        <View style={styles.titre}>
          <Texte variante="titre" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>
            {r.nom}
          </Texte>
          <View style={styles.resume}>
            <Texte variante="meta" couleur="t3" style={{ flex: 1 }}>
              {`${tp("exercices.exercice", lignes.length)}, ${tp("communs.serie", nbSeries)}`}
            </Texte>
            <Texte variante="meta" couleur="t3">
              {dureeCourte(dureeEstimee(r))}
            </Texte>
          </View>
          {r.note ? <Info icone="clip" texte={r.note} /> : null}
        </View>

        {stats ? (
          <View style={[styles.stats, { backgroundColor: couleurs.s1 }]}>
            {stats.map((st, i) => (
              <View key={st.legende} style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: couleurs.line }]}>
                <Texte variante="saisie" numberOfLines={1} style={{ fontSize: 15 }}>
                  {st.valeur}
                </Texte>
                <Texte variante="meta" couleur="t3" numberOfLines={1}>
                  {st.legende}
                </Texte>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.exercicesTitre}>
          <Texte variante="exercice">{t("exercices.routine.exercices")}</Texte>
          <Texte variante="corps" couleur="t2">
            {lignes.length}
          </Texte>
        </View>
        <View style={styles.liste}>
          {lignes.length === 0 ? (
            <Texte variante="libelle" couleur="t3" style={{ paddingVertical: espace.l }}>
              {t("exercices.routine.aucunExercice")}
            </Texte>
          ) : null}
          {r.blocs.map((b, i) =>
            b.lignes.length === 1 ? (
              <Exercice key={i} ligne={b.lignes[0]!} dansSuperset={false} precedent={d.precedents[b.lignes[0]!.exercice_id] ?? []} u={d.unites[b.lignes[0]!.exercice_id] ?? u} />
            ) : (
              <View key={i}>
                <View style={[styles.trait, { backgroundColor: couleurs.superset }]} />
                <View style={styles.teteSuperset}>
                  <Texte variante="exercice" style={{ color: couleurs.superset, fontSize: 14 }}>
                    {libelleSuperset(b.lignes.length)}
                  </Texte>
                  <Texte variante="corps" couleur="t2">
                    {tp("exercices.tour", b.nbTours)}
                  </Texte>
                </View>
                {b.lignes.map((l, j) => (
                  <Exercice key={l.id} ligne={l} dansSuperset premier={j === 0} dernier={j === b.lignes.length - 1} precedent={d.precedents[l.exercice_id] ?? []} u={d.unites[l.exercice_id] ?? u} />
                ))}
                <View style={[styles.piedSuperset, { borderBottomColor: couleurs.line }]}>
                  <Info icone="timer" texte={t("exercices.routine.libelleValeur", { libelle: titreRepos(b.lignes.length), valeur: dureeRepos(b.reposS) })} />
                </View>
              </View>
            ),
          )}
        </View>
      </ScrollView>

      <Feuille visible={menu} onFermer={() => setMenu(false)}>
        <Groupe>
          <Option premier icone="copie" libelle={t("exercices.routine.dupliquer")} onPress={() => dupliquer().catch(console.error)} />
          <Option
            icone="crayon"
            libelle={t("exercices.routine.modifier")}
            onPress={() => {
              setMenu(false);
              router.push({ pathname: "/routine/[id]", params: { id: r.id } });
            }}
          />
        </Groupe>
        <Groupe>
          <Option
            premier
            danger
            icone="trash"
            libelle={t("exercices.routine.supprimer")}
            onPress={() => {
              setMenu(false);
              setConfirmer(true);
            }}
          />
        </Groupe>
      </Feuille>
      <Feuille visible={confirmer} onFermer={() => setConfirmer(false)} titre={t("exercices.routine.supprimerTitre", { nom: r.nom })}>
        <Texte variante="corps" couleur="t2" style={{ textAlign: "center", marginBottom: espace.s }}>
          {nbSeances === 0 ? t("exercices.routine.aucuneSeance") : tp("exercices.routine.seancesRestent", nbSeances)}
        </Texte>
        <Groupe>
          <Option premier danger icone="trash" libelle={t("exercices.routine.supprimer")} onPress={() => supprimer().catch(console.error)} />
          <Option libelle={t("exercices.routine.garder")} onPress={() => setConfirmer(false)} />
        </Groupe>
      </Feuille>
    </SafeAreaView>
  );
}

function Info({ icone, texte, note }: { icone: NomIcone; texte: string; note?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.info}>
      <Icone nom={icone} couleur={couleurs.t3} taille={16} />
      <Texte variante={note ? "note" : "corps"} couleur="t2" style={{ flex: 1 }}>
        {texte}
      </Texte>
    </View>
  );
}

/** Un exercice comme dans la séance en cours, en lecture : nom (vers la progression), repos, note, séries. */
function Exercice({ ligne, dansSuperset, premier, dernier, precedent, u }: { ligne: LigneRoutineDetail; dansSuperset: boolean; premier?: boolean; dernier?: boolean; precedent: Serie[]; u: Unite }) {
  const { couleurs } = useTheme();
  const ex = ligne.exercice;
  const colonnes = INFO_NATURE[ex.nature].colonnes;
  const champs = colonnes.map((c) => c.champ);
  const series = seriesLecture(ligne, precedent, champs, u);
  let n = 0;
  return (
    <View style={[styles.exercice, premier && { paddingTop: espace.xs }, !(dansSuperset && dernier) && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: couleurs.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("exercices.routine.voirProgression", { nom: ex.nom })}
        onPress={() => router.push({ pathname: "/progress/[id]", params: { id: ex.id } })}
        style={styles.nomExercice}
      >
        <Picto slug={ex.slug} nom={ex.nom} photo={ex.photo_vignette} taille={28} />
        <Texte variante="exercice" numberOfLines={2} style={{ flexShrink: 1 }}>
          {ex.nom}
        </Texte>
      </Pressable>
      {tempoDe(ligne.tempo, ex) ? (
        <Texte variante="meta" couleur="t3" style={{ marginTop: -espace.xs, paddingLeft: 38 }}>
          {t("exercices.routine.tempo", { tempo: tempoTexte(tempoDe(ligne.tempo, ex)!) })}
        </Texte>
      ) : null}
      {dansSuperset ? null : <Info icone="timer" texte={t("exercices.routine.repos", { duree: dureeRepos(ligne.repos_s) })} />}
      {ligne.notesExercice.map((n) => <Info key={n.id} icone="pin" texte={n.texte} />)}
      {ligne.notes.map((n) => <Info key={n.id} icone="clippin" texte={n.texte} />)}
      <EnteteSeries sansCase colonnes={colonnes.map((c) => ({ champ: c.champ, etiquette: (c.champ === "kg" ? c.etiquette.replace("kg", u) : c.etiquette).toUpperCase() }))} />
      {series.map((s, i) => {
        const lettre = LETTRE[s.type];
        if (!lettre) n++;
        const rang = lettre ?? String(n);
        return (
          <LigneSerieLecture
            key={i}
            numero={rang}
            couleurNumero={couleurTypeSerie(s.type, couleurs)}
            precedent={s.precedent}
            cases={s.cases.map((c) => ({ ...c, libelle: t("exercices.routine.deLaSerie", { colonne: colonnes.find((x) => x.champ === c.champ)!.etiquette, rang }) }))}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tete: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.xs, paddingHorizontal: espace.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "transparent" },
  titre: { paddingHorizontal: espace.xl, paddingTop: espace.xs },
  info: { flexDirection: "row", gap: espace.s, alignItems: "center", minHeight: 28 },
  // Ligne entière cliquable, 52 de haut (deux lignes de texte, zone ≥ 44) ; le fond d'appui déborde un peu du texte.
  resume: { flexDirection: "row", alignItems: "baseline", gap: espace.m, marginTop: espace.xs },
  stats: { flexDirection: "row", minHeight: 56, alignItems: "center", marginHorizontal: espace.s, marginTop: espace.m, borderRadius: rayon.xl },
  stat: { flex: 1, paddingHorizontal: espace.l, paddingVertical: espace.s },
  exercicesTitre: { flexDirection: "row", alignItems: "baseline", gap: espace.s, marginTop: espace.xxl, paddingHorizontal: espace.l },
  liste: { paddingHorizontal: espace.l },
  exercice: { paddingTop: espace.l, paddingBottom: espace.xs, gap: 2 },
  // Seuls le picto et le nom ouvrent la progression, pas toute la ligne.
  nomExercice: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  trait: { position: "absolute", left: -espace.l + 6, top: 8, bottom: 8, width: 2, borderRadius: 1 },
  teteSuperset: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 44, paddingTop: espace.m },
  piedSuperset: { paddingTop: espace.xs, paddingBottom: espace.m, borderBottomWidth: StyleSheet.hairlineWidth },
});
