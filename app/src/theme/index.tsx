import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Linking, useColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";
import { base } from "../db";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { modes, type Jetons, type ModeCouleur } from "./jetons";
import type { Partie } from "./effets";
import { DANS_FEUILLE_JOUR, jetonsDePartie } from "./teintes";
import { apparenceDuLien } from "./lien";

export type { Apparence } from "./lien";
import type { Apparence } from "./lien";

interface ContexteTheme {
  mode: ModeCouleur;
  apparence: Apparence;
  couleurs: Jetons;
  choisir(a: Apparence): void;
}

const Contexte = createContext<ContexteTheme | null>(null);
const CLE = "apparence";

export function FournisseurTheme({ children }: { children: ReactNode }) {
  const systeme = useColorScheme();
  const [apparence, setApparence] = useState<Apparence>("auto");
  const [imposee, setImposee] = useState<Apparence | null>(null);

  useEffect(() => {
    const lire = (url: string | null | undefined) => {
      const a = apparenceDuLien(url);
      if (a) setImposee(a === "auto" ? null : a);
    };
    Linking.getInitialURL().then(lire).catch(() => {});
    const s = Linking.addEventListener("url", (e) => lire(e.url));
    return () => s.remove();
  }, []);

  useEffect(() => {
    let vivant = true;
    base()
      .then((db) => lireReglage(db, CLE))
      .then((v) => {
        if (!vivant) return;
        setApparence(v === "nuit" || v === "jour" || v === "auto" ? v : "auto");
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  const choisie = imposee ?? apparence;
  const mode: ModeCouleur = choisie === "auto" ? (systeme === "light" ? "jour" : "nuit") : choisie;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(modes[mode].bg).catch(() => {});
  }, [mode]);

  const choisir = useCallback((a: Apparence) => {
    setApparence(a);
    base()
      .then((db) => ecrireReglage(db, CLE, a))
      .catch(() => {});
  }, []);

  const valeur = useMemo(() => ({ mode, apparence, couleurs: modes[mode], choisir }), [mode, apparence, choisir]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useTheme(): ContexteTheme {
  const c = useContext(Contexte);
  if (!c) throw new Error("useTheme hors de FournisseurTheme");
  return c;
}

/** Contenu dans le thème opposé (bulle de séance en cours : foncée en jour, claire en nuit). */
export function ThemeInverse({ children }: { children: ReactNode }) {
  const c = useTheme();
  const valeur = useMemo(() => {
    const mode: ModeCouleur = c.mode === "jour" ? "nuit" : "jour";
    return { ...c, mode, couleurs: modes[mode] };
  }, [c]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/**
 * Contenu d'une feuille du bas : en jour, ce qui se pose en s2 passe en s1 (blanc sur le fond de la feuille, teinté de la
 * partie depuis la v2.2.17) ; en nuit, rien ne change. Part des jetons de l'écran (teintés de sa partie).
 */
export function SurfaceFeuille({ children }: { children: ReactNode }) {
  const c = useTheme();
  const valeur = useMemo(() => {
    if (c.mode === "nuit") return c;
    const couleurs = { ...c.couleurs };
    for (const k of DANS_FEUILLE_JOUR) couleurs[k] = c.couleurs.s1;
    return { ...c, couleurs };
  }, [c]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/** Braise de l'écran d'endormissement (planche sommeil, D7) : rgb(255,154,110), jamais de blanc. */
export const BRAISE = (a: number) => `rgba(255,154,110,${a})`;

/**
 * « Aider à s'endormir » (planche sommeil, D7) : noir et braise, quel que soit le mode. Textes braise .76 / .66 / .5,
 * filets .14, surfaces à 6 % de braise sur le noir, feuille du bas #0b0604.
 */
export function ThemeBraise({ children }: { children: ReactNode }) {
  const c = useTheme();
  const valeur = useMemo(() => {
    const couleurs: Jetons = {
      ...modes.nuit,
      bg: "#000000",
      s1: "#0b0604",
      s2: "#0f0907",
      s3: "#1a0f0b",
      line: BRAISE(0.14),
      line2: BRAISE(0.24),
      t1: BRAISE(0.76),
      t2: BRAISE(0.66),
      t3: BRAISE(0.5),
      action: BRAISE(0.76),
      jaugePiste: BRAISE(0.16),
      feuilleFond: "#0b0604",
      feuilleGroupe: "#0f0907",
      feuillePoignee: BRAISE(0.24),
      btnTonalFond: "#0f0907",
      btnTonalTexte: BRAISE(0.76),
    };
    return { ...c, mode: "nuit" as const, couleurs };
  }, [c]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/** Écran d'une partie : ses surfaces et ses filets prennent la couleur de la partie (v2.2.17, theme/teintes.ts). */
export function SurfacePartie({ partie, children }: { partie: Partie; children: ReactNode }) {
  const c = useTheme();
  const valeur = useMemo(() => ({ ...c, couleurs: jetonsDePartie(partie, c.mode) }), [c, partie]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
