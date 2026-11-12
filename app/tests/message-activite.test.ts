// Message d'une activité (planche Effort, D2 et D3) : 280 signes, compteur dès 240, deux lignes puis « Voir plus » ; écrit à la fin
// de la séance sans toucher à la note privée ; chiffré avec la ligne. Données inventées.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance } from "../src/db/depots/seances.ts";
import { modifierSeance } from "../src/db/depots/seances.ts";
import { terminer } from "../src/ecrans/donnees.ts";
import { compteurMessage, limiterMessage, messageFinal, messageTronque, MESSAGE_MAX, signes } from "../src/ecrans/message-activite.ts";
import { tableSync } from "../src/sync/schema.ts";
import { baseDeTest } from "./aide.ts";

test("280 signes : la saisie est coupée, un emoji compte pour un", () => {
  assert.equal(MESSAGE_MAX, 280);
  assert.equal(signes(limiterMessage("a".repeat(285))), 280);
  assert.equal(limiterMessage("court"), "court");
  const emojis = "💪".repeat(300);
  assert.equal(signes(limiterMessage(emojis)), 280);
  assert.equal(limiterMessage("💪".repeat(280)), "💪".repeat(280));
});

test("valeur écrite : bords nettoyés, sauts de ligne gardés (deux au plus), vide ou absent = null", () => {
  assert.equal(messageFinal("  Belle séance  "), "Belle séance");
  assert.equal(messageFinal("Un\n\n\n\nDeux"), "Un\n\nDeux");
  assert.equal(messageFinal("Un\r\nDeux"), "Un\nDeux");
  assert.equal(messageFinal("   "), null);
  assert.equal(messageFinal(""), null);
  assert.equal(messageFinal(undefined), null);
  assert.equal(messageFinal(null), null);
  assert.equal(signes(messageFinal("x".repeat(400))!), 280);
});

test("compteur « 240 / 280 » : rien avant 240, rien sur un champ vide, plein à 280", () => {
  assert.equal(compteurMessage("").visible, false);
  assert.equal(compteurMessage("a".repeat(239)).visible, false);
  const c = compteurMessage("a".repeat(240));
  assert.deepEqual(c, { visible: true, texte: "240 / 280", plein: false });
  assert.equal(compteurMessage("a".repeat(280)).plein, true);
});

test("« Voir plus » seulement au-delà de deux lignes", () => {
  assert.equal(messageTronque(1), false);
  assert.equal(messageTronque(2), false);
  assert.equal(messageTronque(3), true);
});

async function seanceAvecSerie(db: Awaited<ReturnType<typeof baseDeTest>>["db"]) {
  const id = await demarrerSeance(db, null, "Push");
  const s = await ajouterSerie(db, { seanceId: id, exerciceId: "cat:couche", kg: 60, reps: 8 });
  await cocherSerie(db, s, true);
  return id;
}

test("la fin de séance écrit le message et laisse la note privée telle quelle", async () => {
  const { db } = await baseDeTest(true);
  const id = await seanceAvecSerie(db);
  await modifierSeance(db, id, { note: "Épaule gauche à surveiller" });
  await terminer(db, (await lireSeance(db, id))!, { message: "  Belle séance !  ", majRoutine: false });
  const s = (await lireSeance(db, id))!.seance;
  assert.equal(s.message, "Belle séance !");
  assert.equal(s.note, "Épaule gauche à surveiller");
  // un message vidé s'efface, la note reste
  await modifierSeance(db, id, { message: null });
  const apres = (await lireSeance(db, id))!.seance;
  assert.equal(apres.message, null);
  assert.equal(apres.note, "Épaule gauche à surveiller");
});

test("un message écrit passe par la synchro, chiffré avec la note et le score", async () => {
  const { db, raw } = await baseDeTest(true);
  assert.ok(tableSync("seances")!.sensibles.includes("message"));
  const id = await seanceAvecSerie(db);
  raw.exec("DELETE FROM sync_journal");
  await modifierSeance(db, id, { message: "Pour toi" });
  const l = raw.prepare("SELECT cle FROM sync_journal WHERE tab = 'seances'").all().map((x) => x.cle);
  assert.deepEqual(l, [id]);
});
