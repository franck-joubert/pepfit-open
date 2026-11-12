import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  creerAppareil, listerExercices, modifierAppareil, normaliserPaliers, paliersReguliers, pasRegulier,
  type AppareilDetail, type Equipement, type Exercice, type TypeAppareil,
} from "../db";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, rayon, typo } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { nombre } from "./format";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

const TYPES: TypeAppareil[] = ["pile", "poulie", "smith", "halteres", "disques", "assistance"];
export const libelleTypeAppareil = (type: TypeAppareil): string => t(`salles.type.${type}`);

type Mode = "liste" | "regulier";
type Etape = "form" | "type" | "exercices";

function Pas({ libelle, valeur, onChange, min = 0 }: { libelle: string; valeur: number; onChange: (v: number) => void; min?: number }) {
  useLangue();
  const { couleurs } = useTheme();
  const bouton = (delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(delta > 0 ? "ui.plusDe" : "ui.moinsDe", { libelle })}
      onPress={() => onChange(Math.max(min, Math.round((valeur + delta) * 100) / 100))}
      style={[styles.pm, { backgroundColor: couleurs.s2 }]}
    >
      <Texte variante="saisie">{delta > 0 ? "+" : "−"}</Texte>
    </Pressable>
  );
  return (
    <View style={styles.pas}>
      <Texte variante="corps" couleur="t2" style={{ flex: 1 }}>
        {libelle}
      </Texte>
      {bouton(-0.5)}
      <Texte variante="saisie" style={{ width: 64, textAlign: "center" }}>
        {nombre(valeur, 1)}
      </Texte>
      {bouton(0.5)}
    </View>
  );
}

/** Fiche d'un appareil (D15) : nom, type, paliers en mode Liste ou Pas régulier, exercices rattachés. */
export function FeuilleAppareil({ visible, salleId, equipements, appareil, onFermer, onChange, onSupprimer }: {
  visible: boolean;
  salleId: string;
  equipements: Equipement[];
  appareil: AppareilDetail | null;
  onFermer: () => void;
  onChange: () => void;
  onSupprimer?: () => void;
}) {
  const { db } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const [etape, setEtape] = useState<Etape>("form");
  const [nom, setNom] = useState("");
  const [type, setType] = useState<TypeAppareil>("pile");
  const [mode, setMode] = useState<Mode>("liste");
  const [liste, setListe] = useState<number[]>([]);
  const [choisi, setChoisi] = useState<number | null>(null);
  const [reg, setReg] = useState({ premier: 5, pas: 5, dernier: 100 });
  const [ids, setIds] = useState<string[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    if (!visible) return;
    setEtape("form");
    setRecherche("");
    setChoisi(null);
    setNom(appareil?.nom ?? "");
    setType(appareil?.type ?? "pile");
    setIds(appareil?.exerciceIds ?? []);
    const l = appareil?.paliers_kg ?? [];
    setListe(l);
    const p = pasRegulier(l);
    setMode(p ? "regulier" : "liste");
    setReg(p ? { premier: l[0]!, pas: p, dernier: l[l.length - 1]! } : { premier: 5, pas: 5, dernier: 100 });
    listerExercices(db).then(setExercices).catch(() => {});
  }, [visible, appareil, db]);

  const paliers = mode === "regulier" ? paliersReguliers(reg.premier, reg.pas, reg.dernier) : liste;

  const enregistrer = async () => {
    const donnees = { nom, type, paliersKg: normaliserPaliers(paliers), exerciceIds: ids };
    if (appareil) await modifierAppareil(db, appareil.id, donnees);
    else await creerAppareil(db, salleId, donnees);
    onChange();
  };

  const candidats = exercices
    .filter((e) => equipements.length === 0 || equipements.includes(e.equipement))
    .filter((e) => !recherche.trim() || e.nom.toLowerCase().includes(recherche.trim().toLowerCase()))
    .slice(0, 60);

  if (etape === "type")
    return (
      <Feuille visible={visible} onFermer={onFermer} titre={t("salles.typeAppareil")}>
        <Groupe>
          {TYPES.map((ty, i) => (
            <Option key={ty} premier={i === 0} libelle={libelleTypeAppareil(ty)} choisi={ty === type} onPress={() => (setType(ty), setEtape("form"))} />
          ))}
        </Groupe>
      </Feuille>
    );

  if (etape === "exercices")
    return (
      <Feuille visible={visible} onFermer={onFermer} titre={t("salles.exercicesSurAppareil")}>
        <View style={[styles.champ, { backgroundColor: couleurs.s2 }]}>
          <TextInput
            maxFontSizeMultiplier={POLICE_MAX}
            value={recherche}
            onChangeText={setRecherche}
            placeholder={t("ui.rechercher")}
            placeholderTextColor={couleurs.t3}
            cursorColor={couleurs.action}
            selectionColor={couleurs.action}
            accessibilityLabel={t("salles.rechercherExercice")}
            style={[typo.saisie, { color: couleurs.t1, padding: 0, height: 48, fontFamily: "Inter-Regular" }]}
          />
        </View>
        <Groupe>
          {candidats.map((e, i) => (
            <Option
              key={e.id}
              premier={i === 0}
              libelle={e.nom}
              choisi={ids.includes(e.id)}
              onPress={() => setIds(ids.includes(e.id) ? ids.filter((x) => x !== e.id) : [...ids, e.id])}
            />
          ))}
        </Groupe>
        <Bouton libelle={t("ui.termine")} variante="primaire" large onPress={() => setEtape("form")} />
      </Feuille>
    );

  return (
    <Feuille visible={visible} onFermer={onFermer} titre={appareil ? t("salles.appareilDefaut") : t("salles.nouvelAppareil")}>
      <View style={[styles.champ, { backgroundColor: couleurs.s2 }]}>
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={nom}
          onChangeText={setNom}
          placeholder={t("salles.nomAppareilPlaceholder")}
          placeholderTextColor={couleurs.t3}
          cursorColor={couleurs.action}
          selectionColor={couleurs.action}
          accessibilityLabel={t("salles.nomAppareilLabel")}
          style={[typo.saisie, { color: couleurs.t1, padding: 0, height: 48, fontFamily: "Inter-Regular" }]}
        />
      </View>
      <Groupe>
        <Option premier libelle={t("salles.typeLigne", { type: libelleTypeAppareil(type) })} onPress={() => setEtape("type")} />
        <Option libelle={t("salles.exercicesLigne", { n: ids.length })} onPress={() => setEtape("exercices")} />
      </Groupe>

      <Texte variante="exercice">{t("salles.paliers")}</Texte>
      <Segmente<Mode>
        options={[
          { valeur: "liste", libelle: t("salles.mode.liste") },
          { valeur: "regulier", libelle: t("salles.mode.regulier") },
        ]}
        valeur={mode}
        onChange={(m) => {
          if (m === "regulier" && liste.length >= 2) setReg({ premier: liste[0]!, pas: pasRegulier(liste) ?? (Math.round((liste[1]! - liste[0]!) * 100) / 100 || 5), dernier: liste[liste.length - 1]! });
          setMode(m);
        }}
      />
      {mode === "regulier" ? (
        <View style={{ gap: espace.xs }}>
          <Pas libelle={t("salles.premier")} valeur={reg.premier} onChange={(v) => setReg({ ...reg, premier: v })} />
          <Pas libelle={t("salles.pas")} valeur={reg.pas} min={0.5} onChange={(v) => setReg({ ...reg, pas: v })} />
          <Pas libelle={t("salles.dernier")} valeur={reg.dernier} onChange={(v) => setReg({ ...reg, dernier: v })} />
          <Texte variante="libelle" couleur="t2">
            {paliers.length ? tp("salles.resumePaliers", paliers.length, { min: nombre(paliers[0]!, 1), max: nombre(paliers[paliers.length - 1]!, 1) }) : t("salles.incoherent")}
          </Texte>
        </View>
      ) : (
        <View style={{ gap: espace.m }}>
          <View style={styles.tuiles}>
            {liste.map((p) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityLabel={t("salles.palierLabel", { valeur: nombre(p, 1) })}
                onPress={() => setChoisi(choisi === p ? null : p)}
                style={[styles.tuile, { backgroundColor: choisi === p ? couleurs.s3 : couleurs.s2 }]}
              >
                <Texte variante="saisie" style={{ fontSize: 15 }}>
                  {nombre(p, 1)}
                </Texte>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("salles.ajouterPalier")}
              onPress={() => {
                const v = liste.length ? Math.round((liste[liste.length - 1]! + (pasRegulier(liste) ?? 5)) * 100) / 100 : 5;
                setListe(normaliserPaliers([...liste, v]));
                setChoisi(v);
              }}
              style={[styles.tuile, { backgroundColor: couleurs.s2 }]}
            >
              <Icone nom="plus" couleur={couleurs.t2} taille={20} />
            </Pressable>
          </View>
          {choisi != null ? (
            <View style={{ gap: espace.xs }}>
              <Pas
                libelle={t("salles.palier")}
                valeur={choisi}
                onChange={(v) => {
                  setListe(normaliserPaliers([...liste.filter((x) => x !== choisi), v]));
                  setChoisi(v);
                }}
              />
              <Option
                premier
                danger
                icone="trash"
                libelle={t("salles.supprimerPalier")}
                onPress={() => {
                  setListe(liste.filter((x) => x !== choisi));
                  setChoisi(null);
                }}
              />
            </View>
          ) : null}
        </View>
      )}

      <Bouton libelle={t("ui.enregistrer")} variante="primaire" large desactive={!nom.trim()} onPress={() => enregistrer().catch((e) => console.error(e))} />
      {onSupprimer ? (
        <Groupe>
          <Option premier danger icone="trash" libelle={t("salles.supprimerAppareil")} onPress={onSupprimer} />
        </Groupe>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  champ: { borderRadius: rayon.l, paddingHorizontal: espace.l },
  pas: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.s },
  pm: { width: 44, height: 44, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  tuiles: { flexDirection: "row", flexWrap: "wrap", gap: espace.s },
  tuile: { minWidth: 56, minHeight: 44, borderRadius: rayon.l, paddingHorizontal: espace.m, alignItems: "center", justifyContent: "center" },
});
