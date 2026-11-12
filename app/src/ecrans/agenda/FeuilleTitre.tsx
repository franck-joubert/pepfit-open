import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { basculerElement, deplacerElement, placerElement, titreEvenement, type ElementTitre, type TitreCompose } from "../../agenda/titre";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { courbe, duree } from "../../theme/mouvement";
import { espace } from "../../theme/typo";
import { Feuille, Groupe } from "../../ui/Feuille";
import { haptique } from "../../ui/haptique";
import { Icone } from "../../ui/Icone";
import { reduitMouvement } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { dureeCourte } from "../format";

// Feuille « Titre dans ton agenda » (03/11, deuxième version ; docs/CODE-AGENDA.md § 6) : l'aperçu en haut, puis une ligne
// par élément du titre (emoji du sport, sport, nom, durée) avec sa case, monter et descendre, et une poignée pour le glisser.
// Le nom ne se décoche pas. Rien n'est écrit pendant qu'on règle : le titre part à la fermeture (une seule synchro).
// Glisser : la ligne tenue suit le doigt, les voisines s'écartent en direct (200 ms, courbe sortie), elle se pose à sa place
// au lâcher ; monter et descendre font glisser les deux lignes échangées (220 ms, courbe déplacement). Réduire les animations :
// les voisines et les échanges sautent sans glissé, seule la ligne tenue suit le doigt.

const H = 56;
const sortie = Easing.bezier(...courbe.sortie);
const deplacement = Easing.bezier(...courbe.deplacement);

const LIBELLES: Record<ElementTitre, Parameters<typeof t>[0]> = {
  emoji: "agenda.ecrit.emoji",
  sport: "agenda.compo.sport",
  nom: "agenda.compo.nom",
  duree: "agenda.compo.duree",
};

/** Titre d'exemple (« 🏋️‍♂️ Musculation · Haut du corps · 45 min ») : une séance de musculation de 45 min. */
export const exempleTitre = (titre: TitreCompose) =>
  titreEvenement({ nom: t("agenda.exemple.nom"), sport: "cat:musculation", nomSport: t("agenda.exemple.sport"), duree: dureeCourte(45 * 60) }, titre);

export function FeuilleTitre({ visible, titre, onFermer }: { visible: boolean; titre: TitreCompose | undefined; onFermer: (t: TitreCompose) => void }) {
  const { couleurs } = useTheme();
  const [compo, setCompo] = useState(titre);
  // Pendant un glisser : le titre si la ligne était posée là (aperçu en direct).
  const [provisoire, setProvisoire] = useState<TitreCompose | null>(null);
  useEffect(() => {
    if (visible) setCompo(titre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const c = compo ?? titre;
  return (
    <Feuille visible={visible && !!c} onFermer={() => c && onFermer(c)} titre={t("agenda.ecrit.formatTitre")}>
      {c ? (
        <>
          <Texte variante="entete" couleur="t3" style={styles.libelleFeuille}>
            {t("agenda.compo.apercu")}
          </Texte>
          <Groupe>
            <View accessible accessibilityLiveRegion="polite" style={styles.apercu}>
              <Icone nom="cal" couleur={couleurs.t3} taille={18} />
              <Texte variante="saisie" numberOfLines={2} style={{ flex: 1, fontSize: 16 }}>
                {exempleTitre(provisoire ?? c)}
              </Texte>
            </View>
          </Groupe>
          <Groupe>
            <ListeTitre compo={c} onChange={setCompo} onApercu={setProvisoire} />
          </Groupe>
          <Texte variante="meta" couleur="t3" style={{ paddingHorizontal: espace.xs, lineHeight: 18 }}>
            {t("agenda.ecrit.note")}
          </Texte>
        </>
      ) : null}
    </Feuille>
  );
}

function ListeTitre({ compo, onChange, onApercu }: { compo: TitreCompose; onChange: (t: TitreCompose) => void; onApercu: (t: TitreCompose | null) => void }) {
  const [tenu, setTenu] = useState<ElementTitre | null>(null);
  const valeurs = useRef(new Map<ElementTitre, Animated.Value>()).current;
  const val = (e: ElementTitre) => {
    let v = valeurs.get(e);
    if (!v) valeurs.set(e, (v = new Animated.Value(0)));
    return v;
  };
  const props = useRef({ compo, onChange, onApercu });
  props.current = { compo, onChange, onApercu };
  // Ordre d'avant un changement : au rendu suivant, chaque ligne repart de sa place visible (glisser : déjà en place).
  const avant = useRef<{ ordre: ElementTitre[]; glisse: boolean } | null>(null);

  useLayoutEffect(() => {
    const a = avant.current;
    if (!a) return;
    avant.current = null;
    const temps = reduitMouvement() ? 0 : duree.deplacement;
    compo.ordre.forEach((e, i) => {
      const v = val(e);
      const d = a.glisse ? 0 : (a.ordre.indexOf(e) - i) * H;
      v.setValue(d);
      if (d) Animated.timing(v, { toValue: 0, duration: temps, easing: deplacement, useNativeDriver: false }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compo.ordre]);

  const changer = (suivant: TitreCompose, glisse = false) => {
    const { compo: c, onChange: f } = props.current;
    if (suivant === c) return;
    if (suivant.ordre !== c.ordre && suivant.ordre.join() !== c.ordre.join()) avant.current = { ordre: c.ordre, glisse };
    f(suivant);
  };

  const glisser = useMemo(() => {
    const g = { e: null as ElementTitre | null, de: 0, vers: 0 };
    const voisines = (vers: number) => {
      const ordre = props.current.compo.ordre;
      const temps = reduitMouvement() ? 0 : duree.depot;
      ordre.forEach((x, j) => {
        if (x === g.e) return;
        const d = g.de < j && j <= vers ? -H : vers <= j && j < g.de ? H : 0;
        Animated.timing(val(x), { toValue: d, duration: temps, easing: sortie, useNativeDriver: false }).start();
      });
    };
    const lacher = () => {
      const e = g.e;
      if (!e) return;
      g.e = null;
      const temps = reduitMouvement() ? 0 : duree.depot;
      Animated.timing(val(e), { toValue: (g.vers - g.de) * H, duration: temps, easing: sortie, useNativeDriver: false }).start(() => {
        haptique.depot();
        setTenu(null);
        props.current.onApercu(null);
        changer(placerElement(props.current.compo, e, g.vers), true);
      });
    };
    return (e: ElementTitre) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // La feuille se ferme d'un glissé vers le bas : elle ne reprend pas la poignée en cours de geste.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const ordre = props.current.compo.ordre;
          g.e = e;
          g.de = g.vers = ordre.indexOf(e);
          setTenu(e);
          haptique.prise();
        },
        onPanResponderMove: (_, { dy }) => {
          if (g.e !== e) return;
          const n = props.current.compo.ordre.length;
          const y = Math.max(-g.de * H, Math.min((n - 1 - g.de) * H, dy));
          val(e).setValue(y);
          const vers = g.de + Math.round(y / H);
          if (vers === g.vers) return;
          g.vers = vers;
          voisines(vers);
          haptique.cran();
          props.current.onApercu(placerElement(props.current.compo, e, vers));
        },
        onPanResponderRelease: lacher,
        onPanResponderTerminate: lacher,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const poignees = useMemo(() => new Map(compo.ordre.map((e) => [e, glisser(e)])), [glisser]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ height: compo.ordre.length * H }}>
      {compo.ordre.map((e, i) => (
        <LigneElement
          key={e}
          e={e}
          premier={i === 0}
          dernier={i === compo.ordre.length - 1}
          coche={compo.coches.includes(e)}
          tenu={tenu === e}
          y={val(e)}
          poignee={poignees.get(e)!}
          onCocher={() => changer(basculerElement(compo, e))}
          onBouger={(sens) => {
            haptique.cran();
            changer(deplacerElement(compo, e, sens));
          }}
        />
      ))}
    </View>
  );
}

function LigneElement({
  e,
  premier,
  dernier,
  coche,
  tenu,
  y,
  poignee,
  onCocher,
  onBouger,
}: {
  e: ElementTitre;
  premier: boolean;
  dernier: boolean;
  coche: boolean;
  tenu: boolean;
  y: Animated.Value;
  poignee: ReturnType<typeof PanResponder.create>;
  onCocher: () => void;
  onBouger: (sens: -1 | 1) => void;
}) {
  const { couleurs } = useTheme();
  const libelle = t(LIBELLES[e]);
  const fixe = e === "nom";
  const fleche = (sens: -1 | 1, inactif: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(sens < 0 ? "agenda.compo.monter" : "agenda.compo.descendre", { element: libelle })}
      accessibilityState={{ disabled: inactif }}
      disabled={inactif}
      onPress={() => onBouger(sens)}
      style={({ pressed }) => [styles.bouton, inactif && { opacity: 0.3 }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <Icone nom={sens < 0 ? "monter" : "descendre"} couleur={couleurs.t3} taille={18} />
    </Pressable>
  );
  return (
    <Animated.View
      style={[
        styles.ligne,
        { backgroundColor: tenu ? couleurs.s3 : couleurs.feuilleGroupe, transform: [{ translateY: y }] },
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        tenu && { zIndex: 1, elevation: 8 },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: coche, disabled: fixe }}
        accessibilityLabel={fixe ? `${libelle}, ${t("agenda.compo.toujours")}` : libelle}
        disabled={fixe}
        onPress={onCocher}
        style={({ pressed }) => [styles.cocher, pressed && { backgroundColor: couleurs.s3 }]}
      >
        <View style={[styles.case, coche ? { backgroundColor: couleurs.t1, borderColor: couleurs.t1 } : { borderColor: couleurs.t3 }, fixe && { opacity: 0.4 }]}>
          {coche ? <Icone nom="check" couleur={couleurs.bg} taille={15} epaisseur={2.6} /> : null}
        </View>
        <Texte variante="saisie" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
          {libelle}
        </Texte>
      </Pressable>
      {fleche(-1, premier)}
      {fleche(1, dernier)}
      <View
        {...poignee.panHandlers}
        accessible
        accessibilityLabel={t("agenda.compo.deplacer", { element: libelle })}
        accessibilityHint={t("agenda.compo.deplacerAide")}
        style={styles.poignee}
      >
        <Icone nom="grip" couleur={tenu ? couleurs.t1 : couleurs.t3} taille={20} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  libelleFeuille: { paddingHorizontal: espace.xs, marginBottom: -espace.xs },
  apercu: { minHeight: H, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  ligne: { height: H, flexDirection: "row", alignItems: "center", paddingRight: espace.xs },
  cocher: { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: espace.m, paddingLeft: espace.l, paddingRight: espace.s },
  case: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  bouton: { width: 44, height: H, alignItems: "center", justifyContent: "center" },
  poignee: { width: 48, height: H, alignItems: "center", justifyContent: "center" },
});
