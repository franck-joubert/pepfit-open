// Vitesse de l'import Fitatu (docs/FITATU-VITESSE.md) : le vrai client et la vraie boucle d'import devant un faux Fitatu
// qui simule la latence et une limite d'appels (429 + Retry-After), sur une horloge virtuelle (rien n'attend vraiment).
// Journal INVENTÉ : 1 634 jours, comme le compte d'Alex ; aucune donnée réelle, aucun appel réseau.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerClientFitatu, type ReponseHttp, type SessionFitatu } from "../src/fitatu/api.ts";
import { decaler, EN_VOL, importerHistorique, PAUSE_MS, type Cadence, type DepsHistorique, type MesureLot } from "../src/fitatu/historique.ts";
import type { ExportFitatu, RapportFitatu } from "../src/import/fitatu.ts";

/** Horloge virtuelle : `dormir` pose un minuteur, `tourner` avance au plus proche quand tout le reste attend. */
function horloge() {
  let t = 0;
  const minuteurs: { a: number; r: () => void }[] = [];
  const dormir = (ms: number) => new Promise<void>((r) => minuteurs.push({ a: t + ms, r }));
  const tourner = async <T>(p: Promise<T>): Promise<T> => {
    let fin: { v: T } | null = null;
    let echec: unknown = null;
    p.then((v) => (fin = { v }), (e: unknown) => (echec = e ?? new Error("rejet")));
    for (;;) {
      await new Promise((r) => setImmediate(r));
      if (echec) throw echec;
      if (fin) return (fin as { v: T }).v;
      minuteurs.sort((x, y) => x.a - y.a);
      const m = minuteurs.shift();
      if (!m) throw new Error("blocage : rien n'attend et rien ne finit");
      t = m.a;
      m.r();
    }
  };
  return { dormir, tourner, maintenant: () => t };
}

const rep = (status: number, corps: unknown = {}, entetes: Record<string, string> = {}): ReponseHttp => ({
  status,
  headers: { get: (n) => entetes[n.toLowerCase()] ?? null },
  text: async () => JSON.stringify(corps),
});

const JOURS = 1_634;
const DEBUT = "2022-04-11";
const FIN = decaler(DEBUT, JOURS - 1);
const PRODUITS = 600;
/** Journal fictif : un jour sur trois sans repas, sinon trois lignes ; les produits nouveaux se raréfient avec le temps. */
function journee(date: string): unknown {
  const i = Math.round((Date.parse(date) - Date.parse(DEBUT)) / 86_400_000);
  if (i % 3 === 2) return { dietPlan: {} };
  const p = (k: number) => Math.floor(Math.sqrt((i * 7 + k * 131) % (PRODUITS * PRODUITS))) % PRODUITS;
  const items = [0, 1, 2].map((k) => ({ planDayDietItemId: `${date}-${k}`, foodType: "PRODUCT", productId: p(k) + 1, name: "Produit fictif", weight: 100, energy: 100 }));
  return { dietPlan: { lunch: { mealName: "Déjeuner", items } } };
}

interface Scenario {
  latenceMs: number;
  /** Fitatu simulé : au-delà de `parSeconde` appels sur la dernière seconde, 429 avec Retry-After: 2. */
  parSeconde: number;
  cadence?: Cadence;
  lot?: number;
}

async function importer(sc: Scenario) {
  const h = horloge();
  const departs: number[] = [];
  let enVol = 0;
  let maxEnVol = 0;
  let refus = 0;
  let appels = 0;
  const s: SessionFitatu = { jeton: "j", renouvellement: "", uid: "1", base: "https://faux", entetes: {}, cluster: "xx1" };
  const c = creerClientFitatu({
    fetch: async (url) => {
      appels++;
      enVol++;
      maxEnVol = Math.max(maxEnVol, enVol);
      await h.dormir(sc.latenceMs / 2);
      const t = h.maintenant();
      while (departs.length && departs[0]! <= t - 1000) departs.shift();
      let r: ReponseHttp;
      if (departs.length >= sc.parSeconde) {
        refus++;
        r = rep(429, {}, { "retry-after": "2" });
      } else {
        departs.push(t);
        const j = /\/day\/(\d{4}-\d{2}-\d{2})$/.exec(url);
        r = j ? rep(200, journee(j[1]!)) : rep(200, { id: 1, name: "Produit fictif", energy: 100 });
      }
      await h.dormir(sc.latenceMs / 2);
      enVol--;
      return r;
    },
    lireSession: async () => s,
    ecrireSession: async () => {},
    attendre: h.dormir,
  });
  let brut: string | null = null;
  const connus = new Set<string>();
  const mesures: MesureLot[] = [];
  let lignes = 0;
  const d: DepsHistorique = {
    jour: (x) => c.jour(x),
    produit: (id) => c.produit(id),
    produitConnu: async (id) => (connus.has(String(id)) ? "produit" : null),
    importer: async (e: ExportFitatu) => {
      for (const cle of Object.keys(e.aliments)) connus.add(cle.slice("PRODUCT:".length));
      const n = Object.values(e.jours).flatMap((j) => Object.values(j)).reduce((a, r) => a + r.items.length, 0);
      lignes += n;
      return { joursImportes: Object.keys(e.jours).length, alimentsImportes: n, alimentsDejaPresents: 0, produitsCrees: 0, erreurs: [] } as unknown as RapportFitatu;
    },
    lireEtat: async () => brut,
    ecrireEtat: async (x) => void (brut = x),
    attendre: h.dormir,
    aujourdhui: () => FIN,
    premiereDate: async () => DEBUT,
    actif: async () => true,
    maintenant: h.maintenant,
    mesure: (m) => mesures.push(m),
  };
  const issue = await h.tourner(importerHistorique(d, { cadence: sc.cadence, lot: sc.lot }));
  return { issue, minutes: h.maintenant() / 60_000, appels, refus, maxEnVol, lignes, transactions: mesures.length, mesures };
}

const arrondi = (x: number) => Math.round(x * 10) / 10;

test("vitesse : 1 634 jours, latence 300 ms — avant (1 appel à la fois, 1 s de pause, lots de 7) et après", async () => {
  const avant = await importer({ latenceMs: 300, parSeconde: 5, cadence: { enVol: 1, pauseMs: 1_000 }, lot: 7 });
  const apres = await importer({ latenceMs: 300, parSeconde: 5 });
  for (const [nom, r] of [["avant", avant], ["après", apres]] as const)
    console.log(`[mesure] ${nom} : ${arrondi(r.minutes)} min, ${r.appels} appels, ${r.refus} refus 429, ${r.maxEnVol} en vol au plus, ${r.transactions} transactions`);
  assert.equal(avant.issue, "fini");
  assert.equal(apres.issue, "fini");
  assert.equal(apres.lignes, avant.lignes); // même journal importé
  assert.equal(apres.refus, 0);
  assert.ok(apres.maxEnVol <= EN_VOL);
  assert.ok(avant.minutes > 30, `avant : ${avant.minutes} min`);
  assert.ok(apres.minutes < 12, `après : ${apres.minutes} min`);
  assert.ok(apres.transactions <= Math.ceil(JOURS / 28));
});

test("vitesse : Fitatu plus strict (2 appels/s) → 429, l'import ralentit tout seul et va au bout sans s'arrêter", async () => {
  const r = await importer({ latenceMs: 300, parSeconde: 2 });
  console.log(`[mesure] Fitatu à 2 appels/s : ${arrondi(r.minutes)} min, ${r.appels} appels, ${r.refus} refus 429, cadence finale ${r.mesures.at(-1)!.enVol} en vol / ${r.mesures.at(-1)!.pauseMs} ms`);
  assert.equal(r.issue, "fini");
  assert.ok(r.refus > 0);
  assert.equal(r.mesures.at(-1)!.enVol, 1);
  assert.ok(r.mesures.at(-1)!.pauseMs >= PAUSE_MS * 2);
});
