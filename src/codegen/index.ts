import fragSrc from '../render/shaders/aura.frag?raw';
import {
  AuraNode,
  AuraParams,
  NODE_KIND_INDEX,
  PALETTE_MODE_INDEX,
  PATTERN_INDEX,
  hexToRgb,
} from '../render/types';

/* ============================================================================
 * Live code generator.
 *
 * The exported GLSL is not a paraphrase of the studio — it is the studio's own
 * fragment shader with every parameter baked in as a `const`, the palette
 * folded into a `paletteStop()` chain, the node loops unrolled to constant
 * indices and per-node behaviour resolved. That is what makes the copy-pasteable
 * output reproduce the frame you are looking at, and what lets the same source
 * compile as GLSL ES 1.00 for p5.js.
 * ========================================================================== */

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1920;

function f(n: number): string {
  if (!Number.isFinite(n)) return '0.0';
  const s = n.toFixed(6).replace(/0+$/, '');
  return s.endsWith('.') ? `${s}0` : s;
}

function vec3Literal(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `vec3(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** Uniforms the host still has to supply after baking. */
const HOST_UNIFORMS = new Set(['uResolution', 'uTime']);

/* --------------------------- uniform baking --------------------------- */

function bakeUniforms(src: string, params: AuraParams): string {
  const values: Record<string, string> = {
    uSeed: f(params.seed),
    uPattern: String(PATTERN_INDEX[params.pattern] ?? 0),
    uMixPattern: String(PATTERN_INDEX[params.mixPattern] ?? 0),
    uMix: f(params.mix),

    uTurbulenceScale: f(params.turbulenceScale),
    uCurlIntensity: f(params.curlIntensity),
    uZigzag: f(params.zigzag),
    uCompression: f(params.compression),
    uEvolutionSpeed: f(params.evolutionSpeed),
    uWarpIterations: f(params.warpIterations),
    uShear: f(params.shear),
    uVorticity: f(params.vorticity),
    uDirection: f(params.direction),
    uMirror: f(params.mirror),

    uThreadCount: f(params.threadCount),
    uThreadSpread: f(params.threadSpread),
    uSharpness: f(params.sharpness),
    uBandFreq: f(params.bandFreq),
    uTwist: f(params.twist),
    uSparsity: f(params.sparsity),

    uSmokeDensity: f(params.smokeDensity),
    uFilamentSharp: f(params.filamentSharp),
    uGlow: f(params.glow),
    uSteps: f(params.steps),
    uScatter: f(params.scatter),
    uSparkSize: f(params.sparkSize),
    uTrail: f(params.trail),

    uPaletteStops: String(Math.max(2, Math.min(params.palette.length, 5))),
    uPaletteMode: String(PALETTE_MODE_INDEX[params.paletteMode] ?? 0),
    uHueShift: f(params.hueShift),
    uColorCycle: f(params.colorCycle),
    uSaturation: f(params.saturation),
    uExposure: f(params.exposure),
    uBgDark: f(params.bgDark),
  };

  const lines = src.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    // the node uniforms are replaced by the unrolled bodies below
    if (/^uniform\s+\w+\s+uNode(A|B|Color|Count)/.test(line)) continue;
    // the palette becomes a paletteStop() chain
    if (/^uniform\s+vec3\s+uPalette\s*\[/.test(line)) continue;

    const m = line.match(/^uniform\s+(vec2|vec3|vec4|float|int)\s+(u\w+)\s*(\[[^\]]*\])?\s*;(.*)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const [, type, name, , tail] = m;
    if (HOST_UNIFORMS.has(name)) {
      out.push(line);
      continue;
    }
    const value = values[name];
    if (value === undefined) {
      out.push(line);
      continue;
    }
    out.push(`const ${type} ${name} = ${value};${tail}`);
  }

  return out.join('\n');
}

/** Frozen palette as a constant-index chain (array constructors are ES 3.00 only). */
function paletteFunction(params: AuraParams): string {
  const stops = params.palette.slice(0, 5);
  while (stops.length < 5) stops.push(stops[stops.length - 1] ?? '#000000');
  const body = stops
    .map((hex, i) => `  if (i == ${i}) return ${vec3Literal(hex)};`)
    .join('\n');
  return [
    '// The exported palette, frozen. Constant indices only — GLSL ES 1.00 cannot',
    '// index arrays with a variable, and this also keeps p5.js happy.',
    'vec3 paletteStop(int i) {',
    body,
    `  return ${vec3Literal(stops[4])};`,
    '}',
  ].join('\n');
}

/* ----------------------------- node unrolling ----------------------------- */

function nodeDisplacement(n: AuraNode, x: string, y: string, s: string): string {
  const kind = NODE_KIND_INDEX[n.kind] ?? 0;
  switch (kind) {
    case 0:
      return `      uv -= dir * ${s} * f * k;`;
    case 1:
      return `      uv += dir * ${s} * f * k;`;
    case 2:
      return `      uv = vec2(${x}, ${y}) + rot2(${s} * f * 2.6) * (uv - vec2(${x}, ${y}));`;
    case 3:
      return [
        `      uv -= dir * abs(${s}) * f * k * 1.5;`,
        `      uv += tang * ${s} * f * k * 0.25;`,
      ].join('\n');
    case 4:
      return `      uv += tang * ${s} * f * k * 1.3;`;
    case 5:
      return `      uv += dir * ${s} * f * k * 1.7;`;
    case 6:
      return `      uv += dir * sin(dist * 22.0 - uTime * 2.4 * uEvolutionSpeed) * ${s} * f * 0.12;`;
    case 7:
      return [
        `      vec2 target = normalize(tang + dir * 0.15);`,
        `      uv += (target - dir) * ${s} * f * k * 0.9;`,
      ].join('\n');
    default:
      return `      // source: no displacement`;
  }
}

function unrollNodes(src: string, params: AuraParams, nodes: AuraNode[]): string {
  const withCompression = nodes.map((n) => ({
    ...n,
    x: n.x * (1 + params.compression * 0.75),
    y: n.y * (1 - params.compression * 0.35),
  }));

  // --- applyNodes -------------------------------------------------------
  const markers = src.match(/vec2 applyNodes\([^)]*\) \{/);
  if (markers) {
    const start = src.indexOf(markers[0]);
    const end = src.indexOf('\n}', start);
    if (start >= 0 && end >= 0) {
      const body = withCompression
        .filter((n) => n.enabled)
        .map((n) => {
          const x = f(n.x);
          const y = f(n.y);
          const r = f(Math.max(n.radius, 1e-4));
          const fall = f(Math.max(n.falloff, 0.4));
          const s = f(n.strength);
          const [cr, cg, cb] = hexToRgb(n.color);
          const cm = f(n.colorMix);
          return [
            '  {',
            `    vec2 d = uv - vec2(${x}, ${y});`,
            '    float dist = length(d) + 1e-5;',
            '    vec2 dir = d / dist;',
            '    vec2 tang = vec2(-dir.y, dir.x);',
            '    float k = 0.26;',
            `    float xr = dist / ${r};`,
            '    if (xr < 1.0) {',
            `      float f = pow(1.0 - xr, ${fall});`,
            nodeDisplacement(n, x, y, s),
            `      tint += vec3(${f(cr)}, ${f(cg)}, ${f(cb)}) * f * ${cm};`,
            `      tintAmt += f * ${cm};`,
            '    }',
            '  }',
          ].join('\n');
        })
        .join('\n');
      const replacement = `${markers[0]}\n${body || '  // no active nodes'}\n  return uv;\n}`;
      src = src.slice(0, start) + replacement + src.slice(end + 2);
    }
  }

  // --- nodeEmission -----------------------------------------------------
  const emitMarker = src.match(/float nodeEmission\(vec2 uv\) \{/);
  if (emitMarker) {
    const start = src.indexOf(emitMarker[0]);
    const end = src.indexOf('\n}', start);
    if (start >= 0 && end >= 0) {
      const body = withCompression
        .filter((n) => n.enabled && (NODE_KIND_INDEX[n.kind] ?? 0) === 8)
        .map((n) => {
          const x = f(n.x);
          const y = f(n.y);
          const r = f(Math.max(n.radius, 1e-4));
          const fall = f(Math.max(n.falloff, 0.4));
          return [
            '  {',
            `    float xr = length(uv - vec2(${x}, ${y})) / ${r};`,
            '    if (xr < 1.0) {',
            `      e += pow(1.0 - xr, ${fall}) * ${f(Math.abs(n.strength))} * 1.6;`,
            '    }',
            '  }',
          ].join('\n');
        })
        .join('\n');
      const replacement = `${emitMarker[0]}\n  float e = 0.0;\n${body || '  // no source nodes'}\n  return e;\n}`;
      src = src.slice(0, start) + replacement + src.slice(end + 2);
    }
  }

  return src;
}

const BANNER = (params: AuraParams, nodes: AuraNode[]) => `/*
 * AuraForge — exported aura field
 * pattern "${params.pattern}"${params.mix > 0.01 ? ` crossfaded ${Math.round(params.mix * 100)}% towards "${params.mixPattern}"` : ''}
 * seed ${params.seed} · ${nodes.filter((n) => n.enabled).length} active node(s)
 *
 * Every parameter, the palette and the canvas nodes are baked in as constants,
 * so this reproduces the frame the studio was showing. The host only supplies:
 *
 *   uniform vec2  uResolution;   // render target size in pixels
 *   uniform float uTime;         // seconds
 *
 * and draws a fullscreen quad. Stepping uTime reproduces the animation.
 */`;

/** The studio's own fragment shader, frozen at the current parameter values. */
export function generateGlsl(params: AuraParams, nodes: AuraNode[]): string {
  let src = fragSrc;
  src = unrollNodes(src, params, nodes);
  src = bakeUniforms(src, params);
  src = src.replace(/uPalette\s*\[([^\]]+)\]/g, 'paletteStop($1)');

  const palette = paletteFunction(params);
  const versionAt = src.indexOf('#version');
  const rest = versionAt >= 0 ? src.slice(versionAt).replace(/^#version[^\n]*\n/, '') : src;
  // paletteStop() has to be defined before paletteAt() uses it
  const withPalette = rest.replace(
    /\/\* -+ palette -+ \*\//,
    (m) => `${m}\n\n${palette}`,
  );
  return `#version 300 es\n${BANNER(params, nodes)}\n\n${withPalette}`;
}

/**
 * GLSL ES 1.00 flavour: p5.js runs user shaders as ES 1.00, so drop the version
 * directive and write to gl_FragColor. Nothing else changes — the fragment
 * shader uses gl_FragCoord, which exists in both versions.
 */
function toEs100(src: string): string {
  return src
    .replace(/^#version 300 es\s*$/m, '')
    .replace(/^out vec4 fragColor;\s*$/m, '')
    .replace(/\bfragColor\b/g, 'gl_FragColor');
}

const P5_VERTEX = `precision highp float;

attribute vec3 aPosition;
attribute vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  vec4 position = vec4(aPosition, 1.0);
  // p5's quad arrives in 0..1 space; expand it to clip space
  position.xy = position.xy * 2.0 - 1.0;
  gl_Position = uProjectionMatrix * uModelViewMatrix * position;
}`;

/**
 * Wraps GLSL in a JS template literal so the generated sketch stays readable —
 * a JSON.stringify'd one-liner compiles just as well but is unusable to read.
 */
function toTemplateLiteral(src: string): string {
  const escaped = src
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  return `\`${escaped}\``;
}

/** Complete, runnable p5.js sketch driven by the current slider values. */
export function generateP5(
  params: AuraParams,
  nodes: AuraNode[],
  size?: [number, number],
): string {
  const frag = toEs100(generateGlsl(params, nodes));
  const W = size ? size[0] : EXPORT_WIDTH;
  const H = size ? size[1] : EXPORT_HEIGHT;
  const ratio = `${(W / H).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}:1`;

  return `// AuraForge — p5.js export (pattern "${params.pattern}", seed ${params.seed})
// Drop this into the p5 web editor as-is. Canvas ${W}x${H} (${ratio}).
// The fragment shader below is the studio's own, frozen at the exported values.

const W = ${W};
const H = ${H};

const VERT = ${toTemplateLiteral(P5_VERTEX)};

const FRAG = ${toTemplateLiteral(frag)};

let theShader;

function setup() {
  createCanvas(W, H, WEBGL);
  noStroke();
  theShader = createShader(VERT, FRAG);
  // reproduce the studio frame rate exactly
  frameRate(60);
}

function draw() {
  shader(theShader);
  theShader.setUniform('uResolution', [width, height]);
  theShader.setUniform('uTime', millis() / 1000.0);
  // WEBGL mode centres the origin, so the quad spans -W/2..W/2
  rect(-width / 2, -height / 2, width, height);
}
`;
}

export type CodeTarget = 'p5' | 'glsl';

export function generate(
  target: CodeTarget,
  params: AuraParams,
  nodes: AuraNode[],
  size?: [number, number],
): string {
  return target === 'p5' ? generateP5(params, nodes, size) : generateGlsl(params, nodes);
}
