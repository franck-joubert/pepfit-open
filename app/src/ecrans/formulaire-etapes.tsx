import { useMemo, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import { libelleMuscle, MACHINES, normaliser, type PhotoExercice } from "../db";
import { MUSCLES_DU_CATALOGUE } from "../db/zones";
import { locale, t, tp } from "../i18n/index";
import { uriPhoto, type Source } from "../photos";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, rayon, typo } from "../theme/typo";
import { Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Persos } from "../ui/Persos";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { toucherMuscle, type RoleMuscle } from "../ui/persos-calc";

export type { RoleMuscle };

// Étapes du formulaire d'exercice (planche exercices-perso, v3) : photo, machine, muscles. Elles s'ouvrent dans la même
// feuille que le formulaire, flèche de retour à gauche du titre.

/** Photo en tête du formulaire : carte « Ajouter une photo · Facultative », ou la photo et « Changer » (D2). */
export function CartePhoto({ photo, onPress }: { photo: PhotoExercice | null; onPress: () => void }) {
  const { couleurs } = useTheme();
  if (!photo)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("exercices.photo.ajouter")}, ${t("exercices.photo.facultative")}`}
        onPress={onPress}
        style={({ pressed }) => [styles.carteVide, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
      >
        <View style={[styles.rondPhoto, { backgroundColor: couleurs.s3 }]}>
          <Icone nom="camera" couleur={couleurs.t1} taille={20} />
        </View>
        <Texte variante="exercice">{t("exercices.photo.ajouter")}</Texte>
        <Texte variante="meta" couleur="t2">
          {t("exercices.photo.facultative")}
        </Texte>
      </Pressable>
    );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("exercices.photo.changer")} onPress={onPress} style={styles.photo}>
      <Image source={{ uri: uriPhoto(photo.photo) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.changer}>
        <Icone nom="camera" couleur="#ffffff" taille={16} />
        <Texte variante="libelle" style={{ color: "#ffffff", fontFamily: "Inter-SemiBold" }}>
          {t("exercices.photo.changer")}
        </Texte>
      </View>
    </Pressable>
  );
}

/** Étape « Photo de l'exercice » : prendre ou importer ; appareil refusé, la galerie reste (D13). */
export function EtapePhoto({ refus, onPrendre }: { refus: boolean; onPrendre: (s: Source) => void }) {
  const { couleurs, mode } = useTheme();
  return (
    <>
      {refus ? (
        <View style={[styles.refus, { backgroundColor: mode === "jour" ? "rgba(255,122,112,0.14)" : "rgba(255,122,112,0.12)" }]}>
          <View style={styles.refusTete}>
            <Icone nom="alerte" couleur={couleurs.rate} taille={20} />
            <Texte variante="libelle" style={{ flex: 1, fontFamily: "Inter-SemiBold" }}>
              {t("exercices.photo.refusee")}
            </Texte>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => Linking.openSettings().catch(() => {})}
            style={({ pressed }) => [styles.autoriser, { borderColor: couleurs.line2, backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleFond }]}
          >
            <Texte variante="exercice">{t("exercices.photo.autoriser")}</Texte>
          </Pressable>
        </View>
      ) : null}
      <Groupe>
        <View style={refus ? { opacity: 0.5 } : null} pointerEvents={refus ? "none" : "auto"} accessibilityElementsHidden={refus}>
          <Option premier icone="camera" libelle={t("exercices.photo.prendre")} onPress={() => onPrendre("appareil")} />
        </View>
        <Option premier={refus} icone="image" libelle={t("exercices.photo.galerie")} onPress={() => onPrendre("galerie")} />
      </Groupe>
      <View style={styles.chiffree}>
        <Icone nom="cadenas" couleur={couleurs.t2} taille={16} />
        <Texte variante="corps" couleur="t2" style={{ flex: 1, lineHeight: 19 }}>
          {t("exercices.photo.chiffree")}{" "}
          <Texte variante="corps" style={{ fontFamily: "Inter-SemiBold" }}>
            {t("exercices.photo.coachVoit")}
          </Texte>{" "}
          {t("exercices.photo.siPartage")}
        </Texte>
      </View>
    </>
  );
}

/** Étape « Machine » (D4) : « Sans précision » d'abord, puis le catalogue. */
export function EtapeMachine({ machineId, onChoisir }: { machineId: string | null; onChoisir: (id: string | null) => void }) {
  const { couleurs } = useTheme();
  const [q, setQ] = useState("");
  const trouvees = useMemo(() => {
    const n = normaliser(q.trim());
    return n ? MACHINES.filter((m) => normaliser(m.nom).includes(n)) : MACHINES;
  }, [q]);
  return (
    <>
      <View style={[styles.recherche, { backgroundColor: couleurs.feuilleGroupe }]}>
        <Icone nom="search" couleur={couleurs.t3} taille={20} />
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={q}
          onChangeText={setQ}
          placeholder={t("exercices.machine.chercher")}
          placeholderTextColor={couleurs.t3}
          cursorColor={couleurs.action}
          selectionColor={couleurs.action}
          accessibilityLabel={t("exercices.machine.chercher")}
          style={[typo.saisie, { flex: 1, color: couleurs.t1, padding: 0, height: 48, fontFamily: "Inter-Regular" }]}
        />
      </View>
      {q.trim() ? null : (
        <Groupe>
          <LigneChoix premier fort libelle={t("exercices.machine.sansPrecision")} choisi={machineId == null} onPress={() => onChoisir(null)} />
        </Groupe>
      )}
      <View style={styles.entete}>
        <Texte variante="entete" couleur="t2">
          {t("exercices.machine.catalogue")}
        </Texte>
        <Texte variante="meta" couleur="t3">
          {`, ${tp("exercices.machine.nombre", trouvees.length)}`}
        </Texte>
      </View>
      {trouvees.length ? (
        <Groupe>
          {trouvees.map((m, i) => (
            <LigneChoix key={m.id} premier={i === 0} libelle={m.nom} choisi={m.id === machineId} onPress={() => onChoisir(m.id)} />
          ))}
        </Groupe>
      ) : (
        <Texte variante="corps" couleur="t2" style={{ paddingHorizontal: espace.s }}>
          {t("exercices.machine.aucune", { q: q.trim() })}
        </Texte>
      )}
    </>
  );
}

/** Ligne de choix à coche orange (planche : « Sans précision » en gras, coche de la couleur d'action). */
function LigneChoix({ libelle, choisi, onPress, premier, fort }: { libelle: string; choisi: boolean; onPress: () => void; premier?: boolean; fort?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: choisi }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choix,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      <Texte variante="saisie" style={{ flex: 1, fontSize: 15, fontFamily: fort ? "Inter-SemiBold" : "Inter-Regular" }}>
        {libelle}
      </Texte>
      {choisi ? <Icone nom="check" couleur={couleurs.action} /> : null}
    </Pressable>
  );
}

/** Les 17 muscles du catalogue, dans l'ordre alphabétique de la langue active (D5). */
export function musclesTries(): string[] {
  return Object.keys(MUSCLES_DU_CATALOGUE).sort((a, b) => libelleMuscle(a).localeCompare(libelleMuscle(b), locale()));
}

/** Étape « Muscles » (D5) : les persos en tête, « Principal | Secondaires », un seul jeu de puces. Valider est au pied. */
export function EtapeMuscles({
  principal,
  secondaires,
  role,
  onRole,
  onChange,
}: {
  principal: string | null;
  secondaires: readonly string[];
  role: RoleMuscle;
  onRole: (r: RoleMuscle) => void;
  onChange: (p: string | null, s: string[]) => void;
}) {
  const { couleurs } = useTheme();
  const liste = useMemo(musclesTries, []);
  const point = (c: string) => <View style={[styles.point, { backgroundColor: c }]} />;
  return (
    <>
      <Persos principal={principal} secondaires={secondaires} hauteur={176} style={{ alignSelf: "center", marginVertical: espace.s }} />
      <Segmente
        options={[
          { valeur: "principal", libelle: t("exercices.muscles.principal"), avant: point(couleurs.muscle) },
          { valeur: "secondaires", libelle: t("exercices.muscles.secondaires"), avant: point(couleurs.muscle2) },
        ]}
        valeur={role}
        onChange={onRole}
      />
      <View style={styles.puces}>
        {liste.map((m) => {
          const p = m === principal;
          const s = !p && secondaires.includes(m);
          const etat = p ? t("exercices.muscles.principal") : s ? t("exercices.muscles.secondaires") : null;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: p || s }}
              accessibilityLabel={etat ? t("exercices.muscles.puce", { muscle: libelleMuscle(m), role: etat }) : libelleMuscle(m)}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => {
                const r = toucherMuscle(m, role, principal, secondaires);
                onChange(r.principal, r.secondaires);
              }}
              style={({ pressed }) => [
                styles.puce,
                p
                  ? { backgroundColor: couleurs.t1 }
                  : s
                    ? { borderColor: couleurs.t3, borderWidth: 1.5, backgroundColor: pressed ? couleurs.s3 : "transparent" }
                    : { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe },
              ]}
            >
              {p ? point(couleurs.muscle) : s ? point(couleurs.muscle2) : null}
              <Texte variante="saisie" style={{ fontSize: 15, color: p ? couleurs.bg : couleurs.t1, fontFamily: p || s ? "Inter-SemiBold" : "Inter-Regular" }}>
                {libelleMuscle(m)}
              </Texte>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  carteVide: { borderRadius: rayon.l, alignItems: "center", paddingVertical: espace.xl, gap: espace.xs },
  rondPhoto: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: espace.s },
  photo: { height: 168, borderRadius: rayon.l, overflow: "hidden" },
  changer: {
    position: "absolute",
    right: 0,
    bottom: espace.s,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: espace.s,
    paddingHorizontal: espace.l,
    borderTopLeftRadius: rayon.l,
    borderBottomLeftRadius: rayon.l,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  refus: { borderRadius: rayon.l, padding: espace.l, gap: espace.m },
  refusTete: { flexDirection: "row", alignItems: "center", gap: espace.m },
  autoriser: { alignSelf: "flex-start", marginLeft: 32, minHeight: 48, paddingHorizontal: espace.xl, borderRadius: rayon.l, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chiffree: { flexDirection: "row", gap: espace.m, paddingHorizontal: espace.s, alignItems: "flex-start" },
  recherche: { borderRadius: rayon.l, paddingHorizontal: espace.l, flexDirection: "row", alignItems: "center", gap: espace.m },
  entete: { flexDirection: "row", alignItems: "baseline", paddingHorizontal: espace.s, marginTop: espace.xs },
  choix: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  point: { width: 8, height: 8, borderRadius: 4 },
  puces: { flexDirection: "row", flexWrap: "wrap", gap: espace.s },
  puce: { height: 40, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: 14 },
});
