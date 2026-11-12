// Fiche d'un complément (planche sante-suivi, D10) : dose (texte libre), fréquence, moment, début, fin, notes, les 7
// derniers jours, l'historique ; « Noter la prise » ; rappel en option (D11). Hors du médical (31/10, D3) : plus de
// blessure liée, un complément n'est pas un soin.
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import {
  lireTraitement, modifierTraitement, noterPrise, prisesEntre, type Moment, type Traitement,
} from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { rafraichirRappelsTraitements } from "../natif/rappels-traitements";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, rayon, typo } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { BoutonIcone } from "../ui/Cadre";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { FeuilleHeure } from "./FeuillesPlanif";
import { ajouterJ } from "./planification";
import { jourDe } from "./planif-donnees";
import { dateCourte, dateLongue, ecrireFrequence, HEURE_MOMENT, jourCourtDe, libelleMoment, lireFrequence, septJours, texteFrequence, type Frequence } from "./suivi-calc";
import { FeuilleChoix, FeuilleJour, FeuilleTexte } from "./suivi-feuilles";
import { heureMaintenant } from "./Traitements";
import { Boutons, EcranSuivi, Filet, Groupe, Ligne, SignatureNotes, styles as s, suppressionDemandee, TitreGroupe } from "./suivi-ui";

const MOMENTS: readonly (Moment | null)[] = ["matin", "midi", "soir", "coucher", null];
type Ouverte = "nom" | "dose" | "frequence" | "moment" | "debut" | "fin" | "heure" | null;

export function FicheTraitement({ id }: { id: string }) {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const auj = jourDe(Date.now());
  const [d, recharger] = useCharge(
    async (x) => ({ traitement: await lireTraitement(x, id), prises: await prisesEntre(x, ajouterJ(auj, -6), auj) }),
    [id, auj],
  );
  const [ouverte, setOuverte] = useState<Ouverte>(null);
  const [notes, setNotes] = useState<string | null>(null);
  useEffect(() => setNotes(null), [d?.traitement?.notes]);
  const fermer = () => setOuverte(null);
  const ecrire = (p: Promise<unknown>) =>
    p
      .then(recharger)
      .then(() => rafraichirRappelsTraitements(db, { demander: true }))
      .catch(console.error);
  const x = d?.traitement;
  if (!d || !x) return <EcranSuivi titre="">{null}</EcranSuivi>;
  const modifier = (patch: Parameters<typeof modifierTraitement>[2]) => {
    fermer();
    ecrire(modifierTraitement(db, id, patch));
  };
  const sept = septJours(id, d.prises, auj);
  const besoin = lireFrequence(x.frequence).genre === "besoin";

  return (
    <EcranSuivi titre={x.nom} droite={<BoutonIcone nom="crayon" libelle={t("suivi.modifier")} onPress={() => setOuverte("nom")} />}>
      <Groupe style={{ marginTop: 14 }}>
        <Ligne titre={t("suivi.dose")} valeur={x.dose ?? "—"} doux onPress={() => setOuverte("dose")} />
        <Filet />
        <Ligne titre={t("suivi.frequence")} valeur={texteFrequence(x)} doux onPress={() => setOuverte("frequence")} />
        <Filet />
        <Ligne titre={t("suivi.moment")} valeur={libelleMoment(x.moment)} doux onPress={() => setOuverte("moment")} />
        <Filet />
        <Ligne titre={t("suivi.debut")} valeur={dateLongue(x.debut)} doux onPress={() => setOuverte("debut")} />
        <Filet />
        <Ligne titre={t("suivi.fin")} valeur={x.fin ? dateLongue(x.fin) : t("suivi.aucuneFin")} doux onPress={() => setOuverte("fin")} />
      </Groupe>

      <TitreGroupe texte={t("suivi.notes")} />
      <Groupe>
        <View style={styles.notes}>
          <TextInput
            maxFontSizeMultiplier={POLICE_MAX}
            value={notes ?? x.notes ?? ""}
            onChangeText={setNotes}
            onBlur={() => notes != null && notes.trim() !== (x.notes ?? "") && ecrire(modifierTraitement(db, id, { notes }))}
            multiline
            placeholder={t("suivi.notesVides")}
            placeholderTextColor={couleurs.t3}
            cursorColor={couleurs.partieSante}
            selectionColor={couleurs.partieSante}
            accessibilityLabel={t("suivi.notes")}
            style={[typo.note, { color: couleurs.t1, padding: 0, minHeight: 44, textAlignVertical: "top" }]}
          />
          {x.notes && x.notes_auteur && x.notes_maj ? <SignatureNotes cle="suivi.notesAjoutees" auteur={x.notes_auteur} date={dateCourte(jourDe(x.notes_maj))} /> : null}
        </View>
      </Groupe>

      <TitreGroupe texte={t("suivi.prises")} droite={t("suivi.prisesSur7", { n: sept.filter((j) => j.pris).length })} />
      <Groupe>
        <View style={styles.sept}>
          {sept.map((j, i) => (
            <View key={j.jour} style={{ flex: 1, alignItems: "center" }} accessible accessibilityLabel={`${jourCourtDe(j.jour)} ${j.pris ? t("suivi.priseNotee", { heure: "" }).trim() : t("suivi.nonPris")}`}>
              <View style={[styles.jour, { backgroundColor: j.pris ? `${couleurs.partieSante}38` : couleurs.s2 }]}>
                {j.pris ? <Icone nom="check" couleur={couleurs.partieSante} taille={16} epaisseur={2.4} /> : null}
              </View>
              <Texte variante="meta" couleur="t2" style={{ fontSize: 11, marginTop: 6 }}>
                {i === 6 ? t("suivi.aujCourt") : jourCourtDe(j.jour)}
              </Texte>
            </View>
          ))}
        </View>
        <Filet />
        <Ligne titre={t("suivi.historique")} onPress={() => router.push("/traitements/prises")} />
      </Groupe>
      <View style={s.plein}>
        <BoutonPrincipal libelle={t("suivi.notePrise")} icone="check" onPress={() => ecrire(noterPrise(db, id, auj, heureMaintenant()))} />
      </View>

      {besoin ? null : (
        <>
          <TitreGroupe texte={t("suivi.rappel")} />
          <Groupe>
            <Ligne
              titre={t("suivi.rappel")}
              chevron={false}
              valeur={<Interrupteur valeur={x.rappel != null} libelle={t("suivi.rappel")} onChange={(v) => ecrire(modifierTraitement(db, id, { rappel: v ? HEURE_MOMENT[x.moment ?? "matin"] : null }))} />}
            />
            {x.rappel ? (
              <>
                <Filet />
                <Ligne titre={t("suivi.rappelHeure")} valeur={x.rappel} doux onPress={() => setOuverte("heure")} />
              </>
            ) : null}
          </Groupe>
        </>
      )}

      <Groupe style={{ marginTop: espace.xxl }}>
        <Ligne
          titre={t("suivi.supprimer")}
          rouge
          centre
          chevron={false}
          onPress={() => {
            suppressionDemandee.traitement = { id, nom: x.nom };
            router.back();
          }}
        />
      </Groupe>

      <FeuilleTexte visible={ouverte === "nom"} titre={t("suivi.nom")} valeur={x.nom} onFermer={fermer} onValider={(v) => modifier({ nom: v })} />
      <FeuilleTexte visible={ouverte === "dose"} titre={t("suivi.dose")} valeur={x.dose ?? ""} indice={t("suivi.doseExemple")} onFermer={fermer} onValider={(v) => modifier({ dose: v })} />
      <FeuilleFrequence visible={ouverte === "frequence"} x={x} onFermer={fermer} onValider={(frequence, max_jour) => modifier({ frequence, max_jour })} />
      <FeuilleChoix
        visible={ouverte === "moment"}
        titre={t("suivi.moment")}
        onFermer={fermer}
        choix={MOMENTS.map((m) => ({ cle: m ?? "-", libelle: libelleMoment(m), choisi: (x.moment ?? null) === m, onPress: () => modifier({ moment: m }) }))}
      />
      <FeuilleJour visible={ouverte === "debut"} titre={t("suivi.dateDebut")} valeur={x.debut} onFermer={fermer} onValider={(j) => modifier({ debut: j })} />
      <FeuilleJour
        visible={ouverte === "fin"}
        titre={t("suivi.dateFin")}
        valeur={x.fin ?? auj}
        onFermer={fermer}
        onValider={(j) => modifier({ fin: j < x.debut ? x.debut : j })}
        autre={x.fin ? { libelle: t("suivi.aucuneFin"), onPress: () => modifier({ fin: null }) } : undefined}
      />
      <FeuilleHeure visible={ouverte === "heure"} valeur={x.rappel ?? "08:00"} onFermer={fermer} onValider={(h) => modifier({ rappel: h })} />
    </EcranSuivi>
  );
}

const JOURS = [1, 2, 3, 4, 5, 6, 7];
const MAX = [0, 1, 2, 3, 4];

/** Fréquence : tous les jours, certains jours (à cocher), si besoin (et combien par jour au plus). */
function FeuilleFrequence({ visible, x, onFermer, onValider }: { visible: boolean; x: Traitement; onFermer: () => void; onValider: (f: string, max: number | null) => void }) {
  const { couleurs } = useTheme();
  const [f, setF] = useState<Frequence>(lireFrequence(x.frequence));
  const [max, setMax] = useState(x.max_jour ?? 0);
  useEffect(() => {
    if (!visible) return;
    setF(lireFrequence(x.frequence));
    setMax(x.max_jour ?? 0);
  }, [visible, x.frequence, x.max_jour]);
  const jours = f.genre === "jours" ? f.jours : [];
  const basculer = (n: number) => {
    const l = jours.includes(n) ? jours.filter((j) => j !== n) : [...jours, n].sort();
    setF(l.length ? { genre: "jours", jours: l } : { genre: "jours", jours: [] });
  };
  const valide = f.genre !== "jours" || f.jours.length > 0;
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("suivi.frequence")}
      pied={<Bouton libelle={t("suivi.valider")} variante="primaire" large desactive={!valide} onPress={() => onValider(ecrireFrequence(f), f.genre === "besoin" && max > 0 ? max : null)} />}
    >
      <Boutons
        options={[
          { valeur: "jour", libelle: t("suivi.frequence.jour") },
          { valeur: "jours", libelle: t("suivi.frequence.jours") },
          { valeur: "besoin", libelle: t("suivi.frequence.besoin") },
        ]}
        valeur={f.genre === "semaine" ? null : f.genre}
        onChange={(g) => setF(g === "jours" ? { genre: "jours", jours: jours.length ? jours : [1, 3, 5] } : { genre: g as "jour" | "besoin" })}
        style={{ marginHorizontal: 0, marginTop: 0 }}
      />
      {f.genre === "jours" ? (
        <View style={styles.choixJours}>
          {JOURS.map((n) => {
            const on = jours.includes(n);
            const j = ajouterJ("2026-10-26", n - 1);
            return (
              <View key={n} style={{ flex: 1 }}>
                <Bouton libelle={jourCourtDe(j)} variante="tonal" onPress={() => basculer(n)} />
                <View pointerEvents="none" style={[styles.marque, { backgroundColor: on ? couleurs.partieSante : "transparent" }]} />
              </View>
            );
          })}
        </View>
      ) : null}
      {f.genre === "besoin" ? (
        <Boutons
          options={MAX.map((n) => ({ valeur: String(n), libelle: n ? String(n) : t("suivi.frequence.sansMax") }))}
          valeur={String(max)}
          onChange={(v) => setMax(Number(v))}
          style={{ marginHorizontal: 0, marginTop: espace.m }}
        />
      ) : null}
      {f.genre === "besoin" && max > 0 ? (
        <Texte variante="meta" couleur="t2" style={{ marginTop: espace.s, textAlign: "center" }}>
          {t("suivi.frequence.max", { n: max })}
        </Texte>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  notes: { paddingHorizontal: espace.l, paddingVertical: 14 },
  sept: { flexDirection: "row", gap: 6, paddingHorizontal: espace.l, paddingVertical: 14 },
  jour: { alignSelf: "stretch", height: 36, borderRadius: rayon.s, alignItems: "center", justifyContent: "center" },
  choixJours: { flexDirection: "row", gap: 4, marginTop: espace.m },
  marque: { height: 3, borderRadius: 2, marginTop: 4, marginHorizontal: 10 },
});
