import { test } from "node:test";
import assert from "node:assert/strict";
import { AME, SHADERS_AME, verreAvecAme } from "../src/ui/3d/ame";
import { GLSL_VERRE_AME } from "../src/ui/3d/ame-glsl";
import { FRAG_ZONES } from "../src/ui/3d/verre-zones";
import { faceAme, ROTATION_REDUIT, rotationCorps } from "../src/ui/3d/verre";

// Prototype de l'âme (planches/age-coeur, pepfitopen://health?ame=1) : la lumière s'insère dans le fragment du verre par
// remplacement de texte. Si verre.ts change ses ancres, la lueur disparaîtrait sans erreur : ce test le dit.
test("âme : la lueur s'insère dans le verre (uniformes, sillon lu une fois, avant le scan)", () => {
  const f = verreAvecAme(FRAG_ZONES);
  assert.ok(f.includes("uniform vec4 uAme;"), "uniformes de l'âme");
  assert.ok(f.includes("float sillon = uForce > 0.0 ? mix(uCav, 1.0, texture2D(uCavite, vUv).r) : 1.0;"), "sillon gardé dans une variable");
  assert.ok(!f.includes("col *= mix(uCav, 1.0, texture2D(uCavite, vUv).r);"), "plus de seconde lecture du sillon");
  const lueur = f.indexOf(GLSL_VERRE_AME.trim().slice(0, 40));
  assert.ok(lueur > 0, "lueur insérée");
  assert.ok(lueur < f.indexOf("  // scan :"), "avant le scan (la bande passe dessus)");
  assert.ok(lueur < f.indexOf("float id = idIci()"), "avant les zones blessées (elles restent au-dessus)");
});

test("âme : version légère compilée (LEGER), dans la poitrine, sous la ligne des épaules", () => {
  assert.ok(SHADERS_AME.FRAG.startsWith("#define LEGER\n"));
  assert.ok(SHADERS_AME.FRAG.includes("vec4 rendu(vec2 p)"));
  assert.ok(AME.f > 0.7 && AME.f < 0.8, `hauteur ${AME.f}`);
  // membrane (0,62 du demi-côté) plus étroite qu'une poitrine (≈ 0,34 m)
  assert.ok(2 * 0.62 * AME.rayon < 0.25, `membrane ${2 * 0.62 * AME.rayon} m`);
});

test("âme : entière de face et pendant tout le balancement, éteinte de dos, en fondu entre les deux", () => {
  // planche age-coeur : le balancement ne la change pas ; Fold, 30/10 : de dos, elle se voyait à travers le corps
  for (let t = 0; t < 30; t += 0.1) assert.equal(faceAme(rotationCorps(t, 1, false)), 1);
  assert.equal(faceAme(ROTATION_REDUIT), 1);
  for (const deg of [100, 120, 150, 180, 210, 260]) assert.equal(faceAme((deg * Math.PI) / 180), 0, `${deg}°`);
  // plusieurs tours au doigt, dans les deux sens : même part
  for (const a of [0.3, 1.2, 1.6, Math.PI]) {
    assert.ok(Math.abs(faceAme(a + 6 * Math.PI) - faceAme(a)) < 1e-9);
    assert.ok(Math.abs(faceAme(-a) - faceAme(a)) < 1e-9);
  }
  // de 50° à 100°, elle décroît sans saut
  let avant = 1;
  for (let deg = 50; deg <= 100; deg += 1) {
    const f = faceAme((deg * Math.PI) / 180);
    assert.ok(f <= avant && avant - f < 0.05, `${deg}° : ${f}`);
    avant = f;
  }
  assert.ok(faceAme(Math.PI / 2) < 0.15, "de profil, à peine");
  assert.ok(SHADERS_AME.FRAG.includes("* uVu;"), "le shader de l'âme suit cette part");
});
