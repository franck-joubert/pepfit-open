// Cartes Sommeil (Corps et Effort) autour de minuit : un jour passé qui a sa nuit garde sa carte, avant comme après minuit ;
// sans donnée, la vignette « Pas de donnée » reste (sauf jour à venir) ; rien tant que la lecture n'est pas faite. Horloge
// simulée : la nuit du jeudi au vendredi (23 h 11 → 6 h 37) lue à 23 h 59 le vendredi, puis à 0 h 33 le samedi.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import { definirActif } from "../src/i18n/index.ts";
import { enregistrerJours } from "../src/whoop/depot.ts";
import { fabriquerSante, type NatifSante } from "../src/natif/sante/logique.ts";
import { donneesPage } from "../src/ecrans/sante-donnees.ts";
import { casesSante, type DonneesSante } from "../src/ecrans/sante-vue.ts";
import { lirePageEffort, nuitDuJour } from "../src/ecrans/page-effort-donnees.ts";
import { etatSommeil, sommeilMontre } from "../src/ecrans/page-effort.ts";
import { msAvantMinuit } from "../src/ecrans/jour-courant.ts";
import type { Nuit } from "../src/ecrans/mesures/sommeil-donnees.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const M = 60_000;
const H = 60 * M;
const VEN = new Date(2026, 10, 6).getTime();
const SAM = new Date(2026, 10, 7).getTime();
const VEN_2359 = SAM - 1000;
const SAM_0033 = SAM + 33 * M;
const COUCHER = VEN - 49 * M; // 23 h 11 le jeudi
const LEVER = VEN + (6 * 60 + 37) * M; // 6 h 37
const src = (chemin: string) => readFileSync(new URL(`../src/${chemin}`, import.meta.url), "utf8");

async function baseAvecNuit() {
  const { db } = await baseDeTest();
  await enregistrerJours(db, [{ jour: VEN, sommeilDebut: COUCHER, sommeilFin: LEVER, sommeilMin: 425 }], SAM_0033);
  return db;
}

describe("carte Sommeil de la page Effort, autour de minuit", () => {
  it("la nuit du vendredi est lue pour le vendredi à 23 h 59 comme à 0 h 33 le samedi", async () => {
    const db = await baseAvecNuit();
    for (const maintenant of [VEN_2359, SAM_0033]) {
      const l = await lirePageEffort(db, "2026-11-06", true, maintenant);
      expect(l.nuit?.sommeilMin).toBe(425);
    }
  });

  it("le samedi : rien à lire avant minuit (jour à venir), « pas de donnée » (null) dès minuit ; jamais undefined après", async () => {
    const db = await baseAvecNuit();
    expect((await lirePageEffort(db, "2026-11-07", true, VEN_2359)).nuit).toBeUndefined();
    expect((await lirePageEffort(db, "2026-11-07", true, SAM_0033)).nuit).toBeNull();
  });

  it("jamais lue quand le réglage « Afficher le sommeil » est éteint", async () => {
    const db = await baseAvecNuit();
    expect((await lirePageEffort(db, "2026-11-06", false, SAM_0033)).nuit).toBeUndefined();
  });

  it("une nuit rangée sous une clé de jour décalée est quand même celle du jour où elle finit", () => {
    const n = { jour: VEN - 24 * H, debut: COUCHER, fin: LEVER, sommeilMin: 425 } as unknown as Nuit;
    const nuits = new Map<number, Nuit>([[VEN - 24 * H, n]]);
    expect(nuitDuJour(nuits, VEN, SAM)).toBe(n);
    expect(nuitDuJour(nuits, SAM, SAM + 24 * H)).toBeNull();
  });

  it("états : avec le vrai aujourd'hui, le samedi à 0 h 33 a sa vignette ; avec l'aujourd'hui d'hier (bug), il disparaissait", () => {
    const base = { jour: "2026-11-07", nuit: null, synchro: false };
    // avant la correction : la page ouverte avant minuit gardait « 2026-11-06 », le samedi était un jour à venir
    expect(etatSommeil({ ...base, aujourdhui: "2026-11-06" })).toBe("aucune");
    expect(etatSommeil({ ...base, aujourdhui: "2026-11-07" })).toBe("pasDeDonnee");
    expect(sommeilMontre(true, etatSommeil({ ...base, aujourdhui: "2026-11-07" }))).toBe(true);
    // un jour passé sans nuit lue : la vignette, jamais rien ; une nuit lue : la ligne
    expect(etatSommeil({ jour: "2026-11-05", aujourdhui: "2026-11-07", nuit: null, synchro: true })).toBe("pasDeDonnee");
    expect(etatSommeil({ jour: "2026-11-06", aujourdhui: "2026-11-07", nuit: {}, synchro: false })).toBe("lue");
    // pas de vignette qui clignote pendant la lecture
    expect(etatSommeil({ jour: "2026-11-06", aujourdhui: "2026-11-07", nuit: undefined, synchro: false })).toBe("aucune");
  });

  it("la page Effort prend son aujourd'hui du hook tenu à jour, pas du planning lu avant minuit", () => {
    expect(src("ecrans/Planif.tsx")).toContain("aujourdhui: page.aujourdhui, nuit: page.nuit");
    expect(src("ecrans/usePageEffort.ts")).toContain("useJourCourant()");
    expect(src("ecrans/usePageEffort.ts")).toMatch(/synchro, aujourdhui\]/);
  });
});

describe("carte Sommeil de la page Corps, autour de minuit", () => {
  it("le vendredi lu en jour passé (fin de ce jour) a sa nuit, avant comme après minuit", async () => {
    const db = await baseAvecNuit();
    expect((await donneesPage(db, SAM - 1, true)).sommeilMin).toBe(425);
  });

  it("cause : lu comme « aujourd'hui » à 0 h 33 le samedi, Santé Connect ne rend plus la nuit du vendredi (fenêtre minuit - 6 h)", async () => {
    const natif = {
      statut: async () => 3,
      autorisees: async () => ["android.permission.health.READ_SLEEP"],
      sommeil: async (debut: number, fin: number) => [{ debut: COUCHER, fin: LEVER, origine: "x", etapes: [] }].filter((s) => s.fin > debut && s.debut < fin),
    } as unknown as NatifSante;
    const nuitDe = (maintenant: number) => fabriquerSante(natif, () => maintenant).sommeilDeLaNuit();
    expect((await nuitDe(VEN_2359))?.minutes).toBe(446);
    // le bug : la page restée sur « vendredi = aujourd'hui » relisait en mode aujourd'hui à 0 h 33 et perdait la nuit
    expect(await nuitDe(SAM_0033)).toBeNull();
    // la lecture d'un jour passé (nuits sur le jour, fin de ce jour) la garde : c'est celle qu'on fait désormais
    const passe = await fabriquerSante(natif, () => SAM_0033).nuits(VEN, SAM - 1);
    expect(passe?.[0]?.minutes).toBe(446);
  });

  it("la page tient son aujourd'hui à jour et relit quand le jour passé change", () => {
    const s = src("ecrans/Sante.tsx");
    expect(s).toContain("const aujourdhui = useJourCourant();");
    expect(src("ecrans/corps/donnees-corps.ts")).toContain("[db, date, passe, jour, langue, fuseau, poids, distance]");
  });

  const lue = (sommeilMin: number | null): DonneesSante =>
    ({ poids: null, sommeilMin, performance: null, vfc: null, fcRepos: null, pas: null, gras: null, points: { sommeil: "neutre", vfc: "neutre", fc: "neutre" } }) as unknown as DonneesSante;

  it("lecture faite sans nuit : la vignette « Pas de donnée » reste et ouvre la page Sommeil ; avec nuit : la durée ; pas lue : rien", () => {
    const vide = casesSante(null, lue(null), "kg").find((k) => k.id === "sommeil");
    expect(vide?.vide).toBe(true);
    expect(vide?.valeur).toBe("Pas de donnée");
    expect(vide?.ouvre).toBe(true);
    expect(casesSante(null, lue(0), "kg").find((k) => k.id === "sommeil")?.vide).toBe(true);
    const pleine = casesSante(null, lue(425), "kg").find((k) => k.id === "sommeil");
    expect(pleine?.vide).toBeUndefined();
    expect(pleine?.valeur).toBe("7 h 05");
    expect(casesSante(null, null, "kg").some((k) => k.id === "sommeil")).toBe(false);
  });
});

describe("jour courant", () => {
  it("minuit approche : 1 s avant, 1 s ; pile à minuit, un jour ; jamais en dessous d'une seconde", () => {
    expect(msAvantMinuit(SAM - 1000)).toBe(1000);
    expect(msAvantMinuit(SAM - 1)).toBe(1000);
    expect(msAvantMinuit(SAM)).toBe(24 * H);
    expect(msAvantMinuit(SAM_0033)).toBe(24 * H - 33 * M);
  });
});
