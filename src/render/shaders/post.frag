#version 300 es
/*
 * AuraForge — post chain
 * ------------------------------------------------------------------
 *  Runs on the raw radiance produced by aura.frag. Keeping bloom, chroma
 *  aberration, tonemapping, posterize, scanlines, grain and the vignette in a
 *  separate full-screen pass means the volume shader stays one concentration
 *  of expensive noise work and every look adjustment costs a few texture taps.
 * ------------------------------------------------------------------
 */
precision highp float;

out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2  uResolution;
uniform float uTime;

uniform float uBloom;
uniform float uChroma;
uniform float uVignette;
uniform float uPosterize;
uniform float uScanlines;
uniform float uGrain;
uniform float uGrainSize;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 texel = 1.0 / uResolution;

  // --- scene sample, with a little chromatic separation ------------------
  vec2 dir = uv - 0.5;
  float amt = uChroma * 0.014 * length(dir);
  vec3 col;
  if (amt > 0.00001) {
    col.r = texture(uScene, uv - dir * amt).r;
    col.g = texture(uScene, uv).g;
    col.b = texture(uScene, uv + dir * amt).b;
  } else {
    col = texture(uScene, uv).rgb;
  }

  // --- bloom: a bright pass sampled on two rings --------------------------
  if (uBloom > 0.001) {
    vec3 bl = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 0.3926991;
      float ring = 3.0 + mod(float(i), 4.0) * 5.0;
      vec2 o = vec2(cos(a) * ring * texel.x * 0.7, sin(a) * ring * texel.y);
      vec3 s = texture(uScene, uv + o).rgb;
      bl += max(s - 0.35, 0.0);
    }
    col += (bl / 16.0) * uBloom * 2.2;
  }

  // --- tonemap ------------------------------------------------------------
  col = 1.0 - exp(-col * 1.25);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  // crush the floor so the ground stays properly black
  col = clamp((col - 0.006) / 0.994, 0.0, 1.0);

  // --- posterize ----------------------------------------------------------
  if (uPosterize >= 2.0) {
    float levels = uPosterize;
    col = floor(col * levels + 0.5) / levels;
  }

  // --- scanlines ----------------------------------------------------------
  if (uScanlines > 0.001) {
    float s = sin(uv.y * uResolution.y * 1.5708);
    col *= 1.0 - uScanlines * 0.35 * (0.5 + 0.5 * s);
  }

  // --- vignette -----------------------------------------------------------
  if (uVignette > 0.001) {
    float r = length((uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0));
    float v = smoothstep(0.85, 0.25, r);
    col *= mix(1.0, v, uVignette);
  }

  // --- film grain ---------------------------------------------------------
  if (uGrain > 0.0) {
    vec2 gp = floor(gl_FragCoord.xy / max(uGrainSize, 0.25));
    float g1 = hash21(gp + vec2(uTime * 91.7, uTime * 47.3));
    float g2 = hash21(gp * 0.5 + vec2(uTime * 13.1, uTime * 77.9));
    float grain = (g1 * 0.65 + g2 * 0.35) - 0.5;
    col += grain * uGrain * 0.16;
    col.r += (hash21(gp + 11.0) - 0.5) * uGrain * 0.03;
    col.b += (hash21(gp + 27.0) - 0.5) * uGrain * 0.03;
  }

  // --- ordered dither: 8-bit output bands badly after a gamma ramp --------
  float d = hash21(gl_FragCoord.xy * 0.7 + 3.1) - 0.5;
  col += d / 255.0;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
