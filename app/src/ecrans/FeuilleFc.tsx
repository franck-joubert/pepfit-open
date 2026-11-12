import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { espace, police, rayon, TAILLE_MIN } from "../theme/typo";
import { Attente } from "../ui/Attente";
import { Bouton } from "../ui/Bouton";
import { Feuille } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import type { etatTuto, Tuto } from "./suivi-direct-vue";
import { DESSIN_SOUS, ETAPES_TUTO, type CasTuto, type EtapeTuto } from "./tuto-fc";

// « Activer la FC en direct » (demande d'Alex du 29/10, lot 6 de la course guidée) : ouverte par « Activer » sur la ligne
// de la FC du départ quand aucun capteur ne diffuse, ou par « Autoriser » quand Android ne montre plus sa demande
// d'« Appareils à proximité ». Étapes numérotées, un dessin simplifié sous l'étape qui compte (l'interrupteur de la Whoop,
// jamais une capture de son appli ; les électrodes de la ceinture ; « Autoriser »). Au retour dans pepfit, l'écran de départ
// réessaie seul : la ligne du bas dit la recherche, puis la coche verte ou « toujours rien » en couleur d'information.

type EtatEssai = ReturnType<typeof etatTuto>;

export function FeuilleFc({ tuto, etat, onFermer, onReessayer, onOuvrirWhoop, onOuvrirReglages, capteurInitial = "whoop" }: {
  tuto: Tuto | null;
  capteurInitial?: "whoop" | "ceinture";
  etat: EtatEssai;
  onFermer: () => void;
  onReessayer: () => void;
  onOuvrirWhoop: () => void;
  onOuvrirReglages: () => void;
}) {
  // Garde le contenu pendant la descente de la feuille.
  const [dernier, setDernier] = useState<Tuto>("fc");
  const [capteur, setCapteur] = useState<"whoop" | "ceinture">(capteurInitial);
  useEffect(() => {
    if (tuto) setDernier(tuto);
  }, [tuto]);
  useEffect(() => setCapteur(capteurInitial), [capteurInitial]);
  const ouvert = tuto ?? dernier;
  const cas: CasTuto = ouvert === "appareils" ? "appareils" : capteur;
  const etapes = ETAPES_TUTO[cas];

  const pied =
    etat === "ok" ? (
      <Bouton libelle={t("gps.fc.tuto.continuer")} variante="primaire" large onPress={onFermer} />
    ) : cas === "whoop" ? (
      <>
        <Bouton libelle={t("gps.fc.tuto.ouvrirWhoop")} variante="primaire" large onPress={onOuvrirWhoop} />
        <Bouton libelle={t("gps.reessayer")} large onPress={onReessayer} />
      </>
    ) : cas === "ceinture" ? (
      <Bouton libelle={t("gps.reessayer")} variante="primaire" large onPress={onReessayer} />
    ) : (
      <Bouton libelle={t("gps.fc.tuto.ouvrirReglages")} variante="primaire" large onPress={onOuvrirReglages} />
    );

  return (
    <Feuille
      visible={tuto != null}
      onFermer={onFermer}
      titre={t(ouvert === "appareils" ? "gps.fc.tuto.appareilsTitre" : "gps.fc.tuto.titre")}
      sousTitre={t(ouvert === "appareils" ? "gps.fc.tuto.appareilsIntro" : "gps.fc.tuto.intro")}
      pied={
        <View style={styles.pied}>
          <LigneEtat etat={etat} appareils={cas === "appareils"} />
          {pied}
        </View>
      }
    >
      {ouvert === "fc" ? (
        <Segmente<"whoop" | "ceinture">
          options={[
            { valeur: "whoop", libelle: t("gps.whoop") },
            { valeur: "ceinture", libelle: t("gps.fc.tuto.ceinture") },
          ]}
          valeur={capteur}
          onChange={setCapteur}
          jourBlanc
          style={styles.segment}
        />
      ) : null}

      <View style={styles.etapes}>
        {etapes.map((e, i) => (
          <View key={e.titre}>
            <View style={styles.pas}>
              <View style={styles.rail}>
                <Rond n={i + 1} />
                {i < etapes.length - 1 ? <Filet /> : null}
              </View>
              <View style={styles.pasTx}>
                <Texte style={styles.pasB}>{t(e.titre)}</Texte>
                {e.sous ? (
                  <Texte couleur="t2" style={styles.pasS}>
                    {t(e.sous)}
                  </Texte>
                ) : null}
              </View>
            </View>
            {DESSIN_SOUS[cas] === i ? (
              <View style={styles.pas}>
                <View style={styles.rail}>{i < etapes.length - 1 ? <Filet /> : null}</View>
                <View style={[styles.pasTx, styles.dessin]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  {cas === "whoop" ? <DessinWhoop /> : cas === "ceinture" ? <DessinCeinture /> : <DessinAutoriser />}
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      {cas === "whoop" ? <Rappel /> : null}
    </Feuille>
  );
}

/** Étapes numérotées sans dessin (rond, filet, titre, précision) : celles de la feuille de la batterie. */
export function Etapes({ etapes }: { etapes: readonly EtapeTuto[] }) {
  return (
    <View style={styles.etapes}>
      {etapes.map((e, i) => (
        <View key={e.titre} style={styles.pas}>
          <View style={styles.rail}>
            <Rond n={i + 1} />
            {i < etapes.length - 1 ? <Filet /> : null}
          </View>
          <View style={styles.pasTx}>
            <Texte style={styles.pasB}>{t(e.titre)}</Texte>
            {e.sous ? (
              <Texte couleur="t2" style={styles.pasS}>
                {t(e.sous)}
              </Texte>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function Rond({ n }: { n: number }) {
  const { couleurs } = useTheme();
  return (
    // Piste teintée de la partie (comme le segmenté) : visible la nuit et le jour, où les groupes d'une feuille sont blancs.
    <View style={[styles.rond, { backgroundColor: couleurs.segmentPiste }]}>
      <Texte style={styles.rondT}>{String(n)}</Texte>
    </View>
  );
}

function Filet() {
  const { couleurs } = useTheme();
  return <View style={[styles.filet, { backgroundColor: couleurs.line2 }]} />;
}

/** Une ligne d'écran esquissée : un trait gris, sans texte. */
function Trait({ largeur }: { largeur: `${number}%` | number }) {
  const { couleurs } = useTheme();
  return <View style={[styles.trait, { width: largeur, backgroundColor: couleurs.line2 }]} />;
}

/** Le bas de l'onglet STATUT de l'appli Whoop, esquissé : l'onglet, deux lignes, puis l'interrupteur allumé, cerclé. */
function DessinWhoop() {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.carte, { backgroundColor: couleurs.feuilleGroupe }]}>
      <View style={styles.onglets}>
        <View>
          <Texte style={styles.ongletT}>{t("gps.fc.tuto.dessinOnglet")}</Texte>
          <View style={[styles.souligne, { backgroundColor: couleurs.t1 }]} />
        </View>
        <Trait largeur={44} />
        <Trait largeur={36} />
      </View>
      <View style={styles.traits}>
        <Trait largeur="72%" />
        <Trait largeur="48%" />
      </View>
      <View style={styles.ligneDessin}>
        <Texte style={[styles.ongletT, styles.flex]} numberOfLines={2}>
          {t("gps.fc.tuto.dessinLigne")}
        </Texte>
        <View style={[styles.cerne, { borderColor: couleurs.info }]}>
          <View style={[styles.piste, { backgroundColor: couleurs.interrupteurPiste }]}>
            <View style={[styles.pastille, { backgroundColor: couleurs.interrupteurBouton }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

/** La ceinture vue de dos : la sangle, le boîtier au milieu, les deux électrodes à humidifier. */
function DessinCeinture() {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.carte, styles.ceinture, { backgroundColor: couleurs.feuilleGroupe }]}>
      <View style={[styles.sangle, { borderColor: couleurs.line2 }]} />
      <View style={styles.electrodes}>
        <View style={[styles.electrode, { backgroundColor: couleurs.info }]} />
        <View style={[styles.boitier, { backgroundColor: couleurs.feuilleGroupe, borderColor: couleurs.line2 }]}>
          <Icone nom="coeur" taille={16} couleur={couleurs.t2} />
        </View>
        <View style={[styles.electrode, { backgroundColor: couleurs.info }]} />
      </View>
    </View>
  );
}

/** Le choix d'Android, esquissé : « Autoriser » coché, « Ne pas autoriser » vide. */
function DessinAutoriser() {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.carte, { backgroundColor: couleurs.feuilleGroupe, gap: espace.m }]}>
      <View style={styles.choix}>
        <View style={[styles.radio, { borderColor: couleurs.info }]}>
          <View style={[styles.radioPoint, { backgroundColor: couleurs.info }]} />
        </View>
        <Texte style={styles.choixT}>{t("gps.fc.tuto.a3")}</Texte>
      </View>
      <View style={styles.choix}>
        <View style={[styles.radio, { borderColor: couleurs.t3 }]} />
        <Texte couleur="t2" style={styles.choixT}>
          {t("gps.fc.tuto.dessinRefuser")}
        </Texte>
      </View>
    </View>
  );
}

/** Rappel : la Whoop ne diffuse qu'à un appareil à la fois. */
function Rappel() {
  const { couleurs } = useTheme();
  return (
    <View style={styles.rappel}>
      <Icone nom="info" taille={18} couleur={couleurs.t2} />
      <Texte couleur="t2" style={[styles.pasS, styles.flex]}>
        {t("gps.fc.tuto.unSeul")}
      </Texte>
    </View>
  );
}

function LigneEtat({ etat, appareils }: { etat: EtatEssai; appareils: boolean }) {
  const { couleurs } = useTheme();
  if (!etat) return null;
  return (
    <View style={styles.etat} accessibilityLiveRegion="polite">
      {etat === "recherche" ? (
        <>
          <Attente />
          <Texte couleur="t2" style={styles.etatT}>
            {t("gps.fc.tuto.recherche")}
          </Texte>
        </>
      ) : etat === "ok" ? (
        <>
          <Icone nom="check" taille={22} couleur={couleurs.valide} />
          <Texte style={styles.etatT}>{t(appareils ? "gps.fc.tuto.appareilsOk" : "gps.fc.tuto.ok")}</Texte>
        </>
      ) : (
        <>
          <Icone nom="info" taille={20} couleur={couleurs.info} />
          <Texte couleur="info" style={styles.etatT}>
            {t(appareils ? "gps.fc.tuto.appareilsRien" : "gps.fc.tuto.rien")}
          </Texte>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { marginTop: espace.s, marginBottom: espace.l },
  etapes: { paddingTop: espace.s },
  pas: { flexDirection: "row", gap: 14 },
  rail: { width: 28, alignItems: "center" },
  rond: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rondT: { fontFamily: police.semibold, fontSize: 13, fontVariant: ["tabular-nums"] },
  filet: { flex: 1, width: StyleSheet.hairlineWidth * 2, minHeight: 12, marginVertical: 2 },
  pasTx: { flex: 1, minWidth: 0, paddingTop: 4, paddingBottom: espace.l },
  pasB: { fontFamily: police.medium, fontSize: 15 },
  pasS: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  dessin: { paddingTop: 0 },
  carte: { borderRadius: rayon.l, padding: 14 },
  onglets: { flexDirection: "row", alignItems: "flex-start", gap: espace.l },
  ongletT: { fontFamily: police.semibold, fontSize: TAILLE_MIN, letterSpacing: 0.5 },
  souligne: { height: 2, borderRadius: 1, marginTop: 5 },
  trait: { height: 6, borderRadius: 3, marginTop: 4 },
  traits: { gap: 10, paddingTop: 18, paddingBottom: 18 },
  ligneDessin: { flexDirection: "row", alignItems: "center", gap: espace.m },
  cerne: { borderWidth: 2, borderRadius: 17, padding: 3 },
  piste: { width: 40, height: 24, borderRadius: 12, padding: 3, alignItems: "flex-end" },
  pastille: { width: 18, height: 18, borderRadius: 9 },
  ceinture: { height: 76, justifyContent: "center" },
  sangle: { position: "absolute", left: 14, right: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  electrodes: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  electrode: { width: 56, height: 18, borderRadius: 6 },
  boitier: { width: 56, height: 36, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  choix: { flexDirection: "row", alignItems: "center", gap: espace.m },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioPoint: { width: 10, height: 10, borderRadius: 5 },
  choixT: { fontSize: 15 },
  rappel: { flexDirection: "row", gap: espace.m, paddingTop: espace.xs, paddingBottom: espace.m },
  flex: { flex: 1, minWidth: 0 },
  pied: { gap: espace.s },
  etat: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  etatT: { fontSize: 15 },
});
