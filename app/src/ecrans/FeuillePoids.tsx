import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import {
  ajouterPesee,
  ecrireReglage,
  lireReglage,
  listerPesees,
  modifierPesee,
  supprimerPesee,
  synchroniserPoidsSante,
  type Pesee,
} from "../db";
import { sante, type EtatSante } from "../natif/sante";
import { SuppressionDifferee } from "../photos/attente";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { espace, POLICE_MAX, rayon, typo } from "../theme/typo";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { BoutonIcone } from "../ui/Cadre";
import { useCouleurPartie } from "../ui/ContextePartie";
import { BoutonPrincipal } from "../ui/Degrade";
import { ListeDesintegrable, marquerSuppression } from "../ui/Desintegration";
import { Feuille, Groupe } from "../ui/Feuille";
import { signalerErreur } from "../ui/FeuilleMessage";
import { GlisserSupprimer } from "../ui/GlisserSupprimer";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { FeuilleDatePesee, FeuillePesee } from "./FeuillePesee";
import { minusculeInitiale as minuscule, t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { fixe } from "./composition-vue";
import { versUnite } from "./format";
import { signalerSaisie } from "../precision/service";
import { jourPesee, kgSaisi, lignesServices, nomOrigine, saisieLocale, SERVICES_SANTE, type LigneService } from "./poids";

const PAQUETS = SERVICES_SANTE.map((s) => s.paquet);
const SANTE_CONNECT_PLAY = "market://details?id=com.google.android.apps.healthdata";

/** Poids de corps (D9, refonte du 26/10) : une seule feuille. Date et poids côte à côte, la dernière pesée (corrigeable),
 *  et le bloc Automatique (Santé Connect) en même temps : l'import n'empêche jamais de peser à la main. Poids saisi et montré
 *  dans l'unité des réglages (kg ou lbs), enregistré en kg. La dernière pesée se supprime comme toute ligne (revue finale
 *  n° 8) : glissée, ou depuis sa feuille ; elle se désintègre, « Annuler » la rend 8 s, la feuille fermée l'efface. */
export function FeuillePoids({ visible, onFermer, onChange }: { visible: boolean; onFermer: () => void; onChange?: () => void }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const { poids: u } = useLangue();
  const partie = useCouleurPartie();
  const [pesees, setPesees] = useState<Pesee[]>([]);
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState(false);
  const [date, setDate] = useState(() => Date.now());
  const [dateOuverte, setDateOuverte] = useState(false);
  const [choisie, setChoisie] = useState<Pesee | null>(null);
  const [auto, setAuto] = useState(false);
  const [etat, setEtat] = useState<EtatSante>({ connecteur: "non-branche", applis: [] });
  const [focus, setFocus] = useState(false);
  const champ = useRef<TextInputInstance>(null);

  const charger = useCallback(async () => {
    setPesees(await listerPesees(db));
    setAuto((await lireReglage(db, "sante_poids")) === "1");
    setEtat(await sante.etatPoids(PAQUETS).catch((): EtatSante => ({ connecteur: "non-branche", applis: [] })));
  }, [db]);
  useEffect(() => {
    if (visible) {
      setTexte("");
      setErreur(false);
      setDate(Date.now());
      charger().catch(console.error);
    }
  }, [visible, charger]);

  const apres = async () => {
    await charger();
    onChange?.();
  };

  const [enAttente, setEnAttente] = useState<string | null>(null);
  const [suppression] = useState(() => new SuppressionDifferee(setEnAttente));
  // Cachées jusqu'à la relecture qui suit leur effacement (pas de retour d'une image).
  const [retirees, setRetirees] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!visible) suppression.valider();
  }, [visible, suppression]);
  useEffect(() => () => suppression.valider(), [suppression]);
  const supprimer = (id: string) => {
    setRetirees((s) => new Set(s).add(id));
    suppression.demander(id, () => void supprimerPesee(db, id).then(apres).catch(signalerErreur("supprimer")));
  };
  const annuler = () => {
    const id = suppression.enAttente;
    suppression.annuler();
    setRetirees((s) => new Set([...s].filter((q) => q !== id)));
  };

  const enregistrer = async () => {
    const kg = kgSaisi(texte, u);
    if (kg == null) return setErreur(true);
    await ajouterPesee(db, kg, date);
    signalerSaisie();
    setTexte("");
    setErreur(false);
    setDate(Date.now());
    await apres();
  };

  const basculer = async (v: boolean) => {
    if (v && etat.connecteur === "a-autoriser" && !(await sante.demanderPermissions(["poids"]))) return;
    setAuto(v);
    await ecrireReglage(db, "sante_poids", v ? "1" : "0");
    if (v) await synchroniserPoidsSante(db, sante).catch(() => false);
    await apres();
  };

  const branche = etat.connecteur === "pret" || etat.connecteur === "a-autoriser";
  const visibles = retirees.size ? pesees.filter((p) => !retirees.has(p.id)) : pesees;
  const importee = visibles.find((p) => p.source !== "manuel");
  const derniere = visibles[0];
  // Une décimale partout (D2 de la revue finale) : « 78,0 kg ».
  const enUnite = (kg: number) => fixe(versUnite(kg, u), 1);
  const maintenant = Date.now();
  const detailSante =
    etat.connecteur === "non-branche"
      ? t("accueil.poids.pasBranche")
      : etat.connecteur === "absent"
        ? t("accueil.poids.pasInstalle")
        : auto && importee
          ? t("accueil.poids.derniere", { jour: minuscule(jourPesee(importee.date, maintenant)) })
          : null;
  const fondChamp = couleurs.feuilleGroupe;

  return (
    <>
      <Feuille visible={visible} onFermer={onFermer}>
        <View style={styles.tete}>
          <Texte variante="titre" accessibilityRole="header">
            {t("accueil.poids.titre")}
          </Texte>
          <BoutonIcone nom="down" libelle={t("accueil.poids.fermer")} onPress={onFermer} />
        </View>

        <View style={styles.champs}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("accueil.poids.dateDeLaPesee", { jour: jourPesee(date, maintenant) })}
            onPress={() => setDateOuverte(true)}
            style={({ pressed }) => [styles.champ, { backgroundColor: pressed ? couleurs.s3 : fondChamp }]}
          >
            <View style={{ flex: 1 }}>
              <Texte variante="meta" couleur="t3">
                {t("accueil.poids.date")}
              </Texte>
              <Texte variante="saisie" numberOfLines={1}>
                {jourPesee(date, maintenant)}
              </Texte>
            </View>
            <Icone nom="down" couleur={couleurs.t3} taille={16} />
          </Pressable>
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no"
            onPress={() => champ.current?.focus()}
            style={[
              styles.champ,
              { backgroundColor: fondChamp },
              (erreur || focus) && { borderWidth: 1.5, borderColor: erreur ? couleurs.rate : couleurs.t1 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Texte variante="meta" couleur={erreur ? "rate" : "t3"}>
                {t("accueil.poids.poids")}
              </Texte>
              <TextInput
                maxFontSizeMultiplier={POLICE_MAX}
                ref={champ}
                value={texte}
                onChangeText={(t) => (setTexte(saisieLocale(t)), setErreur(false))}
                onFocus={() => setFocus(true)}
                onBlur={() => setFocus(false)}
                keyboardType="decimal-pad"
                maxLength={u === "lbs" ? 6 : 5}
                placeholder={enUnite(derniere ? derniere.kg : 78)}
                placeholderTextColor={couleurs.t3}
                cursorColor={partie}
                selectionColor={partie}
                accessibilityLabel={u === "kg" ? t("accueil.poids.poidsEnKilos") : `${t("accueil.poids.poids")}, ${u}`}
                style={[typo.saisie, styles.saisie, { color: couleurs.t1 }]}
              />
            </View>
            <Texte variante="libelle" couleur="t2">
              {u}
            </Texte>
          </Pressable>
        </View>
        <BoutonPrincipal libelle={t("accueil.poids.enregistrer")} onPress={() => enregistrer().catch(signalerErreur())} />

        {/* La dernière pesée supprimée se désintègre, la précédente prend sa place. Pas de suppression d'une pesée importée :
            elle reviendrait au prochain import (elle se corrige dans son appli). */}
        <ListeDesintegrable
          liste={derniere ? [derniere] : []}
          cleDe={(p) => p.id}
          autour={(e) => (
            <>
              <Texte variante="entete" couleur="t3" style={styles.entete}>
                {t("accueil.poids.dernierePesee")}
              </Texte>
              <Groupe>{e}</Groupe>
            </>
          )}
          rendu={(p, etatLigne) => (
            <GlisserSupprimer actif={etatLigne !== "sort" && p.source === "manuel"} cle={p.id} fondContenu={couleurs.feuilleGroupe} onSupprimer={() => supprimer(p.id)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("accueil.poids.pesee", { jour: jourPesee(p.date, maintenant), kg: enUnite(p.kg), u })}
                onPress={() => setChoisie(p)}
                style={({ pressed }) => [styles.pesee, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
              >
                <View style={{ flex: 1 }}>
                  <Texte variante="corps" style={{ fontSize: 15 }}>
                    {jourPesee(p.date, maintenant)}
                  </Texte>
                  {p.source !== "manuel" ? (
                    <Texte variante="meta" couleur="t3">
                      {nomOrigine(p.origine)}
                    </Texte>
                  ) : null}
                </View>
                <Texte variante="saisie">
                  {enUnite(p.kg)}
                  <Texte variante="meta" couleur="t3">
                    {` ${u}`}
                  </Texte>
                </Texte>
              </Pressable>
            </GlisserSupprimer>
          )}
        />
        {enAttente ? (
          <View style={{ marginTop: espace.s }}>
            <BandeauAnnuler texte={t("mesuresCorps.peseeSupprimee")} onAnnuler={annuler} />
          </View>
        ) : null}

        <Texte variante="entete" couleur="t3" style={styles.entete}>
          {t("accueil.poids.automatique")}
        </Texte>
        <Groupe>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={t("accueil.poids.importer")}
            accessibilityState={{ checked: auto && branche, disabled: !branche && etat.connecteur !== "absent" }}
            disabled={!branche && etat.connecteur !== "absent"}
            onPress={() =>
              etat.connecteur === "absent" ? Linking.openURL(SANTE_CONNECT_PLAY).catch(console.error) : basculer(!(auto && branche)).catch(signalerErreur())
            }
            style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.s3 }]}
          >
            <View style={styles.libelle}>
              <Texte variante="corps" couleur={branche || etat.connecteur === "absent" ? "t1" : "t3"} style={{ fontSize: 15 }}>
                {t("accueil.poids.santeConnect")}
              </Texte>
              {detailSante ? (
                <Texte variante="meta" couleur="t3">
                  {detailSante}
                </Texte>
              ) : null}
            </View>
            {auto && branche ? (
              <Icone nom="check" couleur={couleurs.t1} taille={20} />
            ) : etat.connecteur === "absent" ? (
              <Texte variante="exercice" style={{ fontSize: 13 }}>
                {t("accueil.poids.installer")}
              </Texte>
            ) : branche ? (
              <Icone nom="right" couleur={couleurs.t3} taille={18} />
            ) : null}
          </Pressable>
          {lignesServices(etat).map((s) => (
            <Service key={s.paquet} service={s} />
          ))}
        </Groupe>
      </Feuille>

      <FeuilleDatePesee
        visible={dateOuverte}
        valeur={date}
        onFermer={() => setDateOuverte(false)}
        onValider={(t) => (setDate(t), setDateOuverte(false))}
      />
      <FeuillePesee
        pesee={choisie}
        onFermer={() => setChoisie(null)}
        onEnregistrer={(id, patch) => {
          setChoisie(null);
          modifierPesee(db, id, patch).then(apres).catch(signalerErreur());
        }}
        onSupprimer={(id) => {
          setChoisie(null);
          marquerSuppression(id, duree.feuilleSortie);
          supprimer(id);
        }}
      />
    </>
  );
}


/** Une appli santé : nom et état ; touchable (chevron) seulement si elle est à autoriser, ce qui ouvre ses réglages de partage. */
function Service({ service: s }: { service: LigneService }) {
  const { couleurs } = useTheme();
  const eteint = s.etat === "eteint" || s.etat === "pas-installee" || s.etat === "remplacee";
  const autoriser = s.etat === "a-autoriser";
  return (
    <Pressable
      accessibilityRole={autoriser ? "button" : undefined}
      accessibilityLabel={autoriser ? t("accueil.poids.autoriser", { nom: s.nom }) : `${s.nom}${s.detail ? `, ${s.detail}` : ""}`}
      disabled={!autoriser}
      onPress={() => sante.ouvrirReglages(s.paquet).catch(console.error)}
      style={({ pressed }) => [styles.ligne, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <View style={styles.libelle}>
        <Texte variante="corps" couleur={eteint ? "t3" : "t1"} style={{ fontSize: 15 }}>
          {s.nom}
        </Texte>
        {s.detail ? (
          <Texte variante="meta" couleur={s.etat === "reconnu" ? "valide" : "t3"}>
            {s.detail}
          </Texte>
        ) : null}
      </View>
      {autoriser ? <Icone nom="right" couleur={couleurs.t3} taille={18} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tete: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginRight: -espace.m },
  champs: { flexDirection: "row", gap: espace.s },
  champ: { flex: 1, minHeight: 56, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: espace.l },
  saisie: { padding: 0, margin: 0 },
  entete: { paddingHorizontal: espace.xs, paddingTop: espace.xxl - espace.s },
  pesee: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: espace.l },
  ligne: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  libelle: { flex: 1 },
});
