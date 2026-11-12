// Feuille Disques (planche materiel a6) : un jeu par trou (olympiques, standard, Les Mills), poids et paires ; en bas, ce que
// chaque barre du lieu qui prend ces disques en tire.
import { useEffect, useState } from "react";
import { barreDe, barreChargee, COURANTS, etendue, net, paires, TROUS, type Disque, type Trou, type Unite } from "../../db/materiel";
import type { Materiel, NouveauMateriel } from "../../db/depots/materiel";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { versUnite } from "../format";
import { EnteteFeuille, LienTexte, nb, PavePoids, Resultat } from "./briques";
import { LignesDisques } from "./LignesDisques";

interface Jeu {
  id?: string;
  disques: Disque[];
  unite: Unite;
}

/** Valeur d'une unité dans une autre (barre en kg, disques en lbs…), au centième. */
export const convertir = (v: number, de: Unite, vers: Unite): number => (de === vers ? v : net(de === "kg" ? versUnite(v, "lbs") : v / versUnite(1, "lbs")));

export function FeuilleDisques({
  visible, tous, trouInitial, uniteDefaut, onFermer, onEnregistrer,
}: {
  visible: boolean;
  /** Tout le matériel du lieu (les jeux de disques existants, les barres pour le résultat). */
  tous: readonly Materiel[];
  trouInitial: Trou;
  uniteDefaut: Unite;
  onFermer: () => void;
  /** Jeux à écrire (vides : à retirer s'ils existaient). */
  onEnregistrer: (jeux: { ecrire: NouveauMateriel[]; retirer: string[] }) => void;
}) {
  useLangue();
  const [trou, setTrou] = useState<Trou>(trouInitial);
  const [jeux, setJeux] = useState<Partial<Record<Trou, Jeu>>>({});
  const [autre, setAutre] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const j: Partial<Record<Trou, Jeu>> = {};
    for (const tr of TROUS) {
      const m = tous.find((x) => x.genre === "disques" && (x.trou ?? "50") === tr);
      if (m) j[tr] = { id: m.id, disques: m.disques, unite: m.unite };
    }
    setJeux(j);
    setTrou(trouInitial);
    setAutre(false);
  }, [visible, tous, trouInitial]);

  const jeu: Jeu = jeux[trou] ?? { disques: [], unite: uniteDefaut };
  const poser = (p: Partial<Jeu>) => setJeux((j) => ({ ...j, [trou]: { ...jeu, ...p } }));
  const n = paires(jeu.disques);
  const barres = tous.filter((m) => m.genre === "barre" && !m.prechargee && (m.trou ?? barreDe(m.forme).trou) === trou);

  const enregistrer = () => {
    const ecrire: NouveauMateriel[] = [];
    const retirer: string[] = [];
    for (const tr of TROUS) {
      const j = jeux[tr];
      if (!j) continue;
      const pleins = j.disques.filter((d) => d.paires > 0);
      if (!pleins.length) {
        if (j.id) retirer.push(j.id);
        continue;
      }
      ecrire.push({
        id: j.id, genre: "disques", forme: null, nom: null, poids: [], poidsPropre: null, nombre: null, chargeMax: null, maxParCote: null, trou: tr,
        prechargee: false, disques: pleins, unite: j.unite,
      });
    }
    onEnregistrer({ ecrire, retirer });
  };

  return (
    <Feuille visible={visible} onFermer={onFermer} pied={autre ? undefined : <BoutonPrincipal libelle={t("ui.enregistrer")} onPress={enregistrer} />}>
      {autre ? (
        <>
          <EnteteFeuille titre={t("materiel.autrePoids")} sous={t(`materiel.titreDisques.${trou}`)} onRetour={() => setAutre(false)} />
          <PavePoids
            unite={jeu.unite}
            aide={(v) => t("materiel.autre.aide", { kg: v, unite: jeu.unite })}
            onAjouter={(v) => {
              if (!jeu.disques.some((d) => d.kg === v)) poser({ disques: [...jeu.disques, { kg: v, paires: 1 }] });
              setAutre(false);
            }}
          />
        </>
      ) : (
        <>
          <EnteteFeuille
            titre={t("materiel.disques")}
            sous={n ? tp("materiel.nbPaires", n, { n }) : undefined}
            unite={jeu.unite}
            onUnite={(u) => u !== jeu.unite && poser({ unite: u, disques: [] })}
          />
          <Segmente options={TROUS.map((tr) => ({ valeur: tr, libelle: t(`materiel.trou.${tr}`) }))} valeur={trou} onChange={setTrou} />
          {jeu.disques.length === 0 ? (
            <Texte variante="corps" couleur="t2">
              {t("materiel.disques.vide")}
            </Texte>
          ) : null}
          <LignesDisques disques={jeu.disques} unite={jeu.unite} courants={COURANTS[trou][jeu.unite]} onChange={(d) => poser({ disques: d })} onAutre={() => setAutre(true)} />
          {n
            ? barres.map((b, i) => {
                const propre = b.poidsPropre ?? (b.unite === "lbs" ? barreDe(b.forme).lbs : barreDe(b.forme).kg);
                const d = jeu.disques.map((x) => ({ kg: convertir(x.kg, jeu.unite, b.unite), paires: x.paires }));
                const c = barreChargee(propre, d, b.maxParCote ?? Infinity, b.chargeMax ?? Infinity);
                return (
                  <Resultat
                    key={b.id}
                    premier={i === 0}
                    titre={etendue(c, b.unite)}
                    sous={t("materiel.disques.barre", { nom: t(`materiel.barre.${(b.forme ?? "droite") as "droite"}`), kg: nb(propre), unite: b.unite })}
                  />
                );
              })
            : null}
          {jeux[trou]?.id && n ? <LienTexte libelle={t("materiel.retirer")} onPress={() => poser({ disques: [] })} /> : null}
        </>
      )}
    </Feuille>
  );
}
