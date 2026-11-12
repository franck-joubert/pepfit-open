// Déconnecter Whoop garde le journal (VFC, FC au repos, sommeil, effort, séances rattachées, pesées), sans les accès ; la purge
// complète reste possible ; les écrans lisent les données gardées sans Whoop connecté ; la relecture étendue de l'historique
// rend les jours perdus à la reconnexion (avec reprise après une coupure).
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest, jour } from "./aide.ts";
import type { ApiWhoop } from "../src/whoop/api.ts";
import { REGLAGE } from "../src/whoop/constantes.ts";
import { enregistrerJours, enregistrerSeances, purgerWhoop, retirerConnexionWhoop } from "../src/whoop/depot.ts";
import { HISTORIQUE_JOURS, lireEtatHistorique, relireHistoriqueWhoop, TRANCHE_JOURS, tranchesHistorique } from "../src/whoop/historique.ts";
import { synchroniserWhoop } from "../src/whoop/synchro.ts";
import { journalWhoopGarde } from "../src/whoop/lecture.ts";
import { ErreurWhoop, type Collection, type SeanceConvertie } from "../src/whoop/types.ts";
import { ecrireReglage, lireReglage } from "../src/db/depots/reglages.ts";
import { ajouterMesures, historiqueMesure } from "../src/db/depots/mesures.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { lirePasJours, pasWhoopDuJour, type SantePas } from "../src/ecrans/pas-source.ts";
import { sourcesSeance } from "../src/ecrans/seance-sources.ts";

const MIN = 60_000;
const H = 3_600_000;
const JOUR = 86_400_000;
const MAINTENANT = jour(2026, 10, 7, 12, 0);
const MINUIT = jour(2026, 10, 7, 0, 0);
const sansSante: SantePas = { autorisees: async () => [], pasEntre: async () => null };

const w = (id: string, sportId: number | null, d: number, f: number): SeanceConvertie => ({
  id, debut: d, fin: f, sportId, sport: "Activity", strain: 11.2, kj: 2600, fcMoy: 135, fcMax: 171, distanceM: null, zones: [0, 4, 12, 24, 19, 6],
});
const compter = async (db: Awaited<ReturnType<typeof baseDeTest>>["db"], t: string) => (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`, []))!.n;

/** Un journal complet : jours, VFC, séance identifiée (padel) et brute (sport sans activité du catalogue), séance ignorée, pesée, curseurs. */
async function journal() {
  const { db } = await baseDeTest(true);
  await ecrireReglage(db, REGLAGE.connecte, "1");
  await ecrireReglage(db, REGLAGE.derniereSynchro, String(MAINTENANT));
  await ecrireReglage(db, REGLAGE.derniereErreur, "serveur");
  await ecrireReglage(db, REGLAGE.curseur("sleep"), String(MAINTENANT - JOUR));
  await ecrireReglage(db, REGLAGE.corpsLu, String(MAINTENANT));
  await enregistrerJours(db, [{ jour: MINUIT - JOUR, vfc: 64.2, fcRepos: 51, recup: 70, strain: 11, sommeilMin: 420, pas: 9000 }, { jour: MINUIT, vfc: 70, pas: 1200 }], MAINTENANT);
  await ajouterMesures(db, "vfc", [{ valeur: 64.2, date: MINUIT - JOUR + 7 * H, origine: "com.whoop.android" }], "whoop", MAINTENANT);
  await ajouterPesee(db, 80.2, MAINTENANT - 3 * JOUR, "sante_connect", "com.whoop.android");
  const d1 = MINUIT - 2 * JOUR + 10 * H;
  await enregistrerSeances(db, [w("padel", 249, d1, d1 + 90 * MIN), w("brute", 9999, d1 + 5 * H, d1 + 6 * H), w("marche", 63, d1 + 8 * H, d1 + 9 * H)], MAINTENANT);
  return { db, d1 };
}

describe("déconnexion qui garde le journal", () => {
  it("garde jours, mesures, pesées, séance identifiée ; retire les accès ; garde les curseurs", async () => {
    const { db } = await journal();
    const s = await db.getFirstAsync<{ id: string }>("SELECT id FROM seances WHERE titre = 'Padel'", []);
    expect(s).not.toBeNull();

    await retirerConnexionWhoop(db);

    expect(await compter(db, "whoop_jour")).toBe(2);
    expect((await db.getFirstAsync<{ vfc: number }>("SELECT vfc FROM whoop_jour WHERE jour = ?", [MINUIT - JOUR]))!.vfc).toBe(64.2);
    expect((await historiqueMesure(db, "vfc")).length).toBe(1);
    expect(await compter(db, "pesee")).toBe(1);
    // la séance identifiée garde son activité Whoop, sous le même nom (source whoop, pas de nouvelle étiquette)
    expect((await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'padel'", []))!.seance_id).toBe(s!.id);
    // l'activité ignorée (une marche : jamais une séance) reste dans le journal
    expect(await db.getFirstAsync("SELECT id FROM whoop_seance WHERE id = 'marche'", [])).not.toBeNull();
    // la séance brute de Whoop (sans sport) part avec son activité, comme dans la purge complète
    expect(await db.getFirstAsync("SELECT id FROM whoop_seance WHERE id = 'brute'", [])).toBeNull();
    expect(await db.getFirstAsync("SELECT id FROM seances WHERE source_ref = 'whoop:brute'", [])).toBeNull();
    // accès et état de la connexion retirés ; curseur gardé : une reconnexion ne relit que ce qui manque
    for (const c of [REGLAGE.connecte, REGLAGE.derniereSynchro, REGLAGE.derniereErreur, REGLAGE.corpsLu]) expect(await lireReglage(db, c)).toBeNull();
    expect(await lireReglage(db, REGLAGE.curseur("sleep"))).toBe(String(MAINTENANT - JOUR));
    expect(await journalWhoopGarde(db)).toBe(true);
  });

  it("la purge complète supprime toujours tout, séance identifiée gardée", async () => {
    const { db } = await journal();
    await purgerWhoop(db);
    for (const t of ["whoop_jour", "whoop_seance", "mesure_corps", "pesee", "whoop_brut_jour", "whoop_brut_seance"]) expect(await compter(db, t)).toBe(0);
    expect(await lireReglage(db, REGLAGE.curseur("sleep"))).toBeNull();
    expect(await db.getFirstAsync("SELECT id FROM seances WHERE titre = 'Padel'", [])).not.toBeNull();
  });

  it("reconnexion : la séance gardée n'est pas recréée ni doublée", async () => {
    const { db, d1 } = await journal();
    await retirerConnexionWhoop(db);
    const avant = await compter(db, "seances");
    const bilan = await enregistrerSeances(db, [w("padel", 249, d1, d1 + 90 * MIN)], MAINTENANT);
    expect([bilan.creees, bilan.enrichies]).toEqual([0, 0]);
    expect(await compter(db, "seances")).toBe(avant);
  });
});

describe("lecture sans Whoop connecté", () => {
  it("pas : les pas gardés des jours finis restent ceux du journal (source whoop), pas le jour en cours", async () => {
    const { db } = await journal();
    await retirerConnexionWhoop(db);
    const [hier, auj] = await lirePasJours(db, [MINUIT - JOUR, MINUIT], MAINTENANT, sansSante);
    expect(hier).toEqual({ etat: "valeur", pas: 9000, source: "whoop" });
    expect(auj).toEqual({ etat: "a-connecter" });
    expect(pasWhoopDuJour(9000, MINUIT - JOUR, MAINTENANT)).toBe(9000);
    expect(pasWhoopDuJour(1200, MINUIT, MAINTENANT)).toBeNull();
    expect(pasWhoopDuJour(null, MINUIT - JOUR, MAINTENANT)).toBeNull();
  });

  it("fiche de séance : Whoop connecté ou non, le seul geste proposé est Santé Connect (jamais reconnecter Whoop)", async () => {
    const { db, d1 } = await journal();
    // une séance pepfit rattachée à l'activité Whoop, dont le détail (pas, FC) n'a jamais été lu
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('s9','Padel',?,?,1)", [d1 + 8 * H, d1 + 9 * H]);
    await db.runAsync("UPDATE whoop_seance SET seance_id = 's9' WHERE id = 'marche'", []);
    const sante = { autorisees: async () => [], pasEntre: async () => null, fcEntre: async () => null } as never;
    const d = { sante, maintenant: MAINTENANT } as never;
    expect((await sourcesSeance(db, { id: "s9", debut: d1 + 8 * H, fin: d1 + 9 * H }, d)).manque?.geste).toBe("sante");
    await retirerConnexionWhoop(db);
    expect((await sourcesSeance(db, { id: "s9", debut: d1 + 8 * H, fin: d1 + 9 * H }, d)).manque?.geste).toBe("sante");
  });
});

// ---- Relecture étendue de l'historique -----------------------------------------------------------------------------

const iso = (ms: number) => new Date(ms).toISOString();
const nuit = (id: string, fin: number) => ({
  id, cycle_id: 1, start: iso(fin - 7.5 * H), end: iso(fin), nap: false, score_state: "SCORED",
  score: {
    stage_summary: { total_in_bed_time_milli: 7.5 * H, total_awake_time_milli: 30 * MIN, total_light_sleep_time_milli: 3.5 * H, total_slow_wave_sleep_time_milli: 1.5 * H, total_rem_sleep_time_milli: 2 * H },
    sleep_needed: { baseline_milli: 8 * H, need_from_sleep_debt_milli: 0, need_from_recent_strain_milli: 0, need_from_recent_nap_milli: 0 },
    sleep_performance_percentage: 90,
  },
});
const recuperation = (sleep_id: string, fin: number, vfc: number) => ({
  cycle_id: 1, sleep_id, created_at: iso(fin + 5 * MIN), updated_at: iso(fin + 5 * MIN), score_state: "SCORED",
  score: { recovery_score: 60, resting_heart_rate: 52, hrv_rmssd_milli: vfc, spo2_percentage: 96, skin_temp_celsius: 33 },
});

/** API qui a une nuit par jour sur 800 jours ; filtre `start` (inclus) et `end` (exclu) comme Whoop ; compte les appels et peut tomber. */
function apiHistorique(o: { echecApres?: number } = {}) {
  const appels: { c: Collection; start: string; end?: string }[] = [];
  const api: ApiWhoop = {
    async page(c, start, _next, end) {
      appels.push({ c, start, end });
      if (o.echecApres != null && appels.length > o.echecApres) throw new ErreurWhoop("limite");
      const d = Date.parse(start);
      const f = end ? Date.parse(end) : Infinity;
      const records: unknown[] = [];
      for (let i = 0; i < 800; i++) {
        const fin = MINUIT - i * JOUR + 7 * H;
        const debut = fin - 7.5 * H;
        if (debut < d || debut >= f) continue;
        if (c === "sleep") records.push(nuit(`n${i}`, fin));
        if (c === "recovery") records.push(recuperation(`n${i}`, fin, 50 + (i % 40)));
      }
      return { records: records as never[], next_token: null };
    },
    corps: async () => ({}),
    revoquer: async () => {},
  };
  return { api, appels };
}

describe("relecture étendue de l'historique", () => {
  it("tranches : de la plus récente à la plus ancienne, avec un débord de 2 jours sur la suivante", () => {
    const l = tranchesHistorique(MINUIT);
    expect(l).toHaveLength(Math.ceil(HISTORIQUE_JOURS / TRANCHE_JOURS));
    expect(l[0]).toEqual({ depuis: MINUIT - TRANCHE_JOURS * JOUR, jusqua: MINUIT + 2 * JOUR });
    expect(l.at(-1)!.depuis).toBe(MINUIT - HISTORIQUE_JOURS * JOUR);
  });

  it("base vide (déconnexion avec suppression) : la synchro ordinaire lit 90 jours, la relecture rend le reste, VFC comprise", async () => {
    const { db } = await baseDeTest(true);
    const { api } = apiHistorique();
    await synchroniserWhoop(db, api, MAINTENANT);
    const avant = await compter(db, "whoop_jour");
    expect(avant).toBeGreaterThanOrEqual(81);
    expect(avant <= 92).toBe(true);
    expect(await relireHistoriqueWhoop(db, api, MAINTENANT)).toBe("fini");
    const apres = await compter(db, "whoop_jour");
    expect(apres).toBeGreaterThanOrEqual(701);
    expect((await historiqueMesure(db, "vfc")).length).toBeGreaterThanOrEqual(701);
    expect(lireEtatHistorique(await lireReglage(db, REGLAGE.historique))?.fini).toBe(true);
    // rien à refaire ensuite
    const { api: api2, appels } = apiHistorique();
    expect(await relireHistoriqueWhoop(db, api2, MAINTENANT)).toBe("inutile");
    expect(appels).toHaveLength(0);
  });

  it("coupure (limite de débit) : l'avancement reste, la relecture reprend à la tranche suivante sans refaire les faites", async () => {
    const { db } = await baseDeTest(true);
    await synchroniserWhoop(db, apiHistorique().api, MAINTENANT);
    // 3 appels par tranche (sommeil, récupération, cycles) : la deuxième tranche tombe
    const coupee = apiHistorique({ echecApres: 3 + 1 });
    expect(await relireHistoriqueWhoop(db, coupee.api, MAINTENANT)).toBe("interrompu");
    const e = lireEtatHistorique(await lireReglage(db, REGLAGE.historique))!;
    expect(e.faites).toBe(1);
    expect(e.fini).toBeUndefined();
    const reprise = apiHistorique();
    expect(await relireHistoriqueWhoop(db, reprise.api, MAINTENANT)).toBe("fini");
    // la première tranche n'est pas relue : la plus récente reprise part de l'ancre moins 2 tranches
    const attendue = tranchesHistorique(e.ancre)[1]!;
    expect(Date.parse(reprise.appels[0]!.start)).toBe(attendue.depuis);
    expect(reprise.appels.length).toBe(3 * (tranchesHistorique(e.ancre).length - 1));
  });

  it("une base qui a déjà plus que la première fenêtre n'a rien à rapatrier", async () => {
    const { db } = await baseDeTest(true);
    await enregistrerJours(db, [{ jour: MINUIT - 200 * JOUR, vfc: 60, sommeilMin: 400 }], MAINTENANT);
    const { api, appels } = apiHistorique();
    expect(await relireHistoriqueWhoop(db, api, MAINTENANT)).toBe("inutile");
    expect(appels).toHaveLength(0);
  });

  it("connexion coupée entre deux tranches : on s'arrête sans rien écrire de plus", async () => {
    const { db } = await baseDeTest(true);
    await synchroniserWhoop(db, apiHistorique().api, MAINTENANT);
    const avant = await compter(db, "whoop_jour");
    expect(await relireHistoriqueWhoop(db, apiHistorique().api, MAINTENANT, async () => false)).toBe("interrompu");
    expect(await compter(db, "whoop_jour")).toBe(avant);
  });

  it("la purge complète efface aussi l'avancement : la reconnexion relit tout", async () => {
    const { db } = await baseDeTest(true);
    await synchroniserWhoop(db, apiHistorique().api, MAINTENANT);
    await relireHistoriqueWhoop(db, apiHistorique().api, MAINTENANT);
    await purgerWhoop(db);
    expect(await lireReglage(db, REGLAGE.historique)).toBeNull();
    await synchroniserWhoop(db, apiHistorique().api, MAINTENANT);
    expect(await relireHistoriqueWhoop(db, apiHistorique().api, MAINTENANT)).toBe("fini");
    expect(await compter(db, "whoop_jour")).toBeGreaterThanOrEqual(701);
  });
});
