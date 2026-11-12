import type { Executeur } from "../../db";

// Web : pas de rappels de repas (Android et iPhone : index.native.ts).
export async function rafraichirRappelsRepas(_db: Executeur, _o: { demander?: boolean } = {}): Promise<void> {}
