// Source des pas, même règle partout : les pas Whoop gardés d'un jour fini, sinon Santé Connect autorisé, sinon le compteur du
// téléphone s'il est activé, sinon à connecter. Base SQLite réelle (whoop_jour, réglages), Santé Connect simulé.
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import { choisirPas, derniersJours, lirePasJour, lirePasJours, valeurPas, type SantePas } from "../src/ecrans/pas-source.ts";
import { enregistrerJours } from "../src/whoop/depot.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { REGLAGE_TEL_ACTIF, reglageJour } from "../src/ecrans/pas-telephone.ts";

describe("règle", () => {
  it("Whoop actif avec une valeur : Whoop, même si Santé Connect est autorisé", () => {
    expect(choisirPas({ whoopActif: true, whoop: 9000, santeAutorise: true, sante: 7000 })).toEqual({ etat: "valeur", pas: 9000, source: "whoop" });
  });
  it("Santé Connect plus haut que Whoop : la montre est plus à jour (Whoop restait à 0 depuis 8 h, 02/11)", () => {
    expect(choisirPas({ whoopActif: true, whoop: 0, santeAutorise: true, sante: 500 })).toEqual({ etat: "valeur", pas: 500, source: "sante" });
    expect(choisirPas({ whoopActif: true, whoop: 1623, santeAutorise: true, sante: 4200 })).toEqual({ etat: "valeur", pas: 4200, source: "sante" });
  });
  it("Whoop actif sans valeur ce jour-là : Santé Connect s'il est autorisé", () => {
    expect(choisirPas({ whoopActif: true, whoop: null, santeAutorise: true, sante: 7000 })).toEqual({ etat: "valeur", pas: 7000, source: "sante" });
  });
  it("Whoop actif sans valeur, Santé Connect non autorisé : on ne réclame pas Santé Connect (vide, source Whoop)", () => {
    expect(choisirPas({ whoopActif: true, whoop: null, santeAutorise: false, sante: null })).toEqual({ etat: "vide", source: "whoop" });
  });
  it("une valeur Whoop gardée alors que l'option est coupée ne compte pas", () => {
    expect(choisirPas({ whoopActif: false, whoop: 9000, santeAutorise: true, sante: 7000 })).toEqual({ etat: "valeur", pas: 7000, source: "sante" });
  });
  it("Santé Connect autorisé sans donnée : vide ; aucune source : à connecter", () => {
    expect(choisirPas({ whoopActif: false, whoop: null, santeAutorise: true, sante: null })).toEqual({ etat: "vide", source: "sante" });
    expect(choisirPas({ whoopActif: false, whoop: null, santeAutorise: false, sante: null })).toEqual({ etat: "a-connecter" });
  });
  it("0 pas est une valeur, pas un vide", () => {
    expect(choisirPas({ whoopActif: true, whoop: 0, santeAutorise: false, sante: null })).toEqual({ etat: "valeur", pas: 0, source: "whoop" });
    expect(choisirPas({ whoopActif: true, whoop: 0, santeAutorise: true, sante: null })).toEqual({ etat: "valeur", pas: 0, source: "whoop" });
    expect(valeurPas({ etat: "valeur", pas: 0, source: "whoop" })).toBe(0);
    expect(valeurPas({ etat: "vide", source: "sante" })).toBeNull();
    expect(valeurPas({ etat: "a-connecter" })).toBeNull();
  });
});

describe("lecture (base et Santé Connect)", () => {
  const maintenant = new Date(2026, 9, 28, 17, 5).getTime();
  const jours = derniersJours(3, maintenant);
  const [avantHier, hier, auj] = jours as [number, number, number];

  function santeSimulee(autorise: boolean, parJour: Record<number, number>) {
    const appels: number[] = [];
    const s: SantePas = {
      autorisees: async () => (autorise ? ["pas"] : []),
      pasEntre: async (debut) => (appels.push(debut), parJour[debut] ?? null),
    };
    return { s, appels };
  }

  it("derniers jours : minuits locaux, aujourd'hui en dernier", () => {
    expect(jours).toEqual([new Date(2026, 9, 26).getTime(), new Date(2026, 9, 27).getTime(), new Date(2026, 9, 28).getTime()]);
  });

  it("pas Whoop gardés d'un jour fini, Santé Connect non autorisé → les pas Whoop, pas de demande de Santé Connect", async () => {
    const { db } = await baseDeTest();
    await enregistrerJours(db, [{ jour: hier, pas: 6543 }]);
    const { s } = santeSimulee(false, {});
    expect(await lirePasJour(db, hier, maintenant, s)).toEqual({ etat: "valeur", pas: 6543, source: "whoop" });
  });

  it("jour par jour : Whoop là où le journal a gardé un jour fini, Santé Connect ailleurs (lu seulement pour ces jours-là)", async () => {
    const { db } = await baseDeTest();
    await enregistrerJours(db, [{ jour: avantHier, pas: 11000 }, { jour: auj, pas: 3000 }]);
    const { s, appels } = santeSimulee(true, { [avantHier]: 1, [hier]: 8000, [auj]: 2 });
    const l = await lirePasJours(db, jours, maintenant, s);
    expect(l).toEqual([
      { etat: "valeur", pas: 11000, source: "whoop" },
      { etat: "valeur", pas: 8000, source: "sante" },
      // le jour en cours, que plus rien ne met à jour : Santé Connect
      { etat: "valeur", pas: 2, source: "sante" },
    ]);
    expect(appels).toEqual([hier, auj]);
  });

  it("jour en cours : Santé Connect, même si whoop_jour a encore des pas", async () => {
    const { db } = await baseDeTest();
    await enregistrerJours(db, [{ jour: auj, pas: 3000 }]);
    const { s } = santeSimulee(true, { [auj]: 4200 });
    expect(await lirePasJour(db, auj, maintenant, s)).toEqual({ etat: "valeur", pas: 4200, source: "sante" });
  });

  it("aucune source : à connecter ; Santé Connect en panne : vide, sans exception", async () => {
    const { db } = await baseDeTest();
    expect(await lirePasJour(db, auj, maintenant, santeSimulee(false, {}).s)).toEqual({ etat: "a-connecter" });
    const panne: SantePas = { autorisees: async () => ["pas"], pasEntre: async () => Promise.reject(new Error("SC")) };
    expect(await lirePasJour(db, auj, maintenant, panne)).toEqual({ etat: "vide", source: "sante" });
  });

  it("sans Whoop : Santé Connect d'abord ; non autorisé ou sans donnée, le compteur du téléphone activé ; éteint, à connecter", async () => {
    const { db } = await baseDeTest();
    await ecrireReglage(db, REGLAGE_TEL_ACTIF, "1");
    await ecrireReglage(db, reglageJour(hier), "5321");
    expect(await lirePasJour(db, hier, maintenant, santeSimulee(true, { [hier]: 8000 }).s)).toEqual({ etat: "valeur", pas: 8000, source: "sante" });
    expect(await lirePasJour(db, hier, maintenant, santeSimulee(true, {}).s)).toEqual({ etat: "valeur", pas: 5321, source: "telephone" });
    expect(await lirePasJour(db, hier, maintenant, santeSimulee(false, {}).s)).toEqual({ etat: "valeur", pas: 5321, source: "telephone" });
    await ecrireReglage(db, REGLAGE_TEL_ACTIF, "0");
    expect(await lirePasJour(db, hier, maintenant, santeSimulee(false, {}).s)).toEqual({ etat: "a-connecter" });
  });
});
