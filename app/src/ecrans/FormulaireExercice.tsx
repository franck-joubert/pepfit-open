import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  ALLURES, ajouterNote, changerNature, creerExercice, creerVariante, EQUIPEMENTS, evaluerChangementNature, exerciceDuNom, INFO_NATURE, LIBELLE_ALLURE,
  LIBELLE_EQUIPEMENT, libelleMuscle, listerNotes, MACHINES, modifierExercice, modifierNote, NATURES, allureParDefaut, supprimerNote, type Allure,
  type Equipement, type Exercice, type Nature, type PhotoExercice, type VerdictNature,
} from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { effacerPhotoExercice, prendrePhotoExercice } from "../photos/exercices";
import type { Source } from "../photos";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, rayon, typo } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { Persos } from "../ui/Persos";
import { musclesAllumes } from "../ui/persos-calc";
import { FeuilleTempo } from "../ui/RoueDuree";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { CartePhoto, EtapeMachine, EtapeMuscles, EtapePhoto, type RoleMuscle } from "./formulaire-etapes";
import { lireTempo, TEMPO_OFF, tempoApplicable, tempoDefaut, tempoTexte } from "./tempo";

type Etape = "form" | "photo" | "nature" | "equipement" | "machine" | "muscles" | "allure";

/** Équipements qui ouvrent l'étape Machine (D4). */
const AVEC_MACHINE: readonly Equipement[] = ["machine", "poulie", "smith"];

/** Modification faite en séance : « Annuler » du toast la défait ; `confirmer`, à la fin du toast, efface l'ancienne photo. */
export interface AnnulationExercice {
  annuler: () => Promise<void>;
  confirmer: () => void;
}

interface Props {
  visible: boolean;
  onFermer: () => void;
  /** Exercice à modifier ; absent : création. */
  exercice?: Exercice | null;
  nomInitial?: string;
  muscleInitial?: string | null;
  /** Ouvert depuis la séance (D3) : type de saisie verrouillé, « La séance continue », modification annulable. */
  enSeance?: boolean;
  /** Nom en double (D13) : « Ouvrir mon exercice ». Absent : le lien ne s'affiche pas. */
  onOuvrirExistant?: (id: string) => void;
  /** Exercice perso : « Lier à un exercice du catalogue » (ou « Dissocier ») ouvre FeuilleLien ; absent : la ligne ne s'affiche pas. */
  onLier?: () => void;
  /** Création : id du nouvel exercice. Édition : id de l'exercice modifié, ou de la variante créée (D10). En séance, `annulation`. */
  onFini: (id: string, variante: boolean, annulation?: AnnulationExercice) => void;
}

/** `suite` : en t2 dans le même texte que la valeur (« Grand dorsal · +2 », planche creer-4), pour ne pas la couper trop tôt. */
const LIGNE = ({ titre, valeur, suite, onPress, vide, droite }: { titre: string; valeur: string; suite?: string; onPress: () => void; vide?: boolean; droite?: ReactNode }) => {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titre} : ${valeur}`}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <Texte variante="corps" couleur="t2" style={styles.titreLigne}>
        {titre}
      </Texte>
      <Texte variante="saisie" couleur={vide ? "t3" : "t1"} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>
        {valeur}
        {suite ? <Texte variante="corps" couleur="t2" style={{ fontSize: 13 }}>{` ${suite}`}</Texte> : null}
      </Texte>
      {droite ? <View style={{ marginLeft: -espace.xs }}>{droite}</View> : null}
      <Icone nom="right" couleur={couleurs.t3} taille={18} />
    </Pressable>
  );
};

/** Ligne verrouillée en séance (D3) : la valeur, « Se change après la séance », un cadenas ; rien ne s'ouvre. */
const LIGNE_VERROU = ({ titre, valeur }: { titre: string; valeur: string }) => {
  const { couleurs } = useTheme();
  return (
    <View accessible accessibilityLabel={`${titre} : ${valeur}. ${t("exercices.formulaire.verrou")}`} style={[styles.ligne, { paddingVertical: espace.m }]}>
      <Texte variante="corps" couleur="t2" style={styles.titreLigne}>
        {titre}
      </Texte>
      <View style={{ flex: 1 }}>
        <Texte variante="saisie" couleur="t2" style={{ fontSize: 15 }} numberOfLines={1}>
          {valeur}
        </Texte>
        <Texte variante="meta" couleur="t2" style={{ marginTop: 2 }}>
          {t("exercices.formulaire.verrou")}
        </Texte>
      </View>
      <Icone nom="cadenas" couleur={couleurs.t2} taille={18} />
    </View>
  );
};

const secondairesDe = (e: Exercice | null | undefined) => (e?.secondaires ? e.secondaires.split("|").filter(Boolean) : []);
const photoDe = (e: Exercice | null | undefined): PhotoExercice | null => (e?.photo && e.photo_vignette ? { photo: e.photo, vignette: e.photo_vignette } : null);

/**
 * Création et édition d'un exercice (planche exercices-perso, v3) : photo, nom, type de saisie, équipement et machine,
 * muscles (principal et secondaires), note d'exercice, allure, tempo. Les étapes se succèdent dans la même feuille ; le tempo
 * s'ouvre dans sa propre feuille (FeuilleTempo), le formulaire caché le temps du réglage.
 * Tempo (29/10) : seulement pour une nature à répétitions ; interrupteur allumé par défaut, éteint = « off » ; allumé,
 * sa valeur (null = défaut de la famille, réglé dans Guidage). Une fiche du catalogue l'ouvre aussi (« … » de la fiche).
 * Photos prises puis abandonnées (formulaire fermé, photo changée) : effacées du téléphone.
 */
export function FormulaireExercice({ visible, onFermer, exercice, nomInitial, muscleInitial, enSeance = false, onOuvrirExistant, onLier, onFini }: Props) {
  const { db, reglages } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const [etape, setEtape] = useState<Etape>("form");
  const [nom, setNom] = useState("");
  const [nature, setNature] = useState<Nature>("poids_reps");
  const [equipement, setEquipement] = useState<Equipement>("autre");
  const [machineId, setMachineId] = useState<string | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [secondaires, setSecondaires] = useState<string[]>([]);
  const [allure, setAllure] = useState<Allure>("km");
  const [photo, setPhoto] = useState<PhotoExercice | null>(null);
  const [note, setNote] = useState("");
  const [noteInitiale, setNoteInitiale] = useState<{ id: string; texte: string } | null>(null);
  const [verdict, setVerdict] = useState<VerdictNature | null>(null);
  const [tempo, setTempo] = useState<string | null>(null);
  const [reglageTempo, setReglageTempo] = useState(false);
  const [doublon, setDoublon] = useState<string | null>(null);
  const [refus, setRefus] = useState(false);
  // Brouillon de l'étape Muscles : appliqué par Valider, oublié par la flèche de retour.
  const [brouillon, setBrouillon] = useState<{ p: string | null; s: string[]; role: RoleMuscle }>({ p: null, s: [], role: "principal" });
  /** Photos prises pendant ce formulaire : celles qui ne sont pas enregistrées s'effacent à la fermeture. */
  const prises = useRef<PhotoExercice[]>([]);
  const garde = useRef<PhotoExercice | null>(null);

  useEffect(() => {
    if (!visible) {
      for (const p of prises.current) if (p.photo !== garde.current?.photo) effacerPhotoExercice(p);
      prises.current = [];
      garde.current = null;
      return;
    }
    setEtape("form");
    setNom(exercice?.nom ?? nomInitial ?? "");
    setNature(exercice?.nature ?? "poids_reps");
    setEquipement(exercice?.equipement ?? "autre");
    setMachineId(exercice?.machine_id ?? null);
    setMuscle(exercice ? exercice.muscle : (muscleInitial ?? null));
    setSecondaires(secondairesDe(exercice));
    setAllure(exercice?.allure ?? allureParDefaut(exercice?.slug));
    setTempo(exercice?.tempo ?? null);
    setPhoto(photoDe(exercice));
    setNote("");
    setNoteInitiale(null);
    setReglageTempo(false);
    setDoublon(null);
    setRefus(false);
    if (exercice)
      listerNotes(db, { exerciceId: exercice.id }, "exercice")
        .then((n) => {
          if (!n[0]) return;
          setNote(n[0].texte);
          setNoteInitiale({ id: n[0].id, texte: n[0].texte });
        })
        .catch(() => {});
  }, [visible, exercice, nomInitial, muscleInitial, db]);

  // D10 : on dit avant ce qui se passe quand la nature change sur un exercice existant.
  useEffect(() => {
    if (!exercice || nature === exercice.nature) return setVerdict(null);
    evaluerChangementNature(db, exercice.id, nature).then(setVerdict).catch(() => {});
  }, [db, exercice, nature]);

  const modifie = !!exercice && nature !== exercice.nature;
  const variante = modifie && verdict?.mode === "variante";
  const valide = nom.trim().length > 0 && !doublon;
  // Défaut de la famille, d'après le nom et le muscle saisis (mêmes règles qu'en séance).
  const tempoFamille = tempoDefaut({ nom, slug: exercice?.slug ?? null, muscle }, reglages.tempos);
  const tempoAllume = tempo !== TEMPO_OFF;
  const tempoPropre = lireTempo(tempo);
  const allumes = musclesAllumes(muscle, secondaires);
  const machine = machineId ? MACHINES.find((m) => m.id === machineId) : null;

  /** D13 : le nom en double se voit à la sortie du champ. */
  const verifierNom = async () => {
    const n = nom.trim();
    const id = n ? await exerciceDuNom(db, n, exercice?.id) : null;
    setDoublon(id);
    return id;
  };

  const prendre = async (source: Source) => {
    try {
      const f = await prendrePhotoExercice(source);
      if (!f) return;
      prises.current.push(f);
      setPhoto(f);
      setRefus(false);
      setEtape("form");
    } catch (e) {
      if (e instanceof Error && e.message === "permission") setRefus(true);
      else console.error(e);
    }
  };

  /** Note d'exercice (D14) : la première note de l'exercice, créée, changée ou retirée (texte vide). */
  const ecrireNote = async (id: string): Promise<(() => Promise<void>) | null> => {
    const texte = note.trim();
    if (noteInitiale) {
      if (texte === noteInitiale.texte) return null;
      await modifierNote(db, noteInitiale.id, texte);
      const avant = noteInitiale.texte;
      return texte
        ? () => modifierNote(db, noteInitiale.id, avant)
        : async () => void (await ajouterNote(db, { exerciceId: id }, "exercice", avant));
    }
    if (!texte) return null;
    const nid = await ajouterNote(db, { exerciceId: id }, "exercice", texte);
    return nid ? () => supprimerNote(db, nid) : null;
  };

  const enregistrer = async () => {
    const n = nom.trim();
    if (!n || (await verifierNom())) return;
    const al = nature === "distance_duree" ? allure : undefined;
    const mid = AVEC_MACHINE.includes(equipement) ? machineId : null;
    garde.current = photo;
    if (!exercice) {
      const id = await creerExercice(db, { nom: n, muscle: muscle ?? undefined, secondaires, equipement, nature, allure: al, tempo, photo, machineId: mid });
      await ecrireNote(id);
      onFini(id, false);
      return;
    }
    if (variante) {
      const v = await creerVariante(db, exercice.id, nature, n === exercice.nom ? undefined : n);
      if (v) {
        await modifierExercice(db, v, { equipement, muscle, secondaires, allure: al ?? null, tempo, photo, machineId: mid });
        await ecrireNote(v);
        onFini(v, true);
      }
      return;
    }
    if (modifie) await changerNature(db, exercice.id, nature);
    const ancienne = await modifierExercice(db, exercice.id, {
      nom: n, muscle, secondaires, equipement, allure: nature === "distance_duree" ? allure : null, aVerifier: false, tempo, photo, machineId: mid,
    });
    const defaireNote = await ecrireNote(exercice.id);
    if (!enSeance) {
      effacerPhotoExercice(ancienne);
      onFini(exercice.id, false);
      return;
    }
    // D3 : « Annuler » remet l'exercice tel qu'il était ; l'ancienne photo reste sur le téléphone jusqu'à la fin du toast.
    const avant = exercice;
    const nouvelle = photo;
    onFini(exercice.id, false, {
      annuler: async () => {
        await modifierExercice(db, avant.id, {
          nom: avant.nom, muscle: avant.muscle, secondaires: secondairesDe(avant), equipement: avant.equipement, allure: avant.allure,
          tempo: avant.tempo, photo: photoDe(avant), machineId: avant.machine_id,
        });
        await defaireNote?.();
        if (nouvelle && nouvelle.photo !== avant.photo) effacerPhotoExercice(nouvelle);
      },
      confirmer: () => effacerPhotoExercice(ancienne),
    });
  };

  const retour = () => setEtape("form");
  const ouvrirMuscles = () => {
    setBrouillon({ p: muscle, s: secondaires, role: muscle ? "secondaires" : "principal" });
    setEtape("muscles");
  };
  const titre =
    etape === "form"
      ? t(exercice ? "exercices.formulaire.modifier" : "exercices.formulaire.nouveau")
      : etape === "photo"
        ? t("exercices.photo.titreExercice")
        : etape === "machine"
          ? t("exercices.machine.titre")
          : etape === "muscles"
            ? t("exercices.muscles.titre")
            : t(`exercices.formulaire.${etape}` as "exercices.formulaire.nature");

  return (
    <>
    <Feuille
      visible={visible && !reglageTempo}
      onFermer={onFermer}
      titre={titre}
      onRetour={etape === "form" ? undefined : retour}
      pied={
        etape === "muscles" ? (
          <Bouton
            large
            variante="primaire"
            libelle={t("exercices.muscles.valider")}
            onPress={() => {
              setMuscle(brouillon.p);
              setSecondaires(brouillon.s);
              retour();
            }}
          />
        ) : undefined
      }
    >
      {etape === "form" ? (
        <>
          <CartePhoto photo={photo} onPress={() => setEtape("photo")} />
          <View>
            <View style={[styles.champ, { backgroundColor: couleurs.feuilleGroupe }, doublon ? { borderColor: couleurs.rate } : null]}>
              <TextInput
                maxFontSizeMultiplier={POLICE_MAX}
                value={nom}
                onChangeText={(v) => {
                  setNom(v);
                  if (doublon) setDoublon(null);
                }}
                onBlur={() => void verifierNom().catch(() => {})}
                placeholder={t("exercices.formulaire.nom")}
                placeholderTextColor={couleurs.t3}
                cursorColor={couleurs.action}
                selectionColor={couleurs.action}
                accessibilityLabel={t("exercices.formulaire.nom")}
                accessibilityHint={doublon ? t("exercices.formulaire.doublon") : undefined}
                style={[typo.saisie, { flex: 1, color: couleurs.t1, padding: 0, height: 48, fontFamily: "Inter-Regular" }]}
              />
            </View>
            {doublon ? (
              <View style={styles.erreur}>
                <View accessibilityLiveRegion="polite" style={styles.erreurLigne}>
                  <Icone nom="alerte" couleur={couleurs.rate} taille={18} />
                  <Texte variante="corps" style={{ color: couleurs.rate, flex: 1 }}>
                    {t("exercices.formulaire.doublon")}
                  </Texte>
                </View>
                {onOuvrirExistant ? (
                  <Pressable accessibilityRole="link" onPress={() => onOuvrirExistant(doublon)} style={styles.lien}>
                    <Texte variante="libelle" style={{ fontFamily: "Inter-SemiBold", textDecorationLine: "underline" }}>
                      {t("exercices.formulaire.ouvrirExistant")}
                    </Texte>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
          <Groupe>
            {enSeance && exercice ? (
              <LIGNE_VERROU titre={t("exercices.formulaire.nature")} valeur={INFO_NATURE[nature].libelle} />
            ) : (
              <LIGNE titre={t("exercices.formulaire.nature")} valeur={INFO_NATURE[nature].libelle} onPress={() => setEtape("nature")} />
            )}
            <Separateur />
            <LIGNE
              titre={t("exercices.formulaire.equipement")}
              valeur={machine && AVEC_MACHINE.includes(equipement) ? machine.nom : LIBELLE_EQUIPEMENT[equipement]}
              onPress={() => setEtape("equipement")}
            />
            <Separateur />
            <LIGNE
              titre={t("exercices.formulaire.muscle")}
              valeur={allumes.length ? libelleMuscle(allumes[0]!) : t("exercices.formulaire.aucun")}
              vide={!allumes.length}
              onPress={ouvrirMuscles}
              suite={allumes.length > 1 ? `+${allumes.length - 1}` : undefined}
              droite={<Persos principal={muscle} secondaires={secondaires} hauteur={44} />}
            />
            {nature === "distance_duree" ? (
              <>
                <Separateur />
                <LIGNE titre={t("exercices.formulaire.allure")} valeur={LIBELLE_ALLURE[allure]} onPress={() => setEtape("allure")} />
              </>
            ) : null}
          </Groupe>
          <View style={[styles.champ, styles.note, { backgroundColor: couleurs.feuilleGroupe }]}>
            <View style={{ marginTop: 15 }}>
              <Icone nom="pin" couleur={couleurs.t2} taille={18} />
            </View>
            <TextInput
              maxFontSizeMultiplier={POLICE_MAX}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder={t("exercices.notes.exercice.placeholder")}
              placeholderTextColor={couleurs.t3}
              cursorColor={couleurs.action}
              selectionColor={couleurs.action}
              accessibilityLabel={t("exercices.notes.exercice.placeholder")}
              style={[typo.saisie, { flex: 1, color: couleurs.t1, paddingVertical: 14, paddingHorizontal: 0, minHeight: 48, fontFamily: "Inter-Regular" }]}
            />
          </View>
          {tempoApplicable(nature) ? (
            <Groupe>
              <View style={styles.ligne}>
                <Texte variante="corps" couleur="t2" style={{ flex: 1 }}>
                  {t("exercices.formulaire.tempo")}
                </Texte>
                <Interrupteur libelle={t("exercices.formulaire.tempo")} valeur={tempoAllume} onChange={(v) => setTempo(v ? null : TEMPO_OFF)} />
              </View>
              {tempoAllume ? (
                <>
                  <Separateur />
                  <LIGNE
                    titre={t("exercices.formulaire.tempoValeur")}
                    valeur={tempoPropre ? tempoTexte(tempoPropre) : tempoFamille}
                    suite={tempoPropre ? undefined : t("exercices.formulaire.tempoParDefaut")}
                    onPress={() => setReglageTempo(true)}
                  />
                </>
              ) : null}
            </Groupe>
          ) : null}
          {onLier && exercice?.perso && !enSeance ? (
            <Groupe>
              <Option premier libelle={t(exercice.lie_a ? "exercices.lien.dissocier" : "exercices.lien.relier")} onPress={onLier} chevron />
            </Groupe>
          ) : null}
          <Texte variante="meta" couleur="t2" style={{ paddingHorizontal: espace.s }}>
            {t("exercices.formulaire.enSeance")}{" "}
            {/* Les colonnes en majuscules, comme leurs en-têtes en séance (planche creer-4 : « KG, RÉPS »). */}
            <Texte variante="meta" couleur="t2" style={{ textTransform: typo.entete.textTransform }}>
              {INFO_NATURE[nature].colonnes.map((c) => c.etiquette).join(", ")}
            </Texte>
          </Texte>
          {enSeance && exercice ? (
            <View style={styles.info}>
              <Icone nom="info" couleur={couleurs.t2} taille={18} />
              <Texte variante="corps" couleur="t2" style={{ flex: 1 }}>
                <Texte variante="corps" style={{ fontFamily: "Inter-SemiBold" }}>
                  {t("exercices.formulaire.seanceContinue")}
                </Texte>
                {t("exercices.formulaire.seriesRestent")}
              </Texte>
            </View>
          ) : null}
          {modifie && verdict ? (
            <Texte variante="corps" couleur={variante ? "echauffement" : "t2"} style={{ paddingHorizontal: espace.s }}>
              {verdict.message}
              {variante ? ` ${t("exercices.formulaire.variante")}` : ""}
            </Texte>
          ) : null}
          <Bouton
            large
            variante="primaire"
            desactive={!valide}
            libelle={t(!exercice ? "exercices.formulaire.creer" : variante ? "exercices.formulaire.creerVariante" : "exercices.formulaire.enregistrer")}
            onPress={() => enregistrer().catch((e) => console.error(e))}
          />
        </>
      ) : null}
      {etape === "photo" ? (
        <>
          <EtapePhoto refus={refus} onPrendre={(s) => void prendre(s)} />
          {photo ? (
            <Groupe>
              <Option premier icone="efface" danger libelle={t("exercices.photo.retirer")} onPress={() => (setPhoto(null), retour())} />
            </Groupe>
          ) : null}
        </>
      ) : null}
      {etape === "nature" ? (
        <Groupe>
          {NATURES.map((n, i) => (
            <Option
              key={n}
              premier={i === 0}
              libelle={INFO_NATURE[n].libelle}
              aide={`${INFO_NATURE[n].colonnes.map((c) => c.etiquette).join(", ")} — ${INFO_NATURE[n].exemple}`}
              choisi={n === nature}
              onPress={() => {
                setNature(n);
                if (n === "distance_duree") setAllure(exercice?.allure ?? allureParDefaut(exercice?.slug));
                retour();
              }}
            />
          ))}
        </Groupe>
      ) : null}
      {etape === "equipement" ? (
        <Groupe>
          {EQUIPEMENTS.map((e, i) => (
            <Option
              key={e}
              premier={i === 0}
              libelle={LIBELLE_EQUIPEMENT[e]}
              choisi={e === equipement}
              chevron={AVEC_MACHINE.includes(e)}
              onPress={() => {
                setEquipement(e);
                if (!AVEC_MACHINE.includes(e)) setMachineId(null);
                setEtape(AVEC_MACHINE.includes(e) ? "machine" : "form");
              }}
            />
          ))}
        </Groupe>
      ) : null}
      {etape === "machine" ? <EtapeMachine machineId={machineId} onChoisir={(id) => (setMachineId(id), retour())} /> : null}
      {etape === "muscles" ? (
        <EtapeMuscles
          principal={brouillon.p}
          secondaires={brouillon.s}
          role={brouillon.role}
          onRole={(role) => setBrouillon((b) => ({ ...b, role }))}
          // Un premier principal choisi : le toucher suivant ajoute des secondaires.
          onChange={(p, s) => setBrouillon((b) => ({ p, s, role: b.role === "principal" && !b.p && p ? "secondaires" : b.role }))}
        />
      ) : null}
      {etape === "allure" ? (
        <Groupe>
          {ALLURES.map((a, i) => (
            <Option key={a} premier={i === 0} libelle={LIBELLE_ALLURE[a]} choisi={a === allure} onPress={() => (setAllure(a), retour())} />
          ))}
        </Groupe>
      ) : null}
    </Feuille>
    <FeuilleTempo
      visible={visible && reglageTempo}
      tempo={tempoPropre ? tempo : null}
      defaut={tempoFamille}
      onFermer={() => setReglageTempo(false)}
      onEnregistrer={(v) => {
        // null : retour au défaut de la famille (la feuille ne renvoie jamais un tempo égal à ce défaut).
        setTempo(v);
        setReglageTempo(false);
      }}
    />
    </>
  );
}

/** Filet entre deux lignes d'un groupe (couleur des filets d'Option). */
function Separateur() {
  const { couleurs } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: couleurs.line2 }} />;
}

const styles = StyleSheet.create({
  champ: { borderRadius: rayon.l, paddingHorizontal: espace.l, flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "transparent" },
  note: { alignItems: "flex-start", gap: espace.m, paddingTop: 0 },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  titreLigne: { width: 108 },
  erreur: { paddingHorizontal: espace.s, paddingTop: espace.s },
  erreurLigne: { flexDirection: "row", alignItems: "center", gap: espace.s },
  lien: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginLeft: 26 },
  info: { flexDirection: "row", gap: espace.s, alignItems: "center", paddingHorizontal: espace.s },
});
