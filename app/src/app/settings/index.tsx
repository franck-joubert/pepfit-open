import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { lireReglagesPlanif } from "../../db";
import { drapeaux } from "../../drapeaux";
import { useApp, useCharge } from "../../ecrans/contexte";
import type { Personnage } from "../../ecrans/donnees";
import { exporterDonnees } from "../../ecrans/exporter";
import { rappelCourt } from "../../ecrans/FeuillesPlanif";
import { dureeRepos, heure, jourMois } from "../../ecrans/format";
import { resumePermissions } from "../../ecrans/profil-vue";
import { BoutonLigne, GroupeReglages, LigneReglage, SectionReglages, SousEtat } from "../../ecrans/Reglage";
import { aReconnecter } from "../../ecrans/reglages/etat";
import { FeuilleEffacer } from "../../ecrans/reglages/FeuilleEffacer";
import { chemin, chercher, REGLAGES_INVENTAIRE, ROUTE_PARTIE, type EntreeReglage, type ValeursReglages } from "../../ecrans/reglages/inventaire";
import { LIBELLE_FIN } from "../../ecrans/reglages/Parties";
import { etatSauvegardeTexte, lieuSauvegarde } from "../../ecrans/sauvegarde-vue";
import { NOM_LANGUE } from "../../ecrans/SectionRegion";
import { villeDuFuseau } from "../../i18n/fuseaux";
import { lireActif, t } from "../../i18n/index";
import type { Cle } from "../../i18n/fr";
import { useLangue } from "../../i18n/useLangue";
import { estProtege } from "../../natif/deverrouillage";
import { sante } from "../../natif/sante";
import { lireEtatSauvegarde } from "../../sauvegarde";
import { urlPolitique } from "../../politique";
import { useTheme, type Apparence } from "../../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../../theme/typo";
import { BarreHaut, BoutonIcone } from "../../ui/Cadre";
import { useCouleurPartie } from "../../ui/ContextePartie";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Icone } from "../../ui/Icone";
import { dernierAllume, ONGLETS, ongletsVisibles, type PartiesActives } from "../../ui/menu-flottant";
import { Segmente } from "../../ui/Segmente";
import { Surligne, SURLIGNE_MS } from "../../ui/Surligne";
import { Texte } from "../../ui/Texte";
import { etatVerrou } from "../../verrou/regle";
import * as whoop from "../../whoop";
import * as withings from "../../withings";
import { cleErreur as cleErreurWithings } from "../../withings/messages";

const APPARENCES: Apparence[] = ["jour", "nuit", "auto"];
const PERSONNAGES: Personnage[] = ["homme", "femme"];

/** Lignes de la page elle-même qu'une recherche peut viser (« /settings#x ») : le bloc où défiler. */
const BLOC_DE: Record<string, Bloc> = { personnage: "moi", onglets: "parties", exporter: "donnees", precision: "donnees", politique: "donnees", apparence: "preferences", effacer: "effacer" };
type Bloc = "moi" | "parties" | "appareils" | "donnees" | "preferences" | "aide" | "effacer";

/**
 * Réglages (planche menu, B validée le 01/11 ; b-contextuel.html) : la recherche en haut, puis le global en sections sans
 * icônes — Moi, Par partie (les réglages de chaque onglet, en page pleine, D21), Appareils et connexions, Données et
 * confidentialité, Préférences, Aide — et « Effacer les données de ce téléphone » tout en bas, seul, après un grand vide.
 */
export default function Reglages() {
  useLangue();
  const { db, reglages, regler } = useApp();
  const { couleurs, apparence, choisir } = useTheme();
  const accent = useCouleurPartie();
  const [q, setQ] = useState("");
  const [feuille, setFeuille] = useState<"personnage" | "onglets" | "exporter" | "effacer" | null>(null);
  const [vise, setVise] = useState<string | null>(null);
  const defile = useRef<ScrollViewInstance>(null);
  const blocs = useRef<Partial<Record<Bloc, number>>>({});
  const place = (b: Bloc) => ({ onLayout: (e: { nativeEvent: { layout: { y: number } } }) => void (blocs.current[b] = e.nativeEvent.layout.y) });

  const [l, relire] = useCharge(async (d) => {
    const disponible = await sante.disponible().catch(() => false);
    const [accordees, w, wi, sauvegarde, planif] = await Promise.all([
      disponible ? sante.autorisees().catch(() => []) : Promise.resolve([]),
      whoop.etatWhoop(d).catch(() => null),
      withings.etatWithings(d).catch(() => null),
      lireEtatSauvegarde(d),
      lireReglagesPlanif(d).catch(() => null),
    ]);
    return { disponible, accordees, whoop: w, withings: wi, sauvegarde: etatSauvegardeTexte(sauvegarde), etatSauvegarde: sauvegarde, planif };
  }, []);
  useFocusEffect(
    useCallback(() => {
      relire().catch(console.error);
    }, [relire]),
  );

  // Lien pepfitopen://settings#x ou résultat de recherche : la ligne de cette page clignote une fois (règle 5 de la planche).
  const viser = (id: string) => {
    setQ("");
    const b = BLOC_DE[id];
    if (b) setTimeout(() => defile.current?.scrollTo({ y: Math.max(0, (blocs.current[b] ?? 0) - espace.xxl), animated: true }), 50);
    setVise(id);
    setTimeout(() => setVise((v) => (v === id ? null : v)), SURLIGNE_MS);
    if (id === "personnage" || id === "onglets" || id === "exporter" || id === "effacer") setFeuille(id);
    if (id === "politique" && politique) ouvrirPolitique();
  };
  const lien = useLocalSearchParams<{ ligne?: string }>().ligne;
  useEffect(() => {
    if (!lien) return;
    const m = setTimeout(() => viser(lien), 300);
    router.setParams({ ligne: undefined });
    return () => clearTimeout(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lien]);

  const ouvrir = (e: EntreeReglage) => {
    const [route, ancre] = e.route.split("#");
    if (route === "/settings" && ancre) return viser(ancre);
    router.push(e.route as never);
  };
  const politique = urlPolitique(lireActif().langue);
  const ouvrirPolitique = () => Linking.openURL(politique).catch(console.error);
  const exporter = (format: "json" | "csv") => {
    setFeuille(null);
    exporterDonnees(db, format).catch(signalerErreur("exporter"));
  };
  const surligne = (id: string) => (vise === id ? <Surligne couleur={accent} rayon={0} /> : null);

  // court : l'heure seule aujourd'hui, sinon le jour
  const quand = (ms: number) => (new Date(ms).toDateString() === new Date().toDateString() ? heure(ms) : jourMois(ms));
  const w = l?.whoop;
  const wi = l?.withings;
  const sousWhoop = () => {
    if (!w) return undefined;
    if (w.erreur) return <SousEtat actif={false} erreur={aReconnecter(w.erreur)} texte={aReconnecter(w.erreur) ? texteReconnecter(w.erreur) : t(`whoop.erreur.${w.erreur}` as "whoop.erreur.serveur")} />;
    if (!w.connecte) return <SousEtat actif={false} texte={t("reglages.nonConnecte")} />;
    return <SousEtat actif texte={w.derniereSynchro ? t("reglages.whoopConnecte", { quand: quand(w.derniereSynchro) }) : t("reglages.whoopJamais")} />;
  };
  const sousWithings = () => {
    if (!wi) return undefined;
    if (wi.erreur) return <SousEtat actif={false} erreur={aReconnecter(wi.erreur)} texte={aReconnecter(wi.erreur) ? texteReconnecter(wi.erreur) : t(cleErreurWithings(wi.erreur))} />;
    if (!wi.connecte) return <SousEtat actif={false} texte={t("reglages.nonConnecte")} />;
    return <SousEtat actif texte={wi.derniereSynchro ? t("reglages.whoopConnecte", { quand: quand(wi.derniereSynchro) }) : t("reglages.whoopJamais")} />;
  };
  // à reconnecter : court, comme la planche (« Accès expiré · à reconnecter ») ; le détail reste sur la page des connexions
  const texteReconnecter = (e: string) => t(e === "expire" ? "menu.accesExpire" : "menu.accesPerdu");
  const reconnecter = (f: () => Promise<void>) => () => f().catch(() => router.push("/settings/connexions"));
  const ongletsAffiches = ongletsVisibles(reglages.parties).map((o) => t(o.cle));
  const actif = lireActif();

  const tr = (c: Cle) => t(c as Parameters<typeof t>[0]);
  const visibles = REGLAGES_INVENTAIRE.filter((e) => (!e.drapeau || drapeaux[e.drapeau]) && (e.id !== "politique" || !!politique));
  // Ce que chaque ligne affiche (ici ou sur sa page) : « kilogrammes » trouve Poids, « 18 h » l'heure des séances.
  const auto = (oui: boolean, v: string) => (oui ? [t("region.auto"), v] : [v]);
  const p = reglages.region;
  const sv = l?.etatSauvegarde;
  const ev = etatVerrou(reglages.verrou, estProtege(), reglages.verrouDelaiS);
  const texteVerrou = t(ev.cle, { min: ev.min ?? 0 });
  const valeurs: ValeursReglages = {
    personnage: [t(`profil.${reglages.personnage}`)],
    onglets: ongletsAffiches,
    apparence: [t(`profil.${apparence}`)],
    "langue-region": [NOM_LANGUE[actif.langue], actif.poids, actif.distance],
    langue: auto(p.langue === "auto", NOM_LANGUE[actif.langue]),
    fuseau: auto(p.fuseau === "auto", villeDuFuseau(actif.fuseau)),
    poids: auto(p.poids === "auto", actif.poids),
    distance: auto(p.distance === "auto", actif.distance),
    prenom: reglages.prenom ? [reglages.prenom] : [],
    "repos-defaut": [dureeRepos(reglages.reposDefautS)],
    "fin-repos": [t(LIBELLE_FIN[reglages.alerteRepos])],
    "son-repos": [reglages.sonRepos?.nom || t("profil.sonDefaut")],
    "heure-seances": l?.planif ? [l.planif.heureDefaut] : [],
    rappel: l?.planif ? [t("reglages.avant", { duree: rappelCourt(l.planif.rappelDefautMin) })] : [],
    sauvegarde: l?.sauvegarde?.texte ? [l.sauvegarde.texte] : [],
    emplacement: sv ? [sv.dossier ? lieuSauvegarde(sv) : t("reglages.choisirEmplacement")] : [],
    automatique: sv ? [t(`reglages.frequence.${sv.frequence ?? "jamais"}`)] : [],
    garder: sv && sv.frequence !== "jamais" ? [t("reglages.dernieres", { n: sv.garder })] : [],
    exporter: [t("reglages.formatsExport")],
    verrou: [texteVerrou],
  };
  const resultats = q.trim() ? chercher(q, tr, visibles, valeurs) : null;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("menu.reglages")} />
      <ScrollView ref={defile} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: espace.xxl * 3 }}>
        <View style={[styles.cherche, { backgroundColor: couleurs.s2 }]}>
          <Icone nom="search" couleur={couleurs.t3} taille={18} />
          <TextInput
            maxFontSizeMultiplier={POLICE_MAX}
            value={q}
            onChangeText={setQ}
            placeholder={t("menu.rechercher")}
            placeholderTextColor={couleurs.t3}
            cursorColor={accent}
            selectionColor={accent}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t("menu.rechercher")}
            style={[typo.saisie, styles.champ, { fontFamily: police.regular, color: couleurs.t1 }]}
          />
          {q ? <BoutonIcone nom="close" taille={18} libelle={t("menu.effacerRecherche")} onPress={() => setQ("")} /> : null}
        </View>

        {resultats ? (
          <View style={{ paddingTop: espace.m }}>
            {resultats.length ? (
              <GroupeReglages>
                {resultats.map((e) => (
                  <Resultat key={e.id} libelle={tr(e.libelle)} q={q} ou={chemin(e, tr)} onPress={() => ouvrir(e)} />
                ))}
              </GroupeReglages>
            ) : (
              <Texte variante="corps" couleur="t3" style={styles.vide}>
                {t("menu.aucun", { q: q.trim() })}
              </Texte>
            )}
          </View>
        ) : (
          <>
            <View {...place("moi")}>
              <SectionReglages titre={t("menu.moi")} />
              <GroupeReglages>
                <LigneReglage libelle={t("menu.corps")} sous={t("menu.corpsSous")} onPress={() => router.push("/settings/corps")} />
                <LigneReglage libelle={t("profil.personnage")} valeur={t(`profil.${reglages.personnage}`)} onPress={() => setFeuille("personnage")}>
                  {surligne("personnage")}
                </LigneReglage>
              </GroupeReglages>
            </View>

            {/* Par partie (D19, juste après Moi) : la porte qu'on cherche quand on ne sait pas où est un réglage. */}
            <View {...place("parties")}>
              <SectionReglages titre={t("menu.parPartie")} />
              <GroupeReglages>
                <LigneReglage libelle={t("ui.onglet.accueil")} sous={t("menu.accueilSous")} onPress={() => router.push({ pathname: "/", params: { modifier: "1" } })} />
                <LigneReglage libelle={t("ui.onglet.nutrition")} sous={t("menu.nutritionSous")} onPress={() => router.push(ROUTE_PARTIE.nutrition)} />
                <LigneReglage libelle={t("ui.onglet.entrainement")} sous={t("menu.sportSous")} onPress={() => router.push(ROUTE_PARTIE.sport)} />
                <LigneReglage libelle={t("ui.onglet.sante")} sous={t("menu.santeSous")} onPress={() => router.push(ROUTE_PARTIE.sante)} />
                <LigneReglage libelle={t("menu.onglets")} sous={ongletsAffiches.join(", ") || undefined} onPress={() => setFeuille("onglets")}>
                  {surligne("onglets")}
                </LigneReglage>
              </GroupeReglages>
            </View>

            <View {...place("appareils")}>
              <SectionReglages titre={t("menu.appareils")} />
              <GroupeReglages>
                <LigneReglage
                  libelle={t("reglages.santeConnect")}
                  sous={l ? <SousEtat actif={l.accordees.length > 0} texte={!l.disponible ? t("reglages.indisponible") : l.accordees.length ? resumePermissions(l.accordees) : t("reglages.nonAutorise")} /> : undefined}
                  onPress={() => router.push("/settings/connexions")}
                />
                <LigneReglage libelle={t("reglages.withings")} sous={sousWithings()} onPress={() => router.push("/settings/connexions")}>
                  {aReconnecter(wi?.erreur) ? <BoutonLigne libelle={t("menu.reconnecter")} onPress={reconnecter(withings.commencerConnexion)} /> : null}
                </LigneReglage>
                <LigneReglage libelle={t("reglages.whoop")} sous={sousWhoop()} onPress={() => router.push("/settings/connexions")}>
                  {aReconnecter(w?.erreur) ? <BoutonLigne libelle={t("menu.reconnecter")} onPress={reconnecter(whoop.commencerConnexion)} /> : null}
                </LigneReglage>
                <LigneReglage libelle={t("reglages.importer")} sous={t("menu.importerSous")} onPress={() => router.push("/settings/connexions")} />
              </GroupeReglages>
            </View>

            <View {...place("donnees")}>
              <SectionReglages titre={t("reglages.donneesConfidentialite")} />
              <GroupeReglages>
                <LigneReglage
                  libelle={t("reglages.sauvegarde")}
                  sous={l ? <SousEtat actif={!!l.sauvegarde?.actif} texte={l.sauvegarde?.texte ?? t("reglages.pasDeSauvegarde")} /> : undefined}
                  onPress={() => router.push("/settings/data")}
                />
                <LigneReglage libelle={t("compte.exporter")} sous={t("reglages.formatsExport")} onPress={() => setFeuille("exporter")}>
                  {surligne("exporter")}
                </LigneReglage>
                {politique ? (
                  <LigneReglage libelle={t("reglages.politique")} fin="externe" onPress={ouvrirPolitique}>
                    {surligne("politique")}
                  </LigneReglage>
                ) : null}
              </GroupeReglages>
            </View>

            <View {...place("preferences")}>
              <SectionReglages titre={t("reglages.preferences")} />
              <GroupeReglages>
                <LigneReglage libelle={t("profil.apparence")}>
                  <Segmente
                    options={APPARENCES.map((a) => ({ valeur: a, libelle: t(`profil.${a}`) }))}
                    valeur={apparence}
                    onChange={choisir}
                    style={styles.segment}
                  />
                  {surligne("apparence")}
                </LigneReglage>
                <LigneReglage libelle={t("menu.langueRegion")} sous={`${NOM_LANGUE[actif.langue]}, ${actif.poids}, ${actif.distance}`} onPress={() => router.push("/settings/region")} />
                {/* Verrou d'ouverture (planche compte-connexion, 3a) : ici et pas dans Compte, il marche aussi sans compte. */}
                <LigneReglage libelle={t("verrou.titre")} sous={texteVerrou} onPress={() => router.push("/settings/verrou")} />
              </GroupeReglages>
            </View>

            <View {...place("aide")}>
              <SectionReglages titre={t("menu.aide")} />
              <GroupeReglages>
                <LigneReglage libelle={t("aide.titre")} onPress={() => router.push("/settings/aide")} />
                <LigneReglage libelle={t("circuit.credits.ligne")} sous={t("circuit.credits.ligneAide")} onPress={() => router.push("/settings/aide/credits")} />
                <LigneReglage libelle={t("parcours.rejouer")} onPress={() => router.push("/welcome?rejouer=1")} />
              </GroupeReglages>
            </View>

            {/* Le seul geste dangereux de la page, au fond, après un grand vide. */}
            {(
              <View {...place("effacer")} style={{ marginTop: espace.xxl * 2 }}>
                <GroupeReglages>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setFeuille("effacer")}
                    style={({ pressed }) => [styles.effacer, pressed && { backgroundColor: couleurs.s3 }]}
                  >
                    <Texte variante="saisie" style={[styles.libelle, { color: couleurs.rate, fontFamily: police.medium }]}>
                      {t("reglages.effacer")}
                    </Texte>
                    <Texte variante="corps" couleur="t3" style={{ fontSize: 13, marginTop: 2 }}>
                      {t("menu.effacerSous", { mot: t("reglages.motEffacement") })}
                    </Texte>
                    {surligne("effacer")}
                  </Pressable>
                </GroupeReglages>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Feuille visible={feuille === "personnage"} onFermer={() => setFeuille(null)} titre={t("profil.personnage")}>
        <Groupe>
          {PERSONNAGES.map((p, i) => (
            <Option key={p} premier={i === 0} libelle={t(`profil.${p}`)} choisi={reglages.personnage === p} onPress={() => (regler({ personnage: p }), setFeuille(null))} />
          ))}
        </Groupe>
        {/* Épaules de l'homme (planche morphologie, D11) : naturelles par défaut, larges = le squelette des séances */}
        {reglages.personnage === "homme" ? (
          <Groupe>
            <Option premier libelle={t("profil.epaulesNaturelles")} choisi={reglages.epaules === "naturelles"} onPress={() => regler({ epaules: "naturelles" })} />
            <Option libelle={t("profil.epaulesLarges")} aide={t("profil.epaulesLargesAide")} choisi={reglages.epaules === "appli"} onPress={() => regler({ epaules: "appli" })} />
          </Groupe>
        ) : null}
      </Feuille>
      {/* Onglets de la barre (planche v4, MN4) : un interrupteur par onglet, Accueil compris. Aucun n'est obligatoire ; quand il
          n'en reste qu'un d'allumé, son interrupteur se grise et dit pourquoi. */}
      <Feuille visible={feuille === "onglets"} onFermer={() => setFeuille(null)} titre={t("menu.onglets")}>
        <Texte variante="corps" couleur="t3" style={{ paddingBottom: espace.m }}>
          {t("menu.ongletsIntro")}
        </Texte>
        <GroupeReglages fond={couleurs.feuilleGroupe} style={{ marginHorizontal: 0 }}>
          {ONGLETS.map((o) => {
            const cle = o.chemin.slice(1) as keyof PartiesActives;
            const dernier = dernierAllume(reglages.parties, o.chemin);
            const changer = (v: boolean) => !dernier && regler({ parties: { ...reglages.parties, [cle]: v } });
            return (
              <LigneReglage
                key={o.chemin}
                premier={o === ONGLETS[0]}
                icone={o.icone}
                libelle={t(o.cle)}
                sous={dernier ? t("menu.ongletsDernier") : undefined}
                interrupteur={{ valeur: reglages.parties[cle], onChange: changer, desactive: dernier }}
                onPress={dernier ? undefined : () => changer(!reglages.parties[cle])}
              />
            );
          })}
        </GroupeReglages>
      </Feuille>
      <Feuille visible={feuille === "exporter"} onFermer={() => setFeuille(null)} titre={t("compte.exporter")}>
        <Groupe>
          <Option premier icone="export" libelle={t("compte.exportJson")} onPress={() => exporter("json")} />
          <Option icone="export" libelle={t("compte.exportCsv")} onPress={() => exporter("csv")} />
        </Groupe>
      </Feuille>
      <FeuilleEffacer visible={feuille === "effacer"} onFermer={() => setFeuille(null)} onExporter={() => setFeuille("exporter")} />
    </SafeAreaView>
  );
}

/** Résultat de recherche : le libellé, la partie trouvée en gras, et où il vit (« Sport › Repos »). */
function Resultat({ libelle, q, ou, onPress, premier }: { libelle: string; q: string; ou: string; onPress: () => void; premier?: boolean }): ReactNode {
  const { couleurs } = useTheme();
  const n = q.trim().toLowerCase();
  // même longueur après normalisation pour le français et l'anglais : on cherche sans accents dans une copie sans accents
  const plat = libelle.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const i = n ? plat.indexOf(n.normalize("NFD").replace(/[̀-ͯ]/g, "")) : -1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle}, ${ou}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.resultat,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="saisie" numberOfLines={1} style={styles.libelle}>
          {i >= 0 ? (
            <>
              {libelle.slice(0, i)}
              <Texte variante="saisie" style={[styles.libelle, { fontFamily: police.semibold }]}>
                {libelle.slice(i, i + n.length)}
              </Texte>
              {libelle.slice(i + n.length)}
            </>
          ) : (
            libelle
          )}
        </Texte>
        <Texte variante="corps" couleur="t3" numberOfLines={1} style={{ fontSize: 13, marginTop: 2 }}>
          {ou}
        </Texte>
      </View>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cherche: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: rayon.l, marginHorizontal: espace.l, marginTop: espace.m, paddingLeft: 14, paddingRight: espace.xs },
  champ: { flex: 1, height: 48, paddingVertical: 0 },
  vide: { paddingHorizontal: espace.xxl + espace.s, paddingVertical: 14 },
  segment: { width: 186 },
  effacer: { minHeight: 56, justifyContent: "center", paddingVertical: espace.s + 2, paddingLeft: espace.l, paddingRight: espace.m },
  resultat: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: espace.s, paddingLeft: espace.l, paddingRight: espace.m },
  libelle: { fontFamily: police.regular, fontSize: 15 },
});
