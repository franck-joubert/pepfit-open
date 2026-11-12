// Vitesse de la page Santé (30/10 : « ça met 10 s à s'afficher ») : chaque groupe de cartes est posé dès qu'il est
// lu, sans attendre les autres ni la synchro (réseau) ; la synchro finie, tout est relu seulement si elle a apporté du neuf ;
// l'Âge pepfit (un an d'historique) n'est pas recalculé à chaque visite. Mesures : docs/SANTE-VITESSE.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chargerSante, enMemoire, oublierMemoire } from "../src/ecrans/sante-charge";

function differe<T>() {
  let tenir!: (v: T) => void;
  const p = new Promise<T>((ok) => (tenir = ok));
  return { p, tenir };
}
const tour = () => new Promise((ok) => setImmediate(ok));

test("chaque carte est posée dès qu'elle est lue : ni la plus lente ni la synchro ne la retiennent", async () => {
  const age = differe<number>();
  const synchro = differe<boolean>();
  const poses: string[] = [];
  const fin = chargerSante<{ cases: string; age: number }>(
    { parties: { cases: async () => "cases", age: () => age.p }, rafraichir: () => synchro.p },
    (k, v) => poses.push(`${String(k)}=${v}`),
  );
  await tour();
  assert.deepEqual(poses, ["cases=cases"], "les cases avant l'âge (lent) et avant la synchro");
  age.tenir(31.3);
  await tour();
  assert.deepEqual(poses, ["cases=cases", "age=31.3"], "l'âge sans attendre la synchro");
  synchro.tenir(true);
  await fin;
  assert.deepEqual(poses, ["cases=cases", "age=31.3", "cases=cases", "age=31.3"], "synchro neuve : tout est relu");
});

test("la synchro part tout de suite, en même temps que les lectures", async () => {
  let partie = false;
  const lue = differe<string>();
  const fin = chargerSante<{ cases: string }>(
    {
      parties: { cases: () => lue.p },
      rafraichir: async () => {
        partie = true;
        return false;
      },
    },
    () => {},
  );
  await tour();
  assert.equal(partie, true, "la synchro n'attend pas la fin des lectures");
  lue.tenir("x");
  await fin;
});

test("synchro sans rien de neuf (ou en échec) : pas de relecture", async () => {
  for (const rafraichir of [async () => false, async () => Promise.reject(new Error("hors ligne"))]) {
    let lectures = 0;
    const erreur = console.error;
    console.error = () => {};
    try {
      await chargerSante<{ cases: number }>({ parties: { cases: async () => ++lectures }, rafraichir }, () => {});
    } finally {
      console.error = erreur;
    }
    assert.equal(lectures, 1);
  }
});

test("une lecture ratée ne retient pas les autres ; page quittée : plus rien n'est posé", async () => {
  const poses: string[] = [];
  const erreur = console.error;
  console.error = () => {};
  try {
    await chargerSante<{ a: number; b: number }>({ parties: { a: () => Promise.reject(new Error("base")), b: async () => 2 } }, (k) => poses.push(String(k)));
  } finally {
    console.error = erreur;
  }
  assert.deepEqual(poses, ["b"]);
  let vivant = true;
  const lente = differe<number>();
  const fin = chargerSante<{ a: number }>({ parties: { a: () => lente.p } }, (k) => poses.push(`tard:${String(k)}`), () => vivant);
  vivant = false;
  lente.tenir(1);
  await fin;
  assert.deepEqual(poses, ["b"]);
});

test("l'Âge pepfit n'est pas recalculé à chaque visite : gardé, partagé, oublié après une synchro neuve", async () => {
  oublierMemoire();
  let calculs = 0;
  const calcul = async () => ++calculs;
  const t0 = 1_000_000;
  const [a, b] = await Promise.all([enMemoire("age:j", 600_000, calcul, t0), enMemoire("age:j", 600_000, calcul, t0)]);
  assert.equal(calculs, 1, "deux lectures en même temps : un calcul");
  assert.equal(a, b);
  assert.equal(await enMemoire("age:j", 600_000, calcul, t0 + 300_000), 1, "retour sur l'onglet : repris");
  assert.equal(await enMemoire("age:j", 600_000, calcul, t0 + 600_000), 2, "au-delà de 10 min : recalculé");
  oublierMemoire();
  assert.equal(await enMemoire("age:j", 600_000, calcul, t0 + 600_001), 3, "synchro neuve : recalculé");
  await assert.rejects(enMemoire("age:x", 600_000, () => Promise.reject(new Error("base")), t0));
  assert.equal(await enMemoire("age:x", 600_000, async () => 7, t0), 7, "un échec n'est pas gardé");
});

/** La page Santé : sa page et le contenu du Corps qu'elle partage avec l'Activité (ecrans/corps). */
const pageSante = () =>
  ["Sante.tsx", "corps/BlocCorps.tsx", "corps/ZoneCorps.tsx", "corps/donnees-corps.ts"].map((f) => readFileSync(new URL(`../src/ecrans/${f}`, import.meta.url), "utf8")).join("\n");

test("Santé : les lectures des cartes n'attendent ni Santé Connect ni le réseau", () => {
  const src = readFileSync(new URL("../src/ecrans/sante-lecteurs.ts", import.meta.url), "utf8");
  const parties = src.slice(src.indexOf("    parties: {"), src.indexOf("    rafraichir:"));
  assert.ok(parties.length > 100, "bloc des parties trouvé");
  for (const lent of ["importerSante", "synchroniser"]) assert.ok(!parties.includes(lent), `${lent} hors des lectures des cartes`);
  assert.match(src, /: lireAgeVite\(db, /, "aujourd'hui : l'âge gardé dans la base, recalculé en fond");
  assert.match(src, /\? enMemoire\(`age:\$\{date\}`/, "un jour passé : gardé en mémoire");
  const page = pageSante();
  assert.ok(!/useCharge\(\s*async \(db\) => \{[^]*?synchroniser/.test(page), "plus de lecture qui attend la synchro");
  assert.match(page, /precision \? lecture\(precision\.r, "age"\)\.ouverte : donnees\.ageOuvertAvant === true/, "la case Âge n'attend pas le calcul de la précision");
  assert.match(page, /abonnerPrecision\(oublierMemoire\)/, "une saisie fait oublier l'âge d'un jour passé gardé en mémoire");
});

test("lancement : les cartes de Santé préchargées depuis la base, sans réseau, et montrées dès le montage", () => {
  const lecteurs = readFileSync(new URL("../src/ecrans/sante-lecteurs.ts", import.meta.url), "utf8");
  const precharge = lecteurs.slice(lecteurs.indexOf("export function prechargerSante"));
  assert.match(precharge, /chargerSante<DonneesSante>\(\{ parties \}/, "les lectures seules : ni import ni synchro");
  assert.match(precharge, /retenirMorphologie\(db\)/, "la morphologie aussi : la case Poids et le corps");
  const page = pageSante();
  assert.match(page, /useState<Partial<DonneesSante>>\(\(\) => memoireSante\.get\(date\) \?\? \{\}\)/, "montrées au montage");
  const onglets = readFileSync(new URL("../src/app/(tabs)/_layout.tsx", import.meta.url), "utf8");
  assert.match(onglets, /prechargerSante\(db\)/, "lancées au lancement des onglets");
});
