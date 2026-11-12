// OAuth des API santé sur le téléphone (src/oauth/client.ts) : page d'autorisation, échange du code et renouvellement pour
// Whoop, Withings et Polar, avec les identifiants de la personne ; lien de retour direct ou par la page relais.
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyserRetour, echangerCode, OAUTH, renouveler, urlAutorisation, type Fetch } from "../src/oauth/client.ts";
import { ErreurWhoop } from "../src/whoop/types.ts";

const ids = (redirection: string) => ({ clientId: "mon-id", clientSecret: "mon-secret", redirection });

function faux(status: number, corps: unknown) {
  const vus: { url: string; headers: Record<string, string>; corps: URLSearchParams }[] = [];
  const f: Fetch = async (url, init) => {
    vus.push({ url, headers: init?.headers ?? {}, corps: new URLSearchParams(init?.body ?? "") });
    return { status, json: async () => corps };
  };
  return { f, vus };
}

test("page d'autorisation : client, URL de retour, droits et state de la personne", () => {
  for (const f of ["whoop", "withings", "polar"] as const) {
    const u = new URL(urlAutorisation(f, ids("https://exemple.org/retour"), "0123456789abcdef"));
    assert.equal(`${u.origin}${u.pathname}`, OAUTH[f].autorisation);
    assert.equal(u.searchParams.get("client_id"), "mon-id");
    assert.equal(u.searchParams.get("redirect_uri"), "https://exemple.org/retour");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("scope"), OAUTH[f].scopes);
    assert.equal(u.searchParams.get("state"), "0123456789abcdef");
    assert.equal(u.searchParams.get("client_secret"), null, "le secret ne part jamais dans l'URL");
  }
  assert.match(OAUTH.whoop.scopes, /\boffline\b/);
});

test("Whoop : échange du code avec le secret dans le corps ; renouvellement avec offline", async () => {
  const { f, vus } = faux(200, { access_token: "A", refresh_token: "R", expires_in: 3600, scope: "offline" });
  const j = await echangerCode("whoop", ids("pepfitopen://whoop"), "C", f);
  assert.deepEqual(j, { access_token: "A", refresh_token: "R", expires_in: 3600, scope: "offline", userId: null });
  assert.equal(vus[0]!.url, OAUTH.whoop.jeton);
  assert.deepEqual(Object.fromEntries(vus[0]!.corps), { client_id: "mon-id", client_secret: "mon-secret", grant_type: "authorization_code", code: "C", redirect_uri: "pepfitopen://whoop" });
  await renouveler("whoop", ids("pepfitopen://whoop"), "R", f);
  assert.deepEqual(Object.fromEntries(vus[1]!.corps), { grant_type: "refresh_token", refresh_token: "R", client_id: "mon-id", client_secret: "mon-secret", scope: "offline" });
});

test("Withings : action=requesttoken, le statut est dans la réponse (0 bon, 601 limite, le reste refusé)", async () => {
  const bon = faux(200, { status: 0, body: { access_token: "A", refresh_token: "R", expires_in: 10800, scope: "user.info", userid: 42 } });
  const j = await echangerCode("withings", ids("https://exemple.org/withings.html"), "C", bon.f);
  assert.deepEqual(j, { access_token: "A", refresh_token: "R", expires_in: 10800, scope: "user.info", userId: "42" });
  assert.equal(bon.vus[0]!.corps.get("action"), "requesttoken");
  assert.equal(bon.vus[0]!.corps.get("client_secret"), "mon-secret");
  await renouveler("withings", ids("https://exemple.org/withings.html"), "R", bon.f);
  assert.equal(bon.vus[1]!.corps.get("grant_type"), "refresh_token");
  const code = (status: number) => echangerCode("withings", ids("https://x.org/w"), "C", faux(200, { status }).f).catch((e: ErreurWhoop) => e.code);
  assert.equal(await code(601), "limite");
  assert.equal(await code(503), "refuse");
  assert.equal(await code(100), "refuse");
});

test("Polar : secret en Authorization Basic, pas de refresh, x_user_id gardé", async () => {
  const { f, vus } = faux(200, { access_token: "A", token_type: "bearer", expires_in: 31535999, x_user_id: 1234 });
  const j = await echangerCode("polar", ids("pepfitopen://polar"), "C", f);
  assert.deepEqual(j, { access_token: "A", refresh_token: null, expires_in: 31535999, scope: OAUTH.polar.scopes, userId: "1234" });
  assert.equal(vus[0]!.headers.Authorization, `Basic ${Buffer.from("mon-id:mon-secret").toString("base64")}`);
  assert.equal(vus[0]!.corps.get("client_secret"), null);
});

test("erreurs : 429 limite, 4xx refusé, 5xx et réseau panne, réponse sans jeton refusée", async () => {
  const code = (status: number, corps: unknown = {}) => echangerCode("whoop", ids("pepfitopen://whoop"), "C", faux(status, corps).f).catch((e: ErreurWhoop) => e.code);
  assert.equal(await code(429), "limite");
  assert.equal(await code(400), "refuse");
  assert.equal(await code(502), "serveur");
  assert.equal(await code(200, {}), "refuse");
  const reseau = await echangerCode("whoop", ids("pepfitopen://whoop"), "C", async () => {
    throw new Error("hors ligne");
  }).catch((e: ErreurWhoop) => e.code);
  assert.equal(reseau, "reseau");
});

test("lien de retour : code et state, error d'OAuth ; un lien d'une autre route ou appli est ignoré", () => {
  assert.deepEqual(analyserRetour("pepfitopen://whoop?code=C&state=S", "whoop"), { code: "C", state: "S", erreur: undefined });
  assert.equal(analyserRetour("pepfitopen://withings/?error=access_denied&state=S", "withings")?.erreur, "access_denied");
  assert.equal(analyserRetour("autre://whoop?code=C", "whoop"), null);
  assert.equal(analyserRetour("pepfitopen://polar?code=C", "whoop"), null);
  assert.equal(analyserRetour("pepfitopen://history/derniere", "whoop"), null);
});
