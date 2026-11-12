// Fiche d'une blessure (planche sante-suivi) : statut en trois boutons (D4), zone, début, notes libres, chaque changement de
// statut avec sa date et son auteur, journal daté (D5), « Supprimer la blessure » en bas (D8). Aucun conseil : on note.
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import {
  ajouterAuJournal, changerStatut, corrigerDateStatut, lireBlessure, modifierBlessure, supprimerStatut, type ChangementStatut, type StatutBlessure,
} from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, typo } from "../theme/typo";
import { BoutonIcone } from "../ui/Cadre";
import { BoutonAjouterSerie } from "../ui/LigneSerie";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { jourDe } from "./planif-donnees";
import { auteurDe, dateCourte, dateLongue, depuisStatut, libelleStatut, STATUTS, texteSignes, zoneCourte } from "./suivi-calc";
import Svg, { Circle } from "react-native-svg";
import { COULEURS_MARQUE } from "../ui/3d/squelette";
import { FeuilleJour, FeuilleJournal, FeuilleTexte } from "./suivi-feuilles";
import { Auteur, Boutons, Carre, Douleur, EcranSuivi, Filet, Groupe, Ligne, SignatureNotes, suppressionDemandee, TitreGroupe } from "./suivi-ui";

export function FicheBlessure({ id }: { id: string }) {
  useLangue();
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const [f, recharger] = useCharge((d) => lireBlessure(d, id), [id]);
  const [nommer, setNommer] = useState(false);
  const [debut, setDebut] = useState(false);
  const [changement, setChangement] = useState<ChangementStatut | null>(null);
  const [journal, setJournal] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  useEffect(() => setNotes(null), [f?.blessure.notes]);
  const ecrire = (p: Promise<unknown>) => p.then(recharger).catch(console.error);
  const auj = jourDe(Date.now());
  if (f === undefined) return <EcranSuivi titre="">{null}</EcranSuivi>;
  if (f === null) return <EcranSuivi titre={t("suivi.blessures")}>{null}</EcranSuivi>;
  const b = f.blessure;
  const depuis = f.statuts[0]?.date ?? b.debut;
  const texteDepuis = depuisStatut(b.statut, depuis, auj);
  const dateDepuis = dateCourte(depuis);
  const [avant, apres] = texteDepuis.split(dateDepuis) as [string, string];
  const enregistrerNotes = () => {
    if (notes == null || notes.trim() === (b.notes ?? "")) return;
    ecrire(modifierBlessure(db, id, { notes }));
  };

  return (
    <EcranSuivi titre={b.titre} droite={<BoutonIcone nom="crayon" libelle={t("suivi.modifier")} onPress={() => setNommer(true)} />}>
      <Boutons
        options={STATUTS.map((x) => ({ valeur: x, libelle: libelleStatut(x), statut: x }))}
        valeur={b.statut}
        onChange={(x: StatutBlessure) => ecrire(changerStatut(db, id, x, auj))}
      />
      <Texte variante="corps" couleur="t2" style={styles.depuis}>
        {avant}
        <Texte variante="corps" style={{ fontFamily: police.medium, color: couleurs.t1 }}>
          {dateDepuis}
        </Texte>
        {apres}
      </Texte>
      <Groupe style={{ marginTop: 14 }}>
        <Ligne
          titre={t("suivi.zone")}
          sous={
            // une articulation le dit sous le titre, avec son anneau (planche articulations, D6)
            b.type === "articulation" ? (
              <View style={styles.typeArt}>
                <Svg width={12} height={12} viewBox="0 0 12 12">
                  <Circle cx={6} cy={6} r={4.2} fill="none" stroke={COULEURS_MARQUE[mode].ambre} strokeWidth={1.8} />
                  <Circle cx={6} cy={6} r={1.4} fill={COULEURS_MARQUE[mode].ambre} />
                </Svg>
                <Texte variante="meta" couleur="t2" style={{ fontSize: 12 }}>
                  {t("suivi.zone.articulation")}
                </Texte>
              </View>
            ) : undefined
          }
          valeur={zoneCourte(b.zone, b.cote)}
          doux
          onPress={() => router.push({ pathname: "/blessures/zone", params: { id } })}
        />
        <Filet />
        <Ligne titre={t("suivi.debut")} valeur={dateLongue(b.debut)} doux onPress={() => setDebut(true)} />
      </Groupe>

      <TitreGroupe texte={t("suivi.notes")} />
      <Groupe>
        <View style={styles.notes}>
          <TextInput
            maxFontSizeMultiplier={POLICE_MAX}
            value={notes ?? b.notes ?? ""}
            onChangeText={setNotes}
            onBlur={enregistrerNotes}
            multiline
            placeholder={t("suivi.notesVides")}
            placeholderTextColor={couleurs.t3}
            cursorColor={couleurs.partieSante}
            selectionColor={couleurs.partieSante}
            accessibilityLabel={t("suivi.notes")}
            style={[typo.note, { color: couleurs.t1, padding: 0, minHeight: 44, textAlignVertical: "top" }]}
          />
          {b.notes && b.notes_auteur && b.notes_maj ? <SignatureNotes cle="suivi.notesModifiees" auteur={b.notes_auteur} date={dateCourte(jourDe(b.notes_maj))} /> : null}
        </View>
      </Groupe>

      <TitreGroupe texte={t("suivi.statut.titre")} />
      <Groupe>
        {f.statuts.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Filet /> : null}
            <Ligne
              avant={<Carre statut={c.statut} />}
              titre={libelleStatut(c.statut)}
              tailleTitre={14}
              sous={<Auteur auteur={c.auteur} />}
              valeur={dateCourte(c.date)}
              doux
              chevron={false}
              hauteur={52}
              onPress={() => setChangement(c)}
              libelle={`${libelleStatut(c.statut)}, ${dateLongue(c.date)}, ${auteurDe(c.auteur).nom}`}
            />
          </View>
        ))}
      </Groupe>

      {/* Journal vide : seulement le lien, sans titre de section ; le titre vient avec la première entrée */}
      {f.journal.length ? <TitreGroupe texte={t("suivi.journal")} /> : null}
      {f.journal.length ? (
        <Groupe>
          {f.journal.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Filet /> : null}
              <View style={styles.entree} accessible>
                <Texte variante="meta" couleur="t2" style={styles.dateEntree}>
                  {dateCourte(e.date)}
                </Texte>
                <View style={{ flex: 1 }}>
                  <View style={styles.teteEntree}>
                    <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
                      <Texte variante="corps" style={{ fontFamily: police.medium }}>
                        {t(`suivi.type.${e.type}`)}
                      </Texte>
                      {e.type === "douleur" && e.douleur != null ? (
                        <>
                          <Douleur n={e.douleur} />
                          <Texte variante="corps" style={{ fontFamily: police.medium, marginLeft: 6 }}>
                            {t("suivi.douleurSur", { n: e.douleur })}
                          </Texte>
                        </>
                      ) : null}
                    </View>
                    <Auteur auteur={e.auteur} />
                  </View>
                  {e.signes.length ? (
                    <Texte variante="meta" couleur="t2" style={{ fontSize: 12, marginTop: 2 }}>
                      {texteSignes(e.signes)}
                    </Texte>
                  ) : null}
                  {e.texte ? <Texte variante="corps" style={{ fontSize: 15, lineHeight: 22, marginTop: 2 }}>{e.texte}</Texte> : null}
                </View>
              </View>
            </View>
          ))}
        </Groupe>
      ) : null}
      {/* le lien « + » de l'appli (celui des séries), sous la liste comme « Ajouter une série » ; 44 dp de haut */}
      <View style={f.journal.length ? styles.lienJournal : styles.lienJournalSeul}>
        <BoutonAjouterSerie libelle={t("suivi.ajouterJournal")} onPress={() => setJournal(true)} />
      </View>

      <Groupe style={{ marginTop: espace.xxl }}>
        <Ligne
          titre={t("suivi.supprimerBlessure")}
          rouge
          centre
          chevron={false}
          onPress={() => {
            suppressionDemandee.blessure = id;
            router.back();
          }}
        />
      </Groupe>

      <FeuilleTexte visible={nommer} titre={t("suivi.nom")} valeur={b.titre} onFermer={() => setNommer(false)} onValider={(x) => (setNommer(false), ecrire(modifierBlessure(db, id, { titre: x })))} />
      <FeuilleJour visible={debut} titre={t("suivi.dateDebut")} valeur={b.debut} onFermer={() => setDebut(false)} onValider={(j) => (setDebut(false), ecrire(modifierBlessure(db, id, { debut: j })))} />
      <FeuilleJour
        visible={changement != null}
        titre={t("suivi.dateDuStatut")}
        valeur={changement?.date ?? auj}
        onFermer={() => setChangement(null)}
        onValider={(j) => {
          const c = changement;
          setChangement(null);
          if (c) ecrire(corrigerDateStatut(db, c.id, j));
        }}
        autre={
          f.statuts.length > 1
            ? {
                libelle: t("suivi.supprimerStatut"),
                onPress: () => {
                  const c = changement;
                  setChangement(null);
                  if (c) ecrire(supprimerStatut(db, c.id));
                },
              }
            : undefined
        }
      />
      <FeuilleJournal
        visible={journal}
        onFermer={() => setJournal(false)}
        onValider={(e) => {
          setJournal(false);
          ecrire(ajouterAuJournal(db, id, { ...e, date: auj }));
        }}
      />
    </EcranSuivi>
  );
}

const styles = StyleSheet.create({
  lienJournal: { marginTop: espace.xs },
  lienJournalSeul: { marginTop: espace.l },
  typeArt: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  depuis: { marginTop: 10, marginHorizontal: espace.l },
  notes: { paddingHorizontal: espace.l, paddingVertical: 14 },
  entree: { flexDirection: "row", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.m },
  dateEntree: { width: 44, lineHeight: 20 },
  teteEntree: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: espace.s },
});
