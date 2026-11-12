// Bilan d'énergie en lot (ecrans/energie-lot.ts, audit de performance M2, docs/PERF-B.md) : Santé Connect simulé qui compte
// ses appels natifs, base de 60 jours (journal, pesées, séances). Le bilan d'aujourd'hui (recalage compris) lit Santé Connect
// une fois par source ; relu après une relance (mémoire vidée), les jours finis viennent de la base ; les bilans sont les
// mêmes en lot, jour par jour et depuis la base ; une lecture en échec n'est jamais gardée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrerProduit, ajouterConsommation } from "../src/db/depots/nutrition.ts";
import { ajouterMensuration, ecrireAnneeNaissance, ecrireSexe } from "../src/db/depots/profil.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { fabriquerSante, PERMISSIONS, type NatifSante } from "../src/natif/sante/logique.ts";
import { PREFIXE_CACHE_SC } from "../src/ecrans/energie-lot.ts";
import { decaler, jourEnergie, joursEnergie, lireReglagesEnergie, oublierFormules } from "../src/ecrans/sante-donnees.ts";
import { baseDeTest } from "./aide.ts";

const H = 3_600_000;
const MAINTENANT = new Date(2026, 8, 30, 15).getTime(); // hors changement d'heure
const AUJ = new Date(2026, 8, 30).getTime();

function natifSimule(o: { panne?: boolean; permissions?: string[] } = {}) {
  const appels = new Map<string, number>();
  const n = (m: string) => appels.set(m, (appels.get(m) ?? 0) + 1);
  const pasHeure = (t: number) => (new Date(t).getHours() >= 8 && new Date(t).getHours() < 21 ? 600 : 0);
  const pasEntre = (d: number, f: number) => {
    let s = 0;
    for (let t = Math.floor(d / H) * H; t < f; t += H) s += (pasHeure(t) * (Math.min(f, t + H) - Math.max(d, t))) / H;
    return Math.round(s);
  };
  const natif: NatifSante = {
    statut: async () => (n("statut"), 3),
    autorisees: async () => (n("autorisees"), o.permissions ?? Object.values(PERMISSIONS)),
    demander: async () => [],
    poids: async () => [],
    pas: async (b) => (n("pas"), b.slice(1).map((f, i) => pasEntre(b[i]!, f))),
    pasHeures: async (d, f) => {
      n("pasHeures");
      if (o.panne) throw new Error("Santé Connect sans réponse");
      const l: [number, number][] = [];
      for (let t = Math.floor(d / H) * H; t < f; t += H) if (pasHeure(t)) l.push([t, pasHeure(t)]);
      return l;
    },
    sommeil: async () => [],
    frequenceRepos: async () => [],
    exporter: async () => {},
    mesures: async () => [],
    seancesSport: async (d, f) => {
      n("seancesSport");
      const l = [];
      for (const x = new Date(new Date(d).setHours(0, 0, 0, 0)); x.getTime() < f; x.setDate(x.getDate() + 1)) {
        const debut = x.getTime() + 12 * H;
        if (debut >= d && debut < f && x.getDay() === 3) l.push({ debut, fin: debut + H, type: 8, titre: "Vélo", origine: "com.garmin.android.apps.connectmobile" });
      }
      return l;
    },
    kcalActives: async (b) => (n("kcalActives"), b.slice(1).map((f, i) => ((f - b[i]!) / 60_000) * 7)),
    distance: async (b) => (n("distance"), b.slice(1).map((f, i) => pasEntre(b[i]!, f) * 0.75)),
    installees: async () => [],
    ouvrir: async () => {},
  };
  const total = () => [...appels.values()].reduce((a, x) => a + x, 0);
  return { appels, total, sante: fabriquerSante(natif, () => MAINTENANT) };
}

/** 60 jours : journal chaque jour, une pesée tous les deux jours, profil complet. */
async function base60() {
  const b = await baseDeTest();
  const { db } = b;
  await ecrireSexe(db, "h");
  await ecrireAnneeNaissance(db, 1985);
  await ajouterMensuration(db, "taille", 180, AUJ - 400 * 24 * H);
  const p = await enregistrerProduit(db, { nom: "Riz", nutriments: { energie_kcal: 350, proteines: 7, glucides: 77, lipides: 1 }, source: "perso" });
  for (let i = 60; i >= 0; i--) {
    const j = decaler(AUJ, -i);
    const d = new Date(j);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await ajouterConsommation(db, { date, repasId: "repas:dejeuner", produitId: p.id, quantiteG: 600 + (i % 5) * 40, unite: "g", nbUnites: 1 }, j + 12 * H);
    if (i % 2 === 0) await ajouterPesee(db, 80 - i * 0.02, j + 7 * H, "sante_connect", "com.withings.wiscale2");
  }
  return b;
}

const chiffres = (e: Awaited<ReturnType<typeof jourEnergie>>) => ({
  depense: Math.round(e.bilan.depense.kcal),
  solde: e.bilan.solde == null ? null : Math.round(e.bilan.solde),
  facteur: e.recalage ? Math.round(e.recalage.facteur * 1000) : null,
  neat: Math.round(e.bilan.neat?.kcal ?? 0),
  sport: Math.round(e.bilan.sport.kcal),
});

test("bilan d'aujourd'hui (recalage sur 28 jours) : Santé Connect lu une fois par source ; relancé, les jours finis viennent de la base", async () => {
  const { db, raw } = await base60();
  oublierFormules();
  const s1 = natifSimule();
  const e1 = await jourEnergie(db, AUJ, MAINTENANT, undefined, s1.sante);
  assert.ok(e1.recalage, "le recalage a eu lieu (journal et pesées suffisent)");
  // séances : une lecture pour toute la plage ; pas : une lecture par heure (31 jours au plus par demande) ; distance : une
  const lectures = Object.fromEntries(s1.appels);
  assert.equal(lectures.seancesSport, 1, "les 28 jours d'avant et aujourd'hui, d'un coup");
  assert.ok(lectures.pasHeures! <= 3, `pas par heure : ${lectures.pasHeures}`);
  assert.ok(lectures.distance! <= 3 + 6, `distance : ${lectures.distance} (une lecture des jours, puis les séances)`);
  // les vérifications statut + autorisees (M1 les garde en mémoire) mises à part, quelques dizaines d'appels pour 29 jours
  const lus = s1.total() - (s1.appels.get("statut") ?? 0) - (s1.appels.get("autorisees") ?? 0);
  assert.ok(lus <= 25, `appels de lecture : ${lus} (${JSON.stringify(lectures)})`);
  // les jours finis depuis 48 h sont gardés en base
  const gardes = (raw.prepare("SELECT COUNT(*) AS n FROM reglages WHERE cle LIKE ?").get(`${PREFIXE_CACHE_SC}%`) as { n: number }).n;
  assert.equal(gardes, 26);

  // relance (mémoire vidée) : seuls les jours pas encore finis depuis 48 h sont relus dans Santé Connect
  oublierFormules();
  const s2 = natifSimule();
  const e2 = await jourEnergie(db, AUJ, MAINTENANT, undefined, s2.sante);
  assert.deepEqual(chiffres(e2), chiffres(e1));
  assert.equal(s2.appels.get("seancesSport"), 1);
  const lus2 = s2.total() - (s2.appels.get("statut") ?? 0) - (s2.appels.get("autorisees") ?? 0);
  assert.ok(lus2 <= 8, `relance : ${lus2} appels de lecture (${JSON.stringify(Object.fromEntries(s2.appels))})`);
});

test("mêmes bilans : en lot de 30 jours, jour par jour, et depuis les lectures gardées", async () => {
  const { db } = await base60();
  const r = await lireReglagesEnergie(db);
  const jours = Array.from({ length: 30 }, (_, i) => decaler(AUJ, i - 29));
  oublierFormules();
  const lot = await joursEnergie(db, jours, MAINTENANT, r, natifSimule().sante);
  for (const j of [jours[0]!, jours[10]!, jours[29]!]) {
    oublierFormules();
    const seul = await jourEnergie(db, j, MAINTENANT, r, natifSimule().sante);
    assert.deepEqual(chiffres(seul), chiffres(lot.get(j)!), new Date(j).toDateString());
  }
  // un vélo le mercredi : compté dans Sport
  assert.ok(jours.some((j) => (lot.get(j)?.bilan.sport.kcal ?? 0) > 0));
});

test("une lecture Santé Connect en échec n'est jamais gardée ; d'autres autorisations font tout relire", async () => {
  const { db, raw } = await base60();
  const n = () => (raw.prepare("SELECT COUNT(*) AS n FROM reglages WHERE cle LIKE ?").get(`${PREFIXE_CACHE_SC}%`) as { n: number }).n;
  oublierFormules();
  await jourEnergie(db, AUJ, MAINTENANT, undefined, natifSimule({ panne: true }).sante);
  assert.equal(n(), 0, "rien de gardé après une panne");
  oublierFormules();
  await jourEnergie(db, AUJ, MAINTENANT, undefined, natifSimule().sante);
  assert.equal(n(), 26);
  // autorisation de la distance retirée : les lectures gardées ne valent plus, tout est relu
  oublierFormules();
  const sans = natifSimule({ permissions: Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.distance) });
  await jourEnergie(db, AUJ, MAINTENANT, undefined, sans.sante);
  assert.ok((sans.appels.get("pasHeures") ?? 0) >= 1, "relu dans Santé Connect");
  assert.equal(sans.appels.get("distance") ?? 0, 0, "sans autorisation, pas de lecture de la distance");
});
