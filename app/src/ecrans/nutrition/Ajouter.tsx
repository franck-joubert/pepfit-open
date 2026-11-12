import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ajouterConsommation, ajouterPlatAuJournal, ajoutRapide, chercherLocal, dernieresQuantites, enregistrerProduitOff, foisDepuis, kcalPortion, listerFavoris,
  listerPlats, listerProduitsPerso, listerRepas, nbProduitsConsommes, platsFavoris, recentsDuRepas, recentsPlatsDuRepas, repasDeLHeure, trouverParCode, type Plat, type Produit, type Quantite,
  type Repas,
} from "../../db";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { cleJour, decalerJour, grammesDepuisUnite, kcalDepuisMacros, macrosPourQuantite, portionDe } from "../../nutrition/calculs";
import { chercherOff, produitOffParCode, type ProduitOff } from "../../nutrition/off";
import { figer, poidsPortion } from "../../nutrition/plats";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Icone, type NomIcone } from "../../ui/Icone";
import { RoueDuree } from "../../ui/RoueDuree";
import { Onglets } from "../../ui/Onglets";
import { Texte } from "../../ui/Texte";
import { minuscule, t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { approx, jourSemaineMois, nombre } from "../format";
import { CadreVide, CaseCocher, ChampTexte, Entete, LibellePrincipal, nomRepas, PageNutrition, PastilleRepas, plage, texteQuantite, valeurTexte } from "./commun";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { prendreCodeLu } from "./code-lu";
import { deposerIngredients } from "./plat-brouillon";
import { chiffresNutrition, useChiffresNutrition } from "./mode-affichage";
import { sousLigneAjout } from "./plats-commun";
import { annulerSuppressionPlat, useSuppressionPlat } from "./suppression-plat";

// Ajouter à un repas (planche 7 à 10) : recherche et code-barres, puis Récents / Favoris / Mes produits en segmenté. Récents :
// Ajout rapide, Mes aliments, « Souvent au déjeuner » avec la dernière quantité. Toucher la case coche (plusieurs à la fois),
// toucher la ligne ouvre la fiche ; « Ajouter 2 · 244 kcal » pose les cochés au journal. En tapant : d'abord le téléphone, puis
// Open Food Facts ; hors ligne, une seule ligne ; « Créer « skyr » » en fin de liste.
// Plats (planche plats, V1 validée le 30/10, D1) : un onglet « Mes plats » (« + Nouveau plat », cocher pose une portion), les
// plats en tête de la recherche (groupe « Mes plats »), et dans Récents et Favoris, marqués de la cocotte. `pour=plat` : le mode
// ingrédient d'un plat (P8, « Ingrédients · Chili con carne ») : recherche, scanner, Récents, Favoris, Mes produits, sans
// plat ni ajout rapide ; « Ajouter 2 » rend les ingrédients cochés à la page du plat.

const DELAI_RECHERCHE_MS = 450;
type Onglet = "recents" | "favoris" | "plats" | "produits";
type Choix = { produit: Produit; q: Quantite };

/** Quantité par défaut d'un produit jamais mangé : une portion si son poids est connu, sinon 100 g. */
export function quantiteParDefaut(p: Produit): Quantite {
  const portion = portionDe(p.portions, "portion");
  return portion ? { quantite_g: portion.grammes, unite: "portion", nb_unites: 1 } : { quantite_g: 100, unite: "g", nb_unites: 100 };
}

export function Ajouter() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const chiffres = useChiffresNutrition();
  const p = useLocalSearchParams<{ repas?: string; date?: string; pour?: string; plat?: string }>();
  const date = p.date || cleJour(new Date());
  const ingredient = p.pour === "plat";
  const [repas, setRepas] = useState<Repas | null>(null);
  // Repas de l'ajout (retours du 28/10) : celui du lien, sinon deviné à l'heure ; changeable par la feuille sous le titre.
  const [tousRepas, setTousRepas] = useState<Repas[]>([]);
  const [repasId, setRepasId] = useState(p.repas ?? "");
  const [choixRepas, setChoixRepas] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("recents");
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<Produit[]>([]);
  const [favoris, setFavoris] = useState<Produit[]>([]);
  const [perso, setPerso] = useState<Produit[]>([]);
  const [quantites, setQuantites] = useState<Map<string, Quantite>>(new Map());
  const [fois, setFois] = useState<Map<string, number>>(new Map());
  const [nbAliments, setNbAliments] = useState(0);
  const [locaux, setLocaux] = useState<Produit[]>([]);
  const [off, setOff] = useState<ProduitOff[] | null | "attente">([]);
  const [choix, setChoix] = useState<Map<string, Choix>>(new Map());
  const [rapide, setRapide] = useState(false);
  const [plats, setPlats] = useState<Plat[]>([]);
  const [platsRecents, setPlatsRecents] = useState<Plat[]>([]);
  const [platsFav, setPlatsFav] = useState<Plat[]>([]);
  const [platsTrouves, setPlatsTrouves] = useState<Plat[]>([]);
  const [choixPlats, setChoixPlats] = useState<Map<string, Plat>>(new Map());
  const attente = useSuppressionPlat();
  const jeton = useRef(0);

  const charger = useCallback(async () => {
    const tous = await listerRepas(db, true);
    const maintenant = new Date();
    const r = tous.find((x) => x.id === repasId) ?? repasDeLHeure(tous.filter((x) => x.actif), maintenant.getHours() * 60 + maintenant.getMinutes()) ?? tous[0] ?? null;
    setTousRepas(tous);
    setRepas(r);
    const [rec, fav, per] = await Promise.all([recentsDuRepas(db, ingredient ? null : (r?.id ?? "")), listerFavoris(db), listerProduitsPerso(db)]);
    if (!ingredient) {
      const [tous, recPlats, favPlats] = await Promise.all([listerPlats(db), recentsPlatsDuRepas(db, r?.id ?? ""), platsFavoris(db)]);
      setPlats(tous);
      setPlatsRecents(recPlats);
      setPlatsFav(favPlats);
    }
    setRecents(rec);
    setFavoris(fav);
    setPerso(per);
    const ids = [...new Set([...rec, ...fav, ...per].map((x) => x.id))];
    const dansRepas = await dernieresQuantites(db, rec.map((x) => x.id), r?.id ?? null);
    const partout = await dernieresQuantites(db, ids);
    setQuantites(new Map([...partout, ...dansRepas]));
    setNbAliments(await nbProduitsConsommes(db));
  }, [db, repasId, ingredient]);
  useFocusEffect(
    useCallback(() => {
      charger().catch((e) => console.error(e));
      // Mode ingrédient : le code lu par le scanner coche son produit (copie locale, puis Open Food Facts).
      const lu = ingredient ? prendreCodeLu() : null;
      if (lu) {
        trouverParCode(db, lu, produitOffParCode)
          .then((x) => (x ? basculerRef.current(x) : setQ(lu)))
          .catch(signalerErreur());
      }
    }, [charger, ingredient, db]),
  );

  useEffect(() => {
    const mon = ++jeton.current;
    const texte = q.trim();
    if (texte.length < 2) {
      setLocaux([]);
      setOff([]);
      return;
    }
    if (!ingredient) listerPlats(db, texte).then((l) => mon === jeton.current && setPlatsTrouves(l)).catch(() => {});
    chercherLocal(db, texte)
      .then(async (l) => {
        if (mon !== jeton.current) return;
        setLocaux(l);
        const ids = l.map((x) => x.id);
        const [qs, f] = await Promise.all([dernieresQuantites(db, ids), foisDepuis(db, ids, decalerJour(cleJour(new Date()), -30))]);
        if (mon !== jeton.current) return;
        setQuantites((cur) => new Map([...qs, ...cur]));
        setFois(f);
      })
      .catch(() => {});
    setOff("attente");
    const minuterie = setTimeout(() => {
      chercherOff(texte)
        .then((l) => mon === jeton.current && setOff(l))
        .catch(() => mon === jeton.current && setOff(null));
    }, DELAI_RECHERCHE_MS);
    return () => clearTimeout(minuterie);
  }, [q, db, ingredient]);

  const ouvrir = (x: Produit) =>
    router.push({ pathname: "/nutrition/produit", params: ingredient ? { produit: x.id, pour: "plat" } : { produit: x.id, repas: repas?.id ?? "", date } });
  const ouvrirPlat = (x: Plat) => router.push({ pathname: "/nutrition/plat", params: { id: x.id, repas: repas?.id ?? "", date } });
  const basculerPlat = (x: Plat) =>
    setChoixPlats((c) => {
      const n = new Map(c);
      if (n.has(x.id)) n.delete(x.id);
      else n.set(x.id, x);
      return n;
    });
  const ouvrirOff = async (o: ProduitOff) => ouvrir(await enregistrerProduitOff(db, o));
  const quantiteDe = (x: Produit) => quantites.get(x.id) ?? quantiteParDefaut(x);
  const basculer = (x: Produit) =>
    setChoix((c) => {
      const n = new Map(c);
      if (n.has(x.id)) n.delete(x.id);
      else n.set(x.id, { produit: x, q: quantiteDe(x) });
      return n;
    });
  const basculerRef = useRef(basculer);
  basculerRef.current = basculer;
  const basculerOff = async (o: ProduitOff) => basculer(await enregistrerProduitOff(db, o));

  const selection = [...choix.values()];
  const selectionPlats = [...choixPlats.values()].filter((x) => x.id !== attente?.id);
  const nbChoisis = selection.length + selectionPlats.length;
  // Un résultat en ligne coché est d'abord gardé sur le téléphone : sa case suit le produit gardé (même code, ou même nom).
  const cocheEnLigne = (o: ProduitOff) => selection.some((c) => (o.codeBarres ? c.produit.code_barres === o.codeBarres : c.produit.nom === o.nom && (c.produit.marque ?? "") === (o.marque ?? "")));
  const macrosChoix = selection.map((c) => macrosPourQuantite(c.produit.nutriments, c.q.quantite_g));
  const kcal = macrosChoix.reduce((a, m) => a + m.kcal, 0) + selectionPlats.reduce((a, x) => a + kcalPortion(x), 0);
  const kcalApprox = macrosChoix.some((m) => m.approx);
  const ajouterTout = async () => {
    if (ingredient) {
      // Mode ingrédient : les cochés vont à la page du plat, chacun avec sa quantité habituelle.
      deposerIngredients(selection.map((c) => ({ produit_id: c.produit.id, produit: figer(c.produit), quantite_g: grammesDepuisUnite(c.q.unite, c.q.nb_unites, c.produit.portions) ?? c.q.quantite_g, unite: c.q.unite, nb_unites: c.q.nb_unites })));
      router.back();
      return;
    }
    if (!repas) return;
    for (const c of selection) await ajouterConsommation(db, { date, repasId: repas.id, produitId: c.produit.id, quantiteG: c.q.quantite_g, unite: c.q.unite, nbUnites: c.q.nb_unites });
    // Un plat coché : une portion (P7, la quantité habituelle d'un plat).
    for (const x of selectionPlats) await ajouterPlatAuJournal(db, { plat: x, date, repasId: repas.id, unite: "portion", nb: 1 });
    router.dismissTo("/food");
  };
  const lignePlat = (x: Plat, cocotte = false) => (
    <LigneCocher
      key={`plat:${x.id}`}
      titre={x.nom}
      sous={sousLigneAjout(poidsPortion(x), kcalPortion(x))}
      plat={cocotte}
      coche={choixPlats.has(x.id)}
      onOuvrir={() => ouvrirPlat(x)}
      onCocher={() => basculerPlat(x)}
    />
  );
  const sansAttente = (l: Plat[]) => l.filter((x) => x.id !== attente?.id);

  /** « 1 pot · 150 g · 95 kcal · 9× ce mois » : la quantité habituelle et ses kcal. */
  const sousLigne = (x: Produit, avecFois = false) => {
    const qte = quantiteDe(x);
    const g = grammesDepuisUnite(qte.unite, qte.nb_unites, x.portions) ?? qte.quantite_g;
    const m = macrosPourQuantite(x.nutriments, g);
    const n = fois.get(x.id) ?? 0;
    return [texteQuantite({ ...qte, quantite_g: g, produit: x }), chiffres ? approx(`${nombre(m.kcal, 0)} ${t("nutrition.kcal")}`, m.approx) : null, avecFois && n ? t("nutrition.foisCeMois", { n }) : null].filter(Boolean).join(", ");
  };
  const ligneProduit = (x: Produit, avecFois = false, nomComplet = false) => (
    <LigneCocher
      key={x.id}
      titre={nomComplet && x.marque ? `${x.nom}, ${x.marque}` : x.nom}
      sous={sousLigne(x, avecFois)}
      coche={choix.has(x.id)}
      onOuvrir={() => ouvrir(x)}
      onCocher={() => basculer(x)}
    />
  );

  const recherche = q.trim().length >= 2;
  const codesLocaux = useMemo(() => new Set(locaux.map((x) => x.code_barres).filter(Boolean)), [locaux]);
  const enLigne = Array.isArray(off) ? off.filter((o) => !codesLocaux.has(o.codeBarres)) : [];
  const creerNom = () => router.push({ pathname: "/nutrition/creer", params: { repas: repas?.id ?? "", date, nom: q.trim() } });
  const bouton =
    recherche || onglet !== "recents" || nbChoisis ? (
      <BoutonPrincipal libelle={nbChoisis ? tp("nutrition.ajouterN", nbChoisis) : t("nutrition.ajouter")} desactive={!nbChoisis} onPress={() => void ajouterTout().catch(signalerErreur())}>
        <LibellePrincipal
          libelle={nbChoisis ? tp("nutrition.ajouterN", nbChoisis) : t("nutrition.ajouter")}
          complement={nbChoisis && chiffres ? `${valeurTexte(kcal, kcalApprox)} ${t("nutrition.kcal")}` : undefined}
        />
      </BoutonPrincipal>
    ) : (
      <BoutonPrincipal libelle={t("nutrition.ajouter")} desactive onPress={() => {}} />
    );

  return (
    <PageNutrition
      titre={ingredient ? t("plats.ingredients") : jourSemaineMois(new Date(`${date}T12:00:00`))}
      complement={ingredient ? p.plat : undefined}
      pied={
        attente && !ingredient ? (
          <View style={{ gap: espace.s }}>
            <BandeauAnnuler texte={t("plats.supprime", { nom: attente.nom })} onAnnuler={annulerSuppressionPlat} />
            {bouton}
          </View>
        ) : (
          bouton
        )
      }
    >
      {repas && !ingredient ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("nutrition.quelRepas")} ${nomRepas(repas)}`}
          onPress={() => setChoixRepas(true)}
          style={({ pressed }) => [styles.repas, pressed && { backgroundColor: couleurs.s1 }]}
        >
          <PastilleRepas cle={repas.cle} couleur={couleurs.partieNutrition} />
          <Texte variante="titreBarre" numberOfLines={1} style={{ flexShrink: 1 }}>
            {nomRepas(repas)}
          </Texte>
          <Icone nom="down" couleur={couleurs.t3} taille={16} epaisseur={2} />
        </Pressable>
      ) : null}
      <View style={styles.recherche}>
        <ChampTexte
          style={{ flex: 1 }}
          icone="search"
          value={q}
          onChangeText={setQ}
          placeholder={t("nutrition.rechercher")}
          accessibilityLabel={t("nutrition.rechercher")}
          autoCorrect={false}
          returnKeyType="search"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("nutrition.scanner")}
          onPress={() => router.push({ pathname: "/nutrition/scan", params: ingredient ? { pour: "code" } : { repas: repas?.id ?? "", date } })}
          style={({ pressed }) => [styles.scan, { backgroundColor: pressed ? couleurs.s2 : couleurs.s1 }]}
        >
          <Icone nom="scan" couleur={couleurs.t2} taille={18} />
        </Pressable>
      </View>

      {recherche ? (
        <>
          {sansAttente(platsTrouves).length ? <Source icone="cocotte" libelle={t("plats.mesPlats")} /> : null}
          {sansAttente(platsTrouves).map((x) => lignePlat(x))}
          {locaux.length ? <Source icone="appareil" libelle={t("nutrition.telephone")} /> : null}
          {locaux.map((x) => ligneProduit(x, true, true))}
          {off === null ? (
            <Source icone="horsligne" libelle={t("nutrition.horsLigneCourt")} />
          ) : (
            <Source icone="langue" libelle={t("nutrition.provenanceOff")} />
          )}
          {off === "attente" ? (
            <Texte variante="meta" couleur="t3" style={styles.info}>
              {t("nutrition.recherche")}
            </Texte>
          ) : Array.isArray(off) && enLigne.length === 0 ? (
            <Texte variante="meta" couleur="t3" style={styles.info}>
              {t("nutrition.aucunResultat")}
            </Texte>
          ) : (
            enLigne.map((o) => (
              <LigneCocher
                key={o.codeBarres}
                titre={o.marque ? `${o.nom}, ${o.marque}` : o.nom}
                sous={[`100 ${o.base === "100ml" ? t("nutrition.ml") : t("nutrition.g")}`, chiffres && o.nutriments.energie_kcal != null ? `${nombre(o.nutriments.energie_kcal, 0)} ${t("nutrition.kcal")}` : null].filter(Boolean).join(", ")}
                coche={cocheEnLigne(o)}
                onOuvrir={() => void ouvrirOff(o).catch(signalerErreur())}
                onCocher={() => void basculerOff(o).catch(signalerErreur())}
              />
            ))
          )}
          {ingredient ? null : <LigneIcone icone="plus" titre={t("nutrition.creerNom", { nom: q.trim() })} onPress={creerNom} />}
        </>
      ) : (
        <>
          <View style={{ marginTop: espace.m }}>
            <Onglets<Onglet>
              etiquette={t("nutrition.ajouter")}
              onglets={[
                { valeur: "recents", libelle: t("nutrition.recentsCourt") },
                { valeur: "favoris", libelle: t("nutrition.favoris") },
                ...(ingredient ? [] : [{ valeur: "plats" as const, libelle: t("plats.mesPlats") }]),
                { valeur: "produits", libelle: t("nutrition.mesProduits") },
              ]}
              valeur={onglet}
              onChange={setOnglet}
            />
          </View>
          {onglet === "recents" && ingredient ? (
            <View style={{ marginTop: espace.s }}>{recents.map((x) => ligneProduit(x))}</View>
          ) : onglet === "recents" ? (
            <>
              {/* Entrées de réglage : une carte groupée (D4) ; les aliments proposés dessous restent une liste nue. */}
              <View style={[styles.carte, { backgroundColor: couleurs.s1 }]}>
                <LigneIcone carte premier icone="eclair" titre={t("nutrition.ajoutRapide")} sous={t("nutrition.ajoutRapideSous")} chevron onPress={() => setRapide(true)} />
                <LigneIcone
                  carte
                  icone="classement"
                  titre={t("nutrition.mesAliments")}
                  sous={tp("nutrition.produits", nbAliments)}
                  chevron
                  onPress={() => router.push({ pathname: "/nutrition/aliments", params: { repas: repas?.id ?? "", date } })}
                />
              </View>
              {recents.length || platsRecents.length ? <Source libelle={repas ? t("nutrition.souventAu", { repas: auRepasMin(repas) }) : ""} /> : null}
              {sansAttente(platsRecents).map((x) => lignePlat(x, true))}
              {recents.map((x) => ligneProduit(x))}
            </>
          ) : onglet === "favoris" ? (
            <View style={{ marginTop: espace.xs }}>
              {favoris.length || (!ingredient && platsFav.length) ? (
                <>
                  {ingredient ? null : sansAttente(platsFav).map((x) => lignePlat(x, true))}
                  {favoris.map((x) => ligneProduit(x, false, true))}
                </>
              ) : (
                <Texte variante="corps" couleur="t3" style={styles.vide}>
                  {t("nutrition.aucunFavori")}
                </Texte>
              )}
            </View>
          ) : onglet === "plats" ? (
            <>
              <CadreVide libelle={t("plats.nouveau")} onPress={() => router.push({ pathname: "/nutrition/plat-edition", params: { repas: repas?.id ?? "", date } })} style={{ marginTop: espace.m }} />
              <View style={{ marginTop: espace.xs }}>{sansAttente(plats).map((x) => lignePlat(x))}</View>
            </>
          ) : (
            <>
              <CadreVide libelle={t("nutrition.nouveauProduit")} onPress={() => router.push({ pathname: "/nutrition/creer", params: { repas: repas?.id ?? "", date } })} style={{ marginTop: espace.m }} />
              <View style={{ marginTop: espace.xs }}>{perso.map((x) => ligneProduit(x, false, true))}</View>
            </>
          )}
        </>
      )}
      <FeuilleRapide visible={rapide} repas={repas} date={date} onFermer={() => setRapide(false)} />
      <Feuille visible={choixRepas} onFermer={() => setChoixRepas(false)} titre={t("nutrition.quelRepas")}>
        <Groupe>
          {tousRepas
            .filter((x) => x.actif || x.id === repas?.id)
            .map((x, i) => (
              <Option
                key={x.id}
                premier={i === 0}
                libelle={nomRepas(x)}
                choisi={x.id === repas?.id}
                onPress={() => {
                  setRepasId(x.id);
                  setChoixRepas(false);
                }}
              />
            ))}
        </Groupe>
      </Feuille>
    </PageNutrition>
  );
}

/** « déjeuner », « collation » (après « Souvent au », « Souvent à la »). */
function auRepasMin(r: Repas) {
  return t(r.cle === "collation" ? "nutrition.alaRepas" : "nutrition.auRepas", { repas: minuscule(nomRepas(r)) });
}

/** Titre de groupe (planche `.src`) : icône 14 et libellé 12 t3. */
function Source({ icone, libelle }: { icone?: NomIcone; libelle: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.source}>
      {icone ? <Icone nom={icone} couleur={couleurs.t3} taille={14} /> : null}
      <Texte variante="meta" couleur="t3">
        {libelle}
      </Texte>
    </View>
  );
}

/** Ligne à cocher (planche `.ligne`) : nom et sous-ligne (toucher = fiche), case à droite (toucher = cocher). `plat` : la
 *  cocotte devant la sous-ligne, dans les listes où plats et aliments se mêlent (Récents, Favoris). */
function LigneCocher({ titre, sous, coche, onOuvrir, onCocher, plat }: { titre: string; sous: string; coche: boolean; onOuvrir: () => void; onCocher: () => void; plat?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.ligne, { borderBottomColor: couleurs.line }]}>
      <Pressable accessibilityRole="button" onPress={onOuvrir} style={({ pressed }) => [styles.tx, pressed && { opacity: 0.6 }]}>
        <Texte variante="corps" numberOfLines={1} style={{ fontSize: 15, color: couleurs.t1, fontFamily: coche ? police.medium : police.regular }}>
          {titre}
        </Texte>
        <View style={styles.sous}>
          {plat ? <Icone nom="cocotte" couleur={couleurs.t3} taille={13} epaisseur={2} /> : null}
          <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ flexShrink: 1 }}>
            {sous}
          </Texte>
        </View>
      </Pressable>
      <CaseCocher coche={coche} onPress={onCocher} libelle={titre} />
    </View>
  );
}

/**
 * Ligne avec icône (planche `.ligne > svg`) : Ajout rapide, Mes aliments, Créer « skyr ». `carte` : dans une carte groupée,
 * filet au-dessus sauf pour la `premier`e.
 */
function LigneIcone({ icone, titre, sous, chevron, onPress, carte, premier }: { icone: NomIcone; titre: string; sous?: string; chevron?: boolean; onPress: () => void; carte?: boolean; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.ligne,
        carte
          ? [styles.ligneCarte, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s2 }]
          : [{ borderBottomColor: couleurs.line }, pressed && { backgroundColor: couleurs.s1 }],
      ]}
    >
      <Icone nom={icone} couleur={couleurs.t2} taille={20} />
      <View style={styles.tx}>
        <Texte variante="corps" numberOfLines={1} style={{ fontSize: 15, color: couleurs.t1 }}>
          {titre}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ marginTop: 3 }}>
            {sous}
          </Texte>
        ) : null}
      </View>
      {chevron ? <Icone nom="right" couleur={couleurs.t3} taille={16} /> : null}
    </Pressable>
  );
}

const PROTEINES = plage(0, 150, 5);
const LIPIDES = plage(0, 100, 5);
const GLUCIDES = plage(0, 200, 5);

/** Ajout rapide (planche 10) : nom facultatif, « ~ 610 kcal » calculées des macros, trois roues P / L / G, Ajouter. */
function FeuilleRapide({ visible, repas, date, onFermer }: { visible: boolean; repas: Repas | null; date: string; onFermer: () => void }) {
  const { db } = useApp();
  const [nom, setNom] = useState("");
  const [m, setM] = useState({ proteines: 30, lipides: 15, glucides: 60 });
  useEffect(() => {
    if (visible) {
      setNom("");
      setM({ proteines: 30, lipides: 15, glucides: 60 });
    }
  }, [visible]);
  const ajouter = async () => {
    if (!repas) return;
    await ajoutRapide(db, { nom: nom || t("nutrition.ajoutRapide"), ...m, date, repasId: repas.id });
    onFermer();
    router.dismissTo("/food");
  };
  const roue = (cle: keyof typeof m, valeurs: number[], libelle: string) => (
    <View style={{ flex: 1 }}>
      <RoueDuree
        key={visible ? `${cle}-o` : `${cle}-f`}
        libelle={libelle}
        valeur={m[cle]}
        valeurs={valeurs}
        onChange={(v) => setM((x) => ({ ...x, [cle]: v }))}
        traits={false}
        decoupe={(v) => ({ attenue: "", plein: String(v) })}
        lue={(v) => `${v} ${t("nutrition.g")}`}
      />
      <Texte variante="entete" couleur="t3" style={{ textAlign: "center", marginTop: espace.xs }}>
        {libelle}
      </Texte>
    </View>
  );
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("nutrition.ajoutRapide")}
      sousTitre={repas ? nomRepas(repas) : undefined}
      glisserContenu={false}
      pied={<BoutonPrincipal libelle={t("nutrition.ajouter")} onPress={() => void ajouter().catch(signalerErreur())} />}
    >
      <ChampTexte dansFeuille value={nom} onChangeText={setNom} placeholder={t("nutrition.nom")} accessibilityLabel={t("nutrition.nom")} />
      <Texte variante="titre" style={{ textAlign: "center", fontFamily: police.regular, fontSize: 28, marginTop: espace.s }}>
        {approx(nombre(kcalDepuisMacros(m), 0))}
        <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
          {` ${t("nutrition.kcal")}`}
        </Texte>
      </Texte>
      <View style={{ flexDirection: "row", gap: espace.s }}>
        {roue("proteines", PROTEINES, t("nutrition.proteines"))}
        {roue("lipides", LIPIDES, t("nutrition.lipides"))}
        {roue("glucides", GLUCIDES, t("nutrition.glucides"))}
      </View>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  // Repas sous le titre : pastille, nom, chevron ; zone de 48 (on touche pour changer de repas).
  repas: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", paddingRight: espace.m, marginLeft: -espace.xs, paddingLeft: espace.xs, borderRadius: 12, marginBottom: espace.s },
  recherche: { flexDirection: "row", gap: espace.s, marginTop: espace.xs },
  scan: { width: 52, minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  info: { paddingVertical: espace.s },
  vide: { paddingVertical: espace.l },
  source: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: espace.xl, marginBottom: espace.xs },
  ligne: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: espace.m, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  carte: { borderRadius: rayon.l, overflow: "hidden", marginTop: espace.s, marginBottom: espace.xs },
  ligneCarte: { borderBottomWidth: 0, paddingHorizontal: espace.l },
  tx: { flex: 1, minWidth: 0, minHeight: 52, justifyContent: "center" },
  sous: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
});

export { Entete };
