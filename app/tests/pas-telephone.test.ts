// Pas du téléphone en repli (src/ecrans/pas-telephone.ts, pas-source.ts) : compteur cumulé depuis le démarrage, rangé par jour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirPas } from "../src/ecrans/pas-source.ts";
import { REGLAGE_TEL_ACTIF, activerTelephone, echantillonnerTelephone, pasAjoutes, pasTelephoneJours, reglageJour } from "../src/ecrans/pas-telephone.ts";
import { fr } from "../src/i18n/fr.ts";
import { en } from "../src/i18n/en.ts";

const J = new Date(2026, 10, 4).getTime();
const h = (n: number) => J + n * 3_600_000;
const base = () => {
  const m = new Map<string, string>();
  return {
    m,
    db: {
      getFirstAsync: async (_s: string, p: string[] = []) => (m.has(p[0]!) ? { valeur: m.get(p[0]!) } : null),
      getAllAsync: async () => [...m].filter(([k]) => k.startsWith("pas_telephone_jour:")).map(([cle, valeur]) => ({ cle, valeur })),
      runAsync: async (_s: string, p: string[] = []) => void m.set(p[0]!, p[1]!),
    } as never,
  };
};
const compteur = (v: number | null) => ({ compteur: async () => v });

test("différence des cumuls : même jour, redémarrage, autre jour, première lecture", () => {
  assert.equal(pasAjoutes({ brut: 1000, t: h(8) }, 1600, h(12)), 600);
  assert.equal(pasAjoutes({ brut: 5000, t: h(8) }, 300, h(12)), 300); // redémarré : le nouveau cumul en entier
  assert.equal(pasAjoutes({ brut: 1000, t: h(-3) }, 1600, h(12)), 0); // lecture d'hier : pas rangée
  assert.equal(pasAjoutes(null, 1600, h(12)), 0);
});

test("lectures successives rangées dans le jour ; réglage éteint : rien", async () => {
  const { db, m } = base();
  assert.equal(await echantillonnerTelephone(db, h(8), compteur(1000)), false);
  m.set(REGLAGE_TEL_ACTIF, "1");
  await echantillonnerTelephone(db, h(8), compteur(1000));
  await echantillonnerTelephone(db, h(12), compteur(1600));
  await echantillonnerTelephone(db, h(13), compteur(200)); // redémarrage
  assert.equal(m.get(reglageJour(J)), "800");
  assert.deepEqual([...(await pasTelephoneJours(db, [J, J - 86_400_000]))], [[J, 800]]);
  assert.equal(await echantillonnerTelephone(db, h(14), compteur(null)), false); // sans réponse : rien ne change
  assert.equal(m.get(reglageJour(J)), "800");
});

test("activation : sans capteur ou permission refusée, rien n'est activé", async () => {
  const { db, m } = base();
  const p = (disponible: boolean, autorise: boolean, accorde: boolean, v: number | null = 100) => ({ disponible: async () => disponible, autorise: async () => autorise, demander: async () => accorde, compteur: async () => v });
  assert.equal(await activerTelephone(db, p(false, true, true)), false);
  assert.equal(await activerTelephone(db, p(true, false, false)), false);
  assert.equal(m.has(REGLAGE_TEL_ACTIF), false);
  assert.equal(await activerTelephone(db, p(true, false, true)), true);
  assert.equal(m.get(REGLAGE_TEL_ACTIF), "1");
});

test("la règle : le téléphone ne passe qu'après Whoop et Santé Connect", () => {
  const e = { whoopActif: false, whoop: null, santeAutorise: false, sante: null, telephoneActif: true, telephone: 4200 };
  assert.deepEqual(choisirPas(e), { etat: "valeur", pas: 4200, source: "telephone" });
  assert.deepEqual(choisirPas({ ...e, santeAutorise: true, sante: 9000 }), { etat: "valeur", pas: 9000, source: "sante" });
  assert.deepEqual(choisirPas({ ...e, whoopActif: true, whoop: 7000 }), { etat: "valeur", pas: 7000, source: "whoop" });
  assert.deepEqual(choisirPas({ ...e, santeAutorise: true }), { etat: "valeur", pas: 4200, source: "telephone" }); // Santé Connect vide
  assert.deepEqual(choisirPas({ ...e, telephone: null }), { etat: "vide", source: "telephone" });
  assert.deepEqual(choisirPas({ ...e, telephoneActif: false }), { etat: "a-connecter" }); // repli éteint : comme avant
});

test("textes fr et en, sans point médian", () => {
  for (const k of ["mesures.telephone", "mesuresPas.telephone", "mesuresPas.telephoneAide"] as const) {
    assert.ok(fr[k] && en[k], k);
    assert.ok(!fr[k].includes("·") && !en[k].includes("·"), k);
  }
});
