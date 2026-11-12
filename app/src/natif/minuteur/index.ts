import { MinuteurJs } from "./minuteur-js";

export type { EtatMinuteur, MinuteurRepos } from "./types";

// iOS et web : repli JS ; la Live Activity viendra avec l'implémentation iPhone.
export const minuteur = new MinuteurJs();
