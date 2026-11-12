// « Effacer les données de ce téléphone » : ordre des gestes, reprise après une étape ratée, et inventaire des stockages. Le
// code est relu : un fichier qui se met à stocker quelque chose (coffre, base, fichiers, préférences, cookies, notifications)
// sans être inscrit dans STOCKAGES, ou une clé « fonte.* » du coffre absente de CLES_COFFRE, fait échouer le test.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { CLES_COFFRE, DOSSIERS, effacerTout, ErreurEffacement, FICHIERS_BASE, STOCKAGES, TEMOIN, type DepsEffacement } from "../src/effacer/logique.ts";

const RACINE = join(import.meta.dirname, "..");

/** Gestes simulés : chacun s'inscrit au journal ; `rate` fait échouer un geste une fois. */
function simulation(rate?: string) {
  const journal: string[] = [];
  let echec = rate;
  const geste =
    (nom: string) =>
    async (arg?: string) => {
      const n = arg === undefined ? nom : `${nom}:${arg}`;
      if (n === echec) {
        echec = undefined;
        throw new Error(`raté : ${n}`);
      }
      journal.push(n);
    };
  const d: DepsEffacement = {
    revoquerWhoop: async () => (journal.push("revoquerWhoop"), true),
    whoopNonRevoque: geste("whoopNonRevoque"),
    poserTemoin: geste("poserTemoin"),
    retirerTemoin: geste("retirerTemoin"),
    arreterSeance: geste("arreterSeance"),
    annulerNotifications: geste("annulerNotifications"),
    fermerBase: geste("fermerBase"),
    supprimerFichierBase: geste("base"),
    effacerCle: geste("cle"),
    effacerCookies: geste("effacerCookies"),
    rendreAccesDossiers: geste("rendreAccesDossiers"),
    supprimerDossier: geste("dossier"),
    viderDocumentsEtCache: geste("vider"),
    redemarrer: geste("redemarrer"),
  };
  return { d, journal };
}

test("effacement : tout, dans l'ordre, puis redémarrage", async () => {
  const { d, journal } = simulation();
  await effacerTout(d, { redemarrer: true, distant: true });
  assert.deepEqual(journal, [
    "revoquerWhoop",
    "poserTemoin",
    "arreterSeance",
    "annulerNotifications",
    "fermerBase",
    ...FICHIERS_BASE.map((f) => `base:${f}`),
    ...CLES_COFFRE.map((c) => `cle:${c}`),
    "effacerCookies",
    "rendreAccesDossiers",
    ...DOSSIERS.map((f) => `dossier:${f}`),
    `vider:${TEMOIN}`,
    "retirerTemoin",
    "redemarrer",
  ]);
});

test("effacement : la base et ses journaux, les dossiers photos, suivi et profil", () => {
  assert.deepEqual([...FICHIERS_BASE], ["fonte.db", "fonte.db-wal", "fonte.db-shm", "fonte.db-journal"]);
  assert.deepEqual([...DOSSIERS], ["photos", "suivi", "profil"]);
});

test("effacement raté : erreur avec l'étape, témoin laissé, pas de redémarrage ; rejoué, il va au bout", async () => {
  const { d, journal } = simulation("cle:fonte.phrase");
  const e = await effacerTout(d, { redemarrer: true }).catch((x: unknown) => x);
  assert.ok(e instanceof ErreurEffacement);
  assert.equal(e.etape, "coffre");
  assert.ok(!journal.includes("retirerTemoin") && !journal.includes("redemarrer"));
  journal.length = 0;
  await effacerTout(d, { redemarrer: true });
  assert.equal(journal.at(-1), "redemarrer");
  assert.ok(CLES_COFFRE.every((c) => journal.includes(`cle:${c}`)));
});

test("reprise au lancement : ni réseau ni redémarrage", async () => {
  const { d, journal } = simulation();
  await effacerTout(d, { redemarrer: false });
  assert.equal(journal.at(-1), "retirerTemoin");
  assert.ok(!journal.includes("redemarrer") && !journal.includes("revoquerWhoop"));
});

test("Whoop sans réponse (échec, refus ou délai dépassé) : l'écran le dit, l'effacement va au bout", async () => {
  for (const revoquer of [async () => false, async () => Promise.reject(new Error("réseau")), () => new Promise<boolean>(() => {})]) {
    const { d, journal } = simulation();
    d.revoquerWhoop = revoquer;
    const debut = Date.now();
    await effacerTout(d, { redemarrer: true, distant: true, delaiRevocationMs: 20 });
    assert.ok(Date.now() - debut < 1000);
    assert.equal(journal[0], "whoopNonRevoque");
    assert.equal(journal.at(-1), "redemarrer");
  }
});

test("Whoop révoqué (ou pas connecté) : rien à dire", async () => {
  const { d, journal } = simulation();
  await effacerTout(d, { redemarrer: true, distant: true });
  assert.ok(!journal.includes("whoopNonRevoque"));
});

/** Fichiers .ts, .tsx et .kt sous `dossier` (sans node_modules ni build). */
function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    if (n === "node_modules" || n === "build") return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(tsx?|kt)$/.test(n) ? [p] : [];
  });
}
const CODE = [...sources(join(RACINE, "src")), ...sources(join(RACINE, "modules"))].map((p) => ({
  chemin: relative(RACINE, p),
  texte: readFileSync(p, "utf8"),
}));

/** Ce qui écrit sur le téléphone : coffre, base, fichiers de l'appli, préférences Android, cookies et WebView, stockage
 *  clé-valeur, notifications programmées, service de premier plan, accès gardés aux dossiers choisis. */
const STOCKE =
  /SecureStore\.|openDatabase(Async|Sync)?\(|Paths\.(document|cache)|documentDirectory|cacheDirectory|SharedPreferences|filesDir|cacheDir|AsyncStorage|localStorage|MMKV|CookieManager|react-native-webview|scheduleNotificationAsync|startForegroundService|PersistableUriPermission|persistedUriPermissions|pickDirectoryAsync/;

test("inventaire : chaque fichier qui stocke quelque chose est couvert par l'effacement", () => {
  const ecrivent = CODE.filter((f) => !f.chemin.startsWith("src/effacer/") && STOCKE.test(f.texte)).map((f) => f.chemin);
  const oublies = ecrivent.filter((c) => !(c in STOCKAGES));
  assert.deepEqual(oublies, [], `stockages absents de STOCKAGES (src/effacer/logique.ts) : ${oublies.join(", ")}`);
  const perimes = Object.keys(STOCKAGES).filter((c) => !ecrivent.includes(c));
  assert.deepEqual(perimes, [], `STOCKAGES cite des fichiers qui ne stockent plus rien : ${perimes.join(", ")}`);
});

test("inventaire : chaque clé « fonte.* » du coffre est effacée sous son nom exact", () => {
  const cles = new Set(CODE.flatMap((f) => [...f.texte.matchAll(/["'`](fonte\.[a-z][\w.]*)["'`]/g)].map((m) => m[1]!)));
  cles.delete("fonte.db");
  assert.ok(cles.size >= 5);
  const oubliees = [...cles].filter((c) => !CLES_COFFRE.includes(c));
  assert.deepEqual(oubliees, [], `clés du coffre non effacées : ${oubliees.join(", ")}`);
});
