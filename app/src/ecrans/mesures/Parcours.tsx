// « Prends tes mensurations » (planche mensurations, validée le 30/10 : « le parcours de prise de mesure est
// top ») : une page plein écran. En haut, la frise des tours (Frise.tsx) ; le personnage cadré sur la zone, qui s'allume, et
// le mètre posé (FigureTour.tsx) ; la consigne (côté droit pour bras, cuisse et mollet : M11) ; la valeur proposée, dite
// (M3 : la dernière, sinon un repère selon le sexe et la taille ; M4 : un repère n'est jamais enregistré sans que la molette
// ait bougé) ; une seule molette au pas de 0,5 ; Passer / Suivant, Annuler / Valider en correction. Au bout, le
// récapitulatif (M5) : le personnage et une étiquette par tour (valeur, écart depuis la dernière prise, flèche M12) ; toucher
// une étiquette corrige le tour. Rien n'est écrit avant « Enregistrer » (M2) ; ✕ en route propose d'enregistrer ce qui est
// pris. Fold (colonne de 640) : le visuel à gauche, la consigne et la molette à droite ; le récapitulatif avec la liste.
// Étape Poitrine (planche articulations, A3, D10) : pour une femme ou « Non précisé », une ligne discrète de 44 dp sous l'aide
// ouvre la feuille « Tour de dos et bonnet » ; pas d'étape en plus. Elle s'enregistre par sa feuille, à part des tours.
// Bilan de forme d'un coach (planche coach-v2, A3, D24) : `tours` ouvre le parcours sur les seuls tours demandés, « pour
// Nadia » dans la tête ; au bout, « Revenir au bilan » enregistre ce qui est pris et revient, sans récapitulatif.
// Personnage (planche mensurations-femme, D4, D7) : celui du sexe du profil ; « Non précisé » : un choix « Femme · Homme »
// dans la carte (en haut à droite, en bas sur le Fold), l'homme d'abord, gardé sur ce téléphone pour la fois suivante sans
// toucher au profil. Consignes du cou et de la poitrine propres à la femme et à « Non précisé ».
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import Animated, { withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, G, Path } from "react-native-svg";
import {
  ajouterMensurations, ecrirePersonnageChoisi, ecrireSoutien, effacerSoutien, lirePersonnageChoisi, lireSexe, lireSoutien, tailleProfil, type Sexe,
} from "../../db/api";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { AuraFond } from "../../ui/AuraFond";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BoutonIcone } from "../../ui/Cadre";
import { Icone } from "../../ui/Icone";
import { useLargeurContenu } from "../../ui/CadreContenu";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe as GroupeFeuille, Option } from "../../ui/Feuille";
import { signalerSaisie } from "../../precision/service";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { revenir } from "../../ui/revenir";
import { RoueDuree } from "../../ui/RoueDuree";
import { Texte } from "../../ui/Texte";
import { fixe } from "../composition-vue";
import { useApp, useCharge } from "../contexte";
import { heure, jourMois, jourSemaineMois } from "../format";
import { soutienPropose, type Soutien } from "./bonnet-calc";
import { lireTours, type Tours } from "./corps-donnees";
import { FeuilleBonnet, libelleSoutien } from "./FeuilleBonnet";
import { AvecValeur as AideValeur, MARQUE } from "./FeuilleTour";
import { FigureEntiere, FigureEtape } from "./FigureTour";
import { Frise } from "./Frise";
import { Groupe, LigneMesure, Lignes, styles as gabarit, Variation } from "./gabarit";
import {
  A_GAUCHE, anneauDeFace, cadrageEntier, cleConsigne, COTE_DROIT, departSur, enCorrection, ORDRE_TOURS, parcours, personnage, prochaine, toursPasses, toursPris,
  valeurProposee, valeursRoue, ZONES, type ActionParcours, type EtatParcours, type Perso, type Tour,
} from "./tours-calc";

const nom = (x: Tour) => t(`nutrition.mesure.${x}`);
const cm = (v: number) => `${fixe(v, 1)} cm`;
const LARGE = 560;
const ETIQUETTE = { l: 104, h: 44, ecart: 6, bord: 8 } as const;

type Donnees = { tours: Tours; sexe: Sexe | null; taille: number | null; soutien: Soutien | null; choix: Perso | null };

/** La consigne entre du côté du sens de marche (de la gauche en arrière), 200 ms, courbe sortie ; mouvement réduit : fondu. */
function entree(sens: number, reduit: boolean) {
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateX: reduit ? 0 : 16 * sens }] },
      animations: {
        opacity: withTiming(1, { duration: reduit ? 150 : 200, easing: courbes.sortie }),
        transform: [{ translateX: withTiming(0, { duration: 200, easing: courbes.sortie }) }],
      },
    };
  };
}

export function Parcours({ tours, deja, pour }: { tours?: readonly string[]; deja?: Partial<Record<string, number>>; pour?: string } = {}) {
  useLangue();
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const large = useLargeurContenu() >= LARGE;
  const [x, recharger] = useCharge(async (base): Promise<Donnees> => {
    const [tours, sexe, taille, soutien, choix] = await Promise.all([lireTours(base), lireSexe(base), tailleProfil(base), lireSoutien(base), lirePersonnageChoisi(base)]);
    return { tours, sexe, taille: taille?.valeur ?? null, soutien, choix };
  });
  // n : compte les gestes, pour remonter la molette sur la valeur de l'étape à chaque changement
  const [{ e, n }, envoyer] = useReducer((s: { e: EtatParcours; n: number }, a: ActionParcours) => ({ e: parcours(s.e, a), n: s.n + 1 }), null, () => ({ e: departSur(tours, deja), n: 0 }));
  const bilan = !!tours?.length;
  const [roue, setRoue] = useState<{ n: number; v: number } | null>(null);
  const [fermer, setFermer] = useState(false);
  const [bonnet, setBonnet] = useState(false);
  const precedent = useRef(e.i);
  const sens = e.i >= precedent.current ? 1 : -1;
  precedent.current = e.i;
  const [visuel, setVisuel] = useState<{ l: number; h: number } | null>(null);
  const [maintenant] = useState(() => Date.now());
  // D4 : le choix de la carte, gardé sur ce téléphone (le profil n'est pas touché)
  const [choix, setChoix] = useState<Perso | null>(null);
  const perso = personnage(x?.sexe ?? null, choix ?? x?.choix ?? null);
  const choisir = (q: Perso) => {
    setChoix(q);
    void ecrirePersonnageChoisi(db, q).catch(signalerErreur());
  };

  const tour = e.ordre[e.i]!;
  const derniere = (y: Tour) => x?.tours[y]?.[0] ?? null;
  const proposee = (y: Tour) => valeurProposee(y, derniere(y)?.valeur ?? null, x?.sexe ?? null, x?.taille ?? null);
  const p = proposee(tour);
  const depart = e.valeurs[tour] ?? p.v;
  const touchee = roue?.n === n;
  const courante = touchee ? roue!.v : depart;
  const bloque = p.source === "repere" && e.valeurs[tour] == null && !touchee;
  const pris = toursPris(e);

  const demanderFermer = () => (pris.length ? setFermer(true) : revenir());
  const enregistrer = () => {
    setFermer(false);
    if (!pris.length) return revenir();
    // la série de tours écrite : la précision se relit (bandeau « +4 % de précision », branche précision)
    ajouterMensurations(db, pris, Date.now()).then(revenir).then(signalerSaisie).catch(signalerErreur());
  };
  // Bilan : pas de récapitulatif, le bout du parcours enregistre et revient au bilan.
  const fini = bilan && e.recap;
  useEffect(() => {
    if (fini) enregistrer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fini]);
  // Retour d'Android : comme ✕ ; en correction, Annuler ; sur le récapitulatif, retour à la dernière étape
  useFocusEffect(
    useCallback(() => {
      const s = BackHandler.addEventListener("hardwareBackPress", () => {
        if (fermer) return setFermer(false), true;
        if (bonnet) return setBonnet(false), true;
        if (e.recap) return envoyer({ type: "quitterRecap" }), true;
        if (enCorrection(e)) return envoyer({ type: "annuler" }), true;
        demanderFermer();
        return true;
      });
      return () => s.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [e, fermer, bonnet, pris.length]),
  );

  const avecValeur = (texte: string, valeur = "") => <AideValeur texte={texte} valeur={valeur} style={styles.aide} />;
  const aide = (): ReactNode => {
    if (e.depuisRecap) return avecValeur(t("mensurations.corrigeRecap", { tour: t(`mensurations.le.${tour}`) }));
    if (e.reprise != null)
      return avecValeur(t("mensurations.corrige", { tour: t(`mensurations.le.${tour}`), etape: t(`mensurations.au.${e.ordre[e.reprise]!}`) }));
    if (e.valeurs[tour] != null) return avecValeur(t("mensurations.pris", { v: MARQUE }), cm(e.valeurs[tour]!));
    if (p.source === "derniere") return avecValeur(t("mensurations.derniereFois", { v: MARQUE, date: jourSemaineMois(derniere(tour)!.date) }), cm(p.v));
    return avecValeur(t(`mensurations.repere.${x?.sexe ?? "x"}`, { taille: p.taille, v: MARQUE }), cm(p.v));
  };

  // D10 : ligne discrète, seulement pour une femme ou « Non précisé », jamais obligatoire
  const ligneBonnet =
    tour === "poitrine" && x && soutienPropose(x.sexe) && !enCorrection(e) ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={x.soutien ? `${t("bonnet.bonnet")}, ${libelleSoutien(x.soutien)}, ${t("bonnet.modifier")}` : `${t("bonnet.preciser")}, ${t("bonnet.facultatifCourt")}`}
        onPress={() => setBonnet(true)}
        style={({ pressed }) => [styles.ligneBonnet, { borderColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s3 }]}
      >
        {x.soutien ? (
          <>
            <Texte variante="corps">{t("bonnet.bonnet")}</Texte>
            <Texte variante="corps" style={{ fontFamily: police.medium }}>
              {libelleSoutien(x.soutien)}
            </Texte>
            <Texte variante="corps" couleur="t2" style={styles.ligneBonnetAction}>
              {t("bonnet.modifier")}
            </Texte>
          </>
        ) : (
          <>
            <Texte variante="corps">{t("bonnet.preciser")}</Texte>
            <Texte variante="meta" couleur="t3">
              {t("bonnet.facultatifCourt")}
            </Texte>
            <View style={styles.ligneBonnetAction}>
              <Icone nom="right" couleur={couleurs.t2} taille={16} />
            </View>
          </>
        )}
      </Pressable>
    ) : null;
  const feuilleBonnet = (
    <FeuilleBonnet
      visible={bonnet}
      valeur={x?.soutien ?? null}
      onFermer={() => setBonnet(false)}
      onEnregistrer={(s) => {
        setBonnet(false);
        void ecrireSoutien(db, s).then(recharger).catch(signalerErreur());
      }}
      onEffacer={() => {
        setBonnet(false);
        void effacerSoutien(db).then(recharger).catch(signalerErreur("supprimer"));
      }}
    />
  );

  const tete = (
    <View style={gabarit.tete}>
      {e.recap ? (
        <BoutonIcone nom="back" libelle={t("ui.retour")} onPress={() => envoyer({ type: "quitterRecap" })} />
      ) : (
        <BoutonIcone nom="close" libelle={t("ui.fermer")} onPress={demanderFermer} />
      )}
      <Texte variante="titre" accessibilityRole="header" numberOfLines={1} style={gabarit.titre}>
        {e.recap && !bilan ? t("mensurations.recap") : t("mensurations.titre")}
      </Texte>
      {bilan && pour ? (
        <Texte variante="corps" couleur="t2" numberOfLines={1} style={styles.pour}>
          {t("mensurations.pour", { prenom: pour })}
        </Texte>
      ) : null}
    </View>
  );

  const carteVisuel = (
    <View
      style={[styles.visuel, { backgroundColor: mode === "nuit" ? couleurs.s1 : couleurs.s3 }, large && styles.visuelLarge]}
      onLayout={(ev) => setVisuel({ l: ev.nativeEvent.layout.width, h: ev.nativeEvent.layout.height })}
    >
      {visuel ? <FigureEtape perso={perso} tour={tour} faits={ORDRE_TOURS.filter((y) => e.valeurs[y] != null)} largeur={visuel.l} hauteur={visuel.h} anime /> : null}
      <Texte variante="meta" couleur="t2" style={styles.vue}>
        {t(`mensurations.vue.${ZONES[perso][tour].vue}`)}
      </Texte>
      {x && x.sexe == null ? <ChoixPerso perso={perso} large={large} onChoisir={choisir} /> : null}
    </View>
  );

  const consigne = (
    // la première consigne paraît avec la page ; seules les suivantes entrent (une animation par geste)
    <Animated.View key={`c${e.i}`} entering={n > 0 ? entree(sens, reduit) : undefined} style={styles.consigne}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Texte variante="titre" accessibilityRole="header">
          {nom(tour)}
        </Texte>
        {COTE_DROIT.has(tour) ? (
          <Texte variante="meta" couleur="t3">
            {t("mensurations.coteDroit")}
          </Texte>
        ) : null}
      </View>
      <Texte variante="libelle" couleur="t2" style={{ marginTop: 4, lineHeight: 20 }}>
        {t(cleConsigne(tour, x?.sexe ?? null))}
      </Texte>
    </Animated.View>
  );

  // Fold : la molette monte sur l'aura ; ses fondus étant d'une couleur unie, elle est posée dans une carte (s1)
  const molette = (
    <View style={[styles.roue, large && { backgroundColor: couleurs.s1, borderRadius: rayon.l, paddingVertical: espace.xs }]}>
      <RoueDuree
        key={`r${n}`}
        libelle={nom(tour)}
        valeur={depart}
        valeurs={valeursRoue(tour)}
        onChange={(v) => setRoue({ n, v })}
        traits={false}
        decoupe={(v) => ({ attenue: "", plein: fixe(v, 1) })}
        lue={cm}
        unite="cm"
        fond={large ? couleurs.s1 : couleurs.fondSante}
        bande={large ? couleurs.s2 : undefined}
      />
    </View>
  );

  const pied = (
    <View style={styles.pied}>
      {enCorrection(e) ? (
        <>
          <BoutonTonal libelle={t("ui.annuler")} onPress={() => envoyer({ type: "annuler" })} style={{ flex: 1 }} />
          <View style={{ flex: 1 }}>
            <BoutonPrincipal libelle={t("mensurations.valider")} onPress={() => envoyer({ type: "valider", v: courante })} />
          </View>
        </>
      ) : (
        <>
          <BoutonTonal libelle={t("nutrition.passer")} onPress={() => envoyer({ type: "passer" })} style={{ flex: 1 }} />
          <View style={{ flex: 1 }}>
            <BoutonPrincipal
              libelle={
                bilan
                  ? prochaine(e, e.i) == null ? t("mensurations.revenirBilan") : t("mensurations.suivant")
                  : e.i === ORDRE_TOURS.length - 1 ? t("mensurations.terminer") : t("mensurations.suivant")
              }
              desactive={bloque}
              onPress={() => envoyer({ type: "suivant", v: courante })}
            />
          </View>
        </>
      )}
    </View>
  );

  const confirmation = (
    <Feuille visible={fermer} onFermer={() => setFermer(false)} titre={tp("mensurations.garder", pris.length)}>
      <GroupeFeuille>
        <Option premier icone="check" libelle={t("mesuresCorps.enregistrer")} onPress={enregistrer} />
        <Option danger icone="trash" libelle={t("mensurations.abandonner")} aide={t("mensurations.abandonnerAide")} onPress={() => (setFermer(false), revenir())} />
      </GroupeFeuille>
    </Feuille>
  );

  // les dernières mesures et le profil lus, la molette part de la bonne valeur (sinon elle garderait le repère)
  if (!x)
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <AuraFond partie="sante" fixe />
        {tete}
      </SafeAreaView>
    );

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
      <AuraFond partie="sante" fixe />
      {tete}
      {fini ? null : e.recap ? (
        <Recap e={e} perso={perso} tours={x.tours} large={large} maintenant={maintenant} onCorriger={(k) => envoyer({ type: "corriger", k })} onEnregistrer={enregistrer} />
      ) : (
        <>
          <Frise etat={e} courante={courante} onEtape={(k) => envoyer({ type: "aller", k })} />
          {large ? (
            <View style={{ flex: 1, flexDirection: "row" }}>
              <View style={styles.gauche}>{carteVisuel}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {consigne}
                {aide()}
                {ligneBonnet}
                {molette}
                <View style={{ flex: 1 }} />
                {pied}
              </View>
            </View>
          ) : (
            <>
              {carteVisuel}
              {consigne}
              {aide()}
              {ligneBonnet}
              {molette}
              {pied}
            </>
          )}
        </>
      )}
      {confirmation}
      {feuilleBonnet}
    </SafeAreaView>
  );
}

/**
 * « Femme · Homme » (D4), pour « Non précisé » : deux segments de 44 dp dans une pilule de verre, en haut à droite de la
 * carte ; en bas sur le Fold, où la carte est étroite et la tête monte haut.
 */
function ChoixPerso({ perso, large, onChoisir }: { perso: Perso; large: boolean; onChoisir: (p: Perso) => void }) {
  const { couleurs } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("mensurations.personnage")}
      style={[styles.choix, large ? { bottom: 6 } : { top: 6 }, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }]}
    >
      {(["f", "h"] as const).map((p) => {
        const on = p === perso;
        return (
          <Pressable
            key={p}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChoisir(p)}
            style={({ pressed }) => [styles.choixSegment, (on || pressed) && { backgroundColor: couleurs.s3 }]}
          >
            <Texte variante="corps" couleur={on ? "t1" : "t2"} style={on ? { fontFamily: police.medium } : undefined}>
              {t(p === "f" ? "mensurations.femme" : "mensurations.homme")}
            </Texte>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Récapitulatif (M5) : le personnage, ses tours allumés et une étiquette par tour ; sur le Fold, la liste à côté. */
function Recap({
  e,
  perso,
  tours,
  large,
  maintenant,
  onCorriger,
  onEnregistrer,
}: {
  e: EtatParcours;
  perso: Perso;
  tours: Tours;
  large: boolean;
  maintenant: number;
  onCorriger: (k: number) => void;
  onEnregistrer: () => void;
}) {
  const { couleurs, mode } = useTheme();
  const [carte, setCarte] = useState<{ l: number; h: number } | null>(null);
  const faits = ORDRE_TOURS.filter((y) => e.valeurs[y] != null);
  const passes = toursPasses(e);
  const avant = (y: Tour) => tours[y]?.[0] ?? null;
  const dates = ORDRE_TOURS.map((y) => avant(y)?.date ?? 0);
  const ref = Math.max(...dates);
  const resume = (
    <Texte variante="corps" couleur="t2" style={[styles.resume, large && { marginHorizontal: 0 }]}>
      <Texte variante="corps" style={{ fontFamily: police.medium }}>
        {tp("mensurations.recapPris", faits.length)}
      </Texte>
      {passes.length ? `, ${tp("mensurations.recapPasses", passes.length, { liste: passes.map((y) => t(`mensurations.le.${y}`)).join(", ") })}` : ""}
      {`. ${ref ? t("mensurations.recapEcarts", { date: jourMois(ref) }) : t("mensurations.recapToucher")}`}
    </Texte>
  );
  const fond = mode === "nuit" ? couleurs.s1 : couleurs.s3;

  // étiquettes : de haut en bas de chaque côté, écartées pour ne pas se toucher
  const etiquettes = (l: number, h: number) => {
    const c = cadrageEntier(l, h, perso);
    const placer = (cote: "g" | "d") => {
      let bas = -Infinity;
      return ORDRE_TOURS.filter((y) => A_GAUCHE.has(y) === (cote === "g")).map((y) => {
        const a = anneauDeFace(perso, y);
        const top = Math.min(h - ETIQUETTE.h - 4, Math.max(c.ty + a.y * c.s - ETIQUETTE.h / 2, bas + ETIQUETTE.ecart));
        bas = top + ETIQUETTE.h;
        return { y, a, top, cote };
      });
    };
    return [...placer("g"), ...placer("d")].map(({ y, a, top, cote }) => {
      const xr = c.tx + (cote === "g" ? a.x0 : a.x1) * c.s, yr = c.ty + a.y * c.s;
      const xe = cote === "g" ? ETIQUETTE.bord + ETIQUETTE.l : l - ETIQUETTE.bord - ETIQUETTE.l;
      return { y, top, cote, lien: `M${xe} ${top + ETIQUETTE.h / 2} L${(xe + xr) / 2} ${top + ETIQUETTE.h / 2} L${xr} ${yr}`, xr, yr };
    });
  };

  const places = carte && !large ? etiquettes(carte.l, carte.h) : [];
  const corps = carte ? (
    <>
      <FigureEntiere perso={perso} faits={faits} largeur={carte.l} hauteur={carte.h} />
      {large ? null : (
        <>
          <Svg width={carte.l} height={carte.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            {places.map(({ y, lien, xr, yr }) => (
              <G key={y}>
                <Path d={lien} stroke={couleurs.line2} strokeWidth={1} fill="none" />
                <Circle cx={xr} cy={yr} r={2} fill={couleurs.partieSante} />
              </G>
            ))}
          </Svg>
          {places.map(({ y, top, cote }) => {
            const v = e.valeurs[y];
            const k = ORDRE_TOURS.indexOf(y);
            const a = avant(y);
            return (
              <Pressable
                key={y}
                accessibilityRole="button"
                accessibilityLabel={t("mensurations.corriger", { tour: nom(y), v: v != null ? cm(v) : t("mensurations.passe") })}
                onPress={() => onCorriger(k)}
                style={({ pressed }) => [
                  styles.etiquette,
                  { top, backgroundColor: pressed ? couleurs.s3 : couleurs.verreCarte, borderColor: couleurs.verreFilet },
                  cote === "g" ? { left: ETIQUETTE.bord, alignItems: "flex-start" } : { right: ETIQUETTE.bord, alignItems: "flex-end" },
                ]}
              >
                <Texte numberOfLines={1} style={[styles.etiquetteNom, { color: couleurs.t2 }]}>
                  {y === "tour_taille" ? t("mensurations.court.tour_taille") : nom(y)}
                </Texte>
                {v != null ? (
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                    <Texte style={styles.etiquetteValeur}>{fixe(v, 1)}</Texte>
                    {a ? <Variation d={v - a.valeur} /> : null}
                  </View>
                ) : (
                  <Texte variante="libelle" couleur="t3">
                    {t("mensurations.passe")}
                  </Texte>
                )}
              </Pressable>
            );
          })}
        </>
      )}
    </>
  ) : null;

  const carteCorps = (
    <View style={[styles.carte, { backgroundColor: fond }, large && { width: 300, marginHorizontal: 0 }]} onLayout={(ev) => setCarte({ l: ev.nativeEvent.layout.width, h: ev.nativeEvent.layout.height })}>
      {corps}
    </View>
  );

  return (
    <>
      <Texte variante="corps" couleur="t2" style={styles.dateRecap}>
        {`${jourSemaineMois(maintenant)}, ${heure(maintenant)}`}
      </Texte>
      {large ? (
        <View style={{ flex: 1, flexDirection: "row", gap: espace.l, marginHorizontal: espace.l, marginTop: 10 }}>
          {carteCorps}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Groupe style={{ marginHorizontal: 0, marginTop: 0 }}>
              <Lignes>
                {ORDRE_TOURS.map((y, k) => {
                  const v = e.valeurs[y];
                  const a = avant(y);
                  return (
                    <LigneMesure
                      key={y}
                      titre={nom(y)}
                      sous={v == null ? t("mensurations.passeToucher") : null}
                      valeur={v != null ? fixe(v, 1) : null}
                      unite={v != null ? "cm" : null}
                      sousValeur={v != null && a ? <Variation d={v - a.valeur} suite={t("mensurations.depuisLe", { date: jourMois(a.date) })} /> : undefined}
                      onPress={() => onCorriger(k)}
                    />
                  );
                })}
              </Lignes>
            </Groupe>
            {resume}
          </View>
        </View>
      ) : (
        <>
          {carteCorps}
          {resume}
        </>
      )}
      <View style={styles.pied}>
        <View style={{ flex: 1 }}>
          <BoutonPrincipal libelle={t("mesuresCorps.enregistrer")} onPress={onEnregistrer} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  visuel: { flex: 1, minHeight: 150, marginTop: 4, marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden" },
  visuelLarge: { marginHorizontal: 0, marginLeft: espace.l, marginRight: espace.l },
  gauche: { width: 300 + espace.l * 2, paddingBottom: espace.l },
  vue: { position: "absolute", left: 12, top: 10 },
  choix: { position: "absolute", right: 6, flexDirection: "row", gap: 2, padding: 3, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  choixSegment: { minWidth: 64, minHeight: 44, paddingHorizontal: 12, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  consigne: { marginTop: 14, marginHorizontal: espace.l },
  aide: { marginTop: 10, marginHorizontal: espace.l },
  ligneBonnet: {
    flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, marginTop: 10, marginHorizontal: espace.l, paddingLeft: 14, paddingRight: 8,
    borderRadius: rayon.l, borderWidth: 1,
  },
  ligneBonnetAction: { marginLeft: "auto", paddingHorizontal: 6 },
  roue: { marginTop: 6, marginHorizontal: espace.l },
  pied: { flexDirection: "row", gap: espace.s, paddingHorizontal: espace.l, paddingTop: espace.m, paddingBottom: espace.l },
  dateRecap: { marginHorizontal: espace.l },
  pour: { marginLeft: "auto", paddingRight: espace.l },
  carte: { flex: 1, minHeight: 360, marginTop: 10, marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden" },
  resume: { marginTop: 12, marginHorizontal: espace.l, lineHeight: 18 },
  etiquette: { position: "absolute", width: ETIQUETTE.l, minHeight: ETIQUETTE.h, paddingHorizontal: 10, paddingVertical: 5, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center" },
  etiquetteNom: { fontSize: 11, lineHeight: 14, fontFamily: police.semibold },
  etiquetteValeur: { fontSize: 16, lineHeight: 20, fontFamily: police.medium, fontVariant: ["tabular-nums"] },
});
