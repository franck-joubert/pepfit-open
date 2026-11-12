import { useEffect, useRef, useState } from "react";
import { useChiffresNutrition } from "./mode-affichage";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { ajouterConsommation, listerRepas, trouverParCode, type Produit, type Repas } from "../../db";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { cleJour, grammesDepuisUnite, macrosPourQuantite } from "../../nutrition/calculs";
import { produitOffParCode } from "../../nutrition/off";
import { BoutonIcone } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Groupe, Option } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { Visee } from "../../ui/Visee";
import { useClavier } from "../../ui/useClavier";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { nombre } from "../format";
import { quantiteParDefaut } from "./Ajouter";
import { deposerCodeLu } from "./code-lu";
import { BoutonTonal, MARGE_ECRAN, nomRepas, SaisieNutrition, texteQuantite, valeurTexte } from "./commun";
import { provenanceDe } from "./Fiche";

// Scanner (planche 17 à 19) : la caméra lit les EAN/UPC dans la visée (coins, trait vert) ; produit déjà vu (copie locale,
// hors ligne compris), sinon Open Food Facts. Trouvé : sa fiche courte, « Quantité » (la fiche complète) ou « Ajouter » (sa
// quantité habituelle), et le scanner reste ouvert pour le suivant. Inconnu : créer, le code déjà rempli. « Saisir le code » :
// le champ monte au-dessus du clavier, la recherche part aussi par la touche ✓. Avec pour=code (Nouveau produit), le code
// lu est rendu à la fiche.

type Resultat = { code: string; produit: Produit } | { code: string; produit: null } | null;

export function Scanner() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const chiffres = useChiffresNutrition();
  const p = useLocalSearchParams<{ repas?: string; date?: string; pour?: string }>();
  const date = p.date || cleJour(new Date());
  const pourCode = p.pour === "code";
  const [permission, demander] = useCameraPermissions();
  const [repas, setRepas] = useState<Repas | null>(null);
  const [lampe, setLampe] = useState(false);
  const [resultat, setResultat] = useState<Resultat>(null);
  const [saisie, setSaisie] = useState(false);
  const [code, setCode] = useState("");
  const [cherche, setCherche] = useState(false);
  const [ajoute, setAjoute] = useState<string | null>(null);
  const occupe = useRef(false);
  const bas = useSafeAreaInsets().bottom;
  const clavier = useClavier();
  const { width } = useWindowDimensions();

  useEffect(() => {
    listerRepas(db, true)
      .then((l) => setRepas(l.find((r) => r.id === p.repas) ?? l[0] ?? null))
      .catch(() => {});
  }, [db, p.repas]);

  const chercher = async (c: string) => {
    if (occupe.current) return;
    occupe.current = true;
    if (pourCode) {
      deposerCodeLu(c);
      router.back();
      return;
    }
    setCherche(true);
    try {
      const x = await trouverParCode(db, c, produitOffParCode);
      setSaisie(false);
      setResultat(x ? { code: c, produit: x } : { code: c, produit: null });
    } catch (e) {
      console.error(e);
      occupe.current = false;
    } finally {
      setCherche(false);
    }
  };
  const suivant = () => {
    setResultat(null);
    setCode("");
    setSaisie(false);
    // Laisse la caméra se reposer avant de relire le même code.
    setTimeout(() => (occupe.current = false), 800);
  };
  const ajouter = async (x: Produit) => {
    if (!repas) return;
    const q = quantiteParDefaut(x);
    await ajouterConsommation(db, { date, repasId: repas.id, produitId: x.id, quantiteG: q.quantite_g, unite: q.unite, nbUnites: q.nb_unites });
    setAjoute(x.nom);
    setTimeout(() => setAjoute(null), 2500);
    suivant();
  };

  const x = resultat?.produit;
  const qte = x ? quantiteParDefaut(x) : null;
  const g = x && qte ? (grammesDepuisUnite(qte.unite, qte.nb_unites, x.portions) ?? qte.quantite_g) : 0;
  const m = x ? macrosPourQuantite(x.nutriments, g) : null;
  // Produit trouvé ou inconnu : la même fiche courte, caméra autorisée ou non (saisie du code au clavier).
  const panneau =
    x && m ? (
      <View style={[styles.panneau, { backgroundColor: couleurs.feuilleFond, paddingBottom: bas + espace.l }]}>
        <View style={[styles.poignee, { backgroundColor: couleurs.feuillePoignee }]} />
        <View style={styles.idf}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Texte variante="titreBarre" numberOfLines={2}>
              {x.nom}
            </Texte>
            {x.marque ? (
              <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ marginTop: 4 }}>
                {x.marque}
              </Texte>
            ) : null}
            <View style={styles.prov}>
              <Icone nom={provenanceDe(x).icone} couleur={couleurs.t3} taille={13} />
              <Texte variante="meta" couleur="t3">
                {provenanceDe(x).texte}
              </Texte>
            </View>
          </View>
          <View style={[styles.vignette, { backgroundColor: couleurs.s1 }]}>
            <Icone nom="paquet" couleur={couleurs.t3} taille={24} epaisseur={1.5} />
          </View>
        </View>
        <View style={[styles.kcal, !chiffres && { display: "none" }]}>
          <Texte variante="chiffreFort" style={{ fontSize: 36 }}>
            {valeurTexte(m.kcal, m.approx)}
          </Texte>
          <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
            {`${t("nutrition.kcal")}, ${texteQuantite({ ...qte!, quantite_g: g, produit: x })}`}
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
                <Texte variante="saisie" couleur="t3" style={{ fontFamily: police.regular }}>{` ${t("nutrition.g")}`}</Texte>
              </Texte>
            </View>
          ))}
        </View>
        <View style={styles.duo}>
          <BoutonTonal
            libelle={t("nutrition.quantite")}
            onPress={() => {
              suivant();
              router.push({ pathname: "/nutrition/produit", params: { produit: x.id, repas: repas?.id ?? "", date } });
            }}
            style={{ flex: 1 }}
          />
          <View style={{ flex: 1 }}>
            <BoutonPrincipal libelle={t("nutrition.ajouter")} onPress={() => void ajouter(x).catch(console.error)} />
          </View>
        </View>
      </View>
    ) : resultat ? (
      <View style={[styles.panneau, { backgroundColor: couleurs.feuilleFond, paddingBottom: bas + espace.l }]}>
        <View style={[styles.poignee, { backgroundColor: couleurs.feuillePoignee }]} />
        <Texte variante="exercice" style={{ textAlign: "center" }}>
          {t("nutrition.produitInconnu")}
        </Texte>
        <Texte variante="corps" couleur="t2" style={{ textAlign: "center", marginTop: 4, marginBottom: espace.xl }}>
          {resultat.code}
        </Texte>
        <BoutonPrincipal
          libelle={t("nutrition.creerProduit")}
          icone="plus"
          onPress={() => {
            const c = resultat.code;
            suivant();
            router.push({ pathname: "/nutrition/creer", params: { repas: repas?.id ?? "", date, code: c } });
          }}
        />
        <View style={{ height: espace.m }} />
        <Groupe>
          <Option premier icone="scan" libelle={t("nutrition.scannerAutre")} onPress={suivant} />
        </Groupe>
    </View>
  ) : null;

  // En-tête du scanner (✕, repas, lampe sur la caméra) : le même dès l'attente et l'autorisation (audit du 28/10, constat 12).
  const titre = pourCode ? t("nutrition.codeBarres") : repas ? nomRepas(repas) : "";
  const entete = (surCamera: boolean) => {
    const encre = surCamera ? "#f5f2ee" : couleurs.t1;
    return (
      <SafeAreaView edges={["top"]} pointerEvents="box-none" style={styles.haut}>
        <View style={styles.barre}>
          <BoutonIcone nom="close" couleur={encre} libelle={t("ui.fermer")} onPress={() => router.back()} />
          <Texte variante="exercice" style={{ flex: 1, textAlign: "center", color: encre }} numberOfLines={1}>
            {titre}
          </Texte>
          {surCamera ? (
            <BoutonIcone nom="lampe" couleur={lampe ? couleurs.partieNutrition : encre} libelle={t("nutrition.lampe")} onPress={() => setLampe((v) => !v)} />
          ) : (
            <View style={styles.place} />
          )}
        </View>
        {ajoute ? (
          <View style={styles.puce}>
            <Icone nom="check" couleur={couleurs.partieNutrition} taille={16} />
            <Texte variante="saisie" numberOfLines={1} style={{ fontSize: 13, color: "#f5f2ee" }}>
              {t("nutrition.ajouteA", { nom: ajoute })}
            </Texte>
          </View>
        ) : null}
      </SafeAreaView>
    );
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: "#000" }}>{entete(true)}</View>;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.centre, { backgroundColor: couleurs.bg }]}>
        {entete(false)}
        {/* Un seul bouton plein : la fiche courte ouverte, l'autorisation s'efface. */}
        {panneau ? null : (
          <>
            <Icone nom="camera" couleur={couleurs.t2} taille={32} />
            <View style={{ alignSelf: "stretch", paddingHorizontal: MARGE_ECRAN, gap: espace.s }}>
              <BoutonPrincipal libelle={t("nutrition.autoriserCamera")} onPress={() => void demander()} />
              <BoutonTonal libelle={t("nutrition.saisirCode")} icone="clavier" onPress={() => setSaisie(true)} />
            </View>
          </>
        )}
        {panneau ?? (saisie ? <ChampCode code={code} setCode={setCode} onChercher={() => void chercher(code)} bas={clavier} cherche={cherche} /> : null)}
      </SafeAreaView>
    );
  }

  const haut = 290;
  const visee = { top: haut, left: 40, width: width - 80, height: 170 };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={lampe}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={resultat || saisie ? undefined : (r) => void chercher(r.data)}
      />
      {/* Hors de la visée, la caméra s'assombrit ; quatre coins et le trait vert au milieu. */}
      <Visee cadre={visee}>
        <View style={[styles.trait, { top: visee.top + visee.height / 2 - 1, left: visee.left + 8, width: visee.width - 16, backgroundColor: couleurs.partieNutrition }]} />
      </Visee>
      {entete(true)}

      {panneau ?? (saisie ? (
        <ChampCode code={code} setCode={setCode} onChercher={() => void chercher(code)} bas={clavier} cherche={cherche} />
      ) : (
        <View style={[styles.basCam, { bottom: bas + 24 }]}>
          <Pressable accessibilityRole="button" onPress={() => setSaisie(true)} style={({ pressed }) => [styles.ton, { opacity: pressed ? 0.8 : 1 }]}>
            <Icone nom="clavier" couleur="rgba(245,242,238,0.7)" taille={18} />
            <Texte variante="exercice" style={{ color: "#f5f2ee" }}>
              {cherche ? t("nutrition.recherche") : t("nutrition.saisirCode")}
            </Texte>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** Saisie du code : posée juste au-dessus du clavier (bord à bord, rien ne le fait à sa place) ; ✓ du clavier = chercher. */
function ChampCode({ code, setCode, onChercher, bas, cherche }: { code: string; setCode: (c: string) => void; onChercher: () => void; bas: number; cherche?: boolean }) {
  const { couleurs } = useTheme();
  const marge = useSafeAreaInsets().bottom;
  const ok = code.length >= 6;
  return (
    <View style={[styles.saisie, { bottom: bas ? bas + espace.s : marge + 24, backgroundColor: couleurs.feuilleFond }]}>
      <SaisieNutrition
        cadre={[styles.champ, { backgroundColor: couleurs.s2 }]}
        avant={<Icone nom="scan" couleur={couleurs.t3} taille={20} />}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
        keyboardType="number-pad"
        returnKeyType="search"
        autoFocus
        maxLength={14}
        placeholder={t("nutrition.codeBarres")}
        accessibilityLabel={t("nutrition.codeBarres")}
        onSubmitEditing={() => ok && onChercher()}
        style={{ flex: 1, color: couleurs.t1, fontFamily: police.medium, fontSize: 16, padding: 0 }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={t("nutrition.chercher")} disabled={!ok || cherche} onPress={onChercher} style={[styles.ok, { backgroundColor: couleurs.btnTonalFond, opacity: ok ? 1 : 0.38 }]}>
        <Icone nom={cherche ? "sync" : "search"} couleur={couleurs.t1} taille={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: espace.xl },
  haut: { position: "absolute", top: 0, left: 0, right: 0 },
  barre: { flexDirection: "row", alignItems: "center", paddingHorizontal: espace.s, minHeight: 56 },
  place: { width: 44, height: 44 },
  puce: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingHorizontal: 14, borderRadius: rayon.l, backgroundColor: "rgba(20,19,18,0.88)", maxWidth: "86%" },
  trait: { position: "absolute", height: 2, borderRadius: 1, boxShadow: "0px 0px 10px 1px rgba(95,191,30,0.6)" },
  basCam: { position: "absolute", left: 16, right: 16, flexDirection: "row" },
  ton: { flex: 1, height: 52, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s, backgroundColor: "rgba(31,29,27,0.92)" },
  panneau: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: rayon.feuille, borderTopRightRadius: rayon.feuille, paddingTop: espace.s, paddingHorizontal: espace.l },
  poignee: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: espace.xl },
  idf: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: espace.l },
  prov: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  vignette: { width: 56, height: 56, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  kcal: { flexDirection: "row", alignItems: "baseline", gap: espace.s },
  macros: { flexDirection: "row", gap: espace.m, marginTop: 14, marginBottom: espace.xl },
  duo: { flexDirection: "row", gap: espace.s },
  saisie: { position: "absolute", left: 0, right: 0, flexDirection: "row", gap: espace.s, padding: espace.m, marginHorizontal: espace.s, borderRadius: rayon.l },
  champ: { flex: 1, minHeight: 52, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: espace.l },
  ok: { width: 52, minHeight: 52, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
