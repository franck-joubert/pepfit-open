// Sous-étapes des réglages (planche ajout-seance-v2, quand, quand-sans-heure, duree-2h) : quand,
// durée et répétition. Un réglage à valeurs a son bouton « OK » ; un choix de liste valide au toucher et revient.
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { Groupe, Option } from "../../ui/Feuille";
import { RoueDuree } from "../../ui/RoueDuree";
import { Texte } from "../../ui/Texte";
import { instantDe, jourDe } from "../planif-donnees";
import { ajouterJ } from "../planification";
import { heureTexte, jourLong, jourMois, jourSemaineMois } from "../format";
import {
  dureeDepuisColonnes, dureeLibelle, heuresDuree, minutesDuree, quandAuJour, quandLibelle,
  sansHeurePermis, type Quand,
} from "../parcours-seance";
import { EnTete } from "./Etapes";
import type { Repetition } from "./creer-parcours";

const HAUTEUR_LIGNE = 44;
const pad = (n: number) => String(n).padStart(2, "0");
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Jour en toutes lettres pour le titre de la feuille du sport : « Jeudi 5 nov. », « Aujourd'hui » pour aujourd'hui (planche). */
export const jourTitre = (jour: string, aujourdhui: string = jourDe(Date.now())): string => {
  if (jour === aujourdhui) return t("communs.aujourdhui");
  const d = instantDe(jour, "12:00");
  return majuscule(`${jourLong(d)} ${jourMois(d)}`);
};

/** « Jeu. 5 nov. » (avec « Aujourd'hui » pour aujourd'hui, par `quandLibelle`). */
export const jourCourtTexte = (jour: string): string => majuscule(jourSemaineMois(instantDe(jour, "12:00")));

/** Bouton tonal de pied (« OK ») : plein sans être orange, comme la planche. */
function PiedOk({ onPress, libelle = t("ps.ok") }: { onPress: () => void; libelle?: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.pied}>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ok, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}>
        <Texte style={{ fontFamily: police.semibold, fontSize: 15, color: couleurs.t1 }}>{libelle}</Texte>
      </Pressable>
    </View>
  );
}

/** Grand texte de l'étape (valeur choisie, en clair au-dessus de la molette). */
function Valeur({ children }: { children: string }) {
  return (
    <Texte numberOfLines={1} style={styles.valeur}>
      {children}
    </Texte>
  );
}

// ——— Roues ———

/** Bande centrale continue sous les colonnes (la planche n'a qu'une seule bande, pas une par colonne). */
function Molette({ children }: { children: ReactNode }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.molette}>
      <View pointerEvents="none" style={[styles.bande, { backgroundColor: couleurs.s2 }]} />
      <View style={styles.colonnes}>{children}</View>
    </View>
  );
}

const sansFond = "transparent";

// ——— Quand ———

export function EtapeQuand({
  quand,
  aujourdhui,
  heureDefaut,
  onChange,
  onRetour,
}: {
  quand: Quand;
  aujourdhui: string;
  heureDefaut: string;
  onChange: (q: Quand) => void;
  onRetour: () => void;
}) {
  const [h0, m0] = (quand.heure ?? heureDefaut).split(":").map(Number) as [number, number];
  // Un jour d'avant aujourd'hui (séance prévue passée) reste proposé : la roue part du plus ancien des deux.
  const depart = quand.jour < aujourdhui ? quand.jour : aujourdhui;
  const jours = useMemo(() => {
    const n = quand.jour > aujourdhui ? 400 : 366;
    const premier = depart;
    const l: { jour: string; texte: string }[] = [];
    for (let i = 0; i < n; i++) {
      const j = ajouterJ(premier, i);
      l.push({ jour: j, texte: j === aujourdhui ? t("planif.aujourdhui") : jourCourtTexte(j) });
    }
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart, aujourdhui]);
  const rang = (j: string) => Math.max(0, jours.findIndex((x) => x.jour === j));
  const heures = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);
  const sansHeure = quand.heure == null;
  const peutSansHeure = sansHeurePermis(quand.jour, aujourdhui);
  const [h, setH] = useState(h0);
  const [m, setM] = useState(m0 - (m0 % 5));
  const hhmm = `${pad(h)}:${pad(m)}`;
  const jourTexte = (j: string) => (j === aujourdhui ? t("planif.aujourdhui") : jourCourtTexte(j));
  const pose = (q: Quand) => onChange(q);
  return (
    <View style={{ flex: 1 }}>
      <EnTete
        titre={t("ps.quand")}
        onRetour={onRetour}
        {...(peutSansHeure || sansHeure
          ? {
              action: t("ps.sansHeure"),
              onAction: () => {
                pose({ jour: quand.jour, heure: sansHeure ? hhmm : null });
              },
            }
          : {})}
      />
      <Valeur>{quandLibelle(quand, aujourdhui, jourTexte, heureTexte)}</Valeur>
      <Molette>
        <View style={{ flex: 1 }}>
          <RoueDuree
            valeur={rang(quand.jour)}
            onChange={(i) => pose(quandAuJour(quand, jours[i]!.jour, aujourdhui, hhmm))}
            libelle={t("ps.jour")}
            valeurs={jours.map((_, i) => i)}
            decoupe={(i) => ({ attenue: "", plein: jours[i]?.texte ?? "" })}
            lue={(i) => jours[i]?.texte ?? ""}
            traits={false}
            bande={sansFond}
          />
        </View>
        {/* « Sans heure » : les molettes d'heure et de minutes s'éteignent (160 ms, opacité) ; aucune n'est touchable. */}
        <View pointerEvents={sansHeure ? "none" : "auto"} style={[styles.heure, { opacity: sansHeure ? 0.25 : 1 }]}>
          <View style={styles.petite}>
            <RoueDuree
              valeur={h0}
              onChange={(v) => {
                setH(v);
                pose({ jour: quand.jour, heure: `${pad(v)}:${pad(m)}` });
              }}
              libelle={t("ps.heures")}
              valeurs={heures}
              decoupe={(x) => ({ attenue: "", plein: pad(x) })}
              lue={pad}
              traits={false}
              bande={sansFond}
            />
          </View>
          <Texte style={styles.deuxPoints}>:</Texte>
          <View style={styles.petite}>
            <RoueDuree
              valeur={m0 - (m0 % 5)}
              onChange={(v) => {
                setM(v);
                pose({ jour: quand.jour, heure: `${pad(h)}:${pad(v)}` });
              }}
              libelle={t("ps.minutes")}
              valeurs={minutes}
              decoupe={(x) => ({ attenue: "", plein: pad(x) })}
              lue={pad}
              traits={false}
              bande={sansFond}
            />
          </View>
        </View>
      </Molette>
      <PiedOk onPress={onRetour} />
    </View>
  );
}

// ——— Durée ———

export function EtapeDuree({ dureeMin, onChange, onRetour }: { dureeMin: number | null; onChange: (min: number | null) => void; onRetour: () => void }) {
  const total = dureeMin ?? 0;
  const [h, setH] = useState(Math.floor(total / 60));
  const [m, setM] = useState(Math.round((total % 60) / 5) * 5 === 60 ? 55 : Math.round((total % 60) / 5) * 5);
  const [cle, setCle] = useState(0);
  const heures = useMemo(() => heuresDuree(), []);
  const minutes = useMemo(() => minutesDuree(h).filter((x) => x % 5 === 0), [h]);
  const pose = (hh: number, mm: number) => {
    const d = dureeDepuisColonnes(hh, mm);
    onChange(d === 0 ? null : d);
  };
  const affiche = dureeMin ? dureeLibelle(dureeMin) : t("ps.nonDefinie");
  return (
    <View style={{ flex: 1 }}>
      <EnTete
        titre={t("ps.duree")}
        onRetour={onRetour}
        action={t("ps.nonDefinie")}
        onAction={() => {
          setH(0);
          setM(0);
          setCle((c) => c + 1);
          onChange(null);
        }}
      />
      <Valeur>{affiche}</Valeur>
      {/* Deux colonnes rapprochées du centre : 116 de large chacune, 6 d'écart (retour 5). */}
      <Molette>
        <View style={styles.paire}>
          <View style={styles.large}>
            <RoueDuree
              key={`h${cle}`}
              valeur={h}
              onChange={(v) => {
                setH(v);
                const mm = v >= 48 ? 0 : m;
                if (mm !== m) setM(mm);
                pose(v, mm);
              }}
              libelle={t("ps.heures")}
              valeurs={heures}
              decoupe={(x) => ({ attenue: "", plein: String(x) })}
              lue={(x) => `${x} h`}
              traits={false}
              bande={sansFond}
              unite="h"
            />
          </View>
          <View style={styles.large}>
            <RoueDuree
              key={`m${cle}${h >= 48 ? "x" : ""}`}
              valeur={m}
              onChange={(v) => {
                setM(v);
                pose(h, v);
              }}
              libelle={t("ps.minutes")}
              valeurs={minutes}
              decoupe={(x) => ({ attenue: "", plein: pad(x) })}
              lue={(x) => `${pad(x)} min`}
              traits={false}
              bande={sansFond}
              unite="min"
            />
          </View>
        </View>
      </Molette>
      <PiedOk onPress={onRetour} />
    </View>
  );
}

// ——— Répéter ———

export function EtapeRepeter({ valeur, onChoisir, onRetour }: { valeur: Repetition | null; onChoisir: (r: Repetition | null) => void; onRetour: () => void }) {
  const choix: { v: Repetition | null; libelle: string }[] = [
    { v: null, libelle: t("ps.jamais") },
    { v: "jour", libelle: t("ps.chaqueJour") },
    { v: "semaine", libelle: t("ps.chaqueSemaine") },
    { v: "deuxSemaines", libelle: t("ps.touteDeuxSemaines") },
  ];
  return (
    <View style={{ flex: 1 }}>
      <EnTete titre={t("ps.repeter")} onRetour={onRetour} />
      <Groupe>
        {choix.map((c, i) => (
          <Option key={c.libelle} premier={i === 0} libelle={c.libelle} choisi={valeur === c.v} onPress={() => onChoisir(c.v)} />
        ))}
      </Groupe>
    </View>
  );
}

const styles = StyleSheet.create({
  valeur: { textAlign: "center", fontFamily: police.regular, fontSize: 24, marginTop: espace.s, marginBottom: espace.s },
  molette: { height: HAUTEUR_LIGNE * 5, justifyContent: "center" },
  bande: { position: "absolute", left: 0, right: 0, top: HAUTEUR_LIGNE * 2, height: HAUTEUR_LIGNE, borderRadius: rayon.l },
  colonnes: { flexDirection: "row", alignItems: "center", flex: 1 },
  heure: { flexDirection: "row", alignItems: "center", width: 192 },
  petite: { width: 88 },
  deuxPoints: { width: 16, textAlign: "center", fontSize: 20 },
  paire: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 },
  large: { width: 116 },
  pied: { position: "absolute", left: 0, right: 0, bottom: 0 },
  ok: { height: 52, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
