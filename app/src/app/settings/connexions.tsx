import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { journalActivites } from "../../db/depots/diagnostic-activites";
import { ecrireFcDirecte, ecrireReglage, lireFcDirecte, lireReglage, suggestionsAConfirmer } from "../../db";
import { useApp, useCharge } from "../../ecrans/contexte";
import { departager } from "../../ecrans/FeuilleLien";
import { heure, jourMois, jourMoisAnnee } from "../../ecrans/format";
import { importerSante } from "../../ecrans/sante-donnees";
import { etatHistorique, lireReprise, type EtatHistorique } from "../../ecrans/sante-historique";
import { BatterieAuMoment } from "../../ecrans/FeuilleBatterie";
import { resumePermissions } from "../../ecrans/profil-vue";
import { BoutonLigne, GroupeReglages, LigneReglage, SectionReglages, SousEtat } from "../../ecrans/Reglage";
import { choisirEtImporterHevy, ErreurImport, type RapportHevy } from "../../import";
import { sante, santeConnect } from "../../natif/sante";
import { PERMISSIONS_DEMANDE_SANTE } from "../../natif/sante/logique";
import { useTheme } from "../../theme";
import { FOURNISSEURS, identifiants, type Fournisseur } from "../../identifiants";
import { abonnerSynchro, commencerConnexion, deconnecter, etatWhoop, synchroEnCours, synchroniser, type EtatWhoop } from "../../whoop";
import { espace, rayon } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { Texte } from "../../ui/Texte";
import { Attente } from "../../ui/Attente";
import { IconeSynchro } from "../../ui/IconeSynchro";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { FeuilleMessage, signalerErreur, type MessageFeuille } from "../../ui/FeuilleMessage";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { messageConnexion } from "../../whoop/messages";
import * as withings from "../../withings";
import { ecartes as ecartesWithings, typesRecus } from "../../withings/diagnostic";
import { cleErreur as cleErreurWithings, messageConnexion as messageWithings } from "../../withings/messages";
import * as polar from "../../polar";
import { cleErreur as cleErreurPolar, messageConnexion as messagePolar } from "../../polar/messages";

type Source = "hevy";
/** `historique` : null quand Santé Connect ne sait pas donner l'historique (version trop ancienne) ; la ligne n'existe pas. */
type EtatSante = { disponible: boolean; accordees: string[]; historique: EtatHistorique | null };

/** Clé du dernier import réussi, par source (« Séances et routines · 12 oct. »). */
const CLE_IMPORT: Record<Source, string> = { hevy: "import_dernier_hevy" };

/** Appareils et connexions (planche profil, direction A ; planche menu : seuls les flux entrants) : Santé Connect, Whoop,
 *  Withings et Polar, import Hevy. La batterie des séances est passée dans Sport (D5), Connexion IA dans Réglages › Partage. */
export default function Connexions() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [etat, setEtat] = useState<EtatSante | null>(null);
  const [whoop, setWhoop] = useState<EtatWhoop | null>(null);
  const [message, setMessage] = useState<MessageFeuille | null>(null);
  const [whoopAction, setWhoopAction] = useState<"ouverture" | null>(null);
  // « Déconnecter » : feuille de confirmation de l'appli (plus de boîte d'alerte native, audit du 28/10 n° 19)
  const [deconnexion, setDeconnexion] = useState(false);
  // Withings (balance) : même ligne que Whoop, avec sa propre synchro et sa propre feuille de déconnexion
  const [withingsEtat, setWithingsEtat] = useState<withings.EtatWithings | null>(null);
  const [withingsOuverture, setWithingsOuverture] = useState(false);
  // « FC en direct » : lire en Bluetooth la FC d'un capteur (Whoop en diffusion, ceinture, montre) pendant les séances, Whoop connecté ou non.
  const [fcDirecte, setFcDirecte] = useState(false);
  const [deconnexionWithings, setDeconnexionWithings] = useState(false);
  const synchroWithings = useSyncExternalStore(withings.abonnerSynchro, withings.synchroEnCours);
  // Polar (montre, AccessLink) : même ligne que Withings ; sa déconnexion propose de garder ou d'effacer ce qui a été lu
  const [polarEtat, setPolarEtat] = useState<polar.EtatPolar | null>(null);
  const [polarOuverture, setPolarOuverture] = useState(false);
  const [deconnexionPolar, setDeconnexionPolar] = useState(false);
  const synchroPolar = useSyncExternalStore(polar.abonnerSynchro, polar.synchroEnCours);
  // Identifiants développeur de chaque API (version libre) : sans eux, « Connecter » ouvre leur écran.
  const [ids, setIds] = useState<Record<Fournisseur, boolean>>({ whoop: false, withings: false, polar: false });
  const versIdentifiants = (f: Fournisseur) => router.push({ pathname: "/settings/identifiants", params: { f } });
  // synchro Whoop en cours, d'où qu'elle vienne (première synchro au retour de la connexion, ouverture de Santé, toucher)
  const synchroReelle = useSyncExternalStore(abonnerSynchro, synchroEnCours);
  // `?capture=synchro|connecte` dans un lien pepfitopen:// (captures sans compte Whoop, comme `?apparence=`) : affichage
  // seulement, rien n'est écrit ; « synchro » montre la ligne connectée pendant une synchro, « connecte » la feuille.
  const capture = useLocalSearchParams<{ capture?: string }>().capture;
  const synchro = synchroReelle || capture === "synchro";
  const [derniers, setDerniers] = useState<Record<Source, number | null>>({ hevy: null });
  const [import_, setImport] = useState<{ etat: "encours"; source: Source } | { etat: "fait"; r: RapportHevy } | { etat: "erreur"; message: string } | null>(null);

  const relire = useCallback(async () => {
    const disponible = await sante.disponible().catch(() => false);
    // l'état de Santé Connect lui-même (sans les permissions que Polar ajoute à la source fusionnée)
    const accordees = disponible ? await santeConnect.autorisees().catch(() => []) : [];
    const possible = disponible && (await sante.historiquePossible?.().catch(() => false));
    const historique = possible ? etatHistorique(accordees.includes("historique"), await lireReprise(db).catch(() => null)) : null;
    setEtat({ disponible, accordees, historique });
    setIds(Object.fromEntries(await Promise.all(FOURNISSEURS.map(async (f) => [f, !!(await identifiants(f))]))) as Record<Fournisseur, boolean>);
    const w = await etatWhoop(db).catch(() => null);
    setWhoop(capture && w ? { ...w, connecte: true, erreur: null, derniereSynchro: Date.now() - 3_600_000 } : w);
    const wi = await withings.etatWithings(db).catch(() => null);
    setWithingsEtat(capture && wi ? { ...wi, connecte: true, erreur: null, derniereSynchro: Date.now() - 3_600_000 } : wi);
    setPolarEtat(await polar.etatPolar(db).catch(() => null));
    const h = await lireReglage(db, CLE_IMPORT.hevy);
    setDerniers({ hevy: h ? Number(h) : null });
    setFcDirecte(await lireFcDirecte(db).catch(() => false));
  }, [db, capture]);
  useEffect(() => {
    if (capture === "connecte") setMessage({ titre: t("reglages.whoop"), texte: t("whoop.connecte"), succes: true });
  }, [capture]);

  useFocusEffect(
    useCallback(() => {
      relire().catch(console.error);
    }, [relire]),
  );

  const autoriser = async () => {
    await sante.demanderPermissions(PERMISSIONS_DEMANDE_SANTE);
    await relire();
  };
  // historique seul (Santé Connect déjà autorisé avant le 3/11) ; la reprise part tout de suite, en fond
  const autoriserHistorique = async () => {
    if (!(await sante.demanderPermissions(["historique"]))) return relire();
    await relire();
    importerSante(db, { forcer: true }).then(relire).catch(console.error);
  };
  const sousHistorique = (h: EtatHistorique) =>
    h.etat === "a-autoriser" ? (
      t("reglages.historiqueSanteSous")
    ) : (
      <SousEtat
        actif
        texte={h.etat === "en-cours" ? t("reglages.historiqueEnCours", { date: jourMoisAnnee(h.jusqua) }) : t(h.etat === "fini" ? "reglages.historiqueFini" : "reglages.historiqueAttente")}
      />
    );

  // court : l'heure seule aujourd'hui, sinon le jour (la sous-ligne ne passe pas à la ligne)
  const quand = (ms: number) => (new Date(ms).toDateString() === new Date().toDateString() ? heure(ms) : jourMois(ms));
  const connecterWhoop = async () => {
    if (!ids.whoop) return versIdentifiants("whoop");
    setWhoopAction("ouverture");
    try {
      await commencerConnexion();
    } catch (e) {
      // jamais « Whoop a refusé » pour une panne (messages.ts)
      const m = messageConnexion(e);
      setMessage({ titre: t("reglages.whoop"), texte: t(m.cle), action: m.reessayer ? { libelle: t("whoop.reessayer"), onPress: () => void connecterWhoop() } : undefined });
    } finally {
      setWhoopAction(null);
    }
  };
  const synchroWhoop = () => synchroniser(db).finally(() => relire());
  // fin d'une synchro lancée ailleurs : l'heure de la dernière synchro se met à jour
  useEffect(() => {
    if (!synchro) relire().catch(console.error);
  }, [synchro, relire]);
  // « Garder mes données » (défaut) : le journal reste ; « Supprimer aussi » : la purge complète, sur tous les appareils
  const deconnecterWhoop = (supprimer: boolean) => {
    setDeconnexion(false);
    deconnecter(db, supprimer).then(relire).catch(signalerErreur());
  };
  useEffect(() => {
    if (!synchroWithings) relire().catch(console.error);
  }, [synchroWithings, relire]);
  const connecterWithings = async () => {
    if (!ids.withings) return versIdentifiants("withings");
    setWithingsOuverture(true);
    try {
      await withings.commencerConnexion();
    } catch (e) {
      const m = messageWithings(e);
      setMessage({ titre: t("reglages.withings"), texte: t(m.cle), action: m.reessayer ? { libelle: t("whoop.reessayer"), onPress: () => void connecterWithings() } : undefined });
    } finally {
      setWithingsOuverture(false);
    }
  };
  const deconnecterWithings = () => {
    setDeconnexionWithings(false);
    withings.deconnecter(db).then(relire).catch(signalerErreur());
  };
  useEffect(() => {
    if (!synchroPolar) relire().catch(console.error);
  }, [synchroPolar, relire]);
  const connecterPolar = async () => {
    if (!ids.polar) return versIdentifiants("polar");
    setPolarOuverture(true);
    try {
      await polar.commencerConnexion();
    } catch (e) {
      const m = messagePolar(e);
      setMessage({ titre: t("reglages.polar"), texte: t(m.cle), action: m.reessayer ? { libelle: t("whoop.reessayer"), onPress: () => void connecterPolar() } : undefined });
    } finally {
      setPolarOuverture(false);
    }
  };
  const deconnecterPolar = (garder: boolean) => {
    setDeconnexionPolar(false);
    polar.deconnecter(db, garder).then(relire).catch(signalerErreur());
  };
  const sousPolar = () => {
    if (synchroPolar) return <SousEtat actif texte={t("reglages.whoopSynchro")} />;
    if (polarOuverture) return <SousEtat actif={false} texte={t("reglages.polarOuverture")} />;
    if (polarEtat?.erreur) return <SousEtat actif={false} texte={t(cleErreurPolar(polarEtat.erreur))} />;
    if (!polarEtat?.connecte) return <SousEtat actif={false} texte={t("reglages.nonConnecte")} />;
    return <SousEtat actif texte={polarEtat.derniereSynchro ? t("reglages.whoopConnecte", { quand: quand(polarEtat.derniereSynchro) }) : t("reglages.whoopJamais")} />;
  };
  const sousWithings = () => {
    if (synchroWithings) return <SousEtat actif texte={t("reglages.whoopSynchro")} />;
    if (withingsOuverture) return <SousEtat actif={false} texte={t("reglages.withingsOuverture")} />;
    if (withingsEtat?.erreur) return <SousEtat actif={false} texte={t(cleErreurWithings(withingsEtat.erreur))} />;
    if (!withingsEtat?.connecte) return <SousEtat actif={false} texte={t("reglages.nonConnecte")} />;
    return (
      <>
        <SousEtat actif texte={withingsEtat.derniereSynchro ? t("reglages.whoopConnecte", { quand: quand(withingsEtat.derniereSynchro) }) : t("reglages.whoopJamais")} />
      </>
    );
  };
  /** Journal de la dernière synchro : ce que l'API a livré (groupes, types) et ce qui a été écarté ; ni valeur ni compte. */
  const diagnosticWithings = () => {
    const d = withingsEtat?.diagnostic;
    if (!d) return null;
    const dernier = d.dernier ? t("withings.diag.dernier", { quand: jourMois(d.dernier * 1000) }) : null;
    const ecartes = ecartesWithings(d.ecartes);
    const texte = [
      d.groupes > 0 ? t("withings.diag.groupes", { n: d.groupes }) : t("withings.diag.rien"),
      dernier,
      d.types.length ? t("withings.diag.types", { types: typesRecus(d) }) : t("withings.diag.aucunType"),
      ecartes ? t("withings.diag.ecartes", { ecartes }) : t("withings.diag.aucunEcart"),
    ]
      .filter(Boolean)
      .join(", ");
    return texte;
  };
  /** Sous la ligne, sur toute la largeur : la ligne garde la place de son état et de ses boutons (Reconnecter, Déconnecter). */
  const detailsWithings = () => {
    if (!withingsEtat?.connecte || withingsOuverture) return null;
    const lignes = [withingsEtat.reconnexion ? t("withings.reconnexion") : null, diagnosticWithings()].filter(Boolean);
    if (!lignes.length) return null;
    return (
      <View style={{ paddingHorizontal: espace.l, paddingVertical: espace.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }}>
        {lignes.map((l, i) => (
          <Texte key={i} variante="meta" couleur="t3">
            {l}
          </Texte>
        ))}
      </View>
    );
  };
  /** Les dernières activités vues par un capteur et écartées, avec la raison (journal en mémoire, db/depots/diagnostic-activites.ts). */
  const detailsActivites = () => {
    if (!whoop?.connecte) return null;
    const lignes = journalActivites().slice(0, 4);
    if (!lignes.length) return null;
    return (
      <View style={{ paddingHorizontal: espace.l, paddingVertical: espace.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }}>
        {lignes.map((l) => (
          <Texte key={`${l.cle}:${l.raison}`} variante="meta" couleur="t3">
            {t("whoop.diag.ligne", { jour: jourMois(l.debut), debut: heure(l.debut), fin: heure(l.fin), raison: t(`whoop.diag.${l.raison}` as "whoop.diag.marche") })}
          </Texte>
        ))}
      </View>
    );
  };
  const sousWhoop = () => {
    if (synchro) return <SousEtat actif texte={t("reglages.whoopSynchro")} />;
    if (whoopAction === "ouverture") return <SousEtat actif={false} texte={t("reglages.whoopOuverture")} />;
    if (whoop?.erreur) return <SousEtat actif={false} texte={t(`whoop.erreur.${whoop.erreur}` as "whoop.erreur.serveur")} />;
    if (!whoop?.connecte) return <SousEtat actif={false} texte={t("reglages.nonConnecte")} />;
    return <SousEtat actif texte={whoop.derniereSynchro ? t("reglages.whoopConnecte", { quand: quand(whoop.derniereSynchro) }) : t("reglages.whoopJamais")} />;
  };

  // Un seul sélecteur de fichiers : il reconnaît l'export Hevy (CSV, routines JSON).
  const importer = async (source: Source) => {
    setImport({ etat: "encours", source });
    try {
      const r = await choisirEtImporterHevy(db);
      if (!r) return setImport(null);
      await ecrireReglage(db, CLE_IMPORT.hevy, String(Date.now()));
      setImport({ etat: "fait", r });
      await relire();
    } catch (e) {
      setImport({ etat: "erreur", message: e instanceof ErreurImport ? e.message : t("profil.importImpossible", { erreur: String(e) }) });
    }
  };

  const sousImport = (source: Source) => {
    const quoi = t("reglages.hevySous");
    const d = derniers[source];
    return d ? `${quoi}, ${jourMois(d)}` : quoi;
  };
  const enCours = (source: Source) => import_?.etat === "encours" && import_.source === source;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("menu.appareils")} />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        {/* Page Appareils (planche appareils-recommandes-v5) : ce que chaque marque apporte ; ouverte d'ici seulement. */}
        <GroupeReglages>
          <LigneReglage icone="appareils" libelle={t("appareilsReco.ligne")} sous={t("appareilsReco.intro")} onPress={() => router.push("/settings/appareils")} />
        </GroupeReglages>
        <SectionReglages titre={t("reglages.sante")} />
        <GroupeReglages>
          {!etat || !etat.disponible ? (
            <LigneReglage icone="coeur" libelle={t("reglages.santeConnect")} sous={etat ? <SousEtat actif={false} texte={t("reglages.indisponible")} /> : undefined} />
          ) : etat.accordees.length ? (
            <LigneReglage
              icone="coeur"
              libelle={t("reglages.santeConnect")}
              sous={<SousEtat actif texte={resumePermissions(etat.accordees)} />}
              onPress={() => sante.ouvrirReglages().catch(console.error)}
            />
          ) : (
            // pas encore autorisé : « Autoriser » demande aussi l'historique (PERMISSIONS_DEMANDE_SANTE)
            <LigneReglage icone="coeur" libelle={t("reglages.santeConnect")} sous={<SousEtat actif={false} texte={t("reglages.nonAutorise")} />}>
              <BoutonLigne libelle={t("reglages.autoriser")} onPress={() => autoriser().catch(console.error)} />
            </LigneReglage>
          )}
          {/* Historique au-delà de 30 jours : seulement quand Santé Connect est autorisé et sait le donner */}
          {etat?.historique && etat.accordees.length ? (
            <LigneReglage icone="history" libelle={t("reglages.historiqueSante")} sous={sousHistorique(etat.historique)}>
              {etat.historique.etat === "a-autoriser" ? <BoutonLigne libelle={t("reglages.autoriser")} onPress={() => autoriserHistorique().catch(console.error)} /> : null}
            </LigneReglage>
          ) : null}
          {/* Identifiants développeur de Whoop, Withings et Polar (version libre : chacun les siens, gardés sur ce téléphone). */}
          <LigneReglage
            icone="cle"
            libelle={t("identifiants.titre")}
            sous={FOURNISSEURS.some((f) => ids[f]) ? FOURNISSEURS.filter((f) => ids[f]).map((f) => t(`reglages.${f}`)).join(", ") : t("identifiants.sous")}
            onPress={() => router.push("/settings/identifiants")}
          />
          {/* Withings (balance, API officielle) : Connecter, état et dernière lecture (toucher la ligne relit), Déconnecter. */}
          <LigneReglage
            icone="balance"
            libelle={t("reglages.withings")}
            apresLibelle={withingsEtat?.connecte ? <IconeSynchro enCours={synchroWithings} /> : undefined}
            sous={sousWithings()}
            onPress={withingsEtat?.connecte && !withingsOuverture && !synchroWithings ? () => withings.synchroniser(db).finally(() => relire()).catch(console.error) : undefined}
          >
            {withingsOuverture ? (
              <Attente />
            ) : synchroWithings ? null : withingsEtat?.connecte ? (
              <>
                {withingsEtat.reconnexion ? <BoutonLigne libelle={t("withings.reconnecter")} onPress={() => connecterWithings().catch(console.error)} /> : null}
                <BoutonLigne libelle={t("reglages.whoopDeconnecter")} onPress={() => setDeconnexionWithings(true)} />
              </>
            ) : (
              <BoutonLigne libelle={t("reglages.connecter")} onPress={() => connecterWithings().catch(console.error)} />
            )}
          </LigneReglage>
          {detailsWithings()}
          {/* Polar (AccessLink) : Connecter, état et dernière lecture (toucher la ligne relit), Déconnecter. */}
          <LigneReglage
            icone="montre"
            libelle={t("reglages.polar")}
            apresLibelle={polarEtat?.connecte ? <IconeSynchro enCours={synchroPolar} /> : undefined}
            sous={sousPolar()}
            onPress={polarEtat?.connecte && !polarOuverture && !synchroPolar ? () => polar.synchroniser(db).finally(() => relire()).catch(console.error) : undefined}
          >
            {polarOuverture ? (
              <Attente />
            ) : synchroPolar ? null : polarEtat?.connecte ? (
              <BoutonLigne libelle={t("reglages.whoopDeconnecter")} onPress={() => setDeconnexionPolar(true)} />
            ) : (
              <BoutonLigne libelle={t("reglages.connecter")} onPress={() => connecterPolar().catch(console.error)} />
            )}
          </LigneReglage>
          <LigneReglage
            icone="coeur"
            libelle={t("reglages.fcDirecte")}
            sous={<SousEtat actif={fcDirecte} texte={t(fcDirecte ? "reglages.fcDirecteOn" : "reglages.fcDirecteOff")} />}
            interrupteur={{ valeur: fcDirecte, onChange: (v) => { setFcDirecte(v); ecrireFcDirecte(db, v).catch(signalerErreur()); } }}
            onPress={() => { const v = !fcDirecte; setFcDirecte(v); ecrireFcDirecte(db, v).catch(signalerErreur()); }}
          />
          {/* Whoop (API officielle) : Connecter, état et dernière synchro (toucher la ligne synchronise), Déconnecter. */}
          <LigneReglage
            icone="sante"
            libelle={t("reglages.whoop")}
            // toucher la ligne synchronise : l'icône « actualiser » le dit, et tourne pendant la synchro
            apresLibelle={whoop?.connecte ? <IconeSynchro enCours={synchro} /> : undefined}
            sous={sousWhoop()}
            onPress={whoop?.connecte && !whoopAction && !synchro ? () => synchroWhoop().catch(console.error) : undefined}
          >
            {whoopAction ? (
              <Attente />
            ) : synchro ? null : whoop?.connecte ? (
              <BoutonLigne libelle={t("reglages.whoopDeconnecter")} onPress={() => setDeconnexion(true)} />
            ) : (
              <BoutonLigne libelle={t("reglages.connecter")} onPress={() => connecterWhoop().catch(console.error)} />
            )}
          </LigneReglage>
          {detailsActivites()}
        </GroupeReglages>

        <SectionReglages titre={t("reglages.importer")} />
        <GroupeReglages>
          {(["hevy"] as const).map((s) => (
            <LigneReglage
              key={s}
              icone="download"
              libelle={t("reglages.hevy")}
              sous={sousImport(s)}
              // Chevron comme les autres lignes qu'on touche (audit, constat 39) ; pendant un import, ni chevron ni toucher.
              fin={import_?.etat === "encours" ? "aucune" : "chevron"}
              onPress={import_?.etat === "encours" ? undefined : () => importer(s).catch(console.error)}
            >
              {enCours(s) ? <Attente /> : null}
            </LigneReglage>
          ))}
        </GroupeReglages>
        {import_?.etat === "fait" ? <Rapport r={import_.r} /> : null}
        {import_?.etat === "erreur" ? (
          <View style={[styles.rapport, { backgroundColor: couleurs.s1 }]}>
            <Texte variante="libelle" style={{ color: couleurs.rate }}>
              {import_.message}
            </Texte>
          </View>
        ) : null}
      </ScrollView>
      <FeuilleMessage message={message} onFermer={() => setMessage(null)} />
      {/* Premier objet connecté (Whoop, Withings, Polar, montre par Santé Connect) : « Batterie non restreinte », une fois */}
      <BatterieAuMoment moment="objet" actif={!capture && (!!whoop?.connecte || !!withingsEtat?.connecte || !!polarEtat?.connecte || !!etat?.accordees.includes("frequence-cardiaque"))} />
      <Feuille visible={deconnexion} onFermer={() => setDeconnexion(false)} titre={t("reglages.whoopDeconnecterTitre")}>
        <Texte variante="corps" couleur="t2" style={styles.texteFeuille}>
          {t("reglages.whoopDeconnecterTexte")}
        </Texte>
        <Groupe>
          <Option premier libelle={t("reglages.whoopGarderDonnees")} aide={t("reglages.whoopGarderDonneesSous")} onPress={() => deconnecterWhoop(false)} />
          <Option danger libelle={t("reglages.whoopSupprimerDonnees")} aide={t("reglages.whoopSupprimerDonneesSous")} onPress={() => deconnecterWhoop(true)} />
          <Option libelle={t("ui.annuler")} onPress={() => setDeconnexion(false)} />
        </Groupe>
      </Feuille>
      <Feuille visible={deconnexionWithings} onFermer={() => setDeconnexionWithings(false)} titre={t("reglages.withingsDeconnecterTitre")}>
        <Texte variante="corps" couleur="t2" style={styles.texteFeuille}>
          {t("reglages.withingsDeconnecterTexte")}
        </Texte>
        <Groupe>
          <Option premier danger libelle={t("reglages.whoopDeconnecter")} onPress={deconnecterWithings} />
          <Option libelle={t("ui.annuler")} onPress={() => setDeconnexionWithings(false)} />
        </Groupe>
      </Feuille>
      {/* Polar : garder ou effacer ce qui a été lu chez Polar (l'accès est révoqué dans les deux cas) */}
      <Feuille visible={deconnexionPolar} onFermer={() => setDeconnexionPolar(false)} titre={t("reglages.polarDeconnecterTitre")}>
        <Texte variante="corps" couleur="t2" style={styles.texteFeuille}>
          {t("reglages.polarDeconnecterTexte")}
        </Texte>
        <Groupe>
          <Option premier danger libelle={t("reglages.polarDeconnecterEffacer")} onPress={() => deconnecterPolar(false)} />
          <Option libelle={t("reglages.polarDeconnecterGarder")} onPress={() => deconnecterPolar(true)} />
          <Option libelle={t("ui.annuler")} onPress={() => setDeconnexionPolar(false)} />
        </Groupe>
      </Feuille>
    </SafeAreaView>
  );
}

/** Rapport du dernier import, sous le groupe (repris de l'ancienne page Données). */
function Rapport({ r }: { r: RapportHevy }) {
  const { couleurs } = useTheme();
  // Exercices créés en perso qui ressemblent à un exercice du catalogue : à relier (jamais en silence), depuis la page Pictos manquants.
  const [aRelier] = useCharge(async (db) => {
    if (!r.exercicesNonReconnus.length) return 0;
    const noms = new Set(r.exercicesNonReconnus);
    return (await suggestionsAConfirmer(db, { departager })).filter((p) => noms.has(p.exercice.nom)).length;
  }, [r]);
  const lignes: string[] = [
          r.genre === "routines" ? tp("profil.routinesImportees", r.routinesImportees) : tp("profil.seancesImportees", r.seancesImportees),
          `${tp("communs.serie", r.seriesImportees)}, ${t("profil.dejaPresentes", { n: r.genre === "routines" ? r.routinesDejaPresentes : r.seancesDejaPresentes })}, ${tp("profil.exercicesReconnus", r.exercicesReconnus)}`,
          ...(r.exercicesNonReconnus.length ? [t("profil.exercicesCrees", { liste: r.exercicesNonReconnus.join(", ") })] : []),
          ...(r.exercicesAVerifier.length ? [t("profil.natureAVerifier", { liste: r.exercicesAVerifier.join(", ") })] : []),
  ];
  return (
    <View style={[styles.rapport, { backgroundColor: couleurs.s1 }]}>
      {lignes.map((l, i) => (
        <Texte key={i} variante={i === 0 ? "saisie" : "corps"} couleur={i === 0 ? "t1" : "t2"} style={{ fontSize: 14 }}>
          {l}
        </Texte>
      ))}
      {aRelier ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/settings/exercices-sans-picto")} style={{ minHeight: 44, justifyContent: "center" }}>
          <Texte variante="libelle" style={{ textDecorationLine: "underline" }}>
            {tp("profil.exercicesARelier", aRelier)}
          </Texte>
        </Pressable>
      ) : null}
      {r.erreurs.length ? (
        <Texte variante="libelle" style={{ color: couleurs.rate }}>
          {tp("profil.lignesIgnorees", r.erreurs.length)}
        </Texte>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  texteFeuille: { fontSize: 14, marginBottom: espace.m },
  rapport: { borderRadius: rayon.l, padding: espace.l, gap: 4, marginHorizontal: espace.l, marginTop: espace.s },
});
