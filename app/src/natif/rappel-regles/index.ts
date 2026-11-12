import type { Executeur } from "../../db";

// Web : pas de rappel des règles (Android et iPhone : index.native.ts).
export async function rafraichirRappelRegles(_db: Executeur, _o: { demander?: boolean } = {}): Promise<void> {}
export async function repondreRappelRegles(_db: Executeur, _action: string): Promise<void> {}
