import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { nomDeCircuit } from "../../circuits/construire";
import { circuitDepuisGpx, nomDuFichier, type ErreurGpx, type GpxLu } from "../../circuits/gpx";
import { idCircuit } from "../../circuits/id";
import type { FichierChoisi } from "../../circuits/importer";
import { GPX_OCTETS_MAX, NOM_MAX, POINTS_MAX } from "../../circuits/regles";
import { ACTIVITES_CIRCUIT, type ActiviteCircuit } from "../../circuits/types";
import { vueDuCircuit } from "../../circuits/vue";
import { ecrireCircuit } from "../../db/depots/circuits";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Icone } from "../../ui/Icone";
import { revenir } from "../../ui/revenir";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { Champ, PageBriques, useVoileAcc, Vide } from "../briques";
import { montrerBref } from "../bref";
import { nombre } from "../format";
import { Etiquette, Phrase } from "./briques";
import { CarteCircuit } from "./CarteCircuit";
import { choisirGpx } from "./choisirGpx";
import { ChiffresCircuit } from "./ChiffresCircuit";
import { ChoixActivites } from "./ChoixActivites";
import { poidsTexte } from "./texte";

// « Importer un GPX » (planche Circuits, i2 et i3) : le fichier est choisi puis lu SUR LE TÉLÉPHONE ; rien n'est envoyé avant l'aperçu (D4). L'aperçu
// montre le fichier (nom, poids, points), la carte et le tracé allégé à 400 points au plus, les chiffres, le nom (celui du fichier, modifiable) et
// les activités. Un circuit importé reste sur le téléphone : il ne part jamais. Un fichier sans altitudes reste sans dénivelé. Trois erreurs,
// chacune avec ce qu'on peut faire.

type Etat =
  | { phase: "choix" }
  | { phase: "apercu"; fichier: FichierChoisi; gpx: GpxLu; id: string }
  | { phase: "erreur"; fichier: FichierChoisi; erreur: ErreurGpx };

export function ImporterGpx() {
  const [etat, setEtat] = useState<Etat>({ phase: "choix" });
  const ouvert = useRef(false);

  const choisir = useCallback(async (premier: boolean) => {
    const g = await choisirGpx().catch((e) => {
      console.warn(e);
      return null;
    });
    if (!g) {
      // Annuler le tout premier choix, c'est renoncer à importer.
      if (premier) revenir();
      return;
    }
    setEtat(g.resultat.ok ? { phase: "apercu", fichier: g.fichier, gpx: g.resultat.gpx, id: idCircuit() } : { phase: "erreur", fichier: g.fichier, erreur: g.resultat.erreur });
  }, []);

  useEffect(() => {
    if (ouvert.current) return;
    ouvert.current = true;
    void choisir(true);
  }, [choisir]);

  if (etat.phase === "apercu") return <ApercuGpx key={etat.id} fichier={etat.fichier} gpx={etat.gpx} id={etat.id} onChanger={() => choisir(false)} />;
  if (etat.phase === "erreur") return <ErreurGpx fichier={etat.fichier} erreur={etat.erreur} onChanger={() => choisir(false)} />;
  return <PageBriques titre={t("circuit.importer.titre")}>{null}</PageBriques>;
}

/** Le fichier choisi, sous la barre : son nom, son poids et ses points, et « Changer » (une erreur n'a que « Choisir un autre fichier »). */
function CarteFichier({ fichier, points, onChanger }: { fichier: FichierChoisi; points?: number; onChanger?: () => void }) {
  const { couleurs } = useTheme();
  const voile = useVoileAcc();
  const sous = points == null ? poidsTexte(fichier.octets) : t("circuit.importer.fichier", { poids: poidsTexte(fichier.octets), points: nombre(points, 0) });
  return (
    <View style={[styles.fichier, { backgroundColor: couleurs.s2 }]}>
      <View style={[styles.tuile, { backgroundColor: voile }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Icone nom="fichier" couleur={couleurs.t1} taille={20} />
      </View>
      <View style={styles.nomFichier}>
        <Texte variante="saisie" numberOfLines={1} style={styles.titreFichier}>
          {fichier.nom}
        </Texte>
        <Texte variante="meta" couleur="t3" numberOfLines={1}>
          {sous}
        </Texte>
      </View>
      {onChanger ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("circuit.importer.changer")} onPress={onChanger} style={styles.changer}>
          <Texte variante="saisie" style={[styles.lien, { color: couleurs.t1 }]}>
            {t("circuit.importer.changer")}
          </Texte>
        </Pressable>
      ) : null}
    </View>
  );
}

function ApercuGpx({ fichier, gpx, id, onChanger }: { fichier: FichierChoisi; gpx: GpxLu; id: string; onChanger: () => void }) {
  const { db } = useApp();
  const [nom, setNom] = useState(() => gpx.nom ?? nomDuFichier(fichier.nom) ?? "");
  const [activites, setActivites] = useState<ActiviteCircuit[]>(["randonnee"]);
  const [occupe, setOccupe] = useState(false);

  // Le circuit de l'aperçu : le tracé gardé et ses chiffres ne dépendent ni du nom ni des activités.
  const base = useMemo(() => circuitDepuisGpx(gpx, { nomFichier: fichier.nom, activites: ["randonnee"], id }), [gpx, fichier.nom, id]);
  const vue = useMemo(() => (base ? vueDuCircuit(base) : null), [base]);
  if (!base || !vue) return <ErreurGpx fichier={fichier} erreur="sans_trace" onChanger={onChanger} />;

  const sansAlt = !base.profil;
  const allege = gpx.nPoints > POINTS_MAX;
  const valide = nomDeCircuit(nom) != null && activites.length > 0;

  const importer = async () => {
    if (occupe || !valide) return;
    setOccupe(true);
    try {
      const c = { ...base, nom: nomDeCircuit(nom) ?? base.nom, activites: ACTIVITES_CIRCUIT.filter((a) => activites.includes(a)) };
      await ecrireCircuit(db, c);
      router.replace({ pathname: "/circuit/[id]", params: { id: c.id } });
      montrerBref(t("circuit.importer.fait"), true);
    } catch (e) {
      console.warn(e);
      montrerBref(t("circuit.importer.echec"));
      setOccupe(false);
    }
  };

  return (
    <PageBriques
      titre={t("circuit.importer.titre")}
      avantDefilement={
        <View style={styles.tete}>
          <CarteFichier fichier={fichier} points={gpx.nPoints} onChanger={onChanger} />
        </View>
      }
      piedFondu
      pied={
        <View>
          <Phrase centre icone="cadenas" fort={t("circuit.visible.priveFort")} texte={t("circuit.importer.jamais")} />
          <BoutonPrincipal icone="check" libelle={t("circuit.importer.faire")} desactive={!valide || occupe} onPress={importer} />
        </View>
      }
    >
      <View style={styles.pleine}>
        <CarteCircuit vue={vue} type={base.type} hauteur={250} arrondi={0} />
      </View>
      <View style={styles.chiffres}>
        <ChiffresCircuit circuit={base} activite={activites[0] ?? "randonnee"} />
      </View>
      {allege ? (
        <Texte variante="meta" couleur="t3" style={styles.allege}>
          {t("circuit.importer.allege", { n: nombre(POINTS_MAX, 0) })}
        </Texte>
      ) : null}
      <Etiquette texte={t("circuit.nouveau.nom")} />
      <Champ serre value={nom} onChangeText={setNom} maxLength={NOM_MAX} autoCapitalize="sentences" accessibilityLabel={t("circuit.nouveau.nom")} placeholder={t("circuit.nouveau.nom")} />
      <Etiquette texte={t("circuit.nouveau.activites")} />
      <ChoixActivites valeur={activites} onChange={setActivites} />
      {activites.length ? null : (
        <Texte variante="corps" couleur="t2" accessibilityLiveRegion="polite" style={styles.une}>
          {t("circuit.modifier.activiteUne")}
        </Texte>
      )}
      {sansAlt ? <Phrase icone="info" fort={t("circuit.importer.sansAlt.fort")} texte={t("circuit.importer.sansAlt.non")} /> : null}
    </PageBriques>
  );
}

/** Les trois erreurs (planche, i3) : le fichier reste en haut, l'écran dit pourquoi et ce qu'on peut faire. */
function ErreurGpx({ fichier, erreur, onChanger }: { fichier: FichierChoisi; erreur: ErreurGpx; onChanger: () => void }) {
  const texte =
    erreur === "trop_lourd" ? t("circuit.importer.lourd.texte", { taille: poidsTexte(fichier.octets), limite: poidsTexte(GPX_OCTETS_MAX) }) : t(erreur === "illisible" ? "circuit.importer.illisible.texte" : "circuit.importer.sanstrace.texte");
  return (
    <PageBriques
      titre={t("circuit.importer.titre")}
      avantDefilement={
        <View style={styles.tete}>
          <CarteFichier fichier={fichier} />
        </View>
      }
    >
      <Vide icone="alerte" titre={t(erreur === "illisible" ? "circuit.importer.illisible.titre" : erreur === "trop_lourd" ? "circuit.importer.lourd.titre" : "circuit.importer.sanstrace.titre")} texte={texte}>
        <BoutonTonal hauteur={44} icone="fichier" libelle={t("circuit.importer.autre")} onPress={onChanger} style={styles.pleineLargeur} />
      </Vide>
    </PageBriques>
  );
}

const styles = StyleSheet.create({
  pleineLargeur: { alignSelf: "stretch" },
  tete: { paddingHorizontal: espace.l, paddingBottom: espace.m },
  fichier: { flexDirection: "row", alignItems: "center", gap: espace.m, minHeight: 64, paddingVertical: espace.s, paddingLeft: espace.m, paddingRight: espace.xs, borderRadius: 16 },
  tuile: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  nomFichier: { flex: 1, minWidth: 0 },
  titreFichier: { fontFamily: police.semibold, fontSize: 15, lineHeight: 20 },
  changer: { minHeight: 44, minWidth: 44, paddingHorizontal: espace.m, alignItems: "center", justifyContent: "center" },
  lien: { fontFamily: police.semibold, fontSize: 14 },
  pleine: { marginHorizontal: -espace.l },
  chiffres: { marginBottom: espace.xs },
  allege: { marginTop: espace.m, marginLeft: espace.xs },
  une: { marginTop: espace.s, marginLeft: espace.xs },
});
