// Écrit par scripts/programmes/construire.ts (npm run programmes) : ne pas modifier à la main.
import type { Programme, RoutineBoutique } from "./modele";

/** Les programmes du catalogue, dans l'ordre de la boutique (require statiques, obligatoires pour Metro). */
export const PROGRAMMES_EMBARQUES: Programme[] = [
  require("../../assets/catalogue/programmes/c5.json"),
  require("../../assets/catalogue/programmes/c10a.json"),
  require("../../assets/catalogue/programmes/c10.json"),
  require("../../assets/catalogue/programmes/semi.json"),
  require("../../assets/catalogue/programmes/mara.json"),
  require("../../assets/catalogue/programmes/nage.json"),
  require("../../assets/catalogue/programmes/velo.json"),
  require("../../assets/catalogue/programmes/rando.json"),
  require("../../assets/catalogue/programmes/fb.json"),
  require("../../assets/catalogue/programmes/f5.json"),
  require("../../assets/catalogue/programmes/ppl.json"),
  require("../../assets/catalogue/programmes/hb.json"),
  require("../../assets/catalogue/programmes/hal.json"),
  require("../../assets/catalogue/programmes/padel.json"),
  require("../../assets/catalogue/programmes/pp.json"),
  require("../../assets/catalogue/programmes/hiit.json"),
  require("../../assets/catalogue/programmes/rf.json"),
  require("../../assets/catalogue/programmes/kb.json"),
  require("../../assets/catalogue/programmes/mob.json"),
  require("../../assets/catalogue/programmes/dos.json"),
  require("../../assets/catalogue/programmes/gen.json"),
  require("../../assets/catalogue/programmes/equi.json"),
];

/** Les routines du catalogue (rayon « Routines »), dans l'ordre de la boutique. */
export const ROUTINES_EMBARQUEES: RoutineBoutique[] = [
  require("../../assets/catalogue/routines/r-fract-6x1k.json"),
  require("../../assets/catalogue/routines/r-footing-45.json"),
  require("../../assets/catalogue/routines/r-seuil-3x10.json"),
  require("../../assets/catalogue/routines/r-test-vma.json"),
  require("../../assets/catalogue/routines/r-push-a.json"),
  require("../../assets/catalogue/routines/r-full-body.json"),
  require("../../assets/catalogue/routines/r-halteres.json"),
  require("../../assets/catalogue/routines/r-hiit-20.json"),
  require("../../assets/catalogue/routines/r-kb-emom.json"),
  require("../../assets/catalogue/routines/r-hanches.json"),
  require("../../assets/catalogue/routines/r-dos.json"),
  require("../../assets/catalogue/routines/r-crawl.json"),
];
