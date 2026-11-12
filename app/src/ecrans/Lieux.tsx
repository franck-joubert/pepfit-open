import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { aCapacite, libelleTypeLieu, typeLieu, TYPES_LIEU } from "../db/lieux";
import { creerLieu, listerActivites, normaliser, type ActiviteLieu, type SalleResume } from "../db";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille, Groupe } from "../ui/Feuille";
import { estIcone, Icone, type NomIcone } from "../ui/Icone";
import { Picto } from "../ui/Picto";
import { fichierPicto } from "../ui/pictos";
import { Texte } from "../ui/Texte";
import { useCouleurPartie } from "../ui/ContextePartie";
import { signalerErreur } from "../ui/FeuilleMessage";
import { useApp } from "./contexte";
import { sousLieu } from "../salles/sous-titre-lieu";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

// Lieux (planche Lieux, lot A) : picto du type, sous-titre d'une ligne, feuille « Nouveau lieu » (type, nom, activités habituelles
// facultatives et multiples) et feuille « Activités habituelles » (liste à cocher des activités du catalogue).

export function pictoLieu(type: string | null | undefined): NomIcone {
  const p = typeLieu(type).picto;
  return estIcone(p) ? p : "place";
}

/** Sous-titre d'un lieu à moi : sa règle unique (salles/sous-titre-lieu.ts), l'adresse courte, sinon ses activités habituelles. */
export function sousTitreLieu(s: Pick<SalleResume, "adresse" | "activites">): string | undefined {
  return sousLieu({ adresse: s.adresse, secours: s.activites.map((a) => a.nom).join(", ") }) ?? undefined;
}

/**
 * « Nouveau lieu » : le type (registre, extensible), le nom, puis les activités habituelles si le type en a. `nom` null : fermée.
 * `type` : type choisi à l'ouverture (salle sinon) ; `activites` : ouverte directement sur « Activités habituelles ».
 */
export function FeuilleNouveauLieu({ nom, type: typeInitial, activites: surActivites = false, position = null, onFermer, onCree }: {
  nom: string | null;
  type?: string;
  activites?: boolean;
  /** Position du téléphone, quand le lieu est créé sur place (fin de séance) : enregistrée avec lui. */
  position?: { lat: number; lon: number } | null;
  onFermer: () => void;
  onCree: (id: string) => void;
}) {
  const { db } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  // curseur de la partie de l'écran (bleu dans les réglages), jamais l'orange hors du Sport
  const accent = useCouleurPartie();
  const initial = TYPES_LIEU.find((x) => x.id === typeInitial)?.id ?? TYPES_LIEU[0]!.id;
  const [type, setType] = useState(initial);
  const [n, setN] = useState("");
  const [activites, setActivites] = useState<ActiviteLieu[]>([]);
  const [choix, setChoix] = useState(false);
  useEffect(() => {
    if (nom === null) return;
    setType(initial);
    setN(nom);
    setActivites([]);
    setChoix(surActivites && aCapacite(initial, "activites"));
  }, [nom, initial, surActivites]);
  const avecActivites = aCapacite(type, "activites");
  const creer = () =>
    creerLieu(db, { nom: n.trim(), type, activites: avecActivites ? activites.map((a) => a.id) : [], position })
      .then(onCree)
      .catch(signalerErreur());

  return (
    <>
      <Feuille
        visible={nom !== null && !choix}
        onFermer={onFermer}
        titre={t("lieux.nouveau")}
        pied={<BoutonPrincipal libelle={t("salles.creer")} desactive={!n.trim()} onPress={creer} />}
      >
        <Groupe>
          {TYPES_LIEU.map((x, i) => {
            const choisi = x.id === type;
            return (
              <Pressable
                key={x.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: choisi }}
                onPress={() => setType(x.id)}
                style={({ pressed }) => [
                  styles.type,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
                  pressed && { backgroundColor: couleurs.s3 },
                ]}
              >
                <Icone nom={pictoLieu(x.id)} couleur={choisi ? couleurs.t1 : couleurs.t2} />
                <Texte variante="saisie" style={{ flex: 1, fontSize: 15, fontFamily: choisi ? police.semibold : police.regular }}>
                  {libelleTypeLieu(x.id)}
                </Texte>
                {choisi ? <Icone nom="check" couleur={couleurs.t1} /> : null}
              </Pressable>
            );
          })}
        </Groupe>
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={n}
          onChangeText={setN}
          maxLength={60}
          placeholder={t("lieux.nomLieu")}
          placeholderTextColor={couleurs.t3}
          cursorColor={accent}
          selectionColor={accent}
          accessibilityLabel={t("salles.nomNouvelle")}
          style={[typo.saisie, styles.champ, { fontFamily: police.regular, color: couleurs.t1, backgroundColor: couleurs.feuilleGroupe }]}
        />
        {avecActivites ? (
          <Groupe>
            <Pressable
              accessibilityRole="button"
              onPress={() => setChoix(true)}
              style={({ pressed }) => [styles.activites, pressed && { backgroundColor: couleurs.s3 }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Texte variante="saisie" style={{ fontSize: 15, fontFamily: police.regular }}>
                  {t("lieux.activitesFacultatif")}
                </Texte>
                <Texte variante="meta" couleur={activites.length ? "t2" : "t3"} numberOfLines={1} style={{ marginTop: 3, fontSize: 13 }}>
                  {activites.length ? activites.map((a) => a.nom).join(", ") : t("lieux.aucuneActivite")}
                </Texte>
              </View>
              <Icone nom="right" couleur={couleurs.t3} />
            </Pressable>
          </Groupe>
        ) : null}
      </Feuille>
      <FeuilleActivites
        visible={nom !== null && choix}
        choisies={activites}
        onFermer={(l) => {
          setActivites(l);
          setChoix(false);
        }}
      />
    </>
  );
}

/** « Activités habituelles » : toutes les activités du catalogue, recherche en tête, plusieurs cochées ; l'ordre de coche est gardé. */
export function FeuilleActivites({ visible, choisies, onFermer }: { visible: boolean; choisies: ActiviteLieu[]; onFermer: (l: ActiviteLieu[]) => void }) {
  const { db } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  const [toutes, setToutes] = useState<ActiviteLieu[]>([]);
  const [l, setL] = useState<ActiviteLieu[]>(choisies);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!visible) return;
    setL(choisies);
    setQ("");
    listerActivites(db).then(setToutes).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, visible]);
  const qn = normaliser(q);
  // Les cochées d'abord (dans l'ordre de coche), puis celles qui ont leur picto (planche), puis les autres, par nom.
  const ids = new Set(l.map((a) => a.id));
  const autres = toutes.filter((a) => !ids.has(a.id));
  const avecPicto = (a: ActiviteLieu) => fichierPicto(a.slug, a.nom) != null;
  const liste = [...l, ...autres.filter(avecPicto), ...autres.filter((a) => !avecPicto(a))].filter((a) => !qn || normaliser(a.nom).includes(qn));
  const basculer = (a: ActiviteLieu) => setL((x) => (x.some((y) => y.id === a.id) ? x.filter((y) => y.id !== a.id) : [...x, a]));

  return (
    <Feuille
      visible={visible}
      onFermer={() => onFermer(l)}
      titre={t("lieux.activites")}
      pied={<Bouton libelle={t("lieux.termine")} variante="tonal" large onPress={() => onFermer(l)} />}
    >
      <View style={[styles.recherche, { backgroundColor: couleurs.feuilleGroupe }]}>
        <Icone nom="search" couleur={couleurs.t3} />
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={q}
          onChangeText={setQ}
          placeholder={t("lieux.rechercherActivite")}
          placeholderTextColor={couleurs.t3}
          cursorColor={accent}
          returnKeyType="search"
          accessibilityLabel={t("lieux.rechercherActivite")}
          style={[typo.saisie, { flex: 1, fontFamily: police.regular, color: couleurs.t1, padding: 0 }]}
        />
      </View>
      <View>
        {liste.map((a) => {
          const coche = ids.has(a.id);
          return (
            <Pressable
              key={a.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: coche }}
              onPress={() => basculer(a)}
              style={({ pressed }) => [styles.activite, pressed && { backgroundColor: couleurs.s3 }]}
            >
              <Picto slug={a.slug} nom={a.nom} taille={40} />
              <Texte variante="saisie" numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: coche ? police.semibold : police.regular }}>
                {a.nom}
              </Texte>
              {coche ? <Icone nom="check" couleur={couleurs.t1} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  type: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  champ: { minHeight: 52, borderRadius: rayon.l, paddingHorizontal: espace.l },
  activites: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: 10 },
  recherche: { height: 48, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.m, paddingLeft: 14, paddingRight: espace.s },
  activite: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: espace.xs, paddingVertical: espace.s, borderRadius: rayon.l },
});
