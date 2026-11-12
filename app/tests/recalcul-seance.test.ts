// Recalcul limité à la séance (audit M6, docs/PERF-D.md) : quand la séance est la dernière de l'exercice, on ne relit plus
// tout son historique. Ce test vérifie, après chaque geste d'une séance (coche, décoche, valeur, échauffement, suppression,
// ordre, séance passée modifiée), que la base est exactement celle du recalcul complet : volume, 1RM, charge effective,
// « précédent » de chaque série, records (identifiants mis à part) et record actuel.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { recalculerExercice } from "../src/db/depots/recalcul.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, modifierSeance, modifierSerie, ordonnerSeriesSeance, supprimerSerie } from "../src/db/depots/seances.ts";
import { transaction } from "../src/db/exclusif.ts";
import type { Executeur } from "../src/db/executeur.ts";
import type { Nature } from "../src/db/natures.ts";
import { baseDeTest } from "./aide.ts";

const JOUR = 86_400_000;

async function etat(db: Executeur, exerciceId: string) {
  const series = await db.getAllAsync(
    "SELECT id, volume, e1rm, charge_eff, precedent_kg, precedent_reps, precedent_duree_s, precedent_distance_m FROM series WHERE exercice_id = ? ORDER BY id",
    [exerciceId],
  );
  const records = await db.getAllAsync(
    "SELECT type, valeur, serie_id, seance_id, atteint_le, actuel FROM records WHERE exercice_id = ? ORDER BY type, seance_id, valeur, serie_id",
    [exerciceId],
  );
  return { series, records };
}

/** La base après le recalcul limité = la base après le recalcul complet de l'exercice. */
async function memeQueComplet(db: Executeur, exerciceId: string, geste: string) {
  const limite = await etat(db, exerciceId);
  await transaction(db, (t) => recalculerExercice(t, exerciceId));
  assert.deepEqual(limite, await etat(db, exerciceId), geste);
}

const CAS: { nature: Nature; muscle?: string; valeurs: (k: number) => { kg?: number; reps?: number; dureeS?: number; distanceM?: number } }[] = [
  { nature: "poids_reps", valeurs: (k) => ({ kg: 60 + 5 * (k % 3), reps: 8 + (k % 2) }) },
  { nature: "reps", muscle: "pectoraux", valeurs: (k) => ({ reps: 10 + (k % 4) }) },
  { nature: "assiste", muscle: "dos", valeurs: (k) => ({ kg: 30 - 5 * (k % 3), reps: 8 }) },
  { nature: "leste", muscle: "dos", valeurs: (k) => ({ kg: 5 * (k % 3), reps: 6 + (k % 2) }) },
  { nature: "duree", valeurs: (k) => ({ dureeS: 45 + 15 * (k % 3) }) },
  { nature: "distance_duree", valeurs: (k) => ({ distanceM: 5000 + 500 * (k % 3), dureeS: 1500 + 60 * (k % 2) }) },
];

for (const cas of CAS) {
  test(`recalcul limité = recalcul complet après chaque geste de la séance (${cas.nature})`, async () => {
    const { db } = await baseDeTest();
    const ex = await creerExercice(db, { nom: `Essai ${cas.nature}`, nature: cas.nature, muscle: cas.muscle });
    const t0 = Date.now() - 40 * JOUR;
    await ajouterPesee(db, 80, t0 - JOUR);
    await ajouterPesee(db, 78, t0 + 10 * JOUR);
    // Historique : cinq séances passées, la dernière sans série faite (le « précédent » vient de celle d'avant).
    const passees: string[] = [];
    for (let k = 0; k < 5; k++) {
      const s = await demarrerSeance(db, null);
      await modifierSeance(db, s, { debut: t0 + k * 7 * JOUR, fin: t0 + k * 7 * JOUR + 3_600_000 });
      passees.push(s);
      if (k === 0) await ajouterSerie(db, { seanceId: s, exerciceId: ex, type: "echauffement", ...cas.valeurs(0) });
      for (let j = 0; j < 3; j++) {
        const id = await ajouterSerie(db, { seanceId: s, exerciceId: ex, ...cas.valeurs(k + j) });
        if (k < 4) await cocherSerie(db, id, true);
      }
    }
    await memeQueComplet(db, ex, "historique");

    // Séance en cours : la dernière de l'exercice.
    const s = await demarrerSeance(db, null);
    const echauf = await ajouterSerie(db, { seanceId: s, exerciceId: ex, type: "echauffement", ...cas.valeurs(1) });
    const ids: string[] = [];
    for (let j = 0; j < 4; j++) ids.push(await ajouterSerie(db, { seanceId: s, exerciceId: ex, ...cas.valeurs(j) }));
    await memeQueComplet(db, ex, "séries ajoutées");
    await cocherSerie(db, echauf, true);
    await memeQueComplet(db, ex, "échauffement coché");
    for (const id of ids.slice(0, 3)) {
      await cocherSerie(db, id, true);
      await memeQueComplet(db, ex, "série cochée");
    }
    // Record battu, puis repris par une décoche.
    await modifierSerie(db, ids[1]!, { kg: 200, reps: 30, dureeS: 600, distanceM: 20000 });
    await memeQueComplet(db, ex, "record");
    await cocherSerie(db, ids[1]!, false);
    await memeQueComplet(db, ex, "décoche du record");
    await ordonnerSeriesSeance(db, s, ex, [ids[2]!, echauf, ids[0]!, ids[1]!, ids[3]!]);
    await memeQueComplet(db, ex, "ordre des séries");
    await supprimerSerie(db, ids[0]!);
    await memeQueComplet(db, ex, "suppression");
    // Une séance passée modifiée : suivie d'autres séances, elle passe par le recalcul complet.
    const dePassee = (await db.getFirstAsync<{ id: string }>("SELECT id FROM series WHERE seance_id = ? ORDER BY position LIMIT 1", [passees[1]!]))!.id;
    await modifierSerie(db, dePassee, { kg: 150, reps: 20, dureeS: 400, distanceM: 15000 });
    await memeQueComplet(db, ex, "séance passée");
    // Toutes les séries de la séance retirées : ses records partent, le meilleur d'avant redevient l'actuel.
    for (const id of [echauf, ...ids.slice(1)]) await supprimerSerie(db, id);
    await memeQueComplet(db, ex, "séance vidée");
  });
}

test("première séance d'un exercice : la référence, pas de record (D4), même par le recalcul limité", async () => {
  const { db } = await baseDeTest();
  const ex = await creerExercice(db, { nom: "Tout neuf", nature: "poids_reps" });
  const s = await demarrerSeance(db, null);
  const a = await ajouterSerie(db, { seanceId: s, exerciceId: ex, kg: 50, reps: 10 });
  const b = await ajouterSerie(db, { seanceId: s, exerciceId: ex, kg: 55, reps: 10 });
  await cocherSerie(db, a, true);
  await memeQueComplet(db, ex, "première coche");
  await cocherSerie(db, b, true);
  await memeQueComplet(db, ex, "deuxième coche");
  const r = await db.getAllAsync<{ serie_id: string | null }>("SELECT serie_id FROM records WHERE exercice_id = ?", [ex]);
  assert.ok(r.length > 0 && r.every((x) => x.serie_id === null), "la première séance pose la référence, sans série");
});
