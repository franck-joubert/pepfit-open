import type { Executeur } from "../../db";

// Web : pas de rappels de compléments (Android et iPhone : index.native.ts).
export async function rafraichirRappelsTraitements(_db: Executeur, _o: { demander?: boolean } = {}): Promise<void> {}
