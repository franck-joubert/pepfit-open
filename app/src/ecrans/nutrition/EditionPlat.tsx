import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chiffresNutrition } from "./mode-affichage";
import { Image, Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { brouillonDepuisRepas, enregistrerPlat, listerPlats, listerRepas, lirePlat, nomCopie, type BrouillonPlat, type Plat } from "../../db";
import { copierPhotoPlat } from "../../photos/copie-plat";
import { effacerPhotoPlat, prendrePhotoPlat, type FichiersPhoto } from "../../photos/plats";
import { fichiers } from "../../sync/local";
import { uriPhoto, type Source } from "../../photos";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { cleJour, macrosPourQuantite, type Nutriments } from "../../nutrition/calculs";
import { poidsCru, valeursPlat, type IngredientPlat, type PlatCalcul } from "../../nutrition/plats";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { ListeDesintegrable } from "../../ui/Desintegration";
import { GlisserSupprimer } from "../../ui/GlisserSupprimer";
import { Icone, type NomIcone } from "../../ui/Icone";
import { largeurContenu } from "../../ui/largeur";
import { RoueDuree } from "../../ui/RoueDuree";
import { Texte } from "../../ui/Texte";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { jourSemaineMois, lireNombre, nombre, saisieDecimale } from "../format";
import { CadreVide, ChampTexte, Entete, LibellePrincipal, PageNutrition, plage, SaisieNutrition } from "./commun";
import { leRepas } from "./FeuillesJournal";
import { FeuilleQuantite } from "./FeuilleQuantite";
import { deposerBullePlat, prendreIngredients } from "./plat-brouillon";
import { AjoutCarte, CartePlat, CarteValeurs, EnteteColonnes, LigneIngredient, masseG, texteIngredient } from "./plats-commun";

// Créer ou modifier un plat (planche plats, 1a à 1e, 2b, 5c à 5e) : la photo en tête (réglée ici seulement, D4 : « Ajouter une
// photo » sur un fond sobre, ou la photo et « Changer la photo »), le nom, la carte des ingrédients aux colonnes du journal
// (toucher = sa roue, glisser = le retirer, « + Ajouter un ingrédient » ouvre Ajouter en mode ingrédient), Portions et poids
// (portions à la roue, poids cuit au clavier : D3), puis les valeurs (1 portion, 100 g, plat entier). Ouvert aussi depuis le
// ⋯ d'un repas (P9 : prérempli, une portion, curseur sur le nom) et par « Dupliquer » (« Nom (2) », P11).

const PORTIONS = plage(1, 20, 1);

type Ligne = Omit<IngredientPlat, "id"> & { id?: string; cle: string };
let compteur = 0;
const cle = () => `i${++compteur}`;

export function EditionPlat() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const p = useLocalSearchParams<{ id?: string; copie?: string; depuis?: string; date?: string; repas?: string }>();
  const modif = !!p.id;
  const [pret, setPret] = useState(false);
  const [origine, setOrigine] = useState<Plat | null>(null);
  const [nom, setNom] = useState("");
  const [portions, setPortions] = useState(1);
  const [poidsCuit, setPoidsCuit] = useState<number | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [photo, setPhoto] = useState<FichiersPhoto | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<"portions" | "poids" | "photo" | null>(null);
  const [edite, setEdite] = useState<Ligne | null>(null);
  const [refus, setRefus] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Photos prises ici et pas encore enregistrées : effacées si on part sans enregistrer, ou remplacées avant.
  const prises = useRef(new Map<string, FichiersPhoto>());
  const enregistre = useRef(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    (async () => {
      const src = p.id ?? p.copie;
      if (src) {
        const x = await lirePlat(db, src);
        if (!x) return router.back();
        setOrigine(p.id ? x : null);
        setNom(p.copie ? nomCopie(x.nom, new Set((await listerPlats(db)).map((y) => y.nom))) : x.nom);
        setPortions(x.portions);
        setPoidsCuit(x.poids_cuit_g);
        setLignes(x.ingredients.map((i) => ({ ...i, id: p.copie ? undefined : i.id, cle: cle() })));
        // Copie : la photo de l'original s'affiche ; ses fichiers ne sont copiés qu'à l'enregistrement (jamais partagés).
        setPhoto(x.photo && x.photo_vignette ? { photo: x.photo, vignette: x.photo_vignette } : null);
        if (p.id) setInfo(t("plats.regleModif"));
      } else if (p.depuis === "repas" && p.date && p.repas) {
        const b = await brouillonDepuisRepas(db, p.date, p.repas);
        const r = (await listerRepas(db, true)).find((x) => x.id === p.repas);
        setLignes(b.ingredients.map((i) => ({ ...i, cle: cle() })));
        setInfo(t("plats.depuisRepas", { repas: r ? leRepas(r) : "", jour: jourSemaineMois(new Date(`${p.date}T12:00:00`)) }));
      }
      setPret(true);
    })().catch((e) => console.error(e));
  }, [db, p.id, p.copie, p.depuis, p.date, p.repas]);

  // Retour d'Ajouter en mode ingrédient (ou de la fiche d'un aliment) : les ingrédients choisis s'ajoutent à la fin.
  useFocusEffect(
    useCallback(() => {
      const l = prendreIngredients();
      if (l.length) setLignes((cur) => [...cur, ...l.map((x) => ({ ...x, cle: cle() }))]);
    }, []),
  );
  useEffect(
    () => () => {
      if (!enregistre.current) for (const f of prises.current.values()) effacerPhotoPlat(f);
    },
    [],
  );

  const sans = !!origine?.sans_ingredients && lignes.length === 0;
  const calcul: PlatCalcul = useMemo(
    () => ({
      portions,
      poids_cuit_g: poidsCuit,
      sans_ingredients: sans,
      nutriments_100g: origine?.nutriments_100g ?? null,
      poids_total_g: origine?.poids_total_g ?? null,
      ingredients: lignes.map((l) => ({ ...l, id: l.cle })),
    }),
    [portions, poidsCuit, sans, origine, lignes],
  );
  const v = valeursPlat(calcul);
  const cru = poidsCru(lignes);
  const peut = !!nom.trim() && (lignes.length > 0 || sans);

  const enregistrer = async () => {
    if (!peut) return;
    // Copie dont la photo est encore celle de l'original : un fichier à elle (null si l'original n'est pas sur ce téléphone).
    const aCopier = !!p.copie && !!photo && !prises.current.has(photo.photo);
    const photoFinale = aCopier && photo ? await copierPhotoPlat(fichiers, photo) : photo;
    const b: BrouillonPlat = {
      nom,
      portions,
      poids_cuit_g: poidsCuit,
      ingredients: lignes.map(({ cle: _, ...x }) => x),
      photo: photoFinale,
      sans_ingredients: sans,
      nutriments_100g: sans ? (origine?.nutriments_100g as Nutriments) : null,
      poids_total_g: sans ? (origine?.poids_total_g ?? null) : null,
    };
    const r = await enregistrerPlat(db, b, origine?.id);
    enregistre.current = true;
    effacerPhotoPlat(r.anciennePhoto);
    for (const f of prises.current.values()) if (f.photo !== photo?.photo) effacerPhotoPlat(f);
    if (p.depuis === "repas") {
      // Repas → plat (P9) : le journal ne change pas, une bulle « Voir » mène au plat.
      deposerBullePlat({ nom: nom.trim(), platId: r.id });
      router.back();
    } else if (modif) router.back();
    else router.replace({ pathname: "/nutrition/plat", params: { id: r.id, repas: p.repas ?? "", date: p.date ?? cleJour(new Date()) } });
  };

  const choisirPhoto = async (source: Source) => {
    setFeuille(null);
    setEnvoi(true);
    try {
      const f = await prendrePhotoPlat(source);
      if (!f) return;
      // Une photo prise ici et remplacée avant d'enregistrer ne sert plus.
      if (photo && prises.current.has(photo.photo)) {
        effacerPhotoPlat(photo);
        prises.current.delete(photo.photo);
      }
      prises.current.set(f.photo, f);
      setPhoto(f);
    } catch (e) {
      if (e instanceof Error && e.message === "permission") setRefus(true);
      else signalerErreur()(e);
    } finally {
      setEnvoi(false);
    }
  };
  const retirerPhoto = () => {
    setFeuille(null);
    if (photo && prises.current.has(photo.photo)) {
      effacerPhotoPlat(photo);
      prises.current.delete(photo.photo);
    }
    setPhoto(null);
  };

  const ajouterIngredient = () => router.push({ pathname: "/nutrition/ajouter", params: { pour: "plat", plat: nom.trim() || t("plats.nouveau") } });
  const retirer = (l: Ligne) => setLignes((cur) => cur.filter((x) => x.cle !== l.cle));
  const hauteurPhoto = largeurContenu(width) >= 600 ? 220 : 176;
  const pied = modif ? t("ui.enregistrer") : t("plats.enregistrer");

  if (!pret) return <PageNutrition titre={modif ? t("plats.modifier") : t("plats.nouveau")}>{null}</PageNutrition>;
  return (
    <PageNutrition
      titre={modif ? t("plats.modifier") : t("plats.nouveau")}
      pied={
        <BoutonPrincipal libelle={pied} desactive={!peut} onPress={() => void enregistrer().catch(signalerErreur())}>
          <LibellePrincipal libelle={pied} complement={!modif && peut ? tp("plats.nPortions", portions) : undefined} />
        </BoutonPrincipal>
      }
    >
      {info ? <Info icone={modif ? "info" : "assiette"} texte={info} /> : null}
      <ZonePhoto photo={photo} hauteur={hauteurPhoto} envoi={envoi} onPress={() => setFeuille("photo")} style={{ marginTop: info ? espace.m : espace.xs }} />
      <ChampTexte
        value={nom}
        onChangeText={setNom}
        placeholder={t("plats.nom")}
        accessibilityLabel={t("plats.nom")}
        autoFocus={!modif && !p.copie}
        style={{ marginTop: espace.m }}
      />

      <Entete
        style={styles.entete}
        droite={
          lignes.length ? (
            <Texte variante="meta" couleur="t3">
              {t("plats.cru", { poids: masseG(cru) })}
            </Texte>
          ) : undefined
        }
      >
        {lignes.length ? t("plats.ingredientsN", { n: lignes.length }) : t("plats.ingredients")}
      </Entete>
      <ListeDesintegrable
        liste={lignes}
        cleDe={(l) => l.cle}
        autour={(elements) => (
          <CartePlat>
            <EnteteColonnes />
            {elements}
            <AjoutCarte libelle={t("plats.ajouterIngredient")} onPress={ajouterIngredient} />
          </CartePlat>
        )}
        vide={
          <>
            <CadreVide libelle={t("plats.ajouterIngredient")} onPress={ajouterIngredient} />
            <Texte variante="meta" couleur="t3" style={styles.aide}>
              {t("plats.aideVide")}
            </Texte>
          </>
        }
        rendu={(l, etat) => (
          <GlisserSupprimer actif={etat !== "sort"} cle={l.cle} onSupprimer={() => retirer(l)} fondContenu={couleurs.s1}>
            <LigneIngredient nom={l.produit.nom} quantite={texteIngredient(l)} m={macrosPourQuantite(l.produit.nutriments, l.quantite_g)} onPress={() => setEdite(l)} />
          </GlisserSupprimer>
        )}
      />

      <Entete style={styles.entete}>{t("plats.portionsEtPoids")}</Entete>
      <CartePlat>
        <LigneReg premier icone="list" libelle={t("plats.portions")} valeur={String(portions)} onPress={() => setFeuille("portions")} />
        <LigneReg
          icone="balance"
          libelle={t("plats.poidsCuit")}
          sous={poidsCuit ? t("plats.poidsCuitPese") : t("plats.poidsCuitFacultatif")}
          valeur={poidsCuit ? masseG(poidsCuit) : "—"}
          vide={!poidsCuit}
          onPress={() => setFeuille("poids")}
        />
      </CartePlat>

      {lignes.length || sans ? (
        <>
          <Entete style={styles.entete}>{t("plats.valeurs")}</Entete>
          <CarteValeurs portion={v.portion} portionG={v.portionG} cent={v.cent} entier={v.entier} poidsG={v.poidsG} />
        </>
      ) : null}

      <FeuilleQuantite
        visible={edite != null}
        titre={edite?.produit.nom}
        produit={edite?.produit ?? null}
        quantite={edite}
        onFermer={() => setEdite(null)}
        onValider={(q) => {
          const e = edite;
          setEdite(null);
          if (e) setLignes((cur) => cur.map((x) => (x.cle === e.cle ? { ...x, ...q } : x)));
        }}
        action={{
          libelle: t("plats.retirerIngredient"),
          icone: "moins",
          onPress: () => {
            const e = edite;
            setEdite(null);
            if (e) retirer(e);
          },
        }}
      />
      <FeuillePortions
        visible={feuille === "portions"}
        nom={nom.trim() || t("plats.nouveau")}
        calcul={calcul}
        onFermer={() => setFeuille(null)}
        onValider={(n) => {
          setPortions(n);
          setFeuille(null);
        }}
      />
      <FeuillePoidsCuit
        visible={feuille === "poids"}
        nom={nom.trim() || t("plats.nouveau")}
        valeur={poidsCuit}
        onFermer={() => setFeuille(null)}
        onValider={(g) => {
          setPoidsCuit(g);
          setFeuille(null);
        }}
      />
      <Feuille visible={feuille === "photo"} onFermer={() => setFeuille(null)} titre={photo ? t("plats.photoTitre") : t("plats.photoAjouter")} sousTitre={nom.trim() || undefined}>
        <Groupe>
          <Option premier icone="camera" libelle={t("exercices.photo.prendre")} onPress={() => void choisirPhoto("appareil")} />
          <Option icone="image" libelle={t("exercices.photo.galerie")} onPress={() => void choisirPhoto("galerie")} />
        </Groupe>
        {photo ? (
          <Groupe>
            <Option premier icone="trash" danger libelle={t("plats.photoSupprimer")} onPress={retirerPhoto} />
          </Groupe>
        ) : null}
      </Feuille>
      <Feuille visible={refus} onFermer={() => setRefus(false)} titre={t("exercices.photo.refusee")}>
        <Groupe>
          <Option
            premier
            icone="camera"
            libelle={t("exercices.photo.autoriser")}
            onPress={() => {
              setRefus(false);
              Linking.openSettings().catch(() => {});
            }}
          />
          <Option libelle={t("ui.fermer")} onPress={() => setRefus(false)} />
        </Groupe>
      </Feuille>
    </PageNutrition>
  );
}

/** Ligne d'information (`.info`) : icône 16 t3 et texte 13 t2. */
function Info({ icone, texte }: { icone: NomIcone; texte: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.info}>
      <Icone nom={icone} couleur={couleurs.t3} taille={16} />
      <Texte variante="corps" couleur="t2" style={{ flex: 1, lineHeight: 19 }}>
        {texte}
      </Texte>
    </View>
  );
}

/**
 * Photo en modification (`.ph-edit`, 176 dp, 220 en 640) : à la place qu'elle aura sur la fiche. Sans photo, fond sobre, la
 * cocotte et « Ajouter une photo » ; avec, la photo et « Changer la photo » en bas à droite. Toucher = la feuille.
 */
function ZonePhoto({ photo, hauteur, envoi, onPress, style }: { photo: FichiersPhoto | null; hauteur: number; envoi: boolean; onPress: () => void; style?: object }) {
  const { couleurs, mode } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={photo ? t("plats.photoChanger") : t("plats.photoAjouter")}
      disabled={envoi}
      onPress={onPress}
      style={[
        styles.photo,
        { height: hauteur, opacity: envoi ? 0.5 : 1 },
        !photo && { backgroundColor: mode === "nuit" ? couleurs.s2 : couleurs.s1, borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.verreFilet },
        style,
      ]}
    >
      {photo ? (
        <>
          <Image source={{ uri: uriPhoto(photo.photo) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={styles.changer}>
            <Icone nom="camera" couleur="rgba(255,255,255,0.94)" taille={18} />
            <Texte variante="saisie" style={{ fontSize: 14, color: "rgba(255,255,255,0.94)" }}>
              {t("plats.photoChanger")}
            </Texte>
          </View>
        </>
      ) : (
        <>
          <Icone nom="cocotte" couleur={couleurs.t3} taille={40} epaisseur={1.4} />
          <View style={[styles.inviter, { backgroundColor: mode === "nuit" ? couleurs.s3 : couleurs.s2 }]}>
            <Icone nom="camera" couleur={couleurs.t2} taille={18} />
            <Texte variante="saisie" style={{ fontSize: 14 }}>
              {t("plats.photoAjouter")}
            </Texte>
          </View>
        </>
      )}
    </Pressable>
  );
}

/** Ligne de réglage d'une carte (`.reg`) : icône, libellé et sous-ligne, valeur (t3 si vide), chevron ; 60 de haut. */
function LigneReg({ icone, libelle, sous, valeur, vide, onPress, premier }: { icone: NomIcone; libelle: string; sous?: string; valeur: string; vide?: boolean; onPress: () => void; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle}, ${valeur}`}
      onPress={onPress}
      style={({ pressed }) => [styles.reg, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }, pressed && { backgroundColor: couleurs.s2 }]}
    >
      <Icone nom={icone} couleur={couleurs.t3} taille={20} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="corps" style={{ fontSize: 16, color: couleurs.t1 }} numberOfLines={1}>
          {libelle}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }} numberOfLines={2}>
            {sous}
          </Texte>
        ) : null}
      </View>
      <Texte variante="corps" couleur={vide ? "t3" : "t2"} style={{ fontSize: 16 }} numberOfLines={1}>
        {valeur}
      </Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

/** Portions à la roue (1e) : « 1 portion = 540 g · 569 kcal » suit la roue ; « Valider · 4 portions ». */
function FeuillePortions({ visible, nom, calcul, onFermer, onValider }: { visible: boolean; nom: string; calcul: PlatCalcul; onFermer: () => void; onValider: (n: number) => void }) {
  const [n, setN] = useState(calcul.portions);
  useEffect(() => {
    if (visible) setN(calcul.portions);
  }, [visible, calcul.portions]);
  const v = valeursPlat({ ...calcul, portions: n });
  const poids = calcul.poids_cuit_g ? t("plats.cuit", { poids: masseG(calcul.poids_cuit_g) }) : masseG(v.poidsG);
  const libelle = t("ui.valider");
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("plats.portions")}
      sousTitre={`${nom}, ${poids}`}
      glisserContenu={false}
      pied={
        <BoutonPrincipal libelle={libelle} onPress={() => onValider(n)}>
          <LibellePrincipal libelle={libelle} complement={tp("plats.nPortions", n)} />
        </BoutonPrincipal>
      }
    >
      <RoueDuree
        key={visible ? "o" : "f"}
        libelle={t("plats.portions")}
        valeur={calcul.portions}
        valeurs={PORTIONS}
        onChange={setN}
        traits={false}
        unite={t("plats.portionsUnite")}
        decoupe={(x) => ({ attenue: "", plein: String(x) })}
        lue={(x) => tp("plats.nPortions", x)}
      />
      {v.poidsG > 0 ? (
        <Texte variante="meta" couleur="t3" style={{ textAlign: "center", marginTop: espace.xs, marginBottom: espace.m }}>
          {chiffresNutrition() ? t("plats.portionEgal", { poids: masseG(v.portionG), kcal: nombre(v.portion.kcal, 0) }) : t("plats.portionEgalPoids", { poids: masseG(v.portionG) })}
        </Texte>
      ) : null}
    </Feuille>
  );
}

/** Poids cuit au clavier numérique (D3 : lu sur la balance, comme une étiquette) ; « Sans poids cuit » le retire. */
function FeuillePoidsCuit({ visible, nom, valeur, onFermer, onValider }: { visible: boolean; nom: string; valeur: number | null; onFermer: () => void; onValider: (g: number | null) => void }) {
  const { couleurs } = useTheme();
  const [texte, setTexte] = useState("");
  useEffect(() => {
    if (visible) setTexte(valeur ? String(valeur).replace(".", ",") : "");
  }, [visible, valeur]);
  const g = lireNombre(texte);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("plats.poidsCuit")}
      sousTitre={t("plats.poidsCuitSous", { nom })}
      pied={<BoutonPrincipal libelle={t("ui.valider")} onPress={() => onValider(g && g > 0 ? g : null)} />}
    >
      <SaisieNutrition
        cadre={[styles.poids, { backgroundColor: couleurs.feuilleGroupe }]}
        apres={
          <Texte variante="corps" couleur="t2" style={{ fontSize: 16 }}>
            {t("nutrition.g")}
          </Texte>
        }
        value={texte}
        onChangeText={(x) => setTexte(saisieDecimale(x))}
        keyboardType="decimal-pad"
        autoFocus
        maxLength={7}
        placeholder="0"
        accessibilityLabel={t("plats.poidsCuit")}
        style={[styles.saisiePoids, { color: couleurs.t1 }]}
      />
      {valeur ? (
        <Groupe>
          <Option premier icone="close" libelle={t("plats.poidsCuitRetirer")} onPress={() => onValider(null)} />
        </Groupe>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  entete: { marginTop: 22, marginBottom: espace.s },
  aide: { marginTop: espace.s, lineHeight: 17 },
  info: { flexDirection: "row", alignItems: "flex-start", gap: espace.s, marginTop: espace.xs },
  photo: { borderRadius: rayon.l, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 14 },
  changer: { position: "absolute", right: 8, bottom: 8, height: 44, paddingHorizontal: 14, borderRadius: rayon.l, backgroundColor: "rgba(0,0,0,0.55)", flexDirection: "row", alignItems: "center", gap: espace.s },
  inviter: { height: 44, paddingHorizontal: 16, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.s },
  reg: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingVertical: 6, paddingLeft: 16, paddingRight: 14 },
  poids: { minHeight: 56, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", paddingHorizontal: espace.l, gap: espace.s },
  saisiePoids: { flex: 1, padding: 0, margin: 0, fontFamily: police.medium, fontSize: 22, textAlign: "right" },
});
