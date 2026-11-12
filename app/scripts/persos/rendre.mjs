// Rend les couches des petits persos. Appelé par generer.py : node rendre.mjs '<tâches JSON>' <dossier de sortie>.
// Sert persos.html, three (node_modules de l'appli) et assets/3d par page.route ; écrit un PNG par tâche.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// Playwright n'est pas une dépendance de l'appli : PLAYWRIGHT=<chemin du paquet playwright> (défaut : celui que Node trouve).
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? "playwright");

const ici = new URL(".", import.meta.url).pathname;
const appli = new URL("../../", import.meta.url).pathname;
const three = `${appli}node_modules/three/`;
const types = { html: "text/html", js: "text/javascript", glb: "model/gltf-binary", png: "image/png", jpg: "image/jpeg" };
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
const erreurs = [];
p.on("pageerror", (e) => erreurs.push(e.message));
p.on("console", (m) => m.type() === "error" && erreurs.push(m.text()));
await p.route("http://persos.local/**", (r) => {
  const chemin = new URL(r.request().url()).pathname;
  const fichier = chemin.startsWith("/three/") ? three + chemin.slice(7) : chemin.startsWith("/3d/") ? `${appli}assets/3d/${chemin.slice(4)}` : ici + chemin.slice(1);
  r.fulfill({ body: readFileSync(fichier), contentType: types[fichier.split(".").pop()] ?? "application/octet-stream" });
});
await p.goto("http://persos.local/persos.html");
await p.waitForSelector("body.pret", { timeout: 120000 });
const taches = JSON.parse(process.argv[2]);
const sortie = process.argv[3];
mkdirSync(sortie, { recursive: true });
for (const [nom, opts] of Object.entries(taches)) {
  const url = await p.evaluate((o) => window.rendre(o), opts);
  writeFileSync(`${sortie}/${nom}.png`, Buffer.from(url.split(",")[1], "base64"));
}
console.log(Object.keys(taches).length, "rendus");
console.log(erreurs.length ? "ERREURS " + erreurs.join(" | ") : "aucune erreur");
await b.close();
if (erreurs.length) process.exit(1);
