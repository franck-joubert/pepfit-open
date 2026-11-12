// Chargement de la vue 3D sous React Native (Hermes, expo-gl). Chaque personnage (homme, femme) est lu une fois par
// session, chaque clip une fois aussi : promesses gardées en mémoire. Les GLB sont lus en octets (expo-file-system) puis donnés à
// GLTFLoader ; ils ne portent aucune texture. Les textures sont des fichiers PNG ou JPEG que expo-gl décode lui-même
// (`{ localUri }` passé à texImage2D) : une DataTexture dont les données sont ce fichier.
import * as THREE from "three";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CLIPS_3D, PERSONNAGE_3D } from "./clips";
import type { Clip3D, Personnage3D, Textures3D } from "./scene";
import type { Personnage } from "../../ecrans/donnees";
import { memoriserRepos, type Recalage } from "./recibler";
import { t } from "../../i18n/index";
import { DecodeurUtf8 } from "./utf8";
import { arriveeDuree } from "./arrivee";

// GLTFLoader lit l'en-tête et le JSON du GLB avec TextDecoder ; Hermes peut ne pas l'avoir
if (typeof globalThis.TextDecoder === "undefined") (globalThis as { TextDecoder?: unknown }).TextDecoder = DecodeurUtf8;

/** Dernière étape franchie du chargement (affichée si la vue reste vide). */
export const etape3D = { nom: "" };

async function fichier(module: number): Promise<Asset> {
  etape3D.nom = `fichier ${module}`;
  const a = Asset.fromModule(module);
  // Android release : une image a pour localUri son nom de ressource (« assets_3d_masque »), lisible par <Image> mais
  // pas par expo-gl, qui ne lit que des fichiers (sinon texture noire : ni muscles, ni relief). On la fait copier.
  if (a.localUri && !a.localUri.startsWith("file://")) a.downloaded = false;
  await a.downloadAsync();
  if (!a.localUri?.startsWith("file://")) throw new Error(t("exercices.vue3d.fichierIllisible", { nom: a.name, uri: String(a.localUri) }));
  return a;
}

async function glb(module: number) {
  const o = await new File((await fichier(module)).localUri!).bytes();
  etape3D.nom = `lecture glb ${o.byteLength} o`;
  const t = performance.now();
  const g = await new GLTFLoader().parseAsync(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer, "");
  arriveeDuree("parse", performance.now() - t); // arrivée sur Santé (ui/3d/arrivee.ts) : rien hors d'une mesure
  return g;
}

async function texture(module: number, donnees = false, net = false): Promise<THREE.Texture> {
  const a = await fichier(module);
  const t = new THREE.DataTexture(null, a.width ?? 1024, a.height ?? 1024);
  (t.image as { data: unknown }).data = { localUri: a.localUri };
  t.flipY = false; // UV du glTF
  // `net` : texel le plus proche (le verre de Santé lit l'id du muscle avec texture2D, sans mélanger deux ids)
  t.magFilter = net ? THREE.NearestFilter : THREE.LinearFilter;
  // le masque est lu texel par texel (id du muscle) : pas de mipmaps ; relief et cavité en ont
  t.minFilter = net ? THREE.NearestFilter : donnees ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = !donnees;
  t.needsUpdate = true;
  return t;
}

let textures: Promise<Textures3D> | null = null;
const personnages = new Map<Personnage, Promise<Personnage3D>>();
const clips = new Map<string, Promise<Clip3D>>();
// recalage par clip (picto-3d/femme/contacts.mjs --recaler) : bassin sorti des bancs, boudins relevés. La femme en a un
// pour chaque clip ; l'homme seulement là où son corps entrait dans un siège (il passe alors par le reciblage, k = 1)
const recalages: Partial<Record<Personnage, Record<string, Recalage>>> = {};
const FICHIERS_RECALAGE: Record<Personnage, () => Record<string, Recalage>> = {
  femme: () => require("../../../assets/3d/recalage-femme.json") as Record<string, Recalage>,
  homme: () => require("../../../assets/3d/recalage-homme.json") as Record<string, Recalage>,
};

function chargerTextures() {
  textures ??= Promise.all([texture(PERSONNAGE_3D.masque, true), texture(PERSONNAGE_3D.relief), texture(PERSONNAGE_3D.cavite)])
    .then(([masque, relief, cavite]) => ({ masque, relief, cavite }))
    .catch((e) => {
      textures = null; // on retentera à la prochaine ouverture
      throw e;
    });
  return textures;
}

function chargerPersonnage(genre: Personnage) {
  let p = personnages.get(genre);
  if (!p) {
    p = glb(genre === "femme" ? PERSONNAGE_3D.femme : PERSONNAGE_3D.modele).then((g) => {
      memoriserRepos(g.scene); // os au repos, avant toute animation (reciblage)
      const x = g.userData as { muscles: Record<string, number>; pas_id: number };
      // la femme garde le relief de l'homme (mêmes UV) : adouci, sillons moins marqués
      return { racine: g.scene, muscles: x.muscles, pas: x.pas_id, reciblee: genre === "femme", ...(genre === "femme" ? { relief: 0.3, cavite: 0.88 } : { relief: 1, cavite: 0.5 }) };
    });
    p.catch(() => personnages.delete(genre));
    personnages.set(genre, p);
  }
  return p;
}

function chargerClip(cle: string) {
  let p = clips.get(cle);
  if (!p) {
    const module = CLIPS_3D[cle];
    if (module == null) return Promise.reject(new Error(t("exercices.vue3d.pasDeClip", { cle })));
    p = glb(module).then((g) => {
      const agres: THREE.Object3D[] = [];
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) agres.push(o);
      });
      const x = g.userData as { principaux?: string[]; secondaires?: string[] };
      return { racine: g.scene, animation: g.animations[0]!, agres, principaux: x.principaux ?? [], secondaires: x.secondaires ?? [] };
    });
    p.catch(() => clips.delete(cle));
    clips.set(cle, p);
  }
  return p;
}

/** Personnage (en cache), textures, clip de l'exercice et son recalage (la femme toujours, l'homme s'il en a un). */
export async function charger3D(cle: string, genre: Personnage = "homme") {
  const [perso, tex, clip] = await Promise.all([chargerPersonnage(genre), chargerTextures(), chargerClip(cle)]);
  const recalage = (recalages[genre] ??= FICHIERS_RECALAGE[genre]())[cle];
  if (perso.reciblee) return { perso, textures: tex, clip, recalage: recalage ?? {} };
  if (recalage) return { perso: { ...perso, reciblee: true }, textures: tex, clip, recalage };
  return { perso, textures: tex, clip, recalage: null };
}

const corps = new Map<string, Promise<THREE.Group>>();
/** Personnage de l'écran Santé : GLB à curseurs de morphologie (en cache, lu une fois par session). `epaules` : l'homme aux
 *  épaules naturelles (D11). */
export function chargerCorps(genre: Personnage, epaules = false): Promise<THREE.Group> {
  const cle = genre === "homme" && epaules ? "homme-epaules" : genre;
  let p = corps.get(cle);
  if (!p) {
    p = glb(genre === "femme" ? PERSONNAGE_3D.femmeMorph : epaules ? PERSONNAGE_3D.hommeEpaules : PERSONNAGE_3D.hommeMorph).then((g) => {
      // table des muscles du masque (zones blessées de Santé)
      const x = g.userData as { muscles?: Record<string, number>; pas_id?: number };
      Object.assign(g.scene.userData, { muscles: x.muscles ?? {}, pas: x.pas_id ?? 8 });
      memoriserRepos(g.scene);
      return g.scene;
    });
    p.catch(() => corps.delete(cle));
    corps.set(cle, p);
  }
  return p;
}

/** Relief et cavité de l'homme B pour le verre de Santé (D13) : les cartes des vues 3D, partagées. */
export function chargerReliefSante(): Promise<{ relief: THREE.Texture; cavite: THREE.Texture }> {
  return chargerTextures().then(({ relief, cavite }) => ({ relief, cavite }));
}

let masqueSante: Promise<THREE.Texture> | null = null;
/** Masque de l'écorché pour le verre de Santé (zones blessées) : sa propre texture, au texel le plus proche. */
export function chargerMasqueSante(): Promise<THREE.Texture> {
  masqueSante ??= texture(PERSONNAGE_3D.masque, true, true).catch((e) => {
    masqueSante = null;
    throw e;
  });
  return masqueSante;
}
