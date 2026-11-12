import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { grammesDepuisUnite, unitesDisponibles, type Unite } from "../../nutrition/calculs";
import { avecValeur, grammesApres, horsGrille, quantiteDepuisGrammes, quantiteLue, quantiteTexte, sousOnglet, valeursPourUnite } from "../../nutrition/quantite";
import type { ProduitFige } from "../../nutrition/plats";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import type { NomIcone } from "../../ui/Icone";
import { RoueDuree } from "../../ui/RoueDuree";
import { Segmente } from "../../ui/Segmente";
import { t } from "../../i18n/index";
import { nombre } from "../format";
import { libelleUnite, LibellePrincipal } from "./commun";

// Quantité d'un ingrédient (planche plats, 1c et 3d) : ses unités en segmenté (g, portion, pièce, paquet : celles dont le
// poids est connu), la roue (grammes de 5 en 5, unités par quarts), une action dessous (« Retirer du plat », « Retirer pour
// cette fois »), « Valider · ½ pièce · 60 g » en pied. Fermer sans valider ne change rien.

export interface Quantite {
  quantite_g: number;
  unite: Unite;
  nb_unites: number;
}

const libelleMaj = (s: string) => (s === "g" || s === "ml" ? s : s.charAt(0).toUpperCase() + s.slice(1));

export function FeuilleQuantite({
  visible, titre, sousTitre, produit, quantite, onFermer, onValider, action,
}: {
  visible: boolean;
  titre?: string;
  sousTitre?: string;
  produit: ProduitFige | null;
  quantite: Quantite | null;
  onFermer: () => void;
  onValider: (q: Quantite) => void;
  action?: { libelle: string; icone: NomIcone; onPress: () => void };
}) {
  const { couleurs } = useTheme();
  const [unite, setUnite] = useState<Unite>("g");
  const [nb, setNb] = useState(100);
  /** Quantité hors des crans de la roue : ajoutée à la roue pour que l'unité change sans bouger la quantité. */
  const [extra, setExtra] = useState<number | null>(null);
  useEffect(() => {
    if (!visible || !quantite) return;
    setUnite(quantite.unite);
    setNb(quantite.nb_unites);
    setExtra(horsGrille(quantite.unite, quantite.nb_unites));
  }, [visible, quantite]);
  const portions = useMemo(() => produit?.portions ?? [], [produit]);
  // L'unité du produit d'abord, le gramme ensuite (planche plats, 3d : « Pièce · ~ 120 g » | « g »).
  const unites = useMemo(() => {
    const l = unitesDisponibles(portions);
    return [...l.filter((u) => u !== "g"), ...l.filter((u) => u === "g")];
  }, [portions]);
  const base = produit?.base === "100ml" ? t("nutrition.ml") : t("nutrition.g");
  const grammes = grammesDepuisUnite(unite, nb, portions) ?? nb;
  const enGrammes = unite === "g";
  const libelle = libelleUnite(unite, portions.find((x) => x.type === unite)?.libelle);
  const valeurs = useMemo(() => avecValeur(valeursPourUnite(unite), extra), [unite, extra]);
  const grammesDe = (v: number) => grammesDepuisUnite(unite, v, portions) ?? v;
  const complement = enGrammes ? `${nombre(grammes, 0)} ${base}` : `${quantiteTexte(unite, nb)} ${libelle}, ${nombre(grammes, 0)} ${base}`;
  const choisirUnite = (u: Unite) => {
    if (u === unite) return;
    const q = quantiteDepuisGrammes(u, grammes, portions) ?? { nb: 1, horsGrille: false };
    setUnite(u);
    setNb(q.nb);
    setExtra(q.horsGrille ? q.nb : null);
  };
  // Sous chaque onglet, la quantité choisie dans son unité : « 200 g », « 83 % » du paquet, « 3,3 » portions.
  const sousUnite = (u: Unite) => sousOnglet(u, grammes, portions, base);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={titre}
      sousTitre={sousTitre}
      glisserContenu={false}
      pied={
        <BoutonPrincipal libelle={t("ui.valider")} onPress={() => onValider({ quantite_g: grammes, unite, nb_unites: nb })}>
          <LibellePrincipal libelle={t("ui.valider")} complement={complement} />
        </BoutonPrincipal>
      }
    >
      {unites.length > 1 ? (
        <Segmente<Unite> options={unites.map((u) => ({ valeur: u, libelle: libelleMaj(libelleUnite(u, portions.find((x) => x.type === u)?.libelle)), sous: sousUnite(u) }))} valeur={unite} onChange={choisirUnite} />
      ) : null}
      <View style={{ marginTop: espace.s }}>
        <RoueDuree
          key={`${visible ? "o" : "f"}${unite}|${extra ?? ""}`}
          libelle={titre ?? t("nutrition.quantite")}
          valeur={nb}
          valeurs={valeurs}
          onChange={setNb}
          traits={false}
          bande={couleurs.feuilleGroupe}
          unite={enGrammes ? base : libelle}
          decoupe={(v) => {
            const plein = quantiteTexte(unite, v);
            return { attenue: "", plein, apres: enGrammes ? undefined : grammesApres(plein, grammesDe(v), base) };
          }}
          lue={(v) => quantiteLue(unite, v, grammesDe(v), libelle, produit?.base === "100ml")}
        />
      </View>
      {action ? (
        <Groupe>
          <Option premier icone={action.icone} libelle={action.libelle} onPress={action.onPress} />
        </Groupe>
      ) : null}
    </Feuille>
  );
}
