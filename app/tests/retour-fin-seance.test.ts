// Fin de séance (retour du 30/10) : enregistrer ou abandonner depuis la page d'avant la fin ramène à l'onglet
// Sport, plus à l'Accueil.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./attendu.ts";
import { RETOUR_FIN_SEANCE } from "../src/ecrans/fin-seance-vue.ts";

describe("retour après la fin de séance", () => {
  it("l'onglet Sport, et aucun retour à l'Accueil depuis la page de fin", () => {
    expect(RETOUR_FIN_SEANCE).toBe("/train");
    const src = readFileSync(new URL("../src/app/done.tsx", import.meta.url), "utf8");
    expect(/dismissTo\("\/"\)|navigate\("\/"\)|replace\("\/"\)/.test(src)).toBe(false);
    expect((src.match(/dismissTo\(RETOUR_FIN_SEANCE\)/g) ?? []).length).toBe(3);
  });
});
