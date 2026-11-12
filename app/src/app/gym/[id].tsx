import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  definirSalleParDefaut, equipementsDetectes, lireInventaire, lireSalle, modifierSalle, reglerMachine, retirerEquipementSalle, supprimerAppareil, supprimerSalle,
  uniteProfil, type MachineLigne,
} from "../../db";
import { definirActivitesLieu } from "../../db";
import { retirerElementMateriel } from "../../db/depots/inventaire";
import {
  basculerPoste, disquesDuTrou, ecrireMateriel, ecrireOngletMateriel, lireMateriel, lireOngletMateriel, lirePostes, modeMachine, retirerMateriel,
  type Materiel, type NouveauMateriel, type OngletMateriel,
} from "../../db/depots/materiel";
import { barreChargee, barreDe, etendue, halteresReglables, paires, resumer, type FormeBarre, type GenreMateriel, type Trou } from "../../db/materiel";
import { CARDIO_LIEU, estCardioLieu, libellePoste, POSTES_LIEU, type PosteLieu } from "../../db/natures";
import { aCapacite } from "../../db/lieux";
import { FeuilleActivites } from "../../ecrans/Lieux";
import { BandeauRetrait } from "../../ecrans/BandeauRetrait";
import { EtiquetteEquipements } from "../../ecrans/EtiquetteEquipements";
import { FeuilleNouveauxEquipements } from "../../ecrans/FeuilleNouveauxEquipements";
import { LienTexte, nb, Puce, Puces } from "../../ecrans/materiel/briques";
import { FeuilleAjout } from "../../ecrans/materiel/FeuilleAjout";
import { FeuilleBarre } from "../../ecrans/materiel/FeuilleBarre";
import { convertir, FeuilleDisques } from "../../ecrans/materiel/FeuilleDisques";
import { FeuilleListe, type GenreListe } from "../../ecrans/materiel/FeuilleListe";
import { chargesValeurs, FeuilleMachine, type ValeursMachine } from "../../ecrans/materiel/FeuilleMachine";
import { FeuilleReglables } from "../../ecrans/materiel/FeuilleReglables";
import { poserRetraitRecent } from "../../ecrans/retrait-recent";
import { useTheme } from "../../theme";
import { espace, POLICE_MAX, police, rayon, typo } from "../../theme/typo";
import { useApp, useCharge } from "../../ecrans/contexte";
import { FeuilleAppareil } from "../../ecrans/FeuilleAppareil";
import { Actualiser, sansEtirement } from "../../ui/Actualiser";
import { useDefilementAura } from "../../ui/aura-etat";
import { Bouton } from "../../ui/Bouton";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BarreHaut } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Onglets } from "../../ui/Onglets";
import { Texte } from "../../ui/Texte";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { ListeDesintegrable, marquerSuppression } from "../../ui/Desintegration";
import { desintegration, duree } from "../../theme/mouvement";

const ONGLETS: readonly OngletMateriel[] = ["libres", "machines", "cardio", "postes"];

type Ouverte =
  | { k: "ajout" }
  | { k: "liste"; genre: GenreListe; element: Materiel | null }
  | { k: "reglables"; element: Materiel | null }
  | { k: "barre"; element: Materiel | null }
  | { k: "disques"; trou: Trou }
  | { k: "machine"; m: MachineLigne };

/** Titre d'une ligne du matériel (planche materiel a1). */
function titreDe(m: Materiel): string {
  switch (m.genre) {
    case "leste":
      return t(`materiel.leste.${(m.forme ?? "medecine_ball") as "medecine_ball"}`);
    case "barre":
      return m.prechargee ? t("materiel.barre.sousPrechargees") : t(`materiel.barre.${(m.forme ?? "droite") as FormeBarre}`);
    case "disques":
      return t(`materiel.titreDisques.${m.trou ?? "50"}`);
    default:
      return t(`materiel.genre.${m.genre}`);
  }
}

/** Ce que l'élément permet, dans son unité : « 4, 8, 20 et 30 kg », « 20 kg, chargée jusqu'à 127,5 kg », « 6 paires, de 1,25 à 20 kg ». */
function detailDe(m: Materiel, tous: readonly Materiel[]): string {
  const u = m.unite;
  switch (m.genre) {
    case "halteres": case "kettlebell": case "leste":
      return m.poids.length ? resumer(m.poids, u) : t("materiel.detail.aucun");
    case "reglables": {
      const r = m.poidsPropre ? halteresReglables({ poignee: m.poidsPropre, poignees: m.nombre ?? 2, disques: m.disques }).deux : [];
      return r.length ? etendue(r, u) : t("materiel.detail.aucun");
    }
    case "barre": {
      if (m.prechargee) return m.poids.length ? resumer(m.poids, u) : t("materiel.detail.aucun");
      const propre = m.poidsPropre ?? (u === "lbs" ? barreDe(m.forme).lbs : barreDe(m.forme).kg);
      const d = disquesDuTrou(tous, m.trou ?? barreDe(m.forme).trou).map((x) => ({ kg: convertir(x.kg, "kg", u), paires: x.paires }));
      const c = barreChargee(propre, d, m.maxParCote ?? Infinity, m.chargeMax ?? Infinity);
      return c.length > 1 ? t("materiel.detail.barre", { kg: nb(propre), max: nb(c[c.length - 1]!), unite: u }) : t("materiel.detail.barreSeule", { kg: nb(propre), unite: u });
    }
    case "disques": {
      const n = paires(m.disques);
      if (!n) return m.aVerifier ? t("materiel.detail.aVerifier") : t("materiel.detail.aucun");
      const kg = m.disques.map((d) => d.kg);
      const de = Math.min(...kg), a = Math.max(...kg);
      return de === a ? tp("materiel.detail.disquesUn", n, { n, de: nb(de), unite: u }) : tp("materiel.detail.disques", n, { n, de: nb(de), a: nb(a), unite: u });
    }
  }
}

const valeursDe = (m: MachineLigne): ValeursMachine => ({
  mode: modeMachine(m.type), premiere: m.min, pas: m.palier ?? (m.unite === "kg" ? 5 : 10), max: m.max, appoint: m.appoint, unite: m.unite,
});

export default function FicheSalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const { defilement: defile, surDefilement } = useDefilementAura();
  const [version, setVersion] = useState(0);
  const [d] = useCharge(
    async () => {
      const [salle, inv, materiel, postes, attente, unite] = await Promise.all([
        lireSalle(db, id), lireInventaire(db, id), lireMateriel(db, id), lirePostes(db, id), equipementsDetectes(db, id), uniteProfil(db),
      ]);
      return { salle, inv, materiel, postes, attente: attente.length, unite };
    },
    [db, id, version],
  );
  const [onglet, setOnglet] = useState<OngletMateriel | null>(null);
  // Venu de l'accueil d'un lieu vide : la fiche enchaîne sur la famille suivante (« Passer au cardio »).
  const [suite, setSuite] = useState(false);
  // Une étape 2 à 4 de l'accueil touchée : les onglets paraissent avant le premier élément.
  const [ouvert, setOuvert] = useState(false);
  const [feuille, setFeuille] = useState<Ouverte | null>(null);
  const [nouveaux, setNouveaux] = useState(false);
  const [appareil, setAppareil] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [nom, setNom] = useState<string | null>(null);
  const [activites, setActivites] = useState(false);
  const maj = () => setVersion((n) => n + 1);
  const faire = (f: () => Promise<unknown>) => f().then(maj).catch((e) => console.error(e));

  useEffect(() => {
    lireOngletMateriel(db, id)
      .then((o) => setOnglet((x) => x ?? o ?? "libres"))
      .catch((e) => console.error(e));
  }, [db, id]);

  if (!d?.salle || !onglet) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
  const { salle, inv, materiel, postes, attente, unite } = d;

  const choisirOnglet = (o: OngletMateriel) => {
    setOnglet(o);
    ecrireOngletMateriel(db, salle.id, o).catch((e) => console.error(e));
  };
  const equipe = aCapacite(salle.type, "equipements");
  const vide = materiel.length === 0 && inv.machines.length === 0 && postes.length === 0;
  const accueil = vide && !ouvert;
  const enCours = appareil ? salle.appareils.find((a) => a.id === appareil) ?? null : null;
  const cardio = postes.filter(estCardioLieu);
  const autresPostes = postes.filter((p) => !estCardioLieu(p));
  const compte: Record<OngletMateriel, number> = { libres: materiel.length, machines: inv.machines.length, cardio: cardio.length, postes: autresPostes.length };
  const disques50 = disquesDuTrou(materiel, "50");

  const ouvrirGenre = (g: GenreMateriel) =>
    setFeuille(
      g === "reglables" ? { k: "reglables", element: null }
      : g === "barre" ? { k: "barre", element: null }
      : g === "disques" ? { k: "disques", trou: "50" }
      : { k: "liste", genre: g, element: null },
    );
  const ouvrirElement = (m: Materiel) =>
    setFeuille(
      m.genre === "reglables" ? { k: "reglables", element: m }
      : m.genre === "barre" ? { k: "barre", element: m }
      : m.genre === "disques" ? { k: "disques", trou: m.trou ?? "50" }
      : { k: "liste", genre: m.genre, element: m },
    );

  /** Après le premier enregistrement depuis l'accueil, la fiche passe aux machines (planche a2, « suite »). */
  const apresAccueil = () => {
    if (!vide) return;
    setSuite(true);
    setOuvert(true);
    choisirOnglet("machines");
  };
  const enregistrer = (m: NouveauMateriel) => {
    setFeuille(null);
    faire(async () => {
      await ecrireMateriel(db, salle.id, m);
      apresAccueil();
    });
  };
  const retirer = (m: Materiel) => {
    setFeuille(null);
    marquerSuppression(m.id, duree.feuilleSortie);
    faire(async () => {
      const r = await retirerElementMateriel(db, m.id, titreDe(m));
      if (r) poserRetraitRecent({ retraitId: r.id, libelle: r.libelle, salleNom: salle.nom });
    });
  };
  const retirerMachine = (m: MachineLigne) => {
    setFeuille(null);
    marquerSuppression(m.id, duree.feuilleSortie);
    faire(async () => {
      const r = await retirerEquipementSalle(db, salle.id, `machine:${m.machineId}`);
      if (r) poserRetraitRecent({ retraitId: r.id, libelle: r.libelle, salleNom: salle.nom });
    });
  };

  const ligne = (cle: string, titre: string, detail: string, onPress: () => void) => (
    <Pressable
      key={cle}
      accessibilityRole="button"
      accessibilityLabel={`${titre}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, { borderBottomColor: couleurs.line }, pressed && { backgroundColor: couleurs.s1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Texte variante="saisie" style={{ fontFamily: police.medium }}>
          {titre}
        </Texte>
        <Texte variante="libelle" couleur="t2" numberOfLines={2}>
          {detail}
        </Texte>
      </View>
      <Icone nom="right" couleur={couleurs.t3} taille={18} />
    </Pressable>
  );
  const lignes = (enfants: ReactNode) => <View style={[styles.lignes, { borderTopColor: couleurs.line }]}>{enfants}</View>;
  const videOnglet = (titre: string, texte: string, action?: ReactNode) => (
    <View style={styles.vide}>
      <Texte variante="saisie" style={{ fontFamily: police.semibold }}>
        {titre}
      </Texte>
      <Texte variante="libelle" couleur="t2" style={styles.texteVide}>
        {texte}
      </Texte>
      {action ? <View style={{ marginTop: espace.xl }}>{action}</View> : null}
    </View>
  );
  const puces = (liste: readonly PosteLieu[]) => (
    <Puces style={{ marginTop: espace.s }}>
      {liste.map((p) => (
        <Puce key={p} libelle={libellePoste(p)} on={postes.includes(p)} onPress={() => faire(() => basculerPoste(db, salle.id, p))} />
      ))}
    </Puces>
  );
  const ligneMachine = (m: MachineLigne) => {
    const c = chargesValeurs(valeursDe(m), disques50);
    const detail = !c.length ? t("materiel.detail.machineSans") : t(modeMachine(m.type) === "disques" ? "materiel.detail.machineDisques" : "materiel.detail.pile", { liste: etendue(c, m.unite) });
    return ligne(m.id, m.nom, detail, () => (m.machineId ? setFeuille({ k: "machine", m }) : setAppareil(m.id)));
  };

  const ajouterMachine = () => router.push({ pathname: "/gym/machine", params: { salle: salle.id } });
  const vues: Record<OngletMateriel, ReactNode> = {
    libres: (
      <ListeDesintegrable
        liste={materiel}
        cleDe={(m) => m.id}
        rendu={(m) => ligne(m.id, titreDe(m), detailDe(m, materiel), () => ouvrirElement(m))}
        autour={(elements) => (
          <>
            {lignes(elements)}
            <BoutonTonal libelle={t("materiel.ajouterLibres")} onPress={() => setFeuille({ k: "ajout" })} style={styles.ajouter} />
          </>
        )}
        vide={videOnglet(t("materiel.vide.libres.titre"), t("materiel.vide.libres.texte"), <BoutonPrincipal libelle={t("materiel.ajouterLibres")} onPress={() => setFeuille({ k: "ajout" })} />)}
      />
    ),
    machines: (
      <ListeDesintegrable
        liste={inv.machines}
        cleDe={(m) => m.id}
        rendu={ligneMachine}
        autour={(elements) => (
          <>
            {lignes(elements)}
            <BoutonTonal libelle={t("materiel.ajouterMachine")} onPress={ajouterMachine} style={styles.ajouter} />
          </>
        )}
        vide={
          <>
            {videOnglet(t("materiel.vide.machines.titre"), t("materiel.vide.machines.texte"), <BoutonPrincipal libelle={t("materiel.ajouterMachine")} onPress={ajouterMachine} />)}
            {suite ? <LienTexte libelle={t("materiel.passerCardio")} onPress={() => choisirOnglet("cardio")} /> : null}
          </>
        }
      />
    ),
    cardio: (
      <>
        {cardio.length ? <View style={{ height: espace.s }} /> : videOnglet(t("materiel.vide.cardio.titre"), t("materiel.vide.cardio.texte", { lieu: salle.nom }))}
        {puces(CARDIO_LIEU)}
      </>
    ),
    postes: (
      <>
        {(["bancs", "accessoires"] as const).map((g, i) => (
          <View key={g}>
            <Texte variante="corps" couleur="t2" style={[styles.groupeT, i === 0 && { marginTop: espace.l }]}>
              {t(`materiel.groupe.${g}`)}
            </Texte>
            {puces(POSTES_LIEU[g])}
          </View>
        ))}
      </>
    ),
  };

  const etape = (n: number, titre: string, sous: string, ici: boolean, derniere: boolean, contenu: ReactNode, onPress?: () => void) => {
    const corps = (
      <>
        {!derniere ? <View style={[styles.trait, { backgroundColor: couleurs.line2 }]} /> : null}
        <View style={[styles.numero, ici ? { backgroundColor: couleurs.t1 } : { borderWidth: 1.5, borderColor: couleurs.line2 }]}>
          <Texte variante="meta" style={{ fontFamily: police.semibold, color: ici ? couleurs.bg : couleurs.t2 }}>
            {n}
          </Texte>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="saisie" style={{ fontFamily: ici ? police.semibold : police.medium }}>
            {titre}
          </Texte>
          <Texte variante="libelle" couleur="t2" style={{ marginTop: 2 }}>
            {sous}
          </Texte>
          {contenu}
        </View>
        {onPress ? <Icone nom="right" couleur={couleurs.t3} taille={18} /> : null}
      </>
    );
    return onPress ? (
      <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${titre}, ${sous}`} onPress={onPress} style={({ pressed }) => [styles.etape, { alignItems: "center" }, pressed && { opacity: 0.6 }]}>
        {corps}
      </Pressable>
    ) : (
      <View key={n} style={[styles.etape, ici && { paddingBottom: 28 }]}>
        {corps}
      </View>
    );
  };
  const allerA = (o: OngletMateriel) => () => {
    setOuvert(true);
    choisirOnglet(o);
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      {/* L'en-tête descend avec la page (ui/Actualiser). */}
      <Actualiser defilement={defile}>
      <BarreHaut titre={salle.nom} />
      <Animated.ScrollView {...sansEtirement} onScroll={surDefilement} scrollEventThrottle={16} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled" stickyHeaderIndices={equipe && !accueil ? [1] : undefined}>
        <View>
          <View style={[styles.champ, { backgroundColor: couleurs.s2 }]}>
            <TextInput
              maxFontSizeMultiplier={POLICE_MAX}
              value={nom ?? salle.nom}
              onChangeText={setNom}
              onEndEditing={() => {
                if (nom != null && nom.trim() && nom.trim() !== salle.nom) faire(() => modifierSalle(db, salle.id, { nom }));
                setNom(null);
              }}
              accessibilityLabel={t("salles.nomSalle")}
              cursorColor={couleurs.action}
              selectionColor={couleurs.action}
              style={[typo.saisie, { color: couleurs.t1, padding: 0, height: 48, fontFamily: police.regular }]}
            />
          </View>
          {aCapacite(salle.type, "activites") ? (
            <View style={[styles.lignes, { marginTop: espace.xl, borderTopColor: couleurs.line }]}>
              {ligne(
                "activites",
                t("lieux.activites"),
                salle.activites.length ? salle.activites.map((a) => a.nom).join(", ") : t("lieux.aucuneActivite"),
                () => setActivites(true),
              )}
            </View>
          ) : null}
          {equipe && attente ? (
            <View style={{ marginTop: espace.l }}>
              <EtiquetteEquipements n={attente} onPress={() => setNouveaux(true)} />
            </View>
          ) : null}
        </View>

        {equipe && !accueil ? (
          <View style={{ backgroundColor: couleurs.bg, paddingTop: espace.l, paddingBottom: espace.m }}>
            <Onglets
              etiquette={t("materiel.onglets")}
              marge={espace.xl}
              onglets={ONGLETS.map((o) => {
                const libelle = t(`materiel.onglet.${o}`);
                return { valeur: o, libelle, compte: compte[o], lu: tp("materiel.onglet.lu", compte[o], { onglet: libelle, n: compte[o] }) };
              })}
              valeur={onglet}
              onChange={choisirOnglet}
            />
          </View>
        ) : (
          <View />
        )}

        {equipe ? (
          accueil ? (
            <View style={styles.accueil}>
              <Texte variante="titre" style={{ fontSize: 18, lineHeight: 23 }} accessibilityRole="header">
                {t("materiel.accueil.titre")}
              </Texte>
              <Texte variante="libelle" couleur="t2" style={styles.texteVide}>
                {t("materiel.accueil.texte")}
              </Texte>
              <View style={{ marginTop: 32 }}>
                {etape(
                  1, t("materiel.onglet.libres"), t("materiel.suite.libres"), true, false,
                  <View style={{ marginTop: 18 }}>
                    <BoutonPrincipal libelle={t("materiel.ajouterLibres")} onPress={() => setFeuille({ k: "ajout" })} />
                  </View>,
                )}
                {etape(2, t("materiel.onglet.machines"), t("materiel.suite.machines"), false, false, null, allerA("machines"))}
                {etape(3, t("materiel.onglet.cardio"), t("materiel.suite.cardio"), false, false, null, allerA("cardio"))}
                {etape(4, t("materiel.onglet.postes"), t("materiel.suite.postes"), false, true, null, allerA("postes"))}
              </View>
            </View>
          ) : (
            <View>{vues[onglet]}</View>
          )
        ) : (
          <View />
        )}

        <View style={{ marginTop: espace.xxl * 2, gap: espace.m }}>
          {salle.defaut ? null : <Bouton libelle={t("salles.definirDefaut")} variante="tonal" large onPress={() => faire(() => definirSalleParDefaut(db, salle.id))} />}
          <Bouton libelle={t("salles.supprimer")} variante="tonal" large onPress={() => setConfirmer(true)} />
        </View>
      </Animated.ScrollView>
      </Actualiser>

      <FeuilleAjout
        visible={feuille?.k === "ajout"}
        onFermer={() => setFeuille(null)}
        onChoisir={ouvrirGenre}
      />
      <FeuilleListe
        visible={feuille?.k === "liste"}
        genre={feuille?.k === "liste" ? feuille.genre : "halteres"}
        element={feuille?.k === "liste" ? feuille.element : null}
        uniteDefaut={unite}
        onFermer={() => setFeuille(null)}
        onEnregistrer={enregistrer}
        onRetirer={feuille?.k === "liste" && feuille.element ? () => retirer((feuille as { element: Materiel }).element) : undefined}
      />
      <FeuilleReglables
        visible={feuille?.k === "reglables"}
        element={feuille?.k === "reglables" ? feuille.element : null}
        uniteDefaut={unite}
        onFermer={() => setFeuille(null)}
        onEnregistrer={enregistrer}
        onRetirer={feuille?.k === "reglables" && feuille.element ? () => retirer((feuille as { element: Materiel }).element) : undefined}
      />
      <FeuilleBarre
        visible={feuille?.k === "barre"}
        element={feuille?.k === "barre" ? feuille.element : null}
        tous={materiel}
        uniteDefaut={unite}
        onFermer={() => setFeuille(null)}
        onEnregistrer={enregistrer}
        onRetirer={feuille?.k === "barre" && feuille.element ? () => retirer((feuille as { element: Materiel }).element) : undefined}
      />
      <FeuilleDisques
        visible={feuille?.k === "disques"}
        tous={materiel}
        trouInitial={feuille?.k === "disques" ? feuille.trou : "50"}
        uniteDefaut={unite}
        onFermer={() => setFeuille(null)}
        onEnregistrer={({ ecrire, retirer: ids }) => {
          setFeuille(null);
          faire(async () => {
            for (const m of ecrire) await ecrireMateriel(db, salle.id, m);
            for (const x of ids) await retirerMateriel(db, x);
            if (ecrire.length) apresAccueil();
          });
        }}
      />
      <FeuilleMachine
        visible={feuille?.k === "machine"}
        nom={feuille?.k === "machine" ? feuille.m.nom : ""}
        valeurs={feuille?.k === "machine" ? valeursDe(feuille.m) : null}
        disquesKg={disques50}
        onFermer={() => setFeuille(null)}
        onEnregistrer={(v) => {
          if (feuille?.k !== "machine") return;
          const m = feuille.m;
          setFeuille(null);
          const type = v.mode === "disques" ? (m.type === "smith" ? "smith" : "disques") : m.type === "disques" || m.type === "smith" ? "pile" : m.type;
          faire(() => reglerMachine(db, m.id, { palier: v.pas, max: v.max, min: v.premiere, appoint: v.appoint, type, unite: v.unite }));
        }}
        onRetirer={feuille?.k === "machine" ? () => retirerMachine((feuille as { m: MachineLigne }).m) : undefined}
      />
      <FeuilleNouveauxEquipements visible={nouveaux} salleId={salle.id} onFermer={() => setNouveaux(false)} onChange={maj} />
      <FeuilleAppareil
        visible={appareil != null}
        salleId={salle.id}
        equipements={salle.equipements}
        appareil={enCours}
        onFermer={() => setAppareil(null)}
        onChange={() => {
          setAppareil(null);
          maj();
        }}
        onSupprimer={enCours ? () => { setAppareil(null); marquerSuppression(enCours.id, duree.feuilleSortie); faire(() => supprimerAppareil(db, enCours.id)); } : undefined}
      />
      <BandeauRetrait onAnnule={maj} />
      <FeuilleActivites
        visible={activites}
        choisies={salle.activites}
        onFermer={(l) => {
          setActivites(false);
          faire(() => definirActivitesLieu(db, salle.id, l.map((a) => a.id)));
        }}
      />
      <Feuille visible={confirmer} onFermer={() => setConfirmer(false)} titre={t("salles.supprimerTitre", { nom: salle.nom })}>
        <Texte variante="corps" couleur="t2" style={{ paddingHorizontal: espace.s }}>
          {t(equipe ? "salles.supprimerTexte" : "salles.supprimerTexteLieu")}
        </Texte>
        <Groupe>
          <Option
            premier
            danger
            icone="trash"
            libelle={t("salles.supprimer")}
            onPress={() => {
              setConfirmer(false);
              marquerSuppression(salle.id, desintegration.apresRetour);
              supprimerSalle(db, salle.id).then(() => router.back()).catch((e) => console.error(e));
            }}
          />
          <Option libelle={t("ui.annuler")} onPress={() => setConfirmer(false)} />
        </Groupe>
      </Feuille>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenu: { paddingHorizontal: espace.xl, paddingTop: espace.m, paddingBottom: espace.xxl * 2 },
  champ: { borderRadius: rayon.l, paddingHorizontal: espace.l },
  lignes: { borderTopWidth: StyleSheet.hairlineWidth },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.l, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: espace.s },
  ajouter: { marginTop: espace.l },
  vide: { paddingTop: 28, paddingBottom: 4 },
  texteVide: { marginTop: 4, lineHeight: 20, maxWidth: 340 },
  groupeT: { fontFamily: police.medium, marginTop: espace.xl },
  accueil: { paddingTop: 36 },
  etape: { flexDirection: "row", alignItems: "flex-start", gap: espace.l, minHeight: 64, paddingVertical: 10 },
  numero: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  trait: { position: "absolute", left: 12, top: 38, bottom: -5, width: 1 },
});
