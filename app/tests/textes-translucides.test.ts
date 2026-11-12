// Textes secondaires et filets : blanc translucide la nuit, noir translucide le jour (règle d'Alex du 27/10, pas de
// gris opaque) ; t2 et t3 à 4,5:1 sur chaque surface, composés sur le fond, t2 nettement plus fort que t3.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dansFeuille, jour, nuit, type Jetons } from "../src/theme/jetons.ts";

function couleur(c: string): [number[], number] {
  if (c.startsWith("#")) return [[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)), 1];
  const v = c.slice(c.indexOf("(") + 1, -1).split(",").map(Number);
  return [v.slice(0, 3), v[3] ?? 1];
}
const sur = (haut: string, bas: number[]) => {
  const [h, a] = couleur(haut);
  return h.map((v, i) => v * a + bas[i]! * (1 - a));
};
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contraste = (texte: string, fond: string, j: Jetons) => {
  const f = sur(fond, couleur(j.bg)[0]);
  const [x, y] = [luminance(sur(texte, f)), luminance(f)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const MODES = { nuit, jour, "jour (feuille)": { ...jour, ...dansFeuille.jour } as Jetons };

test("t2, t3, line, line-2 : blanc translucide la nuit, noir translucide le jour", () => {
  for (const [j, base] of [[nuit, [255, 255, 255]], [jour, [0, 0, 0]]] as const)
    for (const role of ["t2", "t3", "line", "line2"] as const) {
      const [rvb, a] = couleur(j[role]);
      assert.deepEqual(rvb, base, role);
      assert.ok(a > 0 && a < 1, `${role} translucide`);
    }
});

test("t2 et t3 à 4,5:1 sur bg, s1, s2, s3, nuit et jour (et dans une feuille du jour)", () => {
  for (const [mode, j] of Object.entries(MODES))
    for (const fond of ["bg", "s1", "s2", "s3", "feuilleFond", "feuilleGroupe"] as const)
      for (const texte of ["t2", "t3"] as const) {
        const r = contraste(j[texte], j[fond], j);
        assert.ok(r >= 4.5, `${mode} ${texte} sur ${fond} ${r.toFixed(2)}`);
      }
});

test("t2 nettement plus fort que t3 sur chaque surface", () => {
  for (const [mode, j] of Object.entries(MODES))
    for (const fond of ["bg", "s1", "s2", "s3"] as const) {
      const [t2, t3] = [contraste(j.t2, j[fond], j), contraste(j.t3, j[fond], j)];
      assert.ok(t2 >= 1.3 * t3, `${mode} sur ${fond} : t2 ${t2.toFixed(2)} / t3 ${t3.toFixed(2)}`);
    }
});
