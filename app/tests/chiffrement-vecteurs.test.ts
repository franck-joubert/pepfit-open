// Octets du chiffrement de bout en bout figés par des vecteurs connus. Android et iPhone appellent la même libsodium en C
// (react-native-libsodium, pont JSI ; sur iPhone le correctif patches/react-native-libsodium+1.7.0.patch ne change que la
// façon d'obtenir le runtime JS) : si un de ces vecteurs bouge, les données chiffrées déjà synchronisées ne s'ouvrent plus.
// Les tests tournent sur libsodium-wrappers-sumo (même API, même C compilé en WebAssembly, voir tests/resolveur.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import sodium from "react-native-libsodium";
import { b64, deB64, deriverConnexion, ouvrir, ouvrirTexte, pret } from "../src/sync/chiffrement.ts";

const h = (s: string) => sodium.from_hex(s);
// libsodium n'est utilisable qu'après `pret()` : clé et nonce se lisent donc à l'appel
const cle = () => h("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f");
const nonce = () => h("404142434445464748494a4b4c4d4e4f5051525354555657");

test("XChaCha20-Poly1305 IETF : vecteur A.3.1 de draft-irtf-cfrg-xchacha", async () => {
  await pret();
  const clair = "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
  const ad = h("50515253c0c1c2c3c4c5c6c7");
  const attendu =
    "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff921f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49";
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(clair, ad, null, nonce(), cle());
  assert.equal(sodium.to_hex(ct), attendu);
  assert.equal(sodium.to_string(sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ct, ad, nonce(), cle())), clair);
});

test("BLAKE2b-256 : vecteurs de référence (entrée vide et « abc »)", async () => {
  await pret();
  assert.equal(sodium.to_hex(sodium.crypto_generichash(32, "", null)), "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8");
  assert.equal(sodium.to_hex(sodium.crypto_generichash(32, "abc", null)), "bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319");
});

test("format d'un scellé : nonce (24 octets) puis chiffré, en base64 URL sans remplissage ; une copie figée s'ouvre", async () => {
  await pret();
  const scelle = "QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXk2MdnjSFhnqLdwe1n9riCStQyJp9808OrlARk2yB"; // sceller() d'un téléphone, nonce 40..57
  assert.equal(ouvrirTexte(cle(), scelle, "fonte:coffre:rappel"), "bonjour pepfit");
  assert.deepEqual([...deB64(scelle).subarray(0, 24)], [...nonce()]);
  assert.equal(b64(deB64(scelle)), scelle);
  assert.throws(() => ouvrir(cle(), scelle, "fonte:coffre:autre")); // le contexte (AD) fait partie de l'authentification
});

test("Argon2id (64 Mo, 2 passes) : la dérivation de connexion reste celle des comptes existants", async () => {
  await pret();
  // sel = BLAKE2b-128 de « fonte:v1:<e-mail> » ; k = Argon2id-13 des 64 octets : moitié 1 = mot de passe serveur, moitié 2 = clé du coffre
  assert.equal(sodium.to_hex(sodium.crypto_generichash(16, "fonte:v1:a@b.fr", null)), "65a622d18e412cfdc33f043f83875ae7");
  const c = deriverConnexion("  A@B.fr ", "motdepasse");
  const k = "f437781a998e2c65d27f6aa611260b793681fd4d76120b2542c3e4fe5e498f900886ab1b98b6dc776fc64e6a6c2d7e03da94c5634cf2c65108f92f770a837727";
  assert.equal(sodium.to_hex(deB64(c.motDePasseServeur)), k.slice(0, 64));
  assert.equal(sodium.to_hex(c.cleMotDePasse), k.slice(64));
});
