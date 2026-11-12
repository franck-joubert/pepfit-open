// Parcours de séance unifié (planche ajout-seance-v2) : UNE feuille, posée à la racine de l'appli, pour démarrer, ajouter et
// modifier une séance. Les étapes glissent à l'intérieur (hauteur constante) : sport, routines, réglages, puis un sous-réglage
// (quand, durée, répéter). Le lieu ouvre la feuille des lieux. Démarrer mène au récap « Maintenant » ; Ajouter crée
// la séance prévue et ouvre son récap ; Modifier enregistre les réglages d'une séance prévue.
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Image, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { ecrireLanceur, lireLanceur, PICTO_TYPE, type Sport } from "../../db";
import { catalogueSports } from "../../db/depots/lanceur";
import { dernierLieuDuSport } from "../../db/depots/lanceur";
import { ajouterRoutineBoutique } from "../../db/depots/plans";
import { lireReglagesPlanif, lireReglagesPrevus } from "../../db/depots/programmations";
import { listerRoutines, type RoutineResume } from "../../db/depots/routines";
import { ROUTINES } from "../../boutique/donnees";
import { texte } from "../../boutique/modele";
import { lireCleSeance } from "../../agenda/calcul";
import { bilingue, lireActif, t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { PartieImposee } from "../../ui/ContextePartie";
import { Feuille } from "../../ui/Feuille";
import { fichierPicto } from "../../ui/pictos";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { activitesChangees } from "../activites-evenement";
import { useApp } from "../contexte";
import { FeuilleCatalogue } from "../FeuilleSport";
import { FeuilleSalle } from "../FeuilleSalle";
import { heureTexte } from "../format";
import { ajouter, COURSE, MUSCULATION, retirer, sportsDeLaFeuille } from "../lanceur-sports";
import { jourDe } from "../planif-donnees";
import { lireRecap } from "../recap/donnees-recap";
import {
  dureeLibelle, lieuParDefaut, peutRetirerSport, quandAuJour, quandLibelle, sportsAffiches,
  type LieuChoisi, type Quand,
} from "../parcours-seance";
import { FeuilleRecuperer } from "../recuperer-vues/FeuilleRecuperer";
import { creerSeanceDuParcours, modifierSeanceDuParcours, type Repetition } from "./creer-parcours";
import { fermerParcours, useDemandeParcours, type DemandeParcours } from "./demande-parcours";
import { EtapeReglages } from "./EtapeReglages";
import { EtapeRoutines, type RoutineChoisie } from "./EtapeRoutines";
import { EtapeSport, VignetteSport } from "./EtapeSport";
import { EtapeDuree, EtapeQuand, EtapeRepeter, jourCourtTexte, jourTitre } from "./EtapesReglage";
import { Etape, Etapes } from "./Etapes";

const SPORT = 0;
const ROUTINES_ETAPE = 1;
const REGLAGES = 2;
const SOUS = 3;

type Sous = "quand" | "duree" | "repeter";

/** Ce que la séance est : un sport seul, ou une routine (de la personne ou du catalogue, déjà ajoutée). */
interface Choix {
  sport: Sport | null;
  routineId: string | null;
  nom: string;
  picto: string | null;
}

interface Donnees {
  catalogue: Sport[];
  ids: string[];
  routinesPerso: RoutineResume[];
  heureDefaut: string;
  aujourdhui: string;
}

const libelleRepeter = (r: Repetition | null): string =>
  r === "jour" ? t("ps.chaqueJour") : r === "semaine" ? t("ps.chaqueSemaine") : r === "deuxSemaines" ? t("ps.touteDeuxSemaines") : t("ps.jamais");

/** Visuel de l'en-tête des réglages : le sport, ou le picto de la routine. */
function Visuel({ choix }: { choix: Choix }) {
  if (choix.sport) return <VignetteSport slug={choix.sport.slug} taille={32} />;
  const src = fichierPicto(choix.picto, null, 128);
  return src != null ? <Image source={src} style={{ width: 32, height: 32 }} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" /> : <View style={{ width: 32, height: 32 }} />;
}

export function Parcours() {
  const demande = useDemandeParcours();
  // Dernière demande gardée : la feuille se ferme en s'animant, son contenu ne disparaît pas sous elle.
  const [garde, setGarde] = useState<{ d: DemandeParcours; n: number } | null>(null);
  useEffect(() => {
    if (demande) setGarde((g) => ({ d: demande, n: (g?.n ?? 0) + 1 }));
  }, [demande]);
  return (
    <PartieImposee partie="entrainement">
      {garde ? <Contenu key={garde.n} demande={garde.d} ouvert={demande != null} /> : null}
    </PartieImposee>
  );
}

function Contenu({ demande, ouvert }: { demande: DemandeParcours; ouvert: boolean }) {
  useLangue();
  const { db } = useApp();
  const langue = lireActif().langue;
  const { height } = useWindowDimensions();
  const hauteur = Math.round(Math.min(Math.max(height * 0.56, 400), 520));

  const [d, setD] = useState<Donnees | null>(null);
  const [courante, setCourante] = useState(SPORT);
  const [sous, setSous] = useState<Sous>("quand");
  const [retourReglages, setRetourReglages] = useState(SPORT);
  const [edition, setEdition] = useState(false);
  const [ajoutSport, setAjoutSport] = useState(false);
  const [autre, setAutre] = useState(false);
  const [recuperer, setRecuperer] = useState(false);
  const [choixLieu, setChoixLieu] = useState(false);

  const [choix, setChoix] = useState<Choix>({ sport: null, routineId: null, nom: "", picto: null });
  const [quand, setQuand] = useState<Quand>({ jour: jourDe(Date.now()), heure: "18:00" });
  const [dureeMin, setDureeMin] = useState<number | null>(null);
  const [estimee, setEstimee] = useState<number | null>(null);
  const [lieu, setLieu] = useState<LieuChoisi>(lieuParDefaut(null));
  const [repeter, setRepeter] = useState<Repetition | null>(null);
  const [repetable, setRepetable] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = demande.genre === "modifier" ? lireCleSeance(demande.seance) : null;

  // Données de la feuille, lues à l'ouverture ; Modifier part directement des réglages de la séance.
  useEffect(() => {
    let vif = true;
    (async () => {
      const [lanceur, catalogue, routines, reglages] = await Promise.all([lireLanceur(db), catalogueSports(db), listerRoutines(db), lireReglagesPlanif(db)]);
      // Comme la page Routines : celles d'un plan de la boutique se voient dans « En cours » et le calendrier, jamais dans les listes (08/11).
      const routinesPerso = routines.filter((r) => !r.planId);
      const aujourdhui = jourDe(Date.now());
      let initial: Partial<{ choix: Choix; quand: Quand; dureeMin: number | null; estimee: number | null; lieu: LieuChoisi; repetable: boolean }> = {};
      if (demande.genre === "modifier") {
        const r = await lireRecap(db, { seance: demande.seance });
        if (!r || !r.jour) {
          fermerParcours();
          return;
        }
        const prevus = cle ? await lireReglagesPrevus(db, cle.programmationId) : undefined;
        const choisie = prevus?.dureeMin ?? null;
        initial = {
          choix: { sport: catalogue.find((s) => s.id === r.sport) ?? null, routineId: r.routineId, nom: r.nom, picto: r.picto },
          quand: { jour: r.jour, heure: r.heure },
          dureeMin: choisie,
          estimee: choisie == null ? r.dureeMin : null,
          lieu: r.lieu,
          repetable: !(r.prevue?.repetee ?? false),
        };
      }
      if (!vif) return;
      setD({ catalogue, ids: lanceur.map((s) => s.id), routinesPerso: routinesPerso.filter((x) => x.nbExercices > 0), heureDefaut: reglages.heureDefaut, aujourdhui });
      if (initial.choix) setChoix(initial.choix);
      if (initial.quand) setQuand(initial.quand);
      else if (demande.genre === "sport") setQuand({ jour: demande.jour, heure: demande.jour === aujourdhui ? null : reglages.heureDefaut });
      if (initial.dureeMin !== undefined) setDureeMin(initial.dureeMin);
      if (initial.estimee !== undefined) setEstimee(initial.estimee);
      if (initial.lieu) setLieu(initial.lieu);
      if (initial.repetable) setRepetable(true);
      setCourante(demande.genre === "modifier" ? REGLAGES : SPORT);
    })().catch(signalerErreur());
    return () => {
      vif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  // Sports de la feuille : copie locale, la base suit.
  const idsRef = useRef<string[]>([]);
  if (d) idsRef.current = d.ids;
  const appliquer = useCallback(
    (f: (v: string[]) => string[]) => {
      const l = f(sportsAffiches(idsRef.current));
      idsRef.current = l;
      setD((x) => (x ? { ...x, ids: l } : x));
      ecrireLanceur(db, l).catch(signalerErreur());
    },
    [db],
  );

  const parId = new Map((d?.catalogue ?? []).map((s) => [s.id, s]));
  const affiches = sportsAffiches(d?.ids ?? []).filter((id) => parId.has(id));
  const sports = sportsDeLaFeuille(affiches).map((id) => parId.get(id)!);
  const demarrer = demande.genre === "sport" && demande.mode === "demarrer";
  const aujourdhui = d?.aujourdhui ?? jourDe(Date.now());

  const fermer = () => {
    if (!enCours) fermerParcours();
  };
  const retour = useCallback(() => {
    if (courante === SOUS) setCourante(REGLAGES);
    else if (courante === REGLAGES) {
      if (demande.genre === "modifier") fermerParcours();
      else setCourante(retourReglages);
    } else if (courante === ROUTINES_ETAPE) setCourante(SPORT);
    else fermerParcours();
  }, [courante, demande.genre, retourReglages]);
  useEffect(() => {
    if (!ouvert || courante === SPORT) return;
    const s = BackHandler.addEventListener("hardwareBackPress", () => {
      retour();
      return true;
    });
    return () => s.remove();
  }, [ouvert, courante, retour]);

  const lieuDuSport = async (sportId: string): Promise<LieuChoisi> => lieuParDefaut(await dernierLieuDuSport(db, sportId));

  // ----- Choisir -----
  const versRecap = (params: Record<string, string>) => {
    fermerParcours();
    router.push({ pathname: "/seance-recap", params });
  };
  const versReglages = async (c: Choix, depuis: number) => {
    setChoix(c);
    setLieu(await lieuDuSport(c.sport?.id ?? (c.picto === PICTO_TYPE.course ? COURSE : MUSCULATION)));
    setDureeMin(null);
    setEstimee(null);
    setErreur(null);
    setRetourReglages(depuis);
    setCourante(REGLAGES);
  };
  const choisirSport = (s: Sport) => {
    if (demarrer) return versRecap({ sport: s.id });
    versReglages({ sport: s, routineId: null, nom: s.nom, picto: null }, SPORT).catch(signalerErreur());
  };
  const choisirRoutine = (c: RoutineChoisie) => {
    if (c.genre === "perso") {
      const r = c.routine;
      if (demarrer) return versRecap({ routineId: r.id });
      versReglages({ sport: null, routineId: r.id, nom: r.nom, picto: PICTO_TYPE[r.type] ?? null }, ROUTINES_ETAPE).catch(signalerErreur());
      return;
    }
    // Une routine du catalogue se range d'abord dans « Mes routines » (sans doublon), puis suit le même chemin.
    ajouterRoutineBoutique(db, c.routine, bilingue(langue))
      .then((id) => {
        const nom = texte(c.routine.nom, bilingue(langue));
        if (demarrer) return versRecap({ routineId: id });
        return versReglages({ sport: null, routineId: id, nom, picto: c.routine.picto }, ROUTINES_ETAPE);
      })
      .catch(signalerErreur());
  };

  // ----- Valider -----
  const valider = async () => {
    if (enCours || !d) return;
    setErreur(null);
    setEnCours(true);
    try {
      const sansHeure = quand.heure == null;
      if (demande.genre === "modifier") {
        if (!cle) return;
        await modifierSeanceDuParcours(
          db,
          cle,
          { jour: quand.jour, heure: quand.heure ?? d.heureDefaut, sansHeure, dureeMin, lieuId: lieu.id, ...(repetable ? { repeter } : {}) },
          langue,
        );
        activitesChangees();
        fermerParcours();
        return;
      }
      const r = await creerSeanceDuParcours(
        db,
        { sport: choix.sport?.id ?? null, routineId: choix.routineId, nom: choix.nom, jour: quand.jour, heure: quand.heure ?? d.heureDefaut, sansHeure, dureeMin, lieuId: lieu.id },
        langue,
      );
      activitesChangees();
      versRecap({ seance: `${r.programmationId}|${quand.jour}` });
    } catch (x) {
      signalerErreur()(x);
    } finally {
      setEnCours(false);
    }
  };

  const titreSport = demande.genre === "sport" ? jourTitre(demande.jour) : "";
  const dureeAffichee = dureeMin ?? estimee;
  const modifier = demande.genre === "modifier";

  return (
    <>
      <Feuille visible={ouvert} onFermer={fermer} glisserContenu={false}>
        {d ? (
          <Etapes courante={courante} hauteur={hauteur}>
            <Etape rang={SPORT}>
              <EtapeSport
                titre={titreSport}
                sports={sports}
                edition={edition}
                recuperer={demarrer}
                onEdition={setEdition}
                onSport={choisirSport}
                onRetirer={(s) => peutRetirerSport(affiches) && appliquer((v) => retirer(v, s.id))}
                onReordonner={(l) => appliquer((v) => [...l, ...v.filter((x) => !l.includes(x))])}
                onAjouterSport={() => setAjoutSport(true)}
                onAutre={() => setAutre(true)}
                onRecuperer={() => {
                  fermerParcours();
                  setRecuperer(true);
                }}
              />
            </Etape>
            <Etape rang={ROUTINES_ETAPE}>
              <EtapeRoutines catalogue={ROUTINES} perso={d.routinesPerso} onRetour={retour} onChoisir={choisirRoutine} />
            </Etape>
            <Etape rang={REGLAGES}>
              <EtapeReglages
                visuel={<Visuel choix={choix} />}
                titre={choix.nom}
                quand={quandLibelle(quand, aujourdhui, jourCourtTexte, heureTexte)}
                duree={dureeLibelle(dureeAffichee)}
                lieu={lieu.nom}
                repeter={modifier && repetable ? libelleRepeter(repeter) : undefined}
                libelleBouton={modifier ? t("ps.enregistrer") : t("ps.ajouter")}
                pret
                enCours={enCours}
                erreur={erreur}
                onRetour={retour}
                onQuand={() => {
                  setSous("quand");
                  setCourante(SOUS);
                }}
                onDuree={() => {
                  setSous("duree");
                  setCourante(SOUS);
                }}
                onLieu={() => setChoixLieu(true)}
                onRepeter={() => {
                  setSous("repeter");
                  setCourante(SOUS);
                }}
                onValider={() => void valider()}
              />
            </Etape>
            <Etape rang={SOUS}>
              {sous === "quand" ? (
                <EtapeQuand
                  quand={quand}
                  aujourdhui={aujourdhui}
                  heureDefaut={d.heureDefaut}
                  onChange={(q) => setQuand(quandAuJour(q, q.jour, aujourdhui, d.heureDefaut))}
                  onRetour={retour}
                />
              ) : sous === "duree" ? (
                <EtapeDuree
                  dureeMin={dureeAffichee}
                  onChange={(m) => {
                    setDureeMin(m);
                    setEstimee(null);
                  }}
                  onRetour={retour}
                />
              ) : (
                <EtapeRepeter valeur={repeter} onChoisir={setRepeter} onRetour={retour} />
              )}
            </Etape>
          </Etapes>
        ) : (
          <View style={{ height: hauteur }} />
        )}
      </Feuille>
      <FeuilleCatalogue
        visible={ajoutSport}
        titre={t("ps.ajouterSport")}
        sports={d?.catalogue ?? []}
        deja={affiches}
        ajout
        onFermer={() => setAjoutSport(false)}
        onChoisir={(s) => appliquer((v) => (v.includes(s.id) ? (peutRetirerSport(v) ? retirer(v, s.id) : v) : ajouter(v, s.id)))}
      />
      <FeuilleCatalogue
        visible={autre}
        titre={t("ps.autreSport")}
        sports={d?.catalogue ?? []}
        deja={affiches}
        ajout={false}
        onFermer={() => setAutre(false)}
        onChoisir={(s) => {
          setAutre(false);
          choisirSport(s);
        }}
      />
      <FeuilleSalle
        visible={choixLieu}
        surPlace={demarrer}
        sport={choix.sport ? { id: choix.sport.id, nom: choix.sport.nom } : null}
        salleId={lieu.id}
        onFermer={() => setChoixLieu(false)}
        onChoisir={(id) => {
          setChoixLieu(false);
          if (id == null) setLieu(lieuParDefaut(null));
          else
            db.getFirstAsync<{ nom: string }>("SELECT nom FROM salles WHERE id = ?", [id])
              .then((s) => setLieu({ id, nom: s?.nom ?? t("ps.lieuNonDefini") }))
              .catch(signalerErreur());
        }}
      />
      <FeuilleRecuperer visible={recuperer} onFermer={() => setRecuperer(false)} />
    </>
  );
}
