import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { ecrireReglagesAgenda, lireReglagesAgenda, type ReglagesAgenda } from "../../agenda/depot";
import { deconnecter, heureDe, nombreEcrites, reecrireTout, synchroniser } from "../../agenda/synchro";
import type { TitreCompose } from "../../agenda/titre";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import * as natif from "../../natif/agenda";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { BarreHaut } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe } from "../../ui/Feuille";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Appui } from "../../ui/mouvement";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { Radio } from "../../ui/Radio";
import { GroupeReglages, LigneReglage, SectionReglages } from "../Reglage";
import { Bloc, LigneDanger } from "./elements";
import { exempleTitre, FeuilleTitre } from "./FeuilleTitre";
import { annonceAgenda, listeEt, nomsDe } from "./vue";

// Page Agenda (Sport › Réglages › Agenda ; planche agenda-ics 1b, 3a, 3d, 3e, 6a, 6b). Pas connecté : le bloc « Tes séances
// dans ton agenda » et « Connecter mon agenda », qui ouvre la feuille de consentement (3a) puis la fenêtre d'Android, puis la
// page des agendas (3c). Connecté : l'état, les agendas et « Déconnecter l'agenda » à part (6a). Accès refusé pour de bon :
// le bloc ambre et « Ouvrir les réglages d'Android » ; l'accès est relu au retour dans l'appli (D18).
// Connecté, « Séances écrites » (ajustements du 03/11) : le titre, composé dans sa feuille (FeuilleTitre) ; changer réécrit les
// séances déjà écrites (synchro, empreinte du contenu) ; « Réécrire mes séances dans l'agenda » remet celles supprimées
// là-bas (reecrireTout, sans confirmation : on peut les supprimer à nouveau), annoncé en une ligne.

const BANDEAU_MS = 6000;

interface Etat {
  r: ReglagesAgenda;
  acces: natif.Acces;
  cals: natif.Calendrier[];
}

async function lire(db: Parameters<typeof lireReglagesAgenda>[0]): Promise<Etat> {
  const [r, acces] = await Promise.all([lireReglagesAgenda(db), natif.lireAcces()]);
  return { r, acces, cals: acces === "accorde" ? await natif.calendriers().catch(() => []) : [] };
}

export function PageAgenda() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [e, setE] = useState<Etat | null>(null);
  const [consent, setConsent] = useState(false);
  const [deco, setDeco] = useState<number | null>(null);
  const [bandeau, setBandeau] = useState<string | null>(null);
  const [feuilleTitre, setFeuilleTitre] = useState(false);
  const [reecriture, setReecriture] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);

  const annoncer = (texte: string) => {
    clearTimeout(minuterie.current);
    setBandeau(texte);
    minuterie.current = setTimeout(() => setBandeau(null), BANDEAU_MS);
  };
  useEffect(() => () => clearTimeout(minuterie.current), []);

  const relire = useCallback(() => lire(db).then(setE).catch(console.error), [db]);
  useFocusEffect(
    useCallback(() => {
      void relire();
      if (annonceAgenda.texte) annoncer(annonceAgenda.texte);
      annonceAgenda.texte = null;
    }, [relire]),
  );
  // Retour des réglages d'Android : l'accès est relu (D18).
  useEffect(() => {
    const a = AppState.addEventListener("change", (s) => s === "active" && void relire());
    return () => a.remove();
  }, [relire]);

  /** « Connecter mon agenda » › « Continuer » : la fenêtre d'Android si besoin, puis le choix des agendas. */
  const continuer = async () => {
    setConsent(false);
    const acces = e?.acces === "accorde" ? "accorde" : await natif.demanderAcces().catch((): natif.Acces => "aDemander");
    await relire();
    if (acces === "accorde") router.push("/settings/agenda/agendas");
  };

  const ouvrirDeco = () => nombreEcrites(db).then(setDeco, console.error);
  const confirmerDeco = (retirer: boolean) => {
    const n = deco ?? 0;
    const ecrit = e ? (nomsDe(e.r.ecrit ? [e.r.ecrit] : [], e.cals)[0] ?? "") : "";
    setDeco(null);
    deconnecter(db, retirer)
      .then((retirees) => {
        annoncer(retirer && n > 0 ? tp("agenda.bandeau.deconnecte", retirees, { agenda: ecrit }) : t("agenda.bandeau.deconnecteSeul"));
        return relire();
      })
      .catch(console.error);
  };

  /** Titre changé (à la fermeture de sa feuille) : réglage écrit, page relue, puis la synchro réécrit les séances déjà écrites. */
  const changerTitre = (titre: TitreCompose) =>
    ecrireReglagesAgenda(db, { titre })
      .then(relire)
      .then(() => synchroniser(db))
      .catch(console.error);

  /** « Réécrire mes séances dans l'agenda » : le nombre de séances écrites, en une ligne. */
  const reecrire = () => {
    setReecriture(true);
    reecrireTout(db)
      .then((i) => {
        if (i.genre === "ok") annoncer(tp("agenda.reecrire.fait", i.ecrites));
        return relire();
      })
      .catch(console.error)
      .finally(() => setReecriture(false));
  };

  const connecte = !!e?.r.connecte;
  // Refusé pour de bon, ou retiré dans Android alors que l'agenda est connecté : seuls les réglages d'Android le rendent.
  const refuse = e?.acces === "refuse" || (connecte && e?.acces === "aDemander");
  const lus = e ? listeEt(nomsDe(e.r.lus, e.cals)) : "";
  const ecrit = e ? (nomsDe(e.r.ecrit ? [e.r.ecrit] : [], e.cals)[0] ?? "") : "";

  let haut: ReactNode = null;
  if (e?.acces === "indisponible") haut = <Bloc titre={t("agenda.bloc.titre")} texte={t("agenda.indisponible")} />;
  else if (refuse)
    haut = (
      <Bloc icone="alerte" titre={t("agenda.refus.titre")} texte={t("agenda.refus.texte")}>
        <BoutonPrincipal libelle={t("agenda.refus.ouvrir")} onPress={() => Linking.openSettings().catch(console.error)} />
      </Bloc>
    );
  else if (e && !connecte)
    haut = (
      <Bloc titre={t("agenda.bloc.titre")} texte={t("agenda.bloc.texte")}>
        <BoutonPrincipal icone="cal" libelle={t("agenda.bloc.connecter")} onPress={() => setConsent(true)} />
      </Bloc>
    );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("agenda.titre")} />
      <ScrollView contentContainerStyle={{ paddingTop: espace.s, paddingBottom: espace.xxl * 4 }}>
        {haut}
        {connecte && e ? (
          <>
            <SectionReglages titre={t("agenda.section")} premiere={!haut} />
            <GroupeReglages>
              <LigneEtat sous={e.r.maj ? t("agenda.etat.sous", { lus, heure: heureDe(e.r.maj) }) : lus} actif={!refuse} />
              <LigneReglage
                libelle={t("agenda.agendas.titre")}
                sous={t("agenda.agendas.sous", { lus, ecrit: ecrit || t("agenda.agendas.aucun") })}
                onPress={refuse ? undefined : () => router.push("/settings/agenda/agendas")}
              />
            </GroupeReglages>
            <SectionReglages titre={t("agenda.ecrit.section")} />
            <GroupeReglages>
              <LigneReglage libelle={t("agenda.ecrit.format")} sous={exempleTitre(e.r.titre)} onPress={() => setFeuilleTitre(true)} />
              <LigneReglage
                libelle={t("agenda.reecrire.titre")}
                sous={t("agenda.reecrire.sous")}
                valeur={reecriture ? t("agenda.reecrire.enCours") : undefined}
                fin="aucune"
                onPress={refuse || reecriture ? undefined : reecrire}
              />
            </GroupeReglages>
            <GroupeReglages style={{ marginTop: espace.m }}>
              <LigneDanger libelle={t("agenda.deconnecter")} onPress={ouvrirDeco} />
            </GroupeReglages>
          </>
        ) : null}
        {/* Après une déconnexion (6b) : l'accès d'Android reste, inutile ; Android seul peut le retirer. */}
        {e && !connecte && e.acces === "accorde" ? (
          <GroupeReglages style={{ marginTop: espace.m }}>
            <LigneReglage
              libelle={t("agenda.android.titre")}
              sous={t("agenda.android.sous")}
              valeur={t("agenda.android.retirer")}
              fin="aucune"
              onPress={() => Linking.openSettings().catch(console.error)}
            />
          </GroupeReglages>
        ) : null}
      </ScrollView>
      {bandeau ? <BandeauAnnuler texte={bandeau} bas={bas + espace.l} lignes={2} /> : null}
      <FeuilleConsentement visible={consent} onFermer={() => setConsent(false)} onContinuer={() => void continuer()} />
      <FeuilleTitre
        visible={feuilleTitre}
        titre={e?.r.titre}
        onFermer={(titre) => {
          setFeuilleTitre(false);
          if (e && JSON.stringify(titre) !== JSON.stringify(e.r.titre)) void changerTitre(titre);
        }}
      />
      <FeuilleDeconnecter n={deco} agenda={ecrit} onFermer={() => setDeco(null)} onDeconnecter={confirmerDeco} />
    </SafeAreaView>
  );
}

/** Ligne d'état (3d) : icône d'agenda verte dans sa tuile, point vert et « Connecté », puis les agendas lus et l'heure. */
function LigneEtat({ sous, actif }: { sous: string; actif: boolean }) {
  const { couleurs } = useTheme();
  const c = actif ? couleurs.valide : couleurs.t3;
  return (
    <View accessible accessibilityLabel={`${t("agenda.etat.connecte")}, ${sous}`} style={styles.etat}>
      <View style={[styles.tuile, { backgroundColor: couleurs.s2 }]}>
        <Icone nom="cal" couleur={c} taille={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.pastille}>
          <View style={[styles.point, { backgroundColor: c }]} />
          <Texte variante="saisie" style={{ fontSize: 15, fontFamily: "Inter-Regular" }}>
            {t("agenda.etat.connecte")}
          </Texte>
        </View>
        <Texte variante="corps" couleur="t3" numberOfLines={1} style={{ fontSize: 13, marginTop: 2 }}>
          {sous}
        </Texte>
      </View>
    </View>
  );
}

/** Feuille « Connecter ton agenda » (3a) : quatre promesses, la note d'Android, « Continuer » et « Plus tard ». */
function FeuilleConsentement({ visible, onFermer, onContinuer }: { visible: boolean; onFermer: () => void; onContinuer: () => void }) {
  const { couleurs } = useTheme();
  const lignes: [NomIcone, string, string][] = [
    ["cal", t("agenda.consent.ecrit"), t("agenda.consent.ecritSous")],
    ["horloge", t("agenda.consent.voit"), t("agenda.consent.voitSous")],
    ["repeat", t("agenda.consent.suit"), t("agenda.consent.suitSous")],
    ["gens", t("agenda.consent.coachs"), t("agenda.consent.coachsSous")],
  ];
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("agenda.consent.titre")}
      pied={
        <View>
          <BoutonPrincipal libelle={t("agenda.consent.continuer")} onPress={onContinuer} />
          <Appui accessibilityRole="button" onPress={onFermer} style={styles.plusTard}>
            <Texte variante="libelle" couleur="t2" style={{ fontFamily: "Inter-Medium" }}>
              {t("agenda.consent.plusTard")}
            </Texte>
          </Appui>
        </View>
      }
    >
      <Groupe>
        {lignes.map(([ic, titre, sous], i) => (
          <View key={ic} style={[styles.promesse, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }]}>
            <View style={[styles.tuile, { backgroundColor: couleurs.s3 }]}>
              <Icone nom={ic} couleur={couleurs.t1} taille={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Texte variante="saisie" style={{ fontSize: 15 }}>
                {titre}
              </Texte>
              <Texte variante="meta" couleur="t3" style={{ marginTop: 2, fontSize: 13 }}>
                {sous}
              </Texte>
            </View>
          </View>
        ))}
      </Groupe>
      <View style={styles.note}>
        <Icone nom="info" couleur={couleurs.t2} taille={18} />
        <Texte variante="corps" couleur="t2" style={{ flex: 1, lineHeight: 19 }}>
          {t("agenda.consent.note")}
        </Texte>
      </View>
    </Feuille>
  );
}

/** Feuille « Déconnecter ton agenda ? » (6a, D17) : les séances écrites, retirées (par défaut) ou laissées. */
function FeuilleDeconnecter({ n, agenda, onFermer, onDeconnecter }: { n: number | null; agenda: string; onFermer: () => void; onDeconnecter: (retirer: boolean) => void }) {
  const { couleurs } = useTheme();
  const [retirer, setRetirer] = useState(true);
  useEffect(() => {
    if (n != null) setRetirer(true);
  }, [n]);
  return (
    <Feuille
      visible={n != null}
      onFermer={onFermer}
      titre={t("agenda.deco.titre")}
      pied={
        <View style={{ gap: espace.s }}>
          <Appui
            accessibilityRole="button"
            onPress={() => onDeconnecter(retirer && !!n)}
            style={({ pressed }) => [styles.boutonFeuille, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
          >
            <Texte variante="exercice" style={{ color: couleurs.rate }}>
              {t("agenda.deco.bouton")}
            </Texte>
          </Appui>
          <Appui accessibilityRole="button" onPress={onFermer} style={({ pressed }) => [styles.boutonFeuille, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}>
            <Texte variante="exercice">{t("agenda.deco.rester")}</Texte>
          </Appui>
        </View>
      }
    >
      <Texte variante="libelle" couleur="t2" style={{ paddingHorizontal: espace.xs, lineHeight: 21 }}>
        {t("agenda.deco.texte")}
      </Texte>
      {n ? (
        <>
          <Texte variante="entete" couleur="t3" style={styles.libelleFeuille}>
            {tp("agenda.deco.section", n, { agenda })}
          </Texte>
          <Groupe>
            <Radio premier libelle={t("agenda.deco.retirer", { agenda })} sous={t("agenda.deco.retirerSous")} choisi={retirer} onPress={() => setRetirer(true)} />
            <Radio libelle={t("agenda.deco.laisser")} sous={t("agenda.deco.laisserSous")} choisi={!retirer} onPress={() => setRetirer(false)} />
          </Groupe>
        </>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  etat: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: espace.m, paddingLeft: espace.l, paddingRight: espace.m },
  tuile: { width: 36, height: 36, borderRadius: rayon.m, alignItems: "center", justifyContent: "center" },
  pastille: { flexDirection: "row", alignItems: "center", gap: 6 },
  point: { width: 7, height: 7, borderRadius: 4 },
  promesse: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.m },
  note: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingHorizontal: espace.xs },
  plusTard: { height: 44, marginTop: espace.s, alignItems: "center", justifyContent: "center" },
  libelleFeuille: { paddingHorizontal: espace.xs, marginBottom: -espace.xs },
  boutonFeuille: { minHeight: 52, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
