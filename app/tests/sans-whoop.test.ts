// Audit « sans Whoop » (docs/AUDIT-SANS-WHOOP.md) : un bracelet quelconque passe par Santé Connect ; l'autorisation de sa
// FC doit être demandée avec le reste (accueil, Connexions, page Santé), sinon l'Effort et les kcal des séances, l'activité
// de la journée et les activités détectées n'ont jamais la FC.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fabriquerSante, PERMISSIONS, PERMISSIONS_PAGE_SANTE, type NatifSante } from "../src/natif/sante/logique.ts";

test("la demande de la page Santé comprend la FC de la montre", () => {
  assert.ok(PERMISSIONS_PAGE_SANTE.includes("fc-montre"));
  // déclarée dans le manifeste (plugin du module), sinon Santé Connect ne la propose pas
  const plugin = readFileSync(new URL("../modules/pepfit-sante/plugin.js", import.meta.url), "utf8");
  assert.match(plugin, /"READ_HEART_RATE"/);
});

test("après la demande de la page Santé, la FC de Santé Connect se lit", async () => {
  let accordees = new Set<string>();
  const natif = {
    statut: async () => 3,
    autorisees: async () => [...accordees],
    demander: async (p: string[]) => ((accordees = new Set(p)), p),
    fc: async () => [{ t: 1000, bpm: 140 }, { t: 2000, bpm: 142 }],
  } as unknown as NatifSante;
  const sante = fabriquerSante(natif, () => 10_000);
  assert.equal(await sante.fcEntre(0, 5000), null);
  assert.ok(await sante.demanderPermissions(PERMISSIONS_PAGE_SANTE));
  assert.ok(accordees.has(PERMISSIONS["fc-montre"]));
  assert.deepEqual(await sante.fcEntre(0, 5000), [{ t: 1000, bpm: 140 }, { t: 2000, bpm: 142 }]);
});

// ---- Trous mesurés par la recette (docs/AUDIT-SANS-WHOOP.md) : écrits en « todo », ils échouent tant que le correctif n'est
// pas fait, sans faire tomber la suite. Retirer le todo avec le correctif.

test("C3 : une montre à 1 échantillon par minute : 45 min de course comptent ~45 min en zones (pas le barème)", async () => {
  const { minutesParZone } = await import("../src/ecrans/effort-jour.ts");
  const { CHARGE_EFFORT } = await import("../src/ecrans/effort-pepfit.ts");
  const fc = Array.from({ length: 45 }, (_, i) => ({ s: i * 60_000, bpm: 150 }));
  const z = minutesParZone(fc, 180, CHARGE_EFFORT.trouFcS.sante);
  assert.ok(z.reduce((x, y) => x + y, 0) >= 40, `minutes en zones : ${z.reduce((x, y) => x + y, 0)}`);
  // le capteur en direct garde 10 s : un trou d'une minute y est une perte de contact
  assert.ok(minutesParZone(fc, 180).reduce((x, y) => x + y, 0) < 10);
});

test("C4 : des VFC et FC au repos importées après le premier remplissage entrent dans les nuits passées", async () => {
  const { baseDeTest } = await import("./aide.ts");
  const { ajouterMesures } = await import("../src/db/depots/mesures.ts");
  const { assurerNuitsRecup, oublierPasseNuits } = await import("../src/ecrans/recup-donnees.ts");
  const { db } = await baseDeTest();
  const MAINTENANT = new Date(2026, 9, 31, 19, 0).getTime();
  const jour = (n: number) => new Date(2026, 9, 31 + n, 6, 45).getTime();
  // premier lancement : rien encore (l'import de Santé Connect passe avec la page Santé)
  oublierPasseNuits();
  await assurerNuitsRecup(db, { maintenant: MAINTENANT }, true);
  // puis l'import des 28 dernières nuits de la montre
  await ajouterMesures(db, "vfc", Array.from({ length: 28 }, (_, i) => ({ valeur: 55, date: jour(-i) })), "sante_connect", MAINTENANT);
  await ajouterMesures(db, "fc", Array.from({ length: 28 }, (_, i) => ({ valeur: 52, date: jour(-i) })), "sante_connect", MAINTENANT);
  oublierPasseNuits();
  await assurerNuitsRecup(db, { maintenant: MAINTENANT }, true);
  const r = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM recup_nuit WHERE rmssd IS NOT NULL", []);
  assert.ok((r?.n ?? 0) >= 27, `nuits avec VFC : ${r?.n}`);
});

// ---- Correctifs de l'audit (docs/SANS-WHOOP.md)

test("C2 : la FC d'une plage se lit depuis 24 h avant son début (enregistrements commencés avant), puis se filtre", () => {
  const kt = readFileSync(new URL("../modules/pepfit-sante/android/src/main/java/fit/pep/sante/PepfitSanteModule.kt", import.meta.url), "utf8");
  const bloc = kt.slice(kt.indexOf('AsyncFunction("fc")'), kt.indexOf('AsyncFunction("mesures")'));
  assert.match(bloc, /lire\(HeartRateRecord::class, debut - MARGE_FC_MS, fin\)/);
  assert.match(bloc, /filter \{ \(t, _\) -> t in a\.\.b \}/);
  const marge = Number(/MARGE_FC_MS = ([\d_ *.]+)/.exec(kt)?.[1]?.replace(/_/g, "").split("*").reduce((x, y) => x * Number(y), 1));
  assert.ok(marge >= 6 * 3_600_000, `marge : ${marge}`);
});

// Le Santé Connect simulé d'un profil de recette (tests/sans-whoop-profils.ts), branché sur la façade de l'appli le temps d'un test.
async function avecSc<T>(profil: import("./sans-whoop-profils.ts").ProfilSc, f: () => Promise<T>, o: Parameters<typeof import("./sans-whoop-profils.ts").santeSc>[1] = {}): Promise<T> {
  const { sante } = await import("../src/natif/sante/index.ts");
  const { santeSc } = await import("./sans-whoop-profils.ts");
  const origine = { ...sante };
  Object.assign(sante, santeSc(profil, o));
  try {
    return await f();
  } finally {
    Object.assign(sante, origine);
  }
}

/** Le compte de la recette, ses charges calculées avec la FC de Santé Connect (le recalcul de fond du lancement). */
async function compteRecette(profil: import("./sans-whoop-profils.ts").ProfilSc) {
  const { baseDeTest } = await import("./aide.ts");
  const { semerCompte, MAINTENANT, natifSc } = await import("./sans-whoop-profils.ts");
  const { recalculerCharges } = await import("../src/ecrans/effort-charges.ts");
  const { raw, db } = await baseDeTest();
  await semerCompte(raw, db);
  const n = natifSc(profil);
  await recalculerCharges(db, { fcSante: (a, b) => n.fc!(a, b), maintenant: MAINTENANT });
  return { raw, db, MAINTENANT, natif: n };
}

test("C8 : régularité du sommeil (SRI) sur les nuits de Santé Connect", async () => {
  const { regulariteNuits } = await import("../src/ecrans/mesures/regularite-sommeil.ts");
  const nuit = (n: number, decalMin = 0) => {
    const j = new Date(2026, 9, 10 + n).getTime();
    return { debut: j - 30 * 60_000 + decalMin * 60_000, fin: j + 7 * 3_600_000 + decalMin * 60_000 };
  };
  const pareilles = regulariteNuits([0, 1, 2, 3].map((n) => nuit(n)));
  assert.deepEqual([...pareilles.values()], [100, 100, 100], "mêmes heures : 100 (la première nuit n'a pas de veille)");
  // une heure plus tard une nuit sur deux : 2 h de désaccord sur 24 → 200 × 22/24 − 100 ≈ 83
  const decalees = regulariteNuits([0, 1, 2, 3].map((n) => nuit(n, n % 2 ? 60 : 0)));
  assert.deepEqual([...decalees.values()], [83, 83, 83]);
});

test("C8 : la Précision compte les séances mesurées par Santé Connect et la régularité des nuits de la montre (profil fc-sommeil)", async () => {
  const { lireDonneesPrecision } = await import("../src/precision/lire.ts");
  const { qualites } = await import("../src/precision/modele.ts");
  const { db, MAINTENANT } = await compteRecette("fc-sommeil");
  const { d } = await avecSc("fc-sommeil", () => lireDonneesPrecision(db, { sante: false }, MAINTENANT));
  // 28 jours : courses J−27 (hors fenêtre) … J−3, la muscu d'hier et le footing : toutes mesurées à la FC de Santé Connect
  assert.ok(d.fcSeances28 >= 4, `séances avec FC : ${d.fcSeances28}`);
  assert.equal(d.capteur, "sc");
  assert.ok((d.sommeil14 ?? 0) >= 13, `nuits avec heures : ${d.sommeil14}`);
  assert.equal(qualites(d).regularite, 1);
  assert.equal(qualites(d).fcSeance, 1);
});

test("C8 : l'Âge pepfit lit les zones des séances mesurées par Santé Connect et la régularité de ses nuits (sans Whoop)", async () => {
  const { lireHistorique, lireReculAge } = await import("../src/ecrans/mesures/age-donnees.ts");
  const { valeursEntre } = await import("../src/ecrans/mesures/age-calc.ts");
  const { db, MAINTENANT } = await compteRecette("fc-sommeil");
  const { h, sources } = await avecSc("fc-sommeil", () => lireHistorique(db, MAINTENANT));
  assert.equal(sources.zones, "pepfit");
  assert.ok((h.seancesFc ?? []).length >= 10, `séances avec zones : ${h.seancesFc?.length}`);
  const v = valeursEntre(h, MAINTENANT - 28 * 86_400_000, MAINTENANT);
  // 9 courses de 45 min vers 150 bpm (FC max d'après l'âge : 46 ans) : des minutes en zones chaque semaine
  assert.ok((v.zones13 ?? 0) + (v.zones45 ?? 0) > 60, `zones : ${v.zones13} + ${v.zones45}`);
  assert.ok(v.regularite != null && v.regularite > 60, `régularité : ${v.regularite}`);
  const recul = await lireReculAge(db, MAINTENANT);
  assert.ok(recul.debutFc != null && MAINTENANT - recul.debutFc > 14 * 86_400_000);
});

test("C8 : la page Âge en attente ne dit plus « avec Whoop » à qui a une montre sur Santé Connect", async () => {
  const { attente } = await import("../src/ecrans/mesures/age-attente.ts");
  const { MAINTENANT } = await import("./sans-whoop-profils.ts");
  const d = {
    naissance: "date", sexe: true, taille: true, poidsJours: 2, semainesPesees: 3, tourJours: null, navyJours: null, grasSource: null, grasJours: null,
    capteur: "sc", nuits14: 14, nuitsAvant: 13, sommeil14: 14, sommeilAvant: 13, pas14: 14, pasAvant: 14, pasAutorises: true, fcSeances28: 9, fcMax: "age",
    vma: null, semainesActives: 4, seances8: 11, muscu8: 1, choixReco: 0, nut30: 0, nut60: 0, nut28: 0, objectifPoids: false, semainesHistorique: 4,
  } as const;
  const a = attente({ d, recul: { debutWhoop: null, debutFc: MAINTENANT - 27 * 86_400_000, debutMuscu: MAINTENANT - 27 * 86_400_000, seancesMuscu: 11 }, vmaDate: null, maintenant: MAINTENANT });
  const l = (id: string) => a.facteurs.find((f) => f.id === id)!;
  assert.equal(l("regularite").etat, "pret");
  assert.equal(l("regularite").sous, "Prête, 27 nuits, Santé Connect");
  assert.equal(l("zones13").sous, "Prêtes, FC de tes séances");
  assert.ok(a.facteurs.every((f) => !/Whoop/.test(f.sous)), a.facteurs.map((f) => f.sous).join(" | "));
});

test("C3 : profil complet-1min (1 FC par minute même en séance) : le footing et les courses sont mesurés à la FC", async () => {
  const { db } = await compteRecette("complet-1min");
  const l = await db.getAllAsync<{ seance_id: string; methode: string; source_fc: string | null }>("SELECT seance_id, methode, source_fc FROM seance_charge ORDER BY seance_id", []);
  const de = (id: string) => l.find((x) => x.seance_id === id);
  assert.deepEqual([de("demo-footing")?.methode, de("demo-footing")?.source_fc], ["fc", "sante"]);
  assert.ok(l.filter((x) => x.seance_id.startsWith("demo-c") && x.methode === "fc").length === 9, JSON.stringify(l));
});

test("C2 : une charge faite avec la FC de Santé Connect d'avant le correctif (15 min sur 45, barème) est relue en entier", async () => {
  const { db, natif, MAINTENANT } = await compteRecette("complet");
  const { recalculerCharges } = await import("../src/ecrans/effort-charges.ts");
  // ce que l'APK d'avant C2 avait écrit : version 1, 15 dernières minutes lues (« |sc181 »), au barème, avec FC
  await db.runAsync("UPDATE seance_charge SET methode = 'bareme', version = 1, empreinte = '1|x|cat:course|45.00||-|sc181', avec_fc = 1 WHERE seance_id = 'demo-c9'", []);
  await recalculerCharges(db, { fcSante: (a, b) => natif.fc!(a, b), maintenant: MAINTENANT });
  const r = await db.getFirstAsync<{ methode: string; empreinte: string }>("SELECT methode, empreinte FROM seance_charge WHERE seance_id = 'demo-c9'", []);
  assert.equal(r?.methode, "fc");
  const { CHARGE_EFFORT } = await import("../src/ecrans/effort-pepfit.ts");
  assert.ok(r!.empreinte.startsWith(`${CHARGE_EFFORT.version}|`), r!.empreinte);
});

test("C5 : la FC au repos se déduit de la FC de nuit (plus basse moyenne sur 30 min) quand la montre ne l'écrit pas", async () => {
  const { fcReposDeNuit, deduireFcReposNuits } = await import("../src/ecrans/fc-repos-nuit.ts");
  const { historiqueMesure, ajouterMesures } = await import("../src/db/depots/mesures.ts");
  const { baseDeTest } = await import("./aide.ts");
  const { santeSc, MAINTENANT } = await import("./sans-whoop-profils.ts");
  // une nuit à 60, avec 40 min à 48 : 48 ; trop peu de mesures : rien
  const fc = Array.from({ length: 400 }, (_, i) => ({ t: i * 60_000, bpm: i >= 200 && i < 240 ? 48 : 60 }));
  assert.equal(fcReposDeNuit(fc, 0, 400 * 60_000), 48);
  assert.equal(fcReposDeNuit(fc.filter((_, i) => i % 3 === 0), 0, 400 * 60_000), null);
  // profil fc-sommeil (Samsung : ni FC au repos ni VFC) : une FC au repos par nuit, entre 46 et 57
  const { db } = await baseDeTest();
  const n = await deduireFcReposNuits(db, santeSc("fc-sommeil"), MAINTENANT);
  const l = await historiqueMesure(db, "fc", MAINTENANT - 31 * 86_400_000);
  assert.ok(n >= 27 && l.length === n, `nuits : ${n}, mesures : ${l.length}`);
  assert.ok(l.every((m) => m.source === "pepfit" && m.valeur >= 44 && m.valeur <= 58), l.map((m) => m.valeur).join(","));
  // déjà là : rien de plus ; la FC au repos écrite par la montre pour la même nuit prime sur la déduite
  assert.equal(await deduireFcReposNuits(db, santeSc("fc-sommeil"), MAINTENANT), 0);
  await ajouterMesures(db, "fc", [{ valeur: 51, date: l[0]!.date + 60_000 }], "sante_connect", MAINTENANT);
  const apres = await historiqueMesure(db, "fc", l[0]!.date - 3_600_000);
  assert.deepEqual(apres.map((m) => [m.valeur, m.source]), [[51, "sante_connect"]]);
});

test("C5 : la montre qui écrit la FC au repos (profil garmin) n'a pas de FC déduite", async () => {
  const { deduireFcReposNuits } = await import("../src/ecrans/fc-repos-nuit.ts");
  const { importerMesures } = await import("../src/db/depots/mesures.ts");
  const { baseDeTest } = await import("./aide.ts");
  const { santeSc, MAINTENANT } = await import("./sans-whoop-profils.ts");
  const { db } = await baseDeTest();
  const s = santeSc("garmin");
  assert.ok((await importerMesures(db, s)) >= 27);
  assert.equal(await deduireFcReposNuits(db, s, MAINTENANT), 0);
});

/** Le compte de la recette, avec les mesures de Santé Connect importées et les nuits de Récupération remplies (30 jours). */
async function recupRecette(profil: import("./sans-whoop-profils.ts").ProfilSc) {
  const { db, MAINTENANT } = await compteRecette(profil);
  const { santeSc } = await import("./sans-whoop-profils.ts");
  const { importerMesures } = await import("../src/db/depots/mesures.ts");
  const { deduireFcReposNuits } = await import("../src/ecrans/fc-repos-nuit.ts");
  const { ecrireNuitsRecup } = await import("../src/ecrans/recup-donnees.ts");
  const s = santeSc(profil);
  await importerMesures(db, s);
  await deduireFcReposNuits(db, s, MAINTENANT);
  const auj = new Date(2026, 9, 31).getTime();
  await ecrireNuitsRecup(db, auj - 30 * 86_400_000, auj, { nuitsSante: (a, b) => s.nuits(a, b), maintenant: MAINTENANT });
  return { db, auj };
}

test("C6 : sans VFC jamais mesurée (profil garmin), son poids passe à la FC au repos et au sommeil ; précision ≤ 55 %", async () => {
  const { lireRecupJour } = await import("../src/ecrans/recup-donnees.ts");
  const { RECUP, scoreRecup } = await import("../src/ecrans/recup-pepfit.ts");
  const { db, auj } = await recupRecette("garmin");
  const r = await lireRecupJour(db, auj);
  assert.equal(r.version, 4);
  assert.equal(r.sansVfc, true);
  assert.deepEqual(Object.fromEntries(Object.entries(r.apports).map(([k, a]) => [k, a.poids])), { vfc: 0, fc: 0.4, sommeil: 0.5, charge: 0.1 });
  assert.equal(r.apports.vfc.apport, 0);
  assert.ok(r.score != null && r.precision <= 55 && r.precision >= 40, `score ${r.score}, précision ${r.precision}`);
  // la même matinée avec les poids d'avant (une VFC absente comptée 70) : la part de la VFC tirait le score vers 70
  const { lireDonneesRecup } = await import("../src/ecrans/recup-donnees.ts");
  const v1 = scoreRecup("2026-10-31", await lireDonneesRecup(db, auj, auj), { ...RECUP, version: 1, sansVfc: RECUP.poids });
  assert.equal(v1.precision, r.precision, "la précision se compte sur les poids de référence");
  assert.ok(Math.abs(r.brut - 70) > Math.abs(v1.brut - 70), `brut v2 ${r.brut}, v1 ${v1.brut}`);
});

test("C6 : avec une VFC (profil complet), les poids de référence", async () => {
  const { lireRecupJour } = await import("../src/ecrans/recup-donnees.ts");
  const { db, auj } = await recupRecette("complet");
  const r = await lireRecupJour(db, auj);
  assert.equal(r.sansVfc, false);
  assert.equal(r.apports.vfc.poids, 0.45);
});

test("C7 : la fiche d'une séance mesurée par Santé Connect montre sa courbe de FC, ses zones et ses kcal (profils fc et complet-1min)", async () => {
  const { lireSeance } = await import("../src/db/depots/seances.ts");
  const { sourcesSeance } = await import("../src/ecrans/seance-sources.ts");
  const { chargerEffort } = await import("../src/ecrans/effort-donnees.ts");
  const { santeSc } = await import("./sans-whoop-profils.ts");
  for (const profil of ["fc", "complet-1min"] as const) {
    const { db, MAINTENANT } = await compteRecette(profil);
    const s = (await lireSeance(db, "demo-footing"))!;
    assert.equal(await chargerEffort(db, s), null, "sans FC d'ailleurs : pas de bloc (ni suivi ni Whoop)");
    const src = await sourcesSeance(db, { id: s.seance.id, debut: s.seance.debut, fin: s.seance.fin! }, { sante: santeSc(profil), maintenant: MAINTENANT });
    assert.equal(src.fc?.source, "sante");
    const e = await chargerEffort(db, s, src.fc);
    assert.ok(e, profil);
    assert.equal(e!.source, "Santé Connect");
    assert.ok(e!.vue.serieFc.length >= 30 && !e!.vue.serieFc.slice(1).some((p) => p.coupe), `${profil} : courbe de ${e!.vue.serieFc.length} points, sans coupure`);
    const z = e!.vue.zonesS!;
    assert.ok(z.reduce((a, b) => a + b, 0) >= 40 * 60, `${profil} : ${z.join(",")} s en zones`);
    assert.ok(e!.vue.fcMoy! >= 140 && e!.vue.fcMoy! <= 156, `${profil} : FC moy. ${e!.vue.fcMoy}`);
    assert.ok(e!.vue.serieFc.at(-1)!.bpm > 120, `${profil} : la courbe finit sur la course, pas sur le repos (${e!.vue.serieFc.at(-1)!.bpm})`);
    assert.equal(e!.vue.zonesS![0], 0, `${profil} : rien sous Z1`);
    // les kcal à la FC gardée minute par minute par l'Effort (kcal-fc.ts) : 45 min vers 148 bpm, 78 kg
    assert.ok(e!.calories != null && e!.calories > 350 && e!.calories < 900, `${profil} : ${e!.calories} kcal`);
  }
});

test("C9 : le facteur Musculation de l'Âge ne compte que la famille « force » (1 muscu, pas les 10 courses)", async () => {
  const { lireHistorique, lireReculAge } = await import("../src/ecrans/mesures/age-donnees.ts");
  const { db, MAINTENANT } = await compteRecette("fc");
  const { h } = await avecSc("fc", () => lireHistorique(db, MAINTENANT));
  assert.equal(h.muscu.length, 1);
  assert.equal(h.muscu[0]!.minutes, 50);
  assert.equal(h.debutMuscu, new Date(2026, 9, 30, 12, 15).getTime());
  const r = await lireReculAge(db, MAINTENANT);
  assert.deepEqual([r.debutMuscu, r.seancesMuscu], [h.debutMuscu, 1]);
});

test("C10 : la FC max automatique voit la FC des séances mesurées par Santé Connect", async () => {
  const { lireZonesFc } = await import("../src/db/depots/zones-fc.ts");
  const { db, MAINTENANT } = await compteRecette("fc");
  // courses vers 150 bpm (± 4 × gauss) : vue, mais sous l'estimée d'après l'âge (46 ans, Tanaka : 176)
  const z = await lireZonesFc(db, MAINTENANT);
  assert.ok(z.fcMax.vue != null && z.fcMax.vue >= 150 && z.fcMax.vue < 176, `vue : ${z.fcMax.vue}`);
  assert.equal(z.fcMax.source, "estimee");
  // une séance où la montre a vu 186 et 188 deux minutes : mesurée au-dessus de l'estimée, retenue
  await db.runAsync("UPDATE reglages SET valeur = ? WHERE cle = 'cache_fc_min:demo-footing'", [JSON.stringify({ v: 1, fc: [150, 170, 186, 188, 160, 0, 199] })]);
  const z2 = await lireZonesFc(db, MAINTENANT);
  assert.deepEqual([z2.fcMax.source, z2.fcMax.bpm], ["mesuree", 188]);
});

test("C11 : les kcal du vélo d'une autre appli (profil fc-sommeil) se calculent à la FC de Santé Connect, plus aux MET", async () => {
  const { garderFcSeancesSante } = await import("../src/ecrans/kcal-fc.ts");
  const { jourEnergie, lireReglagesEnergie } = await import("../src/ecrans/sante-donnees.ts");
  const { santeSc } = await import("./sans-whoop-profils.ts");
  const { db, MAINTENANT } = await compteRecette("fc-sommeil");
  const s = santeSc("fc-sommeil");
  const avant = new Date(2026, 9, 29).getTime();
  const velo = async () => (await jourEnergie(db, avant, MAINTENANT, await lireReglagesEnergie(db), s)).bilan.sport.seances.find((x) => x.origine === "fit.pep.recette.sc");
  assert.equal((await velo())?.methode, "met", "avant : les MET du vélo");
  assert.equal(await garderFcSeancesSante(db, s, MAINTENANT), 1);
  assert.equal(await garderFcSeancesSante(db, s, MAINTENANT), 0, "gardée une fois");
  const v = await velo();
  assert.equal(v?.methode, "fc");
  assert.ok(v!.kcal > 300 && v!.kcal < 1200, `${v!.kcal} kcal pour 60 min vers 138 bpm`);
});

test("C12 : pas vides alors que la montre en écrit (hors des priorités de Santé Connect) : la page Pas le dit ; l'Énergie dit « supposés »", async () => {
  const { lireDonneesPas } = await import("../src/ecrans/mesures/pas-donnees.ts");
  const { t } = await import("../src/i18n/index.ts");
  const { santeSc } = await import("./sans-whoop-profils.ts");
  const { db, MAINTENANT } = await compteRecette("fc-sommeil");
  const vide = await lireDonneesPas(db, MAINTENANT, santeSc("fc-sommeil", { pasVides: true }), 5_000);
  assert.equal(vide.aujourdhui.etat === "valeur", false);
  assert.deepEqual(vide.horsPriorite, ["fit.pep.recette.sc"]);
  assert.match(t("mesuresPas.horsPrioriteTexte", { appli: t("mesuresPas.tonAppli") }), /priorités/);
  // la montre dans les priorités : des pas, aucun message
  const plein = await lireDonneesPas(db, MAINTENANT, santeSc("fc-sommeil"), 5_000);
  assert.equal(plein.horsPriorite, null);
  // l'Énergie : sans pas, les 5 000 par défaut sont dits supposés (la ligne de la page et de la feuille)
  const src = (await import("node:fs")).readFileSync(new URL("../src/ecrans/mesures/Energie.tsx", import.meta.url), "utf8");
  assert.match(src, /b\.neat\.defaut \? "sante\.pasSupposes" : b\.neat\.seancesSansPas \? "sante\.pasJourSeances" : "sante\.pasHorsSport"/);
});

test("C14 : sommeil d'une montre sans VFC ni FC au repos : « sans VFC ni FC au repos », plus « sans ta montre »", async () => {
  const { manqueNuit } = await import("../src/ecrans/mesures/recup-vue.ts");
  const { t } = await import("../src/i18n/index.ts");
  const { lireRecupJour, ecrireNuitsRecup } = await import("../src/ecrans/recup-donnees.ts");
  const { santeSc } = await import("./sans-whoop-profils.ts");
  // profil fc-sommeil sans FC de nuit déduite (ici la FC n'est pas autorisée) : le sommeil de la montre seul
  const { db, MAINTENANT } = await compteRecette("fc-sommeil");
  const s = santeSc("fc-sommeil", { sansFc: true });
  const auj = new Date(2026, 9, 31).getTime();
  await ecrireNuitsRecup(db, auj - 30 * 86_400_000, auj, { nuitsSante: (a, b) => s.nuits(a, b), maintenant: MAINTENANT });
  const r = await lireRecupJour(db, auj);
  assert.equal(r.detail.sommeil.source, "montre");
  assert.equal(manqueNuit(r), "vfcFc");
  assert.equal(t("recup.sansVfcFc"), "Ce matin, sans VFC ni FC au repos");
  // le téléphone seul : toujours « sans ta montre »
  assert.equal(manqueNuit({ nuit: true, detail: { ...r.detail, sommeil: { ...r.detail.sommeil, source: "telephone" } } }), "montre");
  assert.equal(manqueNuit({ nuit: true, detail: { ...r.detail, fc: { ...r.detail.fc, valeur: 50 } } }), null);
});

test("C15 : la VFC d'une nuit est la moyenne des mesures de la session de sommeil, pas la dernière du jour (Oura)", async () => {
  const { vfcDesNuits } = await import("../src/ecrans/vfc-nuit.ts");
  const { baseDeTest } = await import("./aide.ts");
  const { ajouterMesures } = await import("../src/db/depots/mesures.ts");
  const { ecrireNuitsRecup } = await import("../src/ecrans/recup-donnees.ts");
  const { lireNuitsCoeur } = await import("../src/ecrans/mesures/coeur-donnees.ts");
  const h = (j: number, hh: number, mm = 0) => new Date(2026, 9, j, hh, mm).getTime();
  // trois mesures dans la nuit du 30 au 31 (Oura), une mesure ponctuelle l'après-midi du 31
  const mesures = [
    { date: h(31, 1), valeur: 52 }, { date: h(31, 3), valeur: 58 }, { date: h(31, 6, 50), valeur: 64 }, { date: h(31, 15), valeur: 90 },
    // une seule mesure, l'après-midi du 29 : faute de mieux, elle reste celle du jour
    { date: h(29, 16), valeur: 70 },
  ];
  const session = { debut: h(30, 23, 30), fin: h(31, 7) };
  const v = vfcDesNuits(mesures, [session]);
  assert.equal(v.get(new Date(2026, 9, 31).getTime())?.valeur, 58);
  assert.equal(v.get(new Date(2026, 9, 31).getTime())?.n, 3);
  assert.equal(v.get(new Date(2026, 9, 29).getTime())?.valeur, 70);
  // sans session (page VFC) : la nuit par défaut, 18:00 → midi, même résultat
  assert.equal(vfcDesNuits(mesures).get(new Date(2026, 9, 31).getTime())?.valeur, 58);
  // dans la base : la Récupération et la page VFC
  const { db } = await baseDeTest();
  const M = h(31, 19);
  await ajouterMesures(db, "vfc", mesures.slice(0, 4), "sante_connect", M);
  const auj = new Date(2026, 9, 31).getTime();
  await ecrireNuitsRecup(db, auj - 86_400_000, auj, { nuitsSante: async () => [{ ...session, minutes: 450, phases: null, origine: "com.ouraring.oura" }], maintenant: M });
  const r = await db.getFirstAsync<{ rmssd: number }>("SELECT rmssd FROM recup_nuit WHERE jour = '2026-10-31'", []);
  assert.equal(r?.rmssd, 58);
  const page = await lireNuitsCoeur(db, "vfc", M, Promise.resolve(new Map()));
  assert.deepEqual(page.map((x) => x.valeur), [58]);
});
