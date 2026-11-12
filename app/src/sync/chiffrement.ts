import sodium from "react-native-libsodium";
import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/french.js";

// Chiffrement de bout en bout (NOTES § 6.7). Une clé de données aléatoire chiffre les colonnes sensibles en
// XChaCha20-Poly1305 ; elle est enveloppée deux fois, par le mot de passe (Argon2id) et par la phrase de secours (12 mots).
// Le serveur ne reçoit jamais le mot de passe : Argon2id en tire deux moitiés, l'une sert de mot de passe de connexion,
// l'autre enveloppe la clé. Le sel vient de l'e-mail, connu avant la connexion.

const B64 = 7; // URLSAFE_NO_PADDING, même valeur dans libsodium-wrappers et react-native-libsodium
const NONCE = 24;

export const pret = () => sodium.ready;
export const b64 = (o: Uint8Array) => sodium.to_base64(o, B64);
export const deB64 = (t: string) => sodium.from_base64(t, B64);
export const aleatoire = (n: number) => sodium.randombytes_buf(n);

export function sceller(cle: Uint8Array, clair: string | Uint8Array, ad: string): string {
  const nonce = aleatoire(NONCE);
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(clair, ad, null, nonce, cle);
  const tout = new Uint8Array(NONCE + ct.length);
  tout.set(nonce);
  tout.set(ct, NONCE);
  return b64(tout);
}

export function ouvrir(cle: Uint8Array, scelle: string, ad: string): Uint8Array {
  const tout = deB64(scelle);
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, tout.subarray(NONCE), ad, tout.subarray(0, NONCE), cle);
}

export interface Connexion {
  /** Envoyé au serveur à la place du mot de passe. */
  motDePasseServeur: string;
  /** Enveloppe la clé de données ; ne quitte pas le téléphone. */
  cleMotDePasse: Uint8Array;
}

export const normaliserEmail = (e: string) => e.trim().toLowerCase();

/** Argon2id (paramètres « interactifs » : 64 Mo, 2 passes) sur le mot de passe, salé par l'e-mail. */
export function deriverConnexion(email: string, motDePasse: string): Connexion {
  const sel = sodium.crypto_generichash(16, `fonte:v1:${normaliserEmail(email)}`, null); // identifiant de protocole figé : ne pas renommer
  const k = sodium.crypto_pwhash(
    64,
    motDePasse,
    sel,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  return { motDePasseServeur: b64(k.slice(0, 32)), cleMotDePasse: k.slice(32) };
}

/**
 * Coffre stocké sur le serveur : la clé de données, enveloppée par la phrase de secours et, pour un compte à mot de
 * passe, par le mot de passe. Un compte créé par code e-mail n'a pas de mot de passe : pas de « mdp ».
 */
export interface Coffre {
  v: 1;
  mdp?: string;
  phrase: string;
  /** La phrase elle-même, chiffrée par la clé de données : un téléphone connecté peut la remontrer. */
  rappel: string;
}

const AD_MDP = "fonte:coffre:mdp"; // identifiant de protocole figé : ne pas renommer
const AD_PHRASE = "fonte:coffre:phrase"; // identifiant de protocole figé : ne pas renommer
const AD_RAPPEL = "fonte:coffre:rappel"; // identifiant de protocole figé : ne pas renommer

const clePhrase = (entropie: Uint8Array) => sodium.crypto_generichash(32, entropie, sodium.crypto_generichash(32, "fonte:phrase:v1", null)); // identifiant de protocole figé : ne pas renommer

/** Phrase de secours de 12 mots (français, BIP39), sans compte : la première sauvegarde chiffrée la crée. */
export const nouvellePhrase = () => entropyToMnemonic(aleatoire(16), wordlist);

/**
 * Nouveau compte : clé de données, phrase de secours de 12 mots (français, BIP39) et coffre. `phrase` : celle que le
 * téléphone a déjà (créée par une sauvegarde), reprise par le compte : une seule phrase pour tout.
 */
export function creerCoffre(cleMotDePasse: Uint8Array, phraseExistante?: string): { cle: Uint8Array; phrase: string; coffre: Coffre } {
  const cle = aleatoire(32);
  const entropie = phraseExistante ? mnemonicToEntropy(phraseExistante, wordlist) : aleatoire(16);
  const phrase = entropyToMnemonic(entropie, wordlist);
  return {
    cle,
    phrase,
    coffre: {
      v: 1,
      mdp: sceller(cleMotDePasse, cle, AD_MDP),
      phrase: sceller(clePhrase(entropie), cle, AD_PHRASE),
      rappel: sceller(cle, phrase, AD_RAPPEL),
    },
  };
}

/**
 * Nouveau compte par code e-mail : le code authentifie, il n'ouvre rien. La clé de données n'est enveloppée que par la
 * phrase de secours (celle du téléphone s'il en a une) ; un autre téléphone l'ouvre avec cette phrase.
 */
export function creerCoffreSansMotDePasse(phraseExistante?: string): { cle: Uint8Array; phrase: string; coffre: Coffre } {
  const cle = aleatoire(32);
  const entropie = phraseExistante ? mnemonicToEntropy(phraseExistante, wordlist) : aleatoire(16);
  const phrase = entropyToMnemonic(entropie, wordlist);
  return { cle, phrase, coffre: { v: 1, phrase: sceller(clePhrase(entropie), cle, AD_PHRASE), rappel: sceller(cle, phrase, AD_RAPPEL) } };
}

/** La phrase de secours, pour la remontrer sur un téléphone connecté. */
export const lireRappel = (c: Coffre, cle: Uint8Array) => sodium.to_string(ouvrir(cle, c.rappel, AD_RAPPEL));

/** Clé de données ; lève une erreur si le mot de passe ne correspond pas, ou si le compte n'a pas de mot de passe. */
export function ouvrirParMotDePasse(c: Coffre, cleMotDePasse: Uint8Array): Uint8Array {
  if (!c.mdp) throw new Error("compte sans mot de passe");
  return ouvrir(cleMotDePasse, c.mdp, AD_MDP);
}

const sansAccent = (m: string) => m.normalize("NFD").replace(/\p{M}/gu, "");
const MOTS = new Map(wordlist.map((m) => [sansAccent(m), m]));

/** Phrase saisie : minuscules, accents facultatifs, espaces libres. Null si un mot n'est pas de la liste. */
export function lirePhrase(saisie: string): string | null {
  const mots = sansAccent(saisie.toLowerCase()).split(/[\s,;.]+/).filter(Boolean);
  if (mots.length !== 12) return null;
  const l = mots.map((m) => MOTS.get(m));
  return l.every(Boolean) ? l.join(" ") : null;
}

/**
 * Premier mot saisi qui n'est pas de la liste (4a), tel qu'il est tapé ; null si tous en sont. Le mot en cours de frappe
 * (pas encore suivi d'un espace) n'est jugé qu'une fois les 12 mots là : on ne gronde pas une saisie pas finie.
 */
export function motInconnu(saisie: string): string | null {
  const mots = saisie.split(/[\s,;.]+/).filter(Boolean);
  const finis = /[\s,;.]$/.test(saisie) || mots.length >= 12 ? mots : mots.slice(0, -1);
  return finis.find((m) => !MOTS.has(sansAccent(m.toLowerCase()))) ?? null;
}

/** Clé de données par la phrase de secours ; lève une erreur si la phrase est fausse. */
export function ouvrirParPhrase(c: Coffre, saisie: string): Uint8Array {
  const phrase = lirePhrase(saisie);
  if (!phrase) throw new Error("phrase");
  return ouvrir(clePhrase(mnemonicToEntropy(phrase, wordlist)), c.phrase, AD_PHRASE);
}

// Sauvegarde dans un fichier (sauvegarde/archive.ts) : une clé d'archive aléatoire, enveloppée par la phrase de secours.
const AD_ARCHIVE = "fonte:archive:v1"; // identifiant de protocole figé : ne pas renommer

export const envelopperCleArchive = (phrase: string, cle: Uint8Array) => sceller(clePhrase(mnemonicToEntropy(phrase, wordlist)), cle, AD_ARCHIVE);

/** Clé d'archive par la phrase de secours ; lève une erreur si la phrase est fausse. */
export function ouvrirCleArchive(enveloppe: string, saisie: string): Uint8Array {
  const phrase = lirePhrase(saisie);
  if (!phrase) throw new Error("phrase");
  return ouvrir(clePhrase(mnemonicToEntropy(phrase, wordlist)), enveloppe, AD_ARCHIVE);
}

/** Nouveau mot de passe (après la phrase de secours) : on renveloppe la même clé de données. */
export const changerMotDePasse = (c: Coffre, cle: Uint8Array, cleMotDePasse: Uint8Array): Coffre => ({
  ...c,
  mdp: sceller(cleMotDePasse, cle, AD_MDP),
});

/** Colonnes sensibles d'une ligne → un bloc chiffré, lié à la table et à la ligne (on ne peut pas le recoller ailleurs). */
/** Clé de données scellée pour une connexion IA (serveur/mcp/ARCHITECTURE.md § 1 A) : le serveur l'ouvre avec la clé de connexion. */
export const scellerEnveloppe = (kc: Uint8Array, cle: Uint8Array, connexion: string) => sceller(kc, cle, `fonte:ia:${connexion}`); // identifiant de protocole figé : ne pas renommer
export const ouvrirEnveloppe = (kc: Uint8Array, enveloppe: string, connexion: string) => ouvrir(kc, enveloppe, `fonte:ia:${connexion}`); // identifiant de protocole figé : ne pas renommer

/** Texte scellé (le lien d'une IA, chiffré par la clé de données) rouvert en texte. */
export const ouvrirTexte = (cle: Uint8Array, scelle: string, ad: string) => sodium.to_string(ouvrir(cle, scelle, ad));

export const chiffrerChamps = (cle: Uint8Array, ou: string, champs: Record<string, unknown>) =>
  sceller(cle, JSON.stringify(champs), `fonte:ligne:${ou}`); // identifiant de protocole figé : ne pas renommer

export const dechiffrerChamps = (cle: Uint8Array, ou: string, bloc: string): Record<string, unknown> =>
  JSON.parse(sodium.to_string(ouvrir(cle, bloc, `fonte:ligne:${ou}`))) as Record<string, unknown>; // identifiant de protocole figé : ne pas renommer

// Fichiers (photo de séance et vignette) : « FNTF », version (1), nonce (24 octets), chiffré XChaCha20-Poly1305. En-tête et
// nom local du fichier sont liés au chiffré : le serveur ne peut ni échanger la photo et sa vignette ni rendre une autre photo.
const MAGIE = [0x46, 0x4e, 0x54, 0x46];
const V_FICHIER = 1;
const ENTETE = MAGIE.length + 1;

const adFichier = (nom: string) => `fonte:fichier:v${V_FICHIER}:${nom}`; // identifiant de protocole figé : ne pas renommer

export function chiffrerFichier(cle: Uint8Array, nom: string, clair: Uint8Array): Uint8Array {
  const nonce = aleatoire(NONCE);
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(clair, adFichier(nom), null, nonce, cle);
  const tout = new Uint8Array(ENTETE + NONCE + ct.length);
  tout.set(MAGIE);
  tout[MAGIE.length] = V_FICHIER;
  tout.set(nonce, ENTETE);
  tout.set(ct, ENTETE + NONCE);
  return tout;
}

const estFichierChiffre = (o: Uint8Array) => o.length > ENTETE + NONCE && MAGIE.every((x, i) => o[i] === x);

/** WebP (« RIFF….WEBP ») : une photo envoyée en clair avant le chiffrement des fichiers. */
const commencePar = (o: Uint8Array, a: number, t: string) => [...t].every((c, i) => o[a + i] === c.charCodeAt(0));
const estWebp = (o: Uint8Array) => o.length >= 12 && commencePar(o, 0, "RIFF") && commencePar(o, 8, "WEBP");

/**
 * Contenu reçu → photo en clair. Lève une erreur si la clé ou le nom ne correspondent pas, si la version est inconnue, ou
 * si ce n'est ni un fichier chiffré ni une photo de l'ancien format (`ancien` : seulement sous l'ancienne clé, en clair).
 */
export function dechiffrerFichier(cle: Uint8Array, nom: string, recu: Uint8Array, ancien = false): Uint8Array {
  if (!estFichierChiffre(recu)) {
    if (ancien && estWebp(recu)) return recu;
    throw new Error("fichier : format inconnu");
  }
  if (recu[MAGIE.length] !== V_FICHIER) throw new Error(`fichier : version ${recu[MAGIE.length]} inconnue`);
  const nonce = recu.subarray(ENTETE, ENTETE + NONCE);
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, recu.subarray(ENTETE + NONCE), adFichier(nom), nonce, cle);
}

/** Clé distante d'un fichier chiffré : tirée de la clé de données et du nom, opaque pour le serveur, la même sur chaque téléphone. */
/** Graine des coupes des parcours publics (profil public, D5) : tirée de la clé de données, donc la même sur tous les
 *  téléphones du compte (une sortie republiée d'un autre téléphone est coupée pareil), et inconnue du serveur. */
export const graineCoupes = (cle: Uint8Array) => b64(sodium.crypto_generichash(16, "pepfit:profil-public:coupes", cle));

export function cleFichierChiffre(cle: Uint8Array, nom: string): string {
  const sous = sodium.crypto_generichash(32, "fonte:fichiers:cles", cle); // identifiant de protocole figé : ne pas renommer
  return sodium.to_hex(sodium.crypto_generichash(16, nom, sous));
}

/** Identifiant d'enregistrement PocketBase (15 caractères [a-z0-9]) tiré de son contenu : un envoi répété ne crée pas de doublon. */
export function idStable(...parties: string[]): string {
  const h = sodium.crypto_generichash(16, parties.join("\u0000"), null);
  let n = 0n;
  for (const o of h) n = (n << 8n) | BigInt(o);
  return n.toString(36).padStart(15, "0").slice(-15);
}
