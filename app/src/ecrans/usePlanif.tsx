import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, type GestureResponderEvent, type ViewInstance, type ViewProps } from "react-native";
import { largeurContenu } from "../ui/CadreContenu";
import { router } from "expo-router";
import { activerProgrammation, ajouterProgrammation, poserException, reecrireProgrammation, reglerRappelRoutine, retirerException, supprimerProgrammation, supprimerSeance } from "../db";
import { lireActif, t } from "../i18n/index";
import { texteRegle } from "../i18n/planif-saisie";
import { rafraichirRappels } from "../natif/rappels";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { useAgenda } from "./agenda/useAgenda";
import { useApp, useCharge } from "./contexte";
import { jourMois, jourLong } from "./format";
import { FeuilleChoix, FeuilleProgrammer, FeuilleRappel, FeuilleRegles, FeuilleSeance, type Choix } from "./FeuillesPlanif";
import { LigneSeance, midi } from "./Planif";
import { retraitDe } from "./retrait-ligne";
import { cleLigne } from "./cle-ligne";
import { marquerSuppression } from "../ui/Desintegration";
import { duree } from "../theme/mouvement";
import { lirePlanning, type LigneJour, type Planning } from "./planif-donnees";
import { deplacerSerie, type Exception, type Occurrence, type Programmation, type Regle } from "./planification";
import { surActivitesChangees, surAnnulable } from "./activites-evenement";
import { FeuilleHorairesActivite } from "./FeuilleHorairesActivite";
import { estSport } from "./horaires-donnees";
import { signalerErreur } from "../ui/FeuilleMessage";

// Planification : état et gestes communs à Entraînements (bande semaine) et à la page du mois. Toute écriture qui retire
// quelque chose passe par la bulle « Annuler » (8 s, écriture après pour les suppressions).

export const DELAI_ANNULER_MS = 8000;

type Prevue = LigneJour & { genre: "prevue" };
type Attente = { texte: string; annuler: () => Promise<unknown>; confirmer?: () => Promise<unknown>; cacheSeance?: string; cacheProg?: string; action?: string; lignes?: number; coche?: boolean };
type Souleve = { l: Prevue; dx: number; dy: number; largeur: number; h: number };

const jourTexte = (j: string) => `${jourLong(midi(j))} ${jourMois(midi(j))}`;

export function usePlanif({ de, a }: { de: string; a: string }) {
  const { db } = useApp();
  const [brut, recharger] = useCharge((db) => lirePlanning(db, de, a), [de, a]);
  // Après chaque écriture, l'agenda du téléphone suit (planche agenda-ics, D11) : la synchro est posée plus bas.
  const synchroAgenda = useRef<() => Promise<unknown>>(async () => {});
  const ecrire = (p: Promise<unknown>) =>
    p
      .then(recharger)
      .then(() => rafraichirRappels(db, { demander: true }))
      .then(() => synchroAgenda.current())
      .catch(console.error);

  // Bulle « Annuler » : une seule à la fois ; la précédente est confirmée quand une autre arrive ou que l'écran se ferme.
  const [attente, setAttente] = useState<Attente | null>(null);
  const courante = useRef<{ a: Attente; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const confirmer = () => {
    const c = courante.current;
    if (!c) return;
    clearTimeout(c.minuterie);
    courante.current = null;
    if (c.a.confirmer) ecrire(c.a.confirmer());
  };
  const lancer = (a: Attente) => {
    confirmer();
    const minuterie = setTimeout(() => {
      confirmer();
      setAttente((x) => (x === a ? null : x));
    }, DELAI_ANNULER_MS);
    courante.current = { a, minuterie };
    setAttente(a);
  };
  const annuler = () => {
    const c = courante.current;
    if (c) clearTimeout(c.minuterie);
    courante.current = null;
    setAttente(null);
    if (c) ecrire(c.a.annuler());
  };
  useEffect(
    () => () => {
      const c = courante.current;
      if (!c) return;
      clearTimeout(c.minuterie);
      c.a.confirmer?.().then(() => rafraichirRappels(db, { demander: true })).catch(console.error);
    },
    [db],
  );
  // Une activité détectée ignorée (planche activite-detectee) : même bulle « Annuler » que les séances retirées.
  const lancerRef = useRef(lancer);
  lancerRef.current = lancer;
  useEffect(() => surAnnulable((x) => lancerRef.current({ texte: x.texte, annuler: x.annuler, confirmer: x.confirmer, action: x.action, lignes: x.lignes, coche: x.coche })), []);
  // Une activité devenue séance (associée, reconnue) : la journée se relit.
  const rechargerRef = useRef(recharger);
  rechargerRef.current = recharger;
  useEffect(() => surActivitesChangees(() => void rechargerRef.current().catch(console.error)), []);

  // Séance supprimée de l'historique : masquée tout de suite, effacée après la bulle.
  const p = useMemo<Planning | undefined>(() => {
    const cache = attente?.cacheSeance;
    if (!brut || !cache) return brut;
    return { ...brut, seances: brut.seances.filter((s) => s.id !== cache), jours: brut.jours.filter((s) => s.id !== cache) };
  }, [brut, attente]);

  const [seance, setSeance] = useState<LigneJour | null>(null);
  const [choix, setChoix] = useState<{ titre: string; sous?: string; choix: Choix[] } | null>(null);
  const [programmer, setProgrammer] = useState<string | null>(null);
  const [regles, setRegles] = useState<string | null>(null);
  const [rappel, setRappel] = useState<string | null>(null);

  // Modifier les horaires d'une séance faite (D7) : sa cible reste après la fermeture, la feuille redescend avec son contenu.
  const [horaires, setHoraires] = useState<{ id: string; titre: string } | null>(null);
  const [horairesOuverts, setHorairesOuverts] = useState(false);
  const modifier = (l: LigneJour) => {
    if (l.genre !== "faite") return;
    setSeance(null);
    const { id, titre } = l.seance;
    estSport(db, id)
      .then((sport) => {
        if (!sport) return router.push({ pathname: "/history/edit/[id]", params: { id } });
        setHoraires({ id, titre: titre ?? "" });
        setHorairesOuverts(true);
      })
      .catch(signalerErreur());
  };

  const prog = (id: string) => brut?.progs.find((x) => x.id === id);
  const exception = (o: Occurrence) => brut?.exceptions.find((e) => e.programmationId === o.programmationId && e.dateOrigine === o.origine);
  const remettre = (o: Occurrence, avant: Exception | undefined) =>
    avant
      ? poserException(db, o.programmationId, o.origine, avant.type === "retiree" ? { type: "retiree" } : { type: "decalee", nouvelleDate: avant.nouvelleDate!, nouvelleHeure: avant.nouvelleHeure })
      : retirerException(db, o.programmationId, o.origine);
  const fermer = () => {
    setSeance(null);
    setChoix(null);
  };

  /** Une séance passée (faite ou manquée) quitte l'historique ou le planning. */
  const supprimerPassee = (l: LigneJour) => {
    fermer();
    if (l.genre === "faite") {
      const id = l.seance.id;
      return lancer({ texte: t("planif.seanceSupprimee"), cacheSeance: id, annuler: async () => {}, confirmer: () => supprimerSeance(db, id) });
    }
    retirerSeule(l);
  };
  const retirerSeule = (l: Prevue) => {
    fermer();
    const avant = exception(l.occ);
    ecrire(poserException(db, l.occ.programmationId, l.occ.origine, { type: "retiree" }));
    lancer({ texte: t("planif.retiree", { nom: l.nom }), annuler: () => remettre(l.occ, avant) });
  };
  /** Toute la règle : éteinte tout de suite, supprimée après la bulle. */
  const retirerRegle = (pr: Programmation, texte: string) => {
    fermer();
    ecrire(activerProgrammation(db, pr.id, false));
    lancer({ texte, cacheProg: pr.id, annuler: () => activerProgrammation(db, pr.id, pr.actif), confirmer: () => supprimerProgrammation(db, pr.id) });
  };
  /** La séance retirée se désintègre, une fois la feuille (menu ou choix) descendue ; glissée vers « Supprimer », la ligne
   *  s'est déjà marquée elle-même (sans attente). */
  const sortir = (l: Prevue, apresFeuille: boolean) => marquerSuppression(cleLigne(l), apresFeuille ? duree.feuilleSortie : 0);
  const retirer = (l: Prevue) => {
    const pr = prog(l.occ.programmationId);
    if (!pr) return;
    const depuisFeuille = seance != null;
    if (!l.occ.repetee) {
      sortir(l, depuisFeuille);
      return retirerRegle(pr, t("planif.retiree", { nom: l.nom }));
    }
    setSeance(null);
    setChoix({
      titre: t("planif.retirerNom", { nom: l.nom }),
      sous: jourTexte(l.occ.date),
      choix: [
        { libelle: t("planif.seuleSeance"), onPress: () => { sortir(l, true); retirerSeule(l); } },
        { libelle: t("planif.touteSerie"), danger: true, onPress: () => { sortir(l, true); retirerRegle(pr, t("planif.serieRetiree")); } },
      ],
    });
  };

  /** Déposer (glisser) une séance programmée sur le jour `j`. */
  const deplacer = (l: Prevue, j: string) => {
    fermer();
    if (j === l.occ.date) return;
    const pr = prog(l.occ.programmationId);
    if (!pr) return;
    const texte = t("planif.deplacee", { jour: jourTexte(j) });
    const reecrire = () => {
      fermer();
      const regle: Regle = deplacerSerie(pr.regle, l.occ.origine, j);
      ecrire(reecrireProgrammation(db, pr.id, regle, texteRegle(regle, lireActif().langue)));
      lancer({ texte, annuler: () => reecrireProgrammation(db, pr.id, pr.regle, pr.texte) });
    };
    const seule = () => {
      fermer();
      const avant = exception(l.occ);
      ecrire(poserException(db, l.occ.programmationId, l.occ.origine, { type: "decalee", nouvelleDate: j, nouvelleHeure: avant?.nouvelleHeure ?? null }));
      lancer({ texte: t("planif.decalee", { jour: jourTexte(j) }), annuler: () => remettre(l.occ, avant) });
    };
    if (!l.occ.repetee) return reecrire();
    setChoix({
      titre: t("planif.auJour", { nom: l.nom, jour: jourTexte(j) }),
      choix: [
        { libelle: t("planif.seuleSeance"), onPress: seule },
        { libelle: t("planif.touteSerie"), danger: true, onPress: reecrire },
      ],
    });
  };

  /** ⋯ d'une routine ou d'une séance › Programmation : la saisie si elle n'a pas de règle, sinon ses règles. */
  const ouvrirProgrammation = (routineId: string) => {
    fermer();
    if (brut?.progs.some((x) => x.routineId === routineId)) setRegles(routineId);
    else setProgrammer(routineId);
  };
  /** Nouvelle heure le même jour (conflit avec l'agenda, D15) : une exception « décalée », « Annuler » la remet. */
  const changerHeure = (l: Prevue, heure: string) => {
    fermer();
    const avant = exception(l.occ);
    ecrire(poserException(db, l.occ.programmationId, l.occ.origine, { type: "decalee", nouvelleDate: l.occ.date, nouvelleHeure: heure }));
    lancer({ texte: t("agenda.conflit.decalee", { nom: l.nom, heure }), annuler: () => remettre(l.occ, avant) });
  };
  const agenda = useAgenda({ p: brut, recharger, lancer, decaler: changerHeure });
  synchroAgenda.current = agenda.synchro;

  const ajouter = (routineId: string, regle: Regle) => ecrire(ajouterProgrammation(db, routineId, texteRegle(regle, lireActif().langue), regle));

  // Glisser-déposer : appui long sur une séance programmée, elle suit le doigt ; les cases des jours sont mesurées
  // (fenêtre) au début du geste, le jour survolé s'éclaire, le dépôt passe par `deplacer`.
  const [souleve, setSouleve] = useState<Souleve | null>(null);
  const [vise, setVise] = useState<string | null>(null);
  const pos = useRef(new Animated.ValueXY()).current;
  const cases = useRef(new Map<string, ViewInstance>()).current;
  const rects = useRef<{ j: string; x: number; y: number; w: number; h: number }[]>([]);
  const zone = useRef<ViewInstance>(null);
  const origine = useRef({ x: 0, y: 0 });
  const enCoursGeste = useRef<Souleve | null>(null);
  const pris = useRef(false);
  const mesurerCase = (j: string, v: ViewInstance | null) => {
    if (v) cases.set(j, v);
    else cases.delete(j);
  };
  const viser = (x: number, y: number) => {
    const r = rects.current.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
    const j = r && brut && r.j >= brut.aujourdhui ? r.j : null;
    setVise((v) => (v === j ? v : j));
    return j;
  };
  /** Appelé par l'appui long d'une ligne : `x`, `y` = position du doigt dans la fenêtre. */
  const soulever = (l: Prevue, x: number, y: number, ligne?: { y: number; h: number }) => {
    const largeur = largeurContenu() - 32;
    const h = ligne?.h ?? 64;
    const s: Souleve = { l, dx: x, dy: ligne ? y - ligne.y : h / 2, largeur, h };
    enCoursGeste.current = s;
    rects.current = [];
    for (const [j, v] of cases) v.measureInWindow((cx, cy, w, ch) => rects.current.push({ j, x: cx, y: cy, w, h: ch }));
    zone.current?.measureInWindow((zx, zy) => {
      origine.current = { x: zx, y: zy };
      pos.setValue({ x: 16 + 16, y: y - zy - s.dy });
    });
    setSouleve(s);
  };
  const lacher = (fin: boolean, x = 0, y = 0) => {
    const s = enCoursGeste.current;
    enCoursGeste.current = null;
    pris.current = false;
    setSouleve(null);
    setVise(null);
    if (!s || !fin) return;
    const j = viser(x, y);
    setVise(null);
    if (j) deplacer(s.l, j);
  };
  const zoneProps: ViewProps & { ref: typeof zone } = {
    ref: zone,
    onMoveShouldSetResponderCapture: () => enCoursGeste.current != null,
    onStartShouldSetResponderCapture: () => enCoursGeste.current != null,
    onResponderGrant: () => void (pris.current = true),
    onResponderTerminationRequest: () => false,
    onResponderMove: (e: GestureResponderEvent) => {
      const s = enCoursGeste.current;
      if (!s) return;
      const { pageX, pageY } = e.nativeEvent;
      pos.setValue({ x: 32, y: pageY - origine.current.y - s.dy });
      viser(pageX, pageY);
    },
    onResponderRelease: (e: GestureResponderEvent) => lacher(true, e.nativeEvent.pageX, e.nativeEvent.pageY),
    onResponderTerminate: () => lacher(false),
  };
  /** Fin d'appui de la ligne : levée sans avoir bougé (la ligne a gardé le geste), rien ne bouge. Elle arrive aussi quand la
   *  page prend le geste : on laisse passer ce tour avant de regarder. */
  const finAppui = () =>
    setTimeout(() => {
      if (enCoursGeste.current && !pris.current) lacher(false);
    }, 50);
  const flottant: ReactNode = souleve ? (
    <Animated.View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, top: 0, width: souleve.largeur, transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale: 1.03 }], zIndex: 10 }}
    >
      <LigneSeance l={souleve.l} leve onMenu={() => {}} />
    </Animated.View>
  ) : null;

  const actions = {
    menu: (l: LigneJour) => setSeance(l),
    // Glissé vers « Supprimer » : comme le menu ⋯ (retraitDe), une séance à venir passe par `retirer` (la règle, ou le choix).
    balayer: (l: LigneJour) => (retraitDe(l) === "passee" ? supprimerPassee(l) : l.genre === "prevue" && retirer(l)),
    ouvrirProgrammation,
  };

  const bulle = (bas: number) => (attente ? <BandeauAnnuler texte={attente.texte} bas={bas} onAnnuler={annuler} action={attente.action} lignes={attente.lignes} coche={attente.coche} /> : null);
  const cachees = useMemo(() => new Set(attente?.cacheProg ? [attente.cacheProg] : []), [attente]);
  const nomDe = (id: string | null) => (id && brut?.routines.get(id) ? { id, nom: brut.routines.get(id)!.nom } : null);
  const feuilleRappel = rappel ? brut?.progs.find((x) => x.routineId === rappel) : undefined;

  const feuilles = (
    <>
      <FeuilleSeance
        l={seance}
        onFermer={() => setSeance(null)}
        onVoir={() => {
          if (seance?.genre === "faite") router.push({ pathname: "/history/[id]", params: { id: seance.seance.id } });
          setSeance(null);
        }}
        onModifier={() => seance && modifier(seance)}
        onSupprimer={() => seance && supprimerPassee(seance)}
      />
      {horaires ? (
        <FeuilleHorairesActivite
          visible={horairesOuverts}
          onFermer={() => setHorairesOuverts(false)}
          cible={{ genre: "seance", id: horaires.id }}
          titre={horaires.titre}
          onModifie={() => void recharger()}
        />
      ) : null}
      <FeuilleChoix titre={choix?.titre ?? null} sous={choix?.sous} choix={choix?.choix ?? []} onFermer={() => setChoix(null)} />
      <FeuilleProgrammer
        routine={nomDe(programmer)}
        p={p}
        onFermer={() => setProgrammer(null)}
        onAjouter={(id, _texte, regle) => {
          setProgrammer(null);
          ajouter(id, regle);
        }}
      />
      <FeuilleRegles
        routine={nomDe(regles)}
        p={p}
        cachees={cachees}
        bulle={regles ? bulle(0) : null}
        onFermer={() => setRegles(null)}
        onActiver={(pr, v) => ecrire(activerProgrammation(db, pr.id, v))}
        onSupprimer={(pr) => retirerRegle(pr, t("planif.regleSupprimee"))}
        onAjouter={(id, _texte, regle) => ajouter(id, regle)}
        onRappel={() => {
          setRappel(regles);
          setRegles(null);
        }}
      />
      <FeuilleRappel
        routine={nomDe(rappel)}
        valeur={feuilleRappel?.rappelMin ?? null}
        onFermer={() => {
          setRegles(rappel);
          setRappel(null);
        }}
        onValider={(min) => {
          if (rappel) ecrire(reglerRappelRoutine(db, rappel, min));
          setRegles(rappel);
          setRappel(null);
        }}
      />
      {agenda.feuilles}
    </>
  );

  return { p, recharger, actions, feuilles, bulle, attente, regles, zoneProps, flottant, souleve, vise, mesurerCase, soulever, finAppui, agendaDe: agenda.de };
}
