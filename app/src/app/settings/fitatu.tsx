import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { ecrireReglage } from "../../db";
import { useApp } from "../../ecrans/contexte";
import { heure, jourMois, jourMoisAnnee } from "../../ecrans/format";
import { BoutonLigne, GroupeReglages, LigneReglage, SectionReglages, SousEtat } from "../../ecrans/Reglage";
import { abonnerFitatu, connecterFitatu, deconnecterFitatu, etatFitatu, importerFitatuDepuisCompte, part, progressionFitatu, REGLAGE_FITATU, type EtatFitatu } from "../../fitatu";
import type { Progression } from "../../fitatu/historique";
import { connecteDans, lireCapture, SCRIPT_RELEVE, sessionDepuisCapture, URL_CONNEXION_FITATU } from "../../fitatu/session";
import { choisirEtImporterHevy, ErreurImport } from "../../import";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { Attente } from "../../ui/Attente";
import { BarreHaut } from "../../ui/Cadre";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { FeuilleMessage, signalerErreur, type MessageFeuille } from "../../ui/FeuilleMessage";
import { Texte } from "../../ui/Texte";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";

/** Jeton vu dans la page mais session incomplète (en-têtes de l'appli web absents) : on conclut à l'échec après ce délai. */
const ATTENTE_SESSION_MS = 30_000;

// `?capture=progression` dans un lien pepfitopen:// (captures sans compte Fitatu, comme Connexions) : affichage seulement, rien
// n'est lu ni écrit ; un import simulé avance tout seul.
const SIMULEE: EtatFitatu = { connecte: true, dernier: null, erreur: null, import: null };

const texteErreur = (code: string) => t(code === "session" || code === "limite" || code === "reseau" ? `fitatu.erreur.${code}` : "fitatu.erreur.serveur");

/** Fitatu (Profil › Connexions) : connexion par WebView sur le site officiel, puis import de l'historique des repas. */
export default function Fitatu() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const capture = useLocalSearchParams<{ capture?: string }>().capture === "progression";
  const [etat, setEtat] = useState<EtatFitatu | null>(capture ? SIMULEE : null);
  // reconnexion demandée (session expirée) : la page de Fitatu revient même si l'appli se croit connectée
  const [reconnexion, setReconnexion] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [message, setMessage] = useState<MessageFeuille | null>(null);
  const [deconnexion, setDeconnexion] = useState(false);
  const [reimport, setReimport] = useState(false);
  const [fichier, setFichier] = useState<{ etat: "encours" } | { etat: "fait"; texte: string } | { etat: "erreur"; texte: string } | null>(null);
  const reelle = useSyncExternalStore(abonnerFitatu, progressionFitatu);
  const [simulee, setSimulee] = useState<Progression | null>(capture ? { jours: 0, total: 1096, alimentsImportes: 0 } : null);
  const progression = capture ? simulee : reelle;
  const pris = useRef(false);
  const jetonVu = useRef<number | null>(null);

  const relire = useCallback(async () => {
    if (capture) return;
    setEtat(await etatFitatu(db));
  }, [db, capture]);

  useFocusEffect(
    useCallback(() => {
      relire().catch(console.error);
    }, [relire]),
  );
  // fin d'un import (réel) : l'état gardé se relit
  useEffect(() => {
    if (!reelle) relire().catch(console.error);
  }, [reelle, relire]);
  // ouverture de l'écran : un import arrêté (appli fermée, réseau, 429) reprend tout seul, sauf session à refaire
  useEffect(() => {
    if (capture || !etat?.connecte || etat.erreur === "session" || etat.import?.fini || reelle) return;
    void importerFitatuDepuisCompte(db);
    // une seule fois par connexion connue : pas à chaque relecture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat?.connecte]);
  useEffect(() => {
    if (!capture) return;
    const id = setInterval(() => setSimulee((p) => (p && p.jours < p.total ? { ...p, jours: Math.min(p.total, p.jours + 7), alimentsImportes: p.alimentsImportes + 23 } : p)), 400);
    return () => clearInterval(id);
  }, [capture]);

  const recu = (e: WebViewMessageEvent): void => {
    if (pris.current) return;
    const c = lireCapture(e.nativeEvent.data);
    if (!c) return;
    const s = sessionDepuisCapture(c);
    if (!s) {
      // connecté (jeton visible) mais en-têtes de l'appli web jamais vus : échec après ATTENTE_SESSION_MS
      if (connecteDans(c)) {
        jetonVu.current ??= Date.now();
        if (Date.now() - jetonVu.current > ATTENTE_SESSION_MS) {
          pris.current = true;
          setMessage({ titre: t("fitatu.titre"), texte: t("fitatu.illisible") });
        }
      }
      return;
    }
    pris.current = true;
    setLecture(true);
    connecterFitatu(db, s)
      .then(async () => {
        setReconnexion(false);
        await relire();
      })
      .catch(signalerErreur())
      .finally(() => setLecture(false));
  };

  const mettreAJour = () => {
    if (capture) return setSimulee({ jours: 0, total: 1096, alimentsImportes: 0 });
    void ecrireReglage(db, REGLAGE_FITATU.erreur, "").then(() => importerFitatuDepuisCompte(db, { mettreAJour: true }));
  };
  // relit tout l'historique en mise en accord (docs/FITATU-MAJ.md) : retire les doublons d'avant
  const toutReimporter = () => {
    setReimport(false);
    if (capture) return setSimulee({ jours: 0, total: 1096, alimentsImportes: 0 });
    void ecrireReglage(db, REGLAGE_FITATU.erreur, "").then(() => importerFitatuDepuisCompte(db, { toutReimporter: true }));
  };
  const deconnecter = () => {
    setDeconnexion(false);
    deconnecterFitatu(db)
      .then(() => {
        pris.current = false;
        jetonVu.current = null;
        return relire();
      })
      .catch(signalerErreur());
  };
  const importerFichier = async () => {
    setFichier({ etat: "encours" });
    try {
      const r = await choisirEtImporterHevy(db);
      if (!r) return setFichier(null);
      if (r.genre === "fitatu") await ecrireReglage(db, REGLAGE_FITATU.dernier, String(Date.now()));
      const texte = r.genre === "fitatu" ? `${tp("profil.fitatuJours", r.joursImportes)}, ${tp("profil.fitatuAliments", r.alimentsImportes)}` : r.genre === "routines" ? tp("profil.routinesImportees", r.routinesImportees) : tp("profil.seancesImportees", r.seancesImportees);
      setFichier({ etat: "fait", texte });
      await relire();
    } catch (e) {
      setFichier({ etat: "erreur", texte: e instanceof ErreurImport ? e.message : t("profil.importImpossible", { erreur: String(e) }) });
    }
  };

  const quand = (ms: number) => (new Date(ms).toDateString() === new Date().toDateString() ? heure(ms) : jourMois(ms));

  if (etat && (!etat.connecte || reconnexion)) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
        <BarreHaut titre={t("fitatu.titre")} />
        <Texte variante="libelle" couleur="t2" style={{ marginHorizontal: espace.l, marginVertical: espace.s }}>
          {t("fitatu.aide")}
        </Texte>
        <View style={{ flex: 1 }}>
          {lecture || message ? null : (
            <WebView
              source={{ uri: URL_CONNEXION_FITATU }}
              injectedJavaScriptBeforeContentLoaded={SCRIPT_RELEVE}
              injectedJavaScript={SCRIPT_RELEVE}
              onMessage={recu}
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              originWhitelist={["https://*"]}
            />
          )}
          {lecture ? (
            <View style={styles.attente}>
              <Attente />
              <Texte variante="libelle" couleur="t2">
                {t("fitatu.lecture")}
              </Texte>
            </View>
          ) : null}
        </View>
        <Feuille visible={reimport} onFermer={() => setReimport(false)} titre={t("fitatu.toutReimporterTitre")}>
        <Texte variante="corps" couleur="t2" style={styles.texteFeuille}>
          {t("fitatu.toutReimporterTexte")}
        </Texte>
        <Groupe>
          <Option premier libelle={t("fitatu.toutReimporter")} onPress={toutReimporter} />
          <Option libelle={t("ui.annuler")} onPress={() => setReimport(false)} />
        </Groupe>
      </Feuille>
      <FeuilleMessage message={message} onFermer={() => router.back()} />
      </SafeAreaView>
    );
  }

  const imp = etat?.import ?? null;
  const sous = () => {
    if (progression) return <SousEtat actif texte={t("reglages.fitatuImport", { pct: Math.floor(part(progression) * 100) })} />;
    if (etat?.dernier) return <SousEtat actif texte={t("fitatu.connecte", { quand: quand(etat.dernier) })} />;
    return <SousEtat actif texte={t("fitatu.connecteEnCours")} />;
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("fitatu.titre")} />
      {etat ? (
        <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
          <SectionReglages premiere titre={t("fitatu.compte")} />
          <GroupeReglages>
            <LigneReglage icone="download" libelle={t("fitatu.titre")} sous={sous()}>
              <BoutonLigne libelle={t("fitatu.deconnecter")} onPress={() => setDeconnexion(true)} />
            </LigneReglage>
            <LigneReglage
              icone="sync"
              libelle={t("fitatu.mettreAJour")}
              sous={t("fitatu.mettreAJourSous")}
              fin={progression ? "aucune" : "chevron"}
              onPress={progression ? undefined : mettreAJour}
            >
              {progression ? <Attente /> : null}
            </LigneReglage>
            <LigneReglage
              icone="history"
              libelle={t("fitatu.toutReimporter")}
              sous={t("fitatu.toutReimporterSous")}
              fin={progression ? "aucune" : "chevron"}
              onPress={progression ? undefined : () => setReimport(true)}
            />
          </GroupeReglages>

          {progression ? (
            <View style={[styles.bloc, { backgroundColor: couleurs.s1 }]}>
              <Texte variante="saisie" style={{ fontSize: 15 }}>
                {t("fitatu.import")}
              </Texte>
              <Texte variante="corps" couleur="t2" style={{ fontSize: 14 }}>
                {t("fitatu.progression", { jours: progression.jours, total: progression.total, aliments: progression.alimentsImportes })}
              </Texte>
              <View style={[styles.piste, { backgroundColor: couleurs.s3 }]}>
                <View style={[styles.barre, { backgroundColor: couleurs.partieNutrition, width: `${part(progression) * 100}%` }]} />
              </View>
              <Texte variante="meta" couleur="t3" style={{ marginTop: espace.s }}>
                {t("fitatu.garderOuvert")}
              </Texte>
            </View>
          ) : imp && (imp.alimentsImportes || imp.alimentsDejaPresents) ? (
            <View style={[styles.bloc, { backgroundColor: couleurs.s1 }]}>
              <Texte variante="saisie" style={{ fontSize: 14 }}>
                {`${tp("profil.fitatuJours", imp.joursAvecRepas)}, ${tp("profil.fitatuAliments", imp.alimentsImportes)}`}
              </Texte>
              <Texte variante="corps" couleur="t2" style={{ fontSize: 14 }}>
                {`${t("fitatu.depuis", { date: jourMoisAnnee(new Date(`${imp.debut}T12:00:00`)) })}, ${t("profil.fitatuDeja", { n: imp.alimentsDejaPresents })}, ${tp("profil.fitatuProduits", imp.produitsCrees)}`}
              </Texte>
            </View>
          ) : null}

          {etat.erreur && !progression ? (
            <View style={[styles.bloc, { backgroundColor: couleurs.s1 }]}>
              <Texte variante="libelle" style={{ color: couleurs.rate }}>
                {texteErreur(etat.erreur)}
              </Texte>
              {etat.erreur === "session" ? (
                <View style={{ alignSelf: "flex-start", marginTop: espace.s }}>
                  <BoutonLigne
                    libelle={t("fitatu.reconnecter")}
                    onPress={() => {
                      pris.current = false;
                      jetonVu.current = null;
                      setReconnexion(true);
                    }}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          <Texte variante="meta" couleur="t3" style={styles.note}>
            {t("reglages.fitatuNote")}
          </Texte>

          <SectionReglages titre={t("fitatu.autre")} />
          <GroupeReglages>
            <LigneReglage
              icone="download"
              libelle={t("fitatu.fichier")}
              sous={t("fitatu.fichierSous")}
              fin={fichier?.etat === "encours" ? "aucune" : "chevron"}
              onPress={fichier?.etat === "encours" ? undefined : () => importerFichier().catch(console.error)}
            >
              {fichier?.etat === "encours" ? <Attente /> : null}
            </LigneReglage>
          </GroupeReglages>
          {fichier && fichier.etat !== "encours" ? (
            <View style={[styles.bloc, { backgroundColor: couleurs.s1 }]}>
              <Texte variante="libelle" style={fichier.etat === "erreur" ? { color: couleurs.rate } : undefined}>
                {fichier.texte}
              </Texte>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      <Feuille visible={deconnexion} onFermer={() => setDeconnexion(false)} titre={t("fitatu.deconnecterTitre")}>
        <Texte variante="corps" couleur="t2" style={styles.texteFeuille}>
          {t("fitatu.deconnecterTexte")}
        </Texte>
        <Groupe>
          <Option premier danger libelle={t("fitatu.deconnecter")} onPress={deconnecter} />
          <Option libelle={t("ui.annuler")} onPress={() => setDeconnexion(false)} />
        </Groupe>
      </Feuille>
      <FeuilleMessage message={message} onFermer={() => setMessage(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  attente: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: espace.m },
  note: { marginHorizontal: espace.l, marginTop: espace.s },
  bloc: { borderRadius: rayon.l, padding: espace.l, gap: 6, marginHorizontal: espace.l, marginTop: espace.s },
  piste: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: espace.s },
  barre: { height: 4, borderRadius: 2 },
  texteFeuille: { fontSize: 14, marginBottom: espace.m },
});
