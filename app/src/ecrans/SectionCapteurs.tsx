import { useState, type ReactNode } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import type { Jetons } from "../theme/jetons";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone, type NomIcone } from "../ui/Icone";
import { Interrupteur } from "../ui/Interrupteur";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { ouvrirWhoop } from "./appareils-proximite";
import { nomCapteur, nomsDistincts } from "./capteur-cardiaque";
import { FeuilleFc } from "./FeuilleFc";
import { etatTuto, ligneFc as vueFc, precisionTexte } from "./suivi-direct-vue";
import type { CapteursDepart } from "./useCapteursDepart";

// Section « Capteurs » de l'écran de lancement (retour du 06/11) : GPS (seulement pour un sport qui s'y prête), capteur
// cardiaque (FC en direct, multimarque : le nom du capteur trouvé, Whoop, ceinture, montre), « Écran toujours allumé ». Le même
// composant sert le départ d'un sport au suivi (fond noir) et le récap d'une séance de musculation. Les lignes ; l'en-tête
// « Capteurs » est posé par l'écran qui les héberge.

/** Recette (captures) : la ligne d'état du tuto imposée. */
export type RecetteCapteurs = { tuto?: "whoop" | "ceinture" | "appareils"; essai?: "recherche" | "ok" | "rien" };

type Capteur = {
  /** « info » : un réglage à faire, en couleur d'information (jamais le rouge d'une erreur, lot 6). */
  etat: "ok" | "att" | "info";
  sous: string;
  coche?: boolean;
  action?: () => unknown;
  /** Libellé du bouton d'action (« Réessayer » par défaut). */
  actionLibelle?: string;
  interrupteur?: { libelle: string; valeur: boolean; onChange: (v: boolean) => void };
};

export function SectionCapteurs({ c, gps, fc, recette = {}, filets = true, etroit = false }: {
  c: CapteursDepart;
  /** Le sport se fait dehors : la ligne GPS est montrée. */
  gps: boolean;
  /** La FC en direct a un sens pour ce départ (module de suivi présent, pas en récupération). */
  fc: boolean;
  recette?: RecetteCapteurs;
  filets?: boolean;
  /** Carte étroite (récap de musculation) : le bouton d'une ligne à interrupteur passe sous le texte, le titre n'est pas coupé. */
  etroit?: boolean;
}) {
  const { couleurs } = useTheme();
  const [choix, setChoix] = useState(false);
  const actif = !!c.fcActive;
  const retenu = c.fc.etat === "trouvee" ? c.fc.appareil.adresse : null;
  const noms = nomsDistincts(c.diffusent);
  const nomRetenu = actif && retenu ? (noms[c.diffusent.findIndex((a) => a.adresse === retenu)] ?? nomCapteur(c.fc.etat === "trouvee" ? c.fc.appareil : { nom: null })) : t("gps.capteurCardiaque");

  const ligneGps: Capteur =
    c.gps.etat === "ok"
      ? { etat: "ok", sous: precisionTexte(c.gps.precision) ?? "", coche: true }
      : c.gps.etat === "refus"
        ? { etat: "info", sous: t("gps.gpsRefuse"), action: () => c.reessayerGps().catch(console.error) }
        : { etat: "att", sous: t("gps.recherche") };

  const vf = vueFc(actif, c.fc, c.diffusent.length);
  const ligneFc: Capteur = {
    etat: vf.etat === "off" ? "att" : vf.etat,
    sous: vf.cle === "gps.fcPlusieurs" ? t(vf.cle, { n: c.diffusent.length }) : t(vf.cle),
    coche: vf.etat === "ok",
    action:
      vf.action === "activer" ? () => c.ouvrirTuto("fc") : vf.action === "autoriser" ? () => c.autoriserFc().catch(console.error) : vf.action === "changer" ? () => setChoix(true) : undefined,
    actionLibelle: vf.action === "activer" ? t("gps.fc.activer") : vf.action === "autoriser" ? t("gps.fc.autoriser") : vf.action === "changer" ? t("gps.fc.changer") : undefined,
    interrupteur: { libelle: t("gps.capteurCardiaque"), valeur: actif, onChange: c.basculerFc },
  };

  const filet = filets ? <View style={[stylesDepart.filet, { backgroundColor: couleurs.line }]} /> : null;
  return (
    <>
      {gps ? (
        <>
          <LigneCapteur icone="gps" titre={t("gps.gps")} c={ligneGps} />
          {filet}
        </>
      ) : null}
      {fc ? (
        <>
          <LigneCapteur icone="sante" titre={nomRetenu} c={ligneFc} dessous={etroit} />
          {filet}
        </>
      ) : null}
      <LigneDepart icone="appareil" titre={t("gps.ecranAllume")}>
        <Interrupteur libelle={t("gps.ecranAllume")} valeur={c.ecran} onChange={c.basculerEcran} />
      </LigneDepart>

      {fc ? (
        <>
          <FeuilleFc
            tuto={c.tuto}
            etat={c.tuto ? (recette.essai ?? etatTuto(c.tuto, c.essaye, c.fc, c.appareils)) : null}
            capteurInitial={recette.tuto === "ceinture" ? "ceinture" : "whoop"}
            onFermer={c.fermerTuto}
            onReessayer={c.reessayerFc}
            onOuvrirWhoop={() => ouvrirWhoop().catch(console.error)}
            onOuvrirReglages={() => Linking.openSettings().catch(console.error)}
          />
          <Feuille visible={choix} onFermer={() => setChoix(false)} titre={t("gps.fc.choisirTitre")} sousTitre={t("gps.fc.choisirSous")}>
            <Groupe>
              {c.diffusent.map((a, i) => (
                <Option
                  key={a.adresse}
                  premier={i === 0}
                  icone="sante"
                  libelle={noms[i] ?? nomCapteur(a)}
                  choisi={a.adresse === retenu}
                  onPress={() => {
                    setChoix(false);
                    c.choisirCapteur(a.adresse);
                  }}
                />
              ))}
            </Groupe>
          </Feuille>
        </>
      ) : null}
    </>
  );
}

export function Tuile({ icone, couleur }: { icone: NomIcone; couleur: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={[stylesDepart.tu, { backgroundColor: couleurs.s1 }]}>
      <Icone nom={icone} couleur={couleur} taille={22} />
    </View>
  );
}

function LigneCapteur({ icone, titre, c, dessous: sous = false }: { icone: NomIcone; titre: string; c: Capteur; dessous?: boolean }) {
  const { couleurs } = useTheme();
  const teinte: Record<Capteur["etat"], keyof Jetons> = { ok: "valide", att: "t3", info: "info" };
  // Carte étroite : interrupteur et bouton côte à côte coupent le titre (« Capteur cardiaq… ») ; le bouton passe sous le texte.
  const dessous = sous && !!c.action && !!c.interrupteur;
  const bouton = c.action ? (
    <Appui accessibilityRole="button" onPress={() => c.action?.()} style={[stylesDepart.tonal, { backgroundColor: couleurs.s2 }]}>
      <Texte style={stylesDepart.tonalTexte}>{c.actionLibelle ?? t("gps.reessayer")}</Texte>
    </Appui>
  ) : null;
  return (
    <View style={stylesDepart.lt}>
      <Tuile icone={icone} couleur={couleurs[teinte[c.etat]]} />
      <View style={stylesDepart.tx}>
        <Texte numberOfLines={1} style={stylesDepart.b}>
          {titre}
        </Texte>
        <Texte numberOfLines={2} couleur={c.etat === "ok" ? "t2" : teinte[c.etat]} style={stylesDepart.small}>
          {c.sous}
        </Texte>
        {dessous ? <View style={stylesDepart.dessous}>{bouton}</View> : null}
      </View>
      {c.coche ? <Icone nom="check" couleur={couleurs.valide} taille={22} /> : null}
      {dessous ? null : bouton}
      {c.interrupteur ? <Interrupteur libelle={c.interrupteur.libelle} valeur={c.interrupteur.valeur} onChange={c.interrupteur.onChange} /> : null}
    </View>
  );
}

/** Une ligne de l'écran de lancement (tuile, titre, sous-titre, geste à droite) ; l'écran de départ s'en sert aussi pour le lieu et les annonces. */
export function LigneDepart({ icone, titre, sous, children }: { icone: NomIcone; titre: string; sous?: string; children?: ReactNode }) {
  const { couleurs } = useTheme();
  return (
    <View style={stylesDepart.lt}>
      <Tuile icone={icone} couleur={couleurs.t2} />
      <View style={stylesDepart.tx}>
        <Texte numberOfLines={1} style={stylesDepart.b}>
          {titre}
        </Texte>
        {sous ? (
          <Texte numberOfLines={2} couleur="t2" style={stylesDepart.small}>
            {sous}
          </Texte>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export const stylesDepart = StyleSheet.create({
  lt: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: espace.s, paddingHorizontal: espace.xl },
  tu: { width: 40, height: 40, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  tx: { flex: 1, minWidth: 0 },
  b: { fontFamily: police.medium, fontSize: 15 },
  small: { fontSize: 13, marginTop: 2 },
  filet: { height: StyleSheet.hairlineWidth, marginHorizontal: espace.xl },
  dessous: { alignSelf: "flex-start", marginTop: espace.s },
  tonal: { height: 44, paddingHorizontal: espace.l, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  tonalTexte: { fontFamily: police.semibold, fontSize: 15 },
});
