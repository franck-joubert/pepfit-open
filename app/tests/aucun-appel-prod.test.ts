// Les tests ne parlent jamais au serveur de production (garde posée dans tests/resolveur.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";

test("un appel vers pep.fit échoue comme hors ligne, sans partir", async () => {
  for (const url of ["https://api.pep.fit/api/health", "https://api.pep.fit/api/lieux/photos", "https://ia.pep.fit/x?y=1", "http://pep.fit"])
    await assert.rejects(fetch(url), (e: unknown) => e instanceof TypeError && /Network request failed/.test(e.message), url);
});

test("un serveur local ou un autre domaine n'est pas touché par la garde", async () => {
  // Port fermé : la requête part (et échoue sur la connexion), elle n'est pas arrêtée par la garde.
  await assert.rejects(fetch("http://127.0.0.1:9/api/health"), (e: unknown) => !/pep\.fit n'est jamais appelé/.test((e as Error).message + String((e as { cause?: unknown }).cause ?? "")));
  await assert.rejects(fetch("http://pep.fit.exemple.invalid/"), (e: unknown) => !/pep\.fit n'est jamais appelé/.test((e as Error).message));
});
