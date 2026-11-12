import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, PanResponder, StyleSheet, View } from "react-native";
import { courbe, duree } from "../../theme/mouvement";
import { ajouterRepas, ecrireReglage, listerRepas, lireReglage, modifierRepas, ordonnerRepas, supprimerRepas, type Repas } from "../../db";
import { Groupe, Option } from "../../ui/Feuille";
import { RoueDuree } from "../../ui/RoueDuree";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { rafraichirRappelsRepas } from "../../natif/rappels-repas";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Interrupteur } from "../../ui/Interrupteur";
import { useReduit } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { CadreVide, ChampTexte, Entete, FeuilleRoue, LigneFilet, nomRepas, PageNutrition, plage } from "./commun";

/** Carte posée à sa nouvelle place (comme les autres glisser-déposer). */
const poser = Easing.bezier(...courbe.sortie);

// Repas et horaires (planche 8) : chaque repas avec sa poignée (glisser pour changer l'ordre), son heure (roue) et son
// interrupteur ; « + Ajouter un repas » en pointillé ; rappels (heure + délai, seulement si le repas est vide).

const H = 64;
const HEURES = plage(0, 23, 1);
const MINUTES = plage(0, 55, 5);
const DELAIS = plage(0, 180, 15);
const heureTexte = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function RepasHoraires() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [repas, setRepas] = useState<Repas[]>([]);
  const [heure, setHeure] = useState<Repas | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [nom, setNom] = useState("");
  const [rappel, setRappel] = useState(false);
  const [delai, setDelai] = useState(30);
  const [siVide, setSiVide] = useState(true);
  const [roueDelai, setRoueDelai] = useState(false);

  const charger = useCallback(async () => {
    setRepas(await listerRepas(db, true));
    setRappel((await lireReglage(db, "nutri_rappel")) === "1");
    setDelai(Number(await lireReglage(db, "nutri_rappel_delai")) || 30);
    setSiVide((await lireReglage(db, "nutri_rappel_vide")) !== "0");
  }, [db]);
  useEffect(() => {
    charger().catch((e) => console.error(e));
  }, [charger]);
  const ecrire = (p: Promise<unknown>) =>
    p
      .then(charger)
      .then(() => rafraichirRappelsRepas(db, { demander: true }))
      .catch((e) => console.error(e));

  // Glisser par la poignée : la ligne suit le doigt, ses voisines s'écartent ; posée, l'ordre s'écrit.
  const [tenu, setTenu] = useState<number | null>(null);
  const [cible, setCible] = useState<number | null>(null);
  const ty = useRef(new Animated.Value(0)).current;
  // « Réduire les animations » (audit du 28/10, constat 43) : la ligne lâchée se pose sans glisser.
  const reduit = useReduit();
  const etat = useRef({ repas, tenu: null as number | null, cible: null as number | null });
  etat.current.repas = repas;
  const poignee = (i: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        etat.current.tenu = i;
        etat.current.cible = i;
        ty.setValue(0);
        setTenu(i);
        setCible(i);
      },
      onPanResponderMove: (_, g) => {
        ty.setValue(g.dy);
        const c = Math.max(0, Math.min(etat.current.repas.length - 1, i + Math.round(g.dy / H)));
        if (c !== etat.current.cible) {
          etat.current.cible = c;
          setCible(c);
        }
      },
      onPanResponderRelease: () => lacher(),
      onPanResponderTerminate: () => lacher(),
    });
  const lacher = () => {
    const { tenu: de, cible: vers, repas: l } = etat.current;
    if (de == null || vers == null) return;
    Animated.timing(ty, { toValue: (vers - de) * H, duration: reduit ? 0 : duree.depot, easing: poser, useNativeDriver: true }).start(() => {
      const ids = l.map((r) => r.id);
      const [x] = ids.splice(de, 1);
      ids.splice(vers, 0, x!);
      setRepas(ids.map((id) => l.find((r) => r.id === id)!));
      setTenu(null);
      setCible(null);
      ty.setValue(0);
      etat.current.tenu = null;
      if (de !== vers) ecrire(ordonnerRepas(db, ids));
    });
  };
  const decalage = (i: number) => {
    if (tenu == null || cible == null || i === tenu) return 0;
    if (tenu < cible && i > tenu && i <= cible) return -H;
    if (tenu > cible && i >= cible && i < tenu) return H;
    return 0;
  };

  return (
    <PageNutrition titre={t("nutrition.repasHoraires")}>
      <View>
        {repas.map((r, i) => (
          <Animated.View
            key={r.id}
            style={[
              styles.ligne,
              { borderBottomColor: couleurs.line, zIndex: tenu === i ? 2 : 0 },
              tenu === i ? { backgroundColor: couleurs.s2, borderRadius: 12, transform: [{ translateY: ty }] } : { transform: [{ translateY: decalage(i) }] },
            ]}
          >
            <View {...poignee(i).panHandlers} accessibilityLabel={t("nutrition.deplacerRepas", { repas: nomRepas(r) })} style={styles.poignee}>
              <Icone nom="grip" couleur={couleurs.t3} taille={20} />
            </View>
            <Texte variante="corps" numberOfLines={1} style={{ flex: 1, fontSize: 16, color: r.actif ? couleurs.t1 : couleurs.t3 }}>
              {nomRepas(r)}
            </Texte>
            <Texte variante="saisie" couleur={r.actif ? "t2" : "t3"} onPress={() => setHeure(r)} style={styles.heure} accessibilityRole="button">
              {heureTexte(r.heure_min)}
            </Texte>
            <Interrupteur valeur={r.actif} onChange={(v) => ecrire(modifierRepas(db, r.id, { actif: v }))} libelle={nomRepas(r)} />
          </Animated.View>
        ))}
      </View>
      <CadreVide libelle={t("nutrition.ajouterRepas")} onPress={() => (setNom(""), setNouveau(true))} style={{ marginTop: espace.l }} />

      <Entete style={{ marginTop: espace.xxl }}>{t("nutrition.rappels")}</Entete>
      <LigneFilet icone="cloche" libelle={t("nutrition.rappelRepas")} chevron={false} droite={<Interrupteur valeur={rappel} onChange={(v) => ecrire(ecrireReglage(db, "nutri_rappel", v ? "1" : "0"))} libelle={t("nutrition.rappelRepas")} />} />
      {rappel ? (
        <>
          <LigneFilet libelle={t("nutrition.quand")} valeur={t("nutrition.minApres", { n: delai })} onPress={() => setRoueDelai(true)} />
          <LigneFilet
            libelle={t("nutrition.siVide")}
            chevron={false}
            droite={<Interrupteur valeur={siVide} onChange={(v) => ecrire(ecrireReglage(db, "nutri_rappel_vide", v ? "1" : "0"))} libelle={t("nutrition.siVide")} />}
          />
        </>
      ) : null}

      <FeuilleHeure
        repas={heure}
        onFermer={() => setHeure(null)}
        onValider={(nomRepasModifie, min) => {
          const r = heure;
          setHeure(null);
          if (r) ecrire(modifierRepas(db, r.id, { heureMin: min, ...(nomRepasModifie !== nomRepas(r) ? { nom: nomRepasModifie.trim() || null } : {}) }));
        }}
        onSupprimer={() => {
          const r = heure;
          setHeure(null);
          if (r) ecrire(supprimerRepas(db, r.id));
        }}
      />
      <FeuilleRoue
        visible={roueDelai}
        titre={t("nutrition.quand")}
        valeur={delai}
        valeurs={DELAIS}
        texte={(v) => t("nutrition.minApres", { n: v })}
        onFermer={() => setRoueDelai(false)}
        onValider={(v) => {
          setRoueDelai(false);
          ecrire(ecrireReglage(db, "nutri_rappel_delai", String(v)));
        }}
      />
      <Feuille
        visible={nouveau}
        onFermer={() => setNouveau(false)}
        titre={t("nutrition.ajouterRepas")}
        pied={
          <BoutonPrincipal
            libelle={t("nutrition.ajouter")}
            desactive={!nom.trim()}
            onPress={() => {
              setNouveau(false);
              ecrire(ajouterRepas(db, nom, 720));
            }}
          />
        }
      >
        <ChampTexte dansFeuille value={nom} onChangeText={setNom} autoFocus placeholder={t("nutrition.nom")} accessibilityLabel={t("nutrition.nom")} returnKeyType="done" />
      </Feuille>
    </PageNutrition>
  );
}

/** Heure d'un repas (planche 27) : son nom modifiable, deux roues (heures, minutes par 5), Valider ; Supprimer le repas en rouge. */
function FeuilleHeure({ repas, onFermer, onValider, onSupprimer }: { repas: Repas | null; onFermer: () => void; onValider: (nom: string, min: number) => void; onSupprimer: () => void }) {
  const [nom, setNom] = useState("");
  const [h, setH] = useState(12);
  const [m, setM] = useState(0);
  useEffect(() => {
    if (!repas) return;
    setNom(nomRepas(repas));
    setH(Math.floor(repas.heure_min / 60));
    setM(Math.round((repas.heure_min % 60) / 5) * 5 % 60);
  }, [repas]);
  const deux = (v: number) => String(v).padStart(2, "0");
  return (
    <Feuille visible={repas != null} onFermer={onFermer} glisserContenu={false}>
      {repas ? (
        <>
          <ChampTexte dansFeuille value={nom} onChangeText={setNom} accessibilityLabel={t("nutrition.nom")} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: espace.s }}>
            <View style={{ flex: 1 }}>
              <RoueDuree key={`h${repas.id}`} libelle={t("nutrition.heure")} valeur={Math.floor(repas.heure_min / 60)} valeurs={HEURES} onChange={setH} traits={false} decoupe={(v) => ({ attenue: "", plein: deux(v) })} lue={(v) => deux(v)} />
            </View>
            <Texte variante="titre" couleur="t2">
              :
            </Texte>
            <View style={{ flex: 1 }}>
              <RoueDuree key={`m${repas.id}`} libelle={t("nutrition.minutes")} valeur={Math.round((repas.heure_min % 60) / 5) * 5 % 60} valeurs={MINUTES} onChange={setM} traits={false} decoupe={(v) => ({ attenue: "", plein: deux(v) })} lue={(v) => deux(v)} />
            </View>
          </View>
          <BoutonPrincipal libelle={t("ui.valider")} onPress={() => onValider(nom, h * 60 + m)} />
          <Groupe>
            <Option premier icone="trash" danger libelle={t("nutrition.supprimerRepas")} onPress={onSupprimer} />
          </Groupe>
        </>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  ligne: { height: H, flexDirection: "row", alignItems: "center", gap: espace.m, borderBottomWidth: StyleSheet.hairlineWidth },
  poignee: { width: 44, height: 44, marginLeft: -12, alignItems: "center", justifyContent: "center" },
  heure: { fontSize: 16, minWidth: 64, minHeight: 44, textAlign: "right", textAlignVertical: "center", paddingRight: 4 },
});
