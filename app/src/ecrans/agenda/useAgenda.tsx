import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import { cleSeance, premierCreneauLibre, type Creneau, type EvenementAgenda, type LienAgenda } from "../../agenda/calcul";
import { etatsLiens, garderLesDeux, heureDe, lireConflits, seancesAgenda, synchroniser, type Conflit } from "../../agenda/synchro";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { avecOpacite } from "../../theme/teintes";
import { espace, rayon } from "../../theme/typo";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { FeuilleHeure } from "../FeuillesPlanif";
import { instantDe, jourDe, type LigneJour, type Planning } from "../planif-donnees";

// Agenda du téléphone dans l'onglet Sport (planche agenda-ics, § 4) : la synchro au retour dans l'appli, à l'ouverture de
// l'écran et après chaque écriture ; les bandeaux de ce qui a bougé là-bas (D12 « Annuler », D13 « Remettre ») ; sous chaque
// séance, la ligne ambre d'un conflit (D15) ou la mention « Déplacée » / « Retirée de ton agenda » ; la feuille du conflit.

type Prevue = LigneJour & { genre: "prevue" };
type Lanceur = (a: { texte: string; annuler: () => Promise<unknown>; action?: string }) => void;

/** Ce que l'agenda ajoute sous une séance (LigneSeance). */
export interface AgendaLigne {
  conflit?: { texte: string; onPress: () => void };
  mention?: string;
}

const VIDE = { conflits: new Map<string, Conflit>(), pris: [] as EvenementAgenda[], etats: new Map<string, LienAgenda["etat"]>() };
const cleDe = (l: Prevue) => cleSeance(l.occ.programmationId, l.occ.origine);

export function useAgenda({ p, recharger, lancer, decaler }: { p: Planning | undefined; recharger: () => Promise<void>; lancer: Lanceur; decaler: (l: Prevue, heure: string) => void }) {
  const { db } = useApp();
  const [vu, setVu] = useState(VIDE);
  const [version, setVersion] = useState(0);
  const [ouvert, setOuvert] = useState<Prevue | null>(null);
  const [autreHeure, setAutreHeure] = useState<Prevue | null>(null);
  const appel = useRef({ recharger, lancer });
  appel.current = { recharger, lancer };

  /** Une passe de synchro ; ce qui a bougé dans l'agenda revient ici, sans rien dire (seul le conflit avertit). */
  const synchro = useCallback(
    () =>
      synchroniser(db)
        .then(async (i) => {
          if (i.genre !== "ok") return;
          // Alex, 03/11 : l'agenda ne parle que d'un conflit. Un événement déplacé ou supprimé là-bas se synchronise en silence.
          if (i.changements.length) await appel.current.recharger();
          setVersion((v) => v + 1);
        })
        .catch(console.error),
    [db],
  );

  useFocusEffect(
    useCallback(() => {
      void synchro();
    }, [synchro]),
  );
  useEffect(() => {
    const a = AppState.addEventListener("change", (s) => s === "active" && void synchro());
    return () => a.remove();
  }, [synchro]);

  // Conflits et états, relus quand le planning change ou après une synchro.
  useEffect(() => {
    if (!p) return;
    let vivant = true;
    Promise.all([lireConflits(db, p), etatsLiens(db)])
      .then(([c, etats]) => vivant && setVu({ ...c, etats }))
      .catch(console.error);
    return () => {
      vivant = false;
    };
  }, [db, p, version]);

  const de = (l: LigneJour): AgendaLigne | undefined => {
    if (l.genre !== "prevue" || l.manquee) return undefined;
    const cle = cleDe(l);
    const etat = vu.etats.get(cle);
    const c = vu.conflits.get(cle);
    if (!c) return undefined;
    return {
      conflit: c
        ? { texte: t("agenda.conflit.ligne", { nom: c.evenement.titre, de: heureDe(c.evenement.debut), a: heureDe(c.evenement.fin) }), onPress: () => setOuvert(l) }
        : undefined,
    };
  };

  const conflit = ouvert ? vu.conflits.get(cleDe(ouvert)) : undefined;
  const seance = ouvert && p ? seancesAgenda(p).find((s) => s.cle === cleDe(ouvert)) : undefined;
  // Premier créneau libre (D15) : ni un rendez-vous, ni une autre séance du jour.
  const libre =
    ouvert && seance && p
      ? premierCreneauLibre({
          debut: seance.debut,
          dureeMs: seance.fin - seance.debut,
          minuit: instantDe(ouvert.occ.date),
          maintenant: Date.now(),
          pris: [...vu.pris, ...seancesAgenda(p).filter((s) => s.cle !== seance.cle && jourDe(s.debut) === ouvert.occ.date)],
        })
      : null;

  const fermer = () => setOuvert(null);
  const feuilles = (
    <>
      <FeuilleConflit
        l={conflit && seance ? ouvert : null}
        conflit={conflit}
        seance={seance}
        libre={libre}
        onFermer={fermer}
        onDecaler={(h) => {
          if (ouvert) decaler(ouvert, h);
          fermer();
        }}
        onAutreHeure={() => {
          setAutreHeure(ouvert);
          fermer();
        }}
        onGarder={() => {
          if (ouvert && conflit) void garderLesDeux(db, cleDe(ouvert), conflit.evenement.id).then(() => setVersion((v) => v + 1), console.error);
          fermer();
        }}
      />
      <FeuilleHeure
        visible={!!autreHeure}
        valeur={autreHeure?.occ.heure ?? "18:00"}
        titre={t("agenda.heureSeance")}
        onFermer={() => setAutreHeure(null)}
        onValider={(h) => {
          if (autreHeure) decaler(autreHeure, h);
          setAutreHeure(null);
        }}
      />
    </>
  );

  return { synchro, de, feuilles };
}

/** Feuille du conflit (4b) : le rendez-vous, la frise, « Décaler à » (premier créneau libre), une autre heure, garder les deux. */
function FeuilleConflit({
  l,
  conflit,
  seance,
  libre,
  onFermer,
  onDecaler,
  onAutreHeure,
  onGarder,
}: {
  l: Prevue | null;
  conflit: Conflit | undefined;
  seance: Creneau | undefined;
  libre: number | null;
  onFermer: () => void;
  onDecaler: (heure: string) => void;
  onAutreHeure: () => void;
  onGarder: () => void;
}) {
  const ev = conflit?.evenement;
  const vars = ev ? { nom: ev.titre, de: heureDe(ev.debut), a: heureDe(ev.fin), agenda: conflit.agenda } : null;
  return (
    <Feuille visible={!!l} onFermer={onFermer} titre={l ? t("agenda.conflit.titre", { heure: l.occ.heure }) : undefined} sousTitre={vars ? t(vars.agenda ? "agenda.conflit.sous" : "agenda.conflit.sousSansAgenda", vars) : undefined}>
      {l && ev && seance ? (
        <>
          <Frise nom={l.nom} seance={seance} pris={ev} />
          {libre != null ? (
            <View>
              <BoutonPrincipal libelle={t("agenda.conflit.decaler", { heure: heureDe(libre) })} onPress={() => onDecaler(heureDe(libre))} />
              <Texte variante="meta" couleur="t2" style={styles.note}>
                {t("agenda.conflit.note")}
              </Texte>
            </View>
          ) : (
            <Texte variante="corps" couleur="t2" style={styles.note}>
              {t("agenda.conflit.aucun")}
            </Texte>
          )}
          <Groupe>
            <Option premier libelle={t("agenda.conflit.autreHeure")} chevron onPress={onAutreHeure} />
            <Option libelle={t("agenda.conflit.garder")} aide={t("agenda.conflit.garderSous", { nom: l.nom, heure: l.occ.heure })} onPress={onGarder} />
          </Groupe>
        </>
      ) : null}
    </Feuille>
  );
}

/**
 * Frise du conflit (4b) : les heures pleines qui encadrent les deux ; le rendez-vous en haut (gris), la séance dessous (teinte
 * du Sport, bord orange) ; le chevauchement en ambre (jeton « echauffement », comme la ligne du conflit).
 */
function Frise({ nom, seance, pris }: { nom: string; seance: Creneau; pris: EvenementAgenda }) {
  const { couleurs } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const heure = 3_600_000;
  const de = Math.floor(Math.min(seance.debut, pris.debut) / heure) * heure;
  const a = Math.max(de + 2 * heure, Math.ceil(Math.max(seance.fin, pris.fin) / heure) * heure);
  const x = (ms: number) => ((Math.min(Math.max(ms, de), a) - de) / (a - de)) * largeur;
  const reperes = Array.from({ length: Math.round((a - de) / heure) + 1 }, (_, i) => de + i * heure);
  const chevauche = { debut: Math.max(seance.debut, pris.debut), fin: Math.min(seance.fin, pris.fin) };
  const label = t("agenda.conflit.frise", { seance: nom, de: heureDe(seance.debut), a: heureDe(seance.fin), nom: pris.titre, pde: heureDe(pris.debut), pa: heureDe(pris.fin) });
  const barre = (c: Creneau, top: number) => ({ left: x(c.debut), width: Math.max(x(c.fin) - x(c.debut), 24), top });
  return (
    <View accessible accessibilityLabel={label} style={styles.frise} onLayout={(e: LayoutChangeEvent) => setLargeur(e.nativeEvent.layout.width)}>
      {largeur ? (
        <>
          {chevauche.fin > chevauche.debut ? (
            <View style={[styles.chevauche, { left: x(chevauche.debut), width: x(chevauche.fin) - x(chevauche.debut), backgroundColor: avecOpacite(couleurs.echauffement, 0.18) }]} />
          ) : null}
          <View style={[styles.barre, barre(pris, 0), { backgroundColor: couleurs.s3, borderWidth: 1, borderColor: couleurs.line2 }]}>
            <Texte variante="meta" numberOfLines={1} style={styles.barreTexte}>
              {pris.titre}
            </Texte>
          </View>
          <View
            style={[
              styles.barre,
              barre(seance, 48),
              { backgroundColor: avecOpacite(couleurs.partieEntrainement, 0.16), borderWidth: 1.5, borderColor: couleurs.partieEntrainement },
            ]}
          >
            <Texte variante="meta" numberOfLines={1} style={styles.barreTexte}>
              {nom}
            </Texte>
          </View>
          {reperes.map((h, i) => (
            <Texte
              key={h}
              variante="meta"
              couleur="t3"
              style={[
                styles.repere,
                i === 0 ? { left: 0 } : i === reperes.length - 1 ? { right: 0 } : { left: x(h) - 20, width: 40, textAlign: "center" },
              ]}
            >
              {heureDe(h)}
            </Texte>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frise: { height: 112, marginTop: espace.xs, marginBottom: espace.s, marginHorizontal: espace.xs },
  chevauche: { position: "absolute", top: -8, height: 104, borderRadius: rayon.s },
  barre: { position: "absolute", height: 40, borderRadius: rayon.m, justifyContent: "center", paddingHorizontal: 10, overflow: "hidden" },
  barreTexte: { fontSize: 12.5, fontFamily: "Inter-Medium" },
  repere: { position: "absolute", bottom: 0, fontSize: 11.5, fontVariant: ["tabular-nums"] },
  note: { textAlign: "center", marginTop: 10, marginBottom: espace.xs },
});
