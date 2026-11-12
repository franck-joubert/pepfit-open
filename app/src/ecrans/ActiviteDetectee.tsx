// Activité détectée (planche activite-detectee, validée le 29/10) : la ligne posée dans les séances du jour (cadre en tirets,
// « Choisir le sport », ou la suggestion « Padel ? » et « Oui »), la feuille « Quel sport ? » (rappel durée, FC, zones,
// kcal ; suggestion et sa raison ; deux sports proches ; tuiles du lanceur ; « Autre sport » ; Ignorer) et les tuiles
// partagées avec « Changer d'activité ». Données : db/depots/activites.ts ; textes : activites-vue.ts.
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { sante } from "../natif/sante/index";
import { abonnerSynchro, synchroEnCours } from "../whoop/etat-synchro";
import { relecture } from "../sync/rafraichir";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { fichierPicto } from "../ui/pictos";
import { Texte } from "../ui/Texte";
import { catalogueSports, lireLanceur, type Sport } from "../db/depots/lanceur";
import {
  associerActivite, ignorerActivite, lireActiviteCatalogue, lireActivitesAProposer, lireProfilFc, lireProgrammes, pourquoiProgramme, rafraichirActivites,
  reconnaissanceDe, retablirActivite, type ActiviteLue, type ProfilFc,
} from "../db/depots/activites";
import type { Prevue } from "./activite-programmee";
import type { Activite } from "./changer-activite";
import { activitesChangees, annoncerAnnulable, surActivitesChangees } from "./activites-evenement";
import { ligneActivite, phraseAmbigu, phrasePourquoi } from "./activites-vue";
import { useApp } from "./contexte";
import { approx, dureeCourte, heure, jourSemaineMois, nombre } from "./format";
import { FeuilleCatalogue } from "./FeuilleSport";
import { pictoSport, sportsDeLaFeuille } from "./lanceur-sports";
import { instantDe } from "./planif-donnees";
import { nomSource } from "./sante-donnees";

const JOUR = 86_400_000;
/** Les sources d'un jour (Santé Connect, FC de la montre) ne sont relues qu'au plus toutes les 2 min. */
const RELECTURE_MS = 2 * 60_000;
const relu = new Map<number, number>();

/**
 * Une activité à associer, prête à l'écran : sa suggestion (la séance prévue qu'elle recoupe, sinon palier 1) ou ses deux sports
 * proches (palier 3). `programme` : la séance prévue que la suggestion remplace, quand la suggestion vient d'elle.
 */
export interface ActiviteVue extends ActiviteLue {
  suggestion: { act: Activite; pourquoi: string } | null;
  ambigu: { act: Activite; ligne: string }[] | null;
  programme?: Prevue | null;
}

/** La séance prévue de la suggestion, seulement si l'utilisateur garde son sport (un autre sport ne la remplace pas). */
const programmeDe = (a: ActiviteVue, sport: Activite): Prevue | null => (a.programme && a.suggestion?.act.id === sport.id ? a.programme : null);

async function nomLieu(db: ReturnType<typeof useApp>["db"], id: string | undefined): Promise<string | null> {
  if (!id) return null;
  return (await db.getFirstAsync<{ nom: string }>("SELECT nom FROM salle WHERE id = ?", [id]))?.nom ?? null;
}

/** Activités à associer d'un jour (« 2026-10-27 ») : la base tout de suite, puis les sources relues (au plus toutes les 2 min). */
export function useActivitesJour(jour: string, aujourdhui: string): ActiviteVue[] {
  const { db } = useApp();
  const [liste, setListe] = useState<ActiviteVue[]>([]);
  const minuit = instantDe(jour);
  const charger = useCallback(async () => {
    const lues = await lireActivitesAProposer(db, minuit, minuit + JOUR);
    const profil = lues.length ? await lireProfilFc(db) : null;
    // La séance prévue du jour que l'activité recoupe passe avant l'habitude : « Padel ? », « Prévu à 8:00 »
    const programmes = lues.length ? await lireProgrammes(db, lues).catch(() => null) : null;
    const vues: ActiviteVue[] = [];
    for (const a of lues) {
      const prog = programmes?.get(a.cle)?.prevue;
      const actProg = prog?.sport ? await lireActiviteCatalogue(db, prog.sport) : null;
      if (prog && actProg) {
        vues.push({ ...a, suggestion: { act: actProg, pourquoi: phrasePourquoi(pourquoiProgramme(prog), { lieu: prog.lieu?.nom ?? null }) }, ambigu: null, programme: prog });
        continue;
      }
      const r = await reconnaissanceDe(db, a, profil);
      let suggestion: ActiviteVue["suggestion"] = null;
      let ambigu: ActiviteVue["ambigu"] = null;
      if (r.palier === "suggestion" || r.palier === "auto") {
        const act = await lireActiviteCatalogue(db, r.sport);
        if (act) suggestion = { act, pourquoi: phrasePourquoi(r.pourquoi, { lieu: await nomLieu(db, r.pourquoi.lieuId), brut: null }) };
      } else if (r.palier === "ambigu") {
        const acts = await Promise.all(r.sports.map((s) => lireActiviteCatalogue(db, s)));
        const lieu = await nomLieu(db, r.pourquoi.lieuId);
        if (acts[0] && acts[1]) ambigu = acts.map((act, i) => ({ act: act!, ligne: phraseAmbigu(r.n[i]!, r.pourquoi, lieu) }));
      }
      vues.push({ ...a, suggestion, ambigu });
    }
    setListe(vues);
  }, [db, minuit]);
  useEffect(() => {
    if (jour > aujourdhui) {
      setListe([]);
      return;
    }
    let vivant = true;
    const relire = () => {
      if (vivant) charger().catch(console.error);
    };
    relire();
    // Les sources se relisent au plus toutes les 2 min, sauf quand une donnée vient d'arriver (fin d'une synchro Whoop, geste
    // « tirer pour actualiser ») : l'activité de la matinée n'attend pas qu'on revienne sur la page
    const relireSources = (forcer: boolean) => {
      const t0 = Date.now();
      if (!vivant || (!forcer && t0 - (relu.get(minuit) ?? 0) <= RELECTURE_MS)) return;
      relu.set(minuit, t0);
      rafraichirActivites(db, minuit, { seancesSport: (d, f) => sante.seancesSport(d, f), pasIntervalles: (p) => sante.pasIntervalles(p), fcEntre: (d, f) => sante.fcEntre(d, f), nuits: (d, f) => sante.nuits(d, f) })
        .then((r) => (r.posees ? activitesChangees() : relire()))
        .catch(console.error);
    };
    relireSources(false);
    const off = surActivitesChangees(relire);
    let enCours = synchroEnCours();
    const offSynchro = abonnerSynchro(() => {
      const fini = enCours && !synchroEnCours();
      enCours = synchroEnCours();
      if (fini) relireSources(true);
    });
    const offRelecture = relecture.abonner(() => relireSources(true));
    return () => {
      vivant = false;
      off();
      offSynchro();
      offRelecture();
    };
  }, [db, jour, aujourdhui, minuit, charger]);
  return liste;
}

/** Cadre en tirets : « pas encore une séance » (la case orange cochée est une séance faite). */
function CaseTirets() {
  const { couleurs } = useTheme();
  return (
    <Svg width={20} height={20}>
      <Rect x={0.75} y={0.75} width={18.5} height={18.5} rx={5.25} fill="none" stroke={couleurs.partieEntrainement} strokeWidth={1.5} strokeDasharray="3.4 2.6" />
    </Svg>
  );
}

/**
 * Ligne « Activité détectée » de la journée : heure, durée, FC moyenne et « Choisir le sport » ; avec une suggestion, « Padel ? »,
 * sa raison et « Oui » (un geste). Toucher la ligne ouvre « Quel sport ? ». Le glissé « Ignorer » est posé par la liste.
 */
export function LigneActivite({ a }: { a: ActiviteVue }) {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [feuille, setFeuille] = useState(false);
  const s = a.suggestion;
  const oui = async () => {
    if (!s) return;
    const fc = a.source === "pepfit" ? await sante.fcEntre(a.debut, a.fin).catch(() => null) : null;
    await associerActivite(db, a, s.act, { profil: await lireProfilFc(db), fc, programme: programmeDe(a, s.act) });
    activitesChangees();
  };
  return (
    <View style={[styles.ligne, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }, s && { alignItems: "flex-start" }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={s ? t("activite.question", { sport: s.act.nom }) : t("activite.detectee")}
        onPress={() => setFeuille(true)}
        style={[styles.ligneTouche, s && { alignItems: "flex-start" }]}
      >
        <View style={styles.case}>
          <CaseTirets />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variante="exercice" numberOfLines={1}>
            {s ? t("activite.question", { sport: s.act.nom }) : t("activite.detectee")}
          </Texte>
          <Texte variante="meta" couleur="t2" numberOfLines={1}>
            {ligneActivite(a)}
          </Texte>
          {s ? (
            <Texte variante="meta" couleur="t3" numberOfLines={1}>
              {s.pourquoi}
            </Texte>
          ) : null}
        </View>
      </Pressable>
      <Appui
        accessibilityRole="button"
        accessibilityLabel={s ? t("activite.ouiSport", { sport: s.act.nom }) : t("activite.choisirSport")}
        onPress={() => (s ? oui().catch(console.error) : setFeuille(true))}
        hitSlop={4}
        style={({ pressed }) => [styles.puce, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }, s && { marginTop: 4 }]}
      >
        {s ? <Icone nom="check" couleur={couleurs.partieEntrainement} taille={18} epaisseur={2.25} /> : null}
        <Texte style={[styles.puceTexte, { color: couleurs.t1 }]}>{s ? t("activite.oui") : t("activite.choisirSport")}</Texte>
      </Appui>
      <FeuilleQuelSport a={a} visible={feuille} onFermer={() => setFeuille(false)} />
    </View>
  );
}

/** Ignorer : l'activité quitte la journée, « Annuler » 8 s ; ses kcal restent dans les pas du quotidien (D3). */
export async function ignorer(db: ReturnType<typeof useApp>["db"], cle: string): Promise<void> {
  await ignorerActivite(db, cle);
  activitesChangees();
  annoncerAnnulable({ texte: t("activite.ignoree"), annuler: () => retablirActivite(db, cle).then(activitesChangees) });
}

/** Tuile d'un sport (picto 56, nom), comme la feuille « Démarrer une séance ». */
function Tuile({ s, choisie, actuelle, onPress }: { s: Sport; choisie: boolean; actuelle: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  const src = fichierPicto(pictoSport(s.slug), null, 512);
  return (
    <Appui
      accessibilityRole="radio"
      accessibilityState={{ checked: choisie }}
      accessibilityLabel={s.nom}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tuile,
        { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe },
        choisie && { borderWidth: 2, borderColor: couleurs.partieEntrainement },
      ]}
    >
      {choisie ? (
        <View style={[styles.badge, { backgroundColor: couleurs.partieEntrainement }]}>
          <Icone nom="check" couleur={couleurs.bg} taille={13} epaisseur={2.75} />
        </View>
      ) : null}
      {src != null ? (
        <Image source={src} style={[styles.picto, actuelle && { marginTop: -8 }]} resizeMode="contain" />
      ) : (
        <Icone nom="dumbbell" couleur={couleurs.t3} taille={28} />
      )}
      <Texte numberOfLines={1} style={[styles.nomTuile, { color: couleurs.t1 }]}>
        {s.nom}
      </Texte>
      {actuelle ? (
        <Texte variante="meta" couleur="t3" style={{ fontSize: 11, marginTop: -5 }}>
          {t("activite.actuelle")}
        </Texte>
      ) : null}
    </Appui>
  );
}

/** Les sports du lanceur (9 au plus, même ordre), en tuiles de trois, puis « Autre sport » (tout le catalogue). */
export function ChoixSports({
  choisi,
  actuel,
  onChoisir,
}: {
  choisi: Activite | null;
  actuel?: string | null;
  onChoisir: (a: Activite) => void;
}) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [sports, setSports] = useState<Sport[]>([]);
  const [catalogue, setCatalogue] = useState<Sport[]>([]);
  const [autre, setAutre] = useState(false);
  useEffect(() => {
    let vivant = true;
    Promise.all([lireLanceur(db), catalogueSports(db)])
      .then(([l, c]) => {
        if (!vivant) return;
        setSports(sportsDeLaFeuille(l.map((x) => x.id)).map((id) => l.find((x) => x.id === id)!));
        setCatalogue(c);
      })
      .catch(console.error);
    return () => {
      vivant = false;
    };
  }, [db]);
  const choisir = async (s: Sport) => {
    const act = await lireActiviteCatalogue(db, s.id);
    if (act) onChoisir(act);
  };
  const rangees: Sport[][] = [];
  for (let i = 0; i < sports.length; i += 3) rangees.push(sports.slice(i, i + 3));
  const horsTuiles = choisi && !sports.some((s) => s.id === choisi.id) ? choisi : null;
  return (
    <View style={{ gap: espace.s }}>
      {rangees.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: espace.s }}>
          {r.map((s) => (
            <Tuile key={s.id} s={s} choisie={choisi?.id === s.id} actuelle={actuel === s.id} onPress={() => choisir(s).catch(console.error)} />
          ))}
          {Array.from({ length: 3 - r.length }, (_, k) => (
            <View key={`v${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => setAutre(true)}
        style={({ pressed }) => [styles.lien, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
      >
        <Icone nom="search" couleur={couleurs.t2} taille={20} />
        <Texte numberOfLines={1} style={[styles.lienTexte, { color: couleurs.t1 }]}>
          {t("accueil.lanceur.autreSport")}
        </Texte>
        {horsTuiles ? (
          <>
            <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ flexShrink: 1 }}>
              {horsTuiles.nom}
            </Texte>
            <Icone nom="check" couleur={couleurs.partieEntrainement} taille={18} epaisseur={2.25} />
          </>
        ) : (
          <Icone nom="right" couleur={couleurs.t3} taille={16} />
        )}
      </Pressable>
      <FeuilleCatalogue
        visible={autre}
        titre={t("accueil.lanceur.autreSport")}
        sports={catalogue}
        deja={sports.map((s) => s.id)}
        ajout={false}
        onFermer={() => setAutre(false)}
        onChoisir={(s) => {
          setAutre(false);
          choisir(s).catch(console.error);
        }}
      />
    </View>
  );
}

/** Rappel de l'activité : durée, FC moyenne et max, kcal ; zones de Whoop quand on les a. */
export function RappelActivite({ faits, zones }: { faits: [string, string][]; zones: number[] | null }) {
  const { couleurs } = useTheme();
  const z = zones && zones.reduce((a, b) => a + b, 0) > 0 ? zones : null;
  const teintes = [couleurs.zone1, couleurs.zone2, couleurs.zone3, couleurs.zone4, couleurs.zone5];
  return (
    <View style={[styles.groupe, { backgroundColor: couleurs.feuilleGroupe }]}>
      <View style={styles.faits}>
        {faits.map(([l, v]) => (
          <View key={l} style={{ gap: 2 }}>
            <Texte variante="meta" couleur="t2">
              {l}
            </Texte>
            <Texte variante="saisie" style={{ fontSize: 15 }}>
              {v}
            </Texte>
          </View>
        ))}
      </View>
      {z ? (
        <View style={styles.zones} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {z.map((m, i) => (m > 0 ? <View key={i} style={{ flex: m, borderRadius: 3, backgroundColor: teintes[i] }} /> : null))}
        </View>
      ) : null}
    </View>
  );
}

function Radio({ on }: { on: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.radio, { borderColor: on ? couleurs.partieEntrainement : couleurs.anneauLibre, borderWidth: on ? 2 : 1.5 }]}>
      {on ? <View style={[styles.point, { backgroundColor: couleurs.partieEntrainement }]} /> : null}
    </View>
  );
}

/** Titre de section d'une feuille (« SUGGESTION », « TES SPORTS ») : le style des en-têtes de l'appli. */
export function EnTeteFeuille({ texte }: { texte: string }) {
  return (
    <Texte variante="entete" couleur="t2" style={styles.enTete}>
      {texte}
    </Texte>
  );
}

/**
 * « Quel sport ? » : le rappel de l'activité, la suggestion pré-cochée et sa raison (ou deux sports proches, rien de coché),
 * les tuiles du lanceur et « Autre sport ». « Enregistrer : Padel » en fait une séance ; « Ignorer cette activité ».
 */
export function FeuilleQuelSport({ a, visible, onFermer }: { a: ActiviteVue; visible: boolean; onFermer: () => void }) {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [choisi, setChoisi] = useState<Activite | null>(a.suggestion?.act ?? null);
  const [kcal, setKcal] = useState<number | null>(a.kcal);
  const [zones, setZones] = useState<number[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    setChoisi(a.suggestion?.act ?? null);
    let vivant = true;
    (async () => {
      // le chiffre du capteur, comme la fiche d'une séance Whoop (kJ ÷ 4,184) et l'appli Whoop ; la montre : ses kcal
      const k = a.kcalBrutes ?? a.kcal;
      const w = a.source === "whoop" ? await db.getFirstAsync<{ zones: string | null }>("SELECT zones FROM whoop_seance WHERE id = ?", [a.cle.slice(6)]) : null;
      let z: number[] | null = null;
      try {
        // zones de Whoop : [Z0, Z1 … Z5] en minutes ; la barre montre Z1 à Z5
        z = w?.zones ? (JSON.parse(w.zones) as number[]).slice(1, 6) : null;
      } catch {
        z = null;
      }
      if (vivant) {
        setKcal(k);
        setZones(z);
      }
    })().catch(console.error);
    return () => {
      vivant = false;
    };
  }, [visible, a, db]);
  const auj = new Date().toDateString() === new Date(a.debut).toDateString();
  const source = a.source === "whoop" ? "Whoop" : a.source === "sante" ? nomSource(a.cle.split(":")[1]) : t("activite.source.montre");
  const sous = t("activite.sousTitre", { jour: auj ? t("communs.aujourdhui") : jourSemaineMois(a.debut), debut: heure(a.debut), fin: heure(a.fin), source });
  const faits: [string, string][] = [[t("activite.duree"), dureeCourte((a.fin - a.debut) / 1000)]];
  if (a.fcMoy != null) faits.push([t("activite.fcMoy"), String(a.fcMoy)]);
  if (a.fcMax != null) faits.push([t("activite.fcMax"), String(a.fcMax)]);
  if (kcal != null) faits.push([t("activite.depense"), `${approx(nombre(kcal, 0))} kcal`]);
  const enregistrer = async () => {
    if (!choisi) return;
    const refuse = a.suggestion && a.suggestion.act.id !== choisi.id ? a.suggestion.act.id : null;
    const fc = a.source === "pepfit" ? await sante.fcEntre(a.debut, a.fin).catch(() => null) : null;
    await associerActivite(db, a, choisi, { refuse, profil: (await lireProfilFc(db)) as ProfilFc | null, fc, programme: programmeDe(a, choisi) });
    onFermer();
    activitesChangees();
  };
  const bande = a.suggestion ? [{ act: a.suggestion.act, ligne: a.suggestion.pourquoi }] : (a.ambigu ?? []);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("activite.quelSport")}
      sousTitre={sous}
      pied={
        <View>
          <BoutonPrincipal
            libelle={choisi ? t("activite.enregistrer", { sport: choisi.nom }) : t("activite.choisis")}
            desactive={!choisi}
            onPress={() => enregistrer().catch(console.error)}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onFermer();
              ignorer(db, a.cle).catch(console.error);
            }}
            style={({ pressed }) => [styles.texteBouton, pressed && { backgroundColor: couleurs.s2 }]}
          >
            <Icone nom="oeilBarre" couleur={couleurs.t2} taille={18} />
            <Texte style={[styles.texteBoutonLib, { color: couleurs.t2 }]}>{t("activite.ignorerCette")}</Texte>
          </Pressable>
        </View>
      }
    >
      <RappelActivite faits={faits} zones={zones} />
      {bande.length ? (
        <>
          <EnTeteFeuille texte={t(bande.length > 1 ? "activite.suggestions" : "activite.suggestion")} />
          <View style={[styles.groupe, { backgroundColor: couleurs.feuilleGroupe }]}>
            {bande.map((b, i) => {
              const src = fichierPicto(pictoSport(b.act.slug), null, 40);
              return (
                <Pressable
                  key={b.act.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: choisi?.id === b.act.id }}
                  onPress={() => setChoisi(b.act)}
                  style={({ pressed }) => [
                    styles.sugg,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line },
                    pressed && { backgroundColor: couleurs.s3 },
                  ]}
                >
                  {src != null ? <Image source={src} style={{ width: 40, height: 40 }} resizeMode="contain" /> : <Icone nom="dumbbell" couleur={couleurs.t3} />}
                  <View style={{ flex: 1, gap: 1 }}>
                    <Texte variante="exercice">{b.act.nom}</Texte>
                    <Texte variante="meta" couleur="t2" numberOfLines={1}>
                      {b.ligne}
                    </Texte>
                  </View>
                  <Radio on={choisi?.id === b.act.id} />
                </Pressable>
              );
            })}
          </View>
          <EnTeteFeuille texte={t("activite.tesSports")} />
        </>
      ) : (
        <View style={{ height: espace.l }} />
      )}
      <ChoixSports choisi={choisi} onChoisir={setChoisi} />
    </Feuille>
  );
}

const styles = StyleSheet.create({
  ligne: { borderRadius: rayon.l, paddingVertical: espace.m, paddingHorizontal: espace.l, minHeight: 64, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: espace.m },
  ligneTouche: { flex: 1, flexDirection: "row", alignItems: "center", gap: espace.m, minHeight: 40 },
  case: { width: 24, height: 20, alignItems: "center", justifyContent: "center" },
  puce: { minHeight: 36, paddingHorizontal: espace.m, borderRadius: rayon.m, flexDirection: "row", alignItems: "center", gap: 6, marginRight: -4 },
  puceTexte: { fontFamily: police.semibold, fontSize: 14 },
  tuile: { flex: 1, height: 112, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 4 },
  picto: { width: 56, height: 56 },
  nomTuile: { fontFamily: police.medium, fontSize: 13, maxWidth: "100%", paddingHorizontal: espace.s },
  badge: { position: "absolute", top: espace.s, right: espace.s, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  lien: { minHeight: 56, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: espace.l, paddingRight: espace.m },
  lienTexte: { fontFamily: police.medium, fontSize: 15, flex: 1 },
  groupe: { borderRadius: rayon.l, overflow: "hidden" },
  faits: { flexDirection: "row", gap: 22, paddingHorizontal: espace.l, paddingTop: 14, paddingBottom: espace.m },
  zones: { flexDirection: "row", gap: 2, height: 6, marginHorizontal: espace.l, marginBottom: espace.l },
  enTete: { paddingHorizontal: espace.xs, paddingTop: espace.l, paddingBottom: espace.s },
  sugg: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingVertical: espace.s, paddingLeft: espace.m, paddingRight: espace.l },
  radio: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  point: { width: 10, height: 10, borderRadius: 5 },
  texteBouton: { height: 44, marginTop: espace.xs, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  texteBoutonLib: { fontFamily: police.medium, fontSize: 14 },
});
