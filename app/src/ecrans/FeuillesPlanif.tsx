import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RAPPELS_MIN } from "../db";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { parties } from "../i18n/temps";
import { minusculeInitiale as minuscule, t } from "../i18n/index";
import { analyser, phraseRegle, suggerer, texteMorceaux, texteRegle, type Analyse } from "../i18n/planif-saisie";
import { useLangue } from "../i18n/useLangue";
import { Bouton } from "../ui/Bouton";
import { BoutonPrincipal } from "../ui/Degrade";
import { ListeDesintegrable } from "../ui/Desintegration";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { GlisserSupprimer } from "../ui/GlisserSupprimer";
import { Icone, type NomIcone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { RoueDuree } from "../ui/RoueDuree";
import { Texte } from "../ui/Texte";
import { dureeCourte, jourLong, jourMois, jourSemaineMois } from "./format";
import { midi } from "./Planif";
import type { LigneJour, Planning } from "./planif-donnees";
import { ajouterJ, HORIZON_J, occurrences, type Occurrence, type Programmation, type Regle } from "./planification";

// Feuilles de la planification (planche v7, écrans 6 à 19) : programmer, règles d'une routine, rappel, ⋯ d'une séance,
// « Cette séance seulement / Toute la série », décaler, routine d'un jour, réglages du profil (heure et rappel par défaut).

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number) => String(n).padStart(2, "0");

/** Minutes depuis minuit, maintenant, dans le fuseau choisi. */
const minutesMaintenant = () => {
  const q = parties(Date.now());
  return q.h * 60 + q.min;
};

/** Les `n` prochaines dates d'une règle (à partir de maintenant). */
export function prochainesDates(r: Regle, p: Pick<Planning, "aujourdhui" | "heureDefaut">, n = 3): Occurrence[] {
  const prog: Programmation = { id: "", routineId: "", texte: "", regle: r, actif: true, rappelMin: null, ordre: 0 };
  const h = minutesMaintenant();
  const maintenant = `${pad(Math.floor(h / 60))}:${pad(h % 60)}`;
  return occurrences([prog], [], p.aujourdhui, ajouterJ(p.aujourdhui, HORIZON_J), p.heureDefaut)
    .filter((o) => o.date > p.aujourdhui || o.heure > maintenant)
    .slice(0, n);
}

/** Ligne de feuille avec une valeur à droite (« Programmation   Tous les lundis +1 › »). */
export function LigneValeur({
  icone,
  libelle,
  valeur,
  chevron,
  premier = true,
  onPress,
}: {
  icone?: NomIcone;
  libelle: string;
  valeur?: string;
  chevron?: boolean;
  premier?: boolean;
  onPress: () => void;
}) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={valeur ? `${libelle}, ${valeur}` : libelle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      {icone ? <Icone nom={icone} couleur={couleurs.t2} /> : null}
      <Texte variante="saisie" style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>
        {libelle}
      </Texte>
      {valeur ? (
        <Texte variante="libelle" couleur="t2" numberOfLines={1} style={{ flexShrink: 1 }}>
          {valeur}
        </Texte>
      ) : null}
      {chevron ? <Icone nom="right" couleur={couleurs.t2} taille={18} /> : null}
    </Pressable>
  );
}


/**
 * Champ de saisie libre : aide (vide), aperçu compris (touché = Ajouter), bordure rouge et proposition « Tu veux dire : … ? »
 * (incompris ; touchée, elle remplit le champ) ; puis « Ajouter ».
 */
export function ChampProgrammation({
  p,
  autoFocus,
  placeholder,
  aide,
  onAjouter,
}: {
  p: Pick<Planning, "aujourdhui" | "heureDefaut">;
  autoFocus?: boolean;
  placeholder: string;
  /** Aide sous le champ vide. */
  aide: boolean;
  onAjouter: (texte: string, a: Analyse) => void;
}) {
  const { langue } = useLangue();
  const { couleurs } = useTheme();
  const [texte, setTexte] = useState("");
  const a = useMemo(() => (texte.trim() ? analyser(texte, p.aujourdhui, minutesMaintenant()) : null), [texte, p.aujourdhui]);
  const ko = texte.trim() !== "" && !a;
  // Incomprise : la lecture la plus proche, en une phrase touchable qui remplit le champ (retour du 29/10).
  const proposition = useMemo(() => (ko ? suggerer(texte, p.aujourdhui, minutesMaintenant()) : null), [ko, texte, p.aujourdhui]);
  const ajouter = () => {
    if (!a) return;
    onAjouter(texte.trim(), a);
    setTexte("");
  };
  const dates = a ? prochainesDates(a.regle, p) : [];
  const unique = a?.regle.freq === "unique";
  const heure = a?.regle.heure ?? p.heureDefaut;
  const d = a
    ? [
        ...a.corrections.map((c) => `${c.de} → ${c.vers}`),
        ...(unique ? [t("planif.uneSeuleFois")] : dates.map((o) => jourSemaineMois(midi(o.date)))),
      ].join(", ")
    : "";
  return (
    <View style={{ gap: espace.m }}>
      <TextInput
        maxFontSizeMultiplier={POLICE_MAX}
        value={texte}
        onChangeText={setTexte}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={couleurs.t3}
        cursorColor={couleurs.action}
        selectionColor={couleurs.action}
        returnKeyType="done"
        onSubmitEditing={ajouter}
        accessibilityLabel={placeholder}
        style={[styles.champ, typo.saisie, { backgroundColor: couleurs.feuilleGroupe, color: couleurs.t1 }, ko && { borderWidth: 1.5, borderColor: couleurs.rate }]}
      />
      {a ? (
        <Pressable accessibilityRole="button" onPress={ajouter} style={({ pressed }) => [styles.compris, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}>
          <View style={styles.comprisQ}>
            <Icone nom={unique ? "cal" : "repeat"} couleur={couleurs.t2} taille={18} />
            <Texte variante="exercice" style={{ flexShrink: 1 }}>
              {phraseRegle(a.regle, langue).map((m, i) => (
                <Text maxFontSizeMultiplier={POLICE_MAX} key={i} style={m.corrige ? { textDecorationLine: "underline", textDecorationStyle: "dotted" } : undefined}>
                  {m.texte}
                </Text>
              ))}
              <Text maxFontSizeMultiplier={POLICE_MAX} style={{ color: a.heureSaisie ? couleurs.t1 : couleurs.t3, fontFamily: police.regular }}>, {heure}</Text>
            </Texte>
          </View>
          <Texte variante="corps" couleur="t2" style={{ marginLeft: 18 + espace.s }}>
            {d}
          </Texte>
        </Pressable>
      ) : proposition ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setTexte(texteRegle(proposition.regle, langue))}
          style={({ pressed }) => [styles.compris, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
        >
          <View style={styles.comprisQ}>
            <Icone nom="info" couleur={couleurs.t2} taille={18} />
            <Texte variante="corps" style={{ flexShrink: 1 }}>
              {t("planif.tuVeuxDire", {
                phrase: `${minuscule(texteMorceaux(phraseRegle(proposition.regle, langue)))}, ${proposition.regle.heure ?? p.heureDefaut}`,
              })}
            </Texte>
          </View>
        </Pressable>
      ) : aide && !texte ? (
        <Texte variante="meta" couleur="t3" style={styles.aide}>
          {t("planif.aide")}
        </Texte>
      ) : null}
      {aide || texte ? <BoutonPrincipal libelle={t("planif.ajouter")} desactive={!a} onPress={ajouter} /> : null}
    </View>
  );
}

/** « Programmer X » : routine sans règle, le champ s'ouvre clavier sorti. */
export function FeuilleProgrammer({
  routine,
  p,
  onFermer,
  onAjouter,
}: {
  routine: { id: string; nom: string } | null;
  p: Planning | undefined;
  onFermer: () => void;
  onAjouter: (routineId: string, texte: string, regle: Regle) => void;
}) {
  useLangue();
  return (
    <Feuille visible={routine != null && p != null} onFermer={onFermer} titre={routine ? t("planif.programmerNom", { nom: routine.nom }) : undefined}>
      {routine && p ? (
        <ChampProgrammation p={p} autoFocus aide placeholder={t("planif.exemple")} onAjouter={(texte, a) => onAjouter(routine.id, texte, a.regle)} />
      ) : (
        <View />
      )}
    </Feuille>
  );
}

/** Valeur lue du rappel d'une routine (null = celui du profil). */
export function rappelTexte(min: number | null, defautMin: number): string {
  if (min == null) return t("planif.parDefautVal", { v: rappelCourt(defautMin) });
  return rappelCourt(min);
}
export const rappelCourt = (min: number) => (min === 0 ? t("planif.aucunRappel") : dureeCourte(min * 60));

/** Règles d'une routine : une par ligne (interrupteur, balayage = suppression), rappel, champ « Ajouter une règle ». */
export function FeuilleRegles({
  routine,
  p,
  cachees,
  bulle,
  onFermer,
  onActiver,
  onSupprimer,
  onAjouter,
  onRappel,
}: {
  routine: { id: string; nom: string } | null;
  p: Planning | undefined;
  cachees: ReadonlySet<string>;
  bulle: ReactNode;
  onFermer: () => void;
  onActiver: (prog: Programmation, actif: boolean) => void;
  onSupprimer: (prog: Programmation) => void;
  onAjouter: (routineId: string, texte: string, regle: Regle) => void;
  onRappel: () => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const regles = p && routine ? p.progs.filter((x) => x.routineId === routine.id && !cachees.has(x.id)).sort((a, b) => a.ordre - b.ordre) : [];
  const rappel = regles[0]?.rappelMin ?? null;
  return (
    <Feuille visible={routine != null && p != null} onFermer={onFermer} titre={routine?.nom}>
      {routine && p ? (
        <>
          <Texte variante="entete" couleur="t3" style={styles.libelle}>
            {t("planif.programmation")}
          </Texte>
          {/* Une règle supprimée se désintègre (planche suppression-animee), comme toute ligne glissée-supprimée ; la dernière
              aussi : le groupe reste là le temps qu'elle sorte. */}
          <ListeDesintegrable
            liste={regles}
            cleDe={(r) => r.id}
            autour={(e) => <Groupe>{e}</Groupe>}
            rendu={(r, etat) => {
              const i = regles.indexOf(r);
              const proch = r.actif ? prochainesDates(r.regle, p, 1)[0] : undefined;
              return (
                <GlisserSupprimer actif={etat !== "sort"} cle={r.id} fondContenu={couleurs.feuilleGroupe} onSupprimer={() => onSupprimer(r)}>
                  <View style={[styles.regle, i !== 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }]}>
                    <Icone nom={r.regle.freq === "unique" ? "cal" : "repeat"} couleur={r.actif ? couleurs.t2 : couleurs.t3} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texte variante="saisie" style={{ fontSize: 15, color: r.actif ? couleurs.t1 : couleurs.t3 }}>
                        {majuscule(r.texte)}
                      </Texte>
                      <Texte variante="meta" couleur="t3">
                        {r.actif ? (proch ? jourSemaineMois(midi(proch.date)) : "") : t("planif.enPause")}
                      </Texte>
                    </View>
                    <Interrupteur valeur={r.actif} onChange={(v) => onActiver(r, v)} libelle={majuscule(r.texte)} />
                  </View>
                </GlisserSupprimer>
              );
            }}
          />
          {regles.length ? (
            <Groupe>
              <LigneValeur icone="horloge" libelle={t("planif.rappel")} valeur={rappelTexte(rappel, p.rappelDefautMin)} chevron onPress={onRappel} />
            </Groupe>
          ) : null}
          <ChampProgrammation p={p} aide={regles.length === 0} placeholder={t("planif.ajouterRegle")} onAjouter={(texte, a) => onAjouter(routine.id, texte, a.regle)} />
          {bulle ? <View style={{ height: 52 }}>{bulle}</View> : null}
        </>
      ) : (
        <View />
      )}
    </Feuille>
  );
}

/** Valeurs de la roue de rappel d'une routine : -1 = par défaut, 0 = aucun, puis les durées. */
const RAPPELS_ROUTINE = [-1, ...RAPPELS_MIN];

/** Roue « Rappel » d'une routine : Par défaut, Aucun ou une durée ; vaut pour toutes ses règles. */
export function FeuilleRappel({
  routine,
  valeur,
  onFermer,
  onValider,
}: {
  routine: { nom: string } | null;
  valeur: number | null;
  onFermer: () => void;
  onValider: (min: number | null) => void;
}) {
  useLangue();
  const [v, setV] = useState(valeur ?? -1);
  useEffect(() => setV(valeur ?? -1), [valeur, routine]);
  const lu = (x: number) => (x === -1 ? t("planif.parDefaut") : rappelCourt(x));
  return (
    <Feuille
      visible={routine != null}
      onFermer={onFermer}
      titre={t("planif.rappel")}
      sousTitre={routine?.nom}
      glisserContenu={false}
      pied={<BoutonPrincipal libelle={t("ui.valider")} onPress={() => onValider(v === -1 ? null : v)} />}
    >
      {routine ? (
        <RoueDuree valeur={valeur ?? -1} onChange={setV} libelle={t("planif.rappel")} valeurs={RAPPELS_ROUTINE} decoupe={(x) => ({ attenue: "", plein: lu(x) })} lue={lu} traits={false} />
      ) : (
        <View />
      )}
    </Feuille>
  );
}

/**
 * ⋯ d'une séance faite : Voir, Modifier (Début, fin et durée), Supprimer de l'historique. Une séance à venir n'a plus de ⋯ : sa carte ouvre le récap commun
 * (planche ajout-seance-v2), où l'on modifie (jour, heure, durée, lieu), annule ou ajoute à ses routines.
 */
export function FeuilleSeance({ l, onFermer, onVoir, onModifier, onSupprimer }: { l: LigneJour | null; onFermer: () => void; onVoir: () => void; onModifier?: () => void; onSupprimer: () => void }) {
  useLangue();
  const nom = l?.genre === "faite" ? l.seance.titre : undefined;
  const jour = l?.genre === "faite" ? jourLong(l.seance.debut) + " " + jourMois(l.seance.debut) : "";
  return (
    // Le sous-titre est celui de la feuille : posé en enfant avec une marge négative, il était rogné par le défilement (planche Effort, écart 2).
    <Feuille visible={l != null} onFermer={onFermer} titre={nom} sousTitre={jour || undefined}>
      <Groupe>
        <LigneValeur icone="history" libelle={t("planif.voirSeance")} chevron onPress={onVoir} />
        {/* Une séance faite se retouche d'ici (planche Effort, D7) : muscu, la page Modifier ; sport ou sortie GPS, les Horaires. */}
        {onModifier && l?.genre === "faite" ? <Option icone="crayon" libelle={t("horaires.modifier")} aide={t("horaires.modifierAide")} onPress={onModifier} /> : null}
      </Groupe>
      <Groupe>
        <Option premier icone="trash" danger libelle={t("planif.supprimerHisto")} onPress={onSupprimer} />
      </Groupe>
    </Feuille>
  );
}

export type Choix = { libelle: string; valeur?: string; danger?: boolean; onPress: () => void };

/** Feuille à deux choix (« Cette séance seulement » / « Toute la série »). */
export function FeuilleChoix({ titre, sous, choix, onFermer }: { titre: string | null; sous?: string; choix: Choix[]; onFermer: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Feuille visible={titre != null} onFermer={onFermer} titre={titre ?? undefined} sousTitre={sous}>
      <Groupe>
        {choix.map((c, i) => (
          <Pressable
            key={c.libelle}
            accessibilityRole="button"
            onPress={c.onPress}
            style={({ pressed }) => [
              styles.option,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
              pressed && { backgroundColor: couleurs.s3 },
            ]}
          >
            <Texte variante="saisie" style={{ flex: 1, fontSize: 15, color: c.danger ? couleurs.rate : couleurs.t1 }}>
              {c.libelle}
            </Texte>
            {c.valeur ? (
              <Texte variante="libelle" couleur="t2">
                {c.valeur}
              </Texte>
            ) : null}
          </Pressable>
        ))}
      </Groupe>
    </Feuille>
  );
}

const HEURES = Array.from({ length: 24 }, (_, i) => i);
const QUARTS = [0, 15, 30, 45];

/** Profil › Réglages › Séance : « Heure par défaut », deux roues (heures, minutes par quart d'heure). */
export function FeuilleHeure({
  visible,
  valeur,
  titre,
  minutes = QUARTS,
  onFermer,
  onValider,
}: {
  visible: boolean;
  valeur: string;
  /** Sans titre : « Heure par défaut » (agenda : « Heure de la séance »). */
  titre?: string;
  /** Minutes proposées par la roue : le quart d'heure par défaut, toutes les minutes pour une heure exacte (un verre d'eau). */
  minutes?: number[];
  onFermer: () => void;
  onValider: (h: string) => void;
}) {
  useLangue();
  const [h0, m0] = valeur.split(":").map(Number) as [number, number];
  const [h, setH] = useState(h0);
  const [m, setM] = useState(m0);
  useEffect(() => {
    if (!visible) return;
    setH(h0);
    setM(minutes.reduce((a, b) => (Math.abs(b - m0) < Math.abs(a - m0) ? b : a)));
  }, [visible, h0, m0, minutes]);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={titre ?? t("planif.heureDefaut")}
      glisserContenu={false}
      pied={<Bouton libelle={t("ui.valider")} variante="primaire" large onPress={() => onValider(`${pad(h)}:${pad(m)}`)} />}
    >
      {visible ? (
        <View style={{ flexDirection: "row", gap: espace.s }}>
          <View style={{ flex: 1 }}>
            <RoueDuree valeur={h0} onChange={setH} libelle={t("planif.heures")} valeurs={HEURES} decoupe={(x) => ({ attenue: "", plein: pad(x) })} lue={pad} traits={false} />
          </View>
          <View style={{ flex: 1 }}>
            <RoueDuree valeur={m0} onChange={setM} libelle={t("planif.minutes")} valeurs={minutes} decoupe={(x) => ({ attenue: "", plein: pad(x) })} lue={pad} traits={false} />
          </View>
        </View>
      ) : (
        <View />
      )}
    </Feuille>
  );
}

/** Profil › Réglages › Séance : « Rappel avant la séance » (roue). */
export function FeuilleRappelDefaut({ visible, valeur, onFermer, onValider }: { visible: boolean; valeur: number; onFermer: () => void; onValider: (min: number) => void }) {
  useLangue();
  const [v, setV] = useState(valeur);
  useEffect(() => {
    if (visible) setV(valeur);
  }, [visible, valeur]);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("planif.rappelAvant")}
      glisserContenu={false}
      pied={<Bouton libelle={t("ui.valider")} variante="primaire" large onPress={() => onValider(v)} />}
    >
      {visible ? (
        <RoueDuree valeur={valeur} onChange={setV} libelle={t("planif.rappelAvant")} valeurs={[...RAPPELS_MIN]} decoupe={(x) => ({ attenue: "", plein: rappelCourt(x) })} lue={rappelCourt} traits={false} />
      ) : (
        <View />
      )}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  libMes: { marginTop: espace.m, marginHorizontal: 4 },
  rien: { alignItems: "center", paddingTop: espace.l },
  lienCreer: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: espace.s, paddingHorizontal: espace.l },
  option: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  libelle: { paddingHorizontal: espace.xs, marginBottom: -espace.xs },
  champ: { height: 52, borderRadius: rayon.l, paddingHorizontal: espace.l, paddingVertical: 0 },
  compris: { borderRadius: rayon.l, padding: espace.l, gap: espace.xs },
  comprisQ: { flexDirection: "row", alignItems: "center", gap: espace.s },
  aide: { paddingHorizontal: espace.xs },
  regle: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  lettres: { flexDirection: "row" },
  lettre: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: police.semibold },
  semaine: { flexDirection: "row" },
});
