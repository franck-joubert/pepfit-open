import type { Executeur } from "../../db";

// Web : pas de rappel de coucher (Android et iPhone : index.native.ts).
export async function rafraichirRappelCoucher(_db: Executeur, _o: { demander?: boolean } = {}): Promise<void> {}
