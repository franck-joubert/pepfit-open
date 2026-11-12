import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { aUneLongue, calendrierPlan, conseil, joursParDefaut, prochainLundi, type OptionsDemarrage } from "../boutique/calculs";
import { chargesDuPlan, langue, tx } from "../boutique/donnees";
import { debutParDefaut } from "../boutique/demarrage";
import type { Programme } from "../boutique/modele";
import { alpha, useFamille } from "../boutique/ui";
import { demarrerPlan, lireReglagesPlanif } from "../db";
import { lireActif, t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { rafraichirRappels } from "../natif/rappels";
import { useTheme } from "../theme";
import { espace, police, rayon, TAILLE_MIN } from "../theme/typo";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille, Groupe } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { FeuilleChoix, FeuilleHeure } from "./FeuillesPlanif";
import { heureTexte, jourEtroit, jourLong, jourMois, moisLong } from "./format";
import { midi } from "./Planif";
import { jourDe } from "./planif-donnees";
import { ajouterJ, jourSem } from "./planification";

// Feuille « Démarrer ce programme » (planche boutique-programmes a9) : tes jours (7 tuiles) et le
// conseil « jamais deux séances dures de suite », jour de la sortie longue, date de début, heure (rappel du profil),
// récapitulatif avec la semaine type posée sur tes jours. Le bouton crée le plan : routines, séances programmées, rappels,
// et les poids de départ calculés sur tes 3 derniers mois, écrits dans les séances (planche programmes-charges : plus de
// réglage des poids ici, on les change dans la séance).

/** Un lundi quelconque : les sept jours de la semaine, dans la langue active. */
const LUNDI = "2026-11-02";
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const jourComplet = (j: string) => majuscule(`${jourLong(midi(j))} ${jourMois(midi(j))}`);
/** « 2 novembre » / « November 2 » / « 2. November » / « 2 de noviembre ». */
const dateLongue = (j: string) => {
  const d = Number(j.slice(8, 10));
  const m = moisLong(midi(j));
  const l = lireActif().langue;
  if (l === "fr") return `${d === 1 ? "1er" : d} ${m}`;
  if (l === "de") return `${d}. ${majuscule(m)}`;
  if (l === "es") return `${d} de ${m}`;
  return `${majuscule(m)} ${d}`;
};
/** Abréviation d'une séance pour la mini-semaine : « Fract. », « Foot. », « Seuil » ; « A », « B » pour « 5×5 · Séance A ». */
const abrege = (nom: string) => {
  const seg = nom.split(", ").pop() ?? nom;
  const lettre = /\s(\p{L})$/u.exec(seg);
  if (lettre) return lettre[1]!;
  const mot = seg.split(/[\s:]+/)[0] ?? seg;
  return mot.length > 5 ? `${mot.slice(0, 4)}.` : mot;
};

export function FeuilleDemarrer({ p, visible, onFermer }: { p: Programme; visible: boolean; onFermer: () => void }) {
  useLangue();
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const f = useFamille(p.famille);
  const auj = jourDe(Date.now());
  const [jours, setJours] = useState<number[]>(() => joursParDefaut(p.seancesParSemaine));
  const [longue, setLongue] = useState<number | null>(null);
  const [debut, setDebut] = useState(() => debutParDefaut(auj));
  const [heure, setHeure] = useState("18:00");
  const [rappel, setRappel] = useState(30);
  const [sous, setSous] = useState<"debut" | "longue" | "heure" | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!visible) return;
    lireReglagesPlanif(db)
      .then((r) => {
        setHeure(r.heureDefaut);
        setRappel(r.rappelDefautMin);
      })
      .catch(console.error);
  }, [visible, db, p]);

  const avecLongue = aUneLongue(p);
  const longueJour = avecLongue ? (longue != null && jours.includes(longue) ? longue : ([...jours].sort((a, b) => a - b).pop() ?? null)) : null;
  const o: OptionsDemarrage = { jours, longue: longueJour, debut, heure };
  const c = conseil(p, o);
  const { poses } = useMemo(() => calendrierPlan(p, o), [p, jours, longueJour, debut, heure]); // eslint-disable-line react-hooks/exhaustive-deps
  const semaine1 = poses.filter((x) => x.semaine === 1);
  const fin = poses[poses.length - 1]?.date ?? debut;
  const peut = jours.length > 0 && c.genre !== "trop" && !enCours;

  const basculer = (j: number) => setJours((l) => (l.includes(j) ? l.filter((x) => x !== j) : [...l, j].sort((a, b) => a - b)));
  const conseilTexte =
    c.genre === "ok"
      ? Object.values(p.seances).some((s) => s.role !== "facile")
        ? t("boutique.d.ok", { n: jours.length })
        : t("boutique.d.okSimple", { n: jours.length })
      : c.genre === "suite"
        ? t("boutique.d.suite")
        : jours.length === 0
          ? t("boutique.d.aucun")
          : t(c.genre === "manque" ? "boutique.d.manque" : "boutique.d.trop", { n: c.n, voulu: c.voulu });

  const demarrer = async () => {
    if (!peut) return;
    setEnCours(true);
    try {
      const id = await demarrerPlan(db, p, o, await chargesDuPlan(db, p), langue());
      await rafraichirRappels(db).catch(console.error);
      onFermer();
      // Retour à la racine (Sport), puis la page Programmes avec le plan « En cours » : le retour ramène au Sport.
      if (router.canDismiss()) router.dismissAll();
      router.push({ pathname: "/programmes", params: { plan: id } });
    } catch (e) {
      console.error(e);
      setEnCours(false);
    }
  };

  const debuts = [...new Set([auj, ajouterJ(auj, 1), prochainLundi(ajouterJ(auj, 1)), ajouterJ(prochainLundi(ajouterJ(auj, 1)), 7)])];
  const libelleDebut = (j: string) =>
    j === auj
      ? `${t("boutique.d.aujourdhui")}, ${jourMois(midi(j))}`
      : j === ajouterJ(auj, 1)
        ? `${t("boutique.d.demain")}, ${jourMois(midi(j))}`
        : jourComplet(j);
  const fondTuile = mode === "nuit" ? couleurs.feuilleGroupe : couleurs.s1;

  return (
    <>
      <Feuille
        visible={visible}
        onFermer={onFermer}
        titre={t("boutique.d.titre", { nom: tx(p.nom) })}
        sousTitre={t("boutique.d.sous", { semaines: p.semaines, n: p.seancesParSemaine })}
        pied={
          <BoutonPrincipal
            libelle={t("boutique.d.demarrerLe", { date: dateLongue(debut) })}
            desactive={!peut}
            onPress={() => demarrer().catch(console.error)}
          />
        }
      >
        <View>
          <Texte variante="entete" couleur="t3" style={styles.lib}>
            {t("boutique.d.tesJours")}
          </Texte>
          <View style={styles.jours} accessibilityRole="none">
            {Array.from({ length: 7 }, (_, j) => {
              const on = jours.includes(j);
              const date = ajouterJ(LUNDI, j);
              return (
                <Pressable
                  key={j}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={majuscule(jourLong(midi(date)))}
                  onPress={() => basculer(j)}
                  style={[styles.jour, { backgroundColor: on ? couleurs.t1 : fondTuile }]}
                >
                  <Texte style={{ fontFamily: police.semibold, fontSize: 15, color: on ? couleurs.bg : couleurs.t1 }}>
                    {majuscule(jourEtroit(midi(date)))}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
          <Texte style={[styles.conseil, { color: c.genre === "ok" ? couleurs.valide : couleurs.t3 }]}>{conseilTexte}</Texte>
        </View>


        <Groupe>
          {avecLongue && longueJour != null ? (
            <Ligne premier titre={t("boutique.d.longue")} valeur={majuscule(jourLong(midi(ajouterJ(LUNDI, longueJour))))} onPress={() => setSous("longue")} />
          ) : null}
          <Ligne premier={!avecLongue} titre={t("boutique.d.debut")} valeur={jourComplet(debut)} onPress={() => setSous("debut")} />
          <Ligne
            titre={t("boutique.d.heure")}
            sous={rappel ? t("boutique.d.rappel", { n: rappel }) : t("boutique.d.sansRappel")}
            valeur={heureTexte(heure)}
            onPress={() => setSous("heure")}
          />
        </Groupe>

        <View style={[styles.recap, { backgroundColor: fondTuile }]}>
          <Icone nom="cal" couleur={couleurs.t2} taille={18} />
          <View style={{ flex: 1 }}>
            <Texte style={{ fontSize: 13, lineHeight: 19, color: couleurs.t2 }}>
              <Texte style={{ fontFamily: police.semibold, fontSize: 13, color: couleurs.t1 }}>
                {tp("boutique.d.recap", poses.length).split(" ").slice(0, 2).join(" ")}
              </Texte>
              {` ${tp("boutique.d.recap", poses.length, { date: `${jourLong(midi(fin))} ${dateLongue(fin)}` })
                .split(" ")
                .slice(2)
                .join(" ")}`}
            </Texte>
            <View style={styles.mini}>
              {Array.from({ length: 7 }, (_, j) => {
                const ici = semaine1.find((x) => jourSem(x.date) === j);
                const s = ici ? p.seances[ici.cle]! : null;
                return (
                  <View
                    key={j}
                    style={[
                      styles.miniJour,
                      { backgroundColor: s ? alpha(f.c, s.role === "longue" ? 0.45 : 0.22) : mode === "nuit" ? couleurs.s3 : couleurs.bg },
                      !s && mode === "jour" && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: couleurs.line },
                    ]}
                  >
                    <Texte style={{ fontSize: TAILLE_MIN, fontFamily: police.medium, color: s ? couleurs.t1 : couleurs.t3, opacity: 0.75 }}>
                      {majuscule(jourEtroit(midi(ajouterJ(LUNDI, j))))}
                    </Texte>
                    {s ? (
                      <Texte numberOfLines={1} style={{ fontSize: TAILLE_MIN, fontFamily: police.semibold, color: couleurs.t1 }}>
                        {s.role === "longue" ? t("boutique.d.long") : abrege(tx(s.nom))}
                      </Texte>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Feuille>

      <FeuilleChoix
        titre={sous === "debut" ? t("boutique.d.debut") : sous === "longue" ? t("boutique.d.longue") : null}
        choix={
          sous === "debut"
            ? debuts.map((j) => ({ libelle: libelleDebut(j), onPress: () => (setDebut(j), setSous(null)) }))
            : jours.map((j) => ({ libelle: majuscule(jourLong(midi(ajouterJ(LUNDI, j)))), onPress: () => (setLongue(j), setSous(null)) }))
        }
        onFermer={() => setSous(null)}
      />
      <FeuilleHeure visible={sous === "heure"} valeur={heure} onFermer={() => setSous(null)} onValider={(h) => (setHeure(h), setSous(null))} />
    </>
  );
}

function Ligne({ titre, sous, valeur, onPress, premier }: { titre: string; sous?: string; valeur: string; onPress: () => void; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={`${titre}, ${valeur}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ligne,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte style={{ fontFamily: police.medium, fontSize: 15 }}>{titre}</Texte>
        {sous ? <Texte style={{ fontSize: 12, color: couleurs.t3, marginTop: 2 }}>{sous}</Texte> : null}
      </View>
      <View style={styles.valeur}>
        <Texte style={{ fontFamily: police.medium, fontSize: 15, color: couleurs.t2 }}>{valeur}</Texte>
        <Icone nom="right" couleur={couleurs.t3} taille={16} />
      </View>
    </Appui>
  );
}

const styles = StyleSheet.create({
  lib: { marginTop: 4, marginBottom: 8, marginHorizontal: 4 },
  jours: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  jour: { flex: 1, maxWidth: 48, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  conseil: { fontSize: 13, lineHeight: 18, marginTop: 10, marginHorizontal: 4 },
  ligne: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingVertical: 6, paddingLeft: 16, paddingRight: 6 },
  valeur: { minWidth: 44, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingHorizontal: 6 },
  recap: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12, paddingHorizontal: 14, borderRadius: rayon.l },
  mini: { flexDirection: "row", gap: 4, marginTop: 8 },
  miniJour: { flex: 1, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center", gap: 1 },
});
