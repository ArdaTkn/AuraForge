import vertSrc from './shaders/fullscreen.vert?raw';
import auraSrc from './shaders/aura.frag?raw';
import postSrc from './shaders/post.frag?raw';
import {
  AuraNode,
  AuraParams,
  MAX_NODES,
  MAX_PALETTE_STOPS,
  NODE_KIND_INDEX,
  PALETTE_MODE_INDEX,
  PATTERN_INDEX,
  hexToRgb,
} from './types';

/** Preview drawing-buffer height ceiling (px). Export always renders 1080x1920. */
const PREVIEW_MAX_HEIGHT = 820;

const AURA_UNIFORMS = [
  'uResolution',
  'uTime',
  'uSeed',
  'uPattern',
  'uMixPattern',
  'uMix',
  'uTurbulenceScale',
  'uCurlIntensity',
  'uZigzag',
  'uCompression',
  'uEvolutionSpeed',
  'uWarpIterations',
  'uShear',
  'uVorticity',
  'uDirection',
  'uMirror',
  'uThreadCount',
  'uThreadSpread',
  'uSharpness',
  'uBandFreq',
  'uTwist',
  'uSparsity',
  'uSmokeDensity',
  'uFilamentSharp',
  'uGlow',
  'uSteps',
  'uScatter',
  'uSparkSize',
  'uTrail',
  'uPalette',
  'uPaletteStops',
  'uPaletteMode',
  'uHueShift',
  'uColorCycle',
  'uSaturation',
  'uExposure',
  'uBgDark',
  'uNodeCount',
  'uNodeA',
  'uNodeB',
  'uNodeColor',
] as const;

const POST_UNIFORMS = [
  'uScene',
  'uResolution',
  'uTime',
  'uBloom',
  'uChroma',
  'uVignette',
  'uPosterize',
  'uScanlines',
  'uGrain',
  'uGrainSize',
] as const;

type AuraUniformName = (typeof AURA_UNIFORMS)[number];
type PostUniformName = (typeof POST_UNIFORMS)[number];

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
}

export class AuraRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private auraProgram: WebGLProgram;
  private postProgram: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private auraU: Record<AuraUniformName, WebGLUniformLocation | null>;
  private postU: Record<PostUniformName, WebGLUniformLocation | null>;

  /** true when RGBA16F render targets are available — keeps bloom in HDR */
  private hdr: boolean;

  private scene: Target | null = null;
  private out: Target | null = null;
  private readback: Uint8Array | null = null;

  private nodeA = new Float32Array(MAX_NODES * 4);
  private nodeB = new Float32Array(MAX_NODES * 4);
  private nodeColor = new Float32Array(MAX_NODES * 3);
  private paletteBuf = new Float32Array(MAX_PALETTE_STOPS * 3);

  private dprCap = 2;
  private disposed = false;
  private emaFrameMs = 16.7;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error(
        'WebGL2 is not available in this environment. AuraForge requires a WebGL2-capable GPU.',
      );
    }
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');

    this.auraProgram = this.link(auraSrc, 'aura.frag');
    this.postProgram = this.link(postSrc, 'post.frag');

    const unit = gl.createVertexArray();
    if (!unit) throw new Error('Failed to create VAO');
    this.vao = unit;
    gl.bindVertexArray(unit);

    this.auraU = {} as Record<AuraUniformName, WebGLUniformLocation | null>;
    gl.useProgram(this.auraProgram);
    for (const name of AURA_UNIFORMS) {
      this.auraU[name] = gl.getUniformLocation(this.auraProgram, name);
    }

    this.postU = {} as Record<PostUniformName, WebGLUniformLocation | null>;
    gl.useProgram(this.postProgram);
    for (const name of POST_UNIFORMS) {
      this.postU[name] = gl.getUniformLocation(this.postProgram, name);
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
  }

  /* ------------------------------ compiling ------------------------------ */

  private compile(type: number, src: string, label: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`createShader failed for ${label}`);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || '(empty info log)';
      gl.deleteShader(shader);
      throw new Error(`Shader compile failed (${label}):\n${log}`);
    }
    return shader;
  }

  private link(frag: string, label: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, vertSrc, 'fullscreen.vert');
    const fs = this.compile(gl.FRAGMENT_SHADER, frag, label);
    const program = gl.createProgram();
    if (!program) throw new Error('createProgram failed');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || '(empty info log)';
      throw new Error(`Program link failed (${label}):\n${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  /* -------------------------------- sizing -------------------------------- */

  /**
   * Sizes the preview drawing buffer. Clamped to a maximum height so a Retina
   * display cannot quadruple the raymarch cost; CSS scales the smaller buffer
   * up and the loss is invisible in a preview panel.
   */
  resizeToDisplay(): boolean {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.height < 1 || rect.width < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const aspect = rect.width / rect.height;

    const h = Math.max(64, Math.min(Math.round(rect.height * dpr), PREVIEW_MAX_HEIGHT));
    const w = Math.max(64, Math.round(h * aspect));

    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  /* -------------------------------- uniforms -------------------------------- */

  setParams(p: AuraParams, nodes: AuraNode[]) {
    const gl = this.gl;
    const u = this.auraU;
    gl.useProgram(this.auraProgram);

    gl.uniform1f(u.uSeed, p.seed);
    gl.uniform1i(u.uPattern, PATTERN_INDEX[p.pattern] ?? 0);
    gl.uniform1i(u.uMixPattern, PATTERN_INDEX[p.mixPattern] ?? 0);
    gl.uniform1f(u.uMix, p.mix);

    gl.uniform1f(u.uTurbulenceScale, p.turbulenceScale);
    gl.uniform1f(u.uCurlIntensity, p.curlIntensity);
    gl.uniform1f(u.uZigzag, p.zigzag);
    gl.uniform1f(u.uCompression, p.compression);
    gl.uniform1f(u.uEvolutionSpeed, p.evolutionSpeed);
    gl.uniform1f(u.uWarpIterations, p.warpIterations);
    gl.uniform1f(u.uShear, p.shear);
    gl.uniform1f(u.uVorticity, p.vorticity);
    gl.uniform1f(u.uDirection, p.direction);
    gl.uniform1f(u.uMirror, p.mirror);

    gl.uniform1f(u.uThreadCount, p.threadCount);
    gl.uniform1f(u.uThreadSpread, p.threadSpread);
    gl.uniform1f(u.uSharpness, p.sharpness);
    gl.uniform1f(u.uBandFreq, p.bandFreq);
    gl.uniform1f(u.uTwist, p.twist);
    gl.uniform1f(u.uSparsity, p.sparsity);

    gl.uniform1f(u.uSmokeDensity, p.smokeDensity);
    gl.uniform1f(u.uFilamentSharp, p.filamentSharp);
    gl.uniform1f(u.uGlow, p.glow);
    gl.uniform1f(u.uSteps, p.steps);
    gl.uniform1f(u.uScatter, p.scatter);
    gl.uniform1f(u.uSparkSize, p.sparkSize);
    gl.uniform1f(u.uTrail, p.trail);

    // palette — pad to MAX_PALETTE_STOPS so paletteAt never reads garbage
    const stops = Math.max(2, Math.min(p.palette.length, MAX_PALETTE_STOPS));
    for (let i = 0; i < MAX_PALETTE_STOPS; i++) {
      const hex = p.palette[Math.min(i, p.palette.length - 1)] ?? '#000000';
      const [r, g, b] = hexToRgb(hex);
      this.paletteBuf[i * 3 + 0] = r;
      this.paletteBuf[i * 3 + 1] = g;
      this.paletteBuf[i * 3 + 2] = b;
    }
    gl.uniform3fv(u.uPalette, this.paletteBuf);
    gl.uniform1i(u.uPaletteStops, stops);
    gl.uniform1i(u.uPaletteMode, PALETTE_MODE_INDEX[p.paletteMode] ?? 0);
    gl.uniform1f(u.uHueShift, p.hueShift);
    gl.uniform1f(u.uColorCycle, p.colorCycle);
    gl.uniform1f(u.uSaturation, p.saturation);
    gl.uniform1f(u.uExposure, p.exposure);
    gl.uniform1f(u.uBgDark, p.bgDark);

    // nodes — positions are authored in raw uv space but the shader applies
    // the compression before it reads them, so the same transform is applied
    // here or the gizmo drifts away from the effect it controls.
    const cx = 1 + p.compression * 0.75;
    const cy = 1 - p.compression * 0.35;
    const count = Math.min(nodes.length, MAX_NODES);
    this.nodeA.fill(0);
    this.nodeB.fill(0);
    this.nodeColor.fill(0);

    let active = 0;
    for (const n of nodes) {
      if (active >= MAX_NODES) break;
      const i = active++;
      this.nodeA[i * 4 + 0] = n.x * cx;
      this.nodeA[i * 4 + 1] = n.y * cy;
      this.nodeA[i * 4 + 2] = n.strength;
      this.nodeA[i * 4 + 3] = n.radius;

      this.nodeB[i * 4 + 0] = NODE_KIND_INDEX[n.kind] ?? 0;
      this.nodeB[i * 4 + 1] = n.falloff;
      this.nodeB[i * 4 + 2] = n.colorMix;
      this.nodeB[i * 4 + 3] = n.enabled ? 1 : 0;

      const [r, g, b] = hexToRgb(n.color);
      this.nodeColor[i * 3 + 0] = r;
      this.nodeColor[i * 3 + 1] = g;
      this.nodeColor[i * 3 + 2] = b;
    }

    gl.uniform4fv(u.uNodeA, this.nodeA);
    gl.uniform4fv(u.uNodeB, this.nodeB);
    gl.uniform3fv(u.uNodeColor, this.nodeColor);
    gl.uniform1i(u.uNodeCount, count);
  }

  /* -------------------------------- targets -------------------------------- */

  private createTarget(width: number, height: number, hdr: boolean): Target {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new Error('Failed to allocate render target');

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      hdr ? gl.RGBA16F : gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      // HDR targets can be refused even when the extension is advertised
      if (hdr) return this.createTarget(width, height, false);
      throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
    }
    return { fbo, tex, width, height };
  }

  private destroyTarget(t: Target | null) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  private requireScene(width: number, height: number): Target {
    if (!this.scene || this.scene.width !== width || this.scene.height !== height) {
      this.destroyTarget(this.scene);
      this.scene = this.createTarget(width, height, this.hdr);
    }
    return this.scene;
  }

  private requireOut(width: number, height: number): Target {
    if (!this.out || this.out.width !== width || this.out.height !== height) {
      this.destroyTarget(this.out);
      this.out = this.createTarget(width, height, false);
      this.readback = new Uint8Array(width * height * 4);
    }
    return this.out;
  }

  /* -------------------------------- drawing -------------------------------- */

  private drawAura(target: Target | null, width: number, height: number, time: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.auraProgram);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.auraU.uResolution, width, height);
    gl.uniform1f(this.auraU.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawPost(target: Target | null, width: number, height: number, p: AuraParams, time: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.postProgram);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene!.tex);
    gl.uniform1i(this.postU.uScene, 0);

    gl.uniform2f(this.postU.uResolution, width, height);
    gl.uniform1f(this.postU.uTime, time);
    gl.uniform1f(this.postU.uBloom, p.bloom);
    gl.uniform1f(this.postU.uChroma, p.chroma);
    gl.uniform1f(this.postU.uVignette, p.vignette);
    gl.uniform1f(this.postU.uPosterize, p.posterize);
    gl.uniform1f(this.postU.uScanlines, p.scanlines);
    gl.uniform1f(this.postU.uGrain, p.grain);
    gl.uniform1f(this.postU.uGrainSize, p.grainSize);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Renders one frame to the on-screen canvas. Returns the frame cost in ms. */
  render(time: number, p: AuraParams): number {
    if (this.disposed) return 0;
    this.resizeToDisplay();
    const w = this.canvas.width;
    const h = this.canvas.height;

    const t0 = performance.now();
    this.requireScene(w, h);
    this.drawAura(this.scene, w, h, time);
    this.drawPost(null, w, h, p, time);
    const frameMs = performance.now() - t0;
    this.emaFrameMs = this.emaFrameMs * 0.9 + frameMs * 0.1;
    return this.emaFrameMs;
  }

  /**
   * Offscreen deterministic render at an exact resolution. Returns raw RGBA
   * bytes in image order (top-down), ready for PNG or ffmpeg.
   *
   * The scene target, output target and readback buffer are cached across
   * calls — a video render calls this hundreds of times at the same size, and
   * reallocating them per frame dominated the frame cost.
   */
  renderToPixels(width: number, height: number, time: number, p: AuraParams): Uint8Array {
    const gl = this.gl;
    this.requireScene(width, height);
    this.requireOut(width, height);

    this.drawAura(this.scene, width, height, time);
    this.drawPost(this.out, width, height, p, time);

    const raw = this.readback!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.out!.fbo);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // GL hands back rows bottom-up; flip in place into image order.
    const stride = width * 4;
    const half = (height >> 1) * stride;
    const tmp = new Uint8Array(stride);
    for (let a = 0, b = (height - 1) * stride; a < half; a += stride, b -= stride) {
      tmp.set(raw.subarray(a, a + stride));
      raw.copyWithin(a, b, b + stride);
      raw.set(tmp, b);
    }
    return raw;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    this.destroyTarget(this.scene);
    this.destroyTarget(this.out);
    this.scene = null;
    this.out = null;
    this.readback = null;
    gl.deleteProgram(this.auraProgram);
    gl.deleteProgram(this.postProgram);
    gl.deleteVertexArray(this.vao);
    // NOTE: deliberately no WEBGL_lose_context here. The canvas keeps its
    // context for the lifetime of the element, and forcing a loss makes a
    // remount (React StrictMode double-invokes effects in dev) grab a dead
    // context whose compileShader fails with an empty info log.
  }
}

export { MAX_NODES };
