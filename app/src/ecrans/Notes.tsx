// Notes d'un exercice (comme Hevy), autant qu'on veut par type : d'exercice (épinglées), de routine (épinglées à la routine),
// de séance (cette séance). La pastille « Note » ajoute toujours une note du type par défaut ; l'icône d'une note ouvre « Type de note ».
// Une note affichée et la même en édition ont exactement la même place, police, taille, interligne et couleur.
// Suppression comme partout (GRILLE 3, revue finale n° 8) : glisser la note vers la gauche, puis « Supprimer » ; elle se
// désintègre et « Note supprimée · Annuler » prend sa place 8 s avant la suppression pour de bon. Le menu du type de note
// (lecteur d'écran) et une note vidée passent par le même chemin.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import type { Note, TypeNote } from "../db";
import { minuscule, t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, typo } from "../theme/typo";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { Pastille } from "../ui/Cadre";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone, type NomIcone } from "../ui/Icone";
import { ListeDesintegrable, marquerSuppression } from "../ui/Desintegration";
import { signalerErreur } from "../ui/FeuilleMessage";
import { GlisserSupprimer } from "../ui/GlisserSupprimer";
import { duree } from "../theme/mouvement";
import { useCouleurPartie } from "../ui/ContextePartie";

const ICONE_NOTE: Record<TypeNote, NomIcone> = { exercice: "pin", routine: "clippin", seance: "page" };
/** « Annuler » reste proposé ce temps-là (comme les séries de la séance). */
const DELAI_ANNULER_MS = 8000;

/** Libellés évalués à la lecture (getters) : ils suivent la langue active. */
export const INFO_NOTE = Object.fromEntries(
  (["exercice", "routine", "seance"] as const).map((type) => [
    type,
    {
      get libelle() { return t(`exercices.notes.${type}.libelle`); },
      icone: ICONE_NOTE[type],
      get aide() { return t(`exercices.notes.${type}.aide`); },
      get placeholder() { return t(`exercices.notes.${type}.placeholder`); },
    },
  ]),
) as Record<TypeNote, { libelle: string; icone: NomIcone; aide: string; placeholder: string }>;

/** Note en cours d'écriture : `id` null = nouvelle note, pas encore enregistrée. */
interface Edition {
  id: string | null;
  type: TypeNote;
  texte: string;
}

/** Ce qu'on sait déjà d'une note enregistrée mais pas encore rechargée. */
interface Surcharge {
  texte?: string;
  type?: TypeNote;
  supprimee?: boolean;
}

export function NotesExercice({
  types,
  defaut,
  notes,
  precedente,
  pastilles,
  onAjouter,
  onModifier,
  onChangerType,
}: {
  /** Types permis dans ce contexte, dans l'ordre d'affichage. */
  types: TypeNote[];
  defaut: TypeNote;
  notes: Note[];
  /** Notes de séance de la séance précédente : tant qu'il n'y a pas de note de séance, un champ vide les porte en placeholder. */
  precedente?: string | null;
  /** Autres pastilles, sur la même rangée que « Note » (repos…). */
  pastilles?: ReactNode;
  onAjouter: (type: TypeNote, texte: string) => Promise<unknown>;
  /** `texte` null = note supprimée. */
  onModifier: (id: string, texte: string | null) => Promise<unknown>;
  onChangerType: (id: string, vers: TypeNote) => Promise<unknown>;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  const [edition, setEditionEtat] = useState<Edition | null>(null);
  const [feuille, setFeuille] = useState<{ id: string | null; type: TypeNote; visible: boolean } | null>(null);
  const [surcharges, setSurcharges] = useState<Record<string, Surcharge>>({});
  const [ajoutees, setAjoutees] = useState<Note[]>([]);
  const editionRef = useRef(edition);
  const setEdition = (e: Edition | null) => {
    editionRef.current = e;
    setEditionEtat(e);
  };
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const champs = useRef<Record<string, TextInputInstance | null>>({});
  const cleEdition = edition ? (edition.id ?? "nouvelle") : null;
  useEffect(() => {
    if (cleEdition) champs.current[cleEdition]?.focus();
  }, [cleEdition]);
  const signature = notes.map((n) => `${n.id}:${n.type}:${n.texte}`).join("|");
  useEffect(() => {
    setSurcharges({});
    setAjoutees([]);
  }, [signature]);

  const enFile = (f: () => Promise<unknown>) => {
    file.current = file.current.then(f).catch(signalerErreur());
  };
  const surcharge = (id: string, s: Surcharge) => setSurcharges((x) => ({ ...x, [id]: { ...x[id], ...s } }));

  // Note supprimée en attente : cachée tout de suite, retirée de la base après le délai d'« Annuler » (ou dès qu'une autre
  // note est supprimée, ou que l'écran se ferme).
  const [enAttente, setEnAttente] = useState<string | null>(null);
  const attente = useRef<{ id: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const modifier = useRef(onModifier);
  modifier.current = onModifier;
  const confirmer = () => {
    const x = attente.current;
    if (!x) return;
    clearTimeout(x.minuterie);
    attente.current = null;
    surcharge(x.id, { supprimee: true });
    enFile(() => modifier.current(x.id, null));
  };
  const confirmerRef = useRef(confirmer);
  confirmerRef.current = confirmer;
  useEffect(() => () => confirmerRef.current(), []);
  /** La note est déjà marquée (désintégration) par l'appelant. */
  const supprimerNote = (id: string) => {
    confirmer();
    const minuterie = setTimeout(() => {
      confirmerRef.current();
      setEnAttente((e) => (e === id ? null : e));
    }, DELAI_ANNULER_MS);
    attente.current = { id, minuterie };
    setEnAttente(id);
  };
  const annulerSuppression = () => {
    const x = attente.current;
    if (!x) return;
    clearTimeout(x.minuterie);
    attente.current = null;
    setEnAttente(null);
  };

  // Notes à afficher : celles de la base avec ce qu'on vient d'y faire, puis celles qu'on vient d'ajouter.
  const lignes = [...notes, ...ajoutees]
    .map((n) => {
      const s = surcharges[n.id];
      return s?.supprimee || n.id === enAttente ? null : { ...n, texte: s?.texte ?? n.texte, type: s?.type ?? n.type };
    })
    .filter((n): n is Note => !!n && types.includes(n.type))
    .sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type));

  const enregistrer = (e: Edition) => {
    const texte = e.texte.trim();
    if (e.id === null) {
      if (!texte) return;
      setAjoutees((x) => [...x, { id: `attente-${Date.now()}-${x.length}`, type: e.type, texte, position: 1e9 }]);
      enFile(() => onAjouter(e.type, texte));
      return;
    }
    const avant = lignes.find((n) => n.id === e.id);
    if (!avant || texte === avant.texte) return;
    if (!texte) {
      marquerSuppression(e.id);
      supprimerNote(e.id);
      return;
    }
    surcharge(e.id, { texte });
    enFile(() => onModifier(e.id!, texte));
  };
  const finEdition = (cle: string | null) => {
    const e = editionRef.current;
    if (!e || (e.id ?? "nouvelle") !== cle) return;
    enregistrer(e);
    setEdition(null);
  };

  const ouvrir = (e: Edition) => {
    const en = editionRef.current;
    if (en) finEdition(en.id ?? "nouvelle");
    setEdition(e);
  };

  const champSeance = !!precedente && types.includes("seance") && !lignes.some((n) => n.type === "seance");
  const nouvelle = edition?.id === null ? edition : champSeance ? ({ id: null, type: "seance", texte: "" } as Edition) : null;

  const choisir = (vers: TypeNote) => {
    const f = feuille;
    setFeuille(f && { ...f, visible: false });
    if (!f || f.type === vers) return;
    if (f.id === null) {
      setEdition({ id: null, type: vers, texte: editionRef.current?.texte ?? "" });
      return;
    }
    const id = f.id;
    if (editionRef.current?.id === id) finEdition(id);
    surcharge(id, { type: vers });
    enFile(() => onChangerType(id, vers));
  };
  const supprimer = () => {
    const f = feuille;
    setFeuille(f && { ...f, visible: false });
    if (!f) return;
    if (f.id === null) {
      setEdition(null);
      return;
    }
    const id = f.id;
    if (editionRef.current?.id === id) setEdition(null);
    marquerSuppression(id, duree.feuilleSortie);
    supprimerNote(id);
  };

  const ligne = (cle: string, type: TypeNote, id: string | null, contenu: ReactNode) => (
    <View key={cle} style={styles.note}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("exercices.notes.changerType", { type: INFO_NOTE[type].libelle })}
        hitSlop={{ left: 10, right: 10 }}
        onPress={() => setFeuille({ id, type, visible: true })}
        style={styles.icone}
      >
        <Icone nom={INFO_NOTE[type].icone} couleur={couleurs.t3} taille={16} />
      </Pressable>
      {contenu}
    </View>
  );
  const styleNote = [typo.note, styles.texteNote, { color: couleurs.t2 }];

  return (
    <>
      <View style={styles.pastilles}>
        {pastilles}
        <Pastille icone="noteplus" libelle={t("exercices.notes.pastille")} onPress={() => (editionRef.current?.id === null ? setEdition({ ...editionRef.current, type: editionRef.current.type }) : ouvrir({ id: null, type: defaut, texte: "" }))} />
      </View>
      <ListeDesintegrable
        liste={lignes}
        cleDe={(n) => n.id}
        rendu={(n) => {
          const enEdition = edition?.id === n.id;
          const contenu = ligne(
            n.id,
            n.type,
            n.id,
            enEdition ? (
              <TextInput
                maxFontSizeMultiplier={POLICE_MAX}
                ref={(r) => {
                  champs.current[n.id] = r;
                }}
                value={edition.texte}
                onChangeText={(texte) => setEdition({ ...edition, texte })}
                onBlur={() => finEdition(n.id)}
                multiline
                cursorColor={accent}
                accessibilityLabel={INFO_NOTE[n.type].libelle}
                style={[...styleNote, styles.contenu]}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("exercices.notes.modifier", { type: minuscule(INFO_NOTE[n.type].libelle) })}
                onPress={() => ouvrir({ id: n.id, type: n.type, texte: n.texte })}
                style={styles.contenu}
              >
                <Text maxFontSizeMultiplier={POLICE_MAX} style={styleNote}>{n.texte}</Text>
              </Pressable>
            ),
          );
          // Pas de glissé pendant l'écriture (le doigt sélectionne le texte) ; transparent : la carte de l'exercice garde son fond.
          return (
            <GlisserSupprimer cle={n.id} actif={() => editionRef.current?.id !== n.id} fondContenu="transparent" style={styles.glisse} onSupprimer={() => supprimerNote(n.id)}>
              {contenu}
            </GlisserSupprimer>
          );
        }}
      />
      {enAttente ? <BandeauAnnuler texte={t("exercices.notes.supprimee")} onAnnuler={annulerSuppression} /> : null}
      {nouvelle
        ? ligne(
            "nouvelle",
            nouvelle.type,
            null,
            <TextInput
              maxFontSizeMultiplier={POLICE_MAX}
              ref={(r) => {
                champs.current.nouvelle = r;
              }}
              value={edition?.id === null ? edition.texte : ""}
              onChangeText={(texte) => setEdition({ id: null, type: nouvelle.type, texte })}
              onFocus={() => {
                if (editionRef.current?.id !== null) setEdition({ id: null, type: nouvelle.type, texte: "" });
              }}
              onBlur={() => finEdition("nouvelle")}
              multiline
              placeholder={nouvelle.type === "seance" && precedente ? precedente : INFO_NOTE[nouvelle.type].placeholder}
              placeholderTextColor={couleurs.t3}
              cursorColor={accent}
              accessibilityLabel={INFO_NOTE[nouvelle.type].libelle}
              style={[...styleNote, styles.contenu]}
            />,
          )
        : null}
      <Feuille visible={!!feuille?.visible} onFermer={() => setFeuille(feuille && { ...feuille, visible: false })} titre={t("exercices.notes.typeDeNote")}>
        <Groupe>
          {types.map((type, i) => (
            <Option key={type} premier={i === 0} icone={INFO_NOTE[type].icone} libelle={INFO_NOTE[type].libelle} aide={INFO_NOTE[type].aide} choisi={feuille?.type === type} onPress={() => choisir(type)} />
          ))}
        </Groupe>
        <Groupe>
          <Option premier danger icone="trash" libelle={t("exercices.notes.supprimer")} onPress={supprimer} />
        </Groupe>
      </Feuille>
    </>
  );
}

const styles = StyleSheet.create({
  pastilles: { flexDirection: "row", alignItems: "center", gap: espace.s, flexWrap: "wrap" },
  // Ligne glissable : le cadre déborde de 10 de chaque côté, pour garder la zone de 44 de l'icône (hitSlop) dans le cadre coupé.
  glisse: { marginHorizontal: -10, paddingHorizontal: 10 },
  note: { flexDirection: "row", gap: espace.s, alignItems: "flex-start" },
  // Icône de 16 px, zone de 44 px avec le hitSlop.
  icone: { width: 24, minHeight: 44, alignItems: "center", paddingTop: 14 },
  // Affichage et édition : mêmes marges (11 + interligne 22 + 11 = 44), sans fond ni cadre, pour que rien ne bouge au toucher.
  contenu: { flex: 1, minHeight: 44, paddingVertical: 11, paddingHorizontal: 0, margin: 0 },
  texteNote: { includeFontPadding: false, textAlignVertical: "top" },
});
