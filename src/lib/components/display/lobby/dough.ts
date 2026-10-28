// What a daifuku is made of: its shape and how it is painted.
//
// Each is a ball of rice dough pressed by hand, so no two are the same shape:
// the lumps, the lean and the way it spreads at the bottom all come from the
// runner's name, the same every time. Dough in their card colour, dusted with
// flour that is thickest on top and pales the colour under it, a face painted
// on. Drawn by its own shader rather than three's lit materials, so the dough
// can be soft and the flour matte without a scene full of lights.

import {
  BufferAttribute,
  CanvasTexture,
  Color,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { CardColor } from "$lib/sync/profile-rules";

/**
 * Dough in each card colour: the colour of mochi tinted with it, softer than
 * the card, because flour and light pale it further. Data for the shader, not
 * a theme colour: the room is always daytime, like a seal's enamel is always
 * the same.
 */
const DOUGH: Readonly<Record<CardColor, string>> = {
  rose: "#e98f9d",
  orange: "#eda872",
  amber: "#e9c66f",
  lime: "#b9d27a",
  green: "#93c39a",
  teal: "#7fc2b8",
  cyan: "#86c3dd",
  blue: "#93ace6",
  indigo: "#a6a0e6",
  violet: "#c3a1e3",
  pink: "#ec9cc4",
  slate: "#aab4c2",
};

/** A random number generator seeded from a string, so a name always makes the same daifuku. */
export function randomFrom(seed: string): () => number {
  // FNV-1a for the seed, then mulberry32.
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Between `low` and `high`. */
export function between(random: () => number, low: number, high: number): number {
  return low + (high - low) * random();
}

/** A random direction, evenly over the sphere. */
function direction(random: () => number): Vector3 {
  const y = random() * 2 - 1;
  const around = random() * Math.PI * 2;
  const flat = Math.sqrt(1 - y * y);
  return new Vector3(flat * Math.cos(around), y, flat * Math.sin(around));
}

/**
 * The shape: a sphere squashed into a dome, spread a little at the bottom the
 * way soft dough settles, pressed flat underneath, with a few lumps where the
 * hands left them. Each vertex also keeps where it was on the sphere, so the
 * face and the flour are painted the same on every shape.
 */
export function doughShape(random: () => number): BufferGeometry {
  // Smooth enough at the size a daifuku shows, and light enough for a room of hundreds.
  let sphere: BufferGeometry = new SphereGeometry(1, 48, 32);
  // Without them the seam's twin vertices merge, so the normals have no seam.
  sphere.deleteAttribute("normal");
  sphere.deleteAttribute("uv");
  sphere = mergeVertices(sphere);

  const lumps = Array.from({ length: 6 }, () => ({
    at: direction(random),
    tightness: between(random, 2, 6),
    height: between(random, -0.07, 0.07),
  }));
  const width = between(random, 0.6, 0.68);
  const depth = between(random, 0.56, 0.63);
  const height = between(random, 0.44, 0.52);
  const spread = between(random, 0.06, 0.14);
  const floor = -height * between(random, 0.62, 0.72);

  const position = sphere.getAttribute("position");
  const base = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    base.set([x, y, z], index * 3);
    let radius = 1;
    for (const lump of lumps) {
      const facing = x * lump.at.x + y * lump.at.y + z * lump.at.z;
      radius += lump.height * Math.exp(-lump.tightness * (1 - facing));
    }
    const wide = 1 + spread * (1 - y) * 0.5;
    const up = y * radius * height;
    position.setXYZ(
      index,
      x * radius * width * wide,
      up < floor ? floor + (up - floor) * 0.3 : up,
      z * radius * depth * wide,
    );
  }
  sphere.setAttribute("base", new BufferAttribute(base, 3));
  sphere.computeVertexNormals();
  sphere.computeBoundingBox();
  return sphere;
}

const VERTEX = /* glsl */ `
  attribute vec3 base;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vBase;

  void main() {
    vBase = base;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vView = -view.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uDough;
  uniform float uFlour;
  uniform float uSeed;
  uniform vec3 uLight;
  uniform float uOpen;
  uniform float uHappy;
  uniform vec2 uLook;
  uniform float uFace;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vBase;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float weight = 0.5;
    for (int octave = 0; octave < 4; octave++) {
      sum += weight * noise(p);
      p *= 2.03;
      weight *= 0.5;
    }
    return sum;
  }

  // How much of an eye covers this point of the face: an oval, or with
  // uHappy an arc, closed down to a line as it blinks.
  float eye(vec2 at, vec2 center) {
    vec2 q = at - center;
    vec2 size = vec2(0.075, 0.15 * max(uOpen, 0.08));
    float oval = length(q / size);
    float edge = fwidth(oval);
    float filled = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, oval);
    vec2 r = q - vec2(0.0, -0.05);
    float ring = length(r / vec2(0.085, 0.08));
    float ringEdge = fwidth(ring);
    float arc = (1.0 - smoothstep(0.22 - ringEdge, 0.22 + ringEdge, abs(ring - 1.0)))
      * smoothstep(-0.01, 0.01, r.y);
    return mix(filled, arc, uHappy);
  }

  float glint(vec2 at, vec2 center) {
    float spot = length(at - center - vec2(-0.024, 0.05)) / 0.026;
    float edge = fwidth(spot);
    return (1.0 - smoothstep(1.0 - edge, 1.0 + edge, spot)) * (1.0 - uHappy) * step(0.5, uOpen);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    vec3 l = normalize(uLight);
    vec3 d = normalize(vBase);

    // Soft light that wraps round the side, as it does through dough.
    float wrap = clamp((dot(n, l) + 0.55) / 1.55, 0.0, 1.0);

    // Flour: heaviest on top where it was dusted, in patches, with grains.
    float top = smoothstep(-0.45, 0.9, d.y);
    float patches = fbm(d * 2.6 + uSeed);
    float flour = clamp(uFlour * (top * 1.25 + (patches - 0.5) * 1.4), 0.0, 1.0);
    float grain = noise(d * 70.0 + uSeed);
    flour = clamp(flour + (grain - 0.5) * 0.45 * smoothstep(0.05, 0.5, flour), 0.0, 1.0);

    vec3 dough = uDough * (0.55 + 0.5 * wrap);
    // Light passing through the dough's edge comes out warmer and deeper.
    dough += uDough * uDough * 0.18 * (1.0 - wrap);
    vec3 powder = vec3(0.96, 0.94, 0.9) * (0.72 + 0.3 * wrap);
    vec3 color = mix(dough, powder, flour);

    // Dusted surfaces look velvety at the edges.
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    color = mix(color, powder, rim * (0.2 + 0.45 * flour));
    // A soft sheen where the dough shows through.
    vec3 h = normalize(l + v);
    color += pow(max(dot(n, h), 0.0), 28.0) * 0.1 * (1.0 - flour);

    // The face, painted on the front, at angles across and up from it.
    vec2 at = vec2(atan(d.x, d.z), asin(clamp(d.y, -1.0, 1.0)));
    // A sweet in the shop's case is the same dough, without a face.
    float front = smoothstep(0.0, 0.3, d.z) * uFace;
    vec2 left = vec2(-0.3, 0.12) + uLook;
    vec2 right = vec2(0.3, 0.12) + uLook;
    float blush = 0.0;
    for (int side = 0; side < 2; side++) {
      vec2 center = vec2(side == 0 ? -0.52 : 0.52, -0.08) + uLook * 0.5;
      float spot = length((at - center) / vec2(0.14, 0.08));
      blush = max(blush, 1.0 - smoothstep(0.5, 1.0, spot));
    }
    color = mix(color, vec3(0.93, 0.36, 0.42), blush * 0.42 * (1.0 - flour * 0.5) * front);
    float eyes = max(eye(at, left), eye(at, right)) * front;
    color = mix(color, mix(vec3(0.025, 0.018, 0.016), powder, flour * 0.12), eyes);
    float shine = max(glint(at, left), glint(at, right)) * front;
    color = mix(color, vec3(1.0), shine * 0.9);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** What the shader is told each frame about the face. */
export interface Face {
  /** 1 open, 0 shut. */
  open: number;
  /** 0 for round eyes, 1 for happy arcs. */
  happy: number;
  /** Where the eyes look, across and up, in the face's own angles. */
  readonly look: Vector2;
}

/** The dough's paint for one daifuku, lit by `light`, a direction the camera sees. */
export function doughMaterial(
  color: CardColor,
  random: () => number,
  light: Vector3,
): ShaderMaterial {
  return dough(new Color(DOUGH[color]), random, light, 1);
}

/** The same dough for a sweet in the shop's case: any colour, no face. */
export function sweetMaterial(color: string, random: () => number, light: Vector3): ShaderMaterial {
  return dough(new Color(color), random, light, 0);
}

function dough(color: Color, random: () => number, light: Vector3, face: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uDough: { value: color },
      uFlour: { value: between(random, 0.45, 0.8) },
      uSeed: { value: random() * 100 },
      uLight: { value: light },
      uOpen: { value: 1 },
      uHappy: { value: 0 },
      uLook: { value: new Vector2() },
      uFace: { value: face },
    },
  });
}

export function setDough(material: ShaderMaterial, color: CardColor): void {
  const uniform: { value: unknown } | undefined = material.uniforms.uDough;
  if (uniform?.value instanceof Color) uniform.value.set(DOUGH[color]);
}

/** Hands the shader a face. */
export function paintFace(material: ShaderMaterial, face: Face): void {
  const { uOpen, uHappy, uLook } = material.uniforms;
  if (uOpen !== undefined) uOpen.value = face.open;
  if (uHappy !== undefined) uHappy.value = face.happy;
  if (uLook?.value instanceof Vector2) uLook.value.copy(face.look);
}

let shadowTexture: CanvasTexture | null = null;

/** A soft round shadow, one texture shared by every daifuku. */
export function shadowMap(): CanvasTexture {
  if (shadowTexture !== null) return shadowTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context !== null) {
    const middle = size / 2;
    const falloff = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
    falloff.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    falloff.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = falloff;
    context.fillRect(0, 0, size, size);
  }
  shadowTexture = new CanvasTexture(canvas);
  return shadowTexture;
}
