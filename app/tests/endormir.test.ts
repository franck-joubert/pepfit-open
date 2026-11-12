// « Aider à s'endormir » (planche sommeil, B1 à B7, D6 à D11) : l'ordre des méthodes, les rythmes de la respiration lente et
// carrée, la carte « Ce soir » (2 h avant le coucher conseillé, seulement s'il y a à rattraper), les conseils du soir.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  carteCeSoir, clesCote, conseilsDuSoir, cyclesCarree, ENDORMIR, heureMin, leverHabituel, METHODES, minutesRestantes, mmss, phaseCarree, phaseLente, phraseHypnose,
  type DetteSoir,
} from "../src/ecrans/endormir/endormir.ts";
import { fr } from "../src/i18n/dico-fr/endormir.ts";
import { en } from "../src/i18n/dico-en/endormir.ts";

/** Un instant de ce jour à hh:mm (heure locale). */
const a = (hh: number, mm = 0) => new Date(2026, 10, 3, hh, mm).getTime();
const soir = (o: Partial<DetteSoir["dette"]> = {}, coucher: number | null = 23 * 60): DetteSoir => ({
  dette: { aRattraper: 185, soirs: 5, lourde: false, chiffre: true, ...o },
  coucher,
});

test("D6 : la respiration lente d'abord, la plus étudiée ; ni bruit blanc ni 4-7-8", () => {
  assert.deepEqual(METHODES.map((m) => m.id), ["lente", "carree", "armee", "hypnose", "musique"]);
  assert.deepEqual(METHODES.map((m) => m.minutes), [10, 4, 2, 15, 30]);
  assert.deepEqual(METHODES.map((m) => m.groupe), ["respirer", "respirer", "relacher", "relacher", "relacher"]);
});

test("B3 : respiration lente 5 s puis 5 s (6 souffles par minute), 4 s en souffle plus court", () => {
  assert.deepEqual(phaseLente(0, 5), { phase: "inspire", reste: 5, echelle: 0 });
  assert.equal(phaseLente(2.5, 5).echelle, 0.5);
  assert.equal(phaseLente(5, 5).phase, "expire");
  assert.equal(phaseLente(9.9, 5).reste, 1);
  assert.equal(phaseLente(10, 5).phase, "inspire");
  assert.equal(phaseLente(4.5, 4).phase, "expire");
  assert.equal(60 / (2 * ENDORMIR.lente.normal), 6);
});

test("B4 : respiration carrée, 4 s par côté, inspire, retiens, expire, retiens, le décompte monte de 1 à 4", () => {
  assert.deepEqual(phaseCarree(0, 4), { cote: 0, mot: "inspire", compte: 1, cycle: 1 });
  assert.deepEqual(phaseCarree(3.9, 4), { cote: 0, mot: "inspire", compte: 4, cycle: 1 });
  assert.deepEqual(phaseCarree(4, 4), { cote: 1, mot: "retiens", compte: 1, cycle: 1 });
  assert.deepEqual(phaseCarree(9, 4), { cote: 2, mot: "expire", compte: 2, cycle: 1 });
  assert.deepEqual(phaseCarree(15.5, 4), { cote: 3, mot: "retiensVide", compte: 4, cycle: 1 });
  assert.deepEqual(phaseCarree(16, 4), { cote: 0, mot: "inspire", compte: 1, cycle: 2 });
  assert.deepEqual(phaseCarree(7, 3), { cote: 2, mot: "expire", compte: 2, cycle: 1 });
  // 4 min : 15 cycles à 4 s, 20 à 3 s (« Cycle 5 sur 15 »)
  assert.equal(cyclesCarree(4, 4), 15);
  assert.equal(cyclesCarree(4, 3), 20);
});

test("B4 : les côtés du carré, entrées croissantes (sinon interpolate lève), un seul côté plein à la fois", () => {
  const at = (i: 0 | 1 | 2 | 3, x: number) => {
    const { inputRange: e, outputRange: s } = clesCote(i);
    const k = e.findIndex((v, j) => j > 0 && x <= v);
    const [e0, e1, s0, s1] = [e[k - 1]!, e[k]!, s[k - 1]!, s[k]!];
    return s0 + ((x - e0) / (e1 - e0)) * (s1 - s0);
  };
  for (const i of [0, 1, 2, 3] as const) {
    const e = clesCote(i).inputRange;
    assert.ok(e.every((v, j) => j === 0 || v >= e[j - 1]!), `côté ${i}`);
    assert.deepEqual([e[0], e.at(-1)], [0, 4]);
    assert.equal(at(i, i + 0.5), 0.85);
    assert.equal(at(i, ((i + 2) % 4) + 0.5), 0.2);
  }
  // le tour boucle sans saut : chaque côté vaut la même chose en 0 et en 4
  for (const i of [0, 1, 2, 3] as const) assert.equal(clesCote(i).outputRange[0], clesCote(i).outputRange.at(-1), `côté ${i}`);
  assert.equal(at(3, 0.012).toFixed(2), "0.36");
});

test("le temps : minutes restantes arrondies au-dessus, « 6:40 », la phrase de l'autohypnose", () => {
  assert.equal(minutesRestantes(0, 600), 10);
  assert.equal(minutesRestantes(181, 600), 7);
  assert.equal(minutesRestantes(600, 600), 0);
  assert.equal(minutesRestantes(700, 600), 0);
  assert.equal(mmss(400), "6:40");
  assert.equal(mmss(900), "15:00");
  assert.equal(phraseHypnose(0), 0);
  assert.equal(phraseHypnose(59), 0);
  assert.equal(phraseHypnose(60), 1);
  assert.equal(phraseHypnose(899), 14);
  assert.equal(phraseHypnose(5000), 14);
});

test("D10 : la carte « Ce soir » 2 h avant le coucher conseillé, jusqu'à lui ; seulement s'il y a à rattraper", () => {
  assert.deepEqual(carteCeSoir(soir(), a(22, 30)), { dans: 30, coucher: 1380 });
  assert.deepEqual(carteCeSoir(soir(), a(21, 0)), { dans: 120, coucher: 1380 });
  assert.deepEqual(carteCeSoir(soir(), a(23, 0)), { dans: 0, coucher: 1380 });
  assert.equal(carteCeSoir(soir(), a(20, 59)), null);
  assert.equal(carteCeSoir(soir(), a(23, 1)), null);
  assert.equal(carteCeSoir(soir(), a(9, 0)), null);
  // rien à rattraper, pas de chiffre, pas de coucher, rien du tout : pas de carte ; un plan en cours l'affiche
  assert.equal(carteCeSoir(soir({ aRattraper: 0, soirs: 0 }), a(22, 30)), null);
  assert.equal(carteCeSoir(soir({ chiffre: false }), a(22, 30)), null);
  assert.equal(carteCeSoir(soir({}, null), a(22, 30)), null);
  assert.equal(carteCeSoir(null, a(22, 30)), null);
  assert.deepEqual(carteCeSoir(soir({ aRattraper: 0, soirs: 0 }), a(22, 30), true), { dans: 30, coucher: 1380 });
});

test("D10 : un coucher après minuit, la carte passe minuit", () => {
  assert.deepEqual(carteCeSoir(soir({}, 30), a(23, 15)), { dans: 75, coucher: 30 });
  assert.deepEqual(carteCeSoir(soir({}, 30), a(0, 10)), { dans: 20, coucher: 30 });
});

test("le réveil habituel : moyenne des levers, aux minutes du jour", () => {
  assert.equal(leverHabituel([418, 420, 422]), 420);
  assert.equal(leverHabituel([null, 430, undefined]), 430);
  assert.equal(leverHabituel([]), null);
  assert.equal(heureMin(1380), "23:00");
  assert.equal(heureMin(418), "6:58");
});

test("D11 : trois conseils au plus ; régularité dès 30 min d'écart, la séance du soir, la règle des 20 min toujours", () => {
  const reguliers = Array.from({ length: 30 }, (_, i) => -10 + (i % 3) * 5);
  const irreguliers = Array.from({ length: 30 }, (_, i) => (i % 2 ? -50 : 20));
  assert.deepEqual(conseilsDuSoir({ couchers: reguliers, seance: null, coucher: 1380 }), [{ type: "vingtMin" }]);
  const c = conseilsDuSoir({ couchers: irreguliers, seance: { fin: a(21, 10), titre: "Jambes" }, coucher: 1380 });
  assert.equal(c.length, 3);
  assert.deepEqual(c[0], { type: "regularite", ecart: 35, coucher: 1380 });
  assert.deepEqual(c[1], { type: "seance", fin: a(21, 10), titre: "Jambes", proche: false, coucherConnu: true });
  assert.deepEqual(c[2], { type: "vingtMin" });
  // séance finie moins d'1 h avant le coucher ; sans coucher connu, ni proche ni loin
  assert.equal((conseilsDuSoir({ couchers: [], seance: { fin: a(22, 15), titre: null }, coucher: 1380 })[0] as { proche: boolean }).proche, true);
  assert.deepEqual(conseilsDuSoir({ couchers: [], seance: { fin: a(22, 15), titre: null }, coucher: null })[0], { type: "seance", fin: a(22, 15), titre: null, proche: false, coucherConnu: false });
  // moins de 7 nuits : pas de conseil de régularité
  assert.equal(conseilsDuSoir({ couchers: irreguliers.slice(0, 6), seance: null, coucher: 1380 }).length, 1);
});

test("D9 : la méthode de l'armée en six étapes, « populaire, jamais testée » ; 15 phrases d'autohypnose ; fr et en", () => {
  for (let i = 1; i <= ENDORMIR.armee.etapes; i++) assert.ok(fr[`endormir.armee.e${i}` as keyof typeof fr], `e${i}`);
  assert.equal(fr["endormir.armee.e7" as keyof typeof fr], undefined);
  assert.match(fr["endormir.m.armee.sous"], /Populaire, jamais testée/);
  for (let i = 1; i <= ENDORMIR.hypnose.phrases; i++) assert.ok(fr[`endormir.hypnose.p${i}` as keyof typeof fr], `p${i}`);
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
});
