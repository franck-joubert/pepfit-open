// Reciblage à l'exécution d'un clip de l'homme sur un personnage d'autres proportions (la femme, ou l'homme aux épaules
// élargies). Mêmes noms d'os et mêmes orientations de repos : les rotations des clips se recopient telles quelles. Les
// agrès sont mis à l'échelle k = longueur de jambe du personnage / celle de l'homme. Un fantôme (les os du clip, animés
// par le clip d'origine, à l'échelle k) donne les prises : le bassin est placé hanches sur hanches, poignets et
// chevilles y sont ramenés par une IK à deux os (coude et genou gardent leur plan), puis mains et pieds en prennent
// l'orientation. Un agrès porté (barre, haltère, poignée de câble) suit les mains du personnage.
// Largeur d'épaules : les clavicules s'allongent de δ ; sur une prise large, les mains glissent d'autant le long de la
// ligne des épaules (de même pour l'écart naturel : épaules de la femme plus étroites, prise plus serrée).
// Recalage (calculé hors ligne par picto-3d/femme/contacts.mjs --recaler, recalage-<perso>.json) : décalage du bassin à
// chaque pas de la boucle (corps sorti des sièges, bancs et barres), des objets portés (haltère, chariot écartés du
// corps), des pièces mobiles libres (boudin du leg curl), pièces fixes qui pèsent d'en haut relevées (boudin sur les
// cuisses) et affinage des pièces tenues en main.
// Mains en appui hors d'atteinte : tout le corps se déplace vers elles (à plat seulement si le clip est assis).
//   const r = recibler(THREE, { perso, clip, agres, recalage });   // perso : scène glTF du personnage ; clip : glTF
//   du clip ; recalage : { pas: [[x, y, z], …], objets: [[x, y, z], …], mobiles: { nom: [[x, y, z], …] } (repère du
//   conteneur, m), agres: { nom: [x, y, z] } (repère des agrès), main: f, assis: true } ou rien
//   groupe.add(r.conteneur) ; mélangeur sur r.conteneur avec r.animation ; après chaque update : r.apres(action.time)
//   r.epaules(δ)   // en mètres, par côté ;   r.ecart   // poignet ou cheville hors d'atteinte, m
//   r.liberer()    // rend clip, agrès et personnage dans leur état d'origine
// three.js est passé en paramètre : la visionneuse et contacts.mjs (Node) ont le leur. Noms des os côté three.js :
// sans le point (GLTFLoader les nettoie : « bras.L » devient « brasL »).
import type * as T from "three";

type Three = typeof T;
type V3 = T.Vector3;
type Os = Record<string, T.Object3D>;
type Cote = "L" | "R";
type Main = "libre" | "appui" | "porte";

/** Recalage d'un clip pour un personnage : décalages du bassin et des objets portés (36 pas de la boucle), agrès
 * relevés, taille de main ; assis : le corps ne suit les mains qu'à plat, parallèlement au siège. */
export interface Recalage {
  pas?: [number, number, number][];
  objets?: [number, number, number][];
  mobiles?: Record<string, [number, number, number][]>;
  agres?: Record<string, [number, number, number]>;
  main?: number;
  assis?: boolean;
}

export interface Prises {
  mains: Partial<Record<Cote, Main>>;
  groupes: Partial<Record<Cote, T.Mesh[]>>;
  attache: Partial<Record<Cote, boolean>>;
  meme: boolean;
}

export interface Reciblage {
  conteneur: T.Group;
  animation: T.AnimationClip;
  k: number;
  naturel: number;
  apres(temps: number): void;
  readonly ecart: number;
  readonly prises: Prises | null;
  mobile(a: T.Object3D): boolean;
  epaules(d: number): void;
  pousser(v: V3 | null, objet?: V3 | null, mobiles?: Record<string, V3>): void;
  liberer(): void;
}

const COTES: Cote[] = ["L", "R"];
const OS = /^(racine|dos|thorax|cou|tete|clavicule|bras|avant_bras|main|cuisse|jambe|pied|pouce|index|majeur|annulaire|auriculaire)/;
const nomDe = (piste: T.KeyframeTrack) => piste.name.slice(0, piste.name.lastIndexOf("."));
const PRISE = 0.75; // point de prise : creux de la main, entre poignet (0) et jointures (1)
const PASSES = 8; // déplacements du corps au plus, par instant

/**
 * Position de repos de chaque os, lue dans les nœuds (repère de la scène du personnage) et gardée sur la scène. À
 * appeler au chargement, avant toute animation (charger.ts) ; recibler le fait sinon. Les matrices de liaison ne
 * suffisent pas : un GLB quantifié (KHR_mesh_quantization, glTF-Transform) y replie l'échelle de déquantification.
 */
export function memoriserRepos(racine: T.Object3D): Record<string, [number, number, number]> {
  const u = racine.userData as { osRepos?: Record<string, [number, number, number]> };
  if (u.osRepos) return u.osRepos;
  racine.updateMatrixWorld(true);
  const inverse = racine.matrixWorld.clone().invert();
  const repos: Record<string, [number, number, number]> = {};
  racine.traverse((o) => {
    if (!(o as T.Bone).isBone) return;
    const m = o.matrixWorld.clone().premultiply(inverse).elements;
    repos[o.name] = [m[12]!, m[13]!, m[14]!];
  });
  return (u.osRepos = repos);
}

function lesOs(racine: T.Object3D): Os {
  const o: Os = {};
  racine.traverse((x) => {
    if (OS.test(x.name)) o[x.name] ??= x;
  });
  return o;
}

export function recibler(
  THREE: Three,
  { perso, clip, agres, recalage = {} }: { perso: T.Object3D; clip: { scene: T.Object3D; animations: T.AnimationClip[] }; agres: T.Mesh[]; recalage?: Recalage },
): Reciblage {
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const P = lesOs(perso), G = lesOs(clip.scene);
  const os = (B: Os, n: string) => B[n]!;

  // repos du personnage : pose de liaison ; repos de l'homme : nœuds du clip avant toute animation (gardés sur le clip,
  // qui reste en cache d'une ouverture à l'autre). k = longueur de jambe (hanche → cheville) du personnage / celle de
  // l'homme : debout, les pieds tombent sur le sol
  const repos0 = memoriserRepos(perso);
  const lie = (o: T.Object3D) => V().fromArray(repos0[o.name]!);
  clip.scene.userData.repos ??= (() => {
    clip.scene.updateMatrixWorld(true);
    const w = (n: string) => os(G, n).getWorldPosition(V());
    return { jambe: w("cuisseL").distanceTo(w("piedL")), epaule: w("brasL").x, hanche: w("cuisseL").x };
  })();
  const repos = clip.scene.userData.repos as { jambe: number; epaule: number; hanche: number };
  const k = lie(os(P, "cuisseL")).distanceTo(lie(os(P, "piedL"))) / repos.jambe;
  const naturel = lie(os(P, "brasL")).x - k * repos.epaule; // écart d'épaule (par côté) avec l'homme mis à l'échelle
  const hanche = lie(os(P, "cuisseL")).x - k * repos.hanche; // de même pour les hanches
  // main, relative à celle de l'homme
  const h = (os(P, "majeur1L").position.length() / (k * os(G, "majeur1L").position.length())) * (recalage.main ?? 1);
  const hanches = os(P, "cuisseL").position.clone().add(os(P, "cuisseR").position).multiplyScalar(0.5); // dans le repère du bassin
  const brasP = { L: os(P, "brasL").position.clone(), R: os(P, "brasR").position.clone() };
  const membres = COTES.flatMap((c) => ["bras", "avant_bras", "main", "cuisse", "jambe", "pied"].map((n) => os(P, n + c)));

  // pistes : rotations recopiées ; bassin à l'échelle ; translations et échelles des autres os retirées
  const src = clip.animations[0]!;
  const pistes: T.KeyframeTrack[] = [];
  for (const t of src.tracks) {
    const n = nomDe(t), prop = t.name.slice(n.length + 1);
    if (!(n in P)) pistes.push(t); // agrès
    else if (prop === "quaternion") pistes.push(t);
    else if (n === "racine" && prop === "position") {
      const c = t.clone();
      c.values = c.values.map((x) => x * k);
      pistes.push(c);
    }
  }
  const animation = new THREE.AnimationClip(src.name, src.duration, pistes);
  const mobiles = new Set(pistes.map(nomDe).filter((n) => !(n in P)));
  const echelles = new Set(pistes.filter((t) => !(nomDe(t) in P) && t.name.endsWith(".scale")).map(nomDe));
  const fantome = new THREE.AnimationMixer(clip.scene);
  const actionF = fantome.clipAction(new THREE.AnimationClip(src.name, src.duration, src.tracks.filter((t) => nomDe(t) in G))).play();
  clip.scene.scale.setScalar(k);

  const agresK = new THREE.Group();
  agresK.scale.setScalar(k);
  agresK.add(...agres);
  const conteneur = new THREE.Group();
  conteneur.add(perso, agresK);

  let delta = 0;
  let pousse: V3 | null = null, pousseObjet: V3 | null = null; // décalages imposés (contacts.mjs), sinon ceux du recalage
  let pousseMobiles: Record<string, V3> = {};
  let ecart = 0; // plus grand écart d'un poignet ou d'une cheville à sa cible, au dernier instant (hors d'atteinte)
  let prises: Prises | null = null; // décidées au premier instant
  // agrès → { d : décalage posé au dernier instant, ecrit : position alors écrite }. Le mélangeur ne réécrit une piste
  // que si sa valeur change (clip en pause, agrès sans piste) : position inchangée, le décalage est d'abord retiré
  const decale = new Map<T.Object3D, { d: V3; ecrit: V3 }>();
  // de même pour les os des membres (bras immobile dans le clip) : sinon l'IK repartirait de sa propre sortie, et un
  // objet porté dériverait d'une image à l'autre
  const tournes = new Map<T.Object3D, { clip: T.Quaternion; ecrit: T.Quaternion }>();
  const affines: [T.Mesh, V3][] = []; // [agrès, échelle d'origine]
  const M = new THREE.Matrix4(), qM = Q();
  // le fantôme vit hors scène, dans le repère du conteneur : ramené en monde
  const enMonde = (o: T.Object3D) => o.getWorldPosition(V()).applyMatrix4(M);
  const qMonde = (o: T.Object3D) => qM.clone().multiply(o.getWorldQuaternion(Q()));
  const monde = (o: T.Object3D) => o.getWorldPosition(V());
  const prise = (B: Os, c: Cote, w = monde) => w(os(B, `main${c}`)).lerp(w(os(B, `majeur1${c}`)), PRISE);
  // pièces d'un même agrès : barre et disques, haltère et têtes (le nom de la pièce commence par celui de l'agrès)
  const agresDe = (a: T.Object3D | undefined) => (a ? agres.filter((b) => b === a || b.name.startsWith(a.name + "_")) : []);
  const mobile = (a: T.Object3D) => mobiles.has(a.name);
  const boite = (a: T.Object3D) => new THREE.Box3().setFromObject(a);
  const leves: [T.Object3D, V3][] = []; // [agrès, décalage du recalage]
  for (const [nom, v] of Object.entries(recalage.agres ?? {}))
    for (const a of agresDe(agres.find((b) => b.name === nom))) {
      const d = V().fromArray(v);
      a.position.add(d);
      leves.push([a, d]);
    }

  function tourner(o: T.Object3D, q: T.Quaternion) { // rotation q (monde) appliquée à l'os o
    const p = o.parent!.getWorldQuaternion(Q());
    o.quaternion.premultiply(p.clone().invert().multiply(q).multiply(p));
    o.updateMatrixWorld(true);
  }
  function orienter(o: T.Object3D, q: T.Quaternion) { // orientation monde imposée
    o.quaternion.copy(o.parent!.getWorldQuaternion(Q()).invert().multiply(q));
    o.updateMatrixWorld(true);
  }
  function deuxOs(a: T.Object3D, b: T.Object3D, c: T.Object3D, T: V3) {
    const A = monde(a), B = monde(b), C = monde(c);
    const la = B.distanceTo(A), lb = C.distanceTo(B);
    const dir = V().subVectors(T, A);
    const d = Math.min(Math.max(dir.length(), Math.abs(la - lb) + 1e-5), la + lb - 1e-5);
    dir.normalize();
    const ab = V().subVectors(B, A);
    const pole = ab.clone().addScaledVector(dir, -ab.dot(dir));
    if (pole.lengthSq() < 1e-10) pole.set(0, 0, 1).addScaledVector(dir, -dir.z);
    pole.normalize();
    const cos = (la * la + d * d - lb * lb) / (2 * la * d), sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const B2 = A.clone().addScaledVector(dir, la * cos).addScaledVector(pole, la * sin);
    tourner(a, Q().setFromUnitVectors(ab.normalize(), B2.sub(A).normalize()));
    const B3 = monde(b), C3 = monde(c);
    const T2 = A.clone().addScaledVector(dir, d);
    tourner(b, Q().setFromUnitVectors(C3.sub(B3).normalize(), T2.sub(B3).normalize()));
  }

  // Prises, d'après le premier instant. Mains : « libre » (rien en main, loin du sol : les rotations suffisent),
  // « appui » (sol ou agrès fixe : IK sur la prise de l'homme), « porte » (objet mobile : pièces mobiles qui se
  // touchent, câbles à part ; il suit les mains du personnage, à deux mains la moyenne ; sur une même pièce, une barre,
  // les mains glissent le long). Les pièces serrées dans une main sont affinées (main plus petite, mêmes doigts).
  function decider(): Prises {
    const r: Prises = { mains: {}, groupes: {}, attache: {}, meme: false };
    const proches: Partial<Record<Cote, T.Mesh | null>> = {};
    const objet = (a: T.Mesh) => {
      for (const o of Object.values(r.groupes)) if (o.includes(a)) return o;
      const o = [a];
      for (let i = 0; i < o.length; i++) {
        const b = boite(o[i]!).expandByScalar(0.005);
        for (const x of agres) if (!o.includes(x) && mobile(x) && !echelles.has(x.name) && b.intersectsBox(boite(x))) o.push(x);
      }
      return o;
    };
    for (const c of COTES) {
      const pc = prise(G, c, enMonde);
      let proche: T.Mesh | null = null, dmin = 0.12;
      for (const a of agres) {
        const dist = boite(a).distanceToPoint(pc);
        if (dist < dmin) [proche, dmin] = [a, dist];
        if (dist < 0.02 && h < 1 && !echelles.has(a.name) && !affines.some(([x]) => x === a)) {
          // section seulement : l'axe le plus long de la pièce garde sa longueur
          a.geometry.computeBoundingBox();
          const t = a.geometry.boundingBox!.getSize(V()).multiply(a.scale);
          const long = (["x", "y", "z"] as const).reduce((m, x) => (t[x] > t[m] ? x : m), "x" as "x" | "y" | "z");
          affines.push([a, a.scale.clone()]);
          for (const x of ["x", "y", "z"] as const) if (x !== long) a.scale[x] *= h;
        }
      }
      // près d'un objet mobile sans le toucher (main posée sur la cuisse au curl concentré) : il ne le porte pas
      if (proche && mobile(proche) && dmin > 0.03) proche = null;
      proches[c] = proche;
      if (!proche) r.mains[c] = pc.y < 0.15 ? "appui" : "libre";
      else if (!mobile(proche)) r.mains[c] = "appui";
      else {
        r.mains[c] = "porte";
        const o = (r.groupes[c] = objet(proche));
        // rattaché à la machine (touche une pièce fixe autre que le sol) : la main va sur la prise de l'homme
        r.attache[c] = agres.some((x) => !o.includes(x) && !mobile(x) && !echelles.has(x.name) && !/tapis|sol/.test(x.name)
          && o.some((y) => boite(y).expandByScalar(0.005).intersectsBox(boite(x))));
      }
    }
    r.meme = !!proches.L && proches.L === proches.R;
    return r;
  }

  // décalage du bassin (ou des objets portés) à cet instant (interpolé entre les pas de la boucle), en monde
  function decalage(temps: number, impose: V3 | null, pas?: [number, number, number][]) {
    const d = V();
    if (impose) d.copy(impose);
    else if (pas?.length) {
      const n = pas.length, x = ((((temps / src.duration) % 1) + 1) % 1) * n, i = Math.floor(x) % n;
      d.fromArray(pas[i]!).lerp(V().fromArray(pas[(i + 1) % n]!), x - Math.floor(x));
    }
    return d.applyMatrix4(M).sub(V().setFromMatrixPosition(M));
  }

  const aRecaler = () => !!(pousse || pousseObjet || Object.keys(pousseMobiles).length || recalage.pas?.length
    || recalage.objets?.length || Object.keys(recalage.mobiles ?? {}).length);

  function apres(temps: number) {
    for (const c of COTES) os(P, `bras${c}`).position.copy(brasP[c]).multiplyScalar(1 + delta / brasP[c].length());
    // mêmes proportions que l'homme, épaules d'origine et rien à recaler : le clip tel quel
    if (Math.abs(k - 1) < 1e-3 && delta === 0 && !aRecaler()) return;
    actionF.time = temps;
    fantome.update(0);
    clip.scene.updateMatrixWorld(true);
    conteneur.updateMatrixWorld(true);
    M.copy(conteneur.matrixWorld);
    conteneur.getWorldQuaternion(qM);
    const R = os(P, "racine");
    const sorti = decalage(temps, pousse, recalage.pas); // corps sorti des agrès
    const cible = enMonde(os(G, "cuisseL")).add(enMonde(os(G, "cuisseR"))).multiplyScalar(0.5).add(sorti);
    const objet = decalage(temps, pousseObjet, recalage.objets); // objets portés écartés du corps
    if (sorti.length() < 1e-3) sorti.set(0, 0, 0);
    else sorti.normalize();
    const pr = (prises ??= decider());
    // décalage des prises le long de la ligne des épaules du fantôme, les deux mains sur une même pièce : plein sur une
    // prise large, nul sur une prise serrée
    const axe = enMonde(os(G, "brasL")).sub(enMonde(os(G, "brasR"))).normalize();
    const large = pr.meme ? THREE.MathUtils.smoothstep(enMonde(os(G, "mainL")).distanceTo(enMonde(os(G, "mainR"))), 0.2, 0.4) : 0;
    const glisse = (c: Cote) => axe.clone().multiplyScalar((c === "L" ? 1 : -1) * (naturel + delta) * large);
    // main seule sur son agrès (haltère, poignée) : écart latéral à l'homme, comme les hanches en bas, comme les
    // épaules en haut
    const hautHanche = enMonde(os(G, "cuisseL")).y, hautEpaule = enMonde(os(G, "brasL")).y;
    const seule = (c: Cote) => axe.clone().multiplyScalar((c === "L" ? 1 : -1) * THREE.MathUtils.lerp(hanche, naturel + delta,
      THREE.MathUtils.clamp((prise(G, c, enMonde).y - hautHanche) / (hautEpaule - hautHanche), 0, 1)));
    const moyenne = (ds: V3[]) => ds.reduce((s, d) => s.add(d), V()).divideScalar(ds.length);
    // mains en appui (sol, banc, poignée de machine) hors d'atteinte : tout le corps se déplace vers elles, des rotations
    // du clip, jusqu'à ce qu'elles y arrivent (bras plus courts que ne le veut k), sans revenir dans l'agrès d'où le
    // recalage l'a sorti
    for (const o of membres) {
      const t = tournes.get(o);
      if (t && o.quaternion.equals(t.ecrit)) o.quaternion.copy(t.clip);
    }
    const rotations = membres.map((o) => o.quaternion.clone());
    const corps = V();
    let restes = new Map<T.Mesh[], V3[]>(), deplace = new Map<T.Mesh[], V3[]>();
    for (let passe = 0; ; passe++) {
      // bassin : milieu des hanches sur celui du fantôme
      R.position.copy(cible.clone().add(corps).applyMatrix4(R.parent!.matrixWorld.clone().invert())).sub(hanches.clone().applyQuaternion(R.quaternion));
      R.updateMatrixWorld(true);
      const fixes: V3[] = [];
      // agrès portés : déplacés de l'écart entre les mains du personnage (rotations seules) et celles de l'homme
      deplace = new Map<T.Mesh[], V3[]>();
      for (const c of COTES) {
        const g = pr.groupes[c];
        if (g) deplace.set(g, [...(deplace.get(g) ?? []), prise(P, c).sub(prise(G, c, enMonde)).add(objet)]);
      }
      ecart = 0;
      restes = new Map<T.Mesh[], V3[]>(); // objet porté → poignets hors d'atteinte : l'objet suit la main
      for (const c of COTES) {
        const g = pr.groupes[c];
        // libre : la main reste où les rotations la mettent
        if (pr.mains[c] !== "libre") {
          const seul = g && deplace.get(g)!.length === 1;
          const T = prise(G, c, enMonde);
          if (seul && pr.attache[c]) deplace.set(g, [V()]);
          else if (seul) {
            // la main garde la place que lui donnent les rotations (avant-bras plus court), sauf de côté ; l'agrès suit
            const d = deplace.get(g)![0]!;
            d.addScaledVector(axe, seule(c).sub(d).dot(axe));
            T.add(d);
          } else T.add(glisse(c)).add(g ? moyenne(deplace.get(g)!) : V());
          // poignet visé : la prise moins le creux de la main du personnage, dans l'orientation de la main de l'homme
          const q = qMonde(os(G, `main${c}`));
          T.sub(os(P, `majeur1${c}`).position.clone().multiplyScalar(PRISE).applyQuaternion(q));
          deuxOs(os(P, `bras${c}`), os(P, `avant_bras${c}`), os(P, `main${c}`), T);
          const reste = monde(os(P, `main${c}`)).sub(T);
          if (g && !pr.attache[c]) restes.set(g, [...(restes.get(g) ?? []), reste]);
          else {
            ecart = Math.max(ecart, reste.length());
            fixes.push(reste);
          }
          orienter(os(P, `main${c}`), q);
        }
        // pieds : toujours sur ceux de l'homme (même longueur de jambe, à l'échelle k : toujours atteints)
        const T = enMonde(os(G, `pied${c}`));
        deuxOs(os(P, `cuisse${c}`), os(P, `jambe${c}`), os(P, `pied${c}`), T);
        ecart = Math.max(ecart, monde(os(P, `pied${c}`)).distanceTo(T));
        orienter(os(P, `pied${c}`), qMonde(os(G, `pied${c}`)));
      }
      const m = fixes.length ? moyenne(fixes) : V();
      if (m.length() < 5e-4 || passe === PASSES - 1) break;
      corps.sub(m);
      if (recalage.assis) corps.y = 0;
      corps.addScaledVector(sorti, -Math.min(0, corps.dot(sorti)));
      membres.forEach((o, i) => o.quaternion.copy(rotations[i]!));
    }
    membres.forEach((o, i) => tournes.set(o, { clip: rotations[i]!, ecrit: o.quaternion.clone() }));
    for (const [g, rs] of restes) {
      const m = moyenne(rs);
      for (const x of rs) ecart = Math.max(ecart, x.distanceTo(m));
      for (const d of deplace.get(g)!) d.add(m);
    }
    // pièces mobiles libres (boudin du leg curl) écartées du corps
    const portes = new Set([...deplace.keys()].flat());
    for (const nom of new Set([...Object.keys(recalage.mobiles ?? {}), ...Object.keys(pousseMobiles)])) {
      const g = agresDe(agres.find((b) => b.name === nom)).filter((a) => !portes.has(a));
      if (g.length) deplace.set(g, [decalage(temps, pousseMobiles[nom] ?? null, recalage.mobiles?.[nom])]);
    }
    // une pièce qui n'est plus décalée retrouve sa place
    const poses = new Set([...deplace.keys()].flat());
    for (const [a, { d, ecrit }] of decale)
      if (!poses.has(a as T.Mesh)) {
        if (a.position.equals(ecrit)) a.position.sub(d);
        decale.delete(a);
      }
    for (const [g, ds] of deplace) {
      const d = moyenne(ds).applyQuaternion(qM.clone().invert()).divideScalar(k); // repère des agrès
      for (const a of g) {
        const prec = decale.get(a);
        if (prec && a.position.equals(prec.ecrit)) a.position.sub(prec.d);
        a.position.add(d);
        decale.set(a, { d, ecrit: a.position.clone() });
      }
    }
  }

  return {
    conteneur, animation, k, naturel, apres,
    get ecart() { return ecart; },
    get prises() { return prises; },
    mobile,
    epaules(d) { delta = d; },
    // contacts.mjs : décalages du bassin et des objets portés (repère du conteneur), null pour revenir au recalage
    pousser(v, o = null, m = {}) { [pousse, pousseObjet, pousseMobiles] = [v, o, m]; },
    liberer() {
      fantome.stopAllAction();
      fantome.uncacheRoot(clip.scene);
      clip.scene.scale.setScalar(1);
      for (const [a, { d, ecrit }] of decale) if (a.position.equals(ecrit)) a.position.sub(d);
      for (const [o, t] of tournes) if (o.quaternion.equals(t.ecrit)) o.quaternion.copy(t.clip);
      for (const [a, e] of affines) a.scale.copy(e);
      for (const [a, d] of leves) a.position.sub(d);
      for (const c of COTES) os(P, `bras${c}`).position.copy(brasP[c]);
    },
  };
}
