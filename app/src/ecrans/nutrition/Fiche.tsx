import { useEffect, useMemo, useState } from "react";
import { useChiffresNutrition } from "./mode-affichage";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { produitOffParCode } from "../../nutrition/off";
import {
  ajouterConsommation, basculerFavori, deplacerConsommation, listerRepas, modifierConsommation, modifierPortionsProduit, produitParId, statsProduit, trouverParCode,
  type Produit, type Repas, type StatsProduit,
} from "../../db";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { cleJour, grammesDepuisUnite, macrosPourQuantite, portionDe, unitesDisponibles, type Portion, type Unite } from "../../nutrition/calculs";
import {
  aUnePortion, avecValeur, grammesApres, horsGrille, ordreUnites, quantiteDepuisGrammes, quantiteLue, quantiteTexte, sousOnglet, valeursPourUnite,
} from "../../nutrition/quantite";
import { BoutonIcone } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Icone, type NomIcone } from "../../ui/Icone";
import { RoueDuree } from "../../ui/RoueDuree";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { approx, jourMois, nombre } from "../format";
import { deposerRetraitFiche } from "./retrait-fiche";
import { figer } from "../../nutrition/plats";
import { deposerIngredients } from "./plat-brouillon";
import { auRepas, libelleUnite, LibellePrincipal, nomRepas, PageNutrition, valeurTexte } from "./commun";
import { FeuillePortion } from "./FeuillePortion";

// Fiche d'un aliment (planche 11 et 12) : nom, marque, Nutri-Score et NOVA, provenance, vignette ; kcal de la quantité en
// chiffre fort ; protéines, glucides, lipides, sucres recalculés à chaque cran ; unités en segmenté (g / portion / pièce / paquet,
// avec leur poids ; une unité n'existe que si son poids est connu) ; roue ; « Ce produit ». ♥ = favori ; ⋯ = repas, retirer.

/** Provenance : Open Food Facts, pepfit, Fitatu (import) ou Perso, avec son icône. */
export function provenanceDe(p: Produit): { icone: NomIcone; texte: string } {
  if (p.import_cle?.startsWith("fitatu:")) return { icone: "appareil", texte: t("nutrition.provenanceFitatu") };
  if (p.source === "off") return { icone: "langue", texte: t("nutrition.provenanceOff") };
  if (p.source === "fonte") return { icone: "cible", texte: t("nutrition.provenancePepfit") };
  return { icone: "appareil", texte: t("nutrition.provenancePerso") };
}

export function Fiche() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const chiffres = useChiffresNutrition();
  const p = useLocalSearchParams<{ produit?: string; conso?: string; code?: string; repas?: string; date?: string; pour?: string }>();
  // Ouverte depuis Ajouter en mode ingrédient (planche plats, P8) : « Ajouter au plat » rend l'aliment et sa quantité au plat.
  const pourPlat = p.pour === "plat";
  const [produit, setProduit] = useState<Produit | null>(null);
  const [repas, setRepas] = useState<Repas[]>([]);
  const [repasId, setRepasId] = useState(p.repas ?? "");
  /** Repas de la ligne modifiée : changé par le ⋯, elle y part (à la fin). */
  const [repasOrigine, setRepasOrigine] = useState<string | null>(null);
  const [date, setDate] = useState(p.date || cleJour(new Date()));
  const [unite, setUnite] = useState<Unite>("g");
  const [nb, setNb] = useState(100);
  const [pret, setPret] = useState(false);
  const [menu, setMenu] = useState(false);
  /** Feuille « Modifier la fiche » (poids du paquet, portions). */
  const [feuillePortion, setFeuillePortion] = useState(false);
  /** Quantité hors des crans de la roue (200 g = 0,83 paquet) : ajoutée à la roue pour que l'unité change sans bouger la quantité. */
  const [extra, setExtra] = useState<number | null>(null);
  const [stats, setStats] = useState<StatsProduit | null>(null);
  const edition = p.conso != null;
  // Les paramètres d'un lien peuvent arriver après le premier rendu.
  useEffect(() => {
    if (p.repas) setRepasId(p.repas);
    if (p.date) setDate(p.date);
  }, [p.repas, p.date]);

  useEffect(() => {
    (async () => {
      const tous = await listerRepas(db, true);
      setRepas(tous);
      let id = p.produit;
      if (p.conso) {
        const l = await db.getFirstAsync<{ produit_id: string; repas_id: string; date: string; unite: Unite; nb_unites: number }>("SELECT produit_id, repas_id, date, unite, nb_unites FROM consommations WHERE id = ?", [p.conso]);
        if (!l) return router.back();
        id = l.produit_id;
        setRepasId(l.repas_id);
        setRepasOrigine(l.repas_id);
        setDate(l.date);
        setUnite(l.unite);
        setNb(l.nb_unites);
        setExtra(horsGrille(l.unite, l.nb_unites));
      }
      // Ouvert par code (lien, scanner) : inconnu ici, on le demande à Open Food Facts, et on le garde.
      const prod = id ? await produitParId(db, id) : p.code ? await trouverParCode(db, p.code, produitOffParCode) : null;
      if (!prod) return router.back();
      setProduit(prod);
      if (!p.conso) {
        const portion = portionDe(prod.portions, "portion");
        setUnite(portion ? "portion" : "g");
        setNb(portion ? 1 : 100);
        if (!p.repas) setRepasId(tous.find((r) => r.actif)?.id ?? "");
      }
      setStats(await statsProduit(db, prod.id, `${cleJour(new Date()).slice(0, 8)}01`));
      setPret(true);
    })().catch((e) => console.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, p.produit, p.conso, p.code]);

  const unites = useMemo(() => (produit ? ordreUnites(unitesDisponibles(produit.portions)) : (["g"] as Unite[])), [produit]);
  const valeurs = useMemo(() => avecValeur(valeursPourUnite(unite), extra), [unite, extra]);
  const grammes = produit ? (grammesDepuisUnite(unite, nb, produit.portions) ?? nb) : 0;
  const m = produit ? macrosPourQuantite(produit.nutriments, grammes) : null;
  const choisirUnite = (u: Unite) => {
    if (!produit || u === unite) return;
    // La quantité suit : mêmes grammes dans l'unité choisie (hors crans de la roue, la valeur exacte s'y ajoute).
    const q = quantiteDepuisGrammes(u, grammes, produit.portions) ?? { nb: 1, horsGrille: false };
    setUnite(u);
    setNb(q.nb);
    setExtra(q.horsGrille ? q.nb : null);
  };
  /** Portions saisies : la fiche locale les garde ; la quantité reste la même en grammes, dans l'unité si elle existe encore. */
  const enregistrerPortions = async (portions: Portion[]) => {
    if (!produit) return;
    await modifierPortionsProduit(db, produit.id, portions);
    const suivant = { ...produit, portions };
    const q = quantiteDepuisGrammes(unite, grammes, portions);
    setProduit(suivant);
    if (q) {
      setNb(q.nb);
      setExtra(q.horsGrille ? q.nb : null);
    } else {
      setUnite("g");
      setNb(Math.max(1, Math.round(grammes)));
      setExtra(horsGrille("g", Math.max(1, Math.round(grammes))));
    }
    setFeuillePortion(false);
  };

  if (!produit || !m || !pret) return <PageNutrition titre="">{null}</PageNutrition>;
  const r = repas.find((x) => x.id === repasId);
  const valider = async () => {
    if (pourPlat) {
      deposerIngredients([{ produit_id: produit.id, produit: figer(produit), quantite_g: grammes, unite, nb_unites: nb }]);
      // Fiche ← Ajouter (mode ingrédient) ← page du plat.
      router.dismiss(2);
      return;
    }
    if (edition && p.conso) {
      await modifierConsommation(db, p.conso, { quantiteG: grammes, unite, nbUnites: nb });
      if (repasOrigine && repasId !== repasOrigine) await deplacerConsommation(db, p.conso, repasId, Number.MAX_SAFE_INTEGER);
    }
    else await ajouterConsommation(db, { date, repasId, produitId: produit.id, quantiteG: grammes, unite, nbUnites: nb });
    router.dismissTo("/food");
  };
  const retirer = () => {
    if (!p.conso) return;
    setMenu(false);
    // Le journal la retire en revenant : désintégration et « Annuler », comme au glisser.
    deposerRetraitFiche(p.conso);
    router.back();
  };
  const prov = provenanceDe(produit);
  const enGrammes = unite === "g";
  const grammesDe = (v: number) => grammesDepuisUnite(unite, v, produit.portions) ?? v;
  const base = produit.base === "100ml" ? t("nutrition.ml") : t("nutrition.g");
  const libelle = libelleUnite(unite, produit.portions.find((x) => x.type === unite)?.libelle);
  // Sous chaque onglet, la quantité choisie dans son unité : « 200 g », « 83 % » du paquet, « 3,3 » portions.
  const sousUnite = (u: Unite) => sousOnglet(u, grammes, produit.portions, base);
  const egal = enGrammes ? undefined : approx(`${nombre(grammes, 0)} ${base}`, unite === "piece");
  const pied = pourPlat ? t("plats.ajouterAuPlat") : edition ? t("ui.enregistrer") : r ? t("nutrition.ajouterAu", { repas: auRepas(r) }) : t("nutrition.ajouter");

  return (
    <PageNutrition
      titre=""
      droite={
        <>
          <BoutonIcone
            nom={produit.favori ? "coeurp" : "coeur"}
            couleur={produit.favori ? couleurs.partieNutrition : undefined}
            libelle={t(produit.favori ? "nutrition.retirerFavori" : "nutrition.ajouterFavori")}
            onPress={() => basculerFavori(db, produit.id, !produit.favori).then(() => setProduit({ ...produit, favori: !produit.favori }))}
          />
          {pourPlat ? null : <BoutonIcone nom="more" libelle={t("nutrition.optionsAliment")} onPress={() => setMenu(true)} />}
        </>
      }
      pied={
        <BoutonPrincipal libelle={pied} onPress={() => valider().catch((x) => console.error(x))}>
          <LibellePrincipal libelle={pied} complement={egal ?? `${nombre(grammes, 0)} ${base}`} />
        </BoutonPrincipal>
      }
    >
      <View style={styles.idf}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="titre" style={{ lineHeight: 25 }}>
            {produit.nom}
          </Texte>
          <View style={styles.marque}>
            {produit.marque ? (
              <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ flexShrink: 1 }}>
                {produit.marque}
              </Texte>
            ) : null}
            {produit.nutriscore ? <Note texte={produit.nutriscore.toUpperCase()} /> : null}
            {produit.nova ? (
              <View style={styles.score}>
                <Texte variante="meta" couleur="t2">
                  {t("nutrition.novaCourt")}
                </Texte>
                <Note texte={String(produit.nova)} />
              </View>
            ) : null}
          </View>
          <View style={styles.prov}>
            <Icone nom={prov.icone} couleur={couleurs.t3} taille={13} />
            <Texte variante="meta" couleur="t3">
              {prov.texte}
            </Texte>
          </View>
        </View>
        <View style={[styles.vignette, { backgroundColor: couleurs.s1 }]}>
          <Icone nom="paquet" couleur={couleurs.t3} taille={24} epaisseur={1.5} />
        </View>
      </View>

      <View style={[styles.kcal, !chiffres && { display: "none" }]}>
        <Texte variante="chiffreFort">{valeurTexte(m.kcal, m.approx)}</Texte>
        <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
          {t("nutrition.kcal")}
        </Texte>
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
                {` ${t("nutrition.g")}`}
              </Texte>
            </Texte>
          </View>
        ))}
      </View>

      {unites.length > 1 ? (
        <View style={{ marginTop: 22 }}>
          <Segmente<Unite> options={unites.map((u) => ({ valeur: u, libelle: libelleMaj(libelleUnite(u, produit.portions.find((x) => x.type === u)?.libelle)), sous: sousUnite(u) }))} valeur={unite} onChange={choisirUnite} />
        </View>
      ) : null}
      {aUnePortion(produit.portions) ? null : (
        <Pressable accessibilityRole="button" onPress={() => setFeuillePortion(true)} style={styles.inviter}>
          <Texte variante="meta" couleur="t3">
            {t("nutrition.definirPortion")}
          </Texte>
        </Pressable>
      )}
      <View style={{ marginTop: espace.s }}>
        <RoueDuree
          key={`${unite}|${extra ?? ""}`}
          libelle={t("nutrition.quantite")}
          valeur={nb}
          valeurs={valeurs}
          onChange={setNb}
          traits={false}
          fond={couleurs.bg}
          bande={couleurs.s1}
          unite={enGrammes ? base : libelle}
          // Paquet, portion, pièce : la fraction et, atténués, les grammes (« ½, 120 g ») ; la valeur lue dit les deux.
          decoupe={(v) => {
            const plein = quantiteTexte(unite, v);
            return { attenue: "", plein, apres: enGrammes ? undefined : grammesApres(plein, grammesDe(v), base) };
          }}
          lue={(v) => quantiteLue(unite, v, grammesDe(v), libelle, produit.base === "100ml")}
        />
      </View>

      {stats && (stats.foisMois > 0 || stats.totalG > 0) ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/nutrition/aliments", params: { repas: repasId, date } })} style={styles.statsTete}>
            <Texte variante="entete" couleur="t3" style={{ flex: 1 }}>
              {t("nutrition.cProduit")}
            </Texte>
            {stats.premiere ? (
              <Texte variante="meta" couleur="t3">
                {t("nutrition.vuLe", { jour: jourMois(new Date(`${stats.premiere}T12:00:00`)) })}
              </Texte>
            ) : null}
            <Icone nom="right" couleur={couleurs.t3} taille={16} />
          </Pressable>
          <View style={[styles.stats, { backgroundColor: couleurs.s1 }]}>
            <Stat valeur={`${stats.foisMois}×`} libelle={t("nutrition.ceMois")} />
            <Stat valeur={stats.totalG >= 1000 ? `${nombre(stats.totalG / 1000, 1)} ${produit.base === "100ml" ? "l" : t("nutrition.kg")}` : `${nombre(stats.totalG, 0)} ${base}`} libelle={t("nutrition.auTotal")} />
            <Stat valeur={(() => {
              const x = repas.find((y) => y.id === stats.repasFrequent);
              return x ? nomRepas(x) : "—";
            })()} libelle={t("nutrition.lePlusSouvent")} />
          </View>
        </>
      ) : null}

      <Feuille visible={menu} onFermer={() => setMenu(false)} titre={produit.nom}>
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
            libelle={t("nutrition.modifierFiche")}
            onPress={() => {
              setMenu(false);
              setFeuillePortion(true);
            }}
          />
        </Groupe>
        {edition ? (
          <Groupe>
            <Option premier icone="trash" danger libelle={t("nutrition.retirerDuRepas")} onPress={retirer} />
          </Groupe>
        ) : null}
      </Feuille>
      <FeuillePortion visible={feuillePortion} portions={produit.portions} ml={produit.base === "100ml"} onFermer={() => setFeuillePortion(false)} onEnregistrer={(x) => void enregistrerPortions(x).catch((e) => console.error(e))} />
    </PageNutrition>
  );
}

const libelleMaj = (s: string) => (s === "g" || s === "ml" ? s : s.charAt(0).toUpperCase() + s.slice(1));

/** Pastille de note (Nutri-Score, NOVA) : 18, rayon 5, s2, 11 semi-gras. */
function Note({ texte }: { texte: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: couleurs.s2 }]}>
      <Texte variante="meta" style={{ fontSize: 11, fontFamily: police.semibold, color: couleurs.t1 }}>
        {texte}
      </Texte>
    </View>
  );
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
  marque: { flexDirection: "row", alignItems: "center", gap: espace.s, marginTop: 3 },
  score: { flexDirection: "row", alignItems: "center", gap: 4 },
  note: { minWidth: 18, height: 18, borderRadius: 5, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  prov: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  vignette: { width: 56, height: 56, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  kcal: { flexDirection: "row", alignItems: "baseline", gap: espace.s, marginTop: 22 },
  macros: { flexDirection: "row", gap: espace.m, marginTop: 14 },
  inviter: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: 2 },
  statsTete: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginTop: espace.xl },
  stats: { flexDirection: "row", gap: espace.m, paddingVertical: 14, paddingHorizontal: espace.l, borderRadius: rayon.l },
});
