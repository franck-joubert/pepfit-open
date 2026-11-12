// La feuille « Récupérer » (planche recuperer, écrans 2, 3 et 7) : deux onglets, « Commencer » et « C'est déjà fait » ; la
// sieste en tête avec la durée conseillée et sa raison (l'heure, la dette) ; une grille de neuf activités, 3 colonnes à 412
// et 5 en Fold. Puis, dans la même feuille :
//   - la sieste : 20 min, 90 min ou Libre (« Conseillée » pré-choisie), le réveil (5 min pour s'endormir comprises) et le
//     rappel, « Démarrer la sieste » ;
//   - une activité : sa durée proposée, deux autres, ou Libre ; la fin et l'alarme ; « Démarrer » ;
//   - « C'est déjà fait » : quand, la durée, pré-remplis comme la dernière fois (D11) : « Enregistrer » suffit.
// Démarrer ouvre la session en cours (/recuperer/en-cours), ou la respiration guidée (/recuperer/respiration).
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Onglets } from "../../ui/Onglets";
import { Texte } from "../../ui/Texte";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { alarmeRecup } from "../../natif/alarme-recup";
import { demanderNotifications } from "../../natif/notifications";
import { useApp } from "../contexte";
import { heure } from "../format";
import { FeuilleHeure } from "../FeuillesPlanif";
import { heuresMinutes } from "../mesures/recup-vue";
import { MODES_ALERTE_SIESTE, type AlerteSieste } from "../alerte-sieste";
import { ACTIVITES, activite, alarmeSieste, heureDecimale, recommandation, RECUPERER, type TypeRecup } from "../recuperer";
import { derniereDuType } from "../recuperer-donnees";
import { arrondiDette } from "../recup-pepfit";
import { demarrerRecup, ecrireAlerteSieste, ecrireRappel, enregistrerApresCoup, lireDetteDuJour, lireEnCoursRecup, lireReglagesRecup, type ReglagesRecup } from "../recuperer-session";
import { useMesure } from "../mesures/gabarit";
import { Choix, GrandMin, kcalRecup, minTexte, typeRecupTexte, VignetteRecup } from "./briques";

type Onglet = "commencer" | "fait";
type Etape =
  | { k: "choix" }
  | { k: "sieste" }
  | { k: "activite"; type: TypeRecup }
  | { k: "apres"; type: TypeRecup }
  | { k: "alerte"; retour: Etape }
  | { k: "rappel"; retour: Etape };

const MIN = 60_000;
const ICONE_PLUS: NomIcone = "plus";
const ICONE_MOINS: NomIcone = "moins";
const HEURES_RAPPEL = [12 * 60 + 30, 13 * 60, 13 * 60 + 30, 14 * 60, 14 * 60 + 30];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Ouvre la feuille ; `etape` : « sieste » pour arriver sur le choix de la durée (« Démarrer une sieste » de la page Sommeil). */
export function FeuilleRecuperer({ visible, onFermer, etape: depart = "choix" }: { visible: boolean; onFermer: () => void; etape?: "choix" | "sieste" }) {
  useLangue();
  const { db } = useApp();
  const [onglet, setOnglet] = useState<Onglet>("commencer");
  const [etape, setEtape] = useState<Etape>({ k: depart });
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [dette, setDette] = useState<number | null>(null);
  const [reglages, setReglages] = useState<ReglagesRecup | null>(null);
  const [largeur, setLargeur] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setOnglet("commencer");
    setEtape({ k: depart });
    setMaintenant(Date.now());
    lireDetteDuJour(db).then((d) => setDette(d?.apres ?? null), () => setDette(null));
    lireReglagesRecup(db).then(setReglages, () => {});
  }, [visible, depart, db]);

  const reco = recommandation(heureDecimale(maintenant));
  const recoTexte =
    reco.raison === "matin" || reco.raison === "tard"
      ? t(`recuperer.recoSieste.${reco.raison}`, { heure: heure(maintenant) })
      : !dette
        ? t("recuperer.recoSieste.sansDette", { heure: heure(maintenant) })
        : t("recuperer.recoSieste.eclair", { heure: heure(maintenant), dette: heuresMinutes(arrondiDette(dette)) });

  /** Une session déjà en cours : on y retourne plutôt que d'en lancer une seconde. */
  const demarrer = async (type: TypeRecup, choisi: number | null) => {
    const deja = await lireEnCoursRecup(db);
    // l'alarme passe par une notification : l'autorisation se demande ici, au moment où elle sert
    if (!deja && choisi != null) {
      await demanderNotifications("sieste").catch(() => false);
      await alarmeRecup.demanderHeureExacte().catch(() => {});
    }
    if (!deja) await demarrerRecup(db, { type, choisi });
    onFermer();
    router.push((deja?.type ?? type) === "respiration" ? "/recuperer/respiration" : "/recuperer/en-cours");
  };

  const ouvrir = (type: TypeRecup) => {
    if (onglet === "fait") setEtape({ k: "apres", type });
    else setEtape(type === "sieste" ? { k: "sieste" } : { k: "activite", type });
  };

  let contenu: React.ReactNode;
  if (etape.k === "sieste")
    contenu = <EtapeSieste reco={reco.min} dette={dette} maintenant={maintenant} reglages={reglages} onAlerte={() => setEtape({ k: "alerte", retour: etape })} onRappel={() => setEtape({ k: "rappel", retour: etape })} onDemarrer={(min) => void demarrer("sieste", min).catch(signalerErreur())} />;
  else if (etape.k === "activite")
    contenu = <EtapeActivite type={etape.type} maintenant={maintenant} reglages={reglages} onAlerte={() => setEtape({ k: "alerte", retour: etape })} onDemarrer={(min) => void demarrer(etape.type, min).catch(signalerErreur())} />;
  else if (etape.k === "apres")
    contenu = (
      <EtapeApresCoup
        type={etape.type}
        maintenant={maintenant}
        onCommencer={() => (setOnglet("commencer"), ouvrirCommencer(etape.type, setEtape))}
        onEnregistre={onFermer}
      />
    );
  else if (etape.k === "alerte")
    contenu = (
      <EtapeAlerte
        valeur={reglages?.alerte ?? "les-deux"}
        onChoisir={(a) => {
          setReglages((r) => (r ? { ...r, alerte: a } : r));
          ecrireAlerteSieste(db, a).catch(signalerErreur());
          setEtape(etape.retour);
        }}
      />
    );
  else if (etape.k === "rappel")
    contenu = (
      <EtapeRappel
        actif={reglages?.rappel ?? false}
        heure={reglages?.heureRappel ?? RECUPERER.rappel.heure}
        onChoisir={(actif, h) => {
          setReglages((r) => (r ? { ...r, rappel: actif, heureRappel: h ?? r.heureRappel } : r));
          ecrireRappel(db, actif, h).catch(signalerErreur());
          setEtape(etape.retour);
        }}
      />
    );
  else
    contenu = (
      <>
        <Texte variante="titre">{t("recuperer.titre")}</Texte>
        <OngletsRecuperer onglet={onglet} onChange={setOnglet} />
        <TuileSieste min={reco.min} texte={recoTexte} onPress={() => ouvrir("sieste")} />
        <View onLayout={(e) => setLargeur(e.nativeEvent.layout.width)} style={styles.grille}>
          {largeur > 0
            ? ACTIVITES.filter((a) => a.type !== "sieste").map((a) => {
                const cols = largeur >= 560 ? 5 : 3;
                return <CaseActivite key={a.type} type={a.type} duree={a.duree} largeur={Math.floor((largeur - 8 * (cols - 1)) / cols)} onPress={() => ouvrir(a.type)} />;
              })
            : null}
        </View>
      </>
    );

  return (
    <Feuille visible={visible} onFermer={onFermer}>
      <View style={styles.corps}>{contenu}</View>
    </Feuille>
  );
}

function ouvrirCommencer(type: TypeRecup, setEtape: (e: Etape) => void) {
  setEtape(type === "sieste" ? { k: "sieste" } : { k: "activite", type });
}

/** Commencer ou noter ce qui est déjà fait : deux panneaux de la feuille, donc des onglets (le second site de la feuille passe par ici aussi). */
function OngletsRecuperer({ onglet, onChange }: { onglet: Onglet; onChange: (o: Onglet) => void }) {
  return (
    <Onglets
      style={styles.onglets}
      etiquette={t("recuperer.titre")}
      onglets={[
        { valeur: "commencer", libelle: t("recuperer.commencer") },
        { valeur: "fait", libelle: t("recuperer.dejaFait") },
      ]}
      valeur={onglet}
      onChange={onChange}
    />
  );
}

/** La sieste en tête de la feuille : tuile rose, la raison, la durée conseillée. */
function TuileSieste({ min, texte, onPress }: { min: number; texte: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("recuperer.dureeProposee", { nom: typeRecupTexte("sieste"), n: min })}
      onPress={onPress}
      style={({ pressed }) => [styles.reco, { backgroundColor: pressed ? couleurs.s3 : m.voile }]}
    >
      <VignetteRecup type="sieste" taille={48} plein />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte style={styles.recoTitre}>{typeRecupTexte("sieste")}</Texte>
        <Texte variante="meta" couleur="t2" style={styles.recoSous}>
          {texte}
        </Texte>
      </View>
      <Texte style={[styles.recoDuree, { color: m.fort }]}>{minTexte(min)}</Texte>
    </Pressable>
  );
}

function CaseActivite({ type, duree, largeur, onPress }: { type: TypeRecup; duree: number; largeur: number; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("recuperer.dureeProposee", { nom: typeRecupTexte(type), n: duree })}
      onPress={onPress}
      style={({ pressed }) => [styles.case, { width: largeur, backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe, borderColor: couleurs.line }]}
    >
      <VignetteRecup type={type} taille={52} />
      <Texte numberOfLines={1} style={styles.caseNom}>
        {typeRecupTexte(type)}
      </Texte>
      <Texte variante="meta" couleur="t3" style={styles.caseDuree}>
        {minTexte(duree)}
      </Texte>
    </Pressable>
  );
}

/** Une ligne de réglage de la feuille (le réveil, le rappel, quand). */
function LigneReglage({ icone, titre, sous, valeur, onPress, libelle }: { icone?: "cloche" | "reveil"; titre: string; sous?: string; valeur?: string; onPress: () => void; libelle: string }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={libelle} onPress={onPress} style={({ pressed }) => [styles.reglage, pressed && { backgroundColor: couleurs.s3 }]}>
      {icone ? (
        <View style={[styles.tuileIc, { backgroundColor: m.voile }]}>
          <Icone nom={icone} couleur={m.fort} taille={20} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte style={[styles.reglageTitre, !icone && { color: couleurs.t2 }]}>{titre}</Texte>
        {sous ? (
          <Texte variante="meta" couleur="t2" style={{ marginTop: 2 }}>
            {sous}
          </Texte>
        ) : null}
      </View>
      {valeur ? <Texte style={styles.reglageValeur}>{valeur}</Texte> : null}
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

function EtapeSieste({
  reco, dette, maintenant, reglages, onAlerte, onRappel, onDemarrer,
}: { reco: number; dette: number | null; maintenant: number; reglages: ReglagesRecup | null; onAlerte: () => void; onRappel: () => void; onDemarrer: (min: number | null) => void }) {
  const { couleurs } = useTheme();
  const [min, setMin] = useState<number | null>(reco);
  useEffect(() => setMin(reco), [reco]);
  const alerte = t(`recuperer.alerte.${reglages?.alerte ?? "les-deux"}`);
  const reveil = min != null ? maintenant + alarmeSieste(min)! * MIN : null;
  const opts: { n: number | null; titre: string; sous: string }[] = [
    { n: RECUPERER.sieste.eclair, titre: t("recuperer.sieste.eclair"), sous: t("recuperer.sieste.eclairSous") },
    { n: null, titre: t("recuperer.sieste.libreTitre"), sous: t("recuperer.sieste.libreSous") },
  ];
  return (
    <>
      <Texte variante="titre">{typeRecupTexte("sieste")}</Texte>
      <Texte variante="corps" couleur="t2" style={styles.sousH}>
        {dette ? t("recuperer.sieste.sous", { heure: heure(maintenant), dette: heuresMinutes(arrondiDette(dette)) }) : t("recuperer.sieste.sousSeul", { heure: heure(maintenant) })}
      </Texte>
      <View accessibilityRole="radiogroup" style={styles.choixListe}>
        {opts.map((o) => (
          <Choix
            key={String(o.n)}
            choisi={min === o.n}
            onPress={() => setMin(o.n)}
            libelle={`${o.n != null ? minTexte(o.n) : t("recuperer.sieste.libre")}, ${o.titre}`}
            gauche={<GrandMin n={o.n} libre={t("recuperer.sieste.libre")} />}
            titre={o.titre}
            etiquette={o.n === reco ? t("recuperer.sieste.conseillee") : undefined}
            sous={o.sous}
          />
        ))}
      </View>
      <View style={[styles.reglages, { borderColor: couleurs.line }]}>
        <LigneReglage
          icone="cloche"
          titre={reveil != null ? t("recuperer.sieste.reveil", { heure: heure(reveil) }) : t("recuperer.sieste.sansAlarme")}
          sous={reveil != null ? t("recuperer.sieste.reveilSous", { alerte }) : t("recuperer.sieste.sansAlarmeSous")}
          libelle={reveil != null ? `${t("recuperer.sieste.reveil", { heure: heure(reveil) })}, ${alerte}` : t("recuperer.sieste.sansAlarme")}
          onPress={onAlerte}
        />
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: couleurs.line }} />
        <LigneReglage
          icone="reveil"
          titre={t("recuperer.sieste.rappel")}
          sous={t("recuperer.sieste.rappelSous", { heure: hhmm(reglages?.heureRappel ?? RECUPERER.rappel.heure) })}
          valeur={reglages?.rappel ? t("recuperer.oui") : t("recuperer.non")}
          libelle={`${t("recuperer.sieste.rappel")}, ${reglages?.rappel ? t("recuperer.oui") : t("recuperer.non")}`}
          onPress={onRappel}
        />
      </View>
      <BoutonPrincipal libelle={t("recuperer.sieste.demarrer")} icone="lune" onPress={() => onDemarrer(min)} style={styles.bouton} />
    </>
  );
}

function EtapeActivite({ type, maintenant, reglages, onAlerte, onDemarrer }: { type: TypeRecup; maintenant: number; reglages: ReglagesRecup | null; onAlerte: () => void; onDemarrer: (min: number | null) => void }) {
  const { couleurs } = useTheme();
  const a = activite(type);
  const [min, setMin] = useState<number | null>(a.duree);
  useEffect(() => setMin(a.duree), [a.duree]);
  const alerte = t(`recuperer.alerte.${reglages?.alerte ?? "les-deux"}`);
  const fin = min != null ? maintenant + min * MIN : null;
  return (
    <>
      <Texte variante="titre">{typeRecupTexte(type)}</Texte>
      <Texte variante="meta" couleur="t2" style={styles.libCh}>
        {t("recuperer.activite.duree")}
      </Texte>
      <View accessibilityRole="radiogroup" style={styles.durees}>
        {[...a.durees.map((n) => n as number | null), null].map((n) => (
          <Choix key={String(n)} centre radio={false} choisi={min === n} onPress={() => setMin(n)} libelle={n != null ? minTexte(n) : t("recuperer.activite.libre")} style={{ flex: 1 }} gauche={<Texte style={[styles.dureeTexte, min === n && { fontFamily: police.semibold }]}>{n != null ? minTexte(n) : t("recuperer.activite.libre")}</Texte>} />
        ))}
      </View>
      <View style={[styles.reglages, { borderColor: couleurs.line }]}>
        <LigneReglage
          icone="cloche"
          titre={fin != null ? t("recuperer.activite.fin", { heure: heure(fin) }) : t("recuperer.activite.libre")}
          sous={fin != null ? t("recuperer.activite.finSous", { alerte }) : t("recuperer.activite.libreSous")}
          libelle={fin != null ? `${t("recuperer.activite.fin", { heure: heure(fin) })}, ${alerte}` : t("recuperer.activite.libre")}
          onPress={onAlerte}
        />
      </View>
      <BoutonPrincipal libelle={t("recuperer.activite.demarrer")} icone="play" onPress={() => onDemarrer(min)} style={styles.bouton} />
    </>
  );
}

/** « C'est déjà fait » (écran 7) : pré-rempli comme la dernière session du même type. */
function EtapeApresCoup({ type, maintenant, onCommencer, onEnregistre }: { type: TypeRecup; maintenant: number; onCommencer: () => void; onEnregistre: () => void }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const a = activite(type);
  const [debut, setDebut] = useState<number | null>(null);
  const [min, setMin] = useState<number>(a.duree);
  const [autre, setAutre] = useState(false);
  const [dernier, setDernier] = useState(false);
  const [kcal, setKcal] = useState<number | null>(null);
  const [heureOuverte, setHeureOuverte] = useState(false);
  useEffect(() => {
    let vivant = true;
    derniereDuType(db, type)
      .then((d) => {
        if (!vivant) return;
        const jour = new Date(maintenant);
        const minuit = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate()).getTime();
        const duree = d ? Math.max(1, Math.round((d.fin - d.debut) / MIN)) : a.duree;
        // à l'heure de la dernière fois, aujourd'hui ; si elle n'est pas encore passée, tout juste fini
        const h = d ? minuit + ((d.debut - new Date(new Date(d.debut).setHours(0, 0, 0, 0)).getTime()) % 86_400_000) : maintenant - duree * MIN;
        setDebut(h + duree * MIN <= maintenant ? h : maintenant - duree * MIN);
        setMin(duree);
        setAutre(!a.durees.includes(duree));
        setDernier(!!d);
      })
      .catch(() => vivant && setDebut(maintenant - a.duree * MIN));
    return () => {
      vivant = false;
    };
  }, [db, type, maintenant, a.duree, a.durees]);
  useEffect(() => {
    if (debut == null) return;
    let vivant = true;
    kcalRecup(db, type, min, debut).then((k) => vivant && setKcal(k), () => vivant && setKcal(null));
    return () => {
      vivant = false;
    };
  }, [db, type, min, debut]);
  const minuit = new Date(new Date(maintenant).setHours(0, 0, 0, 0)).getTime();
  const quand = debut == null ? "" : debut >= minuit ? t("recuperer.apresCoup.aujourdhui", { heure: heure(debut) }) : t("recuperer.apresCoup.hier", { heure: heure(debut) });
  const pied = [dernier ? t(`recuperer.dernier.${type}` as "recuperer.dernier.sauna") : null, kcal != null ? t("recuperer.apresCoup.kcal", { n: kcal }) : null].filter(Boolean).join(" ");
  return (
    <>
      <Texte variante="titre">{typeRecupTexte(type)}</Texte>
      <OngletsRecuperer onglet="fait" onChange={(v) => v === "commencer" && onCommencer()} />
      <View style={[styles.reglages, { borderColor: couleurs.line, marginTop: 14 }]}>
        <LigneReglage titre={t("recuperer.apresCoup.quand")} valeur={quand} libelle={t("recuperer.apresCoup.quandLu", { quand })} onPress={() => setHeureOuverte(true)} />
      </View>
      <Texte variante="meta" couleur="t2" style={styles.libCh}>
        {t("recuperer.apresCoup.duree")}
      </Texte>
      <View accessibilityRole="radiogroup" style={styles.durees}>
        {a.durees.map((n) => (
          <Choix key={n} centre radio={false} choisi={!autre && min === n} onPress={() => (setAutre(false), setMin(n))} libelle={minTexte(n)} style={{ flex: 1 }} gauche={<Texte style={[styles.dureeTexte, !autre && min === n && { fontFamily: police.semibold }]}>{minTexte(n)}</Texte>} />
        ))}
        <Choix centre radio={false} choisi={autre} onPress={() => setAutre(true)} libelle={t("recuperer.apresCoup.autre")} style={{ flex: 1 }} gauche={<Texte style={[styles.dureeTexte, autre && { fontFamily: police.semibold }]}>{autre ? minTexte(min) : t("recuperer.apresCoup.autre")}</Texte>} />
      </View>
      {autre ? (
        <View style={styles.pas}>
          <BoutonPas sens={-1} onPress={() => setMin((x) => Math.max(1, x - 5))} />
          <Texte style={styles.pasValeur}>{minTexte(min)}</Texte>
          <BoutonPas sens={1} onPress={() => setMin((x) => Math.min(600, x + 5))} />
        </View>
      ) : null}
      {pied ? (
        <Texte variante="meta" couleur="t2" style={styles.pied}>
          {pied}
        </Texte>
      ) : null}
      <BoutonPrincipal
        libelle={t("recuperer.apresCoup.enregistrer")}
        desactive={debut == null}
        onPress={() => {
          if (debut == null) return;
          enregistrerApresCoup(db, { type, debut, minutes: min }).then(onEnregistre, signalerErreur());
        }}
        style={styles.bouton}
      />
      <FeuilleHeure
        visible={heureOuverte}
        valeur={debut != null ? heure(debut) : "12:00"}
        onFermer={() => setHeureOuverte(false)}
        onValider={(h) => {
          setHeureOuverte(false);
          const [hh, mm] = h.split(":").map(Number) as [number, number];
          const d = new Date(maintenant);
          let x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime();
          // une heure encore à venir aujourd'hui : c'était hier
          if (x > maintenant) x -= 86_400_000;
          setDebut(x);
        }}
      />
    </>
  );
}

/** −5 ou +5 min (« Autre » de la saisie après coup). */
function BoutonPas({ sens, onPress }: { sens: 1 | -1; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${sens > 0 ? "+" : "−"}${minTexte(5)}`} onPress={onPress} style={({ pressed }) => [styles.pasBouton, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}>
      <Icone nom={sens > 0 ? ICONE_PLUS : ICONE_MOINS} couleur={couleurs.t1} taille={20} />
    </Pressable>
  );
}

function EtapeAlerte({ valeur, onChoisir }: { valeur: AlerteSieste; onChoisir: (a: AlerteSieste) => void }) {
  return (
    <>
      <Texte variante="titre">{t("recuperer.alerteTitre")}</Texte>
      <View accessibilityRole="radiogroup" style={styles.choixListe}>
        {MODES_ALERTE_SIESTE.map((a) => (
          <Choix key={a} choisi={valeur === a} onPress={() => onChoisir(a)} libelle={t(`recuperer.alerteChoix.${a}`)} titre={t(`recuperer.alerteChoix.${a}`)} />
        ))}
      </View>
    </>
  );
}

function EtapeRappel({ actif, heure: h, onChoisir }: { actif: boolean; heure: number; onChoisir: (actif: boolean, heure: number | null) => void }) {
  return (
    <>
      <Texte variante="titre">{t("recuperer.rappelTitre")}</Texte>
      <Texte variante="corps" couleur="t2" style={styles.sousH}>
        {t("recuperer.rappelTexte")}
      </Texte>
      <View accessibilityRole="radiogroup" style={styles.choixListe}>
        <Choix choisi={!actif} onPress={() => onChoisir(false, null)} libelle={t("recuperer.rappelNon")} titre={t("recuperer.rappelNon")} />
        {HEURES_RAPPEL.map((x) => (
          <Choix key={x} choisi={actif && h === x} onPress={() => onChoisir(true, x)} libelle={t("recuperer.rappelVers", { heure: hhmm(x) })} titre={t("recuperer.rappelVers", { heure: hhmm(x) })} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  corps: { paddingTop: 4, paddingBottom: 8 },
  onglets: { marginTop: 16 },
  sousH: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  reco: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
  recoTitre: { fontFamily: police.semibold, fontSize: 15 },
  recoSous: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  recoDuree: { fontFamily: police.semibold, fontSize: 13 },
  grille: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  case: { alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, minHeight: 112, borderWidth: StyleSheet.hairlineWidth },
  caseNom: { fontFamily: police.medium, fontSize: 13, lineHeight: 16, textAlign: "center" },
  caseDuree: { fontSize: 11.5, marginTop: -3 },
  choixListe: { gap: 8, marginTop: 16 },
  reglages: { marginTop: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  reglage: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 14 },
  tuileIc: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  reglageTitre: { fontFamily: police.medium, fontSize: 14 },
  reglageValeur: { fontFamily: police.semibold, fontSize: 15 },
  bouton: { marginTop: 16 },
  libCh: { fontFamily: police.medium, marginTop: 16 },
  durees: { flexDirection: "row", gap: 8, marginTop: 10 },
  dureeTexte: { fontFamily: police.medium, fontSize: 15 },
  pied: { fontSize: 12.5, marginTop: 12, lineHeight: 19 },
  pas: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 12 },
  pasBouton: { width: 48, height: 48, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  pasValeur: { fontFamily: police.semibold, fontSize: 18, minWidth: 80, textAlign: "center" },
});
