// La case « Âge pepfit » de Santé ne dépend pas de la langue : mêmes cases en français et en anglais (constat de la fiche
// Play : absente en anglais ; aucune condition de langue dans le code, ce test le fige).
import { test } from "node:test";
import assert from "node:assert/strict";
import { definirActif, lireActif } from "../src/i18n/index";
import { casesSante } from "../src/ecrans/sante-vue";

const morpho = { sexe: "h" as const, tailleCm: 183, poidsKg: 78 };

test("la case Âge pepfit existe en français et en anglais, avec son âge, et dit « Soon » en attente", () => {
  const avant = lireActif();
  try {
    const attendu = { fr: "Âge pepfit", en: "pepfit Age" } as const;
    for (const langue of ["fr", "en"] as const) {
      definirActif({ ...avant, langue });
      const ids = (age: Parameters<typeof casesSante>[3]) => casesSante(morpho, null, "kg", age).map((k) => k.id);
      assert.ok(ids({ age: 34.9, ecart: -4.4 }).includes("age"), `${langue} : case Âge avec un âge`);
      assert.ok(ids("bientot").includes("age"), `${langue} : case Âge en attente`);
      assert.ok(!ids(null).includes("age"), `${langue} : pas d'âge, pas de case`);
      const k = casesSante(morpho, null, "kg", { age: 34.9, ecart: -4.4 }).find((x) => x.id === "age")!;
      assert.equal(k.libelle, attendu[langue]);
      assert.equal(k.valeur, langue === "fr" ? "34,9" : "34.9");
      assert.equal(k.unite, langue === "fr" ? "ans" : "yrs");
    }
  } finally {
    definirActif(avant);
  }
});
