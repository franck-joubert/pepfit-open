import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { parties } from "../i18n/temps";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { BoutonTonal } from "../ui/BoutonTonal";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille, Groupe } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { RoueDuree } from "../ui/RoueDuree";
import { Texte } from "../ui/Texte";
import { DUREE_MAX_MIN } from "./edition-seance";
import { dureeCourte, heure } from "./format";
import {
  dureeMin, ecartJourRoue, instantAvecJour, instantRoues, JOURS_HORAIRES, lier, libelleJourHoraires, phraseEffet, phraseLien, phraseRefus, refuser,
  type Champ, type Effet, type Horaires,
} from "./horaires";
import type { LectureHoraires } from "./horaires-donnees";

// Feuille « Horaires » commune à toute activité (planche Effort v2.2) : trois lignes de 56 (début, fin, durée), une seule ouverte à la
// fois avec ses roues dessous, une phrase qui dit ce que le changement fait aux deux autres lignes, « Valider » de 52. Pure vue :
// la base est lue et écrite par l'appelant (FeuilleHorairesActivite).

const HEURES = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const HEURES_DUREE = Array.from({ length: Math.floor(DUREE_MAX_MIN / 60) + 1 }, (_, i) => i);
const deuxChiffres = (n: number) => String(n).padStart(2, "0");
export const PLEIN = (n: number) => ({ attenue: "", plein: deuxChiffres(n) });

export interface PropsFeuilleHoraires {
  visible: boolean;
  onFermer: () => void;
  /** Sous-titre de la feuille : le nom de l'activité. */
  titre: string;
  /** Horaires, original, source et bornes ; null le temps de la lecture. */
  lecture: LectureHoraires | null;
  /** Ce que le changement fait au point du jour et à la série, quand le jour change (lu dans la base par l'appelant). */
  effet?: (apres: Horaires) => Promise<Effet | null>;
  onValider: (h: Horaires) => void | Promise<void>;
  /** « Rétablir » : remet les horaires de l'import (présent seulement si l'activité a un original). */
  onRetablir?: () => void | Promise<void>;
  /** La ligne ouverte à l'ouverture : celle qu'on a touchée sur la page Modifier ; sinon Début (aucune quand l'import a déjà été modifié). */
  champ?: Champ;
}

export function FeuilleHoraires({ visible, onFermer, titre, lecture, effet, onValider, onRetablir, champ }: PropsFeuilleHoraires) {
  const { couleurs } = useTheme();
  const [brouillon, setBrouillon] = useState<Horaires>(lecture?.horaires ?? { debut: 0, fin: 0 });
  const [ouvert, setOuvert] = useState<Champ | null>("debut");
  const [maintenant, setMaintenant] = useState(Date.now());
  const [ouverture, setOuverture] = useState(0);
  const [dernier, setDernier] = useState<{ champ: Champ; avant: Horaires } | null>(null);
  const [effetLu, setEffetLu] = useState<Effet | null>(null);
  const depart = lecture?.horaires;

  // À chaque ouverture : les horaires du moment, Début ouvert (aucune ligne ouverte quand l'import a déjà été modifié : la feuille montre l'original)
  useEffect(() => {
    if (!visible || !lecture) return;
    setBrouillon(lecture.horaires);
    setOuvert(champ ?? (lecture.original ? null : "debut"));
    setDernier(null);
    setEffetLu(null);
    setMaintenant(Date.now());
    setOuverture((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, lecture]);

  const refus = useMemo(
    () => (lecture ? refuser(brouillon, { maintenant, premiereSerie: lecture.premiereSerie, derniereSerie: lecture.derniereSerie }) : null),
    [brouillon, lecture, maintenant],
  );

  // Le jour change : l'appelant dit ce que ça fait au point et à la série (sauf refus)
  const lecteur = useRef(effet);
  lecteur.current = effet;
  useEffect(() => {
    if (!visible || !depart || !lecteur.current || refus) {
      setEffetLu(null);
      return;
    }
    if (brouillon.debut === depart.debut && brouillon.fin === depart.fin) {
      setEffetLu(null);
      return;
    }
    let vivant = true;
    lecteur.current(brouillon).then(
      (e) => vivant && setEffetLu(e),
      () => vivant && setEffetLu(null),
    );
    return () => {
      vivant = false;
    };
  }, [visible, brouillon, depart, refus]);

  if (!lecture) {
    return <Feuille visible={visible} onFermer={onFermer} titre={t("horaires.titre")} sousTitre={titre}>{null}</Feuille>;
  }

  const changer = (champ: Champ, valeur: number) =>
    setBrouillon((b) => {
      setDernier({ champ, avant: b });
      return lier(b, champ, valeur);
    });

  const phrase = (() => {
    if (refus) return { texte: phraseRefus(refus), erreur: true };
    const e = effetLu ? phraseEffet(effetLu, maintenant) : null;
    if (e) return { texte: e, erreur: false };
    if (dernier) return { texte: phraseLien(dernier.avant, brouillon, dernier.champ), erreur: false };
    return null;
  })();

  const importee = lecture.source != null;
  const source = lecture.source === "telephone" ? null : lecture.source ? t(`horaires.source.${lecture.source}`) : null;
  const montreImport = ouvert == null && importee;

  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("horaires.titre")}
      sousTitre={titre}
      glisserContenu={false}
      pied={<BoutonPrincipal libelle={t("horaires.valider")} desactive={refus != null} onPress={() => void onValider(brouillon)} />}
    >
      <Groupe>
        <LigneHoraire
          libelle={t("horaires.debut")}
          valeur={instantAvecJour(brouillon.debut, maintenant)}
          ouvert={ouvert === "debut"}
          erreur={refus?.champ === "debut"}
          premier
          onPress={() => setOuvert(ouvert === "debut" ? null : "debut")}
        />
        <LigneHoraire
          libelle={t("horaires.fin")}
          valeur={memeJour(brouillon, maintenant) ? heure(brouillon.fin) : instantAvecJour(brouillon.fin, maintenant)}
          ouvert={ouvert === "fin"}
          erreur={refus?.champ === "fin"}
          onPress={() => setOuvert(ouvert === "fin" ? null : "fin")}
        />
        <LigneHoraire
          libelle={t("horaires.duree")}
          valeur={dureeCourte(dureeMin(brouillon) * 60)}
          ouvert={ouvert === "duree"}
          erreur={refus?.champ === "duree"}
          onPress={() => setOuvert(ouvert === "duree" ? null : "duree")}
        />
      </Groupe>
      {ouvert === "debut" || ouvert === "fin" ? (
        <RouesInstant
          key={`${ouvert}-${ouverture}`}
          instant={ouvert === "debut" ? brouillon.debut : brouillon.fin}
          maintenant={maintenant}
          // la fin ne remonte pas avant le jour du début
          premierEcart={ouvert === "fin" ? ecartJourRoue(brouillon.debut, maintenant) : -(JOURS_HORAIRES - 1)}
          onChange={(ms) => changer(ouvert, ms)}
        />
      ) : null}
      {ouvert === "duree" ? <RouesDuree key={`duree-${ouverture}`} minutes={dureeMin(brouillon)} onChange={(m) => changer("duree", m)} /> : null}
      {ouvert != null && phrase ? (
        <Texte variante="libelle" couleur={phrase.erreur ? undefined : "t2"} style={[styles.phrase, phrase.erreur && { color: couleurs.rate }]}>
          {phrase.texte}
        </Texte>
      ) : null}
      {montreImport ? (
        <View style={styles.import}>
          <View style={styles.importTexte}>
            <Icone nom="montre" couleur={couleurs.t2} taille={18} />
            <Texte variante="libelle" couleur="t2" style={{ flex: 1 }}>
              {source ? t("horaires.importee", { source }) : t("horaires.telephone")}
            </Texte>
          </View>
          {lecture.original && onRetablir ? (
            <View style={[styles.original, { borderColor: couleurs.line2 }]}>
              <View style={{ flex: 1 }}>
                <Texte variante="meta" couleur="t2">
                  {t("horaires.original")}
                </Texte>
                <Texte variante="saisie">{`${heure(lecture.original.debut)} → ${heure(lecture.original.fin)}`}</Texte>
              </View>
              <BoutonTonal libelle={t("horaires.retablir")} icone="history" hauteur={44} onPress={() => void onRetablir()} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Feuille>
  );
}

const memeJour = (h: Horaires, maintenant: number) => ecartJourRoue(h.debut, maintenant) === ecartJourRoue(h.fin, maintenant);

export function LigneHoraire({
  libelle,
  valeur,
  ouvert,
  erreur,
  premier,
  onPress,
}: {
  libelle: string;
  valeur: string;
  ouvert: boolean;
  erreur: boolean;
  premier?: boolean;
  onPress: () => void;
}) {
  const { couleurs } = useTheme();
  const teinte = erreur ? couleurs.rate : ouvert ? couleurs.action : couleurs.t2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle}, ${valeur}`}
      accessibilityState={{ expanded: ouvert }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ligne,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        (ouvert || pressed) && { backgroundColor: couleurs.s3 },
      ]}
    >
      <Texte variante="saisie" style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>
        {libelle}
      </Texte>
      <Texte variante="saisie" style={{ fontSize: 15, color: teinte, flexShrink: 1 }} numberOfLines={1}>
        {valeur}
      </Texte>
      <Icone nom={ouvert ? "down" : "right"} couleur={teinte} taille={18} />
    </Pressable>
  );
}

/** Jour, heure et minute d'un instant : trois roues, le jour remplace les trois raccourcis d'avant (aujourd'hui, hier, avant-hier). */
function RouesInstant({ instant, maintenant, premierEcart, onChange }: { instant: number; maintenant: number; premierEcart: number; onChange: (ms: number) => void }) {
  const p = parties(instant);
  const ecart = ecartJourRoue(instant, maintenant);
  const jours = useMemo(() => Array.from({ length: -premierEcart + 1 }, (_, i) => premierEcart + i), [premierEcart]);
  const courant = useRef({ ecart, h: p.h, m: p.min });
  courant.current = { ecart, h: p.h, m: p.min };
  const envoyer = (n: Partial<typeof courant.current>) => {
    const c = { ...courant.current, ...n };
    courant.current = c;
    onChange(instantRoues(c.ecart, c.h, c.m, maintenant));
  };
  return (
    <View style={styles.roues}>
      <Colonne libelle={t("horaires.jour")} flex={1.7}>
        <RoueDuree
          libelle={t("horaires.jour")}
          valeur={ecart}
          valeurs={jours}
          onChange={(v) => envoyer({ ecart: v })}
          decoupe={(v) => ({ attenue: "", plein: libelleJourHoraires(v, maintenant) })}
          lue={(v) => libelleJourHoraires(v, maintenant)}
          traits={false}
        />
      </Colonne>
      <Colonne libelle={t("horaires.heure")} flex={1}>
        <RoueDuree libelle={t("horaires.heure")} valeur={p.h} valeurs={HEURES} onChange={(v) => envoyer({ h: v })} decoupe={PLEIN} lue={String} traits={false} />
      </Colonne>
      <Texte variante="saisie" couleur="t3" style={styles.deuxPoints}>
        :
      </Texte>
      <Colonne libelle={t("horaires.minutes")} flex={1}>
        <RoueDuree libelle={t("horaires.minutes")} valeur={p.min} valeurs={MINUTES} onChange={(v) => envoyer({ m: v })} decoupe={PLEIN} lue={String} traits={false} />
      </Colonne>
    </View>
  );
}

function RouesDuree({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  const total = Math.min(DUREE_MAX_MIN, Math.max(0, minutes));
  const courant = useRef({ h: Math.floor(total / 60), m: total % 60 });
  courant.current = { h: Math.floor(total / 60), m: total % 60 };
  const envoyer = (n: Partial<typeof courant.current>) => {
    const c = { ...courant.current, ...n };
    courant.current = c;
    onChange(c.h * 60 + c.m);
  };
  return (
    <View style={styles.roues}>
      <Colonne libelle={t("horaires.heures")} flex={1}>
        <RoueDuree libelle={t("horaires.heures")} valeur={courant.current.h} valeurs={HEURES_DUREE} onChange={(v) => envoyer({ h: v })} decoupe={PLEIN} lue={String} traits={false} />
      </Colonne>
      <Texte variante="saisie" couleur="t3" style={styles.deuxPoints}>
        :
      </Texte>
      <Colonne libelle={t("horaires.minutes")} flex={1}>
        <RoueDuree libelle={t("horaires.minutes")} valeur={courant.current.m} valeurs={MINUTES} onChange={(v) => envoyer({ m: v })} decoupe={PLEIN} lue={String} traits={false} />
      </Colonne>
    </View>
  );
}

export function Colonne({ libelle, flex, children }: { libelle: string; flex: number; children: React.ReactNode }) {
  return (
    <View style={[styles.colonne, { flex }]}>
      <Texte variante="meta" couleur="t2" style={{ textAlign: "center" }}>
        {libelle}
      </Texte>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: espace.l },
  roues: { flexDirection: "row", alignItems: "flex-end", gap: espace.s, marginTop: espace.m },
  colonne: { gap: espace.xs },
  // Calé sur la ligne du centre : 2 lignes de 44 sous lui.
  deuxPoints: { marginBottom: 44 * 2 + 10 },
  phrase: { textAlign: "center", marginTop: espace.s },
  import: { gap: espace.m, marginTop: espace.l },
  importTexte: { flexDirection: "row", alignItems: "flex-start", gap: espace.s },
  original: { flexDirection: "row", alignItems: "center", gap: espace.m, borderWidth: 1, borderRadius: rayon.l, paddingVertical: espace.m, paddingLeft: espace.l, paddingRight: espace.m },
});
