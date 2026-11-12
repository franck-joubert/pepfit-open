import { useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp, useCharge } from "../../ecrans/contexte";
import { lireReglages } from "../../ecrans/donnees";
import { exporterDonnees } from "../../ecrans/exporter";
import { GroupeReglages, LigneReglage, SectionReglages, SousEtat } from "../../ecrans/Reglage";
import { etatSauvegardeTexte, lieuSauvegarde } from "../../ecrans/sauvegarde-vue";
import { Champ } from "../../ecrans/briques";
import {
  choisirDossier, choisirFichier, lireEtatSauvegarde, PhraseManquante, reglerFrequence, reglerGarde, reglerLisible, restaurer,
  sauvegarderMaintenant, type FichierChoisi,
} from "../../sauvegarde";
import { ErreurSauvegarde, phraseOuvre, type Mode } from "../../sauvegarde/archive";
import { FREQUENCES, GARDES } from "../../sauvegarde/regles";
import { creerPhraseLocale, phrasesConnues } from "../../sync/local";
import { urlPolitique } from "../../politique";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { Attente } from "../../ui/Attente";
import { BarreHaut } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Texte } from "../../ui/Texte";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { lireActif, lireDetecte, t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { useLangue } from "../../i18n/useLangue";

type Restauration =
  | { etape: "phrase"; choisi: FichierChoisi; saisie: string; faux: boolean }
  | { etape: "mode" | "confirmer"; choisi: FichierChoisi; phrase: string | null }
  | { etape: "encours" | "fait" }
  | { etape: "erreur"; texte: string };

const texteErreur = (e: unknown) => {
  const r = e instanceof ErreurSauvegarde ? e.raison : null;
  return t(r === "version" ? "reglages.versionRecente" : r === "tronque" ? "reglages.fichierTronque" : "reglages.fichierIllisible");
};

/**
 * Données et confidentialité (planche profil, direction A) : sauvegarde dans un dossier choisi (chiffrée par la phrase de
 * secours, ou lisible), restauration, export JSON ou CSV, politique. « Effacer les
 * données de ce téléphone » ferme désormais la page Réglages, seul (planche menu, FeuilleEffacer).
 */
export default function Donnees() {
  useLangue();
  const { db, reglages, regler } = useApp();
  const { couleurs } = useTheme();
  const [exportOuvert, setExportOuvert] = useState(false);
  const [feuille, setFeuille] = useState<"frequence" | "garde" | "phrase" | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [resto, setResto] = useState<Restauration | null>(null);
  const [s, relireSauvegarde] = useCharge(async (d) => ({ etat: await lireEtatSauvegarde(d), phrase: (await phrasesConnues()).length > 0 }), []);
  const e = s?.etat;
  const politique = urlPolitique(lireActif().langue);
  const ligne = e ? etatSauvegardeTexte(e) : null;

  const exporter = (format: "json" | "csv") => {
    setExportOuvert(false);
    exporterDonnees(db, format).catch(signalerErreur("exporter"));
  };

  const sauvegarder = async () => {
    if (!e?.dossier && !(await choisirDossier(db))) return;
    setOccupe(true);
    try {
      await sauvegarderMaintenant(db);
    } catch (err) {
      if (err instanceof PhraseManquante) setFeuille("phrase");
      else signalerErreur("sauvegarder")(err);
    } finally {
      setOccupe(false);
      await relireSauvegarde();
    }
  };

  // Première sauvegarde chiffrée : la phrase est créée, la sauvegarde part, la phrase s'affiche.
  const creerPhrase = async () => {
    setFeuille(null);
    const phrase = await creerPhraseLocale();
    sauvegarder().catch(signalerErreur("sauvegarder"));
    router.push({ pathname: "/settings/phrase", params: { phrase } });
  };

  const lisibleEtSauvegarder = async () => {
    setFeuille(null);
    await reglerLisible(db, true);
    await sauvegarder();
  };

  const ouvrirRestauration = async () => {
    try {
      const choisi = await choisirFichier();
      if (!choisi) return;
      setResto(choisi.phraseConnue === null ? { etape: "phrase", choisi, saisie: "", faux: false } : { etape: "mode", choisi, phrase: choisi.phraseConnue || null });
    } catch (err) {
      setResto({ etape: "erreur", texte: texteErreur(err) });
    }
  };

  const lancerRestauration = async (choisi: FichierChoisi, phrase: string | null, mode: Mode) => {
    setResto({ etape: "encours" });
    try {
      await restaurer(db, choisi, phrase, mode);
      // Seuls les réglages changés par la restauration : `regler` les réécrit en base.
      const lus = await lireReglages(db, lireDetecte());
      const changes = Object.fromEntries(Object.entries(lus).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(reglages[k as keyof typeof reglages])));
      if (Object.keys(changes).length) regler(changes);
      setResto({ etape: "fait" });
    } catch (err) {
      setResto({ etape: "erreur", texte: texteErreur(err) });
    } finally {
      await relireSauvegarde();
    }
  };

  const apercu = resto && "choisi" in resto ? resto.choisi.entete : null;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("reglages.donneesConfidentialite")} />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl }}>
        <SectionReglages premiere titre={t("reglages.sauvegarde")} />
        <GroupeReglages>
          <LigneReglage
            icone="upload"
            libelle={t("reglages.sauvegarderMaintenant")}
            sous={<SousEtat actif={!!ligne?.actif} texte={ligne?.texte ?? t("reglages.pasDeSauvegarde")} />}
            fin="aucune"
            onPress={occupe ? undefined : () => sauvegarder().catch(signalerErreur("sauvegarder"))}
          >
            {occupe ? <Attente /> : null}
          </LigneReglage>
          <LigneReglage
            icone="nuage"
            libelle={t("reglages.emplacement")}
            valeur={e?.dossier ? lieuSauvegarde(e) : t("reglages.choisirEmplacement")}
            onPress={() =>
              choisirDossier(db)
                .then(relireSauvegarde)
                .catch(signalerErreur())
            }
          />
          <LigneReglage icone="horloge" libelle={t("reglages.automatique")} valeur={t(`reglages.frequence.${e?.frequence ?? "jamais"}`)} onPress={() => setFeuille("frequence")} />
          {e && e.frequence !== "jamais" ? (
            <LigneReglage icone="history" libelle={t("reglages.garder")} valeur={t("reglages.dernieres", { n: e.garder })} onPress={() => setFeuille("garde")} />
          ) : null}
          <LigneReglage
            icone="page"
            libelle={t("reglages.sauvegardeLisible")}
            interrupteur={{
              valeur: !!e?.lisible,
              onChange: (v) =>
                reglerLisible(db, v)
                  .then(relireSauvegarde)
                  .catch(signalerErreur()),
            }}
          />
          {s?.phrase && !e?.lisible ? <LigneReglage icone="cle" libelle={t("compte.phrase")} onPress={() => router.push("/settings/phrase")} /> : null}
          <LigneReglage icone="download" libelle={t("reglages.restaurer")} onPress={() => ouvrirRestauration().catch(console.error)} />
        </GroupeReglages>
        <SectionReglages titre={t("reglages.mesDonnees")} />
        <GroupeReglages>
          <LigneReglage icone="export" libelle={t("compte.exporter")} valeur={t("reglages.formatsExport")} onPress={() => setExportOuvert(true)} />
        </GroupeReglages>
        {politique ? (
          <>
            <SectionReglages titre={t("reglages.confidentialite")} />
            <GroupeReglages>
              <LigneReglage icone="bouclier" libelle={t("reglages.politique")} fin="externe" onPress={() => Linking.openURL(politique).catch(console.error)} />
            </GroupeReglages>
          </>
        ) : null}
      </ScrollView>

      <Feuille visible={exportOuvert} onFermer={() => setExportOuvert(false)} titre={t("compte.exporter")}>
        <Groupe>
          <Option premier icone="export" libelle={t("compte.exportJson")} onPress={() => exporter("json")} />
          <Option icone="export" libelle={t("compte.exportCsv")} onPress={() => exporter("csv")} />
        </Groupe>
      </Feuille>

      <Feuille visible={feuille === "frequence"} onFermer={() => setFeuille(null)} titre={t("reglages.automatique")}>
        <Groupe>
          {FREQUENCES.map((f, i) => (
            <Option
              key={f}
              premier={i === 0}
              libelle={t(`reglages.frequence.${f}`)}
              choisi={e?.frequence === f}
              onPress={() => {
                setFeuille(null);
                reglerFrequence(db, f)
                  .then(relireSauvegarde)
                  .catch(signalerErreur());
              }}
            />
          ))}
        </Groupe>
      </Feuille>

      <Feuille visible={feuille === "garde"} onFermer={() => setFeuille(null)} titre={t("reglages.garder")}>
        <Groupe>
          {GARDES.map((n, i) => (
            <Option
              key={n}
              premier={i === 0}
              libelle={t("reglages.dernieres", { n })}
              choisi={e?.garder === n}
              onPress={() => {
                setFeuille(null);
                reglerGarde(db, n)
                  .then(relireSauvegarde)
                  .catch(signalerErreur());
              }}
            />
          ))}
        </Groupe>
      </Feuille>

      <Feuille visible={feuille === "phrase"} onFermer={() => setFeuille(null)} titre={t("compte.phrase")}>
        <Groupe>
          <Option premier icone="cle" libelle={t("reglages.creerPhrase")} onPress={() => creerPhrase().catch(signalerErreur())} />
          <Option icone="page" libelle={t("reglages.sauvegarderLisible")} onPress={() => lisibleEtSauvegarder().catch(signalerErreur("sauvegarder"))} />
        </Groupe>
      </Feuille>

      <Feuille
        visible={!!resto}
        onFermer={() => resto?.etape !== "encours" && setResto(null)}
        titre={t("reglages.restaurerTitre")}
        sousTitre={
          apercu
            ? [
                t("reglages.apercu", { date: formater(apercu.cree_le, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }), seances: tp("profil.sauvegardeSeances", apercu.seances), photos: tp("profil.sauvegardePhotos", apercu.photos) }),
                t(apercu.chiffre ? "reglages.chiffree" : "reglages.lisible"),
              ].join(", ")
            : undefined
        }
      >
        {resto?.etape === "phrase" ? (
          <View style={styles.bloc}>
            <Champ
              accessibilityLabel={t("reglages.saisirPhrase")}
              placeholder={t("reglages.saisirPhrase")}
              value={resto.saisie}
              onChangeText={(saisie) => setResto({ ...resto, saisie, faux: false })}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              multiline
            />
            {resto.faux ? (
              <Texte variante="libelle" style={{ color: couleurs.rate }}>
                {t("reglages.phraseIncorrecte")}
              </Texte>
            ) : null}
            <BoutonPrincipal
              libelle={t("reglages.continuer")}
              desactive={!resto.saisie.trim()}
              onPress={() =>
                phraseOuvre(resto.choisi.entete, resto.saisie)
                  ? setResto({ etape: "mode", choisi: resto.choisi, phrase: resto.saisie })
                  : setResto({ ...resto, faux: true })
              }
            />
          </View>
        ) : null}
        {resto?.etape === "mode" ? (
          <Groupe>
            <Option premier icone="swap" libelle={t("reglages.remplacer")} chevron onPress={() => setResto({ ...resto, etape: "confirmer" })} />
            <Option icone="plus" libelle={t("reglages.fusionner")} onPress={() => lancerRestauration(resto.choisi, resto.phrase, "fusionner").catch(console.error)} />
          </Groupe>
        ) : null}
        {resto?.etape === "confirmer" ? (
          <Groupe>
            <Option premier danger icone="swap" libelle={t("reglages.confirmerRemplacer")} onPress={() => lancerRestauration(resto.choisi, resto.phrase, "remplacer").catch(console.error)} />
          </Groupe>
        ) : null}
        {resto?.etape === "encours" ? <Attente style={styles.attente} /> : null}
        {resto?.etape === "fait" || resto?.etape === "erreur" ? (
          <Texte variante="saisie" style={[styles.message, resto.etape === "erreur" && { color: couleurs.rate }]}>
            {resto.etape === "erreur" ? resto.texte : t("reglages.restauree")}
          </Texte>
        ) : null}
      </Feuille>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: espace.m, paddingBottom: espace.s },
  attente: { paddingVertical: espace.xl },
  message: { textAlign: "center", paddingVertical: espace.l },
});
