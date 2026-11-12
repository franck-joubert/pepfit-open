// Feuille d'une liste de poids (planche materiel a3) : haltères, kettlebells, médecine-ball et lestés. La grille des poids
// courants, un toucher ajoute ou retire ; « Ajouter une plage » (de, à, par) et « Autre poids » (au pavé) en sous-vues.
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { Materiel, NouveauMateriel } from "../../db/depots/materiel";
import { FORMES_LESTE, GRILLES, grilleAvec, plage, resumer, trier, type FormeLeste, type Unite } from "../../db/materiel";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { espace } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Texte } from "../../ui/Texte";
import { Bloc, EnteteFeuille, Grille, LienTexte, nb, PavePoids, PlusMoins, Puce, Puces, Resultat } from "./briques";
import { PAS, pasSuivant } from "./pas";

export type GenreListe = "halteres" | "kettlebell" | "leste";

/** Bornes proposées à l'ouverture de « Ajouter une plage » (des champs, pas du matériel : rien n'est ajouté sans toucher). */
const PLAGE_DEPART: Record<GenreListe, Record<Unite, [number, number, number]>> = {
  halteres: { kg: [2, 20, 2], lbs: [5, 50, 5] },
  kettlebell: { kg: [8, 24, 4], lbs: [15, 50, 5] },
  leste: { kg: [2, 10, 2], lbs: [4, 20, 2] },
};

export function FeuilleListe({
  visible, genre, element, uniteDefaut, onFermer, onEnregistrer, onRetirer,
}: {
  visible: boolean;
  genre: GenreListe;
  /** L'élément modifié ; null : un nouvel élément. */
  element: Materiel | null;
  uniteDefaut: Unite;
  onFermer: () => void;
  onEnregistrer: (m: NouveauMateriel) => void;
  onRetirer?: () => void;
}) {
  useLangue();
  const [vue, setVue] = useState<"grille" | "plage" | "autre">("grille");
  const [poids, setPoids] = useState<number[]>([]);
  const [unite, setUnite] = useState<Unite>(uniteDefaut);
  const [forme, setForme] = useState<FormeLeste>("medecine_ball");
  const [bornes, setBornes] = useState<[number, number, number]>(PLAGE_DEPART[genre][uniteDefaut]);

  useEffect(() => {
    if (!visible) return;
    const u = element?.unite ?? uniteDefaut;
    setVue("grille");
    setPoids(element?.poids ?? []);
    setUnite(u);
    setForme((element?.forme as FormeLeste | null) ?? "medecine_ball");
    setBornes(PLAGE_DEPART[genre][u]);
  }, [visible, element, genre, uniteDefaut]);

  const nom = genre === "leste" ? t(`materiel.leste.${forme}`) : t(`materiel.genre.${genre}`);
  const hors = poids.filter((v) => !GRILLES[genre][unite].includes(v));
  const basculer = (v: number) => setPoids((l) => (l.includes(v) ? l.filter((x) => x !== v) : trier([...l, v])));
  const changerUnite = (u: Unite) => {
    if (u === unite) return;
    // Les poids d'une autre unité ne se convertissent pas (un haltère de 10 lbs n'est pas un 4,54 kg) : on repart d'une grille vide.
    setUnite(u);
    setPoids([]);
    setBornes(PLAGE_DEPART[genre][u]);
  };

  const [de, a, par] = bornes;
  const liste = plage(de, a, par);
  const nouveaux = liste.filter((v) => !poids.includes(v));
  const deja = liste.length - nouveaux.length;

  const enregistrer = () =>
    onEnregistrer({
      id: element?.id, genre, forme: genre === "leste" ? forme : null, nom: null, poids, poidsPropre: null, nombre: null, chargeMax: null, maxParCote: null,
      trou: null, prechargee: false, disques: [], unite,
    });

  const pied =
    vue === "grille" ? (
      <BoutonPrincipal libelle={t("ui.enregistrer")} desactive={poids.length === 0} onPress={enregistrer} />
    ) : vue === "plage" ? (
      <BoutonPrincipal
        libelle={nouveaux.length ? tp("materiel.plage.ajouter", nouveaux.length, { n: nouveaux.length }) : t("materiel.plage.rien")}
        desactive={nouveaux.length === 0}
        onPress={() => {
          setPoids((l) => trier([...l, ...liste]));
          setVue("grille");
        }}
      />
    ) : undefined;

  return (
    <Feuille visible={visible} onFermer={onFermer} pied={pied}>
      {vue === "grille" ? (
        <>
          <EnteteFeuille titre={nom} sous={tp("materiel.nbPoids", poids.length, { n: poids.length })} unite={unite} onUnite={changerUnite} />
          {genre === "leste" && !element ? (
            <Puces>
              {FORMES_LESTE.map((f) => (
                <Puce key={f} libelle={t(`materiel.leste.${f}`)} on={f === forme} onPress={() => setForme(f)} />
              ))}
            </Puces>
          ) : null}
          <Grille valeurs={grilleAvec(genre, unite, poids)} choisis={poids} hors={hors} onBasculer={basculer} unite={unite} />
          <Texte variante="corps" couleur="t2" style={{ lineHeight: 19 }}>
            {poids.length ? (
              <>
                <Texte variante="corps" style={{ fontFamily: "Inter-SemiBold" }}>
                  {resumer(poids, unite)}
                </Texte>
                {`. ${t("materiel.grille.aide")}`}
              </>
            ) : (
              t("materiel.grille.vide")
            )}
          </Texte>
          <View style={{ flexDirection: "row", gap: espace.s }}>
            <BoutonTonal libelle={t("materiel.ajouterPlage")} icone="plus" onPress={() => setVue("plage")} style={{ flex: 1 }} />
            <BoutonTonal libelle={t("materiel.autrePoids")} onPress={() => setVue("autre")} style={{ flex: 1 }} />
          </View>
          {element && onRetirer ? <LienTexte libelle={t("materiel.retirer")} onPress={onRetirer} /> : null}
        </>
      ) : vue === "plage" ? (
        <>
          <EnteteFeuille titre={t("materiel.ajouterPlage")} sous={nom} onRetour={() => setVue("grille")} />
          <Bloc>
            <PlusMoins
              premier
              libelle={t("materiel.plage.de")}
              valeur={nb(de)}
              unite={unite}
              moinsOff={de - par < 0}
              onMoins={() => setBornes([Math.max(0, de - par), a, par])}
              onPlus={() => setBornes([de + par, Math.max(a, de + par), par])}
            />
            <PlusMoins
              libelle={t("materiel.plage.a")}
              valeur={nb(a)}
              unite={unite}
              moinsOff={a - par < de}
              onMoins={() => setBornes([de, Math.max(de, a - par), par])}
              onPlus={() => setBornes([de, a + par, par])}
            />
            <PlusMoins
              libelle={t("materiel.plage.par")}
              valeur={nb(par)}
              unite={unite}
              moinsOff={par <= PAS[0]!}
              plusOff={par >= PAS[PAS.length - 1]!}
              onMoins={() => setBornes([de, a, pasSuivant(par, -1)])}
              onPlus={() => setBornes([de, a, pasSuivant(par, 1)])}
            />
          </Bloc>
          {liste.length ? (
            <Resultat
              titre={tp("materiel.plage.res", liste.length, { n: liste.length, de: nb(liste[0]!), a: nb(liste[liste.length - 1]!), unite })}
              sous={[tp("materiel.plage.nouveaux", nouveaux.length, { n: nouveaux.length }), deja ? tp("materiel.plage.restent", deja, { n: deja }) : ""].filter(Boolean).join(" ")}
            />
          ) : null}
        </>
      ) : (
        <>
          <EnteteFeuille titre={t("materiel.autrePoids")} sous={nom} onRetour={() => setVue("grille")} />
          <PavePoids
            unite={unite}
            aide={(v) => t("materiel.autre.aide", { kg: v, unite })}
            onAjouter={(v) => {
              setPoids((l) => trier([...l, v]));
              setVue("grille");
            }}
          />
        </>
      )}
    </Feuille>
  );
}
