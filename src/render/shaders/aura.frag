#version 300 es
/*
 * AuraForge — volume renderer
 * ------------------------------------------------------------------
 *  A shared flow-field core plus nine structural archetypes. Every
 *  archetype is evaluated through the same signature
 *
 *      vec3 pattern(vec2 w, float z, float t) -> vec3(density, filament, paletteT)
 *
 *  so the artist can crossfade any two of them through `uMix`, and every one
 *  of them reacts to the same structure knobs (threads, sharpness, bands,
 *  twist, sparsity).
 *
 *  Canvas nodes are independent field emitters: each carries its own
 *  behaviour, falloff and colour, and they displace the sample coordinate
 *  before any pattern is evaluated.
 *
 *  Post-processing lives in post.frag — this pass only produces raw radiance,
 *  which keeps the bloom/chroma/grain chain a cheap full-screen pass.
 * ------------------------------------------------------------------
 */
precision highp float;

out vec4 fragColor;

/* ------------------------------ uniforms ------------------------------ */
uniform vec2  uResolution;
uniform float uTime;
uniform float uSeed;

// pattern
uniform int   uPattern;
uniform int   uMixPattern;
uniform float uMix;

// flow & chaos
uniform float uTurbulenceScale;
uniform float uCurlIntensity;
uniform float uZigzag;
uniform float uCompression;
uniform float uEvolutionSpeed;
uniform float uWarpIterations;
uniform float uShear;
uniform float uVorticity;
uniform float uDirection;
uniform float uMirror;

// structure
uniform float uThreadCount;
uniform float uThreadSpread;
uniform float uSharpness;
uniform float uBandFreq;
uniform float uTwist;
uniform float uSparsity;

// volume & particles
uniform float uSmokeDensity;
uniform float uFilamentSharp;
uniform float uGlow;
uniform float uSteps;
uniform float uScatter;
uniform float uSparkSize;
uniform float uTrail;

// palette
uniform vec3  uPalette[5];
uniform int   uPaletteStops;
uniform int   uPaletteMode;
uniform float uHueShift;
uniform float uColorCycle;
uniform float uSaturation;
uniform float uExposure;
uniform float uBgDark;

// canvas nodes
uniform int   uNodeCount;
uniform vec4  uNodeA[8];      // xy = position, z = strength, w = radius
uniform vec4  uNodeB[8];      // x = kind, y = falloff, z = colorMix, w = enabled
uniform vec3  uNodeColor[8];

#define PI 3.14159265359
#define MAX_STEPS 96

/* ------------------------------- utility ------------------------------- */

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/* --------------------------- 3D simplex noise --------------------------- */
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p, int octaves) {
  float amp = 0.5;
  float sum = 0.0;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum  += amp * snoise(p);
    norm += amp;
    p = p * 2.03 + vec3(17.13, 9.71, 5.37);
    amp *= 0.5;
  }
  return sum / max(norm, 1e-4);
}

float ridged(vec3 p, int octaves, float sharpness) {
  float amp = 0.5;
  float sum = 0.0;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float n = snoise(p);
    float r = 1.0 - abs(n);
    r = pow(clamp(r, 0.0, 1.0), sharpness);
    sum  += amp * r * r;
    norm += amp;
    p = p * 2.11 + vec3(11.31, 7.73, 3.17);
    amp *= 0.55;
  }
  return sum / max(norm, 1e-4);
}

/* ------------------------- 2D curl (flow warp) ------------------------- */
float potential2(vec2 p) {
  return snoise(vec3(p, uSeed * 0.37));
}

vec2 curl2(vec2 p) {
  const float e = 0.085;
  float a = potential2(p - vec2(e, 0.0));
  float b = potential2(p + vec2(e, 0.0));
  float c = potential2(p - vec2(0.0, e));
  float d = potential2(p + vec2(0.0, e));
  vec2 v = vec2(d - c, a - b) / (2.0 * e);
  return v / (length(v) + 1e-5);
}

/* -------------------------------- palette -------------------------------- */
vec3 paletteAt(float t) {
  float n = max(float(uPaletteStops - 1), 1.0);
  float x = clamp(t, 0.0, 1.0) * n;
  vec3 c = uPalette[0];
  for (int i = 0; i < 4; i++) {
    if (float(i) >= n) break;
    float f0 = float(i);
    if (x >= f0) {
      int j = i + 1;
      if (j > uPaletteStops - 1) j = uPaletteStops - 1;
      c = mix(uPalette[i], uPalette[j], clamp(x - f0, 0.0, 1.0));
    }
  }
  return c;
}

/* ------------------------------ canvas nodes ------------------------------ */
// Displaces the sample coordinate and accumulates a colour tint.
vec2 applyNodes(vec2 uv, out vec3 tint, out float tintAmt) {
  tint = vec3(0.0);
  tintAmt = 0.0;

  for (int i = 0; i < 8; i++) {
    if (i >= uNodeCount) break;

    vec4 A = uNodeA[i];
    vec4 B = uNodeB[i];
    if (B.w < 0.5) continue;

    vec2 d = uv - A.xy;
    float dist = length(d) + 1e-5;
    float r = max(A.w, 1e-4);
    vec2 dir = d / dist;
    vec2 tang = vec2(-dir.y, dir.x);

    // Compact support: the node is exactly zero beyond its radius, so the
    // artist's gizmo and the effect it drives are the same size on screen.
    // A soft exponential tail made every node bleed across the whole frame.
    float x = dist / r;
    if (x >= 1.0) continue;
    float f = pow(1.0 - x, max(B.y, 0.4));

    float s = A.z;
    int kind = int(B.x + 0.5);
    float k = 0.26;

    if (kind == 0) {
      uv -= dir * s * f * k;                                  // attract
    } else if (kind == 1) {
      uv += dir * s * f * k;                                  // repel
    } else if (kind == 2) {
      uv = A.xy + rot2(s * f * 2.6) * (uv - A.xy);            // vortex
    } else if (kind == 3) {
      uv -= dir * abs(s) * f * k * 1.5;                       // sink
      uv += tang * s * f * k * 0.25;
    } else if (kind == 4) {
      uv += tang * s * f * k * 1.3;                           // shear
    } else if (kind == 5) {
      uv += dir * s * f * k * 1.7;                            // burst
    } else if (kind == 6) {
      float wave = sin(dist * 22.0 - uTime * 2.4 * uEvolutionSpeed);
      uv += dir * wave * s * f * 0.12;                        // ripple
    } else if (kind == 7) {
      vec2 target = normalize(tang + dir * 0.15);
      uv += (target - dir) * s * f * k * 0.9;                 // magnet
    }
    // kind == 8 (source) has no displacement — it only adds matter

    tint += uNodeColor[i] * f * B.z;
    tintAmt += f * B.z;
  }
  return uv;
}

/** Extra density contributed by `source` nodes. */
float nodeEmission(vec2 uv) {
  float e = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNodeCount) break;
    vec4 A = uNodeA[i];
    vec4 B = uNodeB[i];
    if (B.w < 0.5) continue;
    if (int(B.x + 0.5) != 8) continue;
    float x = length(uv - A.xy) / max(A.w, 1e-4);
    if (x >= 1.0) continue;
    e += pow(1.0 - x, max(B.y, 0.4)) * abs(A.z) * 1.6;
  }
  return e;
}

/* ------------------------------ flow field ------------------------------ */
vec2 flowWarp(vec2 uv, float t) {
  vec2 w = uv;

  for (int i = 0; i < 3; i++) {
    if (float(i) >= uWarpIterations) break;
    float fi = float(i);
    float scale = uTurbulenceScale * mix(0.55, 1.35, fi / 2.0);
    vec2 c = curl2(w * scale + vec2(uSeed * 0.37 + t * 0.18 * (fi + 1.0)));
    w += c * uCurlIntensity * mix(0.22, 0.10, fi / 2.0);
  }

  w.x += w.y * uShear * 0.6;
  w = rot2(uVorticity * 0.45) * w;

  return w;
}

/* ======================= pattern archetypes ======================= */
/* Each returns vec3(density, filament, paletteT) */

/* 0 · Braid — two masses weaving through each other */
vec3 patBraid(vec2 w, float z, float t) {
  float phase = t * 0.55 + uSeed * 6.2831853;
  float ampMod = 0.72 + 0.55 * fbm(vec3(w.y * 0.85, uSeed * 1.7, t * 0.19), 2);

  float braid = (sin(w.y * 2.35 + phase) * 0.115
               + sin(w.y * 5.10 - phase * 1.31) * 0.055
               + sin(w.y * 0.91 + phase * 0.43) * 0.085) * ampMod;

  float swap = sin(w.y * 1.35 + phase * 0.71) * max(uTwist, 0.0) * 0.30;
  float sep = 0.055 * (1.0 - 0.6 * min(uTwist, 1.0));

  float lnA = fbm(vec3(w * 1.7, uSeed + t * 0.35), 3) * 0.20;
  float lnB = fbm(vec3(w * 1.7 + 23.7, uSeed + t * 0.35), 3) * 0.20;

  float dA = abs(w.x - (braid + swap + sep) + lnA);
  float dB = abs(w.x + (braid + swap + sep) + lnB);

  float k = 8.0 + uSharpness * 9.0;
  float coreA = exp(-pow(dA * k, 1.85));
  float coreB = exp(-pow(dB * k, 1.85));
  float haloA = exp(-pow(dA * 4.6, 1.4)) * 0.035;
  float haloB = exp(-pow(dB * 4.6, 1.4)) * 0.035;

  float smoke = fbm(vec3(w * 1.25 + (z - 0.5) * 0.3, z * 1.9 + uSeed * 3.1 + t * 0.30), 2) * 0.5 + 0.5;
  smoke = smoothstep(0.30 + uSparsity * 0.45, 0.92, smoke);

  float aA = (coreA + haloA) * smoke;
  float aB = (coreB + haloB) * smoke;

  float weave = smoothstep(0.0, 1.0, z + 0.28 * sin(w.y * 3.1 + phase));
  aA *= mix(1.0, 0.30, weave);
  aB *= mix(1.0, 0.30, 1.0 - weave);

  vec3 fp = vec3(w * (2.10 + uZigzag * 0.35), z * 2.6 + phase * 0.5);
  fp.x += uZigzag * 0.60 * abs(sin(w.y * 3.7 + phase * 0.9));
  fp.y += uZigzag * 0.42 * abs(sin(w.x * 4.3 - phase * 0.7));
  float fil = smoothstep(0.34, 0.94, ridged(fp, 4, uFilamentSharp)) * max(coreA, coreB);

  float pt = 0.5 + 0.5 * (aB - aA) / max(aA + aB, 1e-4);
  return vec3(aA + aB, fil, pt);
}

/* 1 · Threads — scattered fibre bundles drifting through the field */
vec3 patThreads(vec2 w, float z, float t) {
  float phase = t * 0.6 + uSeed * 6.2831853;

  float wander = fbm(vec3(w * 1.4, z * 0.7 + phase * 0.35), 3);
  float lane = w.x * max(uThreadCount, 1.0) + wander * uThreadSpread * 6.0 + w.y * uShear * 2.0;

  float d = abs(fract(lane) - 0.5) * 2.0;
  float strand = exp(-pow(d * (3.0 + uSharpness * 4.0), 1.7));

  float id = floor(lane);
  float rnd = hash11(id * 1.7 + uSeed * 0.13);

  float presence = step(uSparsity * 0.85, rnd + 0.25 * fbm(vec3(w.y * 3.0, id, phase), 2));
  strand *= presence;

  float depth = fbm(vec3(w * 0.9 + id, z * 1.4 + phase * 0.2), 2) * 0.5 + 0.5;
  float thick = mix(0.35, 1.0, depth);

  return vec3(strand * thick * 1.3, strand * presence * 1.6, rnd);
}

/* 2 · Vortex — spiral arms around a gravity well */
vec3 patVortex(vec2 w, float z, float t) {
  float phase = t * 0.5 + uSeed * 6.2831853;
  float r = length(w) + 0.04;
  float a = atan(w.y, w.x);

  float arms = max(uBandFreq, 2.0);
  float spiral = sin(a * arms + log(r) * max(uTwist, 0.05) * 11.0 - phase * 1.3);
  float armMask = pow(clamp(spiral * 0.5 + 0.5, 0.0, 1.0), 1.0 + uSharpness * 2.2);

  float wobble = fbm(vec3(cos(a) * 1.6, sin(a) * 1.6, z * 1.2 + phase * 0.4), 3) * 0.35;
  float radial = exp(-pow(r * (2.2 - uSparsity * 1.2), 1.35));
  float core = exp(-pow(r * (14.0 + uSharpness * 6.0), 2.0)) * 1.4;

  float noise = fbm(vec3(w * 3.0, z * 2.0 + phase * 0.6), 3) * 0.5 + 0.5;
  noise = smoothstep(0.25 + uSparsity * 0.5, 0.95, noise);

  float density = (armMask * radial + core) * noise * (1.0 + wobble);
  float fil = pow(clamp(spiral * 0.5 + 0.5, 0.0, 1.0), 6.0 + uFilamentSharp * 2.0) * radial * 2.4;
  float pt = 0.5 + 0.5 * sin(a * 2.0 + phase);
  return vec3(density, fil, pt);
}

/* 3 · Lattice — crossed waves, moiré and woven grids */
vec3 patLattice(vec2 w, float z, float t) {
  float phase = t * 0.35 + uSeed * 6.2831853;
  float f = max(uBandFreq, 1.0) * 0.55;

  float ax = sin(w.x * f * 3.14 + phase * 0.7);
  float ay = sin(w.y * f * 3.55 - phase * 0.5);
  float aw = sin((w.x + w.y) * f * 2.20 + phase * 0.4);
  float aw2 = sin((w.x - w.y * 1.3) * f * 1.76 - phase * 0.6);

  float grid = pow(clamp(abs(ax * ay) * 0.5 + abs(aw * aw2) * 0.5, 0.0, 1.0),
                   1.0 + uSharpness * 2.6);

  float lanes = abs(fract(w.x * max(uThreadCount, 1.0)) - 0.5)
              + abs(fract(w.y * max(uThreadCount, 1.0) * 0.72) - 0.5);
  float weave = exp(-pow(lanes * (2.0 + uSharpness * 3.0), 1.8));

  float depth = fbm(vec3(w * 0.8, z * 1.3 + phase * 0.2), 2) * 0.5 + 0.5;
  float density = mix(grid, weave, 0.45 + 0.3 * depth);
  density *= smoothstep(uSparsity * 0.9, 1.0, depth + 0.25);

  float pt = fract(0.5 + (ax + ay) * 0.25);
  return vec3(density * 1.3, weave * 1.3, pt);
}

/* 4 · Rift — a torn seam leaking energy */
vec3 patRift(vec2 w, float z, float t) {
  float phase = t * 0.4 + uSeed * 6.2831853;

  float seam = fbm(vec3(w.y * 2.2, uSeed * 1.3, phase * 0.25), 4) * 0.30;
  seam += fbm(vec3(w.y * 6.0, uSeed, phase * 0.6), 2) * 0.06 * uZigzag;

  float d = abs(w.x - seam);
  float k = 8.0 + uBandFreq * 6.0 + uSharpness * 10.0;

  float thin = exp(-pow(d * k, 2.0));
  float bleed = exp(-pow(d * (2.0 + uSparsity * 3.0), 1.25)) * 0.35;

  float seg = fbm(vec3(w.y * 3.4, phase * 0.5, uSeed), 3) * 0.5 + 0.5;
  seg = smoothstep(0.20 + uSparsity * 0.6, 0.9, seg);

  float fil = smoothstep(0.30, 0.95, ridged(vec3(w * 2.4, phase * 0.5), 4, uFilamentSharp));
  fil *= exp(-pow(d * 9.0, 1.6));

  float density = (thin + bleed) * mix(1.0, seg, 0.65);
  float pt = clamp(1.0 - d * 3.2, 0.0, 1.0);
  return vec3(density * 1.4, fil * 2.0, pt);
}

/* 5 · Nebula — volumetric clouds colliding */
vec3 patNebula(vec2 w, float z, float t) {
  float phase = t * 0.3 + uSeed * 6.2831853;

  float n1 = fbm(vec3(w * 1.05, z * 0.8 + phase * 0.25), 4);
  float n2 = fbm(vec3(w * 2.15 + 11.0, z * 1.6 - phase * 0.2), 3);
  float n3 = fbm(vec3(w * 4.2 - 5.0, z * 2.4 + phase * 0.4), 2);

  float d = n1 * 0.58 + n2 * 0.30 + n3 * 0.12;

  float col = abs(w.x + n1 * 0.35);
  float collide = exp(-pow(col * (2.0 + uSharpness * 2.0), 1.6));

  float cloud = smoothstep(0.18 + uSparsity * 0.5, 0.95, d * 0.5 + 0.5);
  float fil = smoothstep(0.55, 0.98, ridged(vec3(w * 2.6, z * 2.0 + phase), 3, uFilamentSharp));

  float pt = clamp(0.5 + n2 * 0.9, 0.0, 1.0);
  return vec3(cloud * (0.55 + 0.9 * collide) * 1.3, fil * collide * 1.2, pt);
}

/* 6 · Storm — discharges and branching arcs */
vec3 patStorm(vec2 w, float z, float t) {
  float phase = t * 0.7 + uSeed * 6.2831853;

  float channel = sin(w.y * 3.1 + phase * 0.8) * 0.16
                + sin(w.y * 7.3 - phase * 1.1) * 0.07;
  channel += fbm(vec3(w.y * 2.0, uSeed, phase * 0.3), 3) * 0.22;

  vec3 fp = vec3(w * (2.6 + uZigzag * 0.7), z * 3.0 + phase);
  fp.x += uZigzag * 1.15 * abs(sin(w.y * 5.1 + phase * 1.1));
  fp.y += uZigzag * 0.85 * abs(sin(w.x * 6.7 - phase * 0.9));

  // a hard threshold keeps the arcs thin filaments instead of a soft haze
  float fil = smoothstep(0.46, 0.97, ridged(fp, 5, uFilamentSharp));

  float core = exp(-pow(abs(w.x - channel) * (3.0 + uSharpness * 3.0), 1.5));
  float branch = fil * exp(-abs(w.x - channel) * 1.6) * 1.8;

  return vec3(fil * core * 0.5, (fil * core * 1.4 + branch) * 1.4, 0.4 + 0.6 * fil);
}

/* 7 · Shockwave — radial shells and outward bursts */
vec3 patShock(vec2 w, float z, float t) {
  float phase = t * 0.55 + uSeed * 6.2831853;
  float r = length(w);
  float a = atan(w.y, w.x);

  float wob = fbm(vec3(cos(a) * 2.2, sin(a) * 2.2, phase * 0.4), 3);

  // enough periods across the frame that the shells actually read as rings
  float rad = (r + wob * 0.10 * uZigzag) * max(uBandFreq, 1.0) * 5.0;
  float shellRaw = 0.5 + 0.5 * sin(rad - phase * 2.6);
  float shell = pow(shellRaw, 1.0 + uSharpness * 1.2);
  float halo = shellRaw * 0.5;

  float decay = exp(-r * (0.9 + uSparsity * 0.9));
  float core = exp(-pow(r * 7.0, 2.0)) * 1.5;

  float gr = ridged(vec3(w * 2.2, z * 2.0 + phase * 0.5), 3, uFilamentSharp);
  float streak = smoothstep(0.45, 0.95, gr) * decay;

  return vec3(((shell + halo) * decay + core) * (0.75 + 0.6 * streak) * 1.6,
              streak * shell * 2.0,
              clamp(r * 2.0, 0.0, 1.0));
}

/* 8 · Crystal — hard-edged faceted cells */
vec3 patCrystal(vec2 w, float z, float t) {
  float phase = t * 0.25 + uSeed * 6.2831853;
  float scale = max(uThreadCount, 2.0) * 0.7;

  vec2 p = w * scale + vec2(phase * 0.15, -phase * 0.11);
  vec2 n = floor(p);
  vec2 f = fract(p);

  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      o = 0.5 + 0.5 * sin(phase * 0.7 + 6.2831 * o + z * 1.3);
      vec2 r = g + o - f;
      float dd = dot(r, r);
      if (dd < f1) {
        f2 = f1;
        f1 = dd;
        id = hash21(n + g);
      } else if (dd < f2) {
        f2 = dd;
      }
    }
  }

  float edge = sqrt(f2) - sqrt(f1);
  float cell = exp(-pow(edge * (3.0 + uSharpness * 6.0), 1.1));
  float border = exp(-pow(edge * (12.0 + uFilamentSharp * 4.0), 2.0));

  float keep = step(uSparsity * 0.7, id);
  float depth = fbm(vec3(w * 1.4, z * 1.1 + phase * 0.3), 2) * 0.5 + 0.5;

  return vec3(cell * keep * (0.6 + 0.7 * depth) * 1.3, border * keep * 1.4, id);
}

vec3 evalPattern(int id, vec2 w, float z, float t) {
  if (id == 1) return patThreads(w, z, t);
  if (id == 2) return patVortex(w, z, t);
  if (id == 3) return patLattice(w, z, t);
  if (id == 4) return patRift(w, z, t);
  if (id == 5) return patNebula(w, z, t);
  if (id == 6) return patStorm(w, z, t);
  if (id == 7) return patShock(w, z, t);
  if (id == 8) return patCrystal(w, z, t);
  return patBraid(w, z, t);
}

/* --------------------------------- main --------------------------------- */
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uResolution) / uResolution.y;

  uv.x *= (1.0 + uCompression * 0.75);
  uv.y *= (1.0 - uCompression * 0.35);

  vec3 tint;
  float tintAmt;
  uv = applyNodes(uv, tint, tintAmt);

  float t = uTime * uEvolutionSpeed;
  float phase = t * 0.55 + uSeed * 6.2831853;

  // global orientation: rotate the whole field, then optionally mirror it
  uv = rot2(uDirection * PI) * uv;
  uv.x = mix(uv.x, abs(uv.x), clamp(uMirror, 0.0, 1.0));

  vec2 w = flowWarp(uv, t);

  float src = nodeEmission(uv);

  float stepsF = max(uSteps, 8.0);
  float dz = 1.0 / stepsF;
  float mixAmt = clamp(uMix, 0.0, 1.0);

  vec3 tintCol = tint / max(tintAmt, 1e-4);
  float tintW = clamp(tintAmt, 0.0, 1.0);

  vec3 accum = vec3(0.0);
  float transmit = 1.0;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (float(i) >= stepsF) break;

    float z = (float(i) + 0.5) * dz;

    vec3 P = evalPattern(uPattern, w, z, t);
    if (mixAmt > 0.001) {
      vec3 Q = evalPattern(uMixPattern, w, z, t);
      P = mix(P, Q, mixAmt);
    }

    float density = P.x + src * 0.35;
    float fil = P.y;
    float pt = P.z;

    // --- palette position -------------------------------------------------
    float base;
    if (uPaletteMode == 1) {
      base = length(w) * 2.2;
    } else if (uPaletteMode == 2) {
      base = z;
    } else if (uPaletteMode == 3) {
      base = fbm(vec3(w * 1.1, z * 0.6 + phase * 0.2), 2) * 0.5 + 0.5;
    } else if (uPaletteMode == 4) {
      base = 0.5 - uv.y;
    } else {
      base = pt * 0.86 + length(w) * 0.14 + z * 0.12;
    }
    base += uHueShift + uTime * uColorCycle * 0.15;

    vec3 auraCol = paletteAt(base);
    // node tint paints its own region, then saturation is applied last
    auraCol = mix(auraCol, tintCol, tintW);
    float luma = dot(auraCol, vec3(0.2126, 0.7152, 0.0722));
    auraCol = mix(vec3(luma), auraCol, uSaturation);

    float smoke = smoothstep(0.34, 1.05, density);
    float dens = smoke * uSmokeDensity * dz * 1.9;
    float filAdd = max(fil, 0.0) * uGlow * dz * 1.5;

    vec3 emission = auraCol * dens;
    emission += mix(auraCol, vec3(1.0), 0.25 * clamp(fil, 0.0, 1.0)) * filAdd;
    emission *= mix(1.0, 0.45, z);

    accum += emission * transmit;
    transmit *= 1.0 - clamp(dens + filAdd, 0.0, 0.90) * 0.62;
    if (transmit < 0.006) break;
  }

  vec3 col = accum * uExposure;

  // --- ash / sparks --------------------------------------------------------
  if (uScatter > 0.5) {
    float dens01 = clamp(uScatter / 400.0, 0.0, 1.0);
    vec2 g = w * (26.0 + uScatter * 0.05);
    vec2 id = floor(g);
    vec2 fr = fract(g) - 0.5;
    float h = hash21(id + uSeed * 13.7);

    if (h > 1.0 - dens01 * 0.45) {
      vec2 s = fr;
      if (uTrail > 0.01) {
        vec2 dir = curl2(w * 3.0);
        s -= dir * uTrail * 0.45;
        s /= vec2(1.0, 1.0 + uTrail * 3.0);
      }
      float size = 0.18 / max(uSparkSize, 0.1);
      float sparkle = 1.0 - smoothstep(0.0, size, length(s));
      float twinkle = 0.35 + 0.65 * sin(t * 3.1 + h * 62.8);
      vec3 sparkCol = mix(paletteAt(fract(h * 3.0)), vec3(1.0), 0.5);
      col += sparkCol * sparkle * twinkle * uGlow * 0.9;
    }
  }

  // --- background ----------------------------------------------------------
  float vign = 1.0 - 0.55 * dot(uv, uv) * 2.2;
  col += vec3(1.0 - uBgDark) * 0.045 * clamp(vign, 0.0, 1.0);

  fragColor = vec4(max(col, 0.0), 1.0);
}
