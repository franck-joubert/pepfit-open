// Minuteur de repos sur l'alarme native de la sieste (docs/CODE-IMPORTS-MINUTEUR.md) : la notification d'expo ne vibrait pas en
// mode silencieux et « Ne pas déranger » pouvait la taire. Ici : quand le natif est choisi, ce qu'il reçoit, et qu'une suite
// rapide de demandes (série cochée, +30 s, passer) ne laisse jamais deux minuteries.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FileMinuteur, LIEN_SEANCE, natifMinuteur, reglageMinuteur, VIBRATION_REPOS_ALARME, type Creneau, type ReglageMinuteur } from "../src/natif/minuteur/alarme-minuteur.ts";

const textes = { titre: "Repos terminé", corps: "Série suivante", canal: "Fin du repos" };

test("minuteur natif : choisi seulement si le module sait faire un minuteur (APK plus ancien : repli sur expo)", () => {
  assert.equal(natifMinuteur(null), null);
  assert.equal(natifMinuteur({ programmer: async () => true, annuler: async () => {} }), null, "alarme de sieste seule");
  const m = { programmerMinuteur: async () => true, annulerMinuteur: async () => {} };
  assert.equal(natifMinuteur(m), m);
});

test("minuteur natif : son et vibration selon le réglage, lien vers la séance, rien pour « rien » ou une échéance passée", () => {
  const fin = 1_000_000;
  const avant = fin - 90_000;
  const r = (alerte: "son" | "vibration" | "les-deux" | "rien", sonUri: string | null = "content://son/3") =>
    reglageMinuteur({ creneau: "repos", fin, alerte, sonUri, ...textes }, avant);
  assert.deepEqual(r("les-deux"), { creneau: "repos", fin, ...textes, son: true, uri: "content://son/3", vibration: VIBRATION_REPOS_ALARME, lien: LIEN_SEANCE });
  assert.deepEqual({ son: r("son")?.son, vibration: r("son")?.vibration }, { son: true, vibration: [] });
  assert.deepEqual({ son: r("vibration")?.son, uri: r("vibration")?.uri, vibration: r("vibration")?.vibration }, { son: false, uri: null, vibration: VIBRATION_REPOS_ALARME });
  assert.equal(r("les-deux", null)?.uri, null, "son par défaut du téléphone");
  assert.equal(r("rien"), null);
  assert.equal(reglageMinuteur({ creneau: "cible", fin: avant, alerte: "son", sonUri: null, ...textes }, avant), null);
  assert.equal(reglageMinuteur({ creneau: "cible", fin: null, alerte: "son", sonUri: null, ...textes }, avant), null);
  assert.equal(LIEN_SEANCE, "pepfitopen://session");
});

/** Faux module natif : une minuterie par créneau, comme AlarmManager avec le même PendingIntent ; appels lents et dans le désordre. */
function fauxNatif() {
  const poses = new Map<Creneau, ReglageMinuteur>();
  const journal: string[] = [];
  let lent = 30;
  const attendre = () => new Promise((ok) => setTimeout(ok, (lent = lent > 5 ? lent - 10 : 25)));
  return {
    poses,
    journal,
    natif: {
      async programmerMinuteur(r: ReglageMinuteur) {
        await attendre();
        poses.set(r.creneau, r);
        journal.push(`+${r.creneau}@${r.fin}`);
        return true;
      },
      async annulerMinuteur(c: Creneau) {
        await attendre();
        poses.delete(c);
        journal.push(`-${c}`);
      },
    },
  };
}

test("minuteur natif : série cochée, +30 s, série suivante démarrée : la dernière demande gagne, une seule minuterie", async () => {
  const { poses, journal, natif } = fauxNatif();
  const f = new FileMinuteur(natif);
  const t0 = Date.now();
  const repos = (fin: number | null) => reglageMinuteur({ creneau: "repos", fin, alerte: "les-deux", sonUri: null, ...textes }, t0);
  const fini = [
    f.poser("repos", repos(t0 + 90_000)),
    f.poser("repos", repos(t0 + 120_000)),
    f.poser("cible", reglageMinuteur({ creneau: "cible", fin: t0 + 45_000, alerte: "les-deux", sonUri: null, ...textes }, t0)),
    f.poser("repos", repos(null)),
  ];
  assert.deepEqual(await Promise.all(fini), [true, true, true, false]);
  assert.equal(poses.has("repos"), false, "repos passé : annulé");
  assert.equal(poses.get("cible")?.fin, t0 + 45_000, "la cible n'est pas touchée");
  assert.deepEqual(journal.filter((j) => j.includes("repos")), [`+repos@${t0 + 90_000}`, `+repos@${t0 + 120_000}`, "-repos"], "dans l'ordre des demandes");
  await f.poser("repos", repos(t0 + 60_000));
  assert.equal(poses.get("repos")?.fin, t0 + 60_000);
});

test("minuteur natif : un refus du module (heure exacte refusée, erreur) rend faux sans bloquer les demandes suivantes", async () => {
  let refus = true;
  const f = new FileMinuteur({
    async programmerMinuteur() {
      if (refus) throw new Error("refusé");
      return true;
    },
    async annulerMinuteur() {},
  });
  const r = reglageMinuteur({ creneau: "repos", fin: Date.now() + 60_000, alerte: "son", sonUri: null, ...textes });
  assert.equal(await f.poser("repos", r), false);
  refus = false;
  assert.equal(await f.poser("repos", r), true);
});
