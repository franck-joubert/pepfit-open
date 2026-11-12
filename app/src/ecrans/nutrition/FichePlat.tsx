import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useChiffresNutrition } from "./mode-affichage";
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ajouterPlatAuJournal, basculerFavoriPlat, consommationDePlat, lirePlat, listerRepas, repasDeLHeure, statsPlat, type Plat, type Repas, type StatsPlat,
} from "../../db";
import { uriPhoto } from "../../photos";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { cleJour, macrosPourQuantite, valeursGrammes, valeursUnites } from "../../nutrition/calculs";
import { compositionPour, grammesDePlat, poidsPortion, valeursPlat, type Ajustement } from "../../nutrition/plats";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BarreHaut, BoutonIcone } from "../../ui/Cadre";
import { BoutonPrincipal, FondDegrade } from "../../ui/Degrade";
import { FenetrePleine } from "../../ui/FenetrePleine";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Icone } from "../../ui/Icone";
import { largeurContenu } from "../../ui/largeur";
import { PhotoZoom } from "../../ui/PhotoZoom";
import { revenir } from "../../ui/revenir";
import { RoueDuree } from "../../ui/RoueDuree";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { approx, jourMois, nombre } from "../format";
import { auRepas, Entete, fraction, LibellePrincipal, MARGE_PAGE, nomRepas, PageNutrition, Pied, valeurTexte } from "./commun";
import { FeuilleQuantite } from "./FeuilleQuantite";
import { deposerRetraitFiche } from "./retrait-fiche";
import { CartePlat, CarteValeurs, EnteteColonnes, LigneIngredient, texteIngredient } from "./plats-commun";
import { demanderSuppressionPlat } from "./suppression-plat";

// La fiche d'un plat (planche plats, 3 et 5 ; D3, D4) : celle d'un aliment (kcal en chiffre fort, macros, unité en segmenté
// « Portion · 540 g » ou « g », roue), puis les ingrédients de la quantité choisie (toucher = l'ajuster pour cette fois, P5 ;
// « Rétablir »), les valeurs (portion, 100 g, plat entier) et « Ce plat ». Avec une photo, elle est pleine largeur, derrière
// l'en-tête (← ♥ ⋯ blancs sur un voile sombre), le nom posé dessus sur un dégradé qui la fond dans la page ; elle prend la place
// qui reste au-dessus de la roue (320 dp au plus, 360 en 640, 220 au moins) : la roue tient entière au-dessus du bouton sur un
// écran 16:9 ; défilée, la barre reprend son fond et le nom. Toucher la photo = en grand. Sans photo : le titre et la cocotte,
// comme un produit. La photo ne se change qu'en modification (⋯ › Modifier le plat).

const GRAMMES = valeursGrammes();
const UNITES = valeursUnites();
const HAUTEUR_BARRE = 56;
/** Bouton plein du pied (52) et sa marge basse (12) : la roue s'arrête 4 dp au-dessus. */
const PIED_BOUTON = 52 + espace.m;

type U = "portion" | "g";

export function FichePlat() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const chiffres = useChiffresNutrition();
  const p = useLocalSearchParams<{ id?: string; repas?: string; date?: string; conso?: string }>();
  const [plat, setPlat] = useState<Plat | null>(null);
  const [repas, setRepas] = useState<Repas[]>([]);
  const [repasId, setRepasId] = useState(p.repas ?? "");
  const [date, setDate] = useState(p.date || cleJour(new Date()));
  const [unite, setUnite] = useState<U>("portion");
  const [nb, setNb] = useState(1);
  const [ajustements, setAjustements] = useState<Map<string, Ajustement>>(new Map());
  const [stats, setStats] = useState<StatsPlat | null>(null);
  const [menu, setMenu] = useState(false);
  const [plein, setPlein] = useState(false);
  const [edite, setEdite] = useState<string | null>(null);
  const [initial, setInitial] = useState(false);

  // Relue en revenant de « Modifier le plat » ; la quantité et les ajustements ne sont lus qu'une fois.
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      (async () => {
        const tous = await listerRepas(db, true);
        let id = p.id;
        const c = p.conso ? await consommationDePlat(db, p.conso) : null;
        if (c) id = c.plat_id;
        const x = id ? await lirePlat(db, id) : null;
        if (!vivant) return;
        // Plat supprimé depuis : sa ligne du journal se rouvre comme un aliment (son produit figé garde ses valeurs).
        if (!x && p.conso) return router.replace({ pathname: "/nutrition/produit", params: { conso: p.conso } });
        if (!x) return router.back();
        setRepas(tous);
        setPlat(x);
        setStats(await statsPlat(db, x, `${cleJour(new Date()).slice(0, 8)}01`));
        if (initial) return;
        setInitial(true);
        if (c) {
          setRepasId(c.repas_id);
          setDate(c.date);
          setUnite(c.unite === "g" ? "g" : "portion");
          setNb(c.nb_unites);
          setAjustements(c.ajustements);
        } else if (!p.repas) {
          // Ouverte sans repas (Mes plats) : celui de l'heure, comme Ajouter (« Ajouter au déjeuner » à 12:40).
          const h = new Date();
          setRepasId(repasDeLHeure(tous.filter((r) => r.actif), h.getHours() * 60 + h.getMinutes())?.id ?? tous.find((r) => r.actif)?.id ?? "");
        }
      })().catch((e) => console.error(e));
      return () => {
        vivant = false;
      };
    }, [db, p.id, p.conso, p.repas, initial]),
  );

  const grammes = plat ? grammesDePlat(plat, unite, nb) : 0;
  const comp = useMemo(() => (plat ? compositionPour(plat, grammes, ajustements) : null), [plat, grammes, ajustements]);
  const valeurs = useMemo(() => (plat ? valeursPlat(plat) : null), [plat]);
  if (!plat || !comp || !valeurs) return <PageNutrition titre="">{null}</PageNutrition>;

  const r = repas.find((x) => x.id === repasId);
  const edition = p.conso != null;
  const base = t("nutrition.g");
  const poidsTexte = approx(`${nombre(comp.poidsG, 0)} ${base}`, comp.ajuste);
  const pied = edition ? t("ui.enregistrer") : r ? t("nutrition.ajouterAu", { repas: auRepas(r) }) : t("nutrition.ajouter");
  const valider = async () => {
    await ajouterPlatAuJournal(db, { plat, date, repasId, unite, nb, ajustements, consoId: p.conso });
    router.dismissTo("/food");
  };
  const choisirUnite = (u: U) => {
    if (u === unite) return;
    if (u === "g") setNb(Math.max(5, Math.round(grammes / 5) * 5));
    else setNb(Math.max(0.25, Math.round((grammes / poidsPortion(plat)) * 4) / 4));
    setUnite(u);
  };
  const quantiteTexte = unite === "g" ? `${nombre(nb, 0)} ${base}` : `${fraction(nb)} ${t("nutrition.unite.portion")}`;
  const ingredientEdite = plat.ingredients.find((i) => i.id === edite) ?? null;
  const ligneEditee = comp.lignes.find((l) => l.id === edite) ?? null;
  const prov = plat.source === "fitatu" ? t("nutrition.provenanceFitatu") : t("nutrition.provenancePerso");
  const sous = plat.sans_ingredients ? `${tp("plats.nPortions", plat.portions)}, ${t("plats.sansIngredients")}` : `${tp("plats.nPortions", plat.portions)}, ${tp("plats.nIngredients", plat.ingredients.length)}`;
  const m = comp.macros;

  const corps = (
    <>
      <View style={[styles.kcal, !chiffres && { display: "none" }]}>
        <Texte variante="chiffreFort">{valeurTexte(m.kcal, m.approx)}</Texte>
        <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
          {t("nutrition.kcal")}
        </Texte>
        {comp.ajuste ? (
          <Texte variante="meta" couleur="t3" style={{ marginLeft: 4 }}>
            {t("plats.ajustePourCetteFois")}
          </Texte>
        ) : null}
      </View>
      <View style={[styles.macros, !chiffres && { display: "none" }]}>
        {(
          [
            ["nutrition.proteines", m.proteines],
            ["nutrition.glucides", m.glucides],
            ["nutrition.lipides", m.lipides],
            ["nutrition.sucres", m.sucres],
          ] as const
        ).map(([cle, v]) => (
          <View key={cle} style={{ flex: 1 }}>
            <Texte variante="entete" couleur="t3" numberOfLines={1}>
              {t(cle)}
            </Texte>
            <Texte variante="saisie" style={{ marginTop: 5 }}>
              {nombre(v, v < 10 ? 1 : 0)}
              <Texte variante="saisie" couleur="t3" style={{ fontFamily: police.regular }}>
                {` ${base}`}
              </Texte>
            </Texte>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 14 }}>
        <Segmente<U>
          options={[
            { valeur: "portion", libelle: t("plats.portionMaj"), sous: approx(`${nombre(unite === "portion" && nb > 0 ? comp.poidsG / nb : poidsPortion(plat), 0)} ${base}`, comp.ajuste) },
            { valeur: "g", libelle: base },
          ]}
          valeur={unite}
          onChange={choisirUnite}
        />
      </View>
      <View style={{ marginTop: -2 }}>
        <RoueDuree
          key={unite}
          libelle={t("nutrition.quantite")}
          valeur={nb}
          valeurs={unite === "g" ? GRAMMES : UNITES}
          onChange={setNb}
          traits={false}
          fond={couleurs.bg}
          bande={couleurs.s1}
          unite={unite === "g" ? base : t("nutrition.unite.portion")}
          decoupe={(v) => ({ attenue: "", plein: unite === "g" ? nombre(v, 0) : fraction(v) })}
          lue={(v) => `${nombre(v, 2)} ${unite === "g" ? base : t("nutrition.unite.portion")}`}
        />
      </View>
    </>
  );

  const suite = (
    <>
      <Entete
        style={styles.entete}
        droite={
          ajustements.size ? (
            <Pressable accessibilityRole="button" onPress={() => setAjustements(new Map())} hitSlop={6} style={[styles.retablir, { backgroundColor: couleurs.s2 }]}>
              <Texte variante="corps" style={{ fontSize: 13, fontFamily: police.semibold, color: couleurs.t1 }}>
                {t("plats.retablir")}
              </Texte>
            </Pressable>
          ) : undefined
        }
      >
        {plat.sans_ingredients ? t("plats.ingredients") : t("plats.ingredientsQ", { q: quantiteTexte })}
      </Entete>
      {plat.sans_ingredients ? (
        <CartePlat style={{ padding: 16 }}>
          <Texte variante="corps" couleur="t2" style={{ fontSize: 14, lineHeight: 20 }}>
            {t("plats.sansIngrTexte", {
              kcal: nombre(valeurs.cent.kcal, 0),
              poids: valeurs.poidsG >= 1000 ? `${nombre(valeurs.poidsG / 1000, 1)} ${t("nutrition.kg")}` : `${nombre(valeurs.poidsG, 0)} ${base}`,
              portions: tp("plats.nPortions", plat.portions),
            })}
          </Texte>
          <BoutonTonal icone="plus" libelle={t("plats.ajouterIngredients")} hauteur={48} onPress={() => router.push({ pathname: "/nutrition/plat-edition", params: { id: plat.id } })} style={{ marginTop: 14 }} />
        </CartePlat>
      ) : (
        <CartePlat>
          <EnteteColonnes />
          {comp.lignes.map((l) => (
            <LigneIngredient
              key={l.id}
              nom={l.produit.nom}
              quantite={texteIngredient(l)}
              m={macrosPourQuantite(l.produit.nutriments, l.quantite_g)}
              ajuste={l.ajuste}
              onPress={() => setEdite(l.id)}
            />
          ))}
        </CartePlat>
      )}
      <Entete style={styles.entete}>{t("plats.valeurs")}</Entete>
      <CarteValeurs portion={valeurs.portion} portionG={valeurs.portionG} cent={valeurs.cent} entier={valeurs.entier} poidsG={valeurs.poidsG} />
      <Pressable accessibilityRole="button" onPress={() => router.push("/nutrition/plats")} style={styles.statsTete}>
        <Texte variante="entete" couleur="t3" style={{ flex: 1 }}>
          {t("plats.cePlat")}
        </Texte>
        <Texte variante="meta" couleur="t3">
          {t("plats.creeLe", { jour: jourMois(new Date(plat.cree_le)) })}
        </Texte>
        <Icone nom="right" couleur={couleurs.t3} taille={16} />
      </Pressable>
      <View style={[styles.stats, { backgroundColor: couleurs.s1, borderColor: couleurs.verreFilet }]}>
        <Stat valeur={`${stats?.foisMois ?? 0}×`} libelle={t("nutrition.ceMois")} />
        <Stat valeur={portionsTexte(stats?.portions ?? 0)} libelle={t("nutrition.auTotal")} />
        <Stat
          valeur={(() => {
            const x = repas.find((y) => y.id === stats?.repasFrequent);
            return x ? nomRepas(x) : "—";
          })()}
          libelle={t("nutrition.lePlusSouvent")}
        />
      </View>
    </>
  );

  const piedBouton = (
    <BoutonPrincipal libelle={pied} onPress={() => void valider().catch(signalerErreur())}>
      <LibellePrincipal libelle={pied} complement={poidsTexte} />
    </BoutonPrincipal>
  );
  const coeur = (blanc: boolean) => (
    <BoutonIcone
      nom={plat.favori ? "coeurp" : "coeur"}
      couleur={plat.favori ? (blanc ? "#1bd8bb" : couleurs.partieNutrition) : blanc ? "rgba(255,255,255,0.94)" : undefined}
      libelle={t(plat.favori ? "nutrition.retirerFavori" : "nutrition.ajouterFavori")}
      onPress={() => basculerFavoriPlat(db, plat.id, !plat.favori).then(() => setPlat({ ...plat, favori: !plat.favori }))}
    />
  );
  const plus = (blanc: boolean) => <BoutonIcone nom="more" couleur={blanc ? "rgba(255,255,255,0.94)" : undefined} libelle={t("plats.options")} onPress={() => setMenu(true)} />;

  const feuilles = (
    <>
      <FeuilleQuantite
        visible={edite != null}
        titre={ingredientEdite?.produit.nom}
        sousTitre={t("plats.pourCetteFois")}
        produit={ingredientEdite?.produit ?? null}
        quantite={ligneEditee}
        onFermer={() => setEdite(null)}
        onValider={(q) => {
          const id = edite;
          setEdite(null);
          if (id) setAjustements((a) => new Map(a).set(id, q));
        }}
        action={{
          libelle: t("plats.retirerPourCetteFois"),
          icone: "moins",
          onPress: () => {
            const id = edite;
            setEdite(null);
            if (id) setAjustements((a) => new Map(a).set(id, null));
          },
        }}
      />
      <Feuille visible={menu} onFermer={() => setMenu(false)} titre={plat.nom}>
        <Groupe>
          {repas
            .filter((x) => x.actif || x.id === repasId)
            .map((x, i) => (
              <Option
                key={x.id}
                premier={i === 0}
                libelle={nomRepas(x)}
                choisi={x.id === repasId}
                onPress={() => {
                  setRepasId(x.id);
                  setMenu(false);
                }}
              />
            ))}
        </Groupe>
        <Groupe>
          <Option
            premier
            icone="crayon"
            libelle={t("plats.modifier")}
            chevron
            onPress={() => {
              setMenu(false);
              router.push({ pathname: "/nutrition/plat-edition", params: { id: plat.id } });
            }}
          />
          <Option
            icone="copie"
            libelle={t("plats.dupliquer")}
            onPress={() => {
              setMenu(false);
              router.push({ pathname: "/nutrition/plat-edition", params: { copie: plat.id, repas: repasId, date } });
            }}
          />
        </Groupe>
        <Groupe>
          {edition && p.conso ? (
            <Option
              premier
              icone="close"
              libelle={t("nutrition.retirerDuRepas")}
              onPress={() => {
                setMenu(false);
                deposerRetraitFiche(p.conso!);
                router.back();
              }}
            />
          ) : null}
          <Option
            premier={!edition}
            icone="trash"
            danger
            libelle={t("plats.supprimer")}
            onPress={() => {
              setMenu(false);
              demanderSuppressionPlat(db, plat);
              revenir();
            }}
          />
        </Groupe>
      </Feuille>
    </>
  );

  if (!plat.photo) {
    return (
      <PageNutrition
        titre=""
        droite={
          <>
            {coeur(false)}
            {plus(false)}
          </>
        }
        pied={piedBouton}
      >
        <View style={styles.idf}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texte variante="titre" style={{ lineHeight: 25 }}>
              {plat.nom}
            </Texte>
            <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ marginTop: 3 }}>
              {sous}
            </Texte>
            <View style={styles.prov}>
              <Icone nom="appareil" couleur={couleurs.t3} taille={13} />
              <Texte variante="meta" couleur="t3">
                {prov}
              </Texte>
            </View>
          </View>
          <View style={[styles.vignette, { backgroundColor: couleurs.s1 }]}>
            <Icone nom="cocotte" couleur={couleurs.t3} taille={24} epaisseur={1.5} />
          </View>
        </View>
        <View style={{ marginTop: 8 }}>{corps}</View>
        {suite}
        {feuilles}
      </PageNutrition>
    );
  }

  return (
    <AvecPhoto
      plat={plat}
      sous={sous}
      prov={prov}
      droite={(blanc) => (
        <>
          {coeur(blanc)}
          {plus(blanc)}
        </>
      )}
      pied={piedBouton}
      corps={corps}
      suite={suite}
      onPlein={() => setPlein(true)}
    >
      {feuilles}
      <FenetrePleine visible={plein} entree="fondu" onRetour={() => setPlein(false)}>
        <Pressable accessibilityLabel={t("plats.photoFermer")} onPress={() => setPlein(false)} style={styles.plein}>
          <PhotoZoom uri={uriPhoto(plat.photo)} />
        </Pressable>
      </FenetrePleine>
    </AvecPhoto>
  );
}

/**
 * Page de la fiche avec photo (D3) : la photo pleine largeur, derrière l'en-tête ; sa hauteur est la place qui reste au-dessus
 * de la roue (320 dp au plus, 360 en 640, 220 au moins), le bouton plein ne la couvre pas. Défilée au-delà, la barre reprend
 * son fond et le nom.
 */
function AvecPhoto({
  plat, sous, prov, droite, pied, corps, suite, onPlein, children,
}: {
  plat: Plat;
  sous: string;
  prov: string;
  droite: (blanc: boolean) => ReactNode;
  pied: ReactNode;
  corps: ReactNode;
  suite: ReactNode;
  onPlein: () => void;
  children: ReactNode;
}) {
  const { couleurs, mode } = useTheme();
  const haut = useSafeAreaInsets().top;
  const bas = useSafeAreaInsets().bottom;
  const { width, height } = useWindowDimensions();
  const large = largeurContenu(width) >= 600;
  const max = large ? 360 : 320;
  const [hCorps, setHCorps] = useState(0);
  const [replie, setReplie] = useState(false);
  // Place qui reste au-dessus de la roue : l'écran (la photo part du haut, sous la barre d'état), moins le corps (kcal → roue)
  // et le bouton plein du pied, 4 d'air.
  const hauteur = hCorps ? Math.round(Math.min(max, Math.max(220, height - hCorps - PIED_BOUTON - bas - 4))) : max;
  const fond = couleurs.bg;
  return (
    <View style={{ flex: 1, backgroundColor: fond }}>
      {replie ? null : <StatusBar style="light" />}
      <ScrollView
        scrollEventThrottle={16}
        onScroll={(e) => setReplie(e.nativeEvent.contentOffset.y > hauteur - haut - HAUTEUR_BARRE)}
        contentContainerStyle={{ paddingBottom: 112 + bas }}
      >
        <Pressable accessibilityRole="imagebutton" accessibilityLabel={t("plats.photoOuvrir")} onPress={onPlein} style={{ height: hauteur }}>
          {/* La photo s'arrête 2 dp avant le bas et le dégradé déborde d'1 dp : aucun liseré de photo sous le fondu (vu à l'émulateur). */}
          <Image source={{ uri: uriPhoto(plat.photo!) }} style={styles.photo} resizeMode="cover" />
          <View pointerEvents="none" style={styles.fondu}>
            <FondDegrade
              angle={180}
              arrets={[
                { offset: 0.46, couleur: fond, opacite: 0 },
                { offset: 0.67, couleur: fond, opacite: 0.6 },
                { offset: 0.86, couleur: fond, opacite: 0.92 },
                { offset: 1, couleur: fond, opacite: 1 },
              ]}
            />
          </View>
          <View pointerEvents="none" style={styles.heroTexte}>
            <Texte variante="titreFort" numberOfLines={2} style={{ lineHeight: 29 }}>
              {plat.nom}
            </Texte>
            <View style={styles.heroSous}>
              <Texte variante="meta" couleur="t2" numberOfLines={1} style={{ flexShrink: 1 }}>
                {`${sous}, `}
              </Texte>
              <Icone nom="appareil" couleur={couleurs.t3} taille={13} />
              <Texte variante="meta" couleur="t3">
                {prov}
              </Texte>
            </View>
          </View>
        </Pressable>
        <View style={{ paddingHorizontal: MARGE_PAGE }}>
          <View onLayout={(e: LayoutChangeEvent) => setHCorps(e.nativeEvent.layout.height)}>{corps}</View>
          {suite}
        </View>
      </ScrollView>
      {/* En-tête posé sur la photo : voile sombre, ← ♥ ⋯ blancs ; défilée, la barre reprend son fond et le nom. */}
      <View style={[styles.barre, { paddingTop: haut }, replie && { backgroundColor: fond, boxShadow: mode === "jour" ? "0px 8px 16px -14px rgba(0,124,130,0.45)" : "0px 8px 16px -14px rgba(0,0,0,0.5)" }]}>
        {replie ? null : (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <FondDegrade
              angle={180}
              arrets={[
                { offset: 0, couleur: "#000000", opacite: 0.5 },
                { offset: 0.65, couleur: "#000000", opacite: 0.2 },
                { offset: 1, couleur: "#000000", opacite: 0 },
              ]}
            />
          </View>
        )}
        {replie ? (
          <BarreHaut titre={plat.nom}>{droite(false)}</BarreHaut>
        ) : (
          <View style={styles.barreLigne}>
            <BoutonIcone nom="back" couleur="rgba(255,255,255,0.94)" libelle={t("ui.retour")} onPress={revenir} />
            <View style={{ flex: 1 }} />
            {droite(true)}
          </View>
        )}
      </View>
      <Pied>{pied}</Pied>
      {children}
    </View>
  );
}

/** « 7 ½ portions », « ½ portion » : les portions mangées, au quart près. */
function portionsTexte(n: number): string {
  const q = Math.round(n * 4) / 4;
  return `${fraction(q)} ${q > 1 ? t("plats.portionsUnite") : t("nutrition.unite.portion")}`;
}

function Stat({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Texte variante="saisie" style={{ fontSize: 15 }} numberOfLines={1}>
        {valeur}
      </Texte>
      <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ marginTop: 3 }}>
        {libelle}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  idf: { flexDirection: "row", alignItems: "center", gap: 14 },
  prov: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  vignette: { width: 56, height: 56, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  kcal: { flexDirection: "row", alignItems: "baseline", gap: espace.s, marginTop: 14 },
  macros: { flexDirection: "row", gap: espace.m, marginTop: 10 },
  entete: { marginTop: 22, marginBottom: espace.s },
  retablir: { height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", marginVertical: -6 },
  statsTete: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginTop: espace.m },
  stats: { flexDirection: "row", gap: espace.m, paddingVertical: 14, paddingHorizontal: espace.l, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth },
  photo: { position: "absolute", top: 0, left: 0, right: 0, bottom: 2 },
  fondu: { position: "absolute", top: 0, left: 0, right: 0, bottom: -1 },
  heroTexte: { position: "absolute", left: MARGE_PAGE, right: MARGE_PAGE, bottom: 2 },
  heroSous: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  barre: { position: "absolute", top: 0, left: 0, right: 0, paddingBottom: 0 },
  barreLigne: { height: HAUTEUR_BARRE, flexDirection: "row", alignItems: "center", paddingHorizontal: espace.s },
  plein: { flex: 1, backgroundColor: "#000" },
});
