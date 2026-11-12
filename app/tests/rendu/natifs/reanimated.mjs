import React from "react";
import { hote, neutre } from "./aide.mjs";

// Double de Reanimated pour le banc de rendu. Deux modes :
//  - NEUTRE (par défaut) : rien ne bouge. Une valeur partagée est un objet `{ value }`, `withTiming(v)` rend `v`, les styles animés sont
//    calculés une fois au rendu. Les écrans qui montent des animations sans que le test s'en occupe ne changent pas.
//  - VIVANT (`horloge.vivant = true`, posé par le test avant de monter ; tests/rendu/rendu.mjs : `activerHorloge`) : un Reanimated
//    DÉTERMINISTE. Une horloge factice (`horloge.maintenant`, en ms) que seul le test fait avancer (`avancer`) ; `withTiming` est calculé à
//    l'instant de l'horloge (courbe, durée et retard réels) ; les valeurs dérivées, les réactions, les styles et les props animés sont
//    recalculés dès qu'une valeur partagée change, jusqu'à ce que tout soit stable, comme le fait le fil UI à chaque image. Aucune
//    minuterie, aucune horloge réelle : le résultat ne dépend ni de la charge de la machine ni de l'ordre des tests.
//    Les styles et props animés sont des objets VIVANTS : le même objet, mis à jour sur place ; le test lit l'arbre à n'importe quel instant.

export const horloge = {
  vivant: false,
  /** Instant factice (ms), qui n'avance que par `avancer`. */
  maintenant: 0,
  /** Une valeur partagée a été écrite depuis le dernier calcul : les dérivées, réactions et styles sont à refaire. */
  sale: false,
};

const ANIM = Symbol("animation");
const registre = new Set();
const animations = new Set();

// ——— Valeurs partagées ———

function creer(v0) {
  const s = {
    _v: v0,
    _anim: null,
    get value() {
      return s._v;
    },
    set value(x) {
      ecrire(s, x);
    },
    get: () => s._v,
    set: (x) => ecrire(s, typeof x === "function" ? x(s._v) : x),
    modify(f) {
      const r = f(s._v);
      if (r !== undefined) ecrire(s, r);
    },
    addListener() {},
    removeListener() {},
  };
  return s;
}

function arreter(s, fini) {
  const a = s._anim;
  if (!a) return;
  s._anim = null;
  animations.delete(s);
  a.a.rappel?.(fini);
}

function ecrire(s, x) {
  arreter(s, false);
  horloge.sale = true;
  if (x && typeof x === "object" && x[ANIM]) {
    s._anim = { de: s._v, a: x, debut: horloge.maintenant + (x.retard ?? 0) };
    animations.add(s);
  } else s._v = x;
}

/** Fait avancer les animations jusqu'à `horloge.maintenant` (formule fermée : le pas de l'horloge ne change pas le résultat). */
function animer() {
  for (const s of [...animations]) {
    const a = s._anim;
    if (!a) continue;
    const t = horloge.maintenant - a.debut;
    if (t < 0) continue;
    const d = a.a.duree;
    const p = d <= 0 ? 1 : Math.min(1, t / d);
    horloge.sale = true;
    if (p >= 1) {
      s._anim = null;
      animations.delete(s);
      s._v = a.a.vers;
      a.a.rappel?.(true);
    } else s._v = a.de + (a.a.vers - a.de) * a.a.courbe(p);
  }
}

const meme = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Recalcule tout ce qui dépend des valeurs partagées jusqu'à la stabilité. Rend vrai si quelque chose a été recalculé. */
function propager() {
  if (!horloge.sale) return false;
  for (let passe = 0; horloge.sale; passe++) {
    if (passe > 40) throw new Error("reanimated (double) : les valeurs dérivées ne se stabilisent pas");
    horloge.sale = false;
    for (const m of [...registre]) m.lancer();
  }
  return true;
}

horloge.avancerAnimations = animer;
horloge.propager = propager;
horloge.reinitialiser = () => {
  horloge.maintenant = 0;
  horloge.sale = false;
  registre.clear();
  animations.clear();
};

// ——— Courbes ———

/** cubic-bezier CSS, par dichotomie (indépendant du code testé). */
function bezier(x1, y1, x2, y2) {
  const f = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 50; i++) {
      const t = (lo + hi) / 2;
      if (f(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return f(y1, y2, (lo + hi) / 2);
  };
}
const lineaire = (x) => x;
export const Easing = new Proxy(
  { linear: lineaire, bezier, inOut: (f) => (x) => (x < 0.5 ? f(2 * x) / 2 : 1 - f(2 * (1 - x)) / 2), quad: (x) => x * x },
  { get: (c, k) => (k in c ? c[k] : () => (x) => x) },
);

// ——— Animations ———

export const withTiming = (vers, config = {}, rappel) => {
  if (!horloge.vivant) return vers;
  return { [ANIM]: true, vers, duree: config.duration ?? 300, courbe: config.easing ?? Easing.inOut(Easing.quad), rappel };
};
export const withDelay = (retard, anim) => (horloge.vivant && anim && anim[ANIM] ? { ...anim, retard } : anim);
export const withSequence = (...v) => v[v.length - 1];
export const withSpring = (v) => v;
export const withRepeat = (v) => v;
export const cancelAnimation = (s) => {
  if (horloge.vivant) arreter(s, false);
};

// ——— Crochets ———

export const useSharedValue = (v) => {
  if (!horloge.vivant) return { value: v };
  const ref = React.useRef(null);
  ref.current ??= creer(v);
  return ref.current;
};
export const makeMutable = (v) => (horloge.vivant ? creer(v) : { value: v });

/** Un calcul enregistré (dérivée, style, props) : recalculé à chaque propagation, retiré au démontage. */
function enregistrer(ref, lancer) {
  const m = { lancer };
  ref.m = m;
  registre.add(m);
  return m;
}
function useRetrait(ref) {
  React.useEffect(() => () => void registre.delete(ref.current?.m), []);
}

export const useDerivedValue = (f) => {
  if (!horloge.vivant) return { value: f() };
  const ref = React.useRef(null);
  if (!ref.current) {
    const s = creer(undefined);
    ref.current = { s, f };
    s._v = f();
    enregistrer(ref.current, () => {
      let n;
      try {
        n = ref.current.f();
      } catch {
        return;
      }
      if (!meme(n, s._v)) {
        s._v = n;
        horloge.sale = true;
      }
    });
  }
  ref.current.f = f;
  useRetrait(ref);
  return ref.current.s;
};

/** Remplace le contenu de l'objet vivant `cible` par `n`, sur place. Rend vrai si quelque chose a changé. */
function remplacer(cible, n) {
  if (meme(cible, n)) return false;
  for (const k of Object.keys(cible)) if (!(k in n)) delete cible[k];
  Object.assign(cible, n);
  return true;
}
const abonnesProps = new WeakMap();

function useVivant(f, abonnes) {
  const ref = React.useRef(null);
  if (!ref.current) {
    const objet = {};
    ref.current = { objet, f };
    const calcule = () => {
      try {
        return ref.current.f() ?? {};
      } catch {
        return null;
      }
    };
    remplacer(objet, calcule() ?? {});
    if (abonnes) abonnesProps.set(objet, new Set());
    enregistrer(ref.current, () => {
      const n = calcule();
      if (n && remplacer(objet, n)) abonnesProps.get(objet)?.forEach((g) => g());
    });
  }
  ref.current.f = f;
  // Le rendu peut changer ce que la fonction capture (l'index d'un onglet, une largeur) : on la relit tout de suite.
  const n = (() => {
    try {
      return f() ?? {};
    } catch {
      return null;
    }
  })();
  if (n && remplacer(ref.current.objet, n)) abonnesProps.get(ref.current.objet)?.forEach((g) => g());
  useRetrait(ref);
  return ref.current.objet;
}

export const useAnimatedStyle = (f) => {
  if (!horloge.vivant) {
    try {
      return f();
    } catch {
      return {};
    }
  }
  return useVivant(f, false);
};
export const useAnimatedProps = (f) => {
  if (!horloge.vivant) {
    try {
      return f();
    } catch {
      return {};
    }
  }
  return useVivant(f, true);
};

export const useAnimatedReaction = (prepare, reagir) => {
  const ref = React.useRef({ prepare, reagir, d: undefined, vu: false });
  ref.current.prepare = prepare;
  ref.current.reagir = reagir;
  React.useEffect(() => {
    if (!horloge.vivant) return undefined;
    const etat = ref.current;
    const m = {
      lancer() {
        const entree = etat.prepare();
        if (etat.vu && meme(entree, etat.d)) return;
        const avant = etat.vu ? etat.d : null;
        etat.vu = true;
        etat.d = entree;
        etat.reagir(entree, avant);
      },
    };
    registre.add(m);
    m.lancer();
    return () => void registre.delete(m);
  }, []);
};

export const useAnimatedScrollHandler = (h) => {
  if (!horloge.vivant) return () => {};
  const surDefilement = typeof h === "function" ? h : h.onScroll;
  return (e) => {
    surDefilement?.(e?.nativeEvent ?? e);
    horloge.sale = true;
  };
};
export const useAnimatedRef = () => React.useRef(null);
export const useFrameCallback = () => ({ setActive() {} });
export const interpolateColor = (_, __, c) => c?.[0];
export const runOnJS = (f) => f;
export const ReduceMotion = { System: "system", Always: "always", Never: "never" };
export const _neutre = neutre;

// ——— Composants ———

/**
 * Un composant « animé » (`createAnimatedComponent`, souvent créé à l'import, avant que le test n'active l'horloge) : le mode est lu à
 * chaque rendu. Neutre : le composant tel quel, `animatedProps` lui est passé comme avant. Vivant : il lit `animatedProps` (objet vivant)
 * et se redessine quand il change.
 */
const createAnimatedComponent = (C) => {
  const Anime = React.forwardRef(({ animatedProps, ...p }, ref) => {
    const [, redessiner] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => {
      const a = animatedProps && abonnesProps.get(animatedProps);
      a?.add(redessiner);
      return () => void a?.delete(redessiner);
    }, [animatedProps]);
    if (!horloge.vivant) return React.createElement(C, { ...p, animatedProps, ref });
    return React.createElement(C, { ...p, ...animatedProps, ref });
  });
  Anime.displayName = `Anime(${C.displayName ?? "composant"})`;
  return Anime;
};

const Animated = { View: hote("Animated.View"), Text: hote("Animated.Text"), Image: hote("Animated.Image"), ScrollView: hote("Animated.ScrollView"), createAnimatedComponent };
export default Animated;

/** `FadeIn.duration(200).delay(50)` : une entrée d'animation que rien ne lit. */
const entree = () => new Proxy({}, { get: () => () => entree() });
export const FadeIn = entree();
export const FadeInDown = entree();
export const FadeInUp = entree();
export const FadeOut = entree();
export const FadeOutDown = entree();
export const FadeOutUp = entree();
export const LinearTransition = entree();
