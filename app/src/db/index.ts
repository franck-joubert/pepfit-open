import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { chargerCatalogue } from "./catalogue";
import { catalogueEmbarque } from "./catalogue-assets";
import { fusionnerDoublonsSiChange } from "./depots/doublons";
import { chargerLiens } from "./liens-catalogue";
import { avecExclusivite } from "./exclusif";
import { completerNoms } from "./depots/noms";
import { recalculerSiEnAttente } from "./depots/recalcul";
import { migrer } from "./migrations";
import { reprendreEffacement } from "../effacer";

export * from "./api";

let ouverture: Promise<SQLiteDatabase> | null = null;

/** La base : ouverte, migrée et catalogue chargé au premier appel (au premier lancement, ou si la version du catalogue a changé). */
export function base(): Promise<SQLiteDatabase> {
  ouverture ??= (async () => {
    // Un effacement des données interrompu se finit avant tout ; s'il rate encore, le témoin reste pour le lancement suivant.
    await reprendreEffacement().catch((e) => console.error(e));
    const db = await openDatabaseAsync("fonte.db"); // identifiant de protocole figé : ne pas renommer
    // synchronous = NORMAL : en WAL, une transaction validée survit à un plantage de l'appli ; seule une coupure de courant
    // peut perdre les dernières, jamais abîmer la base (docs/PERF-B.md, M10). temp_store : tris et tables provisoires en mémoire.
    await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
    await migrer(db);
    await chargerCatalogue(db, catalogueEmbarque);
    await completerNoms(db);
    await fusionnerDoublonsSiChange(db);
    await chargerLiens(db);
    await recalculerSiEnAttente(db);
    // façade : un import travaille seul sur la connexion (exclusif.ts)
    return avecExclusivite(db);
  })();
  return ouverture;
}
