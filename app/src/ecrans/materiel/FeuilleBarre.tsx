// Feuille Barre (planche materiel a5) : à charger (six types, poids propre sourcé et modifiable, nombre, charge maximale ou
// disques par côté) ou pré-chargées (la liste de leurs poids). Le résultat se lit sous les réglages, avec les disques du lieu.
import { useEffect, useState } from "react";
import { apercu, BARRES, barreChargee, barreDe, plage, paires, resumer, trier, type FormeBarre, type Unite } from "../../db/materiel";
import { disquesDuTrou, nouvelleBarre, type Materiel, type NouveauMateriel } from "../../db/depots/materiel";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { Bloc, EnteteFeuille, Grille, LienTexte, nb, PlusMoins, Resultat, TuilesBarre } from "./briques";
import { convertir } from "./FeuilleDisques";
import { pousser } from "./pas";

const FORMES = BARRES.map((b) => b.forme);
/** Poids des barres pré-chargées proposés en grille. */
const GRILLE_PRE: Record<Unite, number[]> = { kg: plage(5, 50, 2.5), lbs: plage(10, 110, 5) };

export function FeuilleBarre({
  visible, element, tous, uniteDefaut, onFermer, onEnregistrer, onRetirer,
}: {
  visible: boolean;
  element: Materiel | null;
  tous: readonly Materiel[];
  uniteDefaut: Unite;
  onFermer: () => void;
  onEnregistrer: (m: NouveauMateriel) => void;
  onRetirer?: () => void;
}) {
  useLangue();
  const [b, setB] = useState<NouveauMateriel>(() => nouvelleBarre("droite", uniteDefaut));

  useEffect(() => {
    if (!visible) return;
    setB(element ? { ...element } : nouvelleBarre("droite", uniteDefaut));
  }, [visible, element, uniteDefaut]);

  const u = b.unite;
  const forme = (b.forme ?? "droite") as FormeBarre;
  const lesMills = forme === "lesmills";
  const poser = (p: Partial<NouveauMateriel>) => setB((x) => ({ ...x, ...p }));
  const choisirForme = (f: FormeBarre) => {
    const n = nouvelleBarre(f, u);
    poser({ forme: f, poidsPropre: n.poidsPropre, trou: n.trou, maxParCote: n.maxParCote, chargeMax: f === "lesmills" ? null : b.chargeMax });
  };
  const changerUnite = (v: Unite) => {
    if (v === u) return;
    const n = nouvelleBarre(forme, v);
    poser({ unite: v, poidsPropre: n.poidsPropre, chargeMax: null, poids: [] });
  };

  const propre = b.poidsPropre ?? (u === "lbs" ? barreDe(forme).lbs : barreDe(forme).kg);
  const disques = disquesDuTrou(tous, b.trou ?? barreDe(forme).trou).map((d) => ({ kg: convertir(d.kg, "kg", u), paires: d.paires }));
  const charges = barreChargee(propre, disques, b.maxParCote ?? Infinity, b.chargeMax ?? Infinity);
  const pasPoids = u === "kg" ? 0.5 : 1;
  const pasMax = u === "kg" ? 10 : 20;
  const titre = b.prechargee ? t("materiel.genre.barre") : t(`materiel.barre.${forme}`);
  const sous = b.prechargee ? t("materiel.barre.sousPrechargees") : lesMills ? t("materiel.barre.sousLesMills") : t("materiel.barre.sousCharger");
  const valide = b.prechargee ? b.poids.length > 0 : propre > 0;

  return (
    <Feuille visible={visible} onFermer={onFermer} pied={<BoutonPrincipal libelle={t("ui.enregistrer")} desactive={!valide} onPress={() => onEnregistrer({ ...b, poidsPropre: b.prechargee ? null : propre })} />}>
      <EnteteFeuille titre={titre} sous={sous} unite={u} onUnite={changerUnite} />
      <Segmente
        options={[
          { valeur: "charger", libelle: t("materiel.barre.aCharger") },
          { valeur: "pre", libelle: t("materiel.barre.prechargees") },
        ]}
        valeur={b.prechargee ? "pre" : "charger"}
        onChange={(v) => poser({ prechargee: v === "pre" })}
      />
      {b.prechargee ? (
        <>
          <Grille
            valeurs={trier([...GRILLE_PRE[u], ...b.poids])}
            choisis={b.poids}
            colonnes={5}
            unite={u}
            onBasculer={(v) => poser({ poids: b.poids.includes(v) ? b.poids.filter((x) => x !== v) : trier([...b.poids, v]) })}
          />
          <Texte variante="corps" couleur="t2">
            {b.poids.length ? `${resumer(b.poids, u)}. ${t("materiel.grille.aide")}` : t("materiel.grille.vide")}
          </Texte>
        </>
      ) : (
        <>
          <TuilesBarre formes={FORMES} choisie={forme} onChoisir={choisirForme} />
          <Bloc>
            <PlusMoins
              premier
              libelle={t("materiel.barre.poids")}
              aide={t(`materiel.aide.${forme}`)}
              valeur={nb(propre)}
              unite={u}
              moinsOff={propre <= pasPoids}
              onMoins={() => poser({ poidsPropre: pousser(propre, -pasPoids, pasPoids) })}
              onPlus={() => poser({ poidsPropre: pousser(propre, pasPoids) })}
            />
            <PlusMoins
              libelle={t("materiel.barre.nombre")}
              valeur={String(b.nombre ?? 1)}
              moinsOff={(b.nombre ?? 1) <= 1}
              onMoins={() => poser({ nombre: Math.max(1, (b.nombre ?? 1) - 1) })}
              onPlus={() => poser({ nombre: (b.nombre ?? 1) + 1 })}
            />
            {lesMills ? (
              <PlusMoins
                libelle={t("materiel.barre.parCote")}
                aide={t("materiel.barre.auPlus")}
                valeur={String(b.maxParCote ?? 3)}
                moinsOff={(b.maxParCote ?? 3) <= 1}
                onMoins={() => poser({ maxParCote: Math.max(1, (b.maxParCote ?? 3) - 1) })}
                onPlus={() => poser({ maxParCote: (b.maxParCote ?? 3) + 1 })}
              />
            ) : (
              <PlusMoins
                libelle={t("materiel.barre.chargeMax")}
                valeur={b.chargeMax == null ? t("materiel.barre.aucune") : nb(b.chargeMax)}
                unite={b.chargeMax == null ? undefined : u}
                moinsOff={b.chargeMax == null}
                onMoins={() => poser({ chargeMax: b.chargeMax == null || b.chargeMax - pasMax <= propre ? null : pousser(b.chargeMax, -pasMax) })}
                onPlus={() => poser({ chargeMax: b.chargeMax == null ? Math.max(pasMax * 10, Math.ceil(propre / pasMax) * pasMax) : pousser(b.chargeMax, pasMax) })}
              />
            )}
          </Bloc>
          {disques.length ? (
            <Resultat titre={apercu(charges, u)} sous={tp("materiel.barre.avecDisques", paires(disques), { n: paires(disques) })} />
          ) : (
            <Resultat titre={`${nb(propre)} ${u}`} sous={t("materiel.barre.sansDisques")} />
          )}
        </>
      )}
      {element && onRetirer ? <LienTexte libelle={t("materiel.retirer")} onPress={onRetirer} /> : null}
    </Feuille>
  );
}
