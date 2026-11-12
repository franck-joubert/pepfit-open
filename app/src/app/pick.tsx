import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  compteursEquipement, compteursMuscle, compteursSalle, compterExercices, GROUPE_DU_TYPE, groupeParDefaut, GROUPES, libelleMuscle, LIBELLE_EQUIPEMENT, lireType, listerSalles,
  rechercherExercices, sectionsCatalogue, vocabulaire, type Equipement, type Exercice, type FiltreExercices, type GroupeCatalogue, type SalleResume,
} from "../db";
import { locale, t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { useApp } from "../ecrans/contexte";
import { exercicesRecents } from "../ecrans/donnees";
import { FormulaireExercice } from "../ecrans/FormulaireExercice";
import { cocher, contexteRemplacement, exercicesDejaPresents, prendreCochages, rendreExercices, rendreRemplacement, rendreUnExercice } from "../ecrans/selection";
import { BarreHaut } from "../ui/Cadre";
import { Bouton } from "../ui/Bouton";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { EtiquettePerso } from "../ui/EtiquettePerso";
import { Icone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { Picto } from "../ui/Picto";
import { Texte } from "../ui/Texte";

type Ligne = { type: "titre"; titre: string; compte?: number } | { type: "ex"; ex: Exercice; cle: string } | { type: "vide"; texte: string };
type Feuillet = "equipement" | "muscle" | "salle" | null;

/** Résumé d'une sélection multiple pour le texte d'une puce. */
const resume = (vide: string, l: string[]) => (l.length === 0 ? vide : l.length === 1 ? l[0]! : `${l[0]} +${l.length - 1}`);

/** Nom proposé à la création depuis la recherche (D1) : la recherche, majuscule en tête. */
const nomDepuisRecherche = (texte: string) => {
  const n = texte.trim();
  return n ? n[0]!.toLocaleUpperCase() + n.slice(1) : n;
};

/** Mots de la recherche qui cherchent les exercices proches (3 lettres ou plus). */
const motsProches = (texte: string) => [...new Set(texte.trim().split(/\s+/).filter((m) => m.length >= 3))];

export default function ChoixExercice() {
  const { db } = useApp();
  const { langue } = useLangue();
  const { couleurs, mode: theme } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  // `type` : ouvert depuis l'éditeur d'un programme de ce type ; ses exercices viennent en tête (planche idee-programmes, § 3).
  // `sport` : le type du sport d'une séance libre. L'un ou l'autre pose le filtre de son groupe, s'il a des exercices
  // (retour du 30/10) ; « Tout » le retire.
  const { salle: salleParam, mode, exclu, type: typeParam, sport: sportParam } = useLocalSearchParams<{ salle?: string; mode?: string; exclu?: string; type?: string; sport?: string }>();
  const typeProgramme = typeParam ? lireType(typeParam) : null;
  const typeSport = typeProgramme ?? (sportParam ? lireType(sportParam) : null);
  const tete = typeProgramme ? GROUPE_DU_TYPE[typeProgramme] : null;
  const [groupe, setGroupe] = useState<GroupeCatalogue | null>(typeSport ? GROUPE_DU_TYPE[typeSport] : null);
  const filtreVerifie = useRef(false);
  const fusion = mode === "fusion";
  // « lier » : choisir l'exercice du catalogue auquel relier un exercice perso (picto et 3D) ; seuls les exercices du catalogue.
  const lier = mode === "lier";
  const [remplacement] = useState(() => (mode === "remplacer" ? contexteRemplacement() : null));
  const remplacer = remplacement != null;
  const unique = fusion || remplacer || lier;
  const [candidat, setCandidat] = useState<Exercice | null>(null);
  const [garder, setGarder] = useState(true);
  const [aussiRoutine, setAussiRoutine] = useState(false);
  const [deja] = useState(() => new Set(remplacement ? remplacement.dejaPresents : lier ? [] : fusion && exclu ? [exclu] : exercicesDejaPresents()));
  const [texte, setTexte] = useState("");
  const [muscles, setMuscles] = useState<string[]>([]);
  const [secondaires, setSecondaires] = useState(false);
  const [equipements, setEquipements] = useState<Equipement[]>([]);
  const [salleId, setSalleId] = useState<string | null>(salleParam ?? null);
  const [feuillet, setFeuillet] = useState<Feuillet>(null);
  const [salles, setSalles] = useState<SalleResume[]>([]);
  const [recents, setRecents] = useState<Exercice[]>([]);
  const [liste, setListe] = useState<Exercice[]>([]);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [creation, setCreation] = useState(false);
  const [proches, setProches] = useState<Exercice[]>([]);

  useEffect(() => {
    listerSalles(db)
      .then((l) => {
        setSalles(l);
        // Lieu sans inventaire (ni équipement ni appareil) : « Ici » masquerait tout, il n'est pas présélectionné.
        const ici = salleParam ? l.find((x) => x.id === salleParam) : undefined;
        if (ici && !ici.equipements.length && !ici.nbAppareils) setSalleId((x) => (x === salleParam ? null : x));
      })
      .catch(() => {});
    exercicesRecents(db, 3).then((l) => setRecents(lier ? l.filter((e) => !e.perso) : l)).catch(() => {});
  }, [db, lier]);

  const filtre = useMemo<FiltreExercices>(
    () => ({ texte, muscles, secondaires, equipements, salleId: salleId ?? undefined }),
    [texte, muscles, secondaires, equipements, salleId],
  );

  useEffect(() => {
    let vivant = true;
    rechercherExercices(db, { ...filtre, limite: 2000 })
      .then((l) => {
        if (!vivant) return;
        if (lier) l = l.filter((e) => !e.perso);
        setListe(l);
        // à la première lecture : le filtre du sport tombe s'il ne montrerait rien (aucun exercice de ce sport ici)
        if (!filtreVerifie.current) {
          filtreVerifie.current = true;
          if (typeSport) setGroupe((g) => (g === GROUPE_DU_TYPE[typeSport] ? groupeParDefaut(typeSport, l) : g));
        }
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [db, filtre, lier]);

  // D1 : la recherche ne trouve rien ; les exercices proches (un des mots de la recherche) restent dessous, contre les doublons.
  useEffect(() => {
    const mots = motsProches(texte);
    if (liste.length || !mots.length) {
      setProches([]);
      return;
    }
    let vivant = true;
    Promise.all(mots.map((m) => rechercherExercices(db, { ...filtre, texte: m, limite: 5 })))
      .then((ls) => {
        if (!vivant) return;
        const vus = new Map<string, Exercice>();
        for (const l of ls) for (const e of l) if (!vus.has(e.id)) vus.set(e.id, e);
        setProches([...vus.values()].slice(0, 5));
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [db, filtre, liste.length, texte]);

  const [masques, setMasques] = useState(0);
  useEffect(() => {
    if (!salleId) {
      setMasques(0);
      return;
    }
    let vivant = true;
    Promise.all([compterExercices(db, { ...filtre, salleId: undefined }), compterExercices(db, filtre)])
      .then(([tous, ici]) => vivant && setMasques(Math.max(0, tous - ici)))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [db, filtre, salleId]);

  const sansFiltre = !texte && !muscles.length && !equipements.length && !salleId;
  // Tri selon le type (planche idee-programmes, § 3) : le groupe du type d'abord, puis tout (ou « Autres » en recherche) ;
  // une puce choisie filtre. Sans type ni puce (séance, autre sport) : les récents puis tout, comme avant.
  const lignes = useMemo<Ligne[]>(() => {
    const out: Ligne[] = [];
    if (!liste.length && texte.trim() && !unique) {
      out.push({ type: "vide", texte: texte.trim() });
      if (proches.length) {
        out.push({ type: "titre", titre: t("exercices.choix.proches"), compte: proches.length });
        proches.forEach((ex) => out.push({ type: "ex", ex, cle: `p${ex.id}` }));
      }
      return out;
    }
    if (sansFiltre && !tete && !groupe && recents.length) {
      out.push({ type: "titre", titre: t("exercices.choix.recents") });
      recents.forEach((ex) => out.push({ type: "ex", ex, cle: `r${ex.id}` }));
    }
    sectionsCatalogue(liste, { tete, filtre: groupe, recherche: !sansFiltre }).forEach((sec, i) => {
      out.push({ type: "titre", titre: t(sec.titre), compte: sec.exercices.length });
      // Un exercice du groupe en tête revient dans « Tous les exercices » : clé distincte par section.
      sec.exercices.forEach((ex) => out.push({ type: "ex", ex, cle: i ? ex.id : `g${ex.id}` }));
    });
    return out;
  }, [liste, recents, sansFiltre, tete, groupe, langue, proches, texte, unique]);

  // Retour de la page d'un exercice (CTA « Ajouter l'exercice ») : l'exercice arrive coché, l'état de la liste est intact.
  useFocusEffect(
    useCallback(() => {
      const ids = prendreCochages();
      if (ids.length) setChoisis((c) => cocher(c, ids, deja));
    }, [deja]),
  );

  const basculer = (id: string) => {
    if (remplacement) {
      const ex = liste.find((x) => x.id === id) ?? recents.find((x) => x.id === id);
      if (!ex) return;
      // Rien à régler (pas de série validée, pas de routine) : le choix part tout de suite.
      if (remplacement.nbValidees === 0 && !remplacement.routineNom) {
        rendreRemplacement(id, { garderSeries: true, routine: false });
        router.back();
      } else setCandidat(ex);
      return;
    }
    if (fusion || lier) {
      rendreUnExercice(id);
      router.back();
      return;
    }
    setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  };

  const remplacerPar = () => {
    if (!candidat) return;
    rendreRemplacement(candidat.id, { garderSeries: garder, routine: aussiRoutine });
    router.back();
  };

  const valider = () => {
    rendreExercices(choisis);
    router.back();
  };

  const creer = (id: string) => {
    rendreExercices([...choisis, id]);
    router.back();
  };

  const puce = (libelle: string, actif: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("exercices.choix.filtrer", { libelle })}
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.puce,
        actif ? { backgroundColor: couleurs.s2 } : { borderWidth: 1, borderColor: couleurs.line2 },
      ]}
    >
      <Texte variante="saisie" style={{ fontSize: 14, fontFamily: "Inter-Regular" }}>
        {libelle}
      </Texte>
      <Icone nom="down" couleur={couleurs.t2} taille={16} />
    </Pressable>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={remplacer ? t("exercices.choix.titreRemplacer") : lier ? t("exercices.choix.titreLier") : fusion ? t("exercices.choix.titreFusionner") : typeProgramme ? t(vocabulaire(typeProgramme).ajouterAu) : t("exercices.choix.titreAjouter")} sousTitre={remplacement ? t("exercices.choix.remplace", { nom: remplacement.nom }) : undefined}>
        {/* Toujours actif (retour du 30/10 : grisé tant que la recherche était vide) ; le nom tapé pré-remplit le formulaire. */}
        {unique ? null : (
          <BoutonPrincipal
            compact
            icone="plus"
            libelle={t("exercices.choix.creer")}
            accessibilityLabel={texte.trim() ? t("exercices.choix.creerNom", { nom: texte.trim() }) : t("exercices.choix.creer")}
            onPress={() => setCreation(true)}
          />
        )}
      </BarreHaut>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: couleurs.line }} />
      <View style={styles.haut}>
        <View style={[styles.recherche, { backgroundColor: couleurs.s2 }]}>
          <Icone nom="search" couleur={couleurs.t2} taille={20} />
          <TextInput
            maxFontSizeMultiplier={POLICE_MAX}
            value={texte}
            onChangeText={setTexte}
            placeholder={t("exercices.choix.rechercher")}
            placeholderTextColor={couleurs.t3}
            cursorColor={couleurs.action}
            selectionColor={couleurs.action}
            accessibilityLabel={t("exercices.choix.rechercher")}
            style={[typo.saisie, { fontFamily: "Inter-Regular", flex: 1, color: couleurs.t1, padding: 0, height: 48 }]}
          />
          {texte ? (
            <Pressable accessibilityLabel={t("exercices.choix.effacer")} onPress={() => setTexte("")} hitSlop={12}>
              <Icone nom="close" couleur={couleurs.t2} taille={18} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.groupes} style={styles.groupesCadre}>
          {([null, ...GROUPES] as const).map((g) => {
            const actif = g === groupe;
            const libelle = t(g ? `programmes.groupe.${g}` : "programmes.tout");
            return (
              <Pressable
                key={g ?? "tout"}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                accessibilityLabel={t("exercices.choix.filtrer", { libelle })}
                onPress={() => setGroupe(g)}
                style={styles.groupeZone}
              >
                <View
                  style={[
                    styles.groupe,
                    actif ? { backgroundColor: couleurs.t1 } : { backgroundColor: couleurs.s1, borderWidth: theme === "jour" ? 1 : 0, borderColor: couleurs.line },
                  ]}
                >
                  {actif && g ? <Icone nom="check" couleur={couleurs.bg} taille={14} /> : null}
                  <Texte style={[styles.groupeTexte, { color: actif ? couleurs.bg : couleurs.t2, fontFamily: actif ? police.semibold : police.medium }]}>{libelle}</Texte>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.puces}>
          {puce(resume(t("exercices.choix.equipement"), equipements.map((e) => LIBELLE_EQUIPEMENT[e])), equipements.length > 0, () => setFeuillet("equipement"))}
          {puce(resume(t("exercices.choix.muscle"), muscles.map(libelleMuscle)), muscles.length > 0, () => setFeuillet("muscle"))}
          {puce(salleId ? (salleId === salleParam ? t("exercices.choix.ici") : (salles.find((x) => x.id === salleId)?.nom ?? t("exercices.choix.salle"))) : t("exercices.choix.salle"), !!salleId, () => setFeuillet("salle"))}
        </View>
        {salleId && masques > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setSalleId(null)} style={styles.masques}>
            <Texte variante="meta" couleur="t2">
              {t("exercices.choix.masques", { n: masques })}
            </Texte>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={lignes}
        keyExtractor={(l, i) => (l.type === "ex" ? l.cle : `t${i}`)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        contentContainerStyle={{ paddingBottom: 96 + bas }}
        renderItem={({ item }) => {
          if (item.type === "vide") {
            return (
              <View style={[styles.vide, { backgroundColor: couleurs.s1 }]}>
                <Texte variante="exercice" style={{ fontSize: 16 }}>
                  {t("exercices.choix.aucunNom", { q: item.texte })}
                </Texte>
                <BoutonPrincipal icone="plus" libelle={t("exercices.choix.creerGuillemets", { nom: nomDepuisRecherche(item.texte) })} onPress={() => setCreation(true)} />
              </View>
            );
          }
          if (item.type === "titre") {
            return (
              <View style={styles.titre}>
                <Texte variante="entete" couleur="t2">
                  {item.titre}
                </Texte>
                {item.compte != null ? (
                  <Texte variante="meta" couleur="t3">
                    {item.compte}
                  </Texte>
                ) : null}
              </View>
            );
          }
          const ex = item.ex;
          const present = deja.has(ex.id);
          const coche = choisis.includes(ex.id);
          // Exercice perso sans muscle ni matériel : pas de sous-titre vide, le nom reste centré.
          const detail = present ? t(remplacer ? "exercices.choix.dejaSeance" : fusion ? "exercices.choix.aFusionner" : "exercices.choix.dejaAjoute") : [ex.muscle ? libelleMuscle(ex.muscle) : null, LIBELLE_EQUIPEMENT[ex.equipement]].filter(Boolean).join(", ");
          return (
            <View style={[styles.ex, coche && { backgroundColor: couleurs.s1 }]}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: coche, disabled: present }}
                accessibilityLabel={ex.nom}
                disabled={present}
                onPress={() => basculer(ex.id)}
                style={[styles.exCorps, present && { opacity: 0.38 }]}
              >
                <View style={styles.caseSlot}>
                  {present && !unique ? (
                    <Icone nom="check" couleur={couleurs.t3} taille={18} />
                  ) : !present ? (
                    <View
                      style={[
                        styles.rond,
                        coche ? { backgroundColor: couleurs.t1 } : { borderWidth: 1.5, borderColor: couleurs.t2 },
                      ]}
                    >
                      {coche ? <Icone nom="check" couleur={couleurs.bg} taille={16} epaisseur={2.25} /> : null}
                    </View>
                  ) : null}
                </View>
                <Picto slug={ex.slug} nom={ex.nom} taille={40} photo={ex.photo_vignette} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nomLigne}>
                    <Texte variante="saisie" numberOfLines={1} style={{ fontSize: 15, flexShrink: 1 }}>
                      {ex.nom}
                    </Texte>
                    {ex.perso ? <EtiquettePerso coach={ex.coach} /> : null}
                  </View>
                  {detail ? (
                    <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ fontSize: 13 }}>
                      {detail}
                    </Texte>
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("exercices.choix.voirPage", { nom: ex.nom })}
                onPress={() => router.push({ pathname: "/progress/[id]", params: present || unique ? { id: ex.id } : { id: ex.id, ajout: "1" } })}
                style={styles.info}
              >
                <View style={[styles.filet, { backgroundColor: couleurs.line2 }]} />
                <Icone nom="right" couleur={couleurs.t3} taille={22} />
              </Pressable>
            </View>
          );
        }}
      />
      {choisis.length && !unique ? (
        <View style={[styles.basBarre, { paddingBottom: bas + espace.m, backgroundColor: couleurs.bg }]}>
          <BoutonPrincipal libelle={tp("exercices.choix.ajouterN", choisis.length)} onPress={valider} />
        </View>
      ) : null}
      {remplacement ? (
        <Feuille
          visible={candidat != null}
          onFermer={() => setCandidat(null)}
          pied={<BoutonPrincipal libelle={t("exercices.choix.remplacer")} onPress={remplacerPar} />}
        >
          <View style={styles.entete}>
            <Texte variante="titreBarre" numberOfLines={2} style={{ textAlign: "center" }}>
              {candidat?.nom}
            </Texte>
            <Texte variante="corps" couleur="t2" style={{ textAlign: "center" }}>
              {t("exercices.choix.remplace", { nom: remplacement.nom })}
            </Texte>
          </View>
          <Groupe>
            {remplacement.nbValidees > 0 ? (
              <View style={styles.case}>
                <View style={{ flex: 1 }}>
                  <Texte variante="saisie" style={{ fontSize: 15 }}>
                    {t("exercices.choix.garderSeries")}
                  </Texte>
                  <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
                    {tp("communs.serie", remplacement.nbValidees)}, {remplacement.nom}
                  </Texte>
                </View>
                <Interrupteur valeur={garder} onChange={setGarder} libelle={t("exercices.choix.garderSeries")} />
              </View>
            ) : null}
            {remplacement.routineNom ? (
              <View style={[styles.case, remplacement.nbValidees > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }]}>
                <View style={{ flex: 1 }}>
                  <Texte variante="saisie" style={{ fontSize: 15 }}>
                    {t("exercices.choix.aussiRoutine")}
                  </Texte>
                  <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
                    {remplacement.routineNom}
                  </Texte>
                </View>
                <Interrupteur valeur={aussiRoutine} onChange={setAussiRoutine} libelle={t("exercices.choix.aussiRoutine")} />
              </View>
            ) : null}
          </Groupe>
        </Feuille>
      ) : null}
      <FeuilleEquipement
        visible={feuillet === "equipement"}
        onFermer={() => setFeuillet(null)}
        filtre={filtre}
        valeur={equipements}
        onChange={setEquipements}
      />
      <FeuilleMuscle
        visible={feuillet === "muscle"}
        onFermer={() => setFeuillet(null)}
        filtre={filtre}
        valeur={muscles}
        onChange={setMuscles}
        secondaires={secondaires}
        onSecondaires={setSecondaires}
      />
      <Feuille visible={feuillet === "salle"} onFermer={() => setFeuillet(null)} titre={t("exercices.choix.salle")}>
        <SallesChoix filtre={filtre} salles={salles} valeur={salleId} onChoisir={(id) => (setSalleId(id), setFeuillet(null))} />
      </Feuille>
      <FormulaireExercice
        visible={creation}
        onFermer={() => setCreation(false)}
        nomInitial={nomDepuisRecherche(texte)}
        muscleInitial={muscles[0] ?? null}
        onFini={(id) => creer(id)}
        onOuvrirExistant={(id) => {
          // Nom en double (D13) : la page de l'exercice existant, d'où « Ajouter l'exercice » le coche ici.
          setCreation(false);
          router.push({ pathname: "/progress/[id]", params: unique ? { id } : { id, ajout: "1" } });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  vide: { marginHorizontal: espace.l, marginTop: espace.l, borderRadius: rayon.xl, padding: espace.xl, gap: espace.l },
  masques: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  haut: { paddingHorizontal: espace.l, paddingTop: espace.m, gap: espace.m },
  recherche: { height: 48, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  puces: { flexDirection: "row", flexWrap: "wrap", gap: espace.s },
  puce: { height: 36, borderRadius: rayon.m, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 4 },
  titre: { flexDirection: "row", alignItems: "baseline", gap: espace.s, paddingHorizontal: espace.l, paddingTop: espace.l, paddingBottom: espace.s },
  groupesCadre: { marginHorizontal: -espace.l, flexGrow: 0 },
  groupes: { paddingHorizontal: espace.l, gap: 6 },
  groupeZone: { height: 44, justifyContent: "center" },
  groupe: { height: 36, borderRadius: rayon.m, paddingHorizontal: espace.m, flexDirection: "row", alignItems: "center", gap: 6 },
  groupeTexte: { fontSize: 13 },
  ex: { minHeight: 64, flexDirection: "row", alignItems: "center", paddingLeft: espace.xl, paddingRight: espace.xs },
  exCorps: { flex: 1, minHeight: 64, flexDirection: "row", alignItems: "center", gap: espace.l, paddingVertical: espace.m, paddingRight: espace.m },
  nomLigne: { flexDirection: "row", alignItems: "center", gap: espace.s },
  info: { width: 48 + StyleSheet.hairlineWidth, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  filet: { position: "absolute", left: 0, top: 8, bottom: 8, width: StyleSheet.hairlineWidth },
  caseSlot: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  rond: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  basBarre: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: espace.l, paddingTop: espace.m },
  actions: { flexDirection: "row", gap: espace.s },
  entete: { gap: 2, marginBottom: espace.m, alignItems: "center" },
  case: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
});

/** Feuille à choix multiples : « Afficher N exercices » en orange (seul geste principal), « Effacer » tonal (D12). */
function FeuilleMulti({
  visible, onFermer, titre, n, onEffacer, children,
}: { visible: boolean; onFermer: () => void; titre: string; n: number; onEffacer: () => void; children: React.ReactNode }) {
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={titre}
      pied={
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Bouton libelle={t("exercices.choix.effacer")} onPress={onEffacer} large />
          </View>
          <View style={{ flex: 2 }}>
            <Bouton variante="primaire" large libelle={tp("exercices.choix.afficherN", n)} onPress={onFermer} />
          </View>
        </View>
      }
    >
      {children}
    </Feuille>
  );
}

function Case({ libelle, n, choisi, onPress, premier }: { libelle: string; n: number; choisi: boolean; onPress: () => void; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: choisi }}
      accessibilityLabel={`${libelle}, ${n}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.case,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      <Texte variante="saisie" style={{ flex: 1, fontSize: 15, opacity: n === 0 && !choisi ? 0.38 : 1 }}>
        {libelle}
      </Texte>
      <Texte variante="meta" couleur="t2">
        {n}
      </Texte>
      <View style={[styles.rond, choisi ? { backgroundColor: couleurs.t1 } : { borderWidth: 1.5, borderColor: couleurs.t2 }]}>
        {choisi ? <Icone nom="check" couleur={couleurs.bg} taille={16} epaisseur={2.25} /> : null}
      </View>
    </Pressable>
  );
}

function basculer<T>(l: T[], v: T): T[] {
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
}

function FeuilleEquipement({ visible, onFermer, filtre, valeur, onChange }: {
  visible: boolean; onFermer: () => void; filtre: FiltreExercices; valeur: Equipement[]; onChange: (v: Equipement[]) => void;
}) {
  const { db } = useApp();
  const [compteurs, setCompteurs] = useState<{ equipement: Equipement; n: number }[]>([]);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!visible) return;
    compteursEquipement(db, filtre).then(setCompteurs).catch(() => {});
    compterExercices(db, filtre).then(setN).catch(() => {});
  }, [db, visible, filtre]);
  const liste = useMemo(() => {
    const m = new Map(compteurs.map((c) => [c.equipement, c.n]));
    const tous = Object.keys(LIBELLE_EQUIPEMENT) as Equipement[];
    return tous.map((e) => ({ e, n: m.get(e) ?? 0 })).filter((x) => x.n > 0 || valeur.includes(x.e));
  }, [compteurs, valeur]);
  return (
    <FeuilleMulti visible={visible} onFermer={onFermer} titre={t("exercices.choix.equipement")} n={n} onEffacer={() => onChange([])}>
      <Groupe>
        {liste.map((x, i) => (
          <Case key={x.e} premier={i === 0} libelle={LIBELLE_EQUIPEMENT[x.e]} n={x.n} choisi={valeur.includes(x.e)} onPress={() => onChange(basculer(valeur, x.e))} />
        ))}
      </Groupe>
    </FeuilleMulti>
  );
}

function FeuilleMuscle({ visible, onFermer, filtre, valeur, onChange, secondaires, onSecondaires }: {
  visible: boolean; onFermer: () => void; filtre: FiltreExercices; valeur: string[]; onChange: (v: string[]) => void;
  secondaires: boolean; onSecondaires: (v: boolean) => void;
}) {
  const { db } = useApp();
  const [compteurs, setCompteurs] = useState<{ muscle: string; n: number }[]>([]);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!visible) return;
    // Ordre alphabétique de la langue (SQL trie les octets : « Épaules » passait après « Triceps »).
    compteursMuscle(db, filtre).then((l) => setCompteurs([...l].sort((a, b) => libelleMuscle(a.muscle).localeCompare(libelleMuscle(b.muscle), locale())))).catch(() => {});
    compterExercices(db, filtre).then(setN).catch(() => {});
  }, [db, visible, filtre]);
  return (
    <FeuilleMulti visible={visible} onFermer={onFermer} titre={t("exercices.choix.muscle")} n={n} onEffacer={() => onChange([])}>
      <Groupe>
        <View style={styles.case}>
          <Texte variante="saisie" style={{ flex: 1, fontSize: 15 }}>
            {t("exercices.choix.inclureSecondaires")}
          </Texte>
          <Interrupteur valeur={secondaires} onChange={onSecondaires} libelle={t("exercices.choix.inclureSecondaires")} />
        </View>
        {compteurs.map((c) => (
          <Case key={c.muscle} libelle={libelleMuscle(c.muscle)} n={c.n} choisi={valeur.includes(c.muscle)} onPress={() => onChange(basculer(valeur, c.muscle))} />
        ))}
      </Groupe>
    </FeuilleMulti>
  );
}

/** Choix unique, appliqué au toucher : pas d'orange (D12). Les compteurs disent combien d'exercices la salle rend possibles. */
function SallesChoix({ filtre, salles, valeur, onChoisir }: {
  filtre: FiltreExercices; salles: SalleResume[]; valeur: string | null; onChoisir: (id: string | null) => void;
}) {
  const { db } = useApp();
  const [c, setC] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    compteursSalle(db, filtre).then((l) => setC(new Map(l.map((x) => [x.salleId, x.n])))).catch(() => {});
  }, [db, filtre]);
  return (
    <Groupe>
      <Option premier libelle={t("exercices.choix.toutesSalles")} choisi={!valeur} onPress={() => onChoisir(null)} />
      {salles.map((s) => (
        <Option key={s.id} libelle={s.nom} aide={tp("exercices.choix.faisables", c.get(s.id) ?? 0)} choisi={valeur === s.id} onPress={() => onChoisir(s.id)} />
      ))}
    </Groupe>
  );
}
