// Côté téléphone : jetons (rotation du refresh, un seul renouvellement à la fois), client de l'API officielle (User-Agent
// navigateur, 401 -> renouvellement, 429 -> attente). L'OAuth lui-même : tests/oauth-client.test.ts.
import { describe, expect, it } from "./attendu.ts";
import { BASE_API, creerApi, UA_NAVIGATEUR } from "../src/whoop/api.ts";
import { creerJetons, enJetons, type Coffre } from "../src/whoop/jetons.ts";
import { ErreurWhoop } from "../src/whoop/types.ts";

const reponse = (status: number, corps: unknown = {}, entetes: Record<string, string> = {}) => ({
  status,
  headers: { get: (n: string) => entetes[n] ?? null },
  json: async () => corps,
});

function coffreMemoire(): Coffre & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, lire: async (c) => m.get(c) ?? null, ecrire: async (c, v) => void m.set(c, v), effacer: async (c) => void m.delete(c) };
}

describe("jetons : rotation du refresh token", () => {
  const maintenant = 1_000_000;
  const depart = enJetons({ access_token: "A1", refresh_token: "R1", expires_in: 3600 }, maintenant);

  it("jeton encore valable : aucun renouvellement", async () => {
    const c = coffreMemoire();
    let n = 0;
    const j = creerJetons(c, "k", async () => (n++, { access_token: "A2", refresh_token: "R2", expires_in: 3600 }), () => maintenant + 1000);
    await j.enregistrer(depart);
    expect(await j.accesValable()).toBe("A1");
    expect(n).toBe(0);
  });

  it("expiré : le nouveau refresh est enregistré aussitôt ; 5 appels simultanés = 1 seul renouvellement", async () => {
    const c = coffreMemoire();
    const vus: string[] = [];
    const j = creerJetons(
      c,
      "k",
      async (rt) => {
        vus.push(rt);
        await new Promise((r) => setTimeout(r, 5));
        return { access_token: "A2", refresh_token: "R2", expires_in: 3600 };
      },
      () => maintenant + 3_700_000,
    );
    await j.enregistrer(depart);
    const l = await Promise.all([1, 2, 3, 4, 5].map(() => j.accesValable()));
    expect(l).toEqual(["A2", "A2", "A2", "A2", "A2"]);
    expect(vus).toEqual(["R1"]);
    expect(JSON.parse(c.m.get("k")!).refresh_token).toBe("R2");
  });

  it("refresh refusé : jetons effacés, 'expire' (reconnexion demandée) ; panne réseau : jetons gardés", async () => {
    const c = coffreMemoire();
    const refuse = creerJetons(c, "k", async () => Promise.reject(new ErreurWhoop("refuse")), () => maintenant + 3_700_000);
    await refuse.enregistrer(depart);
    await expect(refuse.accesValable()).rejects.toMatchObject({ code: "expire" });
    expect(c.m.has("k")).toBe(false);
    await expect(refuse.accesValable()).rejects.toMatchObject({ code: "non-connecte" });
    const c2 = coffreMemoire();
    const reseau = creerJetons(c2, "k", async () => Promise.reject(new ErreurWhoop("reseau")), () => maintenant + 3_700_000);
    await reseau.enregistrer(depart);
    await expect(reseau.accesValable()).rejects.toMatchObject({ code: "reseau" });
    expect(c2.m.has("k")).toBe(true);
  });

  it("refusé parce qu'un autre renouvellement a déjà tourné le refresh (deux instances, 08 et 09/11) : on garde ses jetons, pas de déconnexion", async () => {
    const c = coffreMemoire();
    const premier = creerJetons(c, "k", async () => ({ access_token: "A2", refresh_token: "R2", expires_in: 3600 }), () => maintenant + 3_700_000);
    const second = creerJetons(
      c,
      "k",
      async () => {
        // le premier a tourné R1 en R2 pendant que celui-ci attendait : le serveur refuse R1
        await premier.accesValable();
        throw new ErreurWhoop("refuse");
      },
      () => maintenant + 3_700_000,
    );
    await premier.enregistrer(depart);
    expect(await second.accesValable()).toBe("A2");
    expect(JSON.parse(c.m.get("k")!).refresh_token).toBe("R2");
  });

  it("si le renouvellement ne renvoie pas de refresh, l'ancien est gardé", async () => {
    const c = coffreMemoire();
    const j = creerJetons(c, "k", async () => ({ access_token: "A2", refresh_token: null, expires_in: 3600 }), () => maintenant + 3_700_000);
    await j.enregistrer(depart);
    await j.accesValable();
    expect(JSON.parse(c.m.get("k")!).refresh_token).toBe("R1");
  });
});

describe("API officielle", () => {
  it("User-Agent de navigateur (Cloudflare), Bearer, base v2, start et nextToken", async () => {
    const vus: { url: string; h: Record<string, string> }[] = [];
    const api = creerApi({ acces: async () => "TOK", fetch: async (url, init) => (vus.push({ url, h: init!.headers! }), reponse(200, { records: [], next_token: null })) });
    await api.page("workout", "2026-10-01T00:00:00.000Z", "abc");
    expect(vus[0]!.url).toBe(`${BASE_API}/activity/workout?limit=25&start=2026-10-01T00%3A00%3A00.000Z&nextToken=abc`);
    expect(vus[0]!.h["User-Agent"]).toBe(UA_NAVIGATEUR);
    expect(UA_NAVIGATEUR).toMatch(/^Mozilla\/5\.0/);
    expect(vus[0]!.h["Authorization"]).toBe("Bearer TOK");
  });

  it("401 : un renouvellement forcé puis un nouvel essai ; second 401 -> expire", async () => {
    const forces: boolean[] = [];
    let n = 0;
    const api = creerApi({ acces: async (f) => (forces.push(!!f), f ? "NEUF" : "VIEUX"), fetch: async () => reponse(n++ === 0 ? 401 : 200, { height_meter: 1.8 }) });
    await expect(api.corps()).resolves.toEqual({ height_meter: 1.8 });
    expect(forces).toEqual([false, true]);
    const toujours = creerApi({ acces: async () => "T", fetch: async () => reponse(401) });
    await expect(toujours.corps()).rejects.toMatchObject({ code: "expire" });
  });

  it("429 : attend Retry-After puis réessaie ; au bout de 4 essais -> limite", async () => {
    const attentes: number[] = [];
    let n = 0;
    const api = creerApi({ acces: async () => "T", attendre: async (ms) => void attentes.push(ms), fetch: async () => (n++ < 2 ? reponse(429, {}, { "Retry-After": "7" }) : reponse(200, { records: [] })) });
    await api.page("cycle", "x");
    expect(attentes).toEqual([7000, 7000]);
    const sature = creerApi({ acces: async () => "T", attendre: async () => {}, fetch: async () => reponse(429) });
    await expect(sature.page("cycle", "x")).rejects.toMatchObject({ code: "limite" });
  });

  it("DELETE /user/access à la déconnexion ; 5xx réessayé", async () => {
    const vus: string[] = [];
    let n = 0;
    const api = creerApi({ acces: async () => "T", attendre: async () => {}, fetch: async (url, init) => (vus.push(`${init?.method ?? "GET"} ${url}`), reponse(n++ === 0 ? 502 : 204)) });
    await api.revoquer();
    expect(vus).toEqual([`DELETE ${BASE_API}/user/access`, `DELETE ${BASE_API}/user/access`]);
  });
});
