// Comportement d'un champ chiffré (kg, répétitions, distance, durée) : celui de la case de série, partagé par la séance, la
// séance passée et l'éditeur de routine (docs/CLAVIER-PARTOUT.md). Dans un écran qui pose `ClavierPerso`, le focus ouvre le
// clavier de pepfit (pavé, molette, Valider, brouillon) au lieu de celui du téléphone ; ailleurs, le clavier du téléphone
// et, pour le poids, la bande des paliers. Le composant garde le dessin (cadre, couleurs) et reçoit `props` pour le TextInput.
import { useContext, useEffect, useRef, useState } from "react";
import { Keyboard, type TextInputInstance } from "react-native";
import { bande } from "../ecrans/bande";
import { clavierSeance, mesureClavier, texteMolette } from "../ecrans/clavier-seance";
import { chiffresTemps, lireNombre, nombre, saisieDecimale, type Unite } from "../ecrans/format";
import { masqueDuree } from "../ecrans/saisie-seance";
import { rapprocher, type InfoCharge } from "../ecrans/charge-seance";
import type { ChampSerie } from "../db";
import { ClavierPerso } from "./ClavierSeance";

export interface OptionsChamp {
  valeur: string;
  onFin: (v: string) => void;
  /** Saisie en cours au clavier de pepfit, écrite en base en différé (même texte que onFin). */
  onBrouillon?: (v: string) => void;
  clavier: "decimal-pad" | "number-pad";
  /** Paliers de l'appareil et unité (molette du clavier de pepfit, bande du clavier du téléphone). */
  paliers?: { liste: number[] | null; unite: Unite };
  /** Matériel du lieu (clavier de séance) : charge la plus proche à l'ouverture, avis, chargement de la barre. */
  charge?: InfoCharge | null;
  cle: string;
  /** Saisie d'un temps : masque « hh:mm:ss » rempli de droite à gauche dès le premier chiffre. */
  temps?: boolean;
  /** Demande de focus (« Modifier la série ») : chaque nouvelle valeur. */
  focusN?: number;
  /** Nature de la case : sans elle, le clavier du téléphone. */
  champ?: ChampSerie;
  /** Ordre de la case dans l'écran : Valider passe à la suivante. */
  ordre?: number;
}

export function useChampChiffre(o: OptionsChamp) {
  const { valeur, onFin, onBrouillon, clavier, paliers, charge, cle, temps, focusN, champ: nature, ordre } = o;
  // Le texte garde la virgule de la langue (« 65,5 »), relue par lireNombre.
  const perso = useContext(ClavierPerso) && nature != null;
  // Champ décimal au clavier du téléphone : un seul séparateur, toujours un point.
  const propre = (saisie: string) => (!perso && clavier === "decimal-pad" && !temps ? saisieDecimale(saisie) : saisie);
  const [texte, setTexte] = useState(() => propre(valeur));
  const [focus, setFocus] = useState(false);
  const [masque, setMasque] = useState(false);
  const ref = useRef<TextInputInstance>(null);
  useEffect(() => {
    if (!focus) setTexte(propre(valeur));
  }, [valeur, focus]);
  // Le retour Android ferme le clavier sans ôter le focus : sans ce blur, la saisie n'est jamais rendue.
  useEffect(() => {
    if (!focus) return;
    const s = Keyboard.addListener("keyboardDidHide", () => ref.current?.blur());
    return () => s.remove();
  }, [focus]);
  useEffect(() => {
    if (focusN) ref.current?.focus();
  }, [focusN]);
  useEffect(() => {
    if (!perso || ordre == null) return;
    clavierSeance.inscrire(cle, { ordre, focus: () => ref.current?.focus(), blur: () => ref.current?.blur() });
    return () => clavierSeance.desinscrire(cle);
  }, [perso, cle, ordre]);
  useEffect(() => {
    if (perso && focus) mesureClavier.affiche();
  }, [texte]); // eslint-disable-line react-hooks/exhaustive-deps

  const props = {
    ref,
    value: texte,
    onChangeText: (saisie: string) => {
      if (temps) {
        setMasque(true);
        return setTexte(masqueDuree(chiffresTemps(saisie)));
      }
      const p = propre(saisie);
      setTexte(p);
      if (paliers) bande.maj(cle, lireNombre(p));
    },
    onFocus: () => {
      setFocus(true);
      if (perso) {
        // Charge que le lieu ne fait pas (série pas encore faite) : la plus proche la remplace, l'avis du clavier le dit.
        const voulu = nature === "kg" && charge?.rapprocher ? lireNombre(texte) : null;
        const proche = voulu != null ? rapprocher(paliers?.liste ?? null, voulu) : null;
        const ici = proche != null ? texteMolette("kg", proche) : texte;
        if (proche != null) setTexte(ici);
        clavierSeance.ouvrir({
          cle,
          champ: nature!,
          decimal: clavier === "decimal-pad" && !temps,
          temps: !!temps,
          unite: paliers?.unite ?? "kg",
          paliers: paliers?.liste ?? null,
          saisie: { texte: ici, remplacer: true },
          charge: charge ?? null,
          rapproche: proche != null && voulu != null ? { voulu, kg: proche } : null,
          // Durée : la case montre le masque m:ss (« 0:30 »), le clavier garde ses chiffres ; les deux se relisent pareil.
          ecrire: (t) => {
            if (temps) setMasque(true);
            setTexte(temps ? masqueDuree(chiffresTemps(t)) : t);
          },
          brouillon: onBrouillon ? (t) => onBrouillon(temps ? chiffresTemps(t) : t) : undefined,
        });
        // Le clavier monte : l'écran fait défiler la case au-dessus de lui.
        setTimeout(() => ref.current?.measureInWindow((_x, y, _l, h) => clavierSeance.assurer(y + h)), 80);
        return;
      }
      if (paliers) {
        bande.ouvrir({
          cle,
          paliers: paliers.liste,
          unite: paliers.unite,
          valeur: lireNombre(texte),
          appliquer: (v) => {
            const propose = propre(nombre(v, 1));
            setTexte(propose);
            onFin(propose);
            bande.maj(cle, v);
          },
        });
      }
    },
    onBlur: () => {
      setFocus(false);
      if (perso) clavierSeance.fermer(cle);
      if (paliers) bande.fermer(cle);
      if (temps) {
        // Les chiffres se lisent de droite à gauche (lireTemps) : « 127 » → 1:27.
        if (masque) onFin(chiffresTemps(texte));
        setMasque(false);
      } else if (texte !== valeur) onFin(texte);
    },
    submitBehavior: "blurAndSubmit" as const,
    keyboardType: clavier,
    returnKeyType: "done" as const,
    showSoftInputOnFocus: !perso,
    selectTextOnFocus: !perso,
    // Masque actif, ou clavier de pepfit : le curseur reste au bout, là où arrivent les chiffres.
    selection: masque || (perso && focus) ? { start: texte.length, end: texte.length } : undefined,
  };
  return { props, focus, perso };
}
