import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { nomDeCircuit } from "../../circuits/construire";
import { idCircuit } from "../../circuits/id";
import { NOM_MAX } from "../../circuits/regles";
import { graineCoupes } from "../../circuits/graine";
import { activitesDeSport, apercuSortie, circuitDepuisSortie, pointsDeSortie, type ApercuSortie } from "../../circuits/sortie";
import { ACTIVITES_CIRCUIT, type ActiviteCircuit, type PointAlt, type TypeCircuit } from "../../circuits/types";
import { vueDuCircuit } from "../../circuits/vue";
import { circuitDeSortie, ecrireCircuit } from "../../db/depots/circuits";
import { lireSportSeance } from "../../db/depots/activites";
import { lireSuivi } from "../../db/depots/suivi-gps";
import { lireSeance, titreSeance } from "../../db/depots/seances";
import { t } from "../../i18n/index";
import { espace } from "../../theme/typo";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { jourMoisLong } from "../format";
import { Champ, PageBriques, Vide } from "../briques";
import { montrerBref } from "../bref";
import { Etiquette, Phrase } from "./briques";
import { CarteCircuit } from "./CarteCircuit";
import { ChiffresCircuit } from "./ChiffresCircuit";
import { ChoixActivites } from "./ChoixActivites";

// « Faire de cette sortie un circuit » (planche Circuits, c2 et c3 ; docs/CODE-CIRCUITS.md) : l'aperçu d'un circuit tiré d'une sortie GPS. Le tracé est
// coupé tout de suite (400 à 800 m au début et à la fin, comme le profil public) : le pointillé montre ce qui ne part jamais, les chiffres sont ceux du
// tracé gardé. Le circuit reste sur ce téléphone. Un circuit par sortie : une sortie déjà faite ouvre son circuit.

interface Charge {
  points: PointAlt[];
  apercu: ApercuSortie;
  nom: string;
  activites: ActiviteCircuit[];
}
type Etat = null | "introuvable" | "court" | Charge;

const TYPES: readonly TypeCircuit[] = ["boucle", "aller-retour", "lineaire"];

export function NouveauCircuit({ seanceId }: { seanceId: string }) {
  const { db } = useApp();
  const [etat, setEtat] = useState<Etat>(null);

  useEffect(() => {
    let actif = true;
    (async () => {
      // Un circuit par sortie : si elle en a déjà un, on l'ouvre au lieu d'en faire un second.
      const deja = await circuitDeSortie(db, seanceId);
      if (deja) {
        router.replace({ pathname: "/circuit/[id]", params: { id: deja.id } });
        return;
      }
      const [suivi, seance, sport, graine] = await Promise.all([lireSuivi(db, seanceId), lireSeance(db, seanceId), lireSportSeance(db, seanceId).catch(() => null), graineCoupes(db)]);
      if (!actif) return;
      const points = suivi ? pointsDeSortie(suivi) : [];
      if (!seance || points.length < 2) return setEtat("introuvable");
      const apercu = apercuSortie(points, graine, seanceId);
      if (!apercu.gardee) return setEtat("court");
      const date = jourMoisLong(seance.seance.debut);
      const nom = titreSeance(seance.seance.titre) ?? t("circuit.nouveau.nomDe", { sport: sport?.nom ?? t("circuit.nouveau.sortie"), date });
      setEtat({ points, apercu, nom, activites: activitesDeSport(sport?.slug) });
    })().catch((e) => {
      console.warn(e);
      if (actif) setEtat("introuvable");
    });
    return () => {
      actif = false;
    };
  }, [db, seanceId]);

  if (etat == null) return <PageBriques titre={t("circuit.nouveau.titre")}>{null}</PageBriques>;
  if (etat === "introuvable" || etat === "court") {
    return (
      <PageBriques titre={t("circuit.nouveau.titre")}>
        <Vide icone="circuit" titre={t(etat === "court" ? "circuit.nouveau.court.titre" : "circuit.nouveau.introuvable.titre")} texte={t(etat === "court" ? "circuit.nouveau.court.texte" : "circuit.nouveau.introuvable.texte")} />
      </PageBriques>
    );
  }
  return <Formulaire seanceId={seanceId} charge={etat} />;
}

function Formulaire({ seanceId, charge }: { seanceId: string; charge: Charge }) {
  const { db } = useApp();
  const { apercu } = charge;
  const gardee = apercu.gardee!;
  const [id] = useState(idCircuit);
  const [nom, setNom] = useState(charge.nom);
  const [type, setType] = useState<TypeCircuit>(apercu.type);
  const [activites, setActivites] = useState<ActiviteCircuit[]>(charge.activites);
  const [occupe, setOccupe] = useState(false);

  const circuit = useMemo(
    () => circuitDepuisSortie({ seanceId, nom, gardee, activites: ACTIVITES_CIRCUIT.filter((a) => activites.includes(a)), type, depart: null, id }),
    [seanceId, nom, gardee, activites, type, id],
  );
  const vue = useMemo(() => (circuit ? vueDuCircuit(circuit) : null), [circuit]);
  const valide = nomDeCircuit(nom) != null && activites.length > 0 && !!circuit;

  if (!circuit || !vue) return <PageBriques titre={t("circuit.nouveau.titre")}>{null}</PageBriques>;

  const creer = async () => {
    if (occupe || !valide) return;
    setOccupe(true);
    try {
      await ecrireCircuit(db, circuit);
      router.replace({ pathname: "/circuit/[id]", params: { id: circuit.id } });
      montrerBref(t("circuit.nouveau.fait"), true);
    } catch (e) {
      console.warn(e);
      montrerBref(t("circuit.nouveau.echec"));
      setOccupe(false);
    }
  };

  return (
    <PageBriques
      titre={t("circuit.nouveau.titre")}
      piedFondu
      pied={<BoutonPrincipal icone="check" libelle={t("circuit.nouveau.creer")} desactive={!valide || occupe} onPress={creer} />}
    >
      <View style={styles.pleine}>
        <CarteCircuit vue={vue} type={circuit.type} hauteur={320} arrondi={0} marge={36} haut={44} autour={{ pointilles: [apercu.debut, apercu.fin] }} />
      </View>
      <ChiffresCircuit circuit={circuit} activite={activites[0] ?? "randonnee"} />

      <Etiquette texte={t("circuit.nouveau.nom")} />
      <Champ serre value={nom} onChangeText={setNom} maxLength={NOM_MAX} autoCapitalize="sentences" accessibilityLabel={t("circuit.nouveau.nom")} placeholder={t("circuit.nouveau.nom")} />
      <Phrase icone="cadenas" texte={t("circuit.nouveau.prive")} />

      <Etiquette texte={t("circuit.nouveau.type")} />
      <Segmente options={TYPES.map((v) => ({ valeur: v, libelle: t(`circuit.type.${v}`) }))} valeur={type} onChange={setType} />

      <Etiquette texte={t("circuit.nouveau.activites")} />
      <ChoixActivites valeur={activites} onChange={setActivites} />
      {activites.length ? null : (
        <Texte variante="corps" couleur="t2" accessibilityLiveRegion="polite" style={styles.une}>
          {t("circuit.modifier.activiteUne")}
        </Texte>
      )}
    </PageBriques>
  );
}

const styles = StyleSheet.create({
  pleine: { marginHorizontal: -espace.l },
  une: { marginTop: espace.s, marginLeft: espace.xs },
});
