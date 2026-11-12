import type { Executeur } from "../../db";

// Web : pas de rappels de séance (Android et iPhone : index.native.ts).
export async function rafraichirRappels(_db: Executeur, _o: { demander?: boolean } = {}): Promise<void> {}
