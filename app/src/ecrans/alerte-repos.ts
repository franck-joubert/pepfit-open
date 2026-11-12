// Alerte de fin de repos : vibration, son, les deux ou rien. Remplace l'ancien booléen `son_fin_repos`.

export type AlerteRepos = "vibration" | "son" | "les-deux" | "rien";

const MODES: readonly AlerteRepos[] = ["vibration", "son", "les-deux", "rien"];

/**
 * Réglage `alerte_repos`, sinon migration de `son_fin_repos` : 1 → les deux, 0 → rien. Sans aucun réglage : le son seul
 * (décision, 27/10 : la vibration se choisit, elle n'est pas imposée).
 */
export function lireAlerteRepos(mode: string | null, ancien: string | null): AlerteRepos {
  if (MODES.includes(mode as AlerteRepos)) return mode as AlerteRepos;
  return ancien === "0" ? "rien" : ancien === "1" ? "les-deux" : "son";
}

export const alerteSonne = (m: AlerteRepos) => m === "son" || m === "les-deux";
export const alerteVibre = (m: AlerteRepos) => m === "vibration" || m === "les-deux";

/** Une seule impulsion, ~60 ms. */
export const VIBRATION_REPOS = [0, 60];

/** Tous les canaux de fin de repos commencent ainsi (anciens « fin-repos » et « fin-repos-alarme » compris). */
export const PREFIXE_CANAL = "fin-repos";

// Empreinte courte et stable de l'URI du son (djb2).
function empreinte(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Un canal Android est figé une fois créé : un identifiant par combinaison mode + son ; aucun canal pour « rien ». */
export function canalRepos(mode: AlerteRepos, sonUri: string | null): string | null {
  if (mode === "rien") return null;
  if (!alerteSonne(mode)) return `${PREFIXE_CANAL}-${mode}`;
  return `${PREFIXE_CANAL}-${mode}-${sonUri ? empreinte(sonUri) : "defaut"}`;
}
